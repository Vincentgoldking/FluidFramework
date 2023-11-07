/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
<<<<<<< HEAD
import {
	mixinAttributor,
	createRuntimeAttributor,
	IProvideRuntimeAttributor,
} from "@fluid-experimental/attributor";
import { FluidObject } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import { makeModelRequestHandler } from "@fluid-example/example-utils";
=======
import { mixinAttributor, createRuntimeAttributor } from "@fluid-experimental/attributor";
import { IModelContainerRuntimeEntryPoint } from "@fluid-example/example-utils";
>>>>>>> 0bf5c00ade67744f59337227c17c5aa11c19c2df

const containerRuntimeWithAttribution = mixinAttributor(ContainerRuntime);

/**
 * ModelContainerRuntimeFactoryWithAttribution is an abstract class that gives a basic structure for container runtime initialization with attributor enabled.
 * It also requires a createModel method to returns the expected model type.
 */
export abstract class ModelContainerRuntimeFactoryWithAttribution<ModelType>
	implements IRuntimeFactory
{
	public get IRuntimeFactory() {
		return this;
	}

	/**
	 * @param registryEntries - The data store registry for containers produced
	 * @param runtimeOptions - The runtime options passed to the ContainerRuntime when instantiating it
	 */
	constructor(
		private readonly registryEntries: NamedFluidDataStoreRegistryEntries,
		private readonly runtimeOptions?: IContainerRuntimeOptions,
	) {}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const runtime = await containerRuntimeWithAttribution.loadRuntime({
			context,
<<<<<<< HEAD
			this.registryEntries,
			// eslint-disable-next-line import/no-deprecated
			makeModelRequestHandler(this.createModel.bind(this)),
			this.runtimeOptions,
			scope, // scope
=======
			registryEntries: this.registryEntries,
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IModelContainerRuntimeEntryPoint<ModelType>> => ({
				getModel: async (container: IContainer) =>
					this.createModel(containerRuntime, container),
			}),
			runtimeOptions: this.runtimeOptions,
			containerScope: { IRuntimeAttributor: createRuntimeAttributor() },
>>>>>>> 0bf5c00ade67744f59337227c17c5aa11c19c2df
			existing,
		});

		if (!existing) {
			await this.containerInitializingFirstTime(runtime);
		}
		await this.containerHasInitialized(runtime);

		return runtime;
	}

	/**
	 * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
	 * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {}

	/**
	 * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
	 * This likely includes loading any data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {}

	/**
	 * Subclasses must implement createModel, which should build a ModelType given the runtime and container.
	 * @param runtime - The container runtime for the container being initialized
	 * @param container - The container being initialized
	 */
	protected abstract createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<ModelType>;
}
