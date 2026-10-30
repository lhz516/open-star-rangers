import { describe, expect, it } from 'vitest';
import { teardownMissionAndHolder } from '../composition/mission-slot.ts';
import { committed, flush } from '../resources/resource-holder.test-support.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { RollbackError } from '../session/rollback-error.ts';
import type { GameSessionStatus } from '../session/game-session.ts';
import type { MissionOwnerConsumer, MissionOwnerSetup, MissionSoundStatus } from './mission-owner.ts';
import {
  missionHolder, missionJob, openMission, ownerSetup, skip, testPorts, testSlot, TestConsumer, toConfig, toDeparture, toFlight, type TestPorts,
} from './mission.test-support.ts';

// P3-04 AC-09 and AC-10 (Node) (docs/plan/p3/04/spec.md: 消费者接线与释放, 离页保护, 应用流程): two-level ownership,
// the release order and its failures, the start's rollback, one leave guard per run, and the holder's replacement and
// disposal paths.

/** Consumers at each stage, connected in this order, and a log every port and consumer writes to. */
function logged(ports: TestPorts) {
  const log: string[] = [];
  const consumers = [
    new TestConsumer('input', 'A', log), new TestConsumer('input', 'B', log), new TestConsumer('ui', 'C', log),
    new TestConsumer('ui', 'D', log), new TestConsumer('media', 'E', log), new TestConsumer('media', 'F', log),
  ];
  const { guard, timer } = ports;
  const overrides: Partial<MissionOwnerSetup> = {
    consumers,
    leaveGuard: () => {
      const revoke = guard.guard();
      log.push('guard:register');
      return () => {
        log.push('guard:revoke');
        return revoke();
      };
    },
    timer: {
      schedule: (callback, delayMs) => timer.schedule(callback, delayMs),
      cancel: (handle) => {
        log.push('timer:cancel');
        return timer.cancel(handle);
      },
    },
  };
  return { log, consumers, overrides };
}

async function loggedMission() {
  const { holder } = await missionHolder();
  const ports = testPorts();
  const slot = testSlot();
  const { log, consumers, overrides } = logged(ports);
  const owner = slot.slot.open(() => ownerSetup(holder, ports, overrides))!;
  return { holder, ports, ...slot, owner, log, consumers, byName: (name: string) => consumers.find((consumer) => consumer.name === name)! };
}

