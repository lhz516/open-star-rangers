/**
 * The communications menu's command judgement (docs/plan/p3/02/spec.md, CB-02 row 1, CB-03 and CB-07;
 * docs/original/formats/comm.md §7; docs/original/formats/executable.md, CD1). The player's update (flight-control.ts)
 * hands P3-10's commands to judgeCommand before its own flight actions, as the original's flight key handler `0x264a0`
 * calls the menu handler `0x27b44` before its compare tree; commands.ts routes them here. Each gets exactly one result,
 * and what it writes (menu, page, communications partner, docking wait) is what the next command of the batch reads
 * (CB-17 decision 8). The context, and the near-menu gate's view, are those of the batch's effective view
 * (flight-control.ts), so the commands after an accepted `launch` are judged in flight.
 *
 * 1. Without an available player, `player-unavailable`.
 * 2. Outside the flight context, `wrong-context`: the base, map and Warp keys never reach `0x27b44`, and a menu there is
 *    kept as it is, shown again when its page returns (comm §7.6). So are `navigate-selection` and `launch` in flight.
 *    commands.ts judges an available player's base keys `navigate-selection`, `confirm-selection` and `launch` before
 *    this module; the map's `confirm-selection` is `wrong-context` like its other selection keys, as the map's keys have
 *    no digits, Enter or menu navigation (P3-09, MW-04).
 * 3. On a menu page (2–4), `select-number n` is the key n and `communications close` the key `x`; the first item whose
 *    folded key matches is chosen, otherwise `no-candidate`; `communications open` is `no-change` (the original's `c`
 *    matches no item and falls through to the flight tree). A chosen item releases the menu (`menu` := null), then:
 *    - the exit, at any level, closes: the page returns to the saved page;
 *    - a category builds its object list: empty closes; one object skips to its command menu; more show page 3;
 *    - an object becomes the communications partner and its command menu is built: page 4, or a close when it fails;
 *    - a command posts `deliver-command` to the partner when it still resolves (`0x2c7fc`), returns to the saved page
 *      and, for code 9, starts the docking wait whether or not it posted (`0x333b4`).
 * 4. Off the menu pages, `communications open` is `subsystem-disabled` while field 13 is 2 (the original does not
 *    consume `c`). Otherwise it clears the partner, saves the page and replaces any dormant menu by the category menu
 *    (comm §7.2): without a category to show that is no menu, `no-candidate`, and the page stays; otherwise page 2. `communications close` is `no-change`;
 *    `select-number` keeps P3-05's `wrong-context`.
 *
 * Every accepted command writes the page once and emits `left-page-changed` with its command index right after its
 * result (message 0x100000), then `docking-requested` for code 9. Requests are posted at once, ahead of the update's
 * control requests (CB-08); request handling then writes the delivered command into its receiver (deliverCommand). The
 * menu is built only here and never refreshed (comm §7.5).
 */
import { CoreFaultError } from '../errors.ts';
import { buildCategoryMenu, buildCommandMenu, buildObjectList, CLOSE_KEY, digitKey, matchItem, type NearMenuView } from '../rules/comm-menus.ts';
import { COMMUNICATIONS_FIELD, isMenuPage } from '../rules/displays.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import { interactionContext, type CategoryValue, type CommandValue, type LeftPage, type MenuItem, type ObjectValue } from '../world/player-state.ts';
import { emitCommandResult, type CommandOf, type CommandOutcome } from './commands.ts';
import { writeLeftPage } from './displays.ts';
import { availablePlayer, type EffectiveView } from './flight-control.ts';
import { emit, type RequestOf, type TickContext } from './pipeline.ts';

/** P3-10's commands (CB-07), with `confirm-selection` outside flight, where it is not the manual speed match. */
export type CommunicationsCommand = CommandOf<'communications' | 'select-number' | 'navigate-selection' | 'launch' | 'confirm-selection'>;

const ACCEPTED: CommandOutcome = Object.freeze({ outcome: 'accepted', reason: null });
const ignored = (reason: 'player-unavailable' | 'wrong-context' | 'no-candidate' | 'no-change' | 'subsystem-disabled'): CommandOutcome =>
  ({ outcome: 'ignored', reason });

