/**
 * Local game input state (docs/plan/p3/05/spec.md: 输入上下文, 操纵, 开火, 离散命令与重复, 修饰键与布局, 清键与恢复;
 * 数据模型与契约 本地输入状态). DOM-free: the input consumer feeds it normalized key events and the facts of the moment,
 * and carries out what it returns. Only an effective new press, a non-repeat keydown in a qualified zone without Meta
 * or composition, establishes anything; a keyup always releases its code. Losing qualification, leaving `running`, a
 * new run or a new interaction context clears everything, and no later signal, flag or repeat restores it.
 */
import type { Command, TickAxes } from '../../core/contracts/tick-input.ts';
import type { KeyboardInput } from '../../platform/input/keyboard-input.ts';
import type { Binding, BindingTable, DiscreteAction, InputContext, MatchModifiers } from './input-action.ts';
import { KeyRepeat } from './key-repeat.ts';
import { shouldPreventDefault } from './page-intercept.ts';

/** The facts the consumer reads when a key event or a session frame arrives. */
export interface InputMoment {
  /** The keyboard source qualifies the input zone. */
  readonly eligible: boolean;
  /** The session is running and accepts intents and commands; otherwise the zone only takes session controls. */
  readonly running: boolean;
  /** The current run, or null without one. */
  readonly runId: number | null;
  /** From the run's latest complete projection, never a throttled store; null without a run. */
  readonly context: InputContext | null;
  /** `projection.clock.clock` of that projection, in 1/64 s units. */
  readonly clock: number;
}

/** The continuous part of a run's intent; the consumer sets it as the run's complete intent when it changes. */
export interface LocalIntent {
  readonly axes: TickAxes;
  readonly primaryFire: boolean;
}

export interface KeyOutcome {
  /** The discrete action of an effective new press, to carry out once; held actions only change the intent. */
  readonly action: DiscreteAction | null;
  readonly intentChanged: boolean;
  readonly preventDefault: boolean;
}

export interface DueRepeat {
  readonly code: string;
  readonly command: Command;
}

export interface FrameOutcome {
  readonly intentChanged: boolean;
  /** In first-press order; a failed submission must be followed by `cancelRepeat(code)`. */
  readonly repeats: readonly DueRepeat[];
}

const NEUTRAL_INTENT: LocalIntent = Object.freeze({ axes: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }), primaryFire: false });
const NO_REPEATS: readonly DueRepeat[] = Object.freeze([]);
const QUIET_FRAME: FrameOutcome = Object.freeze({ intentChanged: false, repeats: NO_REPEATS });
const CLEARED_FRAME: FrameOutcome = Object.freeze({ intentChanged: true, repeats: NO_REPEATS });
/** Per axis, bit 1 for a held −1 and bit 2 for a held +1: both or neither give 0. */
const AXIS_VALUE = [0, -1, 1, 0] as const;

/**
 * Shift and NumLock as the latest event reports them, and the effective Ctrl. A Ctrl the AltGr key may have
 * synthesized is masked: while the right Alt is held or the AltGraph flag is on, and while an Alt flag shows a left Alt
 * this round did not observe, only an observed ControlRight press is a Ctrl. A left or unidentified Ctrl seen during
 * that time stays masked until a Ctrl-free event or its keyup, so it does not outlast the Alt; a real left Ctrl it
 * also masks is the disclosed limit (prefer no Ctrl action). A modifier flag that is off proves its keys are up.
 */
class ModifierTracker {
  #controlLeft = false;
  #controlRight = false;
  #altLeft = false;
  #altRight = false;
  #leftCtrlMasked = false;
  #match: MatchModifiers = Object.freeze({ shift: false, ctrl: false, numLock: false });

  get match(): MatchModifiers {
    return this.#match;
  }

  /** Releases follow every event; presses are only tracked while the zone qualifies. */
  observe(event: KeyboardInput, track: boolean): void {
    const { type, code, shiftKey: shift, ctrlKey, altKey, altGraph, numLock } = event;
    if (!ctrlKey) this.#controlLeft = this.#controlRight = false;
    if (!altKey) this.#altLeft = false;
    if (!altKey && !altGraph) this.#altRight = false;
    if (type === 'keyup' || track) {
      const down = type === 'keydown';
      if (code === 'ControlLeft') this.#controlLeft = down;
      else if (code === 'ControlRight') this.#controlRight = down;
      else if (code === 'AltLeft') this.#altLeft = down;
      else if (code === 'AltRight') this.#altRight = down;
    }
    const altGr = this.#altRight || altGraph || (altKey && !this.#altLeft);
    const leftOrUnknownCtrl = this.#controlLeft || (ctrlKey && !this.#controlRight);
    this.#leftCtrlMasked = leftOrUnknownCtrl && (this.#leftCtrlMasked || altGr);
    this.#match = Object.freeze({ shift, ctrl: ctrlKey && (this.#controlRight || !this.#leftCtrlMasked), numLock });
  }

  clear(): void {
    this.#controlLeft = this.#controlRight = this.#altLeft = this.#altRight = this.#leftCtrlMasked = false;
    this.#match = Object.freeze({ shift: false, ctrl: false, numLock: false });
  }
}

