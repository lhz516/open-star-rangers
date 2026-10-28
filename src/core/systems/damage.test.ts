import { describe, expect, it } from 'vitest';
import type { Attacker, DomainEvent, HitEvent, ObjectDestroyedEvent } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { RngState } from '../determinism/rng.ts';
import { compareReplayResults } from '../replay/compare.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { SUBSYSTEM_COUNT, type Entity, type EntityInit, type SteeredMovementBlock, type SubsystemState } from '../world/entity-table.ts';
import { addPlayerEntity, entityInit, expectFault, kindDefaults, stateText, stillEntityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldConfig, WorldState } from '../world/world-state.ts';
import { applyContactDamage, applyEngagementDamage, applyShotHit, type HitImpact } from './damage.ts';
import { registerTick, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-02, CR-04, CR-06 and CR-13; docs/original/formats/executable.md, D2–D5, D8, D11 and H4.
// Every expectation is worked out by hand from the shields, hulls and rand values set below. The world RNG is set to a
// state whose next rand values take the branch a test needs; rules/subsystems.test.ts covers the roll's mappings.

const CLOCK = 640;
const IMPACT: HitImpact = Object.freeze({ point: Object.freeze({ x: 1, y: 2, z: 3 }), local: Object.freeze({ x: 0, y: 0, z: -1 }), face: 4 });
const at = (x: number, y: number, z: number) => ({ x, y, z });

/** A context in the collision stage, one of those that destroy (`explosion-created` reports it). */
function atCollision(context: TickContext): TickContext {
  context.stage = 'collision';
  return context;
}

interface Scene {
  readonly state: WorldState;
  readonly context: TickContext;
  readonly player: CraftEntity;
}

/**
 * A world at CLOCK with the player standing. Every kind but the player's gets rule data without model parts, so a
 * destroyed craft explodes holding its source and sheds no fragments: destruction.test.ts covers what follows.
 */
function scene(config: Partial<WorldConfig> = {}): Scene {
  const base = testState(config);
  const { craft } = base.ruleData;
  const partless = { ...craft[0]!, parts: 0, debris: [] };
  const state: WorldState = { ...base, ruleData: { ...base.ruleData, craft: craft.map((kind) => kind ?? partless) } };
  state.clock = CLOCK;
  const player = addPlayerEntity(state) as CraftEntity;
  arm(player, 50, 100);
  return { state, context: atCollision(registerTick(state, readTickInput(tickInput()))), player };
}

function arm(entity: Entity, shield: number, hull: number, states: Readonly<Record<number, SubsystemState>> = {}): CraftEntity {
  const craft = entity as CraftEntity;
  Object.assign(craft.combat, { shield, hull });
  craft.combat.subsystems = Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => states[index] ?? 0));
  return craft;
}

/** A craft of `kindBit` with this shield and hull. */
function craftIn(state: WorldState, kindBit: number, shield: number, hull: number, overrides: Partial<EntityInit> = {}): CraftEntity {
  const parked = overrides.activity === 'parked' ? { movement: null } : {};
  return arm(state.entities.allocate(stillEntityInit(kindBit, { position: at(kindBit, 5, 6), ...parked, ...overrides })), shield, hull);
}

const projectileOf = (state: WorldState, shooter: number | null): Entity =>
  state.entities.allocate(entityInit(21, { combat: { type: 'projectile', gun: 0, shooter, expiry: null } }));

function missileOf(state: WorldState, shooter: number | null): Entity {
  const { combat } = kindDefaults(20);
  if (combat.type !== 'missile') throw new Error('not a missile');
  return state.entities.allocate(entityInit(20, { combat: { ...combat, shooter } }));
}

/** Sets the world RNG to the first state from 0 whose next `count` rand values `accept` takes. */
function drawNext(state: WorldState, count: number, accept: (values: readonly number[]) => boolean): RngState {
  for (let candidate = 0; ; candidate++) {
    if (accept(randValues(candidate, count))) {
      state.rngState = candidate;
      return candidate;
    }
  }
}

const shooter = (entity: Entity): Attacker => ({ type: 'shooter', entityId: entity.id, kindBit: entity.kindBit });
const ofType = <Type extends DomainEvent['type']>(context: TickContext, type: Type) =>
  context.events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const hits = (context: TickContext): HitEvent[] => ofType(context, 'hit');
