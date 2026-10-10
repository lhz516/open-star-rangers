/**
 * setupHash (docs/plan/p3/02/spec.md, 快照、哈希与 replay and CR-01; docs/plan/p3/06/spec.md, D-01): fnv1a64 of the
 * canonical text of the validated mission setup, names, coordinates, members, every rule input and the event triggers
 * (P3-03 S-02) included, followed by the complete craft info as read and its Asset ID, then the rule-data inputs as
 * Core keeps them (rule-data.ts), each in an explicit field order:
 *
 * | Input | Written | Not written (appearance only) |
 * |---|---|---|
 * | `debrisParameters` | the ID and the complete content | — |
 * | `projectileVisuals` | the ID and every record's length, in record order | templates, selectors, widths, colours |
 * | `explosions` | the ID and every entry's animation reference, list by list, in order | sounds |
 * | `explosionAnimations` | each ID and frame count, in ID order | frame images |
 * | `models` | each ID and part list 1's part count, in ID order | geometry, textures, colours, part flags, sounds |
 *
 * It binds a world, a snapshot or a replay to the initial data actually read, which `ContentIdentity` only declares. A
 * consistency check, not a proof of origin and not free of collisions. Core writes the event triggers here but does
 * not interpret them.
 */
import type { EventRange, EventTrigger, MissionGroup, RuleInputs, Vector3 } from '../../content/logic/logic-content.ts';
import type {
  BodyCollisionShape, Box, CraftCollisionShape, CraftInfo, CraftRecord, GunRecord, MissileBodyRecord, MissileRecord, Mount, Pair,
} from '../../content/rule-data/craft-info.ts';
import {
  canonicalHash,
  canonicalList as list,
  canonicalMembers as object,
  canonicalNullable as nullable,
  canonicalObject,
  canonicalScalar as scalar,
  type CanonicalValue,
} from '../contracts/canonical-text.ts';
import type { MissionSetup, ResolvedDeclaration } from '../mission/load-mission.ts';
import type { DebrisCollisionShape, DebrisParameters, DebrisRecord } from '../../content/rule-data/debris-parameters.ts';
import type { WorldCraftInfo } from './craft-info-input.ts';
import type { RuleDataInputs } from './rule-data.ts';

const vector = ({ x, y, z }: Vector3): CanonicalValue => canonicalObject([['x', x], ['y', y], ['z', z]]);

const ruleInputs = (inputs: RuleInputs): CanonicalValue => canonicalObject([
  ['percentA', inputs.percentA],
  ['craftCount', inputs.craftCount],
  ['percentB', inputs.percentB],
  ['percentC', inputs.percentC],
  ['percentD', inputs.percentD],
  ['aiValueA', inputs.aiValueA],
  ['aiValueB', inputs.aiValueB],
  ['aiValueC', inputs.aiValueC],
]);

const declaration = (value: ResolvedDeclaration): CanonicalValue => canonicalObject([
  ['index', value.index],
  ['origins', [...value.origins]],
  ['craftType', value.craftType],
  ['nameCandidates', [...value.nameCandidates]],
  ['position', vector(value.position)],
  ['spawnTime', value.spawnTime],
  ['gridSpacing', value.gridSpacing],
  ['placement', canonicalObject([['region', value.placement.region], ['anchor', value.placement.anchor]])],
  ['memberOf', value.memberOf],
  ['aiTarget', value.aiTarget],
  ['eventTrigger', value.eventTrigger],
  ['ruleInputs', ruleInputs(value.ruleInputs)],
  ['aiTargetCraftTypes', [...value.aiTargetCraftTypes]],
  ['side', value.side],
  ['model', value.model],
  ['baseInteraction', value.baseInteraction],
]);

const group = (value: MissionGroup): CanonicalValue => canonicalObject([
  ['template', value.template],
  ['members', [...value.members]],
  ['spawnCount', value.spawnCount],
  ['layout', value.layout.map(vector)],
]);

/** Messages are byte strings, written by the canonical text's string rule. */
const eventRange = (value: EventRange): CanonicalValue => canonicalObject([
  ['lower', value.lower],
  ['upper', value.upper],
  ['messages', [...value.messages]],
  ['summarySelector', value.summarySelector],
]);

const eventTrigger = (value: EventTrigger): CanonicalValue => canonicalObject([['ranges', value.ranges.map(eventRange)]]);

