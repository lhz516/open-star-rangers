import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent, ShotFiredEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { motionStep } from '../rules/flight-motion.ts';
import { referenceFrame } from '../rules/flight-motion.test-support.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import type { DebrisRuleData } from '../rules/load-transforms.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import {
  allocatorAiState, blankCraftCombat, type Entity, type EntityInit, type LinearMovementBlock, type Matrix3, type SpinningMovementBlock,
  type SteeredMovementBlock,
} from '../world/entity-table.ts';
import { initialPlayerTargeting } from '../world/player-state.ts';
import type { CraftRuleData, WorldRuleData } from '../world/rule-data.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, TEST_MODEL, TEST_RULE_INPUTS, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';

// P3-07/35: the joint wiring with P3-06 through the formal step (docs/plan/p3/02/spec.md, CR-03, CR-07, CR-08 and
// CR-09; docs/original/formats/executable.md, T3, W8, H1, H3, X9 and E1–E4): the player update's missile lock and
// automatic target selection, the movement stage's linear and spinning modes with the projectile hit test, and the
// parked engagement in the parked update. Every expectation is worked out here from the records and positions each test
// sets; the rules' own branches are their modules' tests. A tick is 2 clock units, a step of 1/32 s.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Heading +x: row 3 = (1, 0, 0). */
const ALONG_X = Object.freeze([0, 1, 0, 0, 0, 1, 1, 0, 0]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const f = Math.fround;
/** A clock no test reaches. */
const NEVER = 1e9;

const box = (half: number): ShapeBox => ({ lower: at(-half, -half, -half), upper: at(half, half, half) });
/** Radius 0 (no collision contact ever), the bounds a cube of half-size `half`, no boxes: the coarse test alone decides hits. */
const plain = (half: number): CollisionShape => ({ radius: 0, radiusSquared: 0, bounds: box(half), boxes: [], innerBox: null });

/** Gun 0: speed 100, rate +0x14 8, cost 5, damage 30, lifetime 40. Missile 0: guided, cooldown 6, lock stages 10 and 20. */
const GUN_SPEED = 100;
const DAMAGE = 30;
const LIFETIME = 40;
/** Every craft record: mount 0 gun 0 (list 0) at offset (1, 0, 0), mount 1 missile 0 with 2 rounds (list 1) at the origin. */
const OFFSETS = [at(1, 0, 0), at(0, 0, 0)];
/** A craft kind with model parts: two small DEBRIS records, so its destruction sheds two fragments. */
const SHEDDING = 9;

function content(change: (info: ReturnType<typeof syntheticCraftInfo>) => void = () => {}) {
  const info = syntheticCraftInfo();
  info.hitDamageScale = 1;
  info.guns = [gun({ at08: GUN_SPEED, at14: 8, at18: 5, at1C: DAMAGE, at24: LIFETIME, at28: 0 })];
  info.missiles = [missile({ body: 0, at18: 1, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0 })];
  const mounts = [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 0, at0C: 2 })];
  info.craft = info.craft.map(() => craft({ at0C: 300, mounts, mountLists: [[0], [1], []] }));
  change(info);
  return readCraftInfo(info);
}

/** A DEBRIS record whose shape is the cube of half-size 2 and whose part starts at its source's centre. */
const DEBRIS: DebrisRuleData = { weights: at(0, 0, 0), direction: at(0, 0, 1), shape: plain(2), small: true };

interface SceneOptions {
  /** The automatic target selection's due clock; by default it never comes, so it adds no event. */
  readonly autoTargetDueClock?: number;
  readonly change?: Parameters<typeof content>[0];
}

/**
 * A quiet world (group 1, speed assist off) whose player is active at the origin facing +z at speed 40, with charge 100
 * and its control and targeting state; every craft kind has the records above and the shape `plain(2)`, SHEDDING its
 * two parts. No energy update runs before NEVER.
 */
