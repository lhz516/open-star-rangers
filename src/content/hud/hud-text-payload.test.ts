import { describe, expect, it } from 'vitest';
import { asciiBytes as ascii, asciiText as text } from '../graphics/graphics-format.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { deepFrozen } from '../logic/logic-content.test-support.ts';
import { payloadTransferList } from '../ownership.ts';
import { syntheticGroup } from '../synthetic-content.test-support.ts';
import {
  HUD_TEXT_FORMATS, HUD_TEXT_KEYS, HUD_TEXT_LIMITS, HUD_TEXT_ROLE, HUD_TEXT_SCHEMA_VERSION, decodeHudTextPayload,
  encodeHudTextPayload, matchesHudTextFormat, readHudText, scanFormatConversions, type HudText, type HudTextKey,
} from './hud-text-payload.ts';
import { syntheticHudText, syntheticHudTextEntry } from './hud-text.test-support.ts';

// Code-generated synthetic texts; they never hold original text. MARKER proves texts never reach diagnostics.
const MARKER = 'PRIVATE-hud-9f3a';
const CODE = 'invalid-flight-data-payload';
const { textBytes, payloadBytes } = HUD_TEXT_LIMITS;

type Descriptor = Parameters<typeof decodeHudTextPayload>[1];
type MutableDescriptor = { id: string; role: string; kind: string; dependencies: { id: string; kind: string }[]; payloadIdentity: { schemaVersion: number } };

const decode = (bytes: Uint8Array, descriptor: unknown) => decodeHudTextPayload(bytes, descriptor as Descriptor);
const formatted = (key: HudTextKey) => HUD_TEXT_FORMATS[key] !== null;

/** Synthetic content whose first verbatim key holds MARKER and two bytes that need escapes. */
function content(overrides: Partial<Record<HudTextKey, string>> = {}) {
  const value = syntheticHudText();
  Object.assign(value.entries, { targetWarpNotice: `${MARKER} \u00e9\u00ff` }, overrides);
  return value;
}

/** The synthetic text of `key` padded with `fill` to exactly `length` bytes. */
const padded = (key: HudTextKey, length: number, fill = '\u00ff') => {
  const entry = syntheticHudTextEntry(key, '');
  return entry + fill.repeat(length - entry.length);
};

/** The canonical bytes and a matching mutable descriptor for synthetic HUD text. */
function syntheticAsset(value: unknown = content()) {
  const bytes = encodeHudTextPayload(value as HudText);
  const [descriptor] = syntheticGroup('cockpit-hud-map', [{ id: 'data/hud/text', role: 'hud-text', bytes }]).manifest.assets;
  return { bytes, descriptor };
}

function edited(edit: (json: string) => string) {
  const { bytes, descriptor } = syntheticAsset();
  const changed = edit(text(bytes));
  expect(changed).not.toBe(text(bytes));
  return { bytes: ascii(changed), descriptor };
}

