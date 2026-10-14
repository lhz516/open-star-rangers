/**
 * Strategic map input of one mission owner's game input (docs/plan/p3/05/spec.md: 战略地图输入, 清键与恢复 “退出 Pointer
 * Lock”; 数据模型与契约 “地图光标”; technical decision 9; finalised by checkpoint K (地图) in 审批). DOM-free: the input
 * consumer feeds it the facts of each moment, every session frame and the Pointer Lock port's pointer input, and it
 * submits `map-point` commands, asks for or exits Pointer Lock and writes the map's input status.
 *
 * - **Opening:** a map opening starts when the current run's projection shows `map` and ends when it shows another
 *   context or the run changes. Each opening resets the local position to the policy's start, taken once from the first
 *   valid geometry of that opening, before the cursor is drawn, the pointer locked or input accepted, and without a
 *   hover or select. Pause, unlock and relock, resize and a geometry that failed and recovered keep the position.
 * - **Qualification:** the opening, a running run, a qualified input zone, a valid geometry, a policy, a start position
 *   and a drawn cursor. Gaining it asks for Pointer Lock once, only while the host still reports a user activation and
 *   no request failed; otherwise "click the map to lock" shows. Losing it drops the pending hover and the held button
 *   and exits this owner's Pointer Lock; the port's report of the end clears the input as `pointer-lock-exit`.
 * - **Commands:** moves keep one pending hover, submitted at most once per running frame. A new left press freezes the
 *   position, submits a hover for it unless the last command already carried it, then the select; a failed hover sends
 *   no select. Holding repeats the select from the press's clock c at c + interval, then at the observed clock +
 *   interval, observed only in running frames, at most once a frame and never catching up; the due frame first submits
 *   the pending hover. Release submits nothing. Release, losing qualification, leaving the map, a failed submission and,
 *   unlocked, leaving the main map end the repeat; only a new press selects again.
 * - **Pointer Lock:** while locked, host-reported movement is scaled to CSS px and moves the clamped position. Without a
 *   lock, a left click on the input zone only asks for one and selects nothing, and nothing moves the cursor. Where the
 *   lock is unsupported or its latest request failed, absolute input inside the main map moves the cursor and selects
 *   the same way; outside it shows the system pointer and submits nothing. A right button never selects.
 */
import type { Command } from '../../core/contracts/tick-input.ts';
import type { PointerInput, PointerSample } from '../../platform/input/pointer-lock.ts';
import type { MapCursorDrawer, MapCursorPositionPort } from '../../render/map/map-cursor.ts';
import {
  checkMapInputGeometry, clampMapPosition, insideMap, mapPositionAt, moveMapPosition, type MapInputGeometry, type MapInputGeometryPort,
  type MapPosition,
} from '../../render/map/map-input-geometry.ts';
import type { InputCapabilities } from './capabilities.ts';
import type { InputMoment } from './input-state.ts';
import type { CapabilityState, MapInputState, MapInputStatus } from './input-status.ts';

/** The rules checkpoint K finalised; injected, as the project sets no default (subtask 26 wires the production values). */
export interface MapInputPolicy {
  /** The position each map opening starts from, for the opening's first valid geometry. */
  readonly start: (geometry: MapInputGeometry) => MapPosition;
  /** `projection.clock.clock` units between the selects of a held left button; a positive integer. */
  readonly repeatInterval: number;
}

export interface MapInputOptions {
  /** Null keeps the map input not ready. */
  readonly policy: MapInputPolicy | null;
  /** The map's presentation owner's geometry; its `read` returns null while the map cannot be presented. */
  readonly geometry: MapInputGeometryPort;
  /**
   * The cursor drawer, which reads `GameInputConsumer.mapCursor`; read at each frame, which draws it. Null while there is
   * none, which keeps the map input not ready.
   */
  readonly cursor: () => Pick<MapCursorDrawer, 'draw' | 'ready'> | null;
  /**
   * CSS px per unit of a locked pointer's host-reported movement, read at each move: 1 where the engine reports CSS px,
   * 1 / devicePixelRatio where it reports device px. A finite positive number.
   */
  readonly movementScale: () => number;
  /** Whether the host still reports a user activation, such as `navigator.userActivation.isActive`. */
  readonly userActivation: () => boolean;
}

/** What the map input needs of the input consumer. */
export interface MapInputHost {
  /** Submits once through the command feedback; returns whether the run took it. */
  submit(command: Command): boolean;
  readonly lock: Pick<InputCapabilities, 'requestPointerLock' | 'exitPointerLock'>;
  /** The Pointer Lock capability's published state. */
  lockState(): CapabilityState;
  setStatus(status: MapInputStatus): void;
  /** A failure outside the geometry contract, such as the cursor's drawing or an invalid movement scale. */
  reportError(cause: unknown): void;
}

type Mode = Extract<MapInputState, 'click-to-lock' | 'locking' | 'locked' | 'unlocked'>;

