import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateGroup } from '../content/completeness.ts';
import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import { readGroupManifest } from '../content/manifest.ts';
import { deriveManifestIdentity, type GroupDraft } from '../content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../content/slice-definition.ts';
import { syntheticSourceGroup } from '../content/synthetic-content.test-support.ts';
import { PRODUCTION_LOGIC_SHARE } from '../original-data/conversion/convert-logic.ts';
import { PRODUCTION_CONVERTER_VERSION, productionIdentityBasis } from '../original-data/conversion/converter-version.ts';
import { UNLIMITED_BUDGET, withMeshReads } from '../original-data/conversion/conversion.test-support.ts';
import { runEffectStep } from '../original-data/conversion/effect-step.ts';
import { runGraphicsStep } from '../original-data/conversion/graphics-step.ts';
import { modelsGroupDraft, runModelStep } from '../original-data/conversion/model-step.ts';
import { PRODUCTION_EFFECT_DECLARATIONS, PRODUCTION_EFFECT_MAPPINGS } from '../original-data/conversion/production-effects.ts';
import { PRODUCTION_EFFECT_USAGE } from '../original-data/conversion/production-effects.test-support.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from '../original-data/conversion/production-graphics.ts';
import { COCKPIT_HUD_MAP_USAGE, MODEL_TEXTURE_USAGE } from '../original-data/conversion/production-graphics.test-support.ts';
import {
  PRODUCTION_MODEL_REFERENCES, PRODUCTION_MODEL_SHARE, productionModelDeclarations, productionModelMappings,
} from '../original-data/conversion/production-models.ts';
import {
  PRODUCTION_MESH_ENTRIES, PRODUCTION_MODEL_USAGE, productionSliceEntries,
} from '../original-data/conversion/production-models.test-support.ts';
import { PRODUCTION_SOUND_USAGE } from '../original-data/conversion/production-sounds.test-support.ts';
import { DiscReadError } from '../original-data/disc/disc-error.ts';
import { DEFAULT_MODEL_IDS } from '../original-data/formats/formats.test-support.ts';
import type { VerifiedSource } from '../original-data/source/open-verified-source.ts';
import { buildImfat, type SyntheticEntry } from '../original-data/synthetic.ts';
import { runImportHost, type ImportJob } from './import-host.ts';
import {
  checkPackageTransfers, createImportJob, PRODUCTION_LOGIC_STEP, type AudioStageInput, type GraphicsStepInput, type LogicStepGroups, type LogicStepInput,
  type OpenSource, type PackageGroup,
} from './import-job.ts';
import { FakeEndpoint } from './import-host.test-support.ts';
import { IMPORT_PROTOCOL_VERSION, IMPORT_STAGES, type ImportWorkerMessage } from './import-protocol.ts';
import {
  AUDIO_CONVERSION_USAGE, audioCoveredFiles, boundGroups, cockpitCoveredFiles, cockpitGraphics, GRAPHICS_CONVERSION_USAGE, GRAPHICS_PAYLOAD_BYTES, MARKER,
  NO_AUDIO, NO_GRAPHICS, NO_LOGIC, NO_MODELS, PRODUCTION_CONVERSION_USAGE, productionCoveredFiles, SCENARIO_SOURCES, scenarioOpen, scenarioProfile,
  sliceCoveredFiles, SYNTHETIC_AUDIO, syntheticImport, syntheticSource, type IdentifyingScenario,
} from './synthetic-import.test-support.ts';

const ascii = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));
const COVERED = {
  'MAIN/ALPHA.DAT': ascii('alpha '.repeat(900)),
  'MAIN/SUB/BETA.NOB': ascii('beta '.repeat(3000)),
};

/** Runs `job` behind the host on `files` and resolves to the messages after `ready` once the host closes. */
async function run(job: ImportJob, files: readonly Blob[], names = files.map(file => (file as File).name)): Promise<ImportWorkerMessage[]> {
  const endpoint = new FakeEndpoint();
  runImportHost(endpoint, job);
  endpoint.dispatch('message', { type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 3, files: files.map((blob, index) => ({ name: names[index], blob })) });
  await endpoint.closed;
  expect(JSON.stringify(endpoint.messages)).not.toContain(MARKER);
  return endpoint.afterReady;
}

/** The bytes each Blob read actually returned. */
function blobReads(): number[] {
  const arrayBuffer = Blob.prototype.arrayBuffer;
  const reads: number[] = [];
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(async function (this: Blob) {
    const buffer = await arrayBuffer.call(this);
    reads.push(buffer.byteLength);
    return buffer;
  });
  return reads;
}

