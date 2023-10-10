/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import path from "node:path";
import { format as prettier } from "prettier";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";
import { DEFAULT_CHANGESET_PATH, loadChangesets } from "../../lib";

const DEFAULT_FILE = "UPCOMING.md";

/**
 * Generates a summary of all changesets and outputs the results to a file. This is used to generate an UPCOMING.md file
 * that provides a single place where developers can see upcoming changes.
 */
export default class GenerateUpcomingCommand extends BaseCommand<typeof GenerateUpcomingCommand> {
	static summary = `Generates a summary of all changesets. This is used to generate an UPCOMING.md file that provides a single place where developers can see upcoming changes.`;

	// Enables the global JSON flag in oclif.
	static enableJsonFlag = true;

	static flags = {
		releaseGroup: releaseGroupFlag({
			required: true,
		}),
		releaseType: Flags.custom<"major" | "minor">({
			char: "t",
			description: "The type of release for which the upcoming file is being generated.",
			options: ["major", "minor"],
			required: true,
			parse: async (input) => {
				if (input === "major" || input === "minor") {
					return input;
				}

				throw new Error(`Invalid version bump type: ${input}`);
			},
		})(),
		out: Flags.file({
			description: `Output the results to this file.`,
			default: DEFAULT_FILE,
		}),
		...BaseCommand.flags,
	};

	static examples = [
		{
			description: `Generate UPCOMING.md for the client release group using the minor changesets.`,
			command: "<%= config.bin %> <%= command.id %> -g client -t minor",
		},
		{
			description: `You can output a different file using the --out flag.`,
			command: "<%= config.bin %> <%= command.id %> -g client -t minor --out testOutput.md",
		},
	];

	public async run(): Promise<string> {
		const context = await this.getContext();
		const { flags, logger } = this;

		const changesetDir = path.join(context.repo.resolvedRoot, DEFAULT_CHANGESET_PATH);
		const changes = await loadChangesets(changesetDir, logger);

		const version = context.getVersion(flags.releaseGroup);
		const header = `<!-- THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY. -->`;
		const intro = `# Upcoming changes in Fluid Framework v${version}`;

		this.info(`Loaded ${changes.length} changes.`);
		assert(flags.releaseType !== undefined, `Release type must be provided.`);

		let body: string = "";
		for (const change of changes) {
			if (change.changeTypes.includes(flags.releaseType)) {
				body += `## ${change.summary}\n\n${change.content}\n\n`;
			} else {
				this.info(
					`Excluding changeset: ${path.basename(change.sourceFile)} because it has no ${
						flags.releaseType
					} changes.`,
				);
			}
		}

		const contents = `${header}\n\n${intro}\n\n${body}`;
		const outputPath = path.join(context.repo.resolvedRoot, flags.out);
		this.info(`Writing output file: ${outputPath}`);
		await writeFile(
			outputPath,
			await prettier(contents, { proseWrap: "never", parser: "markdown" }),
		);

		return contents;
	}
}
