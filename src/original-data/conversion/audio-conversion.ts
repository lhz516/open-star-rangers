import { readAssetDescriptor, type AssetDescriptor } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import { fail, matchesWhole, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import { SOUND_PAYLOAD_HEADER_BYTES, SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import type { SourceStateSet } from '../../content/source-state.ts';
import type { ImfatArchiveHandle } from '../archive/archive-reader.ts';
import { convertSnd, SND_HEADER_BYTES, type SndFormatRules } from '../formats/snd.ts';
import {
  archiveLocator, assetSourceStates, readSourceMappingTable, type ArchiveEntryLocator, type OriginalAssetLocator, type SourceMapping,
} from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { chargeConversionBudget } from './conversion-budget.ts';
import { stepEntryReader } from './step-entry-reader.ts';

// The audio group converter (P2-08 S-03/S-05): a sound table of SND mappings becomes the `audio` group's descriptors,
// exclusive canonical payloads and locator-free source states, within the audio conversion budget.

/**
 * This converter's `ConverterVersion` component; any change to its output for the same source increments it. Version 2
 * adds the P3-03 event and HUD sounds; the P2-08 sounds are unchanged.
 */
export const AUDIO_CONVERTER_COMPONENT = 'audio-2';
/** The only archive sound Assets come from. */
export const AUDIO_SOURCE_ARCHIVE = 'MAIN/SR.NOB';

/** Limits on the audio stage's conversion usage; source reads stay under the P2-02 and P2-03 limits. */
export const AUDIO_BUDGET_LIMITS: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  // Every SND entry of the supported version's SR.NOB.
  assets: 37,
  audioSamples: 4_194_304,
  // Whole canonical payloads, headers included.
  payloadBytes: 8_388_608,
});

/**
 * The four core sound roles of `CLASSIC_P2_SLICE`, with their ID stems; `model-sound` for other model clips; and, with
 * their stems, `event-sound` and `hud-sound` for samples the game plays by entry ID and the HUD's own sounds (P3-03 S-13).
 */
const CORE_ROLE_STEMS = Object.freeze({ 'explosion-sound': 'explosion', 'fire-sound': 'fire', 'missile-sound': 'missile', 'warp-sound': 'warp' } as const);
const NAMED_ROLE_STEMS = Object.freeze({ 'event-sound': 'event', 'hud-sound': 'hud' } as const);
export const SOUND_ROLES = Object.freeze([
  ...Object.keys(CORE_ROLE_STEMS) as (keyof typeof CORE_ROLE_STEMS)[], 'model-sound', ...Object.keys(NAMED_ROLE_STEMS) as (keyof typeof NAMED_ROLE_STEMS)[],
] as const);
export type SoundRole = typeof SOUND_ROLES[number];

const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*';
const stemRules = (stems: Readonly<Record<string, string>>, name: string) =>
  Object.fromEntries(Object.entries(stems).map(([role, stem]) => [role, new RegExp(`^sound/${stem}${name}$`)]));
/**
 * The Asset ID rule of each role: a core stem with at most one variant segment, a two-digit model clip, or an event or
 * HUD stem with exactly one kebab-case name.
 */
const ROLE_IDS: Readonly<Record<SoundRole, RegExp>> = Object.freeze({
  ...stemRules(CORE_ROLE_STEMS, `(?:/${NAME})?`),
  'model-sound': /^sound\/model-clip\/\d{2}$/,
  ...stemRules(NAMED_ROLE_STEMS, `/${NAME}`),
} as Record<SoundRole, RegExp>);

/** One sound Asset: its role and its single-part P2-01 mapping to whole SND entries of `MAIN/SR.NOB`. */
export interface SoundTableRow {
  readonly role: SoundRole;
  readonly mapping: SourceMapping;
}

const isSoundLocator = (locator: OriginalAssetLocator): locator is ArchiveEntryLocator =>
  locator.discPath === AUDIO_SOURCE_ARCHIVE && locator.entry?.type === 'SND' && locator.subresource === null;

/**
 * Reads a sound table. Each row's mapping is checked by the P2-01 reader through the projection
 * `{ sourceFingerprint: null, mappings }` (so rows are in ascending unique Asset ID order); the role, the Asset ID rule
 * for it, the sound kind, the single part and its whole `MAIN/SR.NOB` SND locators are checked here, and no SND entry may
 * belong to two rows, since one source sample forms one Asset.
 */
export function readSoundTable(value: unknown, path = 'sounds'): readonly SoundTableRow[] {
  const rows = readArray(value, path, 'invalid-record', (item, at) => {
    const record = readRecord(item, at);
    requireFields(record, at, ['role', 'mapping']);
    if (!SOUND_ROLES.some(role => role === record.role)) fail('invalid-role', `${at}.role`, 'must be a core, model, event or HUD sound role');
    return { role: record.role as SoundRole, mapping: record.mapping };
  });
  const { mappings } = readSourceMappingTable({ sourceFingerprint: null, mappings: rows.map(({ mapping }) => mapping) });
  const owned = new Set<number>();
  return Object.freeze(mappings.map((mapping, index) => {
    const at = `${path}[${index}]`;
    const { role } = rows[index];
    if (mapping.asset.kind !== 'sound') fail('kind-mismatch', `${at}.mapping.asset.kind`, 'must be sound');
    if (!matchesWhole(mapping.asset.id, ROLE_IDS[role])) fail('invalid-role', `${at}.role`, 'must match the Asset ID rule for its role');
    if (mapping.parts.length !== 1) fail('invalid-source-mapping', `${at}.mapping.parts`, 'must be exactly one part');
    mapping.parts[0].alternatives.forEach((locator, alternative) => {
      const where = `${at}.mapping.parts[0].alternatives[${alternative}]`;
      if (!isSoundLocator(locator)) fail('invalid-source-mapping', where, 'must be a whole SND entry of MAIN/SR.NOB');
      if (owned.has(locator.entry.id)) fail('duplicate-mapping', where, 'must not be an SND entry of another sound Asset');
      owned.add(locator.entry.id);
    });
    return Object.freeze({ role, mapping });
  }));
}

