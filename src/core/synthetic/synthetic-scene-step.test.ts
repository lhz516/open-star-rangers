import { describe, expect, it } from 'vitest';
import { nextRandom } from '../determinism/rng.ts';
import {
  createSyntheticScene,
  SYNTHETIC_MARKER_MAX,
  SYNTHETIC_MARKER_MIN,
  type Command,
  type SyntheticScene,
  type TickInput,
  type Vec3,
} from './synthetic-scene.ts';

const add: Command = { type: 'add-marker' };
const remove: Command = { type: 'remove-marker' };

function tick(moveX: number, ...commands: Command[]): TickInput {
  return { input: { moveX }, commands };
}

const idle = tick(0);

/** The spec's coordinate formula, transcribed independently of the scene's implementation. */
function specCoordinate(r: number): number {
  return -5 + 10 * r;
}

/** Marker positions and final RNG state the scene should reach from `seed` after `count` successful adds. */
function expectedDraws(seed: number, count: number): { positions: Vec3[]; state: number } {
  let state = seed;
  const draw = () => {
    const next = nextRandom(state);
    state = next.state;
    return specCoordinate(next.value);
  };
  const positions = Array.from({ length: count }, () => ({ x: draw(), y: draw(), z: draw() }));
  return { positions, state };
}

function detached<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('step: ticks and movement (AC-02)', () => {
  it('advances exactly one tick per call and returns no events for idle input', () => {
    const scene = createSyntheticScene({ seed: 1 });
    for (let n = 1; n <= 3; n++) {
      const events = scene.step(idle);
      expect(events).toEqual([]);
      expect(Object.isFrozen(events)).toBe(true);
      expect(scene.inspect().tick).toBe(n);
    }
    expect(scene.inspect().mover.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  describe.each([60, 120])('at %i Hz', (tickRateHz) => {
    it.each([-1, 0, 0.5, 1])('moves moveX=%d units along X in one second, within 1e-12', (moveX) => {
      const scene = createSyntheticScene({ seed: 1, tickRateHz });
      for (let n = 0; n < tickRateHz; n++) scene.step(tick(moveX));
      const { tick: ticks, mover } = scene.inspect();
      expect(ticks).toBe(tickRateHz);
      expect(Math.abs(mover.position.x - moveX)).toBeLessThanOrEqual(1e-12);
      expect(mover.position.y).toBe(0);
      expect(mover.position.z).toBe(0);
    });
  });

  it('stops immediately when the axis returns to zero (no inertia)', () => {
    const scene = createSyntheticScene({ seed: 1 });
    for (let n = 0; n < 10; n++) scene.step(tick(1));
    const { x } = scene.inspect().mover.position;
    scene.step(idle);
    scene.step(idle);
    expect(scene.inspect().mover.position.x).toBe(x);
  });
});

describe('step: marker commands (AC-03)', () => {
  it('adds a marker when none exists, drawing its position and allocating the next ID', () => {
    const scene = createSyntheticScene({ seed: 42 });
    const {
      positions: [position],
      state,
    } = expectedDraws(42, 1);
    expect(scene.step(tick(0, add))).toEqual([{ type: 'marker-added', tick: 1, commandIndex: 0, entityId: 2, position }]);
    expect(scene.inspect()).toMatchObject({ marker: { id: 2, position }, nextEntityId: 3, rngState: state });
  });

  it('rejects a second add without using the RNG or an ID, while the tick and movement still run', () => {
    const scene = createSyntheticScene({ seed: 42 });
    scene.step(tick(0, add));
    const before = scene.inspect();
    expect(scene.step(tick(1, add))).toEqual([
      { type: 'command-rejected', tick: 2, commandIndex: 0, commandType: 'add-marker', reason: 'marker-already-exists' },
    ]);
    const after = scene.inspect();
    expect(after).toMatchObject({ tick: 2, rngState: before.rngState, nextEntityId: before.nextEntityId, marker: before.marker });
    expect(after.mover.position.x).toBeCloseTo(1 / 60, 15);
  });

  it('removes an existing marker, reporting its ID and position, without using the RNG', () => {
    const scene = createSyntheticScene({ seed: 42 });
    scene.step(tick(0, add));
    const before = scene.inspect();
    expect(scene.step(tick(0, remove))).toEqual([
      { type: 'marker-removed', tick: 2, commandIndex: 0, entityId: 2, position: before.marker?.position },
    ]);
    expect(scene.inspect()).toMatchObject({ marker: null, rngState: before.rngState, nextEntityId: before.nextEntityId });
  });

  it('rejects a remove when no marker exists, while the tick and movement still run', () => {
    const scene = createSyntheticScene({ seed: 42 });
    expect(scene.step(tick(-1, remove))).toEqual([
      { type: 'command-rejected', tick: 1, commandIndex: 0, commandType: 'remove-marker', reason: 'marker-not-found' },
    ]);
    expect(scene.inspect()).toMatchObject({ tick: 1, marker: null, rngState: 42, nextEntityId: 2 });
    expect(scene.inspect().mover.position.x).toBeCloseTo(-1 / 60, 15);
  });
});

describe('step: command order (AC-04)', () => {
  it('processes add/add/remove/add in array order within one tick', () => {
    const scene = createSyntheticScene({ seed: 9 });
    const [first, second] = expectedDraws(9, 2).positions;
    expect(scene.step(tick(0, add, add, remove, add))).toEqual([
      { type: 'marker-added', tick: 1, commandIndex: 0, entityId: 2, position: first },
      { type: 'command-rejected', tick: 1, commandIndex: 1, commandType: 'add-marker', reason: 'marker-already-exists' },
      { type: 'marker-removed', tick: 1, commandIndex: 2, entityId: 2, position: first },
      { type: 'marker-added', tick: 1, commandIndex: 3, entityId: 3, position: second },
    ]);
    expect(scene.inspect()).toMatchObject({ marker: { id: 3, position: second }, nextEntityId: 4 });
  });

  it('gives a different result when the same commands run in the opposite order', () => {
    const removeFirst = createSyntheticScene({ seed: 9 });
    const addFirst = createSyntheticScene({ seed: 9 });
    for (const scene of [removeFirst, addFirst]) scene.step(tick(0, add));
    expect(removeFirst.step(tick(0, remove, add)).map((event) => event.type)).toEqual(['marker-removed', 'marker-added']);
    expect(addFirst.step(tick(0, add, remove)).map((event) => event.type)).toEqual(['command-rejected', 'marker-removed']);
    expect(removeFirst.inspect().marker?.id).toBe(3);
    expect(addFirst.inspect().marker).toBeNull();
  });

  it('reaches the same entities when the same requests are spread across ticks', () => {
    const sameTick = createSyntheticScene({ seed: 9 });
    sameTick.step(tick(0, add, add, remove, add));
    const spread = createSyntheticScene({ seed: 9 });
    const events = [add, add, remove, add].flatMap((command) => spread.step(tick(0, command)));
    expect(events.map((event) => [event.type, event.tick, event.commandIndex])).toEqual([
      ['marker-added', 1, 0],
      ['command-rejected', 2, 0],
      ['marker-removed', 3, 0],
      ['marker-added', 4, 0],
    ]);
    const { marker, nextEntityId, rngState } = sameTick.inspect();
    expect(spread.inspect()).toMatchObject({ marker, nextEntityId, rngState });
  });
});

describe('step: random draws and IDs (AC-05)', () => {
  it.each([0, 123456789, 4294967295])('draws exactly three values per successful add for seed %i', (seed) => {
    const scene = createSyntheticScene({ seed });
    const {
      positions: [position],
      state,
    } = expectedDraws(seed, 1);
    scene.step(tick(0, add));
    expect(scene.inspect()).toMatchObject({ marker: { position }, rngState: state });
  });

  it('is not shifted by operations that do not draw', () => {
    const direct = createSyntheticScene({ seed: 5 });
    direct.step(tick(0, add));
    direct.step(tick(0, remove));
    direct.step(tick(0, add));

    const busy = createSyntheticScene({ seed: 5 });
    busy.step(tick(1, remove));
    busy.step(tick(-1));
    busy.inspect();
    busy.uiProjection();
    busy.renderState();
    busy.step(tick(0.5, add, add));
    busy.step(tick(0, remove, remove));
    busy.step(idle);
    busy.step(tick(0, add));

    expect(busy.inspect().marker).toEqual(direct.inspect().marker);
    expect(busy.inspect().rngState).toBe(direct.inspect().rngState);
  });

  it.each([0, 123456789, 4294967295])('keeps every coordinate in range and never reuses IDs for seed %i', (seed) => {
    const scene = createSyntheticScene({ seed });
    const ids: number[] = [];
    for (let n = 0; n < 200; n++) {
      const [added] = scene.step(tick(0, add, remove));
      if (added.type !== 'marker-added') throw new Error(`expected marker-added, got ${added.type}`);
      ids.push(added.entityId);
      for (const value of Object.values(added.position)) {
        expect(value >= SYNTHETIC_MARKER_MIN && value < SYNTHETIC_MARKER_MAX).toBe(true);
      }
    }
    expect(ids).toEqual(Array.from({ length: 200 }, (_, n) => n + 2));
  });

  it('uses a formula whose result stays inside [min, max) at the extreme random values', () => {
    // The equality tests above prove the scene matches this formula for real draws.
    expect(specCoordinate(0)).toBe(SYNTHETIC_MARKER_MIN);
    expect(specCoordinate((2 ** 32 - 1) / 2 ** 32)).toBeLessThan(SYNTHETIC_MARKER_MAX);
  });
});

describe('step: determinism and event shape (AC-07)', () => {
  const script: TickInput[] = [
    tick(1, add),
    tick(0.25),
    tick(-1, add, remove),
    idle,
    tick(0, remove, add, add),
    tick(-0.5, remove),
    tick(1, add, remove, add),
  ];

  it('gives identical events and outputs for independent instances with the same inputs', () => {
    const a = createSyntheticScene({ seed: 77, tickRateHz: 30 });
    const b = createSyntheticScene({ seed: 77, tickRateHz: 30 });
    for (const input of script) {
      expect(a.step(input)).toEqual(b.step(input));
      expect(a.inspect()).toEqual(b.inspect());
      expect(a.uiProjection()).toEqual(b.uiProjection());
      expect(a.renderState()).toEqual(b.renderState());
    }
  });

  it('returns plain-data events that survive a JSON round trip', () => {
    const scene = createSyntheticScene({ seed: 77 });
    for (const input of script) {
      const events = scene.step(input);
      expect(JSON.parse(JSON.stringify(events))).toEqual(events);
    }
  });
});

describe('step: output ownership (AC-08)', () => {
  it('leaves earlier events and views unchanged by later ticks', () => {
    const scene = createSyntheticScene({ seed: 13 });
    const events = scene.step(tick(1, add));
    const state = scene.inspect();
    const ui = scene.uiProjection();
    const render = scene.renderState();
    const copies = detached({ events, state, ui, render });

    scene.step(tick(1, remove));
    scene.step(tick(-1, add));
    scene.step(tick(1, remove, add));

    expect({ events, state, ui, render }).toEqual(copies);
    expect(scene.inspect()).not.toEqual(state);
  });

  it('rejects writes to returned events', () => {
    const [event] = createSyntheticScene({ seed: 13 }).step(tick(0, add));
    if (event.type !== 'marker-added') throw new Error(`expected marker-added, got ${event.type}`);
    expect(() => {
      (event.position as { x: number }).x = 0;
    }).toThrow(TypeError);
    expect(() => {
      (event as { tick: number }).tick = 0;
    }).toThrow(TypeError);
  });

  it('does not keep references to the caller’s tick input', () => {
    const scene = createSyntheticScene({ seed: 13 });
    const input: { input: { moveX: number }; commands: Command[] } = { input: { moveX: 1 }, commands: [add] };
    scene.step(input);
    const after = scene.inspect();
    input.input.moveX = -1;
    input.commands.push(remove);
    expect(scene.inspect()).toEqual(after);
    scene.step(idle);
    expect(scene.inspect()).toMatchObject({ mover: after.mover, marker: after.marker });
  });
});

describe('step: projections stay consistent (AC-09)', () => {
  function expectConsistent(scene: SyntheticScene): void {
    const before = scene.inspect();
    const ui = scene.uiProjection();
    const render = scene.renderState();
    expect(ui).toEqual({ scenario: 'synthetic', tick: before.tick, tickRateHz: before.tickRateHz, mover: before.mover, marker: before.marker });
    const expected = [{ ...before.mover, kind: 'mover' }];
    if (before.marker) expected.push({ ...before.marker, kind: 'marker' });
    expect(render).toEqual({ tick: before.tick, entities: expected });
    expect(render.entities.map((entity) => entity.id)).toEqual([...render.entities.map((entity) => entity.id)].sort((x, y) => x - y));
    expect(scene.inspect()).toEqual(before);
  }

  it('describes the same entities in every view without replaying events', () => {
    const scene = createSyntheticScene({ seed: 21 });
    expectConsistent(scene);
    scene.step(tick(1, add));
    expectConsistent(scene);
    scene.step(tick(0, remove));
    expectConsistent(scene);
    scene.step(tick(-1, add, remove, add));
    expectConsistent(scene);
  });
});
