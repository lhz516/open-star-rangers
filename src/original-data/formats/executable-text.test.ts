import { describe, expect, it } from 'vitest';
import { FLIGHT_MESSAGES_LIMITS, readFlightMessages, type FlightMessages } from '../../content/rule-data/flight-messages.ts';
import { MARKER, deepFrozen, syntheticFlightMessages, text } from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { executableRegion, type ExecutableRegionLocator } from '../source-mapping.ts';
import { leInternalFixup, syntheticLeExecutable } from '../synthetic.test-support.ts';
import { parseFlightMessages, readExecutableText, type ExecutableRegionRead, type FlightMessageRegions, type LocatedRegion } from './executable-text.ts';
import { openLeExecutable } from './le-executable.ts';

// P3-03 AC-06 (flight message part), AC-14 and AC-18: a code-generated LE file only. Each string is followed by filler
// bytes that are never zero, so a region one byte too long ends past its NUL.

const EXE = 'MAIN/SRANGERS.EXE' as DiscPath;
const OBJECT_BYTES = 2_048;
/** Object 1 offset whose 4 bytes a fixup patches. */
const FIXUP_AT = 1_500;
const HIDDEN = new RegExp(MARKER);

/** The content test support's messages, from 0 to the limit of 128 bytes, and one holding 0x01, 0x7F, 0x80 and 0xFF. */
const MESSAGES: FlightMessages = readFlightMessages({ ...syntheticFlightMessages(), speedAssistOn: '\x01\x7f\x80\xff' });
const KEYS = Object.keys(MESSAGES) as (keyof FlightMessages)[];

/** Object 1: non-zero filler, then strings at odd offsets, each with its NUL and three filler bytes. */
function layout(strings: readonly string[]): { readonly bytes: Uint8Array; readonly starts: readonly number[] } {
  const bytes = Uint8Array.from({ length: OBJECT_BYTES }, (_, index) => ((index * 7) % 255) + 1);
  let at = 101;
  const starts = strings.map(string => {
    const start = at;
    bytes.set(Array.from(string, character => character.charCodeAt(0)), start);
    bytes[start + string.length] = 0;
    at = start + string.length + 4;
    if (at % 2 === 0) at += 1;
    return start;
  });
  return { bytes, starts };
}

const locator = (offset: number, length: number, object = 1): ExecutableRegionLocator =>
  ({ discPath: EXE, entry: null, subresource: `le/${object}/0x${offset.toString(16)}/${length}` });
const pathOf = (part: number) => `sources.mappings[0].parts[${part}].alternatives[0]`;

/** A reader over the LE file of `object`, counting the regions it reads. */
async function reader(object: Uint8Array): Promise<ExecutableRegionRead & { readonly reads: string[] }> {
  const file = syntheticLeExecutable({ objects: [{ bytes: object }], fixups: { 1: leInternalFixup(FIXUP_AT) } });
  const executable = await openLeExecutable({ byteLength: file.length, read: async (offset, length) => file.subarray(offset, offset + length) }, 'executable');
  const reads: string[] = [];
  return Object.assign((region: ExecutableRegionLocator, path: string) => {
    reads.push(path);
    return executable.readRegion(executableRegion(region), path);
  }, { reads });
}

/** The messages' layout and the region of each message in content order, exactly its string and NUL. */
function messageRegions(messages: FlightMessages = MESSAGES) {
  const { bytes, starts } = layout(KEYS.map(key => messages[key]));
  const regions = Object.fromEntries(KEYS.map((key, part) =>
    [key, { locator: locator(starts[part], messages[key].length + 1), path: pathOf(part) }])) as Record<keyof FlightMessages, LocatedRegion>;
  return { bytes, starts, regions };
}

