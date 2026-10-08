import type { ResourceGroup } from '../content/asset-contract.ts';
import { syntheticFileDisc } from '../original-data/disc/disc.test-support.ts';
import { MISSING_SOUND, scenarioSource } from './import-scenarios.test-support.ts';
import type { ImportErrorLimit } from './import-protocol.ts';
import {
  fileSetOf, generatedContent, MARKER, PADDING, productionCoveredFiles, sliceCoveredFiles, syntheticImport,
} from './synthetic-import.test-support.ts';

// The P2-12 failure matrix F-01 to F-10 (spec, failure matrix): each case's synthetic files, the test entry's Worker
// scenario and the outcome fixed in advance from the error contracts and the place the fixture breaks, never from a run
// of the code under test. Node (failure-matrix.test.ts) and the browser cases assert the same table.

export type FailureRow = 'F-01' | 'F-02' | 'F-03' | 'F-04' | 'F-05' | 'F-06' | 'F-07' | 'F-08' | 'F-09' | 'F-10';

/** An import failure as the job owner reports it: layer, code, structural location and limit (I-1). */
export interface ExpectedError {
  readonly layer: 'disc' | 'source' | 'content' | 'import';
  readonly code: string;
  readonly location: string;
  readonly limit: ImportErrorLimit | null;
}

export interface ExpectedGroup {
  readonly group: ResourceGroup;
  readonly status: 'group-complete' | 'incomplete';
}

/** A whole-package diagnostic of the held groups, in slice definition order. */
export interface ExpectedDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly assetId: string | null;
}

export type ExpectedMission =
  | { readonly status: 'not-attempted' }
  | { readonly status: 'loaded' }
  | { readonly status: 'failed'; readonly kind: 'core-input' | 'content'; readonly path: string };

export interface ExpectedFinish {
  readonly status: 'finished';
  /** Every received group's summary, in receiving order. */
  readonly groups: readonly ExpectedGroup[];
  /** The package of the complete groups: complete, or the diagnostics that keep it incomplete. */
  readonly package: { readonly status: 'complete' } | { readonly status: 'incomplete'; readonly diagnostics: readonly ExpectedDiagnostic[] };
  readonly mission: ExpectedMission;
}

export type ExpectedOutcome = { readonly status: 'failed'; readonly error: ExpectedError } | ExpectedFinish;

/**
 * What the resource holder keeps afterwards (I-2): a failed job leaves the package held before it unchanged; a job that
 * finishes with a partial package replaces it with the complete groups for diagnosis without saving them; a complete
 * new package is held and saved by the existing rules, whatever its mission diagnosis.
 */
export type HolderOutcome = 'unchanged' | 'partial-unsaved' | 'complete-saved';

export interface FailureCase {
  /** Unique within the table. */
  readonly id: string;
  readonly row: FailureRow;
  /** The test entry's `worker` option: a scenario or protocol script of import-scenarios.test-support.ts. */
  readonly worker: string;
  /** The files to choose on the import page; their names carry `MARKER`. */
  readonly files: () => Promise<readonly File[]>;
  readonly expected: ExpectedOutcome;
  readonly holder: HolderOutcome;
}

const failed = (layer: ExpectedError['layer'], code: string, location: string, limit: ImportErrorLimit | null = null): ExpectedOutcome =>
  Object.freeze({ status: 'failed', error: Object.freeze({ layer, code, location, limit: limit && Object.freeze(limit) }) });

const ALL_COMPLETE: readonly ExpectedGroup[] = Object.freeze((['logic', 'models', 'cockpit-hud-map', 'audio'] as const)
  .map(group => Object.freeze({ group, status: 'group-complete' as const })));

/** The whole slice package: four complete groups, a complete package and a loaded mission. */
const COMPLETE = Object.freeze<ExpectedFinish>({ status: 'finished', groups: ALL_COMPLETE, package: { status: 'complete' }, mission: { status: 'loaded' } });

/**
 * The `graphics` scenario's package: no logic group, an incomplete models group (no logic step binds a model) and the
 * complete cockpit-hud-map and audio groups. Only those two are held, so the package lacks the other two groups and no
 * mission is attempted.
 */
const PARTIAL = Object.freeze<ExpectedFinish>({
  status: 'finished',
  groups: [{ group: 'models', status: 'incomplete' }, { group: 'cockpit-hud-map', status: 'group-complete' }, { group: 'audio', status: 'group-complete' }],
  package: {
    status: 'incomplete',
    diagnostics: [{ code: 'group-missing', path: 'groups.logic', assetId: null }, { code: 'group-missing', path: 'groups.models', assetId: null }],
  },
  mission: { status: 'not-attempted' },
});

