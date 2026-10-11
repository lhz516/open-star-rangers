/**
 * Firing rules of a craft's weapon block (docs/plan/p3/02/spec.md, CR-05; docs/original/formats/executable.md, W5–W10
 * and W12–W13): the trigger routine `0x2d578` over a mount list with its gun shot `0x2e5e8` and missile launch
 * `0x2e86c`, the charge gate and cost (`0x30cc8`, `0x30cec`), the aim solution `0x2e9d4` and the hemisphere test
 * `0x2d894`, the player's missile lock `0x2ddbc`, and the automatic mounts `0x2dad0` with their acquisition `0x2da58`.
 *
 * The functions change the shooter's weapon block and charge in place, draw from the RandSource they are given and hand
 * every launch (message 8) to `post` in the order the original posts them; they read no world state beyond their
 * arguments. The systems (systems/weapons.ts) supply the target: for the player the reference target of CR-05, for an
 * AI shooter its `ai.objectTarget`. P3-08 decides when an AI shooter fires; these are its entry points.
 *
 * Differences from the original, all for data the slice never has: each call starts with no mount tried, which equals
 * the original for every mount arrangement world creation accepts (CR-01); a mount's cooldown clock starts unset and
 * never blocks (CR-11, difference 9); an automatic gun placed in a list fires along the shooter's rows, where the
 * original's message keeps an earlier message's bytes (W6, W11); only gun mounts can be automatic, and a list-1 entry
 * whose first mount with ammunition carries a gun drives no lock.
 *
 * Numbers follow the original's write-back points (W13): every arithmetic step is a JavaScript double operation and
 * every f32 store `Math.fround` (movement-builders.ts). Integers are i32; clock comparisons are plain, since Core's
 * clock never wraps (P3-02).
 */