function scene({ autoTargetDueClock = NEVER, change }: SceneOptions = {}): { readonly state: WorldState; readonly player: CraftEntity } {
  const base = testState({ group: 1 });
  const info = content(change);
  const ruleData = {
    ...base.ruleData,
    craft: Array.from({ length: 20 }, (_, kindBit): CraftRuleData => ({
      shape: plain(2), mountOffsets: OFFSETS, parts: kindBit === SHEDDING ? 2 : 0, debris: kindBit === SHEDDING ? [DEBRIS, DEBRIS] : [],
    })),
    guns: [{ range: 100, rangeSquared: 10_000 }],
    missiles: [{ range: 100, rangeSquared: 10_000, fuseRadiusSquared: 1 }],
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: info }, ruleData };
  const player = addPlayerEntity(state, {
    position: at(0, 0, 0),
    orientation: IDENTITY,
    movement: craftMovementBlock(0x80, 40, 80),
    combat: { ...blankCraftCombat(), charge: 100, shield: 1000, hull: 1000, nextEnergyClock: NEVER, weapons: buildWeaponBlock(info.craft[0]) },
  }) as CraftEntity;
  player.state = 'active';
  state.player.targeting = { ...state.player.targeting!, autoTargetDueClock };
  return { state, player };
}

/** An active craft of `kindBit` at `position`, standing still unless `moving` (full throttle, 48 units/s along row 3). */
function craftAt(state: WorldState, kindBit: number, position: Vec3, { orientation = IDENTITY, moving = false, shield = 1000, hull = 1000 } = {}): CraftEntity {
  const init: Partial<EntityInit> = { position, orientation, combat: { ...blankCraftCombat(), shield, hull, nextEnergyClock: NEVER, weapons: buildWeaponBlock(state.craftInfo.content.craft[kindBit]) } };
  const entity = state.entities.allocate(entityInit(kindBit, moving ? init : { ...init, movement: craftMovementBlock(0, 48, 96) })) as CraftEntity;
  entity.state = 'active';
  return entity;
}

/** An active gun-0 projectile of `shooter` at `position`, moving at `velocity`, its timer far off. */
function projectileAt(state: WorldState, position: Vec3, velocity: Vec3, shooter: number | null = null): Entity {
  const entity = state.entities.allocate(entityInit(21, {
    position,
    orientation: IDENTITY,
    movement: { mode: 'linear', speed: GUN_SPEED, velocity, previousPosition: at(0, 0, 0), hitTest: true },
    combat: { type: 'projectile', gun: 0, shooter, expiry: { clock: NEVER, firstHitPending: true } },
  }));
  entity.state = 'active';
  return entity;
}

/** An active part-1 fragment of a SHEDDING source on DEBRIS record 0 at `position`, moving at `velocity`. */
function fragmentAt(state: WorldState, position: Vec3, velocity: Vec3): Entity {
  const entity = state.entities.allocate(entityInit(24, {
    position,
    orientation: IDENTITY,
    presentation: { type: 'fragment', model: TEST_MODEL, part: 1, display: 'part' },
    movement: { mode: 'spinning', speed: 0, velocity, spin: 0, spinAxis: 0 },
    combat: { type: 'fragment', sourceKindBit: SHEDDING, part: 1, debris: 0, durability: 1200, explodeOnExpiry: false, expiry: { type: 'at', clock: NEVER }, handOff: null },
  }));
  entity.state = 'active';
  return entity;
}

const FIRE_PRIMARY: Command = { type: 'fire', channel: 'primary' };
const FIRE_SECONDARY: Command = { type: 'fire', channel: 'secondary' };
const types = (events: readonly DomainEvent[]): string[] => events.map(({ type }) => type);
const hits = (events: readonly DomainEvent[]): HitEvent[] => events.filter((event): event is HitEvent => event.type === 'hit');
const shots = (events: readonly DomainEvent[]): ShotFiredEvent[] => events.filter((event): event is ShotFiredEvent => event.type === 'shot-fired');
const linearOf = (entity: Entity): LinearMovementBlock => entity.movement as LinearMovementBlock;
/** F(p + v × 1/32) per axis: one step of a constant velocity, stored to f32 (H1). */
const stepped = (p: Vec3, v: Vec3): Vec3 => at(f(p.x + v.x / 32), f(p.y + v.y / 32), f(p.z + v.z / 32));

