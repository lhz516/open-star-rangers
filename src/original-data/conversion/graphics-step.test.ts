import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { validateGroup } from '../../content/completeness.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { SYNTHETIC_ASSETS, syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import { openDiscImage } from '../disc/disc-image.ts';
import { syntheticFileDisc } from '../disc/disc.test-support.ts';
import { identifySource, type VerifiedSource } from '../source/identify-source.ts';
import { catalogFor } from '../source/source.test-support.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import {
  cockpitBlock, fontDeclaration, fontTable, GRAPHICS_ARCHIVE, GRAPHICS_ENTRIES, graphicsArchive, graphicsMapping, imageDeclaration,
  inGraphicsLocationGrammar, paletteDeclaration,
} from './conversion.test-support.ts';
import { runGraphicsStep } from './graphics-step.ts';

const LIMITS = { ...EMPTY_BUDGET_USAGE, assets: 100, dependencyEdges: 100, paletteEntries: 10_000, imagePixels: 10_000, glyphs: 10_000, payloadBytes: 1_000_000 };
const { data, texture, cockpit } = GRAPHICS_ENTRIES;

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

/** A verified source over a synthetic disc holding `archive`, with a count of archive entry reads by entry ID. */
async function verifiedSource(archive = graphicsArchive()): Promise<{ source: VerifiedSource; reads: Map<number, number> }> {
  const files = { [GRAPHICS_ARCHIVE]: archive };
  // Uncovered padding raises the default read budget, which equals the input size, above the reread comparisons.
  const padding = { byteLength: 1 << 20, read: (_: number, length: number) => new Uint8Array(length) };
  const disc = syntheticFileDisc({ ...files, 'DEMO/PAD.DAT': padding });
  const source = await identifySource(await openDiscImage(disc.files), catalogFor(files));
  const reads = new Map<number, number>();
  const counted: VerifiedSource = {
    identity: source.identity,
    openFile: path => source.openFile(path),
    openArchive: async path => {
      const handle = await source.openArchive(path);
      return {
        path: handle.path,
        entries: handle.entries,
        entry: (id, type) => handle.entry(id, type),
        read: (id, type) => {
          reads.set(id, (reads.get(id) ?? 0) + 1);
          return handle.read(id, type);
        },
      };
    },
    usage: () => source.usage(),
  };
  return { source: counted, reads };
}

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
    expect(result.usage).toMatchObject({ assets: 6, dependencyEdges: 2, paletteEntries: 520, imagePixels: 8, glyphs: 512, sourceReadBytes: 0 });
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
      .rejects.toMatchObject({ name: 'SourceError', code: 'budget-exceeded', location: 'graphics[font/hud/8x8-1].glyphs', limit: { name: 'glyphs', limit: 256, observed: 512 } });
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
