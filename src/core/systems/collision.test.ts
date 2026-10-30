import { describe, expect, it } from 'vitest';
import type { DomainEvent, HitEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { bounceContact, glancingContact, type ContactRule } from '../rules/collision.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import type { DebrisRuleData } from '../rules/load-transforms.ts';
import { RandStream } from '../rules/original-random.ts';
import { rngStateAfter } from '../rules/rand.test-support.ts';
import type { RngState } from '../determinism/rng.ts';
import type { Entity, FragmentCombat, Matrix3, SteeredMovementBlock } from '../world/entity-table.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stillEntityInit, testState, TEST_ORIENTATION, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { PIPELINE, registerTick } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-03 and CR-06 to CR-09; docs/original/formats/executable.md, H6 and H7. Expected events,
// damage, filters and orders are worked out here from H6. The exact response fields and their arithmetic are
// rules/collision.test.ts's; here the block fields are compared with the response rule applied to the bodies H6 names,
// in the order H6 names them, from the RNG state the stage starts with (nothing earlier in these quiet ticks draws).
// Craft and fragments move in the formal step (fragments since P3-07/35); the fragments here are at rest.

const f = Math.fround;
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const ORIGIN = at(0, 0, 0);
/** Heading −z (row 3 = (0, 0, −1)): head on to TEST_ORIENTATION's +z. */
const HEAD_ON = Object.freeze([1, 0, 0, 0, -1, 0, 0, 0, -1]) as unknown as Matrix3;
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Movement at full throttle: 48 units/s, so 1.5 units per tick of 2 clock units. */
const SPEED = 48;
const STEP = 1.5;

const box = (lower: Vec3, upper: Vec3): ShapeBox => ({ lower, upper });
/** A shape the sphere alone decides (no boxes): the point hits when its f32 squared distance is at most r². */
const sphere = (radius: number, boxes: readonly ShapeBox[] = []): CollisionShape =>
  ({ radius, radiusSquared: f(radius * radius), bounds: box(at(-radius, -radius, -radius), at(radius, radius, radius)), boxes, innerBox: null });

const debris = (small: boolean, radius = 5): DebrisRuleData => ({ weights: ORIGIN, direction: at(0, 0, 1), shape: sphere(radius), small });
/** The DEBRIS records of every kind: 0 small (+0x5C ≠ 0), 1 large (+0x5C = 0). */
const DEBRIS: readonly DebrisRuleData[] = [debris(true), debris(false)];

/** Kinds by group: A (0x382) 1, 7, 8; B (0xffc7c) 13 and 14 (small), 2 and 10 (large, 0xf9c7c). */
const WINGMAN = 1;
const LARGE = 2;
const SMALL = 7;
const SMALL_8 = 8;
const LARGE_10 = 10;
const OTHER = 13;
const OTHER_14 = 14;

interface Scene {
  readonly state: WorldState;
  readonly world: World;
  readonly player: CraftEntity;
}

/**
 * A quiet world at `group` with the player standing at the origin, heading +z: every kind's shape a sphere of radius 5
 * (or of `shapes`' radius, or `shapes`' shape), no model parts (a destroyed craft explodes holding its source), the DEBRIS records above. No energy
 * update and no automatic target selection run, so nothing but the collisions draws.
 */
function scene(group = 0, shapes: Readonly<Record<number, number | CollisionShape>> = {}, player: Partial<Parameters<typeof stillEntityInit>[1]> = {}): Scene {
  const base = testState({ group });
  const own = base.ruleData.craft[0]!;
  const shapeOf = (shape: number | CollisionShape = 5): CollisionShape => (typeof shape === 'number' ? sphere(shape) : shape);
  const kind = (kindBit: number): CraftRuleData => ({ ...own, shape: shapeOf(shapes[kindBit]), parts: 0, debris: DEBRIS });
  const state: WorldState = { ...base, ruleData: { ...base.ruleData, craft: base.ruleData.craft.map((_, kindBit) => (kindBit === 0 ? own : kind(kindBit))) } };
  const entity = addPlayerEntity(state, { position: ORIGIN, ...player }) as CraftEntity;
  entity.state = 'active';
  quiet(entity);
  state.player.targeting = { mode: 'enemy', autoTargetDueClock: 1e9 };
  return { state, world: constructWorld(state), player: entity };
}

function quiet(craft: CraftEntity, hull = 1000): void {
  Object.assign(craft.combat, { shield: 0, hull, nextEnergyClock: 1e9 });
}

/** An active craft of `kindBit` at `position`; still unless `moving`, which gives it full throttle along its row 3. */
function craftAt(state: WorldState, kindBit: number, position: Vec3, { orientation = TEST_ORIENTATION, moving = false, hull = 1000 } = {}): CraftEntity {
  const init = moving ? entityInit(kindBit, { position, orientation }) : stillEntityInit(kindBit, { position, orientation });
  const craft = state.entities.allocate(init) as CraftEntity;
  craft.state = 'active';
  quiet(craft, hull);
  return craft;
}

/** An active fragment of a SMALL source on DEBRIS record `record`, at `position`, whose expiry is far off. */
function fragmentAt(state: WorldState, position: Vec3, record: 0 | 1 | null, durability = 1200): Entity {
  const fragment = state.entities.allocate(entityInit(24, { position, orientation: IDENTITY }));
  fragment.state = 'active';
  Object.assign(fragment.combat, { sourceKindBit: SMALL, part: 1, debris: record, durability, expiry: { type: 'at', clock: 1e9 } });
  return fragment;
}

const fragmentOf = (entity: Entity): FragmentCombat => entity.combat as FragmentCombat;
const blockOf = (entity: Entity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;
const hits = (events: readonly DomainEvent[]): HitEvent[] => events.filter((event): event is HitEvent => event.type === 'hit');
const hitList = (events: readonly DomainEvent[]): [number, number][] => hits(events).map(({ victimEntityId, damage }) => [victimEntityId, damage]);
const time = (state: WorldState): number => f(state.clock / 64);
const squared = (from: Vec3, to: Vec3): number => {
  const [dx, dy, dz] = [from.x - to.x, from.y - to.y, from.z - to.z];
  return f(dy * f(dy) + dx * f(dx) + dz * f(dz));
};

/** The response `rule` gives `first` and `second` as they are now, drawing from `rng`; returns it and the state after. */
function expected(rule: ContactRule, first: Entity, second: Entity, state: WorldState, rng: RngState) {
  const body = (entity: Entity) => ({ position: entity.position, orientation: entity.orientation, speed: entity.movement!.speed });
  const rand = new RandStream(rng);
  return { response: rule(body(first), body(second), time(state), rand), rng: rand.state };
}

/** One formal tick, `before` running just before the collision stage. */
function tickWith(state: WorldState, before: () => void): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    context.stage = stage.id;
    if (stage.id === 'collision') before();
    stage.run?.(context);
  }
  return context.events;
}

