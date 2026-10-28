import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../contracts/domain-events.ts';
import type { Command } from '../contracts/tick-input.ts';
import { buildWeaponBlock } from '../rules/combat-init.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, playerOnlyMission, worldInput } from '../world/create-world.test-support.ts';
import {
  blankCraftCombat, SUBSYSTEM_COUNT, type Activity, type CraftCombat, type Entity, type EntityInit, type Level, type ObjectState,
  type SteeredMovementBlock, type SubsystemState,
} from '../world/entity-table.ts';
import type { CommunicationsMenu, LeftPage } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, stateText, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { energyStage } from './energy.ts';
import { registerTick } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-05, CR-06, CR-07 and CR-09; docs/original/formats/executable.md, D10, D13, D14 and D15.
// Expectations worked out by hand from the records below, through the formal step.

/**
 * The player's record: shield 300 (c60 7), charge 40, c64 = c78 = [0, 100, 200, 300], c58 340 and the speed cost
 * c88 500 with c B8 100.75, so T = trunc(100 × 500 ÷ 1,000) = 50. At levels (1, 2), E = 340 − 300 = 40 < T and the
 * maximum speed is trunc(40 × 1,000 ÷ 500) = 80; at (0, 2) and (1, 1), E = 140 and it is c B8.
 */
const PLAYER_RECORD = {
  at54: 1000, at58: 340, at5C: 300, at60: 7, at64: [0, 100, 200, 300], at74: 40, at78: [0, 100, 200, 300], at88: 500, at8C: 0, at90: 0,
  at9C: 1000, atB8: 100.75,
};
/** Kind bit 7's record: the same shield, recharged at c64[0] = 64. */
const OTHER_RECORD = { ...PLAYER_RECORD, at64: [64, 0, 0, 0], at78: [64, 0, 0, 0] };
const OTHER = 7;

/** A drained player-only world with those records and `player` overriding the player's. */
function energyState(player: Record<string, unknown> = {}): WorldState {
  const info = craftInfoContent();
  Object.assign(info.craft[0], PLAYER_RECORD, player);
  Object.assign(info.craft[OTHER], OTHER_RECORD);
  const state = withEveryKindBound(initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission(), craftInfo: info }))));
  state.spawn.queue.length = 0;
  return state;
}

/** The next step of `state` runs at `clock`. */
function nextStepAt(state: WorldState, clock: number): void {
  state.clock = clock - 2;
  state.tick = clock / 2 - 1;
}

const fields = (entries: Record<number, SubsystemState> = {}): readonly SubsystemState[] =>
  Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => entries[index] ?? 0));

/** A craft combat state with full resources, its weapon block built from its record, and no update due before clock 10⁶. */
function craftCombat(state: WorldState, kindBit: number, overrides: Partial<CraftCombat> = {}): CraftCombat {
  return {
    ...blankCraftCombat(), weapons: buildWeaponBlock(state.craftInfo.content.craft[kindBit]), energy: 1000, shield: 300, charge: 40, hull: 1000,
    nextEnergyClock: 1_000_000, ...overrides,
  };
}

/** A block at speed `speed` and commanded speed `commanded` (f32 values). */
const block = (speed: number, commanded: number): SteeredMovementBlock => ({ ...craftMovementBlock(0, 80, 100.75), speed, commandedSpeed: commanded, atCommandedSpeed: false });

/** The active player at levels (1, 2) with E 40, T 50 and maximum 80, standing in flight on the status page. */
function addPlayer(state: WorldState, combat: Partial<CraftCombat> = {}, overrides: Partial<EntityInit> = {}): Entity {
  const player = addPlayerEntity(state, {
    combat: craftCombat(state, 0, { shieldLevel: 1, chargeLevel: 2, sparePower: 40, fullSpeedPower: 50, ...combat }),
    movement: block(0, 0),
    maximumSpeed: 80,
    position: { x: 0, y: 0, z: 0 },
    ...overrides,
  });
  player.state = 'active';
  return player;
}

