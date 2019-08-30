/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FileDeltaStorageService,
} from "@prague/file-socket-storage";
import {
    IBlob,
    ISequencedDocumentMessage,
    ITree,
    ITreeEntry,
    MessageType,
} from "@prague/protocol-definitions";
import {
    IAttachMessage,
} from "@prague/runtime-definitions";
import * as fs from "fs";

import { createGroupOp, IJSONSegment, IMergeTreeOp, ISegment, MergeTreeDeltaType, } from "@prague/merge-tree";
import {
    TestClient
    // tslint:disable-next-line: no-submodule-imports
} from "@prague/merge-tree/dist/test/testClient";
import {
    SharedNumberSequenceFactory,
    SharedObjectSequenceFactory,
    SharedStringFactory,
    SparseMatrixFactory,
} from "@prague/sequence";
import * as assert from "assert";
import { ReplayArgs } from "./replayArgs";

interface IFullPathTreeEntry extends ITreeEntry {
    fullPath?: string;
}

/**
 * All the logic of replay tool
 */
export class ClientReplayTool {
    private errorCount = 0;
    private deltaStorageService: FileDeltaStorageService;
    public constructor(private readonly args: ReplayArgs) {}

    public async Go(): Promise<boolean> {
        this.args.checkArgs();

        // Make unhandled exceptions errors, not just warnings
        // Also report few of them!
        const listener = (up) => {
            this.reportError("UnhandledRejectionPromise", up);
        };
        process.on("unhandledRejection", listener);

        await this.setup();

        await this.mainCycle();

        process.removeListener("unhandledRejection", listener);

        return this.errorCount === 0;
    }

    private shouldReportError() {
        // Report only first 5 errors
        this.errorCount++;
        const errorsToReport = 5;
        if (this.errorCount <= errorsToReport) {
            return true;
        }
        if (this.errorCount === errorsToReport + 1) {
            console.error("\n!!! Too many errors - stopped reporting errors !!!");
        }
        return false;
    }

    private reportError(description: string, error?: any) {
        if (this.shouldReportError()) {
            if (error === undefined) {
                console.error(description);
            } else if (error instanceof Error) {
                console.error(`${description}\n${error.stack}`);
            } else {
                console.error(`${description} ${error}`);
            }
        }
    }

    private async setup() {
        if (this.args.inDirName === undefined) {
            return Promise.reject("Please provide --indir argument");
        }
        // tslint:disable-next-line: non-literal-fs-path
        if (!fs.existsSync(this.args.inDirName)) {
            return Promise.reject("File does not exist");
        }

        this.deltaStorageService = new FileDeltaStorageService(this.args.inDirName);
    }

    // tslint:disable-next-line: max-func-body-length
    private async mainCycle() {
        const clients = new Map<string, Map<string, TestClient>>();
        const mergeTreeAttachTrees = new Map<string, {tree: ITree, specToSeg(segment: IJSONSegment): ISegment}>();
        const mergeTreeMessages = new Array<ISequencedDocumentMessage & { address?: string }>();
        for (const message of this.deltaStorageService.getFromWebSocket(0, this.args.to)) {
            const messagePathParts: string[] = [];
            switch (message.type as MessageType) {
                case MessageType.Operation:
                    let contents = message.contents as { address: string, contents: any, content: any, type: string };
                    do {
                        messagePathParts.push(contents.address);
                        contents = contents.contents as { address: string, contents: any, content: any, type: string };
                    } while (contents.contents);

                    if (contents.type && contents.type === "attach") {
                        const legacyAttachMessage = contents.content as IAttachMessage;
                        legacyAttachMessage.id = [...messagePathParts, legacyAttachMessage.id].join("/");
                        this.processAttachMessage(legacyAttachMessage, mergeTreeAttachTrees);
                    } else {
                        const content = contents.content as { address: string, contents: any };
                        const messagePath = [...messagePathParts, content.address].join("/");
                        if (content && mergeTreeAttachTrees.has(messagePath)) {
                            if (!clients.has(message.clientId)) {
                                clients.set(message.clientId, new Map<string, TestClient>());
                            }
                            const op = content.contents as IMergeTreeOp;
                            if (this.args.verbose) {
                                console.log(`MergeTree op ${messagePath}:\n ${JSON.stringify(op)}`);
                            }
                            const newMessage: ISequencedDocumentMessage & { address?: string } = message;
                            newMessage.address = messagePath;
                            newMessage.contents = op;
                            mergeTreeMessages.push(newMessage);
                            break;
                        }
                    }
                    break;

                case MessageType.Attach:
                    this.processAttachMessage(
                        message.contents as IAttachMessage,
                        mergeTreeAttachTrees);
                    break;
                default:
            }
        }
        if (mergeTreeAttachTrees.size > 0) {
            clients.set("readonly", new Map<string, TestClient>());
            for (const clientId of clients.keys()) {
                const client = clients.get(clientId);
                for (const mergeTreeId of mergeTreeAttachTrees.keys()) {
                    const creationInfo = mergeTreeAttachTrees.get(mergeTreeId);
                    client.set(
                        mergeTreeId,
                        await TestClient.createFromSnapshot(creationInfo.tree, clientId, creationInfo.specToSeg));
                }
                const pendingMessages = new Array<ISequencedDocumentMessage & { address?: string }>();
                for (const message of mergeTreeMessages) {
                    if (message.clientId !== clientId) {
                        pendingMessages.push(message);
                    } else {
                        // we found an op from this client
                        // that means we know this clients reference sequence number
                        // when the op was created, so apply all ops up to this ops
                        // reference sequence number before we apply this op
                        while (pendingMessages.length > 0
                            && pendingMessages[0].sequenceNumber <= message.referenceSequenceNumber) {
                            const pendingMessage = pendingMessages.shift();
                            client.get(pendingMessage.address).applyMsg(pendingMessage);
                        }
                        const op = message.contents as IMergeTreeOp;
                        // wrap in a group op, as that's the only way to
                        // apply an op locally
                        client.get(message.address).localTransaction(
                            op.type === MergeTreeDeltaType.GROUP ? op : createGroupOp(op));
                        pendingMessages.push(message);
                    }
                }
                // no more ops from this client, so apply whatever is left
                for (const message of pendingMessages) {
                    client.get(message.address).applyMsg(message);
                }
            }
            const readonlyClient = clients.get("readonly");
            for (const client of clients) {
                for (const mergeTree of client[1]) {
                    assert.equal(
                        mergeTree[1].getText(),
                        readonlyClient.get(mergeTree[0]).getText());
                }
            }
        }
    }

