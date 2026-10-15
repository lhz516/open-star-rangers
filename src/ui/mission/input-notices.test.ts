import { describe, expect, it, vi } from 'vitest';
import type { MissionFlowPosition } from '../../app/mission/mission-flow.ts';
import type { PlatformFamily } from '../../platform/browser/platform-family.ts';
import {
  altF4TipDue, createNoticeLatch, focusHintShown, fullscreenButtonState, GAP_NOTICE_MS, inputFocusEntry, shellFocusTarget, startWithGesture,
  visibleGapNotice, type AltF4TipFacts, type CapabilityStatus, type GapNotice, type ShellFocusFacts,
} from './input-notices.ts';
import { ALT_F4_TIP, FULLSCREEN_BUTTON, INPUT_FOCUS_HINT, INPUT_ZONE_LABEL } from './mission-copy.ts';

// P3-05 S-07, S-09, S-12 and S-13 (界面部分), AC-10 and AC-15 (组件部分): the shell's input decisions, read without a DOM.

const POSITIONS: readonly MissionFlowPosition[] = ['intro', 'config', 'departure', 'flight', 'transition', 'menu', 'ended'];

describe('focus moves to the input zone', () => {
  it('only when the departure or a running hold ends or Continue resumes the run, never for another change or none', () => {
    const entries = POSITIONS.flatMap(previous => POSITIONS.map(next => [previous, next, inputFocusEntry(previous, next)] as const))
      .filter(([, , entry]) => entry !== null);
    expect(entries).toEqual([
      ['departure', 'flight', 'departure-ended'], ['transition', 'flight', 'transition-ended'], ['menu', 'flight', 'menu-continued'],
    ]);
  });

  it('only while running, visible and focused; focus the user put on another control stays there', () => {
    const facts: ShellFocusFacts = { entry: 'departure-ended', zone: true, running: true, visible: true, windowFocused: true, focusElsewhere: false };
    expect(shellFocusTarget(facts)).toBe('zone');
    expect(shellFocusTarget({ ...facts, entry: 'menu-continued' })).toBe('zone');
    expect(shellFocusTarget({ ...facts, entry: 'transition-ended' })).toBe('zone');
    expect(shellFocusTarget({ ...facts, focusElsewhere: true })).toBe('none');
    expect(shellFocusTarget({ ...facts, focusElsewhere: true, visible: false })).toBe('none');
    // A hidden page, an unfocused window or a run the hidden page paused: the heading, where focus waits for the user.
    expect(shellFocusTarget({ ...facts, visible: false })).toBe('heading');
    expect(shellFocusTarget({ ...facts, windowFocused: false })).toBe('heading');
    expect(shellFocusTarget({ ...facts, running: false })).toBe('heading');
  });

  it('keeps P3-04 focus on the heading for any other mount, and without an input zone', () => {
    const facts: ShellFocusFacts = { entry: null, zone: true, running: true, visible: true, windowFocused: true, focusElsewhere: true };
    expect(shellFocusTarget(facts)).toBe('heading');
    expect(shellFocusTarget({ ...facts, entry: 'departure-ended', zone: false })).toBe('heading');
    expect(shellFocusTarget({ ...facts, entry: 'menu-continued', zone: false, focusElsewhere: false })).toBe('heading');
  });
});

describe('the focus hint', () => {
  it('shows while the run is running or paused and the input zone does not have focus', () => {
    expect(focusHintShown('running', false)).toBe(true);
    expect(focusHintShown('paused', false)).toBe(true);
    expect(focusHintShown('running', true)).toBe(false);
    expect(focusHintShown('paused', true)).toBe(false);
    for (const phase of ['idle', 'transition', 'stopped', 'faulted', 'disposed'] as const) expect(focusHintShown(phase, false), phase).toBe(false);
  });
});

