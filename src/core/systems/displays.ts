/**
 * The cockpit display step (docs/plan/p3/02/spec.md, CR-07, CR-10 and CR-11; docs/original/formats/executable.md, T7,
 * D9 and D15; docs/original/formats/cockpit.md, instrument types per slot): the run of the `frame-end` stage, where Core
 * reproduces the rule state the original's cockpit gauges write, under fixed conditions and without reading the
 * renderer, viewport or pixels. It runs only in the view modes whose layouts hold the left and right displays, and there
 * in the gauges' record order, where the right display (type 7) comes before the left one (type 6):
 *
 * 1. the right display's target clearing (T7, targeting.ts);
 * 2. the status display (D9), while a player entity exists, the left display shows the status page and field 10 is not
 *    2: once the clock is strictly past the blink due clock, the blink phase flips; when it flipped or `redraw` is set,
 *    the player's fields 1 (hull), 5 (list-1 mounts) and 8 (list-0 mounts) are written and `redraw` is cleared.
 *
 * The original runs these per gauge period and pauses the status page in random flashes at field 10 = 1; Core runs
 * them every tick and ignores the flashes (CR-11, difference 4). The shield overlay is display only.
 */
import { CoreFaultError } from '../errors.ts';
import { advanceBlink, COCKPIT_DISPLAY_VIEW_MODES, hullField, showsStatusPage, withStatusFields } from '../rules/displays.ts';
import { listStatus } from '../rules/mounts.ts';
import type { PipelineStage, TickContext } from './pipeline.ts';
import { clearRightDisplayTarget } from './targeting.ts';

/** The status display `0x4d0e0` with `0x4d50c` (D9). */
function updateStatusDisplay(context: TickContext): void {
  const { world } = context;
  const { player } = world;
  const entity = player.entityId === null ? undefined : world.entities.get(player.entityId);
  if (entity === undefined) return;
  const { combat } = entity;
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (combat.type !== 'craft' || craft === undefined) throw new CoreFaultError('invariant-violated', 'displays.player');
  if (!showsStatusPage(player.leftDisplay.page, combat.subsystems)) return;
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
  updateStatusDisplay(context);
}

/** The `frame-end` stage's run. */
export const frameEndStage: PipelineStage['run'] = runFrameEnd;
