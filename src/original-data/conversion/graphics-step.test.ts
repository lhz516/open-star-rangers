import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { validateGroup } from '../../content/completeness.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { encodeImagePayload, imagePayloadLength, readImagePayload } from '../../content/graphics/image-payload.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { readStatusMessagesPayload, STATUS_MESSAGES_SCHEMA_VERSION } from '../../content/hud/status-messages-payload.ts';
import { decodeViewLabelsPayload, encodeViewLabelsPayload, VIEW_LABELS_SCHEMA_VERSION } from '../../content/hud/view-labels-payload.ts';
import { readAssetId } from '../../content/asset-id.ts';
import { animFrame, expectedFrame, patternFrame, solidFrame, syntheticAnimation, type SyntheticAnimFrame } from '../formats/anim.test-support.ts';
import { buildImfat, syntheticDiag, syntheticLeExecutable, syntheticSnip, type SyntheticDiagFields, type SyntheticEntry } from '../synthetic.test-support.ts';
import { P2_ROLES_SLICE, SYNTHETIC_ASSETS, syntheticGroup, syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import type { VerifiedSource } from '../source/identify-source.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import {
  animEntry, blockEntry, cockpitBlock, cockpitLayoutBlock, countedVerifiedSource, dataPaletteBlock, fontDeclaration, fontTable, GRAPHICS_ARCHIVE, GRAPHICS_ENTRIES,
  graphicsArchive, graphicsMapping, imageDeclaration, inGraphicsLocationGrammar, layoutDeclaration, mfdBlock, paletteDeclaration, rawImageBlock, spriteImageBlock,
  tableBlock, textureBlock, viewLabelBlock, viewLabelTable,
} from './conversion.test-support.ts';
import { convertGraphics, type GraphicsSource } from './convert-graphics.ts';
import { runGraphicsStep, stepGroupDraft } from './graphics-step.ts';
import { stepEntryReader } from './step-entry-reader.ts';

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
    // The P3-03 roles of the group are not part of this container set.
    expect(validateGroup(P2_ROLES_SLICE, input)).toMatchObject({ status: 'group-complete', group: 'cockpit-hud-map' });
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

  describe('with a CCKD group palette', () => {
    const GROUP_PALETTE = dataPaletteBlock(index => (index * 3) % 64);
    const PALETTED_COCKPIT = cockpitLayoutBlock([
      [{ record: FRONT_RAW, x: 0, y: 6 }, { record: FRONT_SPRITE, x: 3, y: 0 }],
      [],
      [{ record: MAP_RECORD, x: 1, y: 1, flags: [1, 0] }],
    ], undefined, [null, null, GROUP_PALETTE]);
    const palettedSource = () => verifiedSource(graphicsArchive({ cockpit: PALETTED_COCKPIT, mfd: MFD }));

    it('converts groups/<s>/palette as the same bytes as a DATA entry, with one read of the shared CCKD entry', async () => {
      const { source, reads } = await palettedSource();
      const mapped = withContainerMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/2/palette');
      const [step] = (await runGraphicsStep(source, mapped, containerDeclarations(), LIMITS)).groups;
      expect(Object.fromEntries(reads)).toEqual({ [data]: 1, [cockpit]: 1, [mfd]: 1 });
      expect(step.sources.find(({ id }) => id === IDS.mapPalette)?.state).toBe('verified');
      const whole = convertGraphics([paletteDeclaration(IDS.mapPalette)], new Map<string, GraphicsSource>([
        [IDS.mapPalette, { type: 'data-palette', block: GROUP_PALETTE }],
      ]), LIMITS);
      expect(step.payloads.find(({ id }) => id === IDS.mapPalette)!.bytes).toEqual(whole.assets[0].payload.bytes);
    });

    it.each<[string, () => unknown, string, string]>([
      ['an image from a group palette', () => withContainerMapping(IDS.overlay, 'CCKD', cockpit, 'groups/2/palette'), 'invalid-declaration', 'graphics[image/mfd/overlay-0].record'],
      ['a group palette path with a leading zero', () => withContainerMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/02/palette'), 'invalid-declaration', 'graphics[palette/map].palette'],
      ['a group palette path on an MFDD entry', () => withContainerMapping(IDS.mapPalette, 'MFDD', mfd, 'groups/2/palette'), 'invalid-declaration', 'graphics[palette/map].palette'],
      ['a slot without a palette', () => withContainerMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/0/palette'), 'subresource-not-found', 'graphics[palette/map].palette'],
      ['a slot past the directory', () => withContainerMapping(IDS.mapPalette, 'CCKD', cockpit, 'groups/3/palette'), 'subresource-not-found', 'graphics[palette/map].groups'],
    ])('rejects %s', async (_, table, code, location) => {
      const { source } = await palettedSource();
      await expect(runGraphicsStep(source, table(), containerDeclarations(), LIMITS)).rejects.toMatchObject({ name: 'SourceError', code, location });
      expect(inGraphicsLocationGrammar(location)).toBe(true);
    });
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

// P2-07 2026-10-08 revision: SNIP frames through the executable's colour table, and DIAG messages with the
// executable's lower-line format (hud, SNIP 10487 and DIAG 10489). Everything here is generated in code.
describe('graphics step SNIP frames and DIAG messages', () => {
  const EXE = 'MAIN/SRANGERS.EXE';
  const SNIP_ENTRY = 10_013;
  const DIAG_ENTRY = 10_015;
  const COLOURS = [9, 200, 0, 31];
  const FORMAT = [0x5b, 0x25, 0x73, 0x2f, 0x25, 0x73, 0x5d, 0];
  const IDS = { flight: 'palette/flight/cockpit-hud-map', frame: 'image/hud/noise/frame-1', messages: 'data/hud/messages' } as const;
  const frame = (index: number) => Array.from({ length: 16 }, (_, pixel) => (pixel + index * 3 + (pixel >> 2)) % 4);
  const SNIP = syntheticSnip({ width: 8, height: 2, frames: [frame(0), frame(1), frame(2)] });
  const DIAG_FIELDS: SyntheticDiagFields = {
    timings: [2, 30, 4, 50],
    statusFormats: ['a %d', 'b\n%u', 'c %s', 'd'],
    ratings: [['q', 9], ['r', 6], ['s', 3], ['t', 1], ['u', 0]],
    subsystemNames: Array.from({ length: 15 }, (_, index) => `n${index}`),
    stateWords: ['x', 'y', 'z'],
    startupMessages: ['boot one'],
  };
  const DIAG = syntheticDiag(DIAG_FIELDS);
  // Object 1 holds the colour table at 0x10 and the format at 0x20; the rest is a generated pattern.
  const executable = () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, index) => (index * 7 + 1) & 0xff);
    bytes.set(COLOURS, 0x10);
    bytes.set(FORMAT, 0x20);
    return syntheticLeExecutable({ objects: [{ bytes }] });
  };
  const region = (subresource: string) => ({ alternatives: [{ discPath: EXE, entry: null, subresource }] });
  const withRegion = (mapped: Record<string, unknown>, subresource: string | null) =>
    (subresource === null ? mapped : { ...mapped, parts: [...(mapped.parts as unknown[]), region(subresource)] });
  interface TableChanges { frameSub?: string | null; colours?: string | null; diagSub?: string | null; format?: string | null }
  const tableOf = ({ frameSub = 'frames/1', colours = 'le/1/0x10/4', diagSub = null, format = 'le/1/0x20/8' }: TableChanges = {}) => ({
    sourceFingerprint: null,
    mappings: [
      withRegion(graphicsMapping(IDS.messages, 'DIAG', DIAG_ENTRY, diagSub), format),
      withRegion(graphicsMapping(IDS.frame, 'SNIP', SNIP_ENTRY, frameSub), colours),
      graphicsMapping(IDS.flight, 'DATA', data),
    ],
  });
  const declared = (frameChanges: Record<string, unknown> = {}, messagesChanges: Record<string, unknown> = {}) => [
    paletteDeclaration(IDS.flight),
    imageDeclaration(IDS.frame, IDS.flight, { role: 'hud-mfd', ...frameChanges }),
    { asset: { id: IDS.messages, kind: 'data' }, role: 'status-messages', group: 'cockpit-hud-map', ...messagesChanges },
  ];
  const sourceOf = async (exe: Uint8Array = executable(), snip = SNIP) => {
    const archive = buildImfat(10_000, [
      { id: data, type: 'DATA', data: dataPaletteBlock() },
      { id: SNIP_ENTRY, type: 'SNIP', ...snip },
      { id: DIAG_ENTRY, type: 'DIAG', ...DIAG },
    ]);
    const { source, reads } = await countedVerifiedSource({ [GRAPHICS_ARCHIVE]: archive, [EXE]: exe });
    const opened: string[] = [];
    return { source: { ...source, openFile: (path: string) => { opened.push(path); return source.openFile(path); } } as VerifiedSource, reads, opened };
  };

  it('converts a frame through the colour table and the messages with the format, reading each entry and the executable once', async () => {
    const { source, reads, opened } = await sourceOf();
    const [step] = (await runGraphicsStep(source, tableOf(), declared(), LIMITS)).groups;
    expect(Object.fromEntries(reads)).toEqual({ [data]: 1, [SNIP_ENTRY]: 1, [DIAG_ENTRY]: 1 });
    expect(opened).toEqual([EXE]);
    const payload = (id: string) => step.payloads.find(payload => payload.id === id)!;
    expect(payload(IDS.frame).bytes).toEqual(encodeImagePayload({
      width: 8, height: 2, palette: readAssetId(IDS.flight), display: 'direct', indices: Uint8Array.from(frame(1), value => COLOURS[value]), mask: null,
    }));
    expect(readStatusMessagesPayload(payload(IDS.messages).bytes, payload(IDS.messages).schemaVersion)).toEqual({
      upper: { characterTicks: 2, holdTicks: 30 }, lower: { characterTicks: 4, holdTicks: 50 },
      statusFormats: DIAG_FIELDS.statusFormats, ratings: DIAG_FIELDS.ratings.map(([text, maximum]) => ({ text, maximum })),
      subsystemNames: DIAG_FIELDS.subsystemNames, stateWords: DIAG_FIELDS.stateWords, subsystemFormat: '[%s/%s]', startupMessages: ['boot one'],
    });
    const descriptor = step.descriptors.find(({ id }) => id === IDS.messages)!;
    expect({ kind: descriptor.kind, dependencies: descriptor.dependencies, schema: descriptor.payloadIdentity.schemaVersion })
      .toEqual({ kind: 'data', dependencies: [], schema: STATUS_MESSAGES_SCHEMA_VERSION });
    expect(step.sources.map(({ state }) => state)).toEqual(['verified', 'verified', 'verified']);
  });

  it('leaves the region mappings declared until the conversion succeeds', async () => {
    const { source } = await sourceOf();
    const bound = await verifySourceMappings(tableOf(), source, stepEntryReader(source));
    expect(bound.mappings.map(({ resolution }) => resolution)).toEqual(['declared', 'declared', 'verified']);
  });

  it.each<[string, () => { table?: unknown; declarations?: unknown; exe?: Uint8Array; snip?: typeof SNIP }, string, string]>([
    ['a frame without its colour table', () => ({ table: tableOf({ colours: null }) }), 'invalid-declaration', 'graphics[image/hud/noise/frame-1].colours'],
    ['a colour table of 3 bytes', () => ({ table: tableOf({ colours: 'le/1/0x10/3' }) }), 'invalid-declaration', 'graphics[image/hud/noise/frame-1].colours'],
    ['messages without their format', () => ({ table: tableOf({ format: null }) }), 'invalid-declaration', 'graphics[data/hud/messages].format'],
    ['a format region of 257 bytes', () => ({ table: tableOf({ format: 'le/1/0x20/257' }) }), 'invalid-declaration', 'graphics[data/hud/messages].format'],
    ['a frame index with a leading zero', () => ({ table: tableOf({ frameSub: 'frames/01' }) }), 'invalid-declaration', 'graphics[image/hud/noise/frame-1].record'],
    ['a whole SNIP entry', () => ({ table: tableOf({ frameSub: null }) }), 'invalid-declaration', 'graphics[image/hud/noise/frame-1].record'],
    ['a frame past the SNIP', () => ({ table: tableOf({ frameSub: 'frames/3' }) }), 'subresource-not-found', 'graphics[image/hud/noise/frame-1].frames'],
    ['messages from a DIAG subresource', () => ({ table: tableOf({ diagSub: 'texts/0' }) }), 'invalid-declaration', 'graphics[data/hud/messages].messages'],
    ['messages from a DATA entry', () => ({ table: { ...tableOf(), mappings: [withRegion(graphicsMapping(IDS.messages, 'DATA', data), 'le/1/0x20/8'), ...tableOf().mappings.slice(1)] } }),
      'invalid-declaration', 'graphics[data/hud/messages].messages'],
    ['a colour key on a frame', () => ({ declarations: declared({ alpha: { colourKey: 0 } }) }), 'invalid-declaration', 'graphics[image/hud/noise/frame-1].alpha'],
    ['messages of another role', () => ({ declarations: declared({}, { role: 'hud-mfd' }) }), 'invalid-declaration', 'graphics.declarations[2].role'],
    ['messages in a group that does not own data', () => ({ declarations: declared({}, { group: 'audio' }) }), 'invalid-declaration', 'graphics.declarations[2].group'],
    ['a colour table outside its object', () => ({ table: tableOf({ colours: 'le/1/0x3e/4' }) }), 'invalid-payload', 'graphics[image/hud/noise/frame-1].colours'],
    ['a format without its NUL', () => ({ table: tableOf({ format: 'le/1/0x20/7' }) }), 'invalid-payload', 'graphics[data/hud/messages].format'],
    ['a SNIP without its relocation', () => ({ snip: { ...SNIP, relocations: [] } }), 'invalid-payload', 'graphics[image/hud/noise/frame-1].frames'],
  ])('rejects %s', async (_, changes, code, location) => {
    const { table, declarations: declared_ = declared(), exe, snip } = changes();
    const { source } = await sourceOf(exe, snip);
    await expect(runGraphicsStep(source, table ?? tableOf(), declared_, LIMITS)).rejects.toMatchObject({ name: 'SourceError', code, location });
    expect(inGraphicsLocationGrammar(location)).toBe(true);
  });

  it('charges a frame before decoding it and the messages before copying any text', async () => {
    const { source } = await sourceOf();
    const pixels = { ...LIMITS, imagePixels: 15 };
    await expect(runGraphicsStep(source, tableOf(), declared(), pixels))
      .rejects.toMatchObject({ code: 'budget-exceeded', location: 'graphics[image/hud/noise/frame-1].pixels', limit: { name: 'imagePixels', limit: 15, observed: 16 } });
    const bytes = { ...LIMITS, payloadBytes: 900 };
    await expect(runGraphicsStep(source, tableOf(), declared(), bytes))
      .rejects.toMatchObject({ code: 'budget-exceeded', location: 'graphics[data/hud/messages].messages' });
  });
});

// P3-03 (spec S-08, S-10; field rule 9): ANIM explosion frames decoded by the ANIM reader (textures §6) and the TABL
// view label of sub-mode 8 (hud, TABL 10399). Everything here is generated in code.
describe('graphics step ANIM frames and view labels', () => {
  const ANIM_ENTRY = 10_017;
  const LABELS_ENTRY = 10_019;
  // Frames of different sizes: transparent and opaque runs, a fully transparent frame and an opaque index 0.
  const FRAMES = [patternFrame(13, 9, 3), solidFrame(4, 2, null), solidFrame(5, 3, 0), patternFrame(9, 4, 77)];
  // Made-up label bytes, including 1, 0x7F and bytes 128–255.
  const LABEL = String.fromCharCode(1, 0x51, 0x7f, 0x80, 0xc9, 0xff, 0x20, 0x33);
  const IDS = { models: 'palette/flight/models', hud: 'palette/flight/cockpit-hud-map', labels: 'data/hud/view-labels' } as const;
  const frameId = (index: number) => `image/explosion/01/${String(index + 1).padStart(2, '0')}`;
  const FRAME_IDS = FRAMES.map((_, index) => frameId(index));

  const archiveOf = ({ anim = animEntry(ANIM_ENTRY, FRAMES), labels = blockEntry(LABELS_ENTRY, 'TABL', viewLabelTable(LABEL)) }: { anim?: SyntheticEntry; labels?: SyntheticEntry } = {}) =>
    buildImfat(10_000, [{ id: data, type: 'DATA', data: dataPaletteBlock() }, anim, labels]);
  const sourceOf = (entries: Parameters<typeof archiveOf>[0] = {}) => verifiedSource(archiveOf(entries));

  interface TableChanges { frames?: (string | null)[]; labels?: string | null; labelsType?: string }
  // In ascending Asset ID order, as the mapping table requires.
  const tableOf = ({ frames = FRAMES.map((_, index) => `frames/${index}`), labels = 'labels/8', labelsType = 'TABL' }: TableChanges = {}) => ({
    sourceFingerprint: null,
    mappings: [
      graphicsMapping(IDS.labels, labelsType, labelsType === 'TABL' ? LABELS_ENTRY : ANIM_ENTRY, labels),
      ...frames.map((subresource, index) => graphicsMapping(frameId(index), 'ANIM', ANIM_ENTRY, subresource)),
      graphicsMapping(IDS.hud, 'DATA', data),
      graphicsMapping(IDS.models, 'DATA', data),
    ],
  });
  const declared = (frameChanges: Record<string, unknown> = {}, labelChanges: Record<string, unknown> = {}) => [
    paletteDeclaration(IDS.models, 'models'),
    paletteDeclaration(IDS.hud),
    ...FRAME_IDS.map(id => imageDeclaration(id, IDS.models, { role: 'explosion-frame', group: 'models', ...frameChanges })),
    { asset: { id: IDS.labels, kind: 'data' }, role: 'view-labels', group: 'cockpit-hud-map', ...labelChanges },
  ];

  /** The conversion usage of `tableOf()` and `declared()`, computed from the frames, palettes and label alone. */
  const EXPECTED_USAGE = {
    ...EMPTY_BUDGET_USAGE,
    assets: 2 + FRAMES.length + 1,
    dependencyEdges: FRAMES.length,
    paletteEntries: 2 * 256,
    imagePixels: FRAMES.reduce((total, { width, height }) => total + width * height, 0),
    payloadBytes: 2 * palettePayloadLength(256)
      + FRAMES.reduce((total, { width, height }) => total + imagePayloadLength({ width, height, palette: readAssetId(IDS.models), display: 'direct' }, true), 0)
      + encodeViewLabelsPayload({ labels: [{ subMode: 8, text: LABEL }] }).length,
  };

  it('converts every ANIM frame pixel for pixel and the view label, reading each entry once', async () => {
    const { source, reads } = await sourceOf();
    const result = await runGraphicsStep(source, tableOf(), declared(), LIMITS);
    expect(Object.fromEntries(reads)).toEqual({ [data]: 1, [ANIM_ENTRY]: 1, [LABELS_ENTRY]: 1 });
    const [models, hud] = result.groups;
    expect(models.descriptors.map(({ id }) => id)).toEqual([...FRAME_IDS, IDS.models]);
    expect(hud.descriptors.map(({ id }) => id)).toEqual([IDS.labels, IDS.hud]);
    expect(result.groups.flatMap(({ sources }) => sources.map(({ state }) => state))).toEqual(new Array(FRAMES.length + 3).fill('verified'));
    FRAMES.forEach((frame, index) => {
      const { schemaVersion, bytes } = models.payloads[index];
      const image = readImagePayload(bytes, schemaVersion);
      const expected = expectedFrame(frame);
      expect({ ...image, indices: [...image.indices], mask: image.mask && [...image.mask] }).toEqual({
        kind: 'image', width: expected.width, height: expected.height, palette: IDS.models, display: 'direct', indices: expected.indices, mask: expected.mask,
      });
      expect(models.descriptors[index]).toMatchObject({ role: 'explosion-frame', dependencies: [{ id: IDS.models, kind: 'palette' }] });
    });
    const [labelsDescriptor] = hud.descriptors;
    expect(labelsDescriptor).toMatchObject({ kind: 'data', role: 'view-labels', dependencies: [], payloadIdentity: { schemaVersion: VIEW_LABELS_SCHEMA_VERSION } });
    expect(decodeViewLabelsPayload(hud.payloads[0].bytes, labelsDescriptor)).toEqual({ labels: [{ subMode: 8, text: LABEL }] });
    expect(result.usage).toEqual(EXPECTED_USAGE);
    const shape = JSON.stringify(result, (key, value: unknown) => (value instanceof Uint8Array ? `${value.length} bytes` : key === 'fingerprint' ? 'sha256' : value));
    expect(shape).not.toMatch(/SR\.NOB|MAIN|100(01|17|19)|ANIM|TABL|frames\/|labels\/|discPath|subresource|entry/);
  });

  it('leaves the frame and label mappings declared until the conversion succeeds and returns nothing when one fails', async () => {
    const { source } = await sourceOf();
    const bound = await verifySourceMappings(tableOf(), source, stepEntryReader(source));
    expect(bound.mappings.map(({ resolution }) => resolution)).toEqual([...new Array(FRAMES.length + 1).fill('declared'), 'verified', 'verified']);
    const short = await sourceOf({ anim: animEntry(ANIM_ENTRY, FRAMES.slice(0, -1)) });
    await expect(runGraphicsStep(short.source, tableOf(), declared(), LIMITS))
      .rejects.toMatchObject({ name: 'SourceError', code: 'subresource-not-found', location: `archive:/${GRAPHICS_ARCHIVE}#${ANIM_ENTRY}/frames` });
  });

  /** An ANIM of `FRAMES` whose frame 1 is replaced by `frame`. */
  const animWith = (frame: SyntheticAnimFrame): SyntheticEntry =>
    blockEntry(ANIM_ENTRY, 'ANIM', syntheticAnimation(FRAMES.map((item, index) => (index === 1 ? frame : animFrame(item)))));
  const truncated = { ...animFrame(FRAMES[1]), data: animFrame(FRAMES[0]).data.subarray(0, 10) };

  it.each<[string, () => { table?: unknown; declarations?: unknown; anim?: SyntheticEntry; labels?: SyntheticEntry }, string, string]>([
    ['a frame index with a leading zero', () => ({ table: tableOf({ frames: ['frames/0', 'frames/01', 'frames/2', 'frames/3'] }) }), 'invalid-declaration', `graphics[${frameId(1)}].record`],
    ['a whole ANIM entry as an image', () => ({ table: tableOf({ frames: ['frames/0', null, 'frames/2', 'frames/3'] }) }), 'invalid-declaration', `graphics[${frameId(1)}].record`],
    ['a frame palette subresource', () => ({ table: tableOf({ frames: ['frames/0', 'frames/1/palette', 'frames/2', 'frames/3'] }) }), 'invalid-declaration', `graphics[${frameId(1)}].record`],
    ['an index past the frames', () => ({ table: tableOf({ frames: ['frames/0', 'frames/12345678901', 'frames/2', 'frames/3'] }) }), 'subresource-not-found', `archive:/${GRAPHICS_ARCHIVE}#${ANIM_ENTRY}/frames`],
    ['a colour key on a frame', () => ({ declarations: declared({ alpha: { colourKey: 0 } }) }), 'invalid-declaration', `graphics[${frameId(0)}].alpha`],
    ['labels of another sub-mode', () => ({ table: tableOf({ labels: 'labels/7' }) }), 'invalid-declaration', `graphics[${IDS.labels}].messages`],
    ['a label index with a leading zero', () => ({ table: tableOf({ labels: 'labels/08' }) }), 'invalid-declaration', `graphics[${IDS.labels}].messages`],
    ['labels from a whole TABL entry', () => ({ table: tableOf({ labels: null }) }), 'invalid-declaration', `graphics[${IDS.labels}].messages`],
    ['labels from an ANIM entry', () => ({ table: tableOf({ labelsType: 'ANIM' }) }), 'invalid-declaration', `graphics[${IDS.labels}].messages`],
    ['status messages from the view label', () => ({ declarations: declared({}, { role: 'status-messages' }) }), 'invalid-declaration', `graphics[${IDS.labels}].messages`],
    ['a data Asset of another role', () => ({ declarations: declared({}, { role: 'view-label' }) }), 'invalid-declaration', `graphics.declarations[${FRAMES.length + 2}].role`],
    ['a truncated frame', () => ({ anim: animWith(truncated) }), 'invalid-payload', `archive:/${GRAPHICS_ARCHIVE}#${ANIM_ENTRY}/frames[1]/pixels`],
    ['a frame of encoding 2', () => ({ anim: animWith({ ...animFrame(FRAMES[1]), encoding: 2 }) }), 'unsupported-encoding', `archive:/${GRAPHICS_ARCHIVE}#${ANIM_ENTRY}/frames[1]/record`],
    ['an unregistered label pointer', () => ({ labels: { ...blockEntry(LABELS_ENTRY, 'TABL', viewLabelTable(LABEL)), relocations: [0, 4] } }), 'invalid-payload', `archive:/${GRAPHICS_ARCHIVE}#${LABELS_ENTRY}/labels[8]`],
  ])('rejects %s', async (_, changes, code, location) => {
    const { table, declarations: set = declared(), anim, labels } = changes();
    const { source } = await sourceOf({ anim, labels });
    await expect(runGraphicsStep(source, table ?? tableOf(), set, LIMITS)).rejects.toMatchObject({ name: 'SourceError', code, location });
    if (location.startsWith('graphics')) expect(inGraphicsLocationGrammar(location)).toBe(true);
  });

  it.each([
    ['ANIM', () => ({ anim: blockEntry(ANIM_ENTRY, 'ANIM', { bytes: new Uint8Array(131_073), relocations: [] }) }), ANIM_ENTRY, 131_072],
    ['view label TABL', () => ({ labels: blockEntry(LABELS_ENTRY, 'TABL', { bytes: new Uint8Array(513), relocations: [] }) }), LABELS_ENTRY, 512],
  ])('rejects an %s entry over its limit by its directory size before reading it', async (_, entries, entry, limit) => {
    const { source, reads } = await sourceOf(entries());
    await expect(runGraphicsStep(source, tableOf(), declared(), LIMITS)).rejects.toMatchObject({
      name: 'SourceError', code: 'limit-exceeded', limit: { name: 'payloadEntryBytes', limit, observed: limit + 1 },
    });
    expect(reads.has(entry)).toBe(false);
  });

  it.each([
    ['ANIM', () => ({ anim: blockEntry(ANIM_ENTRY, 'ANIM', { bytes: new Uint8Array(131_072), relocations: [] }) }), ANIM_ENTRY, '/frames'],
    ['view label TABL', () => ({ labels: blockEntry(LABELS_ENTRY, 'TABL', { bytes: new Uint8Array(512), relocations: [] }) }), LABELS_ENTRY, '/labels[8]'],
  ])('reads an %s entry exactly at its limit and leaves its structure to the reader', async (_, entries, entry, path) => {
    const { source, reads } = await sourceOf(entries());
    await expect(runGraphicsStep(source, tableOf(), declared(), LIMITS))
      .rejects.toMatchObject({ name: 'SourceError', code: 'invalid-payload', location: `archive:/${GRAPHICS_ARCHIVE}#${entry}${path}` });
    expect(reads.get(entry)).toBe(1);
  });

  it('applies the label limit only to TABL entries mapped as view labels', async () => {
    const wide = rawImageBlock(23, 23, Array.from({ length: 23 * 23 }, (_, index) => index % 251));
    const listEntry = 10_021;
    const archive = buildImfat(10_000, [
      { id: data, type: 'DATA', data: dataPaletteBlock() }, animEntry(ANIM_ENTRY, FRAMES), blockEntry(LABELS_ENTRY, 'TABL', viewLabelTable(LABEL)),
      { id: listEntry, type: 'TABL', data: tableBlock([wide]) },
    ]);
    const { source } = await verifiedSource(archive);
    const table = tableOf();
    table.mappings.splice(table.mappings.length - 2, 0, graphicsMapping('image/hud/wide', 'TABL', listEntry, 'records/0'));
    const result = await runGraphicsStep(source, table, [...declared(), imageDeclaration('image/hud/wide', IDS.hud)], LIMITS);
    expect(tableBlock([wide]).length).toBeGreaterThan(512);
    expect(result.groups[1].descriptors.map(({ id }) => id)).toContain('image/hud/wide');
  });

  it('passes a budget equal to the usage and charges each frame before decoding it and the label before its payload', async () => {
    const { source } = await sourceOf();
    expect((await runGraphicsStep(source, tableOf(), declared(), EXPECTED_USAGE)).usage).toEqual(EXPECTED_USAGE);
    for (const dimension of ['assets', 'dependencyEdges', 'paletteEntries', 'imagePixels', 'payloadBytes'] as const) {
      const limits = { ...EXPECTED_USAGE, [dimension]: EXPECTED_USAGE[dimension] - 1 };
      await expect(runGraphicsStep(source, tableOf(), declared(), limits)).rejects.toMatchObject({
        code: 'budget-exceeded', limit: { name: dimension, limit: EXPECTED_USAGE[dimension] - 1, observed: EXPECTED_USAGE[dimension] },
      });
    }
    // The truncated frame is charged first: its pixels exceed the budget before its data is decoded.
    const broken = await sourceOf({ anim: animWith(truncated) });
    const before = FRAMES[0].width * FRAMES[0].height;
    await expect(runGraphicsStep(broken.source, tableOf(), declared(), { ...LIMITS, imagePixels: before + FRAMES[1].width * FRAMES[1].height - 1 })).rejects.toMatchObject({
      code: 'budget-exceeded', location: `graphics[${frameId(1)}].pixels`, limit: { name: 'imagePixels', observed: before + FRAMES[1].width * FRAMES[1].height },
    });
    const labelBytes = encodeViewLabelsPayload({ labels: [{ subMode: 8, text: LABEL }] }).length;
    await expect(runGraphicsStep(source, tableOf(), declared(), { ...EXPECTED_USAGE, payloadBytes: EXPECTED_USAGE.payloadBytes - labelBytes })).rejects.toMatchObject({
      code: 'budget-exceeded', location: `graphics[${IDS.labels}].messages`,
    });
  });

  it('keeps the label bytes and a different label as stored, and ignores the other labels', async () => {
    const other = String.fromCharCode(0x80, 0x7e, 2);
    const labels = blockEntry(LABELS_ENTRY, 'TABL', viewLabelBlock(Array.from({ length: 13 }, (_, index) => (index === 8 ? other : index > 8 ? 'x'.repeat(40) : ''))));
    const { source } = await sourceOf({ labels });
    const [, hud] = (await runGraphicsStep(source, tableOf(), declared(), LIMITS)).groups;
    expect(decodeViewLabelsPayload(hud.payloads[0].bytes, hud.descriptors[0])).toEqual({ labels: [{ subMode: 8, text: other }] });
  });
});