    private processAttachMessage(
        attachMessage: IAttachMessage,
        mergeTreeAttachTrees: Map<string, { tree: ITree, specToSeg(segment: IJSONSegment): ISegment }>) {
        const ddsTrees = this.getDssTreesFromAttach(attachMessage);
        const mergeTreeTypes = [
            {
                type: SharedStringFactory.Type,
                specToSeg: SharedStringFactory.segmentFromSpec,
            },
            {
                type: SparseMatrixFactory.Type,
                specToSeg: SparseMatrixFactory.segmentFromSpec,
            },
            {
                type: SharedObjectSequenceFactory.Type,
                specToSeg: SharedObjectSequenceFactory.segmentFromSpec,
            },
            {
                type: SharedNumberSequenceFactory.Type,
                specToSeg: SharedNumberSequenceFactory.segmentFromSpec,
            },
        ];
        for (const mergeTreeType of mergeTreeTypes) {
            if (ddsTrees.has(mergeTreeType.type)) {
                const trees = ddsTrees.get(mergeTreeType.type);
                for (const ssTree of trees) {
                    const tree = (ssTree.value as ITree);
                    let contentTree: ITreeEntry;
                    while (tree.entries.length > 0) {
                        contentTree = tree.entries.shift();
                        if (contentTree.path === "content") {
                            break;
                        }
                    }
                    console.log(`MergeTree Found:\n ${JSON.stringify({path: ssTree.fullPath, type: mergeTreeType.type })}`);
                    mergeTreeAttachTrees.set(
                        ssTree.fullPath,
                        {
                            tree: contentTree.value as ITree,
                            specToSeg: mergeTreeType.specToSeg,
                        });
                }
            }
        }
    }

    private getDssTreesFromAttach(attachMessage: IAttachMessage) {
        const ddsTrees = new Map<string, IFullPathTreeEntry[]>();
        if (attachMessage.snapshot) {
            const snapshotTreeEntry: IFullPathTreeEntry = {
                value: attachMessage.snapshot,
                type: attachMessage.type,
                fullPath: attachMessage.id,
                path: undefined,
                mode: undefined,
            };
            ddsTrees.set(attachMessage.type, [snapshotTreeEntry]);
            const trees: IFullPathTreeEntry[] = [snapshotTreeEntry];
            while (trees.length > 0) {
                const tree = trees.shift();
                const treeEntries = (tree.value as ITree).entries;
                if (treeEntries) {
                    for (const entry of treeEntries) {
                        switch (entry.type) {
                            case "Tree":
                                const fullPathEntry: IFullPathTreeEntry = entry;
                                fullPathEntry.fullPath = `${tree.fullPath}/${entry.path}`;
                                trees.push(fullPathEntry);
                                break;
                            case "Blob":
                                if (entry.path === ".attributes") {
                                    const blob = entry.value as IBlob;
                                    const contents = JSON.parse(blob.contents) as { type: string };
                                    if (contents && contents.type) {
                                        if (!ddsTrees.has(contents.type)) {
                                            ddsTrees.set(contents.type, [tree]);
                                        } else {
                                            ddsTrees.get(contents.type).push(tree);
                                        }
                                    }
                                }
                            default:
                        }
                    }
                }
            }
        }
        return ddsTrees;
    }
}
