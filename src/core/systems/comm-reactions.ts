/**
 * The communications reactions and the wingman's reports at their fixed call points (docs/plan/p3/02/spec.md, CB-03,
 * CB-05 and CB-12; docs/plan/p3/10/spec.md, D-03 item 5 and D-01 revision ③; docs/original/formats/executable.md,
 * RX2–RX10). Each is a static call from the stage the original runs it in, queueing through systems/radio.ts and
 * drawing from the world RNG in the original's order (rules/comm-reactions.ts holds the arithmetic):
 *
 * - `reactToHit` (`0x3c208`): damage.ts, after the shield when the attacker kind is not 0, and after a contact hit that
 *   left the hull at 0 or above; base-response.ts's threat re-announce. In order: (1) a hit on the wingman W, the first
 *   kind-2 entity: the player's adds to the friendly-fire total, any other may report its low hull; (2) the player's hit
 *   on a friendly of `0x6807c`; (3) an enemy's hit on a friendly, at most once per 0x2D00 units per victim: an active
 *   craft of `0x87c` speaks itself from 20019, any other friendly is named from 20983 and, when that message resolves,
 *   adds a second one by rand % 4.
 * - `reactToDestruction` (`0x3c0f4`): damage.ts, after the destroyed flag and before `object-destroyed`, and after a
 *   contact hit that left the hull below 0 (so a collision kill below 0 runs it twice). (1) W's kill line; (2) W's line
 *   for a friendly lost within 3500 of it to any attacker but none and the player; (3) the thanks once a player's or an
 *   active W's kill leaves no enemy: each friendly with a threat stamp is cleared, speaks and counts; then (4) the
 *   player's kill of a friendly or W, at most once per 0x3C0 units, or (5) a friendly's loss.
 * - `reportEnemyAppears` (`0x38cd4`): instantiation of an active hostile, and `reportParkedEnemy`; W's line while it is
 *   active and the new position lies within 3500 of it, at most once per 0x280 units.
 * - `reportParkedEnemy` (`0x3c3b0`): the parked travel's position write inside the active area of a hostile: the
 *   enemy-appears line, then every active base whose radius holds the position restamps its threat and, when its
 *   stamp was clear or older than 0x2D00 units, speaks.
 *
 * - `checkTail` (`0x4edf4`, the type-9 gauge): `frame-end`, in the tail check's views (displays.ts), once the clock
 *   is past the check's due clock: an attacker closing a missile lock on the player and an incoming missile, gated by
 *   the player's radar, set the two warnings; the check is due again 0x40 units later while either is set and 0x80
 *   otherwise. An attacker found lets W warn (`warnTail`, `0x38c30`) whatever the radar, at most once per 0x640 units,
 *   while the two are aligned (CB-09 as FA-01 corrects it, RX5, A-07).
 *
 * Each limit is stamped when its report is due, also when no message resolves. The sample is this tick's clock. A
 * stamp the original takes at sample 0 counts as none; no step runs at clock 0, so Core needs no such case. The
 * original's music cues after the thanks and the parked report are G-01's and are left out.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { isClosingMissileLock } from '../rules/ai-firing.ts';
import {
  accumulateFriendlyFire,
  BASE_KINDS,
  craftUnderAttackIndex,
  destroyedIndex,
  FRIENDLY_RESPONDER_KINDS,
  HOSTILE_KINDS,
  isEnemyAttacker,
  isLowHull,
  isOnTail,
  isFriendly,
  isSuppressed,
  isWithinWingmanRange,
  LINE_ENEMY_APPEARS,
  LINE_KILL,
  LINE_LOW_HULL,
  LINE_TAIL,
  lostNearWingmanLine,
  PERIODS,
  PLAYER_ATTACKER_KIND,
  PLAYER_KILL_KINDS,
  secondUnderAttackIndex,
  TAIL_ATTACKER_KINDS,
  TAIL_CHECK_DARK,
  TAIL_CHECK_LIT,
  underAttackIndex,
  WINGMAN_ATTACKER_KIND,
} from '../rules/comm-reactions.ts';
import { isDue } from '../contracts/time.ts';
import { RandStream } from '../rules/original-random.ts';
import { hasKind } from '../rules/radio.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import { squaredDistance } from '../rules/speed-match.ts';
import { nameIndexOf } from '../world/comm-input.ts';
import { isActiveState, MISSILE_KIND_BIT, type Entity } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import type { TickContext } from './pipeline.ts';
import { CRAFT_SPEAKER_KINDS, queueLine, queueMessage, speakerFace, speakerSnapshot } from './radio.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `comm-reactions.${site}`);

/** W: the first entity of kind 2, whatever its state. The loop closes the walk. */
function wingmanOf(world: WorldState): Entity | undefined {
  for (const entity of world.entities.walk(2 ** WINGMAN_KIND_BIT)) return entity;
  return undefined;
}

