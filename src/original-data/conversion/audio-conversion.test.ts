import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { validateGroup } from '../../content/completeness.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { readSoundPayload } from '../../content/sound-payload.ts';
import { P2_ROLES_SLICE, syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { openDiscImage } from '../disc/disc-image.ts';
import { syntheticFileDisc } from '../disc/disc.test-support.ts';
import type { SndFormatRules } from '../formats/snd.ts';
import { SourceError } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { identifySource, type VerifiedSource } from '../source/identify-source.ts';
import { catalogFor } from '../source/source.test-support.ts';
import { buildImfat, syntheticSnd, type SyntheticEntry, type SyntheticSndFields } from '../synthetic.test-support.ts';
import {
  AUDIO_BUDGET_LIMITS, AUDIO_CONVERTER_COMPONENT, convertAudioGroup, readSoundTable, type AudioConversionOptions,
} from './audio-conversion.ts';

// Synthetic flag values with test meanings only; production meanings come from research.
const RULES: SndFormatRules = Object.freeze({
  flags: Object.freeze([Object.freeze({ value: 100, channels: 1, loop: 'none' }), Object.freeze({ value: 101, channels: 2, loop: 'whole' })]),
  s16le: true,
});

const sndEntry = (id: number, fields: Partial<SyntheticSndFields> = {}): SyntheticEntry =>
  ({ id, type: 'SND', ...syntheticSnd({ samples: [id & 0xff, 1, 2, 3], flags: 100, ...fields }) });

const ENTRIES: SyntheticEntry[] = [
  sndEntry(10_001, { samples: [0, 128, 255, 64, 32] }),
  sndEntry(10_002, { bitsPerSample: 16, sampleRate: 22_050 }),
  sndEntry(10_003, { flags: 101, sampleRate: 8_000, samples: [1, 2, 3, 4, 5, 6] }),
  sndEntry(10_004, { sampleRate: 44_100 }),
  sndEntry(10_005, { samples: [9, 9, 9] }),
  sndEntry(10_006, { samples: [9, 9, 9] }),
  sndEntry(10_007, { samples: [9, 9, 8] }),
  { id: 10_008, type: 'SND', data: new Uint8Array(8) },
  sndEntry(10_009, { flags: 104 }),
  sndEntry(10_010, { bitsPerSample: 12 }),
  { id: 10_011, type: 'TABL', data: new Uint8Array(4) },
  // Distinct model clips for the production asset limit.
  ...Array.from({ length: 34 }, (_, index) => sndEntry(10_100 + index)),
];
const FILES = { 'MAIN/SR.NOB': buildImfat(10_000, ENTRIES) };
const CATALOG = catalogFor(FILES);

/** The verified synthetic source, wrapped so every archive block read is recorded by entry ID. */
async function meteredSource(): Promise<{ source: VerifiedSource; blockReads: number[] }> {
  // The unread padding raises the default read budget, which equals the input size, above verification and conversion.
  const padding = { byteLength: 1 << 20, read: (_: number, length: number) => new Uint8Array(length) };
  const verified = await identifySource(await openDiscImage(syntheticFileDisc({ ...FILES, 'DEMO/PAD.DAT': padding }).files), CATALOG);
  const blockReads: number[] = [];
  const source: VerifiedSource = {
    identity: verified.identity,
    openFile: path => verified.openFile(path),
    usage: () => verified.usage(),
    openArchive: async path => {
      const archive = await verified.openArchive(path);
      return {
        path: archive.path,
        entries: archive.entries,
        entry: (id, type) => archive.entry(id, type),
        read: (id, type) => { blockReads.push(id); return archive.read(id, type); },
      };
    },
  };
  return { source, blockReads };
}

type Row = { role: string; mapping: Record<string, unknown> & { asset: { id: string; kind: string }; parts: { alternatives: Record<string, unknown>[] }[] } };

const locator = (id: number, type = 'SND', discPath = 'MAIN/SR.NOB') => ({ discPath, entry: { id, type }, subresource: null as string | null });
function row(role: string, id: string, entries: number[], confidence = 'confirmed'): Row {
  return {
    role,
    mapping: {
      asset: { id, kind: 'sound' },
      parts: [{ alternatives: entries.map(entry => locator(entry)) }],
      confidence,
      unknowns: confidence === 'confirmed' ? [] : ['U-004'],
      evidence: ['docs/original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries'],
      resolution: 'declared',
    },
  };
}

/** Fresh rows for the four core roles and one aliased model clip, in ascending Asset ID order. */
const table = (): Row[] => [
  row('explosion-sound', 'sound/explosion', [10_002]),
  row('fire-sound', 'sound/fire', [10_001]),
  row('missile-sound', 'sound/missile', [10_003]),
  row('model-sound', 'sound/model-clip/01', [10_005, 10_006]),
  row('warp-sound', 'sound/warp', [10_004]),
];
const swap = (rows: Row[], id: string, replacement: Row): Row[] => rows.map(item => (item.mapping.asset.id === id ? replacement : item));

/** The expected preflight bound of `table()`: header-inclusive payload bytes and sample bytes. */
const SAMPLE_BYTES = [4, 5, 6, 3, 4];
const BOUND = { assets: 5, payloadBytes: SAMPLE_BYTES.reduce((sum, bytes) => sum + 16 + bytes, 0), audioSamples: SAMPLE_BYTES.reduce((sum, bytes) => sum + bytes, 0) };

async function convert(rows: unknown = table(), options: AudioConversionOptions = {}) {
  const { source, blockReads } = await meteredSource();
  const draft = await convertAudioGroup(source, rows, RULES, options);
  return { draft, source, blockReads };
}

async function failure(rows: unknown, options: AudioConversionOptions = {}) {
  const { source, blockReads } = await meteredSource();
  try {
    await convertAudioGroup(source, rows, RULES, options);
  } catch (error) {
    if (!(error instanceof SourceError || error instanceof ContentContractError)) throw error;
    const data = 'toData' in error ? error.toData() : { code: error.code, location: error.path, limit: null };
    if (error instanceof SourceError) expect(inLocationGrammar(error.toData()), data.location).toBe(true);
    // Diagnostics carry structural paths only: no archive path, entry ID or sample bytes.
    expect(`${JSON.stringify(data)} ${error.message}`).not.toMatch(/SR\.NOB|1000\d|1001\d/);
    return { error: { layer: error.name, code: data.code, location: data.location, limit: data.limit }, blockReads };
  }
  throw new Error('expected the conversion to fail');
}

// The event and HUD sounds, whose exact counts these core-role tables do not fill, are production-flight-sounds.test.ts's.
const group = (draft: Awaited<ReturnType<typeof convertAudioGroup>>, sourceFingerprint: string) => validateGroup(P2_ROLES_SLICE, {
  manifest: { identity: syntheticIdentity({ origin: { type: 'original-import', sourceFingerprint } }), group: 'audio', assets: draft.assets },
  payloads: draft.payloads,
  sources: draft.sources,
});

describe('audio group conversion', () => {
  it('converts the four core roles and an aliased model clip into a complete audio group', async () => {
    const { draft, source, blockReads } = await convert();
    expect(group(draft, source.identity.fingerprint)).toMatchObject({ status: 'group-complete', group: 'audio', externalRequirements: [] });
    expect(draft.assets.map(({ id, kind, role, group: owner, dependencies }) => [id, kind, role, owner, dependencies.length])).toEqual([
      ['sound/explosion', 'sound', 'explosion-sound', 'audio', 0],
      ['sound/fire', 'sound', 'fire-sound', 'audio', 0],
      ['sound/missile', 'sound', 'missile-sound', 'audio', 0],
      ['sound/model-clip/01', 'sound', 'model-sound', 'audio', 0],
      ['sound/warp', 'sound', 'warp-sound', 'audio', 0],
    ]);
    expect(draft.sources).toEqual({
      sourceFingerprint: source.identity.fingerprint,
      states: draft.assets.map(({ id }) => ({ id, state: 'verified', unknowns: [] })),
    });
    const formats = draft.payloads.map(({ bytes }) => readSoundPayload(bytes)).map(({ sampleRate, channels, encoding, loop, frames }) => [sampleRate, channels, encoding, loop, frames]);
    expect(formats).toEqual([[22_050, 1, 's16le', 'none', 2], [11_025, 1, 'u8', 'none', 5], [8_000, 2, 'u8', 'whole', 3], [11_025, 1, 'u8', 'none', 3], [44_100, 1, 'u8', 'none', 4]]);
    expect(draft.payloads.every(({ schemaVersion }, index) => schemaVersion === 1 && draft.assets[index].payloadIdentity.schemaVersion === 1)).toBe(true);
    expect(payloadTransferList(draft.payloads.map(({ bytes }) => bytes))).toHaveLength(5);
    // Verification reads every alternative once, the aliased clip's both; conversion shares those reads.
    expect(blockReads).toEqual([10_002, 10_001, 10_003, 10_005, 10_006, 10_004]);
    expect(AUDIO_CONVERTER_COMPONENT).toBe('audio-2');
  });

  it('charges each payload once by its whole bytes and its sample points', async () => {
    const { draft } = await convert();
    expect(draft.usage).toEqual({
      ...EMPTY_BUDGET_USAGE,
      assets: 5,
      payloadBytes: draft.payloads.reduce((sum, { bytes }) => sum + bytes.byteLength, 0),
      audioSamples: 2 + 5 + 6 + 3 + 4,
    });
    expect(draft.usage.payloadBytes).toBe(BOUND.payloadBytes);
  });

  it('converts an empty table without opening the archive', async () => {
    const { draft, source, blockReads } = await convert([]);
    expect(draft).toEqual({ assets: [], payloads: [], sources: { sourceFingerprint: source.identity.fingerprint, states: [] }, usage: EMPTY_BUDGET_USAGE });
    expect(blockReads).toEqual([]);
    expect(group(draft, source.identity.fingerprint)).toMatchObject({ status: 'incomplete' });
  });

  it('still converts an unconfirmed core mapping, which completeness reports as not ready', async () => {
    const { draft, source } = await convert(swap(table(), 'sound/fire', row('fire-sound', 'sound/fire', [10_001], 'unconfirmed')));
    expect(draft.payloads).toHaveLength(5);
    const result = group(draft, source.identity.fingerprint);
    expect(result.status).toBe('incomplete');
    expect('diagnostics' in result && result.diagnostics.map(({ code, assetId, unknowns }) => [code, assetId, unknowns]))
      .toEqual([['source-not-ready', 'sound/fire', ['U-004']]]);
  });

  it('still converts without a core role, which completeness reports by role cardinality', async () => {
    const { draft, source } = await convert(table().filter(item => item.role !== 'warp-sound'));
    const result = group(draft, source.identity.fingerprint);
    expect('diagnostics' in result && result.diagnostics.map(({ code }) => code)).toEqual(['role-cardinality']);
  });

  it.each([
    ['an unlisted flags value', 10_009, 'flags'],
    ['an unsupported bit width', 10_010, 'bitsPerSample'],
  ])('fails on %s without producing a group', async (_name, entry, field) => {
    const { error } = await failure(swap(table(), 'sound/warp', row('warp-sound', 'sound/warp', [entry])));
    expect(error).toEqual({ layer: 'SourceError', code: 'unsupported-payload', location: `sources.mappings[4].parts[0].alternatives[0].${field}`, limit: null });
  });

  it('fails when exact alternatives differ', async () => {
    const { error } = await failure(swap(table(), 'sound/model-clip/01', row('model-sound', 'sound/model-clip/01', [10_005, 10_007])));
    expect(error).toEqual({ layer: 'SourceError', code: 'alternatives-differ', location: 'sources.mappings[3].parts[0].alternatives[1]', limit: null });
  });
});

describe('audio directory preflight', () => {
  it.each([
    ['a missing entry', row('warp-sound', 'sound/warp', [10_004, 19_999]), { layer: 'SourceError', code: 'entry-not-found', location: 'sources.mappings[4].parts[0].alternatives[1]', limit: null }],
    ['an ID beyond u32', row('warp-sound', 'sound/warp', [2 ** 32]), { layer: 'SourceError', code: 'entry-not-found', location: 'sources.mappings[4].parts[0].alternatives[0]', limit: null }],
    ['an entry of another type', (() => { const item = row('warp-sound', 'sound/warp', [10_004]); item.mapping.parts[0].alternatives.push(locator(10_011)); return item; })(),
      { layer: 'SourceError', code: 'entry-type-mismatch', location: 'sources.mappings[4].parts[0].alternatives[1]', limit: null }],
    ['an 8-byte SND block', row('warp-sound', 'sound/warp', [10_008]), { layer: 'SourceError', code: 'invalid-payload', location: 'sources.mappings[4].parts[0].alternatives[0].size', limit: null }],
  ])('rejects %s before reading any SND block', async (_name, replacement, expected) => {
    const { error, blockReads } = await failure(swap(table(), 'sound/warp', replacement));
    expect(error).toEqual(expected);
    expect(blockReads).toEqual([]);
  });

  it('reports an archive outside the verified whitelist at the first mapping path', async () => {
    const { source } = await meteredSource();
    const uncovered: VerifiedSource = { ...source, openArchive: () => source.openArchive('MAIN/OTHER.NOB') };
    await expect(convertAudioGroup(uncovered, table(), RULES)).rejects.toMatchObject({
      name: 'SourceError', code: 'path-not-covered', location: 'sources.mappings[0].parts[0].alternatives[0]',
    });
  });

  it('checks every locator before any block size', async () => {
    const rows = swap(table(), 'sound/explosion', row('explosion-sound', 'sound/explosion', [10_008]));
    const { error } = await failure(swap(rows, 'sound/warp', row('warp-sound', 'sound/warp', [19_999])));
    expect([error.code, error.location]).toEqual(['entry-not-found', 'sources.mappings[4].parts[0].alternatives[0]']);
  });

  it.each(['assets', 'payloadBytes', 'audioSamples'] as const)('passes %s equal to its limit and fails it one over, reading no block', async dimension => {
    const limits = (value: number): BudgetRecord => ({ ...AUDIO_BUDGET_LIMITS, [dimension]: value });
    const { draft } = await convert(table(), { limits: limits(BOUND[dimension]) });
    expect(draft.payloads).toHaveLength(5);

    const { error, blockReads } = await failure(table(), { limits: limits(BOUND[dimension] - 1) });
    expect(error).toEqual({
      layer: 'SourceError', code: 'budget-exceeded', location: 'sources.mappings[4].parts[0].alternatives[0].size',
      limit: { name: dimension, limit: BOUND[dimension] - 1, observed: BOUND[dimension] },
    });
    expect(blockReads).toEqual([]);
  });

  it('holds the production asset limit of 37', async () => {
    const rows = (count: number): Row[] => [
      row('explosion-sound', 'sound/explosion', [10_002]),
      row('fire-sound', 'sound/fire', [10_001]),
      row('missile-sound', 'sound/missile', [10_003]),
      ...Array.from({ length: count - 4 }, (_, index) => row('model-sound', `sound/model-clip/${String(index).padStart(2, '0')}`, [10_100 + index])),
      row('warp-sound', 'sound/warp', [10_004]),
    ];
    expect((await convert(rows(37))).draft.usage.assets).toBe(37);
    const { error, blockReads } = await failure(rows(38));
    expect(error).toEqual({ layer: 'SourceError', code: 'budget-exceeded', location: 'sources.mappings[37].parts[0].alternatives[0].size', limit: { name: 'assets', limit: 37, observed: 38 } });
    expect(blockReads).toEqual([]);
  });

  it('fixes the audio budget limits', () => {
    expect(Object.fromEntries(BUDGET_DIMENSIONS.filter(dimension => AUDIO_BUDGET_LIMITS[dimension] !== 0).map(dimension => [dimension, AUDIO_BUDGET_LIMITS[dimension]])))
      .toEqual({ assets: 37, payloadBytes: 8_388_608, audioSamples: 4_194_304 });
    expect(Object.isFrozen(AUDIO_BUDGET_LIMITS)).toBe(true);
  });
});

describe('sound table', () => {
  const rejected = (rows: unknown): { code: string; path: string } => {
    try {
      readSoundTable(rows);
    } catch (error) {
      if (error instanceof ContentContractError) return { code: error.code, path: error.path };
      throw error;
    }
    throw new Error('expected a ContentContractError');
  };
  const edit = (id: string, change: (item: Row) => void): Row[] => table().map(item => {
    if (item.mapping.asset.id === id) change(item);
    return item;
  });

  it('reads valid rows and keeps the role beside the P2-01 mapping', () => {
    const rows = readSoundTable(table());
    expect(rows.map(({ role, mapping }) => [role, mapping.asset.id, mapping.parts[0].alternatives.length])).toEqual([
      ['explosion-sound', 'sound/explosion', 1], ['fire-sound', 'sound/fire', 1], ['missile-sound', 'sound/missile', 1],
      ['model-sound', 'sound/model-clip/01', 2], ['warp-sound', 'sound/warp', 1],
    ]);
    expect(Object.isFrozen(rows) && Object.isFrozen(rows[0])).toBe(true);
    expect(readSoundTable([row('fire-sound', 'sound/fire/v1', [1]), row('fire-sound', 'sound/fire/v2', [2])])).toHaveLength(2);
  });

  it('reads event and HUD sounds by one kebab-case name each, beside the core rows', () => {
    const [explosion, fire, ...rest] = table();
    const rows = readSoundTable([
      row('event-sound', 'sound/event/a', [10_007]),
      row('event-sound', 'sound/event/target-select', [10_008]),
      explosion, fire,
      row('hud-sound', 'sound/hud/instrument-9-loop', [10_009], 'likely'),
      ...rest,
    ]);
    expect(rows.map(({ role, mapping }) => [role, mapping.asset.id])).toEqual([
      ['event-sound', 'sound/event/a'], ['event-sound', 'sound/event/target-select'],
      ['explosion-sound', 'sound/explosion'], ['fire-sound', 'sound/fire'], ['hud-sound', 'sound/hud/instrument-9-loop'],
      ['missile-sound', 'sound/missile'], ['model-sound', 'sound/model-clip/01'], ['warp-sound', 'sound/warp'],
    ]);
  });

  it.each([
    ['an unknown role', edit('sound/fire', item => { item.role = 'engine-sound'; }), 'invalid-role', 'sounds[1].role'],
    ['an ID unlike its role', edit('sound/fire', item => { item.role = 'missile-sound'; }), 'invalid-role', 'sounds[1].role'],
    ['a model clip without a two-digit number', [row('model-sound', 'sound/model-clip/1', [1])], 'invalid-role', 'sounds[0].role'],
    ['a core variant with two extra segments', [row('fire-sound', 'sound/fire/a/b', [1])], 'invalid-role', 'sounds[0].role'],
    ['an event sound without a name', [row('event-sound', 'sound/event', [1])], 'invalid-role', 'sounds[0].role'],
    ['an event sound with two name segments', [row('event-sound', 'sound/event/a/b', [1])], 'invalid-role', 'sounds[0].role'],
    ['an event sound under a core stem', [row('event-sound', 'sound/fire/select', [1])], 'invalid-role', 'sounds[0].role'],
    ['a HUD sound without a name', [row('hud-sound', 'sound/hud', [1])], 'invalid-role', 'sounds[0].role'],
    ['a HUD sound under the event stem', [row('hud-sound', 'sound/event/overlay', [1])], 'invalid-role', 'sounds[0].role'],
    ['a non-sound kind', [{ role: 'fire-sound', mapping: { ...row('fire-sound', 'sound/fire', [1]).mapping, asset: { id: 'image/fire', kind: 'image' } } }], 'kind-mismatch', 'sounds[0].mapping.asset.kind'],
    ['two parts', edit('sound/fire', item => { item.mapping.parts.push({ alternatives: [locator(10_009)] }); }), 'invalid-source-mapping', 'sounds[1].mapping.parts'],
    ['another archive', edit('sound/fire', item => { item.mapping.parts[0].alternatives = [locator(10_001, 'SND', 'MAIN/OTHER.NOB')]; }), 'invalid-source-mapping', 'sounds[1].mapping.parts[0].alternatives[0]'],
    ['another entry type', edit('sound/fire', item => { item.mapping.parts[0].alternatives = [locator(10_001, 'TABL')]; }), 'invalid-source-mapping', 'sounds[1].mapping.parts[0].alternatives[0]'],
    ['a sub-resource', edit('sound/fire', item => { item.mapping.parts[0].alternatives[0].subresource = 'clip'; }), 'invalid-source-mapping', 'sounds[1].mapping.parts[0].alternatives[0]'],
    ['rows out of order', table().reverse(), 'mapping-order', 'sources.mappings[1]'],
    ['a repeated ID', [...table(), table()[4]], 'duplicate-mapping', 'sources.mappings[5]'],
    ['an extra row field', edit('sound/fire', item => { Object.assign(item, { variant: 1 }); }), 'invalid-record', 'sounds[1]'],
    ['an invalid mapping', edit('sound/fire', item => { item.mapping.confidence = 'certain'; }), 'invalid-source-mapping', 'sources.mappings[1].confidence'],
    ['one entry for two core roles', edit('sound/fire', item => { item.mapping.parts[0].alternatives = [locator(10_002)]; }), 'duplicate-mapping', 'sounds[1].mapping.parts[0].alternatives[0]'],
    ['a core entry reused as a model clip alias', edit('sound/model-clip/01', item => { item.mapping.parts[0].alternatives.unshift(locator(10_003)); }), 'duplicate-mapping', 'sounds[3].mapping.parts[0].alternatives[0]'],
    ['a core entry reused as an event sound', [row('event-sound', 'sound/event/a', [10_001]), ...table()], 'duplicate-mapping', 'sounds[2].mapping.parts[0].alternatives[0]'],
  ])('rejects %s', (_name, rows, code, path) => {
    expect(rejected(rows)).toEqual({ code, path });
  });
});
