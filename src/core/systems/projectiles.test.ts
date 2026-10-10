import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { gun } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { motionStep } from '../rules/flight-motion.ts';
import { ricochet } from '../rules/hit-tests.ts';
import type { DebrisRuleData } from '../rules/load-transforms.ts';
import { moveLinear } from '../rules/projectile-motion.ts';
import { randValues, rngStateAfter, scriptedRand } from '../rules/rand.test-support.ts';
import { craftInfoContent } from '../world/create-world.test-support.ts';
import type { Entity, FragmentCombat, LinearMovementBlock, Matrix3, ProjectileCombat } from '../world/entity-table.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import { addPlayerEntity, entityInit, expectFault, stillEntityInit, TEST_MODEL, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { registerTick, runTick, type Request, type TickContext } from './pipeline.ts';
import { expireProjectile, hitTestProjectile, updateProjectile } from './projectiles.ts';

// docs/plan/p3/02/spec.md, CR-02, CR-03 and CR-05 to CR-08; docs/original/formats/executable.md, H2–H4 and H8. Every
// expectation is worked out by hand from the shapes, the segments and the rand values set below; rules/hit-tests.test.ts
// covers the geometry and the ricochet's arithmetic, systems/damage.test.ts the damage rule.
//
// The hit tests call hitTestProjectile on a projectile placed after its move; the lifecycle ticks are the formal step,
// whose movement stage moves each projectile and hit-tests it right after (P3-07/35; its pipeline tests are in
// combat-wiring.test.ts).

const CLOCK = 640;
/** Gun 0: damage +0x1C and lifetime +0x24. */
const DAMAGE = 30;
const LIFETIME = 40;
/** Craft kinds of the scene: BOXED with a box (cube 2 in bounds cube 4) and DEBRIS records 0 small, 1 and 2 not; PLAIN without boxes. */
const BOXED = 7;
const PLAIN = 9;

const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const box = (half: number): ShapeBox => ({ lower: at(-half, -half, -half), upper: at(half, half, half) });
const shape = (half: number, boxes: readonly ShapeBox[] = []): CollisionShape => ({ radius: 0, radiusSquared: 0, bounds: box(half), boxes, innerBox: null });
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const PLAYER_AT = at(0, -1000, 0);
/** A shot along z from −6 to 10 through the origin: BOXED's box (and a DEBRIS box) is entered at z = −2, t = 1/4. */
const FROM = at(0, 0, -6);
const TO = at(0, 0, 10);
const ENTRY = { point: at(0, 0, -2), local: at(0, 0, -2), face: 2 as const };

/** The scene's world at CLOCK: gun 0 as above, rule data for every craft kind, and the player active far from y = 0. */
function world(): { readonly state: WorldState; readonly player: CraftEntity } {
  const base = testState();
  const info = craftInfoContent();
  info.guns = [gun({ at1C: DAMAGE, at24: LIFETIME, at28: 0 }), gun({ at28: 0 })];
  const debris = (small: boolean, boxes: readonly ShapeBox[]): DebrisRuleData => ({ weights: at(0, 0, 0), direction: at(0, 0, 1), shape: shape(3, boxes), small });
  const craft = Array.from({ length: 20 }, (_, kindBit): CraftRuleData => ({
    shape: kindBit === BOXED ? shape(4, [box(2)]) : shape(2),
    mountOffsets: base.ruleData.craft[kindBit]?.mountOffsets ?? [],
    parts: 0,
    debris: kindBit === BOXED ? [debris(true, [box(2)]), debris(false, [box(2)]), debris(false, [])] : [],
  }));
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: readCraftInfo(info) }, ruleData: { ...base.ruleData, craft } };
  state.clock = CLOCK;
  const player = addPlayerEntity(state, { position: PLAYER_AT, orientation: IDENTITY }) as CraftEntity;
  player.state = 'active';
  Object.assign(player.combat, { shield: 100, hull: 100, nextEnergyClock: 1e9 });
  return { state, player };
}

const contextOf = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));

