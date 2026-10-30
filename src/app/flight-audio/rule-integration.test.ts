import { beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import {
  CHAIN_COMMANDS, chainInput, FAR_PIXEL, FAR_SELECT_TICK, NEAR_HOSTILE_ID, NEAR_SELECT_TICK, PLAYER_ID, selectAt, WARP_TICK,
} from '../../core/replay/map-warp.test-support.ts';
import { SUCCESS_COMPLETION_TICK, successSpec, thirdLossSpec } from '../runtime/mission-end.test-support.ts';
import type { FlightSoundDecision } from './consumer.ts';
import { brief, combatRunSpec } from './consumer.test-support.ts';
import { dockingSpec, playRules, runSpecOf, scripted, type RuleRun, type RuleScript } from './rule-integration.test-support.ts';

// P3-14/19 (docs/plan/p3/14/spec.md, 触发表, S-02, S-07, AC-03, AC-09, AC-10; D-02 定稿 DW-04, DW-06, DW-09, DW-11): the
// sound of the delivered rule chains, from P3-08's transponder, P3-09's map and Warp, P3-10's communications, docking,
// base keys and launch, and P3-11's rescues, result and teardown. Each run is a formal Session of the upstream tasks' own
// synthetic worlds (map-warp.test-support.ts, comm-replay.test.ts's docking world, mission-end.test-support.ts), its
// holds completed and its completion ending the run's sound; no rule is replaced and no event is made by hand. The
// expected sounds are DW-06's, written out here by Asset ID rather than read from events.ts; the original's reasons are in
// docs/original/formats/audio.md, "Modes and lifecycle (A-08)" and "Play-by-ID boundaries and reachability (A-10)".

/** DW-06: the sound an event plays by ID, null for none (including an event whose fields say the original posts none). */
function playedById(event: DomainEvent): string | null {
  switch (event.type) {
    case 'target-changed': return 'sound/event/target-select';
    case 'weapon-selected': return 'sound/event/weapon-select';
    case 'energy-allocation-changed': return 'sound/event/key-command';
    case 'left-page-changed': return event.commandIndex === null ? null : 'sound/event/key-command';
    case 'warp-destination-set': return 'sound/event/map-destination';
    case 'warp-started': return 'sound/warp';
    case 'warp-completed': return event.arrival?.hostileNear ? 'sound/event/warp-arrival' : null;
    case 'base-navigated': return 'sound/event/base-select-key';
    case 'base-confirmed': return 'sound/event/base-execute-key';
    case 'transponder-deployed': return 'sound/event/transponder-created';
    default: return null;
  }
}

/** DW-09's stop events. */
const STOPS: ReadonlySet<DomainEvent['type']> = new Set(['docked', 'departed', 'player-rescued', 'result-latched', 'teardown-started']);

const isObject = ({ source }: FlightSoundDecision) => source?.namespace === 'entity' || source?.namespace === 'effect';
/** An update item's decision: an object's, caused by no event and not a removal's stop. */
const isUpdate = (decision: FlightSoundDecision) => isObject(decision) && decision.trigger === null && decision.result !== 'stopped';

/** DW-06's object items: the entity and slot an event's one decision addresses, null for an event with none of its own. */
function objectItem(event: DomainEvent): string | null {
  switch (event.type) {
    case 'shot-fired': return `entity:${event.shooterEntityId}:${event.family === 'gun' ? 1 : 2}`;
    case 'hit': return event.cause === 'parked' ? null : `entity:${event.victimEntityId}:${event.shieldWasEmpty ? 4 : 3}`;
    default: return null;
  }
}

const sourceOf = ({ source }: FlightSoundDecision): string | null =>
  source?.namespace === 'entity' ? `entity:${source.id}:${source.slot}` : source?.namespace ?? null;

/**
 * The contract every tick of a formal run keeps: each event plays its sound by ID once, at its emission index and in
 * event order, and nothing else plays by ID; each shot and each unparked hit has one decision for its source's slot,
 * at its index, unless docked, and an event's only other decisions are its retirement's stops; a tick with a stop event
 * stops every voice once, before any of its sounds; a docked tick has no object item, removals included; a tick without
 * a player entity no update item.
 */
function expectRuleSounds({ ticks, decisionsByTick: byTick, errors }: RuleRun): void {
  expect(errors).toEqual([]);
  expect(ticks.map(({ tick }) => tick)).toEqual(ticks.map((_, index) => index + 1));
  expect([...byTick.keys()].every((tick) => tick >= 1 && tick <= ticks.length)).toBe(true);
  for (const { tick, events, docked, posing } of ticks) {
    const made = byTick.get(tick) ?? [];
    const expected = events.flatMap((event, index) => {
      const sound = playedById(event);
      return sound === null ? [] : [[index, sound, 'started']];
    });
    expect(made.filter(({ source }) => source?.namespace === 'by-id').map(({ trigger, sound, result }) => [trigger, sound, result]), `tick ${tick}`).toEqual(expected);
    const objects = docked ? [] : events.flatMap((event, index) => {
      const item = objectItem(event);
      return item === null ? [] : [[index, item]];
    });
    expect(made.filter(({ trigger, source }) => trigger !== null && source?.namespace === 'entity' && source.slot !== 0).map((decision) => [decision.trigger, sourceOf(decision)]), `tick ${tick}`)
      .toEqual(objects);
    for (const decision of made.filter(({ trigger, source }) => trigger !== null && source?.namespace === 'entity' && source.slot === 0)) {
      const event = events[decision.trigger!];
      expect([event.type, decision.code, event.type === 'object-retired' && event.entityId], `tick ${tick}`).toEqual(['object-retired', 'removal', (decision.source as { id: number }).id]);
    }
    const stops = made.filter(({ code }) => code === 'stop-all');
    if (events.some(({ type }) => STOPS.has(type))) {
      expect(stops, `tick ${tick}`).toHaveLength(1);
      expect(made[0], `tick ${tick}`).toBe(stops[0]);
    } else {
      expect(stops, `tick ${tick}`).toEqual([]);
    }
    if (docked) expect(made.filter(isObject).map(brief), `tick ${tick}`).toEqual([]);
    if (!posing) expect(made.filter(isUpdate).map(brief), `tick ${tick}`).toEqual([]);
  }
}

const eventsOf = <Type extends DomainEvent['type']>({ ticks }: RuleRun, type: Type) =>
  ticks.flatMap(({ events }) => events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type));
