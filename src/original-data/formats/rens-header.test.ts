import { describe, expect, it } from 'vitest';
import { readAssetDescriptor } from '../../content/asset-contract.ts';
import { EFFECT_LIMITS } from '../../content/effects/effect-payload.ts';
import type { SceneSettings } from '../../content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import { syntheticFlightAsset } from '../../content/flight/flight-data.test-support.ts';
import { readSceneSettings } from '../../content/flight/flight-data-readers.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';
import { parseRensHeader, RENS_HEADER_LAYOUT, RENS_HEADER_LIMITS } from './rens-header.ts';
import { rensHeaderBytes, syntheticRens, syntheticRensSettings } from './rens-header.test-support.ts';

const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
const RENS_ID = 10_751;
const at = `archive:/MAIN/SR.NOB#${RENS_ID}`;

const parse = (block: SyntheticBlock) => parseRensHeader(SR_NOB, entryRead(RENS_ID, 'RENS', block));

/** Different synthetic values in every field, to show that the result comes from the input. */
const OTHER: SceneSettings = {
  lightType3Colour: [-2.25, Math.fround(0.7), 2 ** -140],
  lightType0Colour: [8, Math.fround(-1e-3), Math.fround(123_456.7)],
  deviceByte: 0x5a,
  deviceValues: { base: -0.5, kinds1c7c: Math.fround(9.1e9), kindsF8000: 3 },
  screenFlashes: [
    { randomMask: 0x8000_0000, duration: Math.fround(0.1), drawIntervalTicks: 0x8000_0001, level: -7 },
    { randomMask: 0x1234, duration: 512, drawIntervalTicks: 99, level: 1 },
    { randomMask: 0x7fff_ffff, duration: Math.fround(-3.3), drawIntervalTicks: 1, level: -0x7fff_ffff },
  ],
};

/** Each f32 field: its header offset and its diagnostic path. */
const FLOATS: readonly (readonly [number, string])[] = [
  [0x00, '/lightType3Colour[0]'], [0x04, '/lightType3Colour[1]'], [0x08, '/lightType3Colour[2]'],
  [0x0c, '/lightType0Colour[0]'], [0x10, '/lightType0Colour[1]'], [0x14, '/lightType0Colour[2]'],
  [0x1c, '/deviceValues/base'], [0x20, '/deviceValues/kinds1c7c'], [0x24, '/deviceValues/kindsF8000'],
  [0x2c, '/screenFlashes[0]/duration'], [0x3c, '/screenFlashes[1]/duration'], [0x4c, '/screenFlashes[2]/duration'],
];
/** Each integer field: its header offset and its diagnostic path. */
const INTEGERS: readonly (readonly [number, string])[] = [0, 1, 2].flatMap(index => [
  [0x28 + index * 16, `/screenFlashes[${index}]/randomMask`],
  [0x30 + index * 16, `/screenFlashes[${index}]/drawIntervalTicks`],
  [0x34 + index * 16, `/screenFlashes[${index}]/level`],
] as const);

/** The default block with its header word at `offset` replaced by `bits`. */
function withWord(offset: number, bits: number): SyntheticBlock {
  const block = syntheticRens();
  new DataView(block.bytes.buffer).setUint32(offset, bits >>> 0, true);
  return block;
}

function blockOfLength(length: number): SyntheticBlock {
  const bytes = Uint8Array.from({ length }, (_, index) => (index * 7 + 3) & 0xff);
  bytes.set(rensHeaderBytes(syntheticRensSettings()).subarray(0, length));
  return { bytes, relocations: length >= 0x5c ? [0x58] : [] };
}

/** Values the diagnostics must never contain: the synthetic byte written to an unread position. */
const HIDDEN = /\b(?:171|ab)\b/i;
const failure = (action: () => unknown) => sourceFailure(action, HIDDEN);

