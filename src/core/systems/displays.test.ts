import { describe, expect, it, vi } from 'vitest';
import { buildWeaponBlock } from '../rules/combat-init.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, playerOnlyMission, worldInput } from '../world/create-world.test-support.ts';
import { blankCraftCombat, SUBSYSTEM_COUNT, type CraftCombat, type Entity, type SubsystemState } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { idleBaseService } from './base-interior.test-support.ts';
import type { TickContext } from './pipeline.ts';
import type * as Targeting from './targeting.ts';

// docs/plan/p3/02/spec.md, CR-07, CR-10 (as CK-01 corrects it) and CR-11; docs/original/formats/executable.md, T7, D9
// and D15; docs/original/formats/cockpit.md, instrument types per slot. Expectations worked out by hand.

/** The redraw flag each time the right display's clearing ran, which shows whether the status display had run before it. */
const observed = vi.hoisted(() => ({ redrawAtClear: [] as boolean[] }));

vi.mock('./targeting.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Targeting>();
  return {
    ...actual,
    clearRightDisplayTarget(context: TickContext): void {
      observed.redrawAtClear.push(context.world.player.statusDisplay.redraw);
      actual.clearRightDisplayTarget(context);
    },
  };
});

const fields = (entries: Record<number, SubsystemState> = {}): readonly SubsystemState[] =>
  Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => entries[index] ?? 0));

/**
 * A world whose player (the synthetic record: hull capacity c9C = 12, list 0 = mounts 0 and 1, list 1 = mount 2, mount
 * 1 firing together with mount 2) stands in view `viewMode` with a full hull, field 1 at 3 so that a write shows, a
 * blink due at clock 0, `redraw` and `phaseFlipped` set as at creation, no rebuild yet and no energy update due.
 */
function displayState(viewMode = 0x0c, combat: Partial<CraftCombat> = {}): [WorldState, Entity] {
  const state = testState({ group: 1 });
  const weapons = buildWeaponBlock(state.craftInfo.content.craft[0]);
  const player = addPlayerEntity(state, {
    combat: { ...blankCraftCombat(), weapons, hull: 12, nextEnergyClock: 1_000_000, subsystems: fields({ 1: 3 }), ...combat },
  });
  player.state = 'active';
  state.player.viewMode = viewMode;
  // The base view always has a base service (CB-11).
  if (viewMode === 6) state.baseService = idleBaseService();
  return [state, player];
}

const subsystems = (player: Entity): readonly SubsystemState[] => (player.combat as CraftCombat).subsystems;

/** The status display at world creation (CK-01). */
const CREATED = { blink: 0, blinkDueClock: 0, redraw: true, phaseFlipped: true, rebuilds: 0 };

/** A target in Warp, which the right display clears. */
function warpTarget(state: WorldState): Entity {
  const target = state.entities.allocate(entityInit(7, { position: { x: 0, y: 0, z: 10 } }));
  target.state = 'active';
  target.inWarp = true;
  state.player.target = target.id;
  return target;
}

describe('the frame-end cockpit display step (CR-10)', () => {
  it.each([
    [0x0c, 'warp'],
    [0x0d, 'warp'],
    [1, 'warp'],
    [6, 'base-view'],
  ] as const)('runs in view mode %i: the right display clears first, then the status display writes', (viewMode, cause) => {
    const [state, player] = displayState(viewMode);
    const target = warpTarget(state);
    observed.redrawAtClear.length = 0;
    expect(constructWorld(state).step(tickInput())).toEqual([
      { type: 'target-cleared', tick: 1, playerEntityId: player.id, previousTarget: target.id, cause },
    ]);
    expect(observed.redrawAtClear).toEqual([true]);
    // The write first (with phase 0, full hull: field 1 is 0), then the flip.
    expect(state.player.statusDisplay).toEqual({ blink: 1, blinkDueClock: 2 + 0x20, redraw: false, phaseFlipped: true, rebuilds: 1 });
    expect(subsystems(player)).toEqual(fields());
  });

  it.each([0, 2, 3, 8, 0x11, 0x13])('does not run in view mode %i', (viewMode) => {
    const [state, player] = displayState(viewMode);
    const target = warpTarget(state);
    observed.redrawAtClear.length = 0;
    expect(constructWorld(state).step(tickInput())).toEqual([]);
    expect(observed.redrawAtClear).toEqual([]);
    expect(state.player.target).toBe(target.id);
    expect(state.player.statusDisplay).toEqual(CREATED);
    expect(subsystems(player)).toEqual(fields({ 1: 3 }));
  });
});

