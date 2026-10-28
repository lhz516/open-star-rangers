import { readAssetDescriptor, type AssetDescriptor } from '../asset-contract.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { ContentContractError, fail, readRecord, requireFields } from '../contract-validation.ts';

// The HUD text payload of the `cockpit-hud-map` group (P3-03 spec, S-08, 规范 payload and technical decision 14):
// canonical JSON (canonical-json.ts) of `{ entries }`, one byte string for each of the 64 EXE text regions that the HUD,
// map and information-window code draws directly (closure #47; docs/original/formats/executable.md, HUD, map and
// communications text from the EXE). Keys name the instrument and the purpose, never the text. A text is a byte string:
// every character code is one stored byte, 1–255, without the terminating NUL (text rule 8). Format strings are kept as
// bytes too; nothing here expands them. Which entries the slice reaches and when they are drawn is P3-13's.

/** The role of the HUD text `data` Asset; consumers choose this payload's reader by it. */
export const HUD_TEXT_ROLE = 'hud-text';

/** Payload schema version of the HUD text role; a change of the key set, a format or the shape increments it. */
export const HUD_TEXT_SCHEMA_VERSION = 1;

/** A conversion specification the schema lists; consumers apply only these, with C `printf` semantics. */
export type HudTextConversion = '%d' | '%.0f' | '%s' | '%%';

/**
 * How the code uses a text: `null` when it draws the bytes verbatim, so a `%` byte is drawn as its glyph; otherwise the
 * text is a format string passed to the formatter `0x74a3f`, and this is its conversion sequence in order (`%%` yields
 * one `%`), empty for a format string without conversions.
 */
export type HudTextFormat = readonly HudTextConversion[] | null;

const VERBATIM = null;
const format = (...conversions: HudTextConversion[]): readonly HudTextConversion[] => Object.freeze(conversions);

/**
 * The key set in schema order, with each key's format, following executable.md row by row. The comment gives the region's
 * EXE address. The key set and order, and every format, are fixed schema constants shared by the reader and the converter.
 */
