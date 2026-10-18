/**
 * One run's GPU resource cache (docs/plan/p3/12/spec.md, 渲染器生命周期 资源; docs/plan/p3/02/spec.md, FS-07 预算). The
 * geometries, materials, textures and render targets a run draws with are shared by key within the run and counted
 * against `FLIGHT_GPU_LIMITS`; nothing is shared across runs. The cache is bound to its owner, run, package generation and
 * complete content identity, so a result prepared for another binding, or arriving after the cache was released, is only
 * released, never taken over.
 *
 * The run's whole plan is checked before it begins (`checkGpuPlan`); each acquisition also states its size first, the
 * budget is checked again before `create` allocates anything, and the created resource must have the stated size.
 * Render targets fit the current drawing buffer, so none is allowed before a layout exists, and a pass re-acquires its
 * layout-sized targets after a layout change. `dispose` releases every resource, attempting each, and leaves every count at zero.
 */
import type { BufferGeometry, Material, Texture, WebGLRenderTarget } from 'three';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import { attemptAll } from '../../scene/cleanup.ts';
import { FLIGHT_GPU_LIMITS, FlightRenderError } from './flight-render-error.ts';

/** What one run's resources are bound to; `identity` is the package's `contentIdentityKey`. */
export interface FlightRunBinding {
  readonly ownerId: number;
  readonly runId: number;
  readonly generation: number;
  readonly identity: string;
}

export interface FlightGpuCounts {
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
  readonly renderTargets: number;
  readonly vertices: number;
  readonly indices: number;
  readonly texels: number;
}

/**
 * What a run's passes will allocate in all, computed from its checked payloads before any allocation and checked
 * against `FLIGHT_GPU_LIMITS` when the run begins.
 */
export interface FlightGpuPlan {
  readonly texels: number;
  readonly vertices: number;
  readonly indices: number;
  readonly renderTargets: number;
}

export const EMPTY_GPU_PLAN: FlightGpuPlan = Object.freeze({ texels: 0, vertices: 0, indices: 0, renderTargets: 0 });

/** The plan of all of `plans` together. */
export const addGpuPlans = (...plans: readonly FlightGpuPlan[]): FlightGpuPlan => Object.freeze(plans.reduce((sum, plan) => ({
  texels: sum.texels + plan.texels, vertices: sum.vertices + plan.vertices, indices: sum.indices + plan.indices, renderTargets: sum.renderTargets + plan.renderTargets,
}), EMPTY_GPU_PLAN));

/** Anything the cache can release. */
export interface Releasable {
  dispose(): void;
}

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

type Kind = 'geometry' | 'material' | 'texture' | 'render-target';
type Measure = 'vertices' | 'indices' | 'texels';

interface Entry {
  readonly kind: Kind;
  readonly resource: Releasable;
  readonly cost: Readonly<Partial<Record<Measure, number>>>;
}

const ZERO: FlightGpuCounts = Object.freeze({ geometries: 0, materials: 0, textures: 0, renderTargets: 0, vertices: 0, indices: 0, texels: 0 });
const COUNTED: Readonly<Record<Kind, 'geometries' | 'materials' | 'textures' | 'renderTargets'>> = Object.freeze({
  geometry: 'geometries', material: 'materials', texture: 'textures', 'render-target': 'renderTargets',
});

const PATH = 'flightGpu';
export const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isSide = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

const sameBinding = (a: FlightRunBinding, b: FlightRunBinding): boolean =>
  a.ownerId === b.ownerId && a.runId === b.runId && a.generation === b.generation && a.identity === b.identity;

function invalid(path: string, reason: string): never {
  throw new FlightRenderError('invalid-input', `${PATH}.${path}`, reason);
}

/** Throws `render-capacity` when `plan` exceeds a budget, and `invalid-input` when it is malformed. */
export function checkGpuPlan(plan: FlightGpuPlan): void {
  for (const measure of ['texels', 'vertices', 'indices', 'renderTargets'] as const) {
    const value = plan?.[measure];
    if (!isCount(value)) invalid(`plan.${measure}`, 'must be a non-negative integer');
    if (value > FLIGHT_GPU_LIMITS[measure]) throw new FlightRenderError('render-capacity', `${PATH}.plan.${measure}`, `would exceed the run's ${FLIGHT_GPU_LIMITS[measure]}`);
  }
}

/** Releases `resource`, then throws `cause`, or a RollbackError with the release failure. */
function releaseAndThrow(resource: Releasable, cause: unknown): never {
  const errors = attemptAll([() => { resource.dispose(); }]);
  if (errors.length > 0) throw new RollbackError(cause, errors, 'A flight GPU resource could not be released after a failure');
  throw cause;
}

function pixelSize(size: PixelSize, path: string): PixelSize {
  if (!isSide(size?.width) || !isSide(size.height)) invalid(path, 'must give a positive integer width and height');
  return size;
}

export class FlightGpuCache {
  readonly binding: FlightRunBinding;
  readonly #maxRenderTarget: () => PixelSize;
  readonly #entries = new Map<string, Entry>();
  #counts: Record<keyof FlightGpuCounts, number> = { ...ZERO };
  #released = false;

  /** `maxRenderTarget` is the largest render target now allowed: the drawing buffer, 0 × 0 without one. */
  constructor(binding: FlightRunBinding, maxRenderTarget: () => PixelSize) {
    this.binding = Object.freeze({ ...binding });
    this.#maxRenderTarget = maxRenderTarget;
  }

