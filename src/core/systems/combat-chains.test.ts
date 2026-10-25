import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent, Vec3 } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CoreFaultError } from '../errors.ts';
import { compareReplayResults } from '../replay/compare.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import type { DebrisRuleData } from '../rules/load-transforms.ts';
import { allocatorAiState, blankCraftCombat, type Entity, type EntityInit, type Matrix3, type MissileGuidance } from '../world/entity-table.ts';
import type { CraftRuleData, WorldRuleData } from '../world/rule-data.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stillEntityInit, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { registerTick, runTick, type Request } from './pipeline.ts';

// P3-07/24: chains of combat facts through the formal step (docs/plan/p3/02/spec.md, CR-06, CR-08, CR-13 and CR-14;
// docs/original/formats/executable.md, H4, X2, X7 and D14): one death however many blows land, attribution once the
// shooter is gone, the hand-offs to P3-11 that are not there yet, the order of a tick's events across the stages, events
// read long after their objects left, and the per-tick budgets. Every expectation is worked out here from the records,
// positions and timers each test sets; the rules' own branches are their modules' tests. A tick is 2 clock units.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
/** A clock no test reaches. */
const NEVER = 1e9;

const box = (half: number): ShapeBox => ({ lower: at(-half, -half, -half), upper: at(half, half, half) });
/** Radius 0 (no collision contact), the bounds a cube of half-size 2, no boxes: only projectiles and blasts reach it. */
const PLAIN: CollisionShape = { radius: 0, radiusSquared: 0, bounds: box(2), boxes: [], innerBox: null };
/** A sphere of radius 5 without boxes: the player's centre within 5 of such a craft is a contact. */
const SPHERE: CollisionShape = { radius: 5, radiusSquared: 25, bounds: box(5), boxes: [], innerBox: null };

/** Gun 0: speed 100, rate 8, cost 5, damage 30, lifetime 40, fixed. Missile 0: unguided; blast 700 within 2, 0 at 12. */
const GUN_DAMAGE = 30;
const BLAST = 700;
/** A kind of shape SPHERE, which the player touches. */
const CONTACT = 13;
/** A kind whose model has two parts with DEBRIS parameters, so its destruction sheds two fragments. */
const SHEDDING = 9;
/** A small DEBRIS record whose part starts at its source's centre. */
const DEBRIS: DebrisRuleData = { weights: at(0, 0, 0), direction: at(0, 0, 1), shape: PLAIN, small: true };

/** The craft info every scene shares, read once (frozen). */
const CONTENT = (() => {
  const info = syntheticCraftInfo();
  info.hitDamageScale = 1;
  info.guns = [gun({ at08: 100, at14: 8, at18: 5, at1C: GUN_DAMAGE, at24: 40, at28: 0 })];
  info.missiles = [missile({
    body: 0, at18: 0, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0, at44: 128, at48: 8, at54: 0, at58: 2, at5C: BLAST,
    at60: 2, at64: 12,
  })];
  // Every craft record: mount 0 gun 0 (list 0) at offset (1, 0, 0), mount 1 missile 0 with 2 rounds (list 1) at the origin.
  const mounts = [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 0, at0C: 2 })];
  info.craft = info.craft.map(() => craft({ at0C: 300, mounts, mountLists: [[0], [1], []] }));
  return readCraftInfo(info);
})();

/**
 * A quiet world (group 1: speed assist off) whose player stands active at the origin facing +z, with charge 100, shield
 * and hull 1000, its control and targeting state, and neither an automatic selection nor an energy update due. Its
 * model has one part, the escape pod (part 0 of kind 1, without parameters).
 */
function scene(): { readonly state: WorldState; readonly player: CraftEntity } {
  const base = testState({ group: 1 });
  const ruleData = {
    ...base.ruleData,
    craft: Array.from({ length: 20 }, (_, kindBit): CraftRuleData => ({
      shape: kindBit === CONTACT ? SPHERE : PLAIN,
      mountOffsets: [at(1, 0, 0), at(0, 0, 0)],
      parts: kindBit === SHEDDING ? 2 : kindBit === 0 ? 1 : 0,
      debris: kindBit === SHEDDING ? [DEBRIS, DEBRIS] : [],
    })),
    guns: [{ range: 100, rangeSquared: 10_000 }],
    missiles: [{ range: 100, rangeSquared: 10_000, fuseRadiusSquared: 1 }],
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: CONTENT }, ruleData };
  const player = addPlayerEntity(state, {
    position: at(0, 0, 0),
    orientation: IDENTITY,
    movement: craftMovementBlock(0, 40, 80),
    combat: { ...blankCraftCombat(), charge: 100, shield: 1000, hull: 1000, nextEnergyClock: NEVER, weapons: buildWeaponBlock(CONTENT.craft[0]) },
  }) as CraftEntity;
  player.state = 'active';
  state.player.targeting = { ...state.player.targeting!, autoTargetDueClock: NEVER };
  return { state, player };
}

