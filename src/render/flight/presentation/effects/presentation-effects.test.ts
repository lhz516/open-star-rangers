import { describe, expect, it } from 'vitest';
import { RAND_SCALE } from '../../../../core/rules/original-random.ts';
import type { Vec3 } from '../../../../core/contracts/domain-events.ts';
import type { RenderEntity } from '../../../../core/projections/render-state.ts';
import type { PresentationError } from '../presentation-budget.ts';
import type { PresentationExplosion } from '../presentation-contract.ts';
import {
  EffectsRun, explosionCreated, explosionEntity, explosionStarted, player, vec, viewSwitched, type CreatedOptions,
} from './effects.test-support.ts';
import { FLASH_REQUEST_TICKS } from './presentation-effects.ts';

const kind = (name: PresentationError['kind']) => expect.objectContaining({ name: 'PresentationError', kind: name });
/** A jitter draw of 1 for a small kind: F(1 × C × 30 − 15). */
const T = Math.fround(RAND_SCALE * 30 - 15);
const EXPLOSION = 10;
/** The Core explosion drifts 1 unit per tick along z (32 units/s, 2 clock units per tick). */
const DRIFT = vec(0, 0, 32);
const keys = (explosions: readonly PresentationExplosion[]) => explosions.map(({ key }) => key);

/**
 * A craft (kind 7 by default) destroyed in tick 1's collisions at `at`, in front of the camera at the origin: its
 * explosion is pending in tick 1, activates in tick 2 and drifts until it asks to leave in tick 51.
 */
function destroyed(at: Vec3 = vec(0, 0, 100), options: CreatedOptions = {}) {
  const run = new EffectsRun();
  const { sourceKindBit = 7 } = options;
  const core = (tick: number): RenderEntity[] => (tick <= 51
    ? [explosionEntity(EXPLOSION, { position: vec(at.x, at.y, at.z + tick - 1), sourceKindBit, display: tick === 1 ? 'pending' : tick === 51 ? 'released' : 'shown' })]
    : []);
  run.step(core(1), [explosionCreated(1, EXPLOSION, { position: at, velocity: DRIFT, ...options })]);
  const started = run.step(core(2), [explosionStarted(2, EXPLOSION, at, { sourceKindBit })]);
  return { run, core, started, to: (tick: number) => run.stepTo(tick, core) };
}

