import { describe, expect, it, vi } from 'vitest';
import { createInputStatus } from './input-status.ts';

// P3-05 subtask 20: the input status the mission UI reads (docs/plan/p3/05/spec.md: 输入区与焦点, 暂缺标注).

describe('input status', () => {
  it('starts without a hint, notice or error, frozen', () => {
    const { reader } = createInputStatus();
    expect(reader.getState()).toEqual({ focusHint: false, gap: null, error: null });
    expect(reader.getState()).toBe(reader.getInitialState());
    expect(Object.isFrozen(reader.getState())).toBe(true);
  });

  it('notifies only when a fact changes, with one frozen state per write', () => {
    const status = createInputStatus();
    const listener = vi.fn();
    status.reader.subscribe(listener);
    status.setFocusHint(false);
    status.clearError();
    expect(listener).not.toHaveBeenCalled();
    status.setFocusHint(true);
    const shown = status.reader.getState();
    status.setFocusHint(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shown).toEqual({ focusHint: true, gap: null, error: null });
    expect(Object.isFrozen(shown)).toBe(true);
    expect(status.reader.getState()).toBe(shown);
  });

  it('gives every G-item press a new serial, so the same item again restarts its notice', () => {
    const status = createInputStatus();
    status.markGap('G-08');
    const first = status.reader.getState().gap;
    status.markGap('G-08');
    status.markGap('G-10');
    expect([first, status.reader.getState().gap]).toEqual([{ gap: 'G-08', serial: 1 }, { gap: 'G-10', serial: 3 }]);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('keeps the latest error with its cause until cleared; the same failure again is a new error', () => {
    const status = createInputStatus();
    const cause = new Error('refused');
    status.reportError('set-intent', cause);
    status.reportError('set-intent', cause);
    const { error } = status.reader.getState();
    expect(error).toEqual({ operation: 'set-intent', cause, serial: 2 });
    expect(error!.cause).toBe(cause);
    expect(Object.isFrozen(error)).toBe(true);
    status.markGap('G-09');
    expect(status.reader.getState().error).toBe(error);
    status.clearError();
    expect(status.reader.getState()).toEqual({ focusHint: false, gap: { gap: 'G-09', serial: 1 }, error: null });
  });
});
