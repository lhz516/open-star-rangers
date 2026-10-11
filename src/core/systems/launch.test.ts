import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { gun, missile, missileBody, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { ShotTrigger, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import { scatteredRows } from '../rules/movement-builders.ts';
import { RandStream } from '../rules/original-random.ts';
import type { Entity, Matrix3 } from '../world/entity-table.ts';
import { entityInit, expectFault, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyLaunchRequest } from './launch.ts';
import { registerTick, type RequestOf, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-02, CR-03, CR-05, CR-06, CR-08, CR-09; docs/original/formats/executable.md, W11. Each
// expectation is worked out by hand from the shooter's pose and the synthetic records below.

const f = Math.fround;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const matrix = (...rows: number[]) => Object.freeze(rows) as unknown as Matrix3;
/** Row 1 along +y, row 2 along −x, row 3 along +z. */
const TURNED = matrix(0, 1, 0, -1, 0, 0, 0, 0, 1);
const TRIGGER: ShotTrigger = { type: 'command', channel: 'primary', commandIndex: 4 };

/**
 * Guns: 0 fixed and 1 aimed, both at speed 8. Missiles: 0 guided (+0x18 = 1) with scatter, 1 unguided, 2 guided with
 * +0x18 = 2; bodies 0 and 1 with base maximum speeds 30 and 60.
 */
function launchWorld(): [WorldState, Entity, TickContext] {
  const base = testState();
  const info = syntheticCraftInfo();
  info.guns = [gun({ at08: 8, at28: 0 }), gun({ at08: 8, at28: 1 })];
  info.missiles = [missile({ body: 0, at18: 1, at20: 1 }), missile({ body: 1, at18: 0, at20: 0 }), missile({ body: 0, at18: 2, at20: 0 })];
  info.missileBodies = [missileBody({ atB8: 30 }), missileBody({ atB8: 60 })];
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: readCraftInfo(info) } };
  const shooter = state.entities.allocate(entityInit(0, { position: at(10, 20, 30), orientation: TURNED, movement: craftMovementBlock(0x80, 40, 80) }));
  return [state, shooter, registerTick(state, readTickInput(tickInput()))];
}

const gunLaunch = (shooter: Entity, gunIndex: number, orientation: Matrix3 | null = null): RequestOf<'launch'> =>
  ({ type: 'launch', family: 'gun', shooter: shooter.id, gun: gunIndex, mount: 3, offset: at(1, 2, 3), orientation, trigger: TRIGGER });
const missileLaunch = (shooter: Entity, missileIndex: number, launchByte: 0 | 1 | 2 | 3 | 4 = 0, target: number | null = null): RequestOf<'launch'> =>
  ({ type: 'launch', family: 'missile', shooter: shooter.id, missile: missileIndex, mount: 5, offset: at(1, 2, 3), launchByte, target, trigger: TRIGGER });

/**
 * From (10, 20, 30) along row 1 (+y) by 1, row 2 (−x) by 2 and row 3 (+z) by 3 plus the shooter's speed 40 times the
 * step 2/64: (8, 21, 34.25).
 */
const SPAWN = at(8, 21, 34.25);

function launched(state: WorldState, context: TickContext): Entity {
  const event = context.events.at(-1);
  if (event?.type !== 'shot-fired') throw new Error('no shot-fired');
  return state.entities.get(event.entityId)!;
}

describe('the projectile constructor 0x25b0c (W11, CR-03)', () => {
  it('builds a linear projectile with the hit test from the shooter\'s pose and the gun\'s speed, and emits shot-fired', () => {
    const [state, shooter, context] = launchWorld();
    applyLaunchRequest(context, gunLaunch(shooter, 0));
    const projectile = launched(state, context);
    expect(projectile).toMatchObject({
      kindBit: 21, state: 'presentation-ready', activity: 'active', source: null, name: { type: 'none' }, side: null, maximumSpeed: 0,
      position: SPAWN, orientation: TURNED,
      presentation: { type: 'projectile', visuals: state.ruleData.inputs.projectileVisuals.id, record: 0 },
      combat: { type: 'projectile', gun: 0, shooter: shooter.id, expiry: null },
      movement: { mode: 'linear', speed: 8, velocity: at(0, 0, 8), previousPosition: SPAWN, hitTest: true },
    });
    expect(projectile.ai.objectTarget).toBeNull();
    expect(context.events).toEqual([{
      type: 'shot-fired', tick: 1, shooterEntityId: shooter.id, shooterKindBit: 0, shooterPosition: at(10, 20, 30), entityId: projectile.id,
      family: 'gun', weapon: 0, mount: 3, position: SPAWN, trigger: TRIGGER,
    }]);
    expect(state.player.shots.projectilesFired).toBe(1);
  });

  it('flies an aimed shot along the request\'s orientation, but places it with the shooter\'s rows', () => {
    const [state, shooter, context] = launchWorld();
    const aim = matrix(1, 0, 0, 0, f(0.8), -f(0.6), 0, f(0.6), f(0.8));
    applyLaunchRequest(context, gunLaunch(shooter, 1, aim));
    expect(launched(state, context)).toMatchObject({
      position: SPAWN, orientation: aim, movement: { velocity: at(0, f(f(0.6) * 8), f(f(0.8) * 8)) },
    });
  });

  it('counts only the player\'s shots', () => {
    const [state, , context] = launchWorld();
    const other = state.entities.allocate(entityInit(7, { movement: craftMovementBlock(0, 40, 80) }));
    applyLaunchRequest(context, gunLaunch(other, 0));
    applyLaunchRequest(context, missileLaunch(other, 1));
    expect(state.player.shots).toEqual({ projectilesFired: 0, projectileHits: 0, missilesFired: 0, missileHits: 0 });
  });

  it('faults when the orientation does not match gun +0x28', () => {
    const [, shooter, context] = launchWorld();
    expectFault(() => applyLaunchRequest(context, gunLaunch(shooter, 0, TURNED)), 'invariant-violated', 'launch.orientation');
    expectFault(() => applyLaunchRequest(context, gunLaunch(shooter, 1)), 'invariant-violated', 'launch.orientation');
  });

  it('creates nothing for a shooter that no longer resolves', () => {
    const [state, shooter, context] = launchWorld();
    const before = state.entities.size;
    applyLaunchRequest(context, { ...gunLaunch(shooter, 0), shooter: 99 });
    applyLaunchRequest(context, { ...missileLaunch(shooter, 1), shooter: 99 });
    expect([state.entities.size, context.events]).toEqual([before, []]);
  });
});

describe('the missile constructor 0x2b00c (W11, CR-02, CR-09)', () => {
  it('builds a guided missile at throttle 0, set by 0x21a3c from the smaller speed, scattered by three draws', () => {
    const [state, shooter, context] = launchWorld();
    const enemy = state.entities.allocate(entityInit(7));
    const before = state.rngState;
    applyLaunchRequest(context, missileLaunch(shooter, 0, 2, enemy.id));
    const rand = new RandStream(before);
    const rows = scatteredRows(TURNED, rand);
    expect(state.rngState).toEqual(rand.state);
    expect(launched(state, context)).toMatchObject({
      kindBit: 20, state: 'presentation-ready', maximumSpeed: 30, position: SPAWN, orientation: rows,
      presentation: { type: 'missile', missile: 0 },
      movement: { mode: 'craft', speed: 30, commandedSpeed: 30, atCommandedSpeed: true, speedRatio: 1, locked: false },
      combat: {
        type: 'missile', missile: 0, shooter: shooter.id, target: enemy.id, launchByte: 2, program: 'heat-seeker', detonate: false, contact: null,
        guidance: null, homing: null,
      },
    });
    expect(state.player.shots.missilesFired).toBe(1);
    expect(context.events.at(-1)).toMatchObject({ type: 'shot-fired', family: 'missile', weapon: 0, mount: 5, position: SPAWN });
  });

  it('takes the shooter\'s speed when it is the smaller, the ratio against the body\'s base', () => {
    const [state, , context] = launchWorld();
    const slow = state.entities.allocate(entityInit(7, { movement: craftMovementBlock(0x80, 20, 80) }));
    applyLaunchRequest(context, missileLaunch(slow, 2, 3));
    expect(launched(state, context)).toMatchObject({ movement: { speed: 20, commandedSpeed: 20, speedRatio: f(20 / 30) }, combat: { program: 'homing' } });
  });

  it('builds an unguided missile at full throttle along the shooter\'s rows, without a draw', () => {
    const [state, shooter, context] = launchWorld();
    const before = state.rngState;
    applyLaunchRequest(context, missileLaunch(shooter, 1, 4));
    expect(state.rngState).toEqual(before);
    expect(launched(state, context)).toMatchObject({
      maximumSpeed: 60, orientation: TURNED, movement: { speed: 60, commandedSpeed: 60, atCommandedSpeed: true, speedRatio: 1 },
      combat: { program: 'unguided', target: null, launchByte: 4 },
    });
  });

  it('flies a guided missile launched below lock level 2 unguided, and writes only a target that still resolves', () => {
    const [state, shooter, context] = launchWorld();
    applyLaunchRequest(context, missileLaunch(shooter, 2, 1, 99));
    expect(launched(state, context).combat).toMatchObject({ program: 'unguided', target: null, launchByte: 1 });
  });
});
