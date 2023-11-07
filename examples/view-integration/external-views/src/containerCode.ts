/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory, getDataStoreEntryPoint } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
<<<<<<< HEAD
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";
=======
>>>>>>> 0bf5c00ade67744f59337227c17c5aa11c19c2df

import { DiceRollerInstantiationFactory, IDiceRoller } from "./dataObject";

/**
 * The data model for our application.
 *
 * @remarks Since this is a simple example it's just a single data object.  More advanced scenarios may have more
 * complex models.
 */
export interface IDiceRollerAppModel {
	readonly diceRoller: IDiceRoller;
}

class DiceRollerAppModel implements IDiceRollerAppModel {
	public constructor(public readonly diceRoller: IDiceRoller) {}
}

const diceRollerId = "dice-roller";

/**
 * The runtime factory for our Fluid container.
 */
export class DiceRollerContainerRuntimeFactory extends ModelContainerRuntimeFactory<IDiceRollerAppModel> {
	constructor() {
		super(
			new Map([DiceRollerInstantiationFactory.registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const diceRoller = await runtime.createDataStore(DiceRollerInstantiationFactory.type);
		await diceRoller.trySetAlias(diceRollerId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
<<<<<<< HEAD
		// eslint-disable-next-line import/no-deprecated
		const diceRoller = await requestFluidObject<IDiceRoller>(
			await runtime.getRootDataStore(diceRollerId),
			"",
=======
		return new DiceRollerAppModel(
			await getDataStoreEntryPoint<IDiceRoller>(runtime, diceRollerId),
>>>>>>> 0bf5c00ade67744f59337227c17c5aa11c19c2df
		);
	}
}
