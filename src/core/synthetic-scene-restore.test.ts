import { describe, expect, it } from 'vitest';
import { CoreInputError } from './errors.ts';
import { createSyntheticScene, restoreSyntheticScene, type Command, type SyntheticScene, type TickInput } from './synthetic-scene.ts';
import { canonicalSnapshotText, hashSyntheticScene, takeSyntheticSnapshot } from './synthetic-snapshot.ts';

const add: Command = { type: 'add-marker' };
const remove: Command = { type: 'remove-marker' };

function tick(moveX: number, ...commands: Command[]): TickInput {
  return { input: { moveX }, commands };
}

const idle = tick(0);

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to throw');
}

function expectCoreInputError(action: () => unknown, path: string): void {
  const error = thrownBy(action);
  expect(error).toBeInstanceOf(CoreInputError);
  expect((error as CoreInputError).path).toBe(path);
}

type SnapshotData = {
  format: unknown;
  version: unknown;
  state: {
    scenario: unknown;
    tick: unknown;
    tickRateHz: unknown;
    seed: unknown;
    rngState: unknown;
    nextEntityId: unknown;
    mover: { id: unknown; position: { x: unknown; y: unknown; z: unknown } };
    marker: { id: unknown; position: { x: unknown; y: unknown; z: unknown } } | null;
  };
};

/** A valid snapshot with a marker, written by hand so every field can be varied independently. */
function validSnapshot(): SnapshotData {
  return {
    format: 'osr-synthetic-snapshot',
    version: 1,
    state: {
      scenario: 'synthetic',
      tick: 10,
      tickRateHz: 60,
      seed: 3,
      rngState: 99,
      nextEntityId: 5,
      mover: { id: 1, position: { x: 0.5, y: 0, z: 0 } },
      marker: { id: 3, position: { x: 1, y: 2, z: 3 } },
    },
  };
}

function initialSnapshotAt(overrides: Partial<SnapshotData['state']>): SnapshotData {
  const snapshot = plain(takeSyntheticSnapshot(createSyntheticScene({ seed: 0 }))) as SnapshotData;
  Object.assign(snapshot.state, overrides);
  return snapshot;
}

function expectSameReads(restored: SyntheticScene, source: SyntheticScene): void {
  expect(restored.inspect()).toStrictEqual(source.inspect());
  expect(restored.uiProjection()).toStrictEqual(source.uiProjection());
  expect(restored.renderState()).toStrictEqual(source.renderState());
  expect(takeSyntheticSnapshot(restored)).toStrictEqual(takeSyntheticSnapshot(source));
  expect(hashSyntheticScene(restored)).toBe(hashSyntheticScene(source));
}

describe('restoreSyntheticScene round trip (AC-03)', () => {
  // Movement, a successful add, both rejection kinds, a remove, and add/remove/add in one tick.
  const continuation = [
    tick(0.5, add),
    tick(-1, add),
    tick(1, remove),
    tick(0, remove),
    tick(0.25, add, remove, add),
    idle,
  ];

  const sources: [string, () => { scene: SyntheticScene; snapshot: unknown }][] = [
    ['the initial state', () => {
      const scene = createSyntheticScene({ seed: 0 });
      return { scene, snapshot: takeSyntheticSnapshot(scene) };
    }],
    ['a state with a marker', () => {
      const scene = createSyntheticScene({ seed: 11, tickRateHz: 120 });
      scene.step(tick(1, add));
      return { scene, snapshot: takeSyntheticSnapshot(scene) };
    }],
    ['a state after a removal', () => {
      const scene = createSyntheticScene({ seed: 4294967295 });
      scene.step(tick(-0.5, add));
      scene.step(tick(1, remove));
      return { scene, snapshot: takeSyntheticSnapshot(scene) };
    }],
    ['a JSON round trip', () => {
      const scene = createSyntheticScene({ seed: 23, tickRateHz: 30 });
      scene.step(tick(0.75, add));
      scene.step(tick(-0.25));
      return { scene, snapshot: plain(takeSyntheticSnapshot(scene)) };
    }],
  ];

  it.each(sources)('restores %s equivalently and continues identically tick by tick', (_name, makeSource) => {
    const { scene: source, snapshot } = makeSource();
    const restored = restoreSyntheticScene(snapshot);
    expectSameReads(restored, source);
    for (const input of continuation) {
      expect(restored.step(input)).toStrictEqual(source.step(input));
      expect(hashSyntheticScene(restored)).toBe(hashSyntheticScene(source));
    }
    expectSameReads(restored, source);
  });

  it('keeps no reference to the input object', () => {
    const data = validSnapshot();
    const restored = restoreSyntheticScene(data);
    const before = restored.inspect();
    data.state.tick = 99;
    data.state.mover.position.x = 4;
    data.state.marker!.position.y = -4;
    data.state.marker = null;
    expect(restored.inspect()).toStrictEqual(before);
  });

  it('is independent of the source scene', () => {
    const source = createSyntheticScene({ seed: 5 });
    source.step(tick(1, add));
    const restored = restoreSyntheticScene(takeSyntheticSnapshot(source));
    const restoredBefore = restored.inspect();
    source.step(tick(1, remove));
    expect(restored.inspect()).toStrictEqual(restoredBefore);
  });
});