export class InputState {
  readonly #table: BindingTable;
  readonly #modifiers = new ModifierTracker();
  /** Each code an effective new press established, with the binding it matched, in press order. */
  readonly #pressed = new Map<string, Binding>();
  readonly #repeat = new KeyRepeat();
  #moment: InputMoment | null = null;
  #intent = NEUTRAL_INTENT;

  constructor(table: BindingTable) {
    this.#table = table;
  }

  intent(): LocalIntent {
    return this.#intent;
  }

  /**
   * Takes the facts of a moment: losing qualification, leaving `running`, another run or another interaction context
   * clears all local state. Returns whether the intent changed; a running consumer then sets it.
   */
  sync(moment: InputMoment): boolean {
    const last = this.#moment;
    this.#moment = moment;
    const lost = last !== null && ((last.eligible && !moment.eligible) || (last.running && !moment.running)
      || last.runId !== moment.runId || last.context !== moment.context);
    return lost && this.clear();
  }

  /** Clears held keys, Ctrl and Alt tracking and repeats; only new presses establish them again. */
  clear(): boolean {
    this.#pressed.clear();
    this.#repeat.clear();
    this.#modifiers.clear();
    return this.#update();
  }

  key(event: KeyboardInput, moment: InputMoment): KeyOutcome {
    const synced = this.sync(moment);
    const { eligible, running, context, clock } = moment;
    const { code } = event;
    const released = event.type === 'keyup' && this.#release(code);
    this.#modifiers.observe(event, eligible);
    if (!event.altKey) this.#release('AltLeft');
    if (!event.altKey && !event.altGraph) this.#release('AltRight');
    if (event.isComposing) {
      this.#pressed.clear();
      this.#repeat.clear();
    }
    const modifiers = this.#modifiers.match;
    for (const [held, binding] of this.#pressed) {
      if (this.#repeat.has(held) && this.#table.resolve(held, modifiers, context) !== binding) this.#repeat.cancel(held);
    }
    let action: DiscreteAction | null = null;
    if (event.type === 'keydown' && !event.repeat && eligible && !event.isComposing && !event.metaKey && !this.#pressed.has(code)) {
      const binding = this.#table.resolve(code, modifiers, context);
      if (binding && (running || binding.action.kind === 'session')) {
        this.#pressed.set(code, binding);
        if (binding.repeatable) this.#repeat.start(code, clock);
        if (binding.action.kind !== 'steer' && binding.action.kind !== 'primary-fire') action = binding.action;
      }
    }
    const intentChanged = this.#update() || synced;
    const bound = released || this.#table.bound(code, modifiers);
    return Object.freeze({ action, intentChanged, preventDefault: shouldPreventDefault({ event, eligible, ctrl: modifiers.ctrl, bound }) });
  }

  /** For a session frame: syncs, then gives the repeats due at its clock if it is running in a qualified zone. */
  frame(moment: InputMoment): FrameOutcome {
    const intentChanged = this.sync(moment);
    const due = moment.running && moment.eligible ? this.#repeat.due(moment.clock) : [];
    if (due.length === 0) return intentChanged ? CLEARED_FRAME : QUIET_FRAME;
    const repeats = due.flatMap(code => {
      const action = this.#pressed.get(code)?.action;
      return action?.kind === 'command' ? [Object.freeze({ code, command: action.command })] : [];
    });
    return Object.freeze({ intentChanged, repeats: Object.freeze(repeats) });
  }

  /** Ends a key's repeat after its submission failed; only a new press starts it again. */
  cancelRepeat(code: string): void {
    this.#repeat.cancel(code);
  }

  #release(code: string): boolean {
    this.#repeat.cancel(code);
    return this.#pressed.delete(code);
  }

  /**
   * Recomputes the intent from the held keys; returns whether it changed. Only a running press holds a steering key or
   * Alt, and the table keeps those to their contexts (steering in flight and Warp, fire in flight), which a context
   * change clears.
   */
  #update(): boolean {
    const context = this.#moment?.context ?? null;
    const modifiers = this.#modifiers.match;
    const held = { pitch: 0, yaw: 0, roll: 0 };
    let primaryFire = false;
    for (const [code, binding] of this.#pressed) {
      if (binding.action.kind === 'primary-fire') primaryFire = true;
      if (binding.action.kind !== 'steer') continue;
      // Ctrl routes the held lateral keys to roll or yaw as it changes; Shift and Alt leave them as they are.
      const routed = this.#table.resolve(code, modifiers, context)?.action;
      if (routed?.kind === 'steer') held[routed.axis] |= routed.direction < 0 ? 1 : 2;
    }
    const { axes: last } = this.#intent;
    const [pitch, yaw, roll] = [AXIS_VALUE[held.pitch], AXIS_VALUE[held.yaw], AXIS_VALUE[held.roll]];
    if (this.#intent.primaryFire === primaryFire && last.pitch === pitch && last.yaw === yaw && last.roll === roll) return false;
    this.#intent = Object.freeze({ axes: Object.freeze({ pitch, yaw, roll }), primaryFire });
    return true;
  }
}
