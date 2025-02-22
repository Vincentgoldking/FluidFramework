/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	ChangeAtomId,
	RevisionMetadataSource,
	RevisionTag,
	TaggedChange,
} from "../../core/index.js";
import { IdAllocator, brand, fail } from "../../util/index.js";
import {
	CrossFieldManager,
	CrossFieldTarget,
	NodeChangeComposer,
	NodeId,
} from "../modular-schema/index.js";

import { CellOrderingMethod, sequenceConfig } from "./config.js";
import { EmptyInputCellMark, MoveMarkEffect } from "./helperTypes.js";
import { MarkListFactory } from "./markListFactory.js";
import { MarkQueue } from "./markQueue.js";
import {
	MoveEffect,
	MoveEffectTable,
	getCrossFieldTargetFromMove,
	getMoveEffect,
	getMoveIn,
	isMoveIn,
	isMoveMark,
	isMoveOut,
	setMoveEffect,
} from "./moveEffectTable.js";
import {
	CellId,
	CellMark,
	Changeset,
	Detach,
	Mark,
	MarkEffect,
	MarkList,
	MoveId,
	NoopMark,
	NoopMarkType,
} from "./types.js";
import {
	CellOrder,
	areEqualCellIds,
	areInputCellsEmpty,
	areOutputCellsEmpty,
	asAttachAndDetach,
	cellSourcesFromMarks,
	compareCellPositionsUsingTombstones,
	compareCellsFromSameRevision,
	compareLineages,
	extractMarkEffect,
	getEndpoint,
	getInputCellId,
	getOffsetInCellRange,
	getOutputCellId,
	isAttach,
	isAttachAndDetachEffect,
	isDetach,
	isImpactfulCellRename,
	isNewAttach,
	isNoopMark,
	markEmptiesCells,
	markFillsCells,
	markHasCellEffect,
	normalizeCellRename,
	settleMark,
	withNodeChange,
	withRevision,
} from "./utils.js";

/**
 * Composes a sequence of changesets into a single changeset.
 * @param changes - The changesets to be applied.
 * Parts of the input may be reused in the output, but the input is not mutated.
 * Each changeset in the list is assumed to be applicable after the previous one.
 * @returns A changeset that is equivalent to applying each of the given `changes` in order.
 *
 * WARNING! This implementation is incomplete:
 * - Tombstone information is ignored.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function compose(
	change1: TaggedChange<Changeset>,
	change2: TaggedChange<Changeset>,
	composeChild: NodeChangeComposer,
	_genId: IdAllocator,
	manager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset {
	return composeMarkLists(
		change1,
		change2,
		composeChild,
		manager as MoveEffectTable,
		revisionMetadata,
	);
}

function composeMarkLists(
	{ change: baseMarkList, revision: baseRev }: TaggedChange<MarkList>,
	{ change: newMarkList, revision: newRev }: TaggedChange<MarkList>,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
	revisionMetadata: RevisionMetadataSource,
): MarkList {
	const factory = new MarkListFactory();
	const queue = new ComposeQueue(
		baseRev,
		baseMarkList,
		newRev,
		newMarkList,
		moveEffects,
		revisionMetadata,
	);
	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		if (newMark === undefined) {
			assert(
				baseMark !== undefined,
				0x4db /* Non-empty queue should not return two undefined marks */,
			);
			factory.push(
				composeMark(baseMark, baseRev, moveEffects, (node: NodeId) =>
					composeChildChanges(node, undefined, composeChild),
				),
			);
		} else {
			// We only compose changesets that will not be further rebased.
			// It is therefore safe to remove any intentions that have no impact in the context they apply to.
			const settledNewMark = settleMark(newMark, newRev, revisionMetadata);
			if (baseMark === undefined) {
				factory.push(
					composeMark(settledNewMark, newRev, moveEffects, (node: NodeId) =>
						composeChildChanges(undefined, node, composeChild),
					),
				);
			} else {
				// Past this point, we are guaranteed that `settledNewMark` and `baseMark` have the same length and
				// start at the same location in the revision after the base changes.
				// They therefore refer to the same range for that revision.
				const settledBaseMark = settleMark(baseMark, baseRev, revisionMetadata);
				const composedMark = composeMarks(
					baseRev,
					settledBaseMark,
					newRev,
					settledNewMark,
					composeChild,
					moveEffects,
					revisionMetadata,
				);
				factory.push(composedMark);
			}
		}
	}

	return factory.list;
}

