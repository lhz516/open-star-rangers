import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ASSET_ID_LIMITS } from '../src/content/asset-id.ts';
import { validatePackage } from '../src/content/completeness.ts';
import { contentIdentityKey } from '../src/content/content-identity.ts';
import { readEffectPayload } from '../src/content/effects/effect-payload.ts';
import type { ExplosionTable } from '../src/content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../src/content/flight/flight-data-payload.ts';
import { decodeMapGeometryPayload, MAP_GEOMETRY_ROLE } from '../src/content/hud/map-geometry-payload.ts';
import { decodeLogicPayload } from '../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { readModelPayload } from '../src/content/models/model-payload.ts';
import { readPayloadRecords } from '../src/content/payload.ts';
import { decodeRuleDataPayload } from '../src/content/rule-data/rule-data-payload.ts';
import { CLASSIC_P2_SLICE } from '../src/content/slice-definition.ts';
import { CORE_LIMITS } from '../src/core/contracts/limits.ts';
import { COMMAND_TYPES, readTickInput, type Command, type TickInput } from '../src/core/contracts/tick-input.ts';
import { CoreInputError } from '../src/core/errors.ts';
import { compareReplayResults } from '../src/core/replay/compare.ts';
import { createRecordingSession, GAME_REPLAY_VERSION, type Recording } from '../src/core/replay/recording.ts';
import { roundTrip } from '../src/core/replay/replay.test-support.ts';
import { replayRecord, type ReplayContent } from '../src/core/replay/replay.ts';
import { RULES_VERSION } from '../src/core/replay/rules-version.ts';
import { instantiableModelIds, type CreateWorldInput } from '../src/core/world/create-world.ts';
import { PRODUCTION_MISSION, PRODUCTION_RAW_DIFFICULTY } from '../src/core/world/run-config.ts';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import type { ImportJob } from '../src/workers/import-host.ts';
import { createImportJob } from '../src/workers/import-job.ts';
import {
  EXCEPTION_MARKER, IMPORT_SCENARIOS, MISSION_SCENARIOS, scenarioFiles, scenarioGroups, scenarioSource,
} from '../src/workers/import-scenarios.test-support.ts';
import { MARKER, scenarioOpen } from '../src/workers/synthetic-import.test-support.ts';
import {
  exitCode, LONGEST_RECORDING_PARTS, main, RECORDING_MAX_BYTES, recordingSizeBound, REPLAY_CHECK_ERROR_CODES, runReplayCheck,
  type ReplayCheckReport,
} from './replay-check.ts';

// The recording is read through `open`; a test can wrap the next handle to change the file while it is read.
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, open: vi.fn(actual.open) };
});

const SCENARIO = 'mission-startable';
const DIRECTORY_MARKER = 'PRIVATE-MARKER-replay-check';
const directory = mkdtempSync(join(tmpdir(), `osr-replay-check-${DIRECTORY_MARKER}-`));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const REPORT_KEYS = ['format', 'version', 'passed', 'error', 'identity', 'mission', 'setupHash', 'finalTick', 'events', 'checkpoints', 'comparison'];
const TICKS = 40;
const INTERVAL = 8;

/** The report as printed, checked to have the fixed shape and to hold no host path, file-name marker or exception text. */
function printed(report: ReplayCheckReport): string {
  expect(Object.keys(report)).toEqual(REPORT_KEYS);
  if (report.error) expect(REPLAY_CHECK_ERROR_CODES).toContain(report.error.code);
  const text = JSON.stringify(report);
  for (const hidden of [MARKER, DIRECTORY_MARKER, directory, EXCEPTION_MARKER]) expect(text).not.toContain(hidden);
  return text;
}

/** A report that failed with `code` at `location` before reaching anything. */
const nothing = (code: string, location: string) => ({
  format: 'osr-replay-check', version: 1, passed: false, error: { code, location },
  identity: null, mission: null, setupHash: null, finalTick: null, events: null, checkpoints: null, comparison: null,
});

