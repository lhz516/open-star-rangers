/**
 * Missiles (docs/plan/p3/02/spec.md, CR-02 and CR-05 to CR-11; docs/original/formats/executable.md, H5): the kind 20
 * callbacks `0x2aa40` (unguided) and `0x2ab00` (homing), the `steer` request (message 0x40000) and a missile's `expire`
 * request (`0x2b408`). The rules are rules/guidance.ts's and rules/steering.ts's; this module calls them in the
 * original's order and owns their requests, the world's RNG and the events. P3-06's float control path `0x21fd8`
 * (rules/flight-control.ts) applies the control blocks, 18's explosion constructor and 15's `0x2a40c` take the blast.
 *
 * The callback, by state:
 * - first callback ('presentation-ready'): G, once, with relative times; a homing missile installs its program
 *   (`0x5dc0c`), whose handler in mode 0 posts its blocks as `steer`; then it asks for state 7 without waiting for the
 *   presentation. `contact` is null for both programs (CR-11 difference 6: the original leaves a homing missile's
 *   stale).
 * - state 7: a homing missile runs its program in mode 1 when it is due (`0x5dcd4`), posting its blocks; then `0x2ac10`,
 *   whose fuse reads the positions the previous tick's movement left. Its phase-0 block for an unguided missile goes
 *   straight to `0x21fd8`, without a request; an expiry posts `expire`.
 * - state 6: a homing missile's release `0x5ddd4` calls the handler in mode 2, then the generic part asks to leave, as
 *   the original's native order is. The steer that call posts is handled before the leave, so its change to the block
 *   and the controller leaves with the missile; it is kept so that the requests and any fault match the original.
 * - any other state: the generic part.
 *
 * In request handling, `steer` applies its block through `0x21fd8` with the missile's body record (object +0x1C) and
 * maximum speed (+0x78). A missile's `expire` (`0x2b408`) emits `missile-ended`, then either detonates (the explosion,
 * then per blast victim in walk order the shake `0x2b628` and `0x2a40c`) or fizzles (pending removal, the shooter and
 * the target let go). The player's camera hook `0x3119c` is the presentation layer's, through `missile-ended` (P3-12).
 */