/**
 * Composes two marks where `newMark` is based on the state produced by `baseMark`.
 * @param baseMark - The mark to compose with `newMark`.
 * Its output range should be the same as `newMark`'s input range.
 * @param newRev - The revision the new mark is part of.
 * @param newMark - The mark to compose with `baseMark`.
 * Its input range should be the same as `baseMark`'s output range.
 * @returns A mark that is equivalent to applying both `baseMark` and `newMark` successively.
 */
function composeMarks(
	baseRev: RevisionTag | undefined,
	baseMark: Mark,
	newRev: RevisionTag | undefined,
	newMark: Mark,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
	revisionMetadata: RevisionMetadataSource,
): Mark {
	const nodeChange = handleNodeChanges(baseMark, baseRev, newMark, composeChild, moveEffects);

	return withUpdatedEndpoint(
		withNodeChange(
			composeMarksIgnoreChild(
				withRevision(baseMark, baseRev),
				withRevision(newMark, newRev),
				moveEffects,
				revisionMetadata,
			),
			nodeChange,
		),
		baseMark.count,
		undefined,
		moveEffects,
	);
}

function composeMarksIgnoreChild(
	baseMark: Mark,
	newMark: Mark,
	moveEffects: MoveEffectTable,
	revisionMetadata: RevisionMetadataSource,
): Mark {
	if (isImpactfulCellRename(newMark, undefined, revisionMetadata)) {
		const newAttachAndDetach = asAttachAndDetach(newMark);
		const newDetachRevision = newAttachAndDetach.detach.revision;
		if (markEmptiesCells(baseMark)) {
			// baseMark is a detach which cancels with the attach portion of the AttachAndDetach,
			// so we are just left with the detach portion of the AttachAndDetach.
			const newDetach: CellMark<Detach> = {
				...newAttachAndDetach.detach,
				count: baseMark.count,
			};

			if (isMoveIn(newAttachAndDetach.attach) && isMoveOut(newAttachAndDetach.detach)) {
				assert(isMoveOut(baseMark), 0x808 /* Unexpected mark type */);

				// The base changeset and new changeset both move these nodes.
				// Call the original position of the nodes A, the position after the base changeset is applied B,
				// and the position after the new changeset is applied C.
				// The new changeset moves the nodes from B, temporarily returns them to A, and then moves them to C.
				// The composition of the base and new changesets will be a move directly from A to C,
				// since the move from A to B cancels out with the return from B to A.
				// This if-block is handling marks at A.
				// When we compose the marks at B we will link the start of the base move (A to B)
				// with the end of the new move (B to C).
				// Because we are replacing the mark representing the start of the move with the new changeset's
				// move-out from A, we update the base move-in at B to consider that its start point.
				const newDetachId = {
					revision: newDetachRevision,
					localId: newAttachAndDetach.detach.id,
				};

				setTruncatedEndpointForInner(
					moveEffects,
					CrossFieldTarget.Destination,
					getEndpoint(baseMark, undefined),
					baseMark.count,
					newDetachId,
				);

				const newEndpoint = getComposedEndpoint(
					moveEffects,
					CrossFieldTarget.Source,
					baseMark.revision,
					baseMark.id,
					baseMark.count,
				);

				if (newEndpoint !== undefined) {
					changeFinalEndpoint(newDetach as MoveMarkEffect, newEndpoint);
					setTruncatedEndpoint(
						moveEffects,
						CrossFieldTarget.Destination,
						newEndpoint,
						baseMark.count,
						newDetachId,
					);
				}
			}

			return newDetach;
		}

		if (isImpactfulCellRename(baseMark, undefined, revisionMetadata)) {
			const baseAttachAndDetach = asAttachAndDetach(baseMark);
			const newOutputId = getOutputCellId(newAttachAndDetach, undefined, revisionMetadata);

			if (areEqualCellIds(newOutputId, baseAttachAndDetach.cellId)) {
				return { count: baseAttachAndDetach.count, cellId: baseAttachAndDetach.cellId };
			}

			// `newMark`'s attach portion cancels with `baseMark`'s detach portion.
			const originalAttach = { ...baseAttachAndDetach.attach };
			const finalDetach = { ...newAttachAndDetach.detach };
			const detachRevision = finalDetach.revision;
			if (detachRevision !== undefined) {
				finalDetach.revision = detachRevision;
			}

			return normalizeCellRename({
				type: "AttachAndDetach",
				cellId: baseMark.cellId,
				count: baseMark.count,
				attach: originalAttach,
				detach: finalDetach,
			});
		}

		return normalizeCellRename(newAttachAndDetach);
	}
	if (isImpactfulCellRename(baseMark, undefined, revisionMetadata)) {
		const baseAttachAndDetach = asAttachAndDetach(baseMark);
		if (markFillsCells(newMark)) {
			const originalAttach = withRevision(
				{
					...baseAttachAndDetach.attach,
					cellId: baseAttachAndDetach.cellId,
					count: baseAttachAndDetach.count,
				},
				baseAttachAndDetach.attach.revision,
			);

			if (isMoveIn(baseAttachAndDetach.attach) && isMoveOut(baseAttachAndDetach.detach)) {
				assert(isMoveIn(newMark), 0x809 /* Unexpected mark type */);

				const originalAttachId = {
					revision: baseAttachAndDetach.attach.revision,
					localId: baseAttachAndDetach.attach.id,
				};

				setTruncatedEndpointForInner(
					moveEffects,
					CrossFieldTarget.Source,
					getEndpoint(newMark, undefined),
					baseAttachAndDetach.count,
					originalAttachId,
				);

				const newEndpoint = getComposedEndpoint(
					moveEffects,
					CrossFieldTarget.Destination,
					newMark.revision,
					newMark.id,
					newMark.count,
				);

				if (newEndpoint !== undefined) {
					changeFinalEndpoint(originalAttach as MoveMarkEffect, newEndpoint);
					setTruncatedEndpoint(
						moveEffects,
						CrossFieldTarget.Source,
						newEndpoint,
						baseMark.count,
						originalAttachId,
					);
				}
			}

			return originalAttach;
		} else {
			// Other mark types have been handled by previous conditional branches.
			assert(newMark.type === NoopMarkType, 0x80a /* Unexpected mark type */);
			return baseMark;
		}
	}

	if (!markHasCellEffect(baseMark) && !markHasCellEffect(newMark)) {
		if (isNoopMark(baseMark)) {
			return newMark;
		} else if (isNoopMark(newMark)) {
			return baseMark;
		}
		return createNoopMark(
			newMark.count,
			undefined,
			getInputCellId(baseMark, undefined, undefined),
		);
	} else if (!markHasCellEffect(baseMark)) {
		return newMark;
	} else if (!markHasCellEffect(newMark)) {
		return baseMark;
	} else if (areInputCellsEmpty(baseMark)) {
		assert(isDetach(newMark), 0x71c /* Unexpected mark type */);
		assert(isAttach(baseMark), 0x71d /* Expected generative mark */);

		const attach = extractMarkEffect(baseMark);
		const detach = extractMarkEffect(newMark);

		if (isMoveIn(attach) && isMoveOut(detach)) {
			const finalSource = getEndpoint(attach, undefined);
			const finalDest = getEndpoint(detach, undefined);

			setEndpoint(
				moveEffects,
				CrossFieldTarget.Source,
				finalSource,
				baseMark.count,
				finalDest,
			);

			const truncatedEndpoint1 = getTruncatedEndpointForInner(
				moveEffects,
				CrossFieldTarget.Destination,
				attach.revision,
				attach.id,
				baseMark.count,
			);

			if (truncatedEndpoint1 !== undefined) {
				setTruncatedEndpoint(
					moveEffects,
					CrossFieldTarget.Destination,
					finalDest,
					baseMark.count,
					truncatedEndpoint1,
				);
			}

			setEndpoint(
				moveEffects,
				CrossFieldTarget.Destination,
				finalDest,
				baseMark.count,
				finalSource,
			);

			const truncatedEndpoint2 = getTruncatedEndpointForInner(
				moveEffects,
				CrossFieldTarget.Source,
				detach.revision,
				detach.id,
				baseMark.count,
			);

			if (truncatedEndpoint2 !== undefined) {
				setTruncatedEndpoint(
					moveEffects,
					CrossFieldTarget.Source,
					finalSource,
					baseMark.count,
					truncatedEndpoint2,
				);
			}

			// The `finalEndpoint` field of AttachAndDetach move effect pairs is not used,
			// so we remove it as a normalization.
			delete attach.finalEndpoint;
			delete detach.finalEndpoint;
		}

		if (
			areEqualCellIds(getOutputCellId(newMark, undefined, revisionMetadata), baseMark.cellId)
		) {
			// The output and input cell IDs are the same, so this mark has no effect.
			return { count: baseMark.count, cellId: baseMark.cellId };
		}
		return normalizeCellRename({
			type: "AttachAndDetach",
			cellId: baseMark.cellId,
			count: baseMark.count,
			attach,
			detach,
		});
	} else {
		const length = baseMark.count;
		return createNoopMark(length, undefined);
	}
}

