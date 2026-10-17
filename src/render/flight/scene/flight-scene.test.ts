import { describe, expect, it } from 'vitest';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { EntityId, Matrix3 } from '../../../core/world/entity-table.ts';
import { renderEntity, renderState, vec } from '../presentation/presentation.test-support.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import { IDENTITY_ROWS, libraryOrientation } from './drawn-pose.ts';
import { FlightScene, flightViewKind, foldsFrame, isDrawnEntity, type FlightSceneFrame } from './flight-scene.ts';
import { cameraOf, camerasOf, renderFrame, SCENE_SETTINGS } from './scene.test-support.ts';

const PLAYER = 1;
const OTHER = 2;

/** Rows of a yaw by `degrees` about the up row: R0 and R2 turn in the x–z plane. */
function yaw(degrees: number): Matrix3 {
  const a = (degrees * Math.PI) / 180;
  return Object.freeze([Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)]) as unknown as Matrix3;
}

const entity = (id: number, change: Partial<RenderEntity> = {}): RenderEntity => Object.freeze({ ...renderEntity(id), ...change });

const state = (tick: number, entities: readonly RenderEntity[], change: Partial<RenderState> = {}): RenderState =>
  Object.freeze({ ...renderState(tick, { observedEntityId: PLAYER, entities }), ...change });

function draw(previous: RenderState, current: RenderState, alpha: number, scene = new FlightScene(SCENE_SETTINGS.deviceValues)): FlightSceneFrame {
  const frame = renderFrame(current, previous, alpha);
  return scene.frame({ render: frame, cameras: camerasOf(frame) })!;
}

const poseOf = (frame: FlightSceneFrame, id: number) => frame.entities.find(({ entity: { id: found } }) => found === id);

function expectRows(actual: Matrix3, expected: Matrix3): void {
  actual.forEach((value, at) => { expect(value).toBeCloseTo(expected[at], 12); });
}

