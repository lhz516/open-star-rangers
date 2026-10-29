import { describe, expect, it } from 'vitest';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import {
  EXPLOSION_KIND_BIT, FRAGMENT_KIND_BIT, MARKER_KIND_BIT, MISSILE_KIND_BIT, PROJECTILE_KIND_BIT, type Matrix3,
} from '../../core/world/entity-table.ts';
import { FakeParameterVoice } from '../../platform/audio/audio-controller.test-support.ts';
import { PRESENTATION_LIMITS } from '../../render/flight/presentation/presentation-budget.ts';
import type { CameraPose, ExplosionKey, PresentationTick } from '../../render/flight/presentation/presentation-contract.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { MAX_TICKS_PER_FRAME } from '../runtime/game-runtime.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { current, sessionSetup } from '../session/game-session.test-support.ts';
import { cockpitState, type CockpitState } from '../../render/cockpit/cockpit-integration.test-support.ts';
import {
  attachRunAudio, FlightSoundConsumerError, type AudioPresentation, type FlightSoundConsumerFailure, type FlightSoundDecision,
} from './consumer.ts';
import {
  at, audioRig, brief, cockpitFor, COCKPIT_MAP_GEOMETRY, combatRunSpec, CONTENT, events, explosion, FakePresentation, FakeRun, harness, KINDS, OWNER,
  presentationTick, realHarness, realPresentation, RUN, tickOutput, type EntitySpec, type InputOrder, type TickInput, type TickSpec,
} from './consumer.test-support.ts';
import { explosionSound } from './content.ts';
import { SOUNDS } from './content.test-support.ts';
import { audioListener, entityReading, nonPlayerParameters } from './parameters.ts';
import { EVENT_SOUNDS } from './events.ts';

// The run's flight sound consumer (P3-14 subtask 16; spec S-04, S-05, S-06, S-08, AC-03, AC-04, AC-05, AC-10; D-02 DW-03,
// DW-04, DW-07, DW-08, DW-09, DW-11): pairing and order of the two per-tick inputs, the original's dispatch order, the
// per-object sound tables of A-02, explosions, removals, stops, interruptions, budgets and the run's end. Synthetic
// frames from hand-driven ports and a real audio controller over fake capabilities; the expectations come from
// docs/original/formats/audio.md (A-01 to A-04) and the D-02 contract, not from the consumer.

const PLAYER = 1;
const player: EntitySpec = { id: PLAYER, kindBit: KINDS.player, position: at(0, 0, 0) };
const enemy = (id: number, spec: Partial<EntitySpec> = {}): EntitySpec => ({ id, kindBit: KINDS.enemy, ...spec });
const coreExplosion = (id: number): EntitySpec => ({ id, kindBit: EXPLOSION_KIND_BIT });

/** `0x55984` at 1,000 units straight ahead of the origin camera, both at rest: trunc(2800 × 127/3800), centred (63), 11,025 Hz. */
const AHEAD_1000 = { volume: 93, pan: 63, rate: 11_025 };
/** The start values the player's own one-shots keep (A-02, `0x53bf0`). */
const START = { volume: 127, pan: 64 };

const failureOf = (action: () => void): FlightSoundConsumerFailure | null => {
  try {
    action();
  } catch (error) {
    if (error instanceof FlightSoundConsumerError) return error.failure;
    throw error;
  }
  return null;
};

const sounds = (decisions: readonly FlightSoundDecision[]) => decisions.map(brief);

describe('run audio wiring', () => {
  it('refuses a missing or foreign presentation module, or one not at the run\'s tick, leaving nothing behind', () => {
    const { controller } = audioRig();
    const cases: { readonly presentation: FakePresentation | null; readonly tick?: number }[] = [
      { presentation: null },
      { presentation: new FakePresentation(OWNER + 1, RUN) },
      { presentation: new FakePresentation(OWNER, RUN + 1) },
      { presentation: Object.assign(new FakePresentation(), { tick: 1 }) },
    ];
    for (const { presentation } of cases) {
      const run = new FakeRun();
      expect(failureOf(() => attachRunAudio(run, { ownerId: OWNER, content: CONTENT, controller, presentation }))).toBe('wiring');
      expect(run.frameListeners.size).toBe(0);
      expect(run.cleanups).toEqual([]);
      expect(presentation?.listeners.size ?? 0).toBe(0);
    }
  });

  it('leaves nothing sounding or subscribed when a subscription fails while wiring', () => {
    const { controller } = audioRig();
    const run = new FakeRun();
    const presentation = new FakePresentation();
    run.onFrame = () => { throw new Error('subscription refused'); };
    expect(() => attachRunAudio(run, { ownerId: OWNER, content: CONTENT, controller, presentation })).toThrow('subscription refused');
    expect(presentation.listeners.size).toBe(0);
    run.end();
    expect(controller.getSnapshot().voices).toBe(0);
  });

  it('subscribes to both inputs and hands its end to the run', () => {
    const { run, presentation } = harness();
    expect(run.frameListeners.size).toBe(1);
    expect(presentation.listeners.size).toBe(1);
    expect(run.cleanups).toHaveLength(1);
  });
});

