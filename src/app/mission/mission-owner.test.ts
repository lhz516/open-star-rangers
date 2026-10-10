import { describe, expect, it } from 'vitest';
import { contentIdentityKey } from '../../content/content-identity.ts';
import { initialWorldState, instantiableModelIds, type CreateWorldInput } from '../../core/world/create-world.ts';
import { PRODUCTION_MISSION, PRODUCTION_RAW_DIFFICULTY } from '../../core/world/run-config.ts';
import { FIVE_WINGMAN_NAMES } from '../../original-data/formats/formats.test-support.ts';
import { craftInfoInput, missionInput, modelInputs, ruleDataInputs } from '../resources/mission-input.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { GameSessionError } from '../session/session-errors.ts';
import { FLOW_SESSION_PHASES } from './mission-flow.ts';
import { developmentRecording, MissionUnavailableError, type MissionOwner } from './mission-owner.ts';
import {
  craftInfoJob, elapsePlaceholder, MISSION_SCENARIOS, missionHolder, missionJob, nextSchemaJob, openMission, ownerSetup, sessionProbe, skip, testPorts,
  testSlot, toConfig, toDeparture, toFlight, type OpenMission,
} from './mission.test-support.ts';

// P3-04 AC-07 and AC-08 (Node), the owner part: the flow from G-02/1 to flight, restart and return, the start page's
// selection, seeds, world creation refusals and the bound package generation (docs/plan/p3/04/spec.md: 应用流程,
// 任务开始配置, 开始资格).

const WINGMEN = [null, 0, 1, 2, 3, 4] as const;

const identityKey = (holder: ResourceHolder): string => {
  const completeness = holder.current()?.completeness;
  if (completeness?.status !== 'complete') throw new Error('Expected a complete package');
  return contentIdentityKey(completeness.identity);
};

/** Collects every published snapshot whose flow position is out of step with the session phase. */
function outOfStep(owner: MissionOwner): string[] {
  const found: string[] = [];
  owner.subscribe(() => {
    const { flow, session } = owner.getSnapshot();
    if (!FLOW_SESSION_PHASES[flow.position].includes(session.phase)) found.push(`${flow.position}/${session.phase}`);
  });
  return found;
}

const runOf = (setup: OpenMission) => {
  const run = setup.run();
  if (!run) throw new Error('Expected a run');
  return run;
};