/**
 * The progress byte counts, checked to be identification progress until `identified` and conversion progress after
 * it, in stage order: each stage reports once as it starts, repeating the latest count, and once per read, accumulating
 * across stages from 0.
 */
function progress(messages: readonly ImportWorkerMessage[], reads: readonly number[]): number[] {
  let identified = false;
  let stage: string | null = null;
  const counts: number[] = [];
  const perRead: number[] = [];
  for (const message of messages) {
    if (message.type === 'identified') identified = true;
    if (message.type !== 'progress') continue;
    expect(message.stage === 'identify-source').toBe(!identified);
    if (stage !== null && message.stage !== stage) {
      expect(IMPORT_STAGES.indexOf(message.stage)).toBeGreaterThan(IMPORT_STAGES.indexOf(stage as typeof message.stage));
      expect(message.readBytes).toBe(counts.at(-1));
    } else {
      perRead.push(message.readBytes);
    }
    stage = message.stage;
    counts.push(message.readBytes);
  }
  let total = 0;
  expect(perRead).toEqual([0, ...reads.map(bytes => (total += bytes))]);
  return counts;
}

/** Each message as its stage or type, with repeats collapsed. */
const steps = (messages: readonly ImportWorkerMessage[]): string[] => messages
  .map(message => (message.type === 'progress' ? message.stage : message.type))
  .filter((step, index, all) => step !== all[index - 1]);

/** Message types, with each progress message labelled by its stage. */
const typesOf = (messages: readonly ImportWorkerMessage[]): string[] =>
  messages.map(message => (message.type === 'progress' ? `progress:${message.stage}` : message.type));

/** The group message of a finished job that sent `group`. */
function sentGroup(messages: readonly ImportWorkerMessage[], group: string): Extract<ImportWorkerMessage, { type: 'group' }> {
  const groups = messages.filter(message => message.type === 'group' && message.group === group);
  expect(groups).toHaveLength(1);
  return groups[0] as Extract<ImportWorkerMessage, { type: 'group' }>;
}

/** The identity-bearing draft of a sent group: payloads are not part of the derivation. */
const sentDraft = (message: Extract<ImportWorkerMessage, { type: 'group' }>): GroupDraft =>
  ({ group: message.group, assets: readGroupManifest(message.input.manifest).assets, payloads: [], sources: message.input.sources } as GroupDraft);


class UnreadableBlob extends Blob {
  override slice(start?: number, end?: number): Blob {
    return new UnreadableBlob([super.slice(start, end)]);
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.reject(new Error(MARKER));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production job', () => {
  it('reports progress, then the production whitelist rejects a disc it does not cover', async () => {
    const { files } = await syntheticImport(COVERED);
    const reads = blobReads();
    const messages = await run(createImportJob(), files);
    const counts = progress(messages, reads);
    expect(counts.at(-1)).toBeGreaterThan(0);
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length,
      error: expect.objectContaining({ layer: 'source', code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB' }),
    });
    expect(messages.map(message => message.type).filter(type => type !== 'progress')).toEqual(['failed']);
  });

  it('rejects a file set with only the descriptor before reading anything', async () => {
    const { files } = await syntheticImport(COVERED);
    const reads = blobReads();
    const messages = await run(createImportJob(), files.slice(0, 1));
    expect(reads).toEqual([]);
    expect(messages).toEqual([
      { type: 'progress', jobId: 3, sequence: 1, stage: 'identify-source', readBytes: 0 },
      { type: 'failed', jobId: 3, sequence: 2, error: expect.objectContaining({ layer: 'disc', code: 'unsupported-file-set', location: 'files' }) },
    ]);
  });

  it('reports a rejected port read as a disc read failure without its text, counting only returned bytes', async () => {
    const { files } = await syntheticImport(COVERED);
    const reads = blobReads();
    const messages = await run(createImportJob(), [files[0], new UnreadableBlob([files[1]])], files.map(file => file.name));
    expect(progress(messages, reads).at(-1)).toBe(files[0].size);
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length, error: expect.objectContaining({ layer: 'disc', code: 'read-failed' }),
    });
  });
});