function addOther(state: WorldState, combat: Partial<CraftCombat>, activity: Activity, objectState: ObjectState): Entity {
  const entity = state.entities.allocate(entityInit(OTHER, {
    combat: craftCombat(state, OTHER, combat),
    activity: activity === 'parked' ? 'parked' : 'active',
    movement: activity === 'parked' ? null : block(90, 90),
    position: { x: 10, y: 0, z: 0 },
  }));
  entity.activity = activity;
  entity.state = objectState;
  return entity;
}

const craftOf = (entity: Entity): CraftCombat => entity.combat as CraftCombat;
const steered = (entity: Entity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;

/** Runs only the energy stage at the next step's clock, returning its events. */
function runEnergyStage(state: WorldState): readonly DomainEvent[] {
  const context = registerTick(state, tickInput());
  energyStage!(context);
  return context.events;
}

const depletedEvent = (entity: Entity, tick: number): DomainEvent =>
  ({ type: 'energy-depleted', tick, entityId: entity.id, kindBit: entity.kindBit, position: entity.position });
/** P3-11's beacon entry `0x33464` after a depleted player update at `clock` in sub-state 0 (ME-09). */
const beaconEvents = (player: Entity, tick: number, clock: number): DomainEvent[] => [
  { type: 'flight-message', tick, message: 'beacon' },
  { type: 'player-loss-started', tick, playerEntityId: player.id, loss: 'energy', previousSubState: 0, deadlineClock: clock + 0x3c0 },
];

describe('the energy stage (AC-10; CR-07, D14)', () => {
  it('takes the instantiation\'s due clock, updates the player once due and then every 0x40 units', () => {
    const info = craftInfoContent();
    Object.assign(info.craft[0], PLAYER_RECORD);
    const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission(), craftInfo: info })));
    const world = constructWorld(state);
    world.step(tickInput());
    const player = state.entities.get(state.player.entityId!)!;
    const combat = craftOf(player);
    // Instantiated at clock 2: the first update is due 0x80 + rand % 64 later; full throttle is the maximum 80.
    expect(combat.lastEnergyClock).toBe(2);
    expect(combat.nextEnergyClock).toBeGreaterThanOrEqual(2 + 0x80);
    expect(combat.nextEnergyClock).toBeLessThan(2 + 0x80 + 64);
    expect(steered(player).commandedSpeed).toBe(80);
    Object.assign(combat, { energy: 1000, shield: 300, charge: 40 });
    const due = combat.nextEnergyClock;
    // The update runs at the first tick whose clock reaches it (2 units per tick).
    const at = due + (due % 2);
    nextStepAt(state, at - 2);
    world.step(tickInput());
    expect([combat.energy, combat.lastEnergyClock, combat.nextEnergyClock]).toEqual([1000, 2, due]);
    world.step(tickInput());
    // The speed cost of 80 × 500 ÷ 1,000 = 40 per 64 units over dt = at − 2.
    const first = 1000 - Math.trunc((40 * (at - 2)) / 64);
    expect([combat.energy, combat.lastEnergyClock, combat.nextEnergyClock]).toEqual([first, at, at + 0x40]);
    nextStepAt(state, at + 0x40);
    world.step(tickInput());
    expect([combat.energy, combat.lastEnergyClock]).toEqual([first - 40, at + 0x40]);
  });

  it('counts an energy-page redraw at the instantiation and at each due player update, changed or not, and none for other craft (CK-02)', () => {
    const info = craftInfoContent();
    Object.assign(info.craft[0], PLAYER_RECORD);
    const created = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission(), craftInfo: info })));
    constructWorld(created).step(tickInput());
    // `0x3060c` at the instantiation; the first update is due later.
    expect(created.player.energyPageRedraws).toBe(1);

    const state = energyState();
    // At commanded speed 0 with full resources and field 0 intact, an update changes no value and still counts.
    const combat = craftOf(addPlayer(state, { nextEnergyClock: 100 }));
    const other = craftOf(addOther(state, { nextEnergyClock: 100 }, 'active', 'active'));
    nextStepAt(state, 98);
    runEnergyStage(state);
    expect(state.player.energyPageRedraws).toBe(0);
    nextStepAt(state, 100);
    runEnergyStage(state);
    expect([combat.energy, combat.shield, combat.charge, combat.lastEnergyClock, other.lastEnergyClock]).toEqual([1000, 300, 40, 100, 100]);
    expect(state.player.energyPageRedraws).toBe(1);
    nextStepAt(state, 102);
    runEnergyStage(state);
    expect(state.player.energyPageRedraws).toBe(1);
    nextStepAt(state, 100 + 0x40);
    runEnergyStage(state);
    expect(state.player.energyPageRedraws).toBe(2);
  });

  it.each([
    // 100.5 chops to 100: 100 × 500 ÷ 1,000 = 50 per 64 units; the charge gains min(40 − 0, 1,000 × 100) = 40 for 0.
    ['active', {}, 950],
    ['destroyed, as a destroyed source', { state: 'destroyed-source', destroyed: true }, 950],
    // Without a block the cost is c B8's: chop(100.75) = 100. (A parked player is Likely unreachable.)
    ['without a movement block', { activity: 'parked', movement: null }, 950],
  ] as const)('updates the player %s, with the charge and the speed cost', (_, overrides, energy) => {
    const state = energyState();
    const player = addPlayer(state, { charge: 0, lastEnergyClock: 0, nextEnergyClock: 64 }, { movement: block(100.5, 100.5) });
    Object.assign(player, overrides);
    nextStepAt(state, 64);
    expect(runEnergyStage(state)).toEqual([]);
    expect(craftOf(player)).toMatchObject({ energy, charge: 40, lastEnergyClock: 64, nextEnergyClock: 64 + 0x40, depleted: false });
    // Every due player update counts one energy-page redraw (CK-02).
    expect(state.player.energyPageRedraws).toBe(1);
  });

  it('skips a docked player', () => {
    const state = energyState();
    const player = addPlayer(state, { lastEnergyClock: 0, nextEnergyClock: 64 }, { movement: block(100.5, 100.5) });
    player.activity = 'docked';
    nextStepAt(state, 64);
    runEnergyStage(state);
    expect(craftOf(player)).toMatchObject({ energy: 1000, lastEnergyClock: 0, nextEnergyClock: 64 });
    // No update, so no energy-page redraw (CK-02).
    expect(state.player.energyPageRedraws).toBe(0);
  });

  it.each([
    // Field 0 at state 2 drains 100 per 64 units; no charge recharge and no speed cost for other craft.
    ['active', 'active', true, 64 + 0x80],
    ['parked', 'new', true, 64 + 0x100],
    ['parked', 'pending-removal', true, 64 + 0x100],
    ['parked', 'destroyed-source', true, 64 + 0x100],
    ['active', 'presentation-ready', false, 64],
    ['active', 'destroyed-source', false, 64],
    ['active', 'area-switch', false, 64],
    ['active', 'pending-removal', false, 64],
    ['docked', 'active', false, 64],
  ] as const)('updates another craft %s in state %s: %s', (activity, objectState, updated, next) => {
    const state = energyState();
    addPlayer(state);
    const entity = addOther(state, { charge: 0, subsystems: fields({ 0: 2 }), lastEnergyClock: 0, nextEnergyClock: 64 }, activity, objectState);
    nextStepAt(state, 64);
    runEnergyStage(state);
    expect(craftOf(entity)).toMatchObject({ energy: updated ? 900 : 1000, charge: 0, nextEnergyClock: next, lastEnergyClock: updated ? 64 : 0 });
  });

  it('updates another craft destroyed but still in state 7, and recharges its shield at c64[0]', () => {
    const state = energyState();
    addPlayer(state);
    const entity = addOther(state, { shield: 100, lastEnergyClock: 0, nextEnergyClock: 64 }, 'active', 'active');
    entity.destroyed = true;
    nextStepAt(state, 64);
    constructWorld(state).step(tickInput());
    // r = 64, need = min(7 × 200, 64,000) = 1,400: shield 300, energy − 1.
    expect(craftOf(entity)).toMatchObject({ energy: 999, shield: 300, nextEnergyClock: 64 + 0x80 });
  });

  it('waits for the due clock: an update due at the clock runs, one due later does not', () => {
    const state = energyState();
    addPlayer(state);
    const due = addOther(state, { subsystems: fields({ 0: 2 }), lastEnergyClock: 0, nextEnergyClock: 64 }, 'active', 'active');
    const later = addOther(state, { subsystems: fields({ 0: 2 }), lastEnergyClock: 0, nextEnergyClock: 66 }, 'active', 'active');
    nextStepAt(state, 64);
    constructWorld(state).step(tickInput());
    expect([craftOf(due).energy, craftOf(later).energy]).toEqual([900, 1000]);
  });

  it('depletes the player: clamps to 0, locks its block at every depleted update, and emits once per transition', () => {
    const state = energyState();
    const player = addPlayer(state, { energy: 3, lastEnergyClock: 0, nextEnergyClock: 64 }, { movement: block(90, 100.5) });
    nextStepAt(state, 64);
    const world = constructWorld(state);
    // 3 − 50 ≤ 0; in sub-state 0 the beacon wait starts too (P3-11, ME-09), and sub-state 1 keeps it from restarting.
    expect(world.step(tickInput())).toEqual([depletedEvent(player, 32), ...beaconEvents(player, 32, 64)]);
    expect(craftOf(player)).toMatchObject({ energy: 0, depleted: true, nextEnergyClock: 128 });
    expect(steered(player)).toMatchObject({ locked: true, commandedSpeed: 0, atCommandedSpeed: false });
    // The lock drops the throttle keys.
    world.step(tickInput([{ type: 'speed', operation: 'maximum' }]));
    expect(steered(player).commandedSpeed).toBe(0);
    // A commanded speed raised in between is zeroed again by the next depleted update, without another event.
    steered(player).commandedSpeed = 40;
    nextStepAt(state, 128);
    expect(world.step(tickInput())).toEqual([]);
    expect(steered(player).commandedSpeed).toBe(0);
    expect(craftOf(player)).toMatchObject({ energy: 0, depleted: true });
    // An update that ends above 0 clears the latch silently; the next depletion emits again.
    craftOf(player).energy = 500;
    nextStepAt(state, 192);
    expect(world.step(tickInput())).toEqual([]);
    expect(craftOf(player)).toMatchObject({ energy: 500, depleted: false });
    craftOf(player).energy = 0;
    nextStepAt(state, 256);
    expect(world.step(tickInput())).toEqual([depletedEvent(player, 128)]);
  });

  it('depletes other craft in walk order, locking only the blocks it passes', () => {
    const state = energyState();
    addPlayer(state);
    const first = addOther(state, { energy: 0, lastEnergyClock: 0, nextEnergyClock: 64 }, 'active', 'active');
    const parked = addOther(state, { energy: 0, lastEnergyClock: 0, nextEnergyClock: 64 }, 'parked', 'new');
    const last = addOther(state, { energy: 0, lastEnergyClock: 0, nextEnergyClock: 64 }, 'active', 'active');
    nextStepAt(state, 64);
    const events = constructWorld(state).step(tickInput());
    expect(events.filter(({ type }) => type === 'energy-depleted')).toEqual([depletedEvent(first, 32), depletedEvent(parked, 32), depletedEvent(last, 32)]);
    expect([steered(first).locked, steered(last).locked, parked.movement]).toEqual([true, true, null]);
  });

  it('emits its events after request handling\'s and before the frame-end clear (CR-06)', () => {
    const state = energyState();
    const player = addPlayer(state, { energy: 0, lastEnergyClock: 0, nextEnergyClock: 64 });
    state.player.control!.speedAssist.enabled = false;
    const target = addOther(state, {}, 'active', 'active');
    target.inWarp = true;
    state.player.target = target.id;
    nextStepAt(state, 64);
    expect(constructWorld(state).step(tickInput([{ type: 'energy', operation: 'open' }]))).toEqual([
      { type: 'command-result', tick: 32, commandIndex: 0, commandType: 'energy', outcome: 'accepted', reason: null },
      { type: 'left-page-changed', tick: 32, page: 1, previousPage: 0, commandIndex: 0 },
      depletedEvent(player, 32),
      ...beaconEvents(player, 32, 64),
      { type: 'target-cleared', tick: 32, playerEntityId: player.id, previousTarget: target.id, cause: 'warp' },
    ]);
  });
});