/** An active craft of `kindBit` with this shield and hull, unturned. */
function craftAt(state: WorldState, kindBit: number, position: Vec3, shield: number, hull: number): CraftEntity {
  const craft = state.entities.allocate(stillEntityInit(kindBit, { position, orientation: IDENTITY })) as CraftEntity;
  craft.state = 'active';
  // No energy update recharges the shield meanwhile.
  Object.assign(craft.combat, { shield, hull, nextEnergyClock: 1e9 });
  return craft;
}

/** An active gun-0 projectile placed after a move from `from` to `to`, its timer due at `timer`. */
function projectileAt(state: WorldState, from: Vec3, to: Vec3, shooter: number | null, timer: ProjectileCombat['expiry'] = { clock: CLOCK + LIFETIME, firstHitPending: true }): Entity {
  const entity = state.entities.allocate(entityInit(21, {
    position: to,
    orientation: IDENTITY,
    movement: { mode: 'linear', speed: 8, velocity: at(0, 0, 8), previousPosition: from, hitTest: true },
    combat: { type: 'projectile', gun: 0, shooter, expiry: timer },
  }));
  entity.state = 'active';
  return entity;
}

/** An active BOXED fragment with DEBRIS record `debris` and this durability. */
function fragmentAt(state: WorldState, position: Vec3, debris: number, durability: number): Entity {
  const entity = state.entities.allocate(entityInit(24, {
    position,
    orientation: IDENTITY,
    presentation: { type: 'fragment', model: TEST_MODEL, part: debris, display: 'part' },
    movement: { mode: 'spinning', speed: 3, velocity: at(0, 0, 3), spin: 0, spinAxis: 0 },
    combat: { type: 'fragment', sourceKindBit: BOXED, part: debris, debris, durability, explodeOnExpiry: false, expiry: { type: 'at', clock: 1e9 }, handOff: null },
  }));
  entity.state = 'active';
  return entity;
}

const projectileOf = (entity: Entity): ProjectileCombat => entity.combat as ProjectileCombat;
const fragmentOf = (entity: Entity): FragmentCombat => entity.combat as FragmentCombat;
const blockOf = (entity: Entity): LinearMovementBlock => entity.movement as LinearMovementBlock;
const hits = (context: TickContext): HitEvent[] => context.events.filter((event): event is HitEvent => event.type === 'hit');

/** The requests `work` posts in a fresh context, taken by handling them without effect. */
function posted(state: WorldState, work: (context: TickContext) => void): Request[] {
  const context = contextOf(state);
  work(context);
  const requests: Request[] = [];
  context.requests.handle((request) => requests.push(request));
  return requests;
}

/** One formal tick; returns its events. */
const tick = (state: WorldState): readonly DomainEvent[] => runTick(contextOf(state));

/** Sets the world RNG to the first state from `from` whose next `count` rand values `accept` takes. */
function drawNext(state: WorldState, count: number, accept: (values: readonly number[]) => boolean, from = 0): number {
  for (let candidate = from; ; candidate++) {
    if (accept(randValues(candidate, count))) {
      state.rngState = candidate;
      return candidate;
    }
  }
}