function createNoopMark(
	length: number,
	nodeChange: NodeId | undefined,
	cellId?: ChangeAtomId,
): Mark {
	const mark: CellMark<NoopMark> = { count: length };
	if (nodeChange !== undefined) {
		assert(length === 1, 0x692 /* A mark with a node change must have length one */);
		mark.changes = nodeChange;
	}
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

function handleNodeChanges(
	baseMark: Mark,
	baseRev: RevisionTag | undefined,
	newMark: Mark,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
): NodeId | undefined {
	if (newMark.changes !== undefined) {
		const baseSource = getMoveIn(baseMark);

		// TODO: Make sure composeChild is not called twice on the node changes.
		if (baseSource !== undefined) {
			setModifyAfter(moveEffects, getEndpoint(baseSource, baseRev), newMark.changes);
			return undefined;
		}
	}

	return composeChildChanges(baseMark.changes, newMark.changes, composeChild);
}

function composeChildChanges(
	baseChange: NodeId | undefined,
	newChange: NodeId | undefined,
	composeChild: NodeChangeComposer,
): NodeId | undefined {
	if (baseChange === undefined && newChange === undefined) {
		return undefined;
	}

	return composeChild(baseChange, newChange);
}

function composeMark<TMark extends Mark>(
	mark: TMark,
	revision: RevisionTag | undefined,
	moveEffects: MoveEffectTable,
	composeChild: (node: NodeId) => NodeId | undefined,
): TMark {
	const nodeChanges = mark.changes !== undefined ? composeChild(mark.changes) : undefined;
	const updatedMark = withUpdatedEndpoint(mark, mark.count, revision, moveEffects);
	return withNodeChange(withRevision(updatedMark, revision), nodeChanges);
}

export class ComposeQueue {
	private readonly baseMarks: MarkQueue;
	private readonly newMarks: MarkQueue;
	private readonly baseMarksCellSources: ReadonlySet<RevisionTag | undefined>;
	private readonly newMarksCellSources: ReadonlySet<RevisionTag | undefined>;

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset,
		private readonly newRevision: RevisionTag | undefined,
		newMarks: Changeset,
		private readonly moveEffects: MoveEffectTable,
		private readonly revisionMetadata: RevisionMetadataSource,
	) {
		this.baseMarks = new MarkQueue(baseMarks, baseRevision, moveEffects);
		this.newMarks = new MarkQueue(newMarks, newRevision, moveEffects);
		this.baseMarksCellSources = cellSourcesFromMarks(
			baseMarks,
			baseRevision,
			revisionMetadata,
			getOutputCellId,
		);
		this.newMarksCellSources = cellSourcesFromMarks(
			newMarks,
			undefined,
			revisionMetadata,
			getInputCellId,
		);
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): ComposeMarks {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			return this.dequeueNew();
		} else if (newMark === undefined) {
			return this.dequeueBase();
		} else if (areOutputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const baseCellId: ChangeAtomId =
				getOutputCellId(baseMark, this.baseMarks.revision, this.revisionMetadata) ??
				fail("Expected defined output ID");

			if (markEmptiesCells(baseMark) && baseCellId.revision === undefined) {
				// The base revision should always be defined except when squashing changes into a transaction.
				// In the future, we want to support reattaches in the new change here.
				// We will need to be able to order the base mark relative to the new mark by looking at the lineage of the new mark
				// (which will be obtained by rebasing the reattach over interim changes
				// (which requires the local changes to have a revision tag))
				assert(
					isNewAttach(newMark),
					0x695 /* TODO: Assign revision tags to each change in a transaction */,
				);
				return this.dequeueNew();
			}

			switch (sequenceConfig.cellOrdering) {
				case CellOrderingMethod.Tombstone: {
					const newCellId = getInputCellId(
						newMark,
						this.newRevision,
						this.revisionMetadata,
					);
					assert(newCellId !== undefined, 0x89d /* Both marks should have cell IDs */);
					const comparison = compareCellPositionsUsingTombstones(
						baseCellId,
						newCellId,
						this.baseMarksCellSources,
						this.newMarksCellSources,
						this.revisionMetadata,
					);
					switch (comparison) {
						case CellOrder.SameCell:
							return this.dequeueBoth();
						case CellOrder.OldThenNew:
							return this.dequeueBase();
						case CellOrder.NewThenOld:
							return this.dequeueNew();
						default:
							unreachableCase(comparison);
					}
				}
				case CellOrderingMethod.Lineage: {
					const cmp = compareCellPositions(
						baseCellId,
						baseMark.count,
						newMark,
						this.newRevision,
						this.revisionMetadata,
					);
					if (cmp < 0) {
						return this.dequeueBase(-cmp);
					} else if (cmp > 0) {
						return this.dequeueNew(cmp);
					} else {
						return this.dequeueBoth();
					}
				}
				default:
					unreachableCase(sequenceConfig.cellOrdering);
			}
		} else if (areOutputCellsEmpty(baseMark)) {
			return this.dequeueBase();
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else {
			return this.dequeueBoth();
		}
	}

	private dequeueBase(length: number = Infinity): ComposeMarks {
		const baseMark = this.baseMarks.dequeueUpTo(length);
		const movedChanges = getMovedChangesFromMark(
			this.moveEffects,
			baseMark,
			this.baseMarks.revision,
		);

		const newMark = createNoopMark(
			baseMark.count,
			movedChanges,
			getOutputCellId(baseMark, this.baseMarks.revision, this.revisionMetadata),
		);
		return { baseMark, newMark };
	}

	private dequeueNew(length: number = Infinity): ComposeMarks {
		const newMark = this.newMarks.dequeueUpTo(length);
		const baseMark = createNoopMark(
			newMark.count,
			undefined,
			getInputCellId(newMark, this.newMarks.revision, this.revisionMetadata),
		);

		return {
			baseMark,
			newMark,
		};
	}

	private dequeueBoth(): ComposeMarks {
		const length = this.peekMinLength();
		const baseMark = this.baseMarks.dequeueUpTo(length);
		let newMark = this.newMarks.dequeueUpTo(length);
		const movedChanges = getMovedChangesFromMark(
			this.moveEffects,
			baseMark,
			this.baseMarks.revision,
		);

		if (movedChanges !== undefined) {
			assert(newMark.changes === undefined, 0x8da /* Unexpected node changeset collision */);
			newMark = withNodeChange(newMark, movedChanges);
		}

		return {
			baseMark,
			newMark,
		};
	}

	private peekMinLength(): number {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x8db /* Cannot peek length unless both mark queues are non-empty */,
		);

		return Math.min(newMark.count, baseMark.count);
	}
}

