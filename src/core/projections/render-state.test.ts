import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { initialPlayerControl, initialPlayerTargeting } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, busyCombat, entityInit, stillEntityInit, TEST_MODEL, TEST_ORIENTATION, testState, tickInput } from '../world/world.test-support.ts';
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
    state.clock = 6;
    const render = renderWorld(state);
    const unlit = { hitShimmerStart: null, explosionStart: null };
    expect(render).toEqual({
      tick: 0,
      clock: 6,
      viewMode: 0x11,
      observedEntityId: player.id,
      entities: [
        { id: first.id, kindBit: 5, presentation: { type: 'model', model: other }, position: { x: -1, y: 0.5, z: 9 }, orientation: TEST_ORIENTATION, placementSerial: 2, ...unlit },
        { id: player.id, kindBit: 0, presentation: { type: 'model', model: TEST_MODEL }, position: { x: 0, y: 2, z: 3 }, orientation: TEST_ORIENTATION, placementSerial: 0, ...unlit },
      ],
    });
    expect(deepFrozen(render)).toBe(true);
  });

  // P3-07 CR-12: the presentation selector of each kind, a craft's latest hit and an explosion's activation clock.
  it('gives each kind its presentation and the hit shimmer and explosion clocks of craft and explosions only', () => {
    const state = testState();
    const entities = [7, 20, 21, 22, 24].map((kindBit) => state.entities.allocate(entityInit(kindBit, { combat: busyCombat(kindBit) })));
    const shimmering = state.entities.allocate(entityInit(8));
    const render = renderWorld(state);
    expect(render.entities.map(({ presentation }) => presentation)).toEqual([...entities, shimmering].map(({ presentation }) => presentation));
    expect(render.entities.map(({ presentation }) => presentation.type)).toEqual(['model', 'missile', 'projectile', 'explosion', 'fragment', 'model']);
    expect(render.entities.map(({ hitShimmerStart, explosionStart }) => [hitShimmerStart, explosionStart])).toEqual([
      [6, null], [null, null], [null, null], [null, 6], [null, null], [null, null],
    ]);
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
    const player = addPlayerEntity(state);
    const [destroyed, source] = [state.entities.allocate(entityInit(3)), state.entities.allocate(entityInit(3))];
    world.step(tickInput());
    destroyed.destroyed = true;
    source.state = 'destroyed-source';
    world.step(tickInput());
    expect(world.renderState().entities.map(({ id }) => id)).toEqual([player.id, destroyed.id, source.id]);
    destroyed.state = 'pending-removal';
    world.step(tickInput());
    expect(world.renderState().entities.map(({ id }) => id)).toEqual([player.id, source.id]);
  });

  it('gives a two-frame consumer what it needs for new, removed and discontinuously moved entities', () => {
    const state = testState();
    const world = constructWorld(state);
    // Standing still, so that movement leaves the stand-ins' positions as they set them.
    const player = state.entities.allocate(stillEntityInit(0));
    state.player.entityId = player.id;
    state.player.control = initialPlayerControl(0);
    state.player.targeting = initialPlayerTargeting();
    const moving = state.entities.allocate(stillEntityInit(3, { position: { x: 0, y: 0, z: 0 } }));
    const leaving = state.entities.allocate(stillEntityInit(3));
    const warping = state.entities.allocate(stillEntityInit(5, { position: { x: 0, y: 0, z: 0 } }));
    // Parked outside the active area, so that the area check leaves it parked.
    state.entities.allocate(entityInit(7, { activity: 'parked', position: { x: 20000, y: 0, z: 0 } }));
    world.step(tickInput());
    const previous = world.renderState();

    // Stand-ins for movement, removal, a Warp arrival and an instantiation.
    moving.position = { x: 10, y: 20, z: -40 };
    leaving.state = 'pending-removal';
    warping.position = { x: 5000, y: 0, z: 0 };
    warping.placementSerial += 1;
    const arriving = state.entities.allocate(stillEntityInit(1, { position: { x: 7, y: 8, z: 9 } }));
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

  it('counts a parked travel as a discontinuous move, so a consumer does not interpolate across the parking (P3-06/14)', () => {
    const state = testState();
    const world = constructWorld(state);
    const player = addPlayerEntity(state, { position: { x: 0, y: 0, z: 0 } });
    const craft = state.entities.allocate(stillEntityInit(7, { position: { x: 1000, y: 0, z: 0 } }));
    world.step(tickInput());
    const before = world.renderState();
    expect(before.entities.map(({ id, placementSerial }) => [id, placementSerial])).toEqual([[player.id, 0], [craft.id, 0]]);

    // Stand-ins for the player flying off and back. Away, the area check parks the craft, which travels toward a goal
    // 400 units on (AI mode 4) at its first parked update; back, the area check resumes it.
    player.position = { x: 20000, y: 0, z: 0 };
    world.step(tickInput());
    world.step(tickInput());
    expect([craft.activity, world.renderState().entities.map(({ id }) => id)]).toEqual(['parked', [player.id]]);
    craft.ai = { ...craft.ai, mode: 4, goal: { x: 1400, y: 0, z: 0 } };
    for (let tick = 0; tick < 70 && craft.placementSerial === 0; tick++) world.step(tickInput());
    expect(craft.placementSerial).toBe(1);
    expect(craft.position.x).toBeGreaterThan(1000);
    player.position = { x: 0, y: 0, z: 0 };
    world.step(tickInput());
    world.step(tickInput());
    const after = world.renderState();
    const resumed = after.entities.find(({ id }) => id === craft.id)!;
    expect(resumed).toMatchObject({ position: craft.position, placementSerial: 1 });
    expect(drawBetween(before, after, 0.5).find(({ id }) => id === craft.id)).toEqual({ id: craft.id, position: craft.position });
  });
});