describe('extra explosions', () => {
  it('builds them with the camera before the step, activates them after their delay and drifts them until they leave', () => {
    const { run, core, started, to } = destroyed();
    expect(started.activations.map(({ key }) => key)).toEqual(['core:10']);
    // One extra (rand AND 3 = 1), two units towards the camera and jittered along R0.x and R1.y; delay 1 after tick 2.
    const third = run.step(core(3));
    expect(third.activations).toEqual([{
      key: 'extra:1', origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal: 0 }, sourceKindBit: null, variant: 'other',
      selection: { list: 1, item: 2 }, tick: 3, clock: 6, position: vec(T, T, 98),
    }]);
    expect(run.presentation.explosions().find(({ key }) => key === 'extra:1')?.position).toEqual(vec(T, T, 99));
    // Removal asked at the first clock past 6 + 0x60 (tick 52), whose render no longer draws it (PV6).
    to(51);
    expect(keys(run.presentation.explosions())).toEqual(['core:10', 'extra:1']);
    expect(run.presentation.explosions()[1].position).toEqual(vec(T, T, 98 + 49));
    to(52);
    expect(run.presentation.explosions()).toEqual([]);
  });

  it('activates 2⌊r/2⌋ + 2 clock units after the main explosion for every delay r (B-009: 6 to 24 at uneven steps)', () => {
    const deltas = Array.from({ length: 21 }, (_, delay) => {
      const run = new EffectsRun();
      const core = [explosionEntity(EXPLOSION, { position: vec(0, 0, 100), display: 'pending' })];
      run.step(core, [explosionCreated(1, EXPLOSION, { position: vec(0, 0, 100) })]);
      run.random.queue(1, delay);
      run.step([explosionEntity(EXPLOSION, { position: vec(0, 0, 100) })], [explosionStarted(2, EXPLOSION, vec(0, 0, 100))]);
      for (;;) {
        const tick = run.step([explosionEntity(EXPLOSION, { position: vec(0, 0, 100) })]);
        if (tick.activations.length > 0) return tick.activations[0].clock - 4;
      }
    });
    expect(deltas).toEqual(Array.from({ length: 21 }, (_, delay) => 2 * Math.floor(delay / 2) + 2));
  });

  it('starts counting at the same tick for an explosion built in object update', () => {
    const run = new EffectsRun();
    const at = vec(0, 0, 100);
    const first = run.step([explosionEntity(EXPLOSION, { position: at })], [explosionCreated(1, EXPLOSION, { position: at, stage: 'object-update' }), explosionStarted(1, EXPLOSION, at)]);
    expect(first.activations.map(({ key }) => key)).toEqual(['core:10']);
    expect(run.step([explosionEntity(EXPLOSION, { position: at })]).activations.map(({ key }) => key)).toEqual(['extra:1']);
  });

  it('builds the delayed player explosion\'s extras in its own tick, from the camera before that tick', () => {
    const run = new EffectsRun();
    run.stepTo(4);
    const at = vec(0, 0, 100);
    // The camera ends tick 5 at x 100: the extras still use the origin, and the first callback is in tick 6.
    const aside = player(vec(100, 0, 0));
    run.step([aside, explosionEntity(EXPLOSION, { position: at, sourceKindBit: 0, display: 'pending' })], [explosionCreated(5, EXPLOSION, { position: at, sourceKindBit: 0, stage: 'delayed-player-explosion' })]);
    run.step([aside, explosionEntity(EXPLOSION, { position: at, sourceKindBit: 0 })], [explosionStarted(6, EXPLOSION, at, { sourceKindBit: 0 })]);
    const extra = run.step([aside, explosionEntity(EXPLOSION, { position: at, sourceKindBit: 0 })]);
    expect(extra.activations).toMatchObject([{ key: 'extra:1', tick: 7, position: vec(T, T, 98) }]);
    // The flash check at tick 7 sees the camera at x 100: L1 200, no flash.
    expect(run.effects.flashRequests(7)).toEqual([]);
  });

  it('makes (rand AND 3) + 2 large extras and no fragment events for large kinds', () => {
    const { run, to } = destroyed(vec(0, 0, 100), { sourceKindBit: 2, variant: 'large' });
    to(3);
    expect(run.ticks[2].activations.map(({ key, variant }) => [key, variant])).toEqual([['extra:1', 'large'], ['extra:2', 'large'], ['extra:3', 'large']]);
    to(12);
    expect(run.effects.fragments()).toEqual([]);
  });

  it('makes nothing for an explosion whose source is no craft', () => {
    const { run, to } = destroyed(vec(0, 0, 100), { sourceKindBit: 20, variant: 'missile' });
    to(3);
    expect(run.effects.flashRequests(3)).toEqual([]);
    to(12);
    expect(run.ticks.flatMap(({ activations }) => activations.map(({ key }) => key))).toEqual(['core:10']);
    expect(run.effects.fragments()).toEqual([]);
  });

  it('drops the extras of an explosion removed before its first callback, and rejects an activation at any other tick', () => {
    const run = new EffectsRun();
    run.step([explosionEntity(EXPLOSION, { display: 'pending' })], [explosionCreated(1, EXPLOSION)]);
    run.step();
    run.stepTo(10);
    expect(run.presentation.explosions()).toEqual([]);

    const late = new EffectsRun();
    late.step([explosionEntity(EXPLOSION, { display: 'pending' })], [explosionCreated(1, EXPLOSION)]);
    expect(() => late.step([explosionEntity(EXPLOSION, { display: 'pending' })])).toThrow(kind('invariant-violated'));
    const early = new EffectsRun();
    expect(() => early.step([explosionEntity(EXPLOSION)], [explosionCreated(1, EXPLOSION), explosionStarted(1, EXPLOSION, vec(0))])).toThrow(kind('invariant-violated'));
    const unknown = new EffectsRun();
    expect(() => unknown.step([explosionEntity(EXPLOSION)], [explosionStarted(1, EXPLOSION, vec(0))])).toThrow(kind('invariant-violated'));
  });
});