const destructions = (context: TickContext): ObjectDestroyedEvent[] => ofType(context, 'object-destroyed');

describe('the energy-page redraw of the player\'s shield, 0x30c60 (CK-02)', () => {
  it('counts each hit the player\'s shield takes, an empty shield included, and not its bypass, a gated hit or another craft\'s', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    applyContactDamage(context, enemy, 20, 'collision');
    expect(state.player.energyPageRedraws).toBe(0);
    // 50 → 30; then emptied with 10 left for the hull; then an empty shield, which still takes the hit.
    for (const damage of [20, 40, 5]) applyContactDamage(context, player, damage, 'collision');
    expect([player.combat.shield, state.player.energyPageRedraws]).toEqual([0, 3]);
    // Subsystem 4 at 1: a low byte below 0x54 bypasses the shield, any other is taken.
    arm(player, 50, 100, { 4: 1 });
    drawNext(state, 1, ([value]) => (value & 0xff) < 0x54);
    applyEngagementDamage(context, enemy, player, 1);
    expect([player.combat.shield, state.player.energyPageRedraws]).toEqual([50, 3]);
    arm(player, 50, 100, { 4: 1 });
    drawNext(state, 1, ([value]) => (value & 0xff) >= 0x54);
    applyEngagementDamage(context, enemy, player, 1);
    expect([player.combat.shield, state.player.energyPageRedraws]).toEqual([49, 4]);
    // The destruction view's gate takes no hit.
    state.player.followedEntity = enemy.id;
    applyEngagementDamage(context, enemy, player, 1);
    expect(state.player.energyPageRedraws).toBe(4);
  });
});

