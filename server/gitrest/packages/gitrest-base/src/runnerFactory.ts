/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { Provider } from "nconf";
import * as services from "@fluidframework/server-services-shared";
import * as core from "@fluidframework/server-services-core";
import { normalizePort } from "@fluidframework/server-services-utils";
import { ExternalStorageManager } from "./externalStorageManager";
import { GitrestRunner } from "./runner";
import {
	IFileSystemManagerFactory,
	IRepositoryManagerFactory,
	IsomorphicGitManagerFactory,
	NodegitRepositoryManagerFactory,
	NodeFsManagerFactory,
	IStorageDirectoryConfig,
} from "./utils";
// eslint-disable-next-line import/no-internal-modules
import { RedisFsManagerFactory } from "./utils/filesystems";

export class GitrestResources implements core.IResources {
	public webServerFactory: core.IWebServerFactory;

	constructor(
		public readonly config: Provider,
		public readonly port: string | number,
		public readonly durableFileSystemManagerFactory: IFileSystemManagerFactory,
		public readonly ephemeralFileSystemManagerFactory: IFileSystemManagerFactory,
		public readonly repositoryManagerFactory: IRepositoryManagerFactory,
		public readonly asyncLocalStorage?: AsyncLocalStorage<string>,
		public readonly enableOptimizedInitialSummary?: boolean,
	) {
		this.webServerFactory = new services.BasicWebServerFactory();
	}

	public async dispose(): Promise<void> {
		return;
	}
}

export class GitrestResourcesFactory implements core.IResourcesFactory<GitrestResources> {
	public async create(config: Provider): Promise<GitrestResources> {
		const port = normalizePort(process.env.PORT || "3000");
		const durableFileSystemManagerFactory = new NodeFsManagerFactory();
		const ephemeralFileSystemManagerFactory = new RedisFsManagerFactory();
		const externalStorageManager = new ExternalStorageManager(config);
		const storageDirectoryConfig: IStorageDirectoryConfig = config.get(
			"storageDir",
		) as IStorageDirectoryConfig;
		const gitLibrary: string | undefined = config.get("git:lib:name");
		const repoPerDocEnabled: boolean = config.get("git:repoPerDocEnabled") ?? false;
		const enableRepositoryManagerMetrics: boolean =
			config.get("git:enableRepositoryManagerMetrics") ?? false;
		const apiMetricsSamplingPeriod: number | undefined = config.get(
			"git:apiMetricsSamplingPeriod",
		);
		const enableSlimGitInit: boolean = config.get("git:enableSlimGitInit") ?? false;
		const getRepositoryManagerFactory = () => {
			if (!gitLibrary || gitLibrary === "nodegit") {
				return new NodegitRepositoryManagerFactory(
					storageDirectoryConfig,
					durableFileSystemManagerFactory,
					ephemeralFileSystemManagerFactory,
					externalStorageManager,
					repoPerDocEnabled,
					enableRepositoryManagerMetrics,
					apiMetricsSamplingPeriod,
				);
			} else if (gitLibrary === "isomorphic-git") {
				console.log("prrajen: Using isomorphic-git library");
				return new IsomorphicGitManagerFactory(
					storageDirectoryConfig,
					durableFileSystemManagerFactory,
					ephemeralFileSystemManagerFactory,
					externalStorageManager,
					repoPerDocEnabled,
					enableRepositoryManagerMetrics,
					enableSlimGitInit,
					apiMetricsSamplingPeriod,
				);
			}
			throw new Error("Invalid git library name.");
		};
		const repositoryManagerFactory = getRepositoryManagerFactory();
		const asyncLocalStorage = config.get("asyncLocalStorageInstance")?.[0];

		return new GitrestResources(
			config,
			port,
			durableFileSystemManagerFactory,
			ephemeralFileSystemManagerFactory,
			repositoryManagerFactory,
			asyncLocalStorage,
		);
	}
}

export class GitrestRunnerFactory implements core.IRunnerFactory<GitrestResources> {
	public async create(resources: GitrestResources): Promise<core.IRunner> {
		return new GitrestRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.durableFileSystemManagerFactory,
			resources.ephemeralFileSystemManagerFactory,
			resources.repositoryManagerFactory,
			resources.asyncLocalStorage,
		);
	}
}
