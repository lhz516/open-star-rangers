import { expect } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError } from '../errors.ts';
import { snapshotText, takeSnapshot } from '../replay/snapshot.ts';
import { initialWorldState } from './create-world.ts';
import { asCreateInput, playerOnlyMission, worldInput } from './create-world.test-support.ts';
import type { EntityInit, EntityRuleInputs, Matrix3 } from './entity-table.ts';
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
  const state = drainedState();
  return { ...state, config: Object.freeze({ ...state.config, ...overrides }) };
}

export function entityInit(kindBit: number, overrides: Partial<EntityInit> = {}): EntityInit {
  return {
    kindBit,
    source: null,
    name: { type: 'none' },
    side: 'friendly',
    baseInteraction: false,
    presentation: { type: 'model', model: TEST_MODEL },
    position: { x: kindBit, y: 2, z: 3 },
    orientation: TEST_ORIENTATION,
    activity: 'active',
    ruleInputs: TEST_RULE_INPUTS,
    ...overrides,
  };
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
