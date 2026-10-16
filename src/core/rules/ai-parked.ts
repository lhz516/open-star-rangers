/**
 * The parked AI handler `0x62250` (docs/plan/p3/08/spec.md, 停放、对象集合与离场, S-11, AC-09; docs/plan/p3/02/spec.md,
 * CR-16 to CR-18, CR-23, CR-29; docs/original/formats/executable.md, D1–D6): the controller a parked AI object gets
 * instead of its record's handler, in its object update (systems/ai.ts). It has no private state; its modes 0 and 2 only
 * set the deadline, and its mode 1 decides by kind and writes the AI mode +0xC4, the AI target +0x90, the object target
 * +0x8C, the target offset and the goal, which stage 13's parked update (P3-06's travel, P3-07's engagement) reads later
 * in the same tick. It posts no request but the leave order's departure (which a parked subject never passes, D6), and
 * the wingman's Xpon drop `0x62aa0` constructs directly in the walk.
 *
 * The target search `0x62578` and its candidate choice `0x62760` read the object sets and the map visibility flags of
 * the last `object-sets` stage (P3-09's MW-06, WorldState.objectSets and Entity.mapVisible; CR-29), never the current
 * entity table: a craft created after that rebuild, the wingman's Xpon included, is not a member yet. The wingman's step
 * first calls P3-09's reveal `0x2ee60` (map-visibility.ts), whose flags only its own search reads before the next
 * rebuild resets them. Members are always valid when the AI reads them (D5); the validity tests are kept as the
 * original's defensive ones.
 *
 * Clock sums are plain (Core's clock never wraps, P3-02). f32 values are `Math.fround` stores.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { ZERO_VECTOR, type AiControllerCommon, type AiController, type Entity, type EntityId } from '../world/entity-table.ts';
import type { RuntimeRecord } from '../world/spawn-state.ts';
import type { WorldState } from '../world/world-state.ts';
import type { CraftEntity } from './combat-init.ts';
import { worldHalfExtent } from './coordinates.ts';
import { aiCandidates, RANDOM_TARGET_DISTANCE_SQUARED } from './initial-ai.ts';
import { revealMapVisibility } from './map-visibility.ts';
import type { RandSource } from './original-random.ts';
import { hasKind } from './radio.ts';
import { WINGMAN_KIND_BIT } from './spawn-schedule.ts';
import { ENEMY_KINDS as HOSTILE_KINDS } from './targeting.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-parked.${site}`);

/** `clock + duration` as a clock; a sum Core cannot represent is a budget fault (P3-02). */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due) || due < 0) throw new CoreFaultError('budget-exhausted', 'ai-parked.clock');
  return due;
}

/** A parked controller: the common part only (CR-17: no private state, C+0x168 stays 0). */
export type ParkedController = Extract<AiController, { readonly handler: 'parked' }>;

/** One call of the parked handler on its subject in the object update. */
export interface ParkedCall {
  readonly world: WorldState;
  readonly subject: CraftEntity;
  /** The call's draws, from the world's RNG, which dropTransponder continues. */
  readonly rand: RandSource;
  /** `0x5e6cc`(C), the departure the leave order asks for; whether it was posted (never for a parked subject, D6). */
  depart(): boolean;
  /** `0x38780` for the wingman's drop (D4): a parked Xpon at the subject, created in the walk (systems/xpon.ts). */
  dropTransponder(): void;
  /**
   * `0x61f20`, the parked command consumer (WB4, P3-08/20): whether a command changed the state (r = 1). Without one a
   * pending command stays in its slot and r is 0.
   */
  readonly consumeCommand?: (call: ParkedCall) => boolean;
}

/** Every mode sets the deadline to the sample + 0x40 at entry. */
const ENTRY_DELAY = 0x40;
/** Mode 1 ends with C+0xF0 += rand % 64. */
const FINAL_DRAW_MODULUS = 64;
/** The deadlines `0x62578` and `0x62714` write, and the one of the base kinds' mode-1 branch. */
const FOUND_DELAY = 0x280;
const WINGMAN_RETRY_DELAY = 0xc0;
const RETRY_DELAY = 0x3c0;
const BASE_DELAY = 0xf00;