const ticksOf = (run: RuleRun, type: DomainEvent['type']) => eventsOf(run, type).map(({ tick }) => tick);
const soundsAt = ({ decisionsByTick }: RuleRun, tick: number) => (decisionsByTick.get(tick) ?? []).map(brief);
const refusedAt = (run: RuleRun, tick: number, commandType: string) =>
  eventsOf(run, 'command-result').filter((event) => event.tick === tick && event.commandType === commandType && event.outcome !== 'accepted').map(({ reason }) => reason);

/** P3-09's chain (map-warp.test-support.ts) with refused, repeated and later requests added around it. */
const WARP_LATE = 645;
const WARP_SCRIPT: Readonly<Record<number, readonly Command[]>> = {
  ...CHAIN_COMMANDS,
  // Before the player is active: the Warp and the transponder are refused.
  2: [{ type: 'request-warp' }, { type: 'drop-transponder' }],
  // A select at an unchanged point, as the input layer repeats a held button (P3-09 S-04, P3-05).
  [FAR_SELECT_TICK]: [selectAt(FAR_PIXEL), selectAt(FAR_PIXEL)],
  // In Warp: refused.
  [WARP_TICK + 1]: [{ type: 'request-warp' }],
  // After the arrival: both weapon keys (the player has one gun and no missile), the energy keys and two transponders.
  [WARP_LATE]: [{ type: 'cycle-main-weapon' }, { type: 'select-missile', direction: 'next' }],
  // The energy page and a shield level up.
  [WARP_LATE + 2]: [{ type: 'energy', operation: 'open' }, { type: 'energy', operation: 'shield-increase' }],
  [WARP_LATE + 5]: [{ type: 'drop-transponder' }, { type: 'drop-transponder' }],
};

