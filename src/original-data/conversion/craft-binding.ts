import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { CraftSide, CraftTypeEntry, CraftTypeTable } from '../../content/logic/logic-content.ts';
import { readCraftTypeTable } from '../../content/logic/logic-readers.ts';
import { SourceError } from '../source-error.ts';

// The only production binding from craft types to model Asset IDs (P2-09 spec, 机型与模型绑定). P2-06 must name its
// model Assets with this binding instead of keeping a second table.

/**
 * Player-relative classification by craft type bit (docs/original/formats/executable.md, player target modes): the
 * player's own type is 0; every other type with a model is in exactly one of the enemy and friendly masks.
 */
const PLAYER_TYPE = 0;
const ENEMY_MASK = 0x93780;
const FRIENDLY_MASK = 0x206c87e;
/**
 * Kinds admitted by the interaction-menu predicate (executable.md, bounded slot-1 interaction-kind evidence). Their
 * meaning as base interaction is Likely, not Confirmed (U-022).
 */
const BASE_INTERACTION_MASK = 0x68000;

type Category = 'player' | 'enemy' | 'base' | 'friendly';
/** Naming order and names: a model shared by several craft types takes its name from the first category using it. */
const CATEGORIES: readonly { readonly category: Category; readonly name: (ordinal: number) => string }[] = [
  { category: 'player', name: () => 'model/player-ship' },
  { category: 'enemy', name: ordinal => `model/enemy-ship-${ordinal}` },
  { category: 'base', name: ordinal => `model/base-${ordinal}` },
  { category: 'friendly', name: ordinal => `model/friendly-craft-${ordinal}` },
];

export interface ModelBinding {
  readonly id: AssetId;
  /** The MODL entry in `MAIN/SR.NOB` the model Asset is converted from. */
  readonly modelEntryId: number;
}

export interface CraftBinding {
  readonly table: CraftTypeTable;
  /** One per distinct MODL entry, in ascending Asset ID order. */
  readonly models: readonly ModelBinding[];
}

const bit = (craftType: number): number => 2 ** craftType;

function sideOf(craftType: number): CraftSide | null {
  if (craftType === PLAYER_TYPE) return 'player';
  if (ENEMY_MASK & bit(craftType)) return 'enemy';
  return FRIENDLY_MASK & bit(craftType) ? 'friendly' : null;
}

/** Whether craft types of `first` and `other` may share one model: within a category, or a friendly player ship. */
const mayShare = (first: Category, other: Category): boolean => first === other || (first === 'player' && other === 'friendly');

/**
 * Binds the craft types the mission and the wingman roster reference to model Asset IDs through the M2ID list
 * `modelIds`. Failures name the M2ID slot under `location`, the list's `archive:/PATH#ID` location.
 */
export function bindCraftTypes(referenced: Iterable<number>, modelIds: readonly number[], location: string): CraftBinding {
  const types = [...new Set(referenced)].sort((left, right) => left - right);
  const at = (craftType: number) => `${location}/ids[${craftType}]`;
  if (!types.includes(PLAYER_TYPE)) throw new SourceError('invalid-payload', at(PLAYER_TYPE), 'the player craft type is not referenced');
  const craft = types.map(craftType => {
    const modelEntryId = modelIds[craftType];
    if (modelEntryId === undefined || modelEntryId === 0) throw new SourceError('invalid-payload', at(craftType), 'the craft type has no model');
    const side = sideOf(craftType);
    if (side === null) throw new SourceError('unsupported-payload', at(craftType), 'the craft type has no player-relative side');
    const baseInteraction = (BASE_INTERACTION_MASK & bit(craftType)) !== 0;
    const category: Category = side === 'player' ? 'player' : side === 'enemy' ? 'enemy' : baseInteraction ? 'base' : 'friendly';
    return { craftType, side, baseInteraction, modelEntryId, category };
  });

  const named = new Map<number, { readonly id: AssetId; readonly category: Category }>();
  for (const { category, name } of CATEGORIES) {
    let ordinal = 0;
    for (const { craftType, modelEntryId, category: own } of craft) {
      if (own !== category) continue;
      const existing = named.get(modelEntryId);
      if (existing) {
        if (!mayShare(existing.category, category)) throw new SourceError('invalid-payload', at(craftType), 'the model is bound to another model ID');
        continue;
      }
      named.set(modelEntryId, { id: readAssetId(name(++ordinal)), category });
    }
  }

  const entries = craft.map(({ craftType, side, baseInteraction, modelEntryId }): CraftTypeEntry => ({
    craftType, side, baseInteraction, model: { id: named.get(modelEntryId)!.id, kind: 'model' },
  }));
  const models = [...named].map(([modelEntryId, { id }]) => Object.freeze({ id, modelEntryId }))
    .sort((left, right) => compareText(left.id, right.id));
  return Object.freeze({ table: readCraftTypeTable({ entries }), models: Object.freeze(models) });
}
