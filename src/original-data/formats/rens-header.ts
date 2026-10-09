import type { SceneColour, SceneSettings, ScreenFlash } from '../../content/flight/flight-data-content.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { PayloadBlock } from './payload-block.ts';

// Typed reading of the RENS 10751 header +0x00–+0x57 into scene settings (P3-03 spec, S-09; layout and evidence in
// docs/original/formats/executable.md, the RENS header). The record table from +0x58 is the effect step's
// (effect-step.ts) and is not read here. Values keep their stored values; the unread bytes +0x19–+0x1B must be zero.

/** RENS layout: the header bytes this parser reads, the full header length and the length of one record. */
export const RENS_HEADER_LAYOUT = Object.freeze({ readBytes: 0x58, headerBytes: 0x60, recordBytes: 28 });

/**
 * Structural limits of the RENS entry (P3-03 spec, 限值与预算). Twice the observed 376 bytes rounds up to 1,024, below
 * the 1,888 bytes of a header and the `EFFECT_LIMITS.effectRecords` records the effect step already accepts, so the
 * limit is that existing bound rounded up to a power of two.
 */
export const RENS_HEADER_LIMITS = Object.freeze({ entryBytes: 2_048 });

const NEGATIVE_ZERO_BITS = 0x8000_0000;

/** A finite f32; canonical JSON cannot carry −0, so a stored −0.0 is unsupported rather than silently turned into 0. */
function f32(block: PayloadBlock, offset: number, path: string): number {
  if (block.u32(offset, path) === NEGATIVE_ZERO_BITS) block.unsupported(path, 'the value is negative zero');
  return block.f32(offset, path);
}

const colour = (block: PayloadBlock, offset: number, path: string): SceneColour => Object.freeze([
  f32(block, offset, `${path}[0]`), f32(block, offset + 4, `${path}[1]`), f32(block, offset + 8, `${path}[2]`),
] as const);

/** Screen flash record `index`, of the three at +0x28, +0x38 and +0x48. */
function screenFlash(block: PayloadBlock, index: number): ScreenFlash {
  const offset = 0x28 + index * 16;
  const path = `/screenFlashes[${index}]`;
  return Object.freeze({
    randomMask: block.u32(offset, `${path}/randomMask`),
    duration: f32(block, offset + 4, `${path}/duration`),
    drawIntervalTicks: block.u32(offset + 8, `${path}/drawIntervalTicks`),
    level: block.i32(offset + 12, `${path}/level`),
  });
}

/** Parses the header of the RENS entry `read` of `archive` into scene settings. */
export function parseRensHeader(archive: DiscPath, read: ArchiveEntryRead): SceneSettings {
  const block = new PayloadBlock(archive, read, RENS_HEADER_LIMITS.entryBytes);
  block.require(0, RENS_HEADER_LAYOUT.readBytes, '/header');
  // The game loads only the low byte of the 32-bit slot at +0x18; no code reads +0x19 to +0x1B (field rule 6).
  const slot = block.u32(0x18, '/deviceByte');
  if (slot > 0xff) block.unsupported('/reserved', 'an unread byte is not zero');
  return Object.freeze({
    lightType3Colour: colour(block, 0x00, '/lightType3Colour'),
    lightType0Colour: colour(block, 0x0c, '/lightType0Colour'),
    deviceByte: slot,
    deviceValues: Object.freeze({
      base: f32(block, 0x1c, '/deviceValues/base'),
      kinds1c7c: f32(block, 0x20, '/deviceValues/kinds1c7c'),
      kindsF8000: f32(block, 0x24, '/deviceValues/kindsF8000'),
    }),
    screenFlashes: Object.freeze([screenFlash(block, 0), screenFlash(block, 1), screenFlash(block, 2)] as const),
  });
}