describe('the tail warning (P3-10 CB-09 item 2; cockpit.md, type 9)', () => {
  it.each([0x0c, 0x0d, 1, 6])('checks in view mode %i: due again 0x80 units later with neither warning lit', (viewMode) => {
    const [state] = displayState(viewMode);
    constructWorld(state).step(tickInput());
    expect(state.communications.tailCheck).toEqual({ dueClock: 2 + 0x80, attackerOnTail: false, missileIncoming: false });
  });

  it.each([0, 2, 8, 0x0e, 0x11, 0x12, 0x13])('does not check in view mode %i', (viewMode) => {
    const [state] = displayState(viewMode);
    constructWorld(state).step(tickInput());
    expect(state.communications.tailCheck).toEqual({ dueClock: 0, attackerOnTail: false, missileIncoming: false });
  });
});

describe('the status display (CR-10, D9)', () => {
  it.each([
    ['the energy page', (state: WorldState) => void (state.player.leftDisplay.page = 1)],
    ['page 5', (state: WorldState) => void (state.player.leftDisplay.page = 5)],
    ['field 10 at 2, the page\'s interference', (_state: WorldState, player: Entity) => void ((player.combat as CraftCombat).subsystems = fields({ 1: 3, 10: 2 }))],
  ])('neither blinks nor writes on %s', (_, prepare) => {
    const [state, player] = displayState();
    prepare(state, player);
    const before = subsystems(player);
    constructWorld(state).step(tickInput());
    expect(state.player.statusDisplay).toEqual(CREATED);
    expect(subsystems(player)).toBe(before);
  });

  it('runs at field 10 = 1, whose flashes Core ignores (CR-11, difference 4)', () => {
    const [state, player] = displayState(0x0c, { subsystems: fields({ 1: 3, 10: 1 }) });
    constructWorld(state).step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 1, blinkDueClock: 34, redraw: false, phaseFlipped: true, rebuilds: 1 });
    expect(subsystems(player)).toEqual(fields({ 10: 1 }));
  });

  it('consumes in the same tick the redraw the player\'s instantiation sets (CR-07, CR-10)', () => {
    const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission() })));
    state.player.statusDisplay.redraw = false;
    observed.redrawAtClear.length = 0;
    constructWorld(state).step(tickInput());
    expect(state.player.entityId).not.toBeNull();
    expect(observed.redrawAtClear).toEqual([true]);
    expect(state.player.statusDisplay.redraw).toBe(false);
  });

  it('does nothing without a player entity', () => {
    const state = testState();
    constructWorld(state).step(tickInput());
    expect(state.player.statusDisplay).toEqual(CREATED);
  });

  it('flips the blink only once the clock is strictly past its due clock, and writes in the next status page step, with the new phase (CK-01)', () => {
    // Hull 8 of 12: q = 2,048 ÷ 12 = 170, between 0x4C and 0xC0, so field 1 is the blink phase.
    const [state, player] = displayState(0x0c, { hull: 8 });
    Object.assign(state.player.statusDisplay, { blinkDueClock: 2, redraw: false, phaseFlipped: false });
    const world = constructWorld(state);
    world.step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 0, blinkDueClock: 2, redraw: false, phaseFlipped: false, rebuilds: 0 });
    expect(subsystems(player)[1]).toBe(3);
    // Clock 4: the flip, but no write yet.
    world.step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 1, blinkDueClock: 36, redraw: false, phaseFlipped: true, rebuilds: 0 });
    expect(subsystems(player)[1]).toBe(3);
    // Clock 6: the write with phase 1.
    world.step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 1, blinkDueClock: 36, redraw: false, phaseFlipped: false, rebuilds: 1 });
    expect(subsystems(player)[1]).toBe(1);
    // Next at clock 36, not past the due clock.
    Object.assign(state, { tick: 17, clock: 34 });
    world.step(tickInput());
    expect(state.player.statusDisplay).toMatchObject({ blink: 1, phaseFlipped: false, rebuilds: 1 });
    world.step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 0, blinkDueClock: 70, redraw: false, phaseFlipped: true, rebuilds: 1 });
    expect(subsystems(player)[1]).toBe(1);
    world.step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 0, blinkDueClock: 70, redraw: false, phaseFlipped: false, rebuilds: 2 });
    expect(subsystems(player)[1]).toBe(0);
  });

  it('writes twice when a flip meets redraw: this tick for redraw with the old phase, the next for the flip (CK-01)', () => {
    const [state, player] = displayState(0x0c, { hull: 8 });
    state.player.statusDisplay.phaseFlipped = false;
    const world = constructWorld(state);
    const read = () => ({ ...state.player.statusDisplay, field: subsystems(player)[1] });
    world.step(tickInput());
    expect(read()).toEqual({ blink: 1, blinkDueClock: 34, redraw: false, phaseFlipped: true, rebuilds: 1, field: 0 });
    world.step(tickInput());
    expect(read()).toEqual({ blink: 1, blinkDueClock: 34, redraw: false, phaseFlipped: false, rebuilds: 2, field: 1 });
    world.step(tickInput());
    expect(read()).toEqual({ blink: 1, blinkDueClock: 34, redraw: false, phaseFlipped: false, rebuilds: 2, field: 1 });
  });

  it.each<[string, (state: WorldState, player: Entity) => void, (state: WorldState, player: Entity) => void]>([
    ['the energy page', (state) => void (state.player.leftDisplay.page = 1), (state) => void (state.player.leftDisplay.page = 0)],
    [
      'field 10 at 2',
      (_state, player) => void ((player.combat as CraftCombat).subsystems = fields({ 1: 3, 10: 2 })),
      (_state, player) => void ((player.combat as CraftCombat).subsystems = fields({ 1: 3 })),
    ],
    ['the map view', (state) => void (state.player.viewMode = 8), (state) => void (state.player.viewMode = 0x0c)],
  ])('keeps a flip\'s write pending while %s stops the status page, then writes with the phase it finds (CK-01)', (_, stop, resume) => {
    const [state, player] = displayState(0x0c, { hull: 8 });
    Object.assign(state.player.statusDisplay, { redraw: false, phaseFlipped: false });
    const world = constructWorld(state);
    // Clock 2: the flip to phase 1.
    world.step(tickInput());
    expect(state.player.statusDisplay).toEqual({ blink: 1, blinkDueClock: 34, redraw: false, phaseFlipped: true, rebuilds: 0 });
    stop(state, player);
    Object.assign(state, { tick: 30, clock: 60 });
    world.step(tickInput());
    world.step(tickInput());
    // Past the due clock the timer still waits for the page: nothing flips or writes.
    expect(state.player.statusDisplay).toEqual({ blink: 1, blinkDueClock: 34, redraw: false, phaseFlipped: true, rebuilds: 0 });
    resume(state, player);
    world.step(tickInput());
    // The pending write with phase 1, then the due flip to 0.
    expect(state.player.statusDisplay).toEqual({ blink: 0, blinkDueClock: 66 + 0x20, redraw: false, phaseFlipped: true, rebuilds: 1 });
    expect(subsystems(player)[1]).toBe(1);
  });

  it('writes when redraw is set without a flip, clears it, and then leaves the fields to other writers', () => {
    const [state, player] = displayState(0x0c, { hull: 3 });
    Object.assign(state.player.statusDisplay, { blinkDueClock: 1000, phaseFlipped: false });
    const world = constructWorld(state);
    world.step(tickInput());
    // Hull 3 of 12: q = 64 < 0x4C, so field 1 is 2.
    expect(state.player.statusDisplay).toEqual({ blink: 0, blinkDueClock: 1000, redraw: false, phaseFlipped: false, rebuilds: 1 });
    expect(subsystems(player)).toEqual(fields({ 1: 2 }));
    (player.combat as CraftCombat).subsystems = fields({ 1: 3, 5: 3, 8: 3 });
    world.step(tickInput());
    expect(subsystems(player)).toEqual(fields({ 1: 3, 5: 3, 8: 3 }));
  });

  it.each([
    // List 0 walks mount 0, then mounts 1 and 2; list 1 walks mount 2.
    [[0, 0, 0], 0, 0],
    [[2, 0, 1], 1, 1],
    [[0, 0, 2], 1, 2],
    [[2, 2, 2], 2, 2],
    [[1, 1, 1], 1, 1],
  ] as const)('writes field 8 from list 0\'s and field 5 from list 1\'s mount damage %j', (damage, gunMounts, missileMounts) => {
    const [state, player] = displayState();
    (player.combat as CraftCombat).weapons.mounts.forEach((mount, index) => void (mount.damage = damage[index]));
    constructWorld(state).step(tickInput());
    expect(subsystems(player)).toEqual(fields({ 5: missileMounts, 8: gunMounts }));
  });
});
