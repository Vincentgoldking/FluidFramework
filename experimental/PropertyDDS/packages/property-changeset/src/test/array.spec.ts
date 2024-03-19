/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Tests for the array changeset operations
 */

import { copy as cloneDeep } from "fastest-json-copy";
import isEmpty from "lodash/isEmpty.js";
import isNumber from "lodash/isNumber.js";
import range from "lodash/range.js";

import { assert, expect } from "chai";
import { ChangeSet, SerializedChangeSet } from "../changeset.js";

describe("Array Operations", function () {
	let guidCounter = 1;

	const generateNamedEntities = (count, offsets?, type?) =>
		range(count).map((i) => {
			const offsetShift = offsets !== undefined ? offsets.shift() : undefined;
			const id = offsetShift !== undefined ? guidCounter - offsetShift : guidCounter++;
			if (type === undefined) {
				return {
					String: {
						guid: `00000000-0000-0000-0000-${`000000000000${id}`.substr(-12)}`,
					},
					typeid: "test:namedEntry-1.0.0",
				};
			} else if (type === "number") {
				return id;
			}
		});

	function createArrayCS(arrayOperations, baseOperation?, type?): SerializedChangeSet {
		baseOperation = baseOperation || "modify";
		type = type || "array<test:namedEntry-1.0.0>";
		return {
			[baseOperation]: {
				[type]: {
					array: arrayOperations,
				},
			},
		};
	}

	function getArrayCS(CS): SerializedChangeSet {
		if (CS instanceof ChangeSet) {
			CS = CS.getSerializedChangeSet();
		}
		if (isEmpty(CS)) {
			return {};
		}
		const first = (x) => Object.values(x)[0];
		return first(first(first(CS)));
	}

	it("Avoid merging of adjacent remove operations with an insert in between", () => {
		// This test creates a condition where there are two adjacent removes, with an insert
		// in between. Those two removes must not be merged when applying the two changesets
		// as otherwise overlapping ranges would be created in the result, which are not allowed
		// by the spec
		const op1 = createArrayCS({
			insert: [[1, generateNamedEntities(3)]],
			remove: [[1, generateNamedEntities(1)]],
		});

		const op2 = createArrayCS({
			remove: [[0, generateNamedEntities(2)]],
		});

		const result = new ChangeSet(op1);
		result.applyChangeSet(op2);

		// We expect the two ranges to be non overlapping
		const arrayCS =
			result.getSerializedChangeSet().modify["array<test:namedEntry-1.0.0>"].array;
		const removeStart = arrayCS.remove[0][0];
		const removeEnd = arrayCS.remove[0][0] + arrayCS.remove[0][1].length;
		const insertStart = arrayCS.insert[0][0];

		expect(insertStart <= removeStart || insertStart >= removeEnd).to.be.true;
	});

	it("Rebasing with a base changeset containing adjacent removes and inserts", () => {
		const base = createArrayCS({
			insert: [[1, generateNamedEntities(3)]],
			remove: [[0, generateNamedEntities(1)]],
		});

		const rebaseCS = createArrayCS({
			insert: [[0, generateNamedEntities(1)]],
		});

		const conflicts = [];
		const CS = new ChangeSet(base);
		CS._rebaseChangeSet(rebaseCS, conflicts);

		// We expect the rebase to keep the insert at position 0. The base changeSet contains an
		// insert at position 3. There is also a remove within the same CS, which causes both
		// inserts to be with respect to the same position in the resulting array, but we have
		// to keep the order of the inserts, since we can only guarantee the distributivity of
		// the rebase this way. The CS above could have been generated by a combination of a
		// I(1,3) followed by a R(0,1). If the rebase CS would have been rebased separately
		// with respect to those two CS, it would have remained a I(0,3).
		expect(
			(rebaseCS as SerializedChangeSet).modify["array<test:namedEntry-1.0.0>"].array
				.insert[0][0],
		).to.equal(0);
	});

	for (const i of [0, 3]) {
		it(`Rebasing an insert behind a remove insert base changeset with insert position ${i}`, () => {
			const base = createArrayCS({
				insert: [[i, generateNamedEntities(3)]],
				remove: [[0, generateNamedEntities(3)]],
			});
			const rebaseCS = createArrayCS({
				insert: [[0, generateNamedEntities(1)]],
			});

			const originalRebaseCS = cloneDeep(rebaseCS);
			const conflicts = [];
			const applyAfterMetaInformation = new Map();
			const CS = new ChangeSet(base);
			CS._rebaseChangeSet(rebaseCS, conflicts, { applyAfterMetaInformation });

			// Whether the insert in the rebaseCS is moved depends on the insert in the base CS. If the base CS
			// is the result of an I(3, 3) followed by a R(0,3), it would not be moved since the insert in the baseCS
			// is behind the insert in the rebase CS. Otherwise, if it is an I(0, 0) our rebase rules would move it
			// to index 3 behind the other insert
			expect(rebaseCS.modify["array<test:namedEntry-1.0.0>"].array.insert[0][0]).to.equal(
				i === 0 ? 3 : 0,
			);

			const combinedCS = new ChangeSet(originalRebaseCS);
			combinedCS.toInverseChangeSet();
			combinedCS.applyChangeSet(base);
			combinedCS.applyChangeSet(rebaseCS, { applyAfterMetaInformation });

			const finalCs = combinedCS.getSerializedChangeSet();
			// The insert above should cancel out. If the original insert was at position 0, we moved the rebased
			// insert behind the original insert. This means the original insert should now be at position 0,
			// before the insert that canceled out. Otherwise, it should be at position 4 (behind the removed
			// range, as it was in the original CS, but now shifted by 1).
			expect(finalCs.modify["array<test:namedEntry-1.0.0>"].array.insert[0][0]).to.equal(
				i === 0 ? 0 : 4,
			);
		});
	}

	it("Inserts should happen at the beginning of a remove range", () => {
		const op1 = createArrayCS({
			insert: [[1, generateNamedEntities(3)]],
			remove: [[1, generateNamedEntities(1)]],
		});
		const op2 = createArrayCS({
			insert: [[4, generateNamedEntities(2)]],
		});

		const combinedCS = new ChangeSet(op1);
		combinedCS.applyChangeSet(op2);

		const arrayCS =
			combinedCS.getSerializedChangeSet().modify["array<test:namedEntry-1.0.0>"].array;
		expect(arrayCS.insert.length).to.equal(1);
	});

	function testRebasedApplies(localBranchChangeSet, baseChangeSet, baseState) {
		const conflicts = [];
		const rebaseMetaInformation = new Map();
		const originalRebaseChangeSet = cloneDeep(localBranchChangeSet);
		const deltaChangeSet = new ChangeSet(cloneDeep(localBranchChangeSet));
		deltaChangeSet.toInverseChangeSet();

		const rebaseChangeSet = cloneDeep(localBranchChangeSet);
		new ChangeSet(baseChangeSet)._rebaseChangeSet(rebaseChangeSet, conflicts, {
			applyAfterMetaInformation: rebaseMetaInformation,
		});

		deltaChangeSet.applyChangeSet(baseChangeSet);
		validateChangeSet(deltaChangeSet);
		const copiedRebaseChangeSet = cloneDeep(rebaseChangeSet);
		deltaChangeSet.applyChangeSet(rebaseChangeSet, {
			applyAfterMetaInformation: rebaseMetaInformation,
		});
		validateChangeSet(deltaChangeSet);

		// This path first walks onto the local branch (applying the original changeset from the local branch)
		// and then the delta to the new tip (going back one step, and then forward again)
		const deltaPath = new ChangeSet(cloneDeep(baseState));
		deltaPath.applyChangeSet(originalRebaseChangeSet);
		deltaPath.applyChangeSet(deltaChangeSet);

		// This computes the same state, but not starting from the local branch, but from the base commit itself
		const directPath = new ChangeSet(cloneDeep(baseState));
		directPath.applyChangeSet(baseChangeSet);
		directPath.applyChangeSet(rebaseChangeSet);
		expect(deltaPath.getSerializedChangeSet()).to.deep.equal(
			directPath.getSerializedChangeSet(),
		);

		// Make sure, the rebase changeset was not modified in the apply operation above
		expect(copiedRebaseChangeSet).to.deep.equal(rebaseChangeSet);

		return deltaChangeSet;
	}

	function runTestApplyingReverseAndRebasedChangesetForIndependentModifications(
		baseInsertPositions,
		rebasedInsertPositions,
		baseOperation = "insert",
		baseCount = 1,
	) {
		const createInserts = (positions, count) =>
			positions.map((x) => [x, generateNamedEntities(count)]);

		const baseChangeSet = createArrayCS({
			[baseOperation]: createInserts(baseInsertPositions, baseCount),
		});

		const localBranchChangeSet = createArrayCS({
			insert: createInserts(rebasedInsertPositions, 1),
		});

		// Test whether the created changeset computes the same result as applying
		// the base and rebase changeset to the base state
		const baseState = createArrayCS({
			insert: createInserts([0], 20),
		});
		const deltaChangeSet = testRebasedApplies(localBranchChangeSet, baseChangeSet, baseState);

		// Make sure the delta changeset does not contain any other operations than the inserts from the base state
		const arrayChangeSet =
			deltaChangeSet.getSerializedChangeSet().modify["array<test:namedEntry-1.0.0>"].array;

		expect(arrayChangeSet[baseOperation].length).to.equal(baseInsertPositions.length);
		for (let i = 0; i < baseInsertPositions.length; i++) {
			expect(arrayChangeSet[baseOperation][i][1].length).to.equal(baseCount);
		}
		expect(arrayChangeSet).to.not.have.property(
			baseOperation === "insert" ? "remove" : "insert",
		);
	}

	describe("Rebase test applying the reverse, base and then rebased changeset", () => {
		for (const basePositions of [[0], [1], [2], [5], [13], [0, 2], [0, 5], [0, 5, 13]]) {
			for (const rebasePositions of [[0], [1], [5, 9], [5, 9, 12]]) {
				it(`with base positions ${basePositions} and rebase positions ${rebasePositions}`, () => {
					runTestApplyingReverseAndRebasedChangesetForIndependentModifications(
						basePositions,
						rebasePositions,
					);
				});
			}
		}
	});

	describe("Rebase test applying the reverse, base and then rebased changeset2", () => {
		it(`with removes in the base`, () => {
			runTestApplyingReverseAndRebasedChangesetForIndependentModifications(
				[0],
				[2],
				"remove",
				2,
			);
		});
	});

	function testRebaseDistributivity(baseChangesets, rebaseChangeSet, base) {
		// First rebase with each CS independently
		const rebasedCS1 = cloneDeep(rebaseChangeSet);
		for (const baseChangeSet of baseChangesets) {
			const conflicts = [];
			new ChangeSet(baseChangeSet)._rebaseChangeSet(rebasedCS1, conflicts);
			validateChangeSet(rebasedCS1);
		}

		// Now rebase with respect to the squashed base ChangeSets
		const squashedBaseChangeSets = new ChangeSet();
		for (const baseChangeSet of baseChangesets) {
			squashedBaseChangeSets.applyChangeSet(baseChangeSet);
		}

		// Test whether squashed base changes are consistent
		const directApplication = new ChangeSet(cloneDeep(base));
		for (const baseChangeSet of baseChangesets) {
			directApplication.applyChangeSet(baseChangeSet);
		}
		const squashApplication = new ChangeSet(cloneDeep(base));
		squashApplication.applyChangeSet(squashedBaseChangeSets);
		expect(directApplication.getSerializedChangeSet()).to.deep.equal(
			squashApplication.getSerializedChangeSet(),
		);

		const conflicts2 = [];
		const rebasedCS2 = cloneDeep(rebaseChangeSet);
		new ChangeSet(squashedBaseChangeSets)._rebaseChangeSet(rebasedCS2, conflicts2);
		validateChangeSet(rebasedCS2);

		expect(rebasedCS1).to.deep.equal(rebasedCS2);

		return testRebasedApplies(cloneDeep(rebaseChangeSet), squashedBaseChangeSets, base);
	}

	describe("Rebase Distributivity", () => {
		describe("Multiple inserts in a remove range", () => {
			for (const insertPosition of [0, 1, 3, 5, 7, 12]) {
				it(`Position ${insertPosition}`, () => {
					testRebaseDistributivity(
						[
							createArrayCS({
								insert: [[1, generateNamedEntities(1)]],
							}),
							createArrayCS({
								insert: [[6, generateNamedEntities(1)]],
							}),
							createArrayCS({
								insert: [[9, generateNamedEntities(1)]],
							}),
							createArrayCS({
								remove: [
									[2, generateNamedEntities(4)],
									[7, generateNamedEntities(2)],
									[10, generateNamedEntities(2)],
								],
							}),
						],
						createArrayCS({
							insert: [[insertPosition, generateNamedEntities(1)]],
						}),
						createArrayCS({
							insert: [[0, generateNamedEntities(10)]],
						}),
					);
				});
			}
		});
		it("Rebasing an insert with respect to a remove + insert", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[0, generateNamedEntities(3)]],
					}),
					createArrayCS({
						insert: [[0, generateNamedEntities(3)]],
					}),
				],
				createArrayCS({
					insert: [[0, generateNamedEntities(3)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[0, generateNamedEntities(3)]],
					}),
					createArrayCS({
						insert: [[0, generateNamedEntities(3)]],
					}),
				],
				createArrayCS({
					insert: [[3, generateNamedEntities(3)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
		});
		it("remove + insert at start of array", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[0, generateNamedEntities(3)]],
					}),
					createArrayCS({
						insert: [[0, generateNamedEntities(3)]],
					}),
				],
				createArrayCS({
					insert: [[3, generateNamedEntities(1)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
		});
		it("Rebased remove that cancels out", () => {
			const deltacS = testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[0, generateNamedEntities(3)]],
					}),
					createArrayCS({
						insert: [[0, generateNamedEntities(3)]],
					}),
				],
				createArrayCS({
					remove: [[1, generateNamedEntities(2)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
			const arrayCS = getArrayCS(deltacS);
			expect(arrayCS.insert[0][1].length).to.equal(3);
			expect(arrayCS.remove[0][1].length).to.equal(1);
		});
		it("Insert in between two removes 1", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						insert: [[2, generateNamedEntities(1)]],
					}),
					createArrayCS({
						remove: [[0, generateNamedEntities(2)]],
					}),
					createArrayCS({
						remove: [[1, generateNamedEntities(1)]],
					}),
					createArrayCS({
						insert: [[0, generateNamedEntities(2)]],
					}),
				],
				createArrayCS({
					insert: [[1, generateNamedEntities(1)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
		});
		it("Insert in between two removes 2", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						insert: [[4, generateNamedEntities(1)]],
					}),
					createArrayCS({
						remove: [[2, generateNamedEntities(2)]],
					}),
					createArrayCS({
						remove: [[3, generateNamedEntities(1)]],
					}),
					createArrayCS({
						insert: [[2, generateNamedEntities(2)]],
					}),
				],
				createArrayCS({
					insert: [[3, generateNamedEntities(1)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
		});
		it("Inserts in between three removes", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						insert: [[4, generateNamedEntities(1)]],
					}),
					createArrayCS({
						insert: [[6, generateNamedEntities(1)]],
					}),
					createArrayCS({
						remove: [[2, generateNamedEntities(2)]],
					}),
					createArrayCS({
						remove: [[3, generateNamedEntities(1)]],
					}),
					createArrayCS({
						remove: [[4, generateNamedEntities(1)]],
					}),
					createArrayCS({
						insert: [[2, generateNamedEntities(2)]],
					}),
				],
				createArrayCS({
					insert: [[3, generateNamedEntities(1)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
		});
		it("Adjacent remove with insert at the beginning of the remove range", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[1, generateNamedEntities(1)]],
					}),
					createArrayCS({
						insert: [[1, generateNamedEntities(2)]],
					}),
				],
				createArrayCS({
					remove: [[1, generateNamedEntities(1, [3])]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(10)]],
				}),
			);
		});
		it("Remove operation that cancels out", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[8, generateNamedEntities(2)]],
					}),
					createArrayCS({
						insert: [[8, generateNamedEntities(1)]],
					}),
				],
				createArrayCS({
					remove: [[8, generateNamedEntities(1, [3])]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(14)]],
				}),
			);
		});
		it("Remove operation that cancels out 2", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[8, generateNamedEntities(3)]],
					}),
					createArrayCS({
						insert: [
							// [8, generateNamedEntities(1)],
							[8, generateNamedEntities(1)],
							[17, generateNamedEntities(1)],
						],
					}),
				],
				createArrayCS({
					remove: [[8, generateNamedEntities(1, [3])]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(14)]],
				}),
			);
		});
		it("Remove operation that cancels out in the middle of a range", () => {
			testRebaseDistributivity(
				[
					createArrayCS({
						remove: [[4, generateNamedEntities(1)]],
					}),
				],
				createArrayCS({
					remove: [[3, generateNamedEntities(3)]],
				}),
				createArrayCS({
					insert: [[0, generateNamedEntities(14)]],
				}),
			);
		});
	});

	function validateChangeSet(CS) {
		const arrayCS = getArrayCS(CS);

		const insertPositions = new Set<number>();
		if (arrayCS.insert) {
			arrayCS.insert.forEach((x) => insertPositions.add(x[0]));
		}
		for (const type of ["insert", "modify", "remove"]) {
			const changes = arrayCS[type];

			// Make sure the entries are sorted
			if (changes !== undefined) {
				let lastIndex = -5;
				let lastLength = 0;
				for (const entry of changes) {
					// Ranges should not be adjacent. However, they might be interrupted, if there is an insert
					// inside the range
					let indexOffset = 1;
					if (type === "remove" || type === "modify") {
						indexOffset = lastLength;
						if (!insertPositions.has(lastIndex + indexOffset)) {
							indexOffset += 1;
						}
					}
					assert(
						entry[0] >= lastIndex + indexOffset,
						"Changeset operations are not sorted or not merged",
					);
					lastIndex = entry[0];
					lastLength = !isNumber(entry[1]) ? entry[1].length : entry[1];

					// Inserts must not lie within modify or remove ranges
					if (type === "remove" || type === "modify") {
						insertPositions.forEach((i) =>
							assert(
								i <= lastIndex || i >= lastIndex + lastLength,
								`Insert within ${type} range.`,
							),
						);
					}
				}
			}
		}
	}

	function testApplyAssociativity(base, operations, customValidator?) {
		const combinedCS = new ChangeSet();
		operations.forEach(combinedCS.applyChangeSet.bind(combinedCS));
		validateChangeSet(combinedCS);

		// Individually apply the operations
		const separateApplysResult = new ChangeSet(cloneDeep(base));
		operations.forEach(separateApplysResult.applyChangeSet.bind(separateApplysResult));
		validateChangeSet(separateApplysResult);

		// And apply the combined CS
		const combinedApplyResult = new ChangeSet(cloneDeep(base));
		combinedApplyResult.applyChangeSet(combinedCS);

		if (customValidator !== undefined) {
			customValidator(combinedCS, separateApplysResult, combinedApplyResult);
		}

		expect(separateApplysResult.getSerializedChangeSet()).to.deep.equal(
			combinedApplyResult.getSerializedChangeSet(),
		);
	}

	describe("Apply Associativity", () => {
		it("insert + remove + insert", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(3)]],
				},
				"insert",
			);

			const ops = [
				createArrayCS({
					insert: [[2, generateNamedEntities(2)]],
				}),
				createArrayCS({
					remove: [[3, generateNamedEntities(2, [1, 3])]],
				}),
				createArrayCS({
					insert: [[2, generateNamedEntities(1)]],
				}),
			];

			testApplyAssociativity(initial, ops);
		});

		describe("Inserting into a remove range with deletes on both sides", () => {
			for (const additionalInserts of [
				"",
				" with insert at the beginning",
				" with insert at the end",
			]) {
				const offset = additionalInserts === " with insert at the beginning" ? 2 : 0;
				for (const i of range(1, 9)) {
					it(`at position ${i + offset}${additionalInserts}`, () => {
						const initial = createArrayCS(
							{
								insert: [[0, generateNamedEntities(10, undefined, "number")]],
							},
							"insert",
							"array<Float64>",
						);

						const initialInserts =
							additionalInserts === " with insert at the beginning"
								? [[0, generateNamedEntities(2, undefined, "number")]]
								: [];
						const finalInserts =
							additionalInserts === " with insert at the end"
								? [[10, generateNamedEntities(2, undefined, "number")]]
								: [];
						const ops = [
							createArrayCS(
								{
									insert: [
										...initialInserts,
										[2, generateNamedEntities(2, undefined, "number")],
										[7, generateNamedEntities(3, undefined, "number")],
										...finalInserts,
									],
									remove: [[2, generateNamedEntities(5, undefined, "number")]],
								},
								undefined,
								"array<Float64>",
							),
							createArrayCS(
								{
									insert: [
										[i + offset, generateNamedEntities(2, undefined, "number")],
									],
								},
								undefined,
								"array<Float64>",
							),
						];
						testApplyAssociativity(initial, ops, (combinedCS) => {
							const arrayCS = getArrayCS(combinedCS);
							expect(arrayCS.insert.length).to.equal(
								(i >= 2 && i < 8 ? 2 : 3) + (additionalInserts !== "" ? 1 : 0),
							);

							const insertOffset =
								additionalInserts == " with insert at the beginning" ? 1 : 0;
							if (i >= 2 && i <= 4) {
								expect(arrayCS.insert[0 + insertOffset][1].length).to.equal(4);
								expect(arrayCS.insert[1 + insertOffset][1].length).to.equal(3);
							}
							if (i > 4 && i < 8) {
								expect(arrayCS.insert[0 + insertOffset][1].length).to.equal(2);
								expect(arrayCS.insert[1 + insertOffset][1].length).to.equal(5);
							}
						});
					});
				}
			}
		});

		it("remove overlapping insert and remove ranges", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10, undefined, "number")]],
				},
				"insert",
				"array<Float64>",
			);

			const ops = [
				createArrayCS(
					{
						insert: [
							[0, generateNamedEntities(1, undefined, "number")],
							[1, generateNamedEntities(1, undefined, "number")],
							[4, generateNamedEntities(6, undefined, "number")],
						],
						remove: [
							[1, generateNamedEntities(1, undefined, "number")],
							[2, generateNamedEntities(2, undefined, "number")],
							[4, generateNamedEntities(5, undefined, "number")],
						],
					},
					undefined,
					"array<Float64>",
				),
				createArrayCS(
					{
						remove: [[0, generateNamedEntities(2, undefined, "number")]],
					},
					undefined,
					"array<Float64>",
				),
			];
			testApplyAssociativity(initial, ops);
		});

		it("Overlapping remove / insert", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10, undefined, "number")]],
				},
				"insert",
				"array<Float64>",
			);

			const ops = [
				createArrayCS(
					{
						insert: [
							[0, generateNamedEntities(2, undefined, "number")],
							[4, generateNamedEntities(2, undefined, "number")],
						],
						remove: [[4, generateNamedEntities(5, undefined, "number")]],
					},
					undefined,
					"array<Float64>",
				),
				createArrayCS(
					{
						remove: [[4, generateNamedEntities(2, undefined, "number")]],
					},
					undefined,
					"array<Float64>",
				),
			];
			testApplyAssociativity(initial, ops);
		});
		it("Removing multiple inserts and removes", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10, undefined, "number")]],
				},
				"insert",
				"array<Float64>",
			);

			const ops = [
				createArrayCS(
					{
						insert: [
							[1, generateNamedEntities(2, undefined, "number")],
							[4, generateNamedEntities(4, undefined, "number")],
						],
						remove: [
							[0, generateNamedEntities(1, undefined, "number")],
							[1, generateNamedEntities(3, undefined, "number")],
							[4, generateNamedEntities(5, undefined, "number")],
						],
					},
					undefined,
					"array<Float64>",
				),
				createArrayCS(
					{
						remove: [[0, generateNamedEntities(6, undefined, "number")]],
					},
					undefined,
					"array<Float64>",
				),
			];
			testApplyAssociativity(initial, ops);
		});
		it("Removing insert/removes at the end", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10, undefined, "number")]],
				},
				"insert",
				"array<Float64>",
			);

			const ops = [
				createArrayCS(
					{
						insert: [
							[0, generateNamedEntities(2, undefined, "number")],
							[1, generateNamedEntities(1, undefined, "number")],
							[4, generateNamedEntities(4, undefined, "number")],
						],
						remove: [
							[1, generateNamedEntities(3, undefined, "number")],
							[4, generateNamedEntities(5, undefined, "number")],
						],
					},
					undefined,
					"array<Float64>",
				),
				createArrayCS(
					{
						remove: [[6, generateNamedEntities(2, undefined, "number")]],
					},
					undefined,
					"array<Float64>",
				),
			];
			testApplyAssociativity(initial, ops);
		});
		it("Insert with overlapping remove", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10)]],
				},
				"insert",
			);

			const ops = [
				createArrayCS({
					insert: [[1, generateNamedEntities(3)]],
				}),
				createArrayCS({
					remove: [[1, generateNamedEntities(1)]],
					insert: [[1, generateNamedEntities(3)]],
				}),
			];
			testApplyAssociativity(initial, ops);
		});

		it("Failed case", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10)]],
				},
				"insert",
			);

			const ops = [
				createArrayCS({
					insert: [[0, generateNamedEntities(7)]],
				}),
				createArrayCS({
					remove: [[0, generateNamedEntities(1)]],
					insert: [[1, generateNamedEntities(2)]],
				}),
			];
			testApplyAssociativity(initial, ops);
		});

		it("Failed case", () => {
			const initial = createArrayCS(
				{
					insert: [[0, generateNamedEntities(10)]],
				},
				"insert",
			);

			const ops = [
				createArrayCS({
					insert: [[0, generateNamedEntities(5)]],
				}),
				createArrayCS({
					remove: [[4, generateNamedEntities(1)]],
					insert: [[5, generateNamedEntities(3)]],
				}),
			];
			testApplyAssociativity(initial, ops);
		});
	});

	describe("Apply with removes in both changesets", () => {
		for (const startInsertA of [true, false]) {
			for (const startInsertB of [true, false]) {
				for (const removeInsertA of [true, false]) {
					for (const removeInsertB of [true, false]) {
						for (const removeInsideInsertB of ["adjacent", "separate", false]) {
							const insertNames: string[] = [];
							if (startInsertA) {
								insertNames.push("at start of A");
							}
							if (startInsertB) {
								insertNames.push("at start of B");
							}
							if (removeInsertA) {
								insertNames.push("before remove in A");
							}
							if (removeInsertB) {
								insertNames.push("before remove in B");
							}
							if (removeInsideInsertB) {
								insertNames.push(
									`inside remove range in B (${removeInsideInsertB})`,
								);
							}
							let title = "with ";
							title +=
								insertNames.length === 0
									? "no inserts"
									: `inserts ${insertNames.join(", ")}`;
							it(title, () => {
								const insertsA: [
									number,
									ReturnType<typeof generateNamedEntities>,
								][] = [];
								const insertsB: [
									number,
									ReturnType<typeof generateNamedEntities>,
								][] = [];
								let offset = 0;
								if (startInsertA) {
									insertsA.push([0, generateNamedEntities(1)]);
									offset += 1;
								}
								if (removeInsertA) {
									insertsA.push([5, generateNamedEntities(1)]);
									offset += 1;
								}

								let removesB = [[5 + offset, generateNamedEntities(3)]];
								if (startInsertB) {
									insertsB.push([0, generateNamedEntities(1)]);
								}
								if (removeInsertB) {
									insertsB.push([5 + offset, generateNamedEntities(1)]);
								}
								if (removeInsideInsertB) {
									const removeOffset = removeInsideInsertB === "separate" ? 1 : 0;

									insertsB.push([
										6 + offset + removeOffset,
										generateNamedEntities(1),
									]);
									removesB = [
										[5 + offset + removeOffset, generateNamedEntities(1)],
										[6 + offset + removeOffset, generateNamedEntities(1)],
									];
								}
								const CS1 = createArrayCS({
									insert: insertsA,
									remove: [[5, generateNamedEntities(3)]],
								});
								const CS2 = createArrayCS({
									insert: insertsB,
									remove: removesB,
								});

								const CS = new ChangeSet(CS1);
								CS.applyChangeSet(CS2);
								validateChangeSet(CS.getSerializedChangeSet());
							});
						}
					}
				}
			}
		}
	});
});