/** Writes the scenario's CloneCD file set under `into` and returns its paths. */
async function writeDisc(into: string): Promise<string[]> {
  mkdirSync(into, { recursive: true });
  return Promise.all((await scenarioFiles(SCENARIO)).map(async file => {
    const path = join(into, `disc-${MARKER}${extname(file.name)}`);
    writeFileSync(path, new Uint8Array(await file.arrayBuffer()));
    return path;
  }));
}

/**
 * A fixed script of steering and commands: one Core answers `not-implemented`, and P3-06's throttle step, preset and
 * speed assist switch, the switch adding its own events.
 */
function script(tick: number): TickInput {
  const commands: Command[] = [];
  if (tick % 4 === 0) commands.push({ type: 'fire', channel: 'primary' }, { type: 'speed', operation: 'increase' });
  if (tick % 6 === 0) commands.push({ type: 'speed-preset', level: (tick % 9) + 1 });
  if (tick % 8 === 0) commands.push({ type: 'speed', operation: 'toggle-auto-match' });
  return { axes: { pitch: tick % 3 === 0 ? -0.5 : 0, yaw: 0.25, roll: tick % 5 === 0 ? 1 : 0 }, commands };
}

/**
 * A recording of the scenario's world with the first wingman, made as the development build makes it: the three logic
 * Assets, the craft info, the rule-data inputs and the run's models of its package (found by role and reference here,
 * independently of the tool), its identity and the production run.
 */
async function record(): Promise<{ readonly recording: Recording; readonly identity: string }> {
  const groups = await scenarioGroups(SCENARIO);
  const validation = validatePackage(CLASSIC_P2_SLICE, groups);
  if (validation.status !== 'complete') throw new Error('the scenario package is incomplete');
  const groupAssets = (name: string) => {
    const group = groups.find(item => item.group === name)!;
    const { assets } = readGroupManifest(group.manifest);
    const payloads = readPayloadRecords(group.payloads);
    type Descriptor = (typeof assets)[number];
    const decoded = (found: (descriptor: Descriptor) => boolean, decode: (bytes: Uint8Array, descriptor: Descriptor) => unknown) => {
      const descriptor = assets.find(found)!;
      return { id: descriptor.id, content: decode(payloads.find(({ id }) => id === descriptor.id)!.bytes, descriptor) };
    };
    return decoded;
  };
  const logic = groupAssets('logic');
  const models = groupAssets('models');
  const asset = (role: string, decode: typeof decodeLogicPayload | typeof decodeRuleDataPayload = decodeLogicPayload) =>
    logic(item => item.role === role, (bytes, descriptor) => decode(bytes, descriptor).content);
  const flightData = (id: string) => models(item => item.id === id, (bytes, descriptor) => decodeFlightDataPayload(bytes, descriptor).content);
  const base = {
    mission: asset('mission'), craftTypes: asset('craft-types'), wingmanRoster: asset('wingman-roster'), identity: validation.identity,
    run: { rawDifficulty: PRODUCTION_RAW_DIFFICULTY, wingman: 0, seed: 0x5eed_1234 },
  } as Pick<CreateWorldInput, 'mission' | 'craftTypes' | 'wingmanRoster' | 'identity' | 'run'>;
  const explosions = models(item => item.role === 'explosion-table', (bytes, descriptor) => decodeFlightDataPayload(bytes, descriptor).content);
  const animations = [...new Set((explosions.content as ExplosionTable).lists.flat().map(({ animation }) => animation.id as string))].sort();
  const input: CreateWorldInput = {
    ...base,
    craftInfo: asset('craft-info', decodeRuleDataPayload),
    debrisParameters: asset('debris-parameters', decodeRuleDataPayload),
    projectileVisuals: models(
      item => item.role === 'projectile' && item.kind === 'data',
      (bytes, descriptor) => readEffectPayload(bytes, descriptor.payloadIdentity.schemaVersion, 'projectile'),
    ),
    explosions,
    explosionAnimations: animations.map(flightData),
    models: instantiableModelIds(base).map(id => models(item => item.id === id, (bytes, descriptor) => readModelPayload(bytes, descriptor.payloadIdentity.schemaVersion))),
    aiPrograms: asset('ai-programs', decodeRuleDataPayload),
    mapGeometry: groupAssets('cockpit-hud-map')(item => item.role === MAP_GEOMETRY_ROLE, (bytes, descriptor) => decodeMapGeometryPayload(bytes, descriptor)),
    commMenus: asset('comm-menus', decodeRuleDataPayload),
    baseRepairItems: asset('base-repair-items', decodeRuleDataPayload),
    commMessages: asset('comm-messages', decodeRuleDataPayload),
  };
  const session = createRecordingSession(input, { producer: 'open-star-rangers replay-check test', checkpointInterval: INTERVAL });
  for (let tick = 1; tick <= TICKS; tick++) session.step(script(tick));
  return { recording: session.exportRecording(), identity: contentIdentityKey(validation.identity) };
}

