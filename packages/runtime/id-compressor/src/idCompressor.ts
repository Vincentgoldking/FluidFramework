/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import {
	IdCreationRange,
	IIdCompressor,
	IIdCompressorCore,
	OpSpaceCompressedId,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "./types/index.js";
import { FinalCompressedId, isFinalId, LocalCompressedId, NumericUuid } from "./identifiers.js";
import {
	createSessionId,
	localIdFromGenCount,
	genCountFromLocalId,
	numericUuidFromStableId,
	offsetNumericUuid,
	stableIdFromNumericUuid,
	subtractNumericUuids,
} from "./utilities.js";
import {
	Index,
	readBoolean,
	readNumber,
	readNumericUuid,
	writeBoolean,
	writeNumber,
	writeNumericUuid,
} from "./persistanceUtilities.js";
import {
	getAlignedLocal,
	getAlignedFinal,
	IdCluster,
	lastFinalizedLocal,
	Session,
	Sessions,
	lastFinalizedFinal,
} from "./sessions.js";
import { SessionSpaceNormalizer } from "./sessionSpaceNormalizer.js";
import { FinalSpace } from "./finalSpace.js";

/**
 * The version of IdCompressor that is currently persisted.
 * This should not be changed without careful consideration to compatibility.
 */
const currentWrittenVersion = 2.0;

/**
 * See {@link IIdCompressor} and {@link IIdCompressorCore}
 */
export class IdCompressor implements IIdCompressor, IIdCompressorCore {
	/**
	 * Max allowed initial cluster size.
	 */
	public static readonly maxClusterSize = 2 ** 20;

	// #region Local state

	public readonly localSessionId: SessionId;
	private readonly localSession: Session;
	private readonly normalizer = new SessionSpaceNormalizer();
	// The number of IDs generated by the local session
	private localGenCount = 0;

	// #endregion

	// #region Final state

	// The gen count to be annotated on the range returned by the next call to `takeNextCreationRange`.
	// This is updated to be equal to `generatedIdCount` + 1 each time it is called.
	private nextRangeBaseGenCount = 1;
	private readonly sessions = new Sessions();
	private readonly finalSpace = new FinalSpace();

	// #endregion

	// #region Ephemeral state

	/**
	 * Roughly equates to a minimum of 1M sessions before we start allocating 64 bit IDs.
	 * Eventually, this can be adjusted dynamically to have cluster reservation policies that
	 * optimize the number of eager finals.
	 * It is not readonly as it is accessed by tests for clear-box testing.
	 */
	// eslint-disable-next-line @typescript-eslint/prefer-readonly
	private nextRequestedClusterSize: number = 512;
	// The number of local IDs generated since the last telemetry was sent.
	private telemetryLocalIdCount = 0;
	// The number of eager final IDs generated since the last telemetry was sent.
	private telemetryEagerFinalIdCount = 0;
	// The ongoing ghost session, if one exists.
	private ongoingGhostSession?: { cluster?: IdCluster; ghostSessionId: SessionId };

	// #endregion

	public constructor(
		localSessionIdOrDeserialized: SessionId | Sessions,
		private readonly logger?: ITelemetryLoggerExt,
	) {
		if (typeof localSessionIdOrDeserialized === "string") {
			this.localSessionId = localSessionIdOrDeserialized;
			this.localSession = this.sessions.getOrCreate(localSessionIdOrDeserialized);
		} else {
			// Deserialize case
			this.sessions = localSessionIdOrDeserialized;
			// As policy, the first session is always the local session. Preserve this invariant
			// during deserialization.
			const firstSession = localSessionIdOrDeserialized.sessions().next();
			assert(!firstSession.done, 0x754 /* First session must be present. */);
			this.localSession = firstSession.value;
			this.localSessionId = stableIdFromNumericUuid(
				this.localSession.sessionUuid,
			) as SessionId;
		}
	}

	public generateCompressedId(): SessionSpaceCompressedId {
		// This ghost session code inside this block should not be changed without a version bump (it is performed at a consensus point)
		if (this.ongoingGhostSession) {
			if (this.ongoingGhostSession.cluster === undefined) {
				this.ongoingGhostSession.cluster = this.addEmptyCluster(
					this.sessions.getOrCreate(this.ongoingGhostSession.ghostSessionId),
					1,
				);
			} else {
				this.ongoingGhostSession.cluster.capacity++;
			}
			this.ongoingGhostSession.cluster.count++;
			return lastFinalizedFinal(
				this.ongoingGhostSession.cluster,
			) as unknown as SessionSpaceCompressedId;
		} else {
			this.localGenCount++;
			const lastCluster = this.localSession.getLastCluster();
			if (lastCluster === undefined) {
				this.telemetryLocalIdCount++;
				return this.generateNextLocalId();
			}

			// If there exists a cluster of final IDs already claimed by the local session that still has room in it,
			// it is known prior to range sequencing what a local ID's corresponding final ID will be.
			// In this case, it is safe to return the final ID immediately. This is guaranteed to be safe because
			// any op that the local session sends that contains one of those final IDs are guaranteed to arrive to
			// collaborators *after* the one containing the creation range.
			const clusterOffset = this.localGenCount - genCountFromLocalId(lastCluster.baseLocalId);
			if (lastCluster.capacity > clusterOffset) {
				this.telemetryEagerFinalIdCount++;
				// Space in the cluster: eager final
				return ((lastCluster.baseFinalId as number) +
					clusterOffset) as SessionSpaceCompressedId;
			}
			// No space in the cluster, return next local
			this.telemetryLocalIdCount++;
			return this.generateNextLocalId();
		}
	}

	public generateDocumentUniqueId(): (SessionSpaceCompressedId & OpSpaceCompressedId) | StableId {
		const id = this.generateCompressedId();
		return isFinalId(id) ? id : this.decompress(id);
	}

	/**
	 * Starts a ghost session. Only exposed for test purposes (this class is not exported from the package).
	 * @param ghostSessionId - The session ID to start the ghost session with.
	 */
	public startGhostSession(ghostSessionId: SessionId): void {
		assert(!this.ongoingGhostSession, "Ghost session already in progress.");
		this.ongoingGhostSession = { ghostSessionId };
	}

	/**
	 * {@inheritdoc IIdCompressorCore.beginGhostSession}
	 */
	public beginGhostSession(ghostSessionId: SessionId, ghostSessionCallback: () => void) {
		this.startGhostSession(ghostSessionId);
		try {
			ghostSessionCallback();
		} finally {
			this.ongoingGhostSession = undefined;
		}
	}

	private generateNextLocalId(): LocalCompressedId {
		// Must tell the normalizer that we generated a local ID
		this.normalizer.addLocalRange(this.localGenCount, 1);
		return localIdFromGenCount(this.localGenCount);
	}

	public takeNextCreationRange(): IdCreationRange {
		assert(
			!this.ongoingGhostSession,
			0x8a6 /* IdCompressor should not be operated normally when in a ghost session */,
		);
		const count = this.localGenCount - (this.nextRangeBaseGenCount - 1);
		if (count === 0) {
			return {
				sessionId: this.localSessionId,
			};
		}
		const range: IdCreationRange = {
			sessionId: this.localSessionId,
			ids: {
				firstGenCount: this.nextRangeBaseGenCount,
				count,
				requestedClusterSize: this.nextRequestedClusterSize,
			},
		};
		this.nextRangeBaseGenCount = this.localGenCount + 1;
		IdCompressor.assertValidRange(range);
		return range;
	}

	private static assertValidRange(range: IdCreationRange): void {
		if (range.ids === undefined) {
			return;
		}
		const { count, requestedClusterSize } = range.ids;
		assert(count > 0, 0x755 /* Malformed ID Range. */);
		assert(requestedClusterSize > 0, 0x876 /* Clusters must have a positive capacity. */);
		assert(
			requestedClusterSize <= IdCompressor.maxClusterSize,
			0x877 /* Clusters must not exceed max cluster size. */,
		);
	}

	public finalizeCreationRange(range: IdCreationRange): void {
		assert(
			!this.ongoingGhostSession,
			0x8a7 /* IdCompressor should not be operated normally when in a ghost session */,
		);
		// Check if the range has IDs
		if (range.ids === undefined) {
			return;
		}

		IdCompressor.assertValidRange(range);
		const { sessionId, ids } = range;
		const { count, firstGenCount, requestedClusterSize } = ids;
		const session = this.sessions.getOrCreate(sessionId);
		const isLocal = session === this.localSession;
		const rangeBaseLocal = localIdFromGenCount(firstGenCount);
		let lastCluster = session.getLastCluster();
		if (lastCluster === undefined) {
			// This is the first cluster in the session space
			if (rangeBaseLocal !== -1) {
				throw new Error("Ranges finalized out of order.");
			}
			lastCluster = this.addEmptyCluster(session, requestedClusterSize + count);
			if (isLocal) {
				this.logger?.sendTelemetryEvent({
					eventName: "RuntimeIdCompressor:FirstCluster",
					sessionId: this.localSessionId,
				});
			}
		}

		const remainingCapacity = lastCluster.capacity - lastCluster.count;
		if (lastCluster.baseLocalId - lastCluster.count !== rangeBaseLocal) {
			throw new Error("Ranges finalized out of order.");
		}

		if (remainingCapacity >= count) {
			// The current range fits in the existing cluster
			lastCluster.count += count;
		} else {
			const overflow = count - remainingCapacity;
			const newClaimedFinalCount = overflow + requestedClusterSize;
			if (lastCluster === this.finalSpace.getLastCluster()) {
				// The last cluster in the sessions chain is the last cluster globally, so it can be expanded.
				lastCluster.capacity += newClaimedFinalCount;
				lastCluster.count += count;
				assert(
					!this.sessions.clusterCollides(lastCluster),
					0x756 /* Cluster collision detected. */,
				);
				if (isLocal) {
					this.logger?.sendTelemetryEvent({
						eventName: "RuntimeIdCompressor:ClusterExpansion",
						sessionId: this.localSessionId,
						previousCapacity: lastCluster.capacity - newClaimedFinalCount,
						newCapacity: lastCluster.capacity,
						overflow,
					});
				}
			} else {
				// The last cluster in the sessions chain is *not* the last cluster globally. Fill and overflow to new.
				lastCluster.count = lastCluster.capacity;
				const newCluster = this.addEmptyCluster(session, newClaimedFinalCount);
				newCluster.count += overflow;
				if (isLocal) {
					this.logger?.sendTelemetryEvent({
						eventName: "RuntimeIdCompressor:NewCluster",
						sessionId: this.localSessionId,
					});
				}
			}
		}

		if (isLocal) {
			this.logger?.sendTelemetryEvent({
				eventName: "RuntimeIdCompressor:IdCompressorStatus",
				eagerFinalIdCount: this.telemetryEagerFinalIdCount,
				localIdCount: this.telemetryLocalIdCount,
				sessionId: this.localSessionId,
			});
			this.telemetryEagerFinalIdCount = 0;
			this.telemetryLocalIdCount = 0;
		}

		assert(!session.isEmpty(), 0x757 /* Empty sessions should not be created. */);
	}

	private addEmptyCluster(session: Session, capacity: number): IdCluster {
		assert(
			!this.ongoingGhostSession?.cluster,
			0x8a8 /* IdCompressor should not be operated normally when in a ghost session */,
		);
		const newCluster = session.addNewCluster(
			this.finalSpace.getAllocatedIdLimit(),
			capacity,
			0,
		);
		assert(!this.sessions.clusterCollides(newCluster), 0x758 /* Cluster collision detected. */);
		this.finalSpace.addCluster(newCluster);
		return newCluster;
	}

	public normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId {
		if (isFinalId(id)) {
			return id;
		} else {
			const local = id as unknown as LocalCompressedId;
			if (!this.normalizer.contains(local)) {
				throw new Error("Invalid ID to normalize.");
			}
			const finalForm = this.localSession.tryConvertToFinal(local, true);
			return finalForm === undefined
				? (local as unknown as OpSpaceCompressedId)
				: (finalForm as OpSpaceCompressedId);
		}
	}

	public normalizeToSessionSpace(
		id: OpSpaceCompressedId,
		originSessionId: SessionId,
	): SessionSpaceCompressedId {
		if (isFinalId(id)) {
			const containingCluster = this.localSession.getClusterByAllocatedFinal(id);
			if (containingCluster === undefined) {
				// Does not exist in local cluster chain
				if (id >= this.finalSpace.getFinalizedIdLimit()) {
					throw new Error("Unknown op space ID.");
				}
				return id as unknown as SessionSpaceCompressedId;
			} else {
				const alignedLocal = getAlignedLocal(containingCluster, id);
				if (this.normalizer.contains(alignedLocal)) {
					return alignedLocal;
				} else {
					if (genCountFromLocalId(alignedLocal) > this.localGenCount) {
						throw new Error("Unknown op space ID.");
					}
					return id as unknown as SessionSpaceCompressedId;
				}
			}
		} else {
			const localToNormalize = id as unknown as LocalCompressedId;
			if (originSessionId === this.localSessionId) {
				if (this.normalizer.contains(localToNormalize)) {
					return localToNormalize;
				} else {
					// We never generated this local ID, so fail
					throw new Error("Unknown op space ID.");
				}
			} else {
				// LocalId from a remote session
				const remoteSession = this.sessions.get(originSessionId);
				if (remoteSession === undefined) {
					throw new Error("No IDs have ever been finalized by the supplied session.");
				}
				const correspondingFinal = remoteSession.tryConvertToFinal(localToNormalize, false);
				if (correspondingFinal === undefined) {
					throw new Error("Unknown op space ID.");
				}
				return correspondingFinal as unknown as SessionSpaceCompressedId;
			}
		}
	}

	public decompress(id: SessionSpaceCompressedId): StableId {
		if (isFinalId(id)) {
			const containingCluster = Session.getContainingCluster(id, this.finalSpace.clusters);
			if (containingCluster === undefined) {
				throw new Error("Unknown ID");
			}
			const alignedLocal = getAlignedLocal(containingCluster, id);
			const alignedGenCount = genCountFromLocalId(alignedLocal);
			const lastFinalizedGenCount = genCountFromLocalId(
				lastFinalizedLocal(containingCluster),
			);
			if (alignedGenCount > lastFinalizedGenCount) {
				// should be an eager final id generated by the local session
				if (containingCluster.session === this.localSession) {
					assert(
						!this.normalizer.contains(alignedLocal),
						0x759 /* Normalizer out of sync. */,
					);
				} else {
					throw new Error("Unknown ID");
				}
			}

			return stableIdFromNumericUuid(
				offsetNumericUuid(containingCluster.session.sessionUuid, alignedGenCount - 1),
			);
		} else {
			const localToDecompress = id as unknown as LocalCompressedId;
			if (!this.normalizer.contains(localToDecompress)) {
				throw new Error("Unknown ID");
			}
			return stableIdFromNumericUuid(
				offsetNumericUuid(
					this.localSession.sessionUuid,
					genCountFromLocalId(localToDecompress) - 1,
				),
			);
		}
	}

	public recompress(uncompressed: StableId): SessionSpaceCompressedId {
		const recompressed = this.tryRecompress(uncompressed);
		if (recompressed === undefined) {
			throw new Error("Could not recompress.");
		}
		return recompressed;
	}

	public tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined {
		const match = this.sessions.getContainingCluster(uncompressed);
		if (match === undefined) {
			const numericUncompressed = numericUuidFromStableId(uncompressed);
			const offset = subtractNumericUuids(numericUncompressed, this.localSession.sessionUuid);
			if (offset < Number.MAX_SAFE_INTEGER) {
				const genCountEquivalent = Number(offset) + 1;
				const localEquivalent = localIdFromGenCount(genCountEquivalent);
				if (this.normalizer.contains(localEquivalent)) {
					return localEquivalent;
				}
			}
			return undefined;
		} else {
			const [containingCluster, alignedLocal] = match;
			if (containingCluster.session === this.localSession) {
				// Local session
				if (this.normalizer.contains(alignedLocal)) {
					return alignedLocal;
				} else {
					assert(
						genCountFromLocalId(alignedLocal) <= this.localGenCount,
						0x75a /* Clusters out of sync. */,
					);
					// Id is an eager final
					return getAlignedFinal(containingCluster, alignedLocal) as
						| SessionSpaceCompressedId
						| undefined;
				}
			} else {
				// Not the local session
				return genCountFromLocalId(alignedLocal) >= lastFinalizedLocal(containingCluster)
					? (getAlignedFinal(containingCluster, alignedLocal) as
							| SessionSpaceCompressedId
							| undefined)
					: undefined;
			}
		}
	}

	public serialize(withSession: true): SerializedIdCompressorWithOngoingSession;
	public serialize(withSession: false): SerializedIdCompressorWithNoSession;
	public serialize(hasLocalState: boolean): SerializedIdCompressor {
		assert(
			!this.ongoingGhostSession,
			0x8a9 /* IdCompressor should not be operated normally when in a ghost session */,
		);
		const { normalizer, finalSpace, sessions } = this;
		const sessionIndexMap = new Map<Session, number>();
		let sessionIndex = 0;
		for (const session of sessions.sessions()) {
			// Filter empty sessions to prevent them accumulating in the serialized state
			if (!session.isEmpty() || hasLocalState) {
				sessionIndexMap.set(session, sessionIndex);
				sessionIndex++;
			}
		}
		const localStateSize = hasLocalState
			? 1 + // generated ID count
			  1 + // next range base genCount
			  1 + // count of normalizer pairs
			  this.normalizer.idRanges.size * 2 // pairs
			: 0;
		// Layout size, in 8 byte increments
		const totalSize =
			1 + // version
			1 + // hasLocalState
			1 + // session count
			1 + // cluster count
			sessionIndexMap.size * 2 + // session IDs
			finalSpace.clusters.length * 3 + // clusters: (sessionIndex, capacity, count)[]
			localStateSize; // local state, if present

		const serializedFloat = new Float64Array(totalSize);
		const serializedUint = new BigUint64Array(serializedFloat.buffer);
		let index = 0;
		index = writeNumber(serializedFloat, index, currentWrittenVersion);
		index = writeBoolean(serializedFloat, index, hasLocalState);
		index = writeNumber(serializedFloat, index, sessionIndexMap.size);
		index = writeNumber(serializedFloat, index, finalSpace.clusters.length);

		for (const [session] of sessionIndexMap.entries()) {
			index = writeNumericUuid(serializedUint, index, session.sessionUuid);
		}

		finalSpace.clusters.forEach((cluster) => {
			index = writeNumber(
				serializedFloat,
				index,
				sessionIndexMap.get(cluster.session) as number,
			);
			index = writeNumber(serializedFloat, index, cluster.capacity);
			index = writeNumber(serializedFloat, index, cluster.count);
		});

		if (hasLocalState) {
			index = writeNumber(serializedFloat, index, this.localGenCount);
			index = writeNumber(serializedFloat, index, this.nextRangeBaseGenCount);
			index = writeNumber(serializedFloat, index, normalizer.idRanges.size);
			for (const [leadingGenCount, count] of normalizer.idRanges.entries()) {
				index = writeNumber(serializedFloat, index, leadingGenCount);
				index = writeNumber(serializedFloat, index, count);
			}
		}

		assert(index === totalSize, 0x75b /* Serialized size was incorrectly calculated. */);
		this.logger?.sendTelemetryEvent({
			eventName: "RuntimeIdCompressor:SerializedIdCompressorSize",
			size: serializedFloat.byteLength,
			clusterCount: finalSpace.clusters.length,
			sessionCount: sessionIndexMap.size,
		});

		return bufferToString(serializedFloat.buffer, "base64") as SerializedIdCompressor;
	}

	public static deserialize(
		serialized: SerializedIdCompressorWithOngoingSession,
		logger?: ITelemetryLoggerExt,
	): IdCompressor;
	public static deserialize(
		serialized: SerializedIdCompressorWithNoSession,
		newSessionId: SessionId,
		logger?: ITelemetryLoggerExt,
	): IdCompressor;
	public static deserialize(
		serialized: SerializedIdCompressor,
		loggerOrSessionId?: ITelemetryLoggerExt | SessionId,
	): IdCompressor {
		let sessionId: SessionId | undefined;
		let logger: ITelemetryLoggerExt | undefined;
		if (typeof loggerOrSessionId === "string") {
			sessionId = loggerOrSessionId;
		} else {
			logger = loggerOrSessionId;
		}

		const buffer = stringToBuffer(serialized, "base64");
		const index: Index = {
			index: 0,
			bufferFloat: new Float64Array(buffer),
			bufferUint: new BigUint64Array(buffer),
		};
		const version = readNumber(index);
		switch (version) {
			case 1.0:
				throw new Error("IdCompressor version 1.0 is no longer supported.");
			case 2.0:
				return IdCompressor.deserialize2_0(index, sessionId, logger);
			default:
				throw new Error("Unknown IdCompressor serialized version.");
		}
	}

	static deserialize2_0(
		index: Index,
		sessionId?: SessionId,
		logger?: ITelemetryLoggerExt,
	): IdCompressor {
		const hasLocalState = readBoolean(index);
		const sessionCount = readNumber(index);
		const clusterCount = readNumber(index);

		// Sessions
		let sessionOffset = 0;
		const sessions: [NumericUuid, Session][] = [];
		if (!hasLocalState) {
			// If !hasLocalState, there won't be a serialized local session ID so insert one at the beginning
			assert(sessionId !== undefined, 0x75d /* Local session ID is undefined. */);
			const localSessionNumeric = numericUuidFromStableId(sessionId);
			sessions.push([localSessionNumeric, new Session(localSessionNumeric)]);
			sessionOffset = 1;
		} else {
			assert(
				sessionId === undefined,
				0x75e /* Local state should not exist in serialized form. */,
			);
		}

		for (let i = 0; i < sessionCount; i++) {
			const numeric = readNumericUuid(index);
			sessions.push([numeric, new Session(numeric)]);
		}

		const compressor = new IdCompressor(new Sessions(sessions), logger);

		// Clusters
		let baseFinalId = 0;
		for (let i = 0; i < clusterCount; i++) {
			const sessionIndex = readNumber(index);
			const session = sessions[sessionIndex + sessionOffset][1];
			const capacity = readNumber(index);
			const count = readNumber(index);
			const cluster = session.addNewCluster(
				baseFinalId as FinalCompressedId,
				capacity,
				count,
			);
			compressor.finalSpace.addCluster(cluster);
			baseFinalId += capacity;
		}

		// Local state
		if (hasLocalState) {
			compressor.localGenCount = readNumber(index);
			compressor.nextRangeBaseGenCount = readNumber(index);
			const normalizerCount = readNumber(index);
			for (let i = 0; i < normalizerCount; i++) {
				compressor.normalizer.addLocalRange(readNumber(index), readNumber(index));
			}
		}

		assert(
			index.index === index.bufferFloat.length,
			0x75f /* Failed to read entire serialized compressor. */,
		);
		return compressor;
	}

	public equals(other: IdCompressor, includeLocalState: boolean): boolean {
		if (
			includeLocalState &&
			(this.localSessionId !== other.localSessionId ||
				!this.localSession.equals(other.localSession) ||
				!this.normalizer.equals(other.normalizer) ||
				this.nextRangeBaseGenCount !== other.nextRangeBaseGenCount ||
				this.localGenCount !== other.localGenCount)
		) {
			return false;
		}
		return (
			this.sessions.equals(other.sessions, includeLocalState) &&
			this.finalSpace.equals(other.finalSpace)
		);
	}
}

/**
 * Create a new {@link IIdCompressor}.
 * @alpha
 */
export function createIdCompressor(
	logger?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore;
/**
 * Create a new {@link IIdCompressor}.
 * @param sessionId - The seed ID for the compressor.
 * @alpha
 */
export function createIdCompressor(
	sessionId: SessionId,
	logger?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore;
export function createIdCompressor(
	sessionIdOrLogger?: SessionId | ITelemetryBaseLogger,
	loggerOrUndefined?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore {
	let localSessionId: SessionId;
	let logger: ITelemetryBaseLogger | undefined;
	if (sessionIdOrLogger === undefined) {
		localSessionId = createSessionId();
	} else {
		if (typeof sessionIdOrLogger === "string") {
			localSessionId = sessionIdOrLogger;
			logger = loggerOrUndefined;
		} else {
			localSessionId = createSessionId();
			logger = sessionIdOrLogger;
		}
	}
	const compressor = new IdCompressor(
		localSessionId,
		logger === undefined ? undefined : createChildLogger({ logger }),
	);
	return compressor;
}

/**
 * Deserializes the supplied state into an ID compressor.
 * @alpha
 */
export function deserializeIdCompressor(
	serialized: SerializedIdCompressorWithOngoingSession,
	logger?: ITelemetryLoggerExt,
): IIdCompressor & IIdCompressorCore;
/**
 * Deserializes the supplied state into an ID compressor.
 * @alpha
 */
export function deserializeIdCompressor(
	serialized: SerializedIdCompressorWithNoSession,
	newSessionId: SessionId,
	logger?: ITelemetryLoggerExt,
): IIdCompressor & IIdCompressorCore;
export function deserializeIdCompressor(
	serialized: SerializedIdCompressor | SerializedIdCompressorWithNoSession,
	sessionIdOrLogger?: SessionId | ITelemetryLoggerExt,
	logger?: ITelemetryLoggerExt | undefined,
): IIdCompressor & IIdCompressorCore {
	if (typeof sessionIdOrLogger === "string") {
		return IdCompressor.deserialize(
			serialized as SerializedIdCompressorWithNoSession,
			sessionIdOrLogger,
			logger,
		);
	}

	return IdCompressor.deserialize(serialized as SerializedIdCompressorWithOngoingSession, logger);
}