describe('pairing the two inputs (DW-03)', () => {
  /** A script of ticks with an engine, shots, a hit, sounds by ID and an explosion that ends early. */
  const script = (tick: number): TickInput => {
    const entities: EntitySpec[] = [player, enemy(2, { position: at(0, 0, 900 - tick * 10) })];
    const list: DomainEvent[] = [];
    if (tick % 4 === 1) list.push(events.shot(tick, { shooter: 2, kindBit: KINDS.enemy }));
    if (tick === 3) list.push(events.hit(tick, { victim: 2, kindBit: KINDS.enemy, shieldWasEmpty: true }), events.weaponSelected(tick));
    if (tick >= 4 && tick < 8) entities.push(coreExplosion(20));
    return {
      tick, entities, events: list, motion: { commandedSpeed: 100 + tick },
      presentation: { explosions: tick >= 4 && tick < 8 ? [explosion('core:20', { list: 2, item: 1 })] : [] },
    };
  };
  const play = (order: InputOrder, grouping: readonly number[]): FlightSoundDecision[] => {
    const { frame, decisions } = harness({ order });
    let tick = 0;
    for (const count of grouping) {
      frame(Array.from({ length: count }, (_, index) => script(tick + index + 1)));
      tick += count;
    }
    return decisions;
  };

  it('handles each tick the same whichever input arrives first and however the frames group the ticks', () => {
    const reference = play('outputs-first', Array.from({ length: 20 }, () => 1));
    expect(reference.length).toBeGreaterThan(5);
    for (const order of ['outputs-first', 'presentation-first'] as const) {
      for (const grouping of [[5, 5, 5, 5], [2, 0, 3, 5, 0, 0, 1, 4, 0, 5], Array.from({ length: 20 }, () => 1)]) {
        expect(play(order, grouping)).toEqual(reference);
      }
    }
  });

  it('does nothing on a frame without ticks or a still frame: no replay, no cue step, no parameter update', () => {
    const { frame, run, audio, decisions } = harness();
    frame([{ tick: 1, entities: [enemy(2)], events: [events.weaponSelected(1)] }]);
    expect(sounds(decisions)).toEqual([`started ${EVENT_SOUNDS.weaponSelect} by-id`, `started ${SOUNDS.enemyEngine} entity:2:0`]);
    const settings = audio.context.voices.map(voice => (voice instanceof FakeParameterVoice ? voice.settings.length : 0));
    run.frame(null);
    run.frame([]);
    frame([]);
    expect(decisions).toHaveLength(2);
    expect(audio.context.voices.map(voice => (voice instanceof FakeParameterVoice ? voice.settings.length : 0))).toEqual(settings);
  });

  const broken: Record<string, { readonly failure: FlightSoundConsumerFailure; readonly act: (h: ReturnType<typeof harness>) => void }> = {
    'a presentation tick of another run': {
      failure: 'pairing',
      act: ({ run, presentation }) => {
        presentation.emit(presentationTick(tickOutput({ tick: 1 }), { runId: RUN + 1 }));
        run.frame([tickOutput({ tick: 1 })]);
      },
    },
    'a presentation tick of another owner': {
      failure: 'pairing',
      act: ({ presentation }) => presentation.emit(presentationTick(tickOutput({ tick: 1 }), { ownerId: OWNER + 1 })),
    },
    'an output tick out of order': { failure: 'pairing', act: ({ run }) => run.frame([tickOutput({ tick: 2 })]) },
    'a presentation tick out of order': { failure: 'pairing', act: ({ presentation }) => presentation.emit(presentationTick(tickOutput({ tick: 2 }))) },
    'a pair whose clocks differ': {
      failure: 'pairing',
      act: ({ run, presentation }) => {
        run.frame([tickOutput({ tick: 1 })]);
        presentation.emit(presentationTick(tickOutput({ tick: 1 }), { clock: 3 }));
      },
    },
    'an output left unpaired at the next frame': {
      failure: 'pairing',
      act: ({ run }) => {
        run.frame([tickOutput({ tick: 1 })]);
        run.frame(null);
      },
    },
    'a presentation tick the frame did not report': {
      failure: 'pairing',
      act: ({ run, presentation }) => {
        presentation.emit(presentationTick(tickOutput({ tick: 1 })));
        run.frame(null);
      },
    },
    'more presentation ticks than a frame holds': {
      failure: 'budget',
      act: ({ presentation }) => {
        for (let tick = 1; tick <= MAX_TICKS_PER_FRAME + 1; tick++) presentation.emit(presentationTick(tickOutput({ tick })));
      },
    },
    'more outputs than a frame holds': {
      failure: 'budget',
      act: ({ run }) => run.frame(Array.from({ length: MAX_TICKS_PER_FRAME + 1 }, (_, index) => tickOutput({ tick: index + 1 }))),
    },
  };
  for (const [name, { failure, act }] of Object.entries(broken)) {
    it(`refuses ${name}, ending the run's sound`, () => {
      const h = harness();
      expect(failureOf(() => act(h))).toBe(failure);
      expect(h.run.frameListeners.size).toBe(0);
      expect(h.presentation.listeners.size).toBe(0);
      // Later inputs of any shape do nothing.
      expect(() => h.run.frame([tickOutput({ tick: 9 })])).not.toThrow();
      expect(h.controller.getSnapshot().voices).toBe(0);
    });
  }

  it('stops every voice when a contract breaks mid-run', () => {
    const { frame, controller, run } = harness();
    frame([{ tick: 1, entities: [enemy(2), enemy(3)] }]);
    expect(controller.getSnapshot().voices).toBe(2);
    expect(failureOf(() => run.frame([tickOutput({ tick: 3 })]))).toBe('pairing');
    expect(controller.getSnapshot().voices).toBe(0);
  });
});

describe('dispatch order within a tick (DW-04, A-01)', () => {
  it('plays by ID, then type-4 event and update items, then type-8 event and update items, presentation explosions last', () => {
    const { frame, decisions } = harness();
    frame([{
      tick: 1,
      entities: [player, enemy(2), { id: 3, kindBit: KINDS.friendly }, coreExplosion(10)],
      events: [
        events.shot(1, { shooter: 2, kindBit: KINDS.enemy, family: 'gun' }),
        events.weaponSelected(1),
        events.hit(1, { victim: 2, kindBit: KINDS.enemy }),
        events.shot(1, { shooter: PLAYER, kindBit: KINDS.player, family: 'missile' }),
      ],
      motion: { commandedSpeed: 0 },
      presentation: { explosions: [explosion('core:10', { list: 2, item: 1 }), explosion('extra:1', { list: 3, item: 0 })] },
    }]);
    expect(sounds(decisions)).toEqual([
      // Type 2.
      `started ${EVENT_SOUNDS.weaponSelect} by-id`,
      // Type 4: the hit and the missile in event order, then updates by kind and ID: kinds 0, 1 and 7; class 5 holds two.
      `started ${SOUNDS.hull} entity:2:3`,
      `started ${SOUNDS.missile} entity:1:2`,
      `started ${SOUNDS.playerEngine} entity:1:0`,
      `started ${SOUNDS.playerEngine} entity:3:0`,
      `refused voice-limit ${SOUNDS.enemyEngine} entity:2:0`,
      // Type 8: the gun shot, then the Core explosion (list 2 item 1), then the presentation one (list 3 item 0).
      `started ${SOUNDS.gun} entity:2:1`,
      `started ${SOUNDS.boomC} entity:10:0`,
      `started ${SOUNDS.boomB} effect:extra:1`,
    ]);
    expect(decisions.map(({ voiceClass }) => voiceClass)).toEqual([4, 2, 1, 5, 5, 5, 1, 2, 2]);
    // Each explosion's first play preempts: the Core blast cut the hit, the presentation blast cut the Core one.
    expect(decisions.map(({ preempted }) => preempted)).toEqual([
      null, null, null, null, null, null, null, { namespace: 'entity', id: 2, slot: 3 }, { namespace: 'entity', id: 10, slot: 0 },
    ]);
  });

  it('stops every voice before any sound of a tick with a stop event, then plays the tick\'s sounds (DW-09, D2-09)', () => {
    const { frame, controller } = harness();
    frame([{ tick: 1, entities: [enemy(2), coreExplosion(10)], presentation: { explosions: [explosion('core:10')] } }]);
    expect(controller.getSnapshot().voices).toBe(2);
    const rescue = { type: 'result-latched', tick: 2, result: { reason: 'all-clear' } } as unknown as DomainEvent;
    const tick2 = frame([{ tick: 2, entities: [enemy(2), coreExplosion(10)], events: [events.weaponSelected(2, null), rescue], presentation: { explosions: [explosion('core:10')] } }]);
    expect(sounds(tick2)).toEqual(['stopped stop-all all', `started ${EVENT_SOUNDS.weaponSelect} by-id`]);
    expect(controller.getSnapshot().voices).toBe(1);
    // A-02 after all voices are lost: slot 0 restarts at its next unthrottled update (clock 14), the live explosion is
    // marked idle there and replays at the following one without preempting; nothing else replays.
    const later: FlightSoundDecision[] = [];
    for (let tick = 3; tick <= 8; tick++) later.push(...frame([{ tick, entities: [enemy(2), coreExplosion(10)], presentation: { explosions: [explosion('core:10')] } }]));
    expect(later.map(decision => `${decision.tick} ${brief(decision)}`)).toEqual([
      `7 started ${SOUNDS.enemyEngine} entity:2:0`,
      `8 started ${SOUNDS.boomA} entity:10:0`,
    ]);
  });

  it('skips every object item while docked, removals included, and still plays by ID (D2-15)', () => {
    const { frame, controller } = harness();
    frame([{ tick: 1, entities: [enemy(2)], presentation: { explosions: [explosion('extra:1')] } }]);
    expect(controller.getSnapshot().voices).toBe(2);
    const docked = frame([{
      tick: 2, docked: true, entities: [enemy(2, { display: 'released' }), enemy(3)],
      events: [events.shot(2, { shooter: 3, kindBit: KINDS.enemy }), events.hit(2, { victim: 3, kindBit: KINDS.enemy }), events.retired(2, 2, KINDS.enemy), events.weaponSelected(2)],
    }]);
    expect(sounds(docked)).toEqual([`started ${EVENT_SOUNDS.weaponSelect} by-id`]);
    // The retired engine and the ended presentation explosion were not stopped.
    expect(controller.getSnapshot().voices).toBe(3);
  });
});

