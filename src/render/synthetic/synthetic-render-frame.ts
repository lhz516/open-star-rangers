/**
 * Checks one Runtime render frame against the upstream contract and interpolates entity positions,
 * without touching any scene object. A run keeps only the last accepted tick and, per seen ID, its
 * kind and when it was removed, which lets the checks catch kind changes, reused IDs and tick
 * regressions. Contract: docs/plan/p1/07/spec.md "数据模型与契约" and AC-03.
 */
import type { RenderFrame } from '../../app/runtime/synthetic-runtime.ts';
import type { SyntheticRenderEntity, Vec3 } from '../../core/synthetic/synthetic-scene.ts';

export type SyntheticEntityKind = SyntheticRenderEntity['kind'];

/** One entity to show for a frame, at its interpolated position. */
export interface PlannedEntity {
  readonly id: number;
  readonly kind: SyntheticEntityKind;
  readonly position: Vec3;
}

/** A frame that passed every check. */
export interface SyntheticFramePlan {
  readonly tick: number;
  /** In ascending ID order, taken from `current`. */
  readonly entities: readonly PlannedEntity[];
  /**
   * Records the frame in the history that planned it, once the scene shows it. Throws if that
   * history accepted another plan since this one was made.
   */
  commit(): void;
}

export class SyntheticRenderFrameError extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(`Render frame ${path} ${reason}`);
    this.name = 'SyntheticRenderFrameError';
    this.path = path;
  }
}

const KINDS: readonly unknown[] = ['mover', 'marker'];

function fail(path: string, reason: string): never {
  throw new SyntheticRenderFrameError(path, reason);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) fail(path, 'must be an object');
  return value as Record<string, unknown>;
}

function readTick(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(path, 'must be a non-negative safe integer');
  return value;
}

/** Validates a render state in place and returns its tick and entities, unchanged. */
function readState(state: unknown, path: string): { tick: number; entities: readonly SyntheticRenderEntity[] } {
  const { tick, entities } = record(state, path);
  if (!Array.isArray(entities)) fail(`${path}.entities`, 'must be an array');
  let previousId = 0;
  // Indexed so that holes in a sparse array fail like any other missing entity.
  for (let index = 0; index < entities.length; index++) {
    const at = `${path}.entities[${index}]`;
    const { id, kind, position } = record(entities[index], at);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) fail(`${at}.id`, 'must be a positive safe integer');
    if (id <= previousId) fail(`${at}.id`, 'must be strictly ascending without duplicates');
    previousId = id;
    if (!KINDS.includes(kind)) fail(`${at}.kind`, 'must be mover or marker');
    const { x, y, z } = record(position, `${at}.position`);
    for (const [axis, coordinate] of [['x', x], ['y', y], ['z', z]] as const) {
      if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) fail(`${at}.position.${axis}`, 'must be a finite number');
    }
  }
  return { tick: readTick(tick, `${path}.tick`), entities: entities as readonly SyntheticRenderEntity[] };
}

interface SeenEntity {
  readonly kind: SyntheticEntityKind;
  /** Tick of the first accepted `current` without this ID. */
  removedAt: number | null;
}

/** Per-run validation memory. */
export class SyntheticFrameHistory {
  #lastTick: number | null = null;
  readonly #seen = new Map<number, SeenEntity>();
  /** IDs shown by the last accepted frame. */
  #active: readonly number[] = [];
  #version = 0;

  /**
   * Validates the whole frame and returns what to show, changing nothing until the plan commits.
   * Throws SyntheticRenderFrameError for the first contract violation found.
   */
  plan(frame: RenderFrame): SyntheticFramePlan {
    const { alpha } = record(frame, 'frame');
    if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha < 0 || alpha >= 1) fail('alpha', 'must be finite and in [0, 1)');
    const previous = readState(frame.previous, 'previous');
    const current = readState(frame.current, 'current');
    const step = current.tick - previous.tick;
    if (step !== 0 && step !== 1) fail('current.tick', 'must equal previous.tick or previous.tick + 1');
    if (this.#lastTick !== null && current.tick < this.#lastTick) fail('current.tick', `went back from ${this.#lastTick}`);
    const check = (entity: SyntheticRenderEntity, at: string, tick: number): void => {
      const seen = this.#seen.get(entity.id);
      if (!seen) return;
      if (seen.kind !== entity.kind) fail(`${at}.kind`, 'changed within the run');
      // A state from before the removal may still hold the ID, as when a zero-tick frame repeats it.
      if (seen.removedAt !== null && tick >= seen.removedAt) fail(`${at}.id`, 'reuses a removed ID');
    };
    previous.entities.forEach((entity, index) => { check(entity, `previous.entities[${index}]`, previous.tick); });
    let cursor = 0;
    const entities = Object.freeze(current.entities.map((entity, index): PlannedEntity => {
      const at = `current.entities[${index}]`;
      check(entity, at, current.tick);
      // Both lists ascend by ID, so one forward pass finds each entity's previous state.
      while (cursor < previous.entities.length && previous.entities[cursor].id < entity.id) cursor++;
      const before = previous.entities[cursor]?.id === entity.id ? previous.entities[cursor] : undefined;
      if (before && before.kind !== entity.kind) fail(`${at}.kind`, 'differs from previous');
      return Object.freeze({ id: entity.id, kind: entity.kind, position: interpolate(before?.position, entity.position, alpha, at) });
    }));
    const version = this.#version;
    return Object.freeze({
      tick: current.tick,
      entities,
      commit: () => {
        if (version !== this.#version) throw new Error('A newer render frame plan was already committed');
        this.#commit(current.tick, previous.entities, entities);
      },
    });
  }

  #commit(tick: number, previous: readonly SyntheticRenderEntity[], entities: readonly PlannedEntity[]): void {
    this.#version++;
    for (const entity of [...previous, ...entities]) {
      if (!this.#seen.has(entity.id)) this.#seen.set(entity.id, { kind: entity.kind, removedAt: null });
    }
    // A run first seen mid-removal learns the previous-only IDs as removed too.
    const shown = entities.map(entity => entity.id);
    for (const id of [...this.#active, ...previous.map(entity => entity.id)]) {
      const seen = this.#seen.get(id)!;
      if (seen.removedAt === null && !shown.includes(id)) seen.removedAt = tick;
    }
    this.#active = shown;
    this.#lastTick = tick;
  }
}

/** `previous + (current − previous) × alpha` per axis; an entity new in `current` stays at `current`. */
function interpolate(previous: Vec3 | undefined, current: Vec3, alpha: number, at: string): Vec3 {
  if (!previous) return Object.freeze({ x: current.x, y: current.y, z: current.z });
  const lerp = (from: number, to: number, axis: string): number => {
    let value = from + (to - from) * alpha;
    // Finite extremes can overflow the difference; the weighted form stays finite there.
    if (!Number.isFinite(value)) value = from * (1 - alpha) + to * alpha;
    if (!Number.isFinite(value)) fail(`${at}.position.${axis}`, 'interpolates to a non-finite value');
    return value;
  };
  return Object.freeze({ x: lerp(previous.x, current.x, 'x'), y: lerp(previous.y, current.y, 'y'), z: lerp(previous.z, current.z, 'z') });
}
