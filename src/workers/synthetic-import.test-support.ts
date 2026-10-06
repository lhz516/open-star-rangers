import { RESOURCE_GROUPS, type ResourceGroup } from '../content/asset-contract.ts';
import type { GroupInput } from '../content/completeness.ts';
import { syntheticSourceGroup } from '../content/synthetic-content.test-support.ts';
import { openDiscImage } from '../original-data/disc/disc-image.ts';
import { MARKER, syntheticFileDisc, type SyntheticFileContent } from '../original-data/disc/disc.test-support.ts';
import { identifySource } from '../original-data/source/identify-source.ts';
import { PRODUCTION_CATALOG } from '../original-data/source/source-catalog.ts';
import { catalogFor } from '../original-data/source/source.test-support.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import { fontPayloadLength } from '../content/graphics/font-payload.ts';
import { palettePayloadLength } from '../content/graphics/palette-payload.ts';
import { SOUND_PAYLOAD_HEADER_BYTES } from '../content/sound-payload.ts';
import { cockpitBlock, fontTable } from '../original-data/conversion/conversion.test-support.ts';
import { productionGraphicsEntries, productionGraphicsFiles } from '../original-data/conversion/production-graphics.test-support.ts';
import { PRODUCTION_SOUND_USAGE, productionSoundEntries } from '../original-data/conversion/production-sounds.test-support.ts';
import {
  defaultScenarioSpec, syntheticModelEntries, syntheticScenario, syntheticScenarioArchive,
} from '../original-data/formats/formats.test-support.ts';
import { buildImfat, syntheticSnd } from '../original-data/synthetic.ts';
import type { ImportJob } from './import-host.ts';
import { createImportJob, type AudioStageInput, type GraphicsStepInput, type LogicStepInput, type OpenSource } from './import-job.ts';

// Code-generated CloneCD imports for Worker tests in Node and the browser; it never holds original data.

export { MARKER };

const CHUNK = 1 << 20;

/** An unread file that raises the default read budget, which equals the input size, above a small disc's reads. */
const PADDING: SyntheticFileContent = { byteLength: 1 << 20, read: (_, length) => new Uint8Array(length) };

interface SyntheticImport {
  /** The `.ccd` and `.img` Files, whose names contain `MARKER`. */
  readonly files: readonly File[];
  /** Identification against a whitelist of exactly the covered files, in place of the production whitelist. */
  readonly open: OpenSource;
}

/** Generated content whose byte at `i` is a fixed function of `i` and `seed`; never original data. */
export function generatedContent(byteLength: number, seed: number): SyntheticFileContent {
  return {
    byteLength,
    read: (offset, length) => {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index++) bytes[index] = ((offset + index) * 31 + seed) & 0xff;
      return bytes;
    },
  };
}

/** Files at the production whitelist's paths and sizes, with generated content: shaped like the base version, never it. */
export function productionSizedFiles(): Record<string, SyntheticFileContent> {
  return Object.fromEntries(PRODUCTION_CATALOG.files.map(({ path, byteLength }, index) => [path, generatedContent(byteLength, index + 1)]));
}

/** Identification against a whitelist of exactly `covered`, in place of the production whitelist. */
export function syntheticOpen(covered: Readonly<Record<string, SyntheticFileContent>>, versionId = 'synthetic-import'): OpenSource {
  return async inputs => identifySource(await openDiscImage(inputs), catalogFor(covered, versionId));
}

/** A CloneCD file set holding `covered` plus the padding, by disc path, read out chunk by chunk. */
export async function syntheticImport(covered: Readonly<Record<string, SyntheticFileContent>>, versionId = 'synthetic-import'): Promise<SyntheticImport> {
  const disc = syntheticFileDisc({ ...covered, 'PAD/PAD.DAT': PADDING });
  const files = await Promise.all(disc.files.map(async ({ name, source }) => {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < source.byteLength; offset += CHUNK) {
      // Synthetic ports return bytes in fresh, unshared buffers.
      parts.push(await source.read(offset, Math.min(CHUNK, source.byteLength - offset)) as Uint8Array<ArrayBuffer>);
    }
    return new File(parts, name);
  }));
  return { files, open: syntheticOpen(covered, versionId) };
}

