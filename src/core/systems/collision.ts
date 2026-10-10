/**
 * Collisions (docs/plan/p3/02/spec.md, CR-03 and CR-06 to CR-09; docs/original/formats/executable.md, H6 and H7): the
 * run of the `collision` stage, the passes `0x29670` (the player against the others) and `0x29934` (the others against
 * each other), once per tick right after movement, so both read this tick's moved positions. Neither moves anything:
 * a response writes the knock and the tumble into the movement blocks, which movement consumes from the next tick on,
 * so an overlap usually lasts several ticks and repeats its damage. The original's gate `0x174b30` is always set (no
 * writer) and has no state here.
 *
 * Only objects that are active (+2 = 1, not parked or docked) and in state 7 or above take part; neither pass tests the
 * destroyed flag or Warp. A contact always puts the first object's centre in the second's collision shape
 * (collision-shapes.ts), never the reverse; shapes come only from the static rule data. Each contact makes its
 * response (rules/collision.ts, 6 draws), then the damage raw ÷ (3 − g) through `0x2a5fc` (damage.ts: attacker
 * `none`, `hit` with cause `collision`, nothing for a destroyed victim), so its events follow the passes' order:
 * - `0x29670`, only while the player has an entity that is not docked and is in state 7 or above (its destroyed flag is
 *   not tested: a destroyed player still collides and pushes, without damage). First every craft of kinds `0xffffe`
 *   in walk order: on contact the bounce off a large kind (`0xf9c7c`), otherwise the glance; the damage to the player,
 *   then to the craft, halved for a large kind. The original then calls `0x27edc(0)`, which cancels the player's
 *   autopilot; Core has no autopilot state before P4, so that call is not made here (CR-09). Every one of those craft,
 *   in contact or not, records the player and the f32 squared distance as its nearest object (`proximity`, read by
 *   P3-08). Then every fragment with DEBRIS parameters and durability above 0: a large-record one (+0x5C = 0) bounces
 *   the player for the full damage; a small-record one (+0x5C ≠ 0) glances for half the raw damage, which reaches the
 *   player only while fewer than g × 2 + 2 such contacts were counted this tick; the counter is local to the pass,
 *   shared by all fragments, counts contacts over the limit too and is never state. Either way the fragment loses the
 *   damage from its durability, and at 0 or below is shot down (`0x24a6c`). A fragment's spinning block has no knock
 *   or tumble fields, so its part of a glance is lost, but its draws are made (CR-03).
 * - `0x29934`: group A (kinds `0x382`) then group B (kinds `0xffc7c`) are listed once in walk order; each A member is
 *   tested against every later member, so A×A pairs once each in list order and A×B pairs, never B×B. The damage goes to
 *   the A member, then to the other, halved for a large kind. Each tested pair makes the other the A member's nearest
 *   object when it has none or a strictly larger squared distance. Members destroyed meanwhile stay listed.
 */
import { CoreFaultError } from '../errors.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { craftContainsPoint, debrisContainsPoint, type CollisionShape } from '../rules/collision-shapes.ts';
import {
  bounceContact, collisionDamage, fragmentContactLimit, glancingContact, halved, PLAYER_CONTACT_KINDS, POINT_GROUP_KINDS, SHAPE_GROUP_KINDS,
  type ContactBody, type ContactPush, type ContactResponse, type ContactRule,
} from '../rules/collision.ts';
import { motionStep } from '../rules/flight-motion.ts';
import { isLargeKind, shootDown } from '../rules/fragments.ts';
import type { DebrisRuleData } from '../rules/load-transforms.ts';
import { RandStream } from '../rules/original-random.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { FRAGMENT_KIND_BIT, isActiveState, ROTATION_AXES, type Entity, type FragmentCombat, type MovementBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyContactDamage } from './damage.ts';
import type { PipelineStage, TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `collision.${site}`);

/** Whether an object takes part in a pass: active (+2 = 1) and in state 7 or above. */
const takesPart = (entity: Entity): boolean => entity.activity === 'active' && isActiveState(entity.state);

function asCraft(entity: Entity): CraftEntity {
  if (entity.combat.type !== 'craft') throw fault('craft');
  return entity as CraftEntity;
}

function fragmentOf({ combat }: Entity): FragmentCombat {
  if (combat.type !== 'fragment') throw fault('fragment');
  return combat;
}

/** A craft's collision shape (craft record +0x10 after the load); world creation binds every instantiable kind to one. */
function craftShape(world: WorldState, craft: Entity): CollisionShape {
  const rules = world.ruleData.craft[craft.kindBit];
  if (rules === null || rules === undefined) throw fault('craft-shape');
  return rules.shape;
}

/** A fragment's DEBRIS parameters: record `debris` of its source kind's table. */
function debrisOf(world: WorldState, { sourceKindBit, debris }: FragmentCombat): DebrisRuleData {
  const record = debris === null ? undefined : world.ruleData.craft[sourceKindBit]?.debris[debris];
  if (record === undefined) throw fault('debris');
  return record;
}

/** Every object in a pass has a movement block: the original has none only while parked. */
function movementOf(entity: Entity): MovementBlock {
  if (entity.movement === null) throw fault('block');
  return entity.movement;
}

