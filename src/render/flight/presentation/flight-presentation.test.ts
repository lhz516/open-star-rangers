import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import { CORE_LIMITS } from '../../../core/contracts/limits.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { scriptedRand } from '../../../core/rules/rand.test-support.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { createFlightPresentation, presentationRandom, type FlightPresentation, type FlightPresentationInput } from './flight-presentation.ts';
import { checkCapacity, PRESENTATION_LIMITS, type PresentationError } from './presentation-budget.ts';
import { presentationViewport } from './presentation-camera.ts';
import type { PresentationEffects, PresentationEffectsStep, PresentationTick } from './presentation-contract.ts';
import {
  explosionStarted, frame, IDENTITY, otherEvent, presentationContent, renderEntity, renderState, tickInput, vec,
} from './presentation.test-support.ts';

/** The subset draws: starts 1, 1 and 0 of the synthetic lists of 3, 2 and 1 give [1, 2, 0, 1, 2], [1, 0, 1, 0, 1], [0, 0, 0]. */
const SUBSET_DRAWS = [1, 1, 0];
const PLAYER = 1;
const player = (position = vec(0), orientation = IDENTITY): RenderEntity => renderEntity(PLAYER, { position, orientation });
const flying = (tick: number, entities: readonly RenderEntity[] = [player()], viewMode = 0x0c): RenderState =>
  renderState(tick, { viewMode, observedEntityId: PLAYER, entities });

function start(draws: readonly number[] = [], overrides: Partial<FlightPresentationInput> = {}) {
  const random = scriptedRand([...SUBSET_DRAWS, ...draws]);
  const presentation = createFlightPresentation({ ownerId: 1, runId: 1, content: presentationContent(), initial: flying(0), random, ...overrides });
  return { presentation, random };
}

function record(presentation: FlightPresentation): PresentationTick[] {
  const ticks: PresentationTick[] = [];
  presentation.subscribe((tick) => { ticks.push(tick); });
  return ticks;
}

const kind = (kindName: PresentationError['kind']) => expect.objectContaining({ name: 'PresentationError', kind: kindName });

