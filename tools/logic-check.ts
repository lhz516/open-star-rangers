import { openAsBlob } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetDescriptor } from '../src/content/asset-contract.ts';
import type { AssetId } from '../src/content/asset-id.ts';
import { validateGroup, type GroupInput } from '../src/content/completeness.ts';
import { ContentContractError } from '../src/content/contract-validation.ts';
import { LOGIC_LIMITS, type CraftTypeTable, type MissionContent, type WingmanRoster } from '../src/content/logic/logic-content.ts';
import { decodeLogicPayload } from '../src/content/logic/logic-payload.ts';
import type { GroupManifest } from '../src/content/manifest.ts';
import type { PayloadRecord } from '../src/content/payload.ts';
import { CLASSIC_P2_SLICE } from '../src/content/slice-definition.ts';
import { CoreInputError } from '../src/core/errors.ts';
import { loadMission } from '../src/core/mission/load-mission.ts';
import { PRODUCTION_LOGIC_SHARE } from '../src/original-data/conversion/convert-logic.ts';
import { DiscReadError } from '../src/original-data/disc/disc-error.ts';
import { openDiscImage } from '../src/original-data/disc/disc-image.ts';
import { SourceError } from '../src/original-data/source-error.ts';
import { identifySource } from '../src/original-data/source/identify-source.ts';
import type { ImportReporter } from '../src/workers/import-host.ts';
import { createImportJob, type OpenSource } from '../src/workers/import-job.ts';
import type { ImportFile, ImportStage } from '../src/workers/import-protocol.ts';

// Local logic check (P2-09 S-14, AC-14): runs the production import job the Worker runs on a CloneCD file set, then
// validates the `logic` group, decodes its payloads and loads the mission in Core. Output holds only verdicts, counts,
// limits, read amounts and hashes: never names, coordinates, field values, host paths or host error text.

export interface LogicCheckOptions {
  /** A synthetic whitelist for tests; otherwise the product entry identifies the source. */
  readonly catalog?: unknown;
}

export interface LogicCheckFailure {
  readonly code: string;
  readonly location: string;
}

/** A structural observation of the canonical data and the limit it must stay within. */
export interface LimitCheck {
  readonly name: string;
  readonly observed: number;
  readonly limit: number;
}

export interface LogicCheckReport {
  readonly format: 'osr-logic-check';
  readonly version: 1;
  readonly passed: boolean;
  /** The first failure that ended the check, if any. */
  readonly error: LogicCheckFailure | null;
  readonly identity: { readonly versionId: string; readonly fingerprint: string } | null;
  readonly group: {
    readonly status: string;
    readonly manifestIdentity: string;
    readonly payloads: readonly { readonly id: string; readonly role: string; readonly bytes: number; readonly fingerprint: string }[];
  } | null;
  readonly counts: Readonly<Record<string, number>> | null;
  readonly limits: readonly LimitCheck[];
  /** Bytes read by each stage (its last progress less the bytes read when it started) and in total. */
  readonly reads: Readonly<Record<ImportStage | 'total', number>>;
}

class CheckStop extends Error {
  readonly failure: LogicCheckFailure;

  constructor(code: string, location: string) {
    super(`${location}: ${code}`);
    this.failure = { code, location };
  }
}

/** The failure an error stands for, by code and structural position only. */
function failureOf(cause: unknown): LogicCheckFailure {
  if (cause instanceof CheckStop) return cause.failure;
  if (cause instanceof DiscReadError || cause instanceof SourceError) return { code: cause.code, location: cause.location };
  if (cause instanceof ContentContractError) return { code: cause.code, location: cause.path };
  if (cause instanceof CoreInputError) return { code: 'core-input', location: cause.path };
  // Anything else may carry host paths in its text.
  return { code: 'internal-error', location: 'check' };
}

const nonNull = (values: readonly unknown[]): number => values.filter(value => value !== null).length;
const largest = (values: readonly number[]): number => values.reduce((most, value) => Math.max(most, value), 0);