/** A CCKD block whose 4×6 font table is one byte short. */
const CORRUPT_FONTS = cockpitBlock([fontTable(8, 8), fontTable(8, 8), fontTable(4, 6, 4 + 256 * 6 - 1)]);

/** A graphics step with nothing to convert, for jobs whose test is about identification or group transfer. */
export const NO_GRAPHICS: GraphicsStepInput = Object.freeze({
  mappings: { sourceFingerprint: null, mappings: [] },
  declarations: [],
  share: EMPTY_BUDGET_USAGE,
});

/** A logic step that converts nothing, for jobs whose test is about identification, graphics or group transfer. */
export const NO_LOGIC: LogicStepInput = Object.freeze({
  convert: async (_source: unknown, _limits: unknown, usage: BudgetRecord) => ({ drafts: [], usage }),
  share: EMPTY_BUDGET_USAGE,
});

/**
 * The covered files of a disc for every production step: `MAIN/SR.NOB` with the production graphics entries, the M2ID
 * list and its models and synthetic samples at every entry of the production sound table, and `MAIN/SCENARIO.NOB` with
 * the campaign table and `scenario` as the selected mission.
 */
export function sliceCoveredFiles(scenario = syntheticScenario(defaultScenarioSpec())): Record<string, Uint8Array> {
  const entries = [...productionGraphicsEntries(), ...syntheticModelEntries(), ...productionSoundEntries()].sort((left, right) => left.id - right.id);
  return { 'MAIN/SCENARIO.NOB': syntheticScenarioArchive(undefined, scenario), 'MAIN/SR.NOB': buildImfat(10_000, entries) };
}

/** An audio stage with nothing to convert; its group has no Assets. */
export const NO_AUDIO: AudioStageInput = Object.freeze({ table: [], rules: Object.freeze({ flags: Object.freeze([]), s16le: false }) });

/** A `flags` value with a test meaning only; production meanings come from research. */
const SYNTHETIC_FLAGS = 7;

/** The four core sounds of the synthetic audio disc, in ascending Asset ID order, at entry IDs no graphics entry uses. */
const SOUNDS = Object.freeze([
  { role: 'explosion-sound', id: 'sound/explosion', entry: 12_001, bitsPerSample: 16, samples: [0x00, 0x80, 0xff, 0x7f] },
  { role: 'fire-sound', id: 'sound/fire', entry: 12_002, bitsPerSample: 8, samples: [0, 64, 128, 192, 255] },
  { role: 'missile-sound', id: 'sound/missile', entry: 12_003, bitsPerSample: 8, samples: [10, 20, 30] },
  { role: 'warp-sound', id: 'sound/warp', entry: 12_004, bitsPerSample: 8, samples: [200, 100, 50, 25, 12, 6] },
] as const);

/** The synthetic sound table and rules that convert the sounds of `audioCoveredFiles()` into a complete audio group. */
export const SYNTHETIC_AUDIO: AudioStageInput = Object.freeze({
  table: SOUNDS.map(({ role, id, entry }) => ({
    role,
    mapping: {
      asset: { id, kind: 'sound' },
      parts: [{ alternatives: [{ discPath: 'MAIN/SR.NOB', entry: { id: entry, type: 'SND' }, subresource: null }] }],
      confidence: 'confirmed',
      unknowns: [],
      evidence: ['docs/original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries'],
      resolution: 'declared',
    },
  })),
  rules: Object.freeze({ flags: Object.freeze([Object.freeze({ value: SYNTHETIC_FLAGS, channels: 1, loop: 'none' })]), s16le: true }),
});

