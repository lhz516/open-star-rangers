import { Scene, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderSurfaceEvents, RenderSurfaceSize } from '../scene/render-surface.ts';
import { computeViewportLayout, type ViewportFrame } from '../viewport/viewport-layout.ts';
import { createWebGLSurface, type WebGLContextEventType, type WebGLSurfaceParts } from './webgl-surface.ts';

/** Fake browser parts recording every registration, revocation and release in one ordered log. */
function fakeParts(options: { readonly loseContext?: boolean } = {}) {
  const log: string[] = [];
  const contextListeners = new Map<WebGLContextEventType, Set<() => void>>([['webglcontextlost', new Set()], ['webglcontextrestored', new Set()]]);
  let sizeListener: ((width: number, height: number) => void) | null = null;
  const ratioWatches: { ratio: number; listener: () => void; active: boolean }[] = [];
  const state = { devicePixelRatio: 1, placed: [] as (ViewportFrame | null)[], buffers: [] as [number, number, number][] };
  const info = { memory: { geometries: 3, textures: 1 }, programs: [{}, {}] as unknown[] | null };
  const failures: Partial<Record<'dispose' | 'loseContext' | 'removeCanvas' | 'unobserve', unknown>> = {};
  const parts: WebGLSurfaceParts = {
    renderer: {
      setDrawingBufferSize: (width, height, ratio) => { state.buffers.push([width, height, ratio]); },
      render: () => { log.push('render'); },
      get info() { return info; },
      dispose: () => { log.push('renderer.dispose'); if (failures.dispose) throw failures.dispose; },
    },
    canvas: {
      addEventListener: (type, listener) => { log.push(`add ${type}`); contextListeners.get(type)!.add(listener); },
      removeEventListener: (type, listener) => { log.push(`remove ${type}`); contextListeners.get(type)!.delete(listener); },
    },
    maxDrawingBufferSize: 4096,
    loseContext: options.loseContext === false ? null : () => {
      log.push('loseContext');
      if (failures.loseContext) throw failures.loseContext;
      for (const listener of [...contextListeners.get('webglcontextlost')!]) listener();
    },
    placeCanvas: frame => { state.placed.push(frame); },
    removeCanvas: () => { log.push('removeCanvas'); if (failures.removeCanvas) throw failures.removeCanvas; },
    observeSize: listener => {
      log.push('observe size');
      sizeListener = listener;
      return () => { log.push('unobserve size'); sizeListener = null; if (failures.unobserve) throw failures.unobserve; };
    },
    readDevicePixelRatio: () => state.devicePixelRatio,
    watchDevicePixelRatio: (ratio, listener) => {
      log.push(`watch ${ratio}`);
      const watch = { ratio, listener, active: true };
      ratioWatches.push(watch);
      return () => { log.push(`unwatch ${ratio}`); watch.active = false; };
    },
  };
  return {
    parts, log, state, info, failures, ratioWatches,
    resizeContainer: (width: number, height: number) => { sizeListener?.(width, height); },
    /** Changes the ratio and fires every active query that no longer matches. */
    changeRatio: (ratio: number) => {
      state.devicePixelRatio = ratio;
      for (const watch of ratioWatches.filter(entry => entry.active && entry.ratio !== ratio)) watch.listener();
    },
    fireContext: (type: WebGLContextEventType) => { for (const listener of [...contextListeners.get(type)!]) listener(); },
    contextListenerCount: () => contextListeners.get('webglcontextlost')!.size + contextListeners.get('webglcontextrestored')!.size,
  };
}

function recordingEvents() {
  const received: (RenderSurfaceSize | 'lost' | 'restored')[] = [];
  const events: RenderSurfaceEvents = {
    resize: size => { received.push(size); },
    contextLost: () => { received.push('lost'); },
    contextRestored: () => { received.push('restored'); },
  };
  return { received, events };
}

