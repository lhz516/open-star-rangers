/**
 * The two launch constructors (docs/plan/p3/02/spec.md, CR-02, CR-03, CR-05, CR-06, CR-08, CR-09;
 * docs/original/formats/executable.md, W11): request handling of a `launch` request (message 8) builds a projectile
 * (`0x25b0c`) or a missile (`0x2b00c`) from the shooter as it is then, counts the player's shot and emits `shot-fired`.
 *
 * The new entity is allocated active, so its own update in the next tick asks for state 7 (CR-08); in this tick it is
 * neither moved nor collision-tested. A launch whose shooter no longer resolves creates nothing, as any request whose
 * subject is gone: the original would read the pose of a cleared handle. The mission-flow gate `0x339cc` on these
 * requests belongs to P3-11 (CR-13).
 */
import { CoreFaultError } from '../errors.ts';
import { missileMaximumSpeed, runtimeKindDefaults } from '../rules/combat-init.ts';
import { motionStep } from '../rules/flight-motion.ts';
import { craftMovementBlock, FULL_THROTTLE } from '../rules/flight-state.ts';
import { applyGuidedLaunchSpeed, linearBlock, linearItem, offsetPosition, scatteredRows, speedOf } from '../rules/movement-builders.ts';
import { RandStream } from '../rules/original-random.ts';
import { PLAYER_KIND_BIT } from '../rules/spawn-schedule.ts';
import { MISSILE_KIND_BIT, PROJECTILE_KIND_BIT, type Entity, type Matrix3, type MissileProgram } from '../world/entity-table.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { emit, type RequestOf, type TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `launch.${site}`);

type GunRequest = Extract<RequestOf<'launch'>, { readonly family: 'gun' }>;
type MissileRequest = Extract<RequestOf<'launch'>, { readonly family: 'missile' }>;

/**
 * The spawn position both constructors compute from the shooter's pose: the mount offset along its rows, the z part
 * lengthened by the shooter's speed times this tick's step (the original's frame step, f32).
 */
function launchPosition(context: TickContext, shooter: Entity, position: Vec3, orientation: Matrix3, request: RequestOf<'launch'>): Vec3 {
  const { world } = context;
  const { seconds } = motionStep(world.config.clockUnitsPerTick, world.clock);
  const { x, y, z } = request.offset;
  return offsetPosition(position, orientation, x, y, z + speedOf(shooter) * seconds);
}

/**
 * `0x25b0c`: the item `0x218e8` makes of the shooter for mode 1 places the projectile; the rows are the item's, or the
 * request's orientation for gun +0x28 ≠ 0. Its block is `linear` at the gun's speed +0x08 with the hit test, the
 * shooter's own velocity not added.
 */
function constructProjectile(context: TickContext, shooter: Entity, request: GunRequest): Entity {
  const { world } = context;
  const gun = world.craftInfo.content.guns[request.gun];
  if (gun === undefined || shooter.movement === null) throw fault('projectile');
  if ((gun.at28 !== 0) !== (request.orientation !== null)) throw fault('orientation');
  const item = linearItem(shooter.position, shooter.orientation, shooter.movement);
  const position = launchPosition(context, shooter, item.position, item.orientation, request);
  const orientation = request.orientation ?? item.orientation;
  return world.entities.allocate({
    kindBit: PROJECTILE_KIND_BIT,
    ...runtimeKindDefaults(),
    presentation: { type: 'projectile', visuals: world.ruleData.inputs.projectileVisuals.id, record: request.gun },
    position,
    orientation,
    maximumSpeed: 0,
    movement: linearBlock({ position, orientation, speed: gun.at08 }, true),
    combat: { type: 'projectile', gun: request.gun, shooter: shooter.id, expiry: null },
  });
}

/**
 * A missile's flight program (CR-02): unguided for an unguided missile or a launch byte below 2, otherwise heat-seeking
 * for missile +0x18 = 1 and homing for any other value.
 */
function program(guided: number, launchByte: number): MissileProgram {
  if (guided === 0 || launchByte < 2) return 'unguided';
  return guided === 1 ? 'heat-seeker' : 'homing';
}

/**
 * `0x2b00c`: the missile's maximum speed is its body record's +0xB8 (the non-craft branch of `0x3060c`); a mode-0 block
 * at throttle 0 when guided, full throttle otherwise (P3-06's build), which a guided missile then sets from the
 * shooter's speed (`0x21a3c`); the shooter's rows, scattered by three draws for missile +0x20 ≠ 0. Its target is the
 * request's when that still resolves (CR-05).
 */
function constructMissile(context: TickContext, shooter: Entity, request: MissileRequest): Entity {
  const { world } = context;
  const { missiles, missileBodies } = world.craftInfo.content;
  const missile = missiles[request.missile];
  const body = missile && missileBodies[missile.body];
  if (missile === undefined || body === undefined) throw fault('missile');
  const maximumSpeed = missileMaximumSpeed(body);
  const movement = craftMovementBlock(missile.at18 !== 0 ? 0 : FULL_THROTTLE, maximumSpeed, body.atB8);
  const position = launchPosition(context, shooter, shooter.position, shooter.orientation, request);
  if (missile.at18 !== 0 && shooter.movement !== null) applyGuidedLaunchSpeed(movement, maximumSpeed, shooter.movement.speed, body.atB8);
  let orientation = shooter.orientation;
  if (missile.at20 !== 0) {
    const rand = new RandStream(world.rngState);
    orientation = scatteredRows(orientation, rand);
    world.rngState = rand.state;
  }
  const target = request.target !== null && world.entities.get(request.target) !== undefined ? request.target : null;
  return world.entities.allocate({
    kindBit: MISSILE_KIND_BIT,
    ...runtimeKindDefaults(),
    presentation: { type: 'missile', missile: request.missile },
    position,
    orientation,
    maximumSpeed,
    movement,
    combat: {
      type: 'missile', missile: request.missile, shooter: shooter.id, target, launchByte: request.launchByte,
      program: program(missile.at18, request.launchByte), detonate: false, contact: null, guidance: null, homing: null,
    },
  });
}

/**
 * Request handling of a `launch` request: the constructor of its family; a player shooter counts its projectile or
 * missile fired (player state +0x38, +0x40); then `shot-fired`.
 */
export function applyLaunchRequest(context: TickContext, request: RequestOf<'launch'>): void {
  const { world } = context;
  const shooter = world.entities.get(request.shooter);
  if (shooter === undefined) return;
  if (shooter.combat.type !== 'craft') throw fault('shooter');
  const entity = request.family === 'gun' ? constructProjectile(context, shooter, request) : constructMissile(context, shooter, request);
  if (shooter.kindBit === PLAYER_KIND_BIT) {
    if (request.family === 'gun') world.player.shots.projectilesFired++;
    else world.player.shots.missilesFired++;
  }
  emit(context, {
    type: 'shot-fired',
    tick: context.time.tick,
    shooterEntityId: shooter.id,
    shooterKindBit: shooter.kindBit,
    shooterPosition: shooter.position,
    entityId: entity.id,
    family: request.family,
    weapon: request.family === 'gun' ? request.gun : request.missile,
    mount: request.mount,
    position: entity.position,
    trigger: request.trigger,
  });
}