describe('the G-item notice', () => {
  const press = (id: string, serial: number): GapNotice => ({ id, serial, title: `Title ${id}`, text: `Text ${id}` });

  it('shows each press for about three seconds from that very press', () => {
    expect(GAP_NOTICE_MS).toBe(3000);
    const first = press('G-08', 1);
    expect(visibleGapNotice(null, null)).toBeNull();
    expect(visibleGapNotice(first, null)).toBe(first);
    expect(visibleGapNotice(first, 1)).toBeNull();
  });

  it('restarts for another press of the same item, and another item replaces it, so an earlier timer hides neither', () => {
    const again = press('G-08', 2);
    expect(visibleGapNotice(again, 1)).toBe(again);
    expect(visibleGapNotice(again, 2)).toBeNull();
    const other = press('G-10', 3);
    expect(visibleGapNotice(other, 2)).toBe(other);
    // Any gap ID works, before its copy exists.
    expect(visibleGapNotice(press('G-99', 4), 3)?.id).toBe('G-99');
  });
});

describe('the Alt+F4 tip', () => {
  const FAMILIES: readonly PlatformFamily[] = ['mac', 'windows', 'linux', 'other'];
  const STATUSES: readonly CapabilityStatus[] = ['unsupported', 'idle', 'pending', 'active', 'failed'];
  const due: AltF4TipFacts = { family: 'windows', running: true, fullscreen: 'idle', shown: false };

  it('shows on Windows, Linux and an undetermined platform outside API fullscreen, never on macOS', () => {
    const shown = FAMILIES.flatMap(family => STATUSES.map(fullscreen => [family, fullscreen, altF4TipDue({ ...due, family, fullscreen })] as const))
      .filter(([, , value]) => value);
    const outside = ['unsupported', 'idle', 'pending', 'failed'];
    expect(shown).toEqual(['windows', 'linux', 'other'].flatMap(family => outside.map(status => [family, status, true])));
  });

  it('shows once fullscreen failed, was left or is still only requested, and only while a flight is running', () => {
    expect(altF4TipDue({ ...due, fullscreen: 'pending' })).toBe(true);
    expect(altF4TipDue({ ...due, fullscreen: 'failed' })).toBe(true);
    // Started fullscreen, then left it.
    expect(altF4TipDue({ ...due, fullscreen: 'active' })).toBe(false);
    expect(altF4TipDue({ ...due, fullscreen: 'idle' })).toBe(true);
    expect(altF4TipDue({ ...due, running: false })).toBe(false);
  });

  it('shows at most once per latch, which one page load shares and nothing persists', () => {
    const latch = createNoticeLatch();
    expect(altF4TipDue({ ...due, shown: latch.shown() })).toBe(true);
    latch.markShown();
    expect(altF4TipDue({ ...due, shown: latch.shown() })).toBe(false);
    expect(createNoticeLatch().shown()).toBe(false);
    expect(Object.isFrozen(latch)).toBe(true);
  });
});

describe('full screen controls', () => {
  it('offer the button unless unsupported or already fullscreen, disabled while a request is pending', () => {
    const states = Object.fromEntries((['unsupported', 'idle', 'pending', 'active', 'failed'] as const).map(status => [status, fullscreenButtonState(status)]));
    expect(states).toEqual({ unsupported: 'hidden', idle: 'enabled', pending: 'disabled', active: 'hidden', failed: 'enabled' });
  });

  it('request fullscreen within the Start click before starting, and start even when that request throws', () => {
    const calls: string[] = [];
    startWithGesture(() => { calls.push('fullscreen'); }, () => { calls.push('start'); });
    expect(calls).toEqual(['fullscreen', 'start']);
    const start = vi.fn();
    startWithGesture(undefined, start);
    expect(start).toHaveBeenCalledOnce();
    const failure = new Error('host');
    expect(() => { startWithGesture(() => { throw failure; }, start); }).toThrow(failure);
    expect(start).toHaveBeenCalledTimes(2);
  });
});

describe('input copy', () => {
  it('names the zone, asks for a click and warns about Alt+F4 without promising interception', () => {
    expect(INPUT_ZONE_LABEL).toBe('Game controls');
    expect(INPUT_FOCUS_HINT).toMatch(/^Click the game view/);
    expect(FULLSCREEN_BUTTON).toBe('Full screen');
    expect(ALT_F4_TIP.title).toMatch(/Alt\+F4 may close this window/);
    expect(ALT_F4_TIP.text).toMatch(/Full screen and the key lock do not stop the system/);
    expect(ALT_F4_TIP.text).toMatch(/without showing the leave-page confirmation/);
  });
});