describe('flight presentation start', () => {
  it('draws the subset, then forms tick 0 camera from the observed pose', () => {
    const rows = Object.freeze([0, 1, 0, -1, 0, 0, 0, 0, 1]) as unknown as Matrix3;
    const random = scriptedRand(SUBSET_DRAWS);
    const presentation = createFlightPresentation({
      ownerId: 3, runId: 9, content: presentationContent(), initial: flying(0, [player(vec(5, 6, 7), rows)]), random,
    });
    expect(random.used).toBe(3);
    expect(presentation.camera()).toEqual({ tick: 0, position: vec(5, 6, 7), rows, viewMode: 0x0c, subMode: 0, viewport: presentationViewport(0x0c, 0) });
    expect(presentation.explosions()).toEqual([]);
  });

  it('starts from the origin and identity rows without an observed entity', () => {
    const { presentation } = start([], { initial: renderState(0) });
    expect(presentation.camera()).toMatchObject({ tick: 0, position: vec(0), rows: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  });

  it('rejects content, a tick other than 0, a bad identity and an unsupported view before drawing', () => {
    const content = presentationContent();
    const cases: [Partial<FlightPresentationInput>, string][] = [
      [{ content: { ...content, nebula: { images: [] } } }, 'ContentContractError'],
      [{ initial: flying(1) }, 'PresentationError'],
      [{ runId: -1 }, 'PresentationError'],
      [{ ownerId: 1.5 }, 'PresentationError'],
    ];
    for (const [overrides, name] of cases) {
      const random = scriptedRand(SUBSET_DRAWS);
      expect(() => createFlightPresentation({ ownerId: 1, runId: 1, content, initial: flying(0), random, ...overrides })).toThrow(expect.objectContaining({ name }));
      expect(random.used).toBe(0);
    }
    expect(() => start([], { initial: renderState(0, { viewMode: 0x11 }) })).toThrow(kind('unsupported-view'));
  });

  it('seeds a presentation random source of its own from a uint32', () => {
    const values = (random: RandSource) => Array.from({ length: 4 }, () => random.next());
    expect(values(presentationRandom(7))).toEqual(values(presentationRandom(7)));
    expect(values(presentationRandom(7))).not.toEqual(values(presentationRandom(8)));
    for (const seed of [-1, 2 ** 32, 0.5]) expect(() => presentationRandom(seed)).toThrow(kind('invalid-input'));
  });
});

describe('explosion activation', () => {
  it('chooses each Core explosion once, with the camera before the step, on both sides of 400', () => {
    // Tick 1: the camera moves from the origin to z 300; an explosion at z 400 is 400 from the camera before the step.
    // Tick 2: one at z 650 is 350 from the camera before the step (tick 1's), though 650 from the origin.
    const { presentation, random } = start([4, 3]);
    const ticks = record(presentation);
    const one = flying(1, [player(vec(0, 0, 300)), renderEntity(10, { explosion: 'other' })]);
    const two = flying(2, [player(vec(0, 0, 300)), renderEntity(10, { explosion: 'other' }), renderEntity(11, { explosion: 'other' })]);
    presentation.advance(frame([
      tickInput(one, [explosionStarted(1, 10, 'other', vec(0, 0, 400))]),
      tickInput(two, [explosionStarted(2, 11, 'other', vec(0, 0, 650))]),
    ]));
    expect(random.used).toBe(5);
    expect(ticks.map(({ activations }) => activations.map(({ key, selection }) => ({ key, selection })))).toEqual([
      [{ key: 'core:10', selection: { list: 2, item: [1, 0, 1, 0, 1][4 % 5] } }],
      [{ key: 'core:11', selection: { list: 1, item: [1, 2, 0, 1, 2][3 % 5] } }],
    ]);
    expect(ticks[0].beforeStep.position).toEqual(vec(0));
    expect(ticks[0].afterStep.position).toEqual(vec(0, 0, 300));
    expect(ticks[1].beforeStep).toBe(ticks[0].afterStep);
  });

  it('lists Core activations in event order with their event index and the started facts', () => {
    const { presentation } = start([0, 0]);
    const ticks = record(presentation);
    const render = flying(1, [player(), renderEntity(10, { explosion: 'other' }), renderEntity(11, { explosion: 'large' })]);
    presentation.advance(frame([tickInput(render, [otherEvent(1), explosionStarted(1, 11, 'large', vec(9)), otherEvent(1), explosionStarted(1, 10, 'other', vec(8))])]));
    const [tick] = ticks;
    expect(tick).toMatchObject({ ownerId: 1, runId: 1, tick: 1, clock: render.clock });
    expect(tick.activations).toEqual([
      { key: 'core:11', origin: { type: 'core', entityId: 11, eventIndex: 1 }, sourceKindBit: 3, variant: 'large', selection: { list: 1, item: 1 }, tick: 1, clock: 2, position: vec(9) },
      { key: 'core:10', origin: { type: 'core', entityId: 10, eventIndex: 3 }, sourceKindBit: 3, variant: 'other', selection: { list: 1, item: 1 }, tick: 1, clock: 2, position: vec(8) },
    ]);
    expect(Object.isFrozen(tick) && Object.isFrozen(tick.activations) && tick.activations.every(Object.isFrozen)).toBe(true);
  });

  it('keeps a Core choice until its explosion leaves the Render State, whatever the view or time, without drawing again', () => {
    const { presentation, random } = start([2]);
    const boom = (position = vec(1)) => renderEntity(10, { explosion: 'large', position });
    presentation.advance(frame([tickInput(flying(1, [player(), boom()]), [explosionStarted(1, 10, 'large', vec(1))])]));
    const [chosen] = presentation.explosions();
    expect(chosen).toEqual({
      key: 'core:10', origin: { type: 'core', entityId: 10, eventIndex: 0 }, sourceKindBit: 3, variant: 'large', selection: { list: 1, item: 0 },
      activationTick: 1, activationClock: 2, position: vec(1), forward: vec(0, 0, 1), speed: 0,
    });
    // Moving, the map view, a frame without ticks, ticks long past its animation, and no camera entity at all.
    presentation.advance(frame([tickInput(flying(2, [player(), boom(vec(2))])), tickInput(flying(3, [player(), boom(vec(3))], 8))]));
    presentation.advance(frame([]));
    presentation.advance(frame([tickInput(flying(4, [boom(vec(4))])), tickInput(renderState(5, { entities: [boom(vec(5))] }))]));
    expect(presentation.explosions()).toEqual([{ ...chosen, position: vec(5) }]);
    expect(presentation.explosions()).toEqual(presentation.explosions());
    presentation.advance(frame([tickInput(flying(6))]));
    expect(presentation.explosions()).toEqual([]);
    expect(random.used).toBe(4);
  });

  it('drops a choice at once when its explosion is not listed at the end of its activation tick', () => {
    const { presentation } = start([0]);
    const ticks = record(presentation);
    presentation.advance(frame([tickInput(flying(1), [explosionStarted(1, 10, 'other', vec(1))])]));
    expect(ticks[0].activations).toHaveLength(1);
    expect(presentation.explosions()).toEqual([]);
  });

  it('fails on a second activation of a kept explosion', () => {
    const { presentation } = start([0, 0]);
    const render = flying(1, [player(), renderEntity(10, { explosion: 'other' })]);
    expect(() => presentation.advance(frame([tickInput(render, [explosionStarted(1, 10, 'other', vec(1)), explosionStarted(1, 10, 'other', vec(1))])])))
      .toThrow(kind('invariant-violated'));
    expect(() => presentation.explosions()).toThrow(kind('invalid-state'));
    expect(() => presentation.advance(frame([]))).toThrow(kind('invalid-state'));
  });

  it('fails on a second activation of an explosion that already left the Render State', () => {
    const { presentation } = start([0, 0]);
    presentation.advance(frame([tickInput(flying(1), [explosionStarted(1, 10, 'other', vec(1))])]));
    expect(() => presentation.advance(frame([tickInput(flying(2), [explosionStarted(2, 10, 'other', vec(1))])]))).toThrow(kind('invariant-violated'));
  });
});

describe('ticks and frames', () => {
  it('processes a whole frame before notifying its ticks in order, with the camera after each step', () => {
    const { presentation } = start();
    const seen: [number, number][] = [];
    presentation.subscribe((tick) => { seen.push([tick.tick, presentation.camera().tick]); });
    presentation.advance(frame([1, 2, 3, 4, 5].map((tick) => tickInput(flying(tick, [player(vec(tick))])))));
    expect(seen).toEqual([[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
    expect(presentation.camera()).toMatchObject({ tick: 5, position: vec(5) });
  });

  it('notifies nothing for a frame without ticks', () => {
    const { presentation } = start();
    const ticks = record(presentation);
    const camera = presentation.camera();
    presentation.advance(frame([]));
    expect(ticks).toEqual([]);
    expect(presentation.camera()).toBe(camera);
  });

  it('rejects another owner or run, a gap, a repeat, a wrong Render State and a backward clock, unchanged', () => {
    const { presentation } = start();
    const ticks = record(presentation);
    presentation.advance(frame([tickInput(flying(1))]));
    const one = tickInput(flying(1));
    const rejected = [
      frame([tickInput(flying(2))], 2, 1),
      frame([tickInput(flying(2))], 1, 2),
      frame([tickInput(flying(3))]),
      frame([one]),
      frame([tickInput(flying(2)), tickInput(flying(4))]),
      frame([{ ...tickInput(flying(2)), render: flying(3) }]),
      frame([{ ...tickInput(flying(2)), clock: 0, render: { ...flying(2), clock: 0 } }]),
    ];
    for (const input of rejected) expect(() => presentation.advance(input)).toThrow(kind('invalid-input'));
    expect(ticks.map(({ tick }) => tick)).toEqual([1]);
    presentation.advance(frame([tickInput(flying(2))]));
    expect(ticks.map(({ tick }) => tick)).toEqual([1, 2]);
  });
});

describe('consumers', () => {
  it('gives a P3-14 stand-in each activation once with the camera after its step, in either registration order', () => {
    const { presentation } = start([0, 1, 2]);
    const early: PresentationTick[] = [];
    const unsubscribeEarly = presentation.subscribe((tick) => { early.push(tick); });
    const boom = (id: number) => renderEntity(id, { explosion: 'other' });
    presentation.advance(frame([tickInput(flying(1, [player(), boom(10)]), [explosionStarted(1, 10, 'other', vec(1))])]));
    const late: PresentationTick[] = [];
    presentation.subscribe((tick) => { late.push(tick); });
    // The late consumer resumes from the query, with no earlier notification.
    expect(presentation.explosions().map(({ key, selection }) => [key, selection])).toEqual([['core:10', early[0].activations[0].selection]]);
    presentation.advance(frame([
      tickInput(flying(2, [player(vec(2)), boom(10), boom(11)]), [explosionStarted(2, 11, 'other', vec(1))]),
      tickInput(flying(3, [player(vec(3)), boom(10), boom(11), boom(12)]), [explosionStarted(3, 12, 'other', vec(1))]),
    ]));
    const keys = (ticks: PresentationTick[]) => ticks.flatMap(({ activations }) => activations.map(({ key }) => key));
    expect(keys(early)).toEqual(['core:10', 'core:11', 'core:12']);
    expect(keys(late)).toEqual(['core:11', 'core:12']);
    expect(late).toEqual(early.slice(1));
    expect(late.map(({ afterStep }) => afterStep.position)).toEqual([vec(2), vec(3)]);
    const selections = new Map(presentation.explosions().map(({ key, selection }) => [key, selection]));
    for (const { key, selection } of early.flatMap(({ activations }) => activations)) expect(selections.get(key)).toEqual(selection);
    unsubscribeEarly();
    unsubscribeEarly();
    presentation.advance(frame([tickInput(flying(4))]));
    expect(early).toHaveLength(3);
    expect(late).toHaveLength(3);
  });

  it('keeps notifying the others when a consumer throws, then reports the failure without failing the module', () => {
    const { presentation } = start();
    const failure = new Error('consumer failed');
    presentation.subscribe(({ tick }) => {
      if (tick < 3) throw failure;
    });
    const ticks = record(presentation);
    expect(() => presentation.advance(frame([tickInput(flying(1)), tickInput(flying(2))]))).toThrow(AggregateError);
    expect(ticks.map(({ tick }) => tick)).toEqual([1, 2]);
    presentation.advance(frame([tickInput(flying(3))]));
    expect(ticks.map(({ tick }) => tick)).toEqual([1, 2, 3]);
  });

  it('leaves a consumer subscribed during a notification for the next frame, and honours unsubscribing during one', () => {
    const { presentation } = start();
    const added: number[] = [];
    let unsubscribe = (): void => {};
    const removed: number[] = [];
    presentation.subscribe((tick) => {
      if (tick.tick === 1) presentation.subscribe(({ tick: number }) => { added.push(number); });
      unsubscribe();
    });
    unsubscribe = presentation.subscribe(({ tick }) => { removed.push(tick); });
    presentation.advance(frame([tickInput(flying(1)), tickInput(flying(2))]));
    presentation.advance(frame([tickInput(flying(3))]));
    expect(removed).toEqual([]);
    expect(added).toEqual([3]);
  });
});

describe('runs', () => {
  it('starts a retry afresh and rejects every use of the disposed run', () => {
    const { presentation: first } = start([0]);
    const ticks = record(first);
    first.advance(frame([tickInput(flying(1, [player(vec(50)), renderEntity(10, { explosion: 'other' })]), [explosionStarted(1, 10, 'other', vec(1))])]));
    first.dispose();
    first.dispose();
    for (const use of [() => first.advance(frame([tickInput(flying(2))])), () => first.explosions(), () => first.camera(), () => first.subscribe(() => {})]) {
      expect(use).toThrow(kind('invalid-state'));
    }
    expect(ticks).toHaveLength(1);
    // The retry is a new run: the camera restarts at the origin, the same entity ID is a new explosion.
    const { presentation: retry } = start([1], { runId: 2, initial: renderState(0) });
    expect(retry.camera().position).toEqual(vec(0));
    expect(retry.explosions()).toEqual([]);
    expect(() => retry.advance(frame([tickInput(flying(1))]))).toThrow(kind('invalid-input'));
    retry.advance(frame([tickInput(flying(1, [player(), renderEntity(10, { explosion: 'other' })]), [explosionStarted(1, 10, 'other', vec(1))])], 1, 2));
    expect(retry.explosions().map(({ key, selection }) => [key, selection])).toEqual([['core:10', { list: 1, item: 2 }]]);
  });
});

describe('destruction camera seam', () => {
  it('is stepped every tick from tick 0 and gives the camera of view 0x11, sub-mode 8', () => {
    const rows = [0, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as Matrix3;
    const steps: number[] = [];
    const destructionCamera = {
      step: ({ tick, render, beforeStep }: { tick: number; render: RenderState; beforeStep: { tick: number } }) => {
        steps.push(tick, beforeStep.tick);
        return render.viewMode === 0x11 ? { position: vec(tick, 1), rows } : null;
      },
    };
    const { presentation } = start([], { destructionCamera });
    const ticks = record(presentation);
    presentation.advance(frame([tickInput(renderState(1, { viewMode: 0x11, subMode: 8, observedEntityId: PLAYER, entities: [player()] })), tickInput(flying(2, [player(vec(9))]))]));
    expect(steps).toEqual([0, 0, 1, 0, 2, 1]);
    expect(ticks[0].afterStep).toMatchObject({ position: vec(1, 1), rows, viewMode: 0x11, subMode: 8, viewport: presentationViewport(0x11, 8) });
    expect(Object.isFrozen(ticks[0].afterStep.position) && Object.isFrozen(ticks[0].afterStep.rows)).toBe(true);
    expect(ticks[1].beforeStep).toBe(ticks[0].afterStep);
    expect(ticks[1].afterStep.position).toEqual(vec(9));
  });

  it('fails without a destruction camera in that view, or on a non-finite pose', () => {
    const view = renderState(1, { viewMode: 0x11, subMode: 8 });
    expect(() => start().presentation.advance(frame([tickInput(view)]))).toThrow(kind('unsupported-view'));
    const bad = { step: () => ({ position: vec(Number.NaN), rows: IDENTITY }) };
    expect(() => start([], { destructionCamera: bad })).toThrow(kind('invariant-violated'));
  });
});

/** A presentation explosion's movement block, as the effects give it (DW-02). */
const MOTION = Object.freeze({ forward: vec(0, 0, 1), speed: 0 });
/** Effects that run `script` at each step. */
const effectsOf = (script: (step: PresentationEffectsStep) => void): PresentationEffects => ({ step: script });
/** Tick 1 with Core explosion 10 activated at the origin. */
const withCoreTen = () => tickInput(flying(1, [player(), renderEntity(10, { explosion: 'other' })]), [explosionStarted(1, 10, 'other', vec(1))]);
const extra = (step: PresentationEffectsStep, ordinal: 0 | 1 | 2 | 3 | 4, variant: 'large' | 'other' = 'other', position = vec(1), slot = step.reserveObject()) =>
  step.activate({ origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal }, variant, position, motion: MOTION, slot });

describe('presentation effects seam', () => {
  it('lists presentation activations after the Core ones, with run-wide keys and the camera before the step', () => {
    const captured: PresentationEffectsStep[] = [];
    const effects = effectsOf((step) => {
      captured.push(step);
      if (step.tick !== 1) return;
      extra(step, 0, 'other', vec(0, 0, 400));
      const fragment = step.nextFragmentKey();
      step.activate({ origin: { type: 'fragment', fragmentKey: fragment }, variant: 'other', position: vec(0, 0, 399), motion: MOTION, slot: step.reserveObject() });
      extra(step, 4, 'large', vec(5));
    });
    const { presentation } = start([0, 0, 0, 1], { effects });
    const ticks = record(presentation);
    presentation.advance(frame([tickInput(flying(1, [player(vec(0, 0, 900)), renderEntity(10, { explosion: 'other' })]), [explosionStarted(1, 10, 'other', vec(1))])]));
    const [tick] = ticks;
    expect(tick.activations.map(({ key, origin, sourceKindBit, selection }) => ({ key, origin, sourceKindBit, selection }))).toEqual([
      { key: 'core:10', origin: { type: 'core', entityId: 10, eventIndex: 0 }, sourceKindBit: 3, selection: { list: 1, item: 1 } },
      { key: 'extra:1', origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal: 0 }, sourceKindBit: null, selection: { list: 2, item: 1 } },
      { key: 'fragment-explosion:1', origin: { type: 'fragment', fragmentKey: 'fragment:1' }, sourceKindBit: 24, selection: { list: 1, item: 1 } },
      { key: 'extra:2', origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal: 4 }, sourceKindBit: null, selection: { list: 1, item: 2 } },
    ]);
    expect(captured[0].activations).toEqual([tick.activations[0]]);
    expect(captured[0].afterStep).toBe(tick.afterStep);
    expect(presentation.explosions().map(({ key }) => key)).toEqual(['core:10', 'extra:1', 'fragment-explosion:1', 'extra:2']);
  });

  it('moves and ends presentation explosions, freeing their slots, and refuses calls after the step', () => {
    let late: PresentationEffectsStep | null = null;
    const effects = effectsOf((step) => {
      late = step;
      if (step.tick === 1) extra(step, 1);
      if (step.tick === 2) step.move('extra:1', vec(2));
      if (step.tick === 3) step.end('extra:1');
    });
    const { presentation } = start([0, 0], { effects });
    presentation.advance(frame([withCoreTen(), tickInput(flying(2, [player(), renderEntity(10, { explosion: 'other' })]))]));
    expect(presentation.explosions()).toMatchObject([{ key: 'core:10' }, { key: 'extra:1', position: vec(2), activationTick: 1, activationClock: 2 }]);
    expect(() => late!.reserveObject()).toThrow(kind('invariant-violated'));
    expect(() => late!.move('extra:1', vec(3))).toThrow(kind('invariant-violated'));
    presentation.advance(frame([tickInput(flying(3))]));
    expect(presentation.explosions()).toEqual([]);
  });

  it('refuses invalid requests: keys, origins, variants, repeats and slots', () => {
    type Script = (step: PresentationEffectsStep) => void;
    const bad: Script[] = [
      (step) => step.end('extra:1'),
      (step) => step.end('core:10' as never),
      (step) => step.move('extra:1', vec(1)),
      (step) => step.activate({ origin: { type: 'fragment', fragmentKey: 'fragment:1' }, variant: 'other', position: vec(1), motion: MOTION, slot: step.reserveObject() }),
      (step) => step.activate({ origin: { type: 'extra', parentExplosionKey: 'core:11', ordinal: 0 }, variant: 'other', position: vec(1), motion: MOTION, slot: step.reserveObject() }),
      (step) => extra(step, 5 as never),
      (step) => extra(step, 0, 'missile' as never),
      (step) => extra(step, 0, 'other', vec(Number.NaN)),
      (step) => step.activate({ origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal: 0 }, variant: 'other', position: vec(1), motion: { forward: vec(Number.NaN), speed: 1 }, slot: step.reserveObject() }),
      (step) => step.activate({ origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal: 0 }, variant: 'other', position: vec(1), motion: { forward: vec(1), speed: Infinity }, slot: step.reserveObject() }),
      (step) => { extra(step, 2); extra(step, 2); },
      (step) => {
        const fragmentKey = step.nextFragmentKey();
        step.activate({ origin: { type: 'fragment', fragmentKey }, variant: 'large' as never, position: vec(1), motion: MOTION, slot: step.reserveObject() });
      },
      (step) => {
        const fragmentKey = step.nextFragmentKey();
        step.activate({ origin: { type: 'fragment', fragmentKey }, variant: 'other', position: vec(1), motion: MOTION, slot: step.reserveObject() });
        step.activate({ origin: { type: 'fragment', fragmentKey }, variant: 'other', position: vec(1), motion: MOTION, slot: step.reserveObject() });
      },
      (step) => { const slot = step.reserveObject(); extra(step, 0, 'other', vec(1), slot); extra(step, 1, 'other', vec(1), slot); },
      (step) => { const slot = step.reserveObject(); step.releaseObject(slot); extra(step, 0, 'other', vec(1), slot); },
      (step) => { const slot = step.reserveObject(); extra(step, 0, 'other', vec(1), slot); step.releaseObject(slot); },
      (step) => step.releaseObject({} as never),
    ];
    bad.forEach((script, index) => {
      const { presentation } = start([0, 0, 0], { effects: effectsOf((step) => { if (step.tick === 1) script(step); }) });
      expect(() => presentation.advance(frame([withCoreTen()])), `case ${index}`).toThrow(kind('invariant-violated'));
    });
  });

  it('refuses an extra of a Core explosion activated in another run', () => {
    const { presentation: first } = start([0]);
    first.advance(frame([withCoreTen()]));
    const { presentation: retry } = start([], { runId: 2, effects: effectsOf((step) => { extra(step, 0); }) });
    expect(() => retry.advance(frame([tickInput(flying(1))], 1, 2))).toThrow(kind('invariant-violated'));
  });

  it('fails effects that return a promise', () => {
    const effects = { step: () => Promise.resolve() } as unknown as PresentationEffects;
    expect(() => start([], { effects }).presentation.advance(frame([tickInput(flying(1))]))).toThrow(kind('invariant-violated'));
  });

  it('draws its own values from the same presentation random source, after the Core choices', () => {
    const drawn: number[] = [];
    const { presentation, random } = start([5, 6], { effects: effectsOf((step) => { drawn.push(step.random.next()); }) });
    presentation.advance(frame([withCoreTen()]));
    expect(drawn).toEqual([6]);
    expect(random.used).toBe(5);
  });
});

describe('per-tick explosions and movement blocks (P3-14 DW-02)', () => {
  /** Rows whose R2 is +y. */
  const UP = Object.freeze([1, 0, 0, 0, 0, -1, 0, 1, 0]) as unknown as Matrix3;
  const EXTRA = Object.freeze({ forward: vec(0.6, 0, 0.8), speed: 40 });
  const boom = (speed: number, position = vec(1)) => renderEntity(10, { explosion: 'other', orientation: UP, speed, position });
  /** Core explosion 10 at speed 12 then 13, gone at tick 3; extra 1 with its own block in tick 1, ended in tick 2. */
  const scene = () => [
    tickInput(flying(1, [player(), boom(12)]), [explosionStarted(1, 10, 'other', vec(1))]),
    tickInput(flying(2, [player(), boom(13, vec(2))])),
    tickInput(flying(3)),
  ];
  const effects = () => effectsOf((step) => {
    if (step.tick === 1) step.activate({ origin: { type: 'extra', parentExplosionKey: 'core:10', ordinal: 0 }, variant: 'other', position: vec(5), motion: EXTRA, slot: step.reserveObject() });
    if (step.tick === 2) step.end('extra:1');
  });
  const motion = ({ key, position, forward, speed }: { key: string; position: unknown; forward: unknown; speed: number }) => ({ key, position, forward, speed });

  it('gives each tick the explosions it ended with, Core blocks from that tick\'s Render State and presentation blocks as given', () => {
    const { presentation, random } = start([0, 0], { effects: effects() });
    const ticks = record(presentation);
    presentation.advance(frame(scene()));
    expect(ticks.map(({ explosions }) => explosions.map(motion))).toEqual([
      [{ key: 'core:10', position: vec(1), forward: vec(0, 1, 0), speed: 12 }, { key: 'extra:1', position: vec(5), ...EXTRA }],
      [{ key: 'core:10', position: vec(2), forward: vec(0, 1, 0), speed: 13 }],
      [],
    ]);
    expect(ticks[0].explosions.map(({ key, selection }) => [key, selection])).toEqual(ticks[0].activations.map(({ key, selection }) => [key, selection]));
    for (const { explosions } of ticks) {
      expect(Object.isFrozen(explosions) && explosions.every((item) => Object.isFrozen(item) && Object.isFrozen(item.forward))).toBe(true);
    }
    // The query is the last tick's list; reading either draws nothing.
    const used = random.used;
    expect(presentation.explosions()).toBe(ticks[2].explosions);
    expect(random.used).toBe(used);
  });

  it('gives the same lists whatever the frames, each equal to explosions() right after its tick', () => {
    const grouped = start([0, 0], { effects: effects() });
    const groupedTicks = record(grouped.presentation);
    grouped.presentation.advance(frame(scene()));
    const single = start([0, 0], { effects: effects() });
    const singleTicks = record(single.presentation);
    for (const input of scene()) {
      single.presentation.advance(frame([input]));
      single.presentation.advance(frame([]));
      expect(single.presentation.explosions()).toBe(singleTicks.at(-1)!.explosions);
    }
    expect(singleTicks).toEqual(groupedTicks);
  });

  it('keeps an explosion\'s Core block unset in no tick: one not listed at its activation\'s end is dropped before the notification', () => {
    const { presentation } = start([0]);
    const ticks = record(presentation);
    presentation.advance(frame([tickInput(flying(1), [explosionStarted(1, 10, 'other', vec(1))])]));
    expect(ticks[0].activations).toHaveLength(1);
    expect(ticks[0].explosions).toEqual([]);
  });
});

describe('budgets', () => {
  it('allows an allocation below the limit and refuses one at it', () => {
    expect(() => checkCapacity(1, 2, 'probe')).not.toThrow();
    expect(() => checkCapacity(2, 2, 'probe')).toThrow(kind('presentation-capacity'));
  });

  it('holds 4,096 presentation objects and refuses the next', () => {
    expect(PRESENTATION_LIMITS.objects).toBe(4096);
    const reserve = (count: number) => effectsOf((step) => {
      for (let index = 0; index < count; index++) step.reserveObject();
    });
    start([], { effects: reserve(PRESENTATION_LIMITS.objects) }).presentation.advance(frame([tickInput(flying(1))]));
    // A released slot, or an ended explosion's, counts no more.
    const reuse = effectsOf((step) => {
      const slots = Array.from({ length: PRESENTATION_LIMITS.objects }, () => step.reserveObject());
      step.releaseObject(slots[0]);
      extra(step, 0, 'other', vec(1), slots[1]);
      step.end('extra:1');
      step.reserveObject();
      step.reserveObject();
    });
    start([0, 0], { effects: reuse }).presentation.advance(frame([withCoreTen()]));
    expect(() => start([], { effects: reserve(PRESENTATION_LIMITS.objects + 1) }).presentation.advance(frame([tickInput(flying(1))])))
      .toThrow(kind('presentation-capacity'));
  });

  it('keeps 6,144 choices, Core and presentation together, and refuses the next before drawing', () => {
    expect(PRESENTATION_LIMITS.selections).toBe(CORE_LIMITS.entities + PRESENTATION_LIMITS.objects);
    const run = (core: number) => {
      const entities = [player(), ...Array.from({ length: core }, (_, at) => renderEntity(10 + at, { explosion: 'large' }))];
      const events: DomainEvent[] = entities.slice(1).map(({ id }) => explosionStarted(1, id, 'large', vec(1)));
      let draws = 0;
      const random: RandSource = { next: () => (draws++, 0) };
      const effects = effectsOf((step) => {
        // Each Core explosion's five extras, in turn, until every object slot is used.
        for (let index = 0; index < PRESENTATION_LIMITS.objects; index++) {
          const parentExplosionKey = `core:${10 + Math.floor(index / 5)}` as const;
          step.activate({ origin: { type: 'extra', parentExplosionKey, ordinal: (index % 5) as 0 }, variant: 'large', position: vec(1), motion: MOTION, slot: step.reserveObject() });
        }
      });
      const presentation = createFlightPresentation({ ownerId: 1, runId: 1, content: presentationContent(), initial: flying(0), random, effects });
      let error: unknown = null;
      try {
        presentation.advance(frame([tickInput(flying(1, entities), events)]));
      } catch (caught) {
        error = caught;
      }
      return { presentation, draws, error };
    };
    const full = run(CORE_LIMITS.entities);
    expect(full.error).toBeNull();
    expect(full.presentation.explosions()).toHaveLength(PRESENTATION_LIMITS.selections);
    const over = run(CORE_LIMITS.entities + 1);
    expect(over.error).toEqual(kind('presentation-capacity'));
    expect(over.draws).toBe(3 + PRESENTATION_LIMITS.selections);
  });
});