describe('restoreSyntheticScene key order (AC-02)', () => {
  it('gives the same canonical text and hash whatever the key order of the input', () => {
    const ordered = validSnapshot();
    const shuffled = {
      state: {
        marker: { position: { z: 3, x: 1, y: 2 }, id: 3 },
        nextEntityId: 5,
        mover: { position: { y: 0, z: 0, x: 0.5 }, id: 1 },
        rngState: 99,
        tickRateHz: 60,
        seed: 3,
        scenario: 'synthetic',
        tick: 10,
      },
      version: 1,
      format: 'osr-synthetic-snapshot',
    };
    const fromOrdered = restoreSyntheticScene(ordered);
    const fromShuffled = restoreSyntheticScene(shuffled);
    expect(canonicalSnapshotText(takeSyntheticSnapshot(fromShuffled))).toBe(canonicalSnapshotText(takeSyntheticSnapshot(fromOrdered)));
    expect(hashSyntheticScene(fromShuffled)).toBe(hashSyntheticScene(fromOrdered));
  });
});

describe('restoreSyntheticScene validation (AC-04)', () => {
  const S = 'snapshot.state';
  type Case = (data: SnapshotData) => unknown;
  const top = (overrides: Record<string, unknown>): Case => (data) => ({ ...data, ...overrides });
  const state = (overrides: Record<string, unknown>): Case => (data) => ({ ...data, state: { ...data.state, ...overrides } });
  const moverAt = (position: Record<string, unknown>) => state({ mover: { id: 1, position: { x: 0, y: 0, z: 0, ...position } } });
  const marker = (overrides: Record<string, unknown>): Case => (data) => state({ marker: { ...data.state.marker, ...overrides } })(data);
  const markerAt = (position: Record<string, unknown>) => state({ marker: { id: 3, position: { x: 0, y: 0, z: 0, ...position } } });

  const invalid: [string, Case, string][] = [
    ['null snapshot', () => null, 'snapshot'],
    ['array snapshot', () => [], 'snapshot'],
    ['string snapshot', (data) => JSON.stringify(data), 'snapshot'],
    ['wrong format', top({ format: 'osr-synthetic-replay' }), 'snapshot.format'],
    ['missing format', ({ version, state }) => ({ version, state }), 'snapshot.format'],
    ['unknown version', top({ version: 2 }), 'snapshot.version'],
    ['string version', top({ version: '1' }), 'snapshot.version'],
    ['extra top-level field', top({ extra: true }), 'snapshot.extra'],
    ['missing state', ({ format, version }) => ({ format, version }), S],
    ['array state', top({ state: [] }), S],
    ['extra state field', state({ extra: 0 }), `${S}.extra`],
    ['wrong scenario', state({ scenario: 'mission' }), `${S}.scenario`],
    ['undefined tick', state({ tick: undefined }), `${S}.tick`],
    ['negative tick', state({ tick: -1 }), `${S}.tick`],
    ['fractional tick', state({ tick: 1.5 }), `${S}.tick`],
    ['unsafe tick', state({ tick: 2 ** 53 }), `${S}.tick`],
    ['numeric-string tick', state({ tick: '10' }), `${S}.tick`],
    ['BigInt tick', state({ tick: 10n }), `${S}.tick`],
    ['NaN tick', state({ tick: Number.NaN }), `${S}.tick`],
    ['infinite tick', state({ tick: Number.POSITIVE_INFINITY }), `${S}.tick`],
    ['zero tick rate', state({ tickRateHz: 0 }), `${S}.tickRateHz`],
    ['negative tick rate', state({ tickRateHz: -60 }), `${S}.tickRateHz`],
    ['infinite tick rate', state({ tickRateHz: Number.POSITIVE_INFINITY }), `${S}.tickRateHz`],
    ['NaN tick rate', state({ tickRateHz: Number.NaN }), `${S}.tickRateHz`],
    ['tick rate with an infinite reciprocal', state({ tickRateHz: 1e-320 }), `${S}.tickRateHz`],
    ['numeric-string tick rate', state({ tickRateHz: '60' }), `${S}.tickRateHz`],
    ['negative seed', state({ seed: -1 }), `${S}.seed`],
    ['seed above uint32', state({ seed: 2 ** 32 }), `${S}.seed`],
    ['fractional seed', state({ seed: 0.5 }), `${S}.seed`],
    ['numeric-string seed', state({ seed: '3' }), `${S}.seed`],
    ['negative RNG state', state({ rngState: -1 }), `${S}.rngState`],
    ['RNG state above uint32', state({ rngState: 2 ** 32 }), `${S}.rngState`],
    ['fractional RNG state', state({ rngState: 99.5 }), `${S}.rngState`],
    ['NaN RNG state', state({ rngState: Number.NaN }), `${S}.rngState`],
    ['next entity ID of 1', state({ nextEntityId: 1, marker: null }), `${S}.nextEntityId`],
    ['fractional next entity ID', state({ nextEntityId: 5.5 }), `${S}.nextEntityId`],
    ['unsafe next entity ID', state({ nextEntityId: 2 ** 53 }), `${S}.nextEntityId`],
    ['undefined mover', state({ mover: undefined }), `${S}.mover`],
    ['mover ID of 2', state({ mover: { id: 2, position: { x: 0, y: 0, z: 0 } } }), `${S}.mover.id`],
    ['extra mover field', state({ mover: { id: 1, position: { x: 0, y: 0, z: 0 }, kind: 'mover' } }), `${S}.mover.kind`],
    ['missing mover position', state({ mover: { id: 1 } }), `${S}.mover.position`],
    ['extra mover position field', moverAt({ w: 0 }), `${S}.mover.position.w`],
    ['infinite mover x', moverAt({ x: Number.NEGATIVE_INFINITY }), `${S}.mover.position.x`],
    ['NaN mover x', moverAt({ x: Number.NaN }), `${S}.mover.position.x`],
    ['numeric-string mover x', moverAt({ x: '0.5' }), `${S}.mover.position.x`],
    ['non-zero mover y', moverAt({ y: 1 }), `${S}.mover.position.y`],
    ['non-zero mover z', moverAt({ z: 0.5 }), `${S}.mover.position.z`],
    ['missing marker', ({ format, version, state: { marker: _marker, ...rest } }) => ({ format, version, state: rest }), `${S}.marker`],
    ['undefined marker', state({ marker: undefined }), `${S}.marker`],
    ['array marker', state({ marker: [] }), `${S}.marker`],
    ['extra marker field', marker({ kind: 'marker' }), `${S}.marker.kind`],
    ['marker ID of 1', marker({ id: 1 }), `${S}.marker.id`],
    ['marker ID equal to nextEntityId', marker({ id: 5 }), `${S}.marker.id`],
    ['marker ID above nextEntityId', marker({ id: 6 }), `${S}.marker.id`],
    ['fractional marker ID', marker({ id: 3.5 }), `${S}.marker.id`],
    ['missing marker position', state({ marker: { id: 3 } }), `${S}.marker.position`],
    ['marker x below the range', markerAt({ x: -5.0000001 }), `${S}.marker.position.x`],
    ['marker y at the exclusive maximum', markerAt({ y: 5 }), `${S}.marker.position.y`],
    ['NaN marker z', markerAt({ z: Number.NaN }), `${S}.marker.position.z`],
    ['numeric-string marker z', markerAt({ z: '1' }), `${S}.marker.position.z`],
  ];

  it.each(invalid)('rejects %s with CoreInputError at the right path', (_name, makeInput, path) => {
    expectCoreInputError(() => restoreSyntheticScene(makeInput(validSnapshot())), path);
  });

  it('accepts the bounds of every range', () => {
    const data = validSnapshot();
    data.state.seed = 4294967295;
    data.state.rngState = 0;
    data.state.marker = { id: 2, position: { x: -5, y: 4.999999999, z: -5 } };
    expect(restoreSyntheticScene(data).inspect()).toMatchObject({ seed: 4294967295, rngState: 0, marker: { id: 2, position: { x: -5, z: -5 } } });
  });

  it('accepts -0 in every numeric field that allows 0 and normalises it to +0', () => {
    const data = validSnapshot();
    Object.assign(data.state, { tick: -0, seed: -0, rngState: -0 });
    data.state.mover.position = { x: -0, y: -0, z: -0 };
    data.state.marker!.position = { x: -0, y: -0, z: -0 };
    const state = restoreSyntheticScene(data).inspect();
    const zeros = [state.tick, state.seed, state.rngState, state.mover.position.x, state.mover.position.y, state.mover.position.z, state.marker!.position.x, state.marker!.position.y, state.marker!.position.z];
    for (const zero of zeros) expect(Object.is(zero, 0)).toBe(true);
  });

  it.each([
    ['snapshot', (data: SnapshotData) => Object.create(data) as unknown, 'snapshot.format'],
    ['state', (data: SnapshotData) => ({ ...data, state: Object.create(data.state) as unknown }), 'snapshot.state.scenario'],
    ['mover position', (data: SnapshotData) => ({ ...data, state: { ...data.state, mover: { id: 1, position: Object.create({ x: 0, y: 0, z: 0 }) as unknown } } }), 'snapshot.state.mover.position.x'],
  ])('treats fields inherited by the %s object as missing', (_name, makeInput, path) => {
    expectCoreInputError(() => restoreSyntheticScene(makeInput(validSnapshot())), path);
  });

  it('reads every input field once and uses the value it validated', () => {
    const reads = new Map<string, number>();
    // Each getter returns a valid value on its first read and an invalid one afterwards.
    function counted<T extends object>(prefix: string, target: T): T {
      const object = {};
      for (const [key, value] of Object.entries(target)) {
        Object.defineProperty(object, key, {
          enumerable: true,
          get: () => {
            const name = `${prefix}${key}`;
            reads.set(name, (reads.get(name) ?? 0) + 1);
            return reads.get(name) === 1 ? value : Number.NaN;
          },
        });
      }
      return object as T;
    }
    const { state } = validSnapshot();
    const input = counted('', {
      format: 'osr-synthetic-snapshot',
      version: 1,
      state: counted('state.', {
        ...state,
        mover: counted('mover.', { id: 1, position: counted('mover.position.', state.mover.position) }),
        marker: counted('marker.', { id: 3, position: counted('marker.position.', state.marker!.position) }),
      }),
    });
    expect(restoreSyntheticScene(input).inspect()).toStrictEqual(restoreSyntheticScene(validSnapshot()).inspect());
    expect(reads.size).toBe(3 + 8 + 2 + 3 + 2 + 3);
    for (const [name, count] of reads) expect([name, count]).toEqual([name, 1]);
  });
});