describe('per-object sound tables (A-02)', () => {
  /** The number of parameter settings each parameterised voice received, in creation order. */
  const settings = (audio: ReturnType<typeof harness>['audio']) =>
    audio.context.voices.filter((voice): voice is FakeParameterVoice => voice instanceof FakeParameterVoice).map(voice => voice.settings.length);

  it('starts slot 0 once, refreshes it only 12 clock units after the last processing, and restarts it after it ends', () => {
    const { frame, audio, decisions } = harness();
    const tick = (n: number) => frame([{ tick: n, entities: [enemy(2, { position: at(0, 0, 1000 + 100 * n) })] }]);
    tick(1);
    expect(sounds(decisions)).toEqual([`started ${SOUNDS.enemyEngine} entity:2:0`]);
    // Clock 2 at the start: clocks 4–12 are throttled (< 12 units), clock 14 refreshes, then 26.
    const after: number[] = [];
    for (let n = 2; n <= 13; n++) {
      tick(n);
      after.push(settings(audio)[0]);
    }
    expect(after).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2]);
    // A natural end at tick 14 is found at the next unthrottled update (clock 38, tick 19), which replays at once.
    audio.context.voices[0].end();
    const replay: FlightSoundDecision[] = [];
    for (let n = 14; n <= 19; n++) replay.push(...tick(n));
    expect(replay.map(decision => `${decision.tick} ${brief(decision)}`)).toEqual([`19 started ${SOUNDS.enemyEngine} entity:2:0`]);
  });

  it('retries a refused first start on the next tick and a refused later one at most every 12 units', () => {
    const { frame, decisions } = harness();
    const engines = [enemy(2), enemy(3), enemy(4)];
    for (let tick = 1; tick <= 9; tick++) frame([{ tick, entities: engines }]);
    expect(decisions.filter(({ source }) => source?.namespace === 'entity' && source.id === 4).map(({ tick, result }) => `${tick} ${result}`))
      .toEqual(['1 refused', '2 refused', '8 refused']);
  });

  it('marks an empty slot silent once and never retries it', () => {
    const { frame, decisions } = harness();
    frame([{ tick: 1, entities: [{ id: 5, kindBit: KINDS.silent }], events: [events.shot(1, { shooter: 5, kindBit: KINDS.silent })] }]);
    for (let tick = 2; tick <= 20; tick++) frame([{ tick, entities: [{ id: 5, kindBit: KINDS.silent }], events: [events.shot(tick, { shooter: 5, kindBit: KINDS.silent })] }]);
    // The update (type 4) comes before the gun shot (type 8).
    expect(sounds(decisions)).toEqual(['silent empty-slot entity:5:0', 'silent empty-slot entity:5:1']);
  });

  it('plays a hit again while the slot\'s previous hit sounds, and silences the first hit after it ended', () => {
    const { frame, audio, decisions } = harness();
    // The victim is listed, without an update item yet, so its table lives on.
    const hitAt = (tick: number) => frame([{ tick, entities: [enemy(2, { display: 'pending' })], events: [events.hit(tick, { victim: 2, kindBit: KINDS.enemy })] }]);
    hitAt(1);
    hitAt(2);
    audio.context.voices.at(-1)!.end();
    hitAt(3);
    hitAt(4);
    expect(decisions.map(decision => `${decision.tick} ${brief(decision)}`)).toEqual([
      `1 started ${SOUNDS.hull} entity:2:3`,
      `2 started ${SOUNDS.hull} entity:2:3`,
      `3 silent ended-hit ${SOUNDS.hull} entity:2:3`,
      `4 started ${SOUNDS.hull} entity:2:3`,
    ]);
  });

  it('places a non-player one-shot at its listed source or else its event snapshot, and keeps the player\'s at the start values', () => {
    const { frame, decisions } = harness();
    frame([{
      tick: 1, entities: [player, enemy(3, { position: at(0, 0, 2000) })],
      events: [
        events.shot(1, { shooter: 2, kindBit: KINDS.enemy }),
        events.shot(1, { shooter: 3, kindBit: KINDS.enemy, position: at(0, 0, 1000) }),
        events.hit(1, { victim: PLAYER, kindBit: KINDS.player }),
      ],
      motion: { commandedSpeed: 0 },
    }]);
    const placed = Object.fromEntries(decisions.filter(({ source }) => source?.namespace === 'entity' && source.slot !== 0)
      .map(({ source, parameters }) => [`${(source as { id: number }).id}`, parameters]));
    // Shooter 2 is not listed: its snapshot at 1,000 units. Shooter 3 is listed at 2,000 units: trunc(1800 × 127/3800) = 60.
    expect(placed).toEqual({ 2: AHEAD_1000, 3: { volume: 60, pan: 63, rate: 11_025 }, 1: START });
  });

  it('tunes the player\'s engine from its commanded speed and record maximum (A-05)', () => {
    const { frame, decisions } = harness();
    frame([{ tick: 1, entities: [player], motion: { commandedSpeed: 200, recordMaximumSpeed: 400 } }]);
    // trunc(200 / 400 × 16,000) + 3,000 Hz at full volume.
    expect(decisions.map(({ parameters }) => parameters)).toEqual([{ volume: 127, rate: 11_000 }]);
  });

  it('stops a retired entity\'s tracked voices at its removal item and starts afresh if the ID is listed again (DW-07)', () => {
    const { frame, controller } = harness();
    frame([{ tick: 1, entities: [enemy(2)], events: [events.shot(1, { shooter: 2, kindBit: KINDS.enemy })] }]);
    expect(controller.getSnapshot().voices).toBe(2);
    const retired = frame([{ tick: 2, entities: [enemy(2, { display: 'released' })], events: [events.retired(2, 2, KINDS.enemy)] }]);
    expect(sounds(retired)).toEqual(['stopped removal entity:2:0', 'stopped removal entity:2:1']);
    expect(controller.getSnapshot().voices).toBe(0);
    expect(sounds(frame([{ tick: 3, entities: [enemy(2)] }]))).toEqual([`started ${SOUNDS.enemyEngine} entity:2:0`]);
  });

  it('drops a parked entity\'s table without stopping its voice (DW-07)', () => {
    const { frame, controller } = harness();
    frame([{ tick: 1, entities: [enemy(2)] }]);
    expect(frame([{ tick: 2 }])).toEqual([]);
    expect(controller.getSnapshot().voices).toBe(1);
    // Listed again within the throttle window: a new table, so a new voice; the old one sounds on untracked.
    expect(sounds(frame([{ tick: 3, entities: [enemy(2)] }]))).toEqual([`started ${SOUNDS.enemyEngine} entity:2:0`]);
    expect(controller.getSnapshot().voices).toBe(2);
  });

  it('posts no update items without a player entity, while event items and removals still sound (A-01, DW-04)', () => {
    const { frame, controller } = harness();
    const scene = { entities: [enemy(2), coreExplosion(10)], presentation: { explosions: [explosion('core:10'), explosion('extra:1')] } };
    // Without a player motion entry the engine and both explosions stay silent; the shot and the hit sound.
    const alone = frame([{
      tick: 1, ...scene, motion: null,
      events: [events.shot(1, { shooter: 2, kindBit: KINDS.enemy }), events.hit(1, { victim: 2, kindBit: KINDS.enemy })],
    }]);
    expect(sounds(alone)).toEqual([`started ${SOUNDS.hull} entity:2:3`, `started ${SOUNDS.gun} entity:2:1`]);
    // With the player back, the update items start at once (the tables they find were created without a clock).
    expect(sounds(frame([{ tick: 2, ...scene }]))).toEqual([
      `started ${SOUNDS.enemyEngine} entity:2:0`, `started ${SOUNDS.boomA} entity:10:0`, `started ${SOUNDS.boomA} effect:extra:1`,
    ]);
    // Without the player, a presentation explosion's end still stops its voice.
    const ended = frame([{ tick: 3, entities: [enemy(2), coreExplosion(10)], motion: null, presentation: { explosions: [explosion('core:10')] } }]);
    expect(sounds(ended)).toEqual(['stopped removal effect:extra:1']);
    expect(controller.getSnapshot().voices).toBeGreaterThan(0);
  });

  it('gives missiles, gun projectiles, fragments and the map marker no update sound, and refuses an unbound craft kind', () => {
    const { frame, decisions } = harness();
    frame([{
      tick: 1,
      entities: [
        { id: 2, kindBit: MISSILE_KIND_BIT }, { id: 3, kindBit: PROJECTILE_KIND_BIT }, { id: 4, kindBit: FRAGMENT_KIND_BIT },
        { id: 5, kindBit: MARKER_KIND_BIT, presentation: { type: 'map-marker' } },
      ],
    }]);
    expect(decisions).toEqual([]);
    const h = harness();
    expect(failureOf(() => h.frame([{ tick: 1, entities: [{ id: 2, kindBit: 9 }] }]))).toBe('binding');
  });
});