const MODES: Readonly<Record<CapabilityState, Mode>> = Object.freeze({
  idle: 'click-to-lock', pending: 'locking', active: 'locked', unsupported: 'unlocked', failed: 'unlocked',
});

const LEFT = 0;

const same = (a: MapPosition | null, b: MapPosition): boolean => a !== null && a.right === b.right && a.down === b.down;

const sameGeometry = (a: MapInputGeometry | null, b: MapInputGeometry | null): boolean => a === b || (a !== null && b !== null
  && a.screen.width === b.screen.width && a.screen.height === b.screen.height
  && a.mainMap.left === b.mainMap.left && a.mainMap.top === b.mainMap.top && a.mainMap.right === b.mainMap.right
  && a.mainMap.bottom === b.mainMap.bottom && a.frame.left === b.frame.left && a.frame.top === b.frame.top
  && a.frame.width === b.frame.width && a.frame.height === b.frame.height);

function checkedPolicy(policy: MapInputPolicy | null): MapInputPolicy | null {
  if (policy === null) return null;
  if (typeof policy.start !== 'function') throw new TypeError('A map input policy needs a start position rule');
  if (!Number.isSafeInteger(policy.repeatInterval) || policy.repeatInterval <= 0) {
    throw new RangeError('A map input repeat interval must be a positive integer of clock units');
  }
  return Object.freeze({ start: policy.start, repeatInterval: policy.repeatInterval });
}

export class MapInput {
  readonly #options: MapInputOptions;
  readonly #policy: MapInputPolicy | null;
  readonly #host: MapInputHost;
  /** The run of the current map opening; null while none is open. */
  #runId: number | null = null;
  /** The opening's position; null until its start is taken. */
  #position: MapPosition | null = null;
  #geometry: MapInputGeometry | null = null;
  /** The geometry the cursor was last drawn ready for in this opening. */
  #drawn: MapInputGeometry | null = null;
  /** The latest geometry or start rule failure. */
  #error: unknown = null;
  #qualified = false;
  /** The position of the latest map-point the run took in this qualification; a press repeats nothing it carried. */
  #sent: MapPosition | null = null;
  /** A move changed the position since then: a hover is pending. */
  #pending = false;
  /** The held left button's next due clock; null when no repeat runs. */
  #due: number | null = null;
  /** Unlocked: the latest absolute input lay on the main map. */
  #inside = false;
  #drawFailed = false;