export const HUD_TEXT_FORMATS = Object.freeze({
  // Target display, instrument type 7 (`0x42d80`).
  /** `0x171a34`: shown for 20 frames when the target's +0xCC is 1, set on a warping object; the display then drops it. */
  targetWarpNotice: VERBATIM,
  /** `0x171a44`: HI, while there is no target. */
  targetNone: VERBATIM,
  /** `0x171a50`: the distance from the player to the target, below the threshold `0x171a8f`. */
  targetDistance: format('%.0f'),
  /** `0x171a58`: otherwise, the distance times the factor `0x171a93`. */
  targetDistanceScaled: format('%.0f'),
  /** `0x171a60`: the `f32` at +0x08 of the block at target +0x08, when that block exists. */
  targetBlockValue: format('%.0f'),
  /** `0x171a68`: target +0x2C over +0x5C of its craft record, times the factor `0x171ab3`. */
  targetCraftPercent: format('%.0f', '%%'),
  /** `0x171a70`: the `f32` at +0x08 of that craft record, scaled twice when the once-scaled value exceeds `0x171abf`. */
  targetCraftValueScaledTwice: format('%.0f'),
  /** `0x171a78`: otherwise, that value scaled once. */
  targetCraftValueScaledOnce: format('%.0f'),
  /** `0x171a80`: in place of `targetBlockValue` while the map marker (kind `0x2000000`) is the target. */
  targetMarkerBlockValue: format(),
  /** `0x171a88`: in place of `targetCraftPercent` while the map marker is the target. */
  targetMarkerCraftPercent: format('%%'),
  /** `0x171a8c`: in place of the two craft values while the map marker is the target. */
  targetMarkerCraftValue: format(),

  // Bar gauges, instrument types 0–3: the label each passes to its bar helper.
  /** `0x1719bc`: instrument type 0 (`0x4117c`). */
  barGauge0Label: VERBATIM,
  /** `0x1719cc`: instrument type 1 (`0x41238`). */
  barGauge1Label: VERBATIM,
  /** `0x1719dc`: instrument type 2 (`0x4131c`). */
  barGauge2Label: VERBATIM,
  /** `0x1719f4`: instrument type 3 (`0x41484`). */
  barGauge3Label: VERBATIM,

  // Flight-view overlays (`0x45de0`), in view modes 0xC and 0xD.
  /** `0x171c30`: blinks for a few steps after the autopilot flag `0x174b24` changes. */
  overlayAutopilotChange: VERBATIM,
  /** `0x171c40`: blinks while the step counter `0x174b28` that the speed-assist toggle starts runs, autopilot off. */
  overlaySpeedAssistChange: VERBATIM,
  /** `0x171c60`: blinks while the byte at +0xF4 +0x24 of the player object is 4. */
  overlayPlayerState4: VERBATIM,
  /** `0x171c70`: the two integer readouts, one from the player's block and one relative to the target. */
  overlayValueReadout: format('%d'),
  /** `0x171c78`: the percentage readout. */
  overlayPercentReadout: format('%d', '%%'),
  /** `0x171c80`: the last two readouts with no target or a distance above 10,000. */
  overlayReadoutUnavailable: VERBATIM,
  /** `0x171c84`: the integer distance up to 10,000. */
  overlayTargetDistance: format('%d'),
  /** `0x170fc4`: the weapon name of an empty weapon slot. */
  overlayEmptyWeaponSlot: VERBATIM,
  /** `0x171860`: the name (+0x15C) of the map and Warp marker that the first left click in the main map creates. */
  mapMarkerName: VERBATIM,

  // Strategic map, instrument type 10 (`0x49f8c`).
  /** `0x171d18`: every map frame, at the zoom window's origin + (4, 4). */
  mapCornerLabel: VERBATIM,
  /** `0x171d10`: beside the marker and the cursor, the value computed through the Warp cost routine `0x30d2c`. */
  mapWarpCostReadout: format('%d', '%%'),
  /** `0x171d24`: the cursor readout when `0x4c3ec` returns −1. */
  mapCursorReadoutNone: format(),
  /** `0x171d2c`: the cursor readout otherwise. */
  mapCursorReadout: format('%.0f'),
  /** `0x171d44`: the per-unit labels while the map flag `0x18649c` is 1. */
  mapUnitLabel: format('%d'),

  // Information window (`0x4ba80`): the kind word of each listed kind (no argument).
  /** `0x171d50`: kind 0x1. */
  mapInfoKindWord0x1: format(),
  /** `0x171d74`: kind 0x2. */
  mapInfoKindWord0x2: format(),
  /** `0x171d94`: kind 0x4. */
  mapInfoKindWord0x4: format(),
  /** `0x171da0`: kind 0x8. */
  mapInfoKindWord0x8: format(),
  /** `0x171da8`: kind 0x10. */
  mapInfoKindWord0x10: format(),
  /** `0x171d88`: kind 0x20. */
  mapInfoKindWord0x20: format(),
  /** `0x171d7c`: kinds 0x40 and 0x800. */
  mapInfoKindWord0x40And0x800: format(),
  /** `0x171d5c`: kind 0x8000. */
  mapInfoKindWord0x8000: format(),
  /** `0x171d64`: kind 0x20000. */
  mapInfoKindWord0x20000: format(),
  /** `0x171d6c`: kind 0x40000. */
  mapInfoKindWord0x40000: format(),
  // Information window: the unit's name (+0x15C) and the three position components.
  /** `0x171db4`. */
  mapInfoUnitName: format('%s'),
  /** `0x171db8`. */
  mapInfoPosition1: format('%.0f'),
  /** `0x171dc0`. */
  mapInfoPosition2: format('%.0f'),
  /** `0x171dc8`. */
  mapInfoPosition3: format('%.0f'),
  // Information window: the count line of each counted kind.
  /** `0x171dd0`: kind 0x80. */
  mapInfoKindCount0x80: format('%d'),
  /** `0x171ddc`: kind 0x100. */
  mapInfoKindCount0x100: format('%d'),
  /** `0x171de8`: kind 0x200. */
  mapInfoKindCount0x200: format('%d'),
  /** `0x171df4`: kind 0x400. */
  mapInfoKindCount0x400: format('%d'),
  /** `0x171e00`: kind 0x80000. */
  mapInfoKindCount0x80000: format('%d'),
  /** `0x171e0c`: kind 0x2000. */
  mapInfoKindCount0x2000: format('%d'),
  /** `0x171e18`: kind 0x4000. */
  mapInfoKindCount0x4000: format('%d'),
  /** `0x171e24`: kind 0x10000. */
  mapInfoKindCount0x10000: format('%d'),
  /** `0x171e30`: kind 0x1000. */
  mapInfoKindCount0x1000: format('%d'),

  // Left display, instrument type 6 (`0x4ce30`).
  /** `0x171e60`: the energy page's first bar label. */
  leftEnergyBar1Label: VERBATIM,
  /** `0x171e64`: the energy page's second bar label. */
  leftEnergyBar2Label: VERBATIM,
  /** `0x171e68`: the energy page's third bar label. */
  leftEnergyBar3Label: VERBATIM,
  /** `0x171e6c`: the communications panel, HI, when the panel's argument is 0. */
  leftCommPanelTitle: VERBATIM,
  /** `0x170f98`: between the generated key and the object's name in each communications object-list entry. */
  leftCommListSeparator: VERBATIM,
  /** `0x171e44`: the Warp page title, through the HI parameter block. */
  leftWarpTitle: VERBATIM,
  /** `0x171e7c`: the Warp page's first bar label. */
  leftWarpBar1Label: VERBATIM,
  /** `0x171e84`: the Warp page's second bar label. */
  leftWarpBar2Label: VERBATIM,
  /** `0x171e8c`: the Warp page's third bar label. */
  leftWarpBar3Label: VERBATIM,

  // Indicators, instrument types 9 and 12.
  /** `0x171e98`: type 9, blinks while a missile aims at the player. */
  indicatorMissileAimed: VERBATIM,
  /** `0x171ea0`: type 9, blinks while an object of kinds `0x780` in state 3 or 4 aims at the player. */
  indicatorCraftAimed: VERBATIM,
  /** `0x171ea8`: type 12, while object +0xC8 is 0 or the Warp interval has passed since it. */
  indicatorWarpInterval: VERBATIM,
} satisfies Record<string, HudTextFormat>);