interface CraftOptions {
  readonly shield?: number;
  readonly hull?: number;
  readonly activity?: EntityInit['activity'];
  readonly energy?: number;
  readonly nextEnergyClock?: number;
  readonly ai?: Partial<EntityInit['ai']>;
}

/** Instantiation data of a craft of `kindBit` at `position` that never moves on its own; active unless parked. */
function craftInit(kindBit: number, position: Vec3, { shield = 1000, hull = 1000, activity = 'active', energy = 0, nextEnergyClock = NEVER, ai = {} }: CraftOptions = {}): EntityInit {
  return (activity === 'parked' ? entityInit : stillEntityInit)(kindBit, {
    position,
    orientation: IDENTITY,
    activity,
    ai: { ...allocatorAiState(), ...ai },
    combat: { ...blankCraftCombat(), energy, shield, hull, nextEnergyClock, weapons: buildWeaponBlock(CONTENT.craft[kindBit]) },
  });
}

/** A craft of craftInit in state 7. */
function craftAt(state: WorldState, kindBit: number, position: Vec3, options: CraftOptions = {}): CraftEntity {
  const entity = state.entities.allocate(craftInit(kindBit, position, options)) as CraftEntity;
  entity.state = 'active';
  return entity;
}

/** `count` craft as craftAt makes them, from one init, which allocation copies. */
function craftsAt(state: WorldState, count: number, kindBit: number, position: Vec3, options: CraftOptions = {}): void {
  const init = craftInit(kindBit, position, options);
  for (let index = 0; index < count; index++) state.entities.allocate(init).state = 'active';
}

/** A part-0 fragment of a SHEDDING craft destroyed at `position` (a destroyed source), due to hand it off and expire. */
function handOffAt(state: WorldState, position: Vec3): { readonly source: Entity; readonly fragment: Entity } {
  const source = craftAt(state, SHEDDING, position);
  source.state = 'destroyed-source';
  const fragment = state.entities.allocate(entityInit(24, {
    position,
    combat: { type: 'fragment', sourceKindBit: SHEDDING, part: 0, debris: 0, durability: 1200, explodeOnExpiry: false, expiry: { type: 'at', clock: 0 }, handOff: source.id },
  }));
  fragment.state = 'active';
  return { source, fragment };
}

/** An explosion at `position` before its first callback, which activates it. */
function explosionAt(state: WorldState, position: Vec3): Entity {
  const explosion = state.entities.allocate(entityInit(22, { position }));
  explosion.state = 'presentation-ready';
  return explosion;
}

/** An active gun-0 projectile of `shooter` at `position`, moving at `velocity`, its timer far off. */
function projectileAt(state: WorldState, position: Vec3, velocity: Vec3, shooter: Entity | null = null): Entity {
  const entity = state.entities.allocate(entityInit(21, {
    position,
    orientation: IDENTITY,
    movement: { mode: 'linear', speed: 100, velocity, previousPosition: position, hitTest: true },
    combat: { type: 'projectile', gun: 0, shooter: shooter?.id ?? null, expiry: { clock: NEVER, firstHitPending: true } },
  }));
  entity.state = 'active';
  return entity;
}

/**
 * An active missile 0 of `shooter` at `position` whose guidance ends it at its next callback: phase 3 with the
 * detonation due (it detonates), or phase 2 with the lifetime due (it fizzles).
 */
function missileAt(state: WorldState, position: Vec3, shooter: Entity | null, ending: 'detonates' | 'fizzles' = 'detonates'): Entity {
  const guidance: MissileGuidance = {
    phase: ending === 'detonates' ? 3 : 2, lifetimeClock: ending === 'detonates' ? NEVER : 0, armClock: 0, fuseRadiusSquared: 1, detonationClock: 0,
    checkInterval: 2, nextCheckClock: NEVER,
  };
  const entity = state.entities.allocate(entityInit(20, {
    position,
    orientation: IDENTITY,
    movement: craftMovementBlock(0, 48, 96),
    combat: { type: 'missile', missile: 0, shooter: shooter?.id ?? null, target: null, launchByte: 0, program: 'unguided', detonate: false, contact: null, guidance, homing: null },
  }));
  entity.state = 'active';
  return entity;
}