describe('0x29670, the player against the craft (H6, AC-08)', () => {
  it.each([[0, 114], [1, 171], [2, 342]])('glances off a craft that is not large at group %i: raw 2 × 96 + 150 ÷ (3 − g) = %i to the player, then to the craft', (group, damage) => {
    const { state, world, player } = scene(group);
    // Head on at full speed: it moves 1.5 units this tick and reaches (3, 0, 0); X = 2 × (0 + 48) = 96.
    const craft = craftAt(state, SMALL, at(3, 0, STEP), { orientation: HEAD_ON, moving: true });
    const rng = state.rngState;
    const events = world.step(tickInput());
    expect(craft.position).toEqual(at(3, 0, 0));
    const { response } = expected(glancingContact, player, craft, state, rng);
    expect(response.raw).toBe(2 * 96 + 150);
    expect(hitList(events)).toEqual([[player.id, damage], [craft.id, damage]]);
    expect(hits(events)[0]).toMatchObject({ cause: 'collision', attacker: { type: 'none' }, sourceEntityId: null, impact: null, projectile: null, victimPosition: ORIGIN });
    expect(events.map(({ type }) => type)).toEqual(['hit', 'hit']);
    // The player is knocked along the craft's heading at its speed, the craft along the player's at twice the player's (0).
    expect(blockOf(player).impulse).toEqual({ direction: at(0, 0, -1), magnitude: SPEED });
    expect(blockOf(craft).impulse).toEqual({ direction: at(0, 0, 1), magnitude: 0 });
    expect(blockOf(player).timedRotation).toEqual(response.first.timedRotation);
    expect(blockOf(craft).timedRotation).toEqual(response.second!.timedRotation);
    expect(blockOf(player).timedRotation.pitch!.rate).toBe(-blockOf(craft).timedRotation.pitch!.rate);
    // No autopilot state exists to cancel (CR-09); the craft records the player as its nearest object.
    expect(craft.combat.proximity).toEqual({ entity: player.id, distanceSquared: 9 });
  });

  it('bounces off a large kind: only the player is knocked, at 1.2 × its speed, and the craft takes half the damage (SAR 1)', () => {
    const { state, world, player } = scene(0, {}, { orientation: IDENTITY });
    const craft = craftAt(state, LARGE, at(0, 0, 4), { orientation: HEAD_ON });
    const rng = state.rngState;
    const events = world.step(tickInput());
    const { response } = expected(bounceContact, player, craft, state, rng);
    // Y = (0 + 0) × 2 = 0: raw 150, 50 to the player and 25 to the craft.
    expect(hitList(events)).toEqual([[player.id, 50], [craft.id, 25]]);
    // The offset P₁ − P₂ = (0, 0, −4) normalises to (0, 0, −1); w = (0, 0, −2) against −row3₁ = (0, 0, −1).
    expect(blockOf(player).impulse).toEqual({ direction: at(0, 0, -3), magnitude: 0 });
    expect(blockOf(player).timedRotation).toEqual(response.first.timedRotation);
    expect([blockOf(craft).impulse, blockOf(craft).timedRotation]).toEqual([null, { pitch: null, yaw: null, roll: null }]);
  });

  it('leaves a large craft\'s own knock and tumble as movement left them, and writes a player\'s Warp block too', () => {
    const { state, player } = scene(0, {}, { orientation: IDENTITY });
    blockOf(player).mode = 'warp';
    const craft = craftAt(state, LARGE, at(0, 0, 4), { orientation: HEAD_ON });
    blockOf(craft).impulse = { direction: at(1, 0, 0), magnitude: 9 };
    blockOf(craft).timedRotation.yaw = { rate: 2, decay: 0.5, end: 1000 };
    let moved: unknown = null;
    let rng = state.rngState;
    const events = tickWith(state, () => { moved = structuredClone(craft.movement); rng = state.rngState; });
    expect(hitList(events)).toEqual([[player.id, 50], [craft.id, 25]]);
    expect(craft.movement).toEqual(moved);
    expect(blockOf(craft).impulse!.magnitude).toBeLessThan(9);
    const { response } = expected(bounceContact, player, craft, state, rng);
    expect(blockOf(player)).toMatchObject({ mode: 'warp', impulse: response.first.impulse, timedRotation: response.first.timedRotation });
  });

  it('halves an odd damage toward −∞ for a large kind, after the division', () => {
    const { state, world, player } = scene(2, {}, { orientation: IDENTITY });
    const craft = craftAt(state, LARGE_10, at(0, 1, 0));
    // Y = 0: raw 150 ÷ 1 = 150 to the player, 75 to the craft; group 1 gives 75 and 37.
    expect(hitList(world.step(tickInput()))).toEqual([[player.id, 150], [craft.id, 75]]);
    const { state: other, world: world1, player: player1 } = scene(1, {}, { orientation: IDENTITY });
    const craft1 = craftAt(other, LARGE_10, at(0, 1, 0));
    expect(hitList(world1.step(tickInput()))).toEqual([[player1.id, 75], [craft1.id, 37]]);
  });

  it('makes 6 draws per contact and pushes, without damage, a player and craft whose destroyed flags are set', () => {
    const { state, world, player } = scene();
    const first = craftAt(state, OTHER_14, at(1, 0, 0));
    const second = craftAt(state, OTHER_14, at(0, 1, 0));
    for (const entity of [player, first, second]) entity.destroyed = true;
    const rng = state.rngState;
    expect(world.step(tickInput())).toEqual([]);
    expect(state.rngState).toBe(rngStateAfter(rng, 12));
    const one = expected(glancingContact, player, first, state, rng);
    const two = expected(glancingContact, player, second, state, one.rng);
    // The player's block holds the later contact's push; each craft its own.
    expect(blockOf(player).timedRotation).toEqual(two.response.first.timedRotation);
    expect(blockOf(first).timedRotation).toEqual(one.response.second!.timedRotation);
    expect(blockOf(second).timedRotation).toEqual(two.response.second!.timedRotation);
  });

  it('draws each response after the previous contact\'s damage has drawn', () => {
    // A twin world with the first craft alone ends its tick where the second response starts.
    const build = (both: boolean) => {
      const current = scene();
      const first = craftAt(current.state, OTHER, at(1, 0, STEP), { orientation: HEAD_ON, moving: true });
      const second = both ? craftAt(current.state, OTHER_14, at(0, 1, STEP), { orientation: HEAD_ON, moving: true }) : null;
      return { ...current, first, second };
    };
    const twin = build(false);
    const rng = twin.state.rngState;
    expect(hitList(twin.world.step(tickInput()))).toEqual([[twin.player.id, 114], [twin.first.id, 114]]);
    // The damage drew: the twin's state is past the response's 6 draws.
    expect(twin.state.rngState).not.toBe(rngStateAfter(rng, 6));
    const both = build(true);
    both.world.step(tickInput());
    const { response } = expected(glancingContact, both.player, both.second!, both.state, twin.state.rngState);
    expect(blockOf(both.second!).timedRotation).toEqual(response.second!.timedRotation);
    expect(blockOf(both.player).timedRotation).toEqual(response.first.timedRotation);
    expect(response.first.timedRotation.pitch).not.toBeNull();
  });

  it('processes every craft in contact in walk order (kind bit, then allocation), each with its own response and damage', () => {
    const { state, world, player } = scene();
    // Group B only, so no pair of the second pass collides.
    const [late, early, second] = [craftAt(state, OTHER_14, at(0, 2, 0)), craftAt(state, OTHER, at(2, 0, 0)), craftAt(state, OTHER, at(0, 0, 2))];
    const events = world.step(tickInput());
    expect(hitList(events)).toEqual([[player.id, 50], [early.id, 50], [player.id, 50], [second.id, 50], [player.id, 50], [late.id, 50]]);
  });

  it('tests only the player\'s centre in the craft\'s shape, in the craft\'s rows, never the craft\'s centre in the player\'s', () => {
    // The craft's radius 1 does not reach the player 2 away, however large the player's own shape.
    const { state, world } = scene(0, { [SMALL]: 1 });
    craftAt(state, SMALL, at(2, 0, 0));
    expect(world.step(tickInput())).toEqual([]);
    // A box along the craft's local x: TEST_ORIENTATION's rows put the player, (−3, 0, 0) away, at local (0, 3, 0).
    const { state: boxed, world: boxedWorld, player } = scene(0, { [SMALL]: sphere(5, [box(at(-4, -0.5, -0.5), at(4, 0.5, 0.5))]) });
    const turned = craftAt(boxed, SMALL, at(3, 0, 0));
    expect(boxedWorld.step(tickInput())).toEqual([]);
    turned.orientation = IDENTITY;
    expect(hitList(boxedWorld.step(tickInput()))).toEqual([[player.id, 50], [turned.id, 50]]);
  });

  it('includes the boundary d² = r² and uses this tick\'s moved positions', () => {
    const { state, world, player } = scene();
    const edge = craftAt(state, SMALL, at(5, 0, 0));
    // 6.2 away before the tick, 4.7 after it: in contact in the same tick.
    const coming = craftAt(state, OTHER, at(0, 0, 6.2), { orientation: HEAD_ON, moving: true });
    const events = world.step(tickInput());
    expect(coming.position.z).toBe(f(f(6.2) - STEP));
    expect(hitList(events).map(([victim]) => victim)).toEqual([player.id, edge.id, player.id, coming.id]);
    expect(coming.combat.proximity).toEqual({ entity: player.id, distanceSquared: squared(ORIGIN, coming.position) });
  });

  it('skips craft that are parked, docked or below state 7, and records the player as every other craft\'s nearest object', () => {
    const { state, world, player } = scene();
    const far = craftAt(state, OTHER, at(100, 0, 0));
    const docked = craftAt(state, SMALL, at(1, 0, 0));
    docked.activity = 'docked';
    const source = craftAt(state, SMALL, at(0, 1, 0));
    source.state = 'destroyed-source';
    const parked = state.entities.allocate(entityInit(SMALL_8, { position: at(0, 0, 1), activity: 'parked' })) as CraftEntity;
    expect(world.step(tickInput())).toEqual([]);
    expect([far, docked, source, parked].map((craft) => craft.combat.proximity)).toEqual([{ entity: player.id, distanceSquared: 10000 }, null, null, null]);
  });

  it('does nothing without a player entity, or with a docked player or one below state 7', () => {
    for (const change of [(scene: Scene) => { scene.state.player.entityId = null; }, ({ player }: Scene) => { player.activity = 'docked'; }, ({ player }: Scene) => { player.state = 'destroyed-source'; }]) {
      const current = scene();
      const craft = craftAt(current.state, OTHER, at(1, 0, 0));
      change(current);
      const rng = current.state.rngState;
      // Without a player entity the area check retires the craft (P3-14 FA-07); collision adds nothing.
      expect(current.world.step(tickInput()).filter(({ type }) => type !== 'object-retired')).toEqual([]);
      expect([craft.combat.proximity, current.state.rngState]).toEqual([null, rng]);
    }
  });

  it('destroys the player once: later contacts in the tick push it but damage only the craft', () => {
    const { state, world, player } = scene();
    quiet(player, 30);
    const [first, second] = [craftAt(state, OTHER, at(1, 0, 0)), craftAt(state, OTHER_14, at(0, 1, 0))];
    const events = world.step(tickInput());
    // The destruction entry 0x32d74 follows the player's death (P3-11, ME-09), its switch before its loss (P3-12, FS-03).
    expect(events.map(({ type }) => type)).toEqual(['hit', 'object-destroyed', 'radio-flushed', 'view-switched', 'player-loss-started', 'hit', 'hit']);
    expect(hitList(events)).toEqual([[player.id, 50], [first.id, 50], [second.id, 50]]);
    expect(events[1]).toMatchObject({ entityId: player.id, outcome: 'delayed', attacker: { type: 'none' }, eventClass: 1 });
    expect(blockOf(player).impulse).not.toBeNull();
  });

  it('creates a craft\'s explosion and fragments in the stage; the new fragment does not collide before it is active (CR-08)', () => {
    const { state } = scene();
    const kinds = state.ruleData.craft.map((kind, kindBit) => (kindBit === OTHER ? { ...kind!, parts: 1 } : kind));
    const shedding: WorldState = { ...state, ruleData: { ...state.ruleData, craft: kinds } };
    const craft = craftAt(shedding, OTHER, at(1, 0, 0), { hull: 40 });
    const events = constructWorld(shedding).step(tickInput());
    expect(events.map(({ type }) => type)).toEqual(['hit', 'hit', 'object-destroyed', 'explosion-created']);
    const [explosion] = shedding.entities.walk(1 << 22);
    expect(events[3]).toMatchObject({ entityId: explosion.id, sourceEntityId: craft.id, stage: 'collision', position: craft.position });
    const [fragment] = shedding.entities.walk(1 << 24);
    // Its offset weights are 0, so the fragment starts at the craft's centre, 1 from the player, in the DEBRIS shape.
    expect([craft.state, explosion.state, fragment.state, fragment.position]).toEqual(['destroyed-source', 'presentation-ready', 'presentation-ready', craft.position]);
    expect(fragmentOf(fragment)).toMatchObject({ debris: 0, durability: 1200, handOff: craft.id });
  });

  it('is a Core fault for a craft whose kind has no rule data', () => {
    const { state } = scene();
    craftAt(state, SMALL, at(50, 0, 0));
    const shapeless: WorldState = { ...state, ruleData: { ...state.ruleData, craft: state.ruleData.craft.map((kind, kindBit) => (kindBit === SMALL ? null : kind)) } };
    expectFault(() => constructWorld(shapeless).step(tickInput()), 'invariant-violated', 'collision.craft-shape');
  });
});