/** `0x38bb0`: W (or any entity) is active and in state 7 or above. */
const isReady = (entity: Entity | undefined): entity is Entity => entity !== undefined && entity.activity === 'active' && isActiveState(entity.state);

/** State 4 or 7 and above, as the thanks and the parked report read it. */
const isPresentState = (entity: Entity): boolean => entity.state === 'destroyed-source' || isActiveState(entity.state);

/** A global limit's or the tail check's next due clock. */
function stampAfter(sample: number, period: number): number {
  const due = sample + period;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'comm-reactions.limit');
  return due;
}

/** The handle check both reactions start with: the victim, and a source other than none, must still be listed. */
const isValid = (world: WorldState, victim: Entity, source: Entity | null): boolean =>
  world.entities.get(victim.id) === victim && (source === null || world.entities.get(source.id) === source);

const nameIndex = (world: WorldState, entity: Entity) => nameIndexOf(world.ruleData.communications.nameIndexes, entity.name);

/** A 20983 message, looked up with face 0 as the original passes it. */
const queueDirect = (context: TickContext, index: number, speaker: Entity | null): boolean =>
  queueMessage(context, { table: 20983, face: 0, index }, 'none', speaker === null ? null : speakerSnapshot(speaker));

/** `0x38f20`: the wingman hook of `0x3c208` step 1. */
function hitWingman(context: TickContext, kind: number, wingman: Entity, damage: number): void {
  const { world, time } = context;
  if (kind === PLAYER_ATTACKER_KIND) {
    accumulateFriendlyFire(world.ai.friendlyFire, time.clock, damage);
    return;
  }
  const { limits } = world.communications;
  if (!isDue(time.clock, limits.wingmanLowHull)) return;
  const craft = world.craftInfo.content.craft[wingman.kindBit];
  if (wingman.combat.type !== 'craft' || craft === undefined) throw fault('wingman');
  if (!isLowHull(craft.at9C, wingman.combat.hull)) return;
  queueLine(context, wingman.id, LINE_LOW_HULL);
  limits.wingmanLowHull = stampAfter(time.clock, PERIODS.wingmanLowHull);
}

/** `0x3c208` step 3: an enemy's hit on a friendly. */
function hitFriendly(context: TickContext, victim: Entity): void {
  const { world, time } = context;
  const { communications } = victim;
  if (isSuppressed(communications.threatStamp, PERIODS.threat, time.clock)) return;
  const name = nameIndex(world, victim);
  if (victim.activity === 'active' && hasKind(CRAFT_SPEAKER_KINDS, victim.kindBit)) {
    const face = speakerFace(context, victim.id);
    const index = craftUnderAttackIndex(name);
    if (index !== null) queueMessage(context, { table: 20019, face, index }, 'music-step', speakerSnapshot(victim));
  } else {
    const index = underAttackIndex(name);
    if (index === null) return;
    if (queueDirect(context, index, victim)) {
      const stream = new RandStream(world.rngState);
      const second = secondUnderAttackIndex(stream);
      world.rngState = stream.state;
      queueDirect(context, second, victim);
    }
  }
  communications.threatStamp = time.clock;
}

/**
 * `0x3c208(kind, source, victim, damage)`: `kind` is the attacker kind (rules/comm-reactions.ts's attackerKind),
 * `source` the projectile or missile or null, `damage` the raw i32 damage before the shield (module comment).
 */