describe('the projectile callback 0x259b0 (H2, CR-08, AC-07)', () => {
  it('takes its timer at its first callback, asks for state 7 at once, and expires and leaves once the clock reaches it', () => {
    const { state, player } = world();
    const entity = state.entities.allocate(entityInit(21, { position: at(0, 50, 0), combat: { type: 'projectile', gun: 0, shooter: player.id, expiry: null } }));
    expect(entity.state).toBe('presentation-ready');
    tick(state);
    // The first callback runs at clock 642: due 642 + 40.
    expect([entity.state, projectileOf(entity).expiry]).toEqual(['active', { clock: 682, firstHitPending: true }]);
    while (state.clock < 680) tick(state);
    expect([entity.state, projectileOf(entity).shooter]).toEqual(['active', player.id]);
    tick(state);
    expect([state.clock, entity.state, projectileOf(entity).shooter]).toEqual([682, 'pending-removal', null]);
    tick(state);
    expect(state.entities.get(entity.id)).toBeUndefined();
    expect(projectileOf(entity).expiry).toBeNull();
  });

  it('after a hit, its first state-8 callback makes it due 0x80 later, even past an old due time; then it expires and leaves', () => {
    const { state, player } = world();
    const entity = projectileAt(state, at(0, 50, 0), at(0, 50, 0), player.id, { clock: 600, firstHitPending: true });
    entity.state = 'projectile-hit';
    tick(state);
    expect([entity.state, projectileOf(entity).expiry]).toEqual(['projectile-hit', { clock: 642 + 0x80, firstHitPending: false }]);
    while (state.clock < 642 + 0x80 - 2) tick(state);
    expect(entity.state).toBe('projectile-hit');
    tick(state);
    expect([entity.state, projectileOf(entity).shooter]).toEqual(['pending-removal', null]);
    tick(state);
    expect(state.entities.get(entity.id)).toBeUndefined();
  });

  it('posts the expiry in state 7 only once the timer is due, and nothing in states it has no case for', () => {
    const { state } = world();
    const entity = projectileAt(state, at(0, 50, 0), at(0, 50, 0), null, { clock: CLOCK, firstHitPending: true });
    expect(posted(state, (context) => updateProjectile(context, entity, projectileOf(entity)))).toEqual([{ type: 'expire', entityId: entity.id }]);
    projectileOf(entity).expiry = { clock: CLOCK + 1, firstHitPending: true };
    expect(posted(state, (context) => updateProjectile(context, entity, projectileOf(entity)))).toEqual([]);
    for (const other of ['area-switch', 'destroyed-source', 'awaiting-presentation'] as const) {
      entity.state = other;
      expect(posted(state, (context) => updateProjectile(context, entity, projectileOf(entity)))).toEqual([]);
    }
  });

  it('without a timer posts nothing in states 7 and 8, as the original tests for none, and faults in state 0, which Core never gives it', () => {
    const { state } = world();
    const entity = projectileAt(state, at(0, 50, 0), at(0, 50, 0), null, null);
    for (const other of ['active', 'projectile-hit'] as const) {
      entity.state = other;
      expect(posted(state, (context) => updateProjectile(context, entity, projectileOf(entity)))).toEqual([]);
      expect(projectileOf(entity).expiry).toBeNull();
    }
    entity.state = 'new';
    expectFault(() => updateProjectile(contextOf(state), entity, projectileOf(entity)), 'invariant-violated', 'projectiles.state');
  });

  it('expire (0x25f48) makes it pending removal and lets its shooter go', () => {
    const { state, player } = world();
    const entity = projectileAt(state, at(0, 50, 0), at(0, 50, 0), player.id);
    expireProjectile(contextOf(state), entity, projectileOf(entity), { type: 'expire', entityId: entity.id });
    expect([entity.state, projectileOf(entity).shooter]).toEqual(['pending-removal', null]);
  });
});

