import { expect } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { canonicalObject, canonicalText, type CanonicalValue } from '../contracts/canonical-text.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { DEFAULT_CLOCK_UNITS_PER_TICK } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { ALL_KINDS, type Entity, type EntityInit, type Matrix3 } from './entity-table.ts';
import { createWorldState, type WorldConfig, type WorldState } from './world-state.ts';

// Synthetic world states for Core tests. They stand in for world creation (subtask 07) and for the rule tasks that
// will change entity states; nothing here is original data or behaviour.

export const TEST_MODEL = readAssetId('model/test-craft');
/** An arbitrary rotation, so that copies are checked against something other than the identity. */
export const TEST_ORIENTATION: Matrix3 = Object.freeze([0, 1, 0, -1, 0, 0, 0, 0, 1]) as unknown as Matrix3;

export function testConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    mission: readAssetId('mission/test-mission'),
    group: 0,
    slot: 1,
    rawDifficulty: 19,
    wingman: null,
    seed: 0x1234_5678,
    clockUnitsPerTick: DEFAULT_CLOCK_UNITS_PER_TICK,
    ...overrides,
  };
}

export function testState(overrides: Partial<WorldConfig> = {}): WorldState {
  return createWorldState(testConfig(overrides));
}

export function entityInit(kindBit: number, overrides: Partial<EntityInit> = {}): EntityInit {
  return {
    kindBit,
    source: null,
    name: { type: 'none' },
    presentation: { type: 'model', model: TEST_MODEL },
    position: { x: kindBit, y: 2, z: 3 },
    orientation: TEST_ORIENTATION,
    activity: 'active',
    ...overrides,
  };
}

export const tickInput = (commands: readonly Command[] = []): TickInput => ({ axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [...commands] });

const vec = ({ x, y, z }: Vec3): CanonicalValue => canonicalObject([['x', x], ['y', y], ['z', z]]);

function entityValue(entity: Entity): CanonicalValue {
  const { source, name } = entity;
  return canonicalObject([
    ['id', entity.id],
    ['kindBit', entity.kindBit],
    ['source', source && canonicalObject([
      ['collection', source.collection],
      ['index', source.index],
      ['group', source.group && canonicalObject([['index', source.group.index], ['request', source.group.request], ['member', source.group.member]])],
    ])],
    ['name', canonicalObject(Object.entries(name).map(([key, value]): [string, CanonicalValue] =>
      [key, typeof value === 'object' ? canonicalObject([['collection', value.collection], ['index', value.index]]) : value]))],
    ['presentation', canonicalObject([['type', entity.presentation.type], ['model', entity.presentation.model]])],
    ['position', vec(entity.position)],
    ['orientation', [...entity.orientation]],
    ['placementSerial', entity.placementSerial],
    ['state', entity.state],
    ['activity', entity.activity],
    ['destroyed', entity.destroyed],
  ]);
}

/**
 * A temporary canonical text of everything a world state holds, for comparing states in tests; the formal snapshot
 * is subtask 08's.
 */
export function stateText(state: WorldState): string {
  const { config, player, entities } = state;
  return canonicalText(canonicalObject([
    ['config', canonicalObject(Object.entries(config).map(([key, value]): [string, CanonicalValue] => [key, value as CanonicalValue]))],
    ['tick', state.tick],
    ['clock', state.clock],
    ['rngState', state.rngState],
    ['missionStatus', state.missionStatus],
    ['nextEntityId', entities.nextId],
    ['entities', [...entities.byId()].map(entityValue)],
    ['walkOrder', [...entities.walk(ALL_KINDS)].map(({ id }) => id)],
    ['player', canonicalObject([
      ['entityId', player.entityId],
      ['viewMode', player.viewMode],
      ['previousViewMode', player.previousViewMode],
      ['subMode', player.subMode],
    ])],
  ]));
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
