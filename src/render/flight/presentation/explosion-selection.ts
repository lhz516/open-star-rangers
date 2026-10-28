/**
 * The presentation module's content checks, the run's EXPL subset and the one choice per explosion
 * (docs/plan/p3/12/spec.md, 内容输入与校验 and 表现层效果与会话级选择者; docs/original/formats/executable.md, X4, X8).
 *
 * The subset (X8): before the first tick, for each non-empty list k, start := rand % countₖ and the subset keeps the
 * original indices (start + j) mod countₖ for j = 0…4 (0…2 for list 3), repeats included, one draw per list in list
 * order. The choice (X4), once at activation: `large` takes list 1, `missile` list 3, and `other` list 2 when the
 * squared distance (`0x56b50`) from the camera before the step to the explosion is at least 160000 (400²), else list 1;
 * the item is subset[rand % subset length]. An empty list 3 is drawn from nothing: Core accepts it only when no craft
 * the run can instantiate mounts a missile (CR-01), so a missile explosion with it is a contract violation.
 */
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { AssetId } from '../../../content/asset-id.ts';
import type { ExplosionAnimation, ExplosionTable, NebulaBackgrounds } from '../../../content/flight/flight-data-content.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import { RAND_MAX, type RandSource } from '../../../core/rules/original-random.ts';
import { squaredDistance } from '../../../core/rules/speed-match.ts';
import type { ExplosionVariant } from '../../../core/world/entity-table.ts';
import { PresentationError } from './presentation-budget.ts';
import type { ExplosionSelection } from './presentation-contract.ts';

/** The run's decoded flight content, read by the canonical payload readers. */
export interface PresentationContent {
  readonly explosions: ExplosionTable;
  /** Every animation the explosion table names, by Asset ID. */
  readonly animations: ReadonlyMap<AssetId, ExplosionAnimation>;
  readonly nebula: NebulaBackgrounds;
}

/** The original indices of each list the run draws from; an empty list stays empty. */
export type ExplosionSubset = readonly [readonly number[], readonly number[], readonly number[]];

/** Entries `0x23520` keeps of lists 1, 2 and 3. */
export const EXPLOSION_SUBSET_SIZES = Object.freeze([5, 5, 3] as const);

/** 400² as the f32 constant the choice compares with (X4). */
export const FAR_EXPLOSION_SQUARED_DISTANCE = 160_000;

const CONTENT = 'presentation.content';

const reject = (path: string, reason: string): never => {
  throw new ContentContractError('invalid-record', `${CONTENT}.${path}`, reason);
};

/**
 * Rejects, before the run starts, content the presentation cannot use: an empty list 1 or 2, an entry whose animation
 * is missing or has no frame, frame counts that differ within lists 1 and 2 together or within list 3 (Core's CR-01
 * condition), and an empty nebula list.
 */
export function checkPresentationContent({ explosions, animations, nebula }: PresentationContent): void {
  explosions.lists.forEach((list, at) => {
    if (at < 2 && list.length === 0) reject(`explosions.lists[${at}]`, 'must not be empty');
  });
  const counts = explosions.lists.map((list, at) => list.map(({ animation }, entry) => {
    const frames = animations.get(animation.id)?.frames.length ?? reject(`explosions.lists[${at}][${entry}].animation`, 'names an animation the content lacks');
    if (frames === 0) reject(`explosions.lists[${at}][${entry}].animation`, 'names an animation without frames');
    return frames;
  }));
  for (const group of [[0, 1], [2]]) {
    const first = counts[group[0]][0];
    for (const at of group) {
      const entry = counts[at].findIndex((count) => count !== first);
      if (entry >= 0) reject(`explosions.lists[${at}][${entry}].animation`, 'must have as many frames as every other animation of its list group');
    }
  }
  if (nebula.images.length === 0) reject('nebula.images', 'must not be empty');
}

/** One rand value, checked to be the original's 0–32767. */
function drawRand(random: RandSource): number {
  const value = random.next();
  if (!Number.isInteger(value) || value < 0 || value > RAND_MAX) throw new PresentationError('invariant-violated', 'presentation.random', 'must give integers from 0 to 32767');
  return value;
}

/** The run's EXPL subset (X8), drawn once before the first tick. */
export function drawExplosionSubset({ lists }: ExplosionTable, random: RandSource): ExplosionSubset {
  const subset = lists.map((list, at) => {
    if (list.length === 0) return Object.freeze([]);
    const start = drawRand(random) % list.length;
    return Object.freeze(Array.from({ length: EXPLOSION_SUBSET_SIZES[at] }, (_, step) => (start + step) % list.length));
  });
  return Object.freeze(subset) as unknown as ExplosionSubset;
}

/** The single choice of an explosion of `variant` activating at `position`, seen from `camera` (X4). */
export function selectExplosion(subset: ExplosionSubset, variant: ExplosionVariant, position: Vec3, camera: Vec3, random: RandSource): ExplosionSelection {
  let list: 1 | 2 | 3;
  if (variant === 'missile') list = 3;
  else if (variant === 'other' && squaredDistance(camera, position) >= FAR_EXPLOSION_SQUARED_DISTANCE) list = 2;
  else list = 1;
  const items = subset[list - 1];
  if (items.length === 0) throw new PresentationError('invariant-violated', 'presentation.selection', `has no list ${list} to draw a ${variant} explosion from`);
  return Object.freeze({ list, item: items[drawRand(random) % items.length] });
}