const FIRE_PRIMARY: Command = { type: 'fire', channel: 'primary' };
const types = (events: readonly DomainEvent[]): string[] => events.map(({ type }) => type);
const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const victims = (events: readonly DomainEvent[]): [number, HitEvent['cause']][] => ofType(events, 'hit').map(({ victimEntityId, cause }) => [victimEntityId, cause]);

/** Whether the replay comparison, which checks each tick's order (compare.ts, TickOrder), takes `events` as one tick's. */
function inContractOrder(events: readonly DomainEvent[]): boolean {
  const tick = events[0].tick;
  const hash = '0123456789abcdef';
  const result = { events, checkpoints: [{ tick: 0, hash }, { tick, hash }], finalTick: tick };
  return compareReplayResults(result, result).match;
}

describe('one death per object (H4, CR-06, AC-13)', () => {
  it('lets the player die once however many blows land in the tick: each `hit` before its death, nothing of it after', () => {
    const { state, player } = scene();
    Object.assign(player.combat, { shield: 0, hull: BLAST + 1 });
    const shooter = craftAt(state, 7, at(0, 500, 0));
    // In request handling the shooter's missile detonates on the player (distance 0: 700, leaving hull 1) and 3 from the
    // contact craft (700 × (1 − 1/10) = 630); in movement two of its shots cross the player, the first for 30, which
    // destroys it; in collision the player touches the contact craft.
    missileAt(state, at(0, 0, 0), shooter);
    const contact = craftAt(state, CONTACT, at(0, 0, 3));
    const [first, second] = [projectileAt(state, at(0, 0, -10), at(0, 0, 640), shooter), projectileAt(state, at(0.5, 0, -10), at(0, 0, 640), shooter)];
    const world = constructWorld(state);
    const events = world.step(tickInput());
    // The first shot's removal retires it (P3-14 FA-07) after the player's loss starts; the second flies on.
    expect(types(events)).toEqual(['missile-ended', 'hit', 'hit', 'hit', 'object-destroyed', 'radio-flushed', 'player-loss-started', 'object-retired', 'hit']);
    expect(ofType(events, 'object-retired')).toEqual([{ type: 'object-retired', tick: 1, entityId: first.id, kindBit: 21, state: 'pending-removal' }]);
    expect(ofType(events, 'hit').map(({ victimEntityId, cause, damage }) => [victimEntityId, cause, damage])).toEqual([
      [player.id, 'missile', BLAST], [contact.id, 'missile', 630], [player.id, 'projectile', GUN_DAMAGE], [contact.id, 'collision', expect.any(Number)],
    ]);
    expect(ofType(events, 'hit').filter(({ victimEntityId }) => victimEntityId === player.id).map(({ hull }) => hull)).toEqual([
      { before: BLAST + 1, after: 1 }, { before: 1, after: 1 - GUN_DAMAGE },
    ]);
    expect(ofType(events, 'object-destroyed')).toEqual([{
      type: 'object-destroyed', tick: 1, entityId: player.id, kindBit: 0, source: null, position: at(0, 0, 0), activity: 'active',
      attacker: { type: 'shooter', entityId: shooter.id, kindBit: 7 }, eventClass: 1, outcome: 'delayed',
    }]);
    // The second shot's walk stops at the destroyed player, which takes nothing: it flies on (H4); the collision's damage
    // reaches only the contact craft.
    expect([first.state, second.state, second.position.z]).toEqual(['pending-removal', 'active', 10]);
    expect([player.destroyed, player.state, state.player.delayedExplosionClock]).toEqual([true, 'active', 2 + 0xc0]);
    expect(inContractOrder(events)).toBe(true);
    // Later ticks keep touching and never kill it again.
    const later = Array.from({ length: 10 }, () => world.step(tickInput())).flat();
    expect(ofType(later, 'object-destroyed')).toEqual([]);
    expect(victims(later).every(([victim]) => victim === contact.id)).toBe(true);
    expect(player.combat.hull).toBe(1 - GUN_DAMAGE);
  });

  it('kills a craft once: the walk skips its destroyed source for the shots that follow in the tick', () => {
    const { state, player } = scene();
    const victim = craftAt(state, 7, at(0, 50, 0), { shield: 0, hull: 1 });
    const [first, second] = [projectileAt(state, at(0, 50, -10), at(0, 0, 640), player), projectileAt(state, at(0.5, 50, -10), at(0, 0, 640), player)];
    const events = constructWorld(state).step(tickInput());
    expect(types(events)).toEqual(['hit', 'object-destroyed', 'object-retired']);
    expect(ofType(events, 'object-destroyed')[0]).toMatchObject({ entityId: victim.id, outcome: 'explodes', eventClass: 0 });
    expect(ofType(events, 'object-retired')[0]).toMatchObject({ entityId: first.id, state: 'pending-removal' });
    expect([victim.state, first.state, second.state]).toEqual(['destroyed-source', 'pending-removal', 'active']);
    expect(state.player.kills[7]).toBe(1);
  });
});

