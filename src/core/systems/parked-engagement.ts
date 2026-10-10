/**
 * The parked engagement (docs/plan/p3/02/spec.md, CR-06 and CR-09; docs/plan/p3/07/spec.md, 停放对象的抽象交战;
 * docs/original/formats/executable.md, E1–E6): the one entry P3-06's parked update calls for each entity it updates,
 * right after the parked travel (`0x2f314`), even when that travel has just put the entity in pending removal. The
 * rules' arithmetic is rules/parked-engagement.ts's; this module reads and writes the world.
 *
 * - AI mode (+0xC4) 1 runs `0x2ffec`: it collects, in walk order, every craft of the opposing side strictly inside the
 *   radius of the self's craft record +0x0C, whatever its activity, state, destroyed flag or Warp (a self of kind 0x800
 *   collects itself), then for each one makes it the self's object target (+0x8C) and runs `0x30150` with the count as
 *   divisor. The last candidate stays the object target; without candidates nothing changes.
 * - Any other mode runs `0x30150` once, divisor 1: the self's class roll; the leader (the formation leader, or the self
 *   without one; a leader that no longer resolves ends it) and its AI mode choose the target reference; the target must
 *   resolve, have a hull above 0, not be in Warp and oppose the self's side. Its activity, state and destroyed flag are
 *   not tested, so an active or docked target qualifies. Then the volley (the missile's choice and roll, the gun sum,
 *   the TABL 4003 scale and the target kind's factor), the chosen missile's ammunition spent, the damage through
 *   `0x2a694` when it is positive and the target is not destroyed, and both craft's next energy clock (+0x24) set to the
 *   clock, so their energy updates run at the next energy stage.
 *
 * The damage goes through systems/damage.ts's applyEngagementDamage: attributed to the self by its kind, without a
 * source, `hit` with the cause `parked` and no hit feedback; a parked victim it destroys waits for removal without an
 * explosion. The TABL 4003 scale applies on this path only (E6).
 *
 * Draws (E4) come from the world RNG in order: the class roll, the missile choice, the missile's roll against the
 * wingman, then the damage entry's own; `0x2ffec` repeats them per candidate. Each draw is committed to
 * `world.rngState` at once, so a caller holding its own RandStream commits it before the call and resumes from
 * `world.rngState` after it, interleaving this entity's draws with its parked update's.
 *
 * Elapsed time is a u32 in the original; Core's parked update passes the clock difference since the last parked
 * update, active time included (P3-06), and one of 2³² or more (about 777 days) is a budget fault.
 */
import { CoreFaultError } from '../errors.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { RandStream, type RandSource } from '../rules/original-random.ts';
import {
  collectionDistanceSquared, collectionRadiusSquared, declinesEngagement, engagementDistance, isCollected, isOpposingSide,
  targetReference, volley, type EngagementMount,
} from '../rules/parked-engagement.ts';
import type { Entity } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyEngagementDamage } from './damage.ts';
import type { TickContext } from './pipeline.ts';

/** The kinds `0x2ffec` collects from: every craft kind. */
const CRAFT_KINDS = 0xfffff;
/** The AI mode that runs the multi-target collection. */
const MULTI_TARGET_MODE = 1;
/** The original's elapsed time is a u32. */
const ELAPSED_LIMIT = 2 ** 32;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `parked-engagement.${site}`);

function asCraft(entity: Entity, site: string): CraftEntity {
  if (entity.combat.type !== 'craft') throw fault(site);
  return entity as CraftEntity;
}

function craftRecord(world: WorldState, { kindBit }: Entity) {
  const record = world.craftInfo.content.craft[kindBit];
  if (record === undefined) throw fault('record');
  return record;
}

/** The world RNG as a RandSource that commits every draw at once, so the damage entry's draws follow in order. */
function worldRand(world: WorldState): RandSource {
  return {
    next() {
      const stream = new RandStream(world.rngState);
      const value = stream.next();
      world.rngState = stream.state;
      return value;
    },
  };
}

