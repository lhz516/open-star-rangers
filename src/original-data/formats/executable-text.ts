import { FLIGHT_MESSAGES_LIMITS, type FlightMessages } from '../../content/rule-data/flight-messages.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import { SourceError } from '../source-error.ts';
import { executableRegion, type ExecutableRegionLocator } from '../source-mapping.ts';

// Reading of NUL-terminated EXE strings as byte strings (P3-03 spec, S-08, text rule 8), and of the seven flight messages
// of docs/original/formats/executable.md (flight message strings) into `data/flight-messages` content. A region covers
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
