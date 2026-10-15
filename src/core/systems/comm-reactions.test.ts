import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import type { CommunicationsRuleData } from '../world/comm-input.ts';
import type { Entity, EntityInit, SubsystemState } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { kindDefaults, stateText, tickInput } from '../world/world.test-support.ts';
import type { MessageIdentity, RadioCallback, WorldState } from '../world/world-state.ts';
import { checkTail, clearCommunicationLimits, reactToDestruction, reactToHit, reportEnemyAppears, reportParkedEnemy, warnTail } from './comm-reactions.ts';
import { registerTick, type TickContext } from './pipeline.ts';
import { addActive, BASE_KIND_BIT, CRAFT_KIND_BIT, HOSTILE_KIND_BIT, radioScene, snapshotOf, WINGMAN_KIND_BIT, type RadioScene } from './radio.test-support.ts';

// Expectations written out from docs/original/formats/executable.md RQ4, RX1–RX10 and docs/plan/p3/02/spec.md CB-03,
// CB-05, CB-09 and CB-12, not from the code under test. Kind bits: 2 a craft of 0x87c, 7 a hostile of 0x93780 (and of
// 0x780), 17 a base of 0x68000, 1 the wingman W. Attacker kinds are 1 << kind bit: 1 the player, 2 W, 0x80 the hostile.
// Every message the reactions ask for resolves except 20983 index 30. Names: pool 0 is TABL 2001 position 2, pool 1 TABL
// 2011 position 3, pool 2 in neither list, pool 3 TABL 2001 position 4 (so its under-attack index 0x1A + 4 = 30 fails).
// Face pools: a craft's first speech draws rand % 3, a base's rand % 5 (the first face is free, so one draw). W's face is
// its aiValueA − 1 = 2, with no draw. The threat radius (craft +0x0C) is 250 for every kind.

const frames = (duration: number) => Object.freeze([duration]);
const table = (faces: number, length: number) => Object.freeze(Array.from({ length: faces }, () => Object.freeze(Array.from({ length }, (_, index) => frames(index + 1)))));
const FAILING_DIRECT = 30;
const MESSAGES: CommunicationsRuleData['messages'] = Object.freeze({
  faceTables: Object.freeze({ 20011: table(5, 5), 20019: table(3, 25), 20985: table(5, 64) }),
  direct: Object.freeze(Array.from({ length: 90 }, (_, index) => (index === FAILING_DIRECT ? null : frames(index + 1)))),
});
const POOL = Object.freeze([{ in2001: 2, in2011: null }, { in2001: null, in2011: 3 }, { in2001: null, in2011: null }, { in2001: 4, in2011: null }]);
const named = (index: number): Partial<EntityInit> => ({ name: { type: 'pool', index } });

const PLAYER = 1;
const WINGMAN = 2;
const HOSTILE = 2 ** HOSTILE_KIND_BIT;
const HOSTILE_SET = 0x93780;
const W_FACE = 2;

const at = (x: number, y = 0, z = 0): Vec3 => ({ x, y, z });

/** radioScene with the messages and names above. */
function scene(): RadioScene {
  const radio = radioScene();
  const { communications } = radio.state.ruleData;
  const state: WorldState = {
    ...radio.state,
    ruleData: { ...radio.state.ruleData, communications: { ...communications, messages: MESSAGES, nameIndexes: { ...communications.nameIndexes, pool: POOL } } },
  };
  return { state, player: radio.player };
}

/** A context whose sample (this tick's clock) is `clock`. */
function tickAt(state: WorldState, clock: number): TickContext {
  state.clock = clock - 2;
  return registerTick(state, readTickInput(tickInput()));
}

const addWingman = (sc: RadioScene, overrides: Partial<EntityInit> = {}): CraftEntity =>
  addActive(sc, WINGMAN_KIND_BIT, { ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: W_FACE + 1, aiValueB: 0, aiValueC: 0 }, ...overrides }) as CraftEntity;