describe('a projectile striking a craft (H3, H4, CR-06, AC-08)', () => {

  it('ricochets off a craft whose shield takes the whole damage: hit, state 8, five draws, the shooter kept', () => {
    const { state, player } = world();
    const victim = craftAt(state, BOXED, at(0, 0, 0), 100, 100);
    const shot = projectileAt(state, FROM, TO, player.id);
    state.rngState = 12_345;
    const context = contextOf(state);
    hitTestProjectile(context, shot);
    expect(context.events).toEqual([{
      type: 'hit', tick: context.time.tick, victimEntityId: victim.id, victimKindBit: BOXED, victimPosition: at(0, 0, 0), cause: 'projectile',
      sourceEntityId: shot.id, attacker: { type: 'shooter', entityId: player.id, kindBit: 0 }, damage: DAMAGE, gated: false,
      shield: { before: 100, after: 70 }, hull: { before: 100, after: 100 }, shieldWasEmpty: false, impact: ENTRY, projectile: 'ricochet',
    }]);
    // The shield took it all, with no draw; the ricochet then draws five.
    const bounced = ricochet(at(0, 0, 0), ENTRY, IDENTITY, scriptedRand(randValues(12_345, 5)));
    expect([shot.state, shot.position, shot.orientation, blockOf(shot).velocity]).toEqual(['projectile-hit', ENTRY.point, bounced.orientation, bounced.velocity]);
    expect([blockOf(shot).speed, blockOf(shot).previousPosition, projectileOf(shot).shooter]).toEqual([8, FROM, player.id]);
    expect(state.rngState).toBe(rngStateAfter(12_345, 5));
    expect(state.player.shots.projectileHits).toBe(1);
  });

  it('is removed by a hit whose damage reaches the hull, and lets its shooter go', () => {
    const { state, player } = world();
    craftAt(state, BOXED, at(0, 0, 0), 10, 1000);
    const shot = projectileAt(state, FROM, TO, player.id);
    // 20 hull damage of 1000: the subsystem roll needs a low byte below trunc(768 × 20 ÷ 1000) = 15. One draw, no roll.
    const start = drawNext(state, 1, ([value]) => (value & 0xff) >= 15);
    const context = contextOf(state);
    hitTestProjectile(context, shot);
    expect(hits(context)).toMatchObject([{ shield: { before: 10, after: 0 }, hull: { before: 1000, after: 980 }, impact: ENTRY, projectile: 'removed' }]);
    expect([shot.state, shot.position, blockOf(shot).velocity, projectileOf(shot).shooter]).toEqual(['pending-removal', TO, at(0, 0, 8), null]);
    expect(state.rngState).toBe(rngStateAfter(start, 1));
  });

  it('destroys a craft in the movement stage: hit, then object-destroyed and its explosion, and is removed', () => {
    const { state, player } = world();
    const victim = craftAt(state, BOXED, at(0, 0, 0), 0, 10);
    const shot = projectileAt(state, FROM, TO, player.id);
    const context = contextOf(state);
    hitTestProjectile(context, shot);
    expect(context.events.map(({ type }) => type)).toEqual(['hit', 'object-destroyed']);
    expect(context.events[0]).toMatchObject({ hull: { before: 10, after: -20 }, projectile: 'removed' });
    const [explosion] = state.entities.walk(1 << 22);
    expect([victim.destroyed, victim.state, explosion.combat]).toMatchObject([true, 'destroyed-source', { type: 'explosion', source: victim.id, heldSource: victim.id }]);
    expect([shot.state, state.player.kills[BOXED]]).toEqual(['pending-removal', 1]);
  });

  it('is removed off the player\'s shield, but ricochets off it in view mode 0x11, from the player\'s position without boxes', () => {
    const { state, player } = world();
    const enemy = craftAt(state, PLAIN, at(0, 500, 0), 0, 100);
    const shot = projectileAt(state, at(0, -1000, -6), at(0, -1000, 10), enemy.id);
    state.rngState = 777;
    const removed = contextOf(state);
    hitTestProjectile(removed, shot);
    expect(hits(removed)).toMatchObject([{ victimEntityId: player.id, impact: null, projectile: 'removed' }]);
    expect([shot.state, state.rngState]).toEqual(['pending-removal', 777]);

    const again = projectileAt(state, at(0, -1000, -6), at(0, -1000, 10), enemy.id);
    state.player.viewMode = 0x11;
    const bounced = contextOf(state);
    hitTestProjectile(bounced, again);
    expect(hits(bounced)).toMatchObject([{ victimEntityId: player.id, impact: null, projectile: 'ricochet' }]);
    expect([again.state, again.position, state.rngState]).toEqual(['projectile-hit', PLAYER_AT, rngStateAfter(777, 5)]);
  });

  it('stops at a destroyed craft still in state 7: nothing happens, the shot flies on, and nothing behind is tested', () => {
    const { state, player } = world();
    // The player in its delay before the explosion: destroyed, still in state 7.
    player.destroyed = true;
    const fragment = fragmentAt(state, at(0, -1000, 20), 0, 1200);
    const behind = craftAt(state, PLAIN, at(0, -1000, 30), 50, 50);
    const shot = projectileAt(state, at(0, -1000, -6), at(0, -1000, 40), behind.id + 100);
    state.rngState = 99;
    const context = contextOf(state);
    hitTestProjectile(context, shot);
    expect(context.events).toEqual([]);
    expect([shot.state, shot.position, projectileOf(shot).shooter, state.rngState]).toEqual(['active', at(0, -1000, 40), behind.id + 100, 99]);
    expect([fragmentOf(fragment).durability, behind.combat.shield, player.combat.shield]).toEqual([1200, 50, 100]);
  });

  it('tests only in state 7, and only projectiles', () => {
    const { state, player } = world();
    const victim = craftAt(state, BOXED, at(0, 0, 0), 100, 100);
    const shot = projectileAt(state, FROM, TO, player.id);
    for (const other of ['projectile-hit', 'pending-removal'] as const) {
      shot.state = other;
      const context = contextOf(state);
      hitTestProjectile(context, shot);
      expect(context.events).toEqual([]);
    }
    expect(victim.combat.shield).toBe(100);
    expectFault(() => hitTestProjectile(contextOf(state), victim), 'invariant-violated', 'projectiles.hit-test');
  });
});

