/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { FieldKey, TreeNodeSchemaIdentifier } from "../core/index.js";
import {
	FieldKinds,
	FlexAllowedTypes,
	FlexObjectNodeSchema,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeObjectNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	LocalNodeKey,
	isFlexTreeNode,
} from "../feature-libraries/index.js";
import {
	InsertableContent,
	getProxyForField,
	markContentType,
	prepareContentForInsert,
} from "./proxies.js";
import { getFlexNode, setFlexNode } from "./proxyBinding.js";
import {
	NodeKind,
	ImplicitFieldSchema,
	TreeNodeSchemaClass,
	WithType,
	TreeNodeSchema,
	getStoredKey,
	getExplicitStoredKey,
	TreeFieldFromImplicitField,
	InsertableTreeFieldFromImplicitField,
	FieldSchema,
	normalizeFieldSchema,
} from "./schemaTypes.js";
import { cursorFromNodeData } from "./toMapTree.js";
import { TreeNode } from "./types.js";
import { RestrictiveReadonlyRecord, fail } from "../util/index.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { RawTreeNode, rawError } from "./rawNode.js";

/**
 * Helper used to produce types for object nodes.
 * @public
 */
export type ObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
};

/**
 * A {@link TreeNode} which modules a JavaScript object.
 * @remarks
 * Object nodes consist of a type which specifies which {@link TreeNodeSchema} they use (see {@link TreeNodeApi.schema}), and a collections of fields, each with a distinct `key` and its own {@link FieldSchema} defining what can be placed under that key.
 *
 * All fields on an object node are exposed as own properties with string keys.
 * Non-empty fields are enumerable and empty optional fields are non-enumerable own properties with the value `undefined`.
 * No other own `own` or `enumerable` properties are included on object nodes unless the user of the node manually adds custom session only state.
 * This allows a majority of general purpose JavaScript object processing operations (like `for...in`, `Reflect.ownKeys()` and `Object.entries()`) to enumerate all the children.
 * @public
 */
export type TreeObjectNode<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecord<T> & WithType<TypeName>;

/**
 * Helper used to produce types for:
 *
 * 1. Insertable content which can be used to construct an object node.
 *
 * 2. Insertable content which is an unhydrated object node.
 *
 * 3. Union of 1 and 2.
 *
 * @privateRemarks TODO: consider separating these cases into different types.
 *
 * @public
 */
export type InsertableObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitField<T[Property]>;
};

/**
 * Maps from simple field keys ("view" keys) to information about the field.
 *
 * @remarks
 * A missing entry for a given view key indicates that no such field exists.
 * Keys with symbols are currently never used, but allowed to make lookups on non-field things
 * (returning undefined) easier.
 */
type SimpleKeyMap = Map<string | symbol, { storedKey: FieldKey; schema: FieldSchema }>;

/**
 * Caches the mappings from view keys to stored keys for the provided object field schemas in {@link simpleKeyToFlexKeyCache}.
 */
