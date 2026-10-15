/**
 * Read-only UI state of one mission owner (docs/plan/p3/04/spec.md: UI 桥接与命令反馈): the session status, the
 * sampled projection, the mission flow position, pending commands with their recent results, and operation errors.
 * One store serves one owner, whose ownerId it keeps; every pending command and result carries that ownerId with its
 * runId and commandId. Only the session bridge, the command feedback and the owner's assembly receive the writer;
 * React receives the reader. Each transition is one atomic, frozen write. Core projections and events arrive deeply
 * frozen; errors are kept as opaque references.
 */
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { CancelReason, GameSessionStatus } from '../../app/session/game-session.ts';
import type { GameSessionError } from '../../app/session/session-errors.ts';
import type { AcceptedCommandResult, UnacceptedCommandResult } from '../../core/contracts/domain-events.ts';
import type { CommandType } from '../../core/contracts/tick-input.ts';
import type { BaseServiceView, Projection } from '../../core/projections/projection.ts';

/** Display retention for settled commands (as P1-06), not a game rule. */
export const RECENT_RESULT_LIMIT = 10;

/** The identity a command result is matched by: a commandId is unique only within one owner's run. */
export interface UiCommandKey {
  readonly ownerId: number;
  readonly runId: number;
  readonly commandId: number;
}

export interface UiPendingCommand extends UiCommandKey {
  readonly commandType: CommandType;
}

/** The UI's reading of a notification it received; not a domain event. */
export type UiCommandOutcome =
  | { readonly outcome: 'accepted'; readonly reason: null; readonly event: AcceptedCommandResult }
  | { readonly outcome: 'rejected' | 'ignored'; readonly reason: UnacceptedCommandResult['reason']; readonly event: UnacceptedCommandResult }
  /** The session dropped the command unexecuted. */
  | { readonly outcome: 'cancelled'; readonly reason: CancelReason }
  /** The run faulted before the command's result arrived: it may have run. */
  | { readonly outcome: 'unconfirmed'; readonly reason: 'session-failed' };

export type UiCommandResult = UiPendingCommand & UiCommandOutcome;

export type UiCommandSettlement = UiCommandKey & UiCommandOutcome;

export interface UiActionError {
  /** The command type, session control or owner action that failed synchronously. */
  readonly operation: string;
  readonly cause: unknown;
}

export interface GameUiState<Flow = unknown> {
  readonly ownerId: number;
  /** Null until the bridge has bound a session. */
  readonly status: GameSessionStatus | null;
  /** Null without a current run; once faulted, the last complete read model. */
  readonly projection: Projection | null;
  /** The mission flow position the owner publishes; null until it does. */
  readonly flow: Flow | null;
  /** Oldest first. */
  readonly pendingCommands: readonly UiPendingCommand[];
  /** Oldest first, at most RECENT_RESULT_LIMIT. */
  readonly recentResults: readonly UiCommandResult[];
  readonly actionError: UiActionError | null;
  readonly sessionError: GameSessionError | null;
}

export type GameStoreReader<Flow = unknown> = Pick<StoreApi<GameUiState<Flow>>, 'getState' | 'getInitialState' | 'subscribe'>;

/** One atomic transition; omitted fields keep their values. */
export interface GameChange<Flow = unknown> extends Partial<Pick<GameUiState<Flow>, 'status' | 'projection' | 'flow' | 'actionError' | 'sessionError'>> {
  /** Clears the run's pending commands and results before the rest of the change applies. */
  readonly clearRun?: boolean;
  /** Ignored if the same command is already pending. */
  readonly addPending?: Omit<UiPendingCommand, 'ownerId'>;
  /** Ends each matching pending command once, in order; unknown, settled or foreign keys create no result. */
  readonly settle?: readonly UiCommandSettlement[];
}

export interface GameStoreWriter<Flow = unknown> {
  readonly ownerId: number;
  readonly reader: GameStoreReader<Flow>;
  /**
   * Applies the whole change with at most one subscriber notification, and none when nothing changed. Returns the
   * number of pending commands settled. A flow value must be frozen.
   */
  commit(change: GameChange<Flow>): number;
}

/** The part of a writer the session bridge and its run consumers use; they never write the flow. */
export interface GameRunStore {
  readonly ownerId: number;
  readonly reader: { getState(): Omit<GameUiState, 'flow'> };
  commit(change: Omit<GameChange, 'flow'>): number;
}

