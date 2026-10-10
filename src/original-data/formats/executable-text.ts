import {
  HUD_TEXT_KEYS, HUD_TEXT_LIMITS, matchesHudTextFormat, type HudText, type HudTextEntries, type HudTextKey,
} from '../../content/hud/hud-text-payload.ts';
import { FLIGHT_MESSAGES_LIMITS, type FlightMessages } from '../../content/rule-data/flight-messages.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import { SourceError } from '../source-error.ts';
import { executableRegion, type ExecutableRegionLocator } from '../source-mapping.ts';

// Reading of NUL-terminated EXE strings as byte strings (P3-03 spec, S-08, text rule 8), of the seven flight messages
// of docs/original/formats/executable.md (flight message strings) into `data/flight-messages` content, and of the 64
// HUD texts (executable.md, HUD, map and communications text from the EXE) into `data/hud/text` content. A region covers
// exactly its string and the NUL: its last byte is the NUL and no other byte is. The other bytes, 1–255, are kept as stored.

/**
 * Reads a region's bytes with the LE reader's checks, locating failures at `path`; in a conversion step, the step's
 * `stepRegionReader`.
 */
export type ExecutableRegionRead = (locator: ExecutableRegionLocator, path: string) => Promise<Uint8Array>;

/** A region and the diagnostic location of failures in it, such as its source mapping path. */
export interface LocatedRegion {
  readonly locator: ExecutableRegionLocator;
  readonly path: string;
}

/** The region of each flight message, keyed by its sender and condition; the caller pairs them. */
export type FlightMessageRegions = { readonly [K in keyof FlightMessages]: LocatedRegion };

/** The region of each HUD text, keyed as the payload's entries; the caller pairs them. */
export type HudTextRegions = { readonly [K in HudTextKey]: LocatedRegion };

/**
 * The string of a region that covers exactly a string of at most `textBytes` bytes and its NUL. The string's length
 * follows from the region's, so it is limited before the region is read.
 */
export async function readExecutableText(read: ExecutableRegionRead, { locator, path }: LocatedRegion, textBytes: number): Promise<ByteString> {
  const observed = executableRegion(locator).length - 1;
  if (observed > textBytes) throw new SourceError('limit-exceeded', path, 'the text exceeds its payload limit', { name: 'textBytes', limit: textBytes, observed });
  const bytes = await read(locator, path);
  // The first NUL must be the region's last byte: no NUL at all, or an earlier one, is not exactly a string and its NUL.
  const end = bytes.indexOf(0);
  if (end === -1 || end !== bytes.length - 1) throw new SourceError('invalid-payload', path, 'the region is not exactly a string and its NUL');
  return String.fromCharCode(...bytes.subarray(0, end));
}

/** Reads the seven flight messages, one region at a time in content order so that the first failure is deterministic. */
export async function parseFlightMessages(regions: FlightMessageRegions, read: ExecutableRegionRead): Promise<FlightMessages> {
  const text = (key: keyof FlightMessages) => readExecutableText(read, regions[key], FLIGHT_MESSAGES_LIMITS.textBytes);
  return Object.freeze({
    missionComplete: await text('missionComplete'),
    beacon: await text('beacon'),
    speedAssistOn: await text('speedAssistOn'),
    speedAssistOff: await text('speedAssistOff'),
    joystickSensitivity1: await text('joystickSensitivity1'),
    joystickSensitivity2: await text('joystickSensitivity2'),
    joystickSensitivity0: await text('joystickSensitivity0'),
  });
}

/**
 * Reads the 64 HUD texts, one region at a time in schema key order so that the first failure is deterministic. Each text
 * is limited to `HUD_TEXT_LIMITS.textBytes` by its region's length before the region is read. A text that does not fit
 * its key's schema format (`matchesHudTextFormat`: a format string must hold exactly the listed conversions, while any
 * text fits a verbatim key) is `unsupported-payload` at its region's location. No text is ever expanded or echoed.
 */
export async function parseHudText(regions: HudTextRegions, read: ExecutableRegionRead): Promise<HudText> {
  const entries: Partial<Record<HudTextKey, string>> = {};
  for (const key of HUD_TEXT_KEYS) {
    const region = regions[key];
    const text = await readExecutableText(read, region, HUD_TEXT_LIMITS.textBytes);
    if (!matchesHudTextFormat(key, text)) throw new SourceError('unsupported-payload', region.path, 'the text does not hold exactly the conversions the schema lists for its key');
    entries[key] = text;
  }
  return Object.freeze({ entries: Object.freeze(entries as HudTextEntries) });
}