/** Counts and limit checks of the decoded payloads, holding no value from them. */
function measure(mission: MissionContent, craftTypes: CraftTypeTable, roster: WingmanRoster, payloads: readonly PayloadRecord[]) {
  const declarations = [...mission.declarations, ...roster.options];
  const sides = (side: string) => craftTypes.entries.filter(entry => entry.side === side).length;
  const counts = {
    declarations: mission.declarations.length,
    namePool: mission.namePool.length,
    spawnRegions: mission.spawnRegions.length,
    groups: mission.groups.length,
    memberPositions: mission.groups.reduce((sum, { members }) => sum + members.length, 0),
    layoutElements: mission.groups.reduce((sum, { layout }) => sum + layout.length, 0),
    placementRegions: nonNull(mission.declarations.map(({ placement }) => placement.region)),
    placementAnchors: nonNull(mission.declarations.map(({ placement }) => placement.anchor)),
    memberOf: nonNull(mission.declarations.map(({ memberOf }) => memberOf)),
    aiTargets: nonNull(mission.declarations.map(({ aiTarget }) => aiTarget)),
    wingmanOptions: roster.options.length,
    craftTypes: craftTypes.entries.length,
    playerCraftTypes: sides('player'),
    friendlyCraftTypes: sides('friendly'),
    enemyCraftTypes: sides('enemy'),
  };
  const names = [...mission.namePool, ...declarations.flatMap(({ nameCandidates }) => nameCandidates)];
  const limits: LimitCheck[] = [
    { name: 'declarations', observed: counts.declarations, limit: LOGIC_LIMITS.declarations },
    { name: 'objects', observed: mission.declarations.filter(({ origins }) => origins.includes('object')).length, limit: LOGIC_LIMITS.objects },
    { name: 'namePool', observed: counts.namePool, limit: LOGIC_LIMITS.namePool },
    { name: 'spawnRegions', observed: counts.spawnRegions, limit: LOGIC_LIMITS.spawnRegions },
    { name: 'groups', observed: counts.groups, limit: LOGIC_LIMITS.groups },
    { name: 'groupMembers', observed: largest(mission.groups.map(({ members }) => members.length)), limit: LOGIC_LIMITS.groupMembers },
    { name: 'layoutElements', observed: largest(mission.groups.map(({ layout }) => layout.length)), limit: LOGIC_LIMITS.layoutElements },
    { name: 'nameCandidates', observed: largest(declarations.map(({ nameCandidates }) => nameCandidates.length)), limit: LOGIC_LIMITS.nameCandidates },
    { name: 'nameLength', observed: largest(names.map(name => name.length)), limit: LOGIC_LIMITS.nameLength },
    { name: 'wingmanOptions', observed: counts.wingmanOptions, limit: LOGIC_LIMITS.wingmanOptions },
    { name: 'payloadBytes', observed: payloads.reduce((sum, { bytes }) => sum + bytes.length, 0), limit: PRODUCTION_LOGIC_SHARE.payloadBytes },
  ];
  return { counts, limits };
}

/** The decoded logic Assets, typed by role; it is also the input `loadMission` takes. */
interface DecodedLogic {
  readonly mission: { readonly id: AssetId; readonly content: MissionContent };
  readonly craftTypes: { readonly id: AssetId; readonly content: CraftTypeTable };
  readonly wingmanRoster: { readonly id: AssetId; readonly content: WingmanRoster };
}

/** Decodes each logic payload with its descriptor. */
function decodeLogicGroup(assets: readonly AssetDescriptor[], payloads: readonly PayloadRecord[]): DecodedLogic {
  const decoded: Partial<{ -readonly [Key in keyof DecodedLogic]: DecodedLogic[Key] }> = {};
  assets.forEach((descriptor, index) => {
    const payload = decodeLogicPayload(payloads[index].bytes, descriptor);
    const { id } = descriptor;
    if (payload.role === 'mission') decoded.mission = { id, content: payload.content };
    else if (payload.role === 'craft-types') decoded.craftTypes = { id, content: payload.content };
    else decoded.wingmanRoster = { id, content: payload.content };
  });
  const { mission, craftTypes, wingmanRoster } = decoded;
  if (!mission || !craftTypes || !wingmanRoster) throw new CheckStop('missing-asset', 'groups.logic');
  return { mission, craftTypes, wingmanRoster };
}