describe('attribution once the shooter is gone (H4, CR-06)', () => {
  it('falls back to lost-shooter for a shot and a missile whose shooter left earlier in the tick: event class 1, no kill', () => {
    const { state } = scene();
    // The shooter leaves in request handling, before its missile's expiry there and its shot's hit in movement.
    const shooter = craftAt(state, 7, at(0, 500, 0));
    shooter.state = 'pending-removal';
    const struck = craftAt(state, 8, at(0, 300, 0), { shield: 0, hull: 1 });
    const missile = missileAt(state, at(0, 300, 0), shooter);
    const shot = craftAt(state, 7, at(0, 50, 0), { shield: 0, hull: 1 });
    projectileAt(state, at(0, 50, -10), at(0, 0, 640), shooter);
    const kills = state.player.kills;
    const events = constructWorld(state).step(tickInput());
    expect(state.entities.get(shooter.id)).toBeUndefined();
    // The shot's removal after its hit retires it (P3-14 FA-07).
    expect(types(events)).toEqual(['missile-ended', 'hit', 'object-destroyed', 'hit', 'object-destroyed', 'object-retired']);
    expect(events[0]).toMatchObject({ entityId: missile.id, shooterEntityId: null, outcome: 'detonated' });
    expect(ofType(events, 'hit').map(({ victimEntityId, attacker }) => [victimEntityId, attacker])).toEqual([
      [struck.id, { type: 'lost-shooter' }], [shot.id, { type: 'lost-shooter' }],
    ]);
    expect(ofType(events, 'object-destroyed').map(({ entityId, attacker, eventClass }) => [entityId, attacker, eventClass])).toEqual([
      [struck.id, { type: 'lost-shooter' }, 1], [shot.id, { type: 'lost-shooter' }, 1],
    ]);
    expect(state.player.kills).toEqual(kills);
  });
});

