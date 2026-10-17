import { describe, expect, it } from 'vitest';
import { gun, missile, mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent } from '../contracts/domain-events.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import {
  animationContent, animationsContent, asCreateInput, craftInfoContent, debrisContent, declaration, missionFrame, worldInput, type WorldInputParts,
} from '../world/create-world.test-support.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';
import { createRecordingSession, GAME_REPLAY_VERSION, type Recording } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, gameplayDigest, PRODUCER, recordScript, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { snapshotHash, type GameSnapshot } from './snapshot.ts';

// P3-07 AC-13 (docs/plan/p3/07/spec.md, 验证策略; docs/plan/p3/02/spec.md, CR-14): a synthetic combat run (code-generated
// content and inputs, never original data) recorded and replayed through the formal entries, without stand-ins. The
// player kills a craft with its gun, whose explosion activates and whose fragments hand its source off and fly; a
// missile detonates; a fragment strikes the player; selections, pages and allocations change. A tick is 2 clock units.
// The later expiries and the player's own loss are combat-chains.test.ts's.

/**
 * The player at runtime (187.5, 375, 0) facing +z (the scale 1.875 of the synthetic frame), and three craft dead ahead
 * that never move: kind 7 at z 112.5, kind 8 at 225 and kind 7 at 562.5.
 */
function combatMission() {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 60 } }),
    declaration(2, { craftType: 8, position: { x: 100, y: 200, z: 120 } }),
    declaration(3, { craftType: 7, position: { x: 100, y: 200, z: 300 } }),
  ];
  return mission;
}

/**
 * The synthetic craft info with fixed guns (speed 2000, 62.5 per tick; cost 5; damage 400; lifetime 1 s), a guided
 * missile 1 (lifetime 320, arming 32, fuse radius 10, blast 800 within 4 falling to 0 at 20) on a fast body, a player
 * with hull 400 and charge 100 whose mount 0 carries gun 0 (list 0) and mount 1 four missiles 1 (list 1), and kinds 7
 * and 8 without speed (+0xB8 0). Their shield 300 and hull 12 give way to one shot.
 */
function combatCraftInfo() {
  const info = craftInfoContent();
  info.hitDamageScale = 1;
  info.guns = info.guns.map(() => gun({ at08: 2000, at14: 8, at18: 5, at1C: 400, at24: 64, at28: 0 }));
  info.missiles[1] = missile({
    body: 1, at18: 1, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0, at44: 320, at48: 32, at4C: 10, at54: 0, at58: 4,
    at5C: 800, at60: 4, at64: 20,
  });
  Object.assign(info.missileBodies[1], { atB8: 640, atBC: 640, atC0: 640 });
  Object.assign(info.craft[0], {
    at74: 100, at9C: 400, mounts: [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 1, at0C: 4 })], mountLists: [[0], [1], []],
  });
  for (const kindBit of [7, 8]) info.craft[kindBit].atB8 = 0;
  return info;
}

const combatInput = (parts: WorldInputParts = {}) => asCreateInput(worldInput({ mission: combatMission(), craftInfo: combatCraftInfo(), ...parts }));

/**
 * Tick 3 the gun at the craft ahead (the automatic selection picks it in the same update); 10 the nearest enemy, the
 * kind 8, and 11 a missile at it; 50 the damage report (already on that page), the energy page and a shield level; 52
 * the next missile, a friendly target (none) and the enemy target again.
 */
const COMMANDS: Readonly<Record<number, readonly Command[]>> = {
  3: [{ type: 'fire', channel: 'primary' }],
  10: [{ type: 'target', operation: 'enemy' }],
  11: [{ type: 'fire', channel: 'secondary' }],
  50: [{ type: 'damage-report' }, { type: 'energy', operation: 'open' }, { type: 'energy', operation: 'shield-increase' }],
  52: [{ type: 'select-missile', direction: 'next' }, { type: 'target', operation: 'friendly' }, { type: 'target', operation: 'enemy' }],
};
const combatScript = (tick: number): TickInput => tickInput(COMMANDS[tick] ?? []);

/** Past the missile's detonation at tick 54 and the fragments' strikes on the player that follow. */
const TICKS = 120;
const PLAYER = 1;
const FIRST = 2;

/** Seed 12: the fragments of the first kill strike the player (P3-08's selection and interpreter draws moved others' away). */
const INPUT = combatInput({ run: { seed: 12 } });
const CONTENT = contentOf(INPUT);

