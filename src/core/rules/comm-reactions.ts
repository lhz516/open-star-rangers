/**
 * Pure rules of the communications reactions and wingman reports (docs/plan/p3/02/spec.md, CB-03, CB-05, CB-09 and
 * CB-12; docs/plan/p3/10/spec.md, D-03 item 5 and D-01 revisions ③ and ⑦; docs/original/formats/executable.md,
 * RX1–RX9). The systems that apply them to a world are systems/comm-reactions.ts's.
 *
 * - **Attacker kind:** a valid shooter's kind (1 << kind bit), the class mask `0x93780` for a lost shooter, 0 for none.
 * - **Limits (RX8):** a stamp suppresses a report while stamp + L ≥ sample; a global limit passes once the sample is
 *   past it (contracts/time.ts's isDue). Core compares the clocks as numbers, the original as wrapping u32: they differ
 *   only after 2³² units.
 * - **Name indexes (RX1):** a friendly's position in COMM TABL 2001, else in 2011, offset by the reaction.
 * - **Distances (RX8):** `0x56b50`'s squared distance; 3500² as the f32 12,250,000, strictly below.
 * - **Draws (RX9):** the second message of a friendly under attack, rand % 4. The wingman's lines draw in
 *   systems/radio.ts's `queueLine`, the faces in its `speakerFace`.
 */
import type { Attacker } from '../contracts/domain-events.ts';
import { isDue } from '../contracts/time.ts';
import type { NameIndex } from '../world/comm-input.ts';
import type { Matrix3 } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';
import { hasKind } from './radio.ts';
import { toInt32 } from './record-defaults.ts';
import { ENEMY_KINDS } from './targeting.ts';

/** The hostile set `0x93780` (targeting.ts's enemy set): a lost shooter's attacker kind, and the kinds reports are about. */
export const HOSTILE_KINDS = ENEMY_KINDS;
/**
 * Kinds `0x6807c`: craft `0x7c` and bases `0x68000`. The original tests `0x6807c` for the player's hit and the thanks,
 * and `0x6887c` other than `0x800` for an attack or a loss: the same kinds.
 */
export const FRIENDLY_RESPONDER_KINDS = 0x6807c;
/** Kinds `0x6807e`: those and the wingman, whose destruction by the player has its own message. */
export const PLAYER_KILL_KINDS = 0x6807e;
/** Attacker kinds that are not an enemy's: `0x6c87f`, the player's, the wingman's and the friendlies'. */
const NON_ENEMY_ATTACKER_KINDS = 0x6c87f;
/** Bases `0x68000`. */
export const BASE_KINDS = 0x68000;

export const PLAYER_ATTACKER_KIND = 1;
export const WINGMAN_ATTACKER_KIND = 2;

/** The wingman's line types (`0x38d54`): low hull, a kill, an enemy appears, an enemy on the player's tail. */
export const LINE_LOW_HULL = 0x13;
export const LINE_KILL = 7;
export const LINE_ENEMY_APPEARS = 8;
export const LINE_TAIL = 0xa;

/** Periods in clock units (RX2, RX3, RX5, RX6, RQ1). */
export const PERIODS = Object.freeze({
  friendlyFireWindow: 0x780,
  wingmanLowHull: 0x5a00,
  friendlyHit: 0xf00,
  threat: 0x2d00,
  friendlyKill: 0x3c0,
  enemyAppears: 0x280,
  tailWarning: 0x640,
  threatRecheck: 0xb40,
});

/** The tail check's cadence `0x175f34`: sooner while either warning is lit (CB-09). */
export const TAIL_CHECK_LIT = 0x40;
export const TAIL_CHECK_DARK = 0x80;

/** The kinds the attacker test `0x4ef9c` walks, bits 7–10. */
export const TAIL_ATTACKER_KINDS = 0x780;

/** 3500², the f32 constants `0x171454` and `0x171458`. */
const WINGMAN_RANGE_SQUARED = 12_250_000;
/** The f64 constant 0.707 of the tail test (`0x17144c`). */
const TAIL_ALIGNMENT = 0.707;