describe('injected identification', () => {
  it('limits the conversion steps to the input size, the P2-02 default read limit, plus the graphics, logic and model shares', async () => {
    const imported = await syntheticImport(COVERED, 'job-test-disc');
    const seen: BudgetRecord[] = [];
    const logic: LogicStepInput = {
      share: PRODUCTION_LOGIC_SHARE,
      convert: async (source, limits, usage) => {
        seen.push(limits);
        return NO_LOGIC.convert(source, limits, usage);
      },
    };
    const job = createImportJob(imported.open, { ...NO_GRAPHICS, share: PRODUCTION_GRAPHICS_SHARE }, logic, NO_AUDIO, { ...NO_MODELS, share: PRODUCTION_MODEL_SHARE });
    expect((await run(job, imported.files)).at(-1)).toMatchObject({ type: 'finished' });
    const inputBytes = imported.files.reduce((total, file) => total + file.size, 0);
    const readLimit = { ...EMPTY_BUDGET_USAGE, sourceReadBytes: inputBytes };
    expect(seen).toEqual([[PRODUCTION_GRAPHICS_SHARE, PRODUCTION_LOGIC_SHARE, PRODUCTION_MODEL_SHARE].reduce((total, share) => addBudgets(total, share), readLimit)]);
    expect(seen[0].sourceReadBytes).toBe(inputBytes);
  });

  it('identifies the synthetic whitelist, converts nothing, then sends empty models, cockpit-hud-map and audio groups and finishes with the source usage', async () => {
    const imported = await syntheticImport(COVERED, 'job-test-disc');
    let source: VerifiedSource | undefined;
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), NO_GRAPHICS, NO_LOGIC, NO_AUDIO, NO_MODELS), imported.files);
    const counts = progress(messages, reads);
    const usage = source!.usage();
    const fingerprint = source!.identity.fingerprint;
    expect(counts.at(-1)).toBe(usage.sourceReadBytes);
    expect(usage.sourceReadBytes).toBeGreaterThan(Object.values(COVERED).reduce((total, bytes) => total + bytes.length, 0));
    const empty = (group: string) => ({ manifest: expect.objectContaining({ group, assets: [] }), payloads: [], sources: { sourceFingerprint: fingerprint, states: [] } });
    expect(messages.slice(-9)).toEqual([
      { type: 'identified', jobId: 3, sequence: messages.length - 8, identity: { versionId: 'job-test-disc', sourceFingerprint: fingerprint } },
      { type: 'progress', jobId: 3, sequence: messages.length - 7, stage: 'convert-graphics', readBytes: usage.sourceReadBytes },
      { type: 'progress', jobId: 3, sequence: messages.length - 6, stage: 'convert-logic', readBytes: usage.sourceReadBytes },
      { type: 'progress', jobId: 3, sequence: messages.length - 5, stage: 'convert-audio', readBytes: usage.sourceReadBytes },
      { type: 'progress', jobId: 3, sequence: messages.length - 4, stage: 'convert-models', readBytes: usage.sourceReadBytes },
      { type: 'group', jobId: 3, sequence: messages.length - 3, group: 'models', input: empty('models') },
      { type: 'group', jobId: 3, sequence: messages.length - 2, group: 'cockpit-hud-map', input: empty('cockpit-hud-map') },
      { type: 'group', jobId: 3, sequence: messages.length - 1, group: 'audio', input: empty('audio') },
      { type: 'finished', jobId: 3, sequence: messages.length, groups: ['models', 'cockpit-hud-map', 'audio'], usage },
    ]);
    expect(fingerprint).toMatch(/^source:sha256:[0-9a-f]{64}$/);
  });
});

describe('production conversion', () => {
  it('converts the production graphics and sounds after identification, and sends the graphics partitions and the complete cockpit-hud-map and audio groups', async () => {
    const imported = await syntheticImport(productionCoveredFiles(), 'production-job-disc');
    let source: VerifiedSource | undefined;
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), undefined, NO_LOGIC, undefined, NO_MODELS), imported.files);
    const counts = progress(messages, reads);
    expect(steps(messages)).toEqual(['identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    expect(messages.filter(message => message.type === 'progress' && message.stage === 'convert-graphics').length).toBeGreaterThan(1);
    const readUsage = source!.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    const last = messages.at(-1);
    if (last?.type !== 'finished') throw new Error('expected the job to finish');
    expect(last.groups).toEqual(['models', 'cockpit-hud-map', 'audio']);
    expect(last.usage).toEqual({ ...PRODUCTION_CONVERSION_USAGE, sourceReadBytes: readUsage.sourceReadBytes });
    expect(validateGroup(CLASSIC_P2_SLICE, sentGroup(messages, 'audio').input)).toMatchObject({ status: 'group-complete', group: 'audio' });
    expect(readGroupManifest(sentGroup(messages, 'audio').input.manifest).assets).toHaveLength(PRODUCTION_SOUND_USAGE.assets);
    // With neither a logic step nor a model to convert, the models group holds only the flight palette and the graphics.
    expect(readGroupManifest(sentGroup(messages, 'models').input.manifest).assets).toHaveLength(1 + MODEL_TEXTURE_USAGE.assets);
    expect(validateGroup(CLASSIC_P2_SLICE, sentGroup(messages, 'models').input).status).toBe('incomplete');
    // The P2-05 palette and fonts with the production cockpit, HUD and map Assets fill every role of the group.
    const cockpit = sentGroup(messages, 'cockpit-hud-map').input;
    const cockpitIds = PRODUCTION_GRAPHICS_DECLARATIONS.filter(({ group }) => group === 'cockpit-hud-map').map(({ asset }) => asset.id).sort();
    expect(cockpitIds).toHaveLength(4 + COCKPIT_HUD_MAP_USAGE.assets);
    expect(readGroupManifest(cockpit.manifest).assets.map(({ id }) => id)).toEqual(cockpitIds);
    expect(validateGroup(CLASSIC_P2_SLICE, cockpit)).toMatchObject({ status: 'group-complete', group: 'cockpit-hud-map', externalRequirements: [] });
  });
});