  get released(): boolean {
    return this.#released;
  }

  counts(): FlightGpuCounts {
    return Object.freeze({ ...this.#counts });
  }

  /** The geometry under `key`, created with exactly `vertices` positions and `indices` indices (0 when unindexed). */
  geometry(key: string, size: { readonly vertices: number; readonly indices: number }, create: () => BufferGeometry): BufferGeometry {
    if (!isCount(size?.vertices) || !isCount(size.indices)) invalid(`geometry[${key}]`, 'must give non-negative integer vertex and index counts');
    return this.#acquire(key, 'geometry', { vertices: size.vertices, indices: size.indices }, create, (geometry) =>
      (geometry.getAttribute('position')?.count ?? 0) === size.vertices && (geometry.index?.count ?? 0) === size.indices);
  }

  material(key: string, create: () => Material): Material {
    return this.#acquire(key, 'material', {}, create, () => true);
  }

  /** The texture under `key`, created with an image of exactly `size`. */
  texture(key: string, size: PixelSize, create: () => Texture): Texture {
    const { width, height } = pixelSize(size, `texture[${key}]`);
    return this.#acquire(key, 'texture', { texels: width * height }, create, (texture) => {
      const image = texture.image as Partial<PixelSize> | null | undefined;
      return image?.width === width && image.height === height;
    });
  }

  /** The render target under `key`, of exactly `size`, which must fit the drawing buffer. */
  renderTarget(key: string, size: PixelSize, create: () => WebGLRenderTarget): WebGLRenderTarget {
    const { width, height } = pixelSize(size, `renderTarget[${key}]`);
    const max = this.#maxRenderTarget();
    if (width > max.width || height > max.height) {
      throw new FlightRenderError('render-capacity', `${PATH}.renderTarget[${key}]`, `must fit the ${max.width} × ${max.height} drawing buffer`);
    }
    return this.#acquire(key, 'render-target', {}, create, (target) => target.width === width && target.height === height);
  }

  /** Releases the resource under `key`, if any; it no longer counts even when its release throws. */
  release(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#forget(key, entry);
    entry.resource.dispose();
  }

  /**
   * Takes over the result of an asynchronous preparation for `binding` through `adopt`, such as an acquisition whose
   * `create` returns it. A result for another binding, or one that arrives after release, is only released: null. A
   * failing `adopt` releases it too before its error is thrown.
   */
  receive<Resource extends Releasable>(binding: FlightRunBinding, resource: Resource, adopt: (resource: Resource) => Resource): Resource | null {
    if (this.#released || !sameBinding(binding, this.binding)) {
      resource.dispose();
      return null;
    }
    let adopted: Resource;
    try {
      adopted = adopt(resource);
    } catch (cause) {
      if ([...this.#entries.values()].some((entry) => entry.resource === resource)) throw cause;
      return releaseAndThrow(resource, cause);
    }
    return adopted;
  }

  /** Releases every resource, newest first, attempting each; throws an AggregateError of the failures. Idempotent. */
  dispose(): void {
    if (this.#released) return;
    this.#released = true;
    const entries = [...this.#entries.values()].reverse();
    this.#entries.clear();
    this.#counts = { ...ZERO };
    const errors = attemptAll(entries.map(({ resource }) => () => { resource.dispose(); }));
    if (errors.length > 0) throw new AggregateError(errors, 'Flight GPU resources could not all be released', { cause: errors[0] });
  }

  #acquire<Resource extends Releasable>(key: string, kind: Kind, cost: Entry['cost'], create: () => Resource, fits: (resource: Resource) => boolean): Resource {
    if (this.#released) throw new FlightRenderError('invalid-state', `${PATH}.${kind}[${key}]`, 'is not allowed once the run\'s resources are released');
    if (typeof key !== 'string' || key.length === 0) invalid(kind, 'needs a non-empty key');
    const held = this.#entries.get(key);
    if (held) {
      if (held.kind !== kind) invalid(`${kind}[${key}]`, `names a ${held.kind}`);
      return held.resource as Resource;
    }
    const path = `${PATH}.${kind}[${key}]`;
    for (const measure of Object.keys(cost) as Measure[]) this.#check(measure, cost[measure]!, path);
    if (kind === 'render-target') this.#check('renderTargets', 1, path);
    const resource = create();
    if (!fits(resource)) return releaseAndThrow(resource, new FlightRenderError('invalid-input', path, 'differs from the size it was budgeted with'));
    this.#entries.set(key, { kind, resource, cost });
    this.#counts[COUNTED[kind]] += 1;
    for (const measure of Object.keys(cost) as Measure[]) this.#counts[measure] += cost[measure]!;
    return resource;
  }

  #check(measure: Measure | 'renderTargets', add: number, path: string): void {
    const limit = FLIGHT_GPU_LIMITS[measure];
    if (this.#counts[measure] + add > limit) throw new FlightRenderError('render-capacity', path, `would exceed the run's ${limit} ${measure}`);
  }

  #forget(key: string, entry: Entry): void {
    this.#entries.delete(key);
    this.#counts[COUNTED[entry.kind]] -= 1;
    for (const measure of Object.keys(entry.cost) as Measure[]) this.#counts[measure] -= entry.cost[measure]!;
  }
}