describe('mission owner flow', () => {
  it('runs intro, start page, departure and flight, restarts as a new run at tick 0, and returns', async () => {
    const setup = await openMission();
    const { owner, timer, clock, seeds, guard, host, slot } = setup;
    const stray = outOfStep(owner);
    expect(owner.getSnapshot()).toMatchObject({
      ownerId: 1, released: false, flow: { position: 'intro', runId: null }, session: { phase: 'idle' },
      placeholder: { id: 1, gap: 'G-02/1', variant: null, status: 'timing', failure: null },
    });
    expect(timer.delay).toBe(3_000);
    clock.time = 2_999;
    timer.fire();
    expect(owner.getSnapshot().flow.position).toBe('intro');
    expect(timer.delay).toBe(1);
    clock.time = 3_000;
    timer.fire();

    const config = owner.getSnapshot();
    expect(config.flow).toMatchObject({ position: 'config', selection: 0, startFailure: null });
    expect(config.placeholder).toBeNull();
    expect(config.config).toEqual({
      mission: PRODUCTION_MISSION, campaign: { group: 0, slot: 1 }, rawDifficulty: PRODUCTION_RAW_DIFFICULTY,
      wingmanOptions: FIVE_WINGMAN_NAMES.map((nameCandidates, index) => ({ index, nameCandidates })),
    });
    expect(Object.isFrozen(config.config.wingmanOptions[0])).toBe(true);
    expect({ draws: seeds.draws, guards: guard.active, frames: host.pending.size }).toEqual({ draws: 0, guards: 0, frames: 0 });

    seeds.values = [7];
    owner.start();
    owner.start();
    const departure = owner.getSnapshot();
    expect(departure.flow).toMatchObject({ position: 'departure', runId: 1, startFailure: null });
    expect(departure.placeholder).toMatchObject({ id: 2, gap: 'G-02/2', variant: 'wingman', status: 'timing' });
    expect(departure.session).toMatchObject({ phase: 'transition', runId: 1, transition: { gap: 'G-02/2', variant: 'wingman' } });
    expect(runOf(setup).projection()).toMatchObject({ clock: { tick: 0 }, mission: { wingman: 0, rawDifficulty: PRODUCTION_RAW_DIFFICULTY } });
    expect(runOf(setup).snapshot().state.config).toMatchObject({ seed: 7, wingman: 0 });
    // One seed for the one creation, one leave guard for the run, and no frame while it is held.
    expect({ draws: seeds.draws, guards: guard.active, frames: host.pending.size }).toEqual({ draws: 1, guards: 1, frames: 0 });

    skip(owner);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight', runId: 1 }, placeholder: null, session: { phase: 'running' } });
    host.deliver(0);
    host.deliver(3 * TICK_MS);
    expect(runOf(setup).projection().clock.tick).toBe(3);

    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({
      flow: { position: 'intro', runId: null, ended: null }, session: { phase: 'idle', runId: null }, placeholder: { id: 3, gap: 'G-02/1' },
    });
    expect({ guards: guard.active, frames: host.pending.size, run: setup.run() }).toEqual({ guards: 0, frames: 0, run: null });

    toConfig(owner);
    expect(owner.getSnapshot().flow.selection).toBe(0);
    owner.select(null);
    owner.start();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'departure', runId: 2 }, placeholder: { gap: 'G-02/2', variant: 'solo' } });
    expect(runOf(setup).projection()).toMatchObject({ clock: { tick: 0 }, mission: { wingman: null } });
    expect(runOf(setup).snapshot().state.config.seed).toBe(0x9e37_79b9);
    expect(seeds.draws).toBe(2);
    elapsePlaceholder(setup);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight', runId: 2 }, session: { phase: 'running', runId: 2 } });
    expect(stray).toEqual([]);

    slot.release();
    expect(owner.getSnapshot()).toMatchObject({ released: true, session: { phase: 'disposed' } });
    expect({ guards: guard.active, frames: host.pending.size, lifecycle: host.listeners.size, timers: timer.pending.size })
      .toEqual({ guards: 0, frames: 0, lifecycle: 0, timers: 0 });
    expect(slot.current()).toBeNull();
    // A released owner ignores every intent.
    owner.restart();
    owner.start();
    expect(owner.getSnapshot().flow.position).toBe('flight');
  });

  it.each(WINGMEN)('starts with wingman %s: the run, the departure variant and the next preselection follow it', async (wingman) => {
    const setup = await openMission();
    toDeparture(setup.owner, wingman);
    const variant = wingman === null ? 'solo' : 'wingman';
    expect(setup.owner.getSnapshot().placeholder).toMatchObject({ gap: 'G-02/2', variant });
    expect(setup.owner.getSnapshot().session.transition).toEqual({ gap: 'G-02/2', variant });
    expect(runOf(setup).projection().mission.wingman).toBe(wingman);
    skip(setup.owner);
    setup.owner.restart();
    skip(setup.owner);
    expect(setup.owner.getSnapshot().flow.selection).toBe(wingman);
  });

  it('keeps the confirmed selection across owners of the slot, not unconfirmed edits, and resets for new content or a new slot', async () => {
    const { holder } = await missionHolder();
    const ports = testPorts();
    const { slot } = testSlot();
    const open = (on: ResourceHolder = holder) => slot.open(() => ownerSetup(on, ports))!;
    let owner = open();
    toDeparture(owner, 3);
    owner = open();
    toConfig(owner);
    expect(owner.getSnapshot().flow.selection).toBe(3);
    // Edited but never started: the next owner still shows the confirmed selection.
    owner.select(1);
    owner = open();
    toConfig(owner);
    expect(owner.getSnapshot().flow.selection).toBe(3);
    // A failed start confirms nothing either.
    owner.select(null);
    ports.seeds.failure = new Error('seed');
    owner.start();
    owner = open();
    toConfig(owner);
    expect(owner.getSnapshot().flow.selection).toBe(3);

    // Another content identity starts from the default, whatever index was kept.
    const other = (await missionHolder('mission-create-rejected')).holder;
    expect(identityKey(other)).not.toBe(identityKey(holder));
    owner = open(other);
    toConfig(owner);
    expect(owner.getSnapshot().flow.selection).toBe(0);
    // A page reload is a new app instance with a new slot.
    const reloaded = testSlot().slot.open(() => ownerSetup(holder, testPorts()))!;
    toConfig(reloaded);
    expect(reloaded.getSnapshot().flow.selection).toBe(0);
  });

  it('rejects a selection that is neither null nor a listed option', async () => {
    const { owner } = await openMission();
    toConfig(owner);
    for (const wingman of [5, -1, 1.5, Number.NaN]) expect(() => owner.select(wingman)).toThrow(RangeError);
    expect(owner.getSnapshot().flow.selection).toBe(0);
  });

  it('passes the development recording options to the run and none in production', async () => {
    const recorded = await openMission('mission-startable', { recording: developmentRecording('osr-test') });
    toDeparture(recorded.owner);
    expect(runOf(recorded).exportRecording()!.record).toMatchObject({ producer: 'osr-test', checkpointInterval: 32 });
    const production = await openMission();
    toDeparture(production.owner);
    expect(runOf(production).exportRecording()).toBeNull();
  });
});

