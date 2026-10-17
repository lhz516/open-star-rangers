import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { decodeMapGeometryPayload, encodeMapGeometryPayload, MAP_GEOMETRY_SCHEMA_VERSION } from '../../content/hud/map-geometry-payload.ts';
import { ByteWriter } from '../synthetic.test-support.ts';
import {
  cockpitLayoutBlock, countedVerifiedSource, fontTable, GRAPHICS_ARCHIVE, GRAPHICS_ENTRIES, graphicsArchive, hudFontTables, instrumentRecord,
  type SyntheticInstruments,
} from './conversion.test-support.ts';
import { runGraphicsStep } from './graphics-step.ts';

// The map geometry conversion (P3-03 spec, P3-09 的修订：地图几何（修订 2）) on synthetic CCKD entries; the values are made
// up, not the original records'.

const ID = 'data/hud/map-geometry';
const AT = `graphics[${ID}]`;
const LIMITS = { ...EMPTY_BUDGET_USAGE, assets: 10, payloadBytes: 10_000 };
const { cockpit, data } = GRAPHICS_ENTRIES;

type Rectangle = readonly [number, number, number, number];
const RECTANGLE: Rectangle = [21, 45, 611, 444];

/** The front cockpit (layout 0), the full-screen slot (layout 5, with a type-10 record of its own) and the map (layout 6). */
const instruments = (map: readonly Uint8Array[] = [instrumentRecord(10, RECTANGLE, 3), instrumentRecord(8, [1, 1, 9, 9])]): SyntheticInstruments[] => [
  { layout: 0, records: [instrumentRecord(0, [5, 5, 50, 50], 1), instrumentRecord(8, [2, 2, 8, 8])] },
  { layout: 5, records: [instrumentRecord(10, [0, 0, 9, 9], 7)] },
  { layout: 6, records: map },
];

const cockpitWith = (slots: readonly (SyntheticInstruments | null)[] = instruments(), fonts = hudFontTables()) =>
  cockpitLayoutBlock(slots.map(() => []), fonts, [], slots);

const locator = (type: string, entry: number, subresource: string | null) => ({ discPath: GRAPHICS_ARCHIVE, entry: { id: entry, type }, subresource });

/** The map geometry's mapping: font 1, then the type-10 record of the layout-6 slot, of the one CCKD entry. */
const mappingOf = (parts: readonly object[] = [locator('CCKD', cockpit, 'fonts/1'), locator('CCKD', cockpit, 'layouts/6/instruments/type-10')]) => ({
  sourceFingerprint: null,
  mappings: [{
    asset: { id: ID, kind: 'data' },
    parts: parts.map(alternative => ({ alternatives: [alternative] })),
    confidence: 'confirmed',
    unknowns: [],
    evidence: ['docs/original/formats/cockpit.md'],
    resolution: 'declared',
  }],
});

const DECLARATIONS = [{ asset: { id: ID, kind: 'data' }, role: 'map-geometry', group: 'cockpit-hud-map' }];

async function convert(block: Uint8Array, mapping: unknown = mappingOf(), limits: unknown = LIMITS) {
  const { source, reads } = await countedVerifiedSource({ [GRAPHICS_ARCHIVE]: graphicsArchive({ cockpit: block }) });
  return { result: await runGraphicsStep(source, mapping, DECLARATIONS, limits), reads };
}

const rejects = (block: Uint8Array, expected: Record<string, unknown>, mapping?: unknown, limits?: unknown) =>
  expect(convert(block, mapping, limits)).rejects.toMatchObject({ name: 'SourceError', ...expected });

/** `block` with the u32 at +`field` of directory slot `slot` replaced. */
function patchSlot(block: Uint8Array, slot: number, field: number, value: number): Uint8Array {
  const patched = block.slice();
  const view = new DataView(patched.buffer);
  view.setUint32(view.getUint32(8, true) + slot * 32 + field, value, true);
  return patched;
}