describe('explosion sounds (DW-08, D2-06)', () => {
  const blast = (tick: number, extra: Partial<TickInput> = {}): TickInput =>
    ({ tick, entities: [coreExplosion(10)], presentation: { explosions: [explosion('core:10', { list: 1, item: 1 })] }, ...extra });

  it('plays the selected EXPL sound with preemption first, and after losing its voice replays it without preemption', () => {
    const { frame, audio, decisions } = harness();
    frame([blast(1, { events: [events.hit(1, { victim: 2, kindBit: KINDS.enemy })] })]);
    expect(sounds(decisions)).toEqual([`started ${SOUNDS.hull} entity:2:3`, `started ${SOUNDS.boomB} entity:10:0`]);
    audio.context.voices[1].end();
    const later: FlightSoundDecision[] = [];
    for (let tick = 2; tick <= 7; tick++) later.push(...frame([blast(tick)]));
    // Clock 14 (tick 7) marks it idle; nothing plays.
    expect(later).toEqual([]);
    // Tick 8: a hit holds class 2, and the replay does not preempt.
    const refused = frame([blast(8, { events: [events.hit(8, { victim: 2, kindBit: KINDS.enemy, shieldWasEmpty: true })] })]);
    expect(sounds(refused)).toEqual([`started ${SOUNDS.kill} entity:2:4`, `refused voice-limit ${SOUNDS.boomB} entity:10:0`]);
    // The refused restart set its clock (16): the next try is at clock 28 (tick 14), once the hit has ended.
    audio.context.voices.at(-1)!.end();
    const replay: FlightSoundDecision[] = [];
    for (let tick = 9; tick <= 14; tick++) replay.push(...frame([blast(tick)]));
    expect(replay.map(decision => `${decision.tick} ${brief(decision)}`)).toEqual([`14 started ${SOUNDS.boomB} entity:10:0`]);
  });

  it('stops a presentation explosion\'s voice in the tick it leaves the list, and keeps the two namespaces apart', () => {
    const { frame, controller } = harness();
    const first = frame([{ tick: 1, entities: [coreExplosion(1)], presentation: { explosions: [explosion('core:1'), explosion('extra:1', { list: 3 })] } }]);
    expect(sounds(first)).toEqual([`started ${SOUNDS.boomA} entity:1:0`, `started ${SOUNDS.boomB} effect:extra:1`]);
    const ended = frame([{ tick: 2, entities: [coreExplosion(1)], presentation: { explosions: [explosion('core:1')] } }]);
    expect(sounds(ended)).toEqual(['stopped removal effect:extra:1']);
    expect(controller.getSnapshot().voices).toBe(0);
  });

  it('refuses a shown Core explosion without its presentation selection', () => {
    const { frame } = harness();
    expect(failureOf(() => frame([{ tick: 1, entities: [coreExplosion(10)] }]))).toBe('binding');
  });
});