function createFlexKeyMapping(fields: Record<string, ImplicitFieldSchema>): SimpleKeyMap {
	const keyMap: SimpleKeyMap = new Map();
	for (const [viewKey, fieldSchema] of Object.entries(fields)) {
		const storedKey = getStoredKey(viewKey, fieldSchema);
		keyMap.set(viewKey, { storedKey, schema: normalizeFieldSchema(fieldSchema) });
	}

	return keyMap;
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * TODO: consider implementing this using `Object.preventExtension` instead.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 */
function createProxyHandler(
	flexKeyMap: SimpleKeyMap,
	allowAdditionalProperties: boolean,
): ProxyHandler<TreeNode> {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const handler: ProxyHandler<TreeNode> = {
		get(target, viewKey, proxy): unknown {
			const fieldInfo = flexKeyMap.get(viewKey);

			if (fieldInfo !== undefined) {
				const field = getFlexNode(proxy).tryGetField(fieldInfo.storedKey);
				return field === undefined ? undefined : getProxyForField(field);
			}

			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(target, viewKey, proxy);
		},
		set(target, viewKey, value: InsertableContent, proxy) {
			const fieldInfo = flexKeyMap.get(viewKey);
			if (fieldInfo === undefined) {
				return allowAdditionalProperties ? Reflect.set(target, viewKey, value) : false;
			}

			const flexNode = getFlexNode(proxy);
			const field = flexNode.getBoxed(fieldInfo.storedKey);
			setField(field, fieldInfo.schema, value);

			return true;
		},
		has: (target, viewKey) => {
			return (
				flexKeyMap.has(viewKey) ||
				(allowAdditionalProperties ? Reflect.has(target, viewKey) : false)
			);
		},
		ownKeys: (target) => {
			return [
				...flexKeyMap.keys(),
				...(allowAdditionalProperties ? Reflect.ownKeys(target) : []),
			];
		},
		getOwnPropertyDescriptor: (target, viewKey) => {
			const fieldInfo = flexKeyMap.get(viewKey);

			if (fieldInfo === undefined) {
				return allowAdditionalProperties
					? Reflect.getOwnPropertyDescriptor(target, viewKey)
					: undefined;
			}

			// For some reason, the getOwnPropertyDescriptor is not passed in the receiver, so use a weak map.
			// If a refactoring is done to associated flex tree data with the target not the proxy, this extra map could be removed,
			// and the design would be more compatible with proxyless nodes.
			const proxy = targetToProxy.get(target) ?? fail("missing proxy");
			const field = getFlexNode(proxy).tryGetField(fieldInfo.storedKey);

			const p: PropertyDescriptor = {
				value: field === undefined ? undefined : getProxyForField(field),
				writable: true,
				// Report empty fields as own properties so they shadow inherited properties (even when empty) to match TypeScript typing.
				// Make empty fields not enumerable so they get skipped when iterating over an object to better align with
				// JSON and deep equals with JSON compatible object (which can't have undefined fields).
				enumerable: field !== undefined,
				configurable: true, // Must be 'configurable' if property is absent from proxy target.
			};

			return p;
		},
	};
	return handler;
}

export function setField(
	field: FlexTreeField,
	simpleFieldSchema: FieldSchema,
	value: InsertableContent,
): void {
	switch (field.schema.kind) {
		case FieldKinds.required:
		case FieldKinds.optional: {
			const typedField = field as
				| FlexTreeRequiredField<FlexAllowedTypes>
				| FlexTreeOptionalField<FlexAllowedTypes>;

			const content = prepareContentForInsert(value, field.context.forest);
			const cursor = cursorFromNodeData(content, simpleFieldSchema.allowedTypes);
			typedField.content = cursor;
			break;
		}

		default:
			fail("invalid FieldKind");
	}
}

type ObjectNodeSchema<
	TName extends string = string,
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema> = RestrictiveReadonlyRecord<
		string,
		ImplicitFieldSchema
	>,
	ImplicitlyConstructable extends boolean = boolean,
> = TreeNodeSchemaClass<
	TName,
	NodeKind.Object,
	TreeNode & WithType<TName>,
	InsertableObjectFromSchemaRecord<T>,
	ImplicitlyConstructable,
	T
>;

/**
 * Define a {@link TreeNodeSchema} for a {@link TreeObjectNode}.
 *
 * @param name - Unique identifier for this schema within this factory's scope.
 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
 */
export function objectSchema<
	TName extends string,
	const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	const ImplicitlyConstructable extends boolean,
>(base: ObjectNodeSchema<TName, T, ImplicitlyConstructable>) {
	// Ensure no collisions between final set of view keys, and final set of stored keys (including those
	// implicitly derived from view keys)
	assertUniqueKeys(base.identifier, base.info);

	// Performance optimization: cache view key => stored key and schema.
	const flexKeyMap: SimpleKeyMap = createFlexKeyMapping(base.info);

	// Used to ensure we only use one most derived schema type.
	// The type "Function" is used by "Object.constructor" and this matches it.
	// eslint-disable-next-line @typescript-eslint/ban-types
	let constructorCached: Function;

	let handler: ProxyHandler<object>;
	let customizable: boolean;

	class CustomObjectNode extends base {
		public constructor(input: InsertableObjectFromSchemaRecord<T>) {
			super(input);

			// Differentiate between the following cases:
			//
			// Case 1: Direct construction (POJO emulation)
			//
			//     const Foo = schemaFactory.object("Foo", {bar: schemaFactory.number});
			//
			//     assert.deepEqual(new Foo({ bar: 42 }), { bar: 42 },
			//		   "Prototype chain equivalent to POJO.");
			//
			// Case 2: Subclass construction (Customizable Object)
			//
			// 	   class Foo extends schemaFactory.object("Foo", {bar: schemaFactory.number}) {}
			//
			// 	   assert.notDeepEqual(new Foo({ bar: 42 }), { bar: 42 },
			// 	       "Subclass prototype chain differs from POJO.");
			//
			// In Case 1 (POJO emulation), the prototype chain match '{}' (proxyTarget = undefined)
			// In Case 2 (Customizable Object), the prototype chain include the user's subclass (proxyTarget = this)

			if (constructorCached === undefined) {
				// One time initialization that required knowing the most derived type (from this.constructor) and thus has to be lazy.
				constructorCached = this.constructor;
				customizable = this.constructor !== CustomObjectNode;
				handler ??= createProxyHandler(flexKeyMap, customizable);

				// First run, do extra validation.
				// TODO: provide a way for TreeConfiguration to trigger this same validation to ensure it gets run early.
				// Scan for shadowing inherited members which won't work, but stop scan early to allow shadowing built in (which seems to work ok).
				{
					let prototype: object = this.constructor.prototype;
					// There isn't a clear cleaner way to author this loop.
					while (prototype !== CustomObjectNode.prototype) {
						for (const [key] of flexKeyMap) {
							if (
								// constructor is a special case, since one is built in on the derived type, and shadowing it works fine since we only use it before fields are applied.
								key !== "constructor" &&
								Reflect.getOwnPropertyDescriptor(prototype, key) !== undefined
							) {
								throw new UsageError(
									`Schema ${
										base.identifier
									} defines an inherited property ${key.toString()} which shadows a field. Since fields are exposed as own properties, this shadowing will not work, and is an error.`,
								);
							}
						}
						// Since this stops at CustomObjectNode, it should never see a null prototype, so this case is safe.
						// Additionally, if the prototype chain is ever messed up such that CustomObjectNode is not in it,
						// the null that would show up here does at least ensure this code throws instead of hanging.
						prototype = Reflect.getPrototypeOf(prototype) as object;
					}
				}
			}

			assert(
				constructorCached === this.constructor,
				"Node instantiated from multiple bases.",
			);

			const proxyTarget = customizable ? this : {};

			const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
			assert(flexSchema instanceof FlexObjectNodeSchema, "invalid flex schema");
			const flexNode: FlexTreeNode = isFlexTreeNode(input)
				? input
				: new RawObjectNode(flexSchema, copyContent(flexSchema.name, input) as object);

			const proxy = new Proxy(proxyTarget, handler) as CustomObjectNode;
			targetToProxy.set(proxyTarget, proxy);
			setFlexNode(proxy, flexNode);
			return proxy;
		}
	}

	return CustomObjectNode as TreeNodeSchemaClass<
		TName,
		NodeKind.Object,
		TreeObjectNode<T, TName>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T
	>;
}

const targetToProxy: WeakMap<object, TreeNode> = new WeakMap();

/**
 * The implementation of an object node created by {@link createRawNode}.
 */
export class RawObjectNode<TSchema extends FlexObjectNodeSchema, TContent extends object>
	extends RawTreeNode<TSchema, TContent>
	implements FlexTreeObjectNode
{
	public get localNodeKey(): LocalNodeKey | undefined {
		throw rawError("Reading local node keys");
	}
}

/**
 * Ensures that the set of view keys in the schema is unique.
 * Also ensure that the final set of stored keys (including those implicitly derived from view keys) is unique.
 * @throws Throws a `UsageError` if either of the key uniqueness invariants is violated.
 */
function assertUniqueKeys<
	const Name extends number | string,
	const Fields extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
>(schemaName: Name, fields: Fields): void {
	// Verify that there are no duplicates among the explicitly specified stored keys.
	const explicitStoredKeys = new Set<string>();
	for (const schema of Object.values(fields)) {
		const storedKey = getExplicitStoredKey(schema);
		if (storedKey === undefined) {
			continue;
		}
		if (explicitStoredKeys.has(storedKey)) {
			throw new UsageError(
				`Duplicate stored key "${storedKey}" in schema "${schemaName}". Stored keys must be unique within an object schema.`,
			);
		}
		explicitStoredKeys.add(storedKey);
	}

	// Verify that there are no duplicates among the derived
	// (including those implicitly derived from view keys) stored keys.
	const derivedStoredKeys = new Set<string>();
	for (const [viewKey, schema] of Object.entries(fields)) {
		const storedKey = getStoredKey(viewKey, schema);
		if (derivedStoredKeys.has(storedKey)) {
			throw new UsageError(
				`Stored key "${storedKey}" in schema "${schemaName}" conflicts with a property key of the same name, which is not overridden by a stored key. The final set of stored keys in an object schema must be unique.`,
			);
		}
		derivedStoredKeys.add(storedKey);
	}
}

function copyContent<T extends object>(typeName: TreeNodeSchemaIdentifier, content: T): T {
	const copy = { ...content };
	markContentType(typeName, copy);
	return copy;
}