describe('a projectile striking a fragment (H3, H4, CR-08, AC-08)', () => {

  it('is removed off a small fragment without a draw; the durability loses the damage, with no event', () => {
    const { state, player } = world();
    const fragment = fragmentAt(state, at(0, 0, 0), 0, 1200);
    const shot = projectileAt(state, FROM, TO, player.id);
    state.rngState = 5;
    const context = contextOf(state);
    hitTestProjectile(context, shot);
    expect(context.events).toEqual([]);
    expect([shot.state, projectileOf(shot).shooter, state.rngState]).toEqual(['pending-removal', null, 5]);
    expect([fragmentOf(fragment).durability, fragmentOf(fragment).explodeOnExpiry]).toEqual([1200 - DAMAGE, false]);
    expect(state.player.shots.projectileHits).toBe(0);
  });

  it('off a fragment whose +0x5C is 0, draws once and ricochets when (rand & 3) = 0, five draws more', () => {
    const { state, player } = world();
    const fragment = fragmentAt(state, at(0, 0, 0), 1, 4000);
    const shot = projectileAt(state, FROM, TO, player.id);
    const start = drawNext(state, 1, ([value]) => (value & 3) === 0);
    hitTestProjectile(contextOf(state), shot);
    const bounced = ricochet(fragment.position, ENTRY, IDENTITY, scriptedRand(randValues(start, 6).slice(1)));
    expect([shot.state, shot.position, blockOf(shot).velocity, state.rngState]).toEqual(['projectile-hit', ENTRY.point, bounced.velocity, rngStateAfter(start, 6)]);
    expect(fragmentOf(fragment).durability).toBe(4000 - DAMAGE);
  });

  it('is removed after that one draw otherwise, and ricochets from the fragment\'s position when its shape has no box', () => {
    const { state, player } = world();
    fragmentAt(state, at(0, 0, 0), 1, 4000);
    const shot = projectileAt(state, FROM, TO, player.id);
    const start = drawNext(state, 1, ([value]) => (value & 3) !== 0);
    hitTestProjectile(contextOf(state), shot);
    expect([shot.state, state.rngState]).toEqual(['pending-removal', rngStateAfter(start, 1)]);

    const { state: other, player: own } = world();
    fragmentAt(other, at(0, 0, 3), 2, 4000);
    const again = projectileAt(other, FROM, TO, own.id);
    drawNext(other, 1, ([value]) => (value & 3) === 0);
    hitTestProjectile(contextOf(other), again);
    expect([again.state, again.position]).toEqual(['projectile-hit', at(0, 0, 3)]);
  });

  it('shoots a fragment down when its durability reaches 0: the fragment explodes at its next callback', () => {
    const { state, player } = world();
    const fragment = fragmentAt(state, at(0, 0, 0), 0, DAMAGE);
    // At 512 units per second, the formal step of 1/32 s moves it from FROM to TO, through the fragment's box.
    const shot = projectileAt(state, FROM, FROM, player.id);
    blockOf(shot).velocity = at(0, 0, 512);
    expect(tick(state)).toEqual([]);
    expect([shot.position, shot.state]).toEqual([TO, 'pending-removal']);
    expect([fragmentOf(fragment).durability, fragmentOf(fragment).explodeOnExpiry, fragmentOf(fragment).expiry]).toEqual([0, true, { type: 'at', clock: 1 }]);
    expect(fragment.state).toBe('active');
    const next = tick(state);
    expect(next).toMatchObject([{ type: 'fragment-expired', entityId: fragment.id, outcome: 'explodes' }]);
    const [explosion] = state.entities.walk(1 << 22);
    expect([fragment.state, explosion.combat]).toMatchObject(['destroyed-source', { source: fragment.id, heldSource: fragment.id }]);
    expect(state.entities.get(shot.id)).toBeUndefined();
  });
});