describe('0x29670, the player against the fragments (H6, AC-08)', () => {
  it('glances off a small-record fragment for half the raw damage, at most g × 2 + 2 times per tick, counting every contact', () => {
    const { state, world, player } = scene(1);
    const fragments = [0, 1, 2, 3, 4].map((index) => fragmentAt(state, at(index, 0, 0), 0));
    // Raw 150, SAR 1 = 75, ÷ (3 − 1) = 37: the player takes it from the first 4 contacts; every fragment loses it.
    const events = world.step(tickInput());
    expect(hitList(events)).toEqual([[player.id, 37], [player.id, 37], [player.id, 37], [player.id, 37]]);
    expect(fragments.map((fragment) => fragmentOf(fragment).durability)).toEqual([1163, 1163, 1163, 1163, 1163]);
    // A fragment's spinning block has no push fields: it stays as it was. The player holds the last glance's knock.
    expect(fragments[4].movement).toEqual(entityInit(24).movement);
    expect(blockOf(player).impulse).toEqual({ direction: at(0, 0, 1), magnitude: 0 });
    // The counter is the pass's own: the next tick starts again.
    expect(hits(world.step(tickInput()))).toHaveLength(4);
  });

  it('bounces off a large-record fragment for the full damage, which the small-fragment limit does not stop', () => {
    const { state, world, player } = scene();
    const [small, other, large] = [fragmentAt(state, at(1, 0, 0), 0), fragmentAt(state, at(0, 1, 0), 0), fragmentAt(state, at(0, 0, 1), 1)];
    const extra = fragmentAt(state, at(1, 1, 0), 0);
    const rng = state.rngState;
    // Group 0: small contacts give 75 ÷ 3 = 25 twice, the third small one none; the large one 150 ÷ 3 = 50.
    expect(hitList(world.step(tickInput()))).toEqual([[player.id, 25], [player.id, 25], [player.id, 50]]);
    expect([small, other, large, extra].map((fragment) => fragmentOf(fragment).durability)).toEqual([1175, 1175, 1150, 1175]);
    // The large fragment's bounce knocked the player last before the fourth glance.
    let draws = rng;
    for (const fragment of [small, other]) draws = expected(glancingContact, player, fragment, state, draws).rng;
    expect(blockOf(player).impulse).toEqual(expected(glancingContact, player, extra, state, expected(bounceContact, player, large, state, draws).rng).response.first.impulse);
  });

  it('shoots down a fragment whose durability falls to 0 or below; it no longer takes part', () => {
    const { state, world, player } = scene();
    const [spent, kept] = [fragmentAt(state, at(1, 0, 0), 1, 50), fragmentAt(state, at(0, 1, 0), 1, 51)];
    expect(hitList(world.step(tickInput()))).toEqual([[player.id, 50], [player.id, 50]]);
    expect([fragmentOf(spent), fragmentOf(kept)]).toMatchObject([
      { durability: 0, explodeOnExpiry: true, expiry: { type: 'at', clock: 1 } },
      { durability: 1, explodeOnExpiry: false, expiry: { type: 'at', clock: 1e9 } },
    ]);
  });

  it('makes each contact\'s 6 draws and wears each fragment down, also over the limit and with the player\'s destroyed flag set', () => {
    const { state, world, player } = scene();
    player.destroyed = true;
    const fragments = [fragmentAt(state, at(1, 0, 0), 0), fragmentAt(state, at(0, 1, 0), 0), fragmentAt(state, at(0, 0, 1), 0), fragmentAt(state, at(1, 1, 1), 1)];
    const rng = state.rngState;
    expect(world.step(tickInput())).toEqual([]);
    expect(state.rngState).toBe(rngStateAfter(rng, 24));
    expect(fragments.map((fragment) => fragmentOf(fragment).durability)).toEqual([1175, 1175, 1175, 1150]);
  });

  it('skips fragments without DEBRIS parameters, without durability, inactive or below state 7', () => {
    const { state, world } = scene();
    fragmentAt(state, at(1, 0, 0), null, 1200);
    fragmentAt(state, at(0, 1, 0), 0, 0);
    fragmentAt(state, at(0, 0, 1), 0, -5);
    fragmentAt(state, at(1, 1, 0), 0).state = 'pending-removal';
    const rng = state.rngState;
    expect(hits(world.step(tickInput()))).toEqual([]);
    expect(state.rngState).toBe(rng);
  });
});

