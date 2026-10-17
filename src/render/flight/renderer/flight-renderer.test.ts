import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, WebGLRenderTarget } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import { RecordingSurface } from '../../scene/render-surface.test-support.ts';
import { GraphicsDeviceError } from '../../scene/render-surface.ts';
import { renderState } from '../presentation/presentation.test-support.ts';
import type { FlightRunBinding } from './flight-gpu-cache.ts';
import { FlightRenderError } from './flight-render-error.ts';
import { createFlightRenderer, type FlightFrame } from './flight-renderer.ts';

const binding = (runId = 1, change: Partial<FlightRunBinding> = {}): FlightRunBinding => ({ ownerId: 1, runId, generation: 1, identity: 'identity', ...change });

const frame = (tick: number, runId = 1): FlightFrame => {
  const current = renderState(tick);
  return { runId, render: { previous: current, current, alpha: 0 } };
};

function setup() {
  const surface = new RecordingSurface();
  const reportError = vi.fn<(error: unknown) => void>();
  const renderer = createFlightRenderer({ ownerId: 1, surface, reportError });
  const changes: string[] = [];
  renderer.subscribe(() => { changes.push(renderer.getSnapshot().state); });
  return { surface, renderer, reportError, changes };
}

/** Acquires one quad, one material and one texture in the run's cache, as a pass would. */
function acquireSome(resources: ReturnType<ReturnType<typeof setup>['renderer']['beginRun']>['resources']) {
  const geometry = resources.geometry('quad', { vertices: 3, indices: 0 }, () => {
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    return result;
  });
  const material = resources.material('flat', () => new MeshBasicMaterial());
  return new Mesh(geometry, material);
}