describe('the player\'s update (CR-07, T3, W8)', () => {
  it('runs the missile lock before the commands: a fire command launches at the level the lock reached in the same update', () => {
    const { state, player } = scene();
    const target = craftAt(state, 7, at(0, 0, 40));
    state.player.target = target.id;
    // Level 3, its next stage due: the lock at clock 2 reaches level 4 and is next due at 2 + 0x15.
    Object.assign(player.combat.weapons.lock, { level: 3, stageDueClock: 0, nextUpdateClock: 0 });
    const events = constructWorld(state).step(tickInput([FIRE_SECONDARY]));
    const [shot] = shots(events);
    // The launch carries level 4; had the lock run after the command, the launch would carry 3.
    expect(state.entities.get(shot.entityId)?.combat).toMatchObject({ type: 'missile', launchByte: 4, target: target.id, program: 'heat-seeker' });
    expect(player.combat.weapons.lock.nextUpdateClock).toBe(2 + 0x15);
  });

  it('drops a removed target first: the lock finds none and drops to 0, and the automatic selection sees none and selects', () => {
    const { state, player } = scene({ autoTargetDueClock: 0 });
    const gone = craftAt(state, 7, at(0, 0, 40));
    const other = craftAt(state, 8, at(0, 0, 60));
    state.player.target = gone.id;
    Object.assign(player.combat.weapons.lock, { level: 3, stageDueClock: 0, nextUpdateClock: 0 });
    state.entities.remove(gone);
    const events = constructWorld(state).step(tickInput());
    expect(events).toEqual([{
      type: 'target-changed', tick: 1, playerEntityId: player.id, previousTarget: null, target: other.id, targetKindBit: 8, mode: 'enemy',
      origin: 'automatic', commandIndex: null,
    }]);
    expect([state.player.target, player.combat.weapons.lock.level]).toEqual([other.id, 0]);
  });

  it('releases the fire commands\' launches after P3-06\'s requests: a match the later command asked for is handled first', () => {
    const { state, player } = scene();
    // Out of the gun's path, so the shot misses it.
    const target = craftAt(state, 7, at(0, 30, 0));
    state.player.target = target.id;
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY, { type: 'speed', operation: 'match-target' }]));
    expect(types(events)).toEqual(['command-result', 'command-result', 'speed-matched', 'shot-fired']);
    expect((player.movement as SteeredMovementBlock).commandedSpeed).toBe(0);
  });

  it('ends with the automatic selection, after the fire commands\' launches', () => {
    const { state } = scene({ autoTargetDueClock: 0 });
    const enemy = craftAt(state, 7, at(0, 30, 0));
    const events = constructWorld(state).step(tickInput([FIRE_PRIMARY]));
    expect(types(events)).toEqual(['command-result', 'shot-fired', 'target-changed']);
    expect(events[2]).toMatchObject({ origin: 'automatic', target: enemy.id, previousTarget: null });
  });

  it('selects again only once the clock is past 0x40 after its last check, and never without an available player', () => {
    const { state, player } = scene({ autoTargetDueClock: 0 });
    const first = craftAt(state, 7, at(0, 0, 40));
    const second = craftAt(state, 8, at(0, 0, 60));
    const world = constructWorld(state);
    player.state = 'presentation-ready';
    // Tick 1: the player is not available, so its update and the selection do not run; its own update activates it.
    expect(world.step(tickInput())).toEqual([]);
    expect([player.state, state.player.targeting!.autoTargetDueClock]).toEqual(['active', 0]);
    // Tick 2, clock 4: the nearest enemy, due again after 4 + 0x40 = 68.
    expect(world.step(tickInput())).toMatchObject([{ type: 'target-changed', origin: 'automatic', target: first.id }]);
    expect(state.player.targeting!.autoTargetDueClock).toBe(68);
    // It leaves in tick 3's request handling, after the player's update; the right display clears the target at the
    // end of that tick (CR-10). Clock 68 (tick 34) is not past 68; clock 70 is.
    first.state = 'pending-removal';
    const quiet: DomainEvent[] = [];
    while (state.tick < 34) quiet.push(...world.step(tickInput()));
    expect(quiet).toEqual([{ type: 'target-cleared', tick: 3, playerEntityId: player.id, previousTarget: first.id, cause: 'invalid' }]);
    expect(state.player.target).toBeNull();
    expect(world.step(tickInput())).toMatchObject([{ type: 'target-changed', tick: 35, origin: 'automatic', previousTarget: null, target: second.id }]);
    expect(state.player.targeting!.autoTargetDueClock).toBe(70 + 0x40);
  });
});

