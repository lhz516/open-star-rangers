/**
 * Versioned snapshot, canonical text and FNV-1a 64 state hash of the synthetic scene.
 * The hash is only a same-version, same-runtime consistency check. Contract: docs/plan/p1/03/spec.md.
 */
import { fnv1a64 } from './fnv1a64.ts';
// Type-only, so synthetic-scene.ts can import the format constants at run time without a cycle.
import type { SyntheticEntity, SyntheticScene, SyntheticSceneState, Vec3 } from './synthetic-scene.ts';

export const SYNTHETIC_SNAPSHOT_FORMAT = 'osr-synthetic-snapshot';
export const SYNTHETIC_SNAPSHOT_VERSION = 1;

export interface SyntheticSnapshot {
  readonly format: typeof SYNTHETIC_SNAPSHOT_FORMAT;
  readonly version: typeof SYNTHETIC_SNAPSHOT_VERSION;
  readonly state: SyntheticSceneState;
}

/** A new deeply frozen snapshot of the scene's complete authoritative state; reading it has no side effects. */
export function takeSyntheticSnapshot(scene: SyntheticScene): SyntheticSnapshot {
  return Object.freeze({ format: SYNTHETIC_SNAPSHOT_FORMAT, version: SYNTHETIC_SNAPSHOT_VERSION, state: scene.inspect() });
}

function orderedVec({ x, y, z }: Vec3): Vec3 {
  return { x, y, z };
}

function orderedEntity({ id, position }: SyntheticEntity): SyntheticEntity {
  return { id, position: orderedVec(position) };
}

/**
 * Compact JSON with the spec's fixed field order, independent of the caller's key order.
 * JSON.stringify writes numbers by the ECMAScript rules, including -0 as 0.
 */
export function canonicalSnapshotText(snapshot: SyntheticSnapshot): string {
  const { format, version, state } = snapshot;
  const { scenario, tick, tickRateHz, seed, rngState, nextEntityId, mover, marker } = state;
  return JSON.stringify({
    format,
    version,
    state: {
      scenario,
      tick,
      tickRateHz,
      seed,
      rngState,
      nextEntityId,
      mover: orderedEntity(mover),
      marker: marker && orderedEntity(marker),
    },
  });
}

/** 16 lowercase hex digits: the FNV-1a 64 hash of the snapshot's canonical text. */
export function hashSyntheticSnapshot(snapshot: SyntheticSnapshot): string {
  return fnv1a64(canonicalSnapshotText(snapshot));
}

/** Equivalent to hashing the scene's current snapshot. */
export function hashSyntheticScene(scene: SyntheticScene): string {
  return hashSyntheticSnapshot(takeSyntheticSnapshot(scene));
}
