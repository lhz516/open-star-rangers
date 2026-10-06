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
import { cockpitBlock, fontTable } from '../original-data/conversion/conversion.test-support.ts';
import { productionGraphicsEntries, productionGraphicsFiles } from '../original-data/conversion/production-graphics.test-support.ts';
import {
  defaultScenarioSpec, syntheticModelEntries, syntheticScenario, syntheticScenarioArchive,
} from '../original-data/formats/formats.test-support.ts';
import { buildImfat } from '../original-data/synthetic.ts';
import type { ImportJob } from './import-host.ts';
import { createImportJob, type GraphicsStepInput, type LogicStepInput, type OpenSource } from './import-job.ts';

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
 * The covered files of a disc holding the production graphics and the slice mission in their production structure:
 * `SR.NOB` with the graphics entries, the M2ID list and its models, and `SCENARIO.NOB` with the campaign table and
 * `scenario` as the selected mission.
 */
export function sliceCoveredFiles(scenario = syntheticScenario(defaultScenarioSpec())): Record<string, Uint8Array> {
  const entries = [...productionGraphicsEntries(), ...syntheticModelEntries()].sort((left, right) => left.id - right.id);
  return { 'MAIN/SCENARIO.NOB': syntheticScenarioArchive(undefined, scenario), 'MAIN/SR.NOB': buildImfat(10_000, entries) };
}

/**
 * The covered files of a disc in the production graphics structure; `corrupt` shortens the 4×6 font table by one byte,
 * which the converter rejects as `invalid-payload`.
 */
export function graphicsCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  return productionGraphicsFiles(corrupt ? { CCKD: cockpitBlock([fontTable(8, 8), fontTable(8, 8), fontTable(4, 6, 4 + 256 * 6 - 1)]) } : {});
}

/**
 * The payload bytes of the production graphics converted from `graphicsCoveredFiles()`: two palettes, two 8×8 fonts of
 * 256 glyphs with 94 and 95 map entries, and the 4×6 font of 192 eight-row glyphs with 56 entries.
 */
export const GRAPHICS_PAYLOAD_BYTES = 2 * palettePayloadLength(256)
  + fontPayloadLength(256, 8, 94) + fontPayloadLength(256, 8, 95) + fontPayloadLength(192, 8, 56);

/** The groups a synthetic job sends once the source is identified, given the identified fingerprint. */
export type SyntheticGroups = (sourceFingerprint: string) => readonly (readonly [ResourceGroup, GroupInput])[];

/** The four synthetic groups, each bound to the identified source. */
export const boundGroups: SyntheticGroups = fingerprint => RESOURCE_GROUPS.map(group => [group, syntheticSourceGroup(group, fingerprint)]);

/** The import job identifying through `open`, converting nothing, then sending `groups` for the identified fingerprint. */
export function syntheticGroupsJob(open: OpenSource, groups: SyntheticGroups = boundGroups): ImportJob {
  const identify = createImportJob(open, NO_GRAPHICS, NO_LOGIC);
  return async (files, report) => {
    let fingerprint = '';
    const usage = await identify(files, Object.freeze({
      ...report,
      identified: (identity: Parameters<typeof report.identified>[0]) => {
        fingerprint = identity.sourceFingerprint;
        report.identified(identity);
      },
    }));
    for (const [group, input] of groups(fingerprint)) report.group(group, input);
    return usage;
  };
}

