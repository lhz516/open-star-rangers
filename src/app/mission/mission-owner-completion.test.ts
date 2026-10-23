vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('../runtime/transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EndingGap } from '../../core/projections/projection.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { injectedResult, injection, type InjectedGap } from '../runtime/transition-injection.test-support.ts';
import { FLOW_SESSION_PHASES } from './mission-flow.ts';
import { PLACEHOLDER_MS, type MissionEndingPlaceholder, type MissionOwner } from './mission-owner.ts';
import {
  elapsePlaceholder, inputProbe, openMission, ownerSetup, skip, TestConsumer, testPorts, toFlight, type OpenMission,
} from './mission.test-support.ts';

// P3-11 AC-11, the owner part (docs/plan/p3/04/spec.md, 终局与救援衔接（P3-11 的修订）: 任务所有者、流程位置与结果页):
// the rescue holds show the running hold's placeholder; a completed run shows one ending placeholder per item, bound to
// the owner's session, the runId and the item's transitionId, each ending once, then the result position; nothing
// resumes the run. Retry takes the restart path to a new run, returning to the main menu releases the owner, and a
// cleanup failure latches. Transitions and completions are injected where the world is created
// (transition-injection.test-support.ts).

afterEach(() => { injection.reset(); });

const SOLO: EndingGap = { gap: 'G-02/8', variant: 'solo' };
const CUTSCENE: EndingGap = { gap: 'G-02/9', row: 15 };

/** An owner in flight with its run anchored at time 0, whose step `step` completes the run with `endingGaps`. */
async function completing(step: number, endingGaps: readonly EndingGap[], plan: Readonly<Record<number, readonly InjectedGap[]>> = {}, overrides: Parameters<typeof openMission>[1] = {}) {
  const setup = await openMission('mission-startable', overrides);
  toFlight(setup.owner, null);
  setup.host.deliver(0);
  injection.plan(plan);
  injection.complete(step, injectedResult(endingGaps));
  return setup;
}

const ending = (owner: MissionOwner): MissionEndingPlaceholder => {
  const placeholder = owner.getSnapshot().endingPlaceholder;
  if (!placeholder) throw new Error('No ending placeholder is shown');
  return placeholder;
};

/** The flow's position runs beside the session's phase. */
function expectInStep(owner: MissionOwner): void {
  const { flow, session } = owner.getSnapshot();
  expect(FLOW_SESSION_PHASES[flow.position], `${flow.position}/${session.phase}`).toContain(session.phase);
}

describe('the rescue holds', () => {
  it('show the running hold\'s placeholder for G-02/5 and G-02/6, and their end resumes flight', async () => {
    for (const gap of ['G-02/5', 'G-02/6'] as const) {
      const setup = await openMission();
      toFlight(setup.owner);
      setup.host.deliver(0);
      injection.plan({ 1: [gap] });
      setup.host.deliver(TICK_MS);
      expect(setup.owner.getSnapshot()).toMatchObject({
        flow: { position: 'transition' }, session: { phase: 'transition' }, endingPlaceholder: null,
        transitionPlaceholder: { gap, runId: 1, transitionId: 1, index: 0, count: 1, status: 'timing' },
      });
      setup.owner.skip(setup.owner.getSnapshot().transitionPlaceholder!.id);
      expect(setup.owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' }, transitionPlaceholder: null });
      injection.reset();
    }
  });
});

describe('the ending', () => {
  it('shows a bound placeholder for the completed run, and its natural end leads to the result without resuming the run', async () => {
    const setup = await completing(1, [SOLO]);
    const { owner, host, timer } = setup;
    host.deliver(TICK_MS);
    const snapshot = owner.getSnapshot();
    expect(snapshot).toMatchObject({
      flow: { position: 'ending', runId: 1, ended: null }, placeholder: null, transitionPlaceholder: null,
      endingPlaceholder: { ...SOLO, runId: 1, transitionId: 1, index: 0, count: 1, status: 'timing', failure: null },
      session: { phase: 'completed', result: { outcome: 'success', endingGaps: [SOLO] } },
    });
    expectInStep(owner);
    expect(timer.delay).toBe(PLACEHOLDER_MS);
    expect(host.pending.size).toBe(0);
    elapsePlaceholder(setup);
    expect(owner.getSnapshot()).toMatchObject({
      flow: { position: 'result', runId: 1 }, endingPlaceholder: null, session: { phase: 'completed', transition: null, result: snapshot.session.result },
      actionError: null,
    });
    expectInStep(owner);
    expect(timer.pending.size).toBe(0);
    expect(host.pending.size).toBe(0);
    expect(setup.run()!.projection().clock.tick).toBe(1);
  });

  it('ends each of two items once by skip; a repeated skip or a late timer ends nothing more', async () => {
    const setup = await completing(2, [SOLO, CUTSCENE], { 1: ['G-02/3'] });
    const { owner, host, timer } = setup;
    host.deliver(TICK_MS);
    owner.skip(owner.getSnapshot().transitionPlaceholder!.id);
    host.deliver(10_000);
    host.deliver(10_000 + TICK_MS);
    const first = ending(owner);
    expect(first).toMatchObject({ ...SOLO, transitionId: 2, index: 0, count: 2 });
    const late = timer.callbacks.at(-1)!;
    owner.skip(first.id);
    const second = ending(owner);
    expect(second).toMatchObject({ ...CUTSCENE, transitionId: 3, index: 1, count: 2 });
    owner.skip(first.id);
    late();
    expect(ending(owner)).toBe(second);
    owner.skip(second.id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'result' }, endingPlaceholder: null, actionError: null });
    owner.skip(second.id);
    expect(owner.getSnapshot().flow.position).toBe('result');
  });

  it('counts only visible time, and a hidden page asks for no resume', async () => {
    const setup = await completing(1, [SOLO]);
    const { owner, host, timer, clock } = setup;
    host.deliver(TICK_MS);
    clock.time += 1_000;
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(ending(owner).status).toBe('waiting');
    expect(timer.pending.size).toBe(0);
    clock.time += 3_600_000;
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(timer.delay).toBe(2_000);
    clock.time += 2_000;
    timer.fire();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'result' }, session: { phase: 'completed', resumeRequired: false, pauseReason: null } });
  });

  it('offers no pause, menu or restart, also not through the input port', async () => {
    const probe = inputProbe();
    const setup = await completing(1, [SOLO], {}, { consumers: [probe.consumer] });
    const { owner, host } = setup;
    host.deliver(TICK_MS);
    const before = owner.getSnapshot();
    owner.pause();
    owner.resume();
    owner.openMenu();
    owner.restart();
    probe.port().togglePause();
    probe.port().openMenu();
    probe.port().clearInput('focus-loss');
    expect(owner.getSnapshot()).toBe(before);
    expect(before.flow.position).toBe('ending');
  });

  it('shows a timing failure without faulting the session, and only leaving remains', async () => {
    const setup = await completing(1, [SOLO]);
    const { owner, host, timer, reportError } = setup;
    timer.scheduleFailure = new Error('timer');
    host.deliver(TICK_MS);
    const failed = ending(owner);
    expect(failed).toMatchObject({ status: 'failed', failure: { cause: timer.scheduleFailure } });
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ending' }, session: { phase: 'completed', error: null } });
    expect(reportError).toHaveBeenCalledWith(timer.scheduleFailure);
    owner.skip(failed.id);
    expect(owner.getSnapshot().flow.position).toBe('ending');
    setup.slot.release();
    expect(setup.guard.active).toBe(0);
  });
});

