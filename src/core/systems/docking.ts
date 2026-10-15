/**
 * The docking wait and docking (docs/plan/p3/02/spec.md, CB-02, CB-10 `dock`; docs/original/formats/executable.md,
 * DK1, DK2; the rules are rules/docking.ts's).
 *
 * The `mission-flow` stage (`checkDockingWait`, `0x3266c`) reads the previous tick's clock. While the mission runs and a
 * player entity exists, it checks the docking object in sub-states 3–5; one that is null there is Core's fault (CB-17
 * decision 3). In 3 and 4 an invalid object releases the wait: the docking object is null, sub-state 0, then
 * `docking-cancelled` (`invalid-object`) and the radio flush with its page write. A valid object times sub-state 3 out
 * to 0 alone, keeping the object, the queue and the page (`timeout`), and makes sub-state 4 post `dock` and enter 5.
 * Sub-state 5's automatic launch is P3-10/18's. None of the cancels gives feedback (DK1): the event is for diagnostics.
 *
 * `dock` in request handling (`0x38ff4` sub-command 0) does nothing without a player entity. The execution search
 * must find the docking object itself; otherwise `0x3340c` releases it, sub-state 0, `docking-cancelled` (`gate`), and
 * nothing else. Then, in DK2's order: the base's pose saved bit for bit; the player docked; the wingman docked when it
 * qualifies; one discarded world draw for the background (`0x4f480`); the base view, clearing the player's target
 * without an event; the base service; `docked` and `transition` (G-02/3). Sub-state 5 and the docking object stay. The
 * request does not read the sub-state: a code-9 command in the same tick restarts the wait before it, and it docks all
 * the same when it names the same base (DK1 races).
 */
import type { DockingCancelledEvent } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { RandStream } from '../rules/original-random.ts';
import { BASE_VIEW_MODE, dockingWaitStep, findDockingBase, findDockingWingman, isDockingSubState, isValidDockingObject, setUpBaseService } from '../rules/docking.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import type { Pose } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { emit, type TickContext } from './pipeline.ts';
import { flushRadio } from './radio.ts';

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
    case 'launch': // Sub-state 5's automatic launch: P3-10/18.
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
 * `0x216d4(player, 6, 0)`: the previous view is the old one and the view 6; `0x3104c` clears the player's target as
 * the new view is 6 (no `target-changed`, CR-06), and the cockpit rebuild `0x3f158` through `0x4cd68` sets the redraw
 * flag. The left page stays (comm §7.6). P3-09's `switchView` (MW-09) takes this over once it lands. Returns the old view.
 */
function enterBaseView(world: WorldState): number {
  const { player } = world;
  const previousViewMode = player.viewMode;
  player.previousViewMode = previousViewMode;
  player.viewMode = BASE_VIEW_MODE;
  player.target = null;
  player.statusDisplay.redraw = true;
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
  // The docked wingman's full repair `0x39820` (not in the message loop) is P3-10/17's, here.
  if (wingman !== null) wingman.activity = 'docked';
  // `0x4f480` draws rand % 3 for the background, a presentation choice, from the generator the rules share (D-03 item 5).
  const stream = new RandStream(world.rngState);
  stream.next();
  world.rngState = stream.state;
  const previousViewMode = enterBaseView(world);
  if (player.combat.type !== 'craft') throw fault('player-combat');
  const craft = world.craftInfo.content.craft[player.kindBit];
  if (craft === undefined) throw fault('player-record');
  world.baseService = setUpBaseService(time.clock, craft, world.ruleData.communications.serviceSelectors, player.combat.subsystems);
  emit(context, { type: 'docked', tick: time.tick, playerEntityId: player.id, baseEntityId: base.id, wingmanEntityId: wingman?.id ?? null, previousViewMode });
  emit(context, { type: 'transition', tick: time.tick, gap: 'G-02/3' });
}