describe('logic conversion', () => {
  it('converts every stage on the slice disc and sends the logic, models, cockpit-hud-map and audio groups with one manifest identity', async () => {
    const imported = await syntheticImport(sliceCoveredFiles(), 'logic-job-disc');
    let source: VerifiedSource | undefined;
    let captured: LogicStepGroups | undefined;
    // The production conversion, capturing the drafts the job then identifies and sends, and the bound models.
    const logic = {
      ...PRODUCTION_LOGIC_STEP,
      convert: async (...args: Parameters<typeof PRODUCTION_LOGIC_STEP.convert>) => (captured = await PRODUCTION_LOGIC_STEP.convert(...args)),
    };
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), undefined, logic), imported.files);
    const counts = progress(messages, reads);
    expect(steps(messages)).toEqual(['identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    expect(typesOf(messages).filter(type => type === 'progress:convert-logic').length).toBeGreaterThan(1);
    expect(typesOf(messages).filter(type => type === 'progress:convert-models').length).toBeGreaterThan(1);

    const groups = messages.filter(message => message.type === 'group');
    const last = messages.at(-1);
    if (last?.type !== 'finished') throw new Error('expected the job to finish');
    expect(groups.map(({ group }) => group)).toEqual(['logic', 'models', 'cockpit-hud-map', 'audio']);
    expect(last.groups).toEqual(['logic', 'models', 'cockpit-hud-map', 'audio']);
    for (const group of ['logic', 'audio']) expect(validateGroup(CLASSIC_P2_SLICE, sentGroup(messages, group).input)).toMatchObject({ status: 'group-complete' });
    expect(validateGroup(CLASSIC_P2_SLICE, sentGroup(messages, 'cockpit-hud-map').input)).toMatchObject({ status: 'group-complete', externalRequirements: [] });
    // One identity derived from every sent draft; payloads, already transferred, are not part of the derivation.
    const basis = productionIdentityBasis(source!.identity.fingerprint);
    const manifests = groups.map(({ input }) => readGroupManifest(input.manifest));
    const { drafts, models: bindings } = captured!;
    expect(manifests[0].identity).toEqual({ ...basis, manifestIdentity: deriveManifestIdentity(basis, [...drafts, ...groups.slice(1).map(sentDraft)]) });
    expect(manifests.every(({ identity }) => identity.manifestIdentity === manifests[0].identity.manifestIdentity)).toBe(true);
    expect(PRODUCTION_CONVERTER_VERSION).toBe('osr-import.graphics-2.logic-1.audio-1.models-3');

    const readUsage = source!.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    // The graphics and sound usage, the three logic Assets with their eight edges, mission data and payload bytes, and
    // the bound models.
    const logicBytes = drafts[0].assets.reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0);
    const logicUsage = { ...EMPTY_BUDGET_USAGE, assets: 3, dependencyEdges: 8, missionObjects: 11, missionReferences: 37, payloadBytes: logicBytes };
    expect(last.usage).toEqual({
      ...addBudgets(addBudgets(addBudgets(PRODUCTION_CONVERSION_USAGE, logicUsage), PRODUCTION_MODEL_USAGE), PRODUCTION_EFFECT_USAGE),
      sourceReadBytes: readUsage.sourceReadBytes,
    });

    // The models group the receiver validates is the one Node derives from the same source and binding: the graphics
    // models partition with the five bound craft models, the debris model and the three effect data Assets. Every role
    // has its Assets (AC-20) and no texture mapping is unconfirmed (AC-14), so the group is complete; its sounds are
    // external requirements the audio group satisfies.
    const graphics = await runGraphicsStep(source!, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, UNLIMITED_BUDGET);
    const models = await runModelStep(source!, productionModelMappings(bindings), productionModelDeclarations(bindings), PRODUCTION_MODEL_REFERENCES, UNLIMITED_BUDGET);
    const effects = await runEffectStep(source!, PRODUCTION_EFFECT_MAPPINGS, PRODUCTION_EFFECT_DECLARATIONS, UNLIMITED_BUDGET);
    const expected = modelsGroupDraft([graphics, models, effects], source!.identity.fingerprint);
    const sent = sentGroup(messages, 'models');
    expect(sentDraft(sent)).toEqual({ ...expected, payloads: [] });
    expect(bindings.map(({ id }) => id).every(id => expected.assets.some(asset => asset.id === id))).toBe(true);
    const result = validateGroup(CLASSIC_P2_SLICE, sent.input);
    if (result.status !== 'group-complete') throw new Error(`expected a complete models group, got ${JSON.stringify(result)}`);
    expect(result.externalRequirements.length).toBeGreaterThan(0);
    expect(result.externalRequirements.every(({ kind }) => kind === 'sound')).toBe(true);
  });

  it('sends no group when the job fails after the logic step, such as on invalid usage', async () => {
    const imported = await syntheticImport(sliceCoveredFiles(), 'logic-job-disc');
    const invalid = {
      ...PRODUCTION_LOGIC_STEP,
      convert: async (...args: Parameters<typeof PRODUCTION_LOGIC_STEP.convert>) =>
        ({ ...await PRODUCTION_LOGIC_STEP.convert(...args), usage: { ...EMPTY_BUDGET_USAGE, missionObjects: -1 } }),
    };
    const messages = await run(createImportJob(imported.open, NO_GRAPHICS, invalid), imported.files);
    expect(typesOf(messages).filter(type => !type.startsWith('progress'))).toEqual(['identified', 'failed']);
    expect(messages.at(-1)).toMatchObject({ type: 'failed', error: { layer: 'content', code: 'invalid-budget-value' } });
  });

  it('fails without a group when the logic step fails, keeping the source layer and the budget limit', async () => {
    const imported = await syntheticImport(sliceCoveredFiles(), 'logic-job-disc');
    // Without the graphics and model shares, the job limit is the input size plus the logic share alone.
    const tight = { ...PRODUCTION_LOGIC_STEP, share: { ...PRODUCTION_LOGIC_STEP.share, assets: 2 } };
    const messages = await run(createImportJob(imported.open, NO_GRAPHICS, tight, undefined, NO_MODELS), imported.files);
    expect(typesOf(messages).filter(type => !type.startsWith('progress'))).toEqual(['identified', 'failed']);
    expect(messages.at(-1)).toMatchObject({
      type: 'failed',
      error: { layer: 'source', code: 'budget-exceeded', location: 'archive:/MAIN/SCENARIO.NOB#3019', limit: { name: 'assets', limit: 2, observed: 3 } },
    });
  });
});

