import { describe, expect, it, vi } from 'vitest';
import { RecordingSurface } from '../../render/scene/render-surface.test-support.ts';
import { GraphicsDeviceError, GraphicsUnavailableError } from '../../render/scene/render-surface.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameSessionRun } from '../session/game-session.ts';
import { RollbackError } from '../session/rollback-error.ts';
import { createFlightConsumer } from './flight-consumer.ts';
import type { MissionOwnerContext } from './mission-owner.ts';
import type { FakeJob } from '../resources/resource-holder.test-support.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import {
  missionGroups, missionHolder, nextSchemaJob, ownerSetup, sessionProbe, skip, testPorts, testSlot, toDeparture, toFlight, type MissionScenario,
} from './mission.test-support.ts';

// P3-12/15 AC-02 and AC-03 (Node): the flight picture as the mission owner's `media` consumer, with real owners and
// sessions on a ControlledHost and a recording surface.

/** A flight consumer on `holder` whose surfaces record; `unavailable` makes creating one throw it instead. */
function flight(holder: ResourceHolder, { unavailable, seeds = [] }: FlightOptions = {}) {
  const surfaces: RecordingSurface[] = [];
  const seed = vi.fn(() => (seeds.length > 0 ? seeds.shift() : 0x1234_5678) as number);
  const consumer = createFlightConsumer({
    holder,
    createSurface: () => {
      if (unavailable !== undefined) throw unavailable;
      const surface = new RecordingSurface();
      surfaces.push(surface);
      return surface;
    },
    seed,
    reportError: () => undefined,
  });
  return { consumer, surfaces, seed };
}

interface FlightOptions {
  readonly unavailable?: unknown;
  readonly seeds?: unknown[];
}

/** An owner of a fresh slot on a holder of `source`, with a flight consumer and a session probe after it. */
async function openFlight(options: FlightOptions = {}, source: MissionScenario | FakeJob = 'mission-startable') {
  const { holder } = await missionHolder(source);
  const ports = testPorts();
  const { slot } = testSlot();
  const parts = flight(holder, options);
  const probe = sessionProbe();
  const owner = slot.open(() => ownerSetup(holder, ports, { consumers: [parts.consumer, probe.consumer] }))!;
  return {
    ...ports, ...parts, holder, slot, owner, renderer: parts.consumer.renderer()!,
    session: probe.session, run: () => probe.session().currentRun(),
  };
}

/** The Core tick of the run's latest Render State. */
const tickOf = (mission: Awaited<ReturnType<typeof openFlight>>) => mission.run()!.renderFrame().current.tick;

