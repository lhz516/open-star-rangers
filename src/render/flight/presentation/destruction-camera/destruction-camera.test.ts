import { describe, expect, it } from 'vitest';
import type { DomainEvent, PipelineStageName, Vec3, ViewSwitchedEvent } from '../../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../../core/projections/render-state.ts';
import type { EntityId, Matrix3 } from '../../../../core/world/entity-table.ts';
import { createFlightPresentation, presentationRandom } from '../flight-presentation.ts';
import type { PresentationError } from '../presentation-budget.ts';
import { INITIAL_CAMERA_POSE, presentationViewport } from '../presentation-camera.ts';
import type { CameraPose, DestructionCamera, PresentationCamera, PresentationStep, PresentationTick } from '../presentation-contract.ts';
import { CLOCK_STEP, frame, IDENTITY, presentationContent, renderEntity, renderState, tickInput, vec } from '../presentation.test-support.ts';
import { createDestructionCamera, ENTRY_ANGLE } from './destruction-camera.ts';

// Synthetic destruction sequences (code-generated poses and ticks; no original data). Each tick advances the clock by
// CLOCK_STEP = 2 units, 1/32 s, so the recession per tick is 30/32 = 0.9375.

const PLAYER = 1;
const POD = 7;
const COS = Math.fround(Math.cos(ENTRY_ANGLE));
const SIN = Math.fround(Math.sin(ENTRY_ANGLE));
/** A player orientation that the entry turn maps exactly onto the identity rows. */
const PRE_TURNED = Object.freeze([1, 0, 0, 0, COS, -SIN, 0, SIN, COS]) as unknown as Matrix3;
const ZERO_ROWS = [0, 0, 0, 0, 0, 0];
const RECESSION_PER_TICK = (30 * CLOCK_STEP) / 64;
/** The values with −0 as +0, where only the magnitude is asserted. */
const plain = (values: readonly number[]): number[] => values.map((value) => value + 0);

interface Scene {
  readonly viewMode?: number;
  readonly subMode?: number;
  readonly player?: Vec3 | null;
  readonly pod?: Vec3 | null;
  readonly followed?: number | null;
}

/** The Render State at a tick's end; the destruction view by default, with the player listed at `player`. */
function scene(tick: number, { viewMode = 0x11, subMode = 8, player = vec(0), pod = null, followed = pod === null ? null : POD }: Scene = {}): RenderState {
  const entities: RenderEntity[] = [];
  if (player !== null) entities.push(renderEntity(PLAYER, { position: player }));
  if (pod !== null) entities.push(renderEntity(POD, { position: pod }));
  return Object.freeze({
    ...renderState(tick, { viewMode, subMode, observedEntityId: player === null ? null : PLAYER, entities }),
    followedEntityId: followed as EntityId | null,
  });
}

interface SwitchOptions {
  readonly stage?: PipelineStageName;
  readonly position?: Vec3;
  readonly orientation?: Matrix3;
  /** False for a switch without a player entity. */
  readonly player?: boolean;
}

function switched(tick: number, viewMode: number, subMode: number, { stage = 'collision', position = vec(0), orientation = PRE_TURNED, player = true }: SwitchOptions = {}): ViewSwitchedEvent {
  return Object.freeze({
    type: 'view-switched', tick, fromViewMode: 0x0c, fromSubMode: 0, viewMode, subMode, stage,
    player: player ? Object.freeze({ entityId: PLAYER as EntityId, position, orientation }) : null,
  });
}

const enter = (tick: number, options?: SwitchOptions): ViewSwitchedEvent => switched(tick, 0x11, 8, options);
const rescue = (tick: number): ViewSwitchedEvent => switched(tick, 0x0c, 8);

/** Steps `camera` through one tick; `beforeStep` is not read by the destruction camera. */
function step(camera: DestructionCamera, render: RenderState, events: readonly DomainEvent[] = []): CameraPose | null {
  const input: PresentationStep = { tick: render.tick, clock: render.clock, render, events, beforeStep: undefined as unknown as PresentationCamera };
  return camera.step(input);
}

/** Steps an entry at tick 1 with the player at `at`, so the camera starts at `at` with the identity rows. */
function entered(at = vec(0)): DestructionCamera {
  const camera = createDestructionCamera();
  step(camera, scene(0, { viewMode: 0x0c, subMode: 0, player: at }));
  expect(step(camera, scene(1, { player: at }), [enter(1, { position: vec(99, 99, 99) })])).toEqual({ position: at, rows: IDENTITY });
  return camera;
}