interface ComposeMarks {
	baseMark?: Mark;
	newMark?: Mark;
}

// TODO: Try to share more logic with the version in rebase.ts.
/**
 * Returns a number N which encodes how the cells of the two marks are aligned.
 * - If N is zero, then the first cell of `baseMark` is the same as the first cell of `newMark`.
 * - If N is positive, then the first N cells of `newMark` (or all its cells if N is greater than its length)
 * are before the first cell of `baseMark`.
 * - If N is negative, then the first N cells of `baseMark` (or all its cells if N is greater than its length)
 * are before the first cell of `newMark`.
 */
function compareCellPositions(
	baseCellId: CellId,
	baseCellCount: number,
	newMark: EmptyInputCellMark,
	newIntention: RevisionTag | undefined,
	metadata: RevisionMetadataSource,
): number {
	const newCellId = getInputCellId(newMark, newIntention, metadata);
	assert(newCellId !== undefined, 0x71f /* Should have cell ID */);
	if (baseCellId.revision === newCellId.revision) {
		const comparison = compareCellsFromSameRevision(
			baseCellId,
			baseCellCount,
			newCellId,
			newMark.count,
		);

		if (comparison !== undefined) {
			return comparison;
		}
	}

	const offsetInBase = getOffsetInCellRange(
		baseCellId.lineage,
		newCellId.revision,
		newCellId.localId,
		newMark.count,
	);
	if (offsetInBase !== undefined) {
		return offsetInBase > 0 ? offsetInBase : -Infinity;
	}

	const offsetInNew = getOffsetInCellRange(
		newCellId.lineage,
		baseCellId.revision,
		baseCellId.localId,
		baseCellCount,
	);
	if (offsetInNew !== undefined) {
		return offsetInNew > 0 ? -offsetInNew : Infinity;
	}

	const cmp = compareLineages(baseCellId, newCellId);
	if (cmp !== 0) {
		return Math.sign(cmp) * Infinity;
	}

	assert(
		baseCellId.revision !== undefined && newCellId.revision !== undefined,
		0x858 /* Cells should have defined revisions */,
	);

	if (!isNewAttach(newMark)) {
		// If `newMark` were targeting a cell older than the composition window
		// there would be lineage determining the relative order of `newCell` and `baseCell`.

		// TODO:6127: Enable this assert
		// assert(
		// 	newRevisionIndex !== undefined,
		// 	"Expected lineage to determine cell order",
		// );

		// `newCell` was detached by a change in this composition, so there will be a corresponding mark
		// later in the base changeset.
		return -Infinity;
	}

	const newRevisionIndex = metadata.getIndex(newCellId.revision);
	const baseRevisionIndex = metadata.getIndex(baseCellId.revision);
	assert(
		newRevisionIndex !== undefined,
		0x859 /* A cell from a new attach should have a defined revision index */,
	);

	// We use the tiebreaking policy of the newer cell.
	return (baseRevisionIndex ?? -Infinity) > newRevisionIndex ? -Infinity : Infinity;
}

