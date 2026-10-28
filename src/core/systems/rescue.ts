/**
 * The loss handling and the rescue (`0x32e14(p)` and `0x67b98`; docs/plan/p3/02/spec.md, ME-03, ME-05, ME-06, ME-10,
 * ME-13; docs/original/formats/executable.md, rescue `0x32e14` and `0x67b98`, P3-11/02). Two callers end a loss that
 * player-loss.ts started: the escape pod's expiry in request handling (destruction.ts, `destroyed`, p = 1) and the
 * beacon's due in the mission flow (mission-flow.ts, `energy`, p = 0), each after its radio flush.
 *
 * - Outside main state 3 nothing happens: a loss in states 4 and 5 neither rescues nor fails, and a destroyed player
 *   stays destroyed until the teardown.
 * - With both rescues used: the mission ends, spawning stops and the third loss latches the failure (mission-flow.ts);
 *   the rescue count stays 2 until the latch captures and clears it.
 * - Otherwise the rescue, in the original's order: the dead flag cleared, `fullRepair` (its selection messages handled
 *   by both callers' message loops, so each advance emits `weapon-selected`), the weapon block `0x2d400`, the resources
 *   `0x3060c` at the sample (one draw, and one energy-page redraw, CK-02), the view and the previous view 0xC; the base selection (one draw, or none) and
 *   the player record's rewrite, then its placement (no draw from a stored point, two from the world default); the
 *   view switch from the old view (leaving the Warp abandons it, MW-09); object state 7 and sub-state 0; the block
 *   rebuilt in mode 0; the communication limits cleared and the count increased; `player-rescued` and its `transition`
 *   (G-02/5 for a destruction, G-02/6 for an energy loss).
 *
 * The rescue keeps the entity and its ID, the activity (a player destroyed while docked stays docked), the Warp fields,
 * the target, the control and targeting state, the counters and every other entity, request, timer and AI controller.
 * Core plays no clip: the media take no time (P3-02 技术决定 2).
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { initialiseResources, rebuildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { countEnergyPageRedraw } from '../rules/displays.ts';
import { RandStream } from '../rules/original-random.ts';
import { replaceRescueRecord, rescueMovementBlock, rescuePoint, selectRescueBase } from '../rules/rescue.ts';
import { PLAYER_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { MovementBlock } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE } from '../world/player-state.ts';
import type { RuntimeRecord } from '../world/spawn-state.ts';
import type { PlayerLoss, WorldState } from '../world/world-state.ts';
import { fullRepair } from './base-interior.ts';
import { clearCommunicationLimits } from './comm-reactions.ts';
import { latch } from './mission-flow.ts';
import { emit, type TickContext } from './pipeline.ts';
import { disableSpawning, matrixOf, placeWorldRecord } from './spawn.ts';
import { commitViewSwitch } from './view-switch.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `rescue.${site}`);

interface RescueSubject {
  readonly player: CraftEntity;
  readonly craft: CraftRecord;
  readonly record: RuntimeRecord;
  readonly movement: MovementBlock;
}

/** The player's craft entity, its craft record, runtime record and movement block; a mission in progress has them. */
function rescueSubject(world: WorldState): RescueSubject {
  const { entityId } = world.player;
  const player = entityId === null ? undefined : world.entities.get(entityId);
  if (player === undefined || player.kindBit !== PLAYER_KIND_BIT || player.combat.type !== 'craft') throw fault('player');
  const craft = world.craftInfo.content.craft[player.kindBit];
  const record = player.source?.collection === 'mission' ? world.spawn.records[player.source.index] : undefined;
  if (craft === undefined || record === undefined) throw fault('record');
  if (player.movement === null) throw fault('movement');
  return { player: player as CraftEntity, craft, record, movement: player.movement };
}

/** `0x32e14(p)` for a loss of kind `loss` (module comment). */
export function resolvePlayerLoss(context: TickContext, loss: PlayerLoss): void {
  const { world, time } = context;
  const { flow, player: state } = world;
  if (flow.mainState !== 3) return;
  if (flow.rescues === 2) {
    world.missionStatus = 'ended';
    disableSpawning(world);
    latch(context, { type: 'third-loss', loss });
    return;
  }
  const { player, craft, record, movement } = rescueSubject(world);
  const rand = new RandStream(world.rngState);
  // 0x67b98.
  player.destroyed = false;
  fullRepair(context, player, true);
  rebuildWeaponBlock(player, craft);
  initialiseResources(player, craft, world.clock, rand);
  countEnergyPageRedraw(state);
  const { base, candidates } = selectRescueBase(world.entities, rand);
  replaceRescueRecord(record, rescuePoint(base));
  const { position, attitude } = placeWorldRecord(world, record, rand);
  world.rngState = rand.state;
  player.position = position;
  player.orientation = matrixOf(attitude);
  player.placementSerial++;
  // `0x67b98`'s view 0xC with previous 0xC (sub-mode unchanged), then the rest of 0x32e14's `0x3f158(0xC, old)`; nothing
  // between reads the view. The shared switch emits `view-switched`; the rescue hides the player's model (P3-12, FS-02).
  const page = commitViewSwitch(context, COCKPIT_VIEW_MODE, COCKPIT_VIEW_MODE);
  state.modelShown = false;
  if (page !== null) emit(context, { type: 'left-page-changed', tick: time.tick, ...page, commandIndex: null });
  player.state = 'active';
  flow.subState = 0;
  player.movement = rescueMovementBlock(movement, player.maximumSpeed, craft.atB8);
  clearCommunicationLimits(world);
  const rescues = flow.rescues === 0 ? 1 : 2;
  flow.rescues = rescues;
  emit(context, {
    type: 'player-rescued',
    tick: time.tick,
    playerEntityId: player.id,
    loss,
    rescues,
    baseEntityId: base?.id ?? null,
    candidates,
    position: player.position,
    orientation: player.orientation,
  });
  emit(context, { type: 'transition', tick: time.tick, gap: loss === 'destroyed' ? 'G-02/5' : 'G-02/6' });
}
