import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { compareReplayResults } from '../replay/compare.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { shootDown } from '../rules/fragments.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import type { Entity, ExplosionCombat, FragmentCombat } from '../world/entity-table.ts';
import { addPlayerEntity, entityInit, expectFault, stillEntityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyContactDamage } from './damage.ts';
import { constructExplosion, delayedPlayerExplosionStage, destroyEntity } from './destruction.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-02 to CR-08 and CR-11; docs/original/formats/executable.md, X1, X2, X4, X6, X7 and X9.
// Expected ticks are worked out from the recorded timing: a destruction in tick N outside object update gives the
// explosion's activation at N+1, part 0's hand-off at N+2 and the source's removal at N+3; at 2 clock units per tick a
// held source is released 28 ticks (12 frames) or 14 ticks (6 frames) after the activation, and the explosion asks for
// removal 49 ticks after it and leaves one tick later; the player explodes in the first tick whose clock is past its
// destruction clock + 0xC0 (97 ticks later), and its pod expires 0x140 units (160 ticks) after its first callback.
//
// The ticks are the formal step, every PIPELINE stage in order, so explosions, fragments (CR-03, P3-07/35) and missiles
// (CR-09, P3-07/22) move; hooks only add the destruction a test needs.

type Hooks = Readonly<Record<string, (context: TickContext) => void>>;

/** One formal tick; each hook runs just before the stage of its ID. Returns the tick's events. */
function tick(state: WorldState, hooks: Hooks = {}): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    hooks[stage.id]?.(context);
    stage.run?.(context);
  }
  return context.events;
}

/** Runs ticks until `tick` is the world's last one, returning the events of each. */
function runTo(state: WorldState, last: number): (readonly DomainEvent[])[] {
  const events: (readonly DomainEvent[])[] = [];
  while (state.tick < last) events.push(tick(state));
  return events;
}

const types = (events: readonly DomainEvent[]): string[] => events.map(({ type }) => type);

/** Kind bits with rule data of these shapes (CR-01): two small-kind parts, one large-kind part, no parts. */
const SMALL = 7;
const LARGE = 10;
const PARTLESS = 13;

/**
 * The test world with the player standing at (0, 2, 3), and rule data for SMALL (DEBRIS records 0 small and 1 large),
 * LARGE (one large record) and PARTLESS. The player's own rule data has 4 parts: the pod, parts 1 and 2 without objects,
 * and part 3 on record 0. The player's automatic target selection (CR-07) is never due, so it adds no event.
 */
function world(): { readonly state: WorldState; readonly player: CraftEntity } {
  const base = testState();
  const { craft } = base.ruleData;
  const own = craft[0]!;
  const [small] = own.debris;
  const large = { ...small, small: false };
  const kinds = [...craft];
  kinds[SMALL] = { ...own, parts: 2, debris: [small, large] };
  kinds[LARGE] = { ...own, parts: 1, debris: [large] };
  kinds[PARTLESS] = { ...own, parts: 0, debris: [] };
  const state: WorldState = { ...base, ruleData: { ...base.ruleData, craft: kinds } };
  // The player entity's declaration, whose runtime record the rescue at the pod's expiry rewrites (P3-11, rescue.ts).
  const player = addPlayerEntity(state, { source: { collection: 'mission', index: 0, group: null } }) as CraftEntity;
  state.player.targeting = { ...state.player.targeting!, autoTargetDueClock: 1e9 };
  return { state, player };
}

/** A standing craft of `kindBit` near the player, without shield and with 1 hull. */
function craftIn(state: WorldState, kindBit: number): CraftEntity {
  const craft = state.entities.allocate(stillEntityInit(kindBit, { position: { x: 10 + kindBit, y: 20, z: 30 } })) as CraftEntity;
  // No energy update recharges the shield meanwhile.
  Object.assign(craft.combat, { shield: 0, hull: 1, nextEnergyClock: 1e9 });
  return craft;
}