describe('the hand-offs to P3-11 (CR-13, X2, X7, D14)', () => {
  it('takes the player from its death to the escape pod\'s expiry and its rescue there: never removed, its kills still counted, no failure', () => {
    const { state, player } = scene();
    // The player entity's declaration, whose runtime record the rescue rewrites (rescue.ts).
    Object.assign(player, { source: { collection: 'mission', index: 0, group: null } });
    Object.assign(player.combat, { shield: 0, hull: 1 });
    const shooter = craftAt(state, 7, at(0, 500, 0));
    missileAt(state, at(0, 0, 0), shooter);
    const world = constructWorld(state);
    const log: DomainEvent[] = [];
    const until = (tick: number) => { while (state.tick < tick) log.push(...world.step(tickInput())); };
    until(1);
    expect(ofType(log, 'object-destroyed')).toMatchObject([{ entityId: player.id, outcome: 'delayed' }]);
    // The delay 0xC0 after clock 2: the stage builds the player's explosion once the clock is past 194, at tick 98.
    until(97);
    expect(player.state).toBe('active');
    until(98);
    expect([player.state, state.player.delayedExplosionClock]).toEqual(['destroyed-source', null]);
    const [pod] = state.entities.walk(1 << 24);
    expect(state.player.followedEntity).toBe(pod.id);
    // Tick 99 activates the explosion and gives the pod its expiry, 0x140 after clock 198; tick 100 hands the player off,
    // which the original never removes.
    until(100);
    expect(log.slice(-2)).toMatchObject([
      { type: 'explosion-started', tick: 99, sourceEntityId: player.id, sourceKindBit: 0 },
      { type: 'source-released', tick: 100, entityId: player.id, kindBit: 0, fragmentEntityId: pod.id, removed: false },
    ]);
    // A shot the player fired before is the player's still: the kill counts (event class 0).
    const victim = craftAt(state, 7, at(0, 50, 0), { shield: 0, hull: 1 });
    const shot = projectileAt(state, at(0, 50, -10), at(0, 0, 640), player);
    until(101);
    // The shot's removal retires it right after the kill (P3-14 FA-07).
    expect(log.slice(-2)).toMatchObject([
      { type: 'object-destroyed', entityId: victim.id, attacker: { type: 'shooter', entityId: player.id, kindBit: 0 }, eventClass: 0 },
      { type: 'object-retired', entityId: shot.id, state: 'pending-removal' },
    ]);
    expect(state.player.kills[7]).toBe(1);
    // The pod expires at clock 518 (tick 259), ends the follow and leaves; P3-11's loss handling rescues the same
    // entity there (rescue.test.ts has the rescue's own expectations).
    const before = log.length;
    expect([player.state, player.destroyed, player.combat.hull]).toEqual(['destroyed-source', true, 1 - BLAST]);
    until(259);
    expect(log.slice(before).filter(({ type }) => type === 'fragment-expired')).toEqual([{
      type: 'fragment-expired', tick: 259, entityId: pod.id, sourceKindBit: 0, part: 0, position: expect.anything(), outcome: 'escape-pod',
    }]);
    expect(log.filter(({ type }) => type === 'player-rescued' || type === 'transition')).toEqual([
      expect.objectContaining({ type: 'player-rescued', tick: 259, playerEntityId: player.id, loss: 'destroyed', rescues: 1 }),
      { type: 'transition', tick: 259, gap: 'G-02/5' },
    ]);
    expect([state.player.entityId, state.player.followedEntity, state.missionStatus, state.flow.subState]).toEqual([player.id, null, 'built', 0]);
    expect([state.entities.get(player.id), player.state, player.destroyed]).toEqual([player, 'active', false]);
    until(400);
    expect(state.entities.get(pod.id)).toBeUndefined();
    expect(ofType(log, 'result-latched')).toEqual([]);
    expect(ofType(log, 'object-destroyed').map(({ entityId }) => entityId)).toEqual([player.id, victim.id]);
  });

  it('reports the player\'s depletion once and starts one beacon wait, without a failure (D14; P3-11, ME-09)', () => {
    const { state, player } = scene();
    Object.assign(player.combat, { energy: 0, nextEnergyClock: 0 });
    const world = constructWorld(state);
    const events = world.step(tickInput());
    expect(events).toEqual([
      { type: 'energy-depleted', tick: 1, entityId: player.id, kindBit: 0, position: at(0, 0, 0) },
      { type: 'flight-message', tick: 1, message: 'beacon' },
      { type: 'player-loss-started', tick: 1, playerEntityId: player.id, loss: 'energy', previousSubState: 0, deadlineClock: 2 + 0x3c0 },
    ]);
    expect([player.combat.energy, player.combat.depleted, player.destroyed, state.missionStatus, state.flow.subState]).toEqual([0, true, false, 'built', 1]);
    // Its next update (the player's interval later) is depleted again, without a second event: sub-state 1 holds.
    const next = player.combat.nextEnergyClock;
    while (state.clock <= next) expect(world.step(tickInput())).toEqual([]);
    expect([player.combat.depleted, player.combat.nextEnergyClock > next, state.missionStatus, state.flow.beaconDeadline]).toEqual([true, true, 'built', 2 + 0x3c0]);
  });
});