/** Generated once per process: the files are never changed, only read. */
const once = (files: () => Promise<readonly File[]>) => {
  let cached: Promise<readonly File[]> | undefined;
  return () => cached ??= files();
};
const sliceFiles = once(async () => (await syntheticImport(sliceCoveredFiles())).files);
const graphicsFiles = once(async () => (await syntheticImport(productionCoveredFiles())).files);

/** The slice disc whose root directory holds `records` records: `.`, `..`, `MAIN`, `PAD` and empty filler files. */
const rootRecords = async (records: number) => {
  const fillers = Object.fromEntries(Array.from({ length: records - 4 }, (_, index) => [`F${String(index).padStart(4, '0')}.DAT`, new Uint8Array(0)]));
  return (await syntheticImport({ ...sliceCoveredFiles(), ...fillers })).files;
};


/** `.ccd` and `.img` of the slice disc under two different marked names. */
async function mismatchedNames(): Promise<File[]> {
  const [descriptor, image] = await sliceFiles();
  return [new File([descriptor], `${MARKER}-a.ccd`), new File([image], `${MARKER}-b.img`)];
}

/** The slice disc whose `.img` lost its last raw sector, so the lead-out of the intact `.ccd` no longer matches it. */
async function truncatedImage(): Promise<File[]> {
  const [descriptor, image] = await sliceFiles();
  return [descriptor, new File([image.slice(0, image.size - 2_352)], image.name)];
}

/** The slice disc with one byte of `MAIN/SR.NOB` changed, keeping every covered path and size. */
async function changedContent(): Promise<readonly File[]> {
  const covered = sliceCoveredFiles();
  const archive = covered['MAIN/SR.NOB'].slice();
  archive[archive.length - 1] ^= 0xff;
  return (await syntheticImport({ ...covered, 'MAIN/SR.NOB': archive })).files;
}

const DISC_RECORDS = 1_024;