/** The friendly side `0x6c87f`, and the other searchers' mask `0x887c`. */
const FRIENDLY_SIDE_KINDS = 0x6c87f;
const MIXED_KINDS = 0x887c;
/** Kinds 1, 2 and 0x4000: a set holding nothing else lets a hostile searcher take the shortcut. */
const SHORTCUT_IGNORED_KINDS = 0x4003;
/** Kinds 4–0x40: their searches never take a candidate beyond their own range. */
const RANGED_KINDS = 0x7c;
/** Kinds 0x2000 and 0x4000: the random pick passes over them. */
const NEVER_PICKED_KINDS = 0x6000;
/** Kinds `0x6c000` whose own range covers the wingman against a further Xpon drop. */
const COVERING_KINDS = 0x6c000;
const KIND_2000_BIT = 13;
const TRANSPONDER_BIT = 14;
/** Draw modulus of the preferred-kinds test, rand % 100 ≤ +0xE4. */
const PREFERRED_DRAW_MODULUS = 100;
/** The leave order's goal lies 1000 beyond the world edge (f64 `0x172398` and `0x1723a0`). */
const LEAVE_EDGE_MARGIN = 1000;

/** Modes 0 and 2 of `0x62250` (D1): the deadline sample + 0x40, no draw; mode 0 makes the controller. */
export function installParked(common: AiControllerCommon, clock: number): ParkedController {
  return { ...common, handler: 'parked', nextUpdateClock: clockAfter(clock, ENTRY_DELAY) };
}

const resolve = ({ world }: ParkedCall, id: EntityId | null): Entity | undefined => (id === null ? undefined : world.entities.get(id));

/** The craft record +0x0C of `entity`'s kind, which world creation binds for every instantiable kind. */
function rangeOf(world: WorldState, entity: Entity): number {
  const range = world.craftInfo.content.craft[entity.kindBit]?.at0C;
  if (range === undefined) throw fault('record');
  return range;
}

/** The subject's source record +0x190: its mission declaration's or the wingman option's, null without a source. */
function sourceRecord(world: WorldState, { source }: Entity): RuntimeRecord | null {
  if (source === null) return null;
  return source.collection === 'mission' ? world.spawn.records[source.index] : world.spawn.wingman;
}

/** The double sum D(D(D(δy·F(δy)) + D(δz·F(δz))) + D(δx·F(δx))) with δ = D(to − from). */
function squaredDistance(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return dy * Math.fround(dy) + dz * Math.fround(dz) + dx * Math.fround(dx);
}

/** The mask and record filter `0x62760` searches with (D3). */
interface CandidateFilter {
  readonly mask: number;
  readonly declaration: number | null;
}

const matchesRecord = ({ source }: Entity, declaration: number | null): boolean =>
  declaration === null || (source?.collection === 'mission' && source.index === declaration);

/**
 * `0x62760`(O, set, mask, p) (D3): the preferred kinds `0x68018` of O's source record, when it names some, take one draw
 * rand % 100, and replace `mask` (with their record filter) when it is ≤ O +0xE4 and an entity of them exists. Then the
 * nearest valid member of `set` (in set order; a kind-2 searcher only among map-visible ones) by its f32 squared
 * distance, from the sentinel −1.0 and replaced only by a strictly smaller score; a candidate beyond O's own range is not
 * taken when O's kind is 4–0x40, it is an Xpon and O hostile, or it is kind 0x2000 and O the wingman. With p = 2 a best
 * beyond the range of a valid AI target is discarded. Otherwise, with qualifying members and a best farther than three
 * sectors, one draw rand % n picks the (k+1)-th member that also is not of kinds 0x2000 and 0x4000, the last one when
 * fewer qualify, none when none does. Returns the chosen member or null.
 */
export function chooseCandidate(call: ParkedCall, set: readonly EntityId[], mask: number, p: number): EntityId | null {
  const { world, subject, rand } = call;
  let filter: CandidateFilter = { mask, declaration: null };
  const record = sourceRecord(world, subject);
  const preferred = record === null ? null : aiCandidates(record, world.spawn, world.setup);
  if (preferred !== null && preferred.mask !== 0 && rand.next() % PREFERRED_DRAW_MODULUS <= subject.ruleInputs.aiValueC) {
    for (const entity of world.entities.walk(preferred.mask)) {
      if (!matchesRecord(entity, preferred.declaration)) continue;
      filter = preferred;
      break;
    }
  }
  const qualifies = (member: Entity | undefined): member is Entity =>
    member !== undefined && hasKind(filter.mask, member.kindBit) && matchesRecord(member, filter.declaration)
    && (subject.kindBit !== WINGMAN_KIND_BIT || member.mapVisible);
  const ownRange = rangeOf(world, subject);
  const ownRangeSquared = Math.fround(ownRange * ownRange);
  const keepsWithinRange = (member: Entity): boolean => hasKind(RANGED_KINDS, subject.kindBit)
    || (member.kindBit === TRANSPONDER_BIT && hasKind(HOSTILE_KINDS, subject.kindBit))
    || (member.kindBit === KIND_2000_BIT && subject.kindBit === WINGMAN_KIND_BIT);
  let count = 0;
  let best: Entity | null = null;
  let bestScore = -1;
  for (const id of set) {
    const member = resolve(call, id);
    if (!qualifies(member)) continue;
    count++;
    const score = Math.fround(squaredDistance(subject.position, member.position));
    if (!(bestScore < 0 || score < bestScore)) continue;
    if (score > ownRangeSquared && keepsWithinRange(member)) continue;
    best = member;
    bestScore = score;
  }
  if (p === 2) {
    const aiTarget = resolve(call, subject.ai.target);
    if (best !== null && aiTarget !== undefined) {
      const range = rangeOf(world, aiTarget);
      if (bestScore > Math.fround(range * range)) best = null;
    }
    return best?.id ?? null;
  }
  // A best is a counted member, so the count is positive.
  if (best !== null && bestScore > RANDOM_TARGET_DISTANCE_SQUARED) {
    const k = rand.next() % count;
    let picked: Entity | null = null;
    let seen = 0;
    for (const id of set) {
      const member = resolve(call, id);
      if (!qualifies(member) || hasKind(NEVER_PICKED_KINDS, member.kindBit)) continue;
      picked = member;
      if (seen++ === k) break;
    }
    return picked?.id ?? null;
  }
  return best?.id ?? null;
}