describe('the order of a tick\'s events (CR-06)', () => {
  it('follows the stages: the player\'s update, request handling with a detonation, movement, collision, energy, the parked engagement and the frame end', () => {
    const { state, player } = scene();
    Object.assign(state, { tick: 500, clock: 1000 });
    // Frame end: the player's target leaves in request handling.
    const leaving = craftAt(state, 8, at(0, 1200, 0));
    leaving.state = 'pending-removal';
    state.player.target = leaving.id;
    // Request handling, in posting order: the fire command's launch, then the walk's requests: the missile's expiry,
    // the explosion's activation, the part-0 fragment's hand-off and expiry.
    const struck = craftAt(state, 7, at(0, 200, 0), { shield: 0, hull: 1 });
    missileAt(state, at(0, 200, 0), null);
    const explosion = explosionAt(state, at(0, 400, 0));
    const { source, fragment } = handOffAt(state, at(0, 600, 0));
    // Movement: a shot through a craft; collision: the player and a contact craft; energy: a depleted craft.
    const shotAt = craftAt(state, 12, at(0, 800, 0));
    projectileAt(state, at(0, 800, -10), at(0, 0, 640));
    const contact = craftAt(state, CONTACT, at(0, 0, 3));
    const depleted = craftAt(state, 11, at(0, 1000, 0), { nextEnergyClock: 0 });
    // Parked update: a parked craft arrives at its target beyond the world's exit bounds, leaves and engages it.
    const target = craftAt(state, 14, at(45_000, 0, 0), { activity: 'parked', shield: 5000, ai: { mode: 5 } });
    const engaging = craftAt(state, 7, at(45_001, 0, 0), { activity: 'parked', ai: { mode: 0, target: target.id, targetOffset: at(1, 0, 0) } });
    const events = constructWorld(state).step(tickInput([{ type: 'energy', operation: 'open' }, FIRE_PRIMARY]));
    expect(types(events)).toEqual([
      'command-result', 'left-page-changed', 'command-result',
      'shot-fired', 'missile-ended', 'hit', 'object-destroyed', 'explosion-started', 'object-retired', 'source-released', 'fragment-expired',
      'object-retired',
      'hit',
      'hit', 'hit',
      'energy-depleted',
      'object-left-world', 'hit',
      'target-cleared',
    ]);
    expect(victims(events)).toEqual([[struck.id, 'missile'], [shotAt.id, 'projectile'], [player.id, 'collision'], [contact.id, 'collision'], [target.id, 'parked']]);
    const others = new Set(['hit', 'command-result', 'left-page-changed', 'shot-fired', 'target-cleared', 'object-retired']);
    expect(events.filter(({ type }) => !others.has(type))
      .map((event) => ('entityId' in event ? event.entityId : null))).toEqual([expect.any(Number), struck.id, explosion.id, source.id, fragment.id, depleted.id, engaging.id]);
    // The hand-off's source and the expired fragment retire where request handling writes their states (P3-14 FA-07).
    expect(ofType(events, 'object-retired').map(({ entityId, state: retired }) => [entityId, retired])).toEqual([
      [source.id, 'pending-removal'], [fragment.id, 'pending-removal'],
    ]);
    expect(events.at(-1)).toMatchObject({ previousTarget: leaving.id, cause: 'invalid' });
    expect(inContractOrder(events)).toBe(true);
  });
});

describe('events read ticks later (CR-06)', () => {
  it('keep what a consumer needs after their objects are gone, unchanged by the ticks between', () => {
    const { state, player } = scene();
    const victim = craftAt(state, SHEDDING, at(0, 50, 0), { shield: 0, hull: 1 });
    const shot = projectileAt(state, at(0, 50, -10), at(0, 0, 640), player);
    const world = constructWorld(state);
    // A consumer that keeps every tick's list and reads it only at the end, as a frame consumer behind a slow frame.
    const kept: (readonly DomainEvent[])[] = [];
    const asEmitted: string[] = [];
    for (let tick = 1; tick <= 60; tick++) {
      const events = world.step(tickInput());
      kept.push(events);
      asEmitted.push(JSON.stringify(events));
    }
    const [explosion] = ofType(kept.flat(), 'explosion-started');
    // The shot left at tick 2, the source at 4 after its hand-off, the explosion 50 ticks after its activation at 2.
    for (const id of [victim.id, shot.id, explosion.entityId]) expect(state.entities.get(id)).toBeUndefined();
    expect(kept.map((events) => JSON.stringify(events))).toEqual(asEmitted);
    expect(kept.every((events) => deepFrozen(events))).toBe(true);
    const events = kept.flat();
    expect(ofType(events, 'hit')[0]).toEqual({
      type: 'hit', tick: 1, victimEntityId: victim.id, victimKindBit: SHEDDING, victimPosition: at(0, 50, 0), victimForward: at(0, 0, 1),
      victimSpeed: 0, cause: 'projectile', sourceEntityId: shot.id,
      attacker: { type: 'shooter', entityId: player.id, kindBit: 0 }, damage: GUN_DAMAGE, gated: false, shield: { before: 0, after: 0 },
      hull: { before: 1, after: 1 - GUN_DAMAGE }, shieldWasEmpty: true, impact: null, projectile: 'removed',
    });
    expect(ofType(events, 'object-destroyed')).toEqual([{
      type: 'object-destroyed', tick: 1, entityId: victim.id, kindBit: SHEDDING, source: null, position: at(0, 50, 0), activity: 'active',
      attacker: { type: 'shooter', entityId: player.id, kindBit: 0 }, eventClass: 0, outcome: 'explodes',
    }]);
    expect(explosion).toEqual({
      type: 'explosion-started', tick: 2, entityId: explosion.entityId, sourceEntityId: victim.id, sourceKindBit: SHEDDING, variant: 'other',
      position: at(0, 50, 0), activationClock: 4,
    });
    expect(ofType(events, 'source-released')).toEqual([{ type: 'source-released', tick: 3, entityId: victim.id, kindBit: SHEDDING, fragmentEntityId: expect.any(Number), removed: true }]);
  });
});