const kind = (expected: PresentationError['kind']) => expect.objectContaining({ name: 'PresentationError', kind: expected });
const rowOf = (rows: Matrix3, at: number): Vec3 => vec(rows[3 * at], rows[3 * at + 1], rows[3 * at + 2]);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const minus = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const crossExact = (a: Vec3, b: Vec3): Vec3 => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const plus = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const scaled = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);

/** Within `ulps` f32 rounding steps (2⁻²⁴ relative) of `magnitude`, per component. */
function expectNear(actual: Vec3, expected: Vec3, magnitude: number, ulps = 8): void {
  const bound = ulps * 2 ** -24 * magnitude;
  for (const axis of ['x', 'y', 'z'] as const) expect(Math.abs(actual[axis] - expected[axis])).toBeLessThanOrEqual(bound);
}

function expectFinite(pose: CameraPose | null): CameraPose {
  expect(pose).not.toBeNull();
  const { position, rows } = pose as CameraPose;
  expect([position.x, position.y, position.z, ...rows].every(Number.isFinite)).toBe(true);
  return pose as CameraPose;
}

describe('entry (0x31094)', () => {
  it('turns the rows at the switch by the f32 32° about row 0', () => {
    const bits = new DataView(new ArrayBuffer(4));
    bits.setFloat32(0, ENTRY_ANGLE);
    expect(bits.getUint32(0)).toBe(0x3f0efa35);
    const camera = createDestructionCamera();
    // The player has turned and moved after the switch: the rows come from the switch, the position from the tick's end.
    const pose = step(camera, scene(3, { player: vec(5, 6, 7) }), [enter(3, { position: vec(1, 2, 3), orientation: IDENTITY })]);
    expect(pose).toEqual({ position: vec(5, 6, 7), rows: [1, 0, 0, 0, COS, SIN, 0, -SIN, COS] });
    expect(Object.isFrozen(pose)).toBe(true);
  });

  it('reads the previous tick\'s clock sample for a switch before the clock stage, otherwise its own', () => {
    for (const [stage, ticks] of [['mission-flow', 1], ['input-registration', 1], ['clock', 0], ['request-handling', 0], ['area-check', 0]] as const) {
      const camera = createDestructionCamera();
      step(camera, scene(4, { viewMode: 0x0c, subMode: 0 }));
      const pose = step(camera, scene(5), [enter(5, { stage })]);
      expect(pose?.position).toEqual(vec(0, 0, 0 - RECESSION_PER_TICK * ticks));
    }
  });

  it('takes the last of several entries in a tick', () => {
    const camera = createDestructionCamera();
    const pose = step(camera, scene(2), [enter(2, { orientation: IDENTITY }), enter(2)]);
    expect(pose?.rows).toEqual(IDENTITY);
  });
});

describe('before the explosion (no followed entity)', () => {
  it('recedes along the entry row 2 at 30 per second from the player\'s position at each tick\'s end', () => {
    const camera = entered(vec(10, 20, 30));
    for (let tick = 2; tick <= 40; tick++) {
      const player = vec(10 + tick, 20 - 2 * tick, 30 + 0.5 * tick);
      const pose = step(camera, scene(tick, { player }));
      const s = -RECESSION_PER_TICK * (tick - 1);
      expect(pose).toEqual({ position: vec(player.x, player.y, Math.fround(player.z + Math.fround(s))), rows: IDENTITY });
    }
  });

  it('follows the authoritative formula for any entry orientation within f32 rounding', () => {
    const camera = createDestructionCamera();
    const orientation = Object.freeze([0.6, 0.8, 0, -0.48, 0.36, 0.8, 0.64, -0.48, 0.6].map(Math.fround)) as unknown as Matrix3;
    const entry = step(camera, scene(10, { player: vec(100, -50, 25) }), [enter(10, { orientation })]);
    // Row 0 is the axis; rows 1 and 2 turn by 32° within their plane.
    const r1 = rowOf(orientation, 1);
    const r2 = rowOf(orientation, 2);
    const [cos, sin] = [Math.cos((32 * Math.PI) / 180), Math.sin((32 * Math.PI) / 180)];
    expectNear(rowOf(entry!.rows, 0), rowOf(orientation, 0), 1, 0);
    expectNear(rowOf(entry!.rows, 1), plus(scaled(r1, cos), scaled(r2, sin)), 1, 4);
    const forward = rowOf(entry!.rows, 2);
    expectNear(forward, minus(scaled(r2, cos), scaled(r1, sin)), 1, 4);
    for (let tick = 11; tick < 200; tick += 7) {
      const player = vec(100 + tick * 3.3, -50, 25 - tick);
      const pose = step(camera, scene(tick, { player }));
      const elapsed = ((tick - 10) * CLOCK_STEP) / 64;
      const ideal = minus(player, scaled(forward, 30 * elapsed));
      expectNear(pose!.position, ideal, length(player) + 30 * elapsed, 2);
      expect(pose!.rows).toEqual(entry!.rows);
    }
  });

  it('keeps the stored pose without a player entity, and fails when the observed entity is not listed', () => {
    const camera = entered(vec(4));
    const kept = step(camera, scene(2, { player: null }));
    expect(kept).toEqual({ position: vec(4), rows: IDENTITY });
    const missing = { ...scene(3), entities: [] };
    expect(() => step(camera, missing)).toThrow(kind('invariant-violated'));
  });
});

