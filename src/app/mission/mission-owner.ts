/**
 * The mission owner (docs/plan/p3/04/spec.md: S-03, S-04, S-05; 应用流程, 任务开始配置, 衔接占位, 任务菜单、暂停与退出,
 * 消费者接线与释放, 离页保护). One owner serves one visit of the mission screen; the app's mission slot creates it and
 * releases it before the next exists. It is DOM-free: host capabilities arrive as ports, and React reads its snapshot.
 *
 * - **Binding:** the owner binds the holder's package of one generation and content identity when it opens and checks it
 *   again when the start is confirmed; the run is created only from that package's three logic Assets, its craft info
 *   (P3-06 D-01) and its rule-data inputs (docs/plan/p3/02/spec.md, CR-01), with the models of the craft the run can
 *   instantiate. One of these the package lacks or that does not decode fails each start as world creation's refusal
 *   does.
 * - **Flow:** G-02/1, the start page, G-02/2 over a run held at tick 0, flight, G-02/3 and G-02/4 over a run held after
 *   a transition tick (运行中衔接（P3-10 的修订）), the pausing mission menu, and the end of a run that faulted or stopped
 *   (`mission-flow.ts`). Restart exits the run and begins again at G-02/1.
 * - **Placeholders:** one one-shot timer at a time, checked against the monotonic clock, counts 3,000 ms of time the
 *   session reports as visible without pagehide; hidden time keeps the remainder and revokes the timer. Each placeholder
 *   ends once, naturally or by skip; a timer or clock failure stops it visibly, and only leaving the screen follows. A
 *   running hold shows one placeholder per item of the session's sequence, whose end completes that item with this
 *   owner's session, the runId and the item's transitionId; a late timer or a repeated skip finds no placeholder of its
 *   own to end.
 * - **Ownership:** the session, its run-level consumers (released by the session, newest first, when each run ends),
 *   owner-level consumers by stage, and one leave-page guard while a run exists. Release order: input and timers,
 *   session, UI bridge and diagnostics, leave guard, then picture, audio and the like; every step is attempted and any
 *   failure latches. An asynchronous close joins the slot's close barrier.
 * - **Input control (P3-04 spec as revised for P3-05, 消费者接线与释放):** `input` consumers alone get a port whose calls
 *   bind one run: they clear the run's input, toggle its pause and open the mission menu through the owner's own
 *   actions, and are refused once the owner is released or the run is no longer the session's. The toggle and the menu
 *   are intents, refused too inside another intent or a callback of the session.
 */
import type { AssetId } from '../../content/asset-id.ts';
import { contentIdentityKey, type ContentIdentity } from '../../content/content-identity.ts';
import { loadMission } from '../../core/mission/load-mission.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import { PRODUCTION_RAW_DIFFICULTY } from '../../core/world/run-config.ts';
import { missionFailureOf, type MissionFailure } from '../resources/mission-diagnostics.ts';
import { craftInfoInput, missionInput, ruleDataInputs, runModelInputs, type RuleDataInputs } from '../resources/mission-input.ts';
import type { HeldPackage, ResourceHolder } from '../resources/resource-holder.ts';
import {
  createGameSession, type ClearInputReason, type DepartureTransition, type GameRunSpec, type GameSession, type GameSessionControl,
  type GameSessionRun, type GameSessionStatus,
} from '../session/game-session.ts';
import { RollbackError } from '../session/rollback-error.ts';
import { GameSessionError } from '../session/session-errors.ts';
import type { SessionHost, SessionLifecycleEvent } from '../session/session-host.ts';
import { missionEligibility, type MissionEligibility } from './mission-eligibility.ts';
import {
  INITIAL_MISSION_FLOW, nextMissionFlow, preselectWingman, type ConfirmedSelection, type MissionFlowInput, type MissionFlowState,
  type MissionStartFailure,
} from './mission-flow.ts';
import type { LeaveGuard, MonotonicClock, OneShotTimer, Revoke, SeedSource } from './mission-ports.ts';

/** How long each placeholder shows while visible: a project presentation choice, not an original duration. */
export const PLACEHOLDER_MS = 3_000;

/** Development builds record every run from tick 0 with a checkpoint every 32 ticks; production records nothing. */
export const DEVELOPMENT_CHECKPOINT_INTERVAL = 32;

/** The recording options of a development build; `producer` names the app, its version and build mode. */
export const developmentRecording = (producer: string): RecordingOptions => Object.freeze({ producer, checkpointInterval: DEVELOPMENT_CHECKPOINT_INTERVAL });

/** When an owner-level resource is released, in this order between the session and the leave guard. */
export type MissionOwnerStage = 'input' | 'ui' | 'media';
const STAGES: readonly MissionOwnerStage[] = ['input', 'ui', 'media'];
const CLEAR_INPUT_REASONS: readonly ClearInputReason[] = ['focus-loss', 'pointer-lock-exit'];

/** What owner-level consumers see of the session: no control, frame or Core access beyond the public run handle. */
export type MissionSessionView = Pick<GameSession, 'status' | 'currentRun' | 'onStatus'>;

export interface MissionOwnerContext {
  readonly ownerId: number;
  readonly session: MissionSessionView;
  /**
   * Settles once every resource earlier owners of the slot closed asynchronously is confirmed closed: true, or false
   * when a close failed, which latched the slot. A consumer that recreates such a resource waits for it.
   */
  readonly previousClosed: Promise<boolean>;
}