const queued = (message: MessageIdentity, callback: RadioCallback, speaker: Entity | null, tick: number, length: number): DomainEvent => ({
  type: 'radio-queued', tick, message, callback, speaker: speaker === null ? null : snapshotOf(speaker), position: 'sorted', length,
});
const direct = (index: number): MessageIdentity => ({ table: 20983, face: null, index });
const line = (index: number): MessageIdentity => ({ table: 20985, face: W_FACE, index });
const messagesOf = (context: TickContext) => context.events.flatMap((event) => (event.type === 'radio-queued' ? [event.message] : []));

describe('0x3c208 step 1, the wingman hook (RX2, RX7)', () => {
  it('adds the player\'s raw damage to the friendly-fire total, restarting the window once its end has passed, without a message or a draw', () => {
    const sc = scene();
    const { state } = sc;
    const wingman = addWingman(sc);
    const seed = state.rngState;
    reactToHit(tickAt(state, 1000), PLAYER, null, wingman, 30);
    expect(state.ai.friendlyFire).toEqual({ accumulated: 30, windowEnd: 1000 + 0x780 });
    reactToHit(tickAt(state, 1000 + 0x780), PLAYER, null, wingman, 12);
    expect(state.ai.friendlyFire).toEqual({ accumulated: 42, windowEnd: 1000 + 0x780 });
    const context = tickAt(state, 1002 + 0x780);
    reactToHit(context, PLAYER, null, wingman, 5);
    expect(state.ai.friendlyFire).toEqual({ accumulated: 5, windowEnd: 1002 + 0x780 * 2 });
    expect(context.events).toEqual([]);
    expect(state.rngState).toBe(seed);
  });

  it('reports a low hull for any other attacker, none included, at most every 0x5A00 units, stamping even when nothing resolves', () => {
    const sc = scene();
    const { state } = sc;
    const wingman = addWingman(sc);
    const capacity = state.craftInfo.content.craft[WINGMAN_KIND_BIT]!.at9C;
    const threshold = Math.trunc((capacity * 30) / 100);
    wingman.combat.hull = threshold;
    const notLow = tickAt(state, 1000);
    reactToHit(notLow, HOSTILE, null, wingman, 10);
    expect([notLow.events, state.communications.limits.wingmanLowHull]).toEqual([[], 0]);

    wingman.combat.hull = threshold - 1;
    const seed = state.rngState;
    const low = tickAt(state, 1000);
    reactToHit(low, 0, null, wingman, 10);
    expect(low.events).toEqual([queued(line(0x13), 'none', wingman, low.time.tick, 1)]);
    expect(state.communications.limits.wingmanLowHull).toBe(1000 + 0x5a00);
    expect(state.rngState).toBe(seed);

    const held = tickAt(state, 1000 + 0x5a00);
    reactToHit(held, HOSTILE, null, wingman, 10);
    expect(held.events).toEqual([]);
  });

  it('stamps the low-hull limit when W\'s face is outside 0–4 and nothing is queued', () => {
    const sc = scene();
    const { state } = sc;
    const wingman = addActive(sc, WINGMAN_KIND_BIT, { ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 8, aiValueB: 0, aiValueC: 0 } }) as CraftEntity;
    wingman.combat.hull = -1;
    const context = tickAt(state, 1000);
    reactToHit(context, HOSTILE, null, wingman, 10);
    expect([context.events, state.communications.limits.wingmanLowHull]).toEqual([[], 1000 + 0x5a00]);
  });
});

describe('0x3c208 step 2, the player hits a friendly of 0x6807c (RX2)', () => {
  it('queues 20983 index 4 without a speaker at most every 0xF00 units and returns before step 3', () => {
    const sc = scene();
    const { state } = sc;
    const base = addActive(sc, BASE_KIND_BIT, named(0));
    const first = tickAt(state, 1000);
    reactToHit(first, PLAYER, null, base, 10);
    expect(first.events).toEqual([queued(direct(4), 'none', null, first.time.tick, 1)]);
    expect(state.player.communications.limits.friendlyHit).toBe(1000);
    expect(base.communications.threatStamp).toBeNull();
    const held = tickAt(state, 1000 + 0xf00);
    reactToHit(held, PLAYER, null, base, 10);
    expect([held.events, state.player.communications.limits.friendlyHit]).toEqual([[], 1000]);
    const again = tickAt(state, 1002 + 0xf00);
    reactToHit(again, PLAYER, null, addActive(sc, CRAFT_KIND_BIT), 10);
    expect(messagesOf(again)).toEqual([direct(4)]);
    expect(state.player.communications.limits.friendlyHit).toBe(1002 + 0xf00);
  });
});