describe('map geometry conversion', () => {
  it('reads the rectangle and interval of the layout-6 slot\'s type-10 record and font 1\'s height, verified, from one read', async () => {
    const { result, reads } = await convert(cockpitWith(instruments(), [fontTable(8, 8), fontTable(8, 6), fontTable(4, 6)]));
    const [{ group, descriptors: [descriptor], payloads: [payload], sources }] = result.groups;
    expect(group).toBe('cockpit-hud-map');
    expect(descriptor).toMatchObject({ id: ID, kind: 'data', role: 'map-geometry', dependencies: [], payloadIdentity: { schemaVersion: MAP_GEOMETRY_SCHEMA_VERSION } });
    const expected = { rectangle: { x0: 21, y0: 45, x1: 611, y1: 444 }, redrawInterval: 3, informationLineHeight: 6 };
    expect(decodeMapGeometryPayload(payload.bytes, descriptor)).toEqual(expected);
    expect(payload.bytes).toEqual(encodeMapGeometryPayload(expected));
    expect(sources).toEqual([{ id: ID, state: 'verified', unknowns: [] }]);
    expect(result.usage).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 1, payloadBytes: payload.bytes.length });
    expect(Object.fromEntries(reads)).toEqual({ [cockpit]: 1 });
  });

  it('keeps the u32 interval and finds the type-10 record anywhere in the slot', async () => {
    const block = cockpitWith(instruments([instrumentRecord(8, [1, 1, 9, 9]), instrumentRecord(10, RECTANGLE, 0xffff_fffe)]));
    const { result: { groups: [{ descriptors: [descriptor], payloads: [payload]}] } } = await convert(block);
    expect(decodeMapGeometryPayload(payload.bytes, descriptor)).toMatchObject({ redrawInterval: 0xffff_fffe, informationLineHeight: 8 });
  });

  it.each([
    ['no slot carries the layout number', instruments().slice(0, 2), `${AT}.groups`],
    ['two slots carry the layout number', [...instruments(), { layout: 6, records: [instrumentRecord(10, RECTANGLE)] }], `${AT}.groups`],
    ['the slot has no type-10 record', instruments([instrumentRecord(8, [1, 1, 9, 9])]), `${AT}.instruments`],
    ['the slot has no instrument records', instruments([]), `${AT}.instruments`],
    ['the slot has two type-10 records', instruments([instrumentRecord(10, RECTANGLE), instrumentRecord(10, RECTANGLE)]), `${AT}.instruments`],
  ])('rejects a cockpit entry where %s as unsupported', async (_name, slots, location) => {
    await rejects(cockpitWith(slots), { code: 'unsupported-payload', location });
  });

  it.each([
    ['a negative x0', [-1, 45, 611, 444], 'x0'],
    ['an x1 past the screen', [21, 45, 640, 444], 'x1'],
    ['a y1 past the screen', [21, 45, 611, 480], 'y1'],
    ['a one-pixel main map', [21, 45, 611, 45], 'y1'],
    ['an inverted rectangle', [611, 45, 21, 444], 'x1'],
    ['no strip right of the main map', [21, 45, 420, 444], 'x1'],
  ] as const)('rejects %s as an unsupported geometry, at the payload field and without the value', async (_name, rectangle, field) => {
    const error = await convert(cockpitWith(instruments([instrumentRecord(10, rectangle)]))).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: 'SourceError', code: 'unsupported-payload', location: `${AT}.mapGeometry.rectangle.${field}` });
    const text = JSON.stringify(error);
    for (const value of rectangle) expect(text).not.toContain(String(value));
  });

  it('rejects an information font taller than the font limit by the shared font reader', async () => {
    await rejects(cockpitWith(instruments(), [fontTable(8, 8), fontTable(8, 9), fontTable(4, 6)]), {
      code: 'limit-exceeded', location: `${AT}.glyphs`, limit: { name: 'fontHeight', limit: 8, observed: 9 },
    });
  });

  it('checks the instrument count against its limit before the array\'s bounds', async () => {
    // 33 records at a pointer past the block: the count fails first; 32 at the same pointer fail the bounds.
    const past = patchSlot(cockpitWith(), 2, 0x18, 0xffff_0000);
    await rejects(patchSlot(past, 2, 0x1c, 33), { code: 'limit-exceeded', location: `${AT}.instruments`, limit: { name: 'cockpitInstruments', limit: 32, observed: 33 } });
    await rejects(patchSlot(past, 2, 0x1c, 32), { code: 'invalid-payload', location: `${AT}.instruments` });
  });

  it('rejects an instrument array that ends one byte past the block', async () => {
    const block = cockpitWith();
    await rejects(patchSlot(block, 2, 0x18, block.length - 2 * 48 + 1), { code: 'invalid-payload', location: `${AT}.instruments` });
  });

  it.each([
    ['a truncated header', () => new ByteWriter().u32(16, 3, 16).toBytes()],
    ['a directory past the block', () => { const block = cockpitWith(); new DataView(block.buffer).setUint32(8, block.length - 95, true); return block; }],
  ])('rejects %s as invalid', async (_name, block) => {
    await rejects(block(), { code: 'invalid-payload', location: `${AT}.groups` });
  });

  it('charges the payload before allocating it and fails over budget without results', async () => {
    const bytes = encodeMapGeometryPayload({ rectangle: { x0: 21, y0: 45, x1: 611, y1: 444 }, redrawInterval: 3, informationLineHeight: 8 }).length;
    await rejects(cockpitWith(), {
      code: 'budget-exceeded', location: `${AT}.messages`, limit: { name: 'payloadBytes', limit: bytes - 1, observed: bytes },
    }, undefined, { ...LIMITS, payloadBytes: bytes - 1 });
    await expect(convert(cockpitWith(), undefined, { ...LIMITS, payloadBytes: bytes })).resolves.toBeDefined();
  });

  it.each([
    ['only the instrument part', [locator('CCKD', cockpit, 'layouts/6/instruments/type-10')]],
    ['only the font part', [locator('CCKD', cockpit, 'fonts/1')]],
    ['a font of another entry', [locator('CCKD', cockpit, 'layouts/6/instruments/type-10'), locator('DATA', data, null)]],
    ['an instrument without a type', [locator('CCKD', cockpit, 'fonts/1'), locator('CCKD', cockpit, 'layouts/6/instruments/10')]],
    ['two font parts', [locator('CCKD', cockpit, 'fonts/0'), locator('CCKD', cockpit, 'fonts/1')]],
  ])('rejects a mapping with %s as an invalid declaration', async (_name, parts) => {
    await rejects(cockpitWith(), { code: 'invalid-declaration', location: `${AT}.messages` }, mappingOf(parts));
  });
});