/**
 * The input control port of one owner (docs/plan/p3/04/spec.md: 消费者接线与释放): no start, exit or step. Every call
 * through an owner that began its release, or for a run that is no longer its session's, throws a GameSessionError of
 * kind `invalid-state` and touches nothing, so it never reaches a later run.
 */
export interface MissionInputControl {
  /** The port of run `runId`, which must be the session's run: a run consumer takes it when its run is wired. */
  forRun(runId: number): MissionRunInputControl;
}

/** The input control of one run. */
export interface MissionRunInputControl {
  /**
   * Sends the session one `clear-input` while the run is running; pausing, holding, stopping and faulting cleared it
   * already, so elsewhere it does nothing. Throws what that control throws: the session refuses it in a status or
   * cancellation notification and applies it after a frame's notification.
   */
  clearInput(reason: ClearInputReason): void;
  /**
   * In flight, the owner's `pause` while running and its `resume` while paused by the user or a hidden page, with their
   * feedback: a resume the hidden page refuses keeps the run paused. Nothing in the menu, the departure or a run that
   * ended. As an intent it is for event handlers: while the owner applies another intent, or the session delivers a
   * frame, a page lifecycle event or this port's `clear-input`, it throws `invalid-state` and changes nothing.
   */
  togglePause(): void;
  /** The owner's `openMenu`, with its conditions and feedback; refused where `togglePause` is. */
  openMenu(): void;
}

/** What a consumer at the `input` stage connects with: the owner context and the input control port. */
export interface MissionInputContext extends MissionOwnerContext {
  readonly control: MissionInputControl;
}

export interface MissionRunContext {
  readonly ownerId: number;
  readonly runId: number;
}

/** One owner-level resource a consumer acquired for an owner. */
export interface MissionConsumerConnection {
  /**
   * Releases the resource at its stage, once. Throwing is a cleanup failure. A thenable result is an asynchronous close:
   * it resolves once the close is confirmed and rejects when the close failed.
   */
  release(): unknown;
  /**
   * Wires run-level consumers to each new run while it is held for its departure, handing every cancellation to
   * `run.ownCleanup`; the session releases them, newest first, when the run ends. Throwing fails the start, whose
   * rollback exits the run.
   */
  attachRun?(run: GameSessionRun, context: MissionRunContext): void;
  /** Receives the session's asynchronous errors; it must not control the session. */
  onSessionError?(error: GameSessionError): void;
}

/**
 * An owner-level consumer at stage `S`: `connect` is called once while the owner is created, and throwing fails the
 * creation, which releases what was acquired before. Only a consumer at the `input` stage gets the input control port,
 * which `MissionOwnerConsumer<'input'>` types.
 */
export interface MissionOwnerConsumer<S extends MissionOwnerStage = MissionOwnerStage> {
  readonly stage: S;
  connect(context: S extends 'input' ? MissionInputContext : MissionOwnerContext): MissionConsumerConnection;
}

/** What the app gives each owner. */
export interface MissionOwnerSetup {
  readonly holder: ResourceHolder;
  /** The host of this owner's session; development may wrap it to time each frame. */
  readonly host: SessionHost;
  readonly seed: SeedSource;
  readonly clock: MonotonicClock;
  readonly timer: OneShotTimer;
  readonly leaveGuard: LeaveGuard;
  /** `developmentRecording(producer)` in development, null in production; the owner never reads the build mode. */
  readonly recording: RecordingOptions | null;
  readonly consumers?: readonly MissionOwnerConsumer[];
  /** Receives failures nothing else shows, such as a failing snapshot listener; its own failure is dropped. */
  readonly reportError: (error: unknown) => void;
}

/** What the mission slot gives each owner. */
export interface MissionOwnerLink {
  readonly ownerId: number;
  readonly previousClosed: Promise<boolean>;
  /** The selection a run last started with in this app instance. */
  readonly confirmed: () => ConfirmedSelection | null;
  readonly confirm: (selection: ConfirmedSelection) => void;
  /** Receives the owner's first cleanup failure. */
  readonly onCleanupFailure: (cause: unknown) => void;
  /** The holder is about to replace the bound package: the slot releases this owner. */
  readonly onReplace: () => void;
  /** The owner's release closed asynchronously; settles as `MissionOwnerRelease.closed`. */
  readonly onClosing: (closed: Promise<boolean>) => void;
}

export interface MissionWingmanOption {
  /** The roster option index Core accepts as the run's wingman. */
  readonly index: number;
  /** As imported; plain text for display, never markup. Empty when the option has none. */
  readonly nameCandidates: readonly string[];
}

/** What the start page shows of the bound package's mission. */
export interface MissionConfigView {
  readonly mission: AssetId;
  readonly campaign: { readonly group: number; readonly slot: number };
  /** Fixed (G-07). */
  readonly rawDifficulty: number;
  /** In roster order. */
  readonly wingmanOptions: readonly MissionWingmanOption[];
}

export interface MissionPlaceholder {
  /** Unique within the owner; skips name the placeholder they were meant for. */
  readonly id: number;
  readonly gap: 'G-02/1' | 'G-02/2';
  /** The departure's variant, by the run's wingman; null for G-02/1. */
  readonly variant: DepartureTransition['variant'] | null;
  /** `waiting` while the environment is not visible; `failed` after a timer or clock failure, which `failure` holds. */
  readonly status: 'timing' | 'waiting' | 'failed';
  readonly failure: { readonly cause: unknown } | null;
}

