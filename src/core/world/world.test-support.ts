import { expect } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError } from '../errors.ts';
import { snapshotText, takeSnapshot } from '../replay/snapshot.ts';
import { initialWorldState } from './create-world.ts';
import { asCreateInput, craftInfoContent, playerOnlyMission, worldInput } from './create-world.test-support.ts';
import { buildWeaponBlock } from '../rules/combat-init.ts';
import { craftMovementBlock, initialMovementBlock } from '../rules/flight-state.ts';
import {
  allocatorFlightState, blankCraftCombat, combatTypeOf, SUBSYSTEM_COUNT, type Entity, type EntityCombat, type EntityInit, type EntityRuleInputs,
  type Matrix3, type SubsystemState,
} from './entity-table.ts';
import { initialPlayerControl, initialPlayerTargeting } from './player-state.ts';
import type { CraftRuleData } from './rule-data.ts';
import type { RuntimeRecord } from './spawn-state.ts';
import type { WorldConfig, WorldState } from './world-state.ts';

// Synthetic world states for Core tests. They stand in for the rule tasks that will change entity states; nothing
// here is original data or behaviour.

export const TEST_MODEL = readAssetId('model/test-craft');
/** An arbitrary rotation, so that copies are checked against something other than the identity. */
export const TEST_ORIENTATION: Matrix3 = Object.freeze([0, 1, 0, -1, 0, 0, 0, 0, 1]) as unknown as Matrix3;
export const TEST_RULE_INPUTS: EntityRuleInputs = Object.freeze({ percentB: 100, percentC: 90, percentD: 80, aiValueA: 3, aiValueB: -2, aiValueC: 41 });

/** A world created from the synthetic player-only mission whose queue has already drained, so no step spawns. */
function drainedState(): WorldState {
  const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission() })));
  state.spawn.queue.length = 0;
  return state;
}

/** The configuration of that world, with `overrides`; not necessarily one creation accepts. */
export function testConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return { ...drainedState().config, ...overrides };
}

/** An empty world whose spawn queue has drained, with configuration `overrides` (only projections read them). */
export function testState(overrides: Partial<WorldConfig> = {}): WorldState {
  const state = withEveryKindBound(drainedState());
  return { ...state, config: Object.freeze({ ...state.config, ...overrides }) };
}

const ORIGIN_BOX = Object.freeze({ lower: Object.freeze({ x: 0, y: 0, z: 0 }), upper: Object.freeze({ x: 0, y: 0, z: 0 }) });
/** Static rule data no point is inside (one empty box), with no model parts: a craft that never collides and sheds nothing. */
const UNBOUND_KIND: CraftRuleData = Object.freeze({
  shape: Object.freeze({ radius: 0, radiusSquared: 0, bounds: ORIGIN_BOX, boxes: Object.freeze([ORIGIN_BOX]), innerBox: null }),
  mountOffsets: Object.freeze([]),
  parts: 0,
  debris: Object.freeze([]),
});

/**
 * `state` with static rule data for every craft kind its mission cannot instantiate, which Core tests allocate anyway:
 * UNBOUND_KIND, so the collision passes (P3-07/19), which read every active craft's shape each tick, find such a craft
 * in no contact, and a destroyed one explodes holding its source. A created world never holds such a craft.
 */
export function withEveryKindBound(state: WorldState): WorldState {
  const craft = Object.freeze(state.ruleData.craft.map((kind) => kind ?? UNBOUND_KIND));
  return { ...state, ruleData: Object.freeze({ ...state.ruleData, craft }) };
}

/** A test maximum speed and craft base: an f32 the block's ratio of 0.5 represents exactly. */
export const TEST_MAXIMUM_SPEED = 48;
export const TEST_BASE_MAXIMUM_SPEED = 96;
export const TEST_VISUALS = readAssetId('data/projectile-visuals');

/**
 * A blank craft combat state whose weapon block `0x2d400` builds from the synthetic craft info's record of `kindBit`,
 * so that rules reading the mounts find one state per mount; only the player's record (kind bit 0) has mounts.
 */
function craftCombat(kindBit: number): EntityCombat {
  const record = craftInfoContent().craft[kindBit];
  return record === undefined ? blankCraftCombat() : { ...blankCraftCombat(), weapons: buildWeaponBlock(record as unknown as CraftRecord) };
}