describe('per-tick budgets (CR-14)', () => {
  const { eventsPerTick, requestsPerTick, entities: ENTITIES } = CORE_LIMITS;
  const CLUSTER = at(0, 500, 0);

  /**
   * A shield and hull no test's damage uses up: a blow can damage a subsystem without hull damage, and shield
   * subsystem 4 at state 1 lets later blows pass the shield (D3), so that every blow is a `hit` and none destroys.
   */
  const DURABLE = { shield: 1_000_000, hull: 1_000_000 };

  /** The scene with `struck` craft of kind 12 at CLUSTER, then `detonating` and `fizzling` missiles there. */
  function blastScene(struck: number, detonating: number, fizzling: number): WorldState {
    const { state } = scene();
    craftsAt(state, struck, 12, CLUSTER, DURABLE);
    for (let index = 0; index < detonating; index++) missileAt(state, CLUSTER, null);
    for (let index = 0; index < fizzling; index++) missileAt(state, CLUSTER, null, 'fizzles');
    return state;
  }

  /** Asserts that `world` latched `fault`: every later step and read throws it. */
  function expectLatched(world: World, fault: CoreFaultError): void {
    for (const call of [() => world.step(tickInput()), () => world.snapshot(), () => world.projection(), () => world.renderState()]) expect(thrownBy(call)).toBe(fault);
  }

  it(`takes ${eventsPerTick} events in a tick, and faults at one more without publishing any, latched (detonations)`, () => {
    // 32 detonations, each `missile-ended` and a `hit` on each of 1023 craft at distance 0: 32 × 1024.
    const full = constructWorld(blastScene(1023, 32, 0)).step(tickInput());
    expect(full).toHaveLength(eventsPerTick);
    expect([ofType(full, 'missile-ended').length, ofType(full, 'hit').length]).toEqual([32, 32 * 1023]);
    // A fizzle handled after them is the one event more.
    const world = constructWorld(blastScene(1023, 32, 1));
    expectLatched(world, expectFault(() => world.step(tickInput()), 'budget-exhausted', 'pipeline.events'));
  });

  /** n craft of group A (kind 7, here of shape SPHERE) in one place: each pair touches, a `hit` on each, n × (n − 1). */
  function crowd(count: number): World {
    const { state } = scene();
    const ruleData = { ...state.ruleData, craft: state.ruleData.craft.map((kind, kindBit) => (kindBit === 7 ? { ...kind!, shape: SPHERE } : kind)) } as WorldRuleData;
    const crowded: WorldState = { ...state, ruleData };
    craftsAt(crowded, count, 7, CLUSTER, DURABLE);
    return constructWorld(crowded);
  }

  it('takes the quadratic collision term within the budget and faults beyond it: 181 craft touch in 32,580 hits, 182 in 32,942', () => {
    const events = crowd(181).step(tickInput());
    expect([events.length, ofType(events, 'hit').length]).toEqual([181 * 180, 181 * 180]);
    const world = crowd(182);
    expectLatched(world, expectFault(() => world.step(tickInput()), 'budget-exhausted', 'pipeline.events'));
  });

  /**
   * n parked craft of kind 7 in AI mode 1 and n of kind 14 in mode 5 in one place: due at clock 1002 (64 + rand % 64
   * after 0), each of the first collects the n of the other side within +0x0C = 300 and engages each (at least one shot
   * of 30, 27 on kind 14), n² hits; neither travels, and mode 5 does not engage.
   */
  function engaging(count: number): World {
    const { state } = scene();
    Object.assign(state, { tick: 500, clock: 1000 });
    craftsAt(state, count, 7, CLUSTER, { activity: 'parked', ai: { mode: 1 } });
    craftsAt(state, count, 14, CLUSTER, { ...DURABLE, activity: 'parked', ai: { mode: 5 } });
    return constructWorld(state);
  }

  it('takes the quadratic parked term within the budget and faults beyond it: 181 engage 181 each in 32,761 hits, 182 in 33,124', () => {
    const events = engaging(181).step(tickInput());
    expect([events.length, ofType(events, 'hit').length]).toEqual([181 * 181, 181 * 181]);
    const world = engaging(182);
    expectLatched(world, expectFault(() => world.step(tickInput()), 'budget-exhausted', 'pipeline.events'));
  });

  /** Fills the entity table of `state` with parked craft of kind 14 that no rule touches in a few ticks, up to `size`. */
  function fill(state: WorldState, size: number): void {
    craftsAt(state, size - state.entities.size, 14, at(45_000, 0, 0), { activity: 'parked', ai: { mode: 5 } });
  }

  // Each effect with the entities its tick allocates: a projectile or a missile from the player's fire command, a kill's
  // explosion (kind 7 has no parts, so it holds its source), and a kill's explosion with two fragments.
  it.each([
    ['a projectile', 1, 'shot-fired', (_state: WorldState) => [FIRE_PRIMARY]],
    ['a missile', 1, 'shot-fired', (state: WorldState) => {
      state.player.target = craftAt(state, 7, at(0, 0, 50)).id;
      return [{ type: 'fire', channel: 'secondary' } as const];
    }],
    ['an explosion', 1, 'object-destroyed', (state: WorldState) => {
      craftAt(state, 7, at(0, 50, 0), { shield: 0, hull: 1 });
      projectileAt(state, at(0, 50, -10), at(0, 0, 640));
      return [];
    }],
    ['an explosion with two fragments', 3, 'object-destroyed', (state: WorldState) => {
      craftAt(state, SHEDDING, at(0, 50, 0), { shield: 0, hull: 1 });
      projectileAt(state, at(0, 50, -10), at(0, 0, 640));
      return [];
    }],
  ] as const)('creates %s up to the entity limit, and faults rather than drop it one entity later', (_, allocated, made, setUp) => {
    const tick = (room: number) => {
      const { state } = scene();
      const commands = setUp(state);
      fill(state, ENTITIES - room);
      return { state, world: constructWorld(state), commands };
    };
    const full = tick(allocated);
    expect(types(full.world.step(tickInput(full.commands)))).toContain(made);
    expect(full.state.entities.size).toBe(ENTITIES);
    const over = tick(allocated - 1);
    expectLatched(over.world, expectFault(() => over.world.step(tickInput(over.commands)), 'budget-exhausted', 'entities.count'));
  });

  it(`counts the tick's own requests against ${requestsPerTick}: a queue that already holds the rest takes them, one more faults`, () => {
    // Every P3-07 request family: the fire command's deferred launch, a detonation's expiry, an explosion's activation,
    // a part-0 fragment's hand-off and expiry, a leaving craft.
    const build = () => {
      const { state } = scene();
      missileAt(state, at(0, 200, 0), null);
      explosionAt(state, at(0, 400, 0));
      handOffAt(state, at(0, 600, 0));
      craftAt(state, 8, at(0, 1200, 0)).state = 'pending-removal';
      return state;
    };
    const input = readTickInput(tickInput([FIRE_PRIMARY]));
    /** One formal tick with `prefilled` requests posted ahead of the rules' (a leave for an ID no entity has, which changes nothing). */
    const run = (prefilled: number) => {
      const context = registerTick(build(), input);
      for (let index = 0; index < prefilled; index++) context.requests.post({ type: 'leave', entityId: Number.MAX_SAFE_INTEGER });
      const posted: Request[] = [];
      for (const method of ['post', 'defer'] as const) {
        const original = context.requests[method].bind(context.requests);
        context.requests[method] = (request: Request) => {
          posted.push(request);
          original(request);
        };
      }
      return { events: runTick(context), posted };
    };
    // Counted as posted (the launch when deferred): the launch in the player's update, then the walk's in kind order.
    const own = 6;
    const alone = run(0);
    expect(alone.posted.map(({ type }) => type)).toEqual(['launch', 'leave', 'expire', 'set-state', 'hand-off', 'expire']);
    expect(run(requestsPerTick - own).events).toEqual(alone.events);
    expectFault(() => run(requestsPerTick - own + 1), 'budget-exhausted', 'pipeline.requests');
  });
});
