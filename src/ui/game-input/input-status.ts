/**
 * The game input's status for the mission UI (docs/plan/p3/05/spec.md: 输入区与焦点, 暂缺标注, 离散命令与重复, 全屏与
 * Keyboard Lock; 数据模型与契约 “能力申请状态与错误”): read-only facts the input consumer writes and React reads. Each
 * write is one frozen state, and an unchanged fact notifies no one. Map input (subtask 22) adds its state here. A
 * command the command feedback refused, a full queue included, is shown by that feedback's action error, not here.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  FullscreenExitFailure, FullscreenRequestFailure, KeyboardLockFailure,
} from '../../platform/browser/fullscreen.ts';
import type { PointerLockFailure } from '../../platform/input/pointer-lock.ts';
import type { InputGapId } from './input-action.ts';

/** What the consumer was doing when an input operation failed. */
export type InputOperation = 'set-intent' | 'clear-input' | 'toggle-pause' | 'open-menu' | 'submit';

export interface InputGapPress {
  readonly gap: InputGapId;
  /** Rises with every press, so a press of the same item again restarts its notice. */
  readonly serial: number;
}

export interface InputError {
  readonly operation: InputOperation;
  /** As thrown, an opaque reference. */
  readonly cause: unknown;
  /** Rises with every failure, so the same failure again is a new error. */
  readonly serial: number;
}

export type CapabilityName = 'fullscreen' | 'keyboardLock' | 'pointerLock';

/**
 * `unsupported`: the host has no such capability. `pending`: a request is open. `active`: the document's actual
 * fullscreen element is the root, the key lock succeeded and is in force, or the port confirmed the pointer on its
 * target; never a request or promise alone. `failed`: the latest request failed.
 */
export type CapabilityState = 'unsupported' | 'idle' | 'pending' | 'active' | 'failed';

/** `request`: a fullscreen, key lock or Pointer Lock request; `release`: an exit or unlock. */
export type CapabilityOperation = 'request' | 'release';

/**
 * A stable category, never a host error: the platform ports' reasons, plus `closing` for a request refused while an
 * earlier request or close of the same capability, or of an earlier owner, is still open.
 */
export type CapabilityFailureReason =
  | FullscreenRequestFailure | FullscreenExitFailure | KeyboardLockFailure | PointerLockFailure | 'closing';

export interface CapabilityFailure {
  readonly operation: CapabilityOperation;
  readonly reason: CapabilityFailureReason;
}

export interface CapabilityStatus {
  readonly state: CapabilityState;
  /** The owner whose input this is; null before the consumer connects. */
  readonly ownerId: number | null;
  /** The run the latest request belongs to; null without one, and for a start's fullscreen until that start succeeded. */
  readonly runId: number | null;
  /** The latest request's generation within the owner; 0 before the first. */
  readonly generation: number;
  /**
   * The latest failure, until the next request or release of the capability succeeds. A failed release keeps an active
   * state: what could not be confirmed released is not reported released. A failed key lock beside an active fullscreen
   * is the degraded "fullscreen, keys not locked" state.
   */
  readonly failure: CapabilityFailure | null;
}

export type CapabilityStatuses = Readonly<Record<CapabilityName, CapabilityStatus>>;

export interface InputStatus {
  /** The run is running or paused while the input zone does not qualify: the "click the game view" hint shows. */
  readonly focusHint: boolean;
  /**
   * The latest G-item press, or null. The shell shows it for about 3 s from that very press (`GAP_NOTICE_MS` of
   * ui/mission/input-notices.ts); it does not move focus or pause.
   */
  readonly gap: InputGapPress | null;
  /** The latest input failure; the next new press whose action or intent change goes through, and the next run, clear it. */
  readonly error: InputError | null;
  /** Fullscreen, Keyboard Lock and Pointer Lock (subtask 21); browser state, never Core's or a recording's. */
  readonly capabilities: CapabilityStatuses;
}

export type InputStatusReader = Pick<StoreApi<InputStatus>, 'getState' | 'getInitialState' | 'subscribe'>;

export interface InputStatusWriter {
  readonly reader: InputStatusReader;
  setFocusHint(shown: boolean): void;
  markGap(gap: InputGapId): void;
  reportError(operation: InputOperation, cause: unknown): void;
  clearError(): void;
  /** One write for all three, notifying only when one of them changed; an unchanged one keeps its object. */
  setCapabilities(statuses: CapabilityStatuses): void;
}

const CAPABILITY_NAMES: readonly CapabilityName[] = ['fullscreen', 'keyboardLock', 'pointerLock'];

const UNSUPPORTED: CapabilityStatus = Object.freeze({ state: 'unsupported', ownerId: null, runId: null, generation: 0, failure: null });

const sameCapability = (a: CapabilityStatus, b: CapabilityStatus): boolean =>
  a.state === b.state && a.ownerId === b.ownerId && a.runId === b.runId && a.generation === b.generation
  && a.failure?.operation === b.failure?.operation && a.failure?.reason === b.failure?.reason;

export function createInputStatus(): InputStatusWriter {
  const initial: InputStatus = Object.freeze({
    focusHint: false, gap: null, error: null,
    capabilities: Object.freeze({ fullscreen: UNSUPPORTED, keyboardLock: UNSUPPORTED, pointerLock: UNSUPPORTED }),
  });
  const store = createStore<InputStatus>()(() => initial);
  let gaps = 0;
  let errors = 0;
  const write = (change: Partial<InputStatus>): void => {
    store.setState(Object.freeze({ ...store.getState(), ...change }), true);
  };
  return Object.freeze({
    reader: Object.freeze({ getState: store.getState, getInitialState: store.getInitialState, subscribe: store.subscribe }),
    setFocusHint(shown: boolean) {
      if (store.getState().focusHint !== shown) write({ focusHint: shown });
    },
    markGap(gap: InputGapId) {
      write({ gap: Object.freeze({ gap, serial: ++gaps }) });
    },
    reportError(operation: InputOperation, cause: unknown) {
      write({ error: Object.freeze({ operation, cause, serial: ++errors }) });
    },
    clearError() {
      if (store.getState().error !== null) write({ error: null });
    },
    setCapabilities(statuses: CapabilityStatuses) {
      const { capabilities } = store.getState();
      const changed = CAPABILITY_NAMES.filter((name) => !sameCapability(capabilities[name], statuses[name]));
      if (changed.length === 0) return;
      const next = { ...capabilities };
      for (const name of changed) {
        const { state, ownerId, runId, generation, failure } = statuses[name];
        const copied = failure && Object.freeze({ operation: failure.operation, reason: failure.reason });
        next[name] = Object.freeze({ state, ownerId, runId, generation, failure: copied });
      }
      write({ capabilities: Object.freeze(next) });
    },
  });
}