describe('HUD text schema', () => {
  // executable.md, HUD, map and communications text from the EXE: per instrument, the regions and the format strings
  // among them.
  it.each([
    ['target display', /^target/, 11, 9],
    ['bar gauges', /^barGauge/, 4, 0],
    ['flight-view overlays', /^overlay/, 8, 3],
    ['map marker name', /^mapMarkerName$/, 1, 0],
    ['strategic map', /^map(?!Info|MarkerName)/, 5, 4],
    ['information window', /^mapInfo/, 23, 23],
    ['left display', /^left/, 9, 0],
    ['indicators', /^indicator/, 3, 0],
  ])('has the regions of the %s', (_, prefix, regions, formats) => {
    const keys = HUD_TEXT_KEYS.filter(key => prefix.test(key));
    expect(keys).toHaveLength(regions);
    expect(keys.filter(formatted)).toHaveLength(formats);
  });

  it('fixes every key and format in schema order', () => {
    const [d, f, s, p] = ['%d', '%.0f', '%s', '%%'];
    const kindWords = ['0x1', '0x2', '0x4', '0x8', '0x10', '0x20', '0x40And0x800', '0x8000', '0x20000', '0x40000'];
    const kindCounts = ['0x80', '0x100', '0x200', '0x400', '0x80000', '0x2000', '0x4000', '0x10000', '0x1000'];
    expect(Object.entries(HUD_TEXT_FORMATS)).toEqual([
      ['targetWarpNotice', null], ['targetNone', null], ['targetDistance', [f]], ['targetDistanceScaled', [f]],
      ['targetBlockValue', [f]], ['targetCraftPercent', [f, p]], ['targetCraftValueScaledTwice', [f]],
      ['targetCraftValueScaledOnce', [f]], ['targetMarkerBlockValue', []], ['targetMarkerCraftPercent', [p]],
      ['targetMarkerCraftValue', []],
      ['barGauge0Label', null], ['barGauge1Label', null], ['barGauge2Label', null], ['barGauge3Label', null],
      ['overlayAutopilotChange', null], ['overlaySpeedAssistChange', null], ['overlayPlayerState4', null],
      ['overlayValueReadout', [d]], ['overlayPercentReadout', [d, p]], ['overlayReadoutUnavailable', null],
      ['overlayTargetDistance', [d]], ['overlayEmptyWeaponSlot', null], ['mapMarkerName', null],
      ['mapCornerLabel', null], ['mapWarpCostReadout', [d, p]], ['mapCursorReadoutNone', []], ['mapCursorReadout', [f]],
      ['mapUnitLabel', [d]],
      ...kindWords.map(kind => [`mapInfoKindWord${kind}`, []]),
      ['mapInfoUnitName', [s]], ['mapInfoPosition1', [f]], ['mapInfoPosition2', [f]], ['mapInfoPosition3', [f]],
      ...kindCounts.map(kind => [`mapInfoKindCount${kind}`, [d]]),
      ['leftEnergyBar1Label', null], ['leftEnergyBar2Label', null], ['leftEnergyBar3Label', null],
      ['leftCommPanelTitle', null], ['leftCommListSeparator', null], ['leftWarpTitle', null], ['leftWarpBar1Label', null],
      ['leftWarpBar2Label', null], ['leftWarpBar3Label', null],
      ['indicatorMissileAimed', null], ['indicatorCraftAimed', null], ['indicatorWarpInterval', null],
    ]);
  });

  it('fixes 64 neutral keys in order, 39 of them format strings with the documented conversions', () => {
    expect(HUD_TEXT_KEYS).toHaveLength(64);
    expect(HUD_TEXT_KEYS).toEqual(Object.keys(HUD_TEXT_FORMATS));
    expect(new Set(HUD_TEXT_KEYS).size).toBe(64);
    for (const key of HUD_TEXT_KEYS) expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    const formats = Object.values(HUD_TEXT_FORMATS).filter(format => format !== null);
    expect(formats).toHaveLength(39);
    expect(formats.filter(format => format.some(conversion => conversion !== '%%'))).toHaveLength(25);
    expect(formats.filter(format => format.every(conversion => conversion === '%%'))).toHaveLength(14);
    expect(formats.filter(format => format.includes('%%'))).toHaveLength(4);
    expect(new Set(formats.flat())).toEqual(new Set(['%d', '%.0f', '%s', '%%']));
    expect([HUD_TEXT_ROLE, HUD_TEXT_SCHEMA_VERSION]).toEqual(['hud-text', 1]);
  });

  it('freezes the schema constants', () => {
    expect(deepFrozen(HUD_TEXT_FORMATS)).toBe(true);
    expect(Object.isFrozen(HUD_TEXT_KEYS)).toBe(true);
    expect(Object.isFrozen(HUD_TEXT_LIMITS)).toBe(true);
  });

  it('derives the payload byte limit from 64 texts of the text byte limit', () => {
    // Every byte of the longest texts needs a six-character \u escape; the keys, quotes, colons and commas come on top.
    const longest = '{"entries":{}}'.length + HUD_TEXT_KEYS.length - 1
      + HUD_TEXT_KEYS.reduce((sum, key) => sum + `"${key}":""`.length + 6 * textBytes, 0);
    expect(textBytes).toBe(32);
    expect(payloadBytes & (payloadBytes - 1)).toBe(0);
    expect(longest).toBeLessThanOrEqual(payloadBytes);
    expect(longest).toBeGreaterThan(payloadBytes / 2);
  });
});