describe('following the pod', () => {
  it('measures the distance once, then eases a quarter of the way towards 30 per tick', () => {
    const camera = entered();
    // Straight ahead along +z: every value below is exact.
    let pose = step(camera, scene(2, { pod: vec(0, 0, 40) }));
    expect(pose).toEqual({ position: vec(0, 0, 2.5), rows: IDENTITY });
    // The pod jumps; the distance is not measured again.
    pose = step(camera, scene(3, { pod: vec(0, 0, 100) }));
    expect(pose).toEqual({ position: vec(0, 0, 100 - 35.625), rows: IDENTITY });
    pose = step(camera, scene(4, { pod: vec(0, 0, 100) }));
    expect(pose?.position).toEqual(vec(0, 0, 100 - 34.21875));
  });

  it('eases upwards from below 30', () => {
    const camera = entered();
    expect(step(camera, scene(2, { pod: vec(0, 0, 10) }))?.position).toEqual(vec(0, 0, -5));
    expect(step(camera, scene(3, { pod: vec(0, 0, 10) }))?.position).toEqual(vec(0, 0, 10 - 18.75));
  });

  it('turns towards a moving pod and rebuilds the axes, within f32 rounding of the authoritative formula', () => {
    const camera = entered(vec(-200, 50, 10));
    let previous = { position: vec(-200, 50, 10), rows: IDENTITY } as CameraPose;
    let distance: number | null = null;
    for (let tick = 2; tick <= 120; tick++) {
      const pod = vec(-150 + 1.7 * tick, 80 - 0.9 * tick, 60 + 0.3 * tick * Math.sin(tick / 9));
      const pose = expectFinite(step(camera, scene(tick, { pod })));
      const offset = minus(pod, previous.position);
      const direction = scaled(offset, 1 / length(offset));
      distance ??= length(offset);
      distance += (30 - distance) / 4;
      const right = crossExact(rowOf(previous.rows, 1), direction);
      const r0 = scaled(right, 1 / length(right));
      expectNear(rowOf(pose.rows, 2), direction, 1);
      expectNear(rowOf(pose.rows, 0), r0, 1);
      expectNear(rowOf(pose.rows, 1), crossExact(direction, r0), 1);
      expectNear(pose.position, minus(pod, scaled(direction, distance)), length(pod) + distance, 32);
      // Handedness R1 × R2 = R0 and the eased distance from the pod.
      expectNear(crossExact(rowOf(pose.rows, 1), rowOf(pose.rows, 2)), rowOf(pose.rows, 0), 1, 16);
      expect(Math.abs(length(minus(pod, pose.position)) - distance)).toBeLessThan(1e-3);
      expect(Math.abs(dot(rowOf(pose.rows, 1), rowOf(pose.rows, 2)))).toBeLessThan(1e-6);
      previous = pose;
    }
    expect(distance).toBeCloseTo(30, 6);
  });

  it('freezes while the followed entity is not listed', () => {
    const camera = entered();
    const following = step(camera, scene(2, { pod: vec(3, 4, 50) }));
    for (let tick = 3; tick < 6; tick++) {
      expect(step(camera, scene(tick, { player: vec(tick, 0, 0), followed: POD }))).toEqual(following);
    }
    // Were the pod listed again, the follow would go on from the frozen pose and the eased distance.
    const again = expectFinite(step(camera, scene(6, { pod: vec(3, 4, 50) })));
    expect(length(minus(vec(3, 4, 50), again.position))).toBeCloseTo(30 + (length(vec(3, 4, 50)) - 30) * 0.5625, 4);
  });
});