describe('interruptions and the run\'s end (DW-11)', () => {
  it('after the page hid, restarts continuous sounds and live explosions only, never one-shots (D2-17)', () => {
    const { frame, audio, lifecycle, controller } = harness();
    frame([blast1(1, [events.weaponSelected(1), events.shot(1, { shooter: 2, kindBit: KINDS.enemy })])]);
    expect(controller.getSnapshot().voices).toBe(4);
    lifecycle.hide();
    expect(controller.getSnapshot().voices).toBe(0);
    lifecycle.show();
    audio.context.setState('running');
    const later: FlightSoundDecision[] = [];
    for (let tick = 2; tick <= 8; tick++) later.push(...frame([blast1(tick)]));
    expect(later.map(decision => `${decision.tick} ${brief(decision)}`)).toEqual([
      `7 started ${SOUNDS.enemyEngine} entity:2:0`,
      `8 started ${SOUNDS.boomA} entity:10:0`,
    ]);
  });

  it('queues nothing while the controller is locked: only what still sounds after the unlock starts', () => {
    const { frame, controller, decisions } = harness({ locked: true });
    frame([blast1(1, [events.weaponSelected(1), events.hit(1, { victim: 3, kindBit: KINDS.enemy })])]);
    expect(decisions.map(({ result, code }) => `${result} ${code}`)).toEqual(Array.from({ length: 4 }, () => 'failed audio-locked'));
    controller.unlock();
    // The failed first starts set no clock: the engine and the explosion start on the next tick; the rest never replays.
    expect(sounds(frame([blast1(2)]))).toEqual([`started ${SOUNDS.enemyEngine} entity:2:0`, `started ${SOUNDS.boomA} entity:10:0`]);
  });

  it('ends on invalidate or at the run\'s end: every voice stops, both subscriptions go, later input does nothing', () => {
    for (const end of ['invalidate', 'run'] as const) {
      const { frame, run, presentation, controller, consumer, decisions } = harness();
      frame([blast1(1)]);
      expect(controller.getSnapshot().voices).toBe(2);
      if (end === 'invalidate') consumer.invalidate();
      else run.end();
      consumer.invalidate();
      run.end();
      expect(controller.getSnapshot().voices).toBe(0);
      expect(run.frameListeners.size).toBe(0);
      expect(presentation.listeners.size).toBe(0);
      const count = decisions.length;
      expect(() => presentation.emit(presentationTick(tickOutput({ tick: 7 }), { runId: 99 }))).not.toThrow();
      expect(decisions).toHaveLength(count);
    }
  });

  it('keeps its handles to its run: a new run\'s consumer on the same controller starts from empty tables', () => {
    const first = harness();
    first.frame([blast1(1)]);
    first.consumer.invalidate();
    const run = new FakeRun(RUN + 1);
    const presentation = new FakePresentation(OWNER, RUN + 1);
    const decisions: FlightSoundDecision[] = [];
    attachRunAudio(run, { ownerId: OWNER, content: CONTENT, controller: first.controller, presentation, record: (decision) => { decisions.push(decision); } });
    const output = tickOutput({ tick: 1, entities: [enemy(2)] });
    run.frame([output]);
    presentation.emit(presentationTick(output, { runId: RUN + 1 }));
    expect(decisions.map(({ runId, result, sound }) => `${runId} ${result} ${sound}`)).toEqual([`${RUN + 1} started ${SOUNDS.enemyEngine}`]);
  });
});

describe('budgets (DW-03)', () => {
  it('allows each tick\'s explosion-started events plus the presentation objects as activations, and no more', () => {
    const allowed = harness();
    const started = [events.explosionStarted(1, 30)];
    expect(failureOf(() => allowed.frame([{ tick: 1, events: started, presentation: { activations: PRESENTATION_LIMITS.objects + 1 } }]))).toBeNull();
    const over = harness();
    expect(failureOf(() => over.frame([{ tick: 1, presentation: { activations: PRESENTATION_LIMITS.objects + 1 } }]))).toBe('budget');
  });

  it('refuses more explosions than the kept selections', () => {
    const { frame } = harness();
    const explosions = Array.from({ length: PRESENTATION_LIMITS.selections + 1 }, (_, index) => explosion(`extra:${index + 1}`));
    expect(failureOf(() => frame([{ tick: 1, presentation: { explosions } }]))).toBe('budget');
  });

  it('refuses more entity sound tables than Core has entities', () => {
    const { frame } = harness();
    const entities = Array.from({ length: CORE_LIMITS.entities + 1 }, (_, index) => enemy(index + 2));
    expect(failureOf(() => frame([{ tick: 1, entities }]))).toBe('budget');
  });
});

/** Enemy 2's engine and Core explosion 10 (list 1, item 0), with `list` as the tick's events. */
function blast1(tick: number, list: readonly DomainEvent[] = []): TickInput {
  return { tick, entities: [enemy(2), coreExplosion(10)], events: list, presentation: { explosions: [explosion('core:10')] } };
}

/** The tick each presentation explosion (not Core's) leaves the list: the one after it was last listed. */
function leavingTicks(ticks: readonly PresentationTick[]): Map<string, number> {
  const left = new Map<string, number>();
  for (const { tick, explosions } of ticks) for (const { key } of explosions) if (!key.startsWith('core:')) left.set(key, tick + 1);
  return left;
}

/**
 * DW-07 on a whole run: nothing is heard of a presentation explosion after the tick it leaves the list, its removal
 * stop is in that tick and no other, and a voice it last started that nothing cut (a preemption or a stop of every
 * voice) is stopped then. Returns how many voices the removals stopped.
 */
function expectRemovals(decisions: readonly FlightSoundDecision[], ticks: readonly PresentationTick[]): number {
  const left = leavingTicks(ticks);
  let stopped = 0;
  for (const [key, leaving] of left) {
    const own = decisions.filter(({ source }) => source?.namespace === 'effect' && source.id === key);
    for (const { tick, result, code } of own) {
      expect(tick, key).toBeLessThanOrEqual(leaving);
      expect(result === 'stopped' && code === 'removal', `${key} at ${tick}`).toBe(tick === leaving);
    }
    const start = own.filter(({ result }) => result === 'started').at(-1);
    if (start === undefined || ticks.at(-1)!.tick < leaving) continue;
    const cut = decisions.some((decision) => decision.tick >= start.tick && decision !== start && decisions.indexOf(decision) > decisions.indexOf(start)
      && ((decision.preempted?.namespace === 'effect' && decision.preempted.id === key) || (decision.result === 'stopped' && decision.code === 'stop-all')));
    if (!cut) {
      expect(own.at(-1), key).toMatchObject({ tick: leaving, result: 'stopped', code: 'removal' });
      stopped++;
    }
  }
  return stopped;
}

