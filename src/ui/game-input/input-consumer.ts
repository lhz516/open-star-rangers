/**
 * The game input consumer of one mission owner, at its `input` stage (docs/plan/p3/05/spec.md: 输入上下文, 操纵, 开火,
 * 离散命令与重复, 会话控制键, 页面层拦截, 清键与恢复, 生命周期与资源).
 *
 * - **Owner level:** connecting creates the owner's keyboard source through the injected factory and connects it for
 *   the owner's lifetime, across runs; `bindZone` binds its input zone. Releasing invalidates every callback first, so
 *   an old callback no longer sets an intent, submits, controls or prevents a default, and then disconnects the source.
 * - **Run level:** each run, wired while it is held for its departure, gets its own input control port and a frame,
 *   cancellation and status subscription, each handed to `ownCleanup`, so the run's end releases them.
 * - **Keys:** each event is resolved against the run's latest complete projection, never a throttled store: the
 *   session's phase first, then `player.interactionContext` (`InputState`). While running, an intent change sets the
 *   run's complete intent, and a new press's command goes once through the injected command feedback; `p` and an Esc
 *   the page received outside Pointer Lock go through the port, which applies the owner's own rules; a G-item press goes
 *   to the input status. The event's default is prevented as the page interception decides.
 * - **Frames:** a running frame submits the repeats due at its clock, each held key at most once, and a frame that
 *   shows a new interaction context sets the neutral intent.
 * - **Clearing:** losing qualification by blur, focusout or otherwise clears the local state and, while running, sends
 *   the run one `clear-input('focus-loss')`; hidden and pagehide clear only the local state, as the session pauses
 *   itself. Status, cancellation and cleanup notifications only read and clear local state. Nothing but a new press
 *   restores a held key.
 */
import type {
  MissionConsumerConnection, MissionInputContext, MissionOwnerConsumer, MissionRunInputControl, MissionSessionView,
} from '../../app/mission/mission-owner.ts';
import type { ClearInputReason, GameCommandsCancelled, GameSessionFrame, GameSessionRun } from '../../app/session/game-session.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { SessionCleanup } from '../../app/session/session-host.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { KeyboardInput, KeyboardSignal, KeyboardSink, KeyboardSource, KeyboardZoneBinding } from '../../platform/input/keyboard-input.ts';
import type { GameCommandFeedback } from '../game/game-command-feedback.ts';
import type { BindingTable, DiscreteAction } from './input-action.ts';
import { InputState, type InputMoment } from './input-state.ts';
import { createInputStatus, type InputOperation, type InputStatusReader } from './input-status.ts';

/** The part of the command feedback the consumer submits through. */
export type CommandSubmitter = Pick<GameCommandFeedback, 'submit'>;

export interface InputConsumerOptions<Zone> {
  /** Creates the owner's keyboard source, once, as the owner connects the consumer. */
  readonly keyboard: () => KeyboardSource & KeyboardZoneBinding<Zone>;
  readonly bindings: BindingTable;
  /**
   * The command feedback the owner's `ui` consumer created, read at each submission; null while there is none. Its
   * `submit` shows a refusal, a full queue included, as the game store's action error.
   */
  readonly feedback: () => CommandSubmitter | null;
  /** Whether this task's Pointer Lock holds the pointer, so that Esc only releases it (subtasks 21, 22); never if omitted. */
  readonly pointerLocked?: () => boolean;
}

export interface GameInputConsumer<Zone> extends MissionOwnerConsumer<'input'> {
  readonly status: InputStatusReader;
  /** Binds, replaces or (with null) removes the keyboard source's input zone; stable, as a React callback ref. */
  readonly bindZone: (zone: Zone | null) => void;
  /**
   * Clears the local input and, while the run is running, sends it one `clear-input` for `reason`: for host events that
   * end the input's qualification, such as leaving fullscreen or Pointer Lock. Not for session notifications. Every
   * clear of the run's input goes through here, subtasks 21 and 22 included: the session tells other consumers of a
   * `clear-input` only by cancelling queued commands, and nothing when none were queued, so a clear sent past this
   * consumer can leave local keys held that the run no longer has.
   */
  clear(reason: ClearInputReason): void;
}

interface WiredRun {
  readonly handle: GameSessionRun;
  readonly port: MissionRunInputControl;
  /** The last commandId a cancellation notice of this run reported; IDs rise, so each is handled at most once. */
  cancelled: number;
}