describe('a projectile or missile hit, 0x2a40c (H4, AC-09)', () => {
  it('does nothing at all to a destroyed victim', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    enemy.destroyed = true;
    const projectile = projectileOf(state, player.id);
    const before = stateText(state);
    expect(applyShotHit(context, projectile, enemy, 20, IMPACT)).toBeNull();
    expect(applyShotHit(context, missileOf(state, player.id), enemy, 20, null)).toBeNull();
    expect(context.events).toEqual([]);
    expect(state.player.shots).toEqual({ projectilesFired: 0, projectileHits: 0, missilesFired: 0, missileHits: 0 });
    expect(enemy.combat.hitFeedbackClock).toBeNull();
    expect(player.combat.lastVictim).toBeNull();
    // Only the missile allocated meanwhile differs.
    expect(stateText(state).length).toBeGreaterThan(before.length);
  });

  it('does nothing at all to a victim that was removed', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const projectile = projectileOf(state, player.id);
    state.entities.remove(enemy);
    const before = stateText(state);
    expect(applyShotHit(context, projectile, enemy, 20, IMPACT)).toBeNull();
    expect([stateText(state), context.events, enemy.combat.hitFeedbackClock, enemy.combat.shield]).toEqual([before, [], null, 50]);
    expectFault(() => applyContactDamage(context, enemy, 20, 'collision'), 'invariant-violated', 'damage.victim');
    expectFault(() => applyEngagementDamage(context, player, enemy, 20), 'invariant-violated', 'damage.victim');
  });

  it('credits the player\'s projectile: its hit counted, both records and the feedback clock, then hit; the shield takes it whole and it bounces', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const projectile = projectileOf(state, player.id);
    const rng = state.rngState;
    expect(applyShotHit(context, projectile, enemy, 20, IMPACT)).toEqual({ absorbed: true, projectile: 'ricochet' });
    expect(state.player.shots).toEqual({ projectilesFired: 0, projectileHits: 1, missilesFired: 0, missileHits: 0 });
    expect(player.combat.lastVictim).toEqual({ entity: enemy.id, clock: CLOCK });
    expect(enemy.combat.lastAttacker).toEqual({ entity: player.id, clock: CLOCK });
    expect(enemy.combat.hitFeedbackClock).toBe(CLOCK);
    expect([enemy.combat.shield, enemy.combat.hull, enemy.destroyed]).toEqual([30, 100, false]);
    // No subsystem-4 draw, no hull damage and no forced roll for a projectile with an attacker: nothing drawn.
    expect(state.rngState).toBe(rng);
    expect(context.events).toEqual([{
      type: 'hit', tick: 1, victimEntityId: enemy.id, victimKindBit: 7, victimPosition: at(7, 5, 6), cause: 'projectile',
      sourceEntityId: projectile.id, attacker: shooter(player), damage: 20, gated: false, shield: { before: 50, after: 30 },
      hull: { before: 100, after: 100 }, shieldWasEmpty: false, impact: IMPACT, projectile: 'ricochet',
    }]);
  });

  it('removes a projectile whose damage reaches the hull, after the damage roll and the field', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    // 30 left for the hull, 70 after it: t = trunc(768 × 30 ÷ 70) = 329 beats any low byte; field rand % 9 = 0.
    const rng = drawNext(state, 2, ([, field]) => field % 9 === 0);
    expect(applyShotHit(context, projectileOf(state, player.id), enemy, 80, null)).toEqual({ absorbed: false, projectile: 'removed' });
    expect([enemy.combat.shield, enemy.combat.hull, enemy.combat.subsystems[0]]).toEqual([0, 70, 1]);
    expect(state.rngState).toBe(rngStateAfter(rng, 2));
    expect(hits(context)[0]).toMatchObject({ shield: { before: 50, after: 0 }, hull: { before: 100, after: 70 }, impact: null, projectile: 'removed' });
  });

  it('removes a projectile the player\'s shield takes whole, but bounces it in view mode 0x11', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    expect(applyShotHit(context, projectileOf(state, enemy.id), player, 10, IMPACT)).toEqual({ absorbed: true, projectile: 'removed' });
    state.player.viewMode = 0x11;
    expect(applyShotHit(context, projectileOf(state, enemy.id), player, 10, IMPACT)).toEqual({ absorbed: true, projectile: 'ricochet' });
    expect(hits(context).map(({ projectile }) => projectile)).toEqual(['removed', 'ricochet']);
    expect(state.player.shots.projectileHits).toBe(0);
  });

  it('counts the player\'s missile hit and draws the forced roll for a missile, with no projectile outcome', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const missile = missileOf(state, player.id);
    const rng = drawNext(state, 1, ([forced]) => (forced & 0xff) >= 0x32);
    expect(applyShotHit(context, missile, enemy, 20, null)).toEqual({ absorbed: true, projectile: null });
    expect(state.rngState).toBe(rngStateAfter(rng, 1));
    expect(state.player.shots).toMatchObject({ projectileHits: 0, missileHits: 1 });
    expect(hits(context)[0]).toMatchObject({ cause: 'missile', sourceEntityId: missile.id, attacker: shooter(player), impact: null, projectile: null });
  });

  it('records another shooter\'s hit without counting it', () => {
    const { state, context } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const wingman = craftIn(state, 1, 50, 100);
    applyShotHit(context, projectileOf(state, enemy.id), wingman, 5, null);
    expect(state.player.shots.projectileHits).toBe(0);
    expect([enemy.combat.lastVictim, wingman.combat.lastAttacker]).toEqual([{ entity: wingman.id, clock: CLOCK }, { entity: enemy.id, clock: CLOCK }]);
    expect(hits(context)[0].attacker).toEqual(shooter(enemy));
  });

  it('attributes a hit whose shooter is gone to lost-shooter: no count, no records, still the feedback', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const gone = craftIn(state, 8, 0, 10);
    const orphan = projectileOf(state, gone.id);
    state.entities.remove(gone);
    applyShotHit(context, orphan, enemy, 20, null);
    applyShotHit(context, projectileOf(state, null), enemy, 20, null);
    expect(hits(context).map(({ attacker }) => attacker)).toEqual([{ type: 'lost-shooter' }, { type: 'lost-shooter' }]);
    expect([state.player.shots.projectileHits, enemy.combat.lastAttacker, player.combat.lastVictim]).toEqual([0, null, null]);
    expect(enemy.combat.hitFeedbackClock).toBe(CLOCK);
  });

  it('keeps a destroyed shooter that is still listed as the attacker: records, statistics and kill credit', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 0, 1);
    player.destroyed = true;
    applyShotHit(context, projectileOf(state, player.id), enemy, 50, null);
    expect([state.player.shots.projectileHits, player.combat.lastVictim, enemy.combat.lastAttacker, state.player.kills[7]])
      .toEqual([1, { entity: enemy.id, clock: CLOCK }, { entity: player.id, clock: CLOCK }, 1]);
    expect(destructions(context)[0]).toMatchObject({ attacker: shooter(player), eventClass: 0 });
  });

  it('faults for a source other than a projectile or missile, a victim other than a craft, damage outside i32 and a missile\'s impact', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const projectile = projectileOf(state, player.id);
    expectFault(() => applyShotHit(context, enemy, player, 1, null), 'invariant-violated', 'damage.source');
    expectFault(() => applyShotHit(context, projectile, projectileOf(state, null), 1, null), 'invariant-violated', 'damage.victim');
    expectFault(() => applyShotHit(context, projectile, enemy, 2 ** 31, null), 'invariant-violated', 'damage.amount');
    expectFault(() => applyShotHit(context, projectile, enemy, 1.5, null), 'invariant-violated', 'damage.amount');
    expectFault(() => applyShotHit(context, projectileOf(state, projectile.id), enemy, 1, null), 'invariant-violated', 'damage.shooter');
    expectFault(() => applyShotHit(context, missileOf(state, player.id), enemy, 1, IMPACT), 'invariant-violated', 'damage.impact');
    expect(context.events).toEqual([]);
  });
});

