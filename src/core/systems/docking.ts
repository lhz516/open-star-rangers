/**
 * The docking wait, docking and launch (docs/plan/p3/02/spec.md, CB-02, CB-10 `dock` and `depart`;
 * docs/original/formats/executable.md, DK1–DK3; the rules are rules/docking.ts's).
 *
 * The `mission-flow` stage (`0x3266c`, mission-flow.ts) dispatches sub-states 3–5 of main state 3 to `checkDockingWait`,
 * which reads the previous tick's clock. While a player entity exists, it checks the docking object there; one that is null there is Core's fault (CB-17
 * decision 3). In 3 and 4 an invalid object releases the wait: the docking object is null, sub-state 0, then
 * `docking-cancelled` (`invalid-object`) and the radio flush with its page write. A valid object times sub-state 3 out
 * to 0 alone, keeping the object, the queue and the page (`timeout`), and makes sub-state 4 post `dock` and enter 5.
 * In 5 an invalid object posts the automatic `depart` and sets sub-state 0, without releasing the object or flushing:
 * the launch releases it. None of the cancels gives feedback (DK1): the event is for diagnostics.
 *
 * `dock` in request handling (`0x38ff4` sub-command 0) does nothing without a player entity. The execution search
 * must find the docking object itself; otherwise `0x3340c` releases it, sub-state 0, `docking-cancelled` (`gate`), and
 * nothing else. Then, in DK2's order: the base's pose saved bit for bit; the player docked; the wingman docked and fully
 * repaired (`0x39820`, base-interior.ts) when it qualifies; one discarded world draw for the background (`0x4f480`); the
 * base view, clearing the player's target without an event; the base service; `docked` and `transition` (G-02/3).
 * Sub-state 5 and the docking object stay. The request does not read the sub-state: a code-9 command in the same tick
 * restarts the wait before it, and it docks all the same when it names the same base (DK1 races).
 *
 * `depart` (sub-command 4), the player's `l` in the base (commands.ts) or the automatic launch, likewise does nothing
 * without a player entity and reads neither the sub-state nor the player's activity. In DK3's order: the player active;
 * the previous view restored, at least 0xC, without a target write; the base service gone (the list length 0); the
 * wingman list's head active again where it is, when docked; the player placed from the saved pose (the base's), which
 * becomes the new pose, and its placement serial counted (a project field for the renderers); `0x3340c`; `departed` and
 * `transition` (G-02/4). The movement block is not touched, so speed, commanded speed and turns continue from their
 * docked values; a partly done service keeps what it did and is not completed. A second `depart` in the same tick (the
 * automatic launch and `l`) applies all of it again, as the original does: view 0xC, another quarter turn and 1000
 * units, another `transition` (CB-17 decision 6). The launch's clips, resource releases and music are presentation.
 */
import type { DockingCancelledEvent } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { RandStream } from '../rules/original-random.ts';
import {
  BASE_VIEW_MODE,
  dockingWaitStep,
  findDockingBase,
  findDockingWingman,
  isDockingSubState,
  isValidDockingObject,
  launchPose,
  launchViewMode,
  setUpBaseService,
  wingmanHead,
} from '../rules/docking.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import type { Pose } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { fullRepair } from './base-interior.ts';
import { emit, type RequestOf, type TickContext } from './pipeline.ts';
import { flushRadio } from './radio.ts';
import { switchView } from './view-switch.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `docking.${site}`);

/** The player's entity, or null without one (ps +0x8C is 0). */
function playerEntity(world: WorldState): Entity | null {
  const { entityId } = world.player;
  if (entityId === null) return null;
  const entity = world.entities.get(entityId);
  if (entity === undefined) throw fault('player');
  return entity;
}

/** The docking object, which sub-states 3–5 and a docking always have (CB-17 decision 3). */
function requireDockingObject(world: WorldState): EntityId {
  const { dockingObject } = world.player;
  if (dockingObject === null) throw fault('object');
  return dockingObject;
}

/** `0x3340c`'s rule part: the docking object released and sub-state 0 (its music restart is presentation). */
function endDocking(world: WorldState): void {
  world.player.dockingObject = null;
  world.flow.subState = 0;
}

function emitCancelled(context: TickContext, player: Entity, dockingObject: EntityId, cause: DockingCancelledEvent['cause']): void {
  emit(context, { type: 'docking-cancelled', tick: context.time.tick, playerEntityId: player.id, dockingObject, cause });
}

