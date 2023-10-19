/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ChildProcess } from "child_process";
import { delay } from "@fluidframework/core-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	IRunConfig,
	IRunner,
	IRunnerEvents,
	IRunnerStatus,
	IScenarioConfig,
	IScenarioRunConfig,
	RunnerStatus,
} from "./interface";
import { convertConfigToScriptParams, createChildProcess } from "./utils";

export abstract class ScenarioRunner<
		ScenarioConfig extends IScenarioConfig,
		ScenarioRunConfig extends IScenarioRunConfig,
		A,
		S = A,
	>
	extends TypedEventEmitter<IRunnerEvents>
	implements IRunner
{
	/**
	 * Array of results generated by child process runs.
	 *
	 * See `DocCreatorRunner` for example use.
	 */
	protected childResults: A[] = [];
	protected status: RunnerStatus = RunnerStatus.NotStarted;

	constructor(protected readonly scenarioConfig: ScenarioConfig) {
		super();
	}

	/**
	 * Build the ScenarioRunConfig for a specific run.
	 * Typically combines some parts of the ScenarioConfig with the provided RunConfig.
	 *
	 * **Important**: delete complex objects from ScenarioRunConfig when `!options.isSync`. These
	 * will not work when serialized/deserialized to separate child process params.
	 */
	protected abstract buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; isSync?: boolean } & Partial<Record<string, any>>,
	): ScenarioRunConfig;

	/**
	 * Run number of child runs equal to `ScenarioConfig.numClients` (default: 1) in child processes.
	 * Run each child a number of times equal to `ScenarioConfig.numRunsPerClient`.
	 * Incompatible with complex objects in configs.
	 */
	public async run(config: IRunConfig): Promise<A[]> {
		this.status = RunnerStatus.Running;
		const runnerArgs: string[][] = [];
		const numClients = this.scenarioConfig.numClients ?? 1;
		for (let i = 0; i < numClients; i++) {
			const childArgs: string[] = [
				`./dist/scenarioRunnerClient`,
				`${this.constructor.name}`,
				...convertConfigToScriptParams<ScenarioRunConfig>(
					this.runCore(config, { clientIndex: i }),
				),
				"--verbose",
			];
			runnerArgs.push(childArgs);
		}

		const children: Promise<boolean>[] = [];
		const numRunsPerClient = this.scenarioConfig.numRunsPerClient ?? 1;
		for (let j = 0; j < numRunsPerClient; j++) {
			for (const runnerArg of runnerArgs) {
				try {
					children.push(this.spawnChildProcess(runnerArg));
				} catch {
					throw new Error("Failed to spawn child");
				}
				if (this.scenarioConfig.clientStartDelayMs) {
					await delay(this.scenarioConfig.clientStartDelayMs);
				}
			}
		}

		try {
			await Promise.all(children);
		} catch {
			throw new Error("Not all clients closed successfully");
		}

		return this.childResults;
	}

	/**
	 * Build a ScenarioRunConfig for a child run in a separate process.
	 * This config will be serialized into child process arguments.
	 */
	protected abstract runCore(
		config: IRunConfig,
		info: { clientIndex: number },
	): ScenarioRunConfig;

	/**
	 * Run number of child runs equal to `ScenarioConfig.numClients` (default: 1) in a single process.
	 * Run each child a number of times equal to `ScenarioConfig.numRunsPerClient`.
	 * Compatible with complex objects in configs.
	 */
	public async runSync(config: IRunConfig): Promise<S[]> {
		this.status = RunnerStatus.Running;
		const runs: Promise<S>[] = [];
		const numClients = this.scenarioConfig.numClients ?? 1;
		const numRunsPerClient = this.scenarioConfig.numRunsPerClient ?? 1;
		for (let j = 0; j < numRunsPerClient; j++) {
			for (let i = 0; i < numClients; i++) {
				runs.push(this.runSyncCore(config, { clientIndex: i }));
				if (this.scenarioConfig.clientStartDelayMs) {
					await delay(this.scenarioConfig.clientStartDelayMs);
				}
			}
		}
		try {
			const results = await Promise.all(runs);
			this.status = RunnerStatus.Success;
			return results;
		} catch (error) {
			this.status = RunnerStatus.Error;
			throw new Error(`Not all clients closed successfully.\n${error}`);
		}
	}

	/**
	 * Create a child run in the same process.
	 */
	protected abstract runSyncCore(config: IRunConfig, info: { clientIndex: number }): Promise<S>;

	public stop(): void {}

	public getStatus(): IRunnerStatus {
		return {
			status: this.status,
			description: this.description(),
			details: {},
		};
	}

	/**
	 * Provide a brief description of the scenario.
	 */
	protected abstract description(): string;

	protected async spawnChildProcess(childArgs: string[]): Promise<boolean> {
		return createChildProcess(childArgs, (runnerProcess) =>
			this.additionalChildProcessSetup(runnerProcess),
		);
	}

	/**
	 * Perform additional setup, like adding ChildProcess listeners, when spawning
	 * a child process for a child run.
	 *
	 * See `DocCreatorRunner` for example use.
	 */
	protected additionalChildProcessSetup(runnerProcess: ChildProcess): void {}
}
