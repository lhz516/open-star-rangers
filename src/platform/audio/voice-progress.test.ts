import { describe, expect, it } from 'vitest';
import {
  AUDIO_RATE_LIMIT, defaultVoiceParameters, mergeVoiceParameters, RepeatProgress, voiceNodeParameters, type VoiceParameters,
} from './voice-progress.ts';

const BASE: VoiceParameters = defaultVoiceParameters(11_025);

describe('voice parameters', () => {
  it('defaults to full volume, centred and the stored rate', () => {
    expect(BASE).toEqual({ volume: 127, pan: 64, rate: 11_025 });
    expect(mergeVoiceParameters(BASE, {})).toEqual(BASE);
    expect(mergeVoiceParameters(BASE, { volume: undefined, pan: 3 })).toEqual({ volume: 127, pan: 3, rate: 11_025 });
    expect(Object.isFrozen(mergeVoiceParameters(BASE, {}))).toBe(true);
  });

  it.each([
    ['the lowest values', { volume: 0, pan: 0, rate: 1 }],
    ['the highest values', { volume: 127, pan: 127, rate: AUDIO_RATE_LIMIT }],
  ])('accepts %s', (_name, given) => {
    expect(mergeVoiceParameters(BASE, given)).toEqual(given);
  });

  it.each([
    ['volume -1', { volume: -1 }],
    ['volume 128', { volume: 128 }],
    ['pan -1', { pan: -1 }],
    ['pan 128', { pan: 128 }],
    ['rate 0', { rate: 0 }],
    ['rate above the limit', { rate: AUDIO_RATE_LIMIT + 1 }],
    ['a fraction', { pan: 63.5 }],
    ['NaN', { volume: Number.NaN }],
    ['infinity', { rate: Number.POSITIVE_INFINITY }],
    ['a numeric string', { volume: '64' }],
    ['null', { pan: null }],
    // One bad value rejects the whole object, never a part of it.
    ['a bad value beside good ones', { volume: 10, pan: 20, rate: -5 }],
  ])('rejects %s', (_name, given) => {
    expect(mergeVoiceParameters(BASE, given)).toBeNull();
  });

  it.each([null, 5, 'loud'])('rejects a non-object %s', given => {
    expect(mergeVoiceParameters(BASE, given)).toBeNull();
  });

  it('maps volume linearly, pan through the linear balance table and rate against the stored rate', () => {
    const at = (pan: number) => {
      const { left, right } = voiceNodeParameters({ ...BASE, pan }, 11_025);
      return [left * 128, right * 128];
    };
    expect([0, 32, 63, 64, 96, 127].map(at)).toEqual([[128, 0], [128, 64], [128, 128], [128, 128], [62, 128], [0, 128]]);
    expect(voiceNodeParameters({ volume: 0, pan: 64, rate: 22_050 }, 11_025)).toEqual({ gain: 0, left: 1, right: 1, playbackRate: 2 });
    expect(voiceNodeParameters({ volume: 50, pan: 64, rate: 1 }, 8_000)).toEqual({ gain: 50 / 127, left: 1, right: 1, playbackRate: 1 / 8_000 });
  });
});

describe('repeat progress', () => {
  it('stops after exactly its frames at a constant rate', () => {
    expect(new RepeatProgress(8_000, 8_000, 1.5, 1).stopTime()).toBe(2.5);
    expect(new RepeatProgress(8_000, 8_000, 1.5, 2).stopTime()).toBe(2);
  });

  it('counts the frames played before a rate change, and only those', () => {
    const progress = new RepeatProgress(8_000, 8_000, 0, 1);
    // A quarter played at rate 1, then the remaining 6000 frames at twice the rate.
    expect(progress.retarget(0.25, 2)).toBe(0.25 + 6_000 / 16_000);
    // The same rate changes nothing.
    expect(progress.retarget(0.3, 2)).toBeNull();
    // A context time that stands still, as while suspended, plays nothing.
    expect(progress.retarget(0.25, 0.5)).toBe(0.25 + 6_000 / 4_000);
  });

  it('never counts more than its frames, so a late change stops at once', () => {
    const progress = new RepeatProgress(800, 8_000, 0, 1);
    expect(progress.retarget(5, 3)).toBe(5);
  });
});
