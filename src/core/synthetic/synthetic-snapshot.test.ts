import { describe, expect, it } from 'vitest';
import { fnv1a64 } from '../determinism/fnv1a64.ts';
import { createSyntheticScene, type TickInput } from './synthetic-scene.ts';
import {
  canonicalSnapshotText,
  hashSyntheticScene,
  hashSyntheticSnapshot,
  takeSyntheticSnapshot,
  type SyntheticSnapshot,
} from './synthetic-snapshot.ts';

const idle: TickInput = { input: { moveX: 0 }, commands: [] };
const addMarker: TickInput = { input: { moveX: 0.5 }, commands: [{ type: 'add-marker' }] };

function sceneWithMarker() {
  const scene = createSyntheticScene({ seed: 0 });
  scene.step(addMarker);
  return scene;
}

// Hand-written from the spec's data model; not produced by the module under test.
const INITIAL_SEED_0_TEXT =
  '{"format":"osr-synthetic-snapshot","version":1,"state":{"scenario":"synthetic","tick":0,"tickRateHz":60,"seed":0,' +
  '"rngState":0,"nextEntityId":2,"mover":{"id":1,"position":{"x":0,"y":0,"z":0}},"marker":null}}';

const markerSnapshot: SyntheticSnapshot = {
  format: 'osr-synthetic-snapshot',
  version: 1,
  state: {
    scenario: 'synthetic',
    tick: 3,
    tickRateHz: 120,
    seed: 7,
    rngState: 123456789,
    nextEntityId: 5,
    mover: { id: 1, position: { x: 0.25, y: 0, z: 0 } },
    marker: { id: 4, position: { x: -1.5, y: 0.125, z: 4.75 } },
  },
};

const MARKER_TEXT =
  '{"format":"osr-synthetic-snapshot","version":1,"state":{"scenario":"synthetic","tick":3,"tickRateHz":120,"seed":7,' +
  '"rngState":123456789,"nextEntityId":5,"mover":{"id":1,"position":{"x":0.25,"y":0,"z":0}},' +
  '"marker":{"id":4,"position":{"x":-1.5,"y":0.125,"z":4.75}}}}';