import type { CraftInfo, CraftRecord, GunRecord, Mount, MissileRecord } from '../../content/rule-data/craft-info.ts';
import type { ShotTrigger, Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { Entity, EntityId, Matrix3, MountState, WeaponBlock } from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import type { CraftEntity } from './combat-init.ts';
import { AUTOMATIC_GUN, normalise } from './load-transforms.ts';
import { alternateLink, chainAmmunition, isMissileMount, mountState, togetherLink, type MountList } from './mounts.ts';
import { offsetPosition, orthonormalFrame, rowOf, speedOf } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { randomDirection } from './random-direction.ts';
import { PLAYER_KIND_BIT } from './spawn-schedule.ts';
import { targetDistance } from './targeting.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `firing.${site}`);

/** An f32 store F(x): `Math.fround`, and a fault when the stored value is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

/** The static data the rules read: the craft info as read and the world's static rule data (CR-01). */
export interface FiringData {
  readonly info: CraftInfo;
  readonly rules: WorldRuleData;
}

/** Gun +0x28: 0 fixed, 1 aimed, 2 automatic (AUTOMATIC_GUN). */
const AIMED_GUN = 1;

/** Message 8 as a gun shot posts it, with the identities the message lacks (CR-05). */
export interface GunLaunch {
  readonly family: 'gun';
  readonly shooter: EntityId;
  readonly gun: number;
  readonly mount: number;
  /** The load-transformed mount offset, plus an automatic mount's jitter. */
  readonly offset: Vec3;
  /** Present exactly for gun +0x28 ≠ 0. */
  readonly orientation: Matrix3 | null;
  readonly trigger: ShotTrigger;
}

/** Message 8 as a missile launch posts it. */
export interface MissileLaunch {
  readonly family: 'missile';
  readonly shooter: EntityId;
  readonly missile: number;
  readonly mount: number;
  readonly offset: Vec3;
  readonly launchByte: 0 | 1 | 2 | 3 | 4;
  /** The target the launch read, which the constructor writes when it still resolves. */
  readonly target: EntityId | null;
  readonly trigger: ShotTrigger;
}

export type Launch = GunLaunch | MissileLaunch;

/** The target a shot reads: its ID, and its entity while that resolves (the original's valid handle). */
export interface ShotTarget {
  readonly id: EntityId | null;
  readonly entity: Entity | undefined;
}

/** Why an attempt posted no launch, in the reason codes of CR-05. */
export type AttemptFailure = 'insufficient-charge' | 'weapon-disabled' | 'cooldown' | 'misfire' | 'no-target' | 'out-of-arc' | 'no-ammunition';
export type AttemptResult = 'launched' | AttemptFailure;

/** What one trigger call did: the launches it posted and the result of its last attempt. */
export interface FireOutcome {
  readonly launched: number;
  readonly last: AttemptResult;
}

/** A pose the aim and the hemisphere test read. */
interface Pose {
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const frozenMatrix = (rows: readonly number[]): Matrix3 => Object.freeze([...rows]) as unknown as Matrix3;
const isPlayerKind = (entity: Entity): boolean => entity.kindBit === PLAYER_KIND_BIT;

function craftOf(data: FiringData, shooter: CraftEntity): CraftRecord {
  const craft = data.info.craft[shooter.kindBit];
  if (craft === undefined) throw fault('craft');
  return craft;
}

/** The load-transformed offsets of the shooter's mounts (CR-01): the shooter is of an instantiable kind. */
function offsetsOf(data: FiringData, shooter: CraftEntity): readonly Vec3[] {
  const rules = data.rules.craft[shooter.kindBit];
  if (rules === null || rules === undefined) throw fault('craft-rules');
  return rules.mountOffsets;
}

/**
 * The squared distance of the aim and the hemisphere and lock tests, from `from` to `to`, which is `0x637e4`'s (the
 * y and z differences unrounded in one factor, W13), and the f32 differences their directions use.
 */
function squaredGap(from: Vec3, to: Vec3): { readonly sum: number; readonly gap: Vec3 } {
  return { sum: targetDistance(from, to), gap: vec(Math.fround(to.x - from.x), Math.fround(to.y - from.y), Math.fround(to.z - from.z)) };
}

/** (a_y × b_y + a_z × b_z) + a_x × b_x in double, the dot product of these paths. */
const dot = (a: Vec3, b: Vec3): number => a.y * b.y + a.z * b.z + a.x * b.x;

/**
 * The aim solution `0x2e9d4` for a shot of `gunSpeed` (gun +0x08) from `mount` at `target`, without the cache: the
 * origin is the shooter's position, moved by the mount offset along the shooter's rows when mount +0x34 ≠ 0; the time
 * of flight t = F(√distance² ÷ speed); the aim point is the target position plus F(target speed × t × target row 3);
 * row 3 is aim point − origin (z without the intermediate stores of x and y), completed into a frame (`0x56d18`) from
 * the shooter's row 2. A zero speed is a fault, as the original's unmasked exception.
 */
export function aimSolution(shooter: Pose, offset: Vec3, mount: Mount, gunSpeed: number, target: Pose, targetSpeed: number): Matrix3 {
  const origin = mount.at34 !== 0 ? offsetPosition(shooter.position, shooter.orientation, offset.x, offset.y, offset.z) : shooter.position;
  const t = store(Math.sqrt(squaredGap(origin, target.position).sum) / gunSpeed);
  const lead = targetSpeed * t;
  const forward = rowOf(target.orientation, 2);
  const aimX = store(store(lead * forward.x) + target.position.x);
  const aimY = store(store(lead * forward.y) + target.position.y);
  const row3 = [store(aimX - origin.x), store(aimY - origin.y), store(lead * forward.z + target.position.z - origin.z)];
  return orthonormalFrame(frozenMatrix([...shooter.orientation.slice(0, 6), ...row3]));
}

/**
 * The arc test of `0x2e9d4`: d = row 3 of `aim`, each product F(d · shooter row) compared with the mount's thresholds:
 * bit 0x01 requires d·row 3 ≥ +0x24 and 0x08 d·row 3 ≤ −(+0x24); 0x04 and 0x20 likewise with row 2 and +0x2C; 0x02 and
 * 0x10 with row 1 and +0x28. Every bit present must pass.
 */
export function inArc(aim: Matrix3, shooterRows: Matrix3, { at20: bits, at24: [threshold3, threshold1, threshold2] }: Mount): boolean {
  const d = rowOf(aim, 2);
  const passes = (row: 0 | 1 | 2, low: number, high: number, threshold: number): boolean => {
    if ((bits & (low | high)) === 0) return true;
    const value = Math.fround(dot(d, rowOf(shooterRows, row)));
    return !((bits & low) !== 0 && !(value >= threshold)) && !((bits & high) !== 0 && !(-threshold >= value));
  };
  return passes(2, 0x01, 0x08, threshold3) && passes(1, 0x04, 0x20, threshold2) && passes(0, 0x02, 0x10, threshold1);
}

/** The weapon of a mount's range squared (+0x10 after the load, CR-01). */
function rangeSquaredOf(data: FiringData, mount: Mount): number {
  const rules = isMissileMount(mount) ? data.rules.missiles[mount.weapon] : data.rules.guns[mount.weapon];
  if (rules === null || rules === undefined) throw fault('weapon-rules');
  return rules.rangeSquared;
}

/**
 * The hemisphere test `0x2d894` of mount `index` on `target` (P3-08's automatic target choice): false beyond the
 * weapon's range (distance² > +0x10); then, with v = target − shooter (positions only), bit 0x01 requires v·row 3 ≥ 0
 * and 0x08 v·row 3 < 0, 0x02 and 0x10 likewise with row 1, 0x04 and 0x20 with row 2, the products in double.
 */
export function inHemisphere(data: FiringData, shooter: CraftEntity, target: Pose, index: number): boolean {
  const mount = craftOf(data, shooter).mounts[index];
  if (mount === undefined) throw fault('mount');
  const { sum, gap } = squaredGap(shooter.position, target.position);
  if (sum > rangeSquaredOf(data, mount)) return false;
  const passes = (row: 0 | 1 | 2, ahead: number, behind: number): boolean => {
    if ((mount.at20 & (ahead | behind)) === 0) return true;
    const front = !(dot(rowOf(shooter.orientation, row), gap) < 0);
    return !((mount.at20 & ahead) !== 0 && !front) && !((mount.at20 & behind) !== 0 && front);
  };
  return passes(2, 0x01, 0x08) && passes(1, 0x04, 0x20) && passes(0, 0x02, 0x10);
}

/** The rows an aimed gun fires along unaimed: the shooter's, with rows 1 and 3 negated when mount +0x20 has bit 0x08. */
function unaimedRows(rows: Matrix3, mount: Mount): Matrix3 {
  if ((mount.at20 & 0x08) === 0) return rows;
  return frozenMatrix(rows.map((value, at) => (at < 3 || at >= 6 ? -value : value)));
}

/**
 * The next member of the alternate chain from `group` to attempt: the untried one that fired least recently before
 * `clock` (strictly, the first on a tie, an unset clock before any), otherwise `group` itself, and none once that is
 * tried too.
 */
function nextAlternate(weapons: WeaponBlock, craft: CraftRecord, group: number, tried: ReadonlySet<number>, clock: number): number | null {
  let candidate = group;
  let earliest = clock;
  for (let at: number | null = group; at !== null; at = alternateLink(craft.mounts[at])) {
    const last = mountState(weapons, at).lastShotClock ?? Number.NEGATIVE_INFINITY;
    if (!tried.has(at) && last < earliest) {
      candidate = at;
      earliest = last;
    }
  }
  return tried.has(candidate) ? null : candidate;
}

/**
 * Whether `last + cooldown` is still ahead of `clock`; equality fires and an unset clock never blocks. The deadline is
 * compared signed, as in the original; one past the safe integers is a budget fault rather than a wrap (W13).
 */
function coolingDown(state: MountState, cooldown: number, clock: number): boolean {
  if (state.lastShotClock === null) return false;
  const ready = state.lastShotClock + cooldown;
  if (!Number.isSafeInteger(ready)) throw new CoreFaultError('budget-exhausted', 'firing.cooldown-clock');
  return clock < ready;
}

/** One trigger call's shared values. */
interface Trigger {
  readonly data: FiringData;
  readonly shooter: CraftEntity;
  readonly craft: CraftRecord;
  readonly offsets: readonly Vec3[];
  readonly target: ShotTarget;
  readonly trigger: ShotTrigger;
  readonly clock: number;
  readonly rand: RandSource;
  readonly post: (launch: Launch) => void;
  /** The aim cache (object +0x12C/+0x130): the first aimed mount's solution, reused by later ones in the call. */
  aim: Matrix3 | null;
}

/**
 * A gun attempt: the charge gate (the player only: cost +0x18 above the charge), a destroyed mount, then `0x2e5e8`: the
 * cooldown (+0x14), a damaged mount's misfire (one draw, odd fails and restarts the cooldown), an aimed gun's target and
 * arc, which fail the attempt only for mount +0x30 = 0 with an alternate (otherwise it fires unaimed); then the shot
 * restarts the cooldown, spends the player's charge and posts the launch.
 */
function attemptGun(call: Trigger, index: number, mount: Mount, state: MountState, gun: GunRecord): AttemptResult {
  const { shooter, clock } = call;
  const { combat } = shooter;
  const player = isPlayerKind(shooter);
  if (player && gun.at18 > combat.charge) return 'insufficient-charge';
  if (state.damage === 2) return 'weapon-disabled';
  if (coolingDown(state, gun.at14, clock)) return 'cooldown';
  if (state.damage === 1 && (call.rand.next() & 1) === 1) {
    state.lastShotClock = clock;
    return 'misfire';
  }
  let orientation: Matrix3 | null = null;
  if (gun.at28 === AIMED_GUN) {
    const { entity } = call.target;
    let aimed: Matrix3 | null = null;
    if (entity !== undefined) {
      call.aim ??= aimSolution(shooter, call.offsets[index], mount, gun.at08, entity, speedOf(entity));
      if (inArc(call.aim, shooter.orientation, mount)) aimed = call.aim;
    }
    if (aimed === null && mount.at30 === 0 && alternateLink(mount) !== null) return entity === undefined ? 'no-target' : 'out-of-arc';
    orientation = aimed ?? unaimedRows(shooter.orientation, mount);
  } else if (gun.at28 !== 0) {
    orientation = shooter.orientation;
  }
  state.lastShotClock = clock;
  if (player) combat.charge = gun.at18 > combat.charge ? 0 : (combat.charge - gun.at18) | 0;
  call.post({ family: 'gun', shooter: shooter.id, gun: mount.weapon, mount: index, offset: call.offsets[index], orientation, trigger: call.trigger });
  return 'launched';
}

/**
 * A missile attempt: no ammunition, a destroyed mount, then `0x2e86c`: a guided missile (+0x18 ≠ 0) needs a target, the
 * cooldown (+0x1C); then the launch restarts the cooldown, takes one round and posts the launch with the lock level (one
 * less, at least 0, from a damaged mount). After a guided launch the lock level is cleared, unless the player still has
 * ammunition on the alternate chain from the fired mount (`0x2dd04`).
 */
function attemptMissile(call: Trigger, index: number, mount: Mount, state: MountState, missile: MissileRecord): AttemptResult {
  const { shooter, clock } = call;
  const { weapons } = shooter.combat;
  if (state.ammunition <= 0) return 'no-ammunition';
  if (state.damage === 2) return 'weapon-disabled';
  const guided = missile.at18 !== 0;
  if (guided && call.target.entity === undefined) return 'no-target';
  if (coolingDown(state, missile.at1C, clock)) return 'cooldown';
  state.lastShotClock = clock;
  state.ammunition = (state.ammunition - 1) | 0;
  const { level } = weapons.lock;
  const launchByte = state.damage === 1 ? Math.max(level - 1, 0) as 0 | 1 | 2 | 3 : level;
  call.post({
    family: 'missile', shooter: shooter.id, missile: mount.weapon, mount: index, offset: call.offsets[index], launchByte, target: call.target.id,
    trigger: call.trigger,
  });
  if (guided && !(isPlayerKind(shooter) && chainAmmunition(weapons, call.craft, index) > 0)) weapons.lock.level = 0;
  return 'launched';
}

function attempt(call: Trigger, index: number): AttemptResult {
  const mount = call.craft.mounts[index];
  const state = mountState(call.shooter.combat.weapons, index);
  return isMissileMount(mount)
    ? attemptMissile(call, index, mount, state, call.data.info.missiles[mount.weapon])
    : attemptGun(call, index, mount, state, call.data.info.guns[mount.weapon]);
}

/**
 * The trigger routine `0x2d578` on list `list` at `clock`: null when the list has no current mount. Otherwise, for each
 * group on the fire-together chain from the current mount, one shot: a group without an alternate is attempted itself;
 * a group with alternates attempts its untried members, the one that fired least recently first, until one fires. The
 * outcome counts the launches and keeps the last attempt's result, the reason of a command that fired nothing.
 */
export function fireList(
  data: FiringData,
  shooter: CraftEntity,
  list: MountList,
  target: ShotTarget,
  trigger: ShotTrigger,
  clock: number,
  rand: RandSource,
  post: (launch: Launch) => void,
): FireOutcome | null {
  const head = shooter.combat.weapons.selections[list].mount;
  if (head === null) return null;
  const call: Trigger = { data, shooter, craft: craftOf(data, shooter), offsets: offsetsOf(data, shooter), target, trigger, clock, rand, post, aim: null };
  const tried = new Set<number>();
  let launched = 0;
  let last: AttemptResult | null = null;
  for (let group: number | null = head; group !== null; group = togetherLink(call.craft.mounts[group])) {
    if (alternateLink(call.craft.mounts[group]) === null) {
      last = attempt(call, group);
      if (last === 'launched') launched++;
      continue;
    }
    for (let candidate = nextAlternate(shooter.combat.weapons, call.craft, group, tried, clock); candidate !== null;
      candidate = nextAlternate(shooter.combat.weapons, call.craft, group, tried, clock)) {
      tried.add(candidate);
      last = attempt(call, candidate);
      if (last === 'launched') {
        launched++;
        break;
      }
    }
  }
  // The first group always makes an attempt: nothing is tried yet.
  if (last === null) throw fault('no-attempt');
  return { launched, last };
}

/** The kinds the lock never locks on, `0x206c87f`: the player and the friendly kinds. */
const UNLOCKABLE_KINDS = 0x206c87f;
/** The interval of the lock's updates, 0x15 clock units. */
const LOCK_INTERVAL = 0x15;

/** `clock + duration` as a clock; a sum Core cannot represent (negative or past the safe integers) is a fault. */
function dueClock(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'firing.lock-clock');
  if (due < 0) throw fault('lock-clock');
  return due;
}

/**
 * The lock geometry of `0x2ddbc`: the target within the missile's range (distance² < +0x10, strict), the normalised
 * direction to it more than +0x28 along the shooter's row 3 and, for +0x3C ≠ 0, the target's row 3 more than +0x40 along
 * it; all strict, in double precision against the f32 thresholds.
 */
function lockGeometry(player: Pose, target: Pose, missile: MissileRecord, rangeSquared: number): boolean {
  const { sum, gap } = squaredGap(player.position, target.position);
  if (!(sum < rangeSquared)) return false;
  const forward = rowOf(player.orientation, 2);
  if (!(dot(normalise(gap), forward) > missile.at28)) return false;
  return missile.at3C === 0 || dot(forward, rowOf(target.orientation, 2)) > missile.at40;
}

/**
 * The missile lock `0x2ddbc` of the player in its update (W8). With no target (the update has dropped one that no
 * longer resolves), no current list-1 mount, subsystem 3 destroyed or a target of the unlockable kinds, the level drops
 * to 0. Otherwise, from the next update clock on, the first mount with ammunition on the alternate chain of the list-1
 * mount must carry a guided missile; then the geometry decides, replaced by one draw ((rand & 0xFF) > 0x80) while
 * subsystem 3 is damaged. A failure starts or extends the grace and drops the lock once the grace has passed; a success
 * ends the grace (resuming level 2 or 3) and advances the stages 0 → 1 → 2 → 3 → 4 at their deadlines. The next update
 * comes 0x15 units later.
 */
export function updateLock(data: FiringData, player: CraftEntity, target: Entity | undefined, clock: number, rand: RandSource): void {
  const { weapons, subsystems } = player.combat;
  const { lock } = weapons;
  const selected = weapons.selections[1].mount;
  if (target === undefined || selected === null || subsystems[3] === 2 || ((UNLOCKABLE_KINDS >>> target.kindBit) & 1) === 1) {
    lock.level = 0;
    return;
  }
  if (clock < lock.nextUpdateClock) return;
  const craft = craftOf(data, player);
  let loaded: number | null = selected;
  while (loaded !== null && mountState(weapons, loaded).ammunition === 0) loaded = alternateLink(craft.mounts[loaded]);
  if (loaded === null || !isMissileMount(craft.mounts[loaded])) return;
  const missile = data.info.missiles[craft.mounts[loaded].weapon];
  if (missile.at18 === 0) return;
  let ok = lockGeometry(player, target, missile, rangeSquaredOf(data, craft.mounts[loaded]));
  if (subsystems[3] === 1) ok = (rand.next() & 0xff) > 0x80;
  if (!ok) {
    if (lock.losing && clock >= lock.graceDueClock) {
      lock.level = 0;
    } else {
      lock.losing = true;
      lock.graceDueClock = dueClock(clock, missile.at38);
    }
    lock.nextUpdateClock = dueClock(clock, LOCK_INTERVAL);
    return;
  }
  const half = missile.at34 >> 1;
  if (lock.losing) {
    if (lock.level === 2) {
      lock.stageDueClock = dueClock(clock, half);
    } else if (lock.level >= 3) {
      lock.level = 3;
      lock.stageDueClock = dueClock(clock, Math.trunc(missile.at34 / 2));
    }
    lock.losing = false;
  }
  if (lock.level === 0) {
    lock.level = 1;
    lock.stageDueClock = dueClock(clock, missile.at30);
  } else if (lock.level < 4 && clock >= lock.stageDueClock) {
    lock.level = (lock.level + 1) as 2 | 3 | 4;
    if (lock.level < 4) lock.stageDueClock = dueClock(clock, half);
  }
  lock.nextUpdateClock = dueClock(clock, LOCK_INTERVAL);
}

/** The jitter scale of automatic shots: (rand × C) × f64 3 + f64 2 (`0x170fb4`, `0x170fbc`). */
const JITTER_SPAN = 3;
const JITTER_BASE = 2;

/**
 * The automatic mounts `0x2dad0` (AI step, when AI +0x140 ≠ 0): in mount order, each automatic gun mount not destroyed,
 * with burst left and its cooldown passed (equality fires) consumes one round of its burst and restarts its cooldown,
 * whether it fires or not. A damaged mount fires on one draw ((rand & 0xFF) < 0x80); a shot posts the launch along the
 * stored aim, from the mount offset moved by a jitter: a random direction (two draws), each component scaled by its own
 * F((rand × C × 3 + 2) × u) in x, y, z order. No charge, aim or arc applies at fire time.
 */
export function fireAutomaticMounts(data: FiringData, shooter: CraftEntity, clock: number, rand: RandSource, post: (launch: Launch) => void): void {
  const craft = craftOf(data, shooter);
  const offsets = offsetsOf(data, shooter);
  const { weapons } = shooter.combat;
  craft.mounts.forEach((mount, index) => {
    if (isMissileMount(mount)) return;
    const gun = data.info.guns[mount.weapon];
    const state = mountState(weapons, index);
    if (gun.at28 !== AUTOMATIC_GUN || state.damage === 2 || state.burst <= 0 || coolingDown(state, gun.at14, clock)) return;
    if (state.damage === 0 || (rand.next() & 0xff) < 0x80) {
      const u = randomDirection(rand);
      const jitter = (base: number, component: number): number => store(base + store((rand.next() * RAND_SCALE * JITTER_SPAN + JITTER_BASE) * component));
      const offset = offsets[index];
      const x = jitter(offset.x, u.x);
      const y = jitter(offset.y, u.y);
      const z = jitter(offset.z, u.z);
      post({ family: 'gun', shooter: shooter.id, gun: mount.weapon, mount: index, offset: vec(x, y, z), orientation: state.aim, trigger: { type: 'automatic' } });
    }
    state.burst = (state.burst - 1) | 0;
    state.lastShotClock = clock;
  });
}

/**
 * The acquisition `0x2da58` of automatic mount `index`: a target that no longer resolves is dropped, and nothing else
 * happens. Otherwise the aim solution, uncached, becomes the mount's aim even when the arc then fails; only an arc that
 * passes loads the burst (gun +0x2C). Returns whether it did.
 */
export function acquireAutomaticTarget(data: FiringData, shooter: CraftEntity, index: number, resolve: (id: EntityId) => Entity | undefined): boolean {
  const mount = craftOf(data, shooter).mounts[index];
  if (mount === undefined || isMissileMount(mount)) throw fault('automatic-mount');
  const state = mountState(shooter.combat.weapons, index);
  const target = state.autoTarget === null ? undefined : resolve(state.autoTarget);
  if (target === undefined) {
    state.autoTarget = null;
    return false;
  }
  const gun = data.info.guns[mount.weapon];
  state.aim = aimSolution(shooter, offsetsOf(data, shooter)[index], mount, gun.at08, target, speedOf(target));
  if (!inArc(state.aim, shooter.orientation, mount)) return false;
  state.burst = gun.at2C;
  return true;
}