describe('format conversion scan', () => {
  it.each([
    ['', []],
    ['plain \u00e9 text', []],
    ['%d', ['%d']],
    [`${MARKER} %.0f`, ['%.0f']],
    ['a%.0f b%%', ['%.0f', '%%']],
    ['%%%d%s', ['%%', '%d', '%s']],
    ['%5d|%-08.3lf|%*d|%.*f|%hhd|%15s|%#x|% i|%+.e|%lld|%c|%p|%n', ['%5d', '%-08.3lf', '%*d', '%.*f', '%hhd', '%15s', '%#x', '% i', '%+.e', '%lld', '%c', '%p', '%n']],
  ])('scans %j', (input, conversions) => {
    const scanned = scanFormatConversions(input);
    expect(scanned).toEqual(conversions);
    expect(Object.isFrozen(scanned)).toBe(true);
  });

  it.each([['%'], ['a %'], ['%%%'], ['%q'], ['% '], ['%.'], ['%5'], ['%l'], ['%d%'], ['%5%'], ['%\u00e9']])('finds no complete specification in %j', input => {
    expect(scanFormatConversions(input)).toBeUndefined();
  });

  it('checks a text against its key: verbatim text always fits, a format string needs exactly its conversions', () => {
    for (const verbatim of ['', '%', '%d', '%q', '100%%']) expect(matchesHudTextFormat('leftWarpBar3Label', verbatim)).toBe(true);
    // A format string without conversions.
    expect(matchesHudTextFormat('mapInfoKindWord0x1', 'word')).toBe(true);
    for (const stray of ['%', 'a%d', '%%', 'x %s']) expect(matchesHudTextFormat('mapInfoKindWord0x1', stray)).toBe(false);
    // `%%` alone.
    expect(matchesHudTextFormat('targetMarkerCraftPercent', '-- %%')).toBe(true);
    for (const other of ['--', '-- %', '%%%%']) expect(matchesHudTextFormat('targetMarkerCraftPercent', other)).toBe(false);
    // Two conversions, in order.
    expect(matchesHudTextFormat('targetCraftPercent', 'x%.0f y%%')).toBe(true);
    for (const other of ['%% %.0f', '%.0f', '%d%%', '%.1f%%', '%f%%', '%.0f%%%d', '%.0f%% %']) {
      expect(matchesHudTextFormat('targetCraftPercent', other)).toBe(false);
    }
  });
});

