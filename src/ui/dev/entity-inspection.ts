/**
 * The entity and mission state section of the development diagnostics (docs/plan/p3/04/spec.md: 开发诊断, 实体与任务状态):
 * a display model of one Core snapshot, read on demand. Names are shown as the references the entities hold, never
 * resolved to text; the snapshot is deeply frozen, so the view may share its parts.
 */
import type { EntitySource, Vec3 } from '../../core/contracts/domain-events.ts';
import type { GameSnapshot, SnapshotEntity } from '../../core/replay/snapshot.ts';
import type { NameReference } from '../../core/world/entity-table.ts';
import type { SpawnEntry } from '../../core/world/spawn-state.ts';

/** `mission#3`, `wingman#0`, `mission#3 group 1 request 0 member 2`, or `rules` for an entity without a declaration. */
export function describeSource(source: EntitySource | null): string {
  if (source === null) return 'rules';
  const declaration = `${source.collection}#${source.index}`;
  const { group } = source;
  return group === null ? declaration : `${declaration} group ${group.index} request ${group.request} member ${group.member}`;
}

/** The name reference itself: `none`, `candidate mission#2 [0]`, `pool [5]`, `craft-type bit 3` or `map-marker`. */
export function describeName(name: NameReference): string {
  switch (name.type) {
    case 'none':
      return 'none';
    case 'candidate':
      return `candidate ${name.declaration.collection}#${name.declaration.index} [${name.candidate}]`;
    case 'pool':
      return `pool [${name.index}]`;
    case 'craft-type':
      return `craft-type bit ${name.kindBit}`;
    case 'map-marker':
      return 'map-marker';
  }
}

export interface InspectedEntity {
  readonly id: number;
  readonly kindBit: number;
  readonly source: string;
  readonly name: string;
  readonly position: Vec3;
  readonly state: SnapshotEntity['state'];
  readonly activity: SnapshotEntity['activity'];
  readonly destroyed: boolean;
  readonly placementSerial: number;
}

export interface InspectionView {
  readonly runId: number;
  readonly tick: number;
  /** Mission clock units, 1/64 s each. */
  readonly clock: number;
  readonly seed: number;
  readonly setupHash: string;
  readonly mission: string;
  readonly campaign: { readonly group: number; readonly slot: number };
  readonly rawDifficulty: number;
  readonly wingman: number | null;
  /** The content identity's fields, in their canonical order. */
  readonly content: readonly (readonly [field: string, value: string | number])[];
  readonly missionStatus: GameSnapshot['state']['missionStatus'];
  readonly player: GameSnapshot['state']['player'];
  readonly spawn: {
    readonly enabled: boolean;
    /** In firing order. */
    readonly queue: readonly SpawnEntry[];
    readonly records: number;
    readonly groups: number;
  };
  /** In ascending ID order. */
  readonly entities: readonly InspectedEntity[];
}

const inspectEntity = (entity: SnapshotEntity): InspectedEntity => Object.freeze({
  id: entity.id,
  kindBit: entity.kindBit,
  source: describeSource(entity.source),
  name: describeName(entity.name),
  position: entity.position,
  state: entity.state,
  activity: entity.activity,
  destroyed: entity.destroyed,
  placementSerial: entity.placementSerial,
});

/** The display model of `snapshot`, which `runId`'s run returned. */
export function inspectSnapshot(snapshot: GameSnapshot, runId: number): InspectionView {
  const { config, tick, clock, entities, spawn, missionStatus, player } = snapshot.state;
  const { content } = config;
  const origin: readonly (readonly [string, string])[] = content.origin.type === 'synthetic'
    ? [['origin', 'synthetic'], ['fixtureId', content.origin.fixtureId]]
    : [['origin', 'original-import'], ['sourceFingerprint', content.origin.sourceFingerprint]];
  return Object.freeze({
    runId,
    tick,
    clock,
    seed: config.seed,
    setupHash: config.setupHash,
    mission: config.mission,
    campaign: Object.freeze({ group: config.group, slot: config.slot }),
    rawDifficulty: config.rawDifficulty,
    wingman: config.wingman,
    content: Object.freeze([
      ['schemaVersion', content.schemaVersion],
      ['sliceId', content.sliceId],
      ['sliceDefinitionVersion', content.sliceDefinitionVersion],
      ['converterVersion', content.converterVersion],
      ['manifestIdentity', content.manifestIdentity],
      ...origin,
    ].map((entry) => Object.freeze(entry) as readonly [string, string | number])),
    missionStatus,
    player,
    spawn: Object.freeze({ enabled: spawn.enabled, queue: spawn.queue, records: spawn.records.length, groups: spawn.groups.length }),
    entities: Object.freeze([...entities].sort((left, right) => left.id - right.id).map(inspectEntity)),
  });
}