type KindDefaults = Pick<EntityInit, 'combat' | 'presentation' | 'movement'> & Partial<Pick<EntityInit, 'side' | 'ruleInputs' | 'maximumSpeed' | 'name'>>;

const ZERO_RULE_INPUTS: EntityRuleInputs = Object.freeze({ percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 });
/** The fields a runtime kind takes from the allocator (CR-02) where entityInit's craft defaults differ. */
const RUNTIME = { side: null, ruleInputs: ZERO_RULE_INPUTS, maximumSpeed: 0 } as const;

/**
 * Combat state, presentation and active movement block of a minimal entity of `kindBit` (CR-02, CR-03): a blank craft,
 * its weapon block its synthetic record's, with its model; or a runtime kind's first record, its variant's block at rest, no references and the allocator's
 * fields (a missile keeps TEST_MAXIMUM_SPEED); the map marker with its own name, presentation and block (MW-03). Kinds
 * without a combat type get a craft's, which allocation rejects.
 */
export function kindDefaults(kindBit: number): KindDefaults {
  const still = { speed: 0, velocity: { x: 0, y: 0, z: 0 } };
  const steered = initialMovementBlock(TEST_MAXIMUM_SPEED, TEST_BASE_MAXIMUM_SPEED);
  switch (combatTypeOf(kindBit)) {
    case 'missile':
      return {
        ...RUNTIME,
        maximumSpeed: TEST_MAXIMUM_SPEED,
        combat: { type: 'missile', missile: 0, shooter: null, target: null, launchByte: 0, program: 'unguided', detonate: false, contact: null, guidance: null, homing: null },
        presentation: { type: 'missile', missile: 0 },
        movement: steered,
      };
    case 'projectile':
      return {
        ...RUNTIME,
        combat: { type: 'projectile', gun: 0, shooter: null, expiry: null },
        presentation: { type: 'projectile', visuals: TEST_VISUALS, record: 0 },
        movement: { mode: 'linear', ...still, previousPosition: { x: kindBit, y: 2, z: 3 }, hitTest: true },
      };
    case 'explosion':
      return {
        ...RUNTIME,
        combat: { type: 'explosion', source: 1, sourceKindBit: 7, variant: 'other', heldSource: null, activationClock: null, removalAfterClock: null },
        presentation: { type: 'explosion', variant: 'other' },
        movement: { mode: 'linear', ...still, previousPosition: { x: kindBit, y: 2, z: 3 }, hitTest: false },
      };
    case 'fragment':
      return {
        ...RUNTIME,
        combat: { type: 'fragment', sourceKindBit: 7, part: 0, debris: 0, durability: 0, explodeOnExpiry: false, expiry: { type: 'pending' }, handOff: null },
        presentation: { type: 'fragment', model: TEST_MODEL, part: 0, display: 'part' },
        movement: { mode: 'spinning', ...still, spin: 0, spinAxis: 0 },
      };
    case 'marker':
      return {
        ...RUNTIME,
        name: { type: 'map-marker' },
        combat: { type: 'marker' },
        presentation: { type: 'map-marker' },
        movement: { mode: 'marker', speed: 0 },
      };
    default:
      return { combat: craftCombat(kindBit), presentation: { type: 'model', model: TEST_MODEL }, movement: steered };
  }
}

/**
 * Instantiation data of an entity of `kindBit`, active by default; an active one gets its kind's movement block at
 * rest (a craft or missile the initial block of TEST_MAXIMUM_SPEED), a parked one none, unless `overrides` say otherwise.
 */
export function entityInit(kindBit: number, overrides: Partial<EntityInit> = {}): EntityInit {
  const active = (overrides.activity ?? 'active') === 'active';
  const { movement, ...defaults } = kindDefaults(kindBit);
  return {
    kindBit,
    source: null,
    name: { type: 'none' },
    side: 'friendly',
    baseInteraction: false,
    position: { x: kindBit, y: 2, z: 3 },
    orientation: TEST_ORIENTATION,
    activity: 'active',
    ruleInputs: TEST_RULE_INPUTS,
    ...allocatorFlightState(),
    maximumSpeed: TEST_MAXIMUM_SPEED,
    lastParkedUpdateClock: 0,
    ...defaults,
    movement: active ? movement : null,
    ...overrides,
  };
}

/** Like entityInit, but active with a block at throttle 0: movement leaves its position as a test sets it. */
export function stillEntityInit(kindBit: number, overrides: Partial<EntityInit> = {}): EntityInit {
  return entityInit(kindBit, { movement: craftMovementBlock(0, TEST_MAXIMUM_SPEED, TEST_BASE_MAXIMUM_SPEED), ...overrides });
}