describe('projectiles in the movement stage (CR-03, CR-08, H1, H3, AC-06, AC-08)', () => {
  it('neither moves nor hit-tests a projectile in its launch tick; from the next it moves by v × step, then hit-tests', () => {
    const { state, player } = scene();
    // The spawn point (1, 0, 1.25) is strictly inside the enemy's bounds x −1…3, y −2…2, z −1…3. Without a shield,
    // the hit reaches the hull and removes the projectile where its move left it.
    const enemy = craftAt(state, 7, at(1, 0, 1), { shield: 0 });
    const world = constructWorld(state);
    const launched = world.step(tickInput([FIRE_PRIMARY]));
    const [shot] = shots(launched);
    const projectile = state.entities.get(shot.entityId)!;
    // Offset (1, 0, 0) plus the player's 40 × 1/32 along row 3, from where it stood before its move.
    expect([shot.position, projectile.position, projectile.state, hits(launched)]).toEqual([at(1, 0, 1.25), at(1, 0, 1.25), 'presentation-ready', []]);
    expect(linearOf(projectile)).toMatchObject({ velocity: at(0, 0, GUN_SPEED), previousPosition: at(1, 0, 1.25), hitTest: true });
    const next = world.step(tickInput());
    // 100 × 1/32 = 3.125 along z; the segment starts inside the bounds, so it hits.
    expect([projectile.position, linearOf(projectile).previousPosition, projectile.state]).toEqual([at(1, 0, 4.375), at(1, 0, 1.25), 'pending-removal']);
    expect(hits(next)).toMatchObject([{
      victimEntityId: enemy.id, sourceEntityId: projectile.id, cause: 'projectile', damage: DAMAGE, attacker: { entityId: player.id }, projectile: 'removed',
    }]);
  });

  it('flies on at constant velocity until its lifetime runs out, then leaves', () => {
    const { state } = scene();
    const world = constructWorld(state);
    const [shot] = shots(world.step(tickInput([FIRE_PRIMARY])));
    const projectile = state.entities.get(shot.entityId)!;
    const path: Vec3[] = [];
    // Its first callback at tick 2 (clock 4) makes it due at 44: it moves in ticks 2 to 21 and expires in tick 22.
    while (state.tick < 22) {
      world.step(tickInput());
      path.push(projectile.position);
    }
    expect(path).toEqual(Array.from({ length: 21 }, (_, index) => at(1, 0, 1.25 + 3.125 * Math.min(index + 1, 20))));
    expect(projectile.state).toBe('pending-removal');
    world.step(tickInput());
    expect(state.entities.get(projectile.id)).toBeUndefined();
  });

  it.each([
    ['crosses the bounds with both ends outside', 0, true],
    ['grazes the bounds\' face plane', 2, true],
    ['passes just outside it', f(2 + 2 ** -22), false],
  ] as const)('hits a target when its one-tick segment %s', (_, x, struck) => {
    const { state, player } = scene();
    player.position = at(0, -1000, 0);
    // Without a shield the hit removes the projectile where its move left it.
    const target = craftAt(state, 13, at(0, 0, 0), { shield: 0 });
    // 64,000 units/s: 2,000 units in one tick, from z = −1000 to 1000, through a target 4 units across.
    const shot = projectileAt(state, at(x, 0, -1000), at(0, 0, 64_000));
    const events = constructWorld(state).step(tickInput());
    expect([shot.position, linearOf(shot).previousPosition]).toEqual([at(x, 0, 1000), at(x, 0, -1000)]);
    expect(hits(events).map(({ victimEntityId }) => victimEntityId)).toEqual(struck ? [target.id] : []);
  });

  it('moves a projectile that has hit (state 8) without testing it again', () => {
    const { state, player } = scene();
    player.position = at(0, -1000, 0);
    const target = craftAt(state, 13, at(0, 0, 0), { shield: 0 });
    const shot = projectileAt(state, at(0, 0, -10), at(0, 0, 640));
    shot.state = 'projectile-hit';
    const events = constructWorld(state).step(tickInput());
    // Its segment z −10…10 crosses the target, which takes nothing.
    expect([shot.position, linearOf(shot).previousPosition, shot.state]).toEqual([at(0, 0, 10), at(0, 0, -10), 'projectile-hit']);
    expect([hits(events), target.combat.hull]).toEqual([[], 1000]);
  });

  it('tests craft where their move this tick left them and fragments where they stood, as the walk moves craft first', () => {
    // A craft moving +x at 48/s from x = −3.5 reaches −2: its bounds x −4…0 cover the shot's x = −1 only after the move.
    const { state, player } = scene();
    player.position = at(0, -1000, 0);
    const mover = craftAt(state, 13, at(-3.5, 0, 0), { orientation: ALONG_X, moving: true });
    const shot = projectileAt(state, at(-1, 0, -10), at(0, 0, 640));
    const events = constructWorld(state).step(tickInput());
    expect(mover.position.x).toBe(-2);
    expect(hits(events).map(({ victimEntityId, sourceEntityId }) => [victimEntityId, sourceEntityId])).toEqual([[mover.id, shot.id]]);

    // A fragment moving +x at 64/s from x = 2.5 leaves for 4.5: its bounds x 0.5…4.5 cover x = 1 only before the move.
    const { state: other, player: own } = scene();
    own.position = at(0, -1000, 0);
    const fragment = fragmentAt(other, at(2.5, 0, 0), at(64, 0, 0));
    const again = projectileAt(other, at(1, 0, -10), at(0, 0, 640));
    constructWorld(other).step(tickInput());
    expect(fragment.position).toEqual(at(4.5, 0, 0));
    expect(fragment.combat).toMatchObject({ durability: 1200 - DAMAGE });
    expect(again.state).toBe('pending-removal');
  });
});

