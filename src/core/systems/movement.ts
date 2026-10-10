/**
 * Stage 8, movement (`0x221fc`; docs/plan/p3/06/spec.md, 运动阶段与积分; docs/original/formats/executable.md, movement
 * stage and integration, P3-06/01). Once per tick, after request handling, a live walk over every kind, the player
 * first, moves each entity that is not parked (active and docked ones both move) and is a destroyed source or in state
 * 7 or above. An entity instantiated in this tick's request handling is not yet active, so it first moves in the next
 * tick. Every entity that passes has a movement block (the original has no null test): one without is a fault.
 *
 * The block's mode selects the integrator; the integrators of modes 0 and 3 read no other entity, so the walk order
 * matters only to P3-07's projectile hit test. The pose is the entity's own: the integrator's result replaces its
 * position, attitude and block.
 *
 * P3-07's modes (docs/plan/p3/02/spec.md, CR-03, CR-07 and CR-09; executable.md H1 and H3): `linear` (mode 1,
 * `0x22818`) moves projectiles and explosions, and a block with the hit-test flag (a projectile's) is hit-tested right
 * after its own move, so the craft and missiles before it in the walk are tested where they now stand and the fragments
 * after it where they stood; `spinning` (mode 2, `0x2285c`) moves fragments. The hit test needs the tick context, so
 * the stage passes it in.
 */
import { CoreFaultError } from '../errors.ts';
import { integrateCraft, integrateWarp, motionStep, type MotionRecord, type MotionStep } from '../rules/flight-motion.ts';
import { spinFragment } from '../rules/fragments.ts';
import { moveLinear } from '../rules/projectile-motion.ts';
import { ALL_KINDS, isActiveState, type Entity, type MovementBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';

/** Whether movement moves `entity` this tick: not parked, and a destroyed source or in state 7 or above. */
export function movesThisTick({ activity, state }: Entity): boolean {
  return activity !== 'parked' && (state === 'destroyed-source' || isActiveState(state));
}

/**
 * The record at object +0x1C that the steered modes read: the craft record of the entity's kind. World creation binds
 * every instantiable kind to one (D-01). P3-07 gives a missile its body record here.
 */
function motionRecord(world: WorldState, entity: Entity): MotionRecord {
  const record = world.craftInfo.content.craft[entity.kindBit];
  if (record === undefined) throw new CoreFaultError('invariant-violated', 'movement.record');
  return record;
}

/** The projectile hit test `0x28450` on an entity just moved in mode 1 (P3-07's, systems/projectiles.ts). */
export type HitTest = (entity: Entity) => void;

/**
 * Moves one entity by its block's mode: `craft` (mode 0) and `warp` (mode 3) integrate; `linear` (mode 1) moves, then
 * runs `hitTest` when the block's flag is set, as the original's loop does; `spinning` (mode 2) moves and turns. The
 * switch is exhaustive, so a new variant of MovementBlock does not compile without its case.
 */
function moveEntity(world: WorldState, entity: Entity, block: MovementBlock, step: MotionStep, hitTest: HitTest): void {
  switch (block.mode) {
    case 'craft':
    case 'warp': {
      const integrate = block.mode === 'craft' ? integrateCraft : integrateWarp;
      const moved = integrate({ position: entity.position, orientation: entity.orientation, block }, motionRecord(world, entity), step);
      entity.position = moved.position;
      entity.orientation = moved.orientation;
      entity.movement = moved.block;
      return;
    }
    case 'linear': {
      const moved = moveLinear(entity.position, block, step);
      entity.position = moved.position;
      entity.movement = moved.block;
      if (moved.block.hitTest) hitTest(entity);
      return;
    }
    case 'spinning': {
      const moved = spinFragment(entity.position, entity.orientation, block, step);
      entity.position = moved.position;
      entity.orientation = moved.orientation;
      return;
    }
    default:
      unhandledMode(block);
  }
}

/** Takes a mode moveEntity has no case for, which the types rule out: a new variant fails to compile. */
function unhandledMode(_mode: never): never {
  throw new CoreFaultError('invariant-violated', 'movement.mode');
}

/**
 * Stage 8: moves every entity movesThisTick admits by this tick's fixed step, at this tick's clock, hit-testing with
 * `hitTest` as it goes. An entity the walk meets after a hit test created it (an explosion or fragment of a kill) is
 * new, so it does not move this tick (CR-08).
 */
export function moveEntities(world: WorldState, hitTest: HitTest): void {
  const step = motionStep(world.config.clockUnitsPerTick, world.clock);
  for (const entity of world.entities.walk(ALL_KINDS)) {
    if (!movesThisTick(entity)) continue;
    if (entity.movement === null) throw new CoreFaultError('invariant-violated', 'movement.block');
    moveEntity(world, entity, entity.movement, step, hitTest);
  }
}