function getMovedChangesFromMark(
	moveEffects: MoveEffectTable,
	markEffect: MarkEffect,
	revision: RevisionTag | undefined,
): NodeId | undefined {
	if (isAttachAndDetachEffect(markEffect)) {
		return getMovedChangesFromMark(moveEffects, markEffect.detach, revision);
	}
	if (!isMoveOut(markEffect)) {
		return undefined;
	}

	return getModifyAfter(moveEffects, markEffect.revision ?? revision, markEffect.id);
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getModifyAfter(
	moveEffects: MoveEffectTable,
	revision: RevisionTag | undefined,
	id: MoveId,
): NodeId | undefined {
	const target = CrossFieldTarget.Source;
	const effect = getMoveEffect(moveEffects, target, revision, id, 1);

	if (effect.value?.modifyAfter !== undefined) {
		return effect.value.modifyAfter;
	}

	return undefined;
}

// TODO: Reduce the duplication between this and other MoveEffect helpers
function setModifyAfter(
	moveEffects: MoveEffectTable,
	{ revision, localId: id }: ChangeAtomId,
	modifyAfter: NodeId,
) {
	const target = CrossFieldTarget.Source;
	const count = 1;
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	const newEffect: MoveEffect =
		effect.value !== undefined ? { ...effect.value, modifyAfter } : { modifyAfter };
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

function setEndpoint(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	endpoint: ChangeAtomId,
) {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count);
	const newEffect = effect.value !== undefined ? { ...effect.value, endpoint } : { endpoint };
	setMoveEffect(moveEffects, target, id.revision, id.localId, effect.length, newEffect);

	const remainingCount = count - effect.length;
	if (remainingCount > 0) {
		setEndpoint(
			moveEffects,
			target,
			offsetChangeAtomId(id, effect.length),
			remainingCount,
			offsetChangeAtomId(endpoint, effect.length),
		);
	}
}

function setTruncatedEndpoint(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	truncatedEndpoint: ChangeAtomId,
) {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count);
	const newEffect =
		effect.value !== undefined ? { ...effect.value, truncatedEndpoint } : { truncatedEndpoint };

	setMoveEffect(moveEffects, target, id.revision, id.localId, effect.length, newEffect);

	const remainingCount = count - effect.length;
	if (remainingCount > 0) {
		setTruncatedEndpoint(
			moveEffects,
			target,
			offsetChangeAtomId(id, effect.length),
			remainingCount,
			offsetChangeAtomId(truncatedEndpoint, effect.length),
		);
	}
}

