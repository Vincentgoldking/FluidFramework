/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage, ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    createSummarizer,
    summarizeNow,
    waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs";
import {
    getGCStateFromSummary,
} from "./gcTestSummaryUtils";

/**
 * Validates that that reference state of nodes is correct irrespective of whether a summarizer loads from the
 * latest summary or an older summary.
 */
describeNoCompat("GC loading from older summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;
    let containerRuntime: IContainerRuntime;
    let dataStoreA: ITestDataObject;

    /**
     * Submits a summary and returns the reference state for all the nodes in the container.
     * If a node is referenced, its value is true. If it's unreferenced, its value is false.
     * @returns a map of nodePath to its unreferenced timestamp.
     */
    async function getReferenceState(summaryTree: ISummaryTree) {
        const gcState = getGCStateFromSummary(summaryTree);
        assert(gcState !== undefined, "GC tree is not available in the summary");

        const nodeIsReferencedMap: Map<string, boolean> = new Map();
        for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
            nodeIsReferencedMap.set(nodePath.slice(1), nodeData.unreferencedTimestampMs === undefined ? true : false);
        }
        return nodeIsReferencedMap;
    }

    /*
     * Utility function that returns the sequence number of a summary from the summary metadata.
     */
    function getSummarySequenceNumber(summaryTree: ISummaryTree) {
        const metadataBlob = summaryTree.tree[".metadata"];
        assert(metadataBlob.type === SummaryType.Blob, "Container runtime metadata is not a blob");
        const metadata = JSON.parse(metadataBlob.content as string) as Record<string, unknown>;
        return (metadata.message as ISequencedDocumentMessage).sequenceNumber;
    };

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await provider.makeTestContainer(defaultGCConfig);
        dataStoreA = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        containerRuntime = dataStoreA._context.containerRuntime as IContainerRuntime;
        await waitForContainerConnection(mainContainer);
    });

    it("updates referenced nodes correctly when loading from an older summary", async () => {
        const summarizer1 = await createSummarizer(provider, mainContainer);

        // Create a data store and mark it unreferenced to begin with.
        const dataStoreBHandle =
            (await containerRuntime.createDataStore(TestDataObjectType)).entryPoint as IFluidHandle<ITestDataObject>;
        assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
        const dataStoreB = await dataStoreBHandle.get();
        dataStoreA._root.set("dataStoreB", dataStoreBHandle);
        dataStoreA._root.delete("dataStoreB");

        await provider.ensureSynchronized();

        // Summarize - summary1. dataStoreB should be unreferenced.
        const summaryResult1 = await summarizeNow(summarizer1);
        const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
        const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
        assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
        const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
        assert(dsBReferenceState1 === false, `dataStoreB should be unreferenced`);

        // Reference dataStoreB now.
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);

        // Summarize - summary2. dataStoreB should now be referenced.
        await provider.ensureSynchronized();
        const summaryResult2 = await summarizeNow(summarizer1);
        const referenceState2 = await getReferenceState(summaryResult2.summaryTree);
        const dsAReferenceState2 = referenceState2.get(dataStoreA._context.id);
        assert(dsAReferenceState2 === true, `dataStoreA should still be referenced`);
        const dsBReferenceState2 = referenceState2.get(dataStoreB._context.id);
        assert(dsBReferenceState2 === true, `dataStoreB should be referenced now`);

        // Load a new summarizer from the summary1 and summarize - summary3. Before it summarizes, it will catch up
        // to latest and so the reference state of the data stores should be the same as in summary2.
        // Also, note that while catching up, it will download summary2 and update state from it.
        summarizer1.close();
        const summarizer2 = await createSummarizer(provider, mainContainer, summaryResult1.summaryVersion);

        // Create a new alias data store so that the GC data changes without changing the GC state of existing data
        // stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
        const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
        const aliasResult = await ds2.trySetAlias("root2");
        assert.strictEqual(aliasResult, "Success", "Failed to alias data store");

        await provider.ensureSynchronized();
        const summaryResult3 = await summarizeNow(summarizer2);

        // Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
        const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
        const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
        assert(summary3SequenceNumber >= summary2SequenceNumber, "Summary 3 should be same or newer than summary 2");

        // Validate that dataStoreB is still referenced in this summary.
        const referenceState3 = await getReferenceState(summaryResult3.summaryTree);
        const dsAReferenceState3 = referenceState3.get(dataStoreA._context.id);
        assert(dsAReferenceState3 === true, `dataStoreA should still be referenced`);
        const dsBReferenceState3 = referenceState3.get(dataStoreB._context.id);
        assert(dsBReferenceState3 === true, `dataStoreB should still be referenced on loading from old summary`);
    });

    it("updates unreferenced nodes correctly when loading from an older summary", async () => {
        const summarizer1 = await createSummarizer(provider, mainContainer);

        // Create a data store and mark it referenced to begin with.
        const dataStoreBHandle =
            (await containerRuntime.createDataStore(TestDataObjectType)).entryPoint as IFluidHandle<ITestDataObject>;
        assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
        const dataStoreB = await dataStoreBHandle.get();
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);

        await provider.ensureSynchronized();

        // Summarize - summary1. dataStoreB should be referenced.
        const summaryResult1 = await summarizeNow(summarizer1);
        const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
        const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
        assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
        const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
        assert(dsBReferenceState1 === true, `dataStoreB should be referenced`);

        // Unreference dataStoreB now.
        dataStoreA._root.delete("dataStoreB");

        // Summarize - summary2. dataStoreB should now be unreferenced.
        await provider.ensureSynchronized();
        const summaryResult2 = await summarizeNow(summarizer1);
        const referenceState2 = await getReferenceState(summaryResult2.summaryTree);
        const dsAReferenceState2 = referenceState2.get(dataStoreA._context.id);
        assert(dsAReferenceState2 === true, `dataStoreA should still be referenced`);
        const dsBReferenceState2 = referenceState2.get(dataStoreB._context.id);
        assert(dsBReferenceState2 === false, `dataStoreB should be unreferenced now`);

        // Load a new summarizer from the summary1 and summarize - summary3. Before it summarizes, it will catch up
        // to latest and so the reference state of the data stores should be the same as in summary2.
        // Also, note that while catching up, it will download summary2 and update state from it.
        summarizer1.close();
        const summarizer2 = await createSummarizer(provider, mainContainer, summaryResult1.summaryVersion);

        // Create a new alias data store so that the GC data changes without changing the GC state of existing data
        // stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
        const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
        const aliasResult = await ds2.trySetAlias("root2");
        assert.strictEqual(aliasResult, "Success", "Failed to alias data store");

        await provider.ensureSynchronized();
        const summaryResult3 = await summarizeNow(summarizer2);

        // Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
        const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
        const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
        assert(summary3SequenceNumber >= summary2SequenceNumber, "Summary 3 should be same or newer than summary 2");

        // Validate that dataStoreB is still unreferenced in this summary.
        const referenceState3 = await getReferenceState(summaryResult3.summaryTree);
        const dsAReferenceState3 = referenceState3.get(dataStoreA._context.id);
        assert(dsAReferenceState3 === true, `dataStoreA should still be referenced`);
        const dsBReferenceState3 = referenceState3.get(dataStoreB._context.id);
        assert(
            dsBReferenceState3 === false, `dataStoreB should still be unreferenced on loading from old summary`);
    });
});