/** The placeholder of one item of a running hold (G-02/3 docking, G-02/4 launch), bound to its run and transition. */
export interface MissionTransitionPlaceholder {
  /** From the same sequence as `MissionPlaceholder.id`; `skip` takes either. */
  readonly id: number;
  readonly gap: 'G-02/3' | 'G-02/4';
  readonly runId: number;
  /** The session's transitionId of this item. */
  readonly transitionId: number;
  /** The item's position in its tick's sequence, from 0, and the sequence's length. */
  readonly index: number;
  readonly count: number;
  readonly status: MissionPlaceholder['status'];
  readonly failure: MissionPlaceholder['failure'];
}

export type MissionOperation = 'pause' | 'resume' | 'open-menu' | 'continue' | 'restart' | 'complete-departure' | 'complete-transition';

export interface MissionOwnerSnapshot {
  readonly ownerId: number;
  readonly released: boolean;
  readonly config: MissionConfigView;
  readonly flow: MissionFlowState;
  /** G-02/1 or G-02/2 while one shows. */
  readonly placeholder: MissionPlaceholder | null;
  /** The current item of a running hold while the flow is at `transition`. */
  readonly transitionPlaceholder: MissionTransitionPlaceholder | null;
  /** The session's latest status. */
  readonly session: GameSessionStatus;
  /** Why the last action failed; cleared by the next action. */
  readonly actionError: { readonly operation: MissionOperation; readonly cause: unknown } | null;
  /** The owner's first cleanup failure: only leaving the screen remains. */
  readonly cleanupFailure: { readonly cause: unknown } | null;
}

/** What one release left: its synchronous failures, and when its asynchronous closes are confirmed. */
export interface MissionOwnerRelease {
  readonly failures: readonly unknown[];
  /** True once every asynchronous close is confirmed; false when one failed, which latched. */
  readonly closed: Promise<boolean>;
}

/**
 * User intents, for event handlers rather than session notifications. Each applies only where the flow offers it and is
 * ignored elsewhere, after release, and while another intent is being applied.
 */
export interface MissionOwner {
  readonly ownerId: number;
  /** Frozen, the same object until the next change; bound, as `subscribe` is. */
  getSnapshot(): MissionOwnerSnapshot;
  subscribe(listener: () => void): () => void;
  /** Ends the named placeholder early, once: the button, or a new Enter, Space or Esc press in its scope. */
  skip(placeholderId: number): void;
  /** Edits the start page's selection: null or a listed option index; throws a RangeError for anything else. */
  select(wingman: number | null): void;
  /** Confirms the start page: one world from the bound package, a new seed and the selection, held for G-02/2. */
  start(): void;
  pause(): void;
  /** Resumes a paused flight; the mission menu continues with `continueFromMenu` instead. */
  resume(): void;
  /** Pauses a running flight first; a paused one keeps its reason. */
  openMenu(): void;
  /** Resumes, and closes the menu only when that succeeded. */
  continueFromMenu(): void;
  /** Exits the run and, once every cleanup succeeded, begins again at G-02/1 with the selection kept. */
  restart(): void;
  /** For the mission slot: releases everything in order, once; repeated calls return the first result. */
  release(): MissionOwnerRelease;
}

/** The owner could not open: the package is not eligible to start. Nothing was acquired. */
export class MissionUnavailableError extends Error {
  readonly eligibility: Exclude<MissionEligibility, { readonly status: 'eligible' }>;
  constructor(eligibility: Exclude<MissionEligibility, { readonly status: 'eligible' }>) {
    super(`The mission cannot start: ${eligibility.status}`);
    this.name = 'MissionUnavailableError';
    this.eligibility = eligibility;
  }
}

/** World creation refused the content or the run configuration; null for every other start failure. */
const creationRefusal = (error: unknown): MissionFailure | null =>
  (error instanceof GameSessionError && error.kind === 'invalid-argument' ? missionFailureOf(error.cause) : null);

/** The content world creation takes from the bound package beside the logic Assets, whatever the run. */
type PackageContent = Pick<GameRunSpec, 'craftInfo' | keyof RuleDataInputs>;

type Decoded<Value> = { readonly input: Value } | { readonly failure: MissionFailure };

/**
 * What `decode` returns, or the failure each start reports for a content or Core input error it throws. Diagnostics
 * do not read these Assets; one the package lacks stays undefined, which world creation rejects at its input position.
 */
function decoded<Value>(decode: () => Value): Decoded<Value> {
  try {
    return Object.freeze({ input: decode() });
  } catch (error) {
    const failure = missionFailureOf(error);
    if (failure) return Object.freeze({ failure });
    throw error;
  }
}

/** One failure as it is, several as an AggregateError led by the first. */
const combined = (failures: readonly unknown[], message: string): unknown =>
  (failures.length === 1 ? failures[0] : new AggregateError(failures, message, { cause: failures[0] }));

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';

const isUint32 = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;

/** What a placeholder shows besides its id and timing status. */
type PlaceholderPage =
  | Pick<MissionPlaceholder, 'gap' | 'variant'>
  | Pick<MissionTransitionPlaceholder, 'gap' | 'runId' | 'transitionId' | 'index' | 'count'>;
type HoldPage = Extract<PlaceholderPage, { readonly transitionId: number }>;
const isHold = (page: PlaceholderPage): page is HoldPage => 'transitionId' in page;

/** One placeholder's timing; `token` identifies the scheduled callback, so a cancelled or late one does nothing. */
interface Timing {
  readonly id: number;
  readonly page: PlaceholderPage;
  remainingMs: number;
  /** The clock reading at which the current visible stretch began; null while not timing. */
  since: number | null;
  handle: number | null;
  token: object | null;
  failure: { readonly cause: unknown } | null;
}