describe('the gates of 0x2a694 (D2, AC-09)', () => {
  it('stops every hit on the player while the destruction view follows its pod: a gated hit that changes nothing', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    state.player.followedEntity = enemy.id;
    const rng = state.rngState;
    expect(applyShotHit(context, projectileOf(state, enemy.id), player, 500, IMPACT)).toEqual({ absorbed: false, projectile: 'removed' });
    applyContactDamage(context, player, 500, 'collision');
    expect([player.combat.shield, player.combat.hull, player.destroyed, state.rngState]).toEqual([50, 100, false, rng]);
    // 0x2a40c's records and both feedback items come before the gate.
    expect([enemy.combat.lastVictim, player.combat.hitFeedbackClock]).toEqual([{ entity: player.id, clock: CLOCK }, CLOCK]);
    expect(hits(context).map(({ gated, shield, hull }) => ({ gated, shield, hull }))).toEqual([
      { gated: true, shield: { before: 50, after: 50 }, hull: { before: 100, after: 100 } },
      { gated: true, shield: { before: 50, after: 50 }, hull: { before: 100, after: 100 } },
    ]);
    expect(destructions(context)).toEqual([]);
  });

  it('protects no other craft, and nothing without a followed object', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    state.player.followedEntity = enemy.id;
    applyShotHit(context, projectileOf(state, player.id), enemy, 20, null);
    state.player.followedEntity = null;
    applyShotHit(context, projectileOf(state, enemy.id), player, 20, null);
    expect(hits(context).map(({ gated }) => gated)).toEqual([false, false]);
    expect([enemy.combat.shield, player.combat.shield]).toEqual([30, 30]);
  });
});

describe('collisions and area damage, 0x2a5fc (D5, AC-09)', () => {
  it('writes the feedback clock and damages without an attacker or source; the forced roll is drawn', () => {
    const { state, context } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const rng = drawNext(state, 1, ([forced]) => (forced & 0xff) >= 0x32);
    applyContactDamage(context, enemy, 20, 'collision');
    applyContactDamage(context, enemy, 10, 'area');
    expect(state.rngState).toBe(rngStateAfter(rng, 2));
    expect([enemy.combat.shield, enemy.combat.hitFeedbackClock, enemy.combat.lastAttacker]).toEqual([20, CLOCK, null]);
    expect(hits(context).map(({ cause, attacker, sourceEntityId, impact, projectile }) => ({ cause, attacker, sourceEntityId, impact, projectile }))).toEqual([
      { cause: 'collision', attacker: { type: 'none' }, sourceEntityId: null, impact: null, projectile: null },
      { cause: 'area', attacker: { type: 'none' }, sourceEntityId: null, impact: null, projectile: null },
    ]);
  });

  it('does nothing to a destroyed victim', () => {
    const { state, context } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    enemy.destroyed = true;
    const before = stateText(state);
    applyContactDamage(context, enemy, 20, 'collision');
    expect([stateText(state), context.events]).toEqual([before, []]);
  });
});

