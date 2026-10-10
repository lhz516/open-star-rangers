import { describe, expect, it } from 'vitest';
import {
  elapsePlaceholder, missionHolder, openMission, ownerSetup, skip, testPorts, testSlot, toConfig, toDeparture,
} from './mission.test-support.ts';

// P3-04 AC-05 (the owner part) and the timing of AC-07 (docs/plan/p3/04/spec.md, 衔接占位): G-02/1 and G-02/2 count
// 3,000 ms of visible time on one one-shot timer checked against the monotonic clock, end once, keep hidden time out,
// and fail visibly when the timer or clock fails. A run held by G-02/2 starts only through the current departure.

const hide = (setup: { host: { emit: (event: { type: 'visibility'; visibility: 'hidden' | 'visible' }) => void } }) => {
  setup.host.emit({ type: 'visibility', visibility: 'hidden' });
};
const show = (setup: { host: { emit: (event: { type: 'visibility'; visibility: 'hidden' | 'visible' }) => void } }) => {
  setup.host.emit({ type: 'visibility', visibility: 'visible' });
};

describe('placeholder timing', () => {
  it('ignores an early callback and schedules the remainder', async () => {
    const setup = await openMission();
    setup.clock.time = 1_000;
    setup.timer.fire();
    expect(setup.timer.delay).toBe(2_000);
    setup.clock.time = 2_000;
    setup.timer.fire();
    expect(setup.timer.delay).toBe(1_000);
    setup.clock.time = 3_000;
    setup.timer.fire();
    expect(setup.owner.getSnapshot().flow.position).toBe('config');
    expect(setup.timer.pending.size).toBe(0);
  });

  it('counts no hidden time: hiding keeps the remainder and revokes the timer, showing schedules the rest', async () => {
    const setup = await openMission();
    const { owner, timer, clock } = setup;
    clock.time = 1_000;
    hide(setup);
    expect(owner.getSnapshot().placeholder).toMatchObject({ status: 'waiting' });
    expect({ pending: timer.pending.size, cancelled: timer.cancelled }).toEqual({ pending: 0, cancelled: [0] });
    clock.time = 3_600_000;
    show(setup);
    expect(owner.getSnapshot().placeholder).toMatchObject({ status: 'timing' });
    expect(timer.delay).toBe(2_000);
    clock.time += 1_999;
    timer.fire();
    expect(owner.getSnapshot().flow.position).toBe('intro');
    expect(timer.delay).toBe(1);
    clock.time += 1;
    timer.fire();
    expect(owner.getSnapshot().flow.position).toBe('config');
  });

  it('treats pagehide as hidden until pageshow, even while the page stays visible', async () => {
    const setup = await openMission();
    const { owner, timer, clock, host } = setup;
    clock.time = 500;
    host.emit({ type: 'pagehide' });
    expect(owner.getSnapshot().placeholder?.status).toBe('waiting');
    clock.time = 10_000;
    show(setup);
    expect(owner.getSnapshot().placeholder?.status).toBe('waiting');
    host.emit({ type: 'pageshow', visibility: 'visible' });
    expect(timer.delay).toBe(2_500);
  });

  it('ends at the next callback once 3,000 visible ms passed, even when the page hid before it came', async () => {
    const setup = await openMission();
    setup.clock.time = 3_500;
    hide(setup);
    setup.clock.time = 9_000;
    show(setup);
    expect(setup.timer.delay).toBe(0);
    expect(setup.owner.getSnapshot().flow.position).toBe('intro');
    setup.timer.fire();
    expect(setup.owner.getSnapshot().flow.position).toBe('config');
  });

  it('waits without a timer when the owner opens on a hidden page', async () => {
    const { holder } = await missionHolder();
    const ports = testPorts();
    ports.host.visibility = 'hidden';
    const owner = testSlot().slot.open(() => ownerSetup(holder, ports))!;
    expect(owner.getSnapshot().placeholder).toMatchObject({ gap: 'G-02/1', status: 'waiting' });
    expect(ports.timer.delays).toEqual([]);
    ports.host.emit({ type: 'visibility', visibility: 'visible' });
    expect(ports.timer.delay).toBe(3_000);
  });
});