describe('restoreSyntheticScene hash sensitivity (AC-05)', () => {
  // Each variant changes one field of validSnapshot() while keeping every other invariant. Passing
  // these finite cases does not prove the hash is collision-free for all values.
  const variants: [string, (state: SnapshotData['state']) => void][] = [
    ['tick', (state) => { state.tick = 11; }],
    ['tickRateHz', (state) => { state.tickRateHz = 120; }],
    ['seed', (state) => { state.seed = 4; }],
    ['rngState', (state) => { state.rngState = 100; }],
    ['nextEntityId', (state) => { state.nextEntityId = 6; }],
    ['mover.position.x', (state) => { state.mover.position.x = 0.75; }],
    ['marker presence', (state) => { state.marker = null; }],
    ['marker.id', (state) => { state.marker!.id = 4; }],
    ['marker.position.x', (state) => { state.marker!.position.x = 1.5; }],
    ['marker.position.y', (state) => { state.marker!.position.y = 2.5; }],
    ['marker.position.z', (state) => { state.marker!.position.z = 3.5; }],
  ];

  const base = restoreSyntheticScene(validSnapshot());
  const baseText = canonicalSnapshotText(takeSyntheticSnapshot(base));
  const baseHash = hashSyntheticScene(base);

  it.each(variants)('changes the canonical text and hash when only %s differs', (_field, change) => {
    const data = validSnapshot();
    change(data.state);
    const scene = restoreSyntheticScene(data);
    expect(canonicalSnapshotText(takeSyntheticSnapshot(scene))).not.toBe(baseText);
    expect(hashSyntheticScene(scene)).not.toBe(baseHash);
  });

  it('keeps the hash while the state is unchanged, however often it is read', () => {
    const scene = restoreSyntheticScene(validSnapshot());
    for (let read = 0; read < 3; read++) {
      takeSyntheticSnapshot(scene);
      scene.inspect();
      scene.uiProjection();
      scene.renderState();
      expect(hashSyntheticScene(scene)).toBe(baseHash);
    }
  });
});