  /** The cursor's read-only position: the opening's, also while suspended, for a still cursor; null hides it. */
  readonly position: MapCursorPositionPort = Object.freeze({ read: () => this.#position });

  constructor(options: MapInputOptions, host: MapInputHost) {
    this.#options = options;
    this.#policy = checkedPolicy(options.policy);
    this.#host = host;
  }

  /** After a change of the facts: qualification, the session's status, the run's wiring. */
  sync(moment: InputMoment): void {
    this.#settle(this.#observe(moment));
  }

  /** One session frame of the current run, whatever its phase: draws, then submits only while running. */
  frame(moment: InputMoment): void {
    const live = this.#observe(moment);
    this.#draw();
    this.#settle(live);
    if (!this.#qualified) return;
    if (this.#due !== null && moment.clock >= this.#due) this.#select(moment.clock);
    else if (!this.#hover(false)) this.#due = null;
  }

  /** Pointer input the capabilities passed on, with the facts of its moment. */
  pointer(input: PointerInput, moment: InputMoment): void {
    this.#settle(this.#observe(moment));
    if (!this.#qualified) return;
    this.#input(input, moment.clock);
    this.#publish();
  }

  /** After the Pointer Lock state changed, which decides the mode. */
  refresh(): void {
    this.#publish();
  }

  /** The input's local clear: the pending hover and the held button, never the position. */
  clear(): void {
    this.#neutral();
    this.#publish();
  }

  #neutral(): void {
    this.#sent = null;
    this.#pending = false;
    this.#due = null;
    this.#inside = false;
  }

  /**
   * Follows the opening and reads the geometry, taking the opening's start from its first valid geometry. Returns
   * whether the run is running and its input zone qualifies.
   */
  #observe({ runId, context, running, eligible }: InputMoment): boolean {
    const open = context === 'map' ? runId : null;
    if (open !== this.#runId) {
      // A new opening starts unqualified, so that gaining it clears what the last one left.
      this.#runId = open;
      this.#position = null;
      this.#qualified = false;
      this.#drawn = null;
    }
    const previous = this.#geometry;
    this.#geometry = null;
    this.#error = null;
    if (open !== null && this.#policy !== null) {
      try {
        const geometry = checkMapInputGeometry(this.#options.geometry.read());
        if (geometry && this.#position === null) this.#position = clampMapPosition(this.#policy.start(geometry));
        this.#geometry = geometry;
      } catch (cause) {
        this.#error = cause;
      }
    }
    if (this.#geometry === null) this.#drawn = null;
    // An unlocked pointer's place on the main map is unknown under another geometry until its next input.
    if (this.#inside && !sameGeometry(previous, this.#geometry)) {
      this.#inside = false;
      this.#due = null;
    }
    return running && eligible;
  }

  /** Reports a drawing failure once until a draw succeeds; the status already shows an invalid geometry. */
  #draw(): void {
    try {
      const ready = this.#options.cursor()?.draw() ?? false;
      this.#drawn = ready ? this.#geometry : null;
      this.#drawFailed = false;
    } catch (cause) {
      this.#drawn = null;
      if (this.#error === null && !this.#drawFailed) this.#host.reportError(cause);
      this.#drawFailed = true;
    }
  }

  /** Gaining qualification waits for a draw of the current geometry; keeping it, as across a resize, does not. */
  #ready(): boolean {
    return this.#geometry !== null && this.#position !== null && (this.#options.cursor()?.ready ?? false)
      && (this.#qualified || sameGeometry(this.#drawn, this.#geometry));
  }

  /**
   * Gaining qualification asks for Pointer Lock once, when it may; losing it drops the pending hover and the held
   * button. Unqualified, this owner's open request or lock is ended; then publishes.
   */
  #settle(live: boolean): void {
    const qualified = this.#runId !== null && live && this.#ready();
    if (qualified !== this.#qualified) {
      this.#qualified = qualified;
      this.#neutral();
      if (qualified && this.#mode() === 'click-to-lock' && this.#options.userActivation()) this.#host.lock.requestPointerLock();
    }
    const lock = this.#host.lockState();
    if (!qualified && (lock === 'pending' || lock === 'active')) this.#host.lock.exitPointerLock();
    this.#publish();
  }

  #input(input: PointerInput, clock: number): void {
    if (input.type === 'up') {
      if (input.button === LEFT) this.#due = null;
      return;
    }
    if (input.type === 'down' && input.button !== LEFT) return;
    const mode = this.#mode();
    if (mode === 'click-to-lock') {
      if (input.type === 'down') this.#host.lock.requestPointerLock();
      return;
    }
    if (mode === 'locking') return;
    const onMap = mode === 'locked' ? this.#moveLocked(input.sample) : this.#moveUnlocked(input.sample);
    if (onMap && input.type === 'down') this.#select(clock);
  }

  #mode(): Mode {
    return MODES[this.#host.lockState()];
  }

  /** Locked: the movement in CSS px moves the position, clamped. Returns true: a locked press selects where it is. */
  #moveLocked(sample: PointerSample): boolean {
    if (sample.mode !== 'relative') return false;
    const scale = this.#options.movementScale();
    if (!Number.isFinite(scale) || scale <= 0) {
      this.#host.reportError(new RangeError('The map movement scale must be a finite positive number'));
      return false;
    }
    if (sample.movementX !== 0 || sample.movementY !== 0) {
      this.#setPosition(moveMapPosition(this.#geometry!, this.#position!, { x: sample.movementX * scale, y: sample.movementY * scale }));
    }
    return true;
  }

  /**
   * Unlocked: absolute input on the main map moves the position there. Returns whether it lay on the main map;
   * leaving it ends the repeat.
   */
  #moveUnlocked(sample: PointerSample): boolean {
    if (sample.mode !== 'absolute') return false;
    // The Pointer Lock target is the container whose content box the geometry's frame is measured in.
    const at = mapPositionAt(this.#geometry!, { x: sample.clientX - sample.rect.left, y: sample.clientY - sample.rect.top });
    this.#inside = insideMap(at);
    if (!this.#inside) {
      this.#due = null;
      return false;
    }
    this.#setPosition(clampMapPosition(at));
    return true;
  }

  #setPosition(position: MapPosition): void {
    if (same(this.#position, position)) return;
    this.#position = position;
    this.#pending = true;
  }

  /**
   * Submits a hover for the current position unless the last map-point carried it: when a move left one pending, or
   * always before a select. Returns false when it failed.
   */
  #hover(select: boolean): boolean {
    const position = this.#position!;
    const due = this.#pending || select;
    this.#pending = false;
    if (!due || same(this.#sent, position)) return true;
    if (!this.#host.submit({ type: 'map-point', operation: 'hover', ...position })) return false;
    this.#sent = position;
    return true;
  }

  /** Selects at the current position after its hover, then holds the repeat until `clock` + interval; a failure ends it. */
  #select(clock: number): void {
    const position = this.#position!;
    this.#due = null;
    if (!this.#hover(true)) return;
    if (!this.#host.submit({ type: 'map-point', operation: 'select', ...position })) return;
    this.#due = clock + this.#policy!.repeatInterval;
  }

  #publish(): void {
    let state: MapInputState;
    if (this.#runId === null) state = 'off';
    else if (this.#error !== null) state = 'invalid';
    else if (!this.#ready()) state = 'not-ready';
    else if (!this.#qualified) state = 'suspended';
    else state = this.#mode();
    const systemPointerHidden = state === 'locked' || (state === 'unlocked' && this.#inside);
    this.#host.setStatus({ state, systemPointerHidden, error: this.#error });
  }
}