describe('EXE flight message reading', () => {
  it('reads each region as its string, every byte kept as stored', async () => {
    const { bytes, starts, regions } = messageRegions();
    expect(starts.every(start => start % 2 === 1)).toBe(true);
    const read = await reader(bytes);
    const parsed = await parseFlightMessages(regions, read);
    expect(parsed).toEqual(MESSAGES);
    expect(Object.keys(parsed)).toEqual(KEYS);
    expect(deepFrozen(parsed)).toBe(true);
    expect(readFlightMessages(parsed)).toEqual(parsed);
    expect(parsed.speedAssistOn).toBe('\x01\x7f\x80\xff');
    expect(parsed.beacon).toHaveLength(FLIGHT_MESSAGES_LIMITS.textBytes);
    expect(parsed.joystickSensitivity0).toBe('');
    expect(read.reads).toEqual(KEYS.map((_, part) => pathOf(part)));
  });

  it('follows the input bytes and the caller\'s pairing of regions with keys', async () => {
    const other = readFlightMessages({ ...MESSAGES, missionComplete: 'Q', beacon: text(3), joystickSensitivity2: '\xfe\xfd' });
    const { bytes, regions } = messageRegions(other);
    expect(await parseFlightMessages(regions, await reader(bytes))).toEqual(other);
    const swapped: FlightMessageRegions = { ...regions, speedAssistOn: regions.speedAssistOff, speedAssistOff: regions.speedAssistOn };
    expect(await parseFlightMessages(swapped, await reader(bytes))).toEqual({ ...other, speedAssistOn: other.speedAssistOff, speedAssistOff: other.speedAssistOn });
  });

  it('limits the text before reading its region', async () => {
    const limit = FLIGHT_MESSAGES_LIMITS.textBytes;
    const { bytes, starts } = layout([text(limit + 1)]);
    const read = await reader(bytes);
    expect(await sourceFailure(() => readExecutableText(read, { locator: locator(starts[0], limit + 2), path: pathOf(3) }, limit), HIDDEN))
      .toEqual({ code: 'limit-exceeded', location: pathOf(3), limit: { name: 'textBytes', limit, observed: limit + 1 } });
    expect(read.reads).toEqual([]);
    // Any limit applies the same way: the region holds at most the limit and the NUL.
    const nul = starts[0] + limit + 1;
    expect(await readExecutableText(read, { locator: locator(nul - 4, 5), path: pathOf(0) }, 4)).toBe(text(limit + 1).slice(-4));
    expect((await sourceFailure(() => readExecutableText(read, { locator: locator(nul - 5, 6), path: pathOf(0) }, 4), HIDDEN)).limit)
      .toEqual({ name: 'textBytes', limit: 4, observed: 5 });
    expect(read.reads).toEqual([pathOf(0)]);
  });

  it.each<[string, (start: number, length: number) => ExecutableRegionLocator]>([
    ['ends before the NUL', (start, length) => locator(start, length - 1)],
    ['ends past the NUL', (start, length) => locator(start, length + 1)],
    ['starts inside the string and ends past the NUL', (start, length) => locator(start + 2, length)],
  ])('rejects a region that %s', async (_name, region) => {
    const { bytes, starts, regions } = messageRegions();
    const bad = { ...regions, speedAssistOff: { ...regions.speedAssistOff, locator: region(starts[3], MESSAGES.speedAssistOff.length + 1) } };
    expect(await sourceFailure(async () => parseFlightMessages(bad, await reader(bytes)), HIDDEN))
      .toEqual({ code: 'invalid-payload', location: pathOf(3), limit: null });
  });

  it('rejects a region that holds a NUL before its end', async () => {
    const { bytes, starts } = layout(['ab', 'c']);
    // Strings at 101 and 107: the region runs from the first string through the filler to the second's NUL.
    const length = starts[1] + 2 - starts[0];
    expect(await sourceFailure(async () => readExecutableText(await reader(bytes), { locator: locator(starts[0], length), path: pathOf(1) }, 128), HIDDEN))
      .toEqual({ code: 'invalid-payload', location: pathOf(1), limit: null });
  });

  it.each<[string, ExecutableRegionLocator]>([
    ['past the end of its object', locator(OBJECT_BYTES - 3, 4)],
    ['in an object the file does not have', locator(0, 4, 2)],
    ['patched by a fixup', locator(FIXUP_AT + 3, 2)],
  ])('rejects a region %s through the LE reader', async (_name, region) => {
    const { bytes, regions } = messageRegions();
    bytes[OBJECT_BYTES - 1] = 0;
    bytes[FIXUP_AT + 4] = 0;
    const bad = { ...regions, beacon: { ...regions.beacon, locator: region } };
    expect(await sourceFailure(async () => parseFlightMessages(bad, await reader(bytes)), HIDDEN))
      .toEqual({ code: 'invalid-payload', location: pathOf(1), limit: null });
  });

  it('reports the first failing message in content order', async () => {
    const { bytes, starts, regions } = messageRegions();
    const bad = {
      ...regions,
      joystickSensitivity0: { ...regions.joystickSensitivity0, locator: locator(starts[6], 2) },
      beacon: { ...regions.beacon, locator: locator(starts[1], MESSAGES.beacon.length) },
    };
    expect((await sourceFailure(async () => parseFlightMessages(bad, await reader(bytes)), HIDDEN)).location).toBe(pathOf(1));
  });
});