/** Signals after which the session pauses itself, so losing qualification clears only the local state. */
const LOCAL_ONLY: ReadonlySet<KeyboardSignal['type']> = new Set(['visibilitychange', 'pagehide']);

const noRun = (eligible: boolean): InputMoment => ({ eligible, running: false, runId: null, context: null, clock: 0 });

/** Hands `cleanup` to the run; if that fails, cancels it at once, and a failed cancellation leaves a RollbackError. */
function own(run: GameSessionRun, cleanup: SessionCleanup): void {
  try {
    run.ownCleanup(cleanup);
  } catch (cause) {
    try {
      cleanup();
    } catch (failure) {
      throw new RollbackError(cause, [failure], 'Input run registration and rollback failed');
    }
    throw cause;
  }
}

class InputConsumer<Zone> implements GameInputConsumer<Zone> {
  readonly stage = 'input';
  readonly #options: InputConsumerOptions<Zone>;
  readonly #state: InputState;
  readonly #status = createInputStatus();
  #source: (KeyboardSource & KeyboardZoneBinding<Zone>) | null = null;
  #zone: Zone | null = null;
  #session: MissionSessionView | null = null;
  #run: WiredRun | null = null;
  #eligible = false;
  #connected = false;
  #released = false;

  constructor(options: InputConsumerOptions<Zone>) {
    this.#options = options;
    this.#state = new InputState(options.bindings);
  }

  get status(): InputStatusReader {
    return this.#status.reader;
  }

  readonly bindZone = (zone: Zone | null): void => {
    this.#zone = zone;
    this.#source?.bind(zone);
  };