describe('takeSyntheticSnapshot (AC-01)', () => {
  it('captures the complete seed 0 initial state with format and version', () => {
    expect(takeSyntheticSnapshot(createSyntheticScene({ seed: 0 }))).toEqual({
      format: 'osr-synthetic-snapshot',
      version: 1,
      state: {
        scenario: 'synthetic',
        tick: 0,
        tickRateHz: 60,
        seed: 0,
        rngState: 0,
        nextEntityId: 2,
        mover: { id: 1, position: { x: 0, y: 0, z: 0 } },
        marker: null,
      },
    });
  });

  it('matches inspect() exactly for a scene with a marker', () => {
    const scene = sceneWithMarker();
    expect(takeSyntheticSnapshot(scene)).toStrictEqual({ format: 'osr-synthetic-snapshot', version: 1, state: scene.inspect() });
  });

  it('includes the marker, RNG state and ID allocator after an add', () => {
    const { state } = takeSyntheticSnapshot(sceneWithMarker());
    expect(state.marker?.id).toBe(2);
    expect(state.nextEntityId).toBe(3);
    expect(state.rngState).not.toBe(0);
  });

  it('is deeply frozen and detached from the scene and from other reads', () => {
    const scene = sceneWithMarker();
    const first = takeSyntheticSnapshot(scene);
    const second = takeSyntheticSnapshot(scene);
    const nested = ({ state }: SyntheticSnapshot) => [state, state.mover, state.mover.position, state.marker, state.marker?.position];
    const firstNested = nested(first);
    const secondNested = nested(second);
    expect(first).not.toBe(second);
    firstNested.forEach((value, index) => {
      expect(value).not.toBe(secondNested[index]);
      expect(Object.isFrozen(value)).toBe(true);
    });
    expect(Object.isFrozen(first)).toBe(true);
    const before = scene.inspect();
    expect(() => {
      (first.state.mover.position as { x: number }).x = 99;
    }).toThrow(TypeError);
    expect(() => {
      (first as { version: number }).version = 2;
    }).toThrow(TypeError);
    expect(scene.inspect()).toEqual(before);
    expect(second).toEqual(takeSyntheticSnapshot(scene));

    const retained = JSON.stringify(second);
    scene.step({ input: { moveX: 1 }, commands: [{ type: 'remove-marker' }, { type: 'add-marker' }] });
    expect(JSON.stringify(second)).toBe(retained);
    expect(takeSyntheticSnapshot(scene)).not.toEqual(second);
  });

  it('reading snapshots and hashes changes neither state nor the RNG', () => {
    const observed = createSyntheticScene({ seed: 9 });
    const control = createSyntheticScene({ seed: 9 });
    for (const input of [addMarker, idle, { input: { moveX: -1 }, commands: [{ type: 'remove-marker' }, { type: 'add-marker' }] }] as TickInput[]) {
      const before = observed.inspect();
      takeSyntheticSnapshot(observed);
      hashSyntheticScene(observed);
      hashSyntheticSnapshot(takeSyntheticSnapshot(observed));
      expect(observed.inspect()).toEqual(before);
      expect(observed.step(input)).toEqual(control.step(input));
    }
    expect(observed.inspect()).toEqual(control.inspect());
  });

  it('survives a JSON round trip unchanged', () => {
    const snapshot = takeSyntheticSnapshot(sceneWithMarker());
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe('canonicalSnapshotText and state hash (AC-02)', () => {
  it('writes the seed 0 initial state as the hand-written literal', () => {
    expect(canonicalSnapshotText(takeSyntheticSnapshot(createSyntheticScene({ seed: 0 })))).toBe(INITIAL_SEED_0_TEXT);
  });

  it('writes a state with a marker as the hand-written literal', () => {
    expect(canonicalSnapshotText(markerSnapshot)).toBe(MARKER_TEXT);
  });

  it('ignores the key order of the snapshot object', () => {
    const { state } = markerSnapshot;
    const shuffled = {
      state: {
        marker: { position: { z: 4.75, y: 0.125, x: -1.5 }, id: 4 },
        mover: { position: { z: 0, x: 0.25, y: 0 }, id: 1 },
        nextEntityId: state.nextEntityId,
        rngState: state.rngState,
        seed: state.seed,
        tickRateHz: state.tickRateHz,
        tick: state.tick,
        scenario: state.scenario,
      },
      version: 1,
      format: 'osr-synthetic-snapshot',
    } as SyntheticSnapshot;
    expect(canonicalSnapshotText(shuffled)).toBe(MARKER_TEXT);
    expect(hashSyntheticSnapshot(shuffled)).toBe(hashSyntheticSnapshot(markerSnapshot));
  });

  it('writes -0 as 0', () => {
    const negativeZero: SyntheticSnapshot = {
      ...markerSnapshot,
      state: {
        ...markerSnapshot.state,
        mover: { id: 1, position: { x: -0, y: -0, z: -0 } },
        marker: { id: 4, position: { x: -0, y: 0.125, z: -0 } },
      },
    };
    const text = canonicalSnapshotText(negativeZero);
    expect(text).toContain('"mover":{"id":1,"position":{"x":0,"y":0,"z":0}}');
    expect(text).toContain('"marker":{"id":4,"position":{"x":0,"y":0.125,"z":0}}');
    expect(text).not.toContain('-0');
  });

  it('hashes the canonical text as 16 lowercase hex digits with FNV-1a 64', () => {
    const hash = hashSyntheticSnapshot(markerSnapshot);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).toBe(fnv1a64(MARKER_TEXT));
  });

  it('hashes a scene as the hash of its current snapshot', () => {
    const scene = sceneWithMarker();
    expect(hashSyntheticScene(scene)).toBe(hashSyntheticSnapshot(takeSyntheticSnapshot(scene)));
    expect(hashSyntheticScene(createSyntheticScene({ seed: 0 }))).toBe(fnv1a64(INITIAL_SEED_0_TEXT));
  });
});
