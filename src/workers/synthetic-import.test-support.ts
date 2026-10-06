import { RESOURCE_GROUPS, type ResourceGroup } from '../content/asset-contract.ts';
import type { GroupInput } from '../content/completeness.ts';
import { syntheticSourceGroup } from '../content/synthetic-content.test-support.ts';
import { openDiscImage } from '../original-data/disc/disc-image.ts';
import { MARKER, syntheticFileDisc, type SyntheticFileContent } from '../original-data/disc/disc.test-support.ts';
import { identifySource } from '../original-data/source/identify-source.ts';
import { PRODUCTION_CATALOG } from '../original-data/source/source-catalog.ts';
import { catalogFor } from '../original-data/source/source.test-support.ts';
import { EMPTY_BUDGET_USAGE } from '../content/budget.ts';
import type { ImportJob } from './import-host.ts';
import { createImportJob, type GraphicsStepInput, type OpenSource } from './import-job.ts';

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

/** The groups a synthetic job sends once the source is identified, given the identified fingerprint. */
export type SyntheticGroups = (sourceFingerprint: string) => readonly (readonly [ResourceGroup, GroupInput])[];

/** The four synthetic groups, each bound to the identified source. */
export const boundGroups: SyntheticGroups = fingerprint => RESOURCE_GROUPS.map(group => [group, syntheticSourceGroup(group, fingerprint)]);

/** The import job identifying through `open`, converting no graphics, then sending `groups` for the identified fingerprint. */
export function syntheticGroupsJob(open: OpenSource, groups: SyntheticGroups = boundGroups): ImportJob {
  const identify = createImportJob(open, NO_GRAPHICS);
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

