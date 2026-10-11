/**
 * Projectiles (docs/plan/p3/02/spec.md, CR-02, CR-05 to CR-08; docs/original/formats/executable.md, H2–H4): the kind 21
 * callback `0x259b0`, a projectile's `expire` request (`0x25f48`) and the hit test `0x28450` with its results. The
 * movement stage calls hitTestProjectile right after a projectile's mode-1 move (rules/projectile-motion.ts);
 * rules/hit-tests.ts finds the struck object and computes a ricochet.
 *
 * Lifecycle (H2, CR-08): a projectile made in tick N by request handling gets its timer at its first callback in N+1,
 * due the gun's lifetime +0x24 later, and asks for state 7 at once, so it first moves and hit-tests in N+1. In state 7 a
 * due timer posts `expire`, which makes it pending removal and lets its shooter go; its next callback frees the timer
 * and asks to leave. A projectile that ricochets is in state 8: never hit-tested again, still moved, and removed 0x80
 * units after its next callback. One that hits otherwise becomes pending removal in the movement stage itself.
 *
 * Hit results (H3, H4), at most one object per projectile per tick:
 * - a craft takes `0x2a40c` (damage.ts: statistics, attribution, the hit feedback clock, `0x2a694` and `hit`) for the
 *   gun's damage +0x1C; the projectile then ricochets or is removed as the result says. For a craft that was destroyed
 *   (the player in its delay) nothing happens at all: the projectile keeps flying, and the walk has ended there;
 * - a fragment draws one rand when its DEBRIS +0x5C is 0 and the projectile ricochets off it when (rand & 3) = 0; it is
 *   removed otherwise, and always off a small fragment, without a draw. Then the fragment's durability loses the
 *   damage (i32), and at 0 or below it is shot down (fragments.ts), so it explodes at its next callback. A fragment's
 *   hit has no event, no attribution and no damage rule.
 */
import { CoreFaultError } from '../errors.ts';
import { shootDown } from '../rules/fragments.ts';
import { deflectsOffFragment, findProjectileHit, ricochet, type Impact } from '../rules/hit-tests.ts';
import { RandStream } from '../rules/original-random.ts';
import { isTimerDue, lingerTimer, projectileTimer } from '../rules/projectile-motion.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import type { Entity, LinearMovementBlock, ProjectileCombat } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyShotHit } from './damage.ts';
import type { RequestOf, TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `projectiles.${site}`);

function gunOf(world: WorldState, projectile: ProjectileCombat) {
  const gun = world.craftInfo.content.guns[projectile.gun];
  if (gun === undefined) throw fault('gun');
  return gun;
}

/**
 * `0x259b0`, a projectile's own update (H2): its first callback allocates the timer and asks for state 7 without
 * waiting for the presentation; in state 7 a due timer posts `expire`; the first state-8 callback clears the flag and
 * makes the timer due 0x80 later, and a later one posts `expire` once that is due; pending removal frees the timer and
 * asks to leave. There is no Warp-transit hold.
 */
export function updateProjectile(context: TickContext, entity: Entity, projectile: ProjectileCombat): void {
  const { world, requests } = context;
  switch (entity.state) {
    case 'new':
      throw fault('state');
    case 'presentation-ready':
      projectile.expiry = projectileTimer(world.clock, gunOf(world, projectile).at24);
      requests.post({ type: 'set-state', entityId: entity.id, state: 'active' });
      return;
    case 'active':
      if (isTimerDue(projectile.expiry, world.clock)) requests.post({ type: 'expire', entityId: entity.id });
      return;
    case 'projectile-hit':
      if (projectile.expiry?.firstHitPending === true) projectile.expiry = lingerTimer(world.clock);
      else if (isTimerDue(projectile.expiry, world.clock)) requests.post({ type: 'expire', entityId: entity.id });
      return;
    case 'pending-removal':
      projectile.expiry = null;
      requests.post({ type: 'leave', entityId: entity.id });
      return;
    default:
      return;
  }
}

/** `0x25f48`: the projectile becomes pending removal and lets its shooter go (mb +0xFC := 0). */
function removeProjectile(entity: Entity, projectile: ProjectileCombat): void {
  entity.state = 'pending-removal';
  projectile.shooter = null;
}

/** Message 0x10000 on a projectile: its expiry, `0x25f48`. */
export function expireProjectile(_context: TickContext, entity: Entity, projectile: ProjectileCombat, _request: RequestOf<'expire'>): void {
  removeProjectile(entity, projectile);
}

/** `0x25dc4` off `struck`: state 8 (projectile-hit), then the pose and velocity of the ricochet, five draws. */
function bounce(entity: Entity, block: LinearMovementBlock, struck: Entity, impact: Impact | null, rand: RandStream): void {
  entity.state = 'projectile-hit';
  const { position, orientation, velocity } = ricochet(struck.position, impact, entity.orientation, rand);
  entity.position = position;
  entity.orientation = orientation;
  block.velocity = velocity;
}

/**
 * `0x28450`, right after a projectile's own mode-1 move (H3): only a projectile in state 7 tests, along the segment
 * from the block's previous position to its position; then the hit's result (see the module comment).
 */
export function hitTestProjectile(context: TickContext, entity: Entity): void {
  const { world } = context;
  const { combat: projectile, movement: block } = entity;
  if (projectile.type !== 'projectile' || block?.mode !== 'linear') throw fault('hit-test');
  if (entity.state !== 'active') return;
  const hit = findProjectileHit(world.entities, world.ruleData.craft, { from: block.previousPosition, to: entity.position }, projectile.shooter);
  if (hit === null) return;
  const damage = gunOf(world, projectile).at1C;
  if (hit.type === 'craft') {
    const outcome = applyShotHit(context, entity, hit.target, damage, hit.impact);
    if (outcome?.projectile === 'removed') removeProjectile(entity, projectile);
    if (outcome?.projectile !== 'ricochet') return;
    const rand = new RandStream(world.rngState);
    bounce(entity, block, hit.target, hit.impact, rand);
    world.rngState = rand.state;
    return;
  }
  const rand = new RandStream(world.rngState);
  if (deflectsOffFragment(hit.debris, rand)) bounce(entity, block, hit.target, hit.impact, rand);
  else removeProjectile(entity, projectile);
  world.rngState = rand.state;
  const { fragment } = hit;
  fragment.durability = toInt32(fragment.durability - damage);
  if (fragment.durability <= 0) shootDown(fragment);
}
