import { describe, expect, it, vi } from 'vitest';
import { FakeAudio, FakeLifecycle } from '../../platform/audio/audio-controller.test-support.ts';
import { GraphicsUnavailableError } from '../../render/scene/render-surface.ts';
import { createFlightAudioConsumer } from '../flight-audio/owner.ts';
import { createFlightConsumer } from '../mission/flight-consumer.ts';
import { missionHolder, missionJob, ownerSetup, testPorts, testSlot, toDeparture, toFlight } from '../mission/mission.test-support.ts';
import { MissionUnavailableError, type MissionOwner } from '../mission/mission-owner.ts';
import { flush, testHolder } from '../resources/resource-holder.test-support.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import { teardownMissionAndHolder } from './mission-slot.ts';

// P3-04 S-05 (docs/plan/p3/04/spec.md, 应用流程): one mission slot per app instance, its ownerIds, its latch, and the
// app shell's teardown order. Owner behaviour itself is in src/app/mission/.

describe('mission slot', () => {
  it('numbers owners from 1 and releases each before creating the next', async () => {
    const { holder } = await missionHolder();
    const { slot } = testSlot();
    const owners: MissionOwner[] = [];
    for (let visit = 1; visit <= 3; visit++) {
      const owner = slot.open(() => {
        // The previous owner is released before the next one's setup is even made.
        expect(owners.at(-1)?.getSnapshot().released ?? true).toBe(true);
        expect(slot.current()).toBeNull();
        return ownerSetup(holder, testPorts());
      })!;
      expect(owner.ownerId).toBe(visit);
      expect(slot.current()).toBe(owner);
      owners.push(owner);
    }
    slot.release();
    slot.release();
    expect(owners.map((owner) => owner.getSnapshot().released)).toEqual([true, true, true]);
    expect(slot.current()).toBeNull();
  });

  it('never reuses an ownerId, even after a creation that failed', async () => {
    const { slot } = testSlot();
    const empty = testHolder().holder;
    expect(() => slot.open(() => ownerSetup(empty, testPorts()))).toThrow(MissionUnavailableError);
    const { holder } = await missionHolder();
    expect(slot.open(() => ownerSetup(holder, testPorts()))!.ownerId).toBe(2);
    expect(slot.cleanupFailure()).toBeNull();
  });

  it('latches the first cleanup failure for the app instance: no setup runs and no owner is created again', async () => {
    const { holder } = await missionHolder();
    const { slot, onCleanupFailure, reportError } = testSlot();
    const ports = testPorts();
    const owner = slot.open(() => ownerSetup(holder, ports))!;
    toFlight(owner);
    const cause = new Error('revoke');
    ports.guard.revokeFailure = cause;
    onCleanupFailure.mockImplementationOnce(() => { throw new Error('outlet'); });
    slot.release();
    expect(slot.cleanupFailure()).toEqual({ cause });
    expect(onCleanupFailure).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(new Error('outlet'));
    const create = vi.fn(() => ownerSetup(holder, testPorts()));
    expect(slot.open(create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('reports a failing package-replacement outlet without undoing the release', async () => {
    const { holder } = await missionHolder();
    const { slot, onPackageReplaced, reportError } = testSlot();
    const owner = slot.open(() => ownerSetup(holder, testPorts()))!;
    const failure = new Error('outlet');
    onPackageReplaced.mockImplementation(() => { throw failure; });
    expect(holder.acceptImport(await missionJob('mission-startable'))).toBe(true);
    expect(owner.getSnapshot().released).toBe(true);
    expect(reportError).toHaveBeenCalledWith(failure);
    expect(slot.cleanupFailure()).toBeNull();
  });
});

describe('owner audio isolation (P3-14/17)', () => {
  /** The flight picture without WebGL 2 and the flight sound over a fake audio of its own: one owner's consumers. */
  function withSound(holder: ResourceHolder) {
    const audio = new FakeAudio();
    const flight = createFlightConsumer({ holder, createSurface: () => { throw new GraphicsUnavailableError({ cause: null }); }, seed: () => 1, reportError: () => undefined });
    const sound = createFlightAudioConsumer({ holder, audio, lifecycle: new FakeLifecycle(), presentation: () => flight.presentation(), reportError: () => undefined });
    return { audio, consumers: [flight, sound] };
  }

  it('creates no owner\'s audio before every earlier owner\'s context is confirmed closed, across owners in between', async () => {
    const { holder } = await missionHolder();
    const { slot, onCleanupFailure } = testSlot();
    const first = withSound(holder);
    const owner = slot.open(() => ownerSetup(holder, testPorts(), { consumers: first.consumers }))!;
    await flush();
    toDeparture(owner);
    expect(first.audio.contexts).toHaveLength(1);
    let confirm!: () => void;
    first.audio.context.close = () => new Promise<void>((resolve) => { confirm = resolve; });
    const second = withSound(holder);
    const between = slot.open(() => ownerSetup(holder, testPorts(), { consumers: second.consumers }))!;
    await flush();
    expect(between.getSnapshot().sound).toBe('waiting-close');
    // The owner in between closes nothing, but the next still waits for the first.
    const third = withSound(holder);
    const next = slot.open(() => ownerSetup(holder, testPorts(), { consumers: third.consumers }))!;
    await flush();
    expect(next.getSnapshot().sound).toBe('waiting-close');
    expect(second.audio.buffers.length + third.audio.buffers.length).toBe(0);
    confirm();
    await flush();
    expect(next.getSnapshot().sound).toBe('needs-activation');
    expect({ second: second.audio.buffers.length, third: third.audio.buffers.length > 0 }).toEqual({ second: 0, third: true });
    expect(onCleanupFailure).not.toHaveBeenCalled();
  });
});

describe('app teardown order', () => {
  it('releases the slot before disposing the holder, and disposes the holder even when the release throws', () => {
    const order: string[] = [];
    const holder = { dispose: () => { order.push('holder'); } };
    teardownMissionAndHolder({ release: () => { order.push('slot'); } }, holder);
    expect(order).toEqual(['slot', 'holder']);
    order.length = 0;
    const failure = new Error('slot');
    expect(() => teardownMissionAndHolder({ release: () => { order.push('slot'); throw failure; } }, holder)).toThrow(failure);
    expect(order).toEqual(['slot', 'holder']);
  });
});