describe('two-level ownership', () => {
  it('connects owner-level consumers once, wires run-level ones to each run and releases those with the run, newest first', async () => {
    const { owner, log } = await loggedMission();
    expect(log).toEqual(['A:connect', 'B:connect', 'C:connect', 'D:connect', 'E:connect', 'F:connect']);
    log.length = 0;
    toFlight(owner);
    // Each skip revokes its placeholder's timer.
    expect(log).toEqual(['timer:cancel', 'A:attach-1', 'B:attach-1', 'C:attach-1', 'D:attach-1', 'E:attach-1', 'F:attach-1', 'guard:register', 'timer:cancel']);
    log.length = 0;
    owner.restart();
    // The run ends; owner-level consumers stay.
    expect(log).toEqual(['F:cleanup-1', 'E:cleanup-1', 'D:cleanup-1', 'C:cleanup-1', 'B:cleanup-1', 'A:cleanup-1', 'guard:revoke']);
    log.length = 0;
    toFlight(owner);
    expect(log.filter((entry) => entry.includes('attach'))).toEqual(['A:attach-2', 'B:attach-2', 'C:attach-2', 'D:attach-2', 'E:attach-2', 'F:attach-2']);
    log.length = 0;
    owner.release();
    // Run 1's consumers do not move to run 2 or run again.
    expect(log.filter((entry) => entry.includes('cleanup'))).toEqual(['F:cleanup-2', 'E:cleanup-2', 'D:cleanup-2', 'C:cleanup-2', 'B:cleanup-2', 'A:cleanup-2']);
  });

  it('releases input and timers, the session with its run, UI, the leave guard, then media, each stage newest first', async () => {
    const { owner, log, slot } = await loggedMission();
    toDeparture(owner);
    log.length = 0;
    slot.release();
    expect(log).toEqual([
      'timer:cancel', 'B:release', 'A:release',
      'F:cleanup-1', 'E:cleanup-1', 'D:cleanup-1', 'C:cleanup-1', 'B:cleanup-1', 'A:cleanup-1',
      'D:release', 'C:release', 'guard:revoke', 'F:release', 'E:release',
    ]);
    expect(owner.release()).toBe(owner.release());
    expect(log.at(-1)).toBe('E:release');
  });

  it('attempts every release step, reports the failures together and latches the slot', async () => {
    const { owner, byName, slot, onCleanupFailure, ports, log } = await loggedMission();
    toFlight(owner);
    const failures = [new Error('B'), new Error('C run'), new Error('D')];
    byName('B').releaseFailure = failures[0];
    byName('C').runCleanupFailure = failures[1];
    byName('D').releaseFailure = failures[2];
    const { failures: released } = owner.release();
    expect(released).toHaveLength(3);
    expect(released[0]).toBe(failures[0]);
    expect((released[1] as { failures: { cause: unknown }[] }).failures.map(({ cause }) => cause)).toEqual([failures[1]]);
    expect(released[2]).toBe(failures[2]);
    for (const name of ['A', 'E', 'F']) expect(log).toContain(`${name}:release`);
    expect(log).toContain('A:cleanup-1');
    expect(ports.guard.active).toBe(0);
    expect(onCleanupFailure).toHaveBeenCalledTimes(1);
    expect((onCleanupFailure.mock.calls[0]![0] as AggregateError).errors).toEqual(released);
    expect(owner.getSnapshot().cleanupFailure).toEqual({ cause: onCleanupFailure.mock.calls[0]![0] });
    slot.release();
    expect(slot.cleanupFailure()).not.toBeNull();
    expect(slot.open(() => { throw new Error('not called'); })).toBeNull();
  });

  it('gives consumers a session view without controls, and the session errors it reports', async () => {
    const consumer = new TestConsumer('ui', 'C', []);
    const setup = await openMission('mission-startable', { consumers: [consumer] });
    expect(Object.keys(consumer.contexts[0]!.session).sort()).toEqual(['currentRun', 'onStatus', 'status']);
    expect(consumer.contexts[0]!.ownerId).toBe(1);
    toFlight(setup.owner);
    setup.host.deliver(0);
    setup.host.requestFailure = new Error('no frame');
    setup.host.deliver(TICK_MS);
    expect(consumer.errors).toHaveLength(1);
    expect(consumer.errors[0]!.failures![0]!.cause).toBe(setup.host.requestFailure);
  });
});