let disc: string[];
let catalog: unknown;
let recording: Recording;
let identity: string;
beforeAll(async () => {
  disc = await writeDisc(join(directory, 'disc'));
  const source = scenarioSource(SCENARIO)!;
  catalog = catalogFor(source.covered, source.versionId);
  ({ recording, identity } = await record());
});

let files = 0;
/** Writes `content` to a new recording file and returns its path. */
function file(content: string | Uint8Array): string {
  const path = join(directory, `recording-${files++}-${MARKER}.json`);
  writeFileSync(path, content);
  return path;
}

/** The recording as plain data, changed by `edit`. */
function edited(edit: (value: { record: Record<string, unknown>; result: Record<string, unknown> }) => void): string {
  const value = roundTrip(recording) as { record: Record<string, unknown>; result: Record<string, unknown> };
  edit(value);
  return JSON.stringify(value);
}

/** Checks `content` as a recording file against the scenario disc and the scenario's synthetic whitelist. */
async function check(content: string | Uint8Array, options: Parameters<typeof runReplayCheck>[2] = { catalog }): Promise<ReplayCheckReport> {
  const report = await runReplayCheck(file(content), disc, options);
  printed(report);
  return report;
}

/** What a check validates of the recording before it converts the disc. */
const validated = () => ({
  mission: recording.record.mission, setupHash: recording.record.setupHash,
  finalTick: TICKS, events: recording.result.events.length, checkpoints: TICKS / INTERVAL + 1,
});