describe('flight consumer', () => {
  it('creates one surface per owner, wires each run at tick 0 and draws every frame with its ticks', async () => {
    const mission = await openFlight();
    const { owner, host, surfaces, renderer, seed } = mission;
    expect(surfaces).toHaveLength(1);
    expect(renderer.ownerId).toBe(owner.ownerId);
    toDeparture(owner);
    expect(renderer.diagnostics()).toMatchObject({ state: 'ready', runId: 1, draws: 0, resources: { geometries: 0 } });
    expect(seed).toHaveBeenCalledOnce();
    skip(owner);
    surfaces[0].resize();
    host.deliver(0);
    host.deliver(TICK_MS);
    host.deliver(TICK_MS + 1_000);
    expect(mission.session().status().phase).toBe('running');
    expect(tickOf(mission)).toBe(6);
    expect(renderer.diagnostics()).toMatchObject({ draws: 3, lastTick: 6 });
    // A pause delivers a still frame that only redraws.
    owner.pause();
    expect(renderer.diagnostics()).toMatchObject({ draws: 4, lastTick: 6 });
  });

  it('releases each run\'s resources at its end, binds the next with equal warm counts, and disposes the surface with the owner', async () => {
    const mission = await openFlight();
    const { owner, host, surfaces, renderer, slot } = mission;
    const counts = [];
    for (const runId of [1, 2]) {
      toFlight(owner);
      surfaces[0].resize();
      host.deliver(0);
      host.deliver(TICK_MS);
      counts.push(renderer.diagnostics());
      expect(renderer.diagnostics().runId).toBe(runId);
      owner.restart();
      expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null, gpu: { geometries: 0, textures: 0 } });
    }
    expect(counts[1].resources).toEqual(counts[0].resources);
    expect(counts[1].gpu).toEqual(counts[0].gpu);
    expect(surfaces).toHaveLength(1);
    slot.release();
    expect(surfaces[0].calls.slice(-2)).toEqual(['disconnect', 'dispose']);
    expect(renderer.getSnapshot().state).toBe('disposed');
  });

  it('releases an owner\'s surface before the next owner creates its own', async () => {
    const { holder } = await missionHolder();
    const ports = testPorts();
    const { slot } = testSlot();
    const parts = [flight(holder), flight(holder)];
    const log: string[] = [];
    for (const [at, { consumer, surfaces }] of parts.entries()) {
      slot.open(() => {
        log.push(`create ${at}: ${parts.flatMap(({ surfaces: made }) => made).filter((made) => made.calls.at(-1) !== 'dispose').length} live`);
        return ownerSetup(holder, ports, { consumers: [consumer] });
      });
      expect(surfaces).toHaveLength(1);
    }
    slot.release();
    expect(log).toEqual(['create 0: 0 live', 'create 1: 0 live']);
    expect(parts.map(({ surfaces }) => surfaces[0].calls.at(-1))).toEqual(['dispose', 'dispose']);
  });

  it('fails a start whose package content or presentation seed it refuses, and rolls the run back', async () => {
    const groups = await missionGroups('mission-startable');
    const nebula = (groups.find(({ group }) => group === 'models')!.manifest as { assets: { id: string; role: string }[] }).assets
      .find(({ role }) => role === 'nebula-backgrounds')!.id;
    const broken = await openFlight({}, await nextSchemaJob('models', nebula));
    toDeparture(broken.owner);
    expect(broken.owner.getSnapshot()).toMatchObject({
      flow: { position: 'config', startFailure: { kind: 'assembly', stage: 'consumer', rolledBack: true, cause: { name: 'ContentContractError' } } },
      session: { phase: 'idle' },
    });
    expect(broken.renderer.diagnostics().runId).toBeNull();

    const seeded = await openFlight({ seeds: [-1] });
    toDeparture(seeded.owner);
    expect(seeded.owner.getSnapshot()).toMatchObject({
      flow: { position: 'config', startFailure: { kind: 'assembly', stage: 'consumer', rolledBack: true, cause: { name: 'PresentationError' } } },
    });
    seeded.owner.start();
    expect(seeded.owner.getSnapshot().flow.position).toBe('departure');
    expect(seeded.renderer.diagnostics().runId).toBe(2);
  });

  it('wires no run once the holder no longer holds the package the owner bound', async () => {
    const { holder } = await missionHolder();
    const bound = holder.current();
    let current = bound;
    const { consumer } = flight({ current: () => current } as ResourceHolder);
    const connection = consumer.connect({ ownerId: 1 } as MissionOwnerContext);
    current = { ...bound! };
    const run = { runId: 1 } as GameSessionRun;
    expect(() => connection.attachRun!(run, { ownerId: 1, runId: 1 })).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    expect(consumer.renderer()!.diagnostics().runId).toBeNull();
    connection.release();
  });

  it('runs the session without a picture when WebGL 2 is unavailable', async () => {
    const unavailable = new GraphicsUnavailableError({ cause: new Error('no WebGL 2') });
    const mission = await openFlight({ unavailable });
    const { owner, host, renderer } = mission;
    expect(renderer.getSnapshot()).toEqual({ state: 'unavailable', error: unavailable });
    toFlight(owner);
    host.deliver(0);
    host.deliver(3 * TICK_MS);
    expect(mission.session().status().phase).toBe('running');
    expect(tickOf(mission)).toBe(3);
    expect(renderer.diagnostics()).toMatchObject({ runId: 1, draws: 0 });
  });

  it('fails the owner\'s creation for any other surface failure, one that could not be undone included', async () => {
    const unavailable = new GraphicsUnavailableError({ cause: null });
    await expect(openFlight({ unavailable: new RollbackError(unavailable, [new Error('stuck')], 'surface rollback failed') }))
      .rejects.toThrow(RollbackError);
    const failure = new Error('context queries failed');
    await expect(openFlight({ unavailable: failure })).rejects.toBe(failure);
  });

  it('keeps the session running through a context loss and a device failure, and stops nothing else', async () => {
    const mission = await openFlight();
    const { owner, host, surfaces, renderer } = mission;
    toFlight(owner);
    const [surface] = surfaces;
    surface.resize();
    host.deliver(0);
    surface.events!.contextLost();
    host.deliver(2 * TICK_MS);
    expect(renderer.diagnostics()).toMatchObject({ state: 'context-lost', draws: 1, lastTick: 0 });
    // Restoring redraws the last frame at once, so a paused run would keep its picture.
    surface.events!.contextRestored();
    expect(renderer.diagnostics()).toMatchObject({ state: 'ready', draws: 2, lastTick: 2 });
    host.deliver(3 * TICK_MS);
    expect(renderer.diagnostics()).toMatchObject({ state: 'ready', draws: 3, lastTick: 3 });
    surface.drawFailure = new GraphicsDeviceError('lost', { cause: null });
    host.deliver(4 * TICK_MS);
    host.deliver(5 * TICK_MS);
    expect(renderer.getSnapshot().state).toBe('failed');
    expect(mission.session().status().phase).toBe('running');
    expect(tickOf(mission)).toBe(5);
  });

  it('faults the session on any other draw failure', async () => {
    const mission = await openFlight();
    const { owner, host, surfaces, renderer } = mission;
    toFlight(owner);
    surfaces[0].resize();
    const failure = new Error('shader failed');
    surfaces[0].drawFailure = failure;
    host.deliver(0);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'faulted' }, session: { phase: 'faulted' } });
    expect(mission.session().status().error).toMatchObject({ kind: 'operation-failed', failures: [{ phase: 'consumer', cause: failure }] });
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    owner.restart();
    toDeparture(owner);
    expect(owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'assembly', stage: 'consumer', rolledBack: true } });
  });
});
