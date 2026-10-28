/**
 * Energy (docs/plan/p3/02/spec.md, CR-05, CR-06, CR-07 and CR-09; docs/original/formats/executable.md, D10, D14 and
 * D15): the `energy` and `damage-report` commands and the run of the `energy` stage (`0x30590`). The arithmetic is
 * rules/energy.ts's, the page changes rules/displays.ts's.
 *
 * Commands, after the common pre-judgement: `open` and `damage-report` switch the left display between the status page
 * and the energy page, written at once (the original writes it in the same frame's message loop, where no rule reads
 * the page in between). The level keys act only on the energy page: a level change rewrites the levels and E, then
 * recomputes the maximum speed from the live E, T and field 2 (`0x30e0c`) and applies it to the commanded speed
 * (`0x21d88`), both P3-06's rules (CR-09). An accepted command's `left-page-changed` or `energy-allocation-changed`
 * follows its result.
 *
 * The stage updates the player first, unless docked, whatever its state or dead flag, with its movement block; then the
 * craft kinds 0xffffe in walk order, skipping docked ones: a parked one in any state without a block, an active one
 * only in state 7 or above with its block. An update runs once the clock reaches its due clock (D14). A depleted update
 * clamps the energy to 0 and locks the movement block it was passed (`0x21ba0`), at every such update; for the player
 * P3-11's `0x33464` (player-loss.ts) follows there, after this update's events (CR-13, ME-09). `energy-depleted`
 * marks only the transition: the latch is set by a depleted update and cleared by one that ends with energy above 0.
 * The original's energy-page redraw flag +0x44 is cleared by the drawing, so Core counts its sets for the player instead
 * (CK-02): every due player update, whether or not a value changed, and every accepted level change; a refused key sets
 * nothing. The typed cheat that multiplies a parked object's interval by 8 does not exist in Core.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { craftMaximumSpeed } from '../rules/combat-init.ts';
import { countEnergyPageRedraw, ENERGY_PAGE, pageChange } from '../rules/displays.ts';
import {
  applyEnergyUpdate, BLOCK_ENERGY_INTERVAL, BLOCKLESS_ENERGY_INTERVAL, changeAllocation, lockMovement, PLAYER_ENERGY_INTERVAL, type Allocation,
} from '../rules/energy.ts';
import { applyRecomputedMaximum } from '../rules/flight-state.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { isActiveState, type CraftCombat, type Entity, type SteeredMovementBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { combatCommandPlayer, emitCommandResult, type CommandOf } from './commands.ts';
import { emit, type PipelineStage, type TickContext } from './pipeline.ts';
import { startBeaconWait } from './player-loss.ts';

/** The craft kinds the stage updates after the player: kind bits 1–19. */
const OTHER_ENERGY_KINDS = 0xffffe;

const ACCEPTED = Object.freeze({ outcome: 'accepted', reason: null } as const);

/** The allocation and step of each level key: `S`/`s` the shield's L1, `G`/`g` the charge's L2. */
const LEVEL_KEYS: Readonly<Record<'shield-increase' | 'shield-decrease' | 'gun-increase' | 'gun-decrease', readonly [Allocation, 1 | -1]>> = Object.freeze({
  'shield-increase': ['shield', 1],
  'shield-decrease': ['shield', -1],
  'gun-increase': ['charge', 1],
  'gun-decrease': ['charge', -1],
});

/** A craft's combat state; anything else is a broken invariant. */
function craftCombat({ combat }: Entity): CraftCombat {
  if (combat.type !== 'craft') throw new CoreFaultError('invariant-violated', 'energy.craft');
  return combat;
}

/** A craft's record; world creation binds every instantiable kind to one. */
function craftRecord(world: WorldState, entity: Entity): CraftRecord {
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (craft === undefined) throw new CoreFaultError('invariant-violated', 'energy.record');
  return craft;
}

/** A craft's movement block, steered (CR-03), or null without one. */
function steeredBlock({ movement }: Entity): SteeredMovementBlock | null {
  if (movement === null || movement.mode === 'craft' || movement.mode === 'warp') return movement;
  throw new CoreFaultError('invariant-violated', 'energy.movement');
}

/**
 * Judges an `energy` or `damage-report` command (D10, D15) after the common pre-judgement: a page command moves
 * between pages 0 and 1, `no-change` at its target page and `wrong-context` on pages 2–6; a level key needs the energy
 * page (`wrong-context` elsewhere) and a new level within 0–3 (`no-change` otherwise).
 */