describe('explosions and fragments (CR-03, CR-08, X9)', () => {
  it('moves neither in the tick a hit creates them; from the next, they move, and the destroyed source keeps moving', () => {
    const { state } = scene();
    // Heading +z at 48/s: it moves 1.5 per tick, and its explosion drifts with that speed along its row 3.
    const victim = craftAt(state, SHEDDING, at(0, 50, 0), { moving: true, shield: 0, hull: 1 });
    const shot = projectileAt(state, at(0, 50, -10), at(0, 0, 640));
    const world = constructWorld(state);
    const events = world.step(tickInput());
    // The shot's removal retires it (P3-14 FA-07).
    expect(types(events)).toEqual(['hit', 'object-destroyed', 'object-retired']);
    expect([victim.position, victim.state, shot.state]).toEqual([at(0, 50, 1.5), 'destroyed-source', 'pending-removal']);
    const [explosion] = state.entities.walk(1 << 22);
    const parts = [...state.entities.walk(1 << 24)];
    // Made at the source's position after its move, and left there by this tick's walk, which met them after the hit.
    expect([explosion, ...parts].map(({ position, state: objectState }) => [position, objectState])).toEqual(
      [explosion, ...parts].map(() => [at(0, 50, 1.5), 'presentation-ready']),
    );
    expect(linearOf(explosion)).toMatchObject({ velocity: at(0, 0, 48), hitTest: false });

    const made = [explosion, ...parts].map(({ position, orientation }) => ({ position, orientation }));
    const next = world.step(tickInput());
    expect(types(next)).toEqual(['explosion-started']);
    // The explosion is activated where it was made, then moves; the fragments activate and move with their own push.
    expect(next[0]).toMatchObject({ entityId: explosion.id, position: at(0, 50, 1.5) });
    expect(explosion.position).toEqual(stepped(made[0].position, linearOf(explosion).velocity));
    parts.forEach((part, index) => {
      const block = part.movement as SpinningMovementBlock;
      expect([part.state, part.position]).toEqual(['active', stepped(made[index + 1].position, block.velocity)]);
      if (block.spin !== 0) expect(part.orientation).not.toEqual(made[index + 1].orientation);
    });
    expect(victim.position).toEqual(at(0, 50, 3));
  });

  it('leaves the fragments of a kill out of the collision passes in the tick that made them (AC-06)', () => {
    // A DEBRIS record with a collision radius of 5, so the player touches the fragments once they take part.
    const sphere: CollisionShape = { radius: 5, radiusSquared: 25, bounds: box(5), boxes: [], innerBox: null };
    const { state, player } = scene();
    const ruleData = { ...state.ruleData, craft: state.ruleData.craft.map((kind) => ({ ...kind!, debris: kind!.debris.map(() => ({ ...DEBRIS, shape: sphere })) })) } as WorldRuleData;
    const world: WorldState = { ...state, ruleData };
    const victim = craftAt(world, SHEDDING, at(0, 1, 0), { shield: 0, hull: 1 });
    // The player's own shot, which its hit test therefore skips, through the victim next to it.
    projectileAt(world, at(0, 1, -10), at(0, 0, 640), player.id);
    const core = constructWorld(world);
    const killed = core.step(tickInput());
    expect(hits(killed).map(({ victimEntityId, cause }) => [victimEntityId, cause])).toEqual([[victim.id, 'projectile']]);
    const parts = [...world.entities.walk(1 << 24)];
    expect(parts.map(({ position }) => position)).toEqual([at(0, 1, 0), at(0, 1, 0)]);
    // Next tick they are active and moved, and the player, 1.25 further along z, touches both.
    const next = core.step(tickInput());
    expect(hits(next).map(({ victimEntityId, cause }) => [victimEntityId, cause])).toEqual([[player.id, 'collision'], [player.id, 'collision']]);
  });
});