describe('event 0x10 and the discriminator-1/2 fragments', () => {
  it('sheds discriminator 1 at 0xC and discriminator 2 at 0x10 from the explosion as the previous tick ended it', () => {
    const { run, to } = destroyed();
    to(7);
    expect(run.effects.fragments()).toEqual([]);
    to(8);
    const shed = run.effects.fragments();
    // (1 AND 3) + 10 discriminator-1 fragments at z 106, waiting for their first callback.
    expect(shed).toHaveLength(11);
    expect(shed[0]).toMatchObject({
      key: 'fragment:1', discriminator: 1, part: null, shape: 1, explodesOnExpiry: false, parentExplosionKey: 'core:10', sourceKindBit: 7,
      display: 'pending', position: vec(0, 0, 106), createdTick: 8, activeTick: null, explosionKey: null, releasedTick: null,
    });
    to(9);
    const [moved] = run.effects.fragments();
    expect(moved).toMatchObject({ display: 'shown', activeTick: 9 });
    // The base velocity is the explosion's (32 along z) plus about 4 units/s along the drawn direction, for 1/32 s.
    expect(moved.position.z).toBeCloseTo(106 + (32 + 4 * Math.cos(5 * Math.PI / 180)) / 32, 3);
    expect(moved.rows).not.toEqual(shed[0].rows);
    to(10);
    expect(run.effects.fragments().slice(11)).toEqual([expect.objectContaining({ key: 'fragment:12', discriminator: 2, part: 0, shape: null, position: vec(0, 0, 108), display: 'pending' })]);
    // Discriminator 1 expires 0x100 + 1 after its first callback (clock 18): released in tick 138 and gone in 139.
    to(137);
    expect(run.effects.fragments()[0].display).toBe('shown');
    to(138);
    expect(run.effects.fragments()[0]).toMatchObject({ display: 'released', releasedTick: 138 });
    to(139);
    expect(run.effects.fragments().map(({ key }) => key)).toEqual(['fragment:12']);
  });

  it('explodes a flagged discriminator-2 fragment, which drifts on until its explosion\'s animation ends', () => {
    const { run, to } = destroyed();
    to(9);
    // Mode 2's count 1, then the fragment's flag draw 10 (rand % 10 = 0).
    run.random.queue(1, 10);
    to(10);
    const fragment = run.effects.fragments()[11];
    expect(fragment).toMatchObject({ key: 'fragment:12', explodesOnExpiry: true });
    // First callback at clock 22, expiry 22 + 0x200 + 1 = 535: due at clock 536, tick 268.
    to(267);
    const before = run.effects.fragments().find(({ key }) => key === 'fragment:12');
    to(268);
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')).toMatchObject({ display: 'shown', explosionKey: null });
    const [activation, ...others] = run.step().activations;
    expect(others).toEqual([]);
    expect(activation).toMatchObject({
      key: 'fragment-explosion:1', origin: { type: 'fragment', fragmentKey: 'fragment:12' }, sourceKindBit: 24, variant: 'other', tick: 269, clock: 538,
      position: before?.position,
    });
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')).toMatchObject({ display: 'shown', explosionKey: 'fragment-explosion:1' });
    // 12 frames end 56 clock units after activation (tick 297): the fragment is released then, and leaves at 298.
    to(296);
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')?.display).toBe('shown');
    to(297);
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')).toMatchObject({ display: 'released', releasedTick: 297 });
    to(298);
    expect(run.effects.fragments()).toEqual([]);
    expect(keys(run.presentation.explosions())).toEqual(['fragment-explosion:1']);
    // The explosion asks to leave past 538 + 0x60, in tick 318.
    to(317);
    expect(keys(run.presentation.explosions())).toEqual(['fragment-explosion:1']);
    to(318);
    expect(run.presentation.explosions()).toEqual([]);
  });

  it('keeps mode 2 only from 300 to under 450, and nothing off screen or farther', () => {
    const shed = (z: number, y = 0) => {
      const { run, to } = destroyed(vec(0, y, z));
      to(10);
      return run.effects.fragments().map(({ discriminator }) => discriminator);
    };
    expect(shed(299)).toEqual([...Array<number>(11).fill(1), 2]);
    expect(shed(350)).toEqual([2]);
    expect(shed(450)).toEqual([]);
    expect(shed(300, 200)).toEqual([]);
  });

  it('gates with the viewport a mission-flow switch of the same tick sets, not a later switch', () => {
    const gate = (stage: 'mission-flow' | 'request-handling') => {
      const run = new EffectsRun();
      const at = vec(0, -80, 250);
      run.step([explosionEntity(EXPLOSION, { position: at, display: 'pending' })], [explosionCreated(1, EXPLOSION, { position: at })]);
      run.step([explosionEntity(EXPLOSION, { position: at })], [viewSwitched(2, 8, 0, stage), explosionStarted(2, EXPLOSION, at)], { viewMode: 8 });
      run.stepTo(10, () => [explosionEntity(EXPLOSION, { position: at })], { viewMode: 8 });
      return run.effects.fragments().length;
    };
    // sy = trunc(639 × 80 ÷ 250) + cy: 361 is below F1's 315, 443 within the full screen's 479.
    expect([gate('mission-flow'), gate('request-handling')]).toEqual([12, 0]);
  });

  it('posts no event for an explosion that left state 7', () => {
    const { run } = destroyed();
    run.stepTo(10, (tick) => [explosionEntity(EXPLOSION, { position: vec(0, 0, 99 + tick), display: tick >= 5 ? 'released' : 'shown' })]);
    expect(run.effects.fragments()).toEqual([]);
  });
});

