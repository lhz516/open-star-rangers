/**
 * The game input's status for the mission UI (docs/plan/p3/05/spec.md: 输入区与焦点, 暂缺标注, 离散命令与重复): read-only
 * facts the input consumer writes and React reads. Each write is one frozen state, and an unchanged fact notifies no
 * one. Capabilities and map input (subtasks 21 and 22) add their states here. A command the command feedback refused,
 * a full queue included, is shown by that feedback's action error, not here.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
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
}

export type InputStatusReader = Pick<StoreApi<InputStatus>, 'getState' | 'getInitialState' | 'subscribe'>;

export interface InputStatusWriter {
  readonly reader: InputStatusReader;
  setFocusHint(shown: boolean): void;
  markGap(gap: InputGapId): void;
  reportError(operation: InputOperation, cause: unknown): void;
  clearError(): void;
}

export function createInputStatus(): InputStatusWriter {
  const initial: InputStatus = Object.freeze({ focusHint: false, gap: null, error: null });
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
  });
}
