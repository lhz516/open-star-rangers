import { describe, expect, it } from 'vitest';
import {
  COCKPIT_INSTRUMENTS_SCHEMA_VERSION, decodeCockpitInstrumentsPayload, encodeCockpitInstrumentsPayload,
} from '../../content/hud/instruments-payload.ts';
import { executableRegion, type ExecutableRegionLocator } from '../source-mapping.ts';
import { countedVerifiedSource, dataPaletteBlock } from './conversion.test-support.ts';
import { convertGraphics, type GraphicsSource } from './convert-graphics.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE, TARGET_VIEW_DISTANCES } from './production-graphics.ts';
import {
  f32Bytes, PRODUCTION_COCKPIT_INSTRUMENTS, PRODUCTION_GRAPHICS_REGION_WRITES, productionCockpitEntry, productionGraphicsFiles,
  regionExecutable, SYNTHETIC_COCKPIT_INSTRUMENTS, type PositionedFixup, type SyntheticInstrumentSlot,
} from './production-graphics.test-support.ts';

// The cockpit instruments conversion (P3-03 spec, 修订 4; P3-13 spec, DC-02) on the synthetic production cockpit and
// executable, with only the Assets it is checked against: both layouts with their element images and palettes and the
// map geometry. The values are made up, not the original records'.

const ID = 'data/hud/instruments';
const AT = `graphics[${ID}]`;
const CONTENT = `${AT}.cockpitInstruments`;
const ELEMENTS = ['image/cockpit/front/element-', 'image/map/frame/element-'].flatMap(prefix => [0, 1, 2, 3].map(index => `${prefix}${index}`));
const IDS = new Set([
  'palette/flight/cockpit-hud-map', 'palette/map/screen', 'layout/cockpit/front', 'layout/map/frame', ...ELEMENTS, 'data/hud/map-geometry', ID,
]);
const DECLARATIONS = PRODUCTION_GRAPHICS_DECLARATIONS.filter(({ asset }) => IDS.has(asset.id));
const MAPPINGS = { ...PRODUCTION_GRAPHICS_MAPPINGS, mappings: PRODUCTION_GRAPHICS_MAPPINGS.mappings.filter(({ asset }) => IDS.has(asset.id)) };
const MAPPING_INDEX = MAPPINGS.mappings.findIndex(({ asset }) => asset.id === ID);
const REGION_PATH = `sources.mappings[${MAPPING_INDEX}].parts[3].alternatives[0]`;
const DISTANCES = executableRegion(TARGET_VIEW_DISTANCES as ExecutableRegionLocator);

type Entry = ReturnType<typeof productionCockpitEntry>;
type Slots = readonly (SyntheticInstrumentSlot | null)[];

/** The executable with the production graphics regions, `distances` in the target view distance region and `fixups`. */
const executable = (distances = f32Bytes(SYNTHETIC_COCKPIT_INSTRUMENTS.targetViewDistances), fixups: readonly PositionedFixup[] = []) => regionExecutable([
  ...PRODUCTION_GRAPHICS_REGION_WRITES.filter(({ offset, object }) => object !== DISTANCES.object || offset !== DISTANCES.offset),
  { ...DISTANCES, bytes: distances },
], fixups);

interface Disc {
  readonly entry?: Entry;
  readonly exe?: Uint8Array;
  readonly mappings?: unknown;
  readonly declarations?: unknown;
  readonly limits?: unknown;
}

async function convert({ entry = productionCockpitEntry(), exe = executable(), mappings = MAPPINGS, declarations = DECLARATIONS, limits = PRODUCTION_GRAPHICS_SHARE }: Disc = {}) {
  const { source, reads } = await countedVerifiedSource({ ...productionGraphicsFiles({ CCKD: entry }), 'MAIN/SRANGERS.EXE': exe });
  return { result: await runGraphicsStep(source, mappings, declarations, limits), reads };
}

const rejects = (disc: Disc, expected: Record<string, unknown>) => expect(convert(disc)).rejects.toMatchObject({ name: 'SourceError', ...expected });

/** The production slots with slot `slot`'s records changed by `change`. */
const changed = (slot: number, change: (slot: SyntheticInstrumentSlot) => SyntheticInstrumentSlot): Slots =>
  PRODUCTION_COCKPIT_INSTRUMENTS.map((item, index) => (index === slot ? change(item) : item));
