/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes } from "../feature-libraries";
import { InsertableTreeNodeUnion } from "./insertable";
import { TreeListNodeBase, TreeNodeUnion } from "./types";

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the list mutation APIs.
 * @alpha
 */
export interface TreeListNode<out TTypes extends AllowedTypes = AllowedTypes>
	extends TreeListNodeBase<
		TreeNodeUnion<TTypes>,
		InsertableTreeNodeUnion<TTypes>,
		TreeListNode
	> {}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the list mutation APIs.
 * @alpha
 */
export const TreeListNode = {
	/**
	 * Wrap an iterable of items to inserted as consecutive items in a list.
	 * @remarks
	 * The object returned by this function can be inserted into a {@link TreeListNode}.
	 * Its contents will be inserted consecutively in the corresponding location in the list.
	 * @example
	 * ```ts
	 * list.insertAtEnd(TreeListNode.inline(iterable))
	 * ```
	 */
	inline: <T>(content: Iterable<T>) => IterableTreeListContent[create](content),
};

/**
 * Non-exported symbol used to make IterableTreeListContent constructable only from within this file.
 */
const create = Symbol("Create IterableTreeListContent");

/**
 * Used to insert iterable content into a {@link (TreeListNode:interface)}.
 * Use {@link (TreeListNodeOld:variable).inline} to create an instance of this type.
 * @privateRemarks
 * TODO: Figure out how to link {@link TreeListNode.inline} above such that it works with API-Extractor.
 * @alpha
 */
export class IterableTreeListContent<T> implements Iterable<T> {
	private constructor(private readonly content: Iterable<T>) {}
	public static [create]<T>(content: Iterable<T>): IterableTreeListContent<T> {
		return new IterableTreeListContent(content);
	}
	public [Symbol.iterator](): Iterator<T> {
		return this.content[Symbol.iterator]();
	}
}
