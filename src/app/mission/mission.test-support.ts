import { vi } from 'vitest';
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import { validateGroup } from '../../content/completeness.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';
import { decodeRuleDataPayload, encodeRuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { payloadIdentityOf } from '../../content/synthetic-content.test-support.ts';
import { MISSION_SCENARIOS, scenarioGroups, type MissionScenario, type ScenarioGroup } from '../../workers/import-scenarios.test-support.ts';
import { createMissionSlot, type MissionSlot } from '../composition/mission-slot.ts';
import type { ImportGroupSummary } from '../import/import-job-owner.ts';
import { finishedJob, testHolder, type FakeJob } from '../resources/resource-holder.test-support.ts';
import type { ResourceHolder, ResourceHolderOptions } from '../resources/resource-holder.ts';
import type { GameSessionRun } from '../session/game-session.ts';
import type { GameSessionError } from '../session/session-errors.ts';
import { ControlledHost } from '../session/session-host.test-support.ts';
import type {
  MissionConsumerConnection, MissionInputControl, MissionOwner, MissionOwnerConsumer, MissionOwnerContext, MissionOwnerSetup,
  MissionOwnerStage, MissionRunContext, MissionRunInputControl, MissionSessionView,
} from './mission-owner.ts';
import { PLACEHOLDER_MS } from './mission-owner.ts';
import type { LeaveGuard, MonotonicClock, OneShotTimer, SeedSource } from './mission-ports.ts';

// Node test support for the mission flow, owner and slot (P3-04 subtasks 05, 07 and 09): holders of the subtask 01
// mission scenarios' packages, and ports and consumers the test drives by hand, each of which can be made to fail.

export { MISSION_SCENARIOS, type MissionScenario };

const sent = new Map<MissionScenario, Promise<readonly ScenarioGroup[]>>();

/** Every group a mission scenario's production import job sends; run once per scenario, as the frozen groups never change. */
export function missionGroups(name: MissionScenario): Promise<readonly ScenarioGroup[]> {
  let groups = sent.get(name);
  if (!groups) {
    groups = scenarioGroups(name);
    sent.set(name, groups);
  }
  return groups;
}

interface Sorted {
  readonly complete: readonly ScenarioGroup[];
  readonly incomplete: readonly ImportGroupSummary[];
}

const sorted = new Map<MissionScenario, Promise<Sorted>>();

/** A scenario's groups as the import job owner sorts them: the complete ones, and a summary of each incomplete one. */
function sortedGroups(name: MissionScenario): Promise<Sorted> {
  let result = sorted.get(name);
  if (!result) {
    result = missionGroups(name).then((groups) => {
      const complete: ScenarioGroup[] = [];
      const incomplete: ImportGroupSummary[] = [];
      for (const group of groups) {
        const judged = validateGroup(CLASSIC_P2_SLICE, group);
        if (judged.status === 'group-complete') complete.push(group);
        else incomplete.push(Object.freeze({ group: group.group, status: 'incomplete', assets: null, diagnostics: judged.diagnostics }));
      }
      return { complete, incomplete };
    });
    sorted.set(name, result);
  }
  return result;
}

/**
 * A fresh finished import job of a mission scenario as the import job owner hands it to the holder: its complete groups,
 * and a summary with the group's own diagnostics for each incomplete one.
 */
export async function missionJob(name: MissionScenario): Promise<FakeJob> {
  const { complete, incomplete } = await sortedGroups(name);
  return finishedJob(complete, incomplete);
}

/**
 * How `craftInfoJob` changes the craft-info Asset of the `mission-startable` package: `missing` removes it, which
 * leaves the logic group incomplete; `next-schema` declares its payload at the next payload schema version, which
 * `decodeRuleDataPayload` refuses; `{ at0C }` encodes its content again with every craft record's +0x0C set to it. The
 * last two keep the logic group complete.
 */
export type CraftInfoChange = 'missing' | 'next-schema' | { readonly at0C: number };

function withCraftInfo(logic: ScenarioGroup, change: CraftInfoChange): ScenarioGroup {
  const manifest = structuredClone(logic.manifest) as { assets: AssetDescriptor[] };
  const payloads = structuredClone(logic.payloads) as { id: string; schemaVersion: number; bytes: Uint8Array }[];
  const descriptor = manifest.assets.find(({ role }) => role === 'craft-info')!;
  const payload = payloads.find(({ id }) => id === descriptor.id)!;
  if (change === 'missing') {
    const sources = structuredClone(logic.sources) as { states: { id: string }[] };
    const others = <T extends { readonly id: string }>(items: readonly T[]) => items.filter(({ id }) => id !== descriptor.id);
    return { ...logic, manifest: { ...manifest, assets: others(manifest.assets) }, payloads: others(payloads), sources: { ...sources, states: others(sources.states) } };
  }
  if (change === 'next-schema') {
    payload.schemaVersion += 1;
  } else {
    const info = decodeRuleDataPayload(payload.bytes, descriptor).content as CraftInfo;
    payload.bytes = encodeRuleDataPayload({ role: 'craft-info', content: { ...info, craft: info.craft.map(record => ({ ...record, at0C: change.at0C })) } });
  }
  (descriptor as { payloadIdentity: unknown }).payloadIdentity = { ...payloadIdentityOf(payload.bytes), schemaVersion: payload.schemaVersion };
  return { ...logic, manifest, payloads };
}

/** A fresh finished import job of the `mission-startable` package whose craft-info Asset `change` replaced. */
export async function craftInfoJob(change: CraftInfoChange): Promise<FakeJob> {
  const { complete, incomplete } = await sortedGroups('mission-startable');
  return finishedJob(complete.map(group => (group.group === 'logic' ? withCraftInfo(group, change) : group)), incomplete);
}

/**
 * A fresh finished import job of the `mission-startable` package whose Asset `id` in `group` declares its payload at the
 * next payload schema version, which its decoder refuses; the group stays complete.
 */
export async function nextSchemaJob(group: ScenarioGroup['group'], id: string): Promise<FakeJob> {
  const { complete, incomplete } = await sortedGroups('mission-startable');
  return finishedJob(complete.map((input) => {
    if (input.group !== group) return input;
    const manifest = structuredClone(input.manifest) as { assets: AssetDescriptor[] };
    const payloads = structuredClone(input.payloads) as { id: string; schemaVersion: number }[];
    const descriptor = manifest.assets.find(asset => asset.id === id)!;
    const payload = payloads.find(record => record.id === id)!;
    payload.schemaVersion += 1;
    (descriptor as { payloadIdentity: { schemaVersion: number } }).payloadIdentity = { ...descriptor.payloadIdentity, schemaVersion: payload.schemaVersion };
    return { ...input, manifest, payloads };
  }), incomplete);
}

/**
 * A test holder (fake cache, synthetic profile) holding the package of a mission scenario, or of a finished job such as
 * `craftInfoJob`'s; its listing and commit stay pending.
 */
export async function missionHolder(source: MissionScenario | FakeJob = 'mission-startable', options: Partial<ResourceHolderOptions> = {}) {
  const setup = testHolder(options);
  const job = typeof source === 'string' ? await missionJob(source) : source;
  if (!setup.holder.acceptImport(job)) throw new Error('The holder did not take the mission package');
  return setup;
}

/** A monotonic clock the test sets; while `failure` is set, reads throw it. */
export class TestClock {
  time = 0;
  reads = 0;
  failure: unknown;
  readonly read: MonotonicClock = () => {
    this.reads += 1;
    if (this.failure !== undefined) throw this.failure;
    return this.time;
  };
}

/**
 * A one-shot timer the test fires by hand. `callbacks` keeps every callback ever scheduled, so a test can deliver one
 * late. Cancellation drops the callback before throwing `cancelFailure`, as the port promises.
 */
export class TestTimer implements OneShotTimer {
  readonly pending = new Map<number, { readonly callback: () => undefined; readonly delayMs: number }>();
  readonly callbacks: (() => undefined)[] = [];
  readonly delays: number[] = [];
  readonly cancelled: number[] = [];
  next = 0;
  scheduleFailure: unknown;
  cancelFailure: unknown;

  schedule(callback: () => undefined, delayMs: number): number {
    if (this.scheduleFailure !== undefined) throw this.scheduleFailure;
    const handle = this.next++;
    this.pending.set(handle, { callback, delayMs });
    this.callbacks.push(callback);
    this.delays.push(delayMs);
    return handle;
  }

  cancel(handle: number): undefined {
    this.cancelled.push(handle);
    this.pending.delete(handle);
    if (this.cancelFailure !== undefined) throw this.cancelFailure;
    return undefined;
  }

  /** The delay of the only pending timer; throws unless exactly one is pending. */
  get delay(): number {
    return this.only()[1].delayMs;
  }

  /** Calls back the only pending timer; throws unless exactly one is pending. */
  fire(): void {
    const [handle, { callback }] = this.only();
    this.pending.delete(handle);
    callback();
  }

  only(): [number, { readonly callback: () => undefined; readonly delayMs: number }] {
    if (this.pending.size !== 1) throw new Error(`Expected one pending timer, found ${this.pending.size}`);
    return [...this.pending][0]!;
  }
}

/** Seeds from `values` in order, then `fallback`; while `failure` is set, draws throw it. `draws` counts every call. */
export class TestSeeds {
  values: unknown[] = [];
  fallback = 0x9e37_79b9;
  draws = 0;
  failure: unknown;
  readonly next: SeedSource = () => {
    this.draws += 1;
    if (this.failure !== undefined) throw this.failure;
    return (this.values.length > 0 ? this.values.shift() : this.fallback) as number;
  };
}

/** Counts live leave-guard registrations; registration and revocation can be made to fail. */
export class TestLeaveGuard {
  active = 0;
  registrations = 0;
  revocations = 0;
  registerFailure: unknown;
  revokeFailure: unknown;
  readonly guard: LeaveGuard = () => {
    this.registrations += 1;
    if (this.registerFailure !== undefined) throw this.registerFailure;
    this.active += 1;
    let live = true;
    return () => {
      if (!live) return undefined;
      this.revocations += 1;
      // A failed removal leaves the listener installed, as a host whose removeEventListener throws would.
      if (this.revokeFailure !== undefined) throw this.revokeFailure;
      live = false;
      this.active -= 1;
      return undefined;
    };
  };
}

/** The ports of one owner, and an error outlet that records. */
export function testPorts() {
  return {
    host: new ControlledHost(),
    clock: new TestClock(),
    timer: new TestTimer(),
    seeds: new TestSeeds(),
    guard: new TestLeaveGuard(),
    reportError: vi.fn<(error: unknown) => void>(),
  };
}

export type TestPorts = ReturnType<typeof testPorts>;

/** An owner setup on `holder` with `ports`, no recording and no consumers unless `overrides` says otherwise. */
export function ownerSetup(holder: ResourceHolder, ports: TestPorts, overrides: Partial<MissionOwnerSetup> = {}): MissionOwnerSetup {
  return {
    holder, host: ports.host, seed: ports.seeds.next, clock: ports.clock.read, timer: ports.timer, leaveGuard: ports.guard.guard,
    recording: null, reportError: ports.reportError, ...overrides,
  };
}

/** A slot whose outlets record. */
export function testSlot() {
  const onCleanupFailure = vi.fn<(cause: unknown) => void>();
  const reportError = vi.fn<(error: unknown) => void>();
  const onPackageReplaced = vi.fn<(ownerId: number) => void>();
  const slot: MissionSlot = createMissionSlot({ onCleanupFailure, reportError, onPackageReplaced });
  return { slot, onCleanupFailure, reportError, onPackageReplaced };
}

/**
 * An owner-level consumer at `stage` that only keeps the session view it was given, so a test can read the session
 * and its run as any consumer would.
 */
export function sessionProbe(stage: MissionOwnerStage = 'ui') {
  let context: MissionOwnerContext | null = null;
  const consumer: MissionOwnerConsumer = {
    stage,
    connect: (connected) => {
      context = connected;
      return { release: () => undefined };
    },
  };
  const session = (): MissionSessionView => {
    if (!context) throw new Error('The probe is not connected');
    return context.session;
  };
  return { consumer, session };
}

/** An `input` consumer that keeps the input control port and takes each run's port as the run is wired. */
export function inputProbe() {
  let control: MissionInputControl | null = null;
  let latest: MissionRunInputControl | null = null;
  const consumer: MissionOwnerConsumer<'input'> = {
    stage: 'input',
    connect: (context) => {
      control = context.control;
      return {
        release: () => undefined,
        attachRun: (_, { runId }) => { latest = context.control.forRun(runId); },
      };
    },
  };
  const connected = (): MissionInputControl => {
    if (!control) throw new Error('The probe is not connected');
    return control;
  };
  /** The port of the run wired last. */
  const port = (): MissionRunInputControl => {
    if (!latest) throw new Error('No run is wired');
    return latest;
  };
  return { consumer, control: connected, port };
}

/**
 * Opens an owner through a fresh slot on a holder of scenario `name` (default `mission-startable`), with fresh ports;
 * `overrides` change the owner setup. A session probe is connected after the given consumers: `session()` is its view
 * and `run()` the current run. `reportError` is the owner's outlet; the holder's and the slot's are `holderErrors` and
 * `slotErrors`.
 */
export async function openMission(source: MissionScenario | FakeJob = 'mission-startable', overrides: Partial<MissionOwnerSetup> = {}) {
  const holder = await missionHolder(source);
  const ports = testPorts();
  const slot = testSlot();
  const probe = sessionProbe();
  const consumers = [...(overrides.consumers ?? []), probe.consumer];
  const owner = slot.slot.open(() => ownerSetup(holder.holder, ports, { ...overrides, consumers }));
  if (!owner) throw new Error('The slot opened no owner');
  return {
    holder: holder.holder, cache: holder.cache, holderErrors: holder.reportError,
    // The owner's ports, and its `reportError` outlet.
    ...ports,
    slot: slot.slot, onCleanupFailure: slot.onCleanupFailure, onPackageReplaced: slot.onPackageReplaced, slotErrors: slot.reportError,
    owner, session: probe.session, run: () => probe.session().currentRun(),
  };
}

export type OpenMission = Awaited<ReturnType<typeof openMission>>;

/** Lets `PLACEHOLDER_MS` of visible time pass on the clock and fires the placeholder's timer. */
export function elapsePlaceholder({ clock, timer }: Pick<TestPorts, 'clock' | 'timer'>): void {
  clock.time += PLACEHOLDER_MS;
  timer.fire();
}

/** Skips the owner's current placeholder. */
export function skip(owner: MissionOwner): void {
  const placeholder = owner.getSnapshot().placeholder;
  if (!placeholder) throw new Error('No placeholder is shown');
  owner.skip(placeholder.id);
}

/** From G-02/1 to the start page, then selecting `wingman` unless it is undefined. */
export function toConfig(owner: MissionOwner, wingman?: number | null): void {
  skip(owner);
  if (wingman !== undefined) owner.select(wingman);
}

/** From G-02/1 through the start page into G-02/2, whose run is held. */
export function toDeparture(owner: MissionOwner, wingman?: number | null): void {
  toConfig(owner, wingman);
  owner.start();
}

/** From G-02/1 through the start page and G-02/2 into flight. */
export function toFlight(owner: MissionOwner, wingman?: number | null): void {
  toDeparture(owner, wingman);
  skip(owner);
  const { flow } = owner.getSnapshot();
  if (flow.position !== 'flight') throw new Error(`The owner is not in flight: ${JSON.stringify(flow)}`);
}

/**
 * An owner-level consumer that logs `<name>:<event>` to `log`: its connection, release, each run attachment and that
 * run's cleanup. Each step can be made to fail, and the release can return `close` as an asynchronous close. At the
 * `input` stage its contexts are `MissionInputContext`s.
 */
export class TestConsumer implements MissionOwnerConsumer {
  readonly stage: MissionOwnerStage;
  readonly name: string;
  readonly log: string[];
  readonly contexts: MissionOwnerContext[] = [];
  readonly errors: GameSessionError[] = [];
  connectFailure: unknown;
  releaseFailure: unknown;
  attachFailure: unknown;
  runCleanupFailure: unknown;
  close: PromiseLike<unknown> | undefined;

  constructor(stage: MissionOwnerStage, name: string, log: string[]) {
    this.stage = stage;
    this.name = name;
    this.log = log;
  }

  connect(context: MissionOwnerContext): MissionConsumerConnection {
    this.log.push(`${this.name}:connect`);
    if (this.connectFailure !== undefined) throw this.connectFailure;
    this.contexts.push(context);
    return {
      release: () => {
        this.log.push(`${this.name}:release`);
        if (this.releaseFailure !== undefined) throw this.releaseFailure;
        return this.close;
      },
      attachRun: (run: GameSessionRun, { runId }: MissionRunContext) => {
        this.log.push(`${this.name}:attach-${runId}`);
        run.ownCleanup(() => {
          this.log.push(`${this.name}:cleanup-${runId}`);
          if (this.runCleanupFailure !== undefined) throw this.runCleanupFailure;
          return undefined;
        });
        if (this.attachFailure !== undefined) throw this.attachFailure;
      },
      onSessionError: (error) => { this.errors.push(error); },
    };
  }
}