export type HudTextKey = keyof typeof HUD_TEXT_FORMATS;

/** The 64 keys in schema order, which is also the canonical field order of `entries`. */
export const HUD_TEXT_KEYS: readonly HudTextKey[] = Object.freeze(Object.keys(HUD_TEXT_FORMATS) as HudTextKey[]);

/**
 * Structural limits, shared by the reader and the converter. `textBytes` bounds a text without its NUL: twice the longest
 * region of 15 bytes with its NUL, rounded up to a power of two (P3-03 spec, 限值与预算). `payloadBytes` bounds the bytes
 * read before parsing: the encoding of 64 texts of `textBytes` bytes that each need a six-character escape, rounded up to
 * a power of two, so every payload within `textBytes` encodes within it.
 */
export const HUD_TEXT_LIMITS = Object.freeze({ payloadBytes: 16_384, textBytes: 32 });

/** Byte strings of 0 to `HUD_TEXT_LIMITS.textBytes` bytes, one for each key, in schema order. */
export type HudTextEntries = { readonly [Key in HudTextKey]: string };

export interface HudText {
  readonly entries: HudTextEntries;
}

// A conversion specification of C `printf`: `%%` whole, or flags, width, precision, length modifier and conversion character.
const CONVERSION_SPECIFICATION = /%(?:%|[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*)?)?(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspn])/y;