describe('placeholder end', () => {
  it('accepts one skip for the shown placeholder only; late callbacks and stale skips do nothing', async () => {
    const setup = await openMission();
    const { owner, timer } = setup;
    const intro = owner.getSnapshot().placeholder!;
    const introCallback = timer.callbacks[0]!;
    owner.skip(intro.id + 1);
    expect(owner.getSnapshot().flow.position).toBe('intro');
    owner.skip(intro.id);
    owner.skip(intro.id);
    expect(owner.getSnapshot().flow.position).toBe('config');
    expect(timer.cancelled).toEqual([0]);
    owner.start();
    const departure = owner.getSnapshot().placeholder!;
    // The intro's timer and skip cannot end the departure.
    introCallback();
    owner.skip(intro.id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'departure' }, placeholder: { id: departure.id } });
    const departureCallback = timer.callbacks.at(-1)!;
    owner.skip(departure.id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running', runId: 1 } });
    departureCallback();
    owner.skip(departure.id);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, actionError: null, session: { phase: 'running', runId: 1 } });
  });

  it('holds the run at tick 0 with no frame until the departure ends naturally', async () => {
    const setup = await openMission();
    const { owner, host } = setup;
    toDeparture(owner);
    expect(host.pending.size).toBe(0);
    setup.clock.time += 2_999;
    setup.timer.fire();
    expect(owner.getSnapshot().session.phase).toBe('transition');
    expect(setup.run()!.projection().clock.tick).toBe(0);
    setup.clock.time += 1;
    setup.timer.fire();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' } });
    expect(host.pending.size).toBe(1);
  });

  it('requires an explicit resume after the page hid during the departure, however it ends', async () => {
    for (const end of ['natural', 'skip'] as const) {
      const setup = await openMission();
      const { owner } = setup;
      toDeparture(owner);
      setup.clock.time += 1_000;
      hide(setup);
      expect(owner.getSnapshot().session).toMatchObject({ phase: 'transition', resumeRequired: true });
      setup.clock.time += 60_000;
      show(setup);
      if (end === 'natural') {
        expect(setup.timer.delay).toBe(2_000);
        elapsePlaceholder(setup);
      } else {
        skip(owner);
      }
      expect(owner.getSnapshot(), end).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'paused', pauseReason: 'hidden', resumeRequired: true } });
      expect(setup.host.pending.size).toBe(0);
      owner.resume();
      expect(owner.getSnapshot().session).toMatchObject({ phase: 'running', resumeRequired: false });
    }
  });

  it('holds a run created on a hidden page and skipped there until it is visible and resumed', async () => {
    const setup = await openMission();
    const { owner } = setup;
    toConfig(owner);
    hide(setup);
    owner.start();
    expect(owner.getSnapshot()).toMatchObject({ placeholder: { gap: 'G-02/2', status: 'waiting' }, session: { phase: 'transition', resumeRequired: true } });
    skip(owner);
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'hidden' });
    owner.resume();
    expect(owner.getSnapshot().session.phase).toBe('paused');
    show(setup);
    expect(owner.getSnapshot().session.phase).toBe('paused');
    owner.resume();
    expect(owner.getSnapshot().session.phase).toBe('running');
  });

  it('starts no run from a departure whose owner restarted or was released', async () => {
    const setup = await openMission();
    const { owner, timer, slot } = setup;
    toDeparture(owner);
    hide(setup);
    skip(owner);
    const departureCallbacks = [...timer.callbacks];
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro' }, session: { phase: 'idle' } });
    show(setup);
    for (const callback of departureCallbacks) callback();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro' }, session: { phase: 'idle' } });

    toDeparture(owner);
    const held = timer.callbacks.at(-1)!;
    const id = owner.getSnapshot().placeholder!.id;
    slot.release();
    held();
    owner.skip(id);
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'disposed' });
    expect(setup.host.pending.size).toBe(0);
  });
});

