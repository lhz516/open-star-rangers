// Per-voice parameters and source progress for the audio controller (P2-08's P3-14 revision, D-01): validation of the
// integer parameters, their Web Audio mapping, and the remaining source frames of a `repeat` voice under rate changes.

/** The highest rate in Hz a voice accepts: the game's own clamp (audio A-09). */
export const AUDIO_RATE_LIMIT = 44_100;

const MAX_LEVEL = 127;
const DEFAULT_VOLUME = 127;
const DEFAULT_PAN = 64;

export interface VoiceParameters {
  /** Integer 0–127; the gain is volume ÷ 127. */
  readonly volume: number;
  /** Integer 0–127; 63 and 64 leave both channels full. */
  readonly pan: number;
  /** Integer Hz, 1–`AUDIO_RATE_LIMIT`. */
  readonly rate: number;
}

/** What a parameterised voice port applies: finite gains and the source's `playbackRate`. */
export interface VoiceNodeParameters {
  readonly gain: number;
  /** Gain of the first output channel, Web Audio's channel 0 (left, D1-07). */
  readonly left: number;
  /** Gain of the second output channel. */
  readonly right: number;
  readonly playbackRate: number;
}

const LIMITS: Readonly<Record<keyof VoiceParameters, number>> = Object.freeze({ volume: MAX_LEVEL, pan: MAX_LEVEL, rate: AUDIO_RATE_LIMIT });
const LOWEST: Readonly<Record<keyof VoiceParameters, number>> = Object.freeze({ volume: 0, pan: 0, rate: 1 });

/**
 * Checks the whole object and merges what it gives into `base`; null when anything given is not an integer in range.
 * A property that is absent or `undefined` keeps its base value.
 */
export function mergeVoiceParameters(base: VoiceParameters, given: unknown): VoiceParameters | null {
  if (typeof given !== 'object' || given === null) return null;
  const merged = { ...base };
  for (const key of Object.keys(LIMITS) as (keyof VoiceParameters)[]) {
    const value: unknown = (given as Partial<Record<keyof VoiceParameters, unknown>>)[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || (value as number) < LOWEST[key] || (value as number) > LIMITS[key]) return null;
    merged[key] = value as number;
  }
  return Object.freeze(merged);
}

/** The parameters of a voice given none: full volume, centred, at the buffer's stored rate. */
export const defaultVoiceParameters = (storedRate: number): VoiceParameters =>
  Object.freeze({ volume: DEFAULT_VOLUME, pan: DEFAULT_PAN, rate: storedRate });

/** A09's linear balance table T, scaled to 0–1: T[i] = 2i for i ≤ 62 and 128 from 63 on, divided by 128. */
const balance = (index: number): number => (index <= 62 ? 2 * index : 128) / 128;

/** The Web Audio values of valid `parameters` for a buffer stored at `storedRate` Hz (D1-07, D1-13). */
export const voiceNodeParameters = ({ volume, pan, rate }: VoiceParameters, storedRate: number): VoiceNodeParameters =>
  Object.freeze({ gain: volume / MAX_LEVEL, left: balance(MAX_LEVEL - pan), right: balance(pan), playbackRate: rate / storedRate });

/**
 * The source frames a `repeat` voice still has to play, counted from context time: each rate change folds the frames
 * played since the last one in, so the voice plays exactly its passes whatever the rate, and pausing (a context time
 * that stands still) consumes nothing.
 */
export class RepeatProgress {
  readonly #storedRate: number;
  #remaining: number;
  #since: number;
  #playbackRate: number;

  /** `frames` source frames in all passes from context time `start` at `playbackRate`. */
  constructor(frames: number, storedRate: number, start: number, playbackRate: number) {
    this.#remaining = frames;
    this.#storedRate = storedRate;
    this.#since = start;
    this.#playbackRate = playbackRate;
  }

  /** The context time the last pass ends at the current rate. */
  stopTime(): number {
    return this.#since + this.#remaining / (this.#storedRate * this.#playbackRate);
  }

  /** Changes the rate from context time `now`: the new stop time, or null when the rate is unchanged. */
  retarget(now: number, playbackRate: number): number | null {
    if (playbackRate === this.#playbackRate) return null;
    const played = Math.max(0, now - this.#since) * this.#storedRate * this.#playbackRate;
    this.#remaining = Math.max(0, this.#remaining - played);
    this.#since = Math.max(now, this.#since);
    this.#playbackRate = playbackRate;
    return this.stopTime();
  }
}