/**
 * Scans the byte string `text` by the conversion syntax of C `printf` and returns its conversion specifications in order,
 * each the exact text from its `%` through its conversion character (`%%` included); undefined when a `%` starts no
 * complete specification. It neither expands nor formats anything.
 */
export function scanFormatConversions(text: string): readonly string[] | undefined {
  const conversions: string[] = [];
  for (let index = text.indexOf('%'); index !== -1; index = text.indexOf('%', CONVERSION_SPECIFICATION.lastIndex)) {
    CONVERSION_SPECIFICATION.lastIndex = index;
    const match = CONVERSION_SPECIFICATION.exec(text);
    if (match === null) return undefined;
    conversions.push(match[0]);
  }
  return Object.freeze(conversions);
}

/** Whether `text` fits the format of `key`: verbatim text always does; a format string has exactly the listed conversions. */
export function matchesHudTextFormat(key: HudTextKey, text: string): boolean {
  const expected = HUD_TEXT_FORMATS[key];
  if (expected === VERBATIM) return true;
  const conversions = scanFormatConversions(text);
  return conversions !== undefined && conversions.length === expected.length
    && conversions.every((conversion, index) => conversion === expected[index]);
}

const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'HUD text payload', byteLimit: HUD_TEXT_LIMITS.payloadBytes, invalid: 'invalid-flight-data-payload',
});

function invalid(path: string, reason: string): never {
  return fail('invalid-flight-data-payload', path, reason);
}

function readFields(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const record = readRecord(value, path);
  requireFields(record, path, fields);
  return record;
}

function readText(key: HudTextKey, value: unknown, path: string): string {
  const { textBytes } = HUD_TEXT_LIMITS;
  if (typeof value !== 'string' || value.length > textBytes) invalid(path, `must be a string of at most ${textBytes} bytes`);
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 1 || code > 255) invalid(path, 'must hold only byte values 1 to 255');
  }
  if (!matchesHudTextFormat(key, value)) invalid(path, 'must hold exactly the conversions the schema lists for its key');
  return value;
}

/** Strictly reads already decoded HUD text content into a frozen copy isolated from its input. */
export function readHudText(value: unknown, path = 'hudText'): HudText {
  try {
    const record = readFields(value, path, ['entries']);
    const at = `${path}.entries`;
    const source = readFields(record.entries, at, HUD_TEXT_KEYS);
    const entries: Partial<Record<HudTextKey, string>> = {};
    for (const key of HUD_TEXT_KEYS) entries[key] = readText(key, source[key], `${at}.${key}`);
    return Object.freeze({ entries: Object.freeze(entries as HudTextEntries) });
  } catch (error) {
    if (error instanceof ContentContractError && error.code !== 'invalid-flight-data-payload') {
      throw new ContentContractError('invalid-flight-data-payload', error.path, error.reason);
    }
    throw error;
  }
}

/**
 * Reads `content` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated.
 */
export function encodeHudTextPayload(content: HudText, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readHudText(content), FORMAT, reserve);
}

/**
 * Decodes the payload bytes of the HUD text Asset `descriptor` describes: the byte length limit first, then a `data`
 * descriptor of the HUD text role and schema without dependencies, then canonical JSON that the strict reader accepts.
 */
export function decodeHudTextPayload(bytes: Uint8Array, descriptor: AssetDescriptor): HudText {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  if (asset.role !== HUD_TEXT_ROLE) invalid('descriptor.role', 'must be the HUD text role');
  if (asset.kind !== 'data') invalid('descriptor.kind', 'must be data');
  if (asset.payloadIdentity.schemaVersion !== HUD_TEXT_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be HUD text payload schema 1');
  }
  const content = decodeCanonicalJson(bytes, FORMAT, value => readHudText(value));
  if (asset.dependencies.length !== 0) {
    fail('flight-data-reference-mismatch', 'descriptor.dependencies', 'must be exactly the Asset references of the payload');
  }
  return content;
}