describe('0x29934, the others against each other (H6, AC-08)', () => {
  it('tests group A\'s centres against later members of A and every member of B, never B against B', () => {
    const { state, world } = scene();
    state.player.entityId = null;
    const [a1, a2, b1, b2] = [craftAt(state, SMALL, at(0, 0, 0)), craftAt(state, SMALL_8, at(2, 0, 0)), craftAt(state, OTHER, at(1, 0, 0)), craftAt(state, OTHER_14, at(1, 0, 0))];
    const rng = state.rngState;
    const events = world.step(tickInput());
    // Pairs (a1, a2), (a1, b1), (a1, b2), (a2, b1), (a2, b2); b1 and b2 overlap and are never tested.
    expect(hitList(events)).toEqual([[a1.id, 50], [a2.id, 50], [a1.id, 50], [b1.id, 50], [a1.id, 50], [b2.id, 50], [a2.id, 50], [b1.id, 50], [a2.id, 50], [b2.id, 50]]);
    let draws = rng;
    for (const [first, second] of [[a1, a2], [a1, b1], [a1, b2], [a2, b1]] as const) draws = expected(glancingContact, first, second, state, draws).rng;
    const last = expected(glancingContact, a2, b2, state, draws).response;
    expect(blockOf(b2).timedRotation).toEqual(last.second!.timedRotation);
  });

  it('tests only the earlier A member\'s centre in an A×A pair, so the list order decides', () => {
    // The wingman (kind bit 1) comes first; its radius 1 never matters, kind 7's radius 5 does.
    const { state, world } = scene(0, { [WINGMAN]: 1 });
    state.player.entityId = null;
    const [wingman, craft] = [craftAt(state, WINGMAN, at(0, 0, 0)), craftAt(state, SMALL, at(3, 0, 0))];
    expect(hitList(world.step(tickInput()))).toEqual([[wingman.id, 50], [craft.id, 50]]);
    const { state: reversed, world: reversedWorld } = scene(0, { [SMALL]: 1 });
    reversed.player.entityId = null;
    craftAt(reversed, WINGMAN, at(0, 0, 0));
    craftAt(reversed, SMALL, at(3, 0, 0));
    // Only the area check's retirements without a player entity (P3-14 FA-07).
    expect(reversedWorld.step(tickInput()).map(({ type }) => type)).toEqual(['object-retired', 'object-retired']);
  });

  it('bounces an A member off a large B member, which takes half the damage and no push', () => {
    const { state, world } = scene();
    state.player.entityId = null;
    const [member, large] = [craftAt(state, SMALL, at(0, 0, 0), { orientation: IDENTITY }), craftAt(state, LARGE_10, at(0, 0, 3))];
    expect(hitList(world.step(tickInput()))).toEqual([[member.id, 50], [large.id, 25]]);
    expect(blockOf(member).impulse!.direction).toEqual(at(0, 0, -1));
    expect(blockOf(large).impulse).toBeNull();
  });

  it('gives the A member the nearest later member, replacing the player\'s only when strictly nearer; B members keep the player', () => {
    const { state, world, player } = scene();
    player.position = at(0, 0, 4);
    const member = craftAt(state, SMALL, ORIGIN);
    const [tie, near, b] = [craftAt(state, SMALL_8, at(4, 0, 0)), craftAt(state, OTHER, at(0, 3, 0)), craftAt(state, OTHER_14, at(0, -3, 0))];
    world.step(tickInput());
    // The player is 16 away; kind 8 is as far (no replacement), kind 13 nearer at 9, kind 14 as near (kept).
    expect(member.combat.proximity).toEqual({ entity: near.id, distanceSquared: 9 });
    // Kind 8 had the player 32 away, then kind 13 at 25 and kind 14 as far (kept); B members keep the player.
    expect([tie, near, b].map((craft) => craft.combat.proximity!.entity)).toEqual([near.id, player.id, player.id]);
    // Without the player, the first pair sets it even when out of contact.
    const { state: alone, world: aloneWorld } = scene();
    alone.player.entityId = null;
    const lone = craftAt(alone, SMALL, ORIGIN);
    const remote = craftAt(alone, OTHER, at(100, 0, 0));
    aloneWorld.step(tickInput());
    expect([lone.combat.proximity, remote.combat.proximity]).toEqual([{ entity: remote.id, distanceSquared: 10000 }, null]);
  });

  it('keeps a member destroyed in an earlier pair listed: it still pushes, without damage or another object-destroyed', () => {
    const { state, world } = scene();
    state.player.entityId = null;
    const member = craftAt(state, SMALL, ORIGIN, { hull: 40 });
    const [b1, b2] = [craftAt(state, OTHER, at(1, 0, 0)), craftAt(state, OTHER_14, at(0, 1, 0))];
    const events = world.step(tickInput());
    // Then the area check, without a player entity, retires the two still in state 7 (P3-14 FA-07).
    expect(events.map(({ type }) => type)).toEqual(['hit', 'object-destroyed', 'explosion-created', 'hit', 'hit', 'object-retired', 'object-retired']);
    expect(hitList(events)).toEqual([[member.id, 50], [b1.id, 50], [b2.id, 50]]);
    expect(member.state).toBe('destroyed-source');
    expect(blockOf(b2).impulse).toEqual({ direction: at(0, 0, 1), magnitude: 0 });
  });

  it('runs after the player pass: a craft destroyed there is no longer in state 7', () => {
    const { state, world, player } = scene();
    const member = craftAt(state, SMALL, at(0, 0, 1), { hull: 40 });
    craftAt(state, OTHER, at(0, 0, 2));
    const events = world.step(tickInput());
    // Player pass: (player, member), (player, kind 13); the destroyed member is not listed for its own pass.
    expect(events.map(({ type }) => type)).toEqual(['hit', 'hit', 'object-destroyed', 'explosion-created', 'hit', 'hit']);
    expect(hitList(events).map(([victim]) => victim)).toEqual([player.id, member.id, player.id, member.id + 1]);
  });
});
