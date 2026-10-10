/**
 * Command submission and result feedback (docs/plan/p3/04/spec.md: UI 桥接与命令反馈). Entering the queue is not
 * success: a command is pending only once the run returned its commandId, and settles once, from its own
 * `command-result` (accepted, rejected or ignored, with the outcome and reason), from the session's cancellation
 * notice with its reason, or, when the run faults first, as unconfirmed. Results are matched by ownerId, runId and
 * commandId; unknown, repeated, foreign or null IDs give this consumer no result, and nothing is resubmitted. Core
 * results are held until the end of their frame and written with the frame-end projection, never optimistically. The
 * run's end clears them.
 */
import type { CommandResultEvent } from '../../core/contracts/domain-events.ts';
import type { Command, CommandType } from '../../core/contracts/tick-input.ts';
import type { GameRunStore, UiCommandKey, UiCommandSettlement, UiPendingCommand } from './game-store.ts';
import type { GameRunBinding, GameRunConsumer } from './game-session-bridge.ts';

export interface GameCommandFeedback extends GameRunConsumer {
  /**
   * Submits a command to the current run and tracks it as pending; returns its commandId. A synchronous failure
   * becomes actionError with its original cause, and returns null without a pending entry.
   */
  submit(command: Command): number | null;
}

function resultOf(key: UiCommandKey, event: CommandResultEvent): UiCommandSettlement {
  // One branch per outcome keeps each reason typed with its event.
  return event.outcome === 'accepted'
    ? { ...key, outcome: event.outcome, reason: event.reason, event }
    : { ...key, outcome: event.outcome, reason: event.reason, event };
}

/**
 * The command's own `type` data field, read as Core reads commands (no accessor runs); null for anything else. A
 * command the run accepted had this very field.
 */
function typeOf(command: unknown): string | null {
  if (typeof command !== 'object' || command === null) return null;
  try {
    const field = Object.getOwnPropertyDescriptor(command, 'type');
    return field && 'value' in field && typeof field.value === 'string' ? field.value : null;
  } catch {
    return null;
  }
}

class CommandFeedback implements GameCommandFeedback {
  readonly #store: GameRunStore;
  #binding: GameRunBinding | null = null;
  /** Results received during the current frame's event delivery. */
  #held: UiCommandSettlement[] = [];
  /** The commandIds pending for the binding's run, rebuilt only when the store's pending list changes. */
  #pending: { readonly list: readonly UiPendingCommand[]; readonly runId: number; readonly ids: ReadonlySet<number> } | null = null;

  constructor(store: GameRunStore) {
    this.#store = store;
  }

  attach(binding: GameRunBinding): void {
    if (binding.ownerId !== this.#store.ownerId) throw new Error('Command feedback attaches only to its own owner\'s runs');
    this.#binding = binding;
    this.#held = [];
    const { run, ownerId, runId } = binding;
    binding.own(run.on('command-result', (event, { commandId }) => {
      if (commandId !== null && this.#isPending(runId, commandId)) this.#held.push(resultOf({ ownerId, runId, commandId }, event));
    }));
    binding.own(run.onCommandsCancelled(({ runId: noticeRun, commandIds, reason }) => {
      if (noticeRun !== runId) return;
      const cancelled = commandIds.filter((commandId) => this.#isPending(runId, commandId))
        .map((commandId): UiCommandSettlement => ({ ownerId, runId, commandId, outcome: 'cancelled', reason }));
      // Results are still held only if their frame failed: they settled first, with that frame's read model.
      const held = this.#take(binding);
      if (held.length + cancelled.length > 0) binding.commit({ settle: [...held, ...cancelled] }, held.length > 0);
    }));
  }

  frameEnd(binding: GameRunBinding): readonly UiCommandSettlement[] {
    return this.#take(binding);
  }

  /**
   * Results already received come first. Commands still pending when the run faults may have run in a tick whose
   * events the fault withheld (the Runtime's `unconfirmed`); commands provably not run were cancelled before this.
   */
  faulted(binding: GameRunBinding): readonly UiCommandSettlement[] {
    const unconfirmed = this.#store.reader.getState().pendingCommands
      .filter((pending) => pending.ownerId === binding.ownerId && pending.runId === binding.runId)
      .map(({ ownerId, runId, commandId }): UiCommandSettlement => ({ ownerId, runId, commandId, outcome: 'unconfirmed', reason: 'session-failed' }));
    return [...this.#take(binding), ...unconfirmed];
  }

  submit(command: Command): number | null {
    const type = typeOf(command);
    const operation = type ?? 'command';
    const binding = this.#binding;
    if (!binding) {
      this.#store.commit({ actionError: { operation, cause: new Error('No run has started') } });
      return null;
    }
    let commandId: number;
    try {
      commandId = binding.submitCommand(command);
    } catch (cause) {
      this.#store.commit({ actionError: { operation, cause } });
      return null;
    }
    // Only the current running run accepts a command, so the binding is current and the entry belongs to it.
    binding.commit({ actionError: null, addPending: { runId: binding.runId, commandId, commandType: type as CommandType } });
    return commandId;
  }

  #take(binding: GameRunBinding): UiCommandSettlement[] {
    if (binding !== this.#binding || this.#held.length === 0) return [];
    const held = this.#held;
    this.#held = [];
    return held;
  }

  #isPending(runId: number, commandId: number): boolean {
    const list = this.#store.reader.getState().pendingCommands;
    let pending = this.#pending;
    if (pending?.list !== list || pending.runId !== runId) {
      const ownerId = this.#store.ownerId;
      const ids = new Set(list.filter((entry) => entry.ownerId === ownerId && entry.runId === runId).map((entry) => entry.commandId));
      pending = this.#pending = { list, runId, ids };
    }
    return pending.ids.has(commandId);
  }
}

/** Creates the command consumer of the owner of `store`; pass it to that owner's bridge and call `submit` from the UI. */
export function createGameCommandFeedback(store: GameRunStore): GameCommandFeedback {
  return new CommandFeedback(store);
}