describe('0x3c208 step 3, an enemy hits a friendly (RX2, RX9 rows 1 and 4)', () => {
  it('lets an active craft of 0x87c speak from 20019 at its 2011 position + 3, its face drawn at its first speech', () => {
    const sc = scene();
    const { state } = sc;
    const craft = addActive(sc, CRAFT_KIND_BIT, named(1));
    const seed = state.rngState;
    const [faceRand] = randValues(seed, 1);
    const context = tickAt(state, 1000);
    reactToHit(context, HOSTILE, null, craft, 10);
    expect(context.events).toEqual([queued({ table: 20019, face: faceRand % 3, index: 3 + 3 }, 'music-step', craft, context.time.tick, 1)]);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));
    expect(craft.communications.threatStamp).toBe(1000);
  });

  it('draws the face of an active craft named outside 2011 and stamps it without a message', () => {
    const sc = scene();
    const { state } = sc;
    const craft = addActive(sc, CRAFT_KIND_BIT, named(0));
    const seed = state.rngState;
    const context = tickAt(state, 1000);
    reactToHit(context, HOSTILE_SET, null, craft, 0);
    expect(context.events).toEqual([]);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));
    expect(craft.communications.threatStamp).toBe(1000);
  });

  it('names a base from 20983 by its 2001 position + 0x1A, then a second message by one rand % 4, and holds it for 0x2D00 units', () => {
    const sc = scene();
    const { state } = sc;
    const base = addActive(sc, BASE_KIND_BIT, named(0));
    const seed = state.rngState;
    const [second] = randValues(seed, 1);
    const context = tickAt(state, 1000);
    reactToHit(context, HOSTILE, null, base, 10);
    expect(context.events).toEqual([
      queued(direct(0x1a + 2), 'none', base, context.time.tick, 1),
      queued(direct(second % 4), 'none', base, context.time.tick, 2),
    ]);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));
    expect([base.communications.face, base.communications.threatStamp]).toEqual([null, 1000]);

    const held = tickAt(state, 1000 + 0x2d00);
    reactToHit(held, HOSTILE, null, base, 10);
    expect([held.events, base.communications.threatStamp]).toEqual([[], 1000]);
    const again = tickAt(state, 1002 + 0x2d00);
    reactToHit(again, HOSTILE, null, base, 10);
    expect(messagesOf(again)).toHaveLength(2);
    expect(base.communications.threatStamp).toBe(1002 + 0x2d00);
  });

  it('names an inactive craft by its 2011 position + 7; draws nothing when the first message fails; stamps nothing in neither list', () => {
    const sc = scene();
    const { state } = sc;
    const parked = addActive(sc, CRAFT_KIND_BIT, { ...named(1), activity: 'parked', movement: null });
    const first = tickAt(state, 1000);
    reactToHit(first, HOSTILE, null, parked, 10);
    expect(messagesOf(first)[0]).toEqual(direct(7 + 3));

    const failing = addActive(sc, BASE_KIND_BIT, named(3));
    const nameless = addActive(sc, BASE_KIND_BIT, named(2));
    const seed = state.rngState;
    const context = tickAt(state, 1000);
    reactToHit(context, HOSTILE, null, failing, 10);
    reactToHit(context, HOSTILE, null, nameless, 10);
    expect(context.events).toEqual([]);
    expect(state.rngState).toBe(seed);
    expect([failing.communications.threatStamp, nameless.communications.threatStamp]).toEqual([1000, null]);
  });

  it('ignores a wingman\'s, a friendly\'s or a 0x800 attacker, a victim outside the friendlies or of kind 0x800, and an invalid source', () => {
    const sc = scene();
    const { state } = sc;
    const base = addActive(sc, BASE_KIND_BIT, named(0));
    const excluded = addActive(sc, 11, named(0));
    const hostile = addActive(sc, HOSTILE_KIND_BIT, named(0));
    const removed = addActive(sc, HOSTILE_KIND_BIT);
    state.entities.remove(removed);
    const context = tickAt(state, 1000);
    const before = stateText(state);
    for (const kind of [WINGMAN, 2 ** CRAFT_KIND_BIT, 0x800, 2 ** BASE_KIND_BIT]) reactToHit(context, kind, null, base, 10);
    reactToHit(context, HOSTILE, null, excluded, 10);
    reactToHit(context, HOSTILE, null, hostile, 10);
    reactToHit(context, HOSTILE, removed, base, 10);
    expect(context.events).toEqual([]);
    expect(stateText(state)).toBe(before);
  });
});

