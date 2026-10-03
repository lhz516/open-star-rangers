/**
 * Read-only UI state for the P1 synthetic demo: the latest Core projection, session status, and
 * command feedback. The marker scene is invented, not original-game behaviour. Only the session
 * bridge and feedback code receive the writer; React receives the reader. Projections and events
 * arrive deeply frozen from Core; errors are kept as opaque references. Contract:
 * docs/plan/p1/06/spec.md.
 */
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type {
  Command, CommandRejectedEvent, MarkerAddedEvent, MarkerRemovedEvent, SyntheticUiProjection,
} from '../../core/synthetic/synthetic-scene.ts';
import type { GameSessionError } from '../../app/session/session-errors.ts';
import type { SessionCommandsCancelled, SessionControl, SessionStatus } from '../../app/session/synthetic-session.ts';

/** Display retention for settled commands, not a game rule. */
export const RECENT_RESULT_LIMIT = 10;

export interface UiPendingCommand {
  readonly runId: number;
  readonly commandId: number;
  readonly commandType: Command['type'];
}

export type UiCommandOutcome =
  | { readonly outcome: 'accepted'; readonly event: MarkerAddedEvent | MarkerRemovedEvent }
  | { readonly outcome: 'rejected'; readonly event: CommandRejectedEvent }
  | { readonly outcome: 'cancelled'; readonly reason: SessionCommandsCancelled['reason'] }
  | { readonly outcome: 'unconfirmed'; readonly reason: 'session-failed' };

/** UI interpretation of a received notification; not a domain event. */
export type UiCommandResult = UiPendingCommand & UiCommandOutcome;

export type UiCommandSettlement = Pick<UiPendingCommand, 'runId' | 'commandId'> & UiCommandOutcome;

export interface UiActionError {
  readonly operation: Command['type'] | SessionControl['type'] | 'initialize' | 'cleanup';
  readonly cause: unknown;
}

export interface SyntheticGameState {
  /** Null only before a session controller exists. */
  readonly status: SessionStatus | null;
  /** Null when there is no current world; not the same as an absent marker. */
  readonly projection: SyntheticUiProjection | null;
  readonly pendingCommands: readonly UiPendingCommand[];
  /** Oldest first. */
  readonly recentResults: readonly UiCommandResult[];
  readonly actionError: UiActionError | null;
  readonly sessionError: GameSessionError | null;
}

export type SyntheticGameStoreReader = Pick<StoreApi<SyntheticGameState>, 'getState' | 'getInitialState' | 'subscribe'>;

/** One atomic store transition; omitted fields keep their values. */
export interface SyntheticGameChange extends Partial<Pick<SyntheticGameState, 'status' | 'projection' | 'actionError' | 'sessionError'>> {
  /** Clears run-scoped pending commands and results before the rest of the change applies. */
  readonly clearRun?: boolean;
  readonly addPending?: UiPendingCommand;
  /**
   * Ends each matching pending command once, in the given order. Unknown or already settled IDs
   * are ignored, so they never create results.
   */
  readonly settle?: readonly UiCommandSettlement[];
}

export interface SyntheticGameStoreWriter {
  readonly reader: SyntheticGameStoreReader;
  /**
   * Applies the whole change with at most one subscriber notification and none when nothing
   * changed. Returns the number of pending commands settled.
   */
  commit(change: SyntheticGameChange): number;
}

const EMPTY: readonly never[] = Object.freeze([]);

const INITIAL_STATE: SyntheticGameState = Object.freeze({
  status: null, projection: null, pendingCommands: EMPTY, recentResults: EMPTY, actionError: null, sessionError: null,
});

/** Freezes a list this module just built, sharing one empty list. */
function ownList<T>(items: T[]): readonly T[] {
  return items.length === 0 ? EMPTY : Object.freeze(items);
}

/** Session statuses are already frozen; anything else is copied so readers cannot mutate it. */
function freezeStatus(status: SessionStatus | null): SessionStatus | null {
  return status === null || Object.isFrozen(status) ? status : Object.freeze({ ...status });
}

export function createSyntheticGameStore(): SyntheticGameStoreWriter {
  const store = createStore<SyntheticGameState>()(() => INITIAL_STATE);
  const reader: SyntheticGameStoreReader = Object.freeze({
    getState: store.getState, getInitialState: store.getInitialState, subscribe: store.subscribe,
  });
  return Object.freeze({
    reader,
    commit(change: SyntheticGameChange): number {
      const state = store.getState();
      let { status, projection, actionError, sessionError } = state;
      if (change.status !== undefined && change.status !== status) status = freezeStatus(change.status);
      if (change.projection !== undefined) projection = change.projection;
      if (change.sessionError !== undefined) sessionError = change.sessionError;
      if (change.actionError !== undefined && change.actionError !== actionError) {
        actionError = change.actionError && Object.freeze({ operation: change.actionError.operation, cause: change.actionError.cause });
      }
      let pendingCommands = change.clearRun ? EMPTY : state.pendingCommands;
      let recentResults = change.clearRun ? EMPTY : state.recentResults;
      if (change.addPending) {
        const { runId, commandId, commandType } = change.addPending;
        pendingCommands = ownList([...pendingCommands, Object.freeze({ runId, commandId, commandType })]);
      }
      const settled: UiCommandResult[] = [];
      if (change.settle && change.settle.length > 0) {
        const remaining = [...pendingCommands];
        for (const settlement of change.settle) {
          const index = remaining.findIndex(entry => entry.runId === settlement.runId && entry.commandId === settlement.commandId);
          if (index < 0) continue;
          settled.push(Object.freeze({ ...remaining[index], ...settlement }) as UiCommandResult);
          remaining.splice(index, 1);
        }
        if (settled.length > 0) {
          pendingCommands = ownList(remaining);
          recentResults = ownList([...recentResults, ...settled].slice(-RECENT_RESULT_LIMIT));
        }
      }
      if (
        status !== state.status || projection !== state.projection || actionError !== state.actionError
        || sessionError !== state.sessionError || pendingCommands !== state.pendingCommands || recentResults !== state.recentResults
      ) {
        store.setState(Object.freeze({ status, projection, pendingCommands, recentResults, actionError, sessionError }), true);
      }
      return settled.length;
    },
  });
}

// Scalar selectors keep subscribers that need one fact from re-running on every projection.
export const selectPhase = (state: SyntheticGameState) => state.status?.phase ?? null;
export const selectRunId = (state: SyntheticGameState) => state.status?.runId ?? null;
export const selectTick = (state: SyntheticGameState) => state.projection?.tick ?? null;
export const selectMarkerId = (state: SyntheticGameState) => state.projection?.marker?.id ?? null;