/** The canonical value of a whole setup. */
function setupValue(setup: MissionSetup): CanonicalValue {
  const { coordinates, mapFrame } = setup;
  return canonicalObject([
    ['mission', setup.mission],
    ['campaign', canonicalObject([['group', setup.campaign.group], ['slot', setup.campaign.slot]])],
    ['coordinates', canonicalObject([['unit', coordinates.unit], ['referenceScale', coordinates.referenceScale], ['layoutUnit', coordinates.layoutUnit]])],
    ['mapFrame', canonicalObject([
      ['rightAxis', mapFrame.rightAxis],
      ['upAxis', mapFrame.upAxis],
      ['center', canonicalObject([['right', mapFrame.center.right], ['up', mapFrame.center.up]])],
      ['halfExtent', mapFrame.halfExtent],
    ])],
    ['namePool', [...setup.namePool]],
    ['spawnRegions', setup.spawnRegions.map(({ x0, y0, x1, y1 }) => canonicalObject([['x0', x0], ['y0', y0], ['x1', x1], ['y1', y1]]))],
    ['declarations', setup.declarations.map(declaration)],
    ['player', setup.player],
    ['groups', setup.groups.map(group)],
    ['eventTriggers', setup.eventTriggers.map(eventTrigger)],
    ['wingmanOptions', setup.wingmanOptions.map(declaration)],
  ]);
}

// The craft info's content type belongs to P3-03; writers typed by its members stop compiling when a member changes.
const numbers = list(scalar);
const box = object<Box>({ lower: numbers, upper: numbers });

const gun = object<GunRecord>({
  name: scalar, at08: scalar, at14: scalar, at18: scalar, at1C: scalar, at20: scalar, at24: scalar, at28: scalar, at2C: scalar,
});

const missile = object<MissileRecord>({
  name: scalar, body: scalar, at18: scalar, at1C: scalar, at20: scalar, at24: scalar, at28: scalar, at30: scalar, at34: scalar,
  at38: scalar, at3C: scalar, at40: scalar, at44: scalar, at48: scalar, at4C: scalar, at54: scalar, at58: scalar, at5C: scalar,
  at60: scalar, at64: scalar,
});

const mount = object<Mount>({
  at00: numbers, at0C: scalar, at10: scalar, weapon: scalar, at18: scalar, at1C: scalar, at20: scalar, at24: numbers, at30: scalar,
  at34: scalar,
});

/** The members craft and missile body records share, after their collision shapes (craft.md §3.5). */
const recordValues = {
  at54: scalar, at58: scalar, at5C: scalar, at60: scalar, at64: numbers, at74: scalar, at78: numbers, at88: scalar, at8C: scalar,
  at90: scalar,
} as const;
const recordTail = {
  at9C: scalar, atA0: scalar, atA4: scalar, atA8: scalar, atAC: scalar, atB0: scalar, atB4: scalar, atB8: scalar, atBC: scalar,
  atC0: scalar, atC4: scalar, atC8: scalar,
} as const;

const craft = object<CraftRecord>({
  at00: scalar,
  name: scalar,
  at08: scalar,
  at0C: scalar,
  collision: object<CraftCollisionShape>({ at00: scalar, at08: nullable(numbers), boxes: list(box), at28: scalar, at2C: numbers }),
  ...recordValues,
  pairs: list(object<Pair>({ at00: scalar, at04: scalar })),
  ...recordTail,
  mountLists: list(numbers),
  mounts: list(mount),
});

const missileBody = object<MissileBodyRecord>({
  at08: scalar,
  at0C: scalar,
  collision: object<BodyCollisionShape>({ at00: scalar, at04: scalar, at08: numbers, at28: scalar, at2C: numbers }),
  ...recordValues,
  ...recordTail,
});

const craftInfo = object<WorldCraftInfo>({
  id: scalar,
  content: object<CraftInfo>({ hitDamageScale: scalar, guns: list(gun), missiles: list(missile), craft: list(craft), missileBodies: list(missileBody) }),
});

const debrisParameters = object<RuleDataInputs['debrisParameters']>({
  id: scalar,
  content: object<DebrisParameters>({
    byCraftType: list(list(object<DebrisRecord>({
      at00: numbers,
      collision: object<DebrisCollisionShape>({ boxes: list(box), at28: scalar, at2C: numbers }),
    }))),
  }),
});

const ruleData = object<RuleDataInputs>({
  debrisParameters,
  projectileVisuals: object<RuleDataInputs['projectileVisuals']>({ id: scalar, lengths: numbers }),
  explosions: object<RuleDataInputs['explosions']>({ id: scalar, lists: list(list(scalar)) }),
  explosionAnimations: list(object<RuleDataInputs['explosionAnimations'][number]>({ id: scalar, frames: scalar })),
  models: list(object<RuleDataInputs['models'][number]>({ id: scalar, parts: scalar })),
});

/** 16 lowercase hex digits: the setup first, then the craft info, then the rule-data inputs. */
export function setupHash(setup: MissionSetup, info: WorldCraftInfo, rules: RuleDataInputs): string {
  return canonicalHash(canonicalObject([['setup', setupValue(setup)], ['craftInfo', craftInfo(info)], ['ruleData', ruleData(rules)]]), 'setup');
}