/** The audio conversion usage of `SYNTHETIC_AUDIO` on `audioCoveredFiles()`: four mono clips, one of them 16-bit. */
export const AUDIO_CONVERSION_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: SOUNDS.length,
  payloadBytes: SOUNDS.reduce((total, { samples }) => total + SOUND_PAYLOAD_HEADER_BYTES + samples.length, 0),
  audioSamples: SOUNDS.reduce((total, { bitsPerSample, samples }) => total + samples.length / (bitsPerSample / 8), 0),
});

/**
 * The covered files of a disc in the production graphics structure whose `MAIN/SR.NOB` also holds the synthetic SND
 * entries of `SYNTHETIC_AUDIO`; `corrupt` gives the fire sound a `flags` value the rules do not accept.
 */
export function audioCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  return productionGraphicsFiles({}, SOUNDS.map(({ entry, bitsPerSample, samples }, index) => ({
    id: entry, type: 'SND', ...syntheticSnd({ samples: [...samples], bitsPerSample, flags: corrupt && index === 1 ? SYNTHETIC_FLAGS + 1 : SYNTHETIC_FLAGS }),
  })));
}

/**
/**
 * The covered files of a disc in the production graphics structure; `corrupt` shortens the 4×6 font table by one byte,
 * which the converter rejects as `invalid-payload`.
 */
export function graphicsCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  return productionGraphicsFiles(corrupt ? { CCKD: CORRUPT_FONTS } : {});
}

/**
 * The covered files of a disc in the production graphics and sound structure: the production graphics and synthetic
 * samples at every entry of the production sound table, so the production graphics and audio stages convert both.
 * `corrupt` shortens the 4×6 font table by one byte, which the converter rejects as `invalid-payload`.
 */
export function productionCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  return productionGraphicsFiles(corrupt ? { CCKD: CORRUPT_FONTS } : {}, productionSoundEntries());
}

/**
 * The payload bytes of the production graphics converted from `graphicsCoveredFiles()` or `productionCoveredFiles()`:
 * two palettes, two 8×8 fonts of 256 glyphs with 94 and 95 map entries, and the 4×6 font of 192 eight-row glyphs with
 * 56 entries.
 */
export const GRAPHICS_PAYLOAD_BYTES = 2 * palettePayloadLength(256)
  + fontPayloadLength(256, 8, 94) + fontPayloadLength(256, 8, 95) + fontPayloadLength(192, 8, 56);

/**
 * The conversion usage of the production graphics and audio stages on `productionCoveredFiles()`: the five graphics
 * Assets plus the production sounds.
 */
export const PRODUCTION_CONVERSION_USAGE: BudgetRecord = Object.freeze({
  ...PRODUCTION_SOUND_USAGE,
  assets: 5 + PRODUCTION_SOUND_USAGE.assets,
  paletteEntries: 512,
  glyphs: 256 + 256 + 192,
  payloadBytes: GRAPHICS_PAYLOAD_BYTES + PRODUCTION_SOUND_USAGE.payloadBytes,
});

/** The groups a synthetic job sends once the source is identified, given the identified fingerprint. */
export type SyntheticGroups = (sourceFingerprint: string) => readonly (readonly [ResourceGroup, GroupInput])[];

/** The four synthetic groups, each bound to the identified source. */
export const boundGroups: SyntheticGroups = fingerprint => RESOURCE_GROUPS.map(group => [group, syntheticSourceGroup(group, fingerprint)]);

/**
 * The import job identifying through `open` and converting no graphics, logic or sounds, then sending `groups` for the
 * identified fingerprint in place of its own empty audio group.
 */
export function syntheticGroupsJob(open: OpenSource, groups: SyntheticGroups = boundGroups): ImportJob {
  const identify = createImportJob(open, NO_GRAPHICS, NO_LOGIC, NO_AUDIO);
  return async (files, report) => {
    let fingerprint = '';
    const usage = await identify(files, Object.freeze({
      ...report,
      identified: (identity: Parameters<typeof report.identified>[0]) => {
        fingerprint = identity.sourceFingerprint;
        report.identified(identity);
      },
      group: () => undefined,
    }));
    for (const [group, input] of groups(fingerprint)) report.group(group, input);
    return usage;
  };
}

