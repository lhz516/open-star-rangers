/**
 * The instantiation state of one world (docs/plan/p3/02/spec.md, 任务实例化 and 实体与生命周期, 声明与实例分离;
 * docs/original/formats/executable.md#spawn-queue-defaults-names-and-instantiation-p3-0203). World creation builds it
 * from the validated mission setup, which stays read-only: the records here are the world's private copies of the
 * mission's records after the build's defaults, as the original fills its freshly loaded SCEN block in place.
 *
 * Static parts (frame, positions, regions, layouts) follow from the setup and never change; the counters, the leader,
 * the template copies, the queue, the enable flag and the pool counters change while the world runs.
 */
import type { SpawnRegion, Vector3 } from '../../content/logic/logic-content.ts';
import type { RuntimeFrame } from '../rules/coordinates.ts';
import type { DeclarationReference, EntityId, EntityRuleInputs } from './entity-table.ts';

/**
 * A record's rule inputs as the original holds them after the build (Q-04), i32 each, named as in the content's
 * `RuleInputs`. A filled record has its defaults; a record the build does not fill (one reachable only through a group)
 * keeps its source values, 0 for a null.
 */
export interface RecordRuleInputs extends EntityRuleInputs {
  /** +0x0C, the spawn probability in percent. */
  readonly percentA: number;
  /** +0x10, the requests per firing of a section-1 record's queue entry. */
  readonly craftCount: number;
}

/** One record of the mission (a declaration) or the selected wingman option, as the world holds it. */
export interface RuntimeRecord {
  readonly declaration: DeclarationReference;
  /** +0x24–+0x2C in runtime units: a section-1 record's converted once, any other's as stored. */
  readonly position: Vector3;
  /** +0x44 in runtime units, or null. */
  readonly region: SpawnRegion | null;
  /** +0x48 after the defaults: a mission declaration index, or null. A wingman's is the player record. */
  readonly anchor: number | null;
  /** +0x40 as declared; world creation rejects anything but 0 on every record placement uses. */
  readonly gridSpacing: number;
  readonly ruleInputs: RecordRuleInputs;
  /** +0x58, a mission declaration index; a group's template overwrites it before each member's instantiation when it has one. */
  aiTarget: number | null;
  /** +0x5C as craft type bits; a group's template overwrites it likewise when its own is not empty. */
  aiTargetCraftTypes: readonly number[];
  /** +0x18: objects instantiated from the record as a section-1 record or wingman (group members do not count); never decreases. */
  spawnCount: number;
}

/** A section-5 group at run time. */
export interface GroupState {
  /** Section-6 offsets in runtime units, as declared. */
  readonly layout: readonly Vector3[];
  /** Entry +20: requests completed; never decreases. Only the template's limit +0x14 reads it, which supported content never sets. */
  spawnCount: number;
  /** Entry +24: the entity of the latest layout cycle's first member (Likely the formation leader), or null before one. */
  leader: EntityId | null;
}

/** Where a queue entry spawns from: a section-1 record (a mission declaration), a group or the wingman option. */
export type SpawnSourceType = 'record' | 'group' | 'wingman';

/** A spawn queue entry (the original's 12-byte {due, index, source}). */
export interface SpawnEntry {
  /** Clock units after creation, a u32: the entry fires on the first tick whose clock exceeds it. */
  readonly due: number;
  readonly source: SpawnSourceType;
  /** A mission declaration, group or wingman option index, by `source`. */
  readonly index: number;
  /** The spawn requests the entry posts when it fires: record +0x10, group +0 or 1 for the wingman; ≤ 0 posts none. */
  readonly requests: number;
}

export interface SpawnState {
  readonly frame: RuntimeFrame;
  /** One per mission declaration, in index order. */
  readonly records: readonly RuntimeRecord[];
  /** The selected wingman option's record, or null without a wingman. */
  readonly wingman: RuntimeRecord | null;
  readonly groups: readonly GroupState[];
  /** Pending entries in firing order: ascending due, insertion order among equal ones (Q-01). */
  readonly queue: SpawnEntry[];
  /** The spawn enable flag `0x17670c`: set at creation; P3-11 clears it when the mission ends. */
  enabled: boolean;
  /** Use counters of the section-0 name pool (`0x176718`), zero at creation. */
  readonly namePoolUses: number[];
}