describe('audio conversion', () => {
  interface AudioJobOptions {
    readonly audio?: AudioStageInput;
    readonly graphics?: GraphicsStepInput;
    /** Gives one sound a `flags` value the synthetic rules reject. */
    readonly corrupt?: boolean;
    readonly wrap?: (open: OpenSource) => OpenSource;
  }

  /** Runs the production job with `graphics` and `audio` on a synthetic disc of the production graphics and the synthetic sounds. */
  async function audioJob({ audio = SYNTHETIC_AUDIO, graphics, corrupt = false, wrap = open => open }: AudioJobOptions = {}) {
    const imported = await syntheticImport(audioCoveredFiles(corrupt), 'audio-job-disc');
    let source: VerifiedSource | undefined;
    const open = wrap(async inputs => (source = await imported.open(inputs)));
    const messages = await run(createImportJob(open, graphics, NO_LOGIC, audio, NO_MODELS), imported.files);
    return { messages, source: source! };
  }

  it('converts the audio group after the graphics step, sends it with the package identity and adds every usage', async () => {
    const reads = blobReads();
    const { messages, source } = await audioJob();
    const counts = progress(messages, reads);
    expect(steps(messages)).toEqual(['identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    // The audio stage starts once, then reports each archive read of mapping verification and conversion.
    expect(messages.filter(message => message.type === 'progress' && message.stage === 'convert-audio').length).toBeGreaterThan(1);
    const audioGroup = sentGroup(messages, 'audio');
    expect(validateGroup(CLASSIC_P2_SLICE, audioGroup.input)).toMatchObject({ status: 'group-complete', group: 'audio' });
    const manifest = readGroupManifest(audioGroup.input.manifest);
    const basis = productionIdentityBasis(source.identity.fingerprint);
    expect(manifest.identity).toEqual({
      ...basis,
      // Over exactly the sent groups; payloads are not part of the derivation.
      manifestIdentity: deriveManifestIdentity(basis, ['models', 'cockpit-hud-map', 'audio'].map(group => sentDraft(sentGroup(messages, group)))),
    });
    expect(manifest.assets.map(({ id, role }) => [id, role])).toEqual([
      ['sound/explosion', 'explosion-sound'], ['sound/fire', 'fire-sound'], ['sound/missile', 'missile-sound'], ['sound/warp', 'warp-sound'],
    ]);
    const readUsage = source.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    expect(AUDIO_CONVERSION_USAGE).toMatchObject({ assets: 4, payloadBytes: 4 * 16 + 4 + 5 + 3 + 6, audioSamples: 2 + 5 + 3 + 6 });
    // Overlapping dimensions add up: the graphics and four sound Assets, and both conversions' payload bytes.
    expect(messages.at(-1)).toEqual({
      type: 'finished', jobId: 3, sequence: messages.length, groups: ['models', 'cockpit-hud-map', 'audio'],
      usage: {
        ...GRAPHICS_CONVERSION_USAGE, sourceReadBytes: readUsage.sourceReadBytes, assets: GRAPHICS_CONVERSION_USAGE.assets + 4,
        payloadBytes: GRAPHICS_PAYLOAD_BYTES + AUDIO_CONVERSION_USAGE.payloadBytes, audioSamples: AUDIO_CONVERSION_USAGE.audioSamples,
      },
    });
  });

  it('charges the audio stage from zero under its own limits, apart from the graphics share', async () => {
    // Assets and payload bytes exactly at their limits, while the graphics step already charged both. The directory
    // preflight bounds samples by sample bytes, so the 16-bit clip counts twice its sample points there.
    const exact = await audioJob({ audio: { ...SYNTHETIC_AUDIO, limits: { ...AUDIO_CONVERSION_USAGE, audioSamples: 4 + 5 + 3 + 6 } } });
    expect(exact.messages.at(-1)).toMatchObject({ type: 'finished', groups: ['models', 'cockpit-hud-map', 'audio'], usage: { assets: GRAPHICS_CONVERSION_USAGE.assets + 4 } });
    const payloadBytes = AUDIO_CONVERSION_USAGE.payloadBytes;
    const { messages } = await audioJob({ audio: { ...SYNTHETIC_AUDIO, limits: { ...AUDIO_CONVERSION_USAGE, payloadBytes: payloadBytes - 1 } } });
    expect(messages.some(message => message.type === 'group')).toBe(false);
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length,
      error: {
        layer: 'source', code: 'budget-exceeded', location: 'sources.mappings[3].parts[0].alternatives[0].size',
        reason: expect.any(String), limit: { name: 'payloadBytes', limit: payloadBytes - 1, observed: payloadBytes },
      },
    });
  });

  it('sends the cockpit-hud-map group empty without its graphics, changing the package identity but not the models group', async () => {
    const manifest = (messages: readonly ImportWorkerMessage[], group: string) => readGroupManifest(sentGroup(messages, group).input.manifest);
    const modelsOnly = (table: { readonly mappings: readonly { readonly asset: { readonly id: string } }[] }) => {
      const ids = new Set<string>(PRODUCTION_GRAPHICS_DECLARATIONS.filter(({ group }) => group === 'models').map(({ asset }) => asset.id));
      return { ...table, mappings: table.mappings.filter(({ asset }) => ids.has(asset.id)) };
    };
    const graphics: GraphicsStepInput = {
      mappings: modelsOnly(PRODUCTION_GRAPHICS_MAPPINGS),
      declarations: PRODUCTION_GRAPHICS_DECLARATIONS.filter(({ group }) => group === 'models'),
      share: PRODUCTION_GRAPHICS_SHARE,
    };
    const [withCockpit, withoutCockpit] = (await Promise.all([audioJob(), audioJob({ graphics })])).map(({ messages }) => messages);
    // Without the cockpit-hud-map flight palette, the three fonts and the cockpit, HUD and map Assets.
    expect(withoutCockpit.at(-1)).toMatchObject({
      type: 'finished', groups: ['models', 'cockpit-hud-map', 'audio'],
      usage: { assets: GRAPHICS_CONVERSION_USAGE.assets - 4 - COCKPIT_HUD_MAP_USAGE.assets + AUDIO_CONVERSION_USAGE.assets, glyphs: 0 },
    });
    expect(manifest(withoutCockpit, 'cockpit-hud-map').assets).toEqual([]);
    expect(manifest(withoutCockpit, 'models').assets).toEqual(manifest(withCockpit, 'models').assets);
    expect(manifest(withoutCockpit, 'audio').identity.manifestIdentity).not.toBe(manifest(withCockpit, 'audio').identity.manifestIdentity);
  });

  it('fails before sending any group when a sample, or the final usage, is rejected', async () => {
    const corrupt = await audioJob({ corrupt: true });
    expect(corrupt.messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: corrupt.messages.length,
      error: { layer: 'source', code: 'unsupported-payload', location: 'sources.mappings[1].parts[0].alternatives[0].flags', reason: expect.any(String), limit: null },
    });
    // A source whose read usage cannot take the conversion usage: the final usage is checked before any group is sent.
    const overflowing = (open: OpenSource): OpenSource => async inputs => {
      const source = await open(inputs);
      return {
        identity: source.identity, openFile: path => source.openFile(path), openArchive: path => source.openArchive(path),
        usage: () => ({ ...source.usage(), assets: Number.MAX_SAFE_INTEGER }),
      };
    };
    const { messages } = await audioJob({ wrap: overflowing });
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length,
      error: expect.objectContaining({ layer: 'content', code: 'invalid-budget-value', location: 'usage.assets' }),
    });
    expect([...corrupt.messages, ...messages].some(message => message.type === 'group')).toBe(false);
  });
});