describe('flight renderer', () => {
  it('connects its surface, draws each frame of the bound run once it has a layout, and redraws the last on a layout change', () => {
    const { surface, renderer } = setup();
    expect(surface.calls).toEqual(['connect']);
    const run = renderer.beginRun(binding());
    run.draw(frame(0));
    expect(surface.draws).toHaveLength(0);
    surface.resize(800, 600, 2);
    expect(surface.layouts).toHaveLength(1);
    expect(renderer.diagnostics()).toMatchObject({ draws: 1, lastTick: 0 });
    run.draw(frame(1));
    run.draw(frame(3));
    surface.resize(800, 600, 2);
    expect(surface.draws).toHaveLength(3);
    surface.resize(640, 480, 1);
    expect(surface.calls.slice(-2)).toEqual(['layout', 'draw']);
    expect(renderer.diagnostics()).toMatchObject({ state: 'ready', runId: 1, draws: 4, lastTick: 3, gpu: { geometries: 0, textures: 0, programs: 0 } });
    expect(renderer.diagnostics().layout).toMatchObject({ bufferWidth: 640, bufferHeight: 480 });
    expect(() => { run.draw(frame(4, 2)); }).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('binds one run at a time, of its own owner, and refuses malformed bindings', () => {
    const { renderer } = setup();
    expect(() => renderer.beginRun(binding(1, { ownerId: 2 }))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(() => renderer.beginRun(binding(1, { identity: '' }))).toThrow(FlightRenderError);
    const first = renderer.beginRun(binding(1));
    expect(() => renderer.beginRun(binding(2))).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    first.release();
    first.release();
    expect(renderer.diagnostics().runId).toBeNull();
    expect(() => { first.draw(frame(1)); }).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    expect(renderer.beginRun(binding(2)).binding).toEqual(binding(2));
  });

  it('returns every run resource and has equal warm counts on a retry with the same content', () => {
    const { surface, renderer } = setup();
    surface.resize();
    const counts = [];
    for (const runId of [1, 2]) {
      const run = renderer.beginRun(binding(runId));
      const mesh = acquireSome(run.resources);
      // Until passes add to the renderer's scene, drawing the mesh on the surface uploads it as the renderer would.
      surface.draw(new Scene().add(mesh), new OrthographicCamera());
      run.draw(frame(1, runId));
      counts.push({ resources: renderer.diagnostics().resources, gpu: renderer.diagnostics().gpu });
      run.release();
      expect(run.resources.counts()).toMatchObject({ geometries: 0, materials: 0, vertices: 0 });
      expect(renderer.diagnostics()).toMatchObject({ resources: null, gpu: { geometries: 0, textures: 0, programs: 0 } });
    }
    expect(counts[1]).toEqual(counts[0]);
    expect(counts[0]).toMatchObject({ resources: { geometries: 1, materials: 1, vertices: 3 }, gpu: { geometries: 1, programs: 1 } });
  });

  it('submits nothing while the context is lost and redraws the last frame once restored, without a new frame', () => {
    const { surface, renderer, changes } = setup();
    surface.resize();
    const run = renderer.beginRun(binding());
    run.draw(frame(1));
    surface.events!.contextLost();
    run.draw(frame(2));
    expect(surface.draws).toHaveLength(1);
    expect(renderer.getSnapshot()).toEqual({ state: 'context-lost', error: null });
    surface.events!.contextRestored();
    expect(surface.draws).toHaveLength(2);
    expect(renderer.diagnostics()).toMatchObject({ draws: 2, lastTick: 2 });
    run.draw(frame(3));
    expect(surface.draws).toHaveLength(3);
    expect(changes).toEqual(['context-lost', 'ready']);
  });

  it('continues without the picture after a device failure, once the run\'s resources are released', () => {
    const { surface, renderer, changes } = setup();
    surface.resize();
    const run = renderer.beginRun(binding());
    acquireSome(run.resources);
    const failure = new GraphicsDeviceError('lost', { cause: new Error('device') });
    surface.drawFailure = failure;
    run.draw(frame(1));
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    expect(run.resources.released).toBe(true);
    run.draw(frame(2));
    expect(surface.calls.filter((call) => call === 'draw')).toHaveLength(1);
    expect(changes).toEqual(['failed']);
    run.release();
    expect(() => renderer.beginRun(binding(2))).not.toThrow();
  });

  it('throws when a failed device\'s resources cannot be released, and refuses later runs', () => {
    const { surface, renderer } = setup();
    surface.resize();
    const run = renderer.beginRun(binding());
    const stuck = new MeshBasicMaterial();
    const release = new Error('release failed');
    stuck.dispose = () => { throw release; };
    run.resources.material('stuck', () => stuck);
    surface.drawFailure = new GraphicsDeviceError('lost', { cause: null });
    expect(() => { run.draw(frame(1)); }).toThrow(RollbackError);
    expect(renderer.getSnapshot().state).toBe('failed');
    run.release();
    expect(() => renderer.beginRun(binding(2))).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('throws every other draw failure and refuses later draws and runs with it as the cause', () => {
    const { surface, renderer, changes } = setup();
    surface.resize();
    const run = renderer.beginRun(binding());
    const failure = new Error('shader failed');
    surface.drawFailure = failure;
    expect(() => { run.draw(frame(1)); }).toThrow(failure);
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    expect(() => { run.draw(frame(2)); }).toThrow(expect.objectContaining({ kind: 'invalid-state', cause: failure }));
    run.release();
    expect(() => renderer.beginRun(binding(2))).toThrow(expect.objectContaining({ cause: failure }));
    expect(changes).toEqual(['failed']);
  });

  it('fails on a failed redraw outside a frame and throws it from the next draw', () => {
    const { surface, renderer } = setup();
    surface.resize();
    const run = renderer.beginRun(binding());
    run.draw(frame(1));
    const failure = new Error('redraw failed');
    surface.drawFailure = failure;
    surface.resize(800, 600);
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    expect(() => { run.draw(frame(2)); }).toThrow(expect.objectContaining({ cause: failure }));
  });

  it('checks the run\'s whole GPU plan before binding it, and allows render targets only within a layout', () => {
    const { surface, renderer } = setup();
    expect(() => renderer.beginRun(binding(), { texels: 2 ** 25 + 1, vertices: 0, indices: 0, renderTargets: 0 }))
      .toThrow(expect.objectContaining({ kind: 'render-capacity' }));
    expect(renderer.diagnostics().runId).toBeNull();
    const run = renderer.beginRun(binding(), { texels: 2 ** 25, vertices: 2 ** 18, indices: 2 ** 18, renderTargets: 4 });
    const create = vi.fn(() => new WebGLRenderTarget(1, 1));
    expect(() => run.resources.renderTarget('scene', { width: 1, height: 1 }, create)).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
    expect(create).not.toHaveBeenCalled();
    surface.resize(640, 480);
    expect(run.resources.renderTarget('scene', { width: 640, height: 480 }, () => new WebGLRenderTarget(640, 480)).width).toBe(640);
  });

  it('fails on a layout failure outside a frame and throws it from the next draw', () => {
    const { surface, renderer } = setup();
    const run = renderer.beginRun(binding());
    const failure = new Error('layout failed');
    surface.layoutFailure = failure;
    surface.resize();
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    expect(() => { run.draw(frame(1)); }).toThrow(expect.objectContaining({ cause: failure }));
  });

  it('latches a run whose resources could not be released', () => {
    const { renderer } = setup();
    const run = renderer.beginRun(binding());
    const stuck = new MeshBasicMaterial();
    stuck.dispose = () => { throw new Error('release failed'); };
    run.resources.material('stuck', () => stuck);
    expect(() => { run.release(); }).toThrow(AggregateError);
    expect(() => renderer.beginRun(binding(2))).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('disposes the bound run, then the surface, attempting each step, without notifying', () => {
    const { surface, renderer, changes } = setup();
    const run = renderer.beginRun(binding());
    acquireSome(run.resources);
    const failure = new Error('disconnect failed');
    surface.disconnectFailure = failure;
    expect(() => { renderer.dispose(); }).toThrow(expect.objectContaining({ errors: [failure] }));
    expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);
    expect(run.resources.released).toBe(true);
    expect(renderer.diagnostics()).toMatchObject({ state: 'disposed', gpu: null, resources: null });
    expect(changes).toEqual([]);
    renderer.dispose();
    expect(() => renderer.beginRun(binding(2))).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('reports only that WebGL 2 is unavailable, and lets runs bind and frames pass without drawing', () => {
    const cause = new Error('no WebGL 2');
    const renderer = createFlightRenderer({ ownerId: 1, unavailable: cause, reportError: () => undefined });
    expect(renderer.getSnapshot()).toEqual({ state: 'unavailable', error: cause });
    const run = renderer.beginRun(binding());
    run.draw(frame(1));
    expect(renderer.diagnostics()).toMatchObject({ state: 'unavailable', draws: 0, gpu: null, resources: { geometries: 0 } });
    run.release();
    renderer.dispose();
    expect(renderer.getSnapshot().state).toBe('disposed');
  });

  it('releases the surface when connecting it fails, as a RollbackError when that fails too', () => {
    const surface = new RecordingSurface();
    const failure = new Error('connect failed');
    surface.connectFailure = failure;
    expect(() => createFlightRenderer({ ownerId: 1, surface, reportError: () => undefined })).toThrow(failure);
    expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);
    const stuck = new RecordingSurface();
    stuck.connectFailure = failure;
    stuck.disposeFailure = new Error('dispose failed');
    expect(() => createFlightRenderer({ ownerId: 1, surface: stuck, reportError: () => undefined })).toThrow(RollbackError);
  });

  it('reports a failing state listener and keeps notifying the others', () => {
    const { surface, renderer, reportError, changes } = setup();
    const failure = new Error('listener failed');
    renderer.subscribe(() => { throw failure; });
    surface.events!.contextLost();
    expect(reportError).toHaveBeenCalledWith(failure);
    expect(changes).toEqual(['context-lost']);
  });
});