interface Connection {
  readonly stage: MissionOwnerStage;
  readonly connection: MissionConsumerConnection;
}

class Owner implements MissionOwner {
  readonly ownerId: number;
  readonly #setup: MissionOwnerSetup;
  readonly #link: MissionOwnerLink;
  readonly #generation: number;
  readonly #identity: ContentIdentity;
  readonly #identityKey: string;
  readonly #assets: Pick<GameRunSpec, 'mission' | 'craftTypes' | 'wingmanRoster'>;
  /** The craft info and rule-data inputs as decoded from the bound package, or the failure every start reports instead. */
  readonly #content: Decoded<PackageContent>;
  readonly #config: MissionConfigView;
  readonly #session: GameSession;
  readonly #connections: Connection[] = [];
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  #stopStatus: (() => void) | null = null;
  #stopReplace: (() => void) | null = null;
  #flow: MissionFlowState = INITIAL_MISSION_FLOW;
  #timing: Timing | null = null;
  #placeholders = 0;
  #revokeGuard: Revoke | null = null;
  #actionError: MissionOwnerSnapshot['actionError'] = null;
  #cleanupFailure: { readonly cause: unknown } | null = null;
  #lastNow = -Infinity;
  #acting = false;
  /** Above zero while the session runs a frame or lifecycle callback of its host, or the port's `clear-input`. */
  #inSession = 0;
  #released: MissionOwnerRelease | null = null;
  #snapshot!: MissionOwnerSnapshot;
  /** The port `input` consumers connect with; each run's port checks its owner and run before every call. */
  readonly #inputControl: MissionInputControl = Object.freeze({
    forRun: (runId: number): MissionRunInputControl => {
      this.#guard('forRun', runId, false);
      return Object.freeze({
        clearInput: (reason: ClearInputReason) => { this.#clearInput(runId, reason); },
        togglePause: () => {
          // The owner's actions apply only in flight; elsewhere they do nothing.
          if (this.#guard('togglePause', runId, true) === 'running') this.pause();
          else this.resume();
        },
        openMenu: () => {
          this.#guard('openMenu', runId, true);
          this.openMenu();
        },
      });
    },
  });