/** The entities of `kindBit`, in allocation order. */
const ofKind = (state: WorldState, kindBit: number): Entity[] => [...state.entities.walk(1 << kindBit)];
const explosionOf = (entity: Entity): ExplosionCombat => entity.combat as ExplosionCombat;
const fragmentOf = (entity: Entity): FragmentCombat => entity.combat as FragmentCombat;

/** Sets the world RNG to the first state whose next `count` rand values `accept` takes. */
function drawNext(state: WorldState, count: number, accept: (values: readonly number[]) => boolean): number {
  for (let candidate = 0; ; candidate++) {
    if (accept(randValues(candidate, count))) {
      state.rngState = candidate;
      return candidate;
    }
  }
}

describe('a craft destroyed outside object update (X1, X2, X9, CR-08, AC-12)', () => {
  it('explodes, sheds its parts and hands off: activation at N+1, hand-off at N+2, the source gone at N+3', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    tick(state);
    // Tick N = 2: destroyed in the collision stage, as P3-07/19's contacts do.
    const destroyedAt = tick(state, { collision: (context) => applyContactDamage(context, enemy, 5, 'collision') });
    expect(types(destroyedAt)).toEqual(['hit', 'object-destroyed']);
    expect(destroyedAt[1]).toMatchObject({ entityId: enemy.id, outcome: 'explodes' });
    const [explosion] = ofKind(state, 22);
    const [part0, part1] = ofKind(state, 24);
    // Allocated in the constructor's order: the explosion, then the parts.
    expect([explosion.id, part0.id, part1.id]).toEqual([enemy.id + 1, enemy.id + 2, enemy.id + 3]);
    expect([enemy.state, explosion.state, part0.state, part1.state]).toEqual(['destroyed-source', 'presentation-ready', 'presentation-ready', 'presentation-ready']);
    expect(explosionOf(explosion)).toMatchObject({ source: enemy.id, sourceKindBit: SMALL, variant: 'other', heldSource: null, activationClock: null });
    expect([fragmentOf(part0).handOff, fragmentOf(part1).handOff]).toEqual([enemy.id, null]);

    const activatedAt = tick(state);
    expect(activatedAt).toEqual([{
      type: 'explosion-started', tick: 3, entityId: explosion.id, sourceEntityId: enemy.id, sourceKindBit: SMALL, variant: 'other',
      position: enemy.position, activationClock: state.clock,
    }]);
    expect([explosion.state, part0.state, part1.state, enemy.state]).toEqual(['active', 'active', 'active', 'destroyed-source']);
    expect([fragmentOf(part0).expiry.type, fragmentOf(part1).expiry.type]).toEqual(['at', 'at']);

    // The hand-off retires the source where it writes its state, before its own event (P3-14 FA-07).
    expect(tick(state)).toEqual([
      { type: 'object-retired', tick: 4, entityId: enemy.id, kindBit: SMALL, state: 'pending-removal' },
      { type: 'source-released', tick: 4, entityId: enemy.id, kindBit: SMALL, fragmentEntityId: part0.id, removed: true },
    ]);
    expect([enemy.state, fragmentOf(part0).handOff]).toEqual(['pending-removal', null]);
    expect(tick(state)).toEqual([]);
    expect(state.entities.get(enemy.id)).toBeUndefined();
  });

  it('asks for the explosion\'s removal 49 ticks after its activation and removes it at 50', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    tick(state, { collision: (context) => destroyEntity(context, enemy) });
    const [explosion] = ofKind(state, 22);
    tick(state);
    const activation = state.tick;
    runTo(state, activation + 48);
    expect(explosion.state).toBe('active');
    tick(state);
    expect([state.tick - activation, explosion.state]).toEqual([49, 'pending-removal']);
    tick(state);
    expect(state.entities.get(explosion.id)).toBeUndefined();
  });

  it('draws flag, push, spin and axis per small-kind part at construction, then one expiry draw each at the first callback', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    // Neither flag set: rand values 0 and 4 of the construction are not multiples of 8.
    const start = drawNext(state, 8, ([first, , , , second]) => (first & 7) !== 0 && (second & 7) !== 0);
    tick(state, { collision: (context) => constructExplosion(context, enemy) });
    expect(state.rngState).toBe(rngStateAfter(start, 8));
    const parts = ofKind(state, 24);
    expect(parts.map((part) => fragmentOf(part))).toMatchObject([
      { part: 0, debris: 0, durability: 1200, explodeOnExpiry: false },
      { part: 1, debris: 1, durability: 4000, explodeOnExpiry: false },
    ]);
    const firstCallback = state.clock + 2;
    const [part0Draw, part1Draw] = randValues(state.rngState, 2);
    tick(state);
    expect(state.rngState).toBe(rngStateAfter(start, 10));
    expect(parts.map((part) => fragmentOf(part).expiry)).toEqual([
      { type: 'at', clock: firstCallback + 0x3c0 + (part0Draw % 0x200) },
      { type: 'at', clock: firstCallback + 0x3c0 + (part1Draw % 0x200) },
    ]);
  });

  it('never expires a large kind\'s fragment and calls it large; draws push, spin and axis only', () => {
    const { state } = world();
    const enemy = craftIn(state, LARGE);
    const before = state.rngState;
    tick(state, { collision: (context) => constructExplosion(context, enemy) });
    expect(state.rngState).toBe(rngStateAfter(before, 3));
    const [explosion] = ofKind(state, 22);
    const [part] = ofKind(state, 24);
    expect(explosionOf(explosion).variant).toBe('large');
    tick(state);
    expect(fragmentOf(part)).toMatchObject({ expiry: { type: 'never' }, explodeOnExpiry: false, durability: 4000 });
    expect(state.rngState).toBe(rngStateAfter(before, 3));
    runTo(state, state.tick + 600);
    expect(part.state).toBe('active');
  });

  it('leaves the source a destroyed source when part 0 goes before its hand-off (CR-08, conflict 20)', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    tick(state, { collision: (context) => destroyEntity(context, enemy) });
    const [part0] = ofKind(state, 24);
    // As the area check would after part 0's first move.
    tick(state, { 'area-check': () => void (part0.state = 'pending-removal') });
    const events = runTo(state, state.tick + 5);
    expect(state.entities.get(part0.id)).toBeUndefined();
    expect(events.flat().filter(({ type }) => type === 'source-released')).toEqual([]);
    expect(enemy.state).toBe('destroyed-source');
  });
});

