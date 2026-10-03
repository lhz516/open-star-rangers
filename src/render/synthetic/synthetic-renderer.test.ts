import { describe, expect, it } from 'vitest';
import type { SessionCleanup } from '../../app/session/session-host.ts';
import { createSyntheticSession, type SessionFrame, type SessionRun } from '../../app/session/synthetic-session.ts';
import { ControlledHost } from '../../app/session/synthetic-session.test-support.ts';
import type { MarkerAddedEvent } from '../../core/synthetic/synthetic-scene.ts';
import { setupBridge, SYNTHETIC_TEST_OPTIONS } from '../../ui/game/synthetic-ui.test-support.ts';
import { RecordingSurface, type DrawRecord } from '../scene/render-surface.test-support.ts';
import { createSyntheticRenderer, type SyntheticRenderBinding, type SyntheticRenderer } from './synthetic-renderer.ts';

/** 50 Hz: one tick every 20 ms. */
const TICK_MS = 20;

function entityIds(draw: DrawRecord | undefined): number[] {
  return (draw?.objects ?? []).map(object => Number(object.name.split('-').at(-1)));
}

/** A real session, bridge and renderer; the renderer attaches to every run like the demo owner will. */
function setup(surface = new RecordingSurface()) {
  const reported: unknown[] = [];
  const renderer = createSyntheticRenderer({ surface, reportError: error => { reported.push(error); } });
  const context = setupBridge(SYNTHETIC_TEST_OPTIONS, () => [{ attach: binding => { renderer.attach(binding); } }]);
  surface.resize();
  return { ...context, surface, renderer, reported };
}

/** A real session without a bridge, attached directly through a binding that exposes the frame listener. */
function directSetup(surface = new RecordingSurface()) {
  const host = new ControlledHost();
  const sessionErrors: unknown[] = [];
  const session = createSyntheticSession(SYNTHETIC_TEST_OPTIONS, host, error => { sessionErrors.push(error); });
  const renderer = createSyntheticRenderer({ surface, reportError: error => { throw error; } });
  surface.resize();
  session.control({ type: 'start' });
  const run = session.currentRun()!;
  let listener: ((frame: SessionFrame) => undefined) | null = null;
  const owned: SessionCleanup[] = [];
  const binding: SyntheticRenderBinding = {
    run: {
      runId: run.runId,
      renderFrame: () => run.renderFrame(),
      onFrame: frameListener => { listener = frameListener; return run.onFrame(frameListener); },
      ownCleanup: cleanup => run.ownCleanup(cleanup),
    },
    isCurrent: () => session.currentRun() === run,
    own: cleanup => { owned.push(cleanup); },
  };
  renderer.attach(binding);
  return { host, session, sessionErrors, renderer, surface, run, owned, deliver: (frame: SessionFrame) => listener!(frame) };
}

function counted(renderer: SyntheticRenderer): { notifications: number } {
  const count = { notifications: 0 };
  renderer.subscribe(() => { count.notifications++; });
  return count;
}