describe('0x3c0f4, a destruction (RX3, RX9 rows 2 and 4)', () => {
  it('lets an active W report its kill by one rand: 5 + rand % 3; an inactive W says nothing', () => {
    const sc = scene();
    const { state } = sc;
    const wingman = addWingman(sc);
    const hostile = addActive(sc, HOSTILE_KIND_BIT, { position: at(1e6) });
    hostile.destroyed = true;
    addActive(sc, HOSTILE_KIND_BIT, { position: at(1e6) });
    const seed = state.rngState;
    const [drawn] = randValues(seed, 1);
    const context = tickAt(state, 1000);
    reactToDestruction(context, WINGMAN, null, hostile);
    expect(context.events).toEqual([queued(line(5 + (drawn % 3)), 'none', wingman, context.time.tick, 1)]);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));

    wingman.activity = 'parked';
    const quiet = tickAt(state, 1000);
    reactToDestruction(quiet, WINGMAN, null, hostile);
    expect(quiet.events).toEqual([]);
  });

  it('lets W report a friendly lost strictly within 3500 to any attacker but none and the player, without a draw', () => {
    const sc = scene();
    const { state } = sc;
    const wingman = addWingman(sc, { position: at(0) });
    wingman.activity = 'parked';
    const near = addActive(sc, BASE_KIND_BIT, { ...named(0), position: at(3499) });
    const edge = addActive(sc, BASE_KIND_BIT, { ...named(0), position: at(3500) });
    const seed = state.rngState;
    for (const kind of [HOSTILE, WINGMAN, 2 ** CRAFT_KIND_BIT]) {
      const context = tickAt(state, 1000);
      reactToDestruction(context, kind, null, near);
      expect(messagesOf(context)).toEqual([line(0x29 + 2), direct(0x41 + 2)]);
    }
    for (const kind of [0, PLAYER]) {
      const context = tickAt(state, 1000);
      reactToDestruction(context, kind, null, near);
      expect(messagesOf(context)).not.toContainEqual(line(0x29 + 2));
    }
    const far = tickAt(state, 1000);
    reactToDestruction(far, HOSTILE, null, edge);
    expect(messagesOf(far)).toEqual([direct(0x41 + 2)]);
    expect(state.rngState).toBe(seed);
  });

  it('thanks every stamped friendly once the player\'s kill leaves no enemy: the stamp cleared, a face drawn, the count raised', () => {
    const sc = scene();
    const { state } = sc;
    const craft = addActive(sc, CRAFT_KIND_BIT);
    const base = addActive(sc, BASE_KIND_BIT);
    const unstamped = addActive(sc, BASE_KIND_BIT);
    const parked = addActive(sc, BASE_KIND_BIT, { activity: 'parked', movement: null });
    const victim = addActive(sc, HOSTILE_KIND_BIT);
    const parkedHostile = addActive(sc, HOSTILE_KIND_BIT, { activity: 'parked', movement: null });
    const deadHostile = addActive(sc, HOSTILE_KIND_BIT);
    deadHostile.destroyed = true;
    for (const friendly of [craft, base, parked]) friendly.communications.threatStamp = 500;
    victim.destroyed = true;
    const seed = state.rngState;
    const [craftFace, baseFace] = randValues(seed, 2);
    const context = tickAt(state, 1000);
    reactToDestruction(context, PLAYER, null, victim);
    expect(context.events).toEqual([
      queued({ table: 20019, face: craftFace % 3, index: 2 }, 'music-reset', craft, context.time.tick, 1),
      queued({ table: 20011, face: baseFace % 5, index: 3 }, 'music-reset', base, context.time.tick, 2),
    ]);
    expect(state.rngState).toBe(rngStateAfter(seed, 2));
    expect(state.player.communications.thanks).toBe(2);
    expect([craft, base, unstamped, parked].map((entity) => entity.communications.threatStamp)).toEqual([null, null, null, 500]);
    expect(parkedHostile.activity).toBe('parked');
  });

  it('counts a thanks whose message fails, thanks nobody while an enemy remains, and needs an active W for W\'s kill', () => {
    const sc = scene();
    const { state } = sc;
    const base = addActive(sc, BASE_KIND_BIT);
    base.communications.threatStamp = 500;
    // Every base face of 20011 index 3 resolves here, so remove the table's entries to make the lookup fail.
    const failing = { ...MESSAGES, faceTables: { ...MESSAGES.faceTables, 20011: Object.freeze(Array.from({ length: 5 }, () => Object.freeze([null, null, null, null, null]))) } };
    const stateFailing: WorldState = { ...state, ruleData: { ...state.ruleData, communications: { ...state.ruleData.communications, messages: failing } } };
    const victim = addActive(sc, HOSTILE_KIND_BIT);
    victim.destroyed = true;
    const context = tickAt(stateFailing, 1000);
    reactToDestruction(context, PLAYER, null, victim);
    expect(context.events).toEqual([]);
    expect([state.player.communications.thanks, base.communications.threatStamp]).toEqual([1, null]);

    base.communications.threatStamp = 500;
    const remaining = addActive(sc, HOSTILE_KIND_BIT);
    reactToDestruction(tickAt(state, 1000), PLAYER, null, victim);
    expect(base.communications.threatStamp).toBe(500);
    remaining.state = 'destroyed-source';
    reactToDestruction(tickAt(state, 1000), PLAYER, null, victim);
    expect(base.communications.threatStamp).toBe(500);
    remaining.state = 'pending-removal';
    const wingman = addWingman(sc, { position: at(1e6) });
    wingman.activity = 'parked';
    reactToDestruction(tickAt(state, 1000), WINGMAN, null, victim);
    expect(base.communications.threatStamp).toBe(500);
    wingman.activity = 'active';
    reactToDestruction(tickAt(state, 1000), WINGMAN, null, victim);
    expect(base.communications.threatStamp).toBeNull();
    expect(state.player.communications.thanks).toBe(2);
  });

  it('reports the player\'s kill of a friendly or W with 20983 index 5 at most every 0x3C0 units, and in place of the loss message', () => {
    const sc = scene();
    const { state } = sc;
    const base = addActive(sc, BASE_KIND_BIT, named(0));
    const wingman = addWingman(sc, { position: at(1e6) });
    const first = tickAt(state, 1000);
    reactToDestruction(first, PLAYER, null, base);
    expect(first.events).toEqual([queued(direct(5), 'none', null, first.time.tick, 1)]);
    expect(state.player.communications.limits.friendlyKill).toBe(1000);
    const held = tickAt(state, 1000 + 0x3c0);
    reactToDestruction(held, PLAYER, null, base);
    expect(held.events).toEqual([]);
    const again = tickAt(state, 1002 + 0x3c0);
    reactToDestruction(again, PLAYER, null, wingman);
    expect(messagesOf(again)).toEqual([direct(5)]);
  });

  it('reports any other loss of a named friendly with 20983 at its 2001 + 0x41 or 2011 + 0x2E, without a limit or a draw', () => {
    const sc = scene();
    const { state } = sc;
    const seed = state.rngState;
    const context = tickAt(state, 1000);
    for (const [index, kind] of [[0, HOSTILE], [1, 0], [2, HOSTILE], [1, 0]] as const) {
      reactToDestruction(context, kind, null, addActive(sc, BASE_KIND_BIT, { ...named(index), position: at(1e6) }));
    }
    expect(messagesOf(context)).toEqual([direct(0x41 + 2), direct(0x2e + 3), direct(0x2e + 3)]);
    expect(state.rngState).toBe(seed);
  });
});

