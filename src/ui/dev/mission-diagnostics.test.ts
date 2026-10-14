import { describe, expect, it, vi } from 'vitest';
import { developmentRecording, type MissionOwnerConsumer } from '../../app/mission/mission-owner.ts';
import { openMission, toFlight } from '../../app/mission/mission.test-support.ts';
import { TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import { COMMAND_TYPES, type Command } from '../../core/contracts/tick-input.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { RECENT_RESULT_LIMIT } from '../game/game-store.ts';
import { commandDraft, editDraft, readDraft } from './command-draft.ts';
import { openDiagnostics, type OpenDiagnostics } from './dev-diagnostics.test-support.ts';
import { createMissionDiagnostics, selectCanRead, selectCanRetry, type MissionDiagnosticsState } from './mission-diagnostics.ts';

/**
 * Results of the drafted commands that P3-06's and P3-07's rules judge in flight with an active player and no target:
 * a throttle step, a preset, a digit without effect in flight, a manual match that needs a target, P3-07's and P3-09's
 * below. Every other one is not implemented yet.
 */
const OUTCOMES: Partial<Record<Command['type'], readonly [string, string | null]>> = {
  // P3-07: the gun starts without charge; target selection, weapon selection, and the energy and damage report pages.
  fire: ['ignored', 'insufficient-charge'],
  speed: ['accepted', null],
  'speed-preset': ['accepted', null],
  'select-number': ['ignored', 'wrong-context'],
  'confirm-selection': ['ignored', 'no-target'],
  target: ['accepted', null],
  'cycle-main-weapon': ['accepted', null],
  'select-missile': ['accepted', null],
  // P3-09: toggle-map opens the map, so the energy and damage report commands after it are judged in the map context,
  // where map-point is accepted; the drafted hover selects no Warp destination.
  'toggle-map': ['accepted', null],
  'map-point': ['accepted', null],
  'request-warp': ['ignored', 'no-destination'],
  energy: ['ignored', 'wrong-context'],
  'damage-report': ['ignored', 'wrong-context'],
};
const outcomeOf = (type: Command['type']) => OUTCOMES[type] ?? ['rejected', 'not-implemented'];

// P3-04 S-07 and AC-22 (Node): the development diagnostics of a real mission owner and session — the event log, frame
// statistics, entity and mission state, command submission through the command feedback, and the recording export
// with its file save (docs/plan/p3/04/spec.md: 开发诊断).

/** Delivers frames on the timed host: `ticks` ticks of host time later, after `gapMs` of waiting on the timing clock. */
function frames(setup: Pick<OpenDiagnostics, 'host' | 'timingClock'>) {
  let hostMs = 0;
  let started = false;
  return (ticks = 1, gapMs = 16) => {
    if (started) hostMs += ticks * TICK_MS;
    started = true;
    setup.timingClock.time += gapMs;
    setup.host.deliver(hostMs);
  };
}

/** A `ui` consumer that records every event each run delivers, and can fail the next frame. */
function eventProbe() {
  const events: { readonly runId: number; readonly event: DomainEvent; readonly commandId: number | null }[] = [];
  const failure = { next: null as Error | null };
  const consumer: MissionOwnerConsumer = {
    stage: 'ui',
    connect: () => ({
      release: () => undefined,
      attachRun(run, { runId }) {
        run.ownCleanup(run.onAny((event, { commandId }) => { events.push({ runId, event, commandId }); return undefined; }));
        run.ownCleanup(run.onFrame(() => {
          const error = failure.next;
          failure.next = null;
          if (error) throw error;
          return undefined;
        }));
      },
    }),
  };
  return { consumer, events, failure };
}

function submit(setup: OpenDiagnostics, command: Command): number | null {
  return setup.ui().feedback.submit(command);
}

function publications(setup: OpenDiagnostics): MissionDiagnosticsState[] {
  const states: MissionDiagnosticsState[] = [];
  setup.diagnostics.reader.subscribe((state) => { states.push(state); });
  return states;
}

describe('mission diagnostics', () => {
  it('logs every event the run delivers with its commandId, as the run delivered them', async () => {
    const probe = eventProbe();
    const setup = await openDiagnostics({ consumers: [probe.consumer] });
    expect(setup.state()).toMatchObject({ runId: null, phase: 'idle' });
    toFlight(setup.owner, 0);
    expect(setup.state()).toMatchObject({ runId: 1, phase: 'running' });
    const next = frames(setup);
    next();
    const id = submit(setup, { type: 'launch' });
    next(3, 200);
    const { log } = setup.state();
    expect(log.total).toBe(probe.events.length);
    expect(log.entries.map(({ tick, type, commandId }) => ({ tick, type, commandId })))
      .toEqual(probe.events.map(({ event, commandId }) => ({ tick: event.tick, type: event.type, commandId })));
    expect(log.entries.find((entry) => entry.commandId === id)?.fields).toEqual([
      ['commandIndex', 0], ['commandType', 'launch'], ['outcome', 'rejected'], ['reason', 'not-implemented'],
    ]);
    expect(log.entries.filter((entry) => entry.type === 'object-instantiated').map((entry) => entry.fields.find(([name]) => name === 'source')?.[1]))
      .toContain('wingman#0');
    setup.diagnostics.clearLog();
    expect(setup.state().log).toEqual({ entries: [], total: 0, truncated: false });
  });

  it('publishes frame statistics at the UI sampling interval, and at once for status changes and timing failures', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const states = publications(setup);
    const next = frames(setup);
    next();
    expect(states).toHaveLength(1);
    expect(states[0].frames).toMatchObject({ samples: 1, totalTicks: 0 });
    for (let frame = 0; frame < 6; frame++) next(1, 16);
    // 96 ms after the last publication: the samples are kept but not yet published.
    expect(states).toHaveLength(1);
    next(1, 16);
    expect(states).toHaveLength(2);
    expect(states[1].frames).toMatchObject({ samples: 8, totalTicks: 7, cappedFrames: 0, failedFrames: 0 });
    next(1, 16);
    setup.owner.pause();
    expect(states.at(-1)).toMatchObject({ phase: 'paused', frames: { samples: 9 } });

    setup.owner.resume();
    next(10, 200);
    expect(setup.state().frames).toMatchObject({ samples: 10 });
    const failure = new Error('clock');
    setup.timingClock.failure = failure;
    const count = states.length;
    next(1, 16);
    expect(states).toHaveLength(count + 1);
    expect(setup.state().frames).toMatchObject({ samples: 10, failedFrames: 1, lastFailure: { cause: failure } });
  });

  it('counts capped frames and their ticks', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    next(12, 120);
    next(2, 120);
    expect(setup.state().frames).toMatchObject({ samples: 3, totalTicks: 7, maxTicks: 5, cappedFrames: 1 });
  });

  it('reads the entity and mission state only when refreshed', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner, 0);
    const next = frames(setup);
    next();
    next(4, 200);
    expect(setup.state().inspection).toEqual({ view: null, error: null });
    setup.diagnostics.refreshSnapshot();
    const { view, error } = setup.state().inspection;
    const snapshot = setup.run()!.snapshot().state;
    expect(error).toBeNull();
    expect(view).toMatchObject({
      runId: 1, tick: 4, clock: snapshot.clock, seed: 0x9e37_79b9, setupHash: snapshot.config.setupHash, mission: snapshot.config.mission,
      wingman: 0, missionStatus: snapshot.missionStatus, player: snapshot.player,
      spawn: { enabled: snapshot.spawn.enabled, queue: snapshot.spawn.queue, records: snapshot.spawn.records.length },
    });
    expect(view!.content).toContainEqual(['sliceId', snapshot.config.content.sliceId]);
    expect(view!.entities.map((entity) => entity.id)).toEqual(snapshot.entities.map((entity) => entity.id));
    expect(view!.entities.some((entity) => entity.id === snapshot.player.entityId)).toBe(true);
    expect(view!.entities.some((entity) => entity.source === 'wingman#0')).toBe(true);
    expect(view!.entities.every((entity) => /^(none|candidate .+|pool \[\d+\]|craft-type bit \d+)$/.test(entity.name))).toBe(true);
    next(2, 200);
    expect(setup.state().inspection.view?.tick).toBe(4);
    setup.diagnostics.refreshSnapshot();
    expect(setup.state().inspection.view?.tick).toBe(6);
  });

  it('submits every drafted command variant through the command feedback, which shows its result', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    // The first tick instantiates the player and the second activates it; P3-06's speed commands need it active.
    next(2, 200);
    expect(readDraft(editDraft(commandDraft('select-number'), 'value', '10')).valid).toBe(false);
    expect(readDraft(editDraft(commandDraft('speed-preset'), 'level', '10')).valid).toBe(false);
    const ids = COMMAND_TYPES.map((type) => {
      const reading = readDraft(commandDraft(type));
      if (!reading.valid) throw new Error(reading.reason);
      return submit(setup, reading.command);
    });
    expect(ids).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
    next(1, 200);
    const results = setup.state().log.entries.filter((entry) => entry.type === 'command-result');
    expect(results.map((entry) => [entry.commandId, entry.fields[1][1], entry.fields[2][1], entry.fields[3][1]]))
      .toEqual(COMMAND_TYPES.map((type, index) => [index + 1, type, ...outcomeOf(type)]));
    // The accepted commands' events reach the log by their own fields: P3-07's, then in request handling the target
    // selection, the map's opening and the automatic target selection, which sees no actual target yet (CR-07, MW-04).
    const combat = setup.state().log.entries.filter(({ type }) => ['target-changed', 'weapon-selected', 'left-page-changed', 'map-toggled'].includes(type));
    expect(combat.map(({ type, fields }) => [type, fields.find(([name]) => name === 'commandIndex')?.[1]])).toEqual([
      ['weapon-selected', COMMAND_TYPES.indexOf('cycle-main-weapon')], ['weapon-selected', COMMAND_TYPES.indexOf('select-missile')],
      ['target-changed', COMMAND_TYPES.indexOf('target')], ['map-toggled', COMMAND_TYPES.indexOf('toggle-map')], ['target-changed', null],
    ]);
    const { recentResults, pendingCommands } = setup.ui().store.reader.getState();
    expect(pendingCommands).toEqual([]);
    const recent = COMMAND_TYPES.length - RECENT_RESULT_LIMIT;
    expect(recentResults.map(({ commandId, commandType, outcome, reason }) => [commandId, commandType, outcome, reason]))
      .toEqual(COMMAND_TYPES.slice(recent).map((type, index) => [recent + index + 1, type, ...outcomeOf(type)]));
  });

  it('submits the map\'s point and Warp request from the editor, and shows Core\'s Warp gate reasons', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    next(2, 200);
    const drafted = (type: Command['type'], values: Readonly<Record<string, string>> = {}) => {
      const reading = readDraft(Object.entries(values).reduce((draft, [field, text]) => editDraft(draft, field, text), commandDraft(type)));
      if (!reading.valid) throw new Error(reading.reason);
      return submit(setup, reading.command);
    };
    drafted('request-warp');
    drafted('toggle-map');
    next(1, 200);
    const { map } = setup.run()!.projection();
    const open = map.readiness === 'ready' && map.player?.state === 'open' ? map.player : null;
    if (open === null) throw new Error('The map is not open');
    // The player's own map pixel, whose centre selects it.
    const { pixel } = open.contacts.find((contact) => contact.class === 'player')!;
    const { width, height } = open.geometry.main;
    drafted('map-point', { operation: 'select', right: String((pixel.column + 0.5) / width), down: String((pixel.row + 0.5) / height) });
    next(1, 200);
    drafted('request-warp');
    next(1, 200);
    // The synthetic craft's energy is −100, so the gate refuses every cost.
    expect(setup.ui().store.reader.getState().recentResults.map(({ commandId, commandType, outcome, reason }) => [commandId, commandType, outcome, reason])).toEqual([
      [1, 'request-warp', 'ignored', 'no-destination'], [2, 'toggle-map', 'accepted', null], [3, 'map-point', 'accepted', null],
      [4, 'request-warp', 'ignored', 'insufficient-energy'],
    ]);
    const player = setup.run()!.projection().player.entityId;
    // The log lists every field (event-log.test.ts checks their order).
    const set = setup.state().log.entries.find((entry) => entry.type === 'warp-destination-set')!;
    expect(set.fields).toHaveLength(11);
    expect(set).toMatchObject({ commandId: null, fields: expect.arrayContaining([
      ['playerEntityId', player], ['column', pixel.column], ['row', pixel.row], ['iconEntityId', expect.any(Number)], ['marker', 'created'], ['commandIndex', 0],
    ]) });
  });

  it('keeps the 10 most recent command results of 11', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    for (let index = 0; index < 10; index++) submit(setup, { type: 'launch' });
    next();
    expect(setup.ui().store.reader.getState().recentResults.map((result) => result.commandId)).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
    submit(setup, { type: 'launch' });
    next();
    expect(setup.ui().store.reader.getState().recentResults.map((result) => result.commandId)).toEqual(Array.from({ length: 10 }, (_, index) => index + 2));
  });

  it('saves the recording so far as compact JSON whose copy later ticks do not change', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    submit(setup, { type: 'fire', channel: 'primary' });
    next(3, 200);
    const expected = JSON.stringify(setup.run()!.exportRecording());
    setup.saves.clickFailure = new Error('click');
    setup.diagnostics.exportRecording();
    const failed = setup.state().recording;
    expect(failed.last).toMatchObject({ status: 'failed', stage: 'save', cause: setup.saves.clickFailure });
    expect(failed.retained?.finalTick).toBe(3);
    expect(selectCanRetry(setup.state())).toBe(true);
    expect(setup.saves.released).toBe(true);

    next(2, 200);
    setup.saves.clickFailure = undefined;
    setup.diagnostics.retrySave();
    const name = failed.retained!.name;
    expect(name).toMatch(/^osr-recording-[0-9a-f]{16}-2654435769-3\.json$/);
    expect(setup.state().recording).toEqual({ last: { status: 'requested', name, finalTick: 3 }, retained: null });
    expect(await setup.saves.text()).toBe(expected);
    expect(setup.saves.names).toEqual([name, name]);
    expect(setup.saves.released).toBe(true);

    setup.diagnostics.exportRecording();
    expect(setup.state().recording.last).toMatchObject({ status: 'requested', finalTick: 5 });
    const latest = JSON.parse(await setup.saves.text()) as { result: { finalTick: number } };
    expect(latest.result.finalTick).toBe(5);
    expect(await setup.saves.text(setup.saves.blobs.length - 2)).toBe(expected);
  });

  it('keeps the copy for a retry when releasing a save fails', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    frames(setup)();
    setup.saves.revokeFailure = new Error('revoke');
    setup.diagnostics.exportRecording();
    expect(setup.state().recording).toMatchObject({ last: { status: 'failed', stage: 'save' }, retained: { finalTick: 0 } });
    expect((setup.state().recording.last as { cause: unknown }).cause).toBeInstanceOf(AggregateError);
    expect(setup.saves.links.size).toBe(0);
  });

  it('gives no new snapshot or export once the run faulted, and still retries a kept copy', async () => {
    const probe = eventProbe();
    const setup = await openDiagnostics({ consumers: [probe.consumer] });
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    setup.diagnostics.refreshSnapshot();
    setup.saves.clickFailure = new Error('click');
    setup.diagnostics.exportRecording();
    setup.saves.clickFailure = undefined;
    probe.failure.next = new Error('consumer');
    next();
    expect(setup.state()).toMatchObject({ runId: 1, phase: 'faulted' });
    expect(selectCanRead(setup.state())).toBe(false);
    const before = setup.state();
    setup.diagnostics.refreshSnapshot();
    setup.diagnostics.exportRecording();
    expect(setup.state()).toBe(before);
    expect(before.inspection.view?.tick).toBe(0);
    setup.diagnostics.retrySave();
    expect(setup.state().recording).toMatchObject({ last: { status: 'requested', finalTick: 0 }, retained: null });
  });

  it('clears everything at a new run, and drops the run\'s snapshot and recording copies when it ends', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    const next = frames(setup);
    next();
    submit(setup, { type: 'launch' });
    next(1, 200);
    setup.diagnostics.refreshSnapshot();
    setup.saves.clickFailure = new Error('click');
    setup.diagnostics.exportRecording();
    const log = setup.state().log;
    expect(log.total).toBeGreaterThan(0);
    setup.owner.restart();
    expect(setup.state()).toMatchObject({
      runId: null, phase: 'idle', log, inspection: { view: null, error: null }, recording: { last: { status: 'none' }, retained: null },
    });
    expect(setup.state().frames.samples).toBe(2);
    setup.diagnostics.retrySave();
    setup.diagnostics.exportRecording();
    setup.diagnostics.refreshSnapshot();
    expect(setup.state()).toMatchObject({ recording: { last: { status: 'none' } }, inspection: { view: null } });
    toFlight(setup.owner);
    expect(setup.state()).toMatchObject({ runId: 2, phase: 'running', log: { total: 0 }, frames: { samples: 0 } });
  });

  it('keeps Core\'s recording identical with and without the diagnostics', async () => {
    const recording = developmentRecording('osr-test');
    const plain = await openMission('mission-startable', { recording });
    const diagnosed = await openDiagnostics();
    for (const owner of [plain.owner, diagnosed.owner]) toFlight(owner, 1);
    const plainFrames = frames({ host: plain.host, timingClock: plain.clock });
    const diagnosedFrames = frames(diagnosed);
    const commands: Command[] = [{ type: 'launch' }, { type: 'map-point', operation: 'select', right: 0.25, down: 1 }, { type: 'select-number', value: 3 }];
    for (const [index, command] of commands.entries()) {
      plainFrames(index + 1, 0);
      diagnosedFrames(index + 1, 0);
      plain.run()!.submitCommand(command);
      const reading = readDraft(Object.entries(command).reduce((draft, [field, value]) => (field === 'type' ? draft : editDraft(draft, field, String(value))), commandDraft(command.type)));
      if (!reading.valid) throw new Error(reading.reason);
      submit(diagnosed, reading.command);
      diagnosed.diagnostics.refreshSnapshot();
      diagnosed.diagnostics.exportRecording();
    }
    plainFrames(70, 0);
    diagnosedFrames(70, 0);
    diagnosed.diagnostics.clearLog();
    const plainRecording = JSON.stringify(plain.run()!.exportRecording());
    expect(JSON.parse(plainRecording)).toMatchObject({ result: { finalTick: 10 } });
    expect(JSON.stringify(diagnosed.run()!.exportRecording())).toBe(plainRecording);
    expect(diagnosed.saves.blobs).toHaveLength(3);
  });

  it('releases its subscriptions and file save with the owner, and serves one owner', async () => {
    const setup = await openDiagnostics();
    toFlight(setup.owner);
    frames(setup)();
    expect(() => setup.diagnostics.consumer.connect({} as never)).toThrow(/one owner/);
    const files = setup.files()!;
    setup.slot.release();
    const before = setup.state();
    expect(setup.onCleanupFailure).not.toHaveBeenCalled();
    expect(files.save('late.json', '{}')).toEqual({ status: 'failed', reason: 'disposed' });
    expect(setup.saves.created).toBe(0);
    setup.diagnostics.exportRecording();
    setup.diagnostics.refreshSnapshot();
    setup.diagnostics.clearLog();
    expect(setup.state()).toBe(before);
  });

  it('latches a failing release as the owner\'s cleanup failure', async () => {
    const setup = await openDiagnostics();
    const failure = new Error('dispose');
    vi.spyOn(setup.files()!, 'dispose').mockImplementation(() => { throw failure; });
    setup.slot.release();
    expect(setup.onCleanupFailure).toHaveBeenCalledOnce();
    const cause = setup.onCleanupFailure.mock.calls[0][0] as AggregateError;
    expect(cause).toBeInstanceOf(AggregateError);
    expect(cause.errors).toEqual([failure]);
  });

  it('rolls back its connection when the timing refuses a subscription', async () => {
    const dispose = vi.fn(() => undefined);
    const refusal = new Error('subscribe');
    const diagnostics = createMissionDiagnostics({
      timing: { subscribe: () => { throw refusal; } },
      fileSave: () => ({ save: () => ({ status: 'requested' }), dispose }),
    });
    await expect(openMission('mission-startable', { consumers: [diagnostics.consumer] })).rejects.toBe(refusal);
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => createMissionDiagnostics({ timing: {} as never, fileSave: () => ({}) as never })).toThrow(TypeError);
  });
});
