import { fail } from './contract-validation.ts';
import { isDetached } from './ownership.ts';

// Canonical sound payload, schema 2 (P2-08 S-02; P3-03 spec, sound payload schema 2): a 16-byte little-endian header
// followed by interleaved PCM in the source's compact encoding. Schema 2 added loop mode 2 (`repeat`) and turned the
// reserved byte 15 into its play count, so a `none` or `whole` payload has the same bytes as in schema 1. Any change to
// the fields, encodings, ranges or the float mapping is a new schema version.

export const SOUND_PAYLOAD_SCHEMA_VERSION = 2;
export const SOUND_PAYLOAD_TAG = 'OSRS';
export const SOUND_PAYLOAD_HEADER_BYTES = 16;
export const SOUND_PAYLOAD_OFFSETS = Object.freeze({
  tag: 0,
  sampleRate: 4,
  frames: 8,
  channels: 12,
  encoding: 13,
  loop: 14,
  plays: 15,
  pcm: SOUND_PAYLOAD_HEADER_BYTES,
} as const);

/** The sample rates Web Audio's `createBuffer` must support, inclusive. */
export const SOUND_SAMPLE_RATE_RANGE = Object.freeze({ min: 8_000, max: 96_000 } as const);
export const SOUND_CHANNEL_COUNTS = Object.freeze([1, 2] as const);
export type SoundChannelCount = typeof SOUND_CHANNEL_COUNTS[number];
/** Header codes of the sample encodings: unsigned 8-bit and signed 16-bit little-endian. */
export const SOUND_ENCODINGS = Object.freeze({ u8: 1, s16le: 2 } as const);
export type SoundEncoding = keyof typeof SOUND_ENCODINGS;
export const SOUND_ENCODING_BYTES: Readonly<Record<SoundEncoding, 1 | 2>> = Object.freeze({ u8: 1, s16le: 2 });
/** Header codes of the loop modes: play once, loop the whole clip until stopped, or play it `plays` times back to back. */
export const SOUND_LOOP_MODES = Object.freeze({ none: 0, whole: 1, repeat: 2 } as const);
export type SoundLoop = keyof typeof SOUND_LOOP_MODES;
/** The play counts of a `repeat` sound, inclusive; the count byte of every other loop mode is 0. */
export const SOUND_REPEAT_PLAYS = Object.freeze({ min: 2, max: 255 } as const);

const MAX_FRAMES = 0xffff_ffff;

/** How a sound plays: its loop mode, with a play count for `repeat` only. */
export type SoundPlayback =
  | { readonly loop: 'none' | 'whole'; readonly plays?: never }
  | { readonly loop: 'repeat'; readonly plays: number };

export type SoundFormat = SoundPlayback & {
  /** Frames per second, kept from the source without resampling. */
  readonly sampleRate: number;
  readonly channels: SoundChannelCount;
  readonly encoding: SoundEncoding;
};

/** The input of `writeSoundPayload`: PCM already in the canonical encoding, frames interleaved. */
export type SoundPayloadInput = SoundFormat & { readonly pcm: Uint8Array };

/** A read payload: frozen header fields and a read-only subview of the payload's PCM. */
export type SoundPayload = SoundFormat & { readonly frames: number; readonly pcm: Uint8Array };

const invalid = (path: string, reason: string): never => fail('invalid-sound-payload', path, reason);

const nameOf = <Name extends string>(codes: Readonly<Record<Name, number>>, code: number): Name | undefined =>
  (Object.keys(codes) as Name[]).find(name => codes[name] === code);

function checkSampleRate(sampleRate: unknown, path: string): void {
  if (typeof sampleRate !== 'number' || !Number.isInteger(sampleRate)
    || sampleRate < SOUND_SAMPLE_RATE_RANGE.min || sampleRate > SOUND_SAMPLE_RATE_RANGE.max) {
    invalid(path, 'must be an integer from 8000 to 96000 Hz');
  }
}

function checkChannels(channels: unknown, path: string): asserts channels is SoundChannelCount {
  if (!SOUND_CHANNEL_COUNTS.some(count => count === channels)) invalid(path, 'must be 1 or 2');
}

function checkPlays(plays: unknown, path: string): asserts plays is number {
  if (typeof plays !== 'number' || !Number.isInteger(plays) || plays < SOUND_REPEAT_PLAYS.min || plays > SOUND_REPEAT_PLAYS.max) {
    invalid(path, 'must be an integer from 2 to 255');
  }
}

const pcmBytes = (frames: number, channels: SoundChannelCount, encoding: SoundEncoding): number =>
  frames * channels * SOUND_ENCODING_BYTES[encoding];

/**
 * Writes a schema 2 payload into a new exclusive buffer of exactly its length, after checking the input by the reader's
 * rules: `plays` is present for `repeat` only. The PCM is copied unchanged; the input view is never modified or retained.
 */