describe('start rollback', () => {
  it('exits the run when a run consumer fails to attach, releasing what attached, and may retry', async () => {
    const { owner, byName, log, ports } = await loggedMission();
    toConfig(owner);
    const cause = new Error('attach');
    byName('C').attachFailure = cause;
    log.length = 0;
    owner.start();
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'assembly', stage: 'consumer', cause, rolledBack: true } });
    expect(log).toEqual(['A:attach-1', 'B:attach-1', 'C:attach-1', 'C:cleanup-1', 'B:cleanup-1', 'A:cleanup-1']);
    expect({ phase: owner.getSnapshot().session.phase, guards: ports.guard.registrations, draws: ports.seeds.draws })
      .toEqual({ phase: 'idle', guards: 0, draws: 1 });
    byName('C').attachFailure = undefined;
    owner.start();
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'departure', runId: 2, startFailure: null });
  });

  it('latches when the rollback itself fails, and starts nothing again', async () => {
    const { owner, byName, onCleanupFailure, slot } = await loggedMission();
    toConfig(owner);
    const cause = new Error('attach');
    byName('C').attachFailure = cause;
    byName('A').runCleanupFailure = new Error('A cleanup');
    owner.start();
    expect(owner.getSnapshot().flow.startFailure).toMatchObject({ kind: 'assembly', stage: 'consumer', rolledBack: false });
    const latched = onCleanupFailure.mock.calls[0]![0];
    expect(latched).toBeInstanceOf(RollbackError);
    expect((latched as RollbackError).cause).toBe(cause);
    byName('C').attachFailure = undefined;
    owner.start();
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'cleanup-failed' } });
    expect(slot.cleanupFailure()).toEqual({ cause: latched });
  });

  it('exits the run when the leave guard cannot register; a guard that could not roll back latches', async () => {
    const setup = await loggedMission();
    const { owner, ports, log } = setup;
    toConfig(owner);
    ports.guard.registerFailure = new Error('no guard');
    log.length = 0;
    owner.start();
    expect(owner.getSnapshot().flow.startFailure).toMatchObject({ kind: 'assembly', stage: 'leave-guard', cause: ports.guard.registerFailure, rolledBack: true });
    expect(log.filter((entry) => entry.includes('cleanup'))).toHaveLength(6);
    expect({ phase: owner.getSnapshot().session.phase, guards: ports.guard.active, latched: owner.getSnapshot().cleanupFailure }).toEqual({ phase: 'idle', guards: 0, latched: null });

    const leaked = new RollbackError(new Error('add'), [new Error('remove')], 'guard');
    ports.guard.registerFailure = leaked;
    owner.start();
    expect(owner.getSnapshot().flow.startFailure).toMatchObject({ kind: 'assembly', stage: 'leave-guard', rolledBack: false });
    expect(setup.onCleanupFailure).toHaveBeenCalledTimes(1);
    const latched = setup.onCleanupFailure.mock.calls[0]![0] as RollbackError;
    expect(latched).toBeInstanceOf(RollbackError);
    expect(latched.errors).toEqual([leaked]);
    expect(owner.getSnapshot().session.phase).toBe('idle');
  });

  it('keeps every cause when the guard leaked and the run cleanup failed too', async () => {
    const setup = await loggedMission();
    const { owner, ports, byName } = setup;
    toConfig(owner);
    const leaked = new RollbackError(new Error('add'), [new Error('remove')], 'guard');
    ports.guard.registerFailure = leaked;
    const cleanup = new Error('A cleanup');
    byName('A').runCleanupFailure = cleanup;
    owner.start();
    const latched = setup.onCleanupFailure.mock.calls[0]![0] as RollbackError;
    expect(latched).toBeInstanceOf(RollbackError);
    expect(latched.cause).toBe(leaked);
    const exit = latched.errors[1] as { failures: { cause: unknown }[] };
    expect(exit.failures.map(({ cause }) => cause)).toEqual([cleanup]);
  });

  it('exits a run whose status listener failed as it started', async () => {
    const throwing: MissionOwnerConsumer = {
      stage: 'ui',
      connect: ({ session }) => {
        const stop = session.onStatus((status: GameSessionStatus) => {
          if (status.phase === 'transition') throw new Error('listener');
          return undefined;
        });
        return { release: stop };
      },
    };
    const setup = await openMission('mission-startable', { consumers: [throwing] });
    toDeparture(setup.owner);
    expect(setup.owner.getSnapshot().flow.startFailure).toMatchObject({ kind: 'assembly', stage: 'session', rolledBack: true });
    expect({ phase: setup.owner.getSnapshot().session.phase, guards: setup.guard.registrations }).toEqual({ phase: 'idle', guards: 0 });
  });
});

describe('owner creation', () => {
  it('releases what it acquired when a consumer fails to connect, and latches only when that release failed', async () => {
    const { holder } = await missionHolder();
    for (const rollbackFails of [false, true]) {
      const ports = testPorts();
      const { slot, onCleanupFailure } = testSlot();
      const { consumers, log, overrides } = logged(ports);
      const cause = new Error('connect');
      consumers[3]!.connectFailure = cause;
      if (rollbackFails) consumers[1]!.releaseFailure = new Error('B release');
      let error: unknown;
      try {
        slot.open(() => ownerSetup(holder, ports, overrides));
      } catch (caught) {
        error = caught;
      }
      expect(log).toEqual(['A:connect', 'B:connect', 'C:connect', 'D:connect', 'B:release', 'A:release', 'C:release']);
      expect(ports.host.listeners.size).toBe(0);
      expect(ports.timer.delays).toEqual([]);
      if (rollbackFails) {
        expect(error).toBeInstanceOf(RollbackError);
        expect((error as RollbackError).errors).toEqual([cause, consumers[1]!.releaseFailure]);
        expect(slot.cleanupFailure()).toEqual({ cause: error });
        expect(onCleanupFailure).toHaveBeenCalledExactlyOnceWith(error);
      } else {
        expect(error).toBe(cause);
        expect(slot.cleanupFailure()).toBeNull();
      }
    }
  });
});