const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });
const navigate = (direction: 'previous' | 'next', count = 1): Command[] => Array.from({ length: count }, () => ({ type: 'navigate-selection', direction }));
const CONFIRM: Command = { type: 'confirm-selection' };

/** Commands for the docking world's flight, then for each docking from the tick it is reported. */
const DOCKING_FLIGHT: Readonly<Record<number, readonly Command[]>> = {
  // Base B's status, through the communications menu.
  4: [open, digit(1), digit(1)],
  // The status reply's incoming page holds the left display: refused.
  10: [{ type: 'energy', operation: 'open' }],
  20: [{ type: 'drop-transponder' }],
  // Docking at base A, one key a tick.
  60: [open],
  61: [digit(2)],
  62: [digit(2)],
};
/** After docking: Up at the top and Down, Enter; the map from the base and a select in it; Down past the end, Enter; the launch. */
const DOCKED: Readonly<Record<number, readonly Command[]>> = {
  5: [...navigate('previous'), ...navigate('next'), CONFIRM],
  8: [{ type: 'toggle-map' }],
  9: [selectAt(FAR_PIXEL)],
  10: [{ type: 'toggle-map' }],
  12: [...navigate('next', 6), CONFIRM],
  30: [{ type: 'launch' }],
};

const dockingScript: RuleScript = (tick, ticks) => {
  const docked = ticks.findLast(({ events }) => events.some(({ type }) => type === 'docked'))?.tick;
  return (docked === undefined ? undefined : DOCKED[tick - docked]) ?? DOCKING_FLIGHT[tick] ?? [];
};

const speedUp: RuleScript = (tick) => (tick % 8 === 0 ? [{ type: 'speed', operation: 'maximum' }] : []);

/** The combat world's guns, a target and missiles (as consumer.test.ts's formal runs). */
const COMBAT_SCRIPT: Readonly<Record<number, readonly Command[]>> = {
  5: [{ type: 'fire', channel: 'primary' }],
  10: [{ type: 'target', operation: 'enemy' }],
  15: [{ type: 'fire', channel: 'secondary' }],
  20: [{ type: 'fire', channel: 'secondary' }],
};

