/**
 * The base interior (docs/plan/p3/02/spec.md, CB-07 §3, CB-08, CB-10 `fullRepair`, CB-11; docs/original/formats/
 * executable.md, BS4–BS9; the rules are rules/base-service.ts's and rules/full-repair.ts's).
 *
 * - **Keys:** commands.ts accepts an available player's `navigate-selection` and `confirm-selection` in the base context
 *   (`0x271e0`) and posts `base-navigate` and `base-confirm` at once (CB-07 §3, CB-08). Request handling applies them to
 *   the base service (sub-commands 1–3); without a player entity they do nothing (`0x38ff4`). Each emits `base-navigated` or
 *   `base-confirmed`, as the original sounds every key, at the ends and on a row needing no service too (BS7); with no
 *   base service (a launch earlier in the same tick) nothing changes and `row` is null.
 * - **Service:** the `base-interior` stage (`0x398ec`) runs the repair, hull and energy steps in that order while a
 *   player entity exists and the committed view is 6; a missing base service then is Core's fault. It reads no
 *   activity, dead flag, docking object or base state (BS8), so the map (view 8) holds every due and a launch ends it.
 *   It emits nothing: the walk's selection sounds are never handled in the original (BS7).
 * - **Full repair:** `fullRepair` applies `0x39820` to a craft. For the player in request handling, each selection
 *   advance emits `weapon-selected` with `commandIndex` null, as only there the original handles its message type 4.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { confirmRow, energyStep, hullStep, navigateCursor, repairStep } from '../rules/base-service.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { BASE_VIEW_MODE } from '../rules/docking.ts';
import { repairFully } from '../rules/full-repair.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { emit, type RequestOf, type TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `base-interior.${site}`);

/** A craft entity with its own craft record (object +0x1C). */
function craftOf(world: WorldState, entity: Entity): [CraftEntity, CraftRecord] {
  if (entity.combat.type !== 'craft') throw fault('combat');
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (craft === undefined) throw fault('record');
  return [entity as CraftEntity, craft];
}

/** `base-navigate` in request handling (sub-commands 1 and 2). */
export function navigateBase(context: TickContext, request: RequestOf<'base-navigate'>): void {
  const { world, time } = context;
  if (world.player.entityId === null) return;
  const service = world.baseService;
  const moved = service !== null && navigateCursor(service, request.direction);
  emit(context, { type: 'base-navigated', tick: time.tick, direction: request.direction, row: service?.cursor ?? null, moved, commandIndex: request.commandIndex });
}

/** `base-confirm` in request handling (sub-command 3); `row` is the cursor and `record` the record it marked. */
export function confirmBase(context: TickContext, request: RequestOf<'base-confirm'>): void {
  const { world, time } = context;
  const { entityId } = world.player;
  if (entityId === null) return;
  const service = world.baseService;
  if (service === null) {
    emit(context, { type: 'base-confirmed', tick: time.tick, row: null, record: null, moved: false, commandIndex: request.commandIndex });
    return;
  }
  const combat = world.entities.get(entityId)?.combat;
  if (combat?.type !== 'craft') throw fault('player');
  const { record, moved } = confirmRow(service, world.ruleData.communications.serviceSelectors, combat.subsystems);
  emit(context, { type: 'base-confirmed', tick: time.tick, row: service.cursor, record, moved, commandIndex: request.commandIndex });
}

/** The `base-interior` stage (module comment). */
export function serviceBase(context: TickContext): void {
  const { world, time } = context;
  const { entityId, viewMode } = world.player;
  if (entityId === null || viewMode !== BASE_VIEW_MODE) return;
  const entity = world.entities.get(entityId);
  const service = world.baseService;
  if (entity === undefined || service === null) throw fault('service');
  const [player, craft] = craftOf(world, entity);
  const rand = new RandStream(world.rngState);
  repairStep(service, time.clock, player, craft, world.ruleData.communications.serviceSelectors);
  hullStep(service, time.clock, player, craft, rand);
  energyStep(service, time.clock, player, craft);
  world.rngState = rand.state;
}

/** `0x39820` on `entity` (module comment); `inRequestHandling` says whether its caller runs in the message loop. */
export function fullRepair(context: TickContext, entity: Entity, inRequestHandling: boolean): void {
  const { world, time } = context;
  const [craftEntity, craft] = craftOf(world, entity);
  const announce = inRequestHandling && world.player.entityId === entity.id;
  repairFully(craftEntity, craft, (list, selection) => {
    if (announce) emit(context, { type: 'weapon-selected', tick: time.tick, entityId: entity.id, list, ...selection, commandIndex: null });
  });
}