describe('after the result', () => {
  async function atResult(overrides: Parameters<typeof openMission>[1] = {}): Promise<OpenMission> {
    const setup = await completing(1, [SOLO], {}, overrides);
    setup.host.deliver(TICK_MS);
    elapsePlaceholder(setup);
    expect(setup.owner.getSnapshot().flow.position).toBe('result');
    return setup;
  }

  it('retries through the restart path: G-02/1, the last confirmed wingman preselected, a new seed and a new runId from tick 0', async () => {
    const log: string[] = [];
    const setup = await atResult({ consumers: [new TestConsumer('ui', 'ui', log)] });
    const { owner, guard, seeds, timer } = setup;
    const late = timer.callbacks.at(-1)!;
    expect(guard.active).toBe(1);
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro', runId: null }, session: { phase: 'idle', result: null }, placeholder: { gap: 'G-02/1' } });
    expect(log).toContain('ui:cleanup-1');
    expect(guard.active).toBe(0);
    // The old run's ending timer cannot end the new introduction.
    late();
    expect(owner.getSnapshot().placeholder?.gap).toBe('G-02/1');
    skip(owner);
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', selection: null });
    owner.start();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'departure', runId: 2 }, session: { phase: 'transition', runId: 2, result: null } });
    expect(seeds.draws).toBe(2);
    expect(guard.active).toBe(1);
    expect(setup.run()!.projection().clock.tick).toBe(0);
  });

  it('returning to the main menu releases the owner and everything it holds', async () => {
    const log: string[] = [];
    const setup = await atResult({ consumers: [new TestConsumer('ui', 'ui', log)] });
    setup.slot.release();
    expect(setup.owner.getSnapshot().released).toBe(true);
    expect(setup.session().status().phase).toBe('disposed');
    expect(log.slice(-2)).toEqual(['ui:cleanup-1', 'ui:release']);
    expect(setup.guard.active).toBe(0);
    expect(setup.onCleanupFailure).not.toHaveBeenCalled();
  });

  it('a remount releases the owner at its result first; the next owner starts at G-02/1, and the old timers do nothing', async () => {
    const setup = await atResult();
    const late = setup.timer.callbacks.at(-1)!;
    const ports = testPorts();
    const next = setup.slot.open(() => ownerSetup(setup.holder, ports))!;
    expect(setup.owner.getSnapshot().released).toBe(true);
    expect(setup.session().status().phase).toBe('disposed');
    expect(setup.guard.active).toBe(0);
    expect(next.getSnapshot()).toMatchObject({ ownerId: 2, flow: { position: 'intro', runId: null }, placeholder: { gap: 'G-02/1' } });
    late();
    expect(next.getSnapshot().placeholder?.gap).toBe('G-02/1');
    setup.slot.release();
  });

  it('a retry whose cleanup fails latches: the flow ends, and no retry follows', async () => {
    const log: string[] = [];
    const consumer = new TestConsumer('ui', 'ui', log);
    const setup = await atResult({ consumers: [consumer] });
    const { owner } = setup;
    consumer.runCleanupFailure = new Error('cleanup');
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'cleanup-failed' }, actionError: { operation: 'restart' } });
    expect(owner.getSnapshot().cleanupFailure).not.toBeNull();
    expect(setup.onCleanupFailure).toHaveBeenCalledTimes(1);
    owner.restart();
    expect(owner.getSnapshot().flow.position).toBe('ended');
  });
});
