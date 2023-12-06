/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import {
	ApiDocumentedItem,
	ApiItem,
	ApiItemContainerMixin,
	ApiModel,
	IResolveDeclarationReferenceResult,
} from "@microsoft/api-extractor-model";
import { DocComment, DocInheritDocTag } from "@microsoft/tsdoc";
import { FileSystem } from "@rushstack/node-core-library";

import { Logger } from "./Logging";

/**
 * Reads API reports generated by {@link https://api-extractor.com/ | API-Extractor} (.api.json files)
 * under the provided directory path, and generates an `ApiModel` from them.
 *
 * @remarks
 *
 * The resulting `ApiModel` can be passed to {@link transformApiModel} or to one of the bundled renderers
 * to generate API documentation for the model and its packages.
 *
 * @param reportsDirectoryPath - Path to the directory containing the API reports.
 * @param logger - Optional logger for reporting system events while loading the model.
 *
 * @public
 */
export async function loadModel(reportsDirectoryPath: string, logger?: Logger): Promise<ApiModel> {
	if (!(await FileSystem.existsAsync(reportsDirectoryPath))) {
		throw new Error(`Provided directory does not exist: "${reportsDirectoryPath}".`);
	}

	logger?.info("Generating API model...");

	const apiReportFilePaths: string[] = [];
	for (const filename of FileSystem.readFolderItemNames(reportsDirectoryPath)) {
		if (/\.api\.json$/i.test(filename)) {
			logger?.verbose(`Reading ${filename}`);
			const filenamePath: string = Path.join(reportsDirectoryPath, filename);
			apiReportFilePaths.push(filenamePath);
		}
	}

	if (apiReportFilePaths.length === 0) {
		throw new Error(
			`No ".api.json" files found under provided directory path: "${reportsDirectoryPath}".`,
		);
	}

	const apiModel = new ApiModel();
	for (const apiReportFilePath of apiReportFilePaths) {
		logger?.verbose(`Loading package report "${apiReportFilePath}"...`);
		apiModel.loadPackage(apiReportFilePath);
	}

	logger?.success("API model generated!");
	logger?.info("Resolving `@inheritDoc` comments...");

	applyInheritDoc(apiModel, apiModel);

	logger?.success("`@inheritDoc` comments resolved successfully!");

	return apiModel;
}

/**
 * Pre-apply `{@inheritDoc}` comments to API items as needed.
 *
 * @param apiItem - The API item whose `@inheritDoc` tags will be resolved (i.e. flattened into the model).
 * @param apiModel - The model to which the provided `apiItem` belongs, and through which `@inheritDoc`
 * comments will be resolved.
 * If an `@inheritDoc` comment points to an API item that does not belong to this model, it will not be resolved
 * successfully.
 * @param logger - Optional logger for reporting system events while loading the model.
 *
 * @remarks Copied from `@microsoft/api-documenter` as a workaround for an `API-Extractor` limitation tracked by
 * this issue: {@link https://github.com/microsoft/rushstack/issues/2062}.
 */
// "inheritDoc" is the name of the tag
// eslint-disable-next-line unicorn/prevent-abbreviations
function applyInheritDoc(apiItem: ApiItem, apiModel: ApiModel, logger?: Logger): void {
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment) {
		// eslint-disable-next-line unicorn/prevent-abbreviations
		const inheritDocTag: DocInheritDocTag | undefined = apiItem.tsdocComment.inheritDocTag;

		if (inheritDocTag?.declarationReference !== undefined) {
			// Attempt to resolve the declaration reference
			const result: IResolveDeclarationReferenceResult = apiModel.resolveDeclarationReference(
				inheritDocTag.declarationReference,
				apiItem,
			);

			if (result.errorMessage !== undefined) {
				if (logger !== undefined) {
					logger.warning(
						`Unresolved @inheritDoc tag for ${apiItem.displayName}: ${result.errorMessage}.`,
					);
				}
			} else if (
				result.resolvedApiItem instanceof ApiDocumentedItem &&
				result.resolvedApiItem.tsdocComment &&
				result.resolvedApiItem !== apiItem
			) {
				copyInheritedDocumentation(
					apiItem.tsdocComment,
					result.resolvedApiItem.tsdocComment,
				);
			}
		}
	}

	// Recurse members
	if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
		for (const member of apiItem.members) {
			applyInheritDoc(member, apiModel);
		}
	}
}

/**
 * Copy the content from `sourceDocComment` to `targetDocComment`.
 *
 * @remarks Copied from `@microsoft/api-documenter` as a workaround for an `API-Extractor` limitation tracked by
 * this issue: {@link https://github.com/microsoft/rushstack/issues/2062}.
 */
function copyInheritedDocumentation(targetComment: DocComment, sourceComment: DocComment): void {
	targetComment.summarySection = sourceComment.summarySection;
	targetComment.remarksBlock = sourceComment.remarksBlock;

	targetComment.params.clear();
	for (const parameter of sourceComment.params) {
		targetComment.params.add(parameter);
	}
	for (const typeParameter of sourceComment.typeParams) {
		targetComment.typeParams.add(typeParameter);
	}
	targetComment.returnsBlock = sourceComment.returnsBlock;

	targetComment.inheritDocTag = undefined;
}
