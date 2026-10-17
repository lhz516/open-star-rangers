import { describe, expect, it } from 'vitest';
import { readCraftInfo, type MissileBodyRecord } from '../../content/rule-data/craft-info.ts';
import { craft, missile, missileBody, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent, MissileEndedEvent, ShotFiredEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { motionStep } from '../rules/flight-motion.ts';
import { referenceFrame } from '../rules/flight-motion.test-support.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import type { MissileEntity } from '../rules/guidance.ts';
import { blankCraftCombat, type Entity, type Matrix3, type MissileCombat, type ObjectState, type SteeredMovementBlock } from '../world/entity-table.ts';
import type { CraftRuleData, WorldRuleData } from '../world/rule-data.ts';
import { addPlayerEntity, entityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';

// P3-07/22: missiles in the formal step (docs/plan/p3/02/spec.md, CR-03, CR-07, CR-08 and CR-09;
// docs/original/formats/executable.md, W11 and H5). A missile keeps its mode-0 block and moves by P3-06's integration
// with its body record; an unguided missile's phase 0 calls `0x21fd8` directly, a homing missile's controls arrive as
// `steer` requests applied in request handling; the fuse runs in the missile's own update on the positions the previous
// movement left, the detonation in request handling, both before this tick's movement. Expectations are worked out
// from the records and positions each test sets, or from P3-06's exact rational reference (referenceFrame) fed the block
// the wiring must have produced; the rules' branches are missiles.test.ts's and the rule modules'. A tick is 2 clock
// units, a step of 1/32 s.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const f = Math.fround;
/** A clock no test reaches. */
const NEVER = 1e9;

/** Missile records: 0 unguided (+0x18 = 0), 1 homing (+0x18 = 2, built-in program record 2). */
const UNGUIDED = 0;
const HOMING = 1;
/** Lifetime +0x44, arming +0x48, detonation delay +0x54 and check interval +0x58 (clock units). */
const LIFETIME = 128;
const ARMING = 8;
const DETONATION_DELAY = 0;
const CHECK_INTERVAL = 2;
/** The proximity fuse radius 4, squared (the load transform of +0x4C). */
const FUSE_RADIUS_SQUARED = 16;
/** The blast: damage +0x5C, full-damage radius +0x60, zero-damage radius +0x64. */
const DAMAGE = 700;
const INNER = 2;
const OUTER = 12;
/** The body record: maximum and reference speed 64 (2 units per tick), ±64 units/s², turn rates 2, turn factor the step. */
const MAXIMUM = 64;
const BODY = { atAC: 2, atB0: 2, atB4: 2, atB8: MAXIMUM, atBC: 64, atC0: 64, atC4: 0, atC8: 1 };
/** Built-in program records 1 and 2: period 8, angle limit 30°, saturation 1. */
const PROGRAM = Object.freeze({ at14: 8, at24: 30, at2C: 1 });
const PROGRAMS = Object.freeze({ 1: PROGRAM, 2: PROGRAM });

const box = (half: number): ShapeBox => ({ lower: at(-half, -half, -half), upper: at(half, half, half) });
/** Radius 0, no boxes: no collision contact and no contact fuse; only the proximity fuse sees such a craft. */
const PLAIN: CollisionShape = { radius: 0, radiusSquared: 0, bounds: box(2), boxes: [], innerBox: null };

interface SceneOptions {
  /** The missile record on the player's only missile mount. */
  readonly missile?: number;
  /** The mount offset, load-transformed. */
  readonly offset?: Vec3;
  /** A shape for every craft kind but the player's. */
  readonly shape?: CollisionShape;
}

/**
 * A quiet world (group 1) whose player is active at the origin facing +z at speed 40, with lock level 4 that never
 * updates, its automatic target selection never due and no energy update; its only mount (list 1) carries `missile`
 * with 2 rounds at `offset`. Every other craft kind has `shape`.
 */
function scene({ missile: weapon = UNGUIDED, offset = at(0, 0, 0), shape = PLAIN }: SceneOptions = {}): { readonly state: WorldState; readonly player: CraftEntity } {
  const base = testState({ group: 1 });
  const info = syntheticCraftInfo();
  info.hitDamageScale = 1;
  const record = {
    body: 0, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0, at44: LIFETIME, at48: ARMING, at54: DETONATION_DELAY,
    at58: CHECK_INTERVAL, at5C: DAMAGE, at60: INNER, at64: OUTER,
  };
  info.missiles = [missile({ ...record, at18: 0 }), missile({ ...record, at18: 2 })];
  info.missileBodies = [missileBody(BODY)];
  info.craft = info.craft.map(() => craft({ at0C: 300, mounts: [mount({ at10: 1, weapon, at0C: 2 })], mountLists: [[], [0], []] }));
  const content = readCraftInfo(info);
  const rules = { range: 1000, rangeSquared: 1_000_000, fuseRadiusSquared: FUSE_RADIUS_SQUARED };
  const ruleData = {
    ...base.ruleData,
    craft: Array.from({ length: 20 }, (_, kindBit): CraftRuleData => ({ shape: kindBit === 0 ? PLAIN : shape, mountOffsets: [offset], parts: 0, debris: [] })),
    missiles: [rules, rules],
    homingPrograms: PROGRAMS,
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content }, ruleData };
  const player = addPlayerEntity(state, {
    position: at(0, 0, 0),
    orientation: IDENTITY,
    movement: craftMovementBlock(0x80, 40, 80),
    combat: { ...blankCraftCombat(), charge: 100, shield: 1000, hull: 1000, nextEnergyClock: NEVER, weapons: buildWeaponBlock(content.craft[0]) },
  }) as CraftEntity;
  player.state = 'active';
  Object.assign(player.combat.weapons.lock, { level: 4, nextUpdateClock: NEVER });
  state.player.targeting = { ...state.player.targeting!, autoTargetDueClock: NEVER };
  return { state, player };
}

/** An active hostile craft of kind 7 at `position`, standing still, with shield 1000. */
function craftAt(state: WorldState, position: Vec3): CraftEntity {
  const entity = state.entities.allocate(entityInit(7, {
    position,
    orientation: IDENTITY,
    movement: craftMovementBlock(0, 48, 96),
    combat: { ...blankCraftCombat(), shield: 1000, hull: 1000, nextEnergyClock: NEVER, weapons: buildWeaponBlock(state.craftInfo.content.craft[7]) },
  })) as CraftEntity;
  entity.state = 'active';
  return entity;
}

/**
 * An unguided missile record 0 of `shooter` at the origin heading +z, with `movement` and `guidance` (G; null before its
 * first callback), in `state`.
 */
function missileAt(
  state: WorldState,
  objectState: ObjectState,
  { shooter = null, movement, guidance = null }: { shooter?: Entity | null; movement: SteeredMovementBlock; guidance?: MissileCombat['guidance'] },
): MissileEntity {
  const entity = state.entities.allocate(entityInit(20, {
    position: at(0, 0, 0),
    orientation: IDENTITY,
    maximumSpeed: MAXIMUM,
    movement,
    presentation: { type: 'missile', missile: UNGUIDED },
    combat: {
      type: 'missile', missile: UNGUIDED, shooter: shooter?.id ?? null, target: null, launchByte: 0, program: 'unguided', detonate: false,
      contact: null, guidance, homing: null,
    } satisfies MissileCombat,
  })) as MissileEntity;
  entity.state = objectState;
  return entity;
}

/** What one formal tick showed of an entity: its pose and block as the movement stage met them, and its pose after. */
interface Frame {
  readonly events: readonly DomainEvent[];
  /** Null when the entity was gone before movement. */
  readonly atMovement: { readonly state: ObjectState; readonly position: Vec3; readonly orientation: Matrix3; readonly block: SteeredMovementBlock } | null;
  readonly after: { readonly position: Vec3; readonly orientation: Matrix3; readonly block: SteeredMovementBlock } | null;
}

/** One formal tick with `commands`; `watched` is captured just before the movement stage and after the tick. */
function step(state: WorldState, commands: readonly Command[] = [], watched: Entity | null = null): Frame {
  const context: TickContext = registerTick(state, readTickInput(tickInput(commands)));
  let atMovement: Frame['atMovement'] = null;
  for (const stage of PIPELINE) {
    context.stage = stage.id;
    if (stage.id === 'movement' && watched !== null && state.entities.get(watched.id) !== undefined) {
      const { state: objectState, position, orientation, movement } = watched;
      atMovement = structuredClone({ state: objectState, position, orientation, block: movement as SteeredMovementBlock });
    }
    stage.run?.(context);
  }
  const after = watched !== null && state.entities.get(watched.id) !== undefined
    ? structuredClone({ position: watched.position, orientation: watched.orientation, block: watched.movement as SteeredMovementBlock })
    : null;
  return { events: context.events, atMovement, after };
}

const FIRE_SECONDARY: Command = { type: 'fire', channel: 'secondary' };
const types = (events: readonly DomainEvent[]): string[] => events.map(({ type }) => type);
const hits = (events: readonly DomainEvent[]): HitEvent[] => events.filter((event): event is HitEvent => event.type === 'hit');
const blockOf = (entity: Entity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;
const bodyOf = (state: WorldState): MissileBodyRecord => state.craftInfo.content.missileBodies[0];
/** One tick's step at the clock the tick ends with. */
const stepAt = (state: WorldState): ReturnType<typeof motionStep> => motionStep(2, state.clock);

/** Fires the player's missile; returns the new missile entity and the launch tick's events. */
function launch(state: WorldState): { readonly missile: MissileEntity; readonly frame: Frame } {
  const frame = step(state, [FIRE_SECONDARY]);
  const shot = frame.events.find((event): event is ShotFiredEvent => event.type === 'shot-fired');
  if (shot === undefined) throw new Error(`no launch: ${JSON.stringify(frame.events)}`);
  return { missile: state.entities.get(shot.entityId) as MissileEntity, frame };
}

/**
 * Asserts that `frame`'s movement of a missile in state 7 was P3-06's mode-0 integration with the missile's body record,
 * on the block the stage met.
 */
function expectIntegrated(state: WorldState, { atMovement, after }: Frame): void {
  if (atMovement?.state !== 'active' || after === null) throw new Error('the missile did not move');
  expect(after).toEqual(referenceFrame(atMovement, bodyOf(state), stepAt(state)));
}

/** The blast damage of H5 at f32 distance `d`, worked out in double precision. */
const blast = (d: number): number => (d > OUTER ? 0 : d < INNER ? DAMAGE : Math.trunc(DAMAGE * (1 - (d - INNER) / (OUTER - INNER))));
/** The blast's distance (H5, H7): the f32 square root of Σ dᵢ × F(dᵢ), every difference and sum in double precision. */
const distance = (a: Vec3, b: Vec3): number =>
  f(Math.sqrt((['x', 'y', 'z'] as const).reduce((sum, axis) => sum + (a[axis] - b[axis]) * f(a[axis] - b[axis]), 0)));

describe('the launch tick (AC-06, CR-08, W11)', () => {
  it('neither moves a missile nor lets it touch anything in its launch tick; from the next it is active and moves', () => {
    // The spawn point (3, 0, 1.25) is strictly inside the box of a craft whose radius covers it: a contact fuse would fire.
    const boxed: CollisionShape = { radius: 2, radiusSquared: 4, bounds: box(1), boxes: [box(1)], innerBox: null };
    const { state } = scene({ offset: at(3, 0, 0), shape: boxed });
    const craft = craftAt(state, at(3, 0, 1.25));
    const { missile, frame } = launch(state);
    // The offset along the player's rows, plus its 40 × 1/32 along row 3; the missile is where it was made.
    expect(types(frame.events)).toEqual(['command-result', 'shot-fired']);
    expect([missile.position, missile.state, missile.combat.guidance]).toEqual([at(3, 0, 1.25), 'presentation-ready', null]);
    expect(blockOf(missile)).toMatchObject({ mode: 'craft', speed: MAXIMUM, commandedSpeed: MAXIMUM, atCommandedSpeed: true });
    // Tick 2: its first callback makes G and asks for state 7, which request handling grants before the movement: it
    // moves 64 × 1/32 along +z. Its fuse waits for the arming (phase 2), so the craft is not touched.
    const next = step(state, [], missile);
    expect([missile.state, missile.position, missile.combat.guidance?.phase]).toEqual(['active', at(3, 0, 3.25), 0]);
    expectIntegrated(state, next);
    expect(hits([...frame.events, ...next.events])).toEqual([]);
    expect(craft.combat.shield).toBe(1000);
  });
});

describe('an unguided missile (H5 phase 0, CR-09)', () => {
  /** An unguided missile of `shooter`'s that has just been made, slower than its maximum (16, arrived). */
  const slowMissile = (state: WorldState, shooter: Entity): MissileEntity =>
    missileAt(state, 'presentation-ready', { shooter, movement: craftMovementBlock(0x20, MAXIMUM, MAXIMUM) });

  it('gets full throttle through 0x21fd8 at phase 0, which that tick\'s mode-0 integration consumes with its body record', () => {
    const { state, player } = scene();
    player.position = at(0, -1000, 0);
    const missile = slowMissile(state, player);
    expect(blockOf(missile)).toMatchObject({ speed: 16, commandedSpeed: 16, atCommandedSpeed: true });
    // Tick 1: G and state 7, then a move at 16 (0.5). Tick 2: phase 0 sets the commanded speed to F(64 × 1) and clears
    // the arrival in the missile's own update; the movement then moves at 16 and speeds up by 64 × 1/32 = 2.
    const frames = Array.from({ length: 5 }, () => step(state, [], missile));
    expect(frames[1].atMovement?.block).toMatchObject({ speed: 16, commandedSpeed: MAXIMUM, atCommandedSpeed: false });
    expect(frames.map(({ after }) => after?.position.z)).toEqual([0.5, 1, 1 + 18 / 32, 1 + 38 / 32, 1 + 60 / 32]);
    expect(blockOf(missile)).toMatchObject({ speed: 24, commandedSpeed: MAXIMUM, atCommandedSpeed: false });
    for (const frame of frames) expectIntegrated(state, frame);
    expect(frames.map(({ after }) => [after?.position.x, after?.position.y])).toEqual(frames.map(() => [0, 0]));
  });

  it('flies straight until its lifetime has run out, then fizzles and leaves', () => {
    const { state, player } = scene();
    player.position = at(0, -1000, 0);
    const missile = slowMissile(state, player);
    // Phase 0 in tick 2 (clock 4) makes the lifetime end at 4 + 128 = 132; the first callback past it is tick 67 (clock
    // 134), which posts the expiry: a fizzle, handled before the movement, so the missile stays where tick 66 left it.
    const events: DomainEvent[] = [];
    while (state.tick < 66) events.push(...step(state).events);
    expect(events).toEqual([]);
    const { position } = missile;
    const ended = step(state, [], missile);
    expect(ended.events).toEqual([{
      type: 'missile-ended', tick: 67, entityId: missile.id, shooterEntityId: player.id, outcome: 'fizzled', position, orientation: IDENTITY,
    } satisfies MissileEndedEvent]);
    expect([missile.state, missile.position, ended.atMovement?.position]).toEqual(['pending-removal', position, position]);
    step(state);
    expect(state.entities.get(missile.id)).toBeUndefined();
  });
});

describe('the fuse and the detonation in the pipeline (H5)', () => {
  it('fuses on the positions the previous movement left and detonates in request handling, before the movement, which consumes the blast\'s shake', () => {
    const { state, player } = scene();
    player.position = at(0, -1000, 0);
    // An armed unguided missile at the origin heading +z at 64 (2 units a tick), its check due, its owner gone, and a
    // standing craft 3.5 behind it: within the fuse radius 4 now, 5.5 away after this tick's move.
    const missile = missileAt(state, 'active', {
      movement: craftMovementBlock(0x80, MAXIMUM, MAXIMUM),
      guidance: {
        phase: 2, lifetimeClock: NEVER, armClock: 0, fuseRadiusSquared: FUSE_RADIUS_SQUARED, detonationClock: DETONATION_DELAY,
        checkInterval: CHECK_INTERVAL, nextCheckClock: 0,
      },
    });
    const victim = craftAt(state, at(0, 0, -3.5));
    // Tick 1 (clock 2): the fuse sees 3.5 < 4 and arms the detonation for the next callback; then the missile moves on.
    const fused = step(state, [], missile);
    expect([fused.events, missile.combat.guidance?.phase, missile.combat.guidance?.detonationClock, missile.position]).toEqual([[], 3, 2, at(0, 0, 2)]);
    // Tick 2 (clock 4): its update posts the expiry, request handling detonates it where tick 1 left it (5.5 from the
    // victim, whose blast damage is 700 × (1 − 3.5 ÷ 10) = 455; from where the move would take it, 7.5, it would be 315).
    const detonated = step(state, [], victim);
    expect(types(detonated.events)).toEqual(['missile-ended', 'explosion-created', 'hit']);
    expect(detonated.events[1]).toMatchObject({ sourceEntityId: missile.id, sourceKindBit: 20, variant: 'missile', stage: 'request-handling', position: at(0, 0, 2) });
    expect(detonated.events[0]).toMatchObject({ entityId: missile.id, outcome: 'detonated', position: at(0, 0, 2) });
    expect(hits(detonated.events)).toMatchObject([{ victimEntityId: victim.id, sourceEntityId: missile.id, cause: 'missile', damage: 455 }]);
    expect(blast(distance(at(0, 0, 2), at(0, 0, -3.5)))).toBe(455);
    // The shake is on the victim's block when the movement meets it: the impulse along the missile's row 3 at
    // F(64 × 0.0125) = 0.8, and timed rotations, as the damage is above 137. The same tick's integration consumes them.
    const shaken = detonated.atMovement!;
    expect(shaken.block.impulse).toEqual({ direction: at(0, 0, 1), magnitude: f(0.8) });
    expect(Object.values(shaken.block.timedRotation).every((rotation) => rotation !== null)).toBe(true);
    expect(shaken.position).toEqual(at(0, 0, -3.5));
    expect(detonated.after).toEqual(referenceFrame(shaken, state.craftInfo.content.craft[7], stepAt(state)));
    // It stands still: the impulse alone moves it, by F(0.8 × 1/32) = F(0.025) along +z, then decays below 0 and ends.
    expect(victim.position).toEqual(at(0, 0, f(-3.5 + f(0.025))));
    expect(victim.orientation).not.toEqual(IDENTITY);
    expect(blockOf(victim).impulse).toBeNull();
    // The missile, now the explosion's held source, is still moved (X9).
    expect([missile.state, missile.position]).toEqual(['destroyed-source', at(0, 0, 4)]);
  });
});

describe('a homing missile (H5, CR-05, CR-09)', () => {
  /** The player's homing missile at a target standing at `target`, launched in tick 1. */
  function homingScene(target: Vec3) {
    const { state, player } = scene({ missile: HOMING });
    const craft = craftAt(state, target);
    state.player.target = craft.id;
    const { missile, frame } = launch(state);
    return { state, player, craft, missile, frame };
  }

  /** Steps until the missile has left, at most `limit` ticks; returns every frame. */
  function flyOut(state: WorldState, missile: Entity, limit = 200): Frame[] {
    const frames: Frame[] = [];
    while (state.entities.get(missile.id) !== undefined && frames.length < limit) frames.push(step(state, [], missile));
    return frames;
  }

  it('is launched at the shooter\'s speed with the target it was fired at', () => {
    const { missile, craft, frame } = homingScene(at(20, 0, 80));
    expect(types(frame.events)).toEqual(['command-result', 'shot-fired']);
    expect(missile.combat).toMatchObject({ program: 'homing', launchByte: 4, target: craft.id });
    // 0x21a3c: speed and commanded speed min(64, the player's 40), arrived, ratio 40 ÷ 64.
    expect(blockOf(missile)).toMatchObject({ speed: 40, commandedSpeed: 40, atCommandedSpeed: true, speedRatio: 0.625 });
  });

  it('applies its install\'s steer requests in the next tick\'s request handling, before that tick\'s movement', () => {
    const { state, missile } = homingScene(at(20, 0, 80));
    const frame = step(state, [], missile);
    // The install posts full throttle (factor 1 × 1: commanded speed F(64 × 1), not arrived), then the steering: the
    // target is to the right (+x) in the missile's plane, so yaw turns toward it (a negative rate about row 2 turns row
    // 3 toward row 1) and pitch is set to F(2 × −1 × 0) = −0.
    const block = frame.atMovement!.block;
    expect(block).toMatchObject({ speed: 40, commandedSpeed: MAXIMUM, atCommandedSpeed: false });
    expect(block.steering.yaw.enabled && block.steering.yaw.rate < 0).toBe(true);
    expect(block.steering.pitch).toEqual({ rate: -0, enabled: true });
    expect(block.steering.roll.enabled).toBe(false);
    expectIntegrated(state, frame);
    expect(frame.after!.orientation[6]).toBeGreaterThan(0);
  });

  it('tracks its target through the steer requests and the shared integration until it detonates on it', () => {
    const { state, player, craft, missile } = homingScene(at(20, 0, 80));
    const frames = flyOut(state, missile);
    const events = frames.flatMap(({ events: tickEvents }) => tickEvents);
    const ended = events.find((event): event is MissileEndedEvent => event.type === 'missile-ended');
    expect(ended).toMatchObject({ entityId: missile.id, shooterEntityId: player.id, outcome: 'detonated' });
    // The proximity fuse fired within 4 of the target, which stood still until the blast shook it; the blast damage is
    // H5's at the detonation distance.
    const d = distance(ended!.position, at(20, 0, 80));
    expect(d).toBeLessThan(4 + 2);
    expect(hits(events)).toMatchObject([{ victimEntityId: craft.id, sourceEntityId: missile.id, cause: 'missile', damage: blast(d) }]);
    // Every move of the flight before the detonation is P3-06's integration of the block the requests left.
    const flight = frames.slice(0, frames.findIndex(({ events: tickEvents }) => tickEvents.includes(ended!)));
    expect(flight.length).toBeGreaterThan(10);
    for (const frame of flight) expectIntegrated(state, frame);
  });

  it('flies straight past the same target without guidance, and fizzles', () => {
    const { state, player } = scene({ missile: UNGUIDED });
    const craft = craftAt(state, at(20, 0, 80));
    state.player.target = craft.id;
    const { missile } = launch(state);
    const events = flyOut(state, missile).flatMap(({ events: tickEvents }) => tickEvents);
    expect(events).toMatchObject([{ type: 'missile-ended', shooterEntityId: player.id, outcome: 'fizzled', position: { x: 0, y: 0 } }]);
    expect(craft.combat.shield).toBe(1000);
  });

  it('stops steering once its target is gone and flies on with its last controls until it fizzles', () => {
    const { state, craft, missile } = homingScene(at(20, 0, 300));
    step(state, [], missile);
    step(state, [], missile);
    craft.state = 'pending-removal';
    // The target leaves in the next tick's request handling; from then on the handler returns without posting, and the
    // proximity fuse skips the player's own side.
    step(state, [], missile);
    expect(state.entities.get(craft.id)).toBeUndefined();
    const steering = structuredClone(blockOf(missile).steering);
    const deadline = (missile.combat.homing as { nextUpdateClock: number }).nextUpdateClock;
    const frames = flyOut(state, missile);
    const events = frames.flatMap(({ events: tickEvents }) => tickEvents);
    expect(events).toMatchObject([{ type: 'missile-ended', outcome: 'fizzled' }]);
    for (const frame of frames.filter(({ atMovement }) => atMovement?.state === 'active')) {
      expect(frame.atMovement!.block.steering).toEqual(steering);
      expectIntegrated(state, frame);
    }
    expect(missile.combat.homing?.nextUpdateClock).toBe(deadline);
  });
});
