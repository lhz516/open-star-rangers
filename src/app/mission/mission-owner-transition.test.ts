vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('../runtime/transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { injection, type InjectedGap } from '../runtime/transition-injection.test-support.ts';
import { PLACEHOLDER_MS, type MissionTransitionPlaceholder } from './mission-owner.ts';
import { elapsePlaceholder, inputProbe, openMission, toFlight, type OpenMission } from './mission.test-support.ts';

// P3-10 AC-13, the owner part (docs/plan/p3/04/spec.md, 运行中衔接（P3-10 的修订）): one placeholder per item of a running
// hold, bound to the owner's session, the runId and the item's transitionId; it ends once, naturally or by skip, so a
// late timer or a repeated skip never ends the next item or hold. Hidden pages, intents, faults and release keep their
// protections. Transitions are injected where the world is created (transition-injection.test-support.ts).

afterEach(() => { injection.reset(); });

/** An owner in flight with its run anchored at time 0; the next step is the first of `plan`. */
async function flying(plan: Readonly<Record<number, readonly InjectedGap[]>>, overrides: Parameters<typeof openMission>[1] = {}) {
  const setup = await openMission('mission-startable', overrides);
  toFlight(setup.owner);
  setup.host.deliver(0);
  injection.plan(plan);
  return setup;
}

const held = (setup: OpenMission): MissionTransitionPlaceholder => {
  const placeholder = setup.owner.getSnapshot().transitionPlaceholder;
  if (!placeholder) throw new Error('No transition placeholder is shown');
  return placeholder;
};

describe('the placeholders of a running hold', () => {
  it('shows one bound to the hold\'s item, and its natural end resumes flight without catching up', async () => {
    const setup = await flying({ 2: ['G-02/3'] });
    const { owner, host, timer } = setup;
    const before = owner.getSnapshot().placeholder;
    host.deliver(5 * TICK_MS);
    const snapshot = owner.getSnapshot();
    expect(snapshot).toMatchObject({
      flow: { position: 'transition', runId: 1 }, placeholder: null, session: { phase: 'transition' },
      transitionPlaceholder: { gap: 'G-02/3', runId: 1, transitionId: 1, index: 0, count: 1, status: 'timing', failure: null },
    });
    expect(before).toBeNull();
    expect(timer.delay).toBe(PLACEHOLDER_MS);
    expect(host.pending.size).toBe(0);
    elapsePlaceholder(setup);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' }, transitionPlaceholder: null });
    // One loop again: a single frame request.
    expect(host.pending.size).toBe(1);
    host.deliver(100_000);
    expect(setup.run()!.projection().clock.tick).toBe(2);
    host.deliver(100_000 + TICK_MS);
    expect(setup.run()!.projection().clock.tick).toBe(3);
  });

  it('ends each item of a sequence once by skip, and a repeated skip or a late timer ends nothing more', async () => {
    const setup = await flying({ 1: ['G-02/3', 'G-02/4'] });
    const { owner, host, timer } = setup;
    host.deliver(TICK_MS);
    const first = held(setup);
    const late = timer.callbacks.at(-1)!;
    owner.skip(first.id);
    const second = held(setup);
    expect(second).toMatchObject({ gap: 'G-02/4', transitionId: 2, index: 1, count: 2 });
    expect(second.id).toBeGreaterThan(first.id);
    owner.skip(first.id);
    late();
    expect(held(setup).transitionId).toBe(2);
    owner.skip(second.id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' }, transitionPlaceholder: null });
    owner.skip(second.id);
    expect(owner.getSnapshot().flow.position).toBe('flight');
  });

  it('binds a second hold of the run to its own transitionId; the first hold\'s skip and timer do nothing', async () => {
    const setup = await flying({ 1: ['G-02/3'], 2: ['G-02/4'] });
    const { owner, host, timer } = setup;
    host.deliver(TICK_MS);
    const first = held(setup);
    const late = timer.callbacks.at(-1)!;
    owner.skip(first.id);
    host.deliver(10_000);
    host.deliver(10_000 + TICK_MS);
    const second = held(setup);
    expect(second).toMatchObject({ gap: 'G-02/4', transitionId: 2, runId: 1 });
    owner.skip(first.id);
    late();
    expect(held(setup)).toBe(second);
    expect(owner.getSnapshot().flow.position).toBe('transition');
  });

  it('counts only visible time, and a hold hidden on the way ends paused (hidden) for an explicit resume', async () => {
    const setup = await flying({ 1: ['G-02/4'] });
    const { owner, host, timer, clock } = setup;
    host.deliver(TICK_MS);
    clock.time += 1_000;
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(held(setup).status).toBe('waiting');
    expect(timer.pending.size).toBe(0);
    clock.time += 3_600_000;
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(timer.delay).toBe(2_000);
    clock.time += 2_000;
    timer.fire();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'paused', pauseReason: 'hidden', resumeRequired: true } });
    owner.resume();
    expect(owner.getSnapshot().session.phase).toBe('running');
  });

  it('offers no pause, menu or restart during the hold, also not through the input port', async () => {
    const probe = inputProbe();
    const setup = await flying({ 1: ['G-02/3'] }, { consumers: [probe.consumer] });
    const { owner, host } = setup;
    host.deliver(TICK_MS);
    owner.pause();
    owner.openMenu();
    owner.restart();
    probe.port().togglePause();
    probe.port().openMenu();
    probe.port().clearInput('focus-loss');
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'transition' }, session: { phase: 'transition' }, actionError: null });
  });

  it('ignores a skip from inside the session\'s notification, which could not end the hold', async () => {
    const setup = await flying({ 1: ['G-02/3'] });
    const { owner, host } = setup;
    owner.subscribe(() => {
      const placeholder = owner.getSnapshot().transitionPlaceholder;
      if (placeholder) owner.skip(placeholder.id);
    });
    host.deliver(TICK_MS);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'transition' }, transitionPlaceholder: { status: 'timing' }, actionError: null });
    owner.skip(held(setup).id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' } });
  });

  it('stops the placeholder for good on a timer failure; skip then does nothing', async () => {
    const setup = await flying({ 1: ['G-02/3'] });
    const { owner, host, timer } = setup;
    timer.scheduleFailure = new Error('timer');
    host.deliver(TICK_MS);
    const placeholder = held(setup);
    expect(placeholder.status).toBe('failed');
    owner.skip(placeholder.id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'transition' }, session: { phase: 'transition' } });
    expect(setup.reportError).toHaveBeenCalledWith(timer.scheduleFailure);
  });

  it('drops the placeholder when the run faults during the hold, and ends the flow', async () => {
    const setup = await flying({ 1: ['G-02/3'] });
    const run = setup.run()!;
    run.onFrame((frame) => { if (frame.phase === 'transition') throw new Error('still frame consumer'); });
    setup.host.deliver(TICK_MS);
    expect(setup.owner.getSnapshot()).toMatchObject({
      flow: { position: 'ended', ended: 'faulted' }, session: { phase: 'faulted' }, transitionPlaceholder: null,
    });
    expect(setup.timer.pending.size).toBe(0);
  });

  it('revokes the timer and disposes the held run on release', async () => {
    const setup = await flying({ 1: ['G-02/3'] });
    setup.host.deliver(TICK_MS);
    const late = setup.timer.callbacks.at(-1)!;
    setup.slot.release();
    expect({ timers: setup.timer.pending.size, frames: setup.host.pending.size, guards: setup.guard.active, phase: setup.session().status().phase })
      .toEqual({ timers: 0, frames: 0, guards: 0, phase: 'disposed' });
    late();
    expect(setup.owner.getSnapshot().released).toBe(true);
  });
});