export function reactToHit(context: TickContext, kind: number, source: Entity | null, victim: Entity, damage: number): void {
  const { world, time } = context;
  if (!isValid(world, victim, source)) return;
  if (victim.kindBit === WINGMAN_KIND_BIT && wingmanOf(world) === victim) hitWingman(context, kind, victim, damage);
  if (!isFriendly(victim.kindBit)) return;
  if (kind === PLAYER_ATTACKER_KIND) {
    const { limits } = world.player.communications;
    if (isSuppressed(limits.friendlyHit, PERIODS.friendlyHit, time.clock)) return;
    queueDirect(context, 4, null);
    limits.friendlyHit = time.clock;
  } else if (isEnemyAttacker(kind)) {
    hitFriendly(context, victim);
  }
}

/** `0x3c4e4`: the thanks once no enemy is left. */
function thank(context: TickContext): void {
  const { world } = context;
  for (const hostile of world.entities.walk(HOSTILE_KINDS)) {
    if (hostile.activity === 'active' && !hostile.destroyed && isPresentState(hostile)) return;
  }
  const { communications } = world.player;
  for (const friendly of world.entities.walk(FRIENDLY_RESPONDER_KINDS)) {
    if (friendly.activity !== 'active' || !isPresentState(friendly) || friendly.communications.threatStamp === null) continue;
    friendly.communications.threatStamp = null;
    const face = speakerFace(context, friendly.id);
    const message = hasKind(CRAFT_SPEAKER_KINDS, friendly.kindBit) ? { table: 20019, face, index: 2 } as const : { table: 20011, face, index: 3 } as const;
    queueMessage(context, message, 'music-reset', speakerSnapshot(friendly));
    communications.thanks = toInt32(communications.thanks + 1);
  }
}

/** `0x3c0f4(kind, source, victim)` on a victim just flagged destroyed (module comment). */
export function reactToDestruction(context: TickContext, kind: number, source: Entity | null, victim: Entity): void {
  const { world, time } = context;
  if (!isValid(world, victim, source)) return;
  const wingman = wingmanOf(world);
  const friendly = isFriendly(victim.kindBit);
  const wingmanKill = kind === WINGMAN_ATTACKER_KIND && isReady(wingman);
  if (wingmanKill) queueLine(context, wingman.id, LINE_KILL);
  const lostNear = friendly && wingman !== undefined && kind !== 0 && kind !== PLAYER_ATTACKER_KIND;
  if (lostNear && isWithinWingmanRange(squaredDistance(victim.position, wingman.position))) {
    const line = lostNearWingmanLine(nameIndex(world, victim));
    if (line !== null) queueLine(context, wingman.id, line);
  }
  if ((kind === PLAYER_ATTACKER_KIND || wingmanKill) && hasKind(HOSTILE_KINDS, victim.kindBit)) thank(context);
  if (kind === PLAYER_ATTACKER_KIND && hasKind(PLAYER_KILL_KINDS, victim.kindBit)) {
    const { limits } = world.player.communications;
    if (isSuppressed(limits.friendlyKill, PERIODS.friendlyKill, time.clock)) return;
    queueDirect(context, 5, null);
    limits.friendlyKill = time.clock;
  } else if (friendly) {
    const index = destroyedIndex(nameIndex(world, victim));
    if (index !== null) queueDirect(context, index, victim);
  }
}

/** `0x38cd4(position)`: W's line for an enemy that appears at `position` (module comment). */
export function reportEnemyAppears(context: TickContext, position: Vec3): void {
  const { world, time } = context;
  const wingman = wingmanOf(world);
  const { limits } = world.communications;
  if (!isReady(wingman) || !isDue(time.clock, limits.enemyAppears) || !isWithinWingmanRange(squaredDistance(wingman.position, position))) return;
  queueLine(context, wingman.id, LINE_ENEMY_APPEARS);
  limits.enemyAppears = stampAfter(time.clock, PERIODS.enemyAppears);
}