function setTruncatedEndpointForInner(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	truncatedEndpointForInner: ChangeAtomId,
) {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count);
	const newEffect =
		effect.value !== undefined
			? { ...effect.value, truncatedEndpointForInner }
			: { truncatedEndpointForInner };
	setMoveEffect(moveEffects, target, id.revision, id.localId, effect.length, newEffect);

	const remainingCount = count - effect.length;
	if (remainingCount > 0) {
		setTruncatedEndpointForInner(
			moveEffects,
			target,
			offsetChangeAtomId(id, effect.length),
			remainingCount,
			offsetChangeAtomId(truncatedEndpointForInner, effect.length),
		);
	}
}

function withUpdatedEndpoint<TMark extends MarkEffect>(
	mark: TMark,
	count: number,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable,
): TMark {
	if (isAttachAndDetachEffect(mark)) {
		return {
			...mark,
			attach: withUpdatedEndpoint(mark.attach, count, revision, effects),
			detach: withUpdatedEndpoint(mark.detach, count, revision, effects),
		};
	}

	if (!isMoveMark(mark)) {
		return mark;
	}

	const markRevision = mark.revision ?? revision;
	const finalDest = getComposedEndpoint(
		effects,
		getCrossFieldTargetFromMove(mark),
		markRevision,
		mark.id,
		count,
	);

	if (finalDest === undefined) {
		return mark;
	}

	const output = { ...mark };
	changeFinalEndpoint(output, finalDest);

	return output;
}

function changeFinalEndpoint(mark: MoveMarkEffect, endpoint: ChangeAtomId) {
	if (areEqualCellIds(endpoint, { revision: mark.revision, localId: mark.id })) {
		delete mark.finalEndpoint;
	} else {
		mark.finalEndpoint = endpoint;
	}
}

function getComposedEndpoint(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): ChangeAtomId | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	assert(effect.length === count, 0x815 /* Expected effect to cover entire mark */);
	return effect.value?.truncatedEndpoint ?? effect.value?.endpoint;
}

function getTruncatedEndpointForInner(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): ChangeAtomId | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	assert(effect.length === count, "Expected effect to cover entire mark");
	return effect.value?.truncatedEndpointForInner;
}

function offsetChangeAtomId(id: ChangeAtomId, offset: number): ChangeAtomId {
	return { ...id, localId: brand(id.localId + offset) };
}
