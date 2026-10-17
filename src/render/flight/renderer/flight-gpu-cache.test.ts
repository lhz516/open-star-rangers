import { BufferAttribute, BufferGeometry, MeshBasicMaterial, Texture, WebGLRenderTarget } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import { checkGpuPlan, EMPTY_GPU_PLAN, FlightGpuCache, type FlightRunBinding } from './flight-gpu-cache.ts';
import { FLIGHT_GPU_LIMITS, FlightRenderError } from './flight-render-error.ts';

const BINDING: FlightRunBinding = Object.freeze({ ownerId: 1, runId: 1, generation: 3, identity: 'identity-a' });

const cache = (max = { width: 1280, height: 960 }) => new FlightGpuCache(BINDING, () => max);

function geometry(vertices: number, indices = 0): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
  if (indices > 0) result.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return result;
}

/** A texture whose image only has a size, as the cache reads it. */
function texture(width: number, height: number): Texture {
  const result = new Texture();
  result.image = { width, height };
  return result;
}

/** Records every dispose of what it creates; `failure` makes those disposals throw. */
function tracked<Resource extends { dispose(): void; addEventListener(type: 'dispose', listener: () => void): void }>(resource: Resource, log: string[], name: string) {
  resource.addEventListener('dispose', () => { log.push(name); });
  return resource;
}