describe('synthetic renderer with a real session', () => {
  it('draws once per layout, attachment, frame notification, run end, layout change and context restore', () => {
    const { host, session, surface, renderer } = setup();
    expect(surface.draws).toHaveLength(1);
    expect(entityIds(surface.lastDraw)).toEqual([]);
    session.control({ type: 'start' });
    expect(surface.draws).toHaveLength(2);
    expect(renderer.diagnostics()).toMatchObject({ runId: 1, drawnTick: 0, draws: 2, entities: 1 });
    host.deliver(0); host.deliver(TICK_MS); host.deliver(TICK_MS * 1.5);
    expect(surface.draws).toHaveLength(5);
    session.control({ type: 'pause' });
    expect(surface.draws).toHaveLength(6);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(surface.draws).toHaveLength(6);
    session.control({ type: 'resume' });
    host.deliver(100); host.deliver(100 + TICK_MS);
    expect(surface.draws).toHaveLength(8);
    session.control({ type: 'exit' });
    expect(surface.draws).toHaveLength(9);
    expect(entityIds(surface.lastDraw)).toEqual([]);
    expect(renderer.diagnostics()).toMatchObject({ runId: null, drawnTick: null, draws: 9, entities: 0 });
    surface.resize(800, 600);
    surface.resize(800, 600);
    expect(surface.draws).toHaveLength(10);
    surface.events!.contextLost();
    surface.events!.contextRestored();
    expect(surface.draws).toHaveLength(11);
  });

  it('leaves the session frame requests and cancellations unchanged', () => {
    const script = (withRenderer: boolean) => {
      const surface = new RecordingSurface();
      const renderer = createSyntheticRenderer({ surface, reportError: () => {} });
      const consumers = withRenderer ? [{ attach: (binding: SyntheticRenderBinding) => { renderer.attach(binding); } }] : [];
      const { host, session } = setupBridge(SYNTHETIC_TEST_OPTIONS, () => consumers);
      surface.resize();
      session.control({ type: 'start' });
      host.deliver(0); host.deliver(TICK_MS);
      session.control({ type: 'pause' }); session.control({ type: 'resume' });
      host.deliver(60); host.deliver(80);
      session.control({ type: 'restart' });
      host.deliver(90);
      session.control({ type: 'exit' });
      return { requests: host.callbacks.length, cancelled: [...host.cancelled], pending: [...host.pending.keys()] };
    };
    expect(script(true)).toEqual(script(false));
  });

  it('starts drawing a run that begins paused', () => {
    const { host, session, surface } = setup();
    host.visibility = 'hidden';
    session.control({ type: 'start' });
    expect(session.status().phase).toBe('paused');
    expect(entityIds(surface.lastDraw)).toEqual([1]);
    expect(host.pending.size).toBe(0);
  });

  it('shows accepted markers on the draw whose current state holds them and shares one geometry and material per kind', () => {
    const { host, session, surface, renderer, currentRun } = setup();
    session.control({ type: 'start' });
    const run = currentRun();
    const added: MarkerAddedEvent[] = [];
    run.on('marker-added', event => { added.push(event); });
    const disposed: unknown[] = [];
    const watched = new Set<unknown>();
    let now = 0;
    host.deliver(now);
    const step = () => {
      now += TICK_MS;
      host.deliver(now);
      expect(entityIds(surface.lastDraw)).toEqual(run.renderFrame().current.entities.map(entity => entity.id));
      for (const { geometry, material } of surface.lastDraw!.objects) {
        for (const resource of [geometry, material]) {
          if (watched.has(resource)) continue;
          watched.add(resource);
          resource.addEventListener('dispose', () => { disposed.push(resource); });
        }
      }
    };
    for (let round = 0; round < 50; round++) {
      run.submitCommand({ type: 'add-marker' });
      step();
      const event = added.at(-1)!;
      const marker = surface.lastDraw!.objects.find(object => object.name.endsWith(`-${event.entityId}`))!;
      expect(marker.position).toEqual([event.position.x, event.position.y, event.position.z]);
      run.submitCommand({ type: 'add-marker' });
      step();
      expect(entityIds(surface.lastDraw)).toEqual([1, event.entityId]);
      run.submitCommand({ type: 'remove-marker' });
      step();
      expect(entityIds(surface.lastDraw)).toEqual([1]);
      run.submitCommand({ type: 'remove-marker' });
      step();
      expect(entityIds(surface.lastDraw)).toEqual([1]);
    }
    const shared = new Map<string, Set<unknown>>();
    for (const draw of surface.draws) {
      for (const object of draw.objects) {
        const kind = object.name.endsWith('-entity-1') ? 'mover' : 'marker';
        for (const resource of [object.geometry, object.material]) {
          const key = `${kind}:${resource.type}`;
          if (!shared.has(key)) shared.set(key, new Set());
          shared.get(key)!.add(resource);
        }
      }
    }
    expect(added).toHaveLength(50);
    expect([...shared.values()].map(set => set.size)).toEqual([1, 1, 1, 1]);
    expect(disposed).toEqual([]);
    expect(renderer.diagnostics()).toMatchObject({ entities: 1, gpu: { geometries: 2, textures: 0, programs: 2 } });
  });

  it('creates new objects for a restarted run and ignores the old run afterwards', () => {
    const { host, session, surface, renderer, recorded, currentRun } = setup();
    session.control({ type: 'start' });
    host.deliver(0);
    currentRun().submitCommand({ type: 'add-marker' });
    host.deliver(TICK_MS * 31);
    const old = surface.lastDraw!.objects;
    expect(renderer.diagnostics().drawnTick).toBeGreaterThanOrEqual(5);
    const staleFrame = { runId: 1, phase: 'running', render: currentRun().renderFrame(), projection: currentRun().uiProjection(), report: null } as const;
    const beforeRestart = surface.draws.length;
    session.control({ type: 'restart' });
    expect(surface.draws).toHaveLength(beforeRestart + 2);
    const [ended, restarted] = surface.draws.slice(-2);
    expect(ended.objects).toEqual([]);
    expect(entityIds(restarted)).toEqual([1]);
    expect(restarted.objects[0].mesh).not.toBe(old[0].mesh);
    expect(renderer.diagnostics()).toMatchObject({ runId: 2, drawnTick: 0, entities: 1 });
    const draws = surface.draws.length;
    for (const { runId, listener } of recorded.frames) if (runId === 1) listener(staleFrame);
    expect(surface.draws).toHaveLength(draws);
    // The new run starts a fresh validation history, so it may use the old run's marker ID again.
    currentRun().submitCommand({ type: 'add-marker' });
    host.deliver(1000); host.deliver(1000 + TICK_MS);
    expect(entityIds(surface.lastDraw)).toEqual([1, 2]);
    expect(renderer.getSnapshot().state).toBe('ready');
  });

  it('isolates a draw failure from the session and stops drawing for good', () => {
    const surface = new RecordingSurface();
    const failure = new Error('draw');
    surface.drawFailure = failure;
    surface.drawFailureAt = 4;
    const { host, session, renderer, errors, currentRun } = setup(surface);
    const count = counted(renderer);
    session.control({ type: 'start' });
    host.deliver(0); host.deliver(TICK_MS); host.deliver(TICK_MS * 2);
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    expect(count.notifications).toBe(1);
    const draws = surface.draws.length;
    currentRun().submitCommand({ type: 'add-marker' });
    host.deliver(TICK_MS * 3);
    expect(currentRun().renderFrame().current.entities).toHaveLength(2);
    session.control({ type: 'restart' });
    host.deliver(200); host.deliver(220);
    surface.resize(1024, 768);
    expect(surface.draws).toHaveLength(draws);
    expect(session.status()).toMatchObject({ phase: 'running', error: null });
    expect(errors).toEqual([]);
    expect(() => renderer.dispose()).not.toThrow();
    expect(surface.calls.slice(-2)).toEqual(['disconnect', 'dispose']);
  });

  it('skips drawing while the context is lost and redraws the latest frame on restore', () => {
    const { host, session, surface, renderer, currentRun } = setup();
    const count = counted(renderer);
    session.control({ type: 'start' });
    host.deliver(0);
    surface.events!.contextLost();
    expect(renderer.getSnapshot()).toEqual({ state: 'context-lost', error: null });
    const draws = surface.draws.length;
    host.deliver(TICK_MS); host.deliver(TICK_MS * 2);
    expect(surface.draws).toHaveLength(draws);
    expect(currentRun().uiProjection().tick).toBe(2);
    session.control({ type: 'pause' });
    surface.resize(800, 600);
    expect(surface.draws).toHaveLength(draws);
    surface.events!.contextRestored();
    expect(renderer.getSnapshot()).toEqual({ state: 'ready', error: null });
    expect(surface.draws).toHaveLength(draws + 1);
    expect(renderer.diagnostics()).toMatchObject({ drawnTick: 2, layout: { bufferWidth: 800, bufferHeight: 600 } });
    expect(count.notifications).toBe(2);
  });

  it('notifies on state changes only, never for draws', () => {
    const { host, session, renderer } = setup();
    const count = counted(renderer);
    session.control({ type: 'start' });
    for (let frame = 0; frame < 30; frame++) host.deliver(frame * 7);
    expect(renderer.diagnostics().draws).toBeGreaterThan(30);
    expect(count.notifications).toBe(0);
  });

  it('keeps the camera projection identical across layout changes', () => {
    const { session, surface } = setup();
    session.control({ type: 'start' });
    for (const [width, height, ratio] of [[1280, 720, 1], [480, 900, 2], [320, 240, 3], [10000, 8000, 1.5]] as const) {
      surface.resize(width, height, ratio);
    }
    const projections = new Set(surface.draws.map(draw => draw.projection.join(',')));
    expect(surface.draws.length).toBeGreaterThan(4);
    expect(projections.size).toBe(1);
  });

  it('does not draw without a usable layout and redraws when one returns', () => {
    const { surface } = setup();
    surface.resize(0, 600);
    expect(surface.layouts.at(-1)).toBeNull();
    expect(surface.draws).toHaveLength(1);
    surface.resize(0.3, 0.3);
    expect(surface.draws).toHaveLength(1);
    surface.resize(640, 480);
    expect(surface.draws).toHaveLength(2);
  });

  it('fails without drawing when the surface reports an invalid maximum drawing size', () => {
    const surface = new RecordingSurface();
    surface.maxDrawingBufferSize = 0;
    const { renderer } = setup(surface);
    expect(renderer.getSnapshot()).toMatchObject({ state: 'failed', error: expect.any(RangeError) });
    expect(surface.draws).toHaveLength(0);
  });
});