  readonly #sink: KeyboardSink = Object.freeze({
    key: (event: KeyboardInput, eligible: boolean) => this.#key(event, eligible),
    signal: (signal: KeyboardSignal) => { this.#signal(signal); },
  });

  connect({ session, control }: MissionInputContext): MissionConsumerConnection {
    if (this.#connected) throw new Error('An input consumer connects to one owner, once');
    this.#connected = true;
    this.#session = session;
    const source = this.#options.keyboard();
    this.#source = source;
    source.bind(this.#zone);
    const disconnect = source.connect(this.#sink);
    return {
      release: () => {
        this.#released = true;
        this.#run = null;
        this.#state.clear();
        disconnect();
      },
      attachRun: (run, { runId }) => { this.#attach(run, control.forRun(runId)); },
    };
  }

  clear(reason: ClearInputReason): void {
    if (this.#released) return;
    const moment = this.#moment(this.#eligible);
    this.#state.clear();
    this.#clearRun(reason, moment);
  }

  #attach(run: GameSessionRun, port: MissionRunInputControl): void {
    const wired: WiredRun = { handle: run, port, cancelled: 0 };
    // First, so that the run's end, a failed start's rollback included, also undoes this wiring.
    own(run, () => {
      this.#detach(wired);
      return undefined;
    });
    this.#run = wired;
    own(run, run.onFrame((frame) => {
      this.#frame(wired, frame);
      return undefined;
    }));
    own(run, run.onCommandsCancelled((notice) => {
      this.#cancelled(wired, notice);
      return undefined;
    }));
    own(run, this.#session!.onStatus((status) => {
      if (this.#current(wired)) {
        this.#state.sync(this.#moment(this.#eligible, status));
        this.#refresh(status);
      }
      return undefined;
    }));
    this.#status.clearError();
    this.#refresh();
  }

  #current(wired: WiredRun): boolean {
    return !this.#released && this.#run === wired;
  }

  #detach(wired: WiredRun): void {
    if (!this.#current(wired)) return;
    this.#run = null;
    this.#state.clear();
    this.#refresh();
  }

  #key(event: KeyboardInput, eligible: boolean): boolean {
    if (this.#released) return false;
    const moment = this.#moment(eligible);
    const lost = this.#qualify(eligible);
    const { error } = this.#status.reader.getState();
    const { action, intentChanged, preventDefault } = this.#state.key(event, moment);
    let performed = false;
    if (lost) this.#clearRun('focus-loss', moment);
    else if (intentChanged) performed = this.#setIntent(moment);
    if (action) performed = this.#carryOut(action, event.code) || performed;
    // A new press that went through without a new failure ends the shown error.
    const pressed = event.type === 'keydown' && !event.repeat;
    if (performed && pressed && this.#status.reader.getState().error === error) this.#status.clearError();
    return preventDefault;
  }

  #signal({ type, eligible }: KeyboardSignal): void {
    if (this.#released) return;
    const moment = this.#moment(eligible);
    const lost = this.#qualify(eligible);
    const intentChanged = this.#state.sync(moment);
    if (lost) {
      if (!LOCAL_ONLY.has(type)) this.#clearRun('focus-loss', moment);
    } else if (intentChanged) {
      this.#setIntent(moment);
    }
  }

  #frame(wired: WiredRun, { runId, phase, projection }: GameSessionFrame): void {
    if (!this.#current(wired)) return;
    const moment: InputMoment = {
      eligible: this.#eligible, running: phase === 'running', runId, context: projection.player.interactionContext, clock: projection.clock.clock,
    };
    const { intentChanged, repeats } = this.#state.frame(moment);
    if (intentChanged) this.#setIntent(moment);
    for (const { code, command } of repeats) this.#submit(code, command);
  }

  /**
   * Each genuine notice follows the session's clear of the run's intent and queue, so the local state follows it, once
   * per command; it does not report a clear that found the queue empty.
   */
  #cancelled(wired: WiredRun, { commandIds }: GameCommandsCancelled): void {
    const last = commandIds.at(-1);
    if (!this.#current(wired) || last === undefined || last <= wired.cancelled) return;
    wired.cancelled = last;
    this.#state.clear();
  }

  /** Takes the source's qualification, refreshing the focus hint on a change; returns whether it was just lost. */
  #qualify(eligible: boolean): boolean {
    const qualified = this.#eligible;
    this.#eligible = eligible;
    if (qualified !== eligible) this.#refresh();
    return qualified && !eligible;
  }

  /** The facts of now: the wired run counts only while it is the session's run. */
  #moment(eligible: boolean, status = this.#session?.status()): InputMoment {
    const run = this.#run;
    if (!run || status?.runId !== run.handle.runId) return noRun(eligible);
    const { player, clock } = run.handle.projection();
    return { eligible, running: status.phase === 'running', runId: status.runId, context: player.interactionContext, clock: clock.clock };
  }

  /** Returns whether the intent was set. */
  #setIntent(moment: InputMoment): boolean {
    const run = this.#run;
    return moment.running && run !== null && this.#attempt('set-intent', () => { run.handle.setIntent(this.#state.intent()); });
  }

  #clearRun(reason: ClearInputReason, moment: InputMoment): void {
    const run = this.#run;
    if (!moment.running || !run) return;
    this.#attempt('clear-input', () => { run.port.clearInput(reason); });
  }

  /** Returns whether the action went through: an Esc under Pointer Lock does nothing. */
  #carryOut(action: DiscreteAction, code: string): boolean {
    const port = this.#run?.port;
    switch (action.kind) {
      case 'command':
        return this.#submit(code, action.command);
      case 'gap':
        this.#status.markGap(action.gap);
        return true;
      case 'session':
        if (!port) return false;
        if (action.control === 'toggle-pause') return this.#attempt('toggle-pause', () => { port.togglePause(); });
        return !this.#options.pointerLocked?.() && this.#attempt('open-menu', () => { port.openMenu(); });
    }
  }

  /** Submits once and returns whether the run took it; otherwise the key's repeat ends, and only a new press submits again. */
  #submit(code: string, command: Command): boolean {
    let commandId: number | null = null;
    this.#attempt('submit', () => {
      const feedback = this.#options.feedback();
      if (!feedback) throw new Error('The command feedback is not connected');
      commandId = feedback.submit(command);
    });
    if (commandId !== null) return true;
    this.#state.cancelRepeat(code);
    return false;
  }

  /** Returns whether `action` succeeded; a failure becomes the input status' error. */
  #attempt(operation: InputOperation, action: () => void): boolean {
    try {
      action();
      return true;
    } catch (cause) {
      this.#status.reportError(operation, cause);
      return false;
    }
  }

  /** The focus hint follows qualification, the run's wiring and the session's status, which refresh it. */
  #refresh(status = this.#session?.status()): void {
    const run = this.#run;
    const live = run !== null && status?.runId === run.handle.runId && (status.phase === 'running' || status.phase === 'paused');
    this.#status.setFocusHint(live && !this.#eligible);
  }
}

/** Creates the input consumer of one mission owner; pass it in that owner's consumers. */
export function createInputConsumer<Zone>(options: InputConsumerOptions<Zone>): GameInputConsumer<Zone> {
  return new InputConsumer(options);
}
