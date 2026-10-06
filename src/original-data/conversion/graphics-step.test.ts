import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { validateGroup } from '../../content/completeness.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { SYNTHETIC_ASSETS, syntheticGroup, syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import type { VerifiedSource } from '../source/identify-source.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import {
  cockpitBlock, cockpitLayoutBlock, countedVerifiedSource, dataPaletteBlock, fontDeclaration, fontTable, GRAPHICS_ARCHIVE, GRAPHICS_ENTRIES, graphicsArchive, graphicsMapping,
  imageDeclaration, inGraphicsLocationGrammar, layoutDeclaration, mfdBlock, paletteDeclaration, rawImageBlock, spriteImageBlock, tableBlock,
  textureBlock,
} from './conversion.test-support.ts';
import { convertGraphics, type GraphicsSource } from './convert-graphics.ts';
import { runGraphicsStep, stepGroupDraft } from './graphics-step.ts';

const LIMITS = { ...EMPTY_BUDGET_USAGE, assets: 100, dependencyEdges: 100, paletteEntries: 10_000, imagePixels: 10_000, glyphs: 10_000, payloadBytes: 1_000_000 };
const { data, texture, cockpit, mfd, table } = GRAPHICS_ENTRIES;

const mappings = () => ({
  sourceFingerprint: null,
  mappings: [
    graphicsMapping('font/hud/4x6', 'CCKD', cockpit, 'fonts/2'),
    graphicsMapping('font/hud/8x8-1', 'CCKD', cockpit, 'fonts/0'),
    graphicsMapping('image/texture', 'TEX', texture),
    graphicsMapping('palette/flight/cockpit-hud-map', 'DATA', data),
    graphicsMapping('palette/flight/models', 'DATA', data),
    graphicsMapping('palette/texture', 'TEX', texture, 'palette'),
  ],
});

const declarations = () => [
  paletteDeclaration('palette/flight/models', 'models'),
  paletteDeclaration('palette/flight/cockpit-hud-map'),
  { ...paletteDeclaration('palette/texture', 'models'), role: 'texture-palette' },
  imageDeclaration('image/texture', 'palette/texture', { group: 'models', role: 'model-texture', display: { nearest: 'palette/flight/models' } }),
  fontDeclaration('font/hud/8x8-1', { charMap: [{ firstCode: 0x41, firstGlyph: 0x41, count: 26 }] }),
  fontDeclaration('font/hud/4x6', { cell: { width: 4, height: 6 } }),
];

const verifiedSource = (archive = graphicsArchive()) => countedVerifiedSource({ [GRAPHICS_ARCHIVE]: archive });

const readBytes = (source: VerifiedSource) => source.usage().sourceReadBytes;