describe('WebGL surface', () => {
  it('registers context listeners, the pixel-ratio query and the size observer on connect, then reports sizes', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    const { received, events } = recordingEvents();
    expect(fake.log).toEqual([]);
    surface.connect(events);
    expect(fake.log).toEqual(['add webglcontextlost', 'add webglcontextrestored', 'watch 1', 'observe size']);
    expect(() => surface.connect(events)).toThrow('connects once');
    fake.changeRatio(2);
    expect(received).toEqual([]);
    fake.resizeContainer(800, 600);
    expect(received).toEqual([{ width: 800, height: 600, devicePixelRatio: 2 }]);
    fake.fireContext('webglcontextlost');
    fake.fireContext('webglcontextrestored');
    expect(received.slice(1)).toEqual(['lost', 'restored']);
    expect(surface.maxDrawingBufferSize).toBe(4096);
  });

  it('replaces the resolution query on every pixel-ratio change and reports the new ratio with the last size', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    const { received, events } = recordingEvents();
    surface.connect(events);
    fake.resizeContainer(640, 480);
    for (const ratio of [2, 1.5, 3]) fake.changeRatio(ratio);
    expect(received.slice(1)).toEqual([2, 1.5, 3].map(devicePixelRatio => ({ width: 640, height: 480, devicePixelRatio })));
    expect(fake.ratioWatches.map(watch => [watch.ratio, watch.active])).toEqual([[1, false], [2, false], [1.5, false], [3, true]]);
    surface.disconnect();
    expect(fake.ratioWatches.every(watch => !watch.active)).toBe(true);
    const registered = fake.log.filter(entry => entry.startsWith('watch')).length;
    expect(fake.log.filter(entry => entry.startsWith('unwatch'))).toHaveLength(registered);
  });

  it('sizes the drawing buffer exactly and places or hides the canvas', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    const layout = computeViewportLayout({ width: 1280, height: 800, devicePixelRatio: 2, maxDrawingBufferSize: 4096 })!;
    surface.setLayout(layout);
    surface.setLayout(null);
    expect(fake.state.buffers).toEqual([[layout.bufferWidth, layout.bufferHeight, 1]]);
    expect(fake.state.placed).toEqual([layout.frame, null]);
    surface.draw(new Scene(), new PerspectiveCamera());
    expect(fake.log).toEqual(['render']);
  });

  it('reads GPU counters from the renderer every time', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    expect(surface.gpuStats()).toEqual({ geometries: 3, textures: 1, programs: 2 });
    fake.info.memory.geometries = 5;
    fake.info.programs = null;
    expect(surface.gpuStats()).toEqual({ geometries: 5, textures: 1, programs: 0 });
  });

  it('stops observing before releasing, so a forced context loss is never reported', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    const { received, events } = recordingEvents();
    surface.connect(events);
    fake.log.length = 0;
    surface.disconnect();
    surface.dispose();
    surface.dispose();
    expect(fake.log).toEqual([
      'remove webglcontextlost', 'remove webglcontextrestored', 'unwatch 1', 'unobserve size',
      'renderer.dispose', 'loseContext', 'removeCanvas',
    ]);
    expect(fake.contextListenerCount()).toBe(0);
    expect(received).toEqual([]);
    fake.resizeContainer(10, 10);
    fake.changeRatio(2);
    expect(received).toEqual([]);
  });

  it('skips the context drop without the extension and still removes the canvas', () => {
    const fake = fakeParts({ loseContext: false });
    const surface = createWebGLSurface(fake.parts);
    surface.connect(recordingEvents().events);
    fake.log.length = 0;
    surface.dispose();
    expect(fake.log).toEqual([
      'remove webglcontextlost', 'remove webglcontextrestored', 'unwatch 1', 'unobserve size', 'renderer.dispose', 'removeCanvas',
    ]);
  });

  it('attempts every release step and aggregates the failures', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    surface.connect(recordingEvents().events);
    const unobserve = new Error('unobserve'), dispose = new Error('dispose'), lose = new Error('lose'), remove = new Error('remove');
    Object.assign(fake.failures, { unobserve, dispose, loseContext: lose, removeCanvas: remove });
    let thrown: unknown;
    try { surface.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    const [observation, ...rest] = (thrown as AggregateError).errors;
    expect((observation as AggregateError).errors).toEqual([unobserve]);
    expect(rest).toEqual([dispose, lose, remove]);
    expect(fake.contextListenerCount()).toBe(0);
    expect(() => surface.dispose()).not.toThrow();
  });

  it('can be disconnected and disposed before it ever connected', () => {
    const fake = fakeParts();
    const surface = createWebGLSurface(fake.parts);
    surface.disconnect();
    surface.dispose();
    expect(fake.log).toEqual(['renderer.dispose', 'loseContext', 'removeCanvas']);
    expect(() => surface.connect(recordingEvents().events)).toThrow('connects once');
  });
});