describe('RENS header parsing', () => {
  it('converts every header field by its stored type into frozen scene settings', () => {
    const parsed = parse(syntheticRens());
    expect(parsed).toEqual(syntheticRensSettings());
    expect(Object.is(parsed.lightType3Colour[1], 2 ** -149)).toBe(true);
    expect(parsed.screenFlashes[0]).toEqual({ randomMask: 0xffff_ffff, duration: 0.75, drawIntervalTicks: 17, level: -0x8000_0000 });
    expect(parsed.deviceByte).toBe(0xc7);
    expect(deepFrozen(parsed)).toBe(true);
  });

  it('takes every value from the input', () => {
    expect(parse(syntheticRens(OTHER))).toEqual(OTHER);
  });

  it('produces content that the scene settings reader and the canonical payload accept unchanged', () => {
    const parsed = parse(syntheticRens(OTHER));
    expect(readSceneSettings(parsed)).toEqual(parsed);
    const { bytes, descriptor } = syntheticFlightAsset('scene-settings', parsed);
    expect(decodeFlightDataPayload(bytes, readAssetDescriptor(descriptor, 'descriptor'))).toEqual({ role: 'scene-settings', content: parsed });
  });

  it('reads only +0x00 to +0x57, whatever the record table holds', () => {
    const expected = syntheticRensSettings();
    expect(parse(syntheticRens(expected, 0))).toEqual(expected);
    expect(parse(syntheticRens(expected, 9))).toEqual(expected);
    expect(parse(blockOfLength(RENS_HEADER_LAYOUT.readBytes))).toEqual(expected);
    const unlisted = syntheticRens(expected);
    unlisted.relocations = [];
    new DataView(unlisted.bytes.buffer).setUint32(0x5c, 0xffff_ffff, true);
    expect(parse(unlisted)).toEqual(expected);
  });

  it('keeps a zero device byte and zero values as stored', () => {
    const zeros: SceneSettings = {
      ...OTHER, deviceByte: 0, deviceValues: { base: 0, kinds1c7c: 0, kindsF8000: 0 },
      screenFlashes: [OTHER.screenFlashes[0], OTHER.screenFlashes[1], { randomMask: 0, duration: 0, drawIntervalTicks: 0, level: 0 }],
    };
    expect(parse(syntheticRens(zeros))).toEqual(zeros);
  });

  it.each(FLOATS)('rejects a non-finite f32 at offset %i (%s) as invalid-payload', async (offset, path) => {
    for (const bits of [0x7fc0_0000, 0x7f80_0000, 0xff80_0000, 0xffc0_0001]) {
      expect(await failure(() => parse(withWord(offset, bits)))).toEqual({ code: 'invalid-payload', location: `${at}${path}`, limit: null });
    }
  });

  it.each(FLOATS)('rejects a negative zero f32 at offset %i (%s) as unsupported-payload', async (offset, path) => {
    expect(await failure(() => parse(withWord(offset, 0x8000_0000)))).toEqual({ code: 'unsupported-payload', location: `${at}${path}`, limit: null });
  });

  it.each([0x19, 0x1a, 0x1b])('rejects a non-zero unread byte at offset %i as unsupported-payload', async (offset) => {
    const block = syntheticRens();
    block.bytes[offset] = 0xab;
    expect(await failure(() => parse(block))).toEqual({ code: 'unsupported-payload', location: `${at}/reserved`, limit: null });
  });

  it.each([...FLOATS, ...INTEGERS, [0x18, '/deviceByte'] as const])('rejects a relocation over the field at offset %i (%s)', async (offset, path) => {
    for (const position of [offset - 3, offset, offset + 3].filter(value => value >= 0)) {
      const block = syntheticRens();
      block.relocations.push(position);
      const { code, location } = await failure(() => parse(block));
      expect(code).toBe('invalid-payload');
      if (position === offset) expect(location).toBe(`${at}${path}`);
    }
  });

  it('rejects a block shorter than the header part it reads', async () => {
    expect(await failure(() => parse(blockOfLength(RENS_HEADER_LAYOUT.readBytes - 1))))
      .toEqual({ code: 'invalid-payload', location: `${at}/header`, limit: null });
  });

  it('accepts an entry at the byte limit and rejects one byte more before reading it', async () => {
    const { entryBytes } = RENS_HEADER_LIMITS;
    expect(parse(blockOfLength(entryBytes))).toEqual(syntheticRensSettings());
    expect(await failure(() => parse(blockOfLength(entryBytes + 1))))
      .toEqual({ code: 'limit-exceeded', location: at, limit: { name: 'payloadEntryBytes', limit: entryBytes, observed: entryBytes + 1 } });
  });

  it('keeps the entry limit a power of two that holds every RENS entry the effect step accepts', () => {
    const { entryBytes } = RENS_HEADER_LIMITS;
    expect(Number.isInteger(Math.log2(entryBytes))).toBe(true);
    expect(entryBytes).toBeGreaterThanOrEqual(RENS_HEADER_LAYOUT.headerBytes + EFFECT_LIMITS.effectRecords * RENS_HEADER_LAYOUT.recordBytes);
    expect(entryBytes / 2).toBeLessThan(RENS_HEADER_LAYOUT.headerBytes + EFFECT_LIMITS.effectRecords * RENS_HEADER_LAYOUT.recordBytes);
  });
});