describe('collision responses in the next movement (CR-09, H6)', () => {
  it('feeds the knock and the timed rotation a contact writes to P3-06\'s integration in the next tick', () => {
    const { state, player } = scene();
    // A craft with a collision radius, head on with the player: they touch in tick 1's collision stage.
    const shape: CollisionShape = { radius: 5, radiusSquared: 25, bounds: box(5), boxes: [], innerBox: null };
    const ruleData = { ...state.ruleData, craft: state.ruleData.craft.map((kind) => ({ ...kind!, shape })) } as WorldRuleData;
    const world: WorldState = { ...state, ruleData };
    const other = craftAt(world, 13, at(3, 0, 1.25), { orientation: Object.freeze([1, 0, 0, 0, -1, 0, 0, 0, -1]) as unknown as Matrix3 });
    const core = constructWorld(world);
    expect(hits(core.step(tickInput())).length).toBeGreaterThan(0);
    const written = [player, other].map((entity) => structuredClone({ position: entity.position, orientation: entity.orientation, block: entity.movement as SteeredMovementBlock }));
    expect(written.map(({ block }) => block.impulse)).not.toContain(null);
    const step = motionStep(2, 4);
    // Apart before tick 2's collisions, which therefore change nothing the integration read.
    core.step(tickInput());
    [player, other].forEach((entity, index) => {
      const want = referenceFrame(written[index], world.craftInfo.content.craft[entity.kindBit], step);
      expect({ position: entity.position, orientation: entity.orientation }).toEqual({ position: want.position, orientation: want.orientation });
    });
  });
});

// The parked engagement (E1–E4, CR-09, AC-11). Every craft record has gun 0 alone among its guns: +0x14 8 and damage 30,
// so elapsed E fires trunc(E × 8 ÷ 64) shots for 30 each, scaled by 1; against kind 14 (friendly, factor 0.9, no class
// roll) the damage is 27 per shot. Shooters keep +0xE0 < 0, so they choose no missile. Kinds 7 and 8 (hostile) never
// roll; kinds 10 and 12 decline at rand % 100 < 90 (E3.1).
const VICTIM = 14;
const perShot = 27;
const damageAfter = (elapsed: number): number => perShot * Math.trunc(elapsed / 8);

/**
 * A quiet parked world at clock 1000 (tick 500): the scene's world with gun 0's range `range`, and its player removed
 * unless `player`, so that without one nothing is inside an active area. The player stands still.
 */
function parkedScene({ range = 100, player = false } = {}): WorldState {
  const { state, player: entity } = scene();
  entity.movement = craftMovementBlock(0, 40, 80);
  if (!player) {
    state.entities.remove(entity);
    Object.assign(state.player, { entityId: null, control: null, targeting: null });
  }
  const world: WorldState = { ...state, ruleData: { ...state.ruleData, guns: [{ range, rangeSquared: range * range }] } };
  Object.assign(world, { tick: 500, clock: 1000 });
  return world;
}