describe('0x38cd4 and 0x3c3b0, an enemy appears (RX5, RX6, RX9 rows 3 and 4)', () => {
  it('lets an active W report a position strictly within 3500 by one rand: 8 + rand % 2, with the music step, at most every 0x280 units', () => {
    const sc = scene();
    const { state } = sc;
    const wingman = addWingman(sc, { position: at(0) });
    const outside = tickAt(state, 1000);
    reportEnemyAppears(outside, at(3500));
    expect([outside.events, state.communications.limits.enemyAppears]).toEqual([[], 0]);

    const seed = state.rngState;
    const [drawn] = randValues(seed, 1);
    const inside = tickAt(state, 1000);
    reportEnemyAppears(inside, at(0, 3499));
    expect(inside.events).toEqual([queued(line(8 + (drawn % 2)), 'music-step', wingman, inside.time.tick, 1)]);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));
    expect(state.communications.limits.enemyAppears).toBe(1000 + 0x280);
    const held = tickAt(state, 1000 + 0x280);
    reportEnemyAppears(held, at(0));
    expect(held.events).toEqual([]);
    wingman.state = 'area-switch';
    const inactive = tickAt(state, 1002 + 0x280);
    reportEnemyAppears(inactive, at(0));
    expect(inactive.events).toEqual([]);
  });

  it('after the enemy line, lets each active base within its radius (non-strict) speak unless stamped within 0x2D00, restamping it either way', () => {
    const sc = scene();
    const { state } = sc;
    const near = addActive(sc, BASE_KIND_BIT, { position: at(0, 250) });
    const far = addActive(sc, BASE_KIND_BIT, { position: at(0, 251) });
    const parked = addActive(sc, BASE_KIND_BIT, { position: at(0), activity: 'parked', movement: null });
    const mover = addActive(sc, HOSTILE_KIND_BIT, { position: at(0), activity: 'parked', movement: null });
    const seed = state.rngState;
    const [faceRand] = randValues(seed, 1);
    const first = tickAt(state, 1000);
    reportParkedEnemy(first, mover);
    expect(first.events).toEqual([queued({ table: 20011, face: faceRand % 5, index: 2 }, 'music-step', near, first.time.tick, 1)]);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));
    expect([near, far, parked].map((base) => base.communications.threatStamp)).toEqual([1000, null, null]);

    const held = tickAt(state, 1000 + 0x2d00);
    reportParkedEnemy(held, mover);
    expect([held.events, near.communications.threatStamp]).toEqual([[], 1000 + 0x2d00]);
  });
});

