/**
 * The run's six nebula backgrounds (docs/plan/p3/12/spec.md, 星云背景, 技术决定 8; docs/original/formats/
 * executable.md, NB1; AC-09). Slot i shows item (start + i) mod n of the checked `NebulaBackgrounds.images` list, n its
 * length, wrapping and keeping repeats; an empty list is rejected. The start is drawn uniformly from 0…n − 1 with the
 * run's presentation random source, replacing the original's clock sample mod n: a project choice for run isolation
 * and testability, not a claim that the original's start is uniform. The list's length is the content's, never a
 * constant here.
 */
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { AssetReference } from '../../../content/asset-contract.ts';
import type { NebulaBackgrounds } from '../../../content/flight/flight-data-content.ts';
import { RAND_MAX, type RandSource } from '../../../core/rules/original-random.ts';
import { PresentationError } from '../presentation/presentation-budget.ts';

/** The original's six nebula slots (NB1). */
export const NEBULA_SLOT_COUNT = 6;

const RAND_VALUES = RAND_MAX + 1;

/**
 * A uniform start in 0…count − 1: rand values from the largest multiple of `count` up are drawn again, so every start
 * has the same number of accepted values.
 */
function drawStart(count: number, random: RandSource): number {
  const accepted = RAND_VALUES - (RAND_VALUES % count);
  for (;;) {
    const value = random.next();
    if (!Number.isInteger(value) || value < 0 || value > RAND_MAX) throw new PresentationError('invariant-violated', 'nebula.random', 'must give integers from 0 to 32767');
    if (value < accepted) return value % count;
  }
}

/** The images of slots 0–5 in slot order, drawn once at the run's start. */
export function selectNebulaImages({ images }: NebulaBackgrounds, random: RandSource): readonly AssetReference[] {
  if (images.length === 0) throw new ContentContractError('invalid-record', 'content.nebula.images', 'must not be empty');
  const start = drawStart(images.length, random);
  return Object.freeze(Array.from({ length: NEBULA_SLOT_COUNT }, (_, slot) => images[(start + slot) % images.length]));
}
