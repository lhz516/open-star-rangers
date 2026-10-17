/**
 * Damage (docs/plan/p3/02/spec.md, CR-02, CR-04, CR-06, CR-08, CR-09 and CR-13; docs/original/formats/executable.md,
 * D2–D5, D8, D11 and H4): the craft damage entry `0x2a694` and its callers' entry points:
 * - applyShotHit, `0x2a40c`: a projectile's (P3-07/17) or a missile's (P3-07/20) hit, with the shooter's statistics,
 *   attribution and hit feedback; its result decides a projectile's ricochet;
 * - applyContactDamage, `0x2a5fc`: collisions (P3-07/19) and AI area damage (P3-08), without an attacker;
 * - applyEngagementDamage: the parked engagement `0x30150` (P3-07/21), which calls `0x2a694` itself.
 * None of them scales the damage it is given (no TABL 4003 scale, per-kind factor or difficulty factor, D2): the
 * callers that scale do it before. A fragment's durability is not craft damage and does not come here (H4).
 *
 * `0x2a694` gates the hit (a destroyed victim; the player while the destruction view follows its escape pod, which
 * protects no other craft; the typed cheat flag, which Core never sets, so it has no state here), takes it through the
 * shield and the hull (rules/damage.ts) and may damage a subsystem (rules/subsystems.ts). `hit` follows (CR-06), also for
 * a gated hit, which changes nothing. A hull at 0 or below that the shield did not fully cover destroys the victim once:
 * its destroyed flag, the player's kill counters, `object-destroyed`, then a parked victim waits for removal and any
 * other goes to destruction.ts's entry (P3-07/18: the explosion, or the player's delayed one).
 *
 * The calls of other tasks at fixed places of these rules (CR-13) are static calls; the state each keeps across ticks is
 * its own:
 * - `0x3c208` (P3-10, comm-reactions.ts, with its draws): in `0x2a694` after the shield and before the hull, when the
 *   attacker is not `none`; in `0x2a5fc` after `0x2a694`, when the hull is at least 0, also for a gated victim;
 * - `0x3c0f4` (P3-10, comm-reactions.ts): at the destruction, after the destroyed flag, before the object event; in
 *   `0x2a5fc` after `0x2a694`, when the hull is below 0 (so a collision kill below 0 calls it twice, D5);
 * - `0x6977c` (P3-11): right after that `0x3c0f4`, with the event class of `object-destroyed`; handled at once;
 * - `0x32d74` (P3-11) for the player, before the destruction entry, and `0x32dec` (P3-11) for the wingman, before the
 *   parked test; the kill counters come before both.
 */
import type { Attacker, HitEvent } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { attackerKind } from '../rules/comm-reactions.ts';
import { absorbByShield, damageHull } from '../rules/damage.ts';
import { rowOf } from '../rules/movement-builders.ts';
import { RandStream } from '../rules/original-random.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import { damageSubsystems } from '../rules/subsystems.ts';
import type { Entity } from '../world/entity-table.ts';
import { KILL_KIND_BITS, type KillKindBit } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { reactToDestruction, reactToHit } from './comm-reactions.ts';
import { destroyEntity } from './destruction.ts';
import { retire } from './object-state.ts';
import { emit, type TickContext } from './pipeline.ts';

/** Where a projectile struck: the `hit` event's impact. */
export type HitImpact = NonNullable<HitEvent['impact']>;

/** What a projectile does after its hit (H4), as the `hit` event reports it. */
export type ProjectileOutcome = 'ricochet' | 'removed';

/** The outcome of a hit the entry took (a victim not yet destroyed). */
export interface DamageOutcome {
  /** `0x2a694`'s result: the hit passed the gate and the shield took all of it (or there was none to take). */
  readonly absorbed: boolean;
  /** A projectile's outcome; null for a missile and the other causes. */
  readonly projectile: ProjectileOutcome | null;
}

/** The view mode (0x11) in which a projectile the player's shield takes whole ricochets, as it does off any other craft (H4). */
const PLAYER_RICOCHET_VIEW_MODE = 0x11;

/** One hit, as the entry points describe it to `0x2a694`. */
interface Blow {
  readonly cause: HitEvent['cause'];
  /** The projectile or missile; null for the other causes. */
  readonly source: Entity | null;
  readonly attacker: Attacker;
  readonly impact: HitImpact | null;
}

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `damage.${site}`);

/** A craft entity: only kinds 0–19 take craft damage. */
function asCraft(entity: Entity, site: string): CraftEntity {
  if (entity.combat.type !== 'craft') throw fault(site);
  return entity as CraftEntity;
}