describe('the parked engagement\'s damage (E3, CR-06)', () => {
  it('attributes it to the shooter, with the cause parked and without the feedback clock', () => {
    const { state, context } = scene();
    const attacker = craftIn(state, 8, 0, 10);
    const enemy = craftIn(state, 7, 50, 100);
    applyEngagementDamage(context, attacker, enemy, 20);
    expect([enemy.combat.shield, enemy.combat.hitFeedbackClock, enemy.combat.lastAttacker]).toEqual([30, null, null]);
    expect(hits(context)[0]).toMatchObject({ cause: 'parked', attacker: shooter(attacker), sourceEntityId: null, impact: null, projectile: null });
  });

  it('removes a parked victim it destroys, without the destruction entry', () => {
    const { state, context } = scene();
    const attacker = craftIn(state, 8, 0, 10, { activity: 'parked' });
    const enemy = craftIn(state, 7, 0, 10, { activity: 'parked' });
    // 20 left for the hull: −10, so the roll is certain without a draw, then field rand % 9 = 1.
    drawNext(state, 1, ([field]) => field % 9 === 1);
    applyEngagementDamage(context, attacker, enemy, 20);
    expect([enemy.destroyed, enemy.state, enemy.combat.hull, enemy.combat.subsystems[1]]).toEqual([true, 'pending-removal', -10, 1]);
    expect(destructions(context)).toEqual([{
      type: 'object-destroyed', tick: 1, entityId: enemy.id, kindBit: 7, source: null, position: at(7, 5, 6), activity: 'parked',
      attacker: shooter(attacker), eventClass: 1, outcome: 'removed',
    }]);
  });
});

describe('the destruction in 0x2a694 (D2, D8, CR-06, AC-09)', () => {
  it('sets the destroyed flag once and emits object-destroyed right after the hit', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 10, 20);
    applyShotHit(context, projectileOf(state, player.id), enemy, 50, null);
    expect(enemy.destroyed).toBe(true);
    expect(context.events.slice(0, 2).map(({ type }) => type)).toEqual(['hit', 'object-destroyed']);
    expect(context.events[0]).toMatchObject({ hull: { before: 20, after: -20 }, projectile: 'removed' });
    expect(context.events[1]).toEqual({
      type: 'object-destroyed', tick: 1, entityId: enemy.id, kindBit: 7, source: null, position: at(7, 5, 6), activity: 'active',
      attacker: shooter(player), eventClass: 0, outcome: 'explodes',
    });
    const count = context.events.length;
    expect(applyShotHit(context, projectileOf(state, player.id), enemy, 50, null)).toBeNull();
    applyContactDamage(context, enemy, 50, 'collision');
    expect(context.events.length).toBe(count);
    expect(destructions(context)).toHaveLength(1);
  });

  it('names the outcome by victim: the player delayed, a parked craft removed, an active or docked one explodes', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 0, 1);
    const docked = craftIn(state, 9, 0, 1);
    docked.activity = 'docked';
    const parkedWingman = craftIn(state, 1, 0, 1, { activity: 'parked' });
    arm(player, 0, 1);
    for (const victim of [player, enemy, docked, parkedWingman]) applyContactDamage(context, victim, 5, 'collision');
    expect(destructions(context).map(({ entityId, outcome, activity }) => [entityId, outcome, activity])).toEqual([
      [player.id, 'delayed', 'active'], [enemy.id, 'explodes', 'active'], [docked.id, 'explodes', 'docked'], [parkedWingman.id, 'removed', 'parked'],
    ]);
    expect([player.state, enemy.state, docked.state, parkedWingman.state]).toEqual(['presentation-ready', 'destroyed-source', 'destroyed-source', 'pending-removal']);
    expect(state.player.delayedExplosionClock).toBe(CLOCK + 0xc0);
  });

  it('counts only the player\'s kills of the counted kinds, also of a parked craft, and gives them event class 0', () => {
    const { state, context, player } = scene();
    const kill = (victim: Entity, source: Entity) => applyShotHit(context, source, victim, 50, null);
    kill(craftIn(state, 7, 0, 1), projectileOf(state, player.id));
    kill(craftIn(state, 19, 0, 1, { activity: 'parked' }), missileOf(state, player.id));
    kill(craftIn(state, 13, 0, 1), projectileOf(state, player.id));
    kill(craftIn(state, 1, 0, 1), projectileOf(state, player.id));
    const other = craftIn(state, 8, 0, 100);
    kill(craftIn(state, 7, 0, 1), projectileOf(state, other.id));
    kill(craftIn(state, 7, 0, 1), projectileOf(state, null));
    applyContactDamage(context, craftIn(state, 7, 0, 1), 50, 'collision');
    expect(state.player.kills).toEqual({ 7: 1, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 16: 0, 19: 1 });
    expect(Object.isFrozen(state.player.kills)).toBe(true);
    expect(destructions(context).map(({ kindBit, eventClass, attacker }) => [kindBit, eventClass, attacker.type])).toEqual([
      [7, 0, 'shooter'], [19, 0, 'shooter'], [13, 0, 'shooter'], [1, 0, 'shooter'], [7, 1, 'shooter'], [7, 1, 'lost-shooter'], [7, 1, 'none'],
    ]);
  });

  it('never destroys on a hit the shield took whole, even at a hull of 0 or below', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 50, 0);
    expect(applyShotHit(context, projectileOf(state, player.id), enemy, 20, null)).toEqual({ absorbed: true, projectile: 'ricochet' });
    expect([enemy.destroyed, destructions(context)]).toEqual([false, []]);
    applyShotHit(context, projectileOf(state, player.id), enemy, 31, null);
    expect(enemy.destroyed).toBe(true);
  });

  it('emits events the replay comparator accepts as one tick', () => {
    const { state, context, player } = scene();
    applyShotHit(context, projectileOf(state, player.id), craftIn(state, 7, 0, 1), 50, IMPACT);
    applyContactDamage(context, craftIn(state, 8, 50, 100), 20, 'collision');
    const result = { events: context.events, checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: 1, hash: '1'.repeat(16) }], finalTick: 1 };
    expect(compareReplayResults(result, result)).toEqual({ match: true });
  });
});