describe('model conversion', () => {
  /** Runs the whole production job on a slice disc whose `SR.NOB` entries `edit` changes; `wrap` replaces the source. */
  async function sliceJob(edit: (entries: SyntheticEntry[]) => SyntheticEntry[] = entries => entries, wrap: (open: OpenSource) => OpenSource = open => open) {
    const covered = { ...sliceCoveredFiles(), 'MAIN/SR.NOB': buildImfat(10_000, edit(productionSliceEntries())) };
    const imported = await syntheticImport(covered, 'model-job-disc');
    const messages = await run(createImportJob(wrap(imported.open)), imported.files);
    expect(messages.some(message => message.type === 'group')).toBe(false);
    expect(typesOf(messages).at(-2)).toBe('progress:convert-models');
    return messages.at(-1);
  }

  const without = (id: number) => (entries: SyntheticEntry[]) => entries.filter(entry => entry.id !== id);

  it('keeps the P2-03 location when a model mapping fails verification', async () => {
    expect(await sliceJob(without(DEFAULT_MODEL_IDS[17]))).toMatchObject({
      type: 'failed', error: { layer: 'source', code: 'entry-not-found', location: 'sources.mappings[0].parts[0].alternatives[0]' },
    });
  });

  it.each([
    ['missing', without(PRODUCTION_MESH_ENTRIES.triangle), 'entry-not-found'],
    ['of another type', (entries: SyntheticEntry[]) => entries.map(entry => (entry.id === PRODUCTION_MESH_ENTRIES.triangle ? { ...entry, type: 'MODL' } : entry)), 'entry-type-mismatch'],
  ])('keeps the P2-03 code of a %s mesh, located at its first referencing part', async (_, edit, code) => {
    expect(await sliceJob(edit)).toMatchObject({ type: 'failed', error: { layer: 'source', code, location: 'models[model/base-1].parts[0][0].mesh' } });
  });

  it('keeps a disc-layer failure of a mesh read at the disc layer and its own location', async () => {
    const failingMeshes = (open: OpenSource): OpenSource => async inputs =>
      withMeshReads(await open(inputs), () => Promise.reject(new DiscReadError('read-failed', 'file:/MAIN/SR.NOB', 'the image could not be read')));
    expect(await sliceJob(undefined, failingMeshes)).toMatchObject({ type: 'failed', error: { layer: 'disc', code: 'read-failed', location: 'file:/MAIN/SR.NOB' } });
  });

  it('fails a mesh that breaks its format at the source layer, in the model location grammar', async () => {
    const failed = await sliceJob(() => productionSliceEntries(true));
    expect(failed).toMatchObject({ type: 'failed', error: { layer: 'source', code: 'invalid-payload', location: 'models[model/base-1].parts[0][1].mesh' } });
  });
});