export function writeSoundPayload(input: SoundPayloadInput, path = 'sound'): Uint8Array<ArrayBuffer> {
  const { sampleRate, channels, encoding, loop, plays, pcm } = input;
  checkSampleRate(sampleRate, `${path}.sampleRate`);
  checkChannels(channels, `${path}.channels`);
  if (typeof encoding !== 'string' || !Object.hasOwn(SOUND_ENCODINGS, encoding)) invalid(`${path}.encoding`, 'must be u8 or s16le');
  if (typeof loop !== 'string' || !Object.hasOwn(SOUND_LOOP_MODES, loop)) invalid(`${path}.loop`, 'must be none, whole or repeat');
  if (loop === 'repeat') checkPlays(plays, `${path}.plays`);
  else if (Object.hasOwn(input, 'plays')) invalid(`${path}.plays`, 'must be absent unless the loop mode is repeat');
  if (!(pcm instanceof Uint8Array)) invalid(`${path}.pcm`, 'must be a Uint8Array');
  if (isDetached(pcm.buffer)) fail('payload-detached', `${path}.pcm`, 'was transferred away and can no longer be used');
  const frameBytes = pcmBytes(1, channels, encoding);
  const frames = pcm.byteLength / frameBytes;
  if (!Number.isInteger(frames) || frames < 1) invalid(`${path}.pcm`, 'must hold one or more whole frames');
  if (frames > MAX_FRAMES) invalid(`${path}.pcm`, 'must hold at most 2^32 - 1 frames');

  const bytes = new Uint8Array(SOUND_PAYLOAD_HEADER_BYTES + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < SOUND_PAYLOAD_TAG.length; index++) bytes[SOUND_PAYLOAD_OFFSETS.tag + index] = SOUND_PAYLOAD_TAG.charCodeAt(index);
  view.setUint32(SOUND_PAYLOAD_OFFSETS.sampleRate, sampleRate, true);
  view.setUint32(SOUND_PAYLOAD_OFFSETS.frames, frames, true);
  bytes[SOUND_PAYLOAD_OFFSETS.channels] = channels;
  bytes[SOUND_PAYLOAD_OFFSETS.encoding] = SOUND_ENCODINGS[encoding];
  bytes[SOUND_PAYLOAD_OFFSETS.loop] = SOUND_LOOP_MODES[loop];
  bytes[SOUND_PAYLOAD_OFFSETS.plays] = plays ?? 0;
  bytes.set(pcm, SOUND_PAYLOAD_OFFSETS.pcm);
  return bytes;
}

/**
 * Reads a schema 2 payload: length, tag, field values, play count, frame count, then the exact PCM length with no
 * trailing bytes. Nothing is allocated from the declared frame count, and diagnostics never echo a value. The bytes do
 * not name their schema: a caller holding a payload record checks its schema version first.
 */
export function readSoundPayload(bytes: Uint8Array, path = 'payload'): SoundPayload {
  if (!(bytes instanceof Uint8Array)) invalid(path, 'must be a Uint8Array');
  if (isDetached(bytes.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  if (bytes.byteLength < SOUND_PAYLOAD_HEADER_BYTES) invalid(path, 'must be at least the 16-byte header long');
  for (let index = 0; index < SOUND_PAYLOAD_TAG.length; index++) {
    if (bytes[SOUND_PAYLOAD_OFFSETS.tag + index] !== SOUND_PAYLOAD_TAG.charCodeAt(index)) invalid(`${path}.tag`, 'must be OSRS');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(SOUND_PAYLOAD_OFFSETS.sampleRate, true);
  checkSampleRate(sampleRate, `${path}.sampleRate`);
  const channels = bytes[SOUND_PAYLOAD_OFFSETS.channels];
  checkChannels(channels, `${path}.channels`);
  const encoding = nameOf(SOUND_ENCODINGS, bytes[SOUND_PAYLOAD_OFFSETS.encoding]) ?? invalid(`${path}.encoding`, 'must be 1 (u8) or 2 (s16le)');
  const loop = nameOf(SOUND_LOOP_MODES, bytes[SOUND_PAYLOAD_OFFSETS.loop]) ?? invalid(`${path}.loop`, 'must be 0 (none), 1 (whole) or 2 (repeat)');
  const plays = bytes[SOUND_PAYLOAD_OFFSETS.plays];
  if (loop === 'repeat' && plays < SOUND_REPEAT_PLAYS.min) invalid(`${path}.plays`, 'must be from 2 to 255 for repeat');
  if (loop !== 'repeat' && plays !== 0) invalid(`${path}.plays`, 'must be 0 unless the loop mode is repeat');
  const frames = view.getUint32(SOUND_PAYLOAD_OFFSETS.frames, true);
  if (frames < 1) invalid(`${path}.frames`, 'must be at least 1');
  if (bytes.byteLength - SOUND_PAYLOAD_HEADER_BYTES !== pcmBytes(frames, channels, encoding)) {
    invalid(`${path}.pcm`, 'must be exactly frames × channels × bytes per sample long');
  }
  const playback = loop === 'repeat' ? { loop, plays } : { loop };
  return Object.freeze({ sampleRate, frames, channels, encoding, ...playback, pcm: bytes.subarray(SOUND_PAYLOAD_OFFSETS.pcm) });
}

/**
 * The single float mapping of a read payload: one new Float32Array per channel, deinterleaved. `u8` v maps to
 * (v − 128) / 128 and `s16le` v to v / 32768, read little-endian whatever the host byte order.
 */
export function soundChannelData(sound: SoundPayload): Float32Array[] {
  const { frames, channels, encoding, pcm } = sound;
  const data = Array.from({ length: channels }, () => new Float32Array(frames));
  if (encoding === 'u8') {
    for (let frame = 0, sample = 0; frame < frames; frame++) {
      for (let channel = 0; channel < channels; channel++, sample++) data[channel][frame] = (pcm[sample] - 128) / 128;
    }
    return data;
  }
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let frame = 0, offset = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++, offset += 2) data[channel][frame] = view.getInt16(offset, true) / 32768;
  }
  return data;
}
