/**
 * Scenes for the radio and base-response tests: a drained world with message tables written for them, an available
 * player at the origin whose automatic target selection is not due, and helpers that build state the way the rules
 * leave it (docs/plan/p3/02/spec.md, CB-05).
 */
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import type { CommunicationsRuleData } from '../world/comm-input.ts';
import type { Entity, EntityInit } from '../world/entity-table.ts';
import type { LeftPage } from '../world/player-state.ts';
import { addPlayerEntity, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { MessageIdentity, RadioCallback, RadioItem, SpeakerSnapshot, WorldState } from '../world/world-state.ts';

/** Durations in 1/8 s: the baseline's docking reply 5 + 10 + 5 and status reply 5 + 8 + 5 (RQ5). */
export const DOCKING_REPLY = Object.freeze([5, 10, 5]);
export const STATUS_REPLY = Object.freeze([5, 8, 5]);

/**
 * Faces 0–3 of 20011 hold the base replies (index 0 docking, 1 status, 2 enemy near, 3 thanks, 4 status under threat);
 * face 4 has only entries of 0. 20019 has three faces of three craft entries, 20985 five faces of 20 lines (index i
 * lasts i + 1, entry 12 of 0), and 20983 seven entries with entry 1 of 0.
 */
export const TEST_MESSAGES: CommunicationsRuleData['messages'] = Object.freeze({
  faceTables: Object.freeze({
    20011: Object.freeze([
      ...Array.from({ length: 4 }, () => Object.freeze([DOCKING_REPLY, STATUS_REPLY, Object.freeze([2]), Object.freeze([3]), Object.freeze([4, 4])])),
      Object.freeze([null, null, null, null, null]),
    ]),
    20019: Object.freeze(Array.from({ length: 3 }, () => Object.freeze([Object.freeze([1]), Object.freeze([2]), Object.freeze([3])]))),
    20985: Object.freeze(Array.from({ length: 5 }, () => Object.freeze(Array.from({ length: 20 }, (_, index) => (index === 12 ? null : Object.freeze([index + 1])))))),
  }),
  direct: Object.freeze([Object.freeze([5]), null, Object.freeze([0]), Object.freeze([2]), Object.freeze([1]), Object.freeze([1]), Object.freeze([1])]),
});

export const ORIGIN: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const BASE_KIND_BIT = 17;
export const WINGMAN_KIND_BIT = 1;
/** Kind bit 2 is in `0x87c`; kind bit 7 in the hostile set `0x93780`. */
export const CRAFT_KIND_BIT = 2;
export const HOSTILE_KIND_BIT = 7;

export interface RadioScene {
  readonly state: WorldState;
  readonly player: Entity;
}

/** A drained world with TEST_MESSAGES and an available player at the origin. */
export function radioScene(): RadioScene {
  const drained = testState();
  const { communications } = drained.ruleData;
  const state: WorldState = { ...drained, ruleData: { ...drained.ruleData, communications: { ...communications, messages: TEST_MESSAGES } } };
  const player = addPlayerEntity(state, { position: ORIGIN });
  player.state = 'active';
  state.player.targeting!.autoTargetDueClock = 1e9;
  return { state, player };
}

/** An entity of `kindBit` in state 7, standing at x = 100 unless overridden. */
export function addActive({ state }: RadioScene, kindBit: number, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position: { x: 100, y: 0, z: 0 }, ...overrides }));
  entity.state = 'active';
  return entity;
}

export const snapshotOf = (entity: Entity): SpeakerSnapshot => ({ entityId: entity.id, kindBit: entity.kindBit, name: entity.name });

export const radioItem = (message: MessageIdentity, due: number, callback: RadioCallback = 'none', speaker: SpeakerSnapshot | null = null): RadioItem =>
  ({ message, due, callback, speaker });

export const pageChanged = (previousPage: LeftPage, page: LeftPage, tick: number, commandIndex: number | null = null): DomainEvent =>
  ({ type: 'left-page-changed', tick, page, previousPage, commandIndex });