/** The self's mounts as the volley reads them, in mount order. */
function engagementMounts(world: WorldState, self: CraftEntity): EngagementMount[] {
  const { mounts } = craftRecord(world, self);
  const states = self.combat.weapons.mounts;
  if (states.length !== mounts.length) throw fault('mounts');
  const { content } = world.craftInfo;
  return mounts.map((mount, index): EngagementMount => {
    if (mount.at10 === 0) {
      const gun = content.guns[mount.weapon];
      const range = world.ruleData.guns[mount.weapon]?.range;
      if (gun === undefined || range === undefined) throw fault('gun');
      return { type: 'gun', range, cooldown: gun.at14, damage: gun.at1C };
    }
    const missile = content.missiles[mount.weapon];
    const range = world.ruleData.missiles[mount.weapon]?.range;
    if (missile === undefined || range === undefined) throw fault('missile');
    return { type: 'missile', range, damage: missile.at5C, ammunition: states[index].ammunition };
  });
}

/** The radius of `target`'s collision shape after the load (craft §3.8). */
function targetRadius(world: WorldState, target: Entity): number {
  const shape = world.ruleData.craft[target.kindBit]?.shape;
  if (shape === undefined) throw fault('target-record');
  return shape.radius;
}

/** E3.2: the target the self's leader references, when every gate passes; null otherwise. */
function gatedTarget(world: WorldState, self: CraftEntity): CraftEntity | null {
  const leader = self.formation === null ? self : world.entities.get(self.formation.leader);
  if (leader === undefined) return null;
  const reference = targetReference(leader.ai.mode);
  if (reference === null) return null;
  const id = reference === 'target' ? leader.ai.target : leader.ai.objectTarget;
  const resolved = id === null ? undefined : world.entities.get(id);
  if (resolved === undefined) return null;
  // No rule gives an AI reference to an entity of a runtime kind (CR-02); the engagement's reads are a craft's.
  const target = asCraft(resolved, 'target');
  if (target.combat.hull <= 0 || target.inWarp || !isOpposingSide(self.kindBit, target.kindBit)) return null;
  return target;
}

/** `0x30150`(self, elapsed, divisor). */
function engage(context: TickContext, self: CraftEntity, elapsed: number, divisor: number): void {
  const { world } = context;
  const rand = worldRand(world);
  if (declinesEngagement(self.kindBit, rand)) return;
  const target = gatedTarget(world, self);
  if (target === null) return;
  const { damage, missileMount } = volley({
    mounts: engagementMounts(world, self),
    distance: engagementDistance(self.position, target.position, targetRadius(world, target)),
    elapsed,
    divisor,
    choosesMissile: self.ruleInputs.aiValueB >= 0,
    targetKindBit: target.kindBit,
    scale: world.craftInfo.content.hitDamageScale,
  }, rand);
  if (missileMount !== null) {
    const state = self.combat.weapons.mounts[missileMount];
    state.ammunition = (state.ammunition - 1) | 0;
  }
  if (damage > 0 && !target.destroyed) applyEngagementDamage(context, self, target, damage);
  self.combat.nextEnergyClock = world.clock;
  target.combat.nextEnergyClock = world.clock;
}

/** `0x2ffec`(self, elapsed). */
function engageAll(context: TickContext, self: CraftEntity, elapsed: number): void {
  const { world } = context;
  const radiusSquared = collectionRadiusSquared(craftRecord(world, self).at0C);
  const candidates: Entity[] = [];
  for (const candidate of world.entities.walk(CRAFT_KINDS)) {
    if (isOpposingSide(self.kindBit, candidate.kindBit) && isCollected(collectionDistanceSquared(self.position, candidate.position), radiusSquared)) {
      candidates.push(candidate);
    }
  }
  for (const candidate of candidates) {
    self.ai.objectTarget = candidate.id;
    engage(context, self, elapsed, candidates.length);
  }
}

/**
 * The parked engagement of `entity` after `elapsed` clock units (E1): `0x2ffec` in AI mode 1, otherwise `0x30150` with
 * divisor 1. See the module comment for what it reads, writes and draws.
 */
export function engageParked(context: TickContext, entity: Entity, elapsed: number): void {
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) throw fault('elapsed');
  if (elapsed >= ELAPSED_LIMIT) throw new CoreFaultError('budget-exhausted', 'parked-engagement.elapsed');
  const self = asCraft(entity, 'self');
  if (self.ai.mode === MULTI_TARGET_MODE) engageAll(context, self, elapsed);
  else engage(context, self, elapsed, 1);
}
