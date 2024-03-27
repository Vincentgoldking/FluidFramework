/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import {
	IFluidHandle,
	IFluidHandleContext,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
// This test doesn't care to test compat of the Fluid handle implementation, it's just used for convenience
// to simulate an unknown object.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { FluidObjectHandle } from "@fluidframework/datastore";
import {
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * An IFluidHandle implementation that has a random path / url. This is used to test that adding this handle to
 * a DDS doesn't yield unexpected results for GC.
 */
export class TestFluidHandle implements IFluidHandle {
	public absolutePath: string = "/randomPath";
	public isAttached: boolean = false;

	public get IFluidHandle(): IFluidHandle {
		return this;
	}

	public async get(): Promise<any> {
		throw new Error("Method not implemented.");
	}

	public bind(handle: IFluidHandle): void {
		throw new Error("Method not implemented.");
	}

	public attachGraph(): void {
		this.isAttached = true;
	}

	public async resolveHandle(request: IRequest): Promise<IResponse> {
		throw new Error("Method not implemented.");
	}
}

/**
 * Represents an custom object within a data store that has a handle associated with it. The handle's path is a sub-path
 * in the data store.
 */
class TestSubDataStoreObject {
	private readonly _handle: IFluidHandle;
	public get handle() {
		return this._handle;
	}

	constructor(path: string, handleContext: IFluidHandleContext) {
		this._handle = new FluidObjectHandle(this, path, handleContext);
	}
}

/**
 * Validates that handles to nodes that GC doesn't know about doesn't result in unexpected results. For instance, it
 * should not result in any asserts / errors. There shouldn't be nodes corresponding to these handle paths in the
 * GC data that is generated.
 */
describeCompat("GC unknown handles", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let dataStoreA: ITestDataObject;
	let summarizerRuntime: ContainerRuntime;

	/**
	 * Submits a summary and returns the paths of all GC nodes in the GC data in summary.
	 */
	async function getGCNodesFromSummary() {
		await provider.ensureSynchronized();
		const { summary } = await summarizerRuntime.summarize({ runGC: true, trackState: false });
		const gcState = getGCStateFromSummary(summary);
		assert(gcState !== undefined, "GC tree is not available in the summary");
		return new Set(Object.keys(gcState));
	}

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		// These tests validate the GC state in summary generated by the container runtime. They do not care
		// about the snapshot that is downloaded from the server. So, it doesn't need to run against real services.
		if (provider.driver.type !== "local") {
			this.skip();
		}

		mainContainer = await provider.makeTestContainer(defaultGCConfig);
		dataStoreA = await getContainerEntryPointBackCompat<ITestDataObject>(mainContainer);
		await waitForContainerConnection(mainContainer);

		const summarizerContainer = await provider.loadTestContainer(defaultGCConfig);
		const summarizerDataStoreA =
			await getContainerEntryPointBackCompat<ITestDataObject>(summarizerContainer);
		summarizerRuntime = summarizerDataStoreA._context.containerRuntime as ContainerRuntime;
		await waitForContainerConnection(summarizerContainer);
	});

	describe("unknown handle in GC data", () => {
		it("does not include unknown sub data store handles in GC data", async () => {
			const subDSObject1 = new TestSubDataStoreObject(
				"subPath1",
				dataStoreA._runtime.objectsRoutingContext,
			);
			dataStoreA._root.set("subObject1", subDSObject1.handle);

			const subDSObject2 = new TestSubDataStoreObject(
				"subPath2",
				dataStoreA._runtime.objectsRoutingContext,
			);
			dataStoreA._root.set("subObject2", subDSObject2.handle);

			const gcNodePaths = await getGCNodesFromSummary();
			assert(
				gcNodePaths[subDSObject1.handle.absolutePath] === undefined,
				"sub data store object1 should not be part of GC data",
			);
			assert(
				gcNodePaths[subDSObject2.handle.absolutePath] === undefined,
				"sub data store object2 should not be part of GC data",
			);
		});

		it("does not include random handles in GC data", async () => {
			const randomHandle = new TestFluidHandle();
			dataStoreA._root.set("randomHandle", randomHandle);

			const gcNodePaths = await getGCNodesFromSummary();
			assert(
				gcNodePaths[randomHandle.absolutePath] === undefined,
				"Nodes for random handles should not be part of GC data",
			);
		});
	});
});
