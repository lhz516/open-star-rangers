/**
 * Explosions (kind bit 22; docs/plan/p3/02/spec.md, CR-02, CR-03, CR-04, CR-07, CR-08 and CR-11;
 * docs/original/formats/executable.md, X2, X4, X9 and X11): what the constructor `0x23ac8` makes of a source, the
 * player's delay, and the activation and update of `0x2409c`. destruction.ts allocates, produces the fragments and
 * handles the requests.
 *
 * Core keeps only the rule lifecycle. The EXPL choice at activation (one draw), the extra explosions of `0x23fdc` and
 * their draws, the events 0x10 with the discriminator-1/2 fragments, and the flash read the display camera and belong
 * to the presentation layer (CR-11): with the load check that every entry of lists 1 and 2 has n₁₂ frames and every
 * entry of list 3 n₃ (CR-01), no choice changes when the source is released or the explosion removed.
 */
import { CoreFaultError } from '../errors.ts';
import {
  EXPLOSION_KIND_BIT, MISSILE_KIND_BIT,
  type Entity, type EntityInit, type ExplosionCombat, type ExplosionVariant,
} from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import { runtimeKindDefaults } from './combat-init.ts';
import { isLargeKind } from './fragments.ts';
import { linearBlock, linearItem } from './movement-builders.ts';

/** The player's explosion follows its destruction by more than 0xC0 clock units (X2). */
const PLAYER_EXPLOSION_DELAY = 0xc0;
/** An explosion asks for its removal once the clock is past its activation + 0x60 (+0x10C). */
const REMOVAL_DELAY = 0x60;
/** The frame index is (14 × (clock − t₀)) SHR 6: 14 frames per 64 clock units. */
const FRAMES_PER_SECOND = 14;
const FRAME_SHIFT = 6;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `explosions.${site}`);

function later(clock: number, delay: number, site: string): number {
  const due = clock + delay;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', `explosions.${site}`);
  return due;
}

/**
 * The delay `0x23ac8` arms for kind 1 (the player, X2) when its due clock is unset: the clock + 0xC0. The constructor
 * builds nothing then, nor while the due clock is after the clock; once it is not, it clears it and builds.
 */
export const playerExplosionDue = (clock: number): number => later(clock, PLAYER_EXPLOSION_DELAY, 'delay');

/** Byte mb +0xF0: `missile` (3) for a missile source, `large` (0) for large kinds, `other` (2) otherwise. */
export function explosionVariant(sourceKindBit: number): ExplosionVariant {
  if (sourceKindBit === MISSILE_KIND_BIT) return 'missile';
  return isLargeKind(sourceKindBit) ? 'large' : 'other';
}

/**
 * The explosion `0x23ac8` allocates for `source`: its identity and kind, the variant, nothing held yet, not activated;
 * placed by the item of `0x218e8` for mode 1 (the source's pose, a `spinning` source's frame completed) in a `linear`
 * block without the hit test, so it drifts at the source's speed along the item's row 3.
 */
export function explosionInit(source: Entity): EntityInit {
  if (source.movement === null) throw fault('source');
  const item = linearItem(source.position, source.orientation, source.movement);
  const variant = explosionVariant(source.kindBit);
  return {
    kindBit: EXPLOSION_KIND_BIT,
    ...runtimeKindDefaults(),
    presentation: { type: 'explosion', variant },
    position: item.position,
    orientation: item.orientation,
    maximumSpeed: 0,
    movement: linearBlock(item, false),
    combat: { type: 'explosion', source: source.id, sourceKindBit: source.kindBit, variant, heldSource: null, activationClock: null, removalAfterClock: null },
  };
}

/** The activation of `0x2409c` at `clock`: t₀ and the removal time t₀ + 0x60. */
export function activateExplosion(explosion: ExplosionCombat, clock: number): void {
  explosion.activationClock = clock;
  explosion.removalAfterClock = later(clock, REMOVAL_DELAY, 'removal');
}

/**
 * The frame index at `clock`: the low 32 bits of 14 × (clock − t₀), shifted right by 6 as unsigned (`IMUL`, `SHR`). The
 * original compares it with the frame count as signed, which a shifted u32 never makes negative.
 */
export const explosionFrame = (clock: number, activationClock: number): number => Math.imul(FRAMES_PER_SECOND, clock - activationClock) >>> FRAME_SHIFT;

/** The frame count n of an explosion's animations: n₃ for `missile`, n₁₂ otherwise (CR-01). */
export function explosionFrameCount({ lists12, list3 }: WorldRuleData['explosionFrames'], variant: ExplosionVariant): number {
  if (variant !== 'missile') return lists12;
  if (list3 === null) throw fault('frames');
  return list3;
}

/**
 * The update of `0x2409c` at `clock` for an activated explosion with `frames` frames: `remove` once its animation is over
 * and the clock is past the removal time (it goes to pending removal); otherwise it stays active, and `over` says
 * whether the animation is over, which releases a held source.
 */
export function explosionUpdate(explosion: ExplosionCombat, clock: number, frames: number): 'remove' | 'over' | 'running' {
  const { activationClock, removalAfterClock } = explosion;
  if (activationClock === null || removalAfterClock === null) throw fault('activation');
  if (explosionFrame(clock, activationClock) < frames) return 'running';
  return removalAfterClock < clock ? 'remove' : 'over';
}