/** The docking request's command code. */
const DOCKING_CODE = 9;
/** Clock units the docking wait gives a reply (`0x333b4`): sub-state 3's deadline. */
const DOCKING_REPLY_PERIOD = 0x780;

/** One command's judgement: its context, the batch's effective view, the available player and its index. */
interface Judgement {
  readonly context: TickContext;
  readonly view: EffectiveView;
  readonly player: Entity;
  readonly commandIndex: number;
}

/** Writes the page for the command (message 0x100000): always emitted, as the original always adds its sound. */
function writePage({ context, commandIndex }: Judgement, page: LeftPage): void {
  writeLeftPage(context, page, commandIndex);
}

/** Close: the menu is gone, the page returns to the one `c` saved. */
function close(judgement: Judgement): void {
  judgement.context.world.player.communications.menu = null;
  writePage(judgement, judgement.context.world.player.communications.menuSavedPage);
}

/** What the near-menu gate reads of the world (CD5). */
function nearMenuView({ context: { world }, view, player }: Judgement): NearMenuView {
  return { position: player.position, viewMode: view.viewMode, flow: world.flow };
}

/** The partner becomes `partner` and its command menu is built: page 4, or a close when it no longer resolves. */
function openCommandMenu(judgement: Judgement, partner: EntityId): void {
  const { world } = judgement.context;
  const communications = world.player.communications;
  communications.partner = partner;
  const menu = buildCommandMenu(world.entities, world.ruleData.communications.menus, partner, nearMenuView(judgement));
  if (menu === null) {
    close(judgement);
    return;
  }
  communications.menu = menu;
  writePage(judgement, 4);
}

/**
 * `0x333b4(player, partner)`: the docking object is the partner, resolvable or not; sub-state 3 whatever it was, due a
 * reply within DOCKING_REPLY_PERIOD of this clock.
 */
function startDockingWait({ context, player, commandIndex }: Judgement, partner: EntityId): void {
  const { world, time } = context;
  const deadlineClock = time.clock + DOCKING_REPLY_PERIOD;
  if (!Number.isSafeInteger(deadlineClock)) throw new CoreFaultError('budget-exhausted', 'communications.docking-deadline');
  const previousSubState = world.flow.subState;
  world.player.dockingObject = partner;
  world.flow.subState = 3;
  world.flow.dockingDeadline = deadlineClock;
  emit(context, { type: 'docking-requested', tick: time.tick, playerEntityId: player.id, dockingObject: partner, previousSubState, deadlineClock, commandIndex });
}

/** The command item `code` on page 4, sent to the partner. */
function chooseCommand(judgement: Judgement, { code }: CommandValue): void {
  const { context, player, commandIndex } = judgement;
  const { world } = context;
  const { partner } = world.player.communications;
  if (partner === null) throw new CoreFaultError('invariant-violated', 'communications.partner');
  if (world.entities.get(partner) !== undefined) context.requests.post({ type: 'deliver-command', receiver: partner, code, sender: player.id, commandIndex });
  writePage(judgement, world.player.communications.menuSavedPage);
  if (code === DOCKING_CODE) startDockingWait(judgement, partner);
}

/** A category on page 2: its object list, skipped for a single object. */
function chooseCategory(judgement: Judgement, { kindMask }: CategoryValue): void {
  const { world } = judgement.context;
  const list = buildObjectList(world.entities, world.ruleData.communications.menus, kindMask);
  if (list === null) {
    close(judgement);
    return;
  }
  const [first] = list.items;
  // One object and the exit: the original's count ≤ 2.
  if (list.items.length === 2 && first.value.type === 'object') {
    openCommandMenu(judgement, first.value.entityId);
    return;
  }
  world.player.communications.menu = list;
  writePage(judgement, 3);
}

