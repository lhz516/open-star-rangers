/**
 * Weapons (docs/plan/p3/02/spec.md, CR-05, CR-06, CR-07; docs/original/formats/executable.md, W1–W11): the `fire`,
 * `cycle-main-weapon` and `select-missile` commands, the player's missile lock, the AI's fire entry points and the
 * `launch` request (message 8). The rules are in rules/mounts.ts and rules/firing.ts; this module supplies the world:
 * the shot target, the clock, the world's RNG and the request queue.
 *
 * A command is judged where it stands in the tick's command array, against the selection, target, cooldowns and
 * resources earlier commands have left (spec 技术决定 9); each launch keeps its own mount, trigger and target, so later
 * commands cannot change it. The launches of the player's fire commands are deferred until the player's update has
 * posted P3-06's control and match requests, which it posts after the command loop: the original calls its triggers
 * after posting message 0x20000 (T3, CR-07), so request handling meets them in the original's order within a frame. An
 * AI shooter's launches are posted at once, as the original posts message 8 in the shooter's own update.
 */
import { CoreFaultError } from '../errors.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import {
  acquireAutomaticTarget, fireAutomaticMounts, fireList, updateLock, type FireOutcome, type FiringData, type Launch, type ShotTarget,
} from '../rules/firing.ts';
import { countEnergyPageRedraw } from '../rules/displays.ts';
import { selectMount, type MountList } from '../rules/mounts.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { combatCommandPlayer, emitCommandResult, type CommandOf } from './commands.ts';
import { applyLaunchRequest } from './launch.ts';
import { emit, type TickContext } from './pipeline.ts';
import { referenceTarget } from './targeting.ts';

const firingData = ({ craftInfo, ruleData }: WorldState): FiringData => ({ info: craftInfo.content, rules: ruleData });

/** A craft entity: kind bits 0–19 fire. */
function asCraft(entity: Entity): CraftEntity {
  if (entity.combat.type !== 'craft') throw new CoreFaultError('invariant-violated', 'weapons.shooter');
  return entity as CraftEntity;
}

/** The target an ID names: the ID, and its entity while it resolves. */
const shotTarget = (world: WorldState, id: EntityId | null): ShotTarget => ({ id, entity: id === null ? undefined : world.entities.get(id) });

/** Runs `work` with draws from the world's RNG, which then continues after them. */
function withRand<Result>(world: WorldState, work: (rand: RandStream) => Result): Result {
  const rand = new RandStream(world.rngState);
  const result = work(rand);
  world.rngState = rand.state;
  return result;
}

const postLaunch = (context: TickContext, launch: Launch): void => context.requests.post({ type: 'launch', ...launch });
const deferLaunch = (context: TickContext, launch: Launch): void => context.requests.defer({ type: 'launch', ...launch });

/**
 * `cycle-main-weapon` and `select-missile` (`0x2e4ec` through `0x2d6dc`/`0x2d6f0`): a craft without mounts gives
 * `no-weapon` and changes nothing; otherwise the selection is accepted, even when it keeps the same mount, and
 * `weapon-selected` follows its result.
 */
function judgeSelection(context: TickContext, player: CraftEntity, command: CommandOf<'cycle-main-weapon' | 'select-missile'>, commandIndex: number): void {
  const list: 0 | 1 = command.type === 'cycle-main-weapon' ? 0 : 1;
  const delta = command.type === 'select-missile' && command.direction === 'previous' ? -1 : 1;
  const selection = selectMount(player.combat.weapons, context.world.craftInfo.content.craft[player.kindBit], list, delta);
  if (selection === null) {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: 'no-weapon' });
    return;
  }
  emitCommandResult(context, command, commandIndex, { outcome: 'accepted', reason: null });
  emit(context, { type: 'weapon-selected', tick: context.time.tick, entityId: player.id, list, ...selection, commandIndex });
}

/**
 * `fire` (`0x2d578` on list 0 for `primary`, list 1 for `secondary`) at the reference target: without a current mount
 * `no-weapon`; accepted when at least one mount posted a launch, otherwise the reason of the last attempt. Each gun
 * launch spent the player's charge and counts one energy-page redraw (CK-02).
 */
function judgeFire(context: TickContext, player: CraftEntity, command: CommandOf<'fire'>, commandIndex: number): void {
  const { world } = context;
  const { channel } = command;
  const outcome = withRand(world, (rand) => fireList(
    firingData(world), player, channel === 'primary' ? 0 : 1, shotTarget(world, referenceTarget(context)),
    { type: 'command', channel, commandIndex }, world.clock, rand, (launch) => {
      // The shot spent the player's charge (`0x30cec`), which sets the energy-page redraw flag +0x44 (CK-02).
      if (launch.family === 'gun') countEnergyPageRedraw(world.player);
      deferLaunch(context, launch);
    },
  ));
  if (outcome === null) emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: 'no-weapon' });
  else if (outcome.launched === 0 && outcome.last !== 'launched') emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: outcome.last });
  else emitCommandResult(context, command, commandIndex, { outcome: 'accepted', reason: null });
}

/**
 * Judges a fire or weapon selection command (W3, W5–W8) after the common pre-judgement of CR-05: without an available
 * player `player-unavailable`, outside the flight context `wrong-context`, both ignored and changing nothing.
 */
export function judgeWeaponCommand(context: TickContext, command: CommandOf<'fire' | 'cycle-main-weapon' | 'select-missile'>, commandIndex: number): void {
  const player = combatCommandPlayer(context);
  if (typeof player === 'string') {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: player });
    return;
  }
  if (command.type === 'fire') judgeFire(context, asCraft(player), command, commandIndex);
  else judgeSelection(context, asCraft(player), command, commandIndex);
}

/**
 * The missile lock `0x2ddbc` (W8) in the player's update, after P3-06's clearing of an invalid target and before the
 * speed assist (CR-07), on the player's actual target; P3-06's player update calls it (P3-07/35).
 */
export function updateMissileLock(context: TickContext, player: Entity): void {
  const { world } = context;
  const target = world.player.target === null ? undefined : world.entities.get(world.player.target);
  withRand(world, (rand) => updateLock(firingData(world), asCraft(player), target, world.clock, rand));
}

/**
 * The AI's trigger on channel `channel` (`0x2d578` from the AI step `0x5dcd4`, W10) at the shooter's `ai.objectTarget`;
 * P3-08 decides when. Null when the list has no current mount. It gives no command result.
 */
export function fireAiChannel(context: TickContext, shooter: Entity, channel: MountList): FireOutcome | null {
  const { world } = context;
  return withRand(world, (rand) => fireList(
    firingData(world), asCraft(shooter), channel, shotTarget(world, shooter.ai.objectTarget), { type: 'ai', channel }, world.clock, rand,
    (launch) => postLaunch(context, launch),
  ));
}

/** The automatic mounts `0x2dad0` of `shooter` (W9), for P3-08's AI step. */
export function fireAutomatic(context: TickContext, shooter: Entity): void {
  const { world } = context;
  withRand(world, (rand) => fireAutomaticMounts(firingData(world), asCraft(shooter), world.clock, rand, (launch) => postLaunch(context, launch)));
}

/** The acquisition `0x2da58` of automatic mount `mount` of `shooter` (W9), for P3-08. It draws nothing. */
export function acquireAutomatic(context: TickContext, shooter: Entity, mount: number): boolean {
  const { world } = context;
  return acquireAutomaticTarget(firingData(world), asCraft(shooter), mount, (id) => world.entities.get(id));
}

/** Builds a projectile or missile in request handling (W11). */
export { applyLaunchRequest as applyLaunch };