describe('P3-12\'s real module on a hand-driven run (DW-01, DW-05, DW-07, DW-08, DW-11)', () => {
  const CENTRE = at(0, 0, 0);
  /**
   * Enemy 3 died in tick 1's collisions 1,000 ahead: its explosion 10 is pending in tick 1, activates in tick 2 and
   * drifts 1 unit a tick along z; the presentation effects add its extras, which leave about 48 ticks after activating.
   */
  const blast = (tick: number, spec: Partial<TickSpec> = {}): TickSpec => {
    const list: DomainEvent[] = [];
    if (tick === 1) list.push(events.explosionCreated(1, 10, { position: at(0, 0, 1000), velocity: at(0, 0, 32) }));
    if (tick === 2) list.push(events.explosionStarted(2, 10, { position: at(0, 0, 1000) }));
    const boom: EntitySpec = { id: 10, kindBit: EXPLOSION_KIND_BIT, position: at(0, 0, 999 + tick), speed: 32, display: tick === 1 ? 'pending' : 'shown' };
    return { tick, activeAreaCentre: CENTRE, entities: [player, boom], events: list, ...spec };
  };
  const ticks = (from: number, to: number, spec: (tick: number) => TickSpec = blast) => Array.from({ length: to - from + 1 }, (_, at) => spec(from + at));
  const play = (h: ReturnType<typeof realHarness>, grouping: readonly number[], spec: (tick: number) => TickSpec = blast) => {
    let tick = 0;
    for (const count of grouping) {
      h.frame(ticks(tick + 1, tick + count, spec));
      tick += count;
    }
    return h.decisions;
  };
  const selectionOf = (h: ReturnType<typeof realHarness>, key: string) =>
    h.flight.ticks.flatMap(({ activations }) => activations).find((activation) => activation.key === key as ExplosionKey)!.selection;

  it('pairs the same decisions in either order and under 1×5, 5 and 2+0+3 frames, each explosion sounding its one selection', () => {
    const groupings = [Array.from({ length: 60 }, () => 1), Array.from({ length: 12 }, () => 5), Array.from({ length: 12 }, () => [2, 0, 3]).flat()];
    const reference = realHarness();
    play(reference, groupings[0]);
    for (const order of ['outputs-first', 'presentation-first'] as const) {
      for (const grouping of groupings) {
        const h = realHarness({ order });
        expect(play(h, grouping)).toEqual(reference.decisions);
        expect(h.flight.ticks).toEqual(reference.flight.ticks);
      }
    }
    const keys = reference.flight.ticks.flatMap(({ activations }) => activations.map(({ key }) => key));
    expect(keys.filter((key) => key.startsWith('extra:')).length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const decision of reference.decisions) {
      const { source } = decision;
      const key = source?.namespace === 'effect' ? source.id : source?.namespace === 'entity' && source.id === 10 ? 'core:10' : null;
      if (key !== null && decision.result !== 'stopped') expect(decision.sound).toBe(explosionSound(CONTENT, selectionOf(reference, key)));
    }
    expect(expectRemovals(reference.decisions, reference.flight.ticks)).toBeGreaterThan(0);
    expect(reference.controller.getSnapshot().voices).toBeGreaterThan(0);
  });

  it('does nothing on a still frame or a frame without ticks: no presentation step, no replay, no update', () => {
    const h = realHarness();
    play(h, [1, 1, 1]);
    const count = h.decisions.length;
    const notified = h.flight.ticks.length;
    const camera = h.flight.presentation.camera();
    expect(h.frame(null)).toEqual([]);
    expect(h.frame([])).toEqual([]);
    expect(h.flight.ticks).toHaveLength(notified);
    expect(h.flight.presentation.camera()).toBe(camera);
    h.frame([blast(4)]);
    expect(h.flight.ticks.map(({ tick }) => tick)).toEqual([1, 2, 3, 4]);
    expect(h.decisions.slice(count).every(({ tick }) => tick === 4)).toBe(true);
  });

  it('listens from the tick-end camera in Warp, not the camera before the step (DW-05, D2-04)', () => {
    const h = realHarness();
    const tunnel = at(500, 0, 0);
    const heard = h.frame([{ tick: 1, viewMode: 1, entities: [{ ...player, position: tunnel }, enemy(2, { position: at(500, 0, 1000) })] }]);
    expect(h.flight.ticks[0]).toMatchObject({ beforeStep: { position: at(0, 0, 0) }, afterStep: { position: tunnel, viewMode: 1 } });
    expect(heard.find(({ source }) => source?.namespace === 'entity' && source.id === 2)).toMatchObject({ result: 'started', parameters: AHEAD_1000 });
  });

  it('listens from the destruction camera in view 0x11, sub-mode 8', () => {
    const h = realHarness();
    h.frame([{ tick: 1, entities: [player] }]);
    const pose = { position: at(0, 0, 0), rows: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as Matrix3 };
    const spec: TickSpec = {
      tick: 2, viewMode: 0x11, subMode: 8, followedEntityId: 4, events: [events.viewSwitched(2, 0x11, 8, 'object-update', pose)],
      entities: [player, enemy(2, { position: at(0, 0, 1000) }), { id: 4, kindBit: KINDS.enemy, position: at(600, 0, 600) }],
    };
    const heard = h.frame([spec]);
    const { afterStep, beforeStep } = h.flight.ticks[1];
    const output = tickOutput(spec);
    const reading = entityReading(output.render.entities.find(({ id }) => id === 2)!);
    const from = (camera: CameraPose) => nonPlayerParameters(audioListener(camera, output.projection.flight.motion), reading);
    expect(from(afterStep)).not.toEqual(from(beforeStep));
    expect(heard.find(({ source }) => source?.namespace === 'entity' && source.id === 2)).toMatchObject({ result: 'started', parameters: from(afterStep) });
  });

  it('after the page hid and came back, selects nothing again and replays the live explosions without preempting (D2-06, D2-17)', () => {
    const h = realHarness();
    play(h, Array.from({ length: 10 }, () => 1));
    const live = new Set<string>(h.flight.ticks.at(-1)!.explosions.map(({ key }) => key));
    expect(live.size).toBeGreaterThan(1);
    h.rig.lifecycle.hide();
    expect(h.controller.getSnapshot().voices).toBe(0);
    // The session holds the run while hidden: its frames have no tick.
    h.frame(null);
    h.frame([]);
    h.rig.lifecycle.show();
    h.rig.audio.context.setState('running');
    const count = h.decisions.length;
    for (let tick = 11; tick <= 30; tick++) h.frame([blast(tick)]);
    const keys = h.flight.ticks.flatMap(({ activations }) => activations.map(({ key }) => key));
    expect(new Set(keys).size).toBe(keys.length);
    // Each live explosion tries again from its selection, never preempting: with class 2 taken by an explosion that
    // activated since, the tries are refused.
    const replays = h.decisions.slice(count).filter(({ source }) => (source?.namespace === 'effect' && live.has(source.id)) || (source?.namespace === 'entity' && source.id === 10));
    expect(replays.length).toBeGreaterThan(0);
    for (const replay of replays) {
      expect(replay).toMatchObject({ result: expect.stringMatching(/^(started|refused)$/), preempted: null });
      expect(replay.tick).toBeGreaterThan(11);
      const key = replay.source?.namespace === 'effect' ? replay.source.id : 'core:10';
      expect(replay.sound).toBe(explosionSound(CONTENT, selectionOf(h, key)));
    }
  });

  it('starts a retry afresh: a new run, module and consumer on the same controller inherit nothing', () => {
    const first = realHarness();
    play(first, Array.from({ length: 12 }, () => 1));
    first.run.end();
    expect(first.controller.getSnapshot().voices).toBe(0);
    const retry = realHarness({ controller: first.controller, runId: RUN + 1 });
    play(retry, Array.from({ length: 12 }, () => 1));
    expect(retry.decisions.map(({ runId, ...decision }) => ({ ...decision, runId: runId - 1 }))).toEqual(first.decisions);
    expect(retry.flight.ticks.map((tick) => ({ ...tick, runId: tick.runId - 1 }))).toEqual(first.flight.ticks);
  });
});