/** A key on a menu page (rule 3 of the module comment). */
function judgeMenuKey(judgement: Judgement, command: CommunicationsCommand, page: 2 | 3 | 4): void {
  const { context, commandIndex } = judgement;
  const communications = context.world.player.communications;
  const { menu } = communications;
  // Every write of a menu page comes with its menu; other page writes restore a page of the same menu (comm §7.6).
  if (menu !== null && menu.level !== page) throw new CoreFaultError('invariant-violated', 'communications.menu-page');
  if (command.type === 'communications' && command.operation === 'open') {
    emitCommandResult(context, command, commandIndex, ignored('no-change'));
    return;
  }
  const items: readonly MenuItem<CategoryValue | ObjectValue | CommandValue>[] = menu?.items ?? [];
  const item = matchItem(items, command.type === 'select-number' ? digitKey(command.value) : CLOSE_KEY);
  if (item === undefined) {
    emitCommandResult(context, command, commandIndex, ignored('no-candidate'));
    return;
  }
  communications.menu = null;
  emitCommandResult(context, command, commandIndex, ACCEPTED);
  const { value } = item;
  switch (value.type) {
    case 'exit':
      close(judgement);
      return;
    case 'category':
      chooseCategory(judgement, value);
      return;
    case 'object':
      openCommandMenu(judgement, value.entityId);
      return;
    case 'command':
      chooseCommand(judgement, value);
      return;
  }
}

/** A command off the menu pages (rule 4 of the module comment). */
function judgeWithoutMenu(judgement: Judgement, command: CommunicationsCommand, page: LeftPage): void {
  const { context, player, commandIndex } = judgement;
  if (command.type === 'select-number') {
    emitCommandResult(context, command, commandIndex, ignored('wrong-context'));
    return;
  }
  if (command.type !== 'communications' || command.operation === 'close') {
    emitCommandResult(context, command, commandIndex, ignored('no-change'));
    return;
  }
  const { combat } = player;
  if (combat.type !== 'craft') throw new CoreFaultError('invariant-violated', 'communications.player');
  if (combat.subsystems[COMMUNICATIONS_FIELD] === 2) {
    emitCommandResult(context, command, commandIndex, ignored('subsystem-disabled'));
    return;
  }
  const { world } = context;
  const menu = buildCategoryMenu(world.entities, world.ruleData.communications.menus);
  // `0x27db6`–`0x27dd0` write all three before testing the menu, so a failed `c` abandons a dormant menu too.
  const communications = world.player.communications;
  communications.partner = null;
  communications.menuSavedPage = page;
  communications.menu = menu;
  if (menu === null) {
    emitCommandResult(context, command, commandIndex, ignored('no-candidate'));
    return;
  }
  emitCommandResult(context, command, commandIndex, ACCEPTED);
  writePage(judgement, 2);
}

/**
 * `deliver-command` in request handling (message 0x100, CD2): the receiver's pending command is the code, whatever it
 * held, with `command-delivered`; a receiver removed before then gets nothing. Kind, state, activity and the destroyed
 * flag are not read. That the receiver acts on it is the consumer's fact (`0x3bed0`, P3-08's wingman handlers).
 */
export function deliverCommand(context: TickContext, request: RequestOf<'deliver-command'>): void {
  const { world, time } = context;
  const receiver = world.entities.get(request.receiver);
  if (receiver === undefined) return;
  receiver.ai.pendingCommand = Object.freeze({ code: request.code, issuedTick: time.tick });
  emit(context, {
    type: 'command-delivered', tick: time.tick, receiverEntityId: receiver.id, receiverKindBit: receiver.kindBit, code: request.code,
    senderEntityId: request.sender, commandIndex: request.commandIndex,
  });
}

/** Judges one of P3-10's commands in its place in the order, in the batch's effective `view` (module comment). */
export function judgeCommunicationsCommand(context: TickContext, command: CommunicationsCommand, commandIndex: number, view: EffectiveView): void {
  const { world } = context;
  const player = availablePlayer(world);
  if (player === null) {
    emitCommandResult(context, command, commandIndex, ignored('player-unavailable'));
    return;
  }
  const interaction = interactionContext(view.viewMode);
  // Only the map's `confirm-selection` reaches here with a player: the player's update takes Enter in flight and Warp,
  // and commands.ts the base keys of an available player.
  const selection = command.type === 'navigate-selection' || command.type === 'launch' || command.type === 'confirm-selection';
  if (interaction !== 'flight' || selection) {
    emitCommandResult(context, command, commandIndex, ignored('wrong-context'));
    return;
  }
  const judgement: Judgement = { context, view, player, commandIndex };
  const { page } = world.player.leftDisplay;
  if (isMenuPage(page)) judgeMenuKey(judgement, command, page);
  else judgeWithoutMenu(judgement, command, page);
}