/** `0x3c3b0(mover, position)` after a hostile's parked move to `mover.position` inside the active area. */
export function reportParkedEnemy(context: TickContext, mover: Entity): void {
  const { world, time } = context;
  const { position } = mover;
  reportEnemyAppears(context, position);
  for (const base of world.entities.walk(BASE_KINDS)) {
    if (base.activity !== 'active' || !isPresentState(base)) continue;
    const craft = world.craftInfo.content.craft[base.kindBit];
    if (craft === undefined) throw fault('base');
    if (squaredDistance(base.position, position) > Math.fround(craft.at0C * craft.at0C)) continue;
    const { communications } = base;
    if (!isSuppressed(communications.threatStamp, PERIODS.threat, time.clock)) {
      const face = speakerFace(context, base.id);
      queueMessage(context, { table: 20011, face, index: 2 }, 'music-step', speakerSnapshot(base));
    }
    communications.threatStamp = time.clock;
  }
}

/** For P3-11's rescue (campaign branch, fewer than 2 rescues): clears the player's two friendly limits (CB-12). */
export function clearCommunicationLimits(world: WorldState): void {
  const { limits } = world.player.communications;
  limits.friendlyHit = null;
  limits.friendlyKill = null;
}

/** The player's field 12 (radar): the attacker flag needs it at 0, the missile flag at 0 or 1. */
const WARNING_FIELD = 12;

/**
 * `0x38c30(player, enemy)`: W's warning that `enemy` is on the player's tail, while W is active, the clock is past the
 * limit and the two third rows are aligned; stamps the limit when it warns.
 */
export function warnTail(context: TickContext, player: Entity, enemy: Entity): void {
  const { world, time } = context;
  const wingman = wingmanOf(world);
  const { limits } = world.communications;
  if (!isReady(wingman) || !isDue(time.clock, limits.tailWarning) || !isOnTail(player.orientation, enemy.orientation)) return;
  queueLine(context, wingman.id, LINE_TAIL);
  limits.tailWarning = stampAfter(time.clock, PERIODS.tailWarning);
}

/** `0x4ef9c`: the first active object of kinds `0x780` in state 7 or above aiming at `player` and closing a missile lock on it. */
function tailAttacker(world: WorldState, player: Entity): Entity | undefined {
  for (const entity of world.entities.walk(TAIL_ATTACKER_KINDS)) {
    if (isReady(entity) && entity.ai.objectTarget === player.id && isClosingMissileLock(entity)) return entity;
  }
  return undefined;
}

/** `0x4f000`: an active kind-20 missile in state 7 or above whose target is `player`. */
function isMissileIncoming(world: WorldState, player: Entity): boolean {
  for (const entity of world.entities.walk(2 ** MISSILE_KIND_BIT)) {
    if (isReady(entity) && entity.combat.type === 'missile' && entity.combat.target === player.id) return true;
  }
  return false;
}

/**
 * `0x4edf4` for the player entity, in the tail check's views (module comment; FA-01): without a player entity, or until
 * the clock is past the due clock, the flags are kept. Otherwise the attacker walk comes first, and an attacker found
 * calls `warnTail` before and regardless of the radar s (field 12); then s = 0 keeps the attacker and walks for a
 * missile, s = 1 clears the attacker and walks for a missile, and s ≥ 2 clears both.
 */
export function checkTail(context: TickContext): void {
  const { world, time } = context;
  const playerId = world.player.entityId;
  const player = playerId === null ? undefined : world.entities.get(playerId);
  const { tailCheck } = world.communications;
  if (player === undefined || !isDue(time.clock, tailCheck.dueClock)) return;
  if (player.combat.type !== 'craft') throw fault('player');
  const attacker = tailAttacker(world, player);
  if (attacker !== undefined) warnTail(context, player, attacker);
  const field = player.combat.subsystems[WARNING_FIELD];
  const attackerOnTail = field === 0 && attacker !== undefined;
  const missileIncoming = field <= 1 && isMissileIncoming(world, player);
  tailCheck.attackerOnTail = attackerOnTail;
  tailCheck.missileIncoming = missileIncoming;
  tailCheck.dueClock = stampAfter(time.clock, attackerOnTail || missileIncoming ? TAIL_CHECK_LIT : TAIL_CHECK_DARK);
}