/** `0x62714`(C, p): no target, mode 2 (p 2 or 4, the object target) or 5 (the AI target); the deadline sample + 0x3C0. */
/** Whether a search with `p` writes the object target +0x8C (p 2 or 4) rather than the AI target +0x90. */
const searchesObjectTarget = (p: number): boolean => p === 2 || p === 4;

function clearSearch(call: ParkedCall, controller: ParkedController, p: number): void {
  const { ai } = call.subject;
  if (searchesObjectTarget(p)) {
    ai.objectTarget = null;
    ai.mode = 2;
  } else {
    ai.target = null;
    ai.mode = 5;
  }
  controller.nextUpdateClock = clockAfter(call.world.clock, RETRY_DELAY);
}

/**
 * `0x62578`(C, set, mask, p) (D2): a hostile searcher with p ≠ 2 takes the shortcut `0x62714` when the set holds no valid
 * member outside kinds 1, 2 and 0x4000; a valid object target (p 2 or 4) or AI target (p ≠ 2) is kept; an empty set
 * clears; otherwise the choice `0x62760` becomes the object target (p 2 or 4) or the AI target with mode p, no target
 * offset and the deadline sample + 0x280, and without one the deadline is sample + 0xC0 (the wingman with p = 2) or
 * + 0x3C0.
 */
export function searchTarget(call: ParkedCall, controller: ParkedController, set: readonly EntityId[], mask: number, p: 0 | 2 | 4): void {
  const { world, subject } = call;
  const { ai } = subject;
  if (hasKind(HOSTILE_KINDS, subject.kindBit) && p !== 2) {
    const other = set.some((id) => {
      const member = resolve(call, id);
      return member !== undefined && !hasKind(SHORTCUT_IGNORED_KINDS, member.kindBit);
    });
    if (!other) {
      clearSearch(call, controller, p);
      return;
    }
  }
  if (searchesObjectTarget(p) && resolve(call, ai.objectTarget) !== undefined) return;
  if (p !== 2 && resolve(call, ai.target) !== undefined) return;
  if (set.length === 0) {
    clearSearch(call, controller, p);
    return;
  }
  const chosen = chooseCandidate(call, set, mask, p);
  if (chosen === null) {
    const retry = subject.kindBit === WINGMAN_KIND_BIT && p === 2 ? WINGMAN_RETRY_DELAY : RETRY_DELAY;
    controller.nextUpdateClock = clockAfter(world.clock, retry);
    return;
  }
  ai.targetOffset = ZERO_VECTOR;
  if (searchesObjectTarget(p)) ai.objectTarget = chosen;
  else ai.target = chosen;
  ai.mode = p;
  controller.nextUpdateClock = clockAfter(world.clock, FOUND_DELAY);
}

/** FISTP dword under the chop mode `0x74518`: truncation, and −2³¹ (integer indefinite) beyond i32. */
function chop32(value: number): number {
  const chopped = Math.trunc(value);
  return chopped >= -0x8000_0000 && chopped <= 0x7fff_ffff ? chopped + 0 : -0x8000_0000;
}

/** The signed i32 magnitude: −2³¹ stays negative. */
const magnitude32 = (value: number): number => (value < 0 ? -value | 0 : value);

/**
 * `0x5e710`(C, 1) (D6; executable.md, world boundary): mode 4, no AI target, and the goal the current position with its
 * dominant coordinate (x when |x| > |y| of the chopped integers, signed strict; a tie takes y) moved 1000 beyond the world
 * edge on its side (x ≥ 0, −0 and NaN the upper edge); z kept. Then `0x5e6cc`, which a parked subject never passes.
 */
