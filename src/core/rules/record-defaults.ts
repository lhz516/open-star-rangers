/**
 * Record defaults, `0x6744c` (docs/original/formats/executable.md#record-defaults-p3-0203; scenario.md §3; Q-04). The
 * build fills every section-1 record once, in array order, and the selected wingman option right after the player
 * record; group members and templates share their section-1 record's values, and a record reachable only through a
 * group is never filled. Defaults belong to the record, not to each object instantiated from it.
 *
 * Each field has its own semantics (a source 0, which the content stores as null, takes the default):
 * - +0x0C and +0x10 (u32 in the content, i32 in the original): 100 and 1; negative values are kept;
 * - +0x60, +0x64, +0x68: 100; negative values become 0;
 * - +0x70: the mission default; negative values become 0;
 * - +0x74: the mission default; negative values are kept;
 * - +0x78: rand % 60 + 20, one draw; negative values become 0.
 */
import type { RuleInputs } from '../../content/logic/logic-content.ts';
import type { RecordRuleInputs } from '../world/spawn-state.ts';
import type { RandSource } from './original-random.ts';

/** The original's i32 view of a u32 source value. */
export const toInt32 = (value: number): number => value | 0;

const filled = (value: number | null, fallback: () => number, negative: (value: number) => number): number => {
  const signed = toInt32(value ?? 0);
  if (signed === 0) return fallback();
  return signed < 0 ? negative(signed) : signed;
};

const kept = (value: number): number => value;
const clamped = (): number => 0;

/**
 * The default of +0x70 and +0x74: (difficulty group + 3) × mission number, or 100 when the mission number is below 1.
 * The mission number is the campaign slot.
 */
export function missionDefault(group: number, missionNumber: number): number {
  return missionNumber < 1 ? 100 : (group + 3) * missionNumber;
}

/** The random +0x78 default: rand % 60 + 20, so 20–27 have 547 of the 32,768 rand values each and 28–79 have 546. */
export function randomAiValue(rand: RandSource): number {
  return (rand.next() % 60) + 20;
}

/** A record's rule inputs after the build fills it; draws once from `rand` exactly when +0x78 is 0 or null. */
export function fillRecordDefaults(inputs: RuleInputs, defaultForMission: number, rand: RandSource): RecordRuleInputs {
  const percent = (value: number | null): number => filled(value, () => 100, clamped);
  const aiValueC = filled(inputs.aiValueC, () => randomAiValue(rand), clamped);
  return Object.freeze({
    percentA: filled(inputs.percentA, () => 100, kept),
    craftCount: filled(inputs.craftCount, () => 1, kept),
    percentB: percent(inputs.percentB),
    percentC: percent(inputs.percentC),
    percentD: percent(inputs.percentD),
    aiValueA: filled(inputs.aiValueA, () => defaultForMission, clamped),
    aiValueB: filled(inputs.aiValueB, () => defaultForMission, kept),
    aiValueC,
  });
}

/** The rule inputs of a record the build does not fill: its source values as i32, 0 for a null. */
export function unfilledRuleInputs(inputs: RuleInputs): RecordRuleInputs {
  const value = (field: keyof RuleInputs): number => toInt32(inputs[field] ?? 0);
  return Object.freeze({
    percentA: value('percentA'),
    craftCount: value('craftCount'),
    percentB: value('percentB'),
    percentC: value('percentC'),
    percentD: value('percentD'),
    aiValueA: value('aiValueA'),
    aiValueB: value('aiValueB'),
    aiValueC: value('aiValueC'),
  });
}