describe('formal Session runs with P3-12\'s real presentation module (AC-03, AC-05, AC-07, AC-13, AC-14)', () => {
  /** Commands submitted at the first frame with ticks that starts at the key's tick, a multiple of 5 in every grouping. */
  const SCRIPT: Readonly<Record<number, readonly Command[]>> = {
    5: [{ type: 'fire', channel: 'primary' }],
    10: [{ type: 'target', operation: 'enemy' }],
    15: [{ type: 'fire', channel: 'secondary' }],
    50: [{ type: 'damage-report' }, { type: 'energy', operation: 'open' }, { type: 'energy', operation: 'shield-increase' }],
    55: [{ type: 'select-missile', direction: 'next' }],
  };
  const TICKS = 120;
  const GROUPINGS: Readonly<Record<string, readonly number[]>> = {
    '1×5': Array.from({ length: TICKS }, () => 1),
    '5': Array.from({ length: TICKS / 5 }, () => 5),
    '2+0+3': Array.from({ length: TICKS / 5 }, () => [2, 0, 3]).flat(),
    'zero to five ticks a frame': Array.from({ length: TICKS / 10 }, () => [0, 2, 0, 3, 5, 0, 0]).flat(),
  };

  interface PlayOptions {
    /** Which frame consumer the run calls first; null wires no sound. */
    readonly audio?: InputOrder | null;
    readonly locked?: boolean;
    /** Also wires P3-13's cockpit after the presentation module, as wireFlightRun does. */
    readonly cockpit?: boolean;
    /** Wires the sound only between frames once this tick is processed (a late consumer). */
    readonly attachAt?: number;
  }

  function play(grouping: readonly number[], { audio = 'outputs-first', locked = false, cockpit: withCockpit = false, attachAt = 0 }: PlayOptions = {}) {
    const { session, host, errors } = sessionSetup();
    const spec = combatRunSpec({ mapGeometry: COCKPIT_MAP_GEOMETRY });
    session.control({ type: 'start', spec });
    const run = current(session);
    const delivered: DomainEvent[] = [];
    run.onAny((event) => { delivered.push(event); });
    const decisions: FlightSoundDecision[] = [];
    let voices = 0;
    /** The first tick whose Render State gives the player's entity a pose item (A-01, FS-01). */
    let playerShown: number | null = null;
    run.onFrame(({ report }) => {
      for (const { tick, render, projection } of report?.outputs ?? []) {
        const entity = render.entities.find(({ id }) => id === projection.player.entityId);
        if (playerShown === null && (entity?.display === 'shown' || entity?.display === 'hidden')) playerShown = tick;
      }
    });
    const flight = realPresentation(run, run.renderFrame().current);
    const cockpit = withCockpit ? cockpitFor(run, spec, flight.presentation.camera()) : null;
    const cockpitStates: CockpitState[] = [];
    const connect = () => flight.connect((ticks) => {
      if (cockpit && ticks.length > 0) cockpit.presentation.advance({ ownerId: OWNER, runId: run.runId, ticks: ticks.map(tick => ({ ...tick, mapRightButton: false })) });
    });
    const { controller } = audioRig({ locked });
    // The real module is the consumer's port as it is.
    const port: AudioPresentation = flight.presentation;
    let attached = false;
    const attach = () => {
      attached = true;
      attachRunAudio(run, { ownerId: OWNER, content: CONTENT, controller, presentation: port, record: (decision) => { decisions.push(decision); } });
      run.onFrame(() => { voices = Math.max(voices, controller.getSnapshot().voices); });
    };
    if (audio !== 'outputs-first' || attachAt > 0) connect();
    if (audio !== null && attachAt === 0) attach();
    if (audio === 'outputs-first' && attachAt === 0) connect();
    const requests = host.callbacks.length;
    let now = 0;
    let tick = 0;
    const submitted = new Set<number>();
    host.deliver(now);
    for (const ticks of grouping) {
      if (audio !== null && !attached && tick >= attachAt) attach();
      if (ticks > 0 && SCRIPT[tick] && !submitted.has(tick)) {
        submitted.add(tick);
        for (const command of SCRIPT[tick]) run.submitCommand(command);
      }
      now += ticks * TICK_MS;
      host.deliver(now);
      tick += ticks;
      if (cockpit && ticks > 0 && tick % 5 === 0) cockpitStates.push(cockpitState(cockpit));
    }
    expect(errors).toEqual([]);
    expect(session.status().phase).toBe('running');
    return { delivered, decisions, voices, playerShown, frameRequests: host.callbacks.length - requests, presentation: flight.ticks, cockpit: cockpitStates };
  }

  const reference = play(GROUPINGS['1×5']);
  const silent = play(GROUPINGS['1×5'], { audio: null });
  /** Each activation's one selection, by key. */
  const selections = new Map(reference.presentation.flatMap(({ activations }) => activations).map(({ key, selection }) => [key as string, selection]));
  /** The explosion key of a decision's voice: an effect's, or a Core explosion's slot 0. */
  const explosionKey = ({ source }: FlightSoundDecision): string | null => {
    if (source?.namespace === 'effect') return source.id;
    return source?.namespace === 'entity' && source.slot === 0 && selections.has(`core:${source.id}`) ? `core:${source.id}` : null;
  };

  it('makes the same decisions under every grouping and input order, and leaves Core, the presentation and the frame loop alone', () => {
    expect(reference.delivered).toEqual(silent.delivered);
    expect(reference.frameRequests).toBe(silent.frameRequests);
    expect(reference.presentation).toEqual(silent.presentation);
    for (const [name, grouping] of Object.entries(GROUPINGS)) {
      for (const order of ['outputs-first', 'presentation-first'] as const) {
        const result = play(grouping, { audio: order });
        expect(result.decisions, `${name}, ${order}`).toEqual(reference.decisions);
        expect(result.delivered).toEqual(silent.delivered);
        expect(result.presentation).toEqual(silent.presentation);
      }
    }
  });

  it('sounds the run\'s facts once each, from the events and the listed objects', () => {
    const { decisions, delivered, voices, playerShown } = reference;
    expect(voices).toBeLessThanOrEqual(8);
    const shots = delivered.filter(event => event.type === 'shot-fired');
    const hits = delivered.filter(event => event.type === 'hit' && event.cause !== 'parked');
    expect(shots.length).toBeGreaterThan(0);
    expect(hits.length).toBeGreaterThan(0);
    // One decision per shot and per hit, at its tick and event index, never merged by sound or tick.
    const oneShots = decisions.filter(({ source }) => source?.namespace === 'entity' && source.slot !== 0);
    expect(oneShots.filter(({ source }) => source?.namespace === 'entity' && (source.slot === 1 || source.slot === 2))).toHaveLength(shots.length);
    expect(oneShots.filter(({ source }) => source?.namespace === 'entity' && (source.slot === 3 || source.slot === 4))).toHaveLength(hits.length);
    // The player's own shots keep the start values.
    const playerShots = oneShots.filter(({ source }) => source?.namespace === 'entity' && source.id === 1 && source.slot !== 3 && source.slot !== 4);
    expect(playerShots.length).toBeGreaterThan(0);
    expect(playerShots.every(({ parameters, result }) => result !== 'started' || (parameters?.volume === 127 && parameters.pan === 64))).toBe(true);
    // The target selection by ID; the player's engine at its first update; explosions from their selections.
    const targets = delivered.filter(event => event.type === 'target-changed');
    expect(decisions.filter(({ sound }) => sound === EVENT_SOUNDS.targetSelect).map(({ tick }) => tick)).toEqual(targets.map(({ tick }) => tick));
    expect(decisions.find(({ source }) => source?.namespace === 'entity' && source.id === 1 && source.slot === 0)).toMatchObject({ tick: playerShown, sound: SOUNDS.playerEngine, voiceClass: 5 });
    expect(playerShown).not.toBeNull();
    expect(decisions.some(({ source, result }) => source?.namespace === 'effect' && result === 'started')).toBe(true);
    expect(decisions.some(({ voiceClass, sound, result }) => voiceClass === 2 && result === 'started' && (sound === SOUNDS.boomA || sound === SOUNDS.boomB))).toBe(true);
  });

  it('activates each explosion once and sounds it from that one selection, as the animation reads it (S-05, AC-05, AC-14)', () => {
    const activations = reference.presentation.flatMap(({ activations: list }) => list);
    expect(new Set(activations.map(({ key }) => key)).size).toBe(activations.length);
    expect(activations.some(({ key }) => key.startsWith('core:'))).toBe(true);
    expect(activations.some(({ key }) => key.startsWith('extra:'))).toBe(true);
    // The animation reads the listed explosions: each keeps its activation's selection while it lives.
    for (const { explosions } of reference.presentation) {
      for (const { key, selection } of explosions) expect(selection).toEqual(selections.get(key));
    }
    // Each explosion voice is the EXPL record of that selection (list − 1, the original item index), first heard in
    // its activation tick.
    const heard = reference.decisions.filter(decision => explosionKey(decision) !== null);
    expect(heard.length).toBeGreaterThan(0);
    for (const decision of heard) {
      if (decision.result !== 'stopped') expect(decision.sound).toBe(explosionSound(CONTENT, selections.get(explosionKey(decision)!)!));
    }
    for (const { key, tick } of activations) {
      const first = heard.find(decision => explosionKey(decision) === key);
      if (first) expect(first.tick, key).toBe(tick);
    }
    expect(new Set(heard.map(explosionKey)).size).toBeGreaterThan(1);
  });

  it('stops a presentation explosion\'s voice in the tick it leaves the list, and hears nothing of it after (DW-07)', () => {
    const left = leavingTicks(reference.presentation);
    expect(left.size).toBeGreaterThan(0);
    expectRemovals(reference.decisions, reference.presentation);
  });

  it('never selects again when the controller refuses or fails its voices', () => {
    const locked = play(GROUPINGS['1×5'], { locked: true });
    expect(locked.decisions.some(({ result, code }) => result === 'failed' && code === 'audio-locked')).toBe(true);
    expect(locked.presentation).toEqual(silent.presentation);
  });

  it('lets the cockpit and the sounds each read the same tick outputs, neither stepping the other (AC-07)', () => {
    const both = play(GROUPINGS['2+0+3'], { cockpit: true, audio: 'presentation-first' });
    const cockpitOnly = play(GROUPINGS['2+0+3'], { cockpit: true, audio: null });
    expect(both.decisions).toEqual(reference.decisions);
    expect(both.cockpit).toHaveLength(TICKS / 5);
    expect(both.cockpit).toEqual(cockpitOnly.cockpit);
    expect(both.presentation).toEqual(silent.presentation);
    expect(both.delivered).toEqual(silent.delivered);
  });

  it('gives a late consumer only the ticks after it, replaying no earlier activation', () => {
    const late = play(GROUPINGS['5'], { attachAt: 50 });
    expect(late.decisions.length).toBeGreaterThan(0);
    expect(late.decisions.every(({ tick }) => tick > 50)).toBe(true);
    expect(late.presentation).toEqual(silent.presentation);
    // No voice of an explosion that had already ended is heard; the voices it does give are from their selections.
    const ended = new Set(selections.keys());
    for (const { explosions } of silent.presentation.filter(({ tick }) => tick === 50)) for (const { key } of explosions) ended.delete(key);
    for (const { key, tick } of silent.presentation.flatMap(({ activations }) => activations)) if (tick > 50) ended.delete(key);
    for (const decision of late.decisions) {
      const key = explosionKey(decision);
      if (key === null) continue;
      expect(ended.has(key), key).toBe(false);
      if (decision.result !== 'stopped') expect(decision.sound).toBe(explosionSound(CONTENT, selections.get(key)!));
    }
  });
});