interface ParkedOptions {
  /** Without a target; with one, the target's position plus the offset. */
  readonly position?: Vec3;
  readonly mode?: number;
  readonly target?: Entity | null;
  readonly shield?: number;
  readonly hull?: number;
  readonly lastParkedUpdateClock?: number;
}

/**
 * A parked craft of `kindBit` in state 7. With a target, in AI mode 0 by default, it stands at the target's position
 * plus its offset (1, 0, 0), so its parked travel arrives without a draw (P3-06); without one, AI mode 5, no travel, at
 * `position` (the origin by default).
 */
function parkedAt(state: WorldState, kindBit: number, { position = at(0, 0, 0), mode, target = null, shield = 5000, hull = 1000, lastParkedUpdateClock = 0 }: ParkedOptions = {}): CraftEntity {
  const offset = at(1, 0, 0);
  const entity = state.entities.allocate(entityInit(kindBit, {
    activity: 'parked',
    movement: null,
    position: target === null ? position : at(target.position.x + 1, target.position.y, target.position.z),
    orientation: IDENTITY,
    ruleInputs: TEST_RULE_INPUTS,
    ai: { ...allocatorAiState(), mode: (mode ?? (target === null ? 5 : 0)) as never, target: target?.id ?? null, targetOffset: target === null ? at(0, 0, 0) : offset },
    combat: { ...blankCraftCombat(), shield, hull, nextEnergyClock: NEVER, weapons: buildWeaponBlock(state.craftInfo.content.craft[kindBit]) },
    lastParkedUpdateClock,
  })) as CraftEntity;
  entity.state = 'active';
  return entity;
}