describe('mission owner start', () => {
  it('draws one seed per creation attempt, allows repeated values, and never falls back after a seed failure', async () => {
    const setup = await openMission();
    const { owner, seeds, guard } = setup;
    toConfig(owner);
    seeds.failure = new Error('no randomness');
    owner.start();
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'seed', cause: seeds.failure } });
    expect({ draws: seeds.draws, phase: owner.getSnapshot().session.phase, guards: guard.active }).toEqual({ draws: 1, phase: 'idle', guards: 0 });

    for (const value of [-1, 2 ** 32, 1.5, Number.NaN, '1', null]) {
      seeds.failure = undefined;
      seeds.values = [value];
      owner.start();
      expect(owner.getSnapshot().flow.startFailure, String(value)).toMatchObject({ kind: 'seed', cause: expect.any(RangeError) });
      expect(owner.getSnapshot().session.phase).toBe('idle');
    }
    expect(seeds.draws).toBe(7);

    seeds.values = [5, 5];
    owner.start();
    expect(runOf(setup).snapshot().state.config.seed).toBe(5);
    skip(owner);
    owner.restart();
    toDeparture(owner);
    expect(runOf(setup).snapshot().state.config.seed).toBe(5);
    expect(seeds.draws).toBe(9);
  });

  it('keeps a world creation refusal on the start page with its kind, path and reason, for every selection', async () => {
    const setup = await openMission('mission-create-rejected');
    const { owner, seeds, guard, host } = setup;
    toConfig(owner);
    const expected = { kind: 'core-input', ...MISSION_SCENARIOS['mission-create-rejected'].failure };
    for (const [attempt, wingman] of WINGMEN.entries()) {
      owner.select(wingman);
      owner.start();
      expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', selection: wingman, startFailure: { kind: 'rejected', failure: expected } });
      expect({ draws: seeds.draws, guards: guard.active, frames: host.pending.size }).toEqual({ draws: attempt + 1, guards: 0, frames: 0 });
      expect(owner.getSnapshot().session).toMatchObject({ phase: 'idle', runId: null, error: null, cleanupFailed: false });
    }
    expect(setup.onCleanupFailure).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a craft info world creation rejects',
      () => craftInfoJob({ at0C: 0.5 }),
      {
        kind: 'core-input', path: 'input.craftInfo.content.craft[0].at0C',
        reason: 'must be at least 1 once truncated, as the parked travel takes it as a modulus',
      },
    ],
    [
      'a craft info that does not decode',
      () => craftInfoJob('next-schema'),
      { kind: 'content', path: 'logic[data/craft-info].descriptor.payloadIdentity.schemaVersion', reason: 'must be the supported payload schema of the role' },
    ],
    // P3-07 CR-01: the rule-data inputs, and the models of the craft the run instantiates.
    [
      'a DEBRIS table that does not decode',
      () => nextSchemaJob('logic', 'data/debris-parameters'),
      { kind: 'content', path: 'logic[data/debris-parameters].descriptor.payloadIdentity.schemaVersion', reason: 'must be the supported payload schema of the role' },
    ],
    [
      'an explosion table that does not decode',
      () => nextSchemaJob('models', 'data/explosions'),
      {
        kind: 'content', path: 'models[data/explosions].descriptor.payloadIdentity.schemaVersion',
        reason: 'must be the supported flight data payload schema of the role',
      },
    ],
    [
      'a model of the run that does not decode',
      () => nextSchemaJob('models', 'model/player-ship'),
      { kind: 'content', path: 'models[model/player-ship].payload.schemaVersion', reason: 'must be model payload schema 1' },
    ],
  ])('keeps %s of the same package on the start page as a world creation refusal', async (_, job, failure) => {
    const setup = await openMission(await job());
    const { owner, seeds, guard, host } = setup;
    // Eligibility reads only the mission diagnostics, which do not read the craft info.
    toConfig(owner);
    for (const [attempt, wingman] of [null, 0].entries()) {
      owner.select(wingman);
      owner.start();
      expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', selection: wingman, startFailure: { kind: 'rejected', failure } });
      expect({ draws: seeds.draws, guards: guard.active, frames: host.pending.size }).toEqual({ draws: attempt + 1, guards: 0, frames: 0 });
      expect(owner.getSnapshot().session).toMatchObject({ phase: 'idle', runId: null, error: null, cleanupFailed: false });
    }
    expect(setup.onCleanupFailure).not.toHaveBeenCalled();
  });

  it('offers no start for a package without a craft info, as the slice requires one in its logic group', async () => {
    const error = await openMission(await craftInfoJob('missing')).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(MissionUnavailableError);
    const { eligibility } = error as MissionUnavailableError;
    expect(eligibility.status).toBe('package-incomplete');
    if (eligibility.status !== 'package-incomplete') return;
    expect(eligibility.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([{ code: 'role-cardinality', path: expect.stringMatching(/\.roles\.craft-info$/) }]);
  });

  it('starts with the craft info of the package it bound, which the run\'s setup hash binds', async () => {
    const changed = await openMission(await craftInfoJob({ at0C: 500 }));
    const plain = await openMission();
    const hashes = [changed, plain].map((setup) => {
      setup.seeds.values = [7];
      toConfig(setup.owner);
      setup.owner.start();
      return runOf(setup).snapshot().state.config.setupHash;
    });
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('starts with the package\'s rule-data inputs and the models of the craft each run instantiates (P3-07 CR-01)', async () => {
    for (const wingman of [null, 0]) {
      const setup = await openMission();
      setup.seeds.values = [7];
      toConfig(setup.owner);
      setup.owner.select(wingman);
      setup.owner.start();
      // Created independently from the same held package: Core's set of models, decoded as the mission input decodes them.
      const held = setup.holder.current()!;
      if (held.completeness.status !== 'complete') throw new Error('Expected a complete package');
      const assets = missionInput(held.groups.find(({ group }) => group === 'logic')!);
      const base = { ...assets, identity: held.completeness.identity, run: { rawDifficulty: PRODUCTION_RAW_DIFFICULTY, wingman, seed: 7 } };
      const ids = instantiableModelIds(base as Parameters<typeof instantiableModelIds>[0]);
      expect(ids.length).toBeGreaterThan(0);
      const expected = initialWorldState({
        ...base, craftInfo: craftInfoInput(held.groups.find(({ group }) => group === 'logic')!), ...ruleDataInputs(held.groups),
        models: modelInputs(held.groups, ids),
      } as CreateWorldInput);
      expect(runOf(setup).snapshot().state.config.setupHash, String(wingman)).toBe(expected.config.setupHash);
    }
  });

  it('refuses to start once the bound package is gone, without drawing a seed', async () => {
    const setup = await openMission();
    toConfig(setup.owner);
    setup.holder.dispose();
    setup.owner.start();
    expect(setup.owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'package-changed' } });
    expect(setup.seeds.draws).toBe(0);
    expect(setup.session().status().phase).toBe('idle');
  });

  it('refuses to start from a newer generation it did not open, so no Asset of another package mixes in', async () => {
    const { holder } = await missionHolder();
    // A holder view whose replacement notifies nobody, so only the check at confirmation can notice it.
    const silent: ResourceHolder = {
      acceptImport: (job) => holder.acceptImport(job), relist: () => holder.relist(), checkSpace: () => holder.checkSpace(),
      save: () => holder.save(), restore: () => holder.restore(), current: () => holder.current(), beforeReplace: () => () => undefined,
      subscribe: (listener) => holder.subscribe(listener), getSnapshot: () => holder.getSnapshot(), dispose: () => holder.dispose(),
    };
    const ports = testPorts();
    const owner = testSlot().slot.open(() => ownerSetup(silent, ports))!;
    toConfig(owner);
    expect(holder.acceptImport(await missionJob('mission-startable'))).toBe(true);
    expect(holder.current()!.generation).toBe(2);
    owner.start();
    expect(owner.getSnapshot().flow.startFailure).toEqual({ kind: 'package-changed' });
    expect(ports.seeds.draws).toBe(0);
  });

  it('opens only on an eligible package and acquires nothing otherwise', async () => {
    for (const name of ['mission-partial', 'mission-load-failed'] as const) {
      const { holder } = await missionHolder(name);
      const ports = testPorts();
      const { slot, onCleanupFailure } = testSlot();
      let error: unknown;
      try {
        slot.open(() => ownerSetup(holder, ports));
      } catch (caught) {
        error = caught;
      }
      expect(error, name).toBeInstanceOf(MissionUnavailableError);
      expect((error as MissionUnavailableError).eligibility.status).toBe(name === 'mission-partial' ? 'package-incomplete' : 'mission-failed');
      expect({ lifecycle: ports.host.listeners.size, timers: ports.timer.delays.length, current: slot.current() }).toEqual({ lifecycle: 0, timers: 0, current: null });
      expect(onCleanupFailure).not.toHaveBeenCalled();
    }
  });
});