describe('numeric limit guards via restore (AC-06, P1-02 technical decision 7)', () => {
  function expectRejectedAtomically(scene: SyntheticScene, input: TickInput, path: string): void {
    const snapshot = takeSyntheticSnapshot(scene);
    const hash = hashSyntheticScene(scene);
    expectCoreInputError(() => scene.step(input), path);
    expect(takeSyntheticSnapshot(scene)).toStrictEqual(snapshot);
    expect(hashSyntheticScene(scene)).toBe(hash);
  }

  it('advances to MAX_SAFE_INTEGER and then rejects the next tick', () => {
    const scene = restoreSyntheticScene(initialSnapshotAt({ tick: Number.MAX_SAFE_INTEGER - 1 }));
    expect(scene.step(tick(1))).toEqual([]);
    expect(scene.inspect().tick).toBe(Number.MAX_SAFE_INTEGER);
    expectRejectedAtomically(scene, idle, 'tickInput');
    expectRejectedAtomically(scene, tick(1, add), 'tickInput');
  });

  it('allocates the last safe entity ID and then rejects the next allocation', () => {
    const scene = restoreSyntheticScene(initialSnapshotAt({ nextEntityId: Number.MAX_SAFE_INTEGER - 1, marker: null }));
    const [added] = scene.step(tick(0, add));
    expect(added).toMatchObject({ type: 'marker-added', entityId: Number.MAX_SAFE_INTEGER - 1 });
    expect(scene.inspect().nextEntityId).toBe(Number.MAX_SAFE_INTEGER);

    // A rejected add allocates nothing, so it is still allowed at the limit.
    expect(scene.step(tick(0, add))).toEqual([
      { type: 'command-rejected', tick: 2, commandIndex: 0, commandType: 'add-marker', reason: 'marker-already-exists' },
    ]);
    expect(scene.step(tick(0.5, remove))).toMatchObject([{ type: 'marker-removed', entityId: Number.MAX_SAFE_INTEGER - 1 }]);

    expectRejectedAtomically(scene, tick(0, add), 'tickInput.commands');
    expectRejectedAtomically(scene, tick(1, remove, add), 'tickInput.commands');

    // Ticks that allocate no ID keep advancing with the same allocator.
    expect(scene.step(tick(1, remove))).toMatchObject([{ type: 'command-rejected', reason: 'marker-not-found' }]);
    expect(scene.step(idle)).toEqual([]);
    expect(scene.inspect()).toMatchObject({ tick: 5, nextEntityId: Number.MAX_SAFE_INTEGER, marker: null });
  });
});
