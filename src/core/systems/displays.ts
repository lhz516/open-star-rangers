/**
 * The cockpit display step (docs/plan/p3/02/spec.md, CR-07, CR-10 and CR-11; docs/original/formats/executable.md, T7,
 * D9 and D15; docs/original/formats/cockpit.md, instrument types per slot): the run of the `frame-end` stage, where Core
 * reproduces the rule state the original's cockpit gauges write, under fixed conditions and without reading the
 * renderer, viewport or pixels. It runs only in the view modes whose layouts hold the left and right displays, and there
 * in the gauges' record order, where the right display (type 7) comes before the left one (type 6):
 *
 * 1. the right display's target clearing (T7, targeting.ts);
 * 2. the left display by its page, while a player entity exists: the status display (D9) when it shows the status page
 *    and field 10 is not 2: once the clock is strictly past the blink due clock, the blink phase flips; when it flipped
 *    or `redraw` is set, the player's fields 1 (hull), 5 (list-1 mounts) and 8 (list-0 mounts) are written and
 *    `redraw` is cleared; on a menu page without a menu, page 0 (P3-10, CB-09).
 *
 * The original runs these per gauge period and pauses the status page in random flashes at field 10 = 1; Core runs
 * them every tick and ignores the flashes (CR-11, difference 4). The shield overlay is display only.
 */
import { CoreFaultError } from '../errors.ts';
import { advanceBlink, clearsMenuPage, COCKPIT_DISPLAY_VIEW_MODES, hullField, showsStatusPage, withStatusFields } from '../rules/displays.ts';
import { listStatus } from '../rules/mounts.ts';
import type { LeftPage } from '../world/player-state.ts';
import { emit, type PipelineStage, type TickContext } from './pipeline.ts';
import { clearRightDisplayTarget } from './targeting.ts';

/** Writes the left display's page and emits `left-page-changed`: with the command's index, or null for a direct write. */
export function writeLeftPage(context: TickContext, page: LeftPage, commandIndex: number | null): void {
  const display = context.world.player.leftDisplay;
  const previousPage = display.page;
  display.page = page;
  emit(context, { type: 'left-page-changed', tick: context.time.tick, page, previousPage, commandIndex });
}

/**
 * The left display (type 6) by its page, while a player entity exists: the status display `0x4d0e0` with `0x4d50c`
 * (D9) on page 0; on pages 2–4 the menu page's handler `0x4da28`, which sets page 0 directly when no menu is built and
 * field 13 is not 2 (comm §7.5; CB-09), emitting `left-page-changed` without a command.
 */
function updateLeftDisplay(context: TickContext): void {
  const { world } = context;
  const { player } = world;
  const entity = player.entityId === null ? undefined : world.entities.get(player.entityId);
  if (entity === undefined) return;
  const { combat } = entity;
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (combat.type !== 'craft' || craft === undefined) throw new CoreFaultError('invariant-violated', 'displays.player');
  const { page } = player.leftDisplay;
  if (clearsMenuPage(page, player.communications.menu !== null, combat.subsystems)) {
    writeLeftPage(context, 0, null);
    return;
  }
  if (!showsStatusPage(page, combat.subsystems)) return;
  const display = player.statusDisplay;
  if (!advanceBlink(display, context.time.clock) && !display.redraw) return;
  combat.subsystems = withStatusFields(combat.subsystems, {
    hull: hullField(combat.hull, craft.at9C, display.blink),
    missileMounts: listStatus(combat.weapons, craft, 1),
    gunMounts: listStatus(combat.weapons, craft, 0),
  });
  display.redraw = false;
}

/** The `frame-end` stage: the cockpit display step in the views that have it. */
function runFrameEnd(context: TickContext): void {
  if (!COCKPIT_DISPLAY_VIEW_MODES.has(context.world.player.viewMode)) return;
  clearRightDisplayTarget(context);
  updateLeftDisplay(context);
}

/** The `frame-end` stage's run. */
export const frameEndStage: PipelineStage['run'] = runFrameEnd;