import type { MissileBodyRecord, MissileRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { missileBodyRecord } from '../rules/combat-init.ts';
import { applyFloatControl, type FloatAxisControl, type FloatControl } from '../rules/flight-control.ts';
import { motionStep } from '../rules/flight-motion.ts';
import {
  advanceGuidance, blastHits, blastShake, initialGuidance, initialHoming, type FuseScene, type MissileEntity, type UnguidedCheckInterval,
} from '../rules/guidance.ts';
import { RandStream } from '../rules/original-random.ts';
import { isHomingUpdateDue, programRecord, runHomingProgram, type HomingCall, type SteeringProgram } from '../rules/steering.ts';
import type { Entity, HomingState, MissileCombat, SteeredMovementBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyShotHit } from './damage.ts';
import { constructExplosion } from './destruction.ts';
import { emit, updateLifecycle, type AxisControl, type ControlBlock, type RequestOf, type TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `missiles.${site}`);

/**
 * Conflict 29 (CR-11), the production choice of an unguided missile's check interval: half of it, as the runtime
 * reading of the f32 at linear address 0x2C (H5, P3-07/31) selects in the measured configuration. updateMissile takes
 * the other value as a parameter.
 */
export const UNGUIDED_CHECK_INTERVAL: UnguidedCheckInterval = 'halved';

function missileRecord(world: WorldState, missile: MissileCombat): MissileRecord {
  const record = world.craftInfo.content.missiles[missile.missile];
  if (record === undefined) throw fault('record');
  return record;
}

/** The record at a missile's object +0x1C, which `0x21fd8` reads: its body record (missile +0x14). */
function bodyRecord(world: WorldState, missile: MissileCombat): MissileBodyRecord {
  const body = missileBodyRecord(world.craftInfo.content, missile.missile);
  if (body === undefined) throw fault('body');
  return body;
}

function missileEntity(entity: Entity, missile: MissileCombat): MissileEntity {
  if (entity.combat !== missile) throw fault('combat');
  return entity as MissileEntity;
}

function homingOf(missile: MissileCombat): HomingState {
  if (missile.homing === null) throw fault('homing');
  return missile.homing;
}

/** A steered block, or null; the steered modes are the only ones `0x21fd8` and `0x2b628` write. */
function steeredBlock(entity: Entity): SteeredMovementBlock | null {
  const block = entity.movement;
  if (block === null || block.mode === 'craft' || block.mode === 'warp') return block;
  throw fault('block');
}

const axisControl = ({ clear, set, value }: AxisControl): FloatAxisControl => (set ? value : clear ? 'clear' : null);

/** Message 0x40000 as `0x21fd8` reads it: rows 1, 2 and 3 are pitch, yaw and roll; a set row wins over its clear. */
function floatControl({ scale, axes: [pitch, yaw, roll], speedFactor }: ControlBlock): FloatControl {
  return { scale, axes: { pitch: axisControl(pitch), yaw: axisControl(yaw), roll: axisControl(roll) }, speedFactor };
}

/** `0x21fd8` on the missile `entity`; a disturbance's draws come from the world's RNG. */
function applyControl(world: WorldState, entity: Entity, missile: MissileCombat, control: ControlBlock): void {
  const rand = new RandStream(world.rngState);
  applyFloatControl(steeredBlock(entity), bodyRecord(world, missile), entity.maximumSpeed, floatControl(control), rand);
  world.rngState = rand.state;
}

/**
 * A homing missile's program record (`0x2ab00`: built-in record 1 or 2 of the world's rule data) and its handler call
 * without the mode, whose target is missile +0x8C while it resolves.
 */
function homingCall(world: WorldState, missile: MissileEntity): readonly [SteeringProgram, Omit<HomingCall, 'mode'>] {
  const { program, launchByte, target } = missile.combat;
  if (program === 'unguided') throw fault('program');
  const call = { program, launchByte, missile, target: target === null ? null : world.entities.get(target) ?? null, clock: world.clock };
  return [world.ruleData.homingPrograms[programRecord(program)], call];
}

function postSteers(context: TickContext, missile: MissileEntity, controls: readonly ControlBlock[]): void {
  for (const control of controls) context.requests.post({ type: 'steer', entityId: missile.id, control });
}

/** The program handler in `mode` (1 update, 2 release), its blocks posted as `steer`; the heat seeker's draw is the world's. */
function runProgram(context: TickContext, missile: MissileEntity, homing: HomingState, mode: 1 | 2): void {
  const { world } = context;
  const [record, call] = homingCall(world, missile);
  const rand = new RandStream(world.rngState);
  const controls = runHomingProgram(homing, record, { ...call, mode }, rand);
  world.rngState = rand.state;
  postSteers(context, missile, controls);
}

/** The first callback in states 0 and 1 (see the module comment). */
function startMissile(context: TickContext, missile: MissileEntity): void {
  const { world, requests } = context;
  const { combat } = missile;
  if (combat.guidance === null) {
    const rules = world.ruleData.missiles[combat.missile];
    if (rules === null || rules === undefined) throw fault('rule-data');
    combat.guidance = initialGuidance(missileRecord(world, combat), rules.fuseRadiusSquared);
    combat.contact = null;
    if (combat.program !== 'unguided') {
      const [record, call] = homingCall(world, missile);
      const rand = new RandStream(world.rngState);
      const { homing, controls } = initialHoming(record, call, rand);
      world.rngState = rand.state;
      combat.homing = homing;
      postSteers(context, missile, controls);
    }
  }
  requests.post({ type: 'set-state', entityId: missile.id, state: 'active' });
}

/** What the fuse reads: the entity table and each craft kind's collision shape. */
function fuseScene(world: WorldState): FuseScene {
  return {
    entities: world.entities,
    shape: (kindBit) => {
      const kind = world.ruleData.craft[kindBit];
      if (kind === null || kind === undefined) throw fault('shape');
      return kind.shape;
    },
  };
}

/** The state-7 callback (see the module comment). */
function flyMissile(context: TickContext, missile: MissileEntity, unguided: UnguidedCheckInterval): void {
  const { world } = context;
  const { combat } = missile;
  if (combat.program !== 'unguided') {
    const homing = homingOf(combat);
    if (isHomingUpdateDue(homing, world.clock)) runProgram(context, missile, homing, 1);
  }
  const action = advanceGuidance(missile, fuseScene(world), world.clock, unguided);
  if (action.type === 'control') applyControl(world, missile, combat, action.control);
  else if (action.type === 'expire') context.requests.post({ type: 'expire', entityId: missile.id });
}

/**
 * A missile's own update, `0x2aa40` or `0x2ab00` by its program (see the module comment). `unguided` is conflict 29's
 * choice, UNGUIDED_CHECK_INTERVAL in production.
 */
export function updateMissile(context: TickContext, entity: Entity, missile: MissileCombat, unguided: UnguidedCheckInterval = UNGUIDED_CHECK_INTERVAL): void {
  const self = missileEntity(entity, missile);
  switch (entity.state) {
    case 'new':
      throw fault('state');
    case 'presentation-ready':
      startMissile(context, self);
      return;
    case 'active':
      flyMissile(context, self, unguided);
      return;
    case 'pending-removal':
      if (missile.homing !== null) runProgram(context, self, missile.homing, 2);
      updateLifecycle(context, entity);
      return;
    default:
      updateLifecycle(context, entity);
  }
}

/** Message 0x40000 in request handling: the block through `0x21fd8` on the missile (H5). */
export function applySteer(context: TickContext, entity: Entity, request: RequestOf<'steer'>): void {
  if (entity.combat.type !== 'missile') throw fault('steer');
  applyControl(context.world, entity, entity.combat, request.control);
}

/** `missile-ended` with the missile's pose; the shooter while it still resolves. */
function emitEnded(context: TickContext, missile: MissileEntity, outcome: 'detonated' | 'fizzled'): void {
  const { shooter } = missile.combat;
  emit(context, {
    type: 'missile-ended',
    tick: context.time.tick,
    entityId: missile.id,
    shooterEntityId: shooter !== null && context.world.entities.get(shooter) !== undefined ? shooter : null,
    outcome,
    position: missile.position,
    orientation: missile.orientation,
  });
}

/**
 * The detonation of `0x2b408`: the explosion (the missile becomes its held source), then each blast victim in walk
 * order, tested as the walk reaches it: the shake on its block at this tick's f32 mission time, then `0x2a40c` without
 * an impact (`hit`, and any destruction).
 */
function detonate(context: TickContext, missile: MissileEntity): void {
  const { world } = context;
  constructExplosion(context, missile);
  const { time } = motionStep(world.config.clockUnitsPerTick, world.clock);
  for (const { victim, damage } of blastHits(missile, world.entities, missileRecord(world, missile.combat))) {
    const block = steeredBlock(victim);
    if (block === null) throw fault('victim');
    const rand = new RandStream(world.rngState);
    blastShake(victim, block, missile, damage, time, rand);
    world.rngState = rand.state;
    applyShotHit(context, missile, victim, damage, null);
  }
}

/**
 * Message 0x10000 on a missile (`0x2b408`): `missile-ended`, then the detonation or the fizzle that `detonate` says. A
 * fizzle (`0x2b590`, `0x21650`) makes it pending removal, lets the shooter go and clears missile +0x8C.
 */
export function expireMissile(context: TickContext, entity: Entity, missile: MissileCombat, _request: RequestOf<'expire'>): void {
  const self = missileEntity(entity, missile);
  emitEnded(context, self, missile.detonate ? 'detonated' : 'fizzled');
  if (missile.detonate) {
    detonate(context, self);
    return;
  }
  entity.state = 'pending-removal';
  missile.shooter = null;
  missile.target = null;
}