describe('a held source (X2, X4, CR-08, AC-12)', () => {
  it('holds a craft without parts and releases it 28 ticks after the activation (12 frames); it leaves one tick later', () => {
    const { state } = world();
    const enemy = craftIn(state, PARTLESS);
    tick(state, { collision: (context) => constructExplosion(context, enemy) });
    const [explosion] = ofKind(state, 22);
    expect([ofKind(state, 24), explosionOf(explosion).heldSource]).toEqual([[], enemy.id]);
    tick(state);
    const activation = state.tick;
    runTo(state, activation + 27);
    expect(enemy.state).toBe('destroyed-source');
    // P3-14 FA-07: the animation's end retires the held source, in request handling.
    expect(tick(state)).toEqual([{ type: 'object-retired', tick: state.tick, entityId: enemy.id, kindBit: PARTLESS, state: 'pending-removal' }]);
    expect([state.tick - activation, enemy.state, explosionOf(explosion).heldSource]).toEqual([28, 'pending-removal', null]);
    tick(state);
    expect(state.entities.get(enemy.id)).toBeUndefined();
    expect(explosion.state).toBe('active');
    // The explosion's own end (X4) retires it once, 49 ticks after the activation; it leaves at its next update.
    const ended = runTo(state, activation + 60).flat().filter(({ type }) => type === 'object-retired');
    expect(ended).toEqual([{ type: 'object-retired', tick: expect.any(Number), entityId: explosion.id, kindBit: 22, state: 'pending-removal' }]);
    expect(state.entities.get(explosion.id)).toBeUndefined();
  });

  it('holds a missile in a missile explosion and releases it 14 ticks after the activation (6 frames)', () => {
    const { state } = world();
    const missile = state.entities.allocate(entityInit(20, { position: { x: 5, y: 5, z: 5 } }));
    missile.state = 'active';
    // A detonated missile's G is in phase 4, so its state-7 callback does nothing more (P3-07/20).
    Object.assign(missile.combat, {
      guidance: { phase: 4, lifetimeClock: 0, armClock: 0, fuseRadiusSquared: 0, detonationClock: 0, checkInterval: 0, nextCheckClock: 0 },
    });
    tick(state, { 'request-handling': (context) => constructExplosion(context, missile) });
    const [explosion] = ofKind(state, 22);
    expect(explosionOf(explosion)).toMatchObject({ variant: 'missile', sourceKindBit: 20, heldSource: missile.id });
    expect(explosion.presentation).toEqual({ type: 'explosion', variant: 'missile' });
    tick(state);
    const activation = state.tick;
    const held = missile.position;
    runTo(state, activation + 13);
    expect(missile.state).toBe('destroyed-source');
    // The held missile keeps moving by mode 0 with its body record (X9, CR-09): 48 units/s along row 3, (0, 0, 1).
    expect(missile.position).toEqual({ ...held, z: held.z + 13 * 1.5 });
    tick(state);
    expect(missile.state).toBe('pending-removal');
    tick(state);
    expect(state.entities.get(missile.id)).toBeUndefined();
  });

  it('lets go of the source through release-held when the explosion is removed first, as the area check does', () => {
    const { state } = world();
    const enemy = craftIn(state, PARTLESS);
    tick(state, { collision: (context) => constructExplosion(context, enemy) });
    const [explosion] = ofKind(state, 22);
    tick(state, { 'area-check': () => void (explosion.state = 'pending-removal') });
    // P3-14 FA-07: message 0x40 retires the source it lets go of.
    expect(tick(state)).toEqual([{ type: 'object-retired', tick: state.tick, entityId: enemy.id, kindBit: PARTLESS, state: 'pending-removal' }]);
    expect([state.entities.get(explosion.id), enemy.state]).toEqual([undefined, 'pending-removal']);
    tick(state);
    expect(state.entities.get(enemy.id)).toBeUndefined();
  });

  it('does nothing for a source that was removed or has no movement block', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    const parked = state.entities.allocate(entityInit(PARTLESS, { activity: 'parked' }));
    state.entities.remove(enemy);
    const context = registerTick(state, readTickInput(tickInput()));
    const before = state.rngState;
    for (const source of [enemy, parked]) constructExplosion(context, source);
    expect([ofKind(state, 22), ofKind(state, 24), enemy.state, parked.state, state.rngState]).toEqual([[], [], 'presentation-ready', 'new', before]);
  });
});