/** The run with a checkpoint every tick, reading projection, Render State and snapshot after every step. */
function recordReading(): { readonly recording: Recording; readonly snapshots: readonly GameSnapshot[] } {
  const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  const snapshots: GameSnapshot[] = [];
  for (let tick = 1; tick <= TICKS; tick++) {
    session.step(combatScript(tick));
    session.projection();
    session.renderState();
    snapshots.push(session.snapshot());
  }
  return { recording: session.exportRecording(), snapshots };
}

const READ = recordReading();
const RECORDING = READ.recording;

const of = <Type extends DomainEvent['type']>(type: Type) =>
  RECORDING.result.events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);

type Mutable = Record<string, unknown>;

function expectRejected(work: () => unknown, path: string, reason?: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject(reason === undefined ? { path } : { path, reason });
}

/** A JSON copy of the record, changed by `change`. */
function recordWith(change: (record: Mutable & { ticks: Mutable[] }) => void): unknown {
  const record = roundTrip(RECORDING.record) as Mutable & { ticks: Mutable[] };
  change(record);
  return record;
}

describe('combat replay (P3-07 AC-13, CR-14)', () => {
  // P3-12/10 (docs/plan/p3/02/spec.md, FS-08): the presentation facts change no rule outcome or draw; the digest is the
  // one this run had before them (replay.test-support.ts).
  it('keeps the gameplay of the run from before P3-12\'s presentation facts', () => {
    expect(gameplayDigest(INPUT, RECORDING.record.ticks)).toBe('fba1bd8161cf249f');
  });

  it('reproduces every event and the snapshot at every checkpoint after a JSON round trip', () => {
    const { record, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayRecord(record, CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    expect(replayed.checkpoints.map(({ tick }) => tick)).toEqual(Array.from({ length: TICKS + 1 }, (_, tick) => tick));
    // Each checkpoint is the hash of the snapshot the session gave after that tick.
    expect(RECORDING.result.checkpoints.slice(1).map(({ hash }) => hash)).toEqual(READ.snapshots.map(snapshotHash));
  });

  it('has the combat rules in the run', () => {
    const types = new Set(RECORDING.result.events.map(({ type }) => type));
    for (const type of ['shot-fired', 'hit', 'object-destroyed', 'explosion-started', 'source-released', 'missile-ended', 'target-changed',
      'target-cleared', 'weapon-selected', 'energy-allocation-changed', 'left-page-changed'] as const) {
      expect(types.has(type), type).toBe(true);
    }
    expect(of('shot-fired').map(({ tick, family, shooterEntityId }) => [tick, family, shooterEntityId])).toEqual([[3, 'gun', PLAYER], [11, 'missile', PLAYER]]);
    // The shot made at tick 3 first moves at 4, from z 2 to 64.5, and at 5 crosses the craft at 112.5.
    expect(of('hit')[0]).toMatchObject({ tick: 5, victimEntityId: FIRST, cause: 'projectile', attacker: { type: 'shooter', entityId: PLAYER, kindBit: 0 } });
    expect(of('object-destroyed')).toEqual([expect.objectContaining({ tick: 5, entityId: FIRST, kindBit: 7, outcome: 'explodes', eventClass: 0 })]);
    expect(of('explosion-started')[0]).toMatchObject({ tick: 6, sourceEntityId: FIRST, sourceKindBit: 7 });
    expect(of('source-released')).toEqual([expect.objectContaining({ tick: 7, entityId: FIRST, removed: true })]);
    expect(of('target-cleared')).toEqual([expect.objectContaining({ tick: 8, previousTarget: FIRST, cause: 'invalid' })]);
    expect(of('missile-ended')).toEqual([expect.objectContaining({ outcome: 'detonated', shooterEntityId: PLAYER })]);
    const causes = new Set(of('hit').map(({ cause }: HitEvent) => cause));
    expect(causes).toEqual(new Set(['projectile', 'missile', 'collision']));
    // Only fragments touch the player: the other craft stand far ahead.
    const collisions = of('hit').filter(({ cause }) => cause === 'collision');
    expect(collisions.length).toBeGreaterThan(0);
    expect(new Set(collisions.map(({ victimEntityId }) => victimEntityId))).toEqual(new Set([PLAYER]));
    expect(READ.snapshots.at(-1)?.state.player.kills[7]).toBe(1);
  });

  it('compares the combat state of CR-14 at the checkpoints: every runtime kind, its timers and the player\'s new state', () => {
    const states = READ.snapshots.map(({ state }) => state);
    const entities = states.flatMap(({ entities: list }) => list);
    // Each runtime kind with its movement block variant and the combat state its first callback set.
    expect(entities.some(({ combat, movement }) => combat.type === 'projectile' && combat.expiry !== null && movement?.mode === 'linear')).toBe(true);
    expect(entities.some(({ combat, movement }) => combat.type === 'missile' && combat.guidance !== null && movement?.mode === 'craft')).toBe(true);
    expect(entities.some(({ combat }) => combat.type === 'explosion' && combat.activationClock !== null)).toBe(true);
    expect(entities.some(({ combat, movement }) => combat.type === 'fragment' && combat.expiry.type === 'at' && movement?.mode === 'spinning')).toBe(true);
    expect(entities.some(({ presentation }) => presentation.type === 'fragment')).toBe(true);
    // The player's weapons and state as the run left them.
    const last = states.at(-1)!;
    const player = last.entities.find(({ id }) => id === PLAYER)!;
    expect(player.combat).toMatchObject({ type: 'craft', shieldLevel: 2, weapons: { mounts: [{ lastShotClock: 6 }, { ammunition: 3 }] } });
    expect(last.player).toMatchObject({ leftDisplay: { page: 1 }, shots: { projectilesFired: 1, projectileHits: 1, missilesFired: 1 }, targeting: { mode: 'enemy' } });
  });

  it('gives the same record and result whether or not projection, Render State and snapshot are read', () => {
    expect(recordScript(INPUT, TICKS, 1, combatScript)).toEqual(RECORDING);
  });

  it('diverges at the first tick a combat input changes', () => {
    const unarmed = replayRecord(recordWith(({ ticks }) => { ticks[2] = tickInput() as never; }), CONTENT);
    expect(compareReplayResults(RECORDING.result, unarmed)).toEqual({ match: false, tick: 3, kind: 'events' });
  });

  describe('rejection', () => {
    it.each([
      ['an unknown version', (record: Mutable) => { record.version = GAME_REPLAY_VERSION + 1; }, 'record.version'],
      ['the rules version before P3-07', (record: Mutable) => { record.rulesVersion = 2; }, 'record.rulesVersion'],
      ['a later rules version', (record: Mutable) => { record.rulesVersion = RULES_VERSION + 1; }, 'record.rulesVersion'],
      ['a fire command of an unknown channel', (record: Mutable & { ticks: Mutable[] }) => {
        record.ticks[2] = tickInput([{ type: 'fire', channel: 'tertiary' } as never]) as never;
      }, 'record.ticks[2].commands[0].channel'],
    ])('rejects %s before running anything', (_, change, path) => {
      expectRejected(() => replayRecord(recordWith(change as never), CONTENT), path);
    });

    it('rejects content whose combat rule inputs changed under the same identity', () => {
      const debris = debrisContent();
      // Kind 8 sheds one part fewer: its DEBRIS table and its model's part count change together.
      debris.byCraftType[8].pop();
      // Lists 1 and 2's animations (the first three) a frame longer.
      const animations = animationsContent();
      for (const animation of animations.slice(0, 3)) animation.content = animationContent(13);
      const missileLifetime = combatCraftInfo();
      missileLifetime.missiles[1].at44 = 640;
      const gunDamage = combatCraftInfo();
      gunDamage.guns[0].at1C = 401;
      const forgeries = [combatInput({ craftInfo: missileLifetime }), combatInput({ craftInfo: gunDamage }), combatInput({ debrisParameters: debris }),
        combatInput({ explosionAnimations: animations })];
      for (const forged of forgeries) {
        expect(forged.identity).toEqual(INPUT.identity);
        expectRejected(() => replayRecord(RECORDING.record, contentOf(forged)), 'record.setupHash', 'must be the setup hash of the replayed content');
      }
    });

    it('rejects content whose missile the first callback would fault on, at the content (P3-07/24)', () => {
      const negative = combatCraftInfo();
      negative.missiles[1].at44 = -1;
      expectRejected(() => replayRecord(RECORDING.record, contentOf(combatInput({ craftInfo: negative }))), 'content.craftInfo.content.missiles[1].at44');
    });
  });
});