/** Whether `entity` is still in the table: a removed entity is the original's invalid handle. */
const isListed = (world: WorldState, entity: Entity): boolean => world.entities.get(entity.id) === entity;

/** A victim other than `0x2a40c`'s must be listed: the original has no path that damages an invalid handle. */
function listedVictim(world: WorldState, victim: Entity): CraftEntity {
  if (!isListed(world, victim)) throw fault('victim');
  return asCraft(victim, 'victim');
}

function requireDamage(damage: number): void {
  if (toInt32(damage) !== damage) throw fault('amount');
}

const isKillKind = (kindBit: number): kindBit is KillKindBit => (KILL_KIND_BITS as readonly number[]).includes(kindBit);

/** One more of the player's kills of `kindBit` (D8), for the kinds the player state counts. */
function countKill(world: WorldState, kindBit: number): void {
  if (!isKillKind(kindBit)) return;
  const { kills } = world.player;
  world.player.kills = Object.freeze({ ...kills, [kindBit]: toInt32(kills[kindBit] + 1) });
}

/**
 * The destruction in `0x2a694` (D2, D8): the destroyed flag; `0x3c0f4`; `object-destroyed` where the object event
 * goes, class 0 for the player's kill; the player's kill counter by the victim's kind, for victims other than the player
 * and the wingman; then a parked victim waits for removal without exploding, and any other goes to the destruction
 * entry.
 */
function destroy(context: TickContext, victim: CraftEntity, { attacker, source }: Blow): void {
  const { world } = context;
  victim.destroyed = true;
  reactToDestruction(context, attackerKind(attacker), source, victim);
  const byPlayer = attacker.type === 'shooter' && attacker.kindBit === PLAYER_KIND_BIT;
  const player = victim.kindBit === PLAYER_KIND_BIT;
  const outcome = player ? 'delayed' : victim.activity === 'parked' ? 'removed' : 'explodes';
  emit(context, {
    type: 'object-destroyed',
    tick: context.time.tick,
    entityId: victim.id,
    kindBit: victim.kindBit,
    source: victim.source,
    position: victim.position,
    activity: victim.activity,
    attacker,
    eventClass: byPlayer ? 0 : 1,
    outcome,
  });
  if (byPlayer && !player && victim.kindBit !== WINGMAN_KIND_BIT) countKill(world, victim.kindBit);
  if (outcome === 'removed') retire(context, victim, 'pending-removal');
  else destroyEntity(context, victim);
}

/** The ricochet test of `0x2a40c` (H4): a projectile whose damage the shield took whole bounces off any craft but the player, and off the player in view mode 0x11. */
function projectileOutcome(world: WorldState, victim: Entity, absorbed: boolean): ProjectileOutcome {
  const bounces = absorbed && (victim.kindBit !== PLAYER_KIND_BIT || world.player.viewMode === PLAYER_RICOCHET_VIEW_MODE);
  return bounces ? 'ricochet' : 'removed';
}

/**
 * `0x2a694` on a victim not yet destroyed, then `hit`: the destruction-view gate, the shield, `0x3c208` for an attacker,
 * the hull and a subsystem roll (with the status-display redraw of the player's damaged subsystem and the heavy-damage
 * note), `hit`, and the destruction when the hull is at 0 or below and the shield did not take the whole damage.
 */
function damageCraft(context: TickContext, victim: CraftEntity, damage: number, blow: Blow): DamageOutcome {
  const { world } = context;
  const { combat } = victim;
  const shield = combat.shield;
  const hull = combat.hull;
  const gated = world.player.followedEntity !== null && world.player.entityId === victim.id;
  let absorbed = false;
  if (!gated) {
    const craft = world.craftInfo.content.craft[victim.kindBit];
    if (craft === undefined) throw fault('craft');
    const shieldRand = new RandStream(world.rngState);
    const hullDamage = absorbByShield(combat, damage, shieldRand);
    world.rngState = shieldRand.state;
    const kind = attackerKind(blow.attacker);
    if (kind !== 0) reactToHit(context, kind, blow.source, victim, damage);
    const rand = new RandStream(world.rngState);
    damageHull(combat, hullDamage);
    const roll = damageSubsystems(victim, craft, { hullDamage, noAttacker: blow.attacker.type === 'none', sourceKindBit: blow.source?.kindBit ?? null }, rand);
    world.rngState = rand.state;
    if (roll.applied && victim.kindBit === PLAYER_KIND_BIT) world.player.statusDisplay.redraw = true;
    if (roll.heavyDamage !== null) world.player.heavyDamage = roll.heavyDamage;
    absorbed = hullDamage === 0;
  }
  const projectile = blow.cause === 'projectile' ? projectileOutcome(world, victim, absorbed) : null;
  emit(context, {
    type: 'hit',
    tick: context.time.tick,
    victimEntityId: victim.id,
    victimKindBit: victim.kindBit,
    victimPosition: victim.position,
    victimForward: rowOf(victim.orientation, 2),
    victimSpeed: victim.movement?.speed ?? null,
    cause: blow.cause,
    sourceEntityId: blow.source?.id ?? null,
    attacker: blow.attacker,
    damage,
    gated,
    shield: { before: shield, after: combat.shield },
    hull: { before: hull, after: combat.hull },
    shieldWasEmpty: shield <= 0,
    impact: blow.impact,
    projectile,
  });
  if (!gated && !absorbed && combat.hull <= 0) destroy(context, victim, blow);
  return { absorbed, projectile };
}