/** Writes a push into a steered block (modes 0 and 3 share the fields); a fragment's spinning block has none (CR-03). */
function push(entity: Entity, pushed: ContactPush | null): void {
  const block = movementOf(entity);
  if (pushed === null || (block.mode !== 'craft' && block.mode !== 'warp')) return;
  const { impulse, timedRotation } = pushed;
  block.impulse = { direction: impulse.direction, magnitude: impulse.magnitude };
  for (const axis of ROTATION_AXES) {
    const timed = timedRotation[axis];
    block.timedRotation[axis] = timed && { rate: timed.rate, decay: timed.decay, end: timed.end };
  }
}

/** What a response reads from an object: its pose and its block's speed. */
const bodyOf = (entity: Entity): ContactBody => ({ position: entity.position, orientation: entity.orientation, speed: movementOf(entity).speed });

/** The response `rule` of `first`'s centre in `second`'s shape at f32 mission time `time`: its 6 draws, then its pushes. */
function respond(world: WorldState, rule: ContactRule, first: Entity, second: Entity, time: number): ContactResponse {
  const rand = new RandStream(world.rngState);
  const response = rule(bodyOf(first), bodyOf(second), time, rand);
  world.rngState = rand.state;
  push(first, response.first);
  push(second, response.second);
  return response;
}

/**
 * A craft contact of either pass: the bounce off a large kind, otherwise the glance; then the damage ÷ (3 − g) to
 * `first`, and to `second`, halved for a large kind.
 */
function collideCraft(context: TickContext, first: CraftEntity, second: CraftEntity, time: number): void {
  const { world } = context;
  const large = isLargeKind(second.kindBit);
  const { raw } = respond(world, large ? bounceContact : glancingContact, first, second, time);
  const damage = collisionDamage(raw, world.config.group);
  applyContactDamage(context, first, damage, 'collision');
  applyContactDamage(context, second, large ? halved(damage) : damage, 'collision');
}

/** The player's contacts with fragments (the second loop of `0x29670`). */
function collidePlayerWithFragments(context: TickContext, player: CraftEntity, time: number): void {
  const { world } = context;
  const { group } = world.config;
  const limit = fragmentContactLimit(group);
  let smallContacts = 0;
  for (const fragment of world.entities.walk(1 << FRAGMENT_KIND_BIT)) {
    const combat = fragmentOf(fragment);
    if (!takesPart(fragment) || combat.debris === null || combat.durability <= 0) continue;
    const { shape, small } = debrisOf(world, combat);
    if (!debrisContainsPoint(shape, fragment.position, fragment.orientation, player.position)) continue;
    const { raw } = respond(world, small ? glancingContact : bounceContact, player, fragment, time);
    const damage = collisionDamage(small ? halved(raw) : raw, group);
    if (!small || smallContacts < limit) applyContactDamage(context, player, damage, 'collision');
    if (small) smallContacts++;
    combat.durability = toInt32(combat.durability - damage);
    if (combat.durability <= 0) shootDown(combat);
  }
}

/** `0x29670`: the player against the craft, then against the fragments. */
function collidePlayer(context: TickContext, time: number): void {
  const { world } = context;
  if (world.player.entityId === null) return;
  const entity = world.entities.get(world.player.entityId);
  if (entity === undefined) throw fault('player');
  if (entity.activity === 'docked' || !isActiveState(entity.state)) return;
  const player = asCraft(entity);
  for (const other of world.entities.walk(PLAYER_CONTACT_KINDS)) {
    if (!takesPart(other)) continue;
    const craft = asCraft(other);
    const { hit, distanceSquared } = craftContainsPoint(craftShape(world, craft), craft.position, craft.orientation, player.position);
    if (hit) collideCraft(context, player, craft, time);
    craft.combat.proximity = { entity: player.id, distanceSquared };
  }
  collidePlayerWithFragments(context, player, time);
}

/** `0x29934`: group A's members against every later member of groups A and B. */
function collideOthers(context: TickContext, time: number): void {
  const { world } = context;
  const members: CraftEntity[] = [];
  for (const craft of world.entities.walk(POINT_GROUP_KINDS)) if (takesPart(craft)) members.push(asCraft(craft));
  const points = members.length;
  if (points === 0) return;
  for (const craft of world.entities.walk(SHAPE_GROUP_KINDS)) if (takesPart(craft)) members.push(asCraft(craft));
  for (let index = 0; index < points; index++) {
    const first = members[index];
    for (let other = index + 1; other < members.length; other++) {
      const second = members[other];
      const { hit, distanceSquared } = craftContainsPoint(craftShape(world, second), second.position, second.orientation, first.position);
      if (hit) collideCraft(context, first, second, time);
      const { proximity } = first.combat;
      if (proximity === null || proximity.distanceSquared > distanceSquared) first.combat.proximity = { entity: second.id, distanceSquared };
    }
  }
}

/** The `collision` stage: both passes at this tick's f32 mission time, which the tumbles' ends count from. */
function collide(context: TickContext): void {
  const { time } = motionStep(context.world.config.clockUnitsPerTick, context.world.clock);
  collidePlayer(context, time);
  collideOthers(context, time);
}

/** The `collision` stage's run. */
export const collisionStage: PipelineStage['run'] = collide;