describe('objects made in object update (X9, CR-08, CR-11 difference 5)', () => {
  it('activates the explosion and the fragments in the same tick, so everything starts one tick earlier', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    // P3-08's area damage builds the explosion during the walk; built before the walk, it is visited the same way.
    const events = tick(state, { 'object-update': (context) => constructExplosion(context, enemy) });
    const [explosion] = ofKind(state, 22);
    const parts = ofKind(state, 24);
    expect(types(events)).toEqual(['explosion-started']);
    expect([explosion.state, ...parts.map(({ state: partState }) => partState)]).toEqual(['active', 'active', 'active']);
    expect(types(tick(state))).toEqual(['object-retired', 'source-released']);
    tick(state);
    expect(state.entities.get(enemy.id)).toBeUndefined();
  });
});

describe('the player\'s delayed explosion and escape pod (X2, X7, CR-04, AC-12)', () => {
  it('explodes 97 ticks after its destruction, keeps the player, and times the pod from its own first callback', () => {
    const { state, player } = world();
    Object.assign(player.combat, { shield: 0, hull: 1 });
    const destroyedAt = tick(state, { collision: (context) => applyContactDamage(context, player, 5, 'collision') });
    // The destruction entry 0x32d74's flush and loss event follow it (P3-11, ME-13).
    expect(destroyedAt.slice(-3)).toMatchObject([
      { type: 'object-destroyed', entityId: player.id, outcome: 'delayed' }, { type: 'radio-flushed', cause: 'player-destroyed' },
      { type: 'player-loss-started', loss: 'destroyed' },
    ]);
    const destruction = state.tick;
    expect(state.player.delayedExplosionClock).toBe(state.clock + 0xc0);
    runTo(state, destruction + 96);
    expect([ofKind(state, 22), player.state]).toEqual([[], 'active']);

    expect(tick(state)).toEqual([]);
    expect(state.tick - destruction).toBe(97);
    const [explosion] = ofKind(state, 22);
    const [pod, part3] = ofKind(state, 24);
    expect([player.state, state.player.delayedExplosionClock, state.player.followedEntity]).toEqual(['destroyed-source', null, pod.id]);
    expect(explosionOf(explosion)).toMatchObject({ source: player.id, sourceKindBit: 0, variant: 'other', heldSource: null });
    expect([fragmentOf(pod), fragmentOf(part3)]).toMatchObject([
      { part: 0, debris: null, durability: 0, handOff: player.id }, { part: 3, debris: 0, handOff: null },
    ]);
    expect(pod.presentation).toMatchObject({ type: 'fragment', part: 0, display: 'parts-0-2' });

    expect(types(tick(state))).toEqual(['explosion-started']);
    const podFirstCallback = state.clock;
    expect(fragmentOf(pod).expiry).toEqual({ type: 'at', clock: podFirstCallback + 0x140 });
    expect(tick(state)).toEqual([{ type: 'source-released', tick: state.tick, entityId: player.id, kindBit: 0, fragmentEntityId: pod.id, removed: false }]);
    expect(player.state).toBe('destroyed-source');

    const firstCallbackTick = state.tick - 1;
    const quiet = runTo(state, firstCallbackTick + 159).flat().filter(({ type }) => type === 'fragment-expired');
    expect(quiet).toEqual([]);
    const expired = tick(state);
    expect(state.tick - firstCallbackTick).toBe(160);
    expect(expired[0]).toEqual({ type: 'fragment-expired', tick: state.tick, entityId: pod.id, sourceKindBit: 0, part: 0, position: pod.position, outcome: 'escape-pod' });
    // P3-11's loss handling then rescues the same entity (rescue.test.ts): `player-rescued` and its transition; then the
    // pod's retirement where its state is written, and part 3's, which expires in the same tick (P3-14 FA-07).
    expect(expired.slice(-4)).toMatchObject([
      { type: 'player-rescued', playerEntityId: player.id, loss: 'destroyed' }, { type: 'transition', gap: 'G-02/5' },
      { type: 'object-retired', entityId: pod.id, kindBit: 24, state: 'pending-removal' },
      { type: 'object-retired', entityId: part3.id, kindBit: 24, state: 'pending-removal' },
    ]);
    expect([state.player.followedEntity, pod.state, player.state, state.entities.get(player.id)]).toEqual([null, 'pending-removal', 'active', player]);
    tick(state);
    expect(state.entities.get(pod.id)).toBeUndefined();
  });

  it('builds nothing for the player while its armed delay is after the clock, and arms it only once', () => {
    const { state, player } = world();
    state.player.delayedExplosionClock = 500;
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = context.time.clock;
    destroyEntity(context, player);
    expect([ofKind(state, 22), player.state, state.player.delayedExplosionClock]).toEqual([[], 'presentation-ready', 500]);
  });

  it('waits for the player\'s entity: no explosion while the player has none', () => {
    const { state, player } = world();
    state.player.delayedExplosionClock = 10;
    state.entities.remove(player);
    state.player.entityId = null;
    runTo(state, 20);
    expect([ofKind(state, 22), state.player.delayedExplosionClock]).toEqual([[], 10]);
  });

  it('runs as the delayed-player-explosion stage, after collisions', () => {
    const { state, player } = world();
    state.player.delayedExplosionClock = 0;
    const context = registerTick(state, readTickInput(tickInput()));
    state.clock = context.time.clock;
    delayedPlayerExplosionStage!(context);
    expect([ofKind(state, 22).length, player.state, state.player.delayedExplosionClock]).toEqual([1, 'destroyed-source', null]);
  });

  it('removes the wingman\'s pod on its expiry 0x780 after its first callback, with nothing else', () => {
    const { state } = world();
    const kinds = [...state.ruleData.craft];
    kinds[1] = { ...kinds[0]!, parts: 1, debris: [] };
    const withWingman: WorldState = { ...state, ruleData: { ...state.ruleData, craft: kinds } };
    const wingman = craftIn(withWingman, 1);
    tick(withWingman, { collision: (context) => constructExplosion(context, wingman) });
    const [pod] = ofKind(withWingman, 24);
    expect(withWingman.player.followedEntity).toBeNull();
    tick(withWingman);
    const firstCallbackTick = withWingman.tick;
    const events = runTo(withWingman, firstCallbackTick + 0x780 / 2).flat();
    expect(events.filter(({ type }) => type === 'fragment-expired')).toEqual([{
      type: 'fragment-expired', tick: firstCallbackTick + 0x3c0, entityId: pod.id, sourceKindBit: 1, part: 0, position: pod.position, outcome: 'wingman-pod',
    }]);
    expect(pod.state).toBe('pending-removal');
    tick(withWingman);
    expect(withWingman.entities.get(pod.id)).toBeUndefined();
  });
});