describe('cockpit-hud-map assembly', () => {
  it('limits the graphics step to the read limit plus the graphics, logic and model shares, passing at it and failing past it without a group', async () => {
    const covered = cockpitCoveredFiles();
    const imported = await syntheticImport(covered, 'cockpit-job-disc');
    const graphics = cockpitGraphics();
    const { usage } = await runGraphicsStep(await syntheticSource(covered, 'cockpit-job-disc'), graphics.mappings, graphics.declarations, UNLIMITED_BUDGET);
    // The graphics share is the conversion usage in every dimension but the image pixels, which the three shares split.
    const pixel = { ...EMPTY_BUDGET_USAGE, imagePixels: 1 };
    const job = (imagePixels: number) => createImportJob(
      imported.open, { ...graphics, share: { ...usage, imagePixels: imagePixels - 2 } }, { ...NO_LOGIC, share: pixel }, NO_AUDIO, { ...NO_MODELS, share: pixel },
    );
    expect((await run(job(usage.imagePixels), imported.files)).at(-1)).toMatchObject({ type: 'finished', groups: ['models', 'cockpit-hud-map', 'audio'] });
    const messages = await run(job(usage.imagePixels - 1), imported.files);
    expect(typesOf(messages).filter(type => !type.startsWith('progress'))).toEqual(['identified', 'failed']);
    expect(messages.at(-1)).toMatchObject({
      type: 'failed',
      error: { layer: 'source', code: 'budget-exceeded', location: 'graphics[image/model-texture/01].pixels', limit: { name: 'imagePixels', limit: usage.imagePixels - 1, observed: usage.imagePixels } },
    });
  });

  it('fails before sending any group when a group draft is rejected', async () => {
    const imported = await syntheticImport(cockpitCoveredFiles(), 'cockpit-job-disc');
    // A logic step whose draft claims the group the job assembles from the graphics step.
    const claiming: LogicStepInput = {
      ...NO_LOGIC,
      convert: async (...args) => ({ ...await NO_LOGIC.convert(...args), drafts: [{ group: 'cockpit-hud-map', assets: [], payloads: [], sources: null }] }),
    };
    const messages = await run(createImportJob(imported.open, cockpitGraphics(), claiming, NO_AUDIO, NO_MODELS), imported.files);
    expect(typesOf(messages).filter(type => !type.startsWith('progress'))).toEqual(['identified', 'failed']);
    expect(messages.at(-1)).toMatchObject({ type: 'failed', error: { layer: 'content', code: 'invalid-resource-group', location: 'drafts[1].group' } });
  });
});