/** The audio group before its package identity: descriptors and payloads in manifest order, source states, usage. */
export interface AudioGroupDraft {
  readonly assets: readonly AssetDescriptor[];
  /** One exclusive canonical payload per Asset. */
  readonly payloads: readonly PayloadRecord[];
  /** Bound to the verified source's fingerprint. */
  readonly sources: SourceStateSet;
  /** Conversion usage only; the source reads are in the verified source's own usage. */
  readonly usage: BudgetRecord;
}

export interface AudioConversionOptions {
  /** Replaces `AUDIO_BUDGET_LIMITS`; only tests pass it. */
  readonly limits?: BudgetRecord;
}

const alternativePath = (row: number, alternative: number) => `sources.mappings[${row}].parts[0].alternatives[${alternative}]`;

/** Reports a P2-03 failure at the mapping's structural path, never at the locator's values. */
async function atMapping<T>(at: string, action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SourceError) throw new SourceError(error.code, at, error.reason, error.limit);
    throw error;
  }
}

/**
 * The directory preflight, before any SND block is read: every locator exists as SND, every first locator's block is
 * at least the SND header, and the usage those block sizes could produce is within the limits. Its charges are a
 * check only, never usage.
 */
async function preflight(archive: ImfatArchiveHandle, mappings: readonly SourceMapping[], limits: BudgetRecord): Promise<void> {
  const entryOf = (locator: OriginalAssetLocator, at: string) => atMapping(at, () => {
    const { entry } = archiveLocator(locator);
    // An ID beyond u32 cannot be in an archive; the handle itself would call it a malformed request.
    if (entry.id > 0xffffffff) throw new SourceError('entry-not-found', at, 'the archive has no entry with this ID');
    return archive.entry(entry.id, entry.type);
  });
  const sizes: number[] = [];
  for (const [row, mapping] of mappings.entries()) {
    for (const [alternative, locator] of mapping.parts[0].alternatives.entries()) {
      const { size } = await entryOf(locator, alternativePath(row, alternative));
      if (alternative === 0) sizes.push(size);
    }
  }
  sizes.forEach((size, row) => {
    if (size < SND_HEADER_BYTES) throw new SourceError('invalid-payload', `${alternativePath(row, 0)}.size`, 'the block is shorter than the 20-byte SND header');
  });
  let bound = EMPTY_BUDGET_USAGE;
  sizes.forEach((size, row) => {
    const samples = size - SND_HEADER_BYTES;
    bound = chargeConversionBudget(limits, bound, { assets: 1, payloadBytes: SOUND_PAYLOAD_HEADER_BYTES + samples, audioSamples: samples }, `${alternativePath(row, 0)}.size`);
  });
}

/**
 * Converts a sound table into the audio group draft: preflight on the `MAIN/SR.NOB` directory, `verifySourceMappings`,
 * then each row's first locator converted under `rules` and charged by its actual payload bytes and sample points;
 * verification and conversion share one step-local read of each entry (P3-03 spec, 来源映射与核验). Mappings below the
 * readiness threshold still convert; completeness validation reports them. The first failure rejects the whole group.
 */
export async function convertAudioGroup(
  source: VerifiedSource,
  table: unknown,
  rules: SndFormatRules,
  { limits = AUDIO_BUDGET_LIMITS }: AudioConversionOptions = {},
): Promise<AudioGroupDraft> {
  const rows = readSoundTable(table);
  const checkedLimits = readBudgetRecord(limits, 'limits');
  const mappings = rows.map(({ mapping }) => mapping);
  const archive = rows.length === 0 ? null : await atMapping(alternativePath(0, 0), () => source.openArchive(AUDIO_SOURCE_ARCHIVE));
  if (archive) await preflight(archive, mappings, checkedLimits);
  const readEntry = stepEntryReader(source);
  const sources = assetSourceStates(await verifySourceMappings({ sourceFingerprint: null, mappings }, source, readEntry));

  let usage = EMPTY_BUDGET_USAGE;
  const assets: AssetDescriptor[] = [];
  const payloads: PayloadRecord[] = [];
  for (const [row, { role, mapping }] of rows.entries()) {
    const at = alternativePath(row, 0);
    const block = await atMapping(at, () => readEntry(archiveLocator(mapping.parts[0].alternatives[0])));
    const { payload, samplePoints } = convertSnd(block, rules, at);
    usage = chargeConversionBudget(checkedLimits, usage, { assets: 1, payloadBytes: payload.byteLength, audioSamples: samplePoints }, at);
    const { id } = mapping.asset;
    assets.push(readAssetDescriptor({
      id, kind: 'sound', role, group: 'audio', dependencies: [],
      payloadIdentity: { schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, byteLength: payload.byteLength, fingerprint: sha256Fingerprint(payload) },
    }));
    payloads.push(Object.freeze({ id, schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: payload }));
  }
  return Object.freeze({ assets: Object.freeze(assets), payloads: Object.freeze(payloads), sources, usage });
}
