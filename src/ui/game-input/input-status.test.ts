import { describe, expect, it, vi } from 'vitest';
import { createInputStatus, type CapabilityStatus } from './input-status.ts';

// P3-05 subtasks 20 and 21: the input status the mission UI reads (docs/plan/p3/05/spec.md: 输入区与焦点, 暂缺标注,
// 全屏与 Keyboard Lock; 数据模型与契约 “能力申请状态与错误”).

const UNSUPPORTED: CapabilityStatus = { state: 'unsupported', ownerId: null, runId: null, generation: 0, failure: null };
const capabilities = { fullscreen: UNSUPPORTED, keyboardLock: UNSUPPORTED, pointerLock: UNSUPPORTED };

describe('input status', () => {
  it('starts without a hint, notice or error, frozen', () => {
    const { reader } = createInputStatus();
    expect(reader.getState()).toEqual({ focusHint: false, gap: null, error: null, capabilities });
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
    expect(shown).toEqual({ focusHint: true, gap: null, error: null, capabilities });
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
    expect(status.reader.getState()).toEqual({ focusHint: false, gap: { gap: 'G-09', serial: 1 }, error: null, capabilities });
  });

  it('starts every capability unsupported, and writes them as frozen copies, notifying only when one changed', () => {
    const status = createInputStatus();
    const listener = vi.fn();
    status.reader.subscribe(listener);
    status.setCapabilities({ fullscreen: { ...UNSUPPORTED }, keyboardLock: { ...UNSUPPORTED }, pointerLock: { ...UNSUPPORTED } });
    expect(listener).not.toHaveBeenCalled();

    const failure = { operation: 'request', reason: 'denied' } as const;
    const written: CapabilityStatus = { state: 'failed', ownerId: 1, runId: 2, generation: 3, failure };
    const before = status.reader.getState().capabilities;
    status.setCapabilities({ ...capabilities, keyboardLock: written });
    const shown = status.reader.getState().capabilities;
    expect(shown).toEqual({ ...capabilities, keyboardLock: written });
    expect(shown.keyboardLock).not.toBe(written);
    expect([shown, shown.keyboardLock, shown.keyboardLock.failure].every(Object.isFrozen)).toBe(true);
    // The unchanged ones keep their objects.
    expect([shown.fullscreen === before.fullscreen, shown.pointerLock === before.pointerLock]).toEqual([true, true]);
    // Equal facts in new objects notify no one; each field that differs does.
    status.setCapabilities({ ...capabilities, keyboardLock: { ...written, failure: { ...failure } } });
    expect(listener).toHaveBeenCalledTimes(1);
    for (const change of [{ state: 'idle' }, { ownerId: 2 }, { runId: null }, { generation: 4 }, { failure: null },
      { failure: { operation: 'release', reason: 'failed' } }] as const) {
      status.setCapabilities({ ...capabilities, keyboardLock: { ...written, ...change } });
      status.setCapabilities({ ...capabilities, keyboardLock: written });
    }
    expect(listener).toHaveBeenCalledTimes(13);
    // Several changes are one write.
    status.setCapabilities({ fullscreen: written, keyboardLock: written, pointerLock: written });
    expect(listener).toHaveBeenCalledTimes(14);
  });
});