describe('placeholder failures', () => {
  it('shows a timer registration failure and neither ends the introduction nor lets a skip through', async () => {
    const { holder } = await missionHolder();
    const ports = testPorts();
    const failure = new Error('no timer');
    ports.timer.scheduleFailure = failure;
    const owner = testSlot().slot.open(() => ownerSetup(holder, ports))!;
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro' }, placeholder: { status: 'failed', failure: { cause: failure } } });
    expect(ports.reportError).toHaveBeenCalledWith(failure);
    skip(owner);
    ports.timer.scheduleFailure = undefined;
    ports.host.emit({ type: 'visibility', visibility: 'hidden' });
    ports.host.emit({ type: 'visibility', visibility: 'visible' });
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro' }, placeholder: { status: 'failed' }, cleanupFailure: null });
    expect(ports.timer.pending.size).toBe(0);
  });

  it('keeps the run held when the departure timer cannot be registered', async () => {
    const setup = await openMission();
    const { owner, timer, guard } = setup;
    toConfig(owner);
    timer.scheduleFailure = new Error('no timer');
    owner.start();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'departure' }, placeholder: { gap: 'G-02/2', status: 'failed' }, session: { phase: 'transition' } });
    skip(owner);
    expect(owner.getSnapshot().session.phase).toBe('transition');
    expect(guard.active).toBe(1);
    setup.slot.release();
    expect(guard.active).toBe(0);
  });

  it('fails on a clock that throws, returns a non-finite time or goes back', async () => {
    for (const fault of ['throws', 'non-finite', 'backwards'] as const) {
      const setup = await openMission();
      const { clock, timer, owner } = setup;
      clock.time = 1_000;
      if (fault === 'throws') clock.failure = new Error('clock');
      else clock.time = fault === 'non-finite' ? Number.NaN : -1;
      timer.fire();
      expect(owner.getSnapshot(), fault).toMatchObject({ flow: { position: 'intro' }, placeholder: { status: 'failed', failure: { cause: expect.any(Error) } } });
      expect(timer.pending.size).toBe(0);
    }
  });

  it('shows both a clock failure and a failed cancellation when hiding meets both', async () => {
    const setup = await openMission();
    const clock = new Error('clock');
    const cancel = new Error('cancel');
    setup.clock.failure = clock;
    setup.timer.cancelFailure = cancel;
    hide(setup);
    const { placeholder, cleanupFailure } = setup.owner.getSnapshot();
    expect(placeholder?.status).toBe('failed');
    expect((placeholder!.failure!.cause as AggregateError).errors).toEqual([clock, cancel]);
    expect(cleanupFailure).toEqual({ cause: cancel });
    expect(setup.reportError).toHaveBeenCalledWith(placeholder!.failure!.cause);
  });

  it('latches a failed cancellation and does not end the placeholder or start the run', async () => {
    for (const when of ['hide', 'skip'] as const) {
      const setup = await openMission();
      const { owner, timer } = setup;
      toDeparture(owner);
      const cause = new Error('cancel');
      timer.cancelFailure = cause;
      if (when === 'hide') hide(setup);
      else skip(owner);
      expect(owner.getSnapshot(), when).toMatchObject({
        flow: { position: 'departure' }, placeholder: { status: 'failed', failure: { cause } }, session: { phase: 'transition' }, cleanupFailure: { cause },
      });
      expect(setup.onCleanupFailure).toHaveBeenCalledWith(cause);
      show(setup);
      skip(owner);
      expect(owner.getSnapshot().session.phase).toBe('transition');
      expect(setup.slot.open(() => { throw new Error('a latched slot creates nothing'); })).toBeNull();
    }
  });
});
