import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SceneModule from '../../core/synthetic/synthetic-scene.ts';
import type { SyntheticSceneConfig, TickInput } from '../../core/synthetic/synthetic-scene.ts';
import { setupBridge, SYNTHETIC_TEST_OPTIONS } from '../../ui/game/synthetic-ui.test-support.ts';
import { RecordingSurface } from '../scene/render-surface.test-support.ts';
import { createSyntheticRenderer } from './synthetic-renderer.ts';

/** Fails the Nth Core step after `failOn` is set, at the scene creation boundary; production has no hook. */
const injection = vi.hoisted(() => ({ failOn: 0, calls: 0, cause: new Error('Core injection') }));
vi.mock('../../core/synthetic/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      const scene = original.createSyntheticScene(config);
      return {
        inspect: () => scene.inspect(), uiProjection: () => scene.uiProjection(), renderState: () => scene.renderState(),
        step(input: TickInput) {
          injection.calls++;
          if (injection.calls === injection.failOn) throw injection.cause;
          return scene.step(input);
        },
      };
    },
  };
});
afterEach(() => { injection.failOn = 0; injection.calls = 0; });

describe('synthetic renderer when Core faults', () => {
  it('draws exactly one empty frame as the faulted run ends and draws the restarted run from tick 0', () => {
    const surface = new RecordingSurface();
    const renderer = createSyntheticRenderer({ surface, reportError: error => { throw error; } });
    const { host, session, errors, recorded, currentRun } = setupBridge(SYNTHETIC_TEST_OPTIONS, () => [{ attach: binding => { renderer.attach(binding); } }]);
    surface.resize();
    session.control({ type: 'start' });
    host.deliver(0);
    currentRun().submitCommand({ type: 'add-marker' });
    host.deliver(20);
    expect(surface.lastDraw!.objects).toHaveLength(2);
    const staleFrame = { runId: 1, phase: 'running', render: currentRun().renderFrame(), projection: currentRun().uiProjection(), report: null } as const;
    const draws = surface.draws.length;
    injection.failOn = injection.calls + 1;
    host.deliver(40);
    expect(session.status()).toMatchObject({ phase: 'faulted', runId: 1 });
    expect(errors.at(-1)).toMatchObject({ kind: 'operation-failed', failures: [{ phase: 'runtime' }] });
    expect(surface.draws).toHaveLength(draws + 1);
    expect(surface.lastDraw!.objects).toEqual([]);
    expect(renderer.getSnapshot()).toEqual({ state: 'ready', error: null });
    expect(renderer.diagnostics()).toMatchObject({ runId: null, drawnTick: null, entities: 0 });
    for (const { runId, listener } of recorded.frames) if (runId === 1) listener(staleFrame);
    expect(surface.draws).toHaveLength(draws + 1);
    session.control({ type: 'restart' });
    expect(surface.draws).toHaveLength(draws + 2);
    expect(surface.lastDraw!.objects.map(object => object.name)).toEqual(['run-2-entity-1']);
    expect(renderer.diagnostics()).toMatchObject({ runId: 2, drawnTick: 0, entities: 1 });
    renderer.dispose();
  });
});