describe('synthetic renderer frame validation', () => {
  const forgeries: readonly (readonly [string, (frame: SessionFrame) => SessionFrame['render']])[] = [
    ['an alpha of one', ({ render }) => ({ ...render, alpha: 1 })],
    ['a tick gap', ({ render }) => ({ ...render, current: { ...render.current, tick: render.previous.tick + 2 } })],
    ['a tick going back', ({ render }) => ({ alpha: 0, previous: { ...render.previous, tick: 0 }, current: { ...render.current, tick: 0 } })],
    ['a zero ID', ({ render }) => ({ ...render, current: { ...render.current, entities: [{ ...render.current.entities[0], id: 0 }] } })],
    ['duplicate IDs', ({ render }) => ({ ...render, current: { ...render.current, entities: [render.current.entities[0], render.current.entities[0]] } })],
    ['descending IDs', ({ render }) => ({
      ...render, current: { ...render.current, entities: [{ id: 5, kind: 'marker', position: { x: 0, y: 0, z: 0 } }, render.current.entities[0]] },
    })],
    ['an unknown kind', ({ render }) => ({ ...render, current: { ...render.current, entities: [{ ...render.current.entities[0], kind: 'ship' as never }] } })],
    ['a non-finite coordinate', ({ render }) => ({
      ...render, current: { ...render.current, entities: [{ ...render.current.entities[0], position: { x: Number.NaN, y: 0, z: 0 } }] },
    })],
    ['a kind conflict between states', ({ render }) => ({
      ...render, current: { ...render.current, entities: [{ ...render.current.entities[0], kind: 'marker' }] },
    })],
    ['a reused marker ID', ({ render }) => ({
      ...render, current: { ...render.current, entities: [render.current.entities[0], { id: 2, kind: 'marker', position: { x: 0, y: 0, z: 0 } }] },
    })],
  ];

  for (const [name, forge] of forgeries) {
    it(`rejects ${name} before changing the scene, without disturbing the session`, () => {
      const { host, session, sessionErrors, renderer, surface, run, deliver } = directSetup();
      host.deliver(0);
      run.submitCommand({ type: 'add-marker' });
      host.deliver(TICK_MS * 5);
      run.submitCommand({ type: 'remove-marker' });
      host.deliver(TICK_MS * 6);
      host.deliver(TICK_MS * 6.5);
      const before = surface.lastDraw!.objects;
      const status = session.status();
      const real: SessionFrame = { runId: run.runId, phase: 'running', render: run.renderFrame(), projection: run.uiProjection(), report: null };
      expect(() => deliver({ ...real, render: forge(real) })).not.toThrow();
      expect(renderer.getSnapshot()).toMatchObject({ state: 'failed', error: expect.objectContaining({ name: 'SyntheticRenderFrameError' }) });
      expect(surface.lastDraw!.objects).toBe(before);
      expect(before.map(object => [object.mesh.position.toArray(), object.mesh.parent !== null])).toEqual(
        before.map(object => [[...object.position], true]),
      );
      expect(session.status()).toEqual(status);
      expect(sessionErrors).toEqual([]);
      host.deliver(TICK_MS * 8);
      expect(surface.lastDraw!.objects).toBe(before);
    });
  }
});