describe('leave guard', () => {
  it('holds exactly one guard in every phase with a run and none without one', async () => {
    const setup = await openMission();
    const { owner, guard, host } = setup;
    const active: Record<string, number> = {};
    const note = (label: string) => { active[label] = guard.active; };
    note('intro');
    toConfig(owner);
    note('config');
    owner.start();
    note('transition');
    skip(owner);
    note('running');
    owner.pause();
    note('paused');
    owner.openMenu();
    note('menu');
    owner.continueFromMenu();
    host.deliver(0);
    host.requestFailure = new Error('no frame');
    host.deliver(TICK_MS);
    expect(owner.getSnapshot().session.phase).toBe('faulted');
    note('faulted');
    host.requestFailure = undefined;
    owner.restart();
    note('after exit');
    toDeparture(owner);
    note('second run');
    setup.slot.release();
    note('after dispose');
    expect(active).toEqual({
      intro: 0, config: 0, transition: 1, running: 1, paused: 1, menu: 1, faulted: 1, 'after exit': 0, 'second run': 1, 'after dispose': 0,
    });
    expect(guard.registrations).toBe(2);
  });

  it('latches a failed revoke on restart: no new flow, only leaving remains', async () => {
    const setup = await openMission();
    const { owner, guard } = setup;
    toFlight(owner);
    const cause = new Error('revoke');
    guard.revokeFailure = cause;
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({
      flow: { position: 'ended', ended: 'cleanup-failed' }, actionError: { operation: 'restart', cause }, cleanupFailure: { cause }, session: { phase: 'idle' },
    });
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended' }, placeholder: null });
    expect(setup.onCleanupFailure).toHaveBeenCalledWith(cause);
  });

  it('keeps a guard whose revoke failed for the release to retry, and latches it with a failed run cleanup', async () => {
    const consumer = new TestConsumer('ui', 'C', []);
    const setup = await openMission('mission-startable', { consumers: [consumer] });
    const { owner, guard } = setup;
    toFlight(owner);
    const cleanup = new Error('cleanup');
    const revoke = new Error('revoke');
    consumer.runCleanupFailure = cleanup;
    guard.revokeFailure = revoke;
    owner.restart();
    const latched = setup.onCleanupFailure.mock.calls[0]![0] as AggregateError;
    expect(latched).toBeInstanceOf(AggregateError);
    expect((latched.errors[0] as { failures: { cause: unknown }[] }).failures.map(({ cause }) => cause)).toEqual([cleanup]);
    expect(latched.errors[1]).toBe(revoke);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'cleanup-failed' }, actionError: { operation: 'restart', cause: latched } });
    expect(guard.active).toBe(1);
    guard.revokeFailure = undefined;
    setup.slot.release();
    expect(guard.active).toBe(0);
  });

  it('latches a restart whose run cleanup failed', async () => {
    const consumer = new TestConsumer('ui', 'C', []);
    const setup = await openMission('mission-startable', { consumers: [consumer] });
    toFlight(setup.owner);
    consumer.runCleanupFailure = new Error('cleanup');
    setup.owner.restart();
    expect(setup.owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'cleanup-failed' }, session: { phase: 'idle', cleanupFailed: true } });
    expect(setup.guard.active).toBe(0);
    expect(setup.slot.cleanupFailure()).not.toBeNull();
  });
});