describe('subsystem damage through the entry (D4, D9, D11, CR-04, CR-09)', () => {
  it('applies a player\'s field in rand order: forced roll, damage roll, field; then the redraw and the heavy-damage note', () => {
    const { state, context, player } = scene();
    // Fields 9–16 damaged; field 4 (the shield's) intact, so the shield draws nothing.
    arm(player, 0, 100, Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 9, 1])) as Record<number, SubsystemState>);
    state.player.statusDisplay.redraw = false;
    // Forced roll fails (≥ 0x32); 20 to the hull, 80 after: t = 192 beats a low byte below it; field rand % 19 = 18.
    const rng = drawNext(state, 3, ([forced, roll, field]) => (forced & 0xff) >= 0x32 && (roll & 0xff) < 192 && field % 19 === 18);
    applyContactDamage(context, player, 20, 'collision');
    expect(state.rngState).toBe(rngStateAfter(rng, 3));
    expect([player.combat.hull, player.combat.subsystems[18], state.player.statusDisplay.redraw, state.player.heavyDamage]).toEqual([80, 1, true, 0]);
  });

  it('leaves the status display alone for another craft and for a field already at state 2', () => {
    const { state, context, player } = scene();
    const enemy = craftIn(state, 7, 0, 100);
    state.player.statusDisplay.redraw = false;
    // A projectile: no forced roll; t = trunc(768 × 20 ÷ 80) = 192; field rand % 9 = 7: the disturbance at level 1.
    drawNext(state, 2, ([roll, field]) => (roll & 0xff) < 192 && field % 9 === 7);
    applyShotHit(context, projectileOf(state, player.id), enemy, 20, null);
    expect([enemy.combat.subsystems[7], (enemy.movement as SteeredMovementBlock).disturbance]).toEqual([1, { level: 1 }]);
    arm(player, 0, 100, { 3: 2 });
    drawNext(state, 2, ([roll, field]) => (roll & 0xff) < 192 && field % 19 === 3);
    applyShotHit(context, projectileOf(state, enemy.id), player, 20, null);
    expect([player.combat.subsystems[3], state.player.statusDisplay.redraw, state.player.heavyDamage]).toEqual([2, false, -1]);
  });
});

