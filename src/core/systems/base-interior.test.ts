import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { SUBSYSTEM_COUNT, type Entity, type SubsystemState } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE as FLIGHT } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { expectFault, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { confirmBase, fullRepair, navigateBase } from './base-interior.ts';
import { idleBaseService } from './base-interior.test-support.ts';
import { registerTick, type TickContext } from './pipeline.ts';
import { addActive, BASE_KIND_BIT, radioScene, WINGMAN_KIND_BIT, type RadioScene } from './radio.test-support.ts';

// Expectations are written out from docs/plan/p3/02/spec.md CB-07 §3, CB-08, CB-10 (`fullRepair`), CB-11 and CB-13
// and docs/original/formats/executable.md BS1–BS9. The test world's player record (kind bit 0) has c9C 12 and c54 1000
// (rates 0 and 4), lists 0 = [0, 1] (guns) and 1 = [2] (a missile, +0x0C 4); the service selectors of records 0–10 are
// 0, 33, 34, 5, 7, 8, 1, 2, 18, 3, 9. Fields 1, 5 and 8 are the status display's, which also runs in view 6.

const next: Command = { type: 'navigate-selection', direction: 'next' };
const previous: Command = { type: 'navigate-selection', direction: 'previous' };
const confirm: Command = { type: 'confirm-selection' };
const accepted = (commandIndex: number, commandType: Command['type']): DomainEvent =>
  ({ type: 'command-result', tick: 2, commandIndex, commandType, outcome: 'accepted', reason: null });

const asCraft = (entity: Entity): CraftEntity => entity as CraftEntity;

function setFields(entity: Entity, fields: Record<number, SubsystemState>): void {
  const subsystems = [...asCraft(entity).combat.subsystems];
  for (const [field, state] of Object.entries(fields)) subsystems[Number(field)] = state;
  asCraft(entity).combat.subsystems = Object.freeze(subsystems);
}

/**
 * A scene docked at tick 1 (clock 2): sub-state 4 due at once, so the first tick's mission flow posts the docking. The
 * player's field 2 (record 7) is at 2 and field 3 (record 9) at 1, so the rows are 7, 9, then the rest in record order.
 * The base service's dues are then 2 + 0x200, 2 + 0x40 and 2 + 4.
 */
function docked(): RadioScene & { readonly base: Entity; readonly step: (commands?: readonly Command[]) => DomainEvent[] } {
  const scene = radioScene();
  const { state, player } = scene;
  const base = addActive(scene, BASE_KIND_BIT);
  Object.assign(state.flow, { subState: 4, dockingDeadline: 0 });
  state.player.dockingObject = base.id;
  setFields(player, { 2: 2, 3: 1 });
  const world = constructWorld(state);
  const step = (commands: readonly Command[] = []) => [...world.step(tickInput(commands))];
  expect(step()).toContainEqual(expect.objectContaining({ type: 'docked', tick: 1 }));
  return { ...scene, base, step };
}

/** Steps empty ticks up to and including `tick`. */
function stepUntil(state: WorldState, step: () => DomainEvent[], tick: number): void {
  while (state.tick < tick) step();
}

describe('the base keys (CB-07 §3, CB-08, CB-11; BS4, BS5, BS7)', () => {
  it('accepts the keys in the command loop and applies them in request handling, one event each, in command order', () => {
    const { state, step } = docked();
    expect(state.baseService!.rows).toEqual([7, 9, 0, 1, 2, 3, 4, 5, 6, 8, 10]);
    const commands = [previous, next, next, confirm, previous, confirm];
    const events = step(commands);
    expect(events).toEqual([
      ...commands.map(({ type }, index) => accepted(index, type)),
      { type: 'base-navigated', tick: 2, direction: 'previous', row: 0, moved: false, commandIndex: 0 },
      { type: 'base-navigated', tick: 2, direction: 'next', row: 1, moved: true, commandIndex: 1 },
      { type: 'base-navigated', tick: 2, direction: 'next', row: 2, moved: true, commandIndex: 2 },
      // Row 2 holds record 0, whose field 0 needs nothing: the sound still plays, nothing moves.
      { type: 'base-confirmed', tick: 2, row: 2, record: 0, moved: false, commandIndex: 3 },
      { type: 'base-navigated', tick: 2, direction: 'previous', row: 1, moved: true, commandIndex: 4 },
      { type: 'base-confirmed', tick: 2, row: 1, record: 9, moved: true, commandIndex: 5 },
    ]);
    // One array: record 9 is now on top of the display too, and the cursor row now holds record 7.
    expect(state.baseService).toMatchObject({ rows: [9, 7, 0, 1, 2, 3, 4, 5, 6, 8, 10], cursor: 1, dues: { repair: 2 + 0x200, hull: 2 + 0x40, energy: 2 + 4 } });
  });

  it('clamps the cursor at the last row', () => {
    const { state, step } = docked();
    state.baseService!.cursor = 9;
    const events = step([next, next]);
    expect(events.slice(2)).toEqual([
      { type: 'base-navigated', tick: 2, direction: 'next', row: 10, moved: true, commandIndex: 0 },
      { type: 'base-navigated', tick: 2, direction: 'next', row: 10, moved: false, commandIndex: 1 },
    ]);
  });

  it('gives a player who is not available player-unavailable, and the keys outside the base their former judgement', () => {
    const { state, player, step } = docked();
    player.destroyed = true;
    expect(step([next, confirm])).toEqual([
      { ...accepted(0, 'navigate-selection'), outcome: 'ignored', reason: 'player-unavailable' },
      { ...accepted(1, 'confirm-selection'), outcome: 'ignored', reason: 'player-unavailable' },
    ]);
    player.destroyed = false;
    state.player.viewMode = FLIGHT;
    expect(step([next])).toEqual([{ type: 'command-result', tick: 3, commandIndex: 0, commandType: 'navigate-selection', outcome: 'ignored', reason: 'wrong-context' }]);
  });

  it('emits the event with no row and changes nothing without a base service, and does nothing without a player entity', () => {
    const { state, player } = docked();
    state.baseService = null;
    const context = registerTick(state, readTickInput(tickInput()));
    navigateBase(context, { type: 'base-navigate', entityId: player.id, direction: 'next', commandIndex: 0 });
    confirmBase(context, { type: 'base-confirm', entityId: player.id, commandIndex: 1 });
    state.player.entityId = null;
    navigateBase(context, { type: 'base-navigate', entityId: player.id, direction: 'next', commandIndex: 2 });
    confirmBase(context, { type: 'base-confirm', entityId: player.id, commandIndex: 3 });
    expect(context.events).toEqual([
      { type: 'base-navigated', tick: 2, direction: 'next', row: null, moved: false, commandIndex: 0 },
      { type: 'base-confirmed', tick: 2, row: null, record: null, moved: false, commandIndex: 1 },
    ]);
  });
});

describe('the base-interior stage (CB-11; BS6, BS8, BS10)', () => {
  it('runs each step at the first sample past its due: energy at +6, hull at +0x42, repair at +0x202, without events', () => {
    const { state, player, step } = docked();
    const { combat } = asCraft(player);
    combat.energy = 900;
    combat.hull = 0;
    const startRng = state.rngState;
    // Tick 3 (clock 6) is not past the energy due of 6; tick 4 (clock 8) is, and re-arms it at 12.
    expect([...step(), ...step()]).toEqual([]);
    expect(combat.energy).toBe(900);
    expect(step()).toEqual([]);
    expect([combat.energy, state.baseService!.dues.energy]).toEqual([904, 12]);
    stepUntil(state, step, 33);
    // Energy steps at clocks 8, 14, … 62: ten in all; no draw yet.
    expect([combat.energy, combat.hull, state.rngState]).toEqual([940, 0, startRng]);
    const [draw] = randValues(state.rngState, 1);
    step();
    expect([combat.hull, state.baseService!.dues.hull, state.rngState]).toEqual([Math.min(draw % 100, 12), 68 + 0x40, rngStateAfter(startRng, 1)]);
    stepUntil(state, step, 257);
    expect(combat.subsystems[2]).toBe(2);
    step();
    // Record 7 (field 2) is repaired and goes to the bottom; its due is re-armed from clock 516.
    expect(combat.subsystems[2]).toBe(0);
    expect(state.baseService).toMatchObject({ rows: [9, 0, 1, 2, 3, 4, 5, 6, 8, 10, 7], dues: { repair: 516 + 0x200 } });
  });

  it('holds every due while the map is open and runs each overdue step once when the base view returns', () => {
    const { state, player, step } = docked();
    const { combat } = asCraft(player);
    combat.energy = 900;
    state.player.viewMode = 8;
    stepUntil(state, step, 300);
    expect(combat.energy).toBe(900);
    expect(combat.subsystems[2]).toBe(2);
    expect(state.baseService!.dues).toEqual({ repair: 2 + 0x200, hull: 2 + 0x40, energy: 2 + 4 });
    state.player.viewMode = 6;
    const rng = state.rngState;
    step();
    // Clock 602: one repair, one hull draw and one energy step, each re-armed from 602.
    expect([combat.energy, combat.subsystems[2], state.rngState]).toEqual([904, 0, rngStateAfter(rng, 1)]);
    expect(state.baseService!.dues).toEqual({ repair: 602 + 0x200, hull: 602 + 0x40, energy: 602 + 4 });
  });

  it('reads no docking object or base state', () => {
    const { state, player, base, step } = docked();
    asCraft(player).combat.energy = 900;
    base.state = 'pending-removal';
    state.player.dockingObject = null;
    state.flow.subState = 0;
    stepUntil(state, step, 4);
    expect(asCraft(player).combat.energy).toBe(904);
  });

  it('faults in view 6 without a base service, and skips without a player entity', () => {
    const scene = radioScene();
    scene.state.player.viewMode = 6;
    const world = constructWorld(scene.state);
    expectFault(() => world.step(tickInput()), 'invariant-violated', 'base-interior.service');
    const empty = radioScene().state;
    Object.assign(empty.player, { viewMode: 6, entityId: null, control: null, targeting: null });
    expect(constructWorld(empty).step(tickInput())).toEqual([]);
  });
});

describe('the full repair entry (CB-10, CB-12; BS9)', () => {
  /** A context of the next tick, as request handling has it. */
  const contextOf = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));

  it('announces each selection advance as weapon-selected without a command only for the player in request handling', () => {
    const { state, player } = radioScene();
    const context = contextOf(state);
    fullRepair(context, player, true);
    expect(context.events).toEqual([
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 0, index: 1, mount: 1, changed: true, commandIndex: null },
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 0, index: 0, mount: 0, changed: true, commandIndex: null },
      { type: 'weapon-selected', tick: 1, entityId: player.id, list: 1, index: 0, mount: 2, changed: false, commandIndex: null },
    ]);
    fullRepair(context, player, false);
    expect(context.events).toHaveLength(3);
  });

  it('announces nothing for another craft, and repairs it from its own record', () => {
    const scene = radioScene();
    const wingman = asCraft(addActive(scene, WINGMAN_KIND_BIT));
    Object.assign(wingman.combat, { hull: -5, energy: 3, subsystems: Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, () => 2)) });
    const context = contextOf(scene.state);
    fullRepair(context, wingman, true);
    expect(context.events).toEqual([]);
    expect([wingman.combat.hull, wingman.combat.energy, wingman.combat.subsystems.every((field) => field === 0)]).toEqual([12, 1000, true]);
  });

  it('keeps the depleted latch, so the next energy update clears it and a later depletion is a new event', () => {
    const { state, player } = radioScene();
    const { combat } = asCraft(player);
    Object.assign(combat, { energy: 0, depleted: true, nextEnergyClock: 4 });
    fullRepair(contextOf(state), player, false);
    expect([combat.energy, combat.depleted]).toEqual([1000, true]);
    const world = constructWorld(state);
    expect(world.step(tickInput())).toEqual([]);
    expect(world.step(tickInput())).toEqual([]);
    expect(combat.depleted).toBe(false);
    combat.energy = -100;
    const events: DomainEvent[] = [];
    while (!combat.depleted) events.push(...world.step(tickInput()));
    expect(events).toEqual([expect.objectContaining({ type: 'energy-depleted', entityId: player.id })]);
  });

  it('repairs the docking wingman and announces nothing', () => {
    const scene = radioScene();
    const { state } = scene;
    const base = addActive(scene, BASE_KIND_BIT);
    const wingman = asCraft(addActive(scene, WINGMAN_KIND_BIT, { position: { x: 900, y: 0, z: 0 } }));
    Object.assign(wingman.combat, { hull: -5, energy: 3 });
    Object.assign(state.flow, { subState: 4, dockingDeadline: 0 });
    state.player.dockingObject = base.id;
    const events = constructWorld(state).step(tickInput());
    expect(events.map(({ type }) => type)).toEqual(['docked', 'transition']);
    expect([wingman.activity, wingman.combat.hull, wingman.combat.energy]).toEqual(['docked', 12, 1000]);
  });
});

describe('the base view helper for other rules\' tests', () => {
  it('gives view 6 a base service whose steps are not due', () => {
    expect(idleBaseService(10)).toEqual({
      rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], cursor: 0, dues: { repair: 10, hull: 10, energy: 10 }, rates: { hull: 0, energy: 0 },
      flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
    });
  });
});
