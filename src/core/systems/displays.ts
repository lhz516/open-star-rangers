/**
 * The cockpit display step (docs/plan/p3/02/spec.md, CR-07, CR-10 and CR-11; docs/original/formats/executable.md, T7,
 * D9 and D15; docs/original/formats/cockpit.md, instrument types per slot): the run of the `frame-end` stage, where Core
 * reproduces the rule state the original's cockpit gauges write, under fixed conditions and without reading the
 * renderer, viewport or pixels. It runs only in the view modes whose layouts hold the left and right displays, and there
 * in the gauges' record order, where the right display (type 7) comes before the left one (type 6):
 *
 * 1. the right display's target clearing (T7, targeting.ts);
 * 2. the left display by its page, while a player entity exists: the status display (D9, CK-01) when it shows the
 *    status page and field 10 is not 2: first, when the previous status page step flipped the blink phase or `redraw`
 *    is set, the player's fields 1 (hull, with the current phase), 5 (list-1 mounts) and 8 (list-0 mounts) are written,
 *    `redraw` is cleared and `rebuilds` counts the write; then, once the clock is strictly past the blink due clock, the
 *    phase flips, and `phaseFlipped` keeps whether it did. On a menu page without a menu, or on page 5 while no message
 *    plays, page 0 (P3-10, CB-09).
 *
 * 3. the tail warning (type 9, comm-reactions.ts's `checkTail`), in the same views.
 *
 * The communications presentation sub-step (radio.ts) follows in every view mode (CB-09).
 *
 * The original runs these per gauge period and pauses the status page in random flashes at field 10 = 1; Core runs
 * them every tick and ignores the flashes (CR-11, difference 4). The shield overlay is display only.
 */
import { CoreFaultError } from '../errors.ts';
import {
  advanceBlink, clearsIncomingPage, clearsMenuPage, COCKPIT_DISPLAY_VIEW_MODES, hullField, nextCount, showsStatusPage, withStatusFields,
} from '../rules/displays.ts';
import { listStatus } from '../rules/mounts.ts';
import type { LeftPage } from '../world/player-state.ts';
import { checkTail } from './comm-reactions.ts';
import { emit, type PipelineStage, type TickContext } from './pipeline.ts';
import { presentIncoming } from './radio.ts';
import { clearRightDisplayTarget } from './targeting.ts';

/** Writes the left display's page and emits `left-page-changed`: with the command's index, or null for a direct write. */
export function writeLeftPage(context: TickContext, page: LeftPage, commandIndex: number | null): void {
  const display = context.world.player.leftDisplay;
  const previousPage = display.page;
  display.page = page;
  emit(context, { type: 'left-page-changed', tick: context.time.tick, page, previousPage, commandIndex });
}

/** A page write without a command (a flush, an incoming message): `left-page-changed` only when the page changes (CB-03). */
export function setLeftPage(context: TickContext, page: LeftPage): void {
  if (context.world.player.leftDisplay.page !== page) writeLeftPage(context, page, null);
}

/**
 * The left display (type 6) by its page, while a player entity exists: the status display `0x4d0e0` with `0x4d50c`
 * (D9, CK-01: the write first, then the blink timer) on page 0; on pages 2–4 the menu page's handler `0x4da28`, which sets page 0 directly when no menu is built and
 * field 13 is not 2 (comm §7.5; CB-09); on page 5 the incoming page's `0x4dc50`, which does the same when no message
 * plays (D-03 item 3 point 4). Both emit `left-page-changed` without a command.
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
  if (clearsMenuPage(page, player.communications.menu !== null, combat.subsystems)
    || clearsIncomingPage(page, world.communications.channel.phase === 'playing', combat.subsystems)) {
    writeLeftPage(context, 0, null);
    return;
  }
  if (!showsStatusPage(page, combat.subsystems)) return;
  const display = player.statusDisplay;
  if (display.phaseFlipped || display.redraw) {
    combat.subsystems = withStatusFields(combat.subsystems, {
      hull: hullField(combat.hull, craft.at9C, display.blink),
      missileMounts: listStatus(combat.weapons, craft, 1),
      gunMounts: listStatus(combat.weapons, craft, 0),
    });
    display.redraw = false;
    display.rebuilds = nextCount(display.rebuilds, 'displays.rebuilds');
  }
  display.phaseFlipped = advanceBlink(display, context.time.clock);
}

/**
 * The `frame-end` stage: the cockpit display step and the tail warning in the views that have them, then in every view
 * the communications presentation sub-step (radio.ts), last as the original's `0x4e308` ends its frame render (CB-09).
 */
function runFrameEnd(context: TickContext): void {
  if (COCKPIT_DISPLAY_VIEW_MODES.has(context.world.player.viewMode)) {
    clearRightDisplayTarget(context);
    updateLeftDisplay(context);
    checkTail(context);
  }
  presentIncoming(context);
}

/** The `frame-end` stage's run. */
export const frameEndStage: PipelineStage['run'] = runFrameEnd;
