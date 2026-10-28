import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import { vec } from '../presentation/presentation.test-support.ts';
import { HitShimmer, type ShimmerDrawing } from './hit-shimmer.ts';
import { bandPosition } from './shimmer-band.ts';
import {
  BASE_KIND, BOUNDS_KIND, hit, impact, MODEL, OTHER_KIND, OTHER_MODEL, PLAIN_MODEL, player, PLAYER, scriptedRandom, shimmerEntity, shimmerRun,
  shimmerState, shimmerSurfaces, tickOf, type StateOptions,
} from './shimmer.test-support.ts';

const DESTRUCTION = { viewMode: 0x11, subMode: 8 } as const;
const own = (drawings: readonly ShimmerDrawing[]) => drawings.map((drawing) => (drawing.type === 'own' ? [drawing.entityId, drawing.wrap, drawing.band] : drawing.type));

/** Advances `run` through ticks `from`…`to` with the same entities and no events. */
function idle(advance: (render: RenderState, events?: readonly DomainEvent[]) => void, from: number, to: number, entities: readonly RenderEntity[], options?: StateOptions): void {
  for (let tick = from; tick <= to; tick++) advance(shimmerState(tick, entities, options));
}

describe('hit shimmer visuals', () => {
  it('gives each new own visual one wrap draw, modulo its family’s count, once it has a model', () => {
    const random = scriptedRandom(37, 5, 9);
    const { shimmer, advance } = shimmerRun(random);
    const entities = [player(), shimmerEntity(3), shimmerEntity(4, { kindBit: BOUNDS_KIND })];
    advance(shimmerState(1, [player({ display: 'pending' }), shimmerEntity(3, { display: 'pending' })]));
    expect(random.drawn()).toBe(0);
    advance(shimmerState(2, entities));
    advance(shimmerState(3, entities));
    expect(random.drawn()).toBe(3);
    advance(shimmerState(4, entities), [hit(4, 3), hit(4, 4)]);
    // The start and the pose each advance the wrap: 5 + 2 for the wingman; kind 0x80 keeps its one wrap.
    expect(own(shimmer.drawings())).toEqual([[3, 7, 0], [4, 0, 0]]);
    expect(shimmer.drawings()[0]).toMatchObject({ model: MODEL, family: 'turning' });
    expect(shimmer.drawings()[1]).toMatchObject({ model: MODEL, family: 'bounds' });
  });

  it('draws nothing for shared kinds, kinds of neither family, models without a list 2 or non-model entities', () => {
    const random = scriptedRandom();
    const { shimmer, advance } = shimmerRun(random);
    const entities = [player({ model: PLAIN_MODEL }), shimmerEntity(2, { kindBit: BASE_KIND }), shimmerEntity(3, { kindBit: OTHER_KIND }), shimmerEntity(4, { model: PLAIN_MODEL })];
    advance(shimmerState(1, entities), [hit(1, 3), hit(1, 4)]);
    expect(random.drawn()).toBe(0);
    expect(shimmer.drawings()).toEqual([]);
  });

  it('forgets a visual that is released or unlisted, and draws again for its next visual', () => {
    const random = scriptedRandom(1, 2, 3, 4);
    const { advance } = shimmerRun(random);
    advance(shimmerState(1, [player(), shimmerEntity(3)]));
    advance(shimmerState(2, [player(), shimmerEntity(3, { display: 'released' })]));
    advance(shimmerState(3, [player(), shimmerEntity(3)]));
    advance(shimmerState(4, [player()]));
    advance(shimmerState(5, [player(), shimmerEntity(3)]));
    // The player's visual once, entity 3's three visuals.
    expect(random.drawn()).toBe(4);
  });

  it('refuses a drawn model that was not prepared', () => {
    const { advance } = shimmerRun();
    expect(() => advance(shimmerState(1, [shimmerEntity(3, { model: 'model/unknown' as typeof MODEL })]))).toThrow(ContentContractError);
  });
});