/** The attacker kind the damage entry passes (D2): the shooter's kind, `0x93780` for a lost shooter, 0 for none. */
export function attackerKind(attacker: Attacker): number {
  switch (attacker.type) {
    case 'shooter':
      return 2 ** attacker.kindBit;
    case 'lost-shooter':
      return HOSTILE_KINDS;
    case 'none':
      return 0;
  }
}

/** A friendly of `0x6807c` (FRIENDLY_RESPONDER_KINDS). */
export const isFriendly = (kindBit: number): boolean => hasKind(FRIENDLY_RESPONDER_KINDS, kindBit);

/** An enemy's attacker kind, or the mask of a lost shooter or a re-announce: non-zero and none of `0x6c87f`. */
export const isEnemyAttacker = (kind: number): boolean => kind !== 0 && (kind & NON_ENEMY_ATTACKER_KINDS) === 0;

/** A stamp (null: never stamped) suppresses its report while stamp + period ≥ sample (RX8). */
export const isSuppressed = (stamp: number | null, period: number, sample: number): boolean => stamp !== null && !isDue(sample, stamp + period);

/** `0x38f20`'s low-hull test: trunc(capacity × 30 ÷ 100) > hull, in i32 with a signed division. */
export const isLowHull = (capacity: number, hull: number): boolean => Math.trunc(toInt32(capacity * 30) / 100) > hull;

/**
 * `0x38f20` for the player's hit on the wingman: the window restarts at 0 once the sample is past its end, then the
 * raw damage adds as i32.
 */
export function accumulateFriendlyFire(friendlyFire: { accumulated: number; windowEnd: number }, sample: number, damage: number): void {
  if (friendlyFire.windowEnd < sample) {
    friendlyFire.accumulated = 0;
    friendlyFire.windowEnd = sample + PERIODS.friendlyFireWindow;
  }
  friendlyFire.accumulated = toInt32(friendlyFire.accumulated + damage);
}

/** A name's index in 2001 plus `in2001`, else in 2011 plus `in2011`; null in neither (RX1). */
function offsetIndex({ in2001, in2011 }: NameIndex, offsets: { readonly in2001: number; readonly in2011: number }): number | null {
  if (in2001 !== null) return in2001 + offsets.in2001;
  return in2011 === null ? null : in2011 + offsets.in2011;
}

/** 20983's first message for a friendly other than an active craft under attack (`0x3c208` step 3). */
export const underAttackIndex = (name: NameIndex): number | null => offsetIndex(name, { in2001: 0x1a, in2011: 7 });
/** 20983's message for a friendly destroyed (`0x3c0f4` step 5). */
export const destroyedIndex = (name: NameIndex): number | null => offsetIndex(name, { in2001: 0x41, in2011: 0x2e });
/** The wingman's line type for a friendly lost near it (`0x38e4c`): a 20985 index that draws nothing. */
export const lostNearWingmanLine = (name: NameIndex): number | null => offsetIndex(name, { in2001: 0x29, in2011: 0x16 });
/** 20019's index for an active craft under attack: its 2011 position + 3, null outside 2011. */
export const craftUnderAttackIndex = ({ in2011 }: NameIndex): number | null => (in2011 === null ? null : in2011 + 3);

/** The second message of a friendly under attack: 20983 index rand % 4, one draw. */
export const secondUnderAttackIndex = (rand: RandSource): number => rand.next() % 4;

/** `0x38cd4` and `0x38e4c`'s range: a squared distance strictly below 3500². */
export const isWithinWingmanRange = (squaredDistance: number): boolean => squaredDistance < WINGMAN_RANGE_SQUARED;

/**
 * `0x38c30`'s alignment: the dot product of the two third rows, summed y, z, then x in double precision, strictly
 * above 0.707 (RX8).
 */
export function isOnTail(player: Matrix3, enemy: Matrix3): boolean {
  return player[7] * enemy[7] + player[8] * enemy[8] + player[6] * enemy[6] > TAIL_ALIGNMENT;
}