type EnergyOperation = Extract<Command, { type: 'energy' }>['operation'];
const energy = (operation: EnergyOperation): Command => ({ type: 'energy', operation });
const DAMAGE_REPORT: Command = { type: 'damage-report' };
const result = (commandIndex: number, command: Command, reason: string | null, tick = 1): DomainEvent => ({
  type: 'command-result', tick, commandIndex, commandType: command.type, outcome: reason === null ? 'accepted' : 'ignored', reason,
} as DomainEvent);
const pageChanged = (page: LeftPage, previousPage: LeftPage, commandIndex: number, tick = 1): DomainEvent =>
  ({ type: 'left-page-changed', tick, page, previousPage, commandIndex });
const allocationChanged = (player: Entity, shieldLevel: Level, chargeLevel: Level, commandIndex: number, tick = 1): DomainEvent =>
  ({ type: 'energy-allocation-changed', tick, entityId: player.id, shieldLevel, chargeLevel, commandIndex });

describe('the energy and damage-report commands (AC-10; CR-05, D10, D15)', () => {
  it('switch between the status and energy pages, each accepted change followed by left-page-changed', () => {
    const state = energyState();
    addPlayer(state);
    const world = constructWorld(state);
    const open = energy('open');
    expect(world.step(tickInput([open]))).toEqual([result(0, open, null), pageChanged(1, 0, 0)]);
    expect(world.step(tickInput([open]))).toEqual([result(0, open, 'no-change', 2)]);
    expect(world.step(tickInput([DAMAGE_REPORT]))).toEqual([result(0, DAMAGE_REPORT, null, 3), pageChanged(0, 1, 0, 3)]);
    expect(world.step(tickInput([DAMAGE_REPORT]))).toEqual([result(0, DAMAGE_REPORT, 'no-change', 4)]);
    expect(state.player.leftDisplay.page).toBe(0);
  });

  const MENU_OF_PAGE: Partial<Record<LeftPage, CommunicationsMenu>> = {
    2: { level: 2, table: 'categories', items: [] },
    3: { level: 3, table: 'objects', items: [] },
    4: { level: 4, table: 'other', items: [] },
  };

  it.each([2, 3, 4, 5, 6] as const)('leave page %i alone as wrong-context, the level keys included', (page) => {
    const commands = [energy('open'), DAMAGE_REPORT, energy('shield-increase'), energy('gun-decrease')];
    const prepare = (): WorldState => {
      const state = energyState();
      addPlayer(state);
      state.player.leftDisplay.page = page;
      // A menu page shows its built menu; without one the frame-end handler would set page 0 (P3-10 CB-09).
      state.player.communications.menu = MENU_OF_PAGE[page] ?? null;
      // Page 5 shows a playing message; without one the frame-end handler would set page 0 (P3-10 CB-09, D-03).
      if (page === 5) {
        const item = { message: { table: 20983, face: null, index: 0 }, due: 0, callback: 'none', speaker: null } as const;
        state.communications.channel = { phase: 'playing', item, startClock: 0, frameDurations: [1000] };
      }
      return state;
    };
    const [judged, idle] = [prepare(), prepare()];
    expect(constructWorld(judged).step(tickInput(commands))).toEqual(commands.map((command, index) => result(index, command, 'wrong-context')));
    constructWorld(idle).step(tickInput());
    expect(stateText(judged)).toBe(stateText(idle));
  });

  it('take the level keys only on the energy page, as wrong-context changing nothing on the status page', () => {
    const commands = (['shield-increase', 'shield-decrease', 'gun-increase', 'gun-decrease'] as const).map(energy);
    const [judged, idle] = [energyState(), energyState()];
    for (const state of [judged, idle]) addPlayer(state);
    expect(constructWorld(judged).step(tickInput(commands))).toEqual(commands.map((command, index) => result(index, command, 'wrong-context')));
    constructWorld(idle).step(tickInput());
    expect(stateText(judged)).toBe(stateText(idle));
  });

  it('count an energy-page redraw for each accepted level key only, not for a page change or a refused key (CK-02)', () => {
    const state = energyState();
    addPlayer(state, { shieldLevel: 3 });
    const world = constructWorld(state);
    world.step(tickInput([energy('open')]));
    expect(state.player.energyPageRedraws).toBe(0);
    // `S` at level 3 is refused (`0x30b20` returns 0 before setting +0x44); `s` and `g` are accepted.
    world.step(tickInput([energy('shield-increase'), energy('shield-decrease'), energy('gun-decrease')]));
    expect(state.player.energyPageRedraws).toBe(2);
    world.step(tickInput([DAMAGE_REPORT, energy('shield-decrease')]));
    expect(state.player.energyPageRedraws).toBe(2);
  });

  it('change a level, recompute the maximum speed from the live E, T and field 2 and apply it to the commanded speed', () => {
    const state = energyState();
    const player = addPlayer(state, {}, { movement: block(90, 70) });
    state.player.leftDisplay.page = 1;
    const world = constructWorld(state);
    const [lower, raise] = [energy('shield-decrease'), energy('shield-increase')];
    // (0, 2): E = 140 ≥ T, so the maximum is c B8; 90 ÷ 100.75 ≤ 1 leaves the commanded speed.
    expect(world.step(tickInput([lower]))).toEqual([result(0, lower, null), allocationChanged(player, 0, 2, 0)]);
    expect([craftOf(player).sparePower, craftOf(player).fullSpeedPower, player.maximumSpeed]).toEqual([140, 50, 100.75]);
    expect(steered(player)).toMatchObject({ commandedSpeed: 70, atCommandedSpeed: false });
    // (1, 2): E = 40, maximum 80; 90 ÷ 80 > 1 sets the commanded speed to 80 (0x21d88).
    Object.assign(steered(player), { speed: 90, atCommandedSpeed: true });
    expect(world.step(tickInput([raise]))).toEqual([result(0, raise, null, 2), allocationChanged(player, 1, 2, 0, 2)]);
    expect([craftOf(player).sparePower, player.maximumSpeed]).toEqual([40, 80]);
    expect(steered(player)).toMatchObject({ commandedSpeed: 80, atCommandedSpeed: false });
    // Field 2 at 1 halves the recomputed maximum: (1, 1), E = 140, c B8 × 0.5 = 50.375.
    craftOf(player).subsystems = fields({ 2: 1 });
    const gun = energy('gun-decrease');
    expect(world.step(tickInput([gun]))).toEqual([result(0, gun, null, 3), allocationChanged(player, 1, 1, 0, 3)]);
    expect(player.maximumSpeed).toBe(50.375);
  });

  it('lowers the other level while E is negative, and on failure restores the changed one and sets the other to 0', () => {
    const lowered = energyState();
    const player = addPlayer(lowered);
    lowered.player.leftDisplay.page = 1;
    const raise = energy('gun-increase');
    // (1, 3): 340 − 400 < 0, so L1 drops to 0: E = 40, maximum 80.
    expect(constructWorld(lowered).step(tickInput([raise]))).toEqual([result(0, raise, null), allocationChanged(player, 0, 3, 0)]);
    expect([craftOf(player).sparePower, player.maximumSpeed]).toEqual([40, 80]);
    // c58 = 150: (2, 2), (2, 1) and (2, 0) are all negative, so L1 stays 1 and L2 becomes 0: E = 150 − 100 = 50 ≥ T.
    const failed = energyState({ at58: 150 });
    const failing = addPlayer(failed, { sparePower: -150 });
    failed.player.leftDisplay.page = 1;
    const shield = energy('shield-increase');
    expect(constructWorld(failed).step(tickInput([shield]))).toEqual([result(0, shield, null), allocationChanged(failing, 1, 0, 0)]);
    expect([craftOf(failing).sparePower, failing.maximumSpeed]).toEqual([50, 100.75]);
  });

  it.each([
    ['shield-increase', 3, 0],
    ['shield-decrease', 0, 2],
    ['gun-increase', 1, 3],
    ['gun-decrease', 2, 0],
  ] as const)('give %s at levels (%i, %i) no-change, changing nothing', (operation, shieldLevel, chargeLevel) => {
    const prepare = (): WorldState => {
      const state = energyState();
      addPlayer(state, { shieldLevel, chargeLevel });
      state.player.leftDisplay.page = 1;
      return state;
    };
    const [judged, idle] = [prepare(), prepare()];
    const command = energy(operation);
    expect(constructWorld(judged).step(tickInput([command]))).toEqual([result(0, command, 'no-change')]);
    constructWorld(idle).step(tickInput());
    expect(stateText(judged)).toBe(stateText(idle));
  });

  it('let a later + or − in the same tick read back the commanded speed the level key left (0x21d88)', () => {
    // S takes levels (0, 2) to (1, 2) and the maximum from 100.75 to 80; 90 ÷ 80 > 1 sets the commanded speed to 80.
    // − then reads back trunc(80 ÷ 80 × 128) = 128 and posts 116: 58/64 × 80 = 72.5, as the keys in successive frames.
    const state = energyState();
    const player = addPlayer(state, { shieldLevel: 0, sparePower: 140 }, { movement: block(90, 90), maximumSpeed: 100.75 });
    state.player.leftDisplay.page = 1;
    constructWorld(state).step(tickInput([energy('shield-increase'), { type: 'speed', operation: 'decrease' }]));
    expect([player.maximumSpeed, steered(player).commandedSpeed]).toEqual([80, 72.5]);
  });

  it('leave a throttle posted before a level key to request handling, which applies it at the new maximum', () => {
    // − reads back trunc(90 ÷ 100.75 × 128) = 114 and posts 102; S then makes the maximum and the commanded speed 80;
    // request handling applies 102 at 80: 51/64 × 80 = 63.75 (a same-tick consequence of the request timing).
    const state = energyState();
    const player = addPlayer(state, { shieldLevel: 0, sparePower: 140 }, { movement: block(90, 90), maximumSpeed: 100.75 });
    state.player.leftDisplay.page = 1;
    constructWorld(state).step(tickInput([{ type: 'speed', operation: 'decrease' }, energy('shield-increase')]));
    expect([player.maximumSpeed, steered(player).commandedSpeed]).toEqual([80, 63.75]);
  });

  it('keeps each command\'s event right after its result in a tick of several', () => {
    const state = energyState();
    const player = addPlayer(state);
    const commands = [energy('open'), energy('shield-decrease'), DAMAGE_REPORT, energy('shield-increase')];
    expect(constructWorld(state).step(tickInput(commands))).toEqual([
      result(0, commands[0], null), pageChanged(1, 0, 0),
      result(1, commands[1], null), allocationChanged(player, 0, 2, 1),
      result(2, commands[2], null), pageChanged(0, 1, 2),
      result(3, commands[3], 'wrong-context'),
    ]);
  });

  it.each<[string, (state: WorldState) => void, 'player-unavailable' | 'wrong-context']>([
    ['without a player entity', (state) => {
      state.entities.remove(state.entities.get(state.player.entityId!)!);
      Object.assign(state.player, { entityId: null, control: null, targeting: null });
    }, 'player-unavailable'],
    ['with a destroyed player', (state) => void (state.entities.get(state.player.entityId!)!.destroyed = true), 'player-unavailable'],
    ['in the map', (state) => void (state.player.viewMode = 8), 'wrong-context'],
    ['in Warp', (state) => void (state.player.viewMode = 1), 'wrong-context'],
  ])('are ignored %s before any page or level rule', (_, prepare, reason) => {
    const state = energyState();
    addPlayer(state);
    state.player.leftDisplay.page = 1;
    prepare(state);
    const commands = [energy('open'), DAMAGE_REPORT, energy('gun-decrease')];
    expect(constructWorld(state).step(tickInput(commands))).toEqual(commands.map((command, index) => result(index, command, reason)));
    expect(state.player.leftDisplay.page).toBe(1);
  });
});