describe('own shells', () => {
  const crowd = (options: Parameters<typeof shimmerEntity>[1] = {}) => [player(), shimmerEntity(3, options)];

  it('starts at t = 0, then shows the band of the tick’s clock, advancing the wrap once per pose', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0, 5));
    advance(shimmerState(1, crowd()));
    expect(shimmer.drawings()).toEqual([]);
    advance(shimmerState(2, crowd()), [hit(2, 3)]);
    expect(own(shimmer.drawings())).toEqual([[3, 7, 0]]);
    advance(shimmerState(3, crowd()));
    expect(own(shimmer.drawings())).toEqual([[3, 8, bandPosition(6, 4)]]);
    expect(bandPosition(6, 4)).toBe(3);
  });

  it('advances the wrap once per hit of a tick and wraps it to 0 at the family’s count', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0, 28));
    advance(shimmerState(1, crowd()));
    advance(shimmerState(2, crowd()), [hit(2, 3), hit(2, 3), hit(2, 3)]);
    expect(own(shimmer.drawings())).toEqual([[3, 0, 0]]);
    advance(shimmerState(3, crowd()));
    expect(own(shimmer.drawings())).toEqual([[3, 1, 3]]);
  });

  it('shows the band until t = 250 and ends at the first step past it, 126 clock units after the start', () => {
    const { shimmer, advance } = shimmerRun();
    advance(shimmerState(1, crowd()), [hit(1, 3)]);
    // Clock 2 at the start: tick 63 (clock 126) gives t = 247, tick 64 (clock 128) 251.
    idle(advance, 2, 63, crowd());
    expect(own(shimmer.drawings())).toEqual([[3, 64 % 32, 247]]);
    advance(shimmerState(64, crowd()));
    expect(shimmer.drawings()).toEqual([]);
  });

  it('restarts the band on a new hit while running', () => {
    const { shimmer, advance } = shimmerRun();
    advance(shimmerState(1, crowd()), [hit(1, 3)]);
    idle(advance, 2, 20, crowd());
    advance(shimmerState(21, crowd()), [hit(21, 3)]);
    expect(own(shimmer.drawings())[0][2]).toBe(0);
    idle(advance, 22, 83, crowd());
    expect(own(shimmer.drawings())[0][2]).toBe(bandPosition(166, 42));
    expect(bandPosition(166, 42)).toBe(247);
  });
});

describe('Q-05 branches', () => {
  it('leaves the player’s entity to the screen flash outside view 0x11, and shimmers it in 0x11 (the killing hit’s tick)', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(3));
    advance(shimmerState(1, [player()]), [hit(1, PLAYER)]);
    advance(shimmerState(2, [player({ display: 'shown' })]), [hit(2, PLAYER)]);
    expect(shimmer.drawings()).toEqual([]);
    advance(shimmerState(3, [player({ display: 'shown' })], DESTRUCTION), [hit(3, PLAYER)]);
    expect(own(shimmer.drawings())).toEqual([[PLAYER, 5, 0]]);
  });

  it('starts nothing with the shield already empty, for the parked engagement or for an unlisted, pending or released victim', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0, 0));
    const entities = [player(), shimmerEntity(3), shimmerEntity(4, { display: 'pending' }), shimmerEntity(5, { display: 'released' })];
    advance(shimmerState(1, entities), [hit(1, 3, { shieldWasEmpty: true }), hit(1, 3, { cause: 'parked' }), hit(1, 4), hit(1, 5), hit(1, 9)]);
    expect(shimmer.drawings()).toEqual([]);
    for (const cause of ['projectile', 'missile', 'collision', 'area'] as const) {
      advance(shimmerState(shimmer.tick + 1, entities), [hit(shimmer.tick + 1, 3, { cause })]);
      expect(own(shimmer.drawings())[0][2]).toBe(0);
    }
  });

  it('starts nothing while the player object is in Warp and freezes a running shell until the Warp ends', () => {
    const { shimmer, advance } = shimmerRun();
    advance(shimmerState(1, [player(), shimmerEntity(3)]), [hit(1, 3)]);
    advance(shimmerState(2, [player(), shimmerEntity(3)]));
    const frozen = own(shimmer.drawings());
    expect(frozen).toEqual([[3, 3, 3]]);
    const warped = [player({ inWarp: true }), shimmerEntity(3), shimmerEntity(4)];
    advance(shimmerState(3, warped), [hit(3, 4)]);
    idle(advance, 4, 80, warped);
    expect(own(shimmer.drawings())).toEqual(frozen);
    advance(shimmerState(81, [player(), shimmerEntity(3), shimmerEntity(4)]));
    expect(shimmer.drawings()).toEqual([]);
  });

  it('reads the view, the player object and its Warp at the tick’s end, not at the hit', () => {
    const { shimmer, advance } = shimmerRun();
    // The hit of the tick in which the player's Warp starts starts nothing.
    advance(shimmerState(1, [player({ inWarp: true }), shimmerEntity(3)]), [hit(1, 3)]);
    expect(shimmer.drawings()).toEqual([]);
  });

  it('freezes shells while no player object exists, yet starts on a hit then (stray +0xCC read, Likely, U-027)', () => {
    const { shimmer, advance } = shimmerRun();
    advance(shimmerState(1, [player(), shimmerEntity(3), shimmerEntity(4)]), [hit(1, 3)]);
    const frozen = own(shimmer.drawings());
    idle(advance, 2, 90, [shimmerEntity(3), shimmerEntity(4)], { observed: null });
    expect(own(shimmer.drawings())).toEqual(frozen);
    // The start steps once at t = 0; without a player object no pose follows.
    advance(shimmerState(91, [shimmerEntity(3), shimmerEntity(4)], { observed: null }), [hit(91, 4)]);
    expect(own(shimmer.drawings())).toEqual([...frozen, [4, 1, 0]]);
    idle(advance, 92, 95, [shimmerEntity(3), shimmerEntity(4)], { observed: null });
    expect(own(shimmer.drawings())).toEqual([...frozen, [4, 1, 0]]);
    // Once a player object exists again, poses resume: entity 3's shell is long over, entity 4's runs on.
    advance(shimmerState(96, [player(), shimmerEntity(3), shimmerEntity(4)]));
    expect(own(shimmer.drawings())).toEqual([[4, 2, bandPosition(192, 182)]]);
  });

  it('removes the player’s shell when its model is hidden and refuses a start on a hidden visual', () => {
    const { shimmer, advance } = shimmerRun();
    advance(shimmerState(1, [player({ display: 'shown' })], DESTRUCTION), [hit(1, PLAYER)]);
    expect(shimmer.drawings()).toHaveLength(1);
    advance(shimmerState(2, [player()], DESTRUCTION));
    expect(shimmer.drawings()).toEqual([]);
    advance(shimmerState(3, [player({ display: 'shown' })], DESTRUCTION));
    expect(shimmer.drawings()).toEqual([]);
    expect(() => advance(shimmerState(4, [player()], DESTRUCTION), [hit(4, PLAYER)])).toThrow(expect.objectContaining({ kind: 'unsupported-branch' }));
  });
});