describe('fast projectiles and the fixed step (H3, H8, AC-08)', () => {
  it('detects a shot whose segment is many times the target\'s size, crossing it with both ends outside', () => {
    const { state, player } = world();
    const victim = craftAt(state, PLAIN, at(0, 0, 0), 0, 1000);
    const context = contextOf(state);
    hitTestProjectile(context, projectileAt(state, at(0, 0, -1000), at(0, 0, 1000), player.id));
    expect(hits(context)).toMatchObject([{ victimEntityId: victim.id, impact: null }]);
  });

  it('counts a shot grazing the box\'s face plane as a hit and one just outside it as a miss', () => {
    const { state, player } = world();
    craftAt(state, BOXED, at(0, 0, 0), 100, 100);
    const graze = contextOf(state);
    hitTestProjectile(graze, projectileAt(state, at(2, 0, -6), at(2, 0, 10), player.id));
    expect(hits(graze)).toMatchObject([{ impact: { point: at(2, 0, -2), face: 2 } }]);
    // Just outside x = 2, yet inside the bounds (cube 4): the coarse test passes, the box test does not.
    const outside = contextOf(state);
    const x = Math.fround(2 + 2 ** -22);
    hitTestProjectile(outside, projectileAt(state, at(x, 0, -6), at(x, 0, 10), player.id));
    expect(hits(outside)).toEqual([]);
  });

  /**
   * A shot along z at 320/s from z = −10, a target (PLAIN, half-size 2) crossing its path along x at 192/s from x = −9.
   * Each step moves the target first, as the walk moves craft before projectiles, then the shot, then tests.
   */
  function crossing(units: number): number[] {
    const { state, player } = world();
    const target = craftAt(state, PLAIN, at(-9, 0, 0), 0, 1000);
    const shot = projectileAt(state, at(0, 0, -10), at(0, 0, -10), player.id);
    blockOf(shot).velocity = at(0, 0, 320);
    const step = motionStep(units, 0);
    const struck: number[] = [];
    for (let index = 1; index <= 64 / units / 16; index++) {
      target.position = at(-9 + 192 * step.seconds * index, 0, 0);
      const moved = moveLinear(shot.position, blockOf(shot), step);
      shot.position = moved.position;
      shot.movement = moved.block;
      const context = contextOf(state);
      hitTestProjectile(context, shot);
      if (hits(context).length > 0) struck.push(index);
    }
    return struck;
  }

  it('tests targets where they stand after their move: one jumping the path between 1/32 s steps is missed, at 1/64 s struck', () => {
    // At 1/32 s the target stands at x = −3 (box −5…−1) while the shot runs z −10…0, then at 3 (box 1…5) for z 0…10.
    // At 1/64 s it stands at 0 (box −2…2) for the third step, z 0…5: the shot starts strictly inside. The rule is the
    // same at both steps; the fixed step alone decides, as the original's frame step does in the original.
    expect(crossing(2)).toEqual([]);
    expect(crossing(1)).toEqual([3]);
  });
});
