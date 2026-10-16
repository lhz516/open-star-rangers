/**
 * The wingman's command consumers (docs/plan/p3/08/spec.md, 僚机命令, S-10, AC-08; docs/plan/p3/02/spec.md, CR-18,
 * CR-22, CR-28; docs/original/formats/executable.md, WB2–WB5): `0x614a8`, step 2 of the active handler `0x610c8`
 * (ai-wingman.ts), and `0x61f20`, the start of the parked handler's kind-2 step `0x62250` (ai-parked.ts). Revision ⑤:
 * the two tables differ (parked, code 4 is code 3 and code 2 changes nothing).
 *
 * The single slot `AiState.pendingCommand` is written only by P3-10's `deliver-command` (CB-08). A consumer here keeps
 * it while blocked (active: no player or the friendly-fire accumulator above AICO +0x28; parked: the accumulator only),
 * with no reply and no fact. Otherwise it applies the code, asks for the reply line through `reply` (P3-10's
 * `queueLine`, CB-06, which draws and queues), clears the slot and returns the consumption, which systems/ai.ts emits as
 * `wingman-command-consumed`. The command carries only its code: the player, the player's target, the Warp destination
 * and the hull are read here, at consumption.
 */
import type { WingmanCommandConsumedEvent, WingmanCommandOutcome } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { Entity, EntityId, PendingCommand, WingmanState } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import type { ParkedCall } from './ai-parked.ts';
import { applyBehaviour, isFriendlyFireBlocking, type WingmanCall, type WingmanController } from './ai-wingman.ts';
import { hasKind } from './radio.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-commands.${site}`);

/** Kinds `0x206c07f` code 1 refuses as the player's target: the friendly side and the marker. */
const UNATTACKABLE_KINDS = 0x206c07f;
/** Kinds `0x68000`, the bases parked code 5 returns to. */
const BASE_KINDS = 0x68000;
/** The status reply's thresholds (percent) and lines: below 50 0xD, below 80 0xC, else 0xB. */
const STATUS_LOW = 50;
const STATUS_MEDIUM = 80;
const STATUS_LOW_LINE = 0xd;
const STATUS_MEDIUM_LINE = 0xc;
const STATUS_HIGH_LINE = 0xb;
/** The line of the acknowledgement of code 2 and of every unknown code. */
const ACKNOWLEDGE_LINE = 3;
const REFUSAL_LINE = 0;

/** One consumption: the event's facts other than its type, tick and wingman. */
export type CommandConsumption = Pick<WingmanCommandConsumedEvent, 'code' | 'issuedTick' | 'path' | 'outcome' | 'replyLine'>;

/** Asks for the reply line (`0x38d54`, P3-10's `queueLine`): its draws and queueing are the caller's. */
export type ReplyLine = (line: number) => void;

/** What a code gives before the reply: its outcome and line, and for the parked path whether it changed the state. */
interface CodeResult {
  readonly outcome: WingmanCommandOutcome;
  readonly replyLine: number | null;
  readonly changed: boolean;
}

const result = (outcome: WingmanCommandOutcome, replyLine: number | null, changed = false): CodeResult => ({ outcome, replyLine, changed });

/** The handle check `0x52680`: the entity of `id` when it resolves, else null. */
const resolve = (world: WorldState, id: EntityId | null): Entity | null => (id === null ? null : world.entities.get(id) ?? null);

/**
 * Code 7, the status (WB3): q = trunc(hull × 100 ÷ craft +0x9C), the product i32 and the quotient a signed IDIV; q below
 * 50 line 0xD, below 80 line 0xC, else 0xB. World creation rejects a wingman whose +0x9C is 0. No state change.
 */
export function statusLine(world: WorldState, subject: Entity): number {
  if (subject.combat.type !== 'craft') throw fault('status');
  const capacity = world.craftInfo.content.craft[subject.kindBit]?.at9C;
  if (capacity === undefined || capacity === 0) throw fault('capacity');
  const percent = Math.trunc(Math.imul(subject.combat.hull, 100) / capacity);
  if (percent < STATUS_LOW) return STATUS_LOW_LINE;
  return percent < STATUS_MEDIUM ? STATUS_MEDIUM_LINE : STATUS_HIGH_LINE;
}

/** Code 7, the status, and every code from 8, line 3 without an effect: the same on both paths (the tables cover 1–8). */
function commonCode(world: WorldState, subject: Entity, code: number): CodeResult {
  return code === 7 ? result('status', statusLine(world, subject)) : result('unknown-code', ACKNOWLEDGE_LINE);
}

/**
 * The table of `0x614a8` (WB3); r is `0x61740`'s result, after which a failed apply has already fallen back to the
 * formation. Code 1 attacks the player's target PT unless it is gone or of kinds `0x206c07f` (clearing B+4 when it was
 * PT); 2 marks PT "do not attack" unless it is gone or the wingman, b kept and re-applied; 3 the formation; 4 engage,
 * B+4 cleared; 5 return to a base; 6 go to the player's destination.
 */
