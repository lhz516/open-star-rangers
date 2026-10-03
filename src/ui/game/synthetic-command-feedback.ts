/**
 * Command submission and Core result feedback for the synthetic dev panel. Entering the queue is
 * not success: a pending command settles only from Core's own domain event, matched by the
 * Runtime command ID of the current run. The UI does not duplicate marker rules. Contract:
 * docs/plan/p1/06/spec.md.
 */
import type { Command, DomainEvent } from '../../core/synthetic/synthetic-scene.ts';
import type { SessionCleanup } from '../../app/session/session-host.ts';
import type { SyntheticGameStoreWriter, UiCommandSettlement } from './synthetic-game-store.ts';
import type { SyntheticRunBinding, SyntheticRunConsumer } from './synthetic-session-bridge.ts';

export interface SyntheticCommandFeedback extends SyntheticRunConsumer {
  /**
   * Submits a command to the current run and tracks it as pending. A synchronous failure becomes
   * actionError with its original cause and no command ID.
   */
  submit(type: Command['type']): void;
}

function settlementFor(runId: number, commandId: number, event: DomainEvent): UiCommandSettlement {
  return event.type === 'command-rejected'
    ? { runId, commandId, outcome: 'rejected', event }
    : { runId, commandId, outcome: 'accepted', event };
}

class CommandFeedback implements SyntheticCommandFeedback {
  readonly #store: SyntheticGameStoreWriter;
  #binding: SyntheticRunBinding | null = null;

  constructor(store: SyntheticGameStoreWriter) {
    this.#store = store;
  }

  attach(binding: SyntheticRunBinding): readonly SessionCleanup[] {
    this.#binding = binding;
    return [binding.run.onAny((event, { commandId }) => {
      // Events from other consumers' commands match no pending entry but still refresh the projection.
      binding.commit({ settle: [settlementFor(binding.runId, commandId, event)] }, true);
    })];
  }

  submit(type: Command['type']): void {
    const binding = this.#binding;
    if (!binding) {
      this.#store.commit({ actionError: { operation: type, cause: new Error('No synthetic run has started') } });
      return;
    }
    let commandId: number;
    try {
      commandId = binding.submitCommand({ type });
    } catch (cause) {
      this.#store.commit({ actionError: { operation: type, cause } });
      return;
    }
    // Only the current running run accepts a command, so the pending entry belongs to it.
    this.#store.commit({ actionError: null, addPending: { runId: binding.runId, commandId, commandType: type } });
  }
}

/** Creates the command consumer; pass it to the session bridge and call `submit` from the UI. */
export function createSyntheticCommandFeedback(store: SyntheticGameStoreWriter): SyntheticCommandFeedback {
  return new CommandFeedback(store);
}