describe('FlightGpuCache', () => {
  it('shares each resource by key within the run and counts what it holds', () => {
    const gpu = cache();
    const create = vi.fn(() => geometry(4, 6));
    const first = gpu.geometry('quad', { vertices: 4, indices: 6 }, create);
    expect(gpu.geometry('quad', { vertices: 4, indices: 6 }, create)).toBe(first);
    expect(create).toHaveBeenCalledOnce();
    gpu.material('flat', () => new MeshBasicMaterial());
    gpu.texture('image/a', { width: 16, height: 8 }, () => texture(16, 8));
    gpu.renderTarget('scene', { width: 640, height: 480 }, () => new WebGLRenderTarget(640, 480));
    expect(gpu.counts()).toEqual({ geometries: 1, materials: 1, textures: 1, renderTargets: 1, vertices: 4, indices: 6, texels: 128 });
    expect(() => gpu.texture('quad', { width: 1, height: 1 }, () => texture(1, 1))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('releases one key, then everything newest first, leaving every count at zero', () => {
    const log: string[] = [];
    const gpu = cache();
    gpu.geometry('g', { vertices: 3, indices: 0 }, () => tracked(geometry(3), log, 'g'));
    gpu.material('m', () => tracked(new MeshBasicMaterial(), log, 'm'));
    gpu.texture('t', { width: 2, height: 2 }, () => tracked(texture(2, 2), log, 't'));
    gpu.release('m');
    gpu.release('m');
    expect(log).toEqual(['m']);
    expect(gpu.counts()).toMatchObject({ materials: 0, geometries: 1, textures: 1 });
    gpu.dispose();
    gpu.dispose();
    expect(log).toEqual(['m', 't', 'g']);
    expect(gpu.released).toBe(true);
    expect(Object.values(gpu.counts()).every((count) => count === 0)).toBe(true);
    expect(() => gpu.material('m', () => new MeshBasicMaterial())).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('attempts every release and throws an AggregateError of the failures', () => {
    const gpu = cache();
    const failure = new Error('dispose failed');
    const failing = new MeshBasicMaterial();
    failing.dispose = () => { throw failure; };
    const log: string[] = [];
    gpu.geometry('g', { vertices: 3, indices: 0 }, () => tracked(geometry(3), log, 'g'));
    gpu.material('m', () => failing);
    expect(() => { gpu.dispose(); }).toThrow(expect.objectContaining({ errors: [failure] }));
    expect(log).toEqual(['g']);
    expect(gpu.counts().geometries).toBe(0);
  });

  describe('budgets, checked before allocation', () => {
    it('checks a run\'s whole plan against every budget: the limit passes, one more does not', () => {
      const limit = { texels: FLIGHT_GPU_LIMITS.texels, vertices: FLIGHT_GPU_LIMITS.vertices, indices: FLIGHT_GPU_LIMITS.indices, renderTargets: FLIGHT_GPU_LIMITS.renderTargets };
      expect(() => { checkGpuPlan(limit); }).not.toThrow();
      expect(() => { checkGpuPlan(EMPTY_GPU_PLAN); }).not.toThrow();
      for (const measure of Object.keys(limit) as (keyof typeof limit)[]) {
        expect(() => { checkGpuPlan({ ...limit, [measure]: limit[measure] + 1 }); }).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
        expect(() => { checkGpuPlan({ ...limit, [measure]: -1 }); }).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
      }
    });

    it('allows texels up to the limit and refuses one more without creating it', () => {
      const gpu = cache();
      const side = 2 ** 12;
      for (let at = 0; at < FLIGHT_GPU_LIMITS.texels / (side * side); at++) gpu.texture(`t${at}`, { width: side, height: side }, () => texture(side, side));
      expect(gpu.counts().texels).toBe(FLIGHT_GPU_LIMITS.texels);
      const create = vi.fn(() => texture(1, 1));
      expect(() => gpu.texture('one-more', { width: 1, height: 1 }, create)).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
      expect(create).not.toHaveBeenCalled();
    });

    it('allows vertices and indices up to their limits and refuses one more', () => {
      const gpu = cache();
      const limit = FLIGHT_GPU_LIMITS.vertices;
      gpu.geometry('all', { vertices: limit, indices: FLIGHT_GPU_LIMITS.indices }, () => geometry(limit, FLIGHT_GPU_LIMITS.indices));
      const create = vi.fn(() => geometry(1));
      expect(() => gpu.geometry('vertex', { vertices: 1, indices: 0 }, create)).toThrow(FlightRenderError);
      expect(() => gpu.geometry('index', { vertices: 0, indices: 1 }, create)).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
      expect(create).not.toHaveBeenCalled();
      expect(gpu.counts()).toMatchObject({ vertices: limit, indices: FLIGHT_GPU_LIMITS.indices, geometries: 1 });
    });

    it('allows four render targets no larger than the drawing buffer', () => {
      const gpu = cache({ width: 640, height: 480 });
      for (let at = 0; at < FLIGHT_GPU_LIMITS.renderTargets; at++) gpu.renderTarget(`rt${at}`, { width: 640, height: 480 }, () => new WebGLRenderTarget(640, 480));
      const create = vi.fn(() => new WebGLRenderTarget(1, 1));
      expect(() => gpu.renderTarget('fifth', { width: 1, height: 1 }, create)).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
      gpu.release('rt0');
      expect(() => gpu.renderTarget('wide', { width: 641, height: 480 }, create)).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
      expect(create).not.toHaveBeenCalled();
    });

    it('releases a resource whose size differs from its budget and refuses malformed sizes', () => {
      const gpu = cache();
      const log: string[] = [];
      expect(() => gpu.texture('t', { width: 4, height: 4 }, () => tracked(texture(4, 5), log, 'wrong'))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
      expect(log).toEqual(['wrong']);
      expect(gpu.counts().textures).toBe(0);
      expect(() => gpu.geometry('g', { vertices: 3, indices: 0 }, () => geometry(3, 3))).toThrow(FlightRenderError);
      expect(() => gpu.texture('z', { width: 0, height: 4 }, () => texture(0, 4))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
      expect(() => gpu.geometry('n', { vertices: -1, indices: 0 }, () => geometry(0))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    });
  });

  describe('late asynchronous results', () => {
    it('takes over a result for its own binding', () => {
      const gpu = cache();
      const result = texture(2, 2);
      expect(gpu.receive(BINDING, result, (ready) => gpu.texture('late', { width: 2, height: 2 }, () => ready))).toBe(result);
      expect(gpu.counts().textures).toBe(1);
    });

    it.each([
      ['another run', { runId: 2 }],
      ['another owner', { ownerId: 2 }],
      ['another package generation', { generation: 4 }],
      ['another content identity', { identity: 'identity-b' }],
    ])('only releases a result prepared for %s', (_, change) => {
      const gpu = cache();
      const log: string[] = [];
      const adopt = vi.fn((ready: Texture) => ready);
      expect(gpu.receive({ ...BINDING, ...change }, tracked(texture(2, 2), log, 'late'), adopt)).toBeNull();
      expect(adopt).not.toHaveBeenCalled();
      expect(log).toEqual(['late']);
      expect(gpu.counts().textures).toBe(0);
    });

    it('only releases a result arriving after the run released its resources', () => {
      const gpu = cache();
      gpu.dispose();
      const log: string[] = [];
      expect(gpu.receive(BINDING, tracked(texture(2, 2), log, 'late'), (ready) => ready)).toBeNull();
      expect(log).toEqual(['late']);
    });

    it('releases a result its adoption refused, reporting a failed release with the cause', () => {
      const gpu = cache();
      const log: string[] = [];
      const over = { width: 2 ** 13, height: 2 ** 13 };
      const adopt = (ready: Texture) => gpu.texture('big', over, () => ready);
      expect(() => gpu.receive(BINDING, tracked(texture(over.width, over.height), log, 'big'), adopt)).toThrow(expect.objectContaining({ kind: 'render-capacity' }));
      expect(log).toEqual(['big']);
      const failure = new Error('dispose failed');
      const stuck = texture(over.width, over.height);
      stuck.dispose = () => { throw failure; };
      expect(() => gpu.receive(BINDING, stuck, adopt)).toThrow(RollbackError);
    });
  });
});
