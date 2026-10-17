import { describe, expect, it } from 'vitest';
import type { Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { addPlayerEntity, busyCombat, entityInit, expectFault, stateText, testState } from '../world/world.test-support.ts';
import { renderWorld } from './render-state.ts';
import { cameraSpeedShare, speedShare, warpSpeedShare } from './speed-share.ts';

// P3-12/32 (docs/plan/p3/02/spec.md, FS-12; docs/original/formats/executable.md, SD4).

/** An independent i16 store of min(100, share) of an i32 truncation (FISTP dword, −2³¹ beyond i32). */
function expectedShare(dividend: number, divisor: number): number {
  const fist = (value: number) => {
    const truncated = Math.trunc(value);
    return truncated >= -(2 ** 31) && truncated < 2 ** 31 ? truncated : -(2 ** 31);
  };
  return new Int16Array([Math.min(100, fist(fist(dividend) / divisor))])[0];
}
const expectedA = (speed: number, base: number) => expectedShare(speed * 100, Math.trunc(base));
const expectedW = (speed: number, base: number) => expectedShare((speed * 100) / base, 1);

/** Sets the speed (+8) of `entity`'s block, which tests allocate steered or linear. */
const setSpeed = (entity: Entity, speed: number) => void ((entity.movement as SteeredMovementBlock).speed = speed);

/** `state` whose craft record of `kindBit` has +0xB8 = `atB8`. */
function withBase(state: WorldState, atB8: number, kindBit = 0): WorldState {
  const { content } = state.craftInfo;
  const craft = content.craft.map((record, kind) => (kind === kindBit ? { ...record, atB8 } : record));
  return { ...state, craftInfo: { ...state.craftInfo, content: { ...content, craft } } };
}

/** A world with a player entity moving at `speed` in view `viewMode`/`subMode`, its record's +0xB8 being `atB8`. */
function playerAt(speed: number, viewMode: number, subMode = 0, atB8 = 64.75): WorldState {
  const state = withBase(testState(), atB8);
  const player = addPlayerEntity(state);
  setSpeed(player, speed);
  Object.assign(state.player, { viewMode, subMode });
  return state;
}

const DESTRUCTION = 0x11;
const PLAYER_VIEWS = [0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x12];
const VIEWS_WITHOUT_CAMERA = [0, 2, 3, 4, 5, 6, 7, 8, 9, 0x0a, 0x0b, 0x13];

describe('the speed share formulas (FS-12)', () => {
  it('divides the camera step\'s truncated speed × 100 by the integer part of +0xB8, and the Warp view\'s by +0xB8 itself', () => {
    // K = 64: 3200 idiv 64 = 50; W: trunc(3200 ÷ 64.75) = 49.
    expect([cameraSpeedShare(32, 64.75), warpSpeedShare(32, 64.75)]).toEqual([50, 49]);
    // K = 1 against B = 1.5: D(F(0.9) × 100) = 89.99…, so trunc 89 against trunc(59.99…) = 59.
    expect([cameraSpeedShare(Math.fround(0.9), 1.5), warpSpeedShare(Math.fround(0.9), 1.5)]).toEqual([89, 59]);
    expect([cameraSpeedShare(0.9, 1.5), warpSpeedShare(0.9, 1.5)]).toEqual([90, 60]);
    // The speed × 100 is truncated before the integer division: D(F(0.64) × 100) = 63.99…, so 63, and 63 idiv 64 = 0.
    expect([cameraSpeedShare(Math.fround(0.64), 1), cameraSpeedShare(Math.fround(0.64) * 64, 64)]).toEqual([63, 63]);
    expect(cameraSpeedShare(Math.fround(0.64), 64)).toBe(0);
  });

  it('caps the share at 100 with no lower clamp, and truncates toward zero', () => {
    expect([cameraSpeedShare(64, 64), cameraSpeedShare(64.75, 64), cameraSpeedShare(1000, 64)]).toEqual([100, 100, 100]);
    expect([warpSpeedShare(64.75, 64.75), warpSpeedShare(1000, 64.75)]).toEqual([100, 100]);
    expect([cameraSpeedShare(-32, 64.75), warpSpeedShare(-32, 64.75)]).toEqual([-50, -49]);
    expect(Object.is(cameraSpeedShare(-0.001, 64), 0)).toBe(true);
    expect(Object.is(warpSpeedShare(-0.001, 64), 0)).toBe(true);
    expect([cameraSpeedShare(0, 64), warpSpeedShare(0, 64)]).toEqual([0, 0]);
  });

  it('stores an i32 truncation beyond i32 as the integer indefinite, and keeps the low 16 bits of the result', () => {
    // 2²⁵ × 100 leaves i32: −2³¹ idiv 64 = −2²⁵, whose low 16 bits are 0.
    expect(cameraSpeedShare(2 ** 25, 64)).toBe(0);
    // −2³¹ idiv 3 = −715827882, whose low 16 bits are 0x5556 as a signed i16.
    expect(cameraSpeedShare(2 ** 25, 3)).toBe(0x5556);
    expect(warpSpeedShare(2 ** 40, 1)).toBe(0);
    // The cap comes before the i16 store: −65000's low 16 bits are 536.
    expect([cameraSpeedShare(-650, 1), warpSpeedShare(-650, 1)]).toEqual([536, 536]);
    // −2 × 10⁵ idiv 1 stays in i32; its low 16 bits are signed.
    expect(cameraSpeedShare(-2000, 1)).toBe(-3392); // −200000's low 16 bits, signed
  });

  it('agrees with an independent computation over a sweep of speeds and bases', () => {
    for (const base of [1, 1.5, 7.25, 64, 64.75, 1000.5]) {
      for (let speed = Math.fround(-2000); speed < 2000; speed = Math.fround(speed < 0 ? speed * 0.63 + 0.11 : speed * 1.37 + 0.11)) {
        expect(cameraSpeedShare(speed, base), `A(${speed}, ${base})`).toBe(expectedA(speed, base));
        expect(warpSpeedShare(speed, base), `W(${speed}, ${base})`).toBe(expectedW(speed, base));
      }
    }
  });
});

describe('the speed share at the tick\'s end (FS-12)', () => {
  it('is 0 without a player entity, or when its ID has left the table', () => {
    const state = playerAt(32, 0x0c);
    expect(speedShare(state)).toBe(50);
    state.player.entityId = 99;
    expect(speedShare(state)).toBe(0);
    state.player.entityId = null;
    for (const viewMode of [0x0c, 1, DESTRUCTION]) {
      Object.assign(state.player, { viewMode, subMode: 8 });
      expect(speedShare(state), `view ${viewMode}`).toBe(0);
    }
  });

  it.each(PLAYER_VIEWS)('is A of the player\'s speed in view %i', (viewMode) => {
    expect(speedShare(playerAt(32, viewMode))).toBe(50);
    expect(speedShare(playerAt(Math.fround(12.3), viewMode, 0, 7.5))).toBe(expectedA(Math.fround(12.3), 7.5));
  });

  it('divides by the +0xB8 of the record bound to the player entity\'s kind', () => {
    const other = withBase(withBase(testState(), 64), 16.5, 5);
    const player = other.entities.allocate(entityInit(5));
    setSpeed(player, 8);
    other.player.entityId = player.id;
    expect(speedShare(other)).toBe(50); // 800 idiv 16, not 800 idiv 64
    other.player.viewMode = 1;
    expect(speedShare(other)).toBe(48); // trunc(800 ÷ 16.5)
  });

  it('is A of the player\'s speed in any sub-mode of a player view, and 0 without a movement block', () => {
    expect(speedShare(playerAt(32, 0x0c, 5))).toBe(50);
    const state = playerAt(32, 0x0e);
    state.entities.get(state.player.entityId!)!.movement = null;
    expect(speedShare(state)).toBe(0);
  });

  it('is W of the player\'s speed in the Warp view 1', () => {
    expect(speedShare(playerAt(32, 1))).toBe(49);
    expect(speedShare(playerAt(Math.fround(0.9), 1, 0, 1.5))).toBe(59);
    expect(speedShare(playerAt(1000, 1))).toBe(100);
  });

  it.each(VIEWS_WITHOUT_CAMERA)('is 0 in view %i, which has no camera function', (viewMode) => {
    expect(speedShare(playerAt(32, viewMode))).toBe(0);
  });

  it('in the destruction view 0x11/8 is A(30) before the explosion, A of the followed entity\'s speed while it lasts, and 0 once it has left', () => {
    const state = playerAt(50, DESTRUCTION, 8);
    // 30 is a speed: 3000 idiv 64 = 46, whatever the player's own speed.
    expect(speedShare(state)).toBe(46);
    const pod = state.entities.allocate(entityInit(24, { combat: busyCombat(24) }));
    state.player.followedEntity = pod.id;
    setSpeed(pod, 16);
    expect(speedShare(state)).toBe(25);
    setSpeed(pod, 640);
    expect(speedShare(state)).toBe(100);
    state.entities.remove(pod);
    expect(speedShare(state)).toBe(0);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 9])('faults in view 0x11 sub-mode %i, which P3 does not reach (P4\'s cameras)', (subMode) => {
    expectFault(() => speedShare(playerAt(32, DESTRUCTION, subMode)), 'invariant-violated', 'render.speed-share-sub-mode');
  });

  it('is given in the Render State, read without changing the world or drawing', () => {
    const state = playerAt(32, 1);
    const before = stateText(state);
    expect(renderWorld(state).speedShare).toBe(49);
    expect(stateText(state)).toBe(before);
    state.player.viewMode = 0x0c;
    expect(renderWorld(state).speedShare).toBe(50);
  });
});