  constructor(setup: MissionOwnerSetup, link: MissionOwnerLink) {
    this.ownerId = link.ownerId;
    this.#setup = setup;
    this.#link = link;
    const { holder } = setup;
    const eligibility = missionEligibility(holder.getSnapshot(), null);
    if (eligibility.status !== 'eligible') throw new MissionUnavailableError(eligibility);
    const held: HeldPackage | null = holder.current();
    if (!held || held.generation !== eligibility.generation || held.completeness.status !== 'complete') {
      throw new Error('The held package differs from the holder snapshot');
    }
    // Decoded once from this generation's package; diagnostics loaded the same Assets, so a failure here is a defect.
    const logic = held.groups.find(({ group }) => group === 'logic')!;
    const input = missionInput(logic);
    const mission = loadMission(input);
    this.#content = decoded(() => ({ craftInfo: craftInfoInput(logic), ...ruleDataInputs(held.groups) }) as PackageContent);
    this.#generation = held.generation;
    this.#identity = held.completeness.identity;
    this.#identityKey = contentIdentityKey(this.#identity);
    this.#assets = { mission: input.mission, craftTypes: input.craftTypes, wingmanRoster: input.wingmanRoster };
    this.#config = Object.freeze({
      mission: mission.mission,
      campaign: Object.freeze({ group: mission.campaign.group, slot: mission.campaign.slot }),
      rawDifficulty: PRODUCTION_RAW_DIFFICULTY,
      wingmanOptions: Object.freeze(mission.wingmanOptions.map(({ nameCandidates }, index) => Object.freeze({ index, nameCandidates }))),
    });
    const consumers = setup.consumers ?? [];
    for (const consumer of consumers) {
      if (!STAGES.includes(consumer.stage) || typeof consumer.connect !== 'function') throw new TypeError('A mission consumer needs a stage and connect()');
    }
    const { host } = setup;
    // The same host, marking where the session runs its callbacks, so the input control port can refuse intents there.
    const session = createGameSession(Object.freeze({
      requestFrame: (callback: (nowMs: number) => undefined) => host.requestFrame((nowMs) => this.#within(() => callback(nowMs))),
      cancelFrame: (handle: number) => host.cancelFrame(handle),
      readVisibility: () => host.readVisibility(),
      subscribeLifecycle: (listener: (event: SessionLifecycleEvent) => undefined) =>
        host.subscribeLifecycle((event) => this.#within(() => listener(event))),
    }), this.#onSessionError);
    this.#session = session;
    try {
      this.#stopStatus = session.onStatus(this.#onStatus);
      this.#stopReplace = holder.beforeReplace(() => { this.#link.onReplace(); });
      const context: MissionOwnerContext = Object.freeze({
        ownerId: this.ownerId,
        session: Object.freeze({
          status: () => session.status(),
          currentRun: () => session.currentRun(),
          onStatus: (listener: (status: GameSessionStatus) => undefined) => session.onStatus(listener),
        }),
        previousClosed: link.previousClosed,
      });
      const inputContext: MissionInputContext = Object.freeze({ ...context, control: this.#inputControl });
      for (const consumer of consumers) {
        const connection = consumer.stage === 'input' ? consumer.connect(inputContext) : consumer.connect(context);
        if (typeof connection?.release !== 'function') throw new TypeError('A mission consumer connection needs release()');
        this.#connections.push({ stage: consumer.stage, connection });
      }
    } catch (cause) {
      // The slot latches the RollbackError, which keeps the cause with every release failure.
      const { failures } = this.#release(false);
      if (failures.length > 0) throw new RollbackError(cause, failures, 'Mission owner creation and rollback failed');
      throw cause;
    }
    this.#beginPlaceholder({ gap: 'G-02/1', variant: null });
    this.#publish();
  }

  readonly getSnapshot = (): MissionOwnerSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#released) return () => undefined;
    const entry = { listener };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  };

  skip(placeholderId: number): void {
    const timing = this.#timing;
    if (!this.#ready('intro', 'departure', 'transition') || timing?.id !== placeholderId || timing.failure) return;
    this.#act(() => { this.#endPlaceholder(timing); });
  }

  select(wingman: number | null): void {
    if (!this.#ready('config')) return;
    if (wingman !== null && !(Number.isInteger(wingman) && wingman >= 0 && wingman < this.#config.wingmanOptions.length)) {
      throw new RangeError('A wingman selection is null or a listed option index');
    }
    this.#act(() => { this.#next({ type: 'select', wingman }); });
  }

  start(): void {
    if (this.#ready('config')) this.#act(() => { this.#start(); });
  }

  pause(): void {
    if (this.#ready('flight')) this.#act(() => { this.#control('pause', { type: 'pause' }); });
  }

  resume(): void {
    if (this.#ready('flight')) this.#act(() => { this.#control('resume', { type: 'resume' }); });
  }

  openMenu(): void {
    if (!this.#ready('flight')) return;
    this.#act(() => {
      if (this.#session.status().phase === 'running' && !this.#control('open-menu', { type: 'pause' })) return;
      if (this.#session.status().phase === 'paused') this.#next({ type: 'menu-opened' });
    });
  }

  continueFromMenu(): void {
    if (!this.#ready('menu')) return;
    this.#act(() => {
      if (this.#control('continue', { type: 'resume' }) && this.#session.status().phase === 'running') this.#next({ type: 'menu-closed' });
    });
  }

  restart(): void {
    if (this.#ready('flight', 'menu', 'ended')) this.#act(() => { this.#restart(); });
  }

  /**
   * Throws `invalid-state` once the owner began its release, or unless `runId` is the session's run; returns the
   * session's phase. An `intent` is refused while the owner applies another or the session runs a callback, where
   * wiring a run's port stays allowed.
   */
  #guard(operation: string, runId: number, intent: boolean): GameSessionStatus['phase'] {
    const { phase, runId: current } = this.#session.status();
    let reason: string | null = null;
    if (this.#released) reason = 'the mission owner is released';
    else if (current === null || runId !== current) reason = "requires the session's current run";
    else if (intent && (this.#acting || this.#inSession > 0)) reason = 'unavailable during a session notification or another intent';
    if (reason !== null) throw new GameSessionError({ kind: 'invalid-state', operation, phase, runId: current, reason });
    return phase;
  }

  /** Not an intent: the session's control under the port's guard, so its refusals reach the caller. */
  #clearInput(runId: number, reason: ClearInputReason): void {
    if (!CLEAR_INPUT_REASONS.includes(reason)) {
      throw new GameSessionError({ kind: 'invalid-argument', path: 'clearInput.reason', reason: "must be 'focus-loss' or 'pointer-lock-exit'" });
    }
    if (this.#guard('clearInput', runId, false) === 'running') this.#within(() => { this.#session.control({ type: 'clear-input', reason }); });
  }

  release(): MissionOwnerRelease {
    return this.#release(true);
  }

  /** `latchFailures` is false only for a creation's rollback, whose failures the thrown RollbackError carries. */
  #release(latchFailures: boolean): MissionOwnerRelease {
    if (this.#released) return this.#released;
    const failures: unknown[] = [];
    const closes: PromiseLike<unknown>[] = [];
    let settle!: (closed: Promise<boolean>) => void;
    const closed = new Promise<boolean>(resolve => { settle = resolve; });
    // Set first, so a step that reaches release again gets this release.
    this.#released = Object.freeze({ failures, closed });
    const attempt = (step: () => unknown): void => {
      try {
        const result = step();
        if (isThenable(result)) closes.push(result);
      } catch (cause) {
        failures.push(cause);
      }
    };
    const releaseStage = (stage: MissionOwnerStage): void => {
      for (const entry of [...this.#connections].reverse()) if (entry.stage === stage) attempt(() => entry.connection.release());
    };
    // Input and timers first, so nothing starts a run or ends a placeholder while the rest is released.
    attempt(() => { this.#stopReplace?.(); });
    attempt(() => { this.#cancelTimer(); });
    this.#timing = null;
    releaseStage('input');
    // Disposing the session ends its run and releases the run-level consumers, newest first.
    attempt(() => { this.#stopStatus?.(); });
    attempt(() => { this.#session.control({ type: 'dispose' }); });
    releaseStage('ui');
    const revoke = this.#revokeGuard;
    this.#revokeGuard = null;
    if (revoke) attempt(revoke);
    releaseStage('media');
    Object.freeze(failures);
    settle(Promise.all(closes).then(() => true, (cause: unknown) => {
      this.#latch(cause);
      return false;
    }));
    this.#listeners.clear();
    if (latchFailures && failures.length > 0) this.#latch(combined(failures, 'Mission owner release failed'));
    this.#snapshot = this.#build();
    try {
      this.#link.onClosing(closed);
    } catch (error) {
      this.#report(error);
    }
    return this.#released;
  }

  /** Intents are for event handlers: none applies inside another or inside a session callback, which refuses control. */
  #ready(...positions: MissionFlowState['position'][]): boolean {
    return !this.#released && !this.#acting && this.#inSession === 0 && positions.includes(this.#flow.position);
  }

  /** Applies one intent: no other intent applies meanwhile, and the snapshot is published once after it. */
  #act(action: () => void): void {
    this.#acting = true;
    this.#actionError = null;
    try {
      action();
    } finally {
      this.#acting = false;
      // After the intent's own handling, which may have latched a more precise RollbackError first.
      this.#latchSession(this.#session.status());
      this.#publish();
    }
  }

  #next(input: MissionFlowInput): void {
    this.#flow = nextMissionFlow(this.#flow, input);
  }

  /** A session control for an intent; a refusal or failure becomes the action error. */
  #control(operation: MissionOperation, control: GameSessionControl): boolean {
    try {
      this.#session.control(control);
      return true;
    } catch (cause) {
      this.#actionError = Object.freeze({ operation, cause });
      return false;
    }
  }

  #start(): void {
    if (this.#cleanupFailure) return this.#next({ type: 'start-failed', failure: { kind: 'cleanup-failed' } });
    const held = this.#setup.holder.current();
    if (!held || held.generation !== this.#generation || held.completeness.status !== 'complete'
      || contentIdentityKey(held.completeness.identity) !== this.#identityKey) {
      return this.#failStart({ kind: 'package-changed' });
    }
    const wingman = this.#flow.selection;
    let seed: unknown;
    try {
      seed = this.#setup.seed();
    } catch (cause) {
      return this.#failStart({ kind: 'seed', cause });
    }
    if (!isUint32(seed)) return this.#failStart({ kind: 'seed', cause: new RangeError('The seed source returned a value that is not a uint32') });
    const content = this.#content;
    if ('failure' in content) return this.#failStart({ kind: 'rejected', failure: content.failure });
    const config = { rawDifficulty: PRODUCTION_RAW_DIFFICULTY, wingman, seed };
    // The bound package, checked above: the models of the craft this run instantiates.
    const models = decoded(() => runModelInputs(held.groups, { ...this.#assets, identity: this.#identity, run: config }));
    if ('failure' in models) return this.#failStart({ kind: 'rejected', failure: models.failure });
    const variant = wingman === null ? 'solo' : 'wingman';
    const spec: GameRunSpec = {
      ...this.#assets,
      ...content.input,
      models: models.input,
      identity: this.#identity,
      run: config,
      recording: this.#setup.recording,
      initialTransition: { gap: 'G-02/2', variant },
    };
    try {
      this.#session.control({ type: 'start', spec });
    } catch (error) {
      const failure = creationRefusal(error);
      return failure ? this.#failStart({ kind: 'rejected', failure }) : this.#rollbackStart('session', error);
    }
    const run = this.#session.currentRun();
    if (!run || this.#session.status().phase !== 'transition') return this.#rollbackStart('session', new Error('The run did not enter its departure hold'));
    try {
      const context = Object.freeze({ ownerId: this.ownerId, runId: run.runId });
      for (const { connection } of this.#connections) connection.attachRun?.(run, context);
    } catch (error) {
      return this.#rollbackStart('consumer', error);
    }
    let revoke: unknown;
    try {
      revoke = this.#setup.leaveGuard();
    } catch (error) {
      // A registration that could not roll itself back may leave a listener behind.
      return this.#rollbackStart('leave-guard', error, error instanceof RollbackError);
    }
    if (typeof revoke !== 'function') {
      // Registered, perhaps, but with nothing to undo it.
      return this.#rollbackStart('leave-guard', new TypeError('The leave guard returned no revoke'), true);
    }
    this.#revokeGuard = revoke as Revoke;
    this.#link.confirm(Object.freeze({ identity: this.#identityKey, wingman }));
    this.#next({ type: 'started', runId: run.runId });
    this.#beginPlaceholder({ gap: 'G-02/2', variant });
  }

  #failStart(failure: MissionStartFailure): void {
    this.#next({ type: 'start-failed', failure: Object.freeze(failure) });
  }

  /**
   * Exits the run, if any: `thrown` is what the exit threw, and `cleanup` the cleanup failure the session latched on the
   * way, null when the run was cleaned up. An exit that threw without a cleanup failure ended the run; a status listener
   * failed.
   */
  #exitRun(): { readonly thrown: { readonly cause: unknown } | null; readonly cleanup: { readonly cause: unknown } | null } {
    let thrown: { readonly cause: unknown } | null = null;
    try {
      this.#session.control({ type: 'exit' });
    } catch (cause) {
      thrown = { cause };
    }
    const status = this.#session.status();
    return { thrown, cleanup: status.cleanupFailed ? { cause: thrown ? thrown.cause : status.error } : null };
  }

  /**
   * Exits the run a failed start created. A cleanup failure on the way, or a `cause` that left something behind
   * (`leaked`), latches one RollbackError with every cause.
   */
  #rollbackStart(stage: 'session' | 'consumer' | 'leave-guard', cause: unknown, leaked = false): void {
    const { thrown, cleanup } = this.#exitRun();
    const rolledBack = !cleanup && !leaked;
    if (!rolledBack) this.#latch(new RollbackError(cause, cleanup ? [cleanup.cause] : [], 'Mission start and rollback failed'));
    else if (thrown) this.#report(thrown.cause);
    this.#failStart({ kind: 'assembly', stage, cause, rolledBack });
  }

  #restart(): void {
    if (this.#cleanupFailure) {
      this.#actionError = Object.freeze({ operation: 'restart', cause: this.#cleanupFailure.cause });
      return;
    }
    const { thrown, cleanup } = this.#exitRun();
    const failures: unknown[] = cleanup ? [cleanup.cause] : [];
    try {
      this.#revokeGuard?.();
      this.#revokeGuard = null;
    } catch (error) {
      // Kept, so the owner's release tries again.
      failures.push(error);
    }
    if (failures.length > 0) {
      const cause = combined(failures, 'Mission restart cleanup failed');
      this.#latch(cause);
      this.#actionError = Object.freeze({ operation: 'restart', cause });
      this.#next({ type: 'run-ended', reason: 'cleanup-failed' });
      return;
    }
    if (thrown) this.#report(thrown.cause);
    this.#next({ type: 'restarted' });
    this.#beginPlaceholder({ gap: 'G-02/1', variant: null });
  }

  #beginPlaceholder(page: PlaceholderPage): void {
    if (this.#released) return;
    this.#timing = { id: ++this.#placeholders, page: Object.freeze(page), remainingMs: PLACEHOLDER_MS, since: null, handle: null, token: null, failure: null };
    if (this.#session.status().environmentVisible) this.#resumeTiming();
  }

  /** Starts a visible stretch: reads the clock and schedules the remainder. */
  #resumeTiming(): void {
    const timing = this.#timing;
    if (this.#released || !timing || timing.failure || timing.since !== null) return;
    try {
      timing.since = this.#now();
      this.#schedule(timing);
    } catch (cause) {
      this.#failTiming(timing, cause);
    }
  }

  /** Ends a visible stretch: keeps the remainder and revokes the timer. */
  #suspendTiming(): void {
    const timing = this.#timing;
    if (!timing || timing.failure || timing.since === null) return;
    const failures: unknown[] = [];
    try {
      timing.remainingMs -= this.#now() - timing.since;
    } catch (cause) {
      failures.push(cause);
    }
    timing.since = null;
    try {
      this.#cancelTimer();
    } catch (cause) {
      this.#latch(cause);
      failures.push(cause);
    }
    if (failures.length > 0) this.#failTiming(timing, combined(failures, 'Placeholder timing failed'));
  }

  #schedule(timing: Timing): void {
    const token = {};
    const handle = this.#setup.timer.schedule(() => {
      this.#onTimer(timing, token);
      return undefined;
    }, Math.max(0, timing.remainingMs));
    if (!Number.isSafeInteger(handle) || handle < 0) throw new TypeError('The timer returned a handle that is not a nonnegative safe integer');
    timing.handle = handle;
    timing.token = token;
  }

  /** The timer called back: an early callback schedules the remainder, and only 3,000 visible ms end the placeholder. */
  #onTimer(timing: Timing, token: object): void {
    if (this.#released || this.#timing !== timing || timing.token !== token) return;
    timing.handle = null;
    timing.token = null;
    this.#act(() => {
      try {
        const now = this.#now();
        timing.remainingMs -= now - timing.since!;
        timing.since = now;
        if (timing.remainingMs > 0) return this.#schedule(timing);
      } catch (cause) {
        return this.#failTiming(timing, cause);
      }
      this.#endPlaceholder(timing);
    });
  }

  /** Revokes the scheduled callback, if any; throws what the host's cancellation throws, which the caller latches. */
  #cancelTimer(): void {
    const timing = this.#timing;
    if (!timing) return;
    const handle = timing.handle;
    timing.handle = null;
    timing.token = null;
    if (handle !== null) this.#setup.timer.cancel(handle);
  }

  /** Stops the placeholder for good after a timer or clock failure; it shows the failure, and only leaving follows. */
  #failTiming(timing: Timing, cause: unknown): void {
    timing.failure ??= Object.freeze({ cause });
    timing.since = null;
    try {
      this.#cancelTimer();
    } catch (error) {
      this.#latch(error);
    }
    this.#report(cause);
  }

  /**
   * Ends a placeholder once, naturally or by skip: G-02/1 opens the start page, G-02/2 releases the run's hold, and a
   * running hold's item completes that item; the session's status then shows the next item or the hold's end.
   */
  #endPlaceholder(timing: Timing): void {
    try {
      this.#cancelTimer();
    } catch (cause) {
      this.#latch(cause);
      return this.#failTiming(timing, cause);
    }
    this.#timing = null;
    const { page } = timing;
    if (isHold(page)) {
      try {
        this.#session.control({ type: 'complete-transition', runId: page.runId, transitionId: page.transitionId });
      } catch (cause) {
        // A hold that ended meanwhile refuses the completion; its end is in the flow already. Any other refusal shows.
        const { transition } = this.#session.status();
        const ended = transition === null || transition.gap === 'G-02/2' || transition.transitionId !== page.transitionId;
        if (!(ended && cause instanceof GameSessionError && cause.kind === 'invalid-state')) {
          this.#actionError = Object.freeze({ operation: 'complete-transition', cause });
        }
      }
      return;
    }
    if (page.gap === 'G-02/1') {
      const preselection = preselectWingman(this.#link.confirmed(), this.#identityKey, this.#config.wingmanOptions.length);
      return this.#next({ type: 'intro-ended', preselection });
    }
    const runId = this.#flow.runId!;
    try {
      this.#session.control({ type: 'complete-departure', runId });
    } catch (cause) {
      // A run that ended meanwhile refuses the completion; its end is in the flow already.
      if (!(cause instanceof GameSessionError && cause.kind === 'invalid-state')) this.#actionError = Object.freeze({ operation: 'complete-departure', cause });
    }
    const { phase, runId: current } = this.#session.status();
    if (current === runId && (phase === 'running' || phase === 'paused')) this.#next({ type: 'departure-ended' });
  }

  /** The session's status, inside its notification: never controls the session and never throws. */
  readonly #onStatus = (status: GameSessionStatus): undefined => {
    try {
      if (!this.#acting) this.#latchSession(status);
      const { runId } = this.#flow;
      if ((status.phase === 'faulted' || status.phase === 'stopped') && runId !== null && status.runId === runId) {
        this.#dropTiming();
        this.#next({ type: 'run-ended', reason: status.phase });
      }
      if (runId !== null && status.runId === runId) this.#followHold(status, runId);
      if (status.environmentVisible) this.#resumeTiming();
      else this.#suspendTiming();
      if (!this.#acting) this.#publish();
    } catch (error) {
      this.#report(error);
    }
    return undefined;
  };

  /**
   * Keeps the flow and placeholder with the run's hold: its entry, each new item (a placeholder bound to the item's
   * transitionId), and its end, after which the run runs or waits paused.
   */
  #followHold(status: GameSessionStatus, runId: number): void {
    const { transition } = status;
    // G-02/5 and G-02/6 holds and placeholders are P3-11's later work (docs/plan/p3/04/spec.md, 终局与救援衔接).
    if (status.phase === 'transition' && transition !== null && (transition.gap === 'G-02/3' || transition.gap === 'G-02/4')) {
      this.#next({ type: 'transition-held' });
      const current = this.#timing?.page;
      if (current && isHold(current) && current.transitionId === transition.transitionId) return;
      this.#dropTiming();
      const { gap, transitionId, index, count } = transition;
      this.#beginPlaceholder({ gap, runId, transitionId, index, count });
    } else if (status.phase === 'running' || status.phase === 'paused') {
      this.#next({ type: 'transition-ended' });
    }
  }

  /** Revokes the current placeholder without ending it; a failed cancellation latches. */
  #dropTiming(): void {
    if (!this.#timing) return;
    try {
      this.#cancelTimer();
    } catch (cause) {
      this.#latch(cause);
    }
    this.#timing = null;
  }

  /** Runs `action` as the session's own processing, during which the input control port refuses intents. */
  #within(action: () => undefined): undefined {
    this.#inSession += 1;
    try {
      return action();
    } finally {
      this.#inSession -= 1;
    }
  }

  readonly #onSessionError = (error: GameSessionError): undefined => {
    for (const { connection } of this.#connections) {
      try {
        connection.onSessionError?.(error);
      } catch (failure) {
        this.#report(failure);
      }
    }
    return undefined;
  };

  /** Reads the monotonic clock; a non-finite or earlier value is a clock failure too. */
  #now(): number {
    const now = this.#setup.clock();
    if (!Number.isFinite(now) || now < this.#lastNow) throw new RangeError('The monotonic clock returned a non-finite or earlier time');
    this.#lastNow = now;
    return now;
  }

  /** A session whose cleanup failed, or whose consumer could not roll back, latches the owner. */
  #latchSession(status: GameSessionStatus): void {
    if (status.cleanupFailed || status.error?.failures?.some(({ cause }) => cause instanceof RollbackError)) this.#latch(status.error);
  }

  #latch(cause: unknown): void {
    if (this.#cleanupFailure) return;
    this.#cleanupFailure = Object.freeze({ cause });
    try {
      this.#link.onCleanupFailure(cause);
    } catch (error) {
      this.#report(error);
    }
  }

  #report(error: unknown): void {
    try {
      this.#setup.reportError(error);
    } catch {
      // A failing outlet must not break the owner; there is no other.
    }
  }

  #build(): MissionOwnerSnapshot {
    const timing = this.#timing;
    const shown = timing && {
      id: timing.id,
      status: timing.failure ? 'failed' as const : timing.since === null ? 'waiting' as const : 'timing' as const,
      failure: timing.failure,
    };
    return Object.freeze({
      ownerId: this.ownerId,
      released: this.#released !== null,
      config: this.#config,
      flow: this.#flow,
      placeholder: timing && shown && !isHold(timing.page) ? Object.freeze({ ...timing.page, ...shown }) : null,
      transitionPlaceholder: timing && shown && isHold(timing.page) ? Object.freeze({ ...timing.page, ...shown }) : null,
      session: this.#session.status(),
      actionError: this.#actionError,
      cleanupFailure: this.#cleanupFailure,
    });
  }

  #publish(): void {
    if (this.#released) return;
    this.#snapshot = this.#build();
    for (const entry of [...this.#listeners]) {
      if (!this.#listeners.has(entry)) continue;
      try {
        entry.listener();
      } catch (error) {
        this.#report(error);
      }
    }
  }
}

/**
 * Opens a mission owner on the holder's package, which must be eligible (`MissionUnavailableError` otherwise, before
 * anything is acquired), and shows G-02/1. A creation that failed after acquiring something releases it again; when
 * that release failed too, it throws a RollbackError, whose cleanup failure the link has received.
 */
export function createMissionOwner(setup: MissionOwnerSetup, link: MissionOwnerLink): MissionOwner {
  return new Owner(setup, link);
}