describe('a fragment shot down (H4, X7, CR-08)', () => {
  it('expires at its next callback and becomes the held source of its own explosion, released at the end of its animation', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    tick(state, { collision: (context) => destroyEntity(context, enemy) });
    const [, part1] = ofKind(state, 24);
    tick(state);
    tick(state, { collision: () => void expect(shootDown(fragmentOf(part1))).toBe(true) });
    // It expires in request handling, before this tick's movement, which still moves it as a destroyed source (X9).
    const before = part1.position;
    const expired = tick(state);
    expect(expired).toEqual([{ type: 'fragment-expired', tick: state.tick, entityId: part1.id, sourceKindBit: SMALL, part: 1, position: before, outcome: 'explodes' }]);
    const [, second] = ofKind(state, 22);
    expect(explosionOf(second)).toMatchObject({ source: part1.id, sourceKindBit: 24, variant: 'other', heldSource: part1.id });
    expect(part1.state).toBe('destroyed-source');
    expect(part1.position).not.toEqual(before);
    expect(types(tick(state))).toEqual(['explosion-started']);
    const activation = state.tick;
    runTo(state, activation + 28);
    expect(part1.state).toBe('pending-removal');
    tick(state);
    expect(state.entities.get(part1.id)).toBeUndefined();
  });

  it('removes an ordinary fragment on its expiry', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    tick(state, { collision: (context) => destroyEntity(context, enemy) });
    const [part0] = ofKind(state, 24);
    tick(state);
    const expiry = fragmentOf(part0).expiry;
    if (expiry.type !== 'at') throw new Error('no expiry');
    const events = runTo(state, Math.ceil(expiry.clock / 2) + 1).flat();
    const own = events.filter((event) => event.type === 'fragment-expired' && event.entityId === part0.id);
    expect(own).toMatchObject([{ tick: Math.ceil(expiry.clock / 2), outcome: 'removed' }]);
    expect(state.entities.get(part0.id)).toBeUndefined();
    expect(fragmentOf(part0).expiry).toEqual({ type: 'never' });
  });
});

describe('the events (CR-06)', () => {
  it('are accepted by the replay comparator', () => {
    const { state } = world();
    const enemy = craftIn(state, SMALL);
    const events = [tick(state, { collision: (context) => destroyEntity(context, enemy) }), tick(state), tick(state)];
    expect(events.flat().map(({ type }) => type)).toEqual(['explosion-started', 'object-retired', 'source-released']);
    const result = { events: events.flat(), checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: 3, hash: '1'.repeat(16) }], finalTick: 3 };
    expect(compareReplayResults(result, result)).toEqual({ match: true });
  });

  it('fault on an explosion or fragment left in state new', () => {
    for (const kindBit of [22, 24]) {
      const { state } = world();
      const entity = state.entities.allocate(entityInit(kindBit));
      entity.state = 'new';
      expectFault(() => tick(state), 'invariant-violated', kindBit === 22 ? 'destruction.explosion-state' : 'destruction.fragment-state');
    }
  });
});