describe('holder replacement and disposal', () => {
  it('releases the owner before the holder replaces its package, then returns to the menu; nothing of the old run follows', async () => {
    const setup = await openMission();
    const { owner, holder, host, guard, slot, onPackageReplaced, timer } = setup;
    toFlight(owner);
    host.deliver(0);
    const frame = host.callbacks.at(-1)!;
    const generations: (number | undefined)[] = [];
    onPackageReplaced.mockImplementation(() => { generations.push(holder.current()?.generation); });
    expect(holder.acceptImport(await missionJob('mission-startable'))).toBe(true);
    expect(onPackageReplaced).toHaveBeenCalledWith(1);
    // The owner was gone before the new package was held.
    expect(generations).toEqual([1]);
    expect(holder.current()!.generation).toBe(2);
    expect(owner.getSnapshot()).toMatchObject({ released: true, session: { phase: 'disposed' } });
    expect({ guards: guard.active, frames: host.pending.size, timers: timer.pending.size, current: slot.current() }).toEqual({ guards: 0, frames: 0, timers: 0, current: null });
    frame(2 * TICK_MS);
    owner.resume();
    expect(host.pending.size).toBe(0);
    const next = slot.open(() => ownerSetup(holder, testPorts()))!;
    expect(next.ownerId).toBe(2);
  });

  it('latches a failed release before the replacement goes on, which it does not veto', async () => {
    const consumer = new TestConsumer('media', 'E', []);
    const setup = await openMission('mission-startable', { consumers: [consumer] });
    toFlight(setup.owner);
    consumer.releaseFailure = new Error('release');
    const latchedAt: (number | undefined)[] = [];
    setup.onCleanupFailure.mockImplementation(() => { latchedAt.push(setup.holder.current()?.generation); });
    expect(setup.holder.acceptImport(await missionJob('mission-startable'))).toBe(true);
    expect(latchedAt).toEqual([1]);
    expect(setup.holder.current()!.generation).toBe(2);
    expect(setup.onPackageReplaced).toHaveBeenCalledWith(1);
    expect(setup.slot.open(() => { throw new Error('not called'); })).toBeNull();
  });

  it('needs the teardown helper on the dispose path: dispose notifies nobody, so the slot is released first', async () => {
    const setup = await openMission();
    toFlight(setup.owner);
    const seen: boolean[] = [];
    // The holder disposed alone leaves the owner running.
    const alone = await openMission();
    toFlight(alone.owner);
    alone.holder.dispose();
    expect(alone.owner.getSnapshot()).toMatchObject({ released: false, session: { phase: 'running' } });
    alone.slot.release();

    const slot = {
      release: () => {
        seen.push(setup.holder.current() !== null);
        setup.slot.release();
      },
    };
    teardownMissionAndHolder(slot, setup.holder);
    expect(seen).toEqual([true]);
    expect(setup.owner.getSnapshot()).toMatchObject({ released: true, session: { phase: 'disposed' } });
    expect(setup.holder.current()).toBeNull();
    expect({ guards: setup.guard.active, frames: setup.host.pending.size }).toEqual({ guards: 0, frames: 0 });
  });

  it('keeps the run when only the package cache state changes', async () => {
    const setup = await openMission();
    toFlight(setup.owner);
    setup.host.deliver(0);
    const run = setup.run();
    setup.cache.commits[0]!.result.resolve(committed(setup.holder.current()!.groups));
    await flush();
    expect(setup.holder.getSnapshot().package!.cache.status).toBe('saved');
    setup.holder.relist();
    expect(setup.run()).toBe(run);
    expect(setup.owner.getSnapshot()).toMatchObject({ flow: { position: 'flight', runId: 1 }, session: { phase: 'running', runId: 1 } });
    setup.host.deliver(TICK_MS);
    expect(run!.projection().clock.tick).toBe(1);
  });
});