/** The production slots with record `record` of slot `slot` changed by `change`. */
const changedRecord = (slot: number, record: number, change: Partial<SyntheticInstrumentSlot['records'][number]>): Slots =>
  changed(slot, item => ({ ...item, records: item.records.map((value, index) => (index === record ? { ...value, ...change } : value)) }));
const entryWith = (slots: Slots): Entry => productionCockpitEntry(undefined, undefined, slots);
/** Slot 0's type-9 record, the one with a four-entry parameter table. */
const STRIP = PRODUCTION_COCKPIT_INSTRUMENTS[0].records.findIndex(({ type }) => type === 9);

describe('cockpit instruments conversion', () => {
  it('converts the slots of layouts 0, 6 and 8 and the distance region into the payload, verified, from one CCKD read', async () => {
    const { result, reads } = await convert();
    const [{ group, descriptors, payloads, sources }] = result.groups;
    expect(group).toBe('cockpit-hud-map');
    const index = descriptors.findIndex(({ id }) => id === ID);
    expect(descriptors[index]).toMatchObject({
      id: ID, kind: 'data', role: 'cockpit-instruments', dependencies: [], payloadIdentity: { schemaVersion: COCKPIT_INSTRUMENTS_SCHEMA_VERSION },
    });
    expect(decodeCockpitInstrumentsPayload(payloads[index].bytes, descriptors[index])).toEqual(SYNTHETIC_COCKPIT_INSTRUMENTS);
    expect(payloads[index].bytes).toEqual(encodeCockpitInstrumentsPayload(SYNTHETIC_COCKPIT_INSTRUMENTS));
    expect(sources[index]).toEqual({ id: ID, state: 'verified', unknowns: [] });
    expect(reads.get(10_103)).toBe(1);
  });

  it.each([
    ['no slot carries layout 8', changed(7, item => ({ ...item, layout: 9 })), 'unsupported-payload', `${AT}.groups`],
    ['two slots carry layout 8', changed(6, item => ({ ...item, layout: 8 })), 'unsupported-payload', `${AT}.groups`],
    ['layout 8 is not at directory index 7', [...PRODUCTION_COCKPIT_INSTRUMENTS.slice(0, 6), PRODUCTION_COCKPIT_INSTRUMENTS[7], PRODUCTION_COCKPIT_INSTRUMENTS[6]], 'unsupported-payload', `${AT}.groups`],
    ['slot 0 is always redrawn', changed(0, item => ({ ...item, alwaysRedraw: true })), 'unsupported-payload', `${CONTENT}.slots[0].alwaysRedraw`],
    ['slot 0 holds a type-4 record', changedRecord(0, 0, { type: 4 }), 'unsupported-payload', `${CONTENT}.slots[0].instruments[0].type`],
    ['slot 7 holds a second message line', changed(7, item => ({ ...item, records: [...item.records, ...item.records] })), 'unsupported-payload', `${CONTENT}.slots[2].instruments[1].type`],
    ['a type-5 record has a draw parameter', changedRecord(0, 4, { drawParam: 1 }), 'unsupported-payload', `${CONTENT}.slots[0].instruments[4].drawParam`],
    ['a type-9 range lies outside the rectangle', changedRecord(0, STRIP, { params: [0, 1, 2, 3] }), 'unsupported-payload', `${CONTENT}.slots[0].instruments[${STRIP}].params[0]`],
  ] as const)('rejects a cockpit entry where %s', async (_name, slots, code, location) => {
    await rejects({ entry: entryWith(slots) }, { code, location });
  });

  it('checks a parameter table\'s entry count against its limit before the table', async () => {
    const params = [-1, 0, 1, 2, 3];
    await rejects({ entry: entryWith(changedRecord(0, 0, { params })) }, {
      code: 'limit-exceeded', location: `${AT}.instruments[0].params`, limit: { name: 'payloadItems', limit: 4, observed: 5 },
    });
  });

  it.each([
    ['a null pointer with entries', (entry: Entry, record: number) => patch(entry, record + 0x24, 0), 'unsupported-payload'],
    ['a pointer without entries', (entry: Entry, record: number) => patch(entry, record + 0x28, 0), 'unsupported-payload'],
    ['an unrelocated pointer', (entry: Entry, record: number) => ({ ...entry, relocations: entry.relocations.filter(at => at !== record + 0x24) }), 'invalid-payload'],
    ['a table past the block', (entry: Entry, record: number) => patch(entry, record + 0x24, entry.data.length - 15), 'invalid-payload'],
  ] as const)('rejects a parameter table with %s', async (_name, change, code) => {
    const entry = productionCockpitEntry();
    const record = firstRecord(entry.data) + STRIP * 48;
    await rejects({ entry: change(entry, record) }, { code, location: `${AT}.instruments[${STRIP}].params` });
  });

  it('rejects a pass-1 element drawn only in a full redraw', async () => {
    // The first front element in pass 1 without its every-frame flag.
    await rejects({ entry: productionCockpitEntry(undefined, [1, 0]) }, { code: 'unsupported-payload', location: `${CONTENT}.slots[0].elements[0].everyFrame` });
  });

  it('rejects a non-finite distance at its index without the value', async () => {
    const distances = [...SYNTHETIC_COCKPIT_INSTRUMENTS.targetViewDistances];
    distances[3] = Number.POSITIVE_INFINITY;
    const error = await convert({ exe: executable(f32Bytes(distances)) }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: 'SourceError', code: 'unsupported-payload', location: `${CONTENT}.targetViewDistances[3]` });
    expect(JSON.stringify(error)).not.toMatch(/Infinity|12\.5/);
  });

  it('rejects a distance region that a fixup patches or that is not 20 f32 values', async () => {
    const fixup = { object: DISTANCES.object, offset: DISTANCES.offset + 8, target: { object: DISTANCES.object, offset: 0 } };
    await rejects({ exe: executable(undefined, [fixup]) }, { code: 'unsupported-payload', location: REGION_PATH });
    // A fixup across the region's end is one the shared LE region reader rejects as it rejects it in every region.
    const across = { ...fixup, offset: DISTANCES.offset + DISTANCES.length - 2 };
    await rejects({ exe: executable(undefined, [across]) }, { code: 'invalid-payload', location: REGION_PATH });
    const shorter = { ...TARGET_VIEW_DISTANCES, subresource: TARGET_VIEW_DISTANCES.subresource.replace(/\/80$/, '/76') };
    const mappings = {
      ...MAPPINGS,
      mappings: MAPPINGS.mappings.map(mapping => (mapping.asset.id === ID ? { ...mapping, parts: [...mapping.parts.slice(0, 3), { alternatives: [shorter] }] } : mapping)),
    };
    await rejects({ mappings }, { code: 'unsupported-payload', location: REGION_PATH });
  });

  it.each([
    ['no region part', (parts: readonly Part[]) => parts.slice(0, 3)],
    ['a slot of layout 5', (parts: readonly Part[]) => [slotPart('layouts/5'), ...parts.slice(1)]],
    ['a slot of another entry', (parts: readonly Part[]) => [...parts.slice(0, 2), slotPart('layouts/8', { id: 10_473, type: 'MFDD' }), parts[3]]],
  ])('rejects a mapping with %s as an invalid declaration', async (_name, change) => {
    const mappings = { ...MAPPINGS, mappings: MAPPINGS.mappings.map(mapping => (mapping.asset.id === ID ? { ...mapping, parts: change(mapping.parts) } : mapping)) };
    await rejects({ mappings }, { code: 'invalid-declaration', location: `${AT}.messages` });
  });

  it('converts without the map geometry or a slot layout, which package validation reports, and pairs elements with their images', async () => {
    const without = (...ids: string[]): Disc => {
      const keep = ({ asset }: { readonly asset: { readonly id: string } }) => !ids.includes(asset.id);
      return { declarations: DECLARATIONS.filter(keep), mappings: { ...MAPPINGS, mappings: MAPPINGS.mappings.filter(keep) } };
    };
    for (const omitted of ['data/hud/map-geometry', 'layout/map/frame']) {
      const { result } = await convert(without(omitted));
      const index = result.groups[0].descriptors.findIndex(({ id }) => id === ID);
      expect(decodeCockpitInstrumentsPayload(result.groups[0].payloads[index].bytes, result.groups[0].descriptors[index])).toEqual(SYNTHETIC_COCKPIT_INSTRUMENTS);
    }
    // An element without its declared image cannot be paired.
    await rejects(without('layout/map/frame', 'image/map/frame/element-3'), { code: 'invalid-declaration', location: `${AT}.elements` });
  });

  it('charges the payload before allocating it and fails over budget without results', async () => {
    const { result } = await convert();
    const bytes = result.groups[0].payloads.find(({ id }) => id === ID)!.bytes.length;
    const total = result.usage.payloadBytes;
    await rejects({ limits: { ...PRODUCTION_GRAPHICS_SHARE, payloadBytes: total - 1 } }, {
      code: 'budget-exceeded', limit: { name: 'payloadBytes', limit: total - 1, observed: expect.any(Number) },
    });
    // The instruments are the first data Asset in ID order; their charge alone exceeds what the images leave.
    const images = total - bytes - result.groups[0].payloads.find(({ id }) => id === 'data/hud/map-geometry')!.bytes.length
      - result.groups[0].payloads.filter(({ id }) => id.startsWith('layout/')).reduce((sum, { bytes: layout }) => sum + layout.length, 0);
    await rejects({ limits: { ...PRODUCTION_GRAPHICS_SHARE, payloadBytes: images + bytes - 1 } }, {
      code: 'budget-exceeded', location: `${AT}.messages`, limit: { name: 'payloadBytes', limit: images + bytes - 1, observed: images + bytes },
    });
  });

  it('checks the instruments against the map geometry it is converted with', () => {
    // Sources the step never pairs: the map geometry from a cockpit whose type-10 record moved by one pixel.
    const moved = changed(2, item => ({ ...item, records: item.records.map(record => (record.type === 10 ? { ...record, rectangle: [22, 45, 611, 444] as const } : record)) }));
    const [cockpit, other] = [productionCockpitEntry(), entryWith(moved)];
    const element = (id: string) => ({ container: 'cockpit-element', slot: id.startsWith('image/map/') ? 2 : 0, index: Number(id.slice(-1)) } as const);
    const sources = new Map<string, GraphicsSource>(DECLARATIONS.map(({ asset: { id } }): [string, GraphicsSource] => {
      if (id === ID) {
        return [id, {
          type: 'cockpit-instruments', entry: { bytes: cockpit.data, relocations: cockpit.relocations },
          distances: f32Bytes(SYNTHETIC_COCKPIT_INSTRUMENTS.targetViewDistances),
          elementImages: SYNTHETIC_COCKPIT_INSTRUMENTS.slots.map(({ elements }) => elements.map(({ image }) => image)),
        }];
      }
      if (id === 'data/hud/map-geometry') return [id, { type: 'map-geometry', block: other.data, layout: 6, instrumentType: 10, font: 1 }];
      if (id === 'palette/flight/cockpit-hud-map') return [id, { type: 'data-palette', block: dataPaletteBlock() }];
      if (id === 'palette/map/screen') return [id, { type: 'cockpit-group-palette', block: cockpit.data, slot: 2 }];
      if (id.startsWith('layout/')) return [id, { type: 'cockpit-group', block: cockpit.data, slot: id === 'layout/map/frame' ? 2 : 0 }];
      return [id, { type: 'image-record', block: cockpit.data, record: element(id) }];
    }));
    expect(() => convertGraphics(DECLARATIONS, sources, PRODUCTION_GRAPHICS_SHARE)).toThrow(expect.objectContaining({
      name: 'SourceError', code: 'unsupported-payload', location: `${CONTENT}.slots[1].instruments[0].rectangle`,
    }));
    // With the map geometry of the same cockpit, the same sources convert.
    sources.set('data/hud/map-geometry', { type: 'map-geometry', block: cockpit.data, layout: 6, instrumentType: 10, font: 1 });
    expect(convertGraphics(DECLARATIONS, sources, PRODUCTION_GRAPHICS_SHARE).assets.map(({ descriptor }) => descriptor.id)).toContain(ID);
  });
});

type Part = (typeof MAPPINGS.mappings)[number]['parts'][number];

const slotPart = (subresource: string, entry = { id: 10_103, type: 'CCKD' }): Part => ({ alternatives: [{ discPath: 'MAIN/SR.NOB', entry, subresource }] } as unknown as Part);

/** The block offset of the first instrument record of directory slot 0. */
function firstRecord(block: Uint8Array): number {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  return view.getUint32(view.getUint32(8, true) + 0x18, true);
}

/** `entry` with the u32 at `offset` replaced. */
function patch({ data, relocations }: Entry, offset: number, value: number): Entry {
  const patched = data.slice();
  new DataView(patched.buffer).setUint32(offset, value, true);
  return { data: patched, relocations };
}