describe('graphics conversion step', () => {
  it('returns frozen locator-free results by group with verified sources', async () => {
    const { source } = await verifiedSource();
    const result = await runGraphicsStep(source, mappings(), declarations(), LIMITS);
    expect(result.groups.map(({ group, descriptors, payloads, sources }) => ({
      group, ids: descriptors.map(({ id }) => id), payloads: payloads.map(({ id }) => id), sources: sources.map(({ id, state }) => `${id}:${state}`),
    }))).toEqual([
      {
        group: 'models',
        ids: ['image/texture', 'palette/flight/models', 'palette/texture'],
        payloads: ['image/texture', 'palette/flight/models', 'palette/texture'],
        sources: ['image/texture:verified', 'palette/flight/models:verified', 'palette/texture:verified'],
      },
      {
        group: 'cockpit-hud-map',
        ids: ['font/hud/4x6', 'font/hud/8x8-1', 'palette/flight/cockpit-hud-map'],
        payloads: ['font/hud/4x6', 'font/hud/8x8-1', 'palette/flight/cockpit-hud-map'],
        sources: ['font/hud/4x6:verified', 'font/hud/8x8-1:verified', 'palette/flight/cockpit-hud-map:verified'],
      },
    ]);
    for (const container of [result, result.groups, ...result.groups.flatMap(group => [group, group.descriptors, group.payloads, group.sources])]) {
      expect(Object.isFrozen(container)).toBe(true);
    }
    const [models, cockpitGroup] = result.groups;
    expect(models.payloads[1].bytes).toEqual(cockpitGroup.payloads[2].bytes);
    expect(payloadTransferList(result.groups.flatMap(({ payloads }) => payloads.map(({ bytes }) => bytes)))).toHaveLength(6);
    const shape = JSON.stringify(result, (key, value: unknown) => (value instanceof Uint8Array ? `${value.length} bytes` : key === 'fingerprint' ? 'sha256' : value));
    expect(shape).not.toMatch(/SR\.NOB|MAIN|1000[135]|DATA|TEX|CCKD|fonts\/|discPath|subresource|entry/);
    expect(result.usage).toMatchObject({ assets: 6, dependencyEdges: 2, paletteEntries: 520, imagePixels: 8, glyphs: 256 + 192, sourceReadBytes: 0 });
  });

  it('drafts one group from its partitions alone, without reconverting, and an empty group when no partition has it', async () => {
    const { source } = await verifiedSource();
    const result = await runGraphicsStep(source, mappings(), declarations(), LIMITS);
    const sourceFingerprint = source.identity.fingerprint;
    const draft = stepGroupDraft('cockpit-hud-map', [result], sourceFingerprint);
    const [, partition] = result.groups;
    expect(draft).toEqual({
      group: 'cockpit-hud-map', assets: partition.descriptors, payloads: partition.payloads, sources: { sourceFingerprint, states: partition.sources },
    });
    expect(draft.payloads.every(({ bytes }, index) => bytes === partition.payloads[index].bytes)).toBe(true);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(stepGroupDraft('audio', [result], sourceFingerprint)).toEqual({ group: 'audio', assets: [], payloads: [], sources: { sourceFingerprint, states: [] } });
    expect(() => stepGroupDraft('cockpit-hud-map', [result, result], sourceFingerprint))
      .toThrow(expect.objectContaining({ code: 'duplicate-asset', path: expect.stringMatching(/^cockpit-hud-map\.assets/) }));
  });

  it('verifies subresource mappings only through a successful conversion', async () => {
    const { source } = await verifiedSource();
    const verified = await verifySourceMappings(mappings(), source);
    expect(verified.mappings.map(({ asset, resolution }) => `${asset.id}:${resolution}`)).toEqual([
      'font/hud/4x6:declared', 'font/hud/8x8-1:declared', 'image/texture:verified',
      'palette/flight/cockpit-hud-map:verified', 'palette/flight/models:verified', 'palette/texture:declared',
    ]);
    const broken = await verifiedSource(graphicsArchive({ cockpit: cockpitBlock([fontTable(8, 8), fontTable(8, 8), fontTable(4, 9)]) }));
    await expect(runGraphicsStep(broken.source, mappings(), declarations(), LIMITS))
      .rejects.toMatchObject({ name: 'SourceError', code: 'limit-exceeded', location: 'graphics[font/hud/4x6].glyphs' });
  });

  it('completes the cockpit-hud-map group with synthetic Assets for its other roles', async () => {
    const { source } = await verifiedSource();
    const step = (await runGraphicsStep(source, mappings(), declarations(), LIMITS)).groups.find(({ group }) => group === 'cockpit-hud-map')!;
    const sourceFingerprint = source.identity.fingerprint;
    const others = SYNTHETIC_ASSETS['cockpit-hud-map'].filter(({ role }) => role !== 'font').map(spec => ({
      ...spec, dependencies: spec.dependencies?.map(id => (id === 'font/synthetic-hud' ? 'font/hud/8x8-1' : id)),
    }));
    const base = syntheticGroup('cockpit-hud-map', others, { origin: { type: 'original-import', sourceFingerprint } });
    const byId = <T extends { readonly id: string }>(items: readonly T[]) => [...items].sort((left, right) => compareText(left.id, right.id));
    const input = {
      manifest: { ...base.manifest, assets: byId<{ readonly id: string }>([...base.manifest.assets, ...step.descriptors]) },
      payloads: byId([...base.payloads, ...step.payloads]),
      sources: { sourceFingerprint, states: byId([...others.map(({ id }) => ({ id, state: 'verified', unknowns: [] })), ...step.sources]) },
    };
    expect(validateGroup(CLASSIC_P2_SLICE, input)).toMatchObject({ status: 'group-complete', group: 'cockpit-hud-map' });
  });

  it('reads each shared entry once for verification and conversion together', async () => {
    const shared = await verifiedSource();
    const before = readBytes(shared.source);
    await runGraphicsStep(shared.source, mappings(), declarations(), LIMITS);
    // Verification alone must read every entry, so one read each means conversion added none.
    expect(Object.fromEntries(shared.reads)).toEqual({ [data]: 1, [texture]: 1, [cockpit]: 1 });
    const stepBytes = readBytes(shared.source) - before;

    const unshared = await verifiedSource();
    const unsharedBefore = readBytes(unshared.source);
    await verifySourceMappings(mappings(), unshared.source);
    expect(Object.fromEntries(unshared.reads)).toEqual({ [data]: 2, [texture]: 2, [cockpit]: 2 });
    expect(readBytes(unshared.source) - unsharedBefore).toBeGreaterThan(stepBytes);
  });

  it('keeps issued reads charged and discards every result when the budget rejects a late Asset', async () => {
    const reference = await verifiedSource();
    const referenceBefore = readBytes(reference.source);
    await runGraphicsStep(reference.source, mappings(), declarations(), LIMITS);
    const stepBytes = readBytes(reference.source) - referenceBefore;

    const { source, reads } = await verifiedSource();
    const before = readBytes(source);
    await expect(runGraphicsStep(source, mappings(), declarations(), { ...LIMITS, glyphs: 256 }))
      .rejects.toMatchObject({ name: 'SourceError', code: 'budget-exceeded', location: 'graphics[font/hud/8x8-1].glyphs', limit: { name: 'glyphs', limit: 256, observed: 192 + 256 } });
    expect(readBytes(source) - before).toBe(stepBytes);
    expect(Object.fromEntries(reads)).toEqual({ [data]: 1, [texture]: 1, [cockpit]: 1 });
  });

  it.each<[string, () => { mappings: unknown; declarations: unknown }, string, string]>([
    ['a declaration without a mapping', () => ({ mappings: { ...mappings(), mappings: mappings().mappings.slice(1) }, declarations: declarations() }), 'invalid-declaration', 'graphics.declarations[5]'],
    ['a mapping without a declaration', () => ({ mappings: mappings(), declarations: declarations().slice(0, 5) }), 'invalid-declaration', 'graphics.declarations'],
    ['an unknown font subresource', () => ({ mappings: withMapping(0, graphicsMapping('font/hud/4x6', 'CCKD', cockpit, 'glyphs/2')), declarations: declarations() }), 'invalid-declaration', 'graphics[font/hud/4x6].fonts'],
    ['a font index with a leading zero', () => ({ mappings: withMapping(0, graphicsMapping('font/hud/4x6', 'CCKD', cockpit, 'fonts/02')), declarations: declarations() }), 'invalid-declaration', 'graphics[font/hud/4x6].fonts'],
    ['font index 3', () => ({ mappings: withMapping(0, graphicsMapping('font/hud/4x6', 'CCKD', cockpit, 'fonts/3')), declarations: declarations() }), 'subresource-not-found', 'graphics[font/hud/4x6].fonts'],
    ['an 11-digit font index', () => ({ mappings: withMapping(0, graphicsMapping('font/hud/4x6', 'CCKD', cockpit, 'fonts/12345678901')), declarations: declarations() }), 'subresource-not-found', 'graphics[font/hud/4x6].fonts'],
    ['a palette from a whole TEX entry', () => ({ mappings: withMapping(5, graphicsMapping('palette/texture', 'TEX', texture)), declarations: declarations() }), 'invalid-declaration', 'graphics[palette/texture].palette'],
    ['an image from a CCKD entry', () => ({ mappings: withMapping(2, graphicsMapping('image/texture', 'CCKD', cockpit)), declarations: declarations() }), 'invalid-declaration', 'graphics[image/texture].record'],
    ['a two-part mapping', () => ({ mappings: withMapping(2, twoParts()), declarations: declarations() }), 'invalid-declaration', 'graphics[image/texture].record'],
  ])('rejects %s', async (_, inputs, code, location) => {
    const { source } = await verifiedSource();
    const { mappings: table, declarations: set } = inputs();
    await expect(runGraphicsStep(source, table, set, LIMITS)).rejects.toMatchObject({ name: 'SourceError', code, location });
    expect(inGraphicsLocationGrammar(location)).toBe(true);
  });

  it('keeps the P2-03 code and location of a read failure', async () => {
    const { source } = await verifiedSource();
    const table = withMapping(2, graphicsMapping('image/texture', 'TEX', 10_007));
    await expect(runGraphicsStep(source, table, declarations(), LIMITS))
      .rejects.toMatchObject({ name: 'SourceError', code: 'entry-not-found', location: 'sources.mappings[2].parts[0].alternatives[0]' });
  });
});