describe('package transfer check', () => {
  const FINGERPRINT = `source:sha256:${'ab'.repeat(32)}`;
  const twoGroups = (): PackageGroup[] => (['models', 'audio'] as const).map(group => [group, syntheticSourceGroup(group, FINGERPRINT)]);
  const failure = (groups: readonly PackageGroup[]) => {
    try {
      checkPackageTransfers(groups);
    } catch (error) {
      return { code: (error as { code?: unknown }).code, path: (error as { path?: unknown }).path };
    }
    return null;
  };

  it('accepts groups whose payloads each own a separate buffer', () => {
    expect(failure(twoGroups())).toBeNull();
  });

  it('rejects a buffer shared across groups, and an invalid later group, before any group is sent', () => {
    const shared = twoGroups();
    const [models, audio] = shared.map(([, input]) => input.payloads as { bytes: Uint8Array }[]);
    audio[0].bytes = models[0].bytes;
    expect(failure(shared)).toEqual({ code: 'payload-aliased', path: 'groups.audio.payloads[0]' });
    const detached = twoGroups();
    const [, [, input]] = detached;
    const [payload] = input.payloads as { bytes: Uint8Array }[];
    const buffer = payload.bytes.buffer as ArrayBuffer;
    structuredClone(buffer, { transfer: [buffer] });
    expect(failure(detached)).toEqual({ code: 'payload-detached', path: 'groups.audio.payloads[0].bytes' });
  });
});

describe('app test entry profiles', () => {
  // P2-11 technical decision 7: the development test entry expects the profile of the package its Worker scenario sends.
  it('names the fingerprint each scenario identifies', async () => {
    for (const scenario of Object.keys(SCENARIO_SOURCES) as IdentifyingScenario[]) {
      const { covered, versionId } = SCENARIO_SOURCES[scenario]();
      expect((await syntheticSource(covered, versionId)).identity.fingerprint, scenario).toBe(scenarioProfile(scenario).sourceFingerprint);
    }
  });

  it('names the identity of the package the models and synthetic scenarios send', async () => {
    const models = scenarioProfile('models');
    const imported = await syntheticImport(SCENARIO_SOURCES.models().covered, 'synthetic-models');
    const messages = await run(createImportJob(scenarioOpen('models')), imported.files);
    const groups = messages.flatMap(message => (message.type === 'group' ? [readGroupManifest(message.input.manifest).identity] : []));
    expect(groups).toHaveLength(4);
    for (const identity of groups) {
      expect(identity).toMatchObject({ converterVersion: models.converterVersion, origin: { type: 'original-import', sourceFingerprint: models.sourceFingerprint } });
    }
    const synthetic = scenarioProfile('synthetic');
    for (const [, { manifest }] of boundGroups(synthetic.sourceFingerprint)) {
      expect(readGroupManifest(manifest).identity).toMatchObject({ converterVersion: synthetic.converterVersion, origin: { sourceFingerprint: synthetic.sourceFingerprint } });
    }
  });
});