describe('replay check', () => {
  it('replays a synthetic recording on the same synthetic disc and passes, leaving the file as it was', async () => {
    expect(MISSION_SCENARIOS[SCENARIO].stage).toBe('world');
    // The run spawned craft, answered commands, switched the speed assist and selected a target automatically, so events
    // and checkpoints are both compared.
    expect(new Set(recording.result.events.map(({ type }) => type))).toEqual(new Set(['object-instantiated', 'command-result', 'speed-assist-toggled', 'target-changed']));
    expect(recording.result.events).toContainEqual(expect.objectContaining({ type: 'command-result', commandType: 'speed-preset', outcome: 'accepted' }));
    const text = JSON.stringify(recording);
    const path = file(text);
    const report = await runReplayCheck(path, disc, { catalog });
    printed(report);
    expect(report).toEqual({
      format: 'osr-replay-check', version: 1, passed: true, error: null, identity, ...validated(), comparison: { match: true },
    });
    expect(report.mission).toBe(PRODUCTION_MISSION);
    expect(exitCode(report)).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(text);
    expect(Buffer.byteLength(text)).toBeLessThan(RECORDING_MAX_BYTES);
  });

  it('runs an injected import job instead of the whitelist', async () => {
    expect(await check(JSON.stringify(recording), { job: IMPORT_SCENARIOS[SCENARIO]() })).toMatchObject({ passed: true, identity });
  });

  describe('reading', () => {
    /** Opens the next file for real, and runs `onRead` with its path before each read through the handle. */
    const watchReads = (onRead: (path: string) => void) => {
      const actual = vi.importActual<typeof FsPromises>('node:fs/promises');
      vi.mocked(open).mockImplementationOnce(async (path, flags) => {
        const handle = await (await actual).open(path, flags);
        return {
          stat: (...args: Parameters<FileHandle['stat']>) => handle.stat(...args),
          read: (...args: Parameters<FileHandle['read']>) => {
            onRead(path as string);
            return handle.read(...args);
          },
          close: () => handle.close(),
        } as unknown as FileHandle;
      });
    };

    it('admits a file of exactly the limit, which it then parses, and rejects one byte more unread', async () => {
      const at = file('');
      truncateSync(at, RECORDING_MAX_BYTES);
      expect(await runReplayCheck(at, disc, { catalog })).toEqual(nothing('invalid-recording', 'recording.json'));
      const over = file('');
      truncateSync(over, RECORDING_MAX_BYTES + 1);
      let reads = 0;
      watchReads(() => { reads++; });
      expect(await runReplayCheck(over, disc, { catalog })).toEqual(nothing('file-too-large', 'recording'));
      expect(reads).toBe(0);
    });

    /** Runs `change` on the next file once, just before its first read. */
    const changingOnRead = (change: (path: string) => void) => {
      let changed = false;
      watchReads(path => {
        if (!changed) change(path);
        changed = true;
      });
    };

    it.each([
      ['grows', (path: string) => { appendFileSync(path, ' '); }],
      ['shrinks', (path: string) => { truncateSync(path, 10); }],
    ])('rejects a file that %s while it is read', async (_, change) => {
      changingOnRead(change);
      expect(await check(JSON.stringify(recording))).toEqual(nothing('read-failed', 'recording.changed'));
    });

    it('rejects a file overwritten in place while it is read, even with its size and modification time restored', async () => {
      const text = JSON.stringify(recording);
      const path = file(text);
      // Whole seconds restore exactly; the status change time then advances past the filesystem's timestamp granularity.
      utimesSync(path, 1_000_000_000, 1_000_000_000);
      const { size, mtimeNs } = statSync(path, { bigint: true });
      await new Promise(done => { setTimeout(done, 50); });
      watchReads(() => {
        writeFileSync(path, ` ${text.slice(1)}`);
        utimesSync(path, 1_000_000_000, 1_000_000_000);
        expect(statSync(path, { bigint: true })).toMatchObject({ size, mtimeNs });
      });
      const report = await runReplayCheck(path, disc, { catalog });
      expect(report).toEqual(nothing('read-failed', 'recording.changed'));
    });

    it('rejects a missing file and a directory', async () => {
      expect(await runReplayCheck(join(directory, `missing-${MARKER}.json`), disc, { catalog })).toEqual(nothing('read-failed', 'recording'));
      expect(await runReplayCheck(directory, disc, { catalog })).toEqual(nothing('read-failed', 'recording'));
    });
  });

  describe('the recording', () => {
    it.each([
      ['malformed UTF-8', Uint8Array.of(0x7b, 0xff, 0x7d), 'recording.json'],
      ['text that is not JSON', 'recording', 'recording.json'],
      ['an array', '[]', 'recording'],
      ['null', 'null', 'recording'],
      ['an object without a result', JSON.stringify({ record: {} }), 'recording'],
      ['an object with another field', JSON.stringify({ record: {}, result: {}, notes: 1 }), 'recording'],
    ])('rejects %s at the top level', async (_, content, location) => {
      expect(await check(content)).toEqual(nothing('invalid-recording', location));
    });

    it.each([
      ['another format version', (value: { record: Record<string, unknown> }) => { value.record.version = GAME_REPLAY_VERSION + 1; }, 'record.version'],
      ['the format version before the speed preset', (value: { record: Record<string, unknown> }) => { value.record.version = 1; }, 'record.version'],
      ['another rules version', (value: { record: Record<string, unknown> }) => { value.record.rulesVersion = RULES_VERSION + 1; }, 'record.rulesVersion'],
      ['the rules version before the speed preset', (value: { record: Record<string, unknown> }) => { value.record.rulesVersion = 2; }, 'record.rulesVersion'],
      ['a malformed setup hash', (value: { record: Record<string, unknown> }) => { value.record.setupHash = 'not-a-hash'; }, 'record.setupHash'],
      ['an axis out of range', (value: { record: Record<string, unknown> }) => { (value.record.ticks as TickInput[])[3] = { axes: { pitch: 2, yaw: 0, roll: 0 }, commands: [] }; }, 'record.ticks[3].axes.pitch'],
      ['an extra field', (value: { record: Record<string, unknown> }) => { value.record.extra = true; }, 'record'],
    ])('rejects a record with %s before converting the disc', async (_, edit, location) => {
      expect(await check(edited(edit))).toEqual(nothing('invalid-recording', location));
    });

    it.each([
      ['a negative final tick', (value: { result: Record<string, unknown> }) => { value.result.finalTick = -1; }, 'result.finalTick'],
      ['no checkpoints', (value: { result: Record<string, unknown> }) => { value.result.checkpoints = []; }, 'result.checkpoints'],
      ['an event at tick 0', (value: { result: Record<string, unknown> }) => { (value.result.events as { tick: number }[])[0].tick = 0; }, 'result.events[0].tick'],
      ['an extra field', (value: { result: Record<string, unknown> }) => { value.result.extra = true; }, 'result'],
    ])('rejects an expected result with %s before converting the disc', async (_, edit, location) => {
      const { mission, setupHash } = validated();
      expect(await check(edited(edit))).toEqual({ ...nothing('invalid-recording', location), mission, setupHash });
    });
  });

  describe('the replay', () => {
    it.each([
      ['another content identity', (value: { record: Record<string, unknown> }) => {
        (value.record.content as Record<string, unknown>).manifestIdentity = `manifest:sha256:${'0'.repeat(64)}`;
      }, 'record.content'],
      ['another mission', (value: { record: Record<string, unknown> }) => { value.record.mission = 'mission/other'; }, 'record.mission'],
      ['another setup hash', (value: { record: Record<string, unknown> }) => { value.record.setupHash = '0123456789abcdef'; }, 'record.setupHash'],
    ])('rejects a record with %s without replaying it', async (_, edit, location) => {
      const report = await check(edited(edit));
      expect(report).toEqual({
        format: 'osr-replay-check', version: 1, passed: false, error: { code: 'replay-failed', location }, identity, ...validated(),
        mission: location === 'record.mission' ? 'mission/other' : PRODUCTION_MISSION,
        setupHash: location === 'record.setupHash' ? '0123456789abcdef' : recording.record.setupHash,
        comparison: null,
      });
    });

    it.each([
      ['a seed outside uint32', { seed: -1 }, 'record.run.seed'],
      ['a raw difficulty that is not a number', { rawDifficulty: 'x' }, 'record.run.rawDifficulty'],
      ['an odd step', { clockUnitsPerTick: 3 }, 'record.run.clockUnitsPerTick'],
      ['a raw difficulty of another campaign group', { rawDifficulty: 50 }, 'record.run.rawDifficulty'],
      ['a raw difficulty other than the production one', { rawDifficulty: 20 }, 'record.run.rawDifficulty'],
      ['a wingman the roster lacks', { wingman: 15 }, 'record.run.wingman'],
    ])('rejects a record with %s once world creation reads the run configuration with the content', async (_, run, location) => {
      const report = await check(edited(value => { Object.assign(value.record.run as Record<string, unknown>, run); }));
      expect(report).toEqual({ ...nothing('invalid-recording', location), identity, ...validated() });
    });

    it.each([
      ['a checkpoint hash', (value: { result: Record<string, unknown> }) => {
        (value.result.checkpoints as { hash: string }[])[1].hash = '0123456789abcdef';
      }, { tick: INTERVAL, kind: 'checkpoint' }],
      ['an event', (value: { result: Record<string, unknown> }) => {
        const event = (value.result.events as { type: string; position?: { x: number } }[]).find(({ type }) => type === 'object-instantiated')!;
        event.position!.x += 1;
      }, { tick: 1, kind: 'events' }],
      ['the run length', (value: { record: Record<string, unknown> }) => { (value.record.ticks as unknown[]).pop(); }, { tick: TICKS, kind: 'length' }],
    ])('reports a replay that differs in %s, without changing the file', async (_, edit, difference) => {
      const text = edited(edit as (value: { record: Record<string, unknown>; result: Record<string, unknown> }) => void);
      const path = file(text);
      const report = await runReplayCheck(path, disc, { catalog });
      printed(report);
      expect(report).toEqual({
        format: 'osr-replay-check', version: 1, passed: false, error: { code: 'replay-mismatch', location: 'comparison' }, identity, ...validated(),
        comparison: { match: false, ...difference },
      });
      expect(exitCode(report)).toBe(1);
      expect(readFileSync(path, 'utf8')).toBe(text);
    });
  });

  describe('the content', () => {
    it('rejects an incomplete package at its first diagnostic', async () => {
      const { groupDiagnostic } = MISSION_SCENARIOS['mission-partial'];
      const report = await check(JSON.stringify(recording), { job: IMPORT_SCENARIOS['mission-partial']() });
      // The job sends the incomplete audio group fourth.
      expect(report).toEqual({ ...nothing('content-failed', `groups[3].${groupDiagnostic.path}`), ...validated() });
    });

    it('identifies with the production whitelist by default, which rejects the synthetic disc', async () => {
      expect(await check(JSON.stringify(recording), {})).toEqual({ ...nothing('content-failed', 'identify-source'), ...validated() });
    });

    it('reports a disc file that cannot be opened by its index, and one that changes after it was opened', async () => {
      const missing = [disc[0], join(directory, `missing-${MARKER}.img`)];
      const report = await runReplayCheck(file(JSON.stringify(recording)), missing, { catalog });
      expect(report).toEqual({ ...nothing('read-failed', 'disc[1]'), ...validated() });
      const copy = await writeDisc(join(directory, 'changing'));
      const changing: ImportJob = (inputs, reporter) => {
        appendFileSync(copy[1], new Uint8Array(1));
        return createImportJob(scenarioOpen(SCENARIO))(inputs, reporter);
      };
      const changed = await runReplayCheck(file(JSON.stringify(recording)), copy, { job: changing });
      printed(changed);
      expect(changed).toEqual({ ...nothing('read-failed', 'disc'), ...validated() });
    });

    it('reports an unexpected exception as an internal error of its phase, without its text', async () => {
      expect(await check(JSON.stringify(recording), { job: IMPORT_SCENARIOS['job-throws']() })).toEqual({ ...nothing('internal-error', 'import'), ...validated() });
    });
  });
});