/**
 * Combat state of an entity of `kindBit` with every optional part set, as P3-07's rules write it (CR-02), matching
 * kindDefaults' presentation; a kind without a combat type gets a craft's.
 */
export function busyCombat(kindBit: number): EntityCombat {
  const { combat } = kindDefaults(kindBit);
  switch (combat.type) {
    case 'missile':
      return {
        ...combat, shooter: 3, target: 4, launchByte: 3, program: 'homing', detonate: true, contact: 5,
        guidance: { phase: 2, lifetimeClock: 100, armClock: 10, fuseRadiusSquared: 2.5, detonationClock: 0, checkInterval: -3, nextCheckClock: 8 },
        homing: { period: 40, nextUpdateClock: 12, turnFraction: Math.fround(0.65), speedFraction: 1, targetValid: true, targetDistance: 300 },
      };
    case 'projectile':
      return { ...combat, shooter: 3, expiry: { clock: 70, firstHitPending: true } };
    case 'explosion':
      return { ...combat, source: 3, sourceKindBit: 20, heldSource: 3, activationClock: 6, removalAfterClock: 102 };
    case 'fragment':
      return { ...combat, debris: 2, durability: 1200, explodeOnExpiry: true, expiry: { type: 'at', clock: 1 }, handOff: 3 };
    case 'marker':
      return combat;
    case 'craft':
      return {
        ...combat, energy: -5, shield: 3, charge: 2, shieldLevel: 1, chargeLevel: 2, sparePower: 7, fullSpeedPower: 9, lastEnergyClock: 4,
        nextEnergyClock: 132, depleted: true, hull: -1, subsystems: Array.from({ length: SUBSYSTEM_COUNT }, (_, index) => (index % 4) as SubsystemState),
        weapons: {
          selections: [{ index: 1, mount: 0 }, { index: -1, mount: null }, { index: 0, mount: 1 }],
          lock: { level: 3, stageDueClock: 12, losing: true, graceDueClock: 14, nextUpdateClock: 16 },
          mounts: [
            { lastShotClock: null, ammunition: 4, damage: 0, burst: 0, aim: [0, 0, 0, 0, 0, 0, 0, 0, 0], autoTarget: null, retargetClock: 0 },
            { lastShotClock: 20, ammunition: -1, damage: 2, burst: 3, aim: [...TEST_ORIENTATION] as unknown as Matrix3, autoTarget: 5, retargetClock: 22 },
          ],
        },
        hitFeedbackClock: 6, proximity: { entity: 2, distanceSquared: 0.5 }, lastVictim: { entity: 3, clock: 8 }, lastAttacker: { entity: 4, clock: 10 },
      };
  }
}

/**
 * A standing player entity (stillEntityInit of kind bit 0) registered as the player with its control and targeting
 * state, which exist exactly while a player entity does (CR-04): the area check keeps other entities near it active,
 * as without a player entity it parks them.
 */
export function addPlayerEntity(state: WorldState, overrides: Partial<EntityInit> = {}): Entity {
  const player = state.entities.allocate(stillEntityInit(0, overrides));
  state.player.entityId = player.id;
  state.player.control = initialPlayerControl(state.config.group);
  state.player.targeting = initialPlayerTargeting();
  return player;
}

export const tickInput = (commands: readonly Command[] = []): TickInput => ({ axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [...commands] });

/** The canonical text of everything a world state holds but its static setup: its formal snapshot's. */
export function stateText(state: WorldState): string {
  return snapshotText(takeSnapshot(state));
}

/** The world's record of a mission declaration or of the selected wingman option. */
export function recordOf(state: WorldState, collection: 'mission' | 'wingman', index: number): RuntimeRecord {
  const record = collection === 'mission' ? state.spawn.records[index] : state.spawn.wingman;
  if (!record || record.declaration.index !== index) throw new Error(`No ${collection} record ${index}`);
  return record;
}

/** The error `work` throws, or undefined. */
export function thrownBy(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Asserts that `work` throws a CoreFaultError with this code and site. */
export function expectFault(work: () => unknown, code: CoreFaultError['code'], site: string): CoreFaultError {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreFaultError);
  expect(error).toMatchObject({ code, site });
  return error as CoreFaultError;
}