describe('sound hooks (P3-14/17)', () => {
  /** A `media` consumer whose connection logs each activation with the session phase and flow it saw, and reports `status`. */
  function soundProbe(log: string[], options: { readonly status?: () => MissionSoundStatus; readonly fail?: boolean } = {}) {
    let changed: (() => void) | undefined;
    const consumer: MissionOwnerConsumer = {
      stage: 'media',
      connect: (context) => {
        changed = context.soundChanged;
        return {
          release: () => undefined,
          onActivation: (cause) => {
            log.push(`${cause}:${context.session.status().phase}`);
            if (options.fail) throw new Error('activation');
          },
          ...(options.status ? { sound: options.status } : {}),
        };
      },
    };
    return { consumer, changed: () => changed!() };
  }

  it('activates media connections after each trusted action\'s session control, and enables sound only where it applies', async () => {
    const log: string[] = [];
    const { owner, seeds } = await openMission('mission-startable', { consumers: [soundProbe(log).consumer] });
    owner.enableSound();
    skip(owner);
    owner.enableSound();
    expect(log).toEqual([]);
    owner.start();
    expect(log).toEqual(['start:transition']);
    owner.enableSound();
    skip(owner);
    owner.pause();
    owner.enableSound();
    owner.resume();
    owner.openMenu();
    owner.enableSound();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused' } });
    owner.continueFromMenu();
    expect(log).toEqual(['start:transition', 'enable-sound:transition', 'enable-sound:paused', 'resume:running', 'enable-sound:paused', 'continue:running']);
    // A start that fails activates nothing.
    owner.restart();
    skip(owner);
    seeds.failure = new Error('seed');
    owner.start();
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'seed' } });
    expect(log).toHaveLength(6);
  });

  it('reports a throwing activation and shows the sound as failed; the action\'s result stands', async () => {
    const log: string[] = [];
    const { owner, reportError } = await openMission('mission-startable', { consumers: [soundProbe(log, { fail: true, status: () => 'available' }).consumer] });
    expect(owner.getSnapshot().sound).toBe('available');
    toDeparture(owner);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'departure' }, sound: 'failed', actionError: null });
    expect(reportError).toHaveBeenCalledWith(new Error('activation'));
  });

  it('shows the first media connection\'s sound, publishing when it says it changed, and unavailable without one', async () => {
    expect((await openMission()).owner.getSnapshot().sound).toBe('unavailable');
    let status: MissionSoundStatus = 'waiting-close';
    const probe = soundProbe([], { status: () => status });
    const { owner } = await openMission('mission-startable', { consumers: [probe.consumer, soundProbe([], { status: () => 'failed' }).consumer] });
    const seen: MissionSoundStatus[] = [];
    owner.subscribe(() => { seen.push(owner.getSnapshot().sound); });
    expect(owner.getSnapshot().sound).toBe('waiting-close');
    status = 'needs-activation';
    probe.changed();
    expect(seen).toEqual(['needs-activation']);
  });
});

describe('asynchronous close barrier', () => {
  it('lets the next owner wait until earlier closes are confirmed, and latches a failed close', async () => {
    const { holder } = await missionHolder();
    const { slot, onCleanupFailure } = testSlot();
    const first = new TestConsumer('media', 'E', []);
    let confirm!: () => void;
    first.close = new Promise<void>((resolve) => { confirm = resolve; });
    slot.open(() => ownerSetup(holder, testPorts(), { consumers: [first] }));
    const second = new TestConsumer('media', 'E', []);
    let fail!: (cause: unknown) => void;
    second.close = new Promise<void>((_, reject) => { fail = reject; });
    slot.open(() => ownerSetup(holder, testPorts(), { consumers: [second] }));
    const settled: boolean[] = [];
    void second.contexts[0]!.previousClosed.then((closed) => { settled.push(closed); });
    await flush();
    expect(settled).toEqual([]);
    confirm();
    await flush();
    expect(settled).toEqual([true]);

    const third = new TestConsumer('media', 'E', []);
    slot.open(() => ownerSetup(holder, testPorts(), { consumers: [third] }));
    const cause = new Error('close');
    fail(cause);
    expect(await third.contexts[0]!.previousClosed).toBe(false);
    expect(onCleanupFailure).toHaveBeenCalledWith(cause);
    expect(slot.open(() => { throw new Error('not called'); })).toBeNull();
  });
});