describe('mission owner flight, menu and restart', () => {
  it('pauses and resumes; after a hidden page it stays paused until an explicit resume', async () => {
    const setup = await openMission();
    const { owner, host } = setup;
    toFlight(owner);
    owner.pause();
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    owner.resume();
    expect(owner.getSnapshot().session.phase).toBe('running');
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false });
    owner.resume();
    expect(owner.getSnapshot().actionError).toMatchObject({ operation: 'resume', cause: expect.any(GameSessionError) });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', environmentVisible: true });
    owner.resume();
    expect(owner.getSnapshot()).toMatchObject({ actionError: null, session: { phase: 'running' } });
  });

  it('opens the menu only after pausing, continues only through it, and offers it in flight only', async () => {
    const setup = await openMission();
    const { owner, host } = setup;
    const stray = outOfStep(owner);
    owner.openMenu();
    expect(owner.getSnapshot().flow.position).toBe('intro');
    toConfig(owner);
    owner.openMenu();
    owner.start();
    owner.openMenu();
    expect(owner.getSnapshot().flow.position).toBe('departure');
    skip(owner);

    owner.openMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused', pauseReason: 'user' } });
    // Neither a separate resume nor a pause applies while the menu shows.
    owner.resume();
    owner.pause();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused' } });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    owner.continueFromMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, actionError: { operation: 'continue' }, session: { phase: 'paused' } });
    host.emit({ type: 'visibility', visibility: 'visible' });
    owner.continueFromMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, actionError: null, session: { phase: 'running' } });

    // An already paused run keeps its reason in the menu.
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    owner.openMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused', pauseReason: 'hidden' } });
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro' }, session: { phase: 'idle' } });
    expect(stray).toEqual([]);
  });

  it('ends the flow when the run faults, keeps the leave guard, and restarts from there', async () => {
    const probe = sessionProbe();
    const setup = await openMission('mission-startable', { consumers: [probe.consumer] });
    const { owner, host, guard } = setup;
    const stray = outOfStep(owner);
    toFlight(owner);
    host.deliver(0);
    host.requestFailure = new Error('no frame');
    host.deliver(TICK_MS);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'faulted', runId: 1 }, session: { phase: 'faulted', runId: 1 } });
    expect(guard.active).toBe(1);
    owner.openMenu();
    owner.pause();
    expect(owner.getSnapshot().flow.position).toBe('ended');
    host.requestFailure = undefined;
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro', ended: null }, session: { phase: 'idle' }, cleanupFailure: null });
    expect(guard.active).toBe(0);
    toFlight(owner);
    expect(owner.getSnapshot().flow.runId).toBe(2);
    expect(stray).toEqual([]);
  });
});