describe('synthetic renderer lifecycle', () => {
  it('disconnects, disposes the shared resources once, then the surface, without notifying', () => {
    const { host, session, surface, renderer, currentRun } = setup();
    session.control({ type: 'start' });
    host.deliver(0);
    currentRun().submitCommand({ type: 'add-marker' });
    host.deliver(TICK_MS);
    const count = counted(renderer);
    const { events } = surface;
    const objects = surface.lastDraw!.objects;
    expect(objects).toHaveLength(2);
    for (const [index, { geometry, material }] of objects.entries()) {
      geometry.addEventListener('dispose', () => { surface.calls.push(`geometry ${index}`); });
      material.addEventListener('dispose', () => { surface.calls.push(`material ${index}`); });
    }
    renderer.dispose();
    renderer.dispose();
    const tail = surface.calls.slice(surface.calls.lastIndexOf('disconnect'));
    expect(tail[0]).toBe('disconnect');
    expect(tail.at(-1)).toBe('dispose');
    expect(tail.slice(1, -1).sort()).toEqual(['geometry 0', 'geometry 1', 'material 0', 'material 1']);
    expect(renderer.getSnapshot().state).toBe('disposed');
    expect(renderer.diagnostics()).toMatchObject({ state: 'disposed', gpu: null, entities: 0 });
    const draws = surface.draws.length;
    events!.contextLost();
    events!.resize({ width: 300, height: 300, devicePixelRatio: 1 });
    events!.contextRestored();
    session.control({ type: 'exit' });
    expect(surface.draws).toHaveLength(draws);
    expect(count.notifications).toBe(0);
  });

  it('attempts every cleanup step and aggregates the failures', () => {
    const surface = new RecordingSurface();
    const { renderer } = setup(surface);
    const disconnect = new Error('disconnect'), dispose = new Error('dispose');
    surface.disconnectFailure = disconnect;
    surface.disposeFailure = dispose;
    let thrown: unknown;
    try { renderer.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([disconnect, dispose]);
    expect(() => renderer.dispose()).not.toThrow();
  });

  it('rolls back a partial attachment and keeps rollback failures', () => {
    const { session, renderer } = directSetup();
    session.control({ type: 'restart' });
    const run = session.currentRun()!;
    const owned: SessionCleanup[] = [];
    const registration = new Error('ownCleanup'), rollback = new Error('cancel');
    let cancels = 0;
    const binding = (cancelFailure: unknown): SyntheticRenderBinding => ({
      run: {
        runId: run.runId,
        renderFrame: () => run.renderFrame(),
        onFrame: () => (): undefined => { cancels++; if (cancelFailure) throw cancelFailure; },
        ownCleanup: () => { throw registration; },
      },
      isCurrent: () => true,
      own: cleanup => { owned.push(cleanup); },
    });
    expect(() => renderer.attach(binding(undefined))).toThrow(registration);
    expect(cancels).toBe(1);
    let thrown: unknown;
    try { renderer.attach(binding(rollback)); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([registration, rollback]);
    expect(cancels).toBe(2);
    for (const cleanup of owned) cleanup();
    expect(cancels).toBe(2);
  });

  it('disposes a surface it cannot connect', () => {
    const surface = new RecordingSurface();
    const failure = new Error('connect');
    surface.connectFailure = failure;
    expect(() => createSyntheticRenderer({ surface, reportError: () => {} })).toThrow(failure);
    expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);
    surface.disposeFailure = new Error('dispose');
    let thrown: unknown;
    try { createSyntheticRenderer({ surface, reportError: () => {} }); } catch (error) { thrown = error; }
    expect((thrown as AggregateError).errors).toEqual([failure, surface.disposeFailure]);
  });

  it('reports without a surface, attaches nothing and has no GPU statistics', () => {
    const cause = new Error('no WebGL 2');
    const renderer = createSyntheticRenderer({ unavailable: cause, reportError: () => {} });
    expect(renderer.getSnapshot()).toEqual({ state: 'unavailable', error: cause });
    let registered = 0;
    const run = { runId: 1 } as Pick<SessionRun, 'runId'>;
    renderer.attach({
      run: { ...run, renderFrame: () => { throw new Error('unused'); }, onFrame: () => { registered++; return () => undefined; }, ownCleanup: () => () => undefined },
      isCurrent: () => true,
      own: () => {},
    });
    expect(registered).toBe(0);
    expect(renderer.diagnostics()).toEqual({ state: 'unavailable', runId: null, drawnTick: null, draws: 0, entities: 0, gpu: null, layout: null });
    renderer.dispose();
    expect(renderer.getSnapshot()).toEqual({ state: 'disposed', error: null });
  });

  it('restores the last drawn scene when the surface fails to draw a changed frame', () => {
    const surface = new RecordingSurface();
    const { host, session, renderer, errors, currentRun } = setup(surface);
    session.control({ type: 'start' });
    host.deliver(0);
    currentRun().submitCommand({ type: 'add-marker' });
    host.deliver(TICK_MS);
    currentRun().setInput({ moveX: 1 });
    host.deliver(TICK_MS * 2);
    const before = surface.lastDraw!.objects;
    const diagnostics = renderer.diagnostics();
    surface.drawFailure = new Error('draw');
    surface.drawFailureAt = 0;
    currentRun().submitCommand({ type: 'remove-marker' });
    host.deliver(TICK_MS * 3.5);
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: surface.drawFailure });
    expect(before.map(object => [object.mesh.position.toArray(), object.mesh.parent !== null])).toEqual(
      before.map(object => [[...object.position], true]),
    );
    expect(renderer.diagnostics()).toEqual({ ...diagnostics, state: 'failed' });
    expect(errors).toEqual([]);
  });

  it('keeps the session healthy when a state listener and the error outlet both throw', () => {
    const surface = new RecordingSurface();
    const renderer = createSyntheticRenderer({ surface, reportError: () => { throw new Error('outlet'); } });
    const { host, session, errors } = setupBridge(SYNTHETIC_TEST_OPTIONS, () => [{ attach: binding => { renderer.attach(binding); } }]);
    surface.resize();
    renderer.subscribe(() => { throw new Error('listener'); });
    session.control({ type: 'start' });
    host.deliver(0);
    surface.drawFailure = new Error('draw');
    host.deliver(TICK_MS);
    expect(renderer.getSnapshot().state).toBe('failed');
    session.control({ type: 'exit' });
    expect(session.status()).toMatchObject({ phase: 'idle', error: null, cleanupFailed: false });
    expect(errors).toEqual([]);
  });

  it('reports a throwing state listener without breaking the frame that changed the state', () => {
    const surface = new RecordingSurface();
    const { session, renderer, reported, errors } = setup(surface);
    const failure = new Error('listener');
    renderer.subscribe(() => { throw failure; });
    session.control({ type: 'start' });
    surface.events!.contextLost();
    expect(reported).toEqual([failure]);
    expect(errors).toEqual([]);
    expect(renderer.getSnapshot().state).toBe('context-lost');
  });
});