describe('degenerate directions', () => {
  it('gives zero rows, not NaN, when the camera is at the pod, and keeps rows 0 and 1 zero while row 2 recovers', () => {
    const camera = entered(vec(1, 2, 3));
    expect(step(camera, scene(2, { player: vec(1, 2, 3), pod: vec(1, 2, 3) }))).toEqual({ position: vec(1, 2, 3), rows: [...ZERO_ROWS, 0, 0, 0] });
    const recovered = step(camera, scene(3, { pod: vec(1, 2, 43) }));
    // Distance 0 eased to 7.5, then 7.5 + 22.5 / 4.
    expect(recovered).toEqual({ position: vec(1, 2, 43 - 13.125), rows: [...ZERO_ROWS, 0, 0, 1] });
    expect(plain(expectFinite(step(camera, scene(4, { pod: vec(9, -4, 60) }))).rows.slice(0, 6))).toEqual(ZERO_ROWS);
  });

  it('gives zero rows 0 and 1 when the new row 2 is parallel to the old row 1', () => {
    for (const up of [10, -10]) {
      const camera = entered();
      const pose = expectFinite(step(camera, scene(2, { pod: vec(0, up, 0) })));
      // Distance 10 eased to 15.
      expect(plain(pose.rows)).toEqual([...ZERO_ROWS, 0, Math.sign(up), 0]);
      expect(plain([pose.position.x, pose.position.y, pose.position.z])).toEqual([0, up - Math.sign(up) * 15, 0]);
    }
  });
});

describe('leaving and entering again', () => {
  it('gives no pose outside the view and drops the entry, also when entering and leaving within one tick', () => {
    const camera = createDestructionCamera();
    expect(step(camera, scene(1, { viewMode: 0x0c, subMode: 0 }), [enter(1), rescue(1)])).toBeNull();
    expect(() => step(camera, scene(2))).toThrow(kind('invariant-violated'));
    expect(() => step(createDestructionCamera(), scene(0))).toThrow(kind('invariant-violated'));
    expect(step(createDestructionCamera(), scene(0, { viewMode: 0x0c, subMode: 0 }), [switched(0, 0x11, 3)])).toBeNull();
  });

  it('starts a new destruction sequence of the same entities from its own entry after a rescue', () => {
    const camera = entered();
    step(camera, scene(2, { pod: vec(0, 0, 40) }));
    step(camera, scene(3, { pod: vec(0, 0, 40) }));
    expect(step(camera, scene(4, { viewMode: 0x0c, subMode: 8 }), [rescue(4)])).toBeNull();
    expect(step(camera, scene(5, { viewMode: 0x0c, subMode: 8 }))).toBeNull();
    // Same player and pod IDs: the recession restarts from the new entry time and the distance is measured again.
    expect(step(camera, scene(20, { player: vec(0, 0, 100) }), [enter(20)])).toEqual({ position: vec(0, 0, 100), rows: IDENTITY });
    expect(step(camera, scene(21, { player: vec(0, 0, 100) }))?.position).toEqual(vec(0, 0, 100 - RECESSION_PER_TICK));
    expect(step(camera, scene(22, { pod: vec(0, 0, 179.0625) }))?.position).toEqual(vec(0, 0, 179.0625 - 67.5));
  });

  it('fails on an entry without a player entity', () => {
    expect(() => step(createDestructionCamera(), scene(1), [enter(1, { player: false })])).toThrow(kind('invariant-violated'));
  });
});

describe('in the presentation module', () => {
  it('separates the cameras before and after each step across an entry and a rescue', () => {
    const at = vec(5, 5, 5);
    const presentation = createFlightPresentation({
      ownerId: 1, runId: 1, content: presentationContent(), random: presentationRandom(3),
      initial: scene(0, { viewMode: 0x0c, subMode: 0, player: at }), destructionCamera: createDestructionCamera(),
    });
    const ticks: PresentationTick[] = [];
    presentation.subscribe((tick) => ticks.push(tick));
    presentation.advance(frame([
      tickInput(scene(1, { viewMode: 0x0c, subMode: 0, player: at })),
      tickInput(scene(2, { player: at }), [enter(2)]),
      tickInput(scene(3, { player: at })),
      tickInput(scene(4, { viewMode: 0x0c, subMode: 8, player: vec(0) }), [rescue(4)]),
    ]));
    const f1 = { position: at, rows: IDENTITY, viewMode: 0x0c, viewport: presentationViewport(0x0c, 0) };
    expect(ticks[1].beforeStep).toMatchObject(f1);
    expect(ticks[1].afterStep).toMatchObject({ position: at, rows: IDENTITY, viewMode: 0x11, subMode: 8, viewport: presentationViewport(0x11, 8) });
    expect(ticks[2].beforeStep).toEqual(ticks[1].afterStep);
    expect(ticks[2].afterStep).toMatchObject({ position: vec(5, 5, 5 - RECESSION_PER_TICK), viewMode: 0x11 });
    expect(ticks[3].beforeStep).toEqual(ticks[2].afterStep);
    expect(ticks[3].afterStep).toMatchObject({ position: vec(0), rows: INITIAL_CAMERA_POSE.rows, viewMode: 0x0c });
    expect(presentation.camera()).toEqual(ticks[3].afterStep);
  });
});