export function judgeEnergyCommand(context: TickContext, command: CommandOf<'energy' | 'damage-report'>, commandIndex: number): void {
  const { world } = context;
  const tick = context.time.tick;
  const player = combatCommandPlayer(context);
  if (typeof player === 'string') {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: player });
    return;
  }
  const { leftDisplay } = world.player;
  if (command.type === 'damage-report' || command.operation === 'open') {
    const page = pageChange(leftDisplay.page, command.type === 'damage-report' ? 'damage-report' : 'open');
    if (typeof page === 'string') {
      emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: page });
      return;
    }
    const previousPage = leftDisplay.page;
    leftDisplay.page = page;
    emitCommandResult(context, command, commandIndex, ACCEPTED);
    emit(context, { type: 'left-page-changed', tick, page, previousPage, commandIndex });
    return;
  }
  if (leftDisplay.page !== ENERGY_PAGE) {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: 'wrong-context' });
    return;
  }
  const combat = craftCombat(player);
  const craft = craftRecord(world, player);
  const [allocation, delta] = LEVEL_KEYS[command.operation];
  if (!changeAllocation(combat, craft, allocation, delta)) {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: 'no-change' });
    return;
  }
  player.maximumSpeed = craftMaximumSpeed(player.kindBit, craft, combat);
  applyRecomputedMaximum(steeredBlock(player), player.maximumSpeed);
  countEnergyPageRedraw(world.player);
  emitCommandResult(context, command, commandIndex, ACCEPTED);
  emit(context, {
    type: 'energy-allocation-changed', tick, entityId: player.id, shieldLevel: combat.shieldLevel, chargeLevel: combat.chargeLevel, commandIndex,
  });
}

/**
 * One craft's energy update once due (`0x3071c` for the player, `0x30994` for the others): dt is the u32 difference
 * from the last update read as i32; `block` is the movement block the stage passes, which the player's speed cost reads
 * and a depleted update locks. The next update is due PLAYER_ENERGY_INTERVAL after the clock for the player, otherwise
 * BLOCK_ENERGY_INTERVAL with a block and BLOCKLESS_ENERGY_INTERVAL without.
 */
function updateEnergy(context: TickContext, entity: Entity, block: SteeredMovementBlock | null, player: boolean): void {
  const { world } = context;
  const { clock } = context.time;
  const combat = craftCombat(entity);
  if (clock < combat.nextEnergyClock) return;
  const dt = toInt32(clock - combat.lastEnergyClock);
  combat.lastEnergyClock = clock;
  const depleted = applyEnergyUpdate(combat, craftRecord(world, entity), dt, player ? { commandedSpeed: block?.commandedSpeed ?? null } : null);
  if (depleted) {
    if (block !== null) lockMovement(block);
    if (!combat.depleted) emit(context, { type: 'energy-depleted', tick: context.time.tick, entityId: entity.id, kindBit: entity.kindBit, position: entity.position });
    if (player) startBeaconWait(context, entity);
  }
  combat.depleted = depleted;
  const interval = player ? PLAYER_ENERGY_INTERVAL : block === null ? BLOCKLESS_ENERGY_INTERVAL : BLOCK_ENERGY_INTERVAL;
  const next = clock + interval;
  if (!Number.isSafeInteger(next)) throw new CoreFaultError('budget-exhausted', 'energy.next-clock');
  combat.nextEnergyClock = next;
  if (player) countEnergyPageRedraw(world.player);
}

/** The `energy` stage (`0x30590`, D14): the player first, then the other craft in walk order. */
function runEnergyStage(context: TickContext): void {
  const { world } = context;
  const { entityId } = world.player;
  const player = entityId === null ? undefined : world.entities.get(entityId);
  if (player !== undefined && player.activity !== 'docked') updateEnergy(context, player, steeredBlock(player), true);
  for (const entity of world.entities.walk(OTHER_ENERGY_KINDS)) {
    if (entity.activity === 'parked') updateEnergy(context, entity, null, false);
    else if (entity.activity === 'active' && isActiveState(entity.state)) updateEnergy(context, entity, steeredBlock(entity), false);
  }
}

/** The `energy` stage's run. */
export const energyStage: PipelineStage['run'] = runEnergyStage;
