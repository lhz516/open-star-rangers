import { describe, expect, it } from 'vitest';
import type { MissionSoundStatus } from '../../app/mission/mission-owner.ts';
import type { GameSessionPhase } from '../../app/session/session-errors.ts';
import { ENABLE_SOUND, enableSoundFocus, enableSoundOffered, soundStatusText, type EnableSoundFocusFacts } from './audio-copy.ts';

// P3-14 S-09 and AC-11 (界面部分): the sound status line, when the enable-sound control shows and where focus goes after
// its click, read without a DOM.

const STATUSES: readonly MissionSoundStatus[] = ['waiting-close', 'needs-activation', 'available', 'paused', 'host-suspended', 'unavailable', 'failed'];
const PHASES: readonly GameSessionPhase[] = ['idle', 'transition', 'running', 'paused', 'stopped', 'completed', 'faulted', 'disposed'];

describe('the sound status line', () => {
  it('names each status in English, without codes, and a running context is not playing sound', () => {
    const texts = STATUSES.map(soundStatusText);
    expect(new Set(texts).size).toBe(STATUSES.length);
    for (const text of texts) expect(text).toMatch(/^Sound: [a-z][^_]*\.$/);
    expect(soundStatusText('waiting-close')).toMatch(/waiting for the previous mission's audio to close/);
    expect(soundStatusText('needs-activation')).toMatch(/off until you enable it/);
    expect(soundStatusText('available')).toBe('Sound: on.');
    expect(soundStatusText('paused')).toMatch(/paused with the game/);
    expect(soundStatusText('host-suspended')).toMatch(/suspended by the browser/);
    // The game goes on silently either way.
    expect(soundStatusText('unavailable')).toMatch(/unavailable.*continues without sound/);
    expect(soundStatusText('failed')).toMatch(/failed.*continues without sound/);
    expect(ENABLE_SOUND).toBe('Enable sound');
  });
});

describe('the enable-sound control', () => {
  it('shows only where the owner takes the click and it can change the sound', () => {
    const offered = STATUSES.flatMap(status => PHASES.filter(phase => enableSoundOffered(status, phase)).map(phase => `${status} ${phase}`));
    expect(offered).toEqual([
      // A locked or idle controller, in the holds, a running or paused flight (the menu's included) and a stopped run.
      'needs-activation transition', 'needs-activation running', 'needs-activation paused', 'needs-activation stopped',
      // A suspended one resumes only with the pause gate open: a paused game's own resume does that.
      'host-suspended transition', 'host-suspended running', 'host-suspended stopped',
    ]);
  });
});

describe('focus after an enable-sound click', () => {
  const facts: EnableSoundFocusFacts = { status: 'available', offered: false, controlFocused: true, visible: true, zoneReady: true };

  it('moves to the input zone only when the sound became available under the P3-05 conditions', () => {
    expect(enableSoundFocus(facts)).toBe('zone');
    // Not in a running flight with a focused window (the menu, a paused game, a stopped run): the page's own action.
    expect(enableSoundFocus({ ...facts, zoneReady: false })).toBe('action');
    expect(enableSoundFocus({ ...facts, status: 'paused' })).toBe('action');
  });

  it('stays on a control still offered, so a refused or pending unlock keeps its focus', () => {
    expect(enableSoundFocus({ ...facts, status: 'needs-activation', offered: true })).toBe('stay');
    expect(enableSoundFocus({ ...facts, status: 'host-suspended', offered: true })).toBe('stay');
  });

  it('keeps an operable focus after a failure, and never moves focus the user moved or on a hidden page', () => {
    expect(enableSoundFocus({ ...facts, status: 'failed' })).toBe('action');
    expect(enableSoundFocus({ ...facts, status: 'unavailable' })).toBe('action');
    for (const status of STATUSES) {
      for (const offered of [false, true]) {
        expect(enableSoundFocus({ ...facts, status, offered, controlFocused: false })).toBe('none');
        expect(enableSoundFocus({ ...facts, status, offered, visible: false })).toBe('none');
      }
    }
  });
});