describe('shared shells', () => {
  const bases = () => [player(), shimmerEntity(4, { kindBit: BASE_KIND, model: OTHER_MODEL }), shimmerEntity(5, { kindBit: BASE_KIND })];
  /** Each record's [step, local x, local y], newest first. */
  const shared = (drawings: readonly ShimmerDrawing[]) => drawings.map((drawing) => (drawing.type === 'shared' ? [drawing.wrap, drawing.local.x, drawing.local.y] : drawing.type));
  const rowsOf = (drawing: ShimmerDrawing) => (drawing.type === 'shared' ? drawing.rows.map((value) => value + 0) : []);
  /** The shared step `elapsed` clock units after a record's start. */
  const stepAfter = (elapsed: number) => Math.min(Math.trunc(bandPosition(elapsed, 0) / 15), 15);

  it('places a record at the impact’s local point oriented by its face, with the first shared visual’s model', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), [hit(1, 5, { impact: impact(vec(1, 2, 3), 3) }), hit(1, 5)]);
    expect(shimmer.drawings()).toEqual([expect.objectContaining({ type: 'shared', entityId: 5, model: OTHER_MODEL, family: 'shared', wrap: 0, band: 0, local: { x: 1, y: 2, z: 3 } })]);
    expect(rowsOf(shimmer.drawings()[0])).toEqual([0, 0, 1, 0, -1, 0, 1, 0, 0]);
  });

  it('orients each face by direction = its outward axis and up = its second basis vector', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), [0, 1, 2, 3, 4, 5].map((face) => hit(1, 5, { impact: impact(vec(face * 20), face as 0) })));
    expect(shimmer.drawings().map(rowsOf).reverse()).toEqual([
      [0, 0, 1, 0, 1, 0, -1, 0, 0], [1, 0, 0, 0, 0, 1, 0, -1, 0], [-1, 0, 0, 0, 1, 0, 0, 0, -1],
      [0, 0, 1, 0, -1, 0, 1, 0, 0], [-1, 0, 0, 0, 0, 1, 0, 1, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1],
    ]);
  });

  it('steps every 15 band positions up to step 15 and ends a record past 250', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), [hit(1, 5, { impact: impact(vec(0)) })]);
    const at = (tick: number) => {
      idle(advance, shimmer.tick + 1, tick, bases());
      return shared(shimmer.drawings()).map(([step]) => step);
    };
    // Start clock 2: tick 4 → t = 11, tick 5 → 15, tick 61 → 239, tick 63 → 247, tick 64 → 251.
    expect([at(4), at(5), at(61), at(63), at(64)]).toEqual([[0], [1], [15], [15], []]);
  });

  it('restarts the newest record within a squared distance below 100 and inserts a newest one otherwise', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), [hit(1, 5, { impact: impact(vec(0)) })]);
    advance(shimmerState(2, bases()), [hit(2, 5, { impact: impact(vec(30)) })]);
    idle(advance, 3, 10, bases());
    expect(shared(shimmer.drawings())).toEqual([[stepAfter(16), 30, 0], [stepAfter(18), 0, 0]]);
    advance(shimmerState(11, bases()), [hit(11, 5, { impact: impact(vec(0, 9.99, 0)) })]);
    expect(shared(shimmer.drawings())).toEqual([[stepAfter(18), 30, 0], [0, 0, 0]]);
    advance(shimmerState(12, bases()), [hit(12, 5, { impact: impact(vec(0, 10, 0)) })]);
    expect(shared(shimmer.drawings())).toEqual([[0, 0, 10], [stepAfter(20), 30, 0], [stepAfter(2), 0, 0]]);
    // (0, 5, 0) is within reach of (0, 10, 0) and of (0, 0, 0): only the newest restarts.
    idle(advance, 13, 20, bases());
    advance(shimmerState(21, bases()), [hit(21, 5, { impact: impact(vec(0, 5, 0)) })]);
    expect(shared(shimmer.drawings())).toEqual([[0, 0, 10], [stepAfter(38), 30, 0], [stepAfter(20), 0, 0]]);
  });

  it('holds at most 16 records and drops a far hit then', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), Array.from({ length: 17 }, (_, at) => hit(1, 5, { impact: impact(vec(at * 20)) })));
    expect(shared(shimmer.drawings()).map(([, x]) => x)).toEqual(Array.from({ length: 16 }, (_, at) => (15 - at) * 20));
  });

  it('ends a record past 250 together with every later one, restarted or not', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), [hit(1, 5, { impact: impact(vec(0)) })]);
    advance(shimmerState(2, bases()), [hit(2, 5, { impact: impact(vec(50)) })]);
    idle(advance, 3, 30, bases());
    // Restarts the older record (0, 0, 0) at clock 62; the newer one (50) started at clock 4.
    advance(shimmerState(31, bases()), [hit(31, 5, { impact: impact(vec(1)) })]);
    idle(advance, 32, 64, bases());
    expect(shared(shimmer.drawings())).toEqual([[15, 50, 0], [stepAfter(128 - 62), 0, 0]]);
    advance(shimmerState(65, bases()));
    expect(shared(shimmer.drawings())).toEqual([]);
  });

  it('freezes records while the player object is in Warp', () => {
    const { shimmer, advance } = shimmerRun(scriptedRandom(0));
    advance(shimmerState(1, bases()), [hit(1, 5, { impact: impact(vec(0)) })]);
    idle(advance, 2, 10, bases());
    const frozen = shared(shimmer.drawings());
    const warped = [player({ inWarp: true }), ...bases().slice(1)];
    advance(shimmerState(11, warped), [hit(11, 5, { impact: impact(vec(90)) })]);
    idle(advance, 12, 40, warped);
    expect(shared(shimmer.drawings())).toEqual(frozen);
  });
});

describe('tick order', () => {
  it('processes several ticks of a frame in order and nothing for a still frame', () => {
    const surfaces = shimmerSurfaces();
    const shimmer = new HitShimmer({ models: surfaces.models, initial: shimmerState(4, []), random: scriptedRandom(0, 0) });
    shimmer.advance([]);
    shimmer.advance([tickOf(shimmerState(5, [player(), shimmerEntity(3)]), [hit(5, 3)]), tickOf(shimmerState(6, [player(), shimmerEntity(3)]))]);
    expect(shimmer.tick).toBe(6);
    expect(own(shimmer.drawings())).toEqual([[3, 3, 3]]);
  });

  it('rejects a gap or a repeated tick unchanged', () => {
    const { shimmer, advance } = shimmerRun();
    advance(shimmerState(1, [player()]));
    for (const tick of [1, 3]) {
      expect(() => advance(shimmerState(tick, [player()]))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    }
    expect(shimmer.tick).toBe(1);
    advance(shimmerState(2, [player()]));
    expect(shimmer.tick).toBe(2);
  });
});