/** The F-01 to F-10 cases, in row order. */
export const FAILURE_MATRIX: readonly FailureCase[] = Object.freeze([
  {
    id: 'F-01 descriptor and image named differently', row: 'F-01', worker: 'models', files: mismatchedNames,
    expected: failed('disc', 'unsupported-file-set', 'files'), holder: 'unchanged',
  },
  {
    // The lead-out of TOC entry 2 still names the original sector count.
    id: 'F-02 image one raw sector short of its descriptor', row: 'F-02', worker: 'models', files: truncatedImage,
    expected: failed('disc', 'image-size-mismatch', 'descriptor[Entry 2].PLBA'), holder: 'unchanged',
  },
  {
    // The root holds `.`, `..`, `MAIN` and `PAD`; the first lookup of any covered file meets record 2.
    id: 'F-03 directory record whose extent starts past the image', row: 'F-03', worker: 'models',
    files: () => fileSetOf(syntheticFileDisc({ ...sliceCoveredFiles(), 'PAD/PAD.DAT': PADDING }, { outOfImage: ['MAIN'] })),
    expected: failed('disc', 'invalid-directory', 'dir:/[2]'), holder: 'unchanged',
  },
  {
    id: 'F-04 root directory at the record limit', row: 'F-04', worker: 'models', files: () => rootRecords(DISC_RECORDS),
    expected: COMPLETE, holder: 'complete-saved',
  },
  {
    // The first lookup reads the root, which fails at its 1,025th record.
    id: 'F-04 root directory one record over the limit', row: 'F-04', worker: 'models', files: () => rootRecords(DISC_RECORDS + 1),
    expected: failed('disc', 'limit-exceeded', 'dir:/', { name: 'directoryRecords', limit: DISC_RECORDS, observed: DISC_RECORDS + 1 }),
    holder: 'unchanged',
  },
  {
    // Without layouts and 8×8 fonts the cockpit-hud-map group lacks its front cockpit, so only the audio group is held.
    id: 'F-04 graphics payload budget at the step usage', row: 'F-04', worker: 'graphics-budget-at-limit',
    files: graphicsFiles,
    expected: {
      status: 'finished',
      groups: [{ group: 'models', status: 'incomplete' }, { group: 'cockpit-hud-map', status: 'incomplete' }, { group: 'audio', status: 'group-complete' }],
      package: {
        status: 'incomplete',
        diagnostics: ['cockpit-hud-map', 'logic', 'models'].map(group => ({ code: 'group-missing', path: `groups.${group}`, assetId: null })),
      },
      mission: { status: 'not-attempted' },
    },
    holder: 'partial-unsaved',
  },
  {
    // The 4×6 font, charged last, reaches the step usage of 9,624 bytes.
    id: 'F-04 graphics payload budget one byte under the step usage', row: 'F-04', worker: 'graphics-budget-over-limit',
    files: graphicsFiles,
    expected: failed('source', 'budget-exceeded', 'graphics[font/hud/4x6].glyphs', { name: 'payloadBytes', limit: 9_623, observed: 9_624 }),
    holder: 'unchanged',
  },
  {
    // The whitelist checks presence in path order, and its first path is missing.
    id: 'F-05 disc the whitelist does not cover', row: 'F-05', worker: 'models',
    files: async () => (await syntheticImport({ 'MAIN/OTHER.DAT': generatedContent(4_096, 7) })).files,
    expected: failed('source', 'unsupported-version', 'file:/MAIN/SCENARIO.NOB'), holder: 'unchanged',
  },
  {
    // Every presence and size check passes; the second file in path order has another digest.
    id: 'F-06 covered file with the whitelisted size and other contents', row: 'F-06', worker: 'models', files: changedContent,
    expected: failed('source', 'unsupported-version', 'file:/MAIN/SR.NOB'), holder: 'unchanged',
  },
  {
    // The corrupt quad mesh is the second part of the base model's first list.
    id: 'F-07 corrupt mesh on an identified disc', row: 'F-07', worker: 'models-corrupt',
    files: async () => (await syntheticImport(sliceCoveredFiles({ corruptMesh: true }))).files,
    expected: failed('source', 'invalid-payload', 'models[model/base-1].parts[0][1].mesh'), holder: 'unchanged',
  },
  {
    // Mapping 97 of the production graphics table is the first naming the removed TEX entry; the graphics step verifies
    // its mappings in table order, and P2-03 reports an absent entry at the mapping's first alternative.
    id: 'F-08 referenced texture missing from an identified disc', row: 'F-08', worker: 'texture-missing',
    files: async () => (await syntheticImport(scenarioSource('texture-missing')!.covered)).files,
    expected: failed('source', 'entry-not-found', 'sources.mappings[97].parts[0].alternatives[0]'), holder: 'unchanged',
  },
  {
    // The models group requires the player model's slot-0 sound, eighth of its sound requirements in ID order.
    id: 'F-08 cross-group sound dependency missing from the package', row: 'F-08', worker: 'sound-missing', files: sliceFiles,
    expected: {
      status: 'finished', groups: ALL_COMPLETE,
      package: { status: 'incomplete', diagnostics: [{ code: 'missing-dependency', path: 'groups[1].externalRequirements[7]', assetId: MISSING_SOUND }] },
      mission: { status: 'loaded' },
    },
    holder: 'partial-unsaved',
  },
  {
    id: 'F-09 invalid converted content', row: 'F-09', worker: 'content-invalid', files: sliceFiles,
    expected: failed('content', 'invalid-record', 'drafts[0].manifest'), holder: 'unchanged',
  },
  {
    // The logic group arrives bound to the identified source; the models group, sent next, is not.
    id: 'F-09 group bound to another source', row: 'F-09', worker: 'mixed-identity', files: sliceFiles,
    expected: failed('import', 'invalid-result', 'groups.models'), holder: 'unchanged',
  },
  {
    id: 'F-09 message of no known type', row: 'F-09', worker: 'protocol-invalid-message', files: sliceFiles,
    expected: failed('import', 'protocol-error', 'message.type'), holder: 'unchanged',
  },
  {
    id: 'F-09 message out of sequence', row: 'F-09', worker: 'protocol-out-of-sequence', files: sliceFiles,
    expected: failed('import', 'protocol-error', 'message.sequence'), holder: 'unchanged',
  },
  {
    id: 'F-09 group before identification', row: 'F-09', worker: 'protocol-group-before-identified', files: sliceFiles,
    expected: failed('import', 'protocol-error', 'message.type'), holder: 'unchanged',
  },
  {
    id: 'F-09 repeated group', row: 'F-09', worker: 'protocol-repeated-group', files: sliceFiles,
    expected: failed('import', 'protocol-error', 'message.group'), holder: 'unchanged',
  },
  {
    // The roster's option at index 0 takes the player craft type, which Core rejects after resolving every craft type.
    id: 'F-10 complete package whose mission Core rejects', row: 'F-10', worker: 'mission-invalid', files: sliceFiles,
    expected: { ...COMPLETE, mission: { status: 'failed', kind: 'core-input', path: 'input.wingmanRoster.content.options[0].craftType' } },
    holder: 'complete-saved',
  },
  {
    id: 'F-10 finished with a missing and an incomplete group', row: 'F-10', worker: 'graphics',
    files: graphicsFiles, expected: PARTIAL, holder: 'partial-unsaved',
  },
] satisfies FailureCase[]);