/**
 * `0x2a40c`: a projectile's or missile's (`source`) hit on `victim` for `damage` (i32, unscaled), with the impact of a
 * projectile that has one (a missile has none). Null, and nothing at all happens, for a victim that was removed or is
 * destroyed: a projectile is neither removed nor bounced and keeps flying (H4). Otherwise, in order: the attacker is the shooter while it is still valid, otherwise
 * `lost-shooter` (the original's class mask 0x93780 in place of a kind: no kill credit, event class 1); the player's
 * projectile or missile hit is counted; a valid shooter's last victim and the victim's last attacker get the clock; the
 * hit feedback clock; then `0x2a694` and `hit`. The caller removes or bounces a projectile as the result says; the
 * no-op `0x254fc` the original calls for some hits is left out.
 */
export function applyShotHit(context: TickContext, source: Entity, victim: Entity, damage: number, impact: HitImpact | null): DamageOutcome | null {
  const { world } = context;
  const { combat } = source;
  if (combat.type !== 'projectile' && combat.type !== 'missile') throw fault('source');
  if (combat.type === 'missile' && impact !== null) throw fault('impact');
  requireDamage(damage);
  if (!isListed(world, victim)) return null;
  const target = asCraft(victim, 'victim');
  if (target.destroyed) return null;
  const shooter = combat.shooter === null ? undefined : world.entities.get(combat.shooter);
  let attacker: Attacker = { type: 'lost-shooter' };
  if (shooter !== undefined) {
    const owner = asCraft(shooter, 'shooter');
    attacker = { type: 'shooter', entityId: owner.id, kindBit: owner.kindBit };
    if (owner.kindBit === PLAYER_KIND_BIT) {
      if (combat.type === 'missile') world.player.shots.missileHits = toInt32(world.player.shots.missileHits + 1);
      else world.player.shots.projectileHits = toInt32(world.player.shots.projectileHits + 1);
    }
    owner.combat.lastVictim = { entity: target.id, clock: world.clock };
    target.combat.lastAttacker = { entity: owner.id, clock: world.clock };
  }
  target.combat.hitFeedbackClock = world.clock;
  return damageCraft(context, target, damage, { cause: combat.type, source, attacker, impact });
}

/**
 * `0x2a5fc`: `damage` (i32, as the caller computed it) to `victim` from a collision or AI area damage. Nothing for a
 * destroyed victim; otherwise the hit feedback clock, then `0x2a694` without an attacker or source, and `hit`; then
 * `0x3c208` without an attacker when the hull is at 0 or above, otherwise `0x3c0f4` once more (D5).
 */
export function applyContactDamage(context: TickContext, victim: Entity, damage: number, cause: 'collision' | 'area'): void {
  const target = listedVictim(context.world, victim);
  requireDamage(damage);
  if (target.destroyed) return;
  target.combat.hitFeedbackClock = context.world.clock;
  damageCraft(context, target, damage, { cause, source: null, attacker: { type: 'none' }, impact: null });
  if (target.combat.hull >= 0) reactToHit(context, 0, null, target, damage);
  else reactToDestruction(context, 0, null, target);
}

/**
 * The parked engagement's call of `0x2a694` (E3): `damage` (i32, already scaled) to `victim` attributed to `shooter`,
 * whose kind the original passes, without a source; `hit` with the cause `parked`. No hit feedback item, so the hit
 * feedback clock stays. Nothing for a destroyed victim.
 */
export function applyEngagementDamage(context: TickContext, shooter: Entity, victim: Entity, damage: number): void {
  const owner = asCraft(shooter, 'shooter');
  const target = listedVictim(context.world, victim);
  requireDamage(damage);
  if (target.destroyed) return;
  damageCraft(context, target, damage, { cause: 'parked', source: null, attacker: { type: 'shooter', entityId: owner.id, kindBit: owner.kindBit }, impact: null });
}
