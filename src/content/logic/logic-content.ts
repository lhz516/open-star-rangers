import type { AssetReference } from '../asset-contract.ts';
import type { AssetId } from '../asset-id.ts';

// Canonical logic content of the `logic` group (P2-09 spec, 规范逻辑数据). Field order here is the canonical encoding
// order. Raw rule inputs keep their source values; their semantics and the rules that use them belong to P3.

/** Schema version of every logic payload; an incompatible shape change increments it and the converter version. */
export const LOGIC_PAYLOAD_SCHEMA_VERSION = 1;

/** Structural limits a logic payload must satisfy; payload bytes is the `logic` group's budget limit. */
export const LOGIC_LIMITS = Object.freeze({
  payloadBytes: 1_048_576,
  /** Declarations after merging aliases; those with origin `object` are section-1 records, at most `objects`. */
  declarations: 256,
  objects: 64,
  nameCandidates: 32,
  nameLength: 63,
  namePool: 64,
  spawnRegions: 64,
  groups: 64,
  groupMembers: 64,
  layoutElements: 256,
  wingmanOptions: 16,
});

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type MapAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** The world region the strategic main map shows, as an axis-aligned square in mission reference units. */
export interface StrategicMapFrame {
  readonly rightAxis: MapAxis;
  readonly upAxis: MapAxis;
  readonly center: { readonly right: number; readonly up: number };
  readonly halfExtent: number;
}

export interface MissionCoordinates {
  readonly unit: 'scen-reference';
  readonly referenceScale: number;
  /** Group layout offsets keep the original runtime unit; the original loader does not rescale them. */
  readonly layoutUnit: 'scen-runtime';
}

/** A section-3 spawn rectangle in reference units, kept as stored. */
export interface SpawnRegion {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export type DeclarationOrigin = 'object' | 'group-template' | 'group-member' | 'wingman-option';

/** Source values kept as read: null for a source 0; the names do not claim confirmed semantics. */
export interface RuleInputs {
  /** u32 */
  readonly percentA: number | null;
  /** u32 */
  readonly craftCount: number | null;
  /** i32 */
  readonly percentB: number | null;
  /** i32 */
  readonly percentC: number | null;
  /** i32 */
  readonly percentD: number | null;
  /** i32 */
  readonly aiValueA: number | null;
  /** i32 */
  readonly aiValueB: number | null;
  /** i32 */
  readonly aiValueC: number | null;
}

/** One source record, declared once however many structures reference it. */
export interface MissionDeclaration {
  readonly index: number;
  /** Nonempty, in `DeclarationOrigin` order, without duplicates. */
  readonly origins: readonly DeclarationOrigin[];
  /** Bit position of the single-bit kind, 0–31, or null for kind 0. */
  readonly craftType: number | null;
  readonly nameCandidates: readonly string[];
  readonly position: Vector3;
  /** u32 in source units. */
  readonly spawnTime: number;
  /** i32 in reference units. */
  readonly gridSpacing: number;
  /** `region` indexes `spawnRegions`; `anchor` is a declaration index. */
  readonly placement: { readonly region: number | null; readonly anchor: number | null };
  /** Index of the group whose members include this declaration. */
  readonly memberOf: number | null;
  /** Declaration index of the AI target record. */
  readonly aiTarget: number | null;
  readonly ruleInputs: RuleInputs;
  /** Ascending unique craft types 0–31. */
  readonly aiTargetCraftTypes: readonly number[];
}

export interface MissionGroup {
  /** Declaration index. */
  readonly template: number;
  /** Declaration indexes in member-array order; repeats are kept. */
  readonly members: readonly number[];
  /** u32 kept as stored. */
  readonly spawnCount: number;
  /** Runtime-unit offsets with the original load transform applied; at least one. */
  readonly layout: readonly Vector3[];
}

export interface MissionContent {
  readonly campaign: { readonly group: number; readonly slot: number };
  readonly coordinates: MissionCoordinates;
  readonly references: { readonly craftTypes: AssetId; readonly wingmanRoster: AssetId };
  readonly mapFrame: StrategicMapFrame;
  /** The mission's fallback name pool, in source order. */
  readonly namePool: readonly string[];
  readonly spawnRegions: readonly SpawnRegion[];
  readonly declarations: readonly MissionDeclaration[];
  readonly groups: readonly MissionGroup[];
}

export type CraftSide = 'player' | 'friendly' | 'enemy';

export interface CraftTypeEntry {
  readonly craftType: number;
  readonly side: CraftSide;
  /** Whether the kind belongs to the interaction category; its meaning as base interaction is Likely (U-022). */
  readonly baseInteraction: boolean;
  readonly model: AssetReference;
}

export interface CraftTypeTable {
  /** Ascending unique craft types; exactly one has side `player`. */
  readonly entries: readonly CraftTypeEntry[];
}

export interface WingmanRoster {
  readonly references: { readonly craftTypes: AssetId };
  /** Origins are exactly `wingman-option`; placement, membership and AI target are null. */
  readonly options: readonly MissionDeclaration[];
}

/** A logic payload with the descriptor role that selects its shape. */
export type LogicPayload =
  | { readonly role: 'mission'; readonly content: MissionContent }
  | { readonly role: 'craft-types'; readonly content: CraftTypeTable }
  | { readonly role: 'wingman-roster'; readonly content: WingmanRoster };

export type LogicRole = LogicPayload['role'];