describe('recording size limit', () => {
  const { header, tick, commands, events, checkpoint } = LONGEST_RECORDING_PARTS;

  it('is the derivation from the current Core contracts, below the longest string V8 can parse', () => {
    const bound = recordingSizeBound();
    expect(bound.total).toBe(RECORDING_MAX_BYTES);
    expect(bound.lists.map(({ name, count }) => [name, count])).toEqual([
      ['ticks', CORE_LIMITS.recordedTicks], ['commands', CORE_LIMITS.recordedCommands], ['events', CORE_LIMITS.recordedEvents], ['checkpoints', CORE_LIMITS.recordedCheckpoints],
    ]);
    expect(RECORDING_MAX_BYTES).toBeLessThan(2 ** 29 - 24);
  });

  it('measures values Core accepts, with every command and event variant and the longest number texts', () => {
    expect(JSON.stringify(tick.axes.pitch)).toHaveLength(25);
    expect(JSON.stringify(commands['map-point'].right)).toHaveLength(24);
    expect(Object.keys(commands).sort()).toEqual([...COMMAND_TYPES].sort());
    const longestTick = { ...tick, commands: Object.values(commands) };
    expect(readTickInput(longestTick)).toEqual(longestTick);
    expect(header.mission).toHaveLength(ASSET_ID_LIMITS.totalLength);
    // Core validates the whole record before its content.
    expect(() => replayRecord({ ...header, ticks: [longestTick] }, null as unknown as ReplayContent)).toThrow(new CoreInputError('content', 'must be a plain object'));
    // The longest command result is the last of a tick's full command list.
    const earlier = Array.from({ length: CORE_LIMITS.commandsPerTick - 1 }, (_, commandIndex) => ({ ...events['command-result'], commandIndex }));
    expect(Object.keys(events).sort()).toEqual([
      'command-result', 'energy-allocation-changed', 'energy-depleted', 'explosion-started', 'fragment-expired', 'hit', 'left-page-changed',
      'map-toggled', 'missile-ended', 'object-destroyed', 'object-instantiated', 'object-left-world', 'shot-fired', 'source-released',
      'speed-assist-released', 'speed-assist-toggled', 'speed-matched', 'target-changed', 'target-cleared', 'warp-completed', 'warp-destination-set',
      'warp-started', 'weapon-selected',
      // P3-10's.
      'base-confirmed', 'base-navigated', 'command-delivered', 'departed', 'docked', 'docking-cancelled', 'docking-requested', 'incoming-ended',
      'incoming-started', 'radio-flushed', 'radio-queued', 'radio-taken', 'transition',
      // P3-08's.
      'transponder-deployed', 'wingman-command-consumed',
      // P3-11's.
      'all-clear', 'flight-message', 'mission-completed', 'player-loss-started', 'player-rescued', 'result-latched', 'settlement-deferred',
      'settlement-started', 'teardown-started', 'wingman-loss-timer-expired', 'wingman-loss-timer-started',
    ].sort());
    // P3-09's arrival is the longest event (docs/plan/p3/02/spec.md, MW-05).
    expect(Math.max(...Object.values(events).map((event) => JSON.stringify(event).length))).toBe(JSON.stringify(events['warp-completed']).length);
    // In a tick's order (compare.ts): one speed assist event first, the command results with the switch right after its
    // command's, then request handling, the hit and destruction, the energy, parked and frame-end stages; the selection and
    // page changes without a command anywhere; P3-09's toggle, select and Warp start in request handling as the one
    // additional event of three other commands, and the completion in its stage before the frame end; P3-08's wingman
    // consumption in the object updates and a transponder deployment in request handling. The other speed
    // assist event and the level change of the last command, which may follow its result alone, go in the tick before.
    const before = (event: (typeof events)[keyof typeof events], ticks = 1) => ({ ...event, tick: checkpoint.tick - ticks });
    // P3-10's (CB-13) in two earlier ticks: the message starts three ticks before; two ticks before, the flush and its
    // cancellation in the mission flow, the last command's page change and docking request, a queuing and the take,
    // then in request handling the delivery, base keys of two other commands, a docking and a launch with their
    // transitions. The message ends at the end of the tick before, apart from the take.
    const communications = [
      before(events['incoming-started'], 3),
      ...[
        events['radio-flushed'], events['docking-cancelled'], ...earlier, events['command-result'],
        { ...events['left-page-changed'], commandIndex: CORE_LIMITS.commandsPerTick - 1 }, events['docking-requested'], events['radio-queued'],
        events['radio-taken'], events['command-delivered'], { ...events['base-navigated'], commandIndex: 0 }, { ...events['base-confirmed'], commandIndex: 1 },
        events.docked, events.transition, events.departed, { ...events.transition, gap: 'G-02/4' as const },
      ].map((event) => before(event, 2)),
    ];
    const result = {
      events: [
        ...communications,
        before(events['speed-assist-released']), ...earlier.map((event) => before(event)), before(events['command-result']), before(events['energy-allocation-changed']),
        before(events['incoming-ended']), events['speed-matched'], ...earlier, events['command-result'], events['speed-assist-toggled'], events['object-instantiated'],
        events['weapon-selected'], events['left-page-changed'], events['wingman-command-consumed'], events['target-changed'],
        { ...events['map-toggled'], commandIndex: 60 }, { ...events['warp-destination-set'], commandIndex: 61 }, { ...events['warp-started'], commandIndex: 62 },
        events['transponder-deployed'], events['shot-fired'], events['missile-ended'], events['explosion-started'], events['fragment-expired'], events['source-released'], events.hit,
        events['object-destroyed'], events['energy-depleted'], events['object-left-world'], events['warp-completed'], events['target-cleared'],
      ],
      checkpoints: [{ tick: 0, hash: checkpoint.hash }, checkpoint],
      finalTick: checkpoint.tick,
    };
    expect(compareReplayResults(result, result)).toEqual({ match: true });
    // P3-11's (ME-11, ME-13), each in its causal place over the last seven ticks: the wingman loss message's expiry, the
    // player's destruction with its page change, flush and loss, the wingman's destruction with its timer and a world
    // exit with the all-clear; the escape pod's rescue; the settlement and its deferral; the completion message; the
    // result's due, its latch and the teardown; the completion in the final tick.
    const safe = Number.MAX_SAFE_INTEGER;
    const at = <Event extends { readonly tick: number }>(event: Event, ticks: number, change: Partial<Event> = {}): Event =>
      ({ ...event, ...change, tick: checkpoint.tick - ticks });
    const destruction = (entityId: number, kindBit: number) => [
      at(events.hit, 6, { victimEntityId: entityId, victimKindBit: kindBit }), at(events['object-destroyed'], 6, { entityId, kindBit }),
    ];
    const mission = {
      events: [
        at(events['wingman-loss-timer-expired'], 6), ...destruction(safe, 0), at(events['left-page-changed'], 6),
        at(events['radio-flushed'], 6, { cause: 'player-destroyed' }), at(events['player-loss-started'], 6),
        ...destruction(safe - 1, 1), at(events['wingman-loss-timer-started'], 6, { wingmanEntityId: safe - 1 }),
        at(events['object-left-world'], 6, { kindBit: 19 }), at(events['all-clear'], 6),
        at(events['fragment-expired'], 5, { outcome: 'escape-pod' }), at(events['weapon-selected'], 5), at(events['player-rescued'], 5),
        at(events.transition, 5, { gap: 'G-02/5' }),
        at(events['settlement-started'], 4), at(events['settlement-deferred'], 3), at(events['radio-flushed'], 2), at(events['flight-message'], 2),
        at(events['radio-flushed'], 1, { cause: 'result-due' }),
        at(events['result-latched'], 1, { result: { ...events['result-latched'].result, latchTick: checkpoint.tick - 1 } }),
        at(events['teardown-started'], 1), events['mission-completed'],
      ],
      checkpoints: [{ tick: 0, hash: checkpoint.hash }, checkpoint],
      finalTick: checkpoint.tick,
    };
    expect(compareReplayResults(mission, mission)).toEqual({ match: true });
  });
});

describe('replay check CLI', () => {
  it.each([[[]], [['recording.json']], [['--help', 'recording.json', 'disc.ccd']]])('exits 2 with a usage report for %j', async argv => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(argv)).toBe(2);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual(nothing('usage', 'argv'));
    expect(error.mock.calls[0][0]).toContain(`at most ${RECORDING_MAX_BYTES} bytes`);
  });

  it('exits 1 with the same report shape for an unreadable recording', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main([join(directory, `missing-${MARKER}.json`), ...disc])).toBe(1);
    const report = JSON.parse(log.mock.calls[0][0] as string) as ReplayCheckReport;
    printed(report);
    expect(report).toEqual(nothing('read-failed', 'recording'));
  });

  it('keeps the production whitelist, so the synthetic disc is an unknown source', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main([file(JSON.stringify(recording)), ...disc])).toBe(1);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({ ...nothing('content-failed', 'identify-source'), ...validated() });
  });

  it('runs as a script', () => {
    const { status, stdout } = spawnSync(process.execPath, [join(import.meta.dirname, 'replay-check.ts')], { encoding: 'utf8' });
    expect(status).toBe(2);
    expect(JSON.parse(stdout)).toEqual(nothing('usage', 'argv'));
  });
});