describe('HUD text reader', () => {
  it('keeps every text as a deeply frozen copy isolated from its input', () => {
    const input = content({ barGauge0Label: '\u0001\u007f\u0080\u00ff' });
    const read = readHudText(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
    input.entries.barGauge0Label = 'changed';
    expect(read.entries.barGauge0Label).toBe('\u0001\u007f\u0080\u00ff');
  });

  it('builds the entries in schema order whatever the input order', () => {
    const input = content();
    const reversed = { entries: Object.fromEntries(Object.entries(input.entries).reverse()) };
    expect(Object.keys(readHudText(reversed).entries)).toEqual(HUD_TEXT_KEYS);
    expect(encodeHudTextPayload(reversed as HudText)).toEqual(encodeHudTextPayload(input));
  });

  it('accepts empty verbatim texts and exactly the text byte limit, and rejects one byte more', () => {
    expect(readHudText(content({ barGauge1Label: '' })).entries.barGauge1Label).toBe('');
    for (const key of ['overlayEmptyWeaponSlot', 'targetCraftPercent', 'mapInfoKindWord0x2'] as const) {
      expect(readHudText(content({ [key]: padded(key, textBytes) })).entries[key]).toHaveLength(textBytes);
      expectContractError(() => readHudText(content({ [key]: padded(key, textBytes + 1, 'x') })), CODE, `hudText.entries.${key}`);
    }
  });

  it('accepts a percent byte in verbatim text and checks the conversions of format strings', () => {
    expect(readHudText(content({ leftWarpBar3Label: `${MARKER} %` })).entries.leftWarpBar3Label).toBe(`${MARKER} %`);
    expect(readHudText(content({ targetMarkerCraftPercent: `${MARKER} %%` })).entries.targetMarkerCraftPercent).toBe(`${MARKER} %%`);
    for (const [key, value] of [
      ['mapInfoKindWord0x1', `${MARKER} %`],
      ['mapInfoKindWord0x1', `${MARKER} %%`],
      ['mapCursorReadoutNone', `${MARKER}%d`],
      ['targetCraftPercent', `${MARKER} %%%.0f`],
      ['overlayPercentReadout', `${MARKER} %d`],
      ['mapInfoUnitName', `${MARKER} %15s`],
      ['mapInfoKindCount0x80', `${MARKER} %d %d`],
      ['targetDistance', MARKER],
    ] as const) {
      expectContractError(() => readHudText(content({ [key]: value })), CODE, `hudText.entries.${key}`, [MARKER]);
    }
  });

  it.each([
    ['a missing key', () => { const value = content(); delete (value.entries as Partial<typeof value.entries>).mapUnitLabel; return value; }, 'hudText.entries.mapUnitLabel'],
    ['an extra key', () => ({ entries: { ...content().entries, [MARKER]: 'a' } }), 'hudText.entries'],
    ['entries that are no record', () => ({ entries: HUD_TEXT_KEYS.map(key => syntheticHudTextEntry(key)) }), 'hudText.entries'],
    ['null entries', () => ({ entries: null }), 'hudText.entries'],
    ['missing entries', () => ({}), 'hudText.entries'],
    ['an unknown field', () => ({ ...content(), labels: [] }), 'hudText'],
    ['a text that is no string', () => content({ targetNone: [97] as unknown as string }), 'hudText.entries.targetNone'],
    ['a null text', () => content({ targetNone: null as unknown as string }), 'hudText.entries.targetNone'],
    ['a NUL byte', () => content({ targetNone: 'a\u0000b' }), 'hudText.entries.targetNone'],
    ['a code unit above 255', () => content({ targetNone: 'a\u0100' }), 'hudText.entries.targetNone'],
    ['no record', () => [content()], 'hudText'],
  ])('rejects %s', (_, input, path) => {
    expectContractError(() => readHudText(input()), CODE, path, [MARKER]);
  });
});

describe('HUD text payload', () => {
  it('round-trips byte for byte as printable ASCII with escaped bytes, keys in schema order', () => {
    const value = content({ barGauge2Label: `"\\\n\u0001\u007f` });
    const { bytes, descriptor } = syntheticAsset(value);
    const json = text(bytes);
    expect(json.startsWith(`{"entries":{"targetWarpNotice":"${MARKER} \\u00e9\\u00ff","targetNone":"`)).toBe(true);
    expect(json).toContain('"barGauge2Label":"\\"\\\\\\n\\u0001\\u007f"');
    expect(json.endsWith('"}}')).toBe(true);
    const decoded = decode(bytes, descriptor);
    expect(decoded).toEqual(value);
    expect(Object.keys(decoded.entries)).toEqual(HUD_TEXT_KEYS);
    expect(encodeHudTextPayload(decoded)).toEqual(bytes);
    expect(bytes.buffer.byteLength).toBe(bytes.length);
  });

  it('encodes the longest texts within the payload byte limit, reserving their length first', () => {
    const longest = { entries: Object.fromEntries(HUD_TEXT_KEYS.map(key => [key, padded(key, textBytes)])) } as HudText;
    const reserved: number[] = [];
    const { bytes, descriptor } = syntheticAsset(longest);
    expect(encodeHudTextPayload(longest, length => reserved.push(length))).toEqual(bytes);
    expect(reserved).toEqual([bytes.length]);
    expect(bytes.length).toBeLessThanOrEqual(payloadBytes);
    expect(decode(bytes, descriptor)).toEqual(longest);
    expectContractError(() => encodeHudTextPayload(content({ targetNone: 'x'.repeat(textBytes + 1) })), CODE, 'hudText.entries.targetNone');
  });

  it.each([
    ['whitespace between tokens', (json: string) => json.replace('{"entries":', '{"entries": '), 'non-canonical-payload', 'payload'],
    ['another key order', (json: string) => json.replace(/("targetWarpNotice":"[^"]*"),("targetNone":"[^"]*")/, '$2,$1'), 'non-canonical-payload', 'payload'],
    ['an escaped printable character', (json: string) => json.replace('PRIVATE', '\\u0050RIVATE'), 'non-canonical-payload', 'payload'],
    ['an upper-case escape', (json: string) => json.replace('\\u00e9', '\\u00E9'), 'non-canonical-payload', 'payload'],
    ['a repeated key', (json: string) => json.replace('"targetNone":', '"targetNone":"a","targetNone":'), 'non-canonical-payload', 'payload'],
    ['an escape above 255', (json: string) => json.replace('\\u00e9', '\\u0100'), CODE, 'hudText.entries.targetWarpNotice'],
    ['a NUL escape', (json: string) => json.replace('\\u00e9', '\\u0000'), CODE, 'hudText.entries.targetWarpNotice'],
    ['a missing key', (json: string) => json.replace(/"targetNone":"[^"]*",/, ''), CODE, 'hudText.entries.targetNone'],
    ['an extra key', (json: string) => json.replace('"targetNone":', '"targetNone2":"a","targetNone":'), CODE, 'hudText.entries'],
    ['a text that is no string', (json: string) => json.replace(/"targetNone":"[^"]*"/, '"targetNone":1'), CODE, 'hudText.entries.targetNone'],
    ['another conversion', (json: string) => json.replace(/("targetDistance":"[^"]*)%\.0f/, '$1%d'), CODE, 'hudText.entries.targetDistance'],
    ['a stray percent byte', (json: string) => json.replace(/("mapInfoKindWord0x1":"[^"]*)"/, '$1%"'), CODE, 'hudText.entries.mapInfoKindWord0x1'],
    ['an unknown field', (json: string) => json.replace('{"entries":', '{"labels":[],"entries":'), CODE, 'hudText'],
    ['a trailing newline', (json: string) => `${json}\n`, CODE, 'payload'],
    ['text that is not JSON', (json: string) => json.slice(0, -1), CODE, 'payload'],
  ])('rejects %s', (_, edit, code, path) => {
    const { bytes, descriptor } = edited(edit);
    expectContractError(() => decode(bytes, descriptor), code, path, [MARKER]);
  });

  it('rejects a text over the limit and non-ASCII bytes', () => {
    const over = edited(json => json.replace(MARKER, MARKER.repeat(2)));
    expectContractError(() => decode(over.bytes, over.descriptor), CODE, 'hudText.entries.targetWarpNotice', [MARKER]);
    const { bytes, descriptor } = syntheticAsset();
    const changed = new Uint8Array(bytes);
    changed[text(bytes).indexOf(MARKER)] = 0xe9;
    expectContractError(() => decode(changed, descriptor), CODE, 'payload');
  });

  it('checks the byte limit before parsing or the descriptor, and rejects transferred bytes', () => {
    expect(() => decode(new Uint8Array(payloadBytes + 1).fill(0x20), { role: 'unknown' })).toThrowError(/byte limit/);
    expectContractError(() => decode(new Uint8Array(payloadBytes + 1), { role: 'unknown' }), CODE, 'payload');
    const { descriptor } = syntheticAsset();
    expect(() => decode(new Uint8Array(payloadBytes).fill(0x20), descriptor)).toThrowError(/JSON text/);
    const { bytes } = syntheticAsset();
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => decode(bytes, descriptor), 'payload-detached', 'payload');
  });

  it.each([
    ['another role', (d: MutableDescriptor) => { d.role = 'view-labels'; }, CODE, 'descriptor.role'],
    ['a kind other than data', (d: MutableDescriptor) => { Object.assign(d, { id: 'image/hud/text', kind: 'image' }); }, CODE, 'descriptor.kind'],
    ['another schema version', (d: MutableDescriptor) => { d.payloadIdentity.schemaVersion = 2; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
    ['a dependency', (d: MutableDescriptor) => { d.dependencies.push({ id: 'font/synthetic-hud', kind: 'font' }); }, 'flight-data-reference-mismatch', 'descriptor.dependencies'],
  ] as const)('rejects a descriptor with %s', (_, change, code, path) => {
    const { bytes, descriptor } = syntheticAsset();
    change(descriptor as MutableDescriptor);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('returns a deeply frozen result isolated from the input bytes and earlier results', () => {
    const { bytes, descriptor } = syntheticAsset();
    const first = decode(bytes, descriptor);
    expect(deepFrozen(first)).toBe(true);
    expect(() => { (first.entries as Record<string, string>).targetNone = 'changed'; }).toThrowError(TypeError);
    const second = decode(bytes, descriptor);
    expect(second).not.toBe(first);
    bytes.fill(0x20);
    expect(first).toEqual(content());
    expect(second).toEqual(first);
  });

  it('carries different synthetic texts through unchanged', () => {
    for (const prefix of ['a', 'other-prefix']) {
      const value = syntheticHudText(prefix);
      const { bytes, descriptor } = syntheticAsset(value);
      expect(decode(bytes, descriptor)).toEqual(value);
    }
  });
});