describe('no scaling on these entries (D2, AC-09)', () => {
  it('takes the given damage whatever the difficulty and the craft info\'s hit scale', () => {
    for (const rawDifficulty of [0, 19, 99]) {
      const { state, context, player } = scene({ rawDifficulty });
      expect(state.craftInfo.content.hitDamageScale).not.toBe(1);
      const enemy = craftIn(state, 7, 50, 100);
      applyShotHit(context, projectileOf(state, player.id), enemy, 20, null);
      applyContactDamage(context, enemy, 7, 'collision');
      applyEngagementDamage(context, player, enemy, 3);
      expect(hits(context).map(({ damage, shield }) => [damage, shield.before - shield.after])).toEqual([[20, 20], [7, 7], [3, 3]]);
    }
  });
});

describe('the communications reactions at their call points (CR-13; P3-10 CB-12; D2, D5, RX4)', () => {
  // Pool name 0 is TABL 2001 position 2: a destroyed friendly's message is 20983 index 0x41 + 2, which resolves here.
  const LOST = 0x41 + 2;

  function reactionScene(): Scene {
    const sc = scene();
    const { communications } = sc.state.ruleData;
    const messages = { ...communications.messages, direct: Object.freeze(Array.from({ length: 70 }, () => Object.freeze([1]))) };
    const nameIndexes = { ...communications.nameIndexes, pool: Object.freeze([{ in2001: 2, in2011: null }]) };
    const state: WorldState = { ...sc.state, ruleData: { ...sc.state.ruleData, communications: { ...communications, messages, nameIndexes } } };
    return { state, context: atCollision(registerTick(state, readTickInput(tickInput()))), player: sc.player };
  }
  const radioMessages = (context: TickContext) => context.events.flatMap((event) => (event.type === 'radio-queued' ? [event.message.index] : []));

  it('runs 0x3c208 after the shield\'s draw and before the hull and the hit event: an active craft\'s face is drawn second', () => {
    const { state, context } = scene();
    const enemy = craftIn(state, 7, 50, 100);
    const craft = arm(craftIn(state, 2, 1000, 100), 1000, 100, { 4: 1 });
    const seed = drawNext(state, 1, ([value]) => (value & 0xff) >= 0x54);
    applyShotHit(context, projectileOf(state, enemy.id), craft, 10, IMPACT);
    expect(craft.communications.face).toBe(randValues(seed, 2)[1] % 3);
    expect(craft.communications.threatStamp).toBe(context.time.clock);
    expect(state.rngState).toBe(rngStateAfter(seed, 2));
  });

  it('reads the wingman\'s hull before this hit\'s damage in 0x2a694 and after it in 0x2a5fc', () => {
    for (const contact of [false, true]) {
      const { state, context } = scene();
      const capacity = state.craftInfo.content.craft[1]!.at9C;
      const threshold = Math.trunc((capacity * 30) / 100);
      const wingman = craftIn(state, 1, 0, threshold);
      if (contact) applyContactDamage(context, wingman, 1, 'collision');
      else applyShotHit(context, projectileOf(state, craftIn(state, 7, 50, 100).id), wingman, 1, IMPACT);
      expect(wingman.combat.hull).toBe(threshold - 1);
      expect(state.communications.limits.wingmanLowHull).toBe(contact ? context.time.clock + 0x5a00 : 0);
    }
  });

  it('runs 0x3c0f4 at the destruction before object-destroyed, and once more after a contact kill below 0, not after one at exactly 0', () => {
    for (const [hull, losses] of [[5, 2], [10, 1]] as const) {
      const { state, context } = reactionScene();
      const base = craftIn(state, 17, 0, hull, { name: { type: 'pool', index: 0 } });
      applyContactDamage(context, base, 10, 'collision');
      expect(radioMessages(context)).toEqual(Array.from({ length: losses }, () => LOST));
      const types = context.events.map(({ type }) => type);
      expect(types.indexOf('radio-queued')).toBeLessThan(types.indexOf('object-destroyed'));
    }
  });

  it('passes the player\'s hit and kill of a friendly to 0x3c208 and 0x3c0f4 with attacker kind 1', () => {
    const { state, context, player } = reactionScene();
    const base = craftIn(state, 17, 0, 5, { name: { type: 'pool', index: 0 } });
    applyShotHit(context, projectileOf(state, player.id), base, 10, IMPACT);
    expect(radioMessages(context)).toEqual([4, 5]);
    expect(state.player.communications.limits).toEqual({ friendlyHit: context.time.clock, friendlyKill: context.time.clock });

  });
});