describe('safe integers', () => {
  it('faults with presentation-capacity before a deadline leaves the safe integers', () => {
    const run = new EffectsRun();
    const at = vec(0, 0, 100);
    const last = Number.MAX_SAFE_INTEGER - 1;
    run.step([explosionEntity(EXPLOSION, { position: at, display: 'pending' })], [explosionCreated(1, EXPLOSION, { position: at })], { clock: last - 2 });
    const started = { ...explosionStarted(2, EXPLOSION, at), activationClock: last };
    expect(() => run.step([explosionEntity(EXPLOSION, { position: at })], [started], { clock: last })).toThrow(kind('presentation-capacity'));
  });
});

describe('the area check', () => {
  it('removes active fragments and explosions outside the active area, as without a centre, but not held fragments', () => {
    for (const centre of [vec(1e6), null]) {
      const { run, core, to } = destroyed();
      to(11);
      run.step(core(12), [], { activeAreaCentre: centre });
      expect(new Set(run.effects.fragments().map(({ display, releasedTick }) => `${display}@${releasedTick}`))).toEqual(new Set(['released@12']));
      expect(keys(run.presentation.explosions())).toEqual(['core:10']);
      run.step(core(13));
      expect(run.effects.fragments()).toEqual([]);
    }

    const { run, to } = destroyed();
    to(9);
    run.random.queue(1, 10);
    to(269);
    run.step([], [], { activeAreaCentre: vec(1e6) });
    // The explosion's visual goes at once; its next callback lets the fragment go, which leaves the tick after.
    expect(keys(run.presentation.explosions())).toEqual([]);
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')?.display).toBe('shown');
    run.step();
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')).toMatchObject({ display: 'released', releasedTick: 271 });
    run.step();
    expect(run.effects.fragments().find(({ key }) => key === 'fragment:12')).toBeUndefined();
  });
});

describe('flash check', () => {
  it('requests one flash at the first update after a craft explosion activates, seen from the camera before that step', () => {
    const { run, to } = destroyed();
    to(3);
    expect(run.effects.flashRequests(2)).toEqual([]);
    expect(run.effects.flashRequests(3)).toEqual([{ tick: 3, clock: 6, explosionKey: 'core:10', sourceKindBit: 7 }]);
    to(3 + FLASH_REQUEST_TICKS - 1);
    expect(run.effects.flashRequests(3)).toHaveLength(1);
    to(3 + FLASH_REQUEST_TICKS);
    expect(() => run.effects.flashRequests(3)).toThrow(kind('invalid-input'));
    for (let tick = 4; tick <= run.tick; tick++) expect(run.effects.flashRequests(tick)).toEqual([]);
  });

  it('flashes for large kinds at any distance, and for others not beyond L1 150', () => {
    const flashes = (z: number, sourceKindBit: number) => {
      const { run, to } = destroyed(vec(0, 0, z), { sourceKindBit, variant: sourceKindBit === 2 ? 'large' : 'other' });
      to(3);
      return run.effects.flashRequests(3).length;
    };
    // At tick 3 the explosion is one unit farther than built.
    expect([flashes(2000, 2), flashes(148, 7), flashes(149, 7)]).toEqual([1, 1, 0]);
  });
});
