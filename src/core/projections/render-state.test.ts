import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { constructWorld } from '../world/world.ts';
import { entityInit, TEST_MODEL, TEST_ORIENTATION, testState, tickInput } from '../world/world.test-support.ts';
import { renderWorld, type RenderState } from './render-state.ts';

const lerp = (from: Vec3, to: Vec3, alpha: number): Vec3 => ({
  x: from.x + (to.x - from.x) * alpha,
  y: from.y + (to.y - from.y) * alpha,
  z: from.z + (to.z - from.z) * alpha,
});

/**
 * A synthetic renderer drawing between two frames of one run at `alpha` (0 = previous, 1 = current): an ID in both
 * frames with an unchanged placement serial is interpolated; a new ID or a changed serial is drawn from its current
 * pose only; an ID missing from the current frame is not drawn.
 */
function drawBetween(previous: RenderState, current: RenderState, alpha: number): { id: number; position: Vec3 }[] {
  const before = new Map(previous.entities.map((entity) => [entity.id, entity]));
  return current.entities.map(({ id, position, placementSerial }) => {
    const old = before.get(id);
    return { id, position: old && old.placementSerial === placementSerial ? lerp(old.position, position, alpha) : position };
  });
}

describe('Render State (P3-02 AC-10, Projection 与 Render State)', () => {
  it('lists presentable entities in ID order with their render fields only', () => {
    const state = testState();
    const other = readAssetId('model/other-craft');
    const first = state.entities.allocate(entityInit(5, { presentation: { type: 'model', model: other }, position: { x: -1, y: 0.5, z: 9 } }));
    const player = state.entities.allocate(entityInit(0));
    state.entities.allocate(entityInit(2, { activity: 'parked' }));
    state.player.entityId = player.id;
    state.player.viewMode = 0x11;
    first.placementSerial = 2;
    const render = renderWorld(state);
    expect(render).toEqual({
      tick: 0,
      viewMode: 0x11,
      observedEntityId: player.id,
      entities: [
        { id: first.id, kindBit: 5, presentation: { type: 'model', model: other }, position: { x: -1, y: 0.5, z: 9 }, orientation: TEST_ORIENTATION, placementSerial: 2 },
        { id: player.id, kindBit: 0, presentation: { type: 'model', model: TEST_MODEL }, position: { x: 0, y: 2, z: 3 }, orientation: TEST_ORIENTATION, placementSerial: 0 },
      ],
    });
    expect(deepFrozen(render)).toBe(true);
  });

  it('leaves parked entities out and shows them once they become active', () => {
    const state = testState();
    const world = constructWorld(state);
    const entity = state.entities.allocate(entityInit(7, { activity: 'parked' }));
    world.step(tickInput());
    expect(world.renderState().entities).toEqual([]);
    entity.state = 'area-switch';
    world.step(tickInput());
    expect(world.renderState().entities.map(({ id }) => id)).toEqual([entity.id]);
    entity.state = 'area-switch';
    world.step(tickInput());
    expect(world.renderState().entities).toEqual([]);
  });

  it('keeps destroyed entities listed until they are removed', () => {
    const state = testState();
    const world = constructWorld(state);
    const [destroyed, source] = [state.entities.allocate(entityInit(3)), state.entities.allocate(entityInit(3))];
    world.step(tickInput());
    destroyed.destroyed = true;
    source.state = 'destroyed-source';
    world.step(tickInput());
    expect(world.renderState().entities.map(({ id }) => id)).toEqual([destroyed.id, source.id]);
    destroyed.state = 'pending-removal';
    world.step(tickInput());
    expect(world.renderState().entities.map(({ id }) => id)).toEqual([source.id]);
  });

  it('gives a two-frame consumer what it needs for new, removed and discontinuously moved entities', () => {
    const state = testState();
    const world = constructWorld(state);
    const player = state.entities.allocate(entityInit(0));
    state.player.entityId = player.id;
    const moving = state.entities.allocate(entityInit(3, { position: { x: 0, y: 0, z: 0 } }));
    const leaving = state.entities.allocate(entityInit(3));
    const warping = state.entities.allocate(entityInit(5, { position: { x: 0, y: 0, z: 0 } }));
    state.entities.allocate(entityInit(7, { activity: 'parked' }));
    world.step(tickInput());
    const previous = world.renderState();

    // Stand-ins for movement, removal, a Warp arrival and an instantiation.
    moving.position = { x: 10, y: 20, z: -40 };
    leaving.state = 'pending-removal';
    warping.position = { x: 5000, y: 0, z: 0 };
    warping.placementSerial += 1;
    const arriving = state.entities.allocate(entityInit(1, { position: { x: 7, y: 8, z: 9 } }));
    world.step(tickInput());
    const current = world.renderState();

    expect(previous.entities.map(({ id }) => id)).toEqual([player.id, moving.id, leaving.id, warping.id]);
    expect(current.entities.map(({ id }) => id)).toEqual([player.id, moving.id, warping.id, arriving.id]);
    expect(drawBetween(previous, current, 0.5)).toEqual([
      { id: player.id, position: { x: 0, y: 2, z: 3 } },
      { id: moving.id, position: { x: 5, y: 10, z: -20 } },
      { id: warping.id, position: { x: 5000, y: 0, z: 0 } },
      { id: arriving.id, position: { x: 7, y: 8, z: 9 } },
    ]);
  });
});