export function leaveOrder(call: ParkedCall): void {
  const { world, subject } = call;
  const { ai, position } = subject;
  ai.mode = 4;
  ai.target = null;
  const half = worldHalfExtent(world.spawn.frame);
  const edge = (coordinate: number): number => Math.fround(coordinate < 0 ? -half - LEAVE_EDGE_MARGIN : half + LEAVE_EDGE_MARGIN);
  ai.goal = magnitude32(chop32(position.x)) > magnitude32(chop32(position.y))
    ? Object.freeze({ ...position, x: edge(position.x) })
    : Object.freeze({ ...position, y: edge(position.y) });
  call.depart();
}

/**
 * `0x62aa0`(C) (D4): a wingman not in Warp drops a parked Xpon unless an entity of kinds `0x6c000` (walk order, no filter)
 * covers it with its own craft +0x0C: the double squared distance strictly below D(r·r), an unordered compare covering.
 * No draw of its own.
 */
export function dropTransponderUnlessCovered(call: ParkedCall): void {
  const { world, subject } = call;
  if (subject.inWarp) return;
  for (const other of world.entities.walk(COVERING_KINDS)) {
    const range = rangeOf(world, other);
    if (!(squaredDistance(subject.position, other.position) >= range * range)) return;
  }
  call.dropTransponder();
}

/**
 * A formation member of kinds 0x80–0x200, 0x400, 0x1000 or 0x80000 (D1): a follower (+0x7C set) takes mode 2 or 0 from
 * m; a leader searches the friendly set with `mask`; mode 5 then gives the leave order. Mode 3 (m = 3 → nothing) is not
 * an AiMode (CR-18).
 */
function updateFormationMember(call: ParkedCall, controller: ParkedController, m: number, mask: number): void {
  const { world, subject } = call;
  const p = m === 2 ? 2 : 0;
  if (subject.formation !== null) subject.ai.mode = p;
  else searchTarget(call, controller, world.objectSets.friendly, mask, p);
  if (subject.ai.mode === 5) leaveOrder(call);
}

/**
 * Mode 1 of `0x62250` (D1), when the AI step finds the controller due: the deadline sample + 0x40, then by kind, deciding
 * on the mode m loaded at entry; every path ends with C+0xF0 += rand % 64, the call's last draw.
 * - 2, the wingman: `0x61f20`; unless a command changed the state with m outside {2, 5}, the Xpon drop, the reveal
 *   `0x2ee60` and the hostile search (p 2 when m is 2, otherwise 0);
 * - 4–0x40: the hostile search with p 4;
 * - 0x80–0x200, 0x400, 0x80000 and 0x1000 (whose record path +0x4C the content contract rejects): updateFormationMember;
 * - 0x800: with m not 4 the friendly search with p 0, then the leave order in mode 5;
 * - 0x2000, 0x4000: mode 5; 0x8000–0x40000: mode 1 and the deadline sample + 0xF00; any other: mode 4.
 */
export function updateParked(call: ParkedCall, controller: ParkedController): void {
  const { world, subject, rand } = call;
  const { ai } = subject;
  controller.nextUpdateClock = clockAfter(world.clock, ENTRY_DELAY);
  const m = ai.mode;
  const kind = 1 << subject.kindBit;
  if (kind === 0x2) {
    const changed = call.consumeCommand?.(call) ?? false;
    if (!changed || m === 2 || m === 5) {
      dropTransponderUnlessCovered(call);
      revealMapVisibility(world);
      searchTarget(call, controller, world.objectSets.hostile, HOSTILE_KINDS, m === 2 ? 2 : 0);
    }
  } else if (kind & 0x7c) {
    searchTarget(call, controller, world.objectSets.hostile, HOSTILE_KINDS, 4);
  } else if (kind & 0x380) {
    updateFormationMember(call, controller, m, FRIENDLY_SIDE_KINDS);
  } else if (kind & 0x81400) {
    updateFormationMember(call, controller, m, MIXED_KINDS);
  } else if (kind === 0x800) {
    if (m !== 4) searchTarget(call, controller, world.objectSets.friendly, FRIENDLY_SIDE_KINDS, 0);
    if (ai.mode === 5) leaveOrder(call);
  } else if (kind & 0x6000) {
    ai.mode = 5;
  } else if (kind & 0x78000) {
    ai.mode = 1;
    controller.nextUpdateClock = clockAfter(world.clock, BASE_DELAY);
  } else {
    ai.mode = 4;
  }
  controller.nextUpdateClock = clockAfter(controller.nextUpdateClock, rand.next() % FINAL_DRAW_MODULUS);
}