describe('flight scene', () => {
  it('mixes an entity with the same ID and placement serial: position linearly, orientation along the shorter arc', () => {
    const before = state(4, [entity(PLAYER), entity(OTHER, { position: vec(0, 10, 100), orientation: yaw(0) })]);
    const after = state(5, [entity(PLAYER), entity(OTHER, { position: vec(40, 10, 60), orientation: yaw(90) })]);
    const frame = draw(before, after, 0.25);
    const other = poseOf(frame, OTHER)!;
    expect(other.position).toEqual({ x: 10, y: 10, z: 90 });
    expectRows(other.rows, yaw(22.5));
    expect(other.entity).toBe(after.entities[1]);
    // alpha 0 is the previous pose exactly.
    const start = poseOf(draw(before, after, 0), OTHER)!;
    expect(start.position).toBe(before.entities[1].position);
    expectRows(start.rows, yaw(0));
    // From 350° to 10° the shorter arc passes 0°.
    const wrap = draw(state(4, [entity(OTHER, { orientation: yaw(-10) })]), state(5, [entity(OTHER, { orientation: yaw(10) })]), 0.5);
    expectRows(poseOf(wrap, OTHER)!.rows, IDENTITY_ROWS);
  });

  it('draws a new ID and a changed placement serial at the current pose only', () => {
    const before = state(4, [entity(OTHER, { position: vec(0), placementSerial: 1 })]);
    const moved = entity(OTHER, { position: vec(500), placementSerial: 2 });
    expect(poseOf(draw(before, state(5, [moved]), 0.5), OTHER)!.position).toEqual(vec(500));
    const fresh = entity(3, { position: vec(7) });
    expect(poseOf(draw(before, state(5, [before.entities[0], fresh]), 0.5), 3)!.position).toEqual(vec(7));
  });

  it.each<[string, Partial<RenderState>]>([
    ['view mode', { viewMode: 1 }],
    ['sub-mode', { subMode: 3 }],
    ['observed entity', { observedEntityId: 9 as EntityId }],
    ['followed entity', { followedEntityId: 9 as EntityId }],
  ])('folds every pose across a change of %s', (_, change) => {
    const before = state(4, [entity(OTHER, { position: vec(0) })]);
    const after = state(5, [entity(OTHER, { position: vec(100) })], change);
    expect(foldsFrame(before, after)).toBe(true);
    expect(poseOf(draw(before, after, 0.5), OTHER)!.position).toEqual(vec(100));
  });

  it('folds every pose across a change of Warp transit', () => {
    const warp = (serial: number) => Object.freeze({ serial, progress: 0, segments: 0, fraction: 0, length: 1, path: Object.freeze([]) });
    const before = state(4, [entity(OTHER, { position: vec(0) })], { viewMode: 1, warp: warp(1) });
    const same = state(5, [entity(OTHER, { position: vec(100) })], { viewMode: 1, warp: warp(1) });
    expect(poseOf(draw(before, same, 0.5), OTHER)!.position).toEqual(vec(50));
    const next = { ...same, warp: warp(2) };
    expect(foldsFrame(before, next)).toBe(true);
    expect(poseOf(draw(before, next, 0.5), OTHER)!.position).toEqual(vec(100));
  });

  it('folds when the two states are not consecutive ticks, and a held frame only redraws the current state', () => {
    const scene = new FlightScene(SCENE_SETTINGS.deviceValues);
    const before = state(3, [entity(OTHER, { position: vec(0) })]);
    const after = state(5, [entity(OTHER, { position: vec(100) })]);
    expect(poseOf(draw(before, after, 0.5, scene), OTHER)!.position).toEqual(vec(100));
    const held = draw(after, after, 0, scene);
    expect(poseOf(held, OTHER)!.position).toEqual(vec(100));
    // Drawing again advances nothing.
    expect(draw(after, after, 0, scene)).toEqual(held);
  });

  it('keeps the visible set: shown entities only, no map marker, and the observed entity only outside F1 and Warp', () => {
    const marker = entity(10, { presentation: Object.freeze({ type: 'map-marker' }) });
    const pending = entity(11, { display: 'pending' });
    const hidden = entity(12, { display: 'hidden' });
    const released = entity(13, { display: 'released' });
    const explosion = renderEntity(14, { explosion: 'other' });
    const current = state(5, [entity(PLAYER), entity(OTHER), marker, pending, hidden, released, explosion]);
    expect(draw(current, current, 0).entities.map(({ entity: { id } }) => id)).toEqual([OTHER, 14]);
    const warp = { ...current, viewMode: 1 };
    expect(isDrawnEntity(current.entities[0], warp)).toBe(false);
    const destruction = { ...current, viewMode: 0x11, subMode: 8 };
    expect(isDrawnEntity(current.entities[0], destruction)).toBe(true);
    expect(isDrawnEntity(hidden, destruction)).toBe(false);
  });

  it('draws no world in views 6, 8 and 0x13, and refuses the views P3 does not draw', () => {
    for (const viewMode of [6, 8, 0x13]) {
      const current = state(5, [entity(OTHER)], { viewMode });
      expect(new FlightScene(SCENE_SETTINGS.deviceValues).frame({ render: renderFrame(current), cameras: { previous: null, current: cameraOf(current) } })).toBeNull();
    }
    expect(flightViewKind(0x11, 8)).toBe('destruction');
    for (const [viewMode, subMode] of [[0x0d, 0], [2, 0], [0x11, 0], [0x11, 7]]) {
      expect(() => flightViewKind(viewMode, subMode)).toThrow(expect.objectContaining({ kind: 'unsupported-view' }));
    }
  });

  it('mixes the camera between the cameras after the previous and the current step, and not across an observed entity\'s move', () => {
    const before = state(4, [entity(PLAYER, { position: vec(0, 0, 0), orientation: yaw(0) })]);
    const after = state(5, [entity(PLAYER, { position: vec(0, 0, 20), orientation: yaw(40) })]);
    const frame = draw(before, after, 0.5);
    expect(frame.camera.position).toEqual(vec(0, 0, 10));
    expectRows(frame.camera.rows, yaw(20));
    expect(frame).toMatchObject({ view: 'flight', viewport: { left: 0, top: 0, right: 639, bottom: 315 } });
    const jumped = state(5, [entity(PLAYER, { position: vec(0, 0, 900), placementSerial: 1 })]);
    expect(draw(before, jumped, 0.5).camera.position).toEqual(vec(0, 0, 900));
    // A camera of another tick than the Render State's is a broken input.
    const scene = new FlightScene(SCENE_SETTINGS.deviceValues);
    expect(() => scene.frame({ render: renderFrame(after, before, 0.5), cameras: { previous: null, current: cameraOf(before) } }))
      .toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('draws the destruction view from the presentation camera in the whole screen', () => {
    const rows = yaw(30);
    const camera = (tick: number, z: number): PresentationCamera => Object.freeze({
      tick, position: vec(0, 0, z), rows, viewMode: 0x11, subMode: 8, viewport: Object.freeze({ left: 0, top: 0, right: 639, bottom: 479 }),
    });
    const change = { viewMode: 0x11, subMode: 8 };
    const before = state(4, [entity(PLAYER)], change);
    const after = state(5, [entity(PLAYER)], change);
    const frame = new FlightScene(SCENE_SETTINGS.deviceValues).frame({ render: renderFrame(after, before, 0.25), cameras: { previous: camera(4, -100), current: camera(5, -60) } })!;
    expect(frame).toMatchObject({ view: 'destruction', viewport: { bottom: 479 }, camera: { position: vec(0, 0, -90) } });
    expect(frame.entities.map(({ entity: { id } }) => id)).toEqual([PLAYER]);
  });

  it('draws a visual first shown at its current pose, never mixed from its pending one', () => {
    const before = state(4, [entity(OTHER, { position: vec(0), display: 'pending' })]);
    const after = state(5, [entity(OTHER, { position: vec(100) })]);
    expect(poseOf(draw(before, after, 0.5), OTHER)!.position).toEqual(vec(100));
  });

  it('resolves each Render State\'s orientations once, so a redraw is identical, and keeps a visual\'s frame while hidden or off the world', () => {
    const zero = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0]) as unknown as Matrix3;
    const scene = new FlightScene(SCENE_SETTINGS.deviceValues);
    const first = state(3, [entity(OTHER, { orientation: yaw(10) })]);
    draw(first, first, 0, scene);
    const rejected = state(4, [entity(OTHER, { orientation: zero })]);
    const accepted = state(5, [entity(OTHER, { orientation: yaw(50) })]);
    const once = draw(rejected, accepted, 0.5, scene);
    expectRows(poseOf(once, OTHER)!.rows, yaw(30));
    expect(draw(rejected, accepted, 0.5, scene)).toEqual(once);
    // Hidden, then a map frame: the frame keeps yaw(50), which a rejected pose then shows.
    const hidden = state(6, [entity(OTHER, { orientation: zero, display: 'hidden' })]);
    draw(accepted, hidden, 0, scene);
    const map = state(7, [entity(OTHER, { orientation: zero })], { viewMode: 8 });
    expect(scene.frame({ render: renderFrame(map, hidden), cameras: { previous: null, current: cameraOf(map) } })).toBeNull();
    const back = state(8, [entity(OTHER, { orientation: zero })]);
    expectRows(poseOf(draw(map, back, 0, scene), OTHER)!.rows, yaw(50));
    // A released visual's frame goes with it: listed again, it starts from the identity.
    const released = state(9, [entity(OTHER, { orientation: yaw(70), display: 'released' })]);
    draw(back, released, 0, scene);
    const again = state(10, [entity(OTHER, { orientation: zero })]);
    expectRows(poseOf(draw(released, again, 0, scene), OTHER)!.rows, IDENTITY_ROWS);
  });

  it('draws with the library\'s orientation, keeping the last accepted one where the library rejects the rows', () => {
    const skewed = Object.freeze([9, 9, 9, 0, 2, 0.5, 0, 0, 3]) as unknown as Matrix3;
    const accepted = libraryOrientation(skewed)!;
    expectRows(accepted, IDENTITY_ROWS);
    // X = U × D: the drawn frame is a proper rotation.
    const turned = libraryOrientation(yaw(33))!;
    expectRows(turned, yaw(33));
    expect(libraryOrientation(Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 1]) as unknown as Matrix3)).toBeNull();
    expect(libraryOrientation(Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 1]) as unknown as Matrix3)).toBeNull();
    expect(libraryOrientation(Object.freeze([1, 0, 0, 1, 0, 0, 0, 0, 0]) as unknown as Matrix3)).toBeNull();
    const scene = new FlightScene(SCENE_SETTINGS.deviceValues);
    const good = state(5, [entity(OTHER, { orientation: yaw(50) })]);
    draw(good, good, 0, scene);
    const degenerate = state(5, [entity(OTHER, { orientation: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0]) as unknown as Matrix3 })]);
    expectRows(poseOf(draw(degenerate, degenerate, 0, scene), OTHER)!.rows, yaw(50));
    // A new frame without an accepted orientation stays at the identity.
    expectRows(poseOf(draw(degenerate, degenerate, 0), OTHER)!.rows, IDENTITY_ROWS);
  });
});
