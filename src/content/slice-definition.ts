import type { AssetKind } from './asset-id.ts';
import { RESOURCE_GROUPS, type ResourceGroup } from './asset-contract.ts';
import { SLICE_ID, type SliceDefinitionVersion, type SliceId } from './content-identity.ts';

export const SLICE_DEFINITION_VERSION = 1;

export type SliceRole =
  | 'mission'
  | 'player-ship'
  | 'enemy-ship'
  | 'base'
  | 'projectile'
  | 'missile'
  | 'debris'
  | 'front-cockpit'
  | 'hud-mfd'
  | 'font'
  | 'strategic-map'
  | 'fire-sound'
  | 'missile-sound'
  | 'explosion-sound'
  | 'warp-sound';

/**
 * Structural campaign selector from the approved spec selection record.
 * Archive entry IDs for the selected mission belong to original-data source mapping, not here.
 */
export interface SliceCandidate {
  /** Campaign group index; it is also the baseline difficulty group. */
  readonly campaignGroup: number;
  /** Mission slot within the group; slot 1 is the first campaign mission. */
  readonly campaignSlot: number;
}

export interface SliceConfiguration {
  /** Every selectable wingman uses the player model, so this choice does not change the model closure. */
  readonly wingman: 'optional';
}

export interface SliceRoleRequirement {
  readonly role: SliceRole;
  readonly group: ResourceGroup;
  /** Allowed kinds for Assets carrying this role, in `ASSET_KINDS` order. */
  readonly kinds: readonly AssetKind[];
  /** Distinct Assets required for the role. */
  readonly minAssets: number;
  /** Null means no role-specific upper bound; resource budgets still apply. */
  readonly maxAssets: number | null;
}

declare const sliceDefinitionBrand: unique symbol;

export interface SliceDefinition {
  /** Type-only brand: other modules cannot construct a definition without a type assertion. */
  readonly [sliceDefinitionBrand]: 'SliceDefinition';
  readonly sliceId: SliceId;
  readonly version: SliceDefinitionVersion;
  readonly candidate: SliceCandidate;
  readonly configuration: SliceConfiguration;
  /** Every group must be complete before the whole slice is complete. */
  readonly groups: readonly ResourceGroup[];
  /**
   * Kinds each group owns, with their dependency closure. A dependency of a kind its group does not own
   * is a typed cross-group requirement; one of an owned kind must be in the same group.
   */
  readonly groupKinds: Readonly<Record<ResourceGroup, readonly AssetKind[]>>;
  readonly roles: readonly SliceRoleRequirement[];
}

function requirement(
  role: SliceRole,
  group: ResourceGroup,
  kinds: readonly AssetKind[],
  minAssets: number,
  maxAssets: number | null,
): SliceRoleRequirement {
  return Object.freeze({ role, group, kinds: Object.freeze([...kinds]), minAssets, maxAssets });
}

/**
 * The only production slice definition. Changing the candidate, roles, cardinalities or groups
 * is a contract change that requires a spec revision and a new definition version.
 * Projectile, missile and debris allow model or image representations until P2-06 confirms them (U-027);
 * core sounds allow several sample clips until P2-08 confirms their variants (U-004/U-027).
 */
const definition: Omit<SliceDefinition, typeof sliceDefinitionBrand> = {
  sliceId: SLICE_ID,
  version: SLICE_DEFINITION_VERSION as SliceDefinitionVersion,
  candidate: Object.freeze({ campaignGroup: 0, campaignSlot: 1 }),
  configuration: Object.freeze({ wingman: 'optional' }),
  groups: RESOURCE_GROUPS,
  groupKinds: Object.freeze({
    logic: Object.freeze(['mission', 'data'] as const),
    models: Object.freeze(['model', 'image', 'palette'] as const),
    'cockpit-hud-map': Object.freeze(['image', 'palette', 'font', 'layout'] as const),
    audio: Object.freeze(['sound'] as const),
  }),
  roles: Object.freeze([
    requirement('mission', 'logic', ['mission'], 1, 1),
    requirement('player-ship', 'models', ['model'], 1, 1),
    requirement('enemy-ship', 'models', ['model'], 1, 2),
    requirement('base', 'models', ['model'], 1, 1),
    requirement('projectile', 'models', ['model', 'image'], 1, null),
    requirement('missile', 'models', ['model', 'image'], 1, null),
    requirement('debris', 'models', ['model', 'image'], 1, null),
    requirement('front-cockpit', 'cockpit-hud-map', ['layout'], 1, 1),
    requirement('hud-mfd', 'cockpit-hud-map', ['image', 'layout'], 1, null),
    requirement('font', 'cockpit-hud-map', ['font'], 1, null),
    requirement('strategic-map', 'cockpit-hud-map', ['image', 'layout'], 1, null),
    requirement('fire-sound', 'audio', ['sound'], 1, null),
    requirement('missile-sound', 'audio', ['sound'], 1, null),
    requirement('explosion-sound', 'audio', ['sound'], 1, null),
    requirement('warp-sound', 'audio', ['sound'], 1, null),
  ]),
};

export const CLASSIC_P2_SLICE = Object.freeze(definition) as SliceDefinition;