/** The `mission-flow` stage's docking part (module comment). */
export function checkDockingWait(context: TickContext): void {
  const { world, requests } = context;
  const { flow } = world;
  const { subState } = flow;
  if (flow.mainState !== 3 || !isDockingSubState(subState)) return;
  const player = playerEntity(world);
  if (player === null) return;
  const dockingObject = requireDockingObject(world);
  const valid = isValidDockingObject(world.entities.get(dockingObject));
  // In `mission-flow` the world's clock is still the previous tick's (C3).
  switch (dockingWaitStep(subState, valid, world.clock, flow.dockingDeadline)) {
    case 'none':
      return;
    case 'launch':
      requests.post({ type: 'depart', entityId: player.id, origin: 'automatic', commandIndex: null });
      flow.subState = 0;
      return;
    case 'release':
      endDocking(world);
      emitCancelled(context, player, dockingObject, 'invalid-object');
      flushRadio(context, 'docking-cancel');
      return;
    case 'time-out':
      flow.subState = 0;
      emitCancelled(context, player, dockingObject, 'timeout');
      return;
    case 'dock':
      requests.post({ type: 'dock', entityId: player.id });
      flow.subState = 5;
      return;
  }
}

/** A bit-for-bit copy of `entity`'s pose. */
function poseOf({ position, orientation }: Entity): Pose {
  return Object.freeze({ position: Object.freeze({ ...position }), orientation: Object.freeze([...orientation]) as unknown as Pose['orientation'] });
}

/**
 * `0x216d4(player, viewMode, 0)`: the previous view is the old one, then P3-09's view switch (view-switch.ts; MW-09),
 * whose `0x4cd68` sets the redraw flag as one view is 6 (CB-10). It changes no page here: docking is refused in the Warp
 * views and a launch never enters one. Returns the old view.
 */
function changeView(world: WorldState, viewMode: number): number {
  const { player } = world;
  const previousViewMode = player.viewMode;
  player.previousViewMode = previousViewMode;
  player.viewMode = viewMode;
  if (switchView(world, viewMode, previousViewMode) !== null) throw fault('view-switch');
  return previousViewMode;
}

/** `dock` in request handling (module comment). */
export function dock(context: TickContext): void {
  const { world, time } = context;
  const player = playerEntity(world);
  if (player === null) return;
  const dockingObject = requireDockingObject(world);
  const base = findDockingBase(world.entities, player.position, world.player.viewMode);
  if (base?.id !== dockingObject) {
    endDocking(world);
    emitCancelled(context, player, dockingObject, 'gate');
    return;
  }
  const savedPose = poseOf(base);
  world.player.docking.savedPose = savedPose;
  player.activity = 'docked';
  const wingman = findDockingWingman(world.entities, savedPose.position);
  // The wingman's full repair `0x39820`, outside the message loop by CB-10; it posts nothing for a craft other than
  // the player.
  if (wingman !== null) {
    wingman.activity = 'docked';
    fullRepair(context, wingman, false);
  }
  // `0x4f480` draws rand % 3 for the background, a presentation choice, from the generator the rules share (D-03 item 5).
  const stream = new RandStream(world.rngState);
  stream.next();
  world.rngState = stream.state;
  // `0x3104c` clears the target as the new view is 6 (no `target-changed`, CR-06).
  const previousViewMode = changeView(world, BASE_VIEW_MODE);
  world.player.target = null;
  if (player.combat.type !== 'craft') throw fault('player-combat');
  const craft = world.craftInfo.content.craft[player.kindBit];
  if (craft === undefined) throw fault('player-record');
  world.baseService = setUpBaseService(time.clock, craft, world.ruleData.communications.serviceSelectors, player.combat.subsystems);
  emit(context, { type: 'docked', tick: time.tick, playerEntityId: player.id, baseEntityId: base.id, wingmanEntityId: wingman?.id ?? null, previousViewMode });
  emit(context, { type: 'transition', tick: time.tick, gap: 'G-02/3' });
}

/** `depart` in request handling (module comment); `wingmanEntityId` names the wingman it made active again. */
export function depart(context: TickContext, request: RequestOf<'depart'>): void {
  const { world, time } = context;
  const player = playerEntity(world);
  if (player === null) return;
  const { docking } = world.player;
  // Only docking enters the base view and sub-state 5, and it saves the pose first.
  if (docking.savedPose === null) throw fault('saved-pose');
  player.activity = 'active';
  changeView(world, launchViewMode(world.player.previousViewMode));
  world.baseService = null;
  const head = wingmanHead(world.entities);
  const wingman = head?.activity === 'docked' ? head : null;
  if (wingman !== null) wingman.activity = 'active';
  const pose = launchPose(docking.savedPose);
  docking.savedPose = pose;
  player.position = pose.position;
  player.orientation = pose.orientation;
  player.placementSerial++;
  endDocking(world);
  const fields = {
    tick: time.tick, playerEntityId: player.id, viewMode: world.player.viewMode, previousViewMode: world.player.previousViewMode,
    position: pose.position, orientation: pose.orientation, wingmanEntityId: wingman?.id ?? null,
  };
  emit(context, request.origin === 'command'
    ? { type: 'departed', ...fields, origin: 'command', commandIndex: request.commandIndex }
    : { type: 'departed', ...fields, origin: 'automatic', commandIndex: null });
  emit(context, { type: 'transition', tick: time.tick, gap: 'G-02/4' });
}
