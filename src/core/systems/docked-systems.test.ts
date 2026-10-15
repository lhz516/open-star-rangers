import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { missile, missileBody } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CollisionShape } from '../rules/collision-shapes.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { craftInfoContent } from '../world/create-world.test-support.ts';
import type { MissileEntity } from '../rules/guidance.ts';
import { allocatorAiState, blankCraftCombat, type Entity, type EntityInit, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import { constructWorld, type World } from '../world/world.ts';
import { entityInit, stateText, stillEntityInit, TEST_RULE_INPUTS, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { engageParked } from './parked-engagement.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';
import { addActive, BASE_KIND_BIT, HOSTILE_KIND_BIT, radioScene, WINGMAN_KIND_BIT } from './radio.test-support.ts';

// The systems while docked (docs/plan/p3/10/spec.md, 停靠中的其他系统, S-08, AC-11; docs/plan/p3/02/spec.md, CB-10,
// CB-11, CB-17 decision 7; docs/original/formats/executable.md, DK4 and its consequences), run together through the
// formal step from a docking the docking chain itself performs. Expectations are written out from DK4, H5 and the
// records below; each system's own docked filter has its unit test (movement, energy, collision, hit-tests, missiles,
// guidance, targeting, area). Not wired yet, so tested only as this task's entry and state: the AI candidate searches
// (P3-08) and the destruction and rescue path `0x32d74` (P3-11); the map toggle (P3-09) is set up as its state.

const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Row 3 (forward) along +x, so that a drift moves in the active area's plane. */
const FORWARD_X = Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as Matrix3;
const BASE_POSITION = at(300, 0, 0);
/** The launch from the base's identity pose: 1000 units along its row 1 (DK3). */
const LAUNCH_POSITION = at(1300, 0, 0);
/** A craft of kind 2 (`0x87c`), neither wingman nor base. */
const CRAFT_KIND_BIT = 2;
/** The missile record: damage 700 over distances 2 to 12 (H5), so 350 at 7. */
const DAMAGE = 700;
const INNER = 2;
const OUTER = 12;
/** The index dockedScene gives that record. */
let missileRecord = 0;

/** A sphere of `radius` with a box of half-size 4 inside it, so that both a contact and a projectile's path find it. */
const sphere = (radius: number): CollisionShape => ({
  radius, radiusSquared: radius * radius, bounds: { lower: at(-radius, -radius, -radius), upper: at(radius, radius, radius) },
  boxes: [{ lower: at(-4, -4, -4), upper: at(4, 4, 4) }], innerBox: null,
});

interface DockedScene {
  readonly state: WorldState;
  readonly world: World;
  readonly player: CraftEntity;
  readonly base: Entity;
  readonly wingman: CraftEntity;
  readonly step: (commands?: readonly Command[]) => DomainEvent[];
}

/**
 * The radio scene's player docked at tick 1 (clock 2) by the formal step, sub-state 4 being due at once: a base at
 * BASE_POSITION with the identity rows, a wingman at `wingmanAt`, every craft a sphere of radius 5 that sheds nothing
 * and one unguided missile record. The player and wingman have shield 1000 and hull 100 after the docking's repair.
 */
function dockedScene({ wingmanAt = at(350, 0, 0), player: playerInit = {}, armHostile = false }: { wingmanAt?: Vec3; player?: Partial<EntityInit>; armHostile?: boolean } = {}): DockedScene {
  const radio = radioScene();
  const info = craftInfoContent();
  const record = { body: 0, at18: 0, at20: 0, at44: 320, at48: 32, at4C: 4, at54: 6, at58: 9, at5C: DAMAGE, at60: INNER, at64: OUTER };
  // Appended, as the player's record's mounts index the content's own missiles.
  info.missiles = [...info.missiles, missile({ ...record, body: info.missileBodies.length })];
  info.missileBodies = [...info.missileBodies, missileBody({ atAC: 1, atB0: 2, atB4: 3, atB8: 64 })];
  // With `armHostile`, the hostile kind carries the player's record and mounts.
  if (armHostile) info.craft[HOSTILE_KIND_BIT] = info.craft[0];
  const { ruleData } = radio.state;
  const armed = (kindBit: number): boolean => kindBit === 0 || (armHostile && kindBit === HOSTILE_KIND_BIT);
  const craft = ruleData.craft.map((_, kindBit): CraftRuleData =>
    (armed(kindBit) ? { ...ruleData.craft[0]!, shape: sphere(5) } : { shape: sphere(5), mountOffsets: [], parts: 0, debris: [] }));
  const state: WorldState = {
    ...radio.state,
    craftInfo: { ...radio.state.craftInfo, content: readCraftInfo(info) },
    ruleData: { ...ruleData, craft, missiles: [...ruleData.missiles, { range: 0, rangeSquared: 0, fuseRadiusSquared: 16 }] },
  };
  missileRecord = info.missiles.length - 1;
  const player = radio.player as CraftEntity;
  Object.assign(player, playerInit);
  const base = addActive(radio, BASE_KIND_BIT, { position: BASE_POSITION, orientation: IDENTITY });
  const wingman = addActive(radio, WINGMAN_KIND_BIT, { position: wingmanAt }) as CraftEntity;
  Object.assign(state.flow, { subState: 4, dockingDeadline: 0 });
  state.player.dockingObject = base.id;
  const world = constructWorld(state);
  const step = (commands: readonly Command[] = []): DomainEvent[] => [...world.step(tickInput(commands))];
  expect(step()).toContainEqual(expect.objectContaining({ type: 'docked', tick: 1, wingmanEntityId: wingman.id }));
  for (const docked of [player, wingman]) Object.assign(docked.combat, { shield: 1000, hull: 100 });
  return { state, world, player, base, wingman, step };
}

const blockOf = (entity: Entity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;
const distanceSquared = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const ofType = (events: readonly DomainEvent[], ...types: DomainEvent['type'][]): DomainEvent[] => events.filter(({ type }) => types.includes(type));

/** A standing craft of `kindBit` in state 7 at `position`, shield 1000 and hull 100, recharged by nothing. */
function craftAt({ state }: DockedScene, kindBit: number, position: Vec3): CraftEntity {
  const craft = state.entities.allocate(stillEntityInit(kindBit, { position, orientation: IDENTITY })) as CraftEntity;
  craft.state = 'active';
  Object.assign(craft.combat, { shield: 1000, hull: 100, nextEnergyClock: 1e9 });
  return craft;
}

/** Runs one tick through the formal stages, posting `request`s in mission flow; returns its events. */
function tickWith(state: WorldState, post: (context: TickContext) => void): readonly DomainEvent[] {
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    if (stage.id === 'mission-flow') post(context);
    stage.run?.(context);
  }
  return context.events;
}

/** An unguided missile at `position` whose expiry detonates it (H5). */
function detonatingMissile({ state }: DockedScene, position: Vec3): MissileEntity {
  const entity = state.entities.allocate(entityInit(20, {
    position,
    orientation: IDENTITY,
    presentation: { type: 'missile', missile: missileRecord },
    combat: {
      type: 'missile', missile: missileRecord, shooter: null, target: null, launchByte: 4, program: 'unguided', detonate: true, contact: null,
      guidance: { phase: 4, lifetimeClock: 1e6, armClock: 0, fuseRadiusSquared: 16, detonationClock: 6, checkInterval: 9, nextCheckClock: 1e9 }, homing: null,
    },
  })) as MissileEntity;
  entity.state = 'active';
  return entity;
}

describe('movement and energy while docked (DK4)', () => {
  it('moves the docked player and wingman by their own blocks, without an energy update, until the launch resumes it', () => {
    const scene = dockedScene();
    const { player, wingman, step } = scene;
    // 32 and 16 units/s at their commanded speeds: 1 and 0.5 units per tick of 1/32 s along row 3.
    Object.assign(blockOf(player), { speed: 32, commandedSpeed: 32, atCommandedSpeed: true });
    Object.assign(blockOf(wingman), { speed: 16, commandedSpeed: 16, atCommandedSpeed: true });
    Object.assign(wingman.combat, { energy: 500, nextEnergyClock: 0 });
    player.combat.nextEnergyClock = 0;
    const [playerStart, wingmanStart] = [player.position, wingman.position];
    for (let tick = 0; tick < 10; tick++) step();
    expect(distanceSquared(player.position, playerStart)).toBeCloseTo(100, 6);
    expect(distanceSquared(wingman.position, wingmanStart)).toBeCloseTo(25, 6);
    expect([player.activity, wingman.activity]).toEqual(['docked', 'docked']);
    expect([player.combat.nextEnergyClock, wingman.combat.nextEnergyClock, wingman.combat.energy]).toEqual([0, 0, 500]);
    // The launch places the player from the saved pose; the block keeps its speed, and the energy update runs again.
    step([{ type: 'launch' }]);
    expect(blockOf(player)).toMatchObject({ speed: 32, commandedSpeed: 32 });
    expect([player.combat.nextEnergyClock > 0, wingman.combat.nextEnergyClock > 0]).toEqual([true, true]);
  });
});

describe('contacts while docked (DK4)', () => {
  it('keeps the docked player and wingman out of the collision passes until the launch', () => {
    const scene = dockedScene();
    const { player, wingman, step } = scene;
    const onPlayer = craftAt(scene, CRAFT_KIND_BIT, player.position);
    const onWingman = craftAt(scene, CRAFT_KIND_BIT, wingman.position);
    const events = [step(), step(), step()].flat();
    expect(ofType(events, 'hit', 'object-destroyed')).toEqual([]);
    expect([player.combat.hull, wingman.combat.hull, onPlayer.combat.hull, onWingman.combat.hull]).toEqual([100, 100, 100, 100]);
    expect([onPlayer.combat.proximity, onWingman.combat.proximity, wingman.combat.proximity]).toEqual([null, null, null]);
    // Active again, the wingman takes part where it stands: the pair test makes the craft on it its nearest object; the
    // player, placed 1000 units away, is every craft's nearest object.
    step([{ type: 'launch' }]);
    expect(wingman.combat.proximity).toEqual({ entity: onWingman.id, distanceSquared: 0 });
    expect(onPlayer.combat.proximity).toEqual({ entity: player.id, distanceSquared: distanceSquared(onPlayer.position, player.position) });
  });

  it('lets a missile\'s detonation hit the docked player and wingman (H5), whose docking stays', () => {
    const scene = dockedScene({ wingmanAt: at(0, 7, 7) });
    const { state, player, wingman } = scene;
    const entity = detonatingMissile(scene, at(0, 0, 7));
    const events = tickWith(state, ({ requests }) => requests.post({ type: 'expire', entityId: entity.id }));
    // 700 × (1 − (7 − 2) ÷ 10) at 7 units, the shield taking it.
    expect(ofType(events, 'hit')).toEqual([
      expect.objectContaining({ victimEntityId: player.id, cause: 'missile', damage: 350 }),
      expect.objectContaining({ victimEntityId: wingman.id, cause: 'missile', damage: 350 }),
    ]);
    expect([player.activity, wingman.activity, state.flow.subState, state.player.viewMode]).toEqual(['docked', 'docked', 5, 6]);
  });

  it('leaves a docked player its docking when destroyed: the rescue path 0x32d74 is P3-11\'s and not wired', () => {
    const scene = dockedScene();
    const { state, player, base, step } = scene;
    Object.assign(player.combat, { shield: 0, hull: 10 });
    const entity = detonatingMissile(scene, at(0, 0, 7));
    tickWith(state, ({ requests }) => requests.post({ type: 'expire', entityId: entity.id }));
    expect(player.destroyed).toBe(true);
    expect([player.activity, state.flow.subState, state.player.dockingObject, state.player.viewMode, state.baseService !== null]).toEqual(['docked', 5, base.id, 6, true]);
    // A destroyed player cannot launch; this task's state waits for P3-11's entry.
    expect(ofType(step([{ type: 'launch' }]), 'command-result', 'departed')).toEqual([
      { type: 'command-result', tick: 3, commandIndex: 0, commandType: 'launch', outcome: 'ignored', reason: 'player-unavailable' },
    ]);
  });
});

describe('projectiles and parked engagement while docked (DK4)', () => {
  /** An active gun-0 projectile at `from` moving 12 units a tick along +z, which hit-tests its path after its move. */
  function projectileAt({ state }: DockedScene, from: Vec3): Entity {
    const entity = state.entities.allocate(entityInit(21, {
      position: from,
      orientation: IDENTITY,
      movement: { mode: 'linear', speed: 384, velocity: at(0, 0, 384), previousPosition: from, hitTest: true },
      combat: { type: 'projectile', gun: 0, shooter: null, expiry: { clock: 1e9, firstHitPending: true } },
    }));
    entity.state = 'active';
    return entity;
  }

  it('lets a projectile pass through the docked player and wingman, and hit an active craft on the same path', () => {
    const scene = dockedScene();
    const { player, wingman, step } = scene;
    const target = craftAt(scene, CRAFT_KIND_BIT, at(0, 500, 0));
    const throughPlayer = projectileAt(scene, at(player.position.x, player.position.y, -6));
    const throughWingman = projectileAt(scene, at(wingman.position.x, wingman.position.y, -6));
    projectileAt(scene, at(0, 500, -6));
    const events = step();
    expect(ofType(events, 'hit').map((event) => (event.type === 'hit' ? event.victimEntityId : null))).toEqual([target.id]);
    expect([player.combat.hull, player.combat.shield, wingman.combat.hull, wingman.combat.shield]).toEqual([100, 1000, 100, 1000]);
    expect([throughPlayer.position.z, throughWingman.position.z]).toEqual([6, 6]);
  });

  it('engages a docked target like an active one: the parked engagement reads no activity', () => {
    const run = (activity: 'docked' | 'active'): readonly DomainEvent[] => {
      const scene = dockedScene({ armHostile: true });
      const { state, player } = scene;
      player.activity = activity;
      // A parked shooter in AI mode 0 aiming at the player 30 units away: out of gun range, its missile (chosen while
      // +0xE0 ≥ 0) reaches (E3).
      const shooter = state.entities.allocate(entityInit(HOSTILE_KIND_BIT, {
        position: at(0, 30, 0), activity: 'parked', movement: null, ai: { ...allocatorAiState(), mode: 0 }, ruleInputs: { ...TEST_RULE_INPUTS, aiValueB: 0 },
        combat: { ...blankCraftCombat(), shield: 1000, hull: 100, weapons: buildWeaponBlock(state.craftInfo.content.craft[HOSTILE_KIND_BIT]) },
      })) as CraftEntity;
      shooter.state = 'active';
      shooter.ai.target = player.id;
      const context = registerTick(state, readTickInput(tickInput()));
      engageParked(context, shooter, 640);
      return context.events;
    };
    const docked = run('docked');
    expect(ofType(docked, 'hit')).toEqual([expect.objectContaining({ cause: 'parked' })]);
    expect(docked).toEqual(run('active'));
  });
});

describe('target candidates while docked (DK4; T3)', () => {
  it('selects no target in the base view, and skips a docked craft once back in flight', () => {
    const scene = dockedScene();
    const { state, step } = scene;
    const dockedEnemy = craftAt(scene, HOSTILE_KIND_BIT, at(1350, 0, 0));
    dockedEnemy.activity = 'docked';
    const enemy = craftAt(scene, HOSTILE_KIND_BIT, at(1500, 0, 0));
    state.player.targeting!.autoTargetDueClock = 0;
    for (let tick = 0; tick < 40; tick++) step();
    expect(state.player.target).toBeNull();
    step([{ type: 'launch' }]);
    while (state.player.target === null && state.tick < 120) step();
    expect(state.player.target).toBe(enemy.id);
  });
});

describe('the active area while docked (DK4 consequences; CB-17 decision 7)', () => {
  it('follows the drifting player, parks the base it leaves behind and so launches automatically; the docked wingman is never parked', () => {
    // 4800 units/s along +x: 150 units per tick; the base at x = 300 leaves the 7500-unit area once the player passes 7800.
    const scene = dockedScene({ player: { orientation: FORWARD_X } });
    const { state, player, base, wingman, step } = scene;
    Object.assign(blockOf(player), { speed: 4800, commandedSpeed: 4800, atCommandedSpeed: true });
    let departed: DomainEvent | undefined;
    while (departed === undefined && state.tick < 100) {
      departed = step().find(({ type }) => type === 'departed');
      if (departed === undefined) expect(wingman.activity).toBe('docked');
    }
    expect(departed).toMatchObject({ type: 'departed', origin: 'automatic', commandIndex: null, position: LAUNCH_POSITION, wingmanEntityId: wingman.id });
    expect(base.activity).toBe('parked');
    // The speed applies from tick 2, so the player is at 150 × (t − 1) after tick t: the area check switches the base at
    // tick 53 (x = 7800; the boundary is outside), and tick 54's mission flow sees it below state 7 and posts the launch.
    expect(state.tick).toBe(54);
    expect([player.activity, wingman.activity, state.flow.subState, state.player.dockingObject, state.baseService]).toEqual(['active', 'active', 0, null, null]);
  });
});

describe('the base interior while the host pauses (CB-11; BS8)', () => {
  it('advances the service by ticks only: a paused host that reads the world in between ends in the same state', () => {
    const [paused, running] = [dockedScene(), dockedScene()];
    for (const { player } of [paused, running]) player.combat.energy = 0;
    for (let tick = 0; tick < 30; tick++) paused.step();
    const service = structuredClone(paused.state.baseService);
    const energy = paused.player.combat.energy;
    // While the host is paused it steps nothing; reads change nothing.
    for (let read = 0; read < 3; read++) {
      paused.world.projection();
      paused.world.renderState();
      paused.world.snapshot();
    }
    expect([paused.state.baseService, paused.player.combat.energy]).toEqual([service, energy]);
    for (let tick = 0; tick < 30; tick++) paused.step();
    for (let tick = 0; tick < 60; tick++) running.step();
    expect(stateText(paused.state)).toBe(stateText(running.state));
    expect(paused.player.combat.energy).toBeGreaterThan(energy);
  });
});