/** One formal tick; `before` runs just before the stage of each of its IDs. Returns the tick's events. */
function stepWith(state: WorldState, before: Readonly<Record<string, (context: TickContext) => void>> = {}): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    before[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

const parkedHits = (events: readonly DomainEvent[]): [number, number, number, number][] =>
  hits(events).filter(({ cause }) => cause === 'parked').map((hit) => [hit.tick, hit.attacker.type === 'shooter' ? hit.attacker.entityId : -1, hit.victimEntityId, hit.damage]);

/** Sets the world RNG to the first state whose next `count` rand values `accept` takes. */
function drawNext(state: WorldState, count: number, accept: (values: readonly number[]) => boolean): void {
  for (let candidate = 0; ; candidate++) {
    if (accept(randValues(candidate, count))) {
      state.rngState = candidate;
      return;
    }
  }
}

describe('the parked engagement in the parked update (CR-09, E1–E4, AC-11)', () => {
  it('engages each due object after its parked travel, its draws between that object\'s own and the next object\'s', () => {
    const state = parkedScene();
    const victim = parkedAt(state, VICTIM);
    // Walk order 10, 12, 14. Draws: 10's due check and class roll, 12's due check and class roll, 14's due check (no
    // roll, and mode 5 gives it neither travel nor target). 10 engages (roll % 100 ≥ 90), 12 declines (< 90).
    const first = parkedAt(state, 10, { target: victim });
    const second = parkedAt(state, 12, { target: victim });
    drawNext(state, 5, ([, firstRoll, , secondRoll]) => firstRoll % 100 >= 90 && secondRoll % 100 < 90);
    let start = state.rngState;
    const events = stepWith(state, { 'parked-update': () => void (start = state.rngState) });
    // Elapsed 1002: 125 shots; the victim's shield takes all 3375, drawing nothing.
    expect(events).toEqual([{
      type: 'hit', tick: 501, victimEntityId: victim.id, victimKindBit: VICTIM, victimPosition: at(0, 0, 0), victimForward: at(0, 0, 1), victimSpeed: null,
      cause: 'parked', sourceEntityId: null,
      attacker: { type: 'shooter', entityId: first.id, kindBit: 10 }, damage: damageAfter(1002), gated: false,
      shield: { before: 5000, after: 5000 - 3375 }, hull: { before: 1000, after: 1000 }, shieldWasEmpty: false, impact: null, projectile: null,
    }]);
    expect(damageAfter(1002)).toBe(3375);
    expect(state.rngState).toBe(rngStateAfter(start, 5));
    expect([first, second, victim].map(({ lastParkedUpdateClock }) => lastParkedUpdateClock)).toEqual([1002, 1002, 1002]);
    expect([first, second, victim].map(({ combat }) => combat.nextEnergyClock)).toEqual([1002, NEVER, 1002]);
  });

  it('engages after a parked travel that has just made the object leave the world (E1)', () => {
    const state = parkedScene();
    // Beyond the exit bounds (±44,900): arriving there, the shooter leaves the world.
    const victim = parkedAt(state, VICTIM, { position: at(45_000, 0, 0) });
    const shooter = parkedAt(state, 7, { target: victim });
    const events = stepWith(state);
    expect(types(events)).toEqual(['object-left-world', 'hit']);
    expect(events[0]).toMatchObject({ entityId: shooter.id });
    expect(parkedHits(events)).toEqual([[501, shooter.id, victim.id, damageAfter(1002)]]);
    expect(shooter.state).toBe('pending-removal');
  });

  it('removes a parked victim it destroys without an explosion, and the walk then skips it, as shooter or as target', () => {
    const state = parkedScene();
    const hostile = parkedAt(state, 9, { position: at(500, 0, 0) });
    const victim = parkedAt(state, VICTIM, { shield: 0, hull: 100 });
    // The victim would itself engage kind 9 later in the walk.
    Object.assign(victim.ai, { mode: 0, target: hostile.id, targetOffset: at(1, 0, 0) });
    victim.position = at(501, 0, 0);
    const killer = parkedAt(state, 7, { target: victim });
    const late = parkedAt(state, 8, { target: victim });
    late.position = at(502, 0, 0);
    const events = stepWith(state);
    expect(types(events)).toEqual(['hit', 'object-destroyed']);
    expect(parkedHits(events)).toEqual([[501, killer.id, victim.id, damageAfter(1002)]]);
    expect(events[1]).toMatchObject({ entityId: victim.id, outcome: 'removed' });
    // Kind 8's gate finds no hull; the victim, destroyed and pending removal, is not updated.
    expect([victim.state, victim.lastParkedUpdateClock, late.combat.nextEnergyClock, hostile.combat.shield]).toEqual(['pending-removal', 0, NEVER, 5000]);
    expect([...state.entities.walk(1 << 22)]).toEqual([]);
    // Its own update asks to leave at the next tick, whose energy stage runs the killer's update the engagement made due.
    expect(stepWith(state)).toMatchObject([{ type: 'energy-depleted', entityId: killer.id }]);
    expect(state.entities.get(victim.id)).toBeUndefined();
  });

  it('settles each parked stretch once: no engagement while active, the target kept, the elapsed time spanning the active stretch', () => {
    // A range no position here exceeds, so the travel's random offsets do not matter.
    const state = parkedScene({ range: 100_000, player: true });
    state.player.targeting = { ...initialPlayerTargeting(), autoTargetDueClock: NEVER };
    const victim = parkedAt(state, VICTIM, { position: at(20_000, 0, 0) });
    const shooter = parkedAt(state, 7, { target: victim, lastParkedUpdateClock: 362 });
    const events: DomainEvent[] = [];
    const run = (last: number, change: () => void = () => {}): void => {
      change();
      while (state.tick < last) events.push(...stepWith(state));
    };
    // Tick 501 (clock 1002): elapsed 640. Tick 502 moves it inside the active area (a stand-in for its travel): the area
    // check switches it at 502, its update leaves parking at 503 and it is active from 504.
    run(501);
    run(503, () => void (shooter.position = at(100, 0, 0)));
    expect([shooter.activity, shooter.state]).toEqual(['active', 'presentation-ready']);
    run(600);
    expect(shooter.activity).toBe('active');
    // Moved outside at 601, it parks at 602 and is active again at 603 (clock 1206), when its parked update is due.
    run(603, () => void (shooter.position = at(20_000, 0, 0)));
    expect(parkedHits(events)).toEqual([[501, shooter.id, victim.id, damageAfter(640)], [603, shooter.id, victim.id, damageAfter(1206 - 1002)]]);
    expect([shooter.activity, shooter.lastParkedUpdateClock, shooter.ai.target]).toEqual(['parked', 1206, victim.id]);
  });
});