// Whole runs: the third loss is about 9,400 ticks.
describe('formal rule chains to sound (P3-14/19)', { timeout: 120_000 }, () => {
  let combat: RuleRun;
  let warp: RuleRun;
  let docking: RuleRun;
  let success: RuleRun;
  let thirdLoss: RuleRun;

  beforeAll(() => {
    combat = playRules(combatRunSpec(), scripted(COMBAT_SCRIPT), { until: 120 });
    warp = playRules(runSpecOf(chainInput()), scripted(WARP_SCRIPT), { until: WARP_LATE + 10 });
    docking = playRules(dockingSpec(), dockingScript, { until: 500 });
    success = playRules(runSpecOf(successSpec()), () => [], { until: 2000 });
    thirdLoss = playRules(runSpecOf(thirdLossSpec()), speedUp, { until: 20_000 });
  });

  it('produces every sound fact of DW-06 and every stop of DW-09 from the delivered rules', () => {
    const types = new Set([combat, warp, docking, success, thirdLoss].flatMap(({ ticks }) => ticks.flatMap(({ events }) => events.map(({ type }) => type))));
    for (const type of [
      'shot-fired', 'hit', 'object-retired', 'target-changed', 'weapon-selected', 'energy-allocation-changed', 'left-page-changed', 'warp-destination-set', 'warp-started', 'warp-completed',
      'base-navigated', 'base-confirmed', 'transponder-deployed', 'docked', 'departed', 'player-loss-started', 'player-rescued', 'result-latched', 'teardown-started',
    ] as const) expect(types, type).toContain(type);
    // A tick without a player entity is only a completion's, after the teardown released every entity, so the
    // player gate of DW-04 holds nothing back in these runs; consumer.test.ts gives it listed objects to gate.
    for (const run of [combat, warp, docking, success, thirdLoss]) {
      expect(run.ticks.filter(({ posing }) => !posing).map(({ tick, posed }) => [tick, posed.size])).toEqual(run.completedTick === null ? [] : [[run.completedTick, 0]]);
    }
    expect(new Set([...eventsOf(success, 'result-latched'), ...eventsOf(thirdLoss, 'result-latched')].map(({ result }) => result.reason.type))).toEqual(new Set(['all-clear', 'third-loss']));
  });

  it('sounds the shooter\'s gun and missile slots and each hit of the combat world', () => {
    expectRuleSounds(combat);
    const shots = eventsOf(combat, 'shot-fired');
    expect(new Set(shots.map(({ family }) => family))).toEqual(new Set(['gun', 'missile']));
    expect(eventsOf(combat, 'hit').length).toBeGreaterThan(0);
    const [missile] = shots.filter(({ family }) => family === 'missile');
    expect(soundsAt(combat, missile.tick)).toContain(`started sound/synthetic-flight/missile entity:${missile.shooterEntityId}:2`);
  });

  describe('P3-09 map and Warp, P3-08 transponder', () => {
    it('keeps the contract at every tick', () => { expectRuleSounds(warp); });

    it('clicks once per applied select, also at an unchanged point; a refused Warp has no Warp sound', () => {
      expect(ticksOf(warp, 'warp-destination-set')).toEqual([NEAR_SELECT_TICK, FAR_SELECT_TICK, FAR_SELECT_TICK]);
      expect(soundsAt(warp, FAR_SELECT_TICK)).toEqual(['started sound/event/map-destination by-id', 'started sound/event/map-destination by-id']);
      expect([refusedAt(warp, 2, 'request-warp'), refusedAt(warp, WARP_TICK + 1, 'request-warp')]).toEqual([['player-unavailable'], ['wrong-context']]);
      expect(ticksOf(warp, 'warp-started')).toEqual([WARP_TICK]);
      expect(warp.decisions.filter(({ sound }) => sound === 'sound/warp').map(({ tick }) => tick)).toEqual([WARP_TICK]);
    });

    it('starts the Warp in the view switch\'s tick with the tick\'s other sounds, and arrives near a hostile with 10181', () => {
      // The Warp's own tick also has the earlier shot's hit: the view switch stops nothing (A-08).
      expect(warp.ticks[WARP_TICK - 1].events.map(({ type }) => type)).toEqual(expect.arrayContaining(['view-switched', 'warp-started', 'hit']));
      expect(soundsAt(warp, WARP_TICK)).toEqual(['started sound/warp by-id', `started sound/synthetic-flight/hull entity:${NEAR_HOSTILE_ID}:3`]);
      const [completed] = eventsOf(warp, 'warp-completed');
      expect(completed.arrival?.hostileNear).toBe(true);
      expect(warp.decisions.filter(({ sound }) => sound === 'sound/event/warp-arrival').map(({ tick }) => tick)).toEqual([completed.tick]);
      // The Warp page's writes, without a command, are silent (A-10).
      expect(eventsOf(warp, 'left-page-changed').filter(({ tick }) => tick <= completed.tick).map(({ tick, commandIndex }) => [tick, commandIndex]))
        .toEqual([[WARP_TICK, null], [completed.tick, null]]);
      expect(soundsAt(warp, completed.tick)).toEqual(['started sound/event/warp-arrival by-id']);
    });

    it('sounds both weapon keys, also an unchanged selection, and each transponder of an active player\'s b', () => {
      expect(eventsOf(warp, 'weapon-selected').map(({ tick, changed }) => [tick, changed])).toEqual([[WARP_LATE, false], [WARP_LATE, false]]);
      expect(refusedAt(warp, 2, 'drop-transponder')).toEqual(['player-unavailable']);
      expect(ticksOf(warp, 'transponder-deployed')).toEqual([WARP_LATE + 5, WARP_LATE + 5]);
      expect(soundsAt(warp, WARP_LATE + 5)).toEqual(['started sound/event/transponder-created by-id', 'started sound/event/transponder-created by-id']);
    });

    it('sounds the energy keys: the page change of the command and the level change', () => {
      const tick = WARP_LATE + 2;
      expect(warp.ticks[tick - 1].events.filter(({ type }) => type !== 'command-result').map(({ type }) => type)).toEqual(['left-page-changed', 'energy-allocation-changed']);
      expect(soundsAt(warp, tick)).toEqual(['started sound/event/key-command by-id', 'started sound/event/key-command by-id']);
    });

    it('gives the map marker no sound and stops a retired craft\'s engine', () => {
      const [{ marker }] = eventsOf(warp, 'warp-destination-set');
      if (marker.type === 'missing') throw new Error('expected a marker');
      expect(warp.ticks.filter(({ posed }) => posed.has(marker.entityId)).length).toBeGreaterThan(0);
      expect(warp.ticks.find(({ posed }) => posed.has(marker.entityId))!.posed.get(marker.entityId)).toEqual({ kindBit: 25, presentation: 'map-marker' });
      expect(warp.decisions.filter(({ source }) => source?.namespace === 'entity' && source.id === marker.entityId)).toEqual([]);
      const retired = eventsOf(warp, 'object-retired').find(({ entityId }) => entityId === NEAR_HOSTILE_ID)!;
      expect(soundsAt(warp, retired.tick)).toContain(`stopped removal entity:${NEAR_HOSTILE_ID}:0`);
      expect(warp.decisions.some(({ source, tick }) => source?.namespace === 'entity' && source.id === PLAYER_ID && source.slot === 0 && tick === 2)).toBe(true);
    });
  });

  describe('P3-10 communications, docking, base keys and launch', () => {
    it('keeps the contract at every tick, through both holds', () => {
      expectRuleSounds(docking);
      expect(docking.holds.map(({ gap }) => gap)).toEqual(['G-02/3', 'G-02/4']);
    });

    it('sounds a command\'s page changes, not a refused energy key or a command delivery', () => {
      expect(eventsOf(docking, 'left-page-changed').filter(({ tick }) => tick === 4).every(({ commandIndex }) => commandIndex !== null)).toBe(true);
      expect(ticksOf(docking, 'command-delivered')).toEqual([4, 62]);
      expect(refusedAt(docking, 10, 'energy')).toEqual(['wrong-context']);
      expect(soundsAt(docking, 10)).toEqual([]);
    });

    it('stops every voice at the docking and the launch; docked, only the sounds played by ID', () => {
      const [docked] = ticksOf(docking, 'docked');
      const [departed] = ticksOf(docking, 'departed');
      expect(docking.ticks.filter(({ docked: isDocked }) => isDocked).map(({ tick }) => tick)).toEqual(Array.from({ length: departed - docked }, (_, at) => docked + at));
      expect(soundsAt(docking, docked)).toEqual(['stopped stop-all all']);
      const dockedSounds = docking.decisions.filter(({ tick }) => tick > docked && tick < departed);
      expect(new Set(dockedSounds.map(({ source }) => source?.namespace))).toEqual(new Set(['by-id']));
      // The base keys, also at the top and past the end of the list and for a row without a service (A-10).
      expect(eventsOf(docking, 'base-navigated').map(({ moved }) => moved)).toContain(false);
      expect(eventsOf(docking, 'base-confirmed')).toHaveLength(2);
      expect(dockedSounds.filter(({ sound }) => sound === 'sound/event/base-select-key')).toHaveLength(8);
      expect(dockedSounds.filter(({ sound }) => sound === 'sound/event/base-execute-key')).toHaveLength(2);
      // The map opened from the base clicks too, still docked (A-10, DW-11).
      const [select] = eventsOf(docking, 'warp-destination-set');
      expect(docking.ticks[select.tick - 1]).toMatchObject({ viewMode: 8, docked: true });
      expect(soundsAt(docking, select.tick)).toEqual(['started sound/event/map-destination by-id']);
      // The base's missile walk moves the current missile mount while docked, and posts no weapon selection (FA-06, A-10).
      const mounts = new Set(docking.ticks.filter(({ docked: isDocked }) => isDocked).map(({ missileMount }) => missileMount));
      expect(mounts).toEqual(new Set([1, 2]));
      expect(eventsOf(docking, 'weapon-selected')).toEqual([]);
      // The launch stops every voice; the player's engine starts again from the same tick's update items (A-08).
      expect(soundsAt(docking, departed).slice(0, 2)).toEqual(['stopped stop-all all', `started sound/synthetic-flight/engine-player entity:${PLAYER_ID}:0`]);
    });

    it('sounds the transponder of b in flight', () => {
      expect(ticksOf(docking, 'transponder-deployed')).toEqual([20]);
      expect(soundsAt(docking, 20)).toEqual(['started sound/event/transponder-created by-id']);
    });
  });

  describe('P3-11 rescue, result and teardown', () => {
    it('keeps the contract at every tick of the success, and leaves no sound after the completion', () => {
      expectRuleSounds(success);
      expect(success.status.phase).toBe('completed');
      expect(success.completedTick).toBe(SUCCESS_COMPLETION_TICK);
      const [latched] = eventsOf(success, 'result-latched');
      expect(latched.result.reason.type).toBe('all-clear');
      expect(ticksOf(success, 'teardown-started')).toEqual([latched.tick]);
      expect(soundsAt(success, latched.tick)[0]).toBe('stopped stop-all all');
      // The completion's tick, without a player entity, has nothing to sound; the completion ends the run's sound.
      expect(success.ticks.at(-1)).toMatchObject({ tick: SUCCESS_COMPLETION_TICK, posing: false });
      expect(soundsAt(success, SUCCESS_COMPLETION_TICK)).toEqual([]);
      expect([success.decisionsAfterCompletion, success.voicesAtEnd]).toEqual([0, 0]);
      // The completion's invalidation cancelled the consumer's presentation subscription (DW-11, D2-14).
      expect(success.subscriptions).toEqual({ beforeCompletion: 1, atEnd: 0 });
    });

    it('makes the same decisions in frames of five ticks, the completion cutting one', () => {
      const grouped = playRules(runSpecOf(successSpec()), () => [], { until: 2000, ticksPerFrame: 5 });
      expect(SUCCESS_COMPLETION_TICK % 5).not.toBe(0);
      expect(grouped.decisions).toEqual(success.decisions);
      expect([grouped.completedTick, grouped.decisionsAfterCompletion, grouped.voicesAtEnd]).toEqual([SUCCESS_COMPLETION_TICK, 0, 0]);
    });

    it('keeps the contract at every tick of the failure: losses stop nothing, rescues stop all and then re-arm audibly', () => {
      expectRuleSounds(thirdLoss);
      expect(thirdLoss.holds.map(({ gap }) => gap)).toEqual(['G-02/6', 'G-02/6']);
      for (const tick of ticksOf(thirdLoss, 'player-loss-started')) expect(soundsAt(thirdLoss, tick)).not.toContain('stopped stop-all all');
      const rescues = ticksOf(thirdLoss, 'player-rescued');
      expect(rescues).toHaveLength(2);
      for (const tick of rescues) {
        const selections = eventsOf(thirdLoss, 'weapon-selected').filter((event) => event.tick === tick);
        expect(selections.length).toBeGreaterThan(2);
        expect(selections.every(({ commandIndex }) => commandIndex === null)).toBe(true);
        // Emitted before the rescue, played after its stop; beyond class 4's two voices each cuts one (A-03, A-08).
        const made = thirdLoss.decisionsByTick.get(tick) ?? [];
        expect(made.map(brief)).toEqual(['stopped stop-all all', ...selections.map(() => 'started sound/event/weapon-select by-id')]);
        expect(made.slice(1).map(({ preempted }) => preempted?.namespace ?? null)).toEqual(selections.map((_, index) => (index < 2 ? null : 'by-id')));
      }
      const [latched] = eventsOf(thirdLoss, 'result-latched');
      expect(latched.result.reason.type).toBe('third-loss');
      expect(soundsAt(thirdLoss, latched.tick)[0]).toBe('stopped stop-all all');
      expect([thirdLoss.status.phase, thirdLoss.decisionsAfterCompletion, thirdLoss.voicesAtEnd]).toEqual(['completed', 0, 0]);
      expect(thirdLoss.subscriptions).toEqual({ beforeCompletion: 1, atEnd: 0 });
    });
  });
});
