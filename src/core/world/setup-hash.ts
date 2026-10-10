/**
 * setupHash (docs/plan/p3/02/spec.md, 快照、哈希与 replay): fnv1a64 of the canonical text of the validated mission setup,
 * names, coordinates, members, every rule input and the event triggers (P3-03 S-02) included, in an explicit field
 * order. It binds a world, a snapshot or a replay to the initial data actually read, which `ContentIdentity` only
 * declares. A consistency check, not a proof of origin. Core writes the event triggers here but does not interpret them.
 */
import type { EventRange, EventTrigger, MissionGroup, RuleInputs, Vector3 } from '../../content/logic/logic-content.ts';
import { canonicalHash, canonicalObject, type CanonicalValue } from '../contracts/canonical-text.ts';
import type { MissionSetup, ResolvedDeclaration } from '../mission/load-mission.ts';

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

/** 16 lowercase hex digits. */
export function setupHash(setup: MissionSetup): string {
  return canonicalHash(setupValue(setup), 'setup');
}