/**
 * Checks a CloneCD file set with the production import job. The first failure of the job, the group validation, the
 * payload decoding or the Core load ends the check; its report keeps everything gathered before it. The input Blobs
 * from `fs.openAsBlob` have no close method: their descriptors are released when the Blobs are collected or the
 * process exits, so the check is meant for one-shot processes such as the CLI.
 */
export async function runLogicCheck(paths: readonly string[], options: LogicCheckOptions = {}): Promise<LogicCheckReport> {
  let identity: LogicCheckReport['identity'] = null;
  let group: LogicCheckReport['group'] = null;
  let measured: ReturnType<typeof measure> | null = null;
  let error: LogicCheckFailure | null = null;
  const reads: Record<ImportStage | 'total', number> = { 'identify-source': 0, 'convert-graphics': 0, 'convert-logic': 0, total: 0 };
  /** The bytes read when each stage started: a stage reports its first progress with the bytes read so far. */
  const starts: Partial<Record<ImportStage, number>> = {};
  /** Only the logic group is checked; other groups are not kept. */
  const sent: { logic?: GroupInput } = {};
  try {
    const files: ImportFile[] = [];
    for (const [index, path] of paths.entries()) {
      try {
        files.push({ name: basename(path), blob: await openAsBlob(path) });
      } catch {
        throw new CheckStop('read-failed', `input[${index}]`);
      }
    }
    const { catalog } = options;
    const open: OpenSource | undefined = catalog === undefined ? undefined : async inputs => identifySource(await openDiscImage(inputs), catalog);
    const report: ImportReporter = {
      progress: (stage, bytes) => {
        starts[stage] ??= bytes;
        reads[stage] = bytes - starts[stage];
        reads.total = bytes;
      },
      identified: ({ versionId, sourceFingerprint }) => { identity = { versionId, fingerprint: sourceFingerprint }; },
      group: (name, input) => { if (name === 'logic') sent.logic = input; },
    };
    // The total read is the last progress, which equals the job's final read usage, and stays set on failure.
    await createImportJob(open)(files, report);

    const { logic } = sent;
    if (!logic) throw new CheckStop('missing-group', 'groups.logic');
    const validation = validateGroup(CLASSIC_P2_SLICE, logic);
    if (validation.status !== 'group-complete') {
      const [first] = validation.diagnostics;
      throw new CheckStop(first.code, first.path);
    }
    // Validation read the manifest and payloads strictly, so their shapes hold from here on.
    const manifest = logic.manifest as GroupManifest;
    const payloads = logic.payloads as readonly PayloadRecord[];
    group = {
      status: validation.status,
      manifestIdentity: manifest.identity.manifestIdentity,
      payloads: manifest.assets.map(({ id, role, payloadIdentity }) => ({ id, role, bytes: payloadIdentity.byteLength, fingerprint: payloadIdentity.fingerprint })),
    };
    const input = decodeLogicGroup(manifest.assets, payloads);
    measured = measure(input.mission.content, input.craftTypes.content, input.wingmanRoster.content, payloads);
    loadMission(input);
    const over = measured.limits.find(({ observed, limit }) => observed > limit);
    if (over) throw new CheckStop('limit-exceeded', `limits.${over.name}`);
  } catch (cause) {
    error = failureOf(cause);
  }
  return {
    format: 'osr-logic-check',
    version: 1,
    passed: error === null,
    error,
    identity,
    group,
    counts: measured?.counts ?? null,
    limits: measured?.limits ?? [],
    reads,
  };
}

const USAGE = 'usage: node tools/logic-check.ts <file.ccd> <file.img> [<file.sub>] [<file.cue>]';

/** Runs the CLI: prints one JSON report and returns 0 when the check passed, 1 when it failed, 2 on bad usage. */
export async function main(argv: readonly string[], options: LogicCheckOptions = {}): Promise<number> {
  if (argv.length === 0 || argv.some(argument => argument.startsWith('-'))) {
    console.error(USAGE);
    console.log(JSON.stringify({ format: 'osr-logic-check', version: 1, passed: false, error: { code: 'usage', location: 'argv' } }));
    return 2;
  }
  const report = await runLogicCheck(argv.map(file => resolve(file)), options);
  console.log(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