function activeCode(call: WingmanCall, controller: WingmanController, code: number): CodeResult {
  const { world, subject } = call;
  const { wingman } = controller;
  const apply = (behaviour: WingmanState['behaviour']): boolean => {
    wingman.behaviour = behaviour;
    return applyBehaviour(call, controller);
  };
  const applied = (r: boolean, line: number, fallbackLine: number): CodeResult => (r ? result('applied', line) : result('fallback', fallbackLine));
  switch (code) {
    case 1: {
      const target = resolve(world, world.player.target);
      if (target === null || hasKind(UNATTACKABLE_KINDS, target.kindBit)) return result('refused', REFUSAL_LINE);
      if (wingman.doNotAttack === target.id) wingman.doNotAttack = null;
      wingman.attackTarget = target.id;
      return applied(apply(0), 0x10, REFUSAL_LINE);
    }
    case 2: {
      const target = resolve(world, world.player.target);
      if (target === null || target.id === subject.id) return result('refused', REFUSAL_LINE);
      wingman.doNotAttack = target.id;
      // b is kept and re-applied, its result unused.
      applyBehaviour(call, controller);
      return result('applied', ACKNOWLEDGE_LINE);
    }
    case 3:
      apply(2);
      return result('applied', 0xe);
    case 4:
      wingman.doNotAttack = null;
      return applied(apply(1), 0x14, REFUSAL_LINE);
    case 5:
      return applied(apply(3), 0x12, REFUSAL_LINE);
    case 6:
      return applied(apply(4), 0x12, 0x15);
    default:
      return commonCode(world, subject, code);
  }
}

/**
 * The table of `0x61f20` (WB4), whose effects go to the AI target +0x90, the AI mode +0xC4 and the goal that the next
 * install's `0x61d64` turns into b: code 1 with the player and PT resolving, PT and mode 0 (no kind check); 2 with both
 * resolving, nothing; 3 and 4 with a player, the player and mode 2, and without one no reply; 5 the first base in walk
 * order and mode 2; 6 with a player and a destination, no target, mode 2 and the destination as the goal. Only these
 * effects change the state.
 */
function parkedCode(call: ParkedCall, code: number): CodeResult {
  const { world, subject } = call;
  const { ai } = subject;
  const player = world.player.entityId;
  switch (code) {
    case 1:
    case 2: {
      const target = resolve(world, player) === null ? null : resolve(world, world.player.target);
      if (target === null) return result('refused', REFUSAL_LINE);
      if (code === 2) return result('acknowledged', ACKNOWLEDGE_LINE);
      ai.target = target.id;
      ai.mode = 0;
      return result('applied', 0x10, true);
    }
    case 3:
    case 4:
      if (player === null) return result('refused', null);
      ai.target = player;
      ai.mode = 2;
      return result('applied', 0xe, true);
    case 5: {
      const [base] = world.entities.walk(BASE_KINDS);
      if (base === undefined) return result('refused', REFUSAL_LINE);
      ai.target = base.id;
      ai.mode = 2;
      return result('applied', 0x12, true);
    }
    case 6: {
      const { destination } = world.player.map;
      if (player === null || destination === null) return result('refused', 0x15);
      ai.mode = 2;
      ai.target = null;
      ai.goal = destination;
      return result('applied', 0x12, true);
    }
    default:
      return commonCode(world, subject, code);
  }
}

/** The reply, the clearing and the consumption that every consumed code ends with (WB2). */
function finish(subject: Entity, command: PendingCommand, path: CommandConsumption['path'], { outcome, replyLine }: CodeResult, reply: ReplyLine): CommandConsumption {
  if (replyLine !== null) reply(replyLine);
  subject.ai.pendingCommand = null;
  return { code: command.code, issuedTick: command.issuedTick, path, outcome, replyLine };
}

/**
 * `0x614a8` (WB3), before the periodic behaviour in every mode 0 and mode 1 update: the consumption, or null when no
 * command is pending or it stays blocked (no player, or the accumulator above AICO +0x28).
 */
export function consumeActiveCommand(call: WingmanCall, controller: WingmanController, reply: ReplyLine): CommandConsumption | null {
  const { world, subject } = call;
  const command = subject.ai.pendingCommand;
  if (world.player.entityId === null || isFriendlyFireBlocking(world) || command === null) return null;
  return finish(subject, command, 'active', activeCode(call, controller, command.code), reply);
}

/**
 * `0x61f20` (WB4), first in the wingman's parked step: the consumption and whether it changed the state (`0x62250` then
 * skips the drop and the search unless the mode loaded at entry was 2 or 5), or null when no command is pending or it
 * stays blocked (the accumulator above AICO +0x28).
 */
export function consumeParkedCommand(call: ParkedCall, reply: ReplyLine): { readonly consumption: CommandConsumption; readonly changed: boolean } | null {
  const { world, subject } = call;
  const command = subject.ai.pendingCommand;
  if (isFriendlyFireBlocking(world) || command === null) return null;
  const code = parkedCode(call, command.code);
  return { consumption: finish(subject, command, 'parked', code, reply), changed: code.changed };
}