const EMPTY: readonly never[] = Object.freeze([]);

/** Freezes a list this module just built, sharing one empty list. */
function ownList<T>(items: T[]): readonly T[] {
  return items.length === 0 ? EMPTY : Object.freeze(items);
}

/** Session statuses are already frozen; anything else is copied so readers cannot mutate it. */
function freezeStatus(status: GameSessionStatus | null): GameSessionStatus | null {
  return status === null || Object.isFrozen(status) ? status : Object.freeze({ ...status });
}

/** The Session builds a new status object per read, so equal fields mean the same status. */
function sameStatus(a: GameSessionStatus | null, b: GameSessionStatus | null): boolean {
  if (a === null || b === null) return a === b;
  const keys = Object.keys(a) as (keyof GameSessionStatus)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

const sameKey = (a: UiCommandKey, b: UiCommandKey) => a.ownerId === b.ownerId && a.runId === b.runId && a.commandId === b.commandId;

/** Creates the empty store of one owner; `ownerId` is that owner's positive safe integer. */
export function createGameStore<Flow = unknown>(ownerId: number): GameStoreWriter<Flow> {
  if (!Number.isSafeInteger(ownerId) || ownerId < 1) throw new RangeError('ownerId must be a positive safe integer');
  const initial: GameUiState<Flow> = Object.freeze({
    ownerId, status: null, projection: null, flow: null, pendingCommands: EMPTY, recentResults: EMPTY, actionError: null, sessionError: null,
  });
  const store = createStore<GameUiState<Flow>>()(() => initial);
  const reader: GameStoreReader<Flow> = Object.freeze({
    getState: store.getState, getInitialState: store.getInitialState, subscribe: store.subscribe,
  });
  return Object.freeze({
    ownerId,
    reader,
    commit(change: GameChange<Flow>): number {
      const state = store.getState();
      let { status, projection, flow, actionError, sessionError } = state;
      if (change.flow !== undefined && change.flow !== flow) {
        if (!Object.isFrozen(change.flow)) throw new TypeError('The mission flow value must be frozen');
        flow = change.flow;
      }
      if (change.status !== undefined && !sameStatus(change.status, status)) status = freezeStatus(change.status);
      if (change.projection !== undefined) projection = change.projection;
      if (change.sessionError !== undefined) sessionError = change.sessionError;
      if (change.actionError !== undefined && change.actionError !== actionError) {
        actionError = change.actionError && Object.freeze({ operation: change.actionError.operation, cause: change.actionError.cause });
      }
      let pendingCommands = change.clearRun ? EMPTY : state.pendingCommands;
      let recentResults = change.clearRun ? EMPTY : state.recentResults;
      if (change.addPending) {
        const { runId, commandId, commandType } = change.addPending;
        const entry: UiPendingCommand = Object.freeze({ ownerId, runId, commandId, commandType });
        if (!pendingCommands.some((pending) => sameKey(pending, entry))) pendingCommands = ownList([...pendingCommands, entry]);
      }
      const settled: UiCommandResult[] = [];
      if (change.settle && change.settle.length > 0) {
        const remaining = [...pendingCommands];
        for (const settlement of change.settle) {
          const index = remaining.findIndex((pending) => sameKey(pending, settlement));
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
        status !== state.status || projection !== state.projection || flow !== state.flow || actionError !== state.actionError
        || sessionError !== state.sessionError || pendingCommands !== state.pendingCommands || recentResults !== state.recentResults
      ) {
        store.setState(Object.freeze({ ownerId, status, projection, flow, pendingCommands, recentResults, actionError, sessionError }), true);
      }
      return settled.length;
    },
  });
}

// Scalar selectors keep subscribers that need one fact from re-running on every projection.
export const selectOwnerId = (state: GameUiState) => state.ownerId;
export const selectPhase = (state: GameUiState) => state.status?.phase ?? null;
export const selectRunId = (state: GameUiState) => state.status?.runId ?? null;
export const selectTick = (state: GameUiState) => state.projection?.clock.tick ?? null;

/** The base service the projection shows in the base view (P3-10, G-05); null outside it or without the partition. */
export const projectedBase = ({ communications }: Projection): BaseServiceView | null =>
  (communications.readiness === 'ready' ? communications.player?.base ?? null : null);