describe('the tail warning, 0x4edf4 and 0x38c30 (CB-09 item 2, RX5; CB-17 decision 11)', () => {
  function tailScene() {
    const sc = scene();
    const wingman = addWingman(sc);
    const missile = (target: number | null) => {
      const { combat } = kindDefaults(20);
      if (combat.type !== 'missile') throw new Error('not a missile');
      return addActive(sc, 20, { combat: { ...combat, target } });
    };
    return { ...sc, wingman, missile };
  }
  const withField12 = (player: Entity, value: SubsystemState) => {
    const combat = player.combat as CraftEntity['combat'];
    combat.subsystems = combat.subsystems.map((state, index) => (index === 12 ? value : state));
  };

  it('checks once the clock is past its due clock: 0x40 later while a missile comes at the player, 0x80 otherwise', () => {
    const { state, player, missile } = tailScene();
    const hostile = addActive({ state, player }, HOSTILE_KIND_BIT);
    hostile.ai.objectTarget = player.id;
    checkTail(tickAt(state, 1000));
    // Without P3-08's handler state, no attacker is on an attack run.
    expect(state.communications.tailCheck).toEqual({ dueClock: 1000 + 0x80, attackerOnTail: false, missileIncoming: false });
    missile(player.id);
    checkTail(tickAt(state, 1000 + 0x80));
    expect(state.communications.tailCheck.dueClock).toBe(1000 + 0x80);
    checkTail(tickAt(state, 1002 + 0x80));
    expect(state.communications.tailCheck).toEqual({ dueClock: 1002 + 0x80 + 0x40, attackerOnTail: false, missileIncoming: true });
    withField12(player, 2);
    const context = tickAt(state, 2000);
    checkTail(context);
    expect(state.communications.tailCheck).toEqual({ dueClock: 2000 + 0x80, attackerOnTail: false, missileIncoming: false });
    expect(context.events).toEqual([]);
  });

  it('reads field 12 at 1 for the missile and ignores missiles at other targets or not active', () => {
    const { state, player, missile } = tailScene();
    withField12(player, 1);
    missile(player.id).activity = 'parked';
    missile(null);
    checkTail(tickAt(state, 1000));
    expect(state.communications.tailCheck.missileIncoming).toBe(false);
    missile(player.id);
    checkTail(tickAt(state, 2000));
    expect(state.communications.tailCheck.missileIncoming).toBe(true);
  });

  it('lets an active W warn with line 0xA, without a draw, while the third rows align, at most every 0x640 units', () => {
    const { state, player, wingman } = tailScene();
    const enemy = addActive({ state, player }, HOSTILE_KIND_BIT);
    player.orientation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    enemy.orientation = [1, 0, 0, 0, 0, -1, 0, 0.707, 0.708];
    const seed = state.rngState;
    const context = tickAt(state, 1000);
    warnTail(context, player, enemy);
    expect(context.events).toEqual([queued(line(0xa), 'none', wingman, context.time.tick, 1)]);
    expect([state.rngState, state.communications.limits.tailWarning]).toEqual([seed, 1000 + 0x640]);
    const held = tickAt(state, 1000 + 0x640);
    warnTail(held, player, enemy);
    expect(held.events).toEqual([]);
    enemy.orientation = [1, 0, 0, 0, 1, 0, 0, 0.707, 0.707];
    const misaligned = tickAt(state, 1002 + 0x640);
    warnTail(misaligned, player, enemy);
    expect([misaligned.events, state.communications.limits.tailWarning]).toEqual([[], 1000 + 0x640]);
  });
});

