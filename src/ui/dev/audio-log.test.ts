import { describe, expect, it } from 'vitest';
import { describeSoundDecision, describeVoiceSource, SOUND_LOG_LIMIT, SoundLog } from './audio-log.ts';
import { SOUND, soundDecision } from './dev-diagnostics.test-support.ts';
import { EVENT_LOG_LIMIT } from './event-log.ts';

// P3-14 S-09 and AC-12 (日志部分): the development sound log's window, truncation and fields, read without a DOM.

describe('the sound log', () => {
  it('keeps the P3-04 window of the latest 500 decisions, oldest first, and says when older ones were dropped', () => {
    expect(SOUND_LOG_LIMIT).toBe(EVENT_LOG_LIMIT);
    expect(SOUND_LOG_LIMIT).toBe(500);
    const log = new SoundLog();
    for (let tick = 0; tick < SOUND_LOG_LIMIT; tick++) log.append(soundDecision(tick));
    expect(log.view()).toMatchObject({ total: 500, truncated: false });
    expect(log.view().entries[0]).toMatchObject({ sequence: 1, tick: 0 });
    log.append(soundDecision(500));
    log.append(soundDecision(501));
    const { entries, total, truncated } = log.view();
    expect({ length: entries.length, total, truncated }).toEqual({ length: 500, total: 502, truncated: true });
    expect(entries[0]).toMatchObject({ sequence: 3, tick: 2 });
    expect(entries.at(-1)).toMatchObject({ sequence: 502, tick: 501 });
    expect(entries.map(({ sequence }) => sequence)).toEqual(Array.from({ length: 500 }, (_, index) => index + 3));
  });

  it('returns the same frozen view until it changes, and clears to empty', () => {
    const log = new SoundLog();
    const empty = log.view();
    log.append(soundDecision(1));
    const view = log.view();
    expect(view).not.toBe(empty);
    expect(log.view()).toBe(view);
    expect(Object.isFrozen(view) && Object.isFrozen(view.entries) && Object.isFrozen(view.entries[0])).toBe(true);
    log.clear();
    expect(log.view()).toEqual({ entries: [], total: 0, truncated: false });
    log.append(soundDecision(2));
    expect(log.view().entries[0]?.sequence).toBe(1);
  });

  it('describes each field the spec lists: owner, run, tick, clock, trigger, Asset, source, class, result, code, parameters and cut voice', () => {
    expect(describeSoundDecision(soundDecision(40))).toBe(
      `owner 1 run 2 · tick 40 · clock 80 · event #0 · ${SOUND} · entity 5 slot 0 · class 1 · started · volume=100 pan=64 rate=22050`,
    );
    expect(describeSoundDecision(soundDecision(3, {
      trigger: null, source: { namespace: 'effect', id: 'core:4:1' }, voiceClass: 5, result: 'refused', code: 'voice-limit', parameters: null,
    }))).toMatch(/· no event · .* · effect core:4:1 · class 5 · refused \(voice-limit\)$/);
    expect(describeSoundDecision(soundDecision(4, { preempted: { namespace: 'cue', cue: 'lock-loop' }, parameters: { rate: 11025 } })))
      .toMatch(/· started · rate=11025 · cut cue lock-loop$/);
    // A stop of every voice: no sound, source or class.
    expect(describeSoundDecision(soundDecision(5, { trigger: null, sound: null, source: null, voiceClass: null, result: 'stopped', code: 'stop-all', parameters: null })))
      .toBe('owner 1 run 2 · tick 5 · clock 10 · no event · no sound · every voice · stopped (stop-all)');
    expect(describeSoundDecision(soundDecision(6, { sound: null, result: 'silent', code: 'empty-slot', parameters: null })))
      .toMatch(/no sound · entity 5 slot 0 · class 1 · silent \(empty-slot\)$/);
    expect(describeVoiceSource({ namespace: 'by-id' })).toBe('by-id');
  });
});