/** The texture mapping with a second part, the DATA entry, ahead of it in canonical locator order. */
function twoParts(): Record<string, unknown> {
  const mapping = graphicsMapping('image/texture', 'TEX', texture);
  const [dataPart] = graphicsMapping('image/texture', 'DATA', data).parts as unknown[];
  return { ...mapping, parts: [dataPart, ...(mapping.parts as unknown[])] };
}

function withMapping(index: number, mapping: Record<string, unknown>) {
  const table = mappings();
  table.mappings[index] = mapping;
  return table;
}

describe('graphics step container sources and layouts', () => {
  const FRONT_RAW = rawImageBlock(4, 2, [1, 2, 3, 4, 5, 6, 7, 8]);
  const FRONT_SPRITE = spriteImageBlock(5, 3, [0, 0, 2, 0, 1, 2, 3, 0, 5, 0, 1, 0, 3, 0, 3, 4, 5, 1, 0]);
  const MAP_RECORD = rawImageBlock(2, 3, [0, 1, 2, 3, 0, 1], Array.from({ length: 48 }, (_, index) => (index * 5) & 0xff));
  const OVERLAY = rawImageBlock(1, 1, [2]);
  const COCKPIT = cockpitLayoutBlock([
    [{ record: FRONT_RAW, x: 0, y: 6 }, { record: FRONT_SPRITE, x: 3, y: 0 }],
    [],
    [{ record: MAP_RECORD, x: 1, y: 1, flags: [1, 0] }],
  ]);
  const MFD = mfdBlock([[textureBlock()], [OVERLAY]]);
  const containerSource = () => verifiedSource(graphicsArchive({ cockpit: COCKPIT, mfd: MFD }));

  const IDS = Object.freeze({
    font: 'font/hud/8x8-1', front0: 'image/front/element-0', front1: 'image/front/element-1', map0: 'image/map/element-0',
    background: 'image/mfd/background-0', overlay: 'image/mfd/overlay-0', front: 'layout/front', map: 'layout/map',
    flight: 'palette/flight/cockpit-hud-map', mapPalette: 'palette/map', mfdPalette: 'palette/mfd',
  });

  // In ascending Asset ID order, as the mapping table requires.
  const containerMappings = () => ({
    sourceFingerprint: null,
    mappings: [
      graphicsMapping(IDS.font, 'CCKD', cockpit, 'fonts/0'),
      graphicsMapping(IDS.front0, 'CCKD', cockpit, 'groups/0/elements/0'),
      graphicsMapping(IDS.front1, 'CCKD', cockpit, 'groups/0/elements/1'),
      graphicsMapping(IDS.map0, 'CCKD', cockpit, 'groups/2/elements/0'),
      graphicsMapping(IDS.background, 'MFDD', mfd, 'lists/0/records/0'),
      graphicsMapping(IDS.overlay, 'MFDD', mfd, 'lists/1/records/0'),
      graphicsMapping(IDS.front, 'CCKD', cockpit, 'groups/0'),
      graphicsMapping(IDS.map, 'CCKD', cockpit, 'groups/2'),
      graphicsMapping(IDS.flight, 'DATA', data),
      graphicsMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/2/elements/0/palette'),
      graphicsMapping(IDS.mfdPalette, 'MFDD', mfd, 'lists/0/records/0/palette'),
    ],
  });

  const containerDeclarations = (front: Record<string, unknown> = {}) => [
    paletteDeclaration(IDS.flight),
    paletteDeclaration(IDS.mapPalette),
    paletteDeclaration(IDS.mfdPalette),
    imageDeclaration(IDS.front0, IDS.flight, { role: 'cockpit-element' }),
    imageDeclaration(IDS.front1, IDS.flight, { role: 'cockpit-element' }),
    imageDeclaration(IDS.map0, IDS.mapPalette, { role: 'map-frame-element' }),
    imageDeclaration(IDS.background, IDS.mfdPalette),
    imageDeclaration(IDS.overlay, IDS.flight),
    layoutDeclaration(IDS.front, [IDS.front0, IDS.front1], { frame: { width: 8, height: 8 }, ...front }),
    layoutDeclaration(IDS.map, [IDS.map0], { role: 'strategic-map', frame: { width: 4, height: 4 } }),
    fontDeclaration(IDS.font),
  ];

  const withContainerMapping = (id: string, type: string, entry: number, subresource: string | null) => {
    const table = containerMappings();
    table.mappings[table.mappings.findIndex(mapping => (mapping.asset as { id: string }).id === id)] = graphicsMapping(id, type, entry, subresource);
    return table;
  };

  it('converts layouts, element images, MFDD records and their palettes with one read of each entry', async () => {
    const { source, reads } = await containerSource();
    const result = await runGraphicsStep(source, containerMappings(), containerDeclarations(), LIMITS);
    expect(Object.fromEntries(reads)).toEqual({ [data]: 1, [cockpit]: 1, [mfd]: 1 });
    expect(result.groups).toHaveLength(1);
    const [step] = result.groups;
    expect(step.descriptors.map(({ id }) => id)).toEqual(Object.values(IDS).sort(compareText));
    expect(step.sources.every(({ state }) => state === 'verified')).toBe(true);
    const payload = (id: string) => step.payloads.find(payloadRecord => payloadRecord.id === id)!.bytes;
    expect(readLayoutPayload(payload(IDS.front), 1)).toEqual({
      kind: 'layout', frame: { width: 8, height: 8 }, elements: [{ image: IDS.front0, x: 0, y: 6 }, { image: IDS.front1, x: 3, y: 0 }],
    });
    expect(step.descriptors.find(({ id }) => id === IDS.map)!.dependencies).toEqual([{ id: IDS.map0, kind: 'image' }]);
    const shape = JSON.stringify(result, (key, value: unknown) => (value instanceof Uint8Array ? `${value.length} bytes` : key === 'fingerprint' ? 'sha256' : value));
    expect(shape).not.toMatch(/SR\.NOB|MAIN|1000[1359]|CCKD|MFDD|groups\/|lists\/|discPath|subresource|entry/);

    // The same records and palettes as whole entries convert to the same payloads.
    const whole = convertGraphics(containerDeclarations().filter(({ asset }) => ['image', 'palette'].includes((asset as { kind: string }).kind)), new Map<string, GraphicsSource>([
      [IDS.flight, { type: 'data-palette', block: dataPaletteBlock() }],
      [IDS.mapPalette, { type: 'embedded-palette', block: MAP_RECORD }],
      [IDS.mfdPalette, { type: 'embedded-palette', block: textureBlock() }],
      [IDS.front0, { type: 'image-record', block: FRONT_RAW }],
      [IDS.front1, { type: 'image-record', block: FRONT_SPRITE }],
      [IDS.map0, { type: 'image-record', block: MAP_RECORD }],
      [IDS.background, { type: 'image-record', block: textureBlock() }],
      [IDS.overlay, { type: 'image-record', block: OVERLAY }],
    ]), LIMITS);
    expect(whole.assets).toHaveLength(8);
    for (const { payload: converted } of whole.assets) expect(payload(converted.id)).toEqual(converted.bytes);
  });

  it('forms a complete cockpit-hud-map group from layouts, images, palettes and a font alone', async () => {
    const { source } = await containerSource();
    const [step] = (await runGraphicsStep(source, containerMappings(), containerDeclarations(), LIMITS)).groups;
    const sourceFingerprint = source.identity.fingerprint;
    const input = {
      manifest: { identity: syntheticIdentity({ origin: { type: 'original-import', sourceFingerprint } }), group: step.group, assets: step.descriptors },
      payloads: step.payloads,
      sources: { sourceFingerprint, states: step.sources },
    };
    expect(validateGroup(CLASSIC_P2_SLICE, input)).toMatchObject({ status: 'group-complete', group: 'cockpit-hud-map' });
  });

  it('leaves container mappings declared until a conversion succeeds and returns nothing when it fails', async () => {
    const { source } = await containerSource();
    const verified = await verifySourceMappings(containerMappings(), source);
    expect(verified.mappings.filter(({ parts }) => parts[0].alternatives[0].subresource !== null).every(({ resolution }) => resolution === 'declared')).toBe(true);
    await expect(runGraphicsStep(source, containerMappings(), containerDeclarations({ elements: [IDS.front0] }), LIMITS))
      .rejects.toMatchObject({ name: 'SourceError', code: 'geometry-mismatch', location: 'graphics[layout/front].elements' });
  });

  it('reports a declared element the group lacks as the layout count mismatch', async () => {
    const { source } = await containerSource();
    const extra = 'image/front/element-2';
    const table = containerMappings();
    table.mappings.splice(3, 0, graphicsMapping(extra, 'CCKD', cockpit, 'groups/0/elements/2'));
    const set = [...containerDeclarations({ elements: [IDS.front0, IDS.front1, extra] }), imageDeclaration(extra, IDS.flight, { role: 'cockpit-element' })];
    await expect(runGraphicsStep(source, table, set, LIMITS))
      .rejects.toMatchObject({ name: 'SourceError', code: 'geometry-mismatch', location: 'graphics[layout/front].elements' });
  });

  describe('with a TABL image list', () => {
    const GAUGE = rawImageBlock(2, 3, [1, 2, 3, 4, 5, 6]);
    const TABLE = tableBlock([OVERLAY, rawImageBlock(1, 2, [3, 4]), GAUGE]);
    const gaugeId = 'image/hud/gauge-bar-1/2';
    const tableSource = () => verifiedSource(graphicsArchive({ cockpit: COCKPIT, mfd: MFD, table: TABLE }));
    const tableMappings = (subresource: string | null = 'records/2') => {
      const mapped = containerMappings();
      mapped.mappings.splice(3, 0, graphicsMapping(gaugeId, 'TABL', table, subresource));
      return mapped;
    };
    const tableDeclarations = () => [...containerDeclarations(), imageDeclaration(gaugeId, IDS.flight)];

    it('converts a list record among CCKD and MFDD sources, reading each entry once', async () => {
      const { source, reads } = await tableSource();
      const [step] = (await runGraphicsStep(source, tableMappings(), tableDeclarations(), LIMITS)).groups;
      expect(Object.fromEntries(reads)).toEqual({ [data]: 1, [cockpit]: 1, [mfd]: 1, [table]: 1 });
      expect(step.sources.find(({ id }) => id === gaugeId)?.state).toBe('verified');
      const whole = convertGraphics([paletteDeclaration(IDS.flight), imageDeclaration(gaugeId, IDS.flight)], new Map<string, GraphicsSource>([
        [IDS.flight, { type: 'data-palette', block: dataPaletteBlock() }], [gaugeId, { type: 'image-record', block: GAUGE }],
      ]), LIMITS);
      expect(step.payloads.find(({ id }) => id === gaugeId)!.bytes).toEqual(whole.assets.find(({ descriptor }) => descriptor.id === gaugeId)!.payload.bytes);
    });

    it.each<[string, string | null, string, string]>([
      ['a whole TABL entry', null, 'invalid-declaration', 'graphics[image/hud/gauge-bar-1/2].record'],
      ['a record index with a leading zero', 'records/02', 'invalid-declaration', 'graphics[image/hud/gauge-bar-1/2].record'],
      ['a record past the list', 'records/3', 'subresource-not-found', 'graphics[image/hud/gauge-bar-1/2].record'],
    ])('rejects %s', async (_, subresource, code, location) => {
      const { source } = await tableSource();
      await expect(runGraphicsStep(source, tableMappings(subresource), tableDeclarations(), LIMITS)).rejects.toMatchObject({ name: 'SourceError', code, location });
    });

    it('reports the embedded palette of a list record as a missing subresource', async () => {
      const { source } = await tableSource();
      const mapped = withContainerMapping(IDS.mfdPalette, 'TABL', table, 'records/0/palette');
      await expect(runGraphicsStep(source, mapped, containerDeclarations(), LIMITS))
        .rejects.toMatchObject({ name: 'SourceError', code: 'subresource-not-found', location: 'graphics[palette/mfd].palette' });
    });
  });

  it.each<[string, () => unknown, string, string]>([
    ['a layout from a font subresource', () => withContainerMapping(IDS.front, 'CCKD', cockpit, 'fonts/0'), 'invalid-declaration', 'graphics[layout/front].groups'],
    ['a layout from an element', () => withContainerMapping(IDS.front, 'CCKD', cockpit, 'groups/0/elements/0'), 'invalid-declaration', 'graphics[layout/front].groups'],
    ['a layout from an MFDD entry', () => withContainerMapping(IDS.front, 'MFDD', mfd, 'groups/0'), 'invalid-declaration', 'graphics[layout/front].groups'],
    ['an element image mapped to another slot', () => withContainerMapping(IDS.front1, 'CCKD', cockpit, 'groups/2/elements/0'), 'invalid-declaration', 'graphics[layout/front].elements[1]'],
    ['an element image mapped to another element', () => withContainerMapping(IDS.front0, 'CCKD', cockpit, 'groups/0/elements/1'), 'invalid-declaration', 'graphics[layout/front].elements[0]'],
    ['an element image mapped to an MFDD record', () => withContainerMapping(IDS.front0, 'MFDD', mfd, 'lists/1/records/0'), 'invalid-declaration', 'graphics[layout/front].elements[0]'],
    ['an element index with a leading zero', () => withContainerMapping(IDS.front0, 'CCKD', cockpit, 'groups/0/elements/00'), 'invalid-declaration', 'graphics[image/front/element-0].record'],
    ['an image from an embedded palette path', () => withContainerMapping(IDS.overlay, 'MFDD', mfd, 'lists/1/records/0/palette'), 'invalid-declaration', 'graphics[image/mfd/overlay-0].record'],
    ['an image from a group', () => withContainerMapping(IDS.overlay, 'CCKD', cockpit, 'groups/0'), 'invalid-declaration', 'graphics[image/mfd/overlay-0].record'],
    ['a palette from a record without the palette path', () => withContainerMapping(IDS.mfdPalette, 'MFDD', mfd, 'lists/0/records/0'), 'invalid-declaration', 'graphics[palette/mfd].palette'],
    ['MFDD list 2', () => withContainerMapping(IDS.overlay, 'MFDD', mfd, 'lists/2/records/0'), 'subresource-not-found', 'graphics[image/mfd/overlay-0].record'],
    ['an element palette that does not exist', () => withContainerMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/0/elements/0/palette'), 'subresource-not-found', 'graphics[palette/map].palette'],
    ['an 11-digit element index', () => withContainerMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/2/elements/12345678901/palette'), 'subresource-not-found', 'graphics[palette/map].elements'],
  ])('rejects %s', async (_, table, code, location) => {
    const { source } = await containerSource();
    await expect(runGraphicsStep(source, table(), containerDeclarations(), LIMITS)).rejects.toMatchObject({ name: 'SourceError', code, location });
    expect(inGraphicsLocationGrammar(location)).toBe(true);
  });
});