describe('clearCommunicationLimits (CB-12, for P3-11)', () => {
  it('clears the player\'s two friendly limits only', () => {
    const { state } = scene();
    Object.assign(state.player.communications.limits, { friendlyHit: 5, friendlyKill: 7 });
    state.player.communications.thanks = 3;
    clearCommunicationLimits(state);
    expect(state.player.communications).toMatchObject({ limits: { friendlyHit: null, friendlyKill: null }, thanks: 3 });
  });
});

describe('reads do not drive the reactions (AC-06)', () => {
  /** 300 ticks of a base whose old threat stamp re-announces at tick 1 (a draw), then the radio takes and plays it. */
  function run(read: boolean) {
    const sc = scene();
    const { state } = sc;
    const base = addActive(sc, BASE_KIND_BIT, named(0));
    addActive(sc, HOSTILE_KIND_BIT, { position: at(150) });
    state.clock = 20_000;
    base.communications.threatStamp = state.clock - 0x2d00;
    const world = constructWorld(state);
    const events: DomainEvent[] = [];
    for (let tick = 0; tick < 300; tick++) {
      events.push(...world.step(tickInput()));
      if (read) {
        world.projection();
        world.renderState();
        world.snapshot();
      }
    }
    return { events, rngState: state.rngState, text: stateText(state) };
  }

  it('gives the same events, RNG and state whether or not projection, Render State and snapshot are read between steps', () => {
    const quiet = run(false);
    expect(quiet.events.map(({ type }) => type)).toEqual(expect.arrayContaining(['radio-queued', 'radio-taken', 'incoming-started', 'incoming-ended']));
    expect(run(true)).toEqual(quiet);
  });
});
