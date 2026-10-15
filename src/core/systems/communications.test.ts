import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CommunicationsRuleData } from '../world/comm-input.ts';
import type { Entity, EntityInit } from '../world/entity-table.ts';
import type { CommunicationsMenu, LeftPage } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, expectFault, stateText, stillEntityInit, testState, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { PIPELINE, registerTick, type Request, type RequestOf, type TickContext } from './pipeline.ts';

// Expectations written out from docs/plan/p3/02/spec.md CB-02 (row 1), CB-03, CB-07 and CB-09 and from comm.md §7, not
// from the menu builders. The synthetic menus (create-world.test-support.ts): categories W (kind bit 1), B (bit 17) and N
// (bit 18) with the exit `x`; the object list's exit `X`; TABL 2003 '1' → 7, '2' → 9, 'X'; TABL 2005 '1' → 7, 'x';
// TABL 2013 '1'–'7' → 1–7, 'x'. Nothing instantiates bit 18, so its category is never shown.

const ORIGIN: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const FLIGHT = 0x0c;
const key = (character: string): number => character.charCodeAt(0);

const open: Command = { type: 'communications', operation: 'open' };
const close: Command = { type: 'communications', operation: 'close' };
const digit = (value: number): Command => ({ type: 'select-number', value });
const launch: Command = { type: 'launch' };
const navigate: Command = { type: 'navigate-selection', direction: 'next' };

interface Scene {
  readonly state: WorldState;
  readonly player: Entity;
}

/** A drained world with an available player at the origin whose automatic target selection is not due. */
function scene(): Scene {
  const state = testState();
  const player = addPlayerEntity(state, { position: ORIGIN });
  player.state = 'active';
  state.player.targeting!.autoTargetDueClock = 1e9;
  return { state, player };
}

/** An active, standing entity of `kindBit` in state 7 (bit 1 is the wingman, bit 17 a base). */
function add({ state }: Scene, kindBit: number, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position: { x: 100, y: 0, z: 0 }, ...overrides }));
  entity.state = 'active';
  return entity;
}

/** Sets the player's field 13, the communications subsystem. */
function setCommunicationsField({ player }: Scene, state: 0 | 1 | 2): void {
  if (player.combat.type !== 'craft') throw new Error('the test player is a craft');
  player.combat.subsystems = player.combat.subsystems.map((value, field) => (field === 13 ? state : value));
}

const result = (commandIndex: number, command: Command, outcome: 'accepted' | 'ignored' | 'rejected', reason: string | null, tick = 1): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: command.type, outcome, reason } as DomainEvent);
const accepted = (commandIndex: number, command: Command, tick = 1) => result(commandIndex, command, 'accepted', null, tick);
const page = (previousPage: LeftPage, newPage: LeftPage, commandIndex: number | null, tick = 1): DomainEvent =>
  ({ type: 'left-page-changed', tick, page: newPage, previousPage, commandIndex });

/** The world's menu and page, written out. */
const shown = ({ state }: Scene) => ({ page: state.player.leftDisplay.page, menu: state.player.communications.menu });

/** The menu items as [key, value] pairs. */
function itemsOf(menu: CommunicationsMenu | null): [string, unknown][] {
  return (menu?.items ?? []).map(({ key: itemKey, value }) => [String.fromCharCode(itemKey), value.type === 'object' ? value.entityId : value]);
}

/** Runs one tick's real stages before request handling and returns its context, whose requests are still pending. */
function judgeTick(state: WorldState, commands: readonly Command[]): TickContext {
  const context = registerTick(state, readTickInput(tickInput(commands)));
  for (const stage of PIPELINE) {
    if (stage.id === 'request-handling') break;
    stage.run?.(context);
  }
  return context;
}

const deliveries = (context: TickContext): RequestOf<'deliver-command'>[] => {
  const found: RequestOf<'deliver-command'>[] = [];
  const isDelivery = (request: Request): request is RequestOf<'deliver-command'> => request.type === 'deliver-command';
  context.requests.handle((request) => void (isDelivery(request) && found.push(request)));
  return found;
};

/** Replaces the static menus, as Core tests replace other static rule data (world.test-support.ts). */
function withMenus(state: WorldState, menus: Partial<CommunicationsRuleData['menus']>): WorldState {
  const { communications } = state.ruleData;
  return { ...state, ruleData: { ...state.ruleData, communications: { ...communications, menus: { ...communications.menus, ...menus } } } };
}

describe('opening the menu (CB-07 rule 2, page not 2–4; comm §7.2)', () => {
  it('shows the categories with objects on page 2, saving the page and clearing the partner', () => {
    const world = scene();
    const wingman = add(world, 1);
    add(world, 17);
    world.state.player.communications.partner = wingman.id;
    world.state.player.leftDisplay.page = 1;
    expect(constructWorld(world.state).step(tickInput([open]))).toEqual([accepted(0, open), page(1, 2, 0)]);
    expect(itemsOf(world.state.player.communications.menu)).toEqual([
      ['1', { type: 'category', source: 0, kindMask: 0x2 }],
      ['2', { type: 'category', source: 1, kindMask: 0x20000 }],
      ['x', { type: 'exit' }],
    ]);
    expect(world.state.player.communications).toMatchObject({ partner: null, menuSavedPage: 1 });
    expect(world.state.player.communications.menu?.level).toBe(2);
  });

  it('consumes c without a category to show as no-candidate, changing nothing', () => {
    const [judged, idle] = [scene(), scene()];
    expect(constructWorld(judged.state).step(tickInput([open]))).toEqual([result(0, open, 'ignored', 'no-candidate')]);
    constructWorld(idle.state).step(tickInput());
    expect(stateText(judged.state)).toBe(stateText(idle.state));
  });

  it('refuses c with field 13 at 2 as subsystem-disabled, changing nothing', () => {
    const [judged, idle] = [scene(), scene()];
    for (const world of [judged, idle]) {
      add(world, 17);
      setCommunicationsField(world, 2);
    }
    expect(constructWorld(judged.state).step(tickInput([open]))).toEqual([result(0, open, 'ignored', 'subsystem-disabled')]);
    constructWorld(idle.state).step(tickInput());
    expect(stateText(judged.state)).toBe(stateText(idle.state));
  });

  it('abandons a dormant menu and the partner on a c that builds no menu, keeping the page (0x27db6–0x27dd0)', () => {
    const world = scene();
    const gone = add(world, 17);
    world.state.player.leftDisplay.page = 1;
    world.state.player.communications.menu = { level: 4, table: 'other', items: [{ key: key('x'), value: { type: 'exit' } }] };
    world.state.player.communications.partner = gone.id;
    world.state.player.communications.menuSavedPage = 5;
    world.state.entities.remove(gone);
    expect(constructWorld(world.state).step(tickInput([open]))).toEqual([result(0, open, 'ignored', 'no-candidate')]);
    expect(world.state.player.communications).toMatchObject({ menu: null, partner: null, menuSavedPage: 1 });
    expect(world.state.player.leftDisplay.page).toBe(1);
  });

  it('replaces a dormant menu, saving page 5 under an incoming message, so that closing returns there', () => {
    const world = scene();
    add(world, 17);
    world.state.player.leftDisplay.page = 5;
    // A message plays on page 5, which otherwise the frame-end handler would leave for page 0 (CB-09).
    const item = { message: { table: 20983, face: null, index: 0 }, due: 0, callback: 'none', speaker: null } as const;
    world.state.communications.channel = { phase: 'playing', item, startClock: 0, frameDurations: [1000] };
    world.state.player.communications.menu = { level: 4, table: 'other', items: [{ key: key('x'), value: { type: 'exit' } }] };
    expect(constructWorld(world.state).step(tickInput([open, close]))).toEqual([accepted(0, open), page(5, 2, 0), accepted(1, close), page(2, 5, 1)]);
    expect(world.state.player.communications.menuSavedPage).toBe(5);
  });

  it('leaves select-number wrong-context and close no-change while no menu page is shown', () => {
    const world = scene();
    add(world, 17);
    world.state.player.communications.menu = { level: 2, table: 'categories', items: [{ key: key('1'), value: { type: 'category', source: 1, kindMask: 0x20000 } }] };
    const events = constructWorld(world.state).step(tickInput([digit(1), close]));
    expect(events).toEqual([result(0, digit(1), 'ignored', 'wrong-context'), result(1, close, 'ignored', 'no-change')]);
    expect(world.state.player.communications.menu?.level).toBe(2);
    expect(world.state.player.leftDisplay.page).toBe(0);
  });
});

describe('the menu levels in one batch (CB-07; comm §7.2, §7.7)', () => {
  it('handles open → digit → digit → close → digit in order with exactly one result each', () => {
    const world = scene();
    add(world, 1);
    const near = add(world, 17);
    add(world, 17, { position: { x: 0, y: 5000, z: 0 } });
    const commands = [open, digit(2), digit(1), close, digit(1)];
    expect(constructWorld(world.state).step(tickInput(commands))).toEqual([
      accepted(0, open), page(0, 2, 0),
      accepted(1, digit(2)), page(2, 3, 1),
      accepted(2, digit(1)), page(3, 4, 2),
      accepted(3, close), page(4, 0, 3),
      result(4, digit(1), 'ignored', 'wrong-context'),
    ]);
    expect(shown(world)).toEqual({ page: 0, menu: null });
    // The partner stays after a close; only the next c clears it.
    expect(world.state.player.communications.partner).toBe(near.id);
  });

  it('lists every object of a category on page 3 and builds the chosen one\'s command menu on page 4', () => {
    const world = scene();
    const near = add(world, 17);
    const parked = add(world, 17, { activity: 'parked', movement: null });
    const outer = constructWorld(world.state);
    outer.step(tickInput([open, digit(1)]));
    expect(shown(world).page).toBe(3);
    expect(itemsOf(world.state.player.communications.menu)).toEqual([['1', near.id], ['2', parked.id], ['X', { type: 'exit' }]]);
    // A parked base is listed, but its menu is TABL 2005's (activity 1 is part of the near gate).
    expect(outer.step(tickInput([digit(2)]))).toEqual([accepted(0, digit(2), 2), page(3, 4, 0, 2)]);
    expect(world.state.player.communications.menu).toMatchObject({ level: 4, table: 'other' });
    expect(itemsOf(world.state.player.communications.menu)).toEqual([['1', { type: 'command', source: 0, code: 7 }], ['x', { type: 'exit' }]]);
    expect(world.state.player.communications.partner).toBe(parked.id);
  });

  it('skips the object list for one object, and picks the wingman\'s table for kind 2', () => {
    const world = scene();
    const wingman = add(world, 1, { position: { x: 0, y: 9000, z: 0 } });
    expect(constructWorld(world.state).step(tickInput([open, digit(1)]))).toEqual([accepted(0, open), page(0, 2, 0), accepted(1, digit(1)), page(2, 4, 1)]);
    expect(world.state.player.communications.partner).toBe(wingman.id);
    expect(world.state.player.communications.menu).toMatchObject({ level: 4, table: 'kind2' });
    expect(itemsOf(world.state.player.communications.menu).map(([itemKey]) => itemKey)).toEqual(['1', '2', '3', '4', '5', '6', '7', 'x']);
  });

  it('chooses TABL 2003 only at the near gate: distance 1000 passes, the next f32 does not, and a sub-state other than 0 fails it', () => {
    const tables = [{ x: 1000, sub: 0 }, { x: Math.fround(1000.0001), sub: 0 }, { x: 10, sub: 3 }].map(({ x, sub }) => {
      const world = scene();
      add(world, 17, { position: { x, y: 0, z: 0 } });
      world.state.flow.subState = sub as 0 | 3;
      constructWorld(world.state).step(tickInput([open, digit(1)]));
      return world.state.player.communications.menu?.table;
    });
    expect(tables).toEqual(['gated', 'other', 'other']);
  });

  it('closes from every level with x, returning the saved page each time', () => {
    const world = scene();
    add(world, 17);
    add(world, 17);
    const outer = constructWorld(world.state);
    world.state.player.leftDisplay.page = 1;
    expect(outer.step(tickInput([open, close, open, digit(1), close, open, digit(1), digit(1), close]))).toEqual([
      accepted(0, open), page(1, 2, 0), accepted(1, close), page(2, 1, 1),
      accepted(2, open), page(1, 2, 2), accepted(3, digit(1)), page(2, 3, 3), accepted(4, close), page(3, 1, 4),
      accepted(5, open), page(1, 2, 5), accepted(6, digit(1)), page(2, 3, 6), accepted(7, digit(1)), page(3, 4, 7), accepted(8, close), page(4, 1, 8),
    ]);
    expect(shown(world)).toEqual({ page: 1, menu: null });
  });

  it('repeats open and close: open on a menu page is no-change, close without a menu no-change', () => {
    const world = scene();
    add(world, 17);
    const commands = [open, open, close, close, open, close];
    expect(constructWorld(world.state).step(tickInput(commands))).toEqual([
      accepted(0, open), page(0, 2, 0),
      result(1, open, 'ignored', 'no-change'),
      accepted(2, close), page(2, 0, 2),
      result(3, close, 'ignored', 'no-change'),
      accepted(4, open), page(0, 2, 4),
      accepted(5, close), page(2, 0, 5),
    ]);
  });

  it('gives an unmatched digit no-candidate and leaves the menu and page as they are', () => {
    const world = scene();
    add(world, 17);
    add(world, 17);
    const outer = constructWorld(world.state);
    outer.step(tickInput([open]));
    // Only the base category is shown: '1' and the exit.
    expect(outer.step(tickInput([digit(9), digit(2), digit(1), digit(9)]))).toEqual([
      result(0, digit(9), 'ignored', 'no-candidate', 2),
      result(1, digit(2), 'ignored', 'no-candidate', 2),
      accepted(2, digit(1), 2), page(2, 3, 2, 2),
      result(3, digit(9), 'ignored', 'no-candidate', 2),
    ]);
    expect(shown(world).page).toBe(3);
  });

  it('takes the first of duplicate keys and folds them: an uppercase exit answers close', () => {
    const world = scene();
    const base = add(world, 17);
    const state = withMenus(world.state, {
      commands: { ...world.state.ruleData.communications.menus.commands, gated: [{ key: key('1'), code: 7 }, { key: key('1'), code: 9 }, { key: key('X'), code: 0 }] },
    });
    const context = judgeTick(state, [open, digit(1), digit(1)]);
    expect(deliveries(context)).toEqual([{ type: 'deliver-command', receiver: base.id, code: 7, sender: world.player.id, commandIndex: 2 }]);
    expect(state.flow.subState).toBe(0);
    expect(state.player.communications.menuSavedPage).toBe(0);
  });
});

describe('choosing a command (CB-07 page 4, CB-02 row 1; CD1)', () => {
  it('posts deliver-command to the partner and returns to the saved page; request handling then writes it into the partner', () => {
    const world = scene();
    const base = add(world, 17);
    const commands = [open, digit(1), digit(1)];
    const context = judgeTick(world.state, commands);
    expect(context.events).toEqual([accepted(0, open), page(0, 2, 0), accepted(1, digit(1)), page(2, 4, 1), accepted(2, digit(1)), page(4, 0, 2)]);
    expect(shown(world)).toEqual({ page: 0, menu: null });
    expect(world.state.flow).toEqual({ mainState: 3, subState: 0, dockingDeadline: 0 });
    expect(deliveries(context)).toEqual([{ type: 'deliver-command', receiver: base.id, code: 7, sender: world.player.id, commandIndex: 2 }]);
    const formal = scene();
    const receiver = add(formal, 17);
    expect(constructWorld(formal.state).step(tickInput(commands)).at(-1)).toEqual({
      type: 'command-delivered', tick: 1, receiverEntityId: receiver.id, receiverKindBit: 17, code: 7, senderEntityId: formal.player.id, commandIndex: 2,
    });
    expect(receiver.ai.pendingCommand).toEqual({ code: 7, issuedTick: 1 });
  });

  it('posts before the update\'s control requests, so a same-tick throttle follows it', () => {
    const world = scene();
    add(world, 17);
    const context = judgeTick(world.state, [open, digit(1), { type: 'speed-preset', level: 3 }, digit(1)]);
    const types: string[] = [];
    context.requests.handle((request) => void types.push(request.type));
    expect(types).toEqual(['deliver-command', 'control']);
  });

  it('starts the docking wait for code 9: docking object, sub-state 3 whatever it was, deadline this clock + 0x780', () => {
    const world = scene();
    const base = add(world, 17);
    // The near menu is built at sub-state 0; at sub-state 5 its docking item is still there (comm §7.5).
    judgeTick(world.state, [open, digit(1)]);
    world.state.flow.subState = 5;
    const context = judgeTick(world.state, [digit(2)]);
    const deadlineClock = world.state.clock + 0x780;
    expect(context.events).toEqual([
      accepted(0, digit(2), 2),
      page(4, 0, 0, 2),
      { type: 'docking-requested', tick: 2, playerEntityId: world.player.id, dockingObject: base.id, previousSubState: 5, deadlineClock, commandIndex: 0 },
    ]);
    expect(world.state.flow).toEqual({ mainState: 3, subState: 3, dockingDeadline: deadlineClock });
    expect(world.state.player.dockingObject).toBe(base.id);
    expect(deliveries(context)).toEqual([{ type: 'deliver-command', receiver: base.id, code: 9, sender: world.player.id, commandIndex: 0 }]);
  });

  it('starts the docking wait without delivering when the partner was removed, through the formal step', () => {
    const world = scene();
    const base = add(world, 17);
    const outer = constructWorld(world.state);
    outer.step(tickInput([open, digit(1)]));
    world.state.entities.remove(base);
    const events = outer.step(tickInput([digit(2)]));
    expect(events).toEqual([
      accepted(0, digit(2), 2),
      page(4, 0, 0, 2),
      { type: 'docking-requested', tick: 2, playerEntityId: world.player.id, dockingObject: base.id, previousSubState: 0, deadlineClock: world.state.clock + 0x780, commandIndex: 0 },
    ]);
    expect(world.state.player.dockingObject).toBe(base.id);
    expect(world.state.flow.subState).toBe(3);
  });

  it('posts nothing for a removed partner\'s other command, and closes a menu whose object went before its command menu was built', () => {
    const world = scene();
    const first = add(world, 17);
    add(world, 17);
    const outer = constructWorld(world.state);
    outer.step(tickInput([open, digit(1), digit(1)]));
    world.state.entities.remove(first);
    expect(outer.step(tickInput([digit(1)]))).toEqual([accepted(0, digit(1), 2), page(4, 0, 0, 2)]);
    expect(world.state.flow.subState).toBe(0);

    // Page 3 lists the removed object until its choice, which then fails to build a command menu: a close.
    const listed = scene();
    const gone = add(listed, 17);
    add(listed, 17);
    const world2 = constructWorld(listed.state);
    world2.step(tickInput([open, digit(1)]));
    listed.state.entities.remove(gone);
    expect(world2.step(tickInput([digit(1)]))).toEqual([accepted(0, digit(1), 2), page(3, 0, 0, 2)]);
    expect(listed.state.player.communications).toMatchObject({ menu: null, partner: gone.id });
  });

  it('closes when the chosen category has emptied since the menu was built', () => {
    const world = scene();
    const base = add(world, 17);
    const outer = constructWorld(world.state);
    outer.step(tickInput([open]));
    world.state.entities.remove(base);
    expect(outer.step(tickInput([digit(1)]))).toEqual([accepted(0, digit(1), 2), page(2, 0, 0, 2)]);
    expect(shown(world)).toEqual({ page: 0, menu: null });
  });
});

describe('other commands while a menu is open (CB-07; P3-05 rule 5)', () => {
  it('keeps Enter as the manual speed match and leaves speed-preset, target and fire to their rules', () => {
    const world = scene();
    const base = add(world, 17);
    add(world, 17);
    world.state.player.target = base.id;
    const preset: Command = { type: 'speed-preset', level: 3 };
    const enter: Command = { type: 'confirm-selection' };
    const target: Command = { type: 'target', operation: 'next' };
    const context = judgeTick(world.state, [open, enter, preset, digit(1), target, { type: 'fire', channel: 'primary' }, digit(2)]);
    const results = context.events.flatMap((event) => (event.type === 'command-result' ? [[event.commandType, event.outcome]] : []));
    expect(results.slice(0, 4)).toEqual([['communications', 'accepted'], ['confirm-selection', 'accepted'], ['speed-preset', 'accepted'], ['select-number', 'accepted']]);
    expect(results[4][0]).toBe('target');
    expect(results[5][0]).toBe('fire');
    expect(results[6]).toEqual(['select-number', 'accepted']);
    expect(context.events.filter(({ type }) => type === 'left-page-changed').map((event) => (event.type === 'left-page-changed' ? event.page : null))).toEqual([2, 3, 4]);
    const types: string[] = [];
    context.requests.handle((request) => void types.push(request.type));
    expect(types.slice(0, 2)).toEqual(['match-speed', 'control']);
    expect(world.state.player.communications.menu).toMatchObject({ level: 4 });
  });
});

describe('player, context and subsystem gates (CB-07 rules 1, 3 and 4)', () => {
  const P3_10 = [open, close, digit(1), navigate, launch];

  it('gives every P3-10 command player-unavailable without an available player, before the context', () => {
    for (const make of [
      (world: Scene) => void (world.state.player.entityId = null),
      (world: Scene) => void (world.player.destroyed = true),
      (world: Scene) => void (world.player.state = 'pending-removal'),
      (world: Scene) => { world.player.destroyed = true; world.state.player.viewMode = 6; },
    ]) {
      const world = scene();
      add(world, 17);
      make(world);
      const events = constructWorld(world.state).step(tickInput(P3_10));
      expect(events.filter(({ type }) => type === 'command-result')).toEqual(P3_10.map((command, index) => result(index, command, 'ignored', 'player-unavailable')));
    }
  });

  it.each([
    ['Warp', 2, [[open, 'wrong-context'], [digit(1), 'wrong-context'], [close, 'wrong-context'], [navigate, 'wrong-context'], [launch, 'wrong-context']]],
    ['map', 8, [[open, 'wrong-context'], [digit(1), 'wrong-context'], [close, 'wrong-context'], [navigate, 'wrong-context'], [launch, 'wrong-context']]],
    ['base', 6, [[open, 'wrong-context'], [digit(1), 'wrong-context'], [close, 'wrong-context'], [navigate, 'not-implemented'], [launch, 'not-implemented']]],
    ['flight', FLIGHT, [[navigate, 'wrong-context'], [launch, 'wrong-context']]],
  ] as const)('judges P3-10\'s commands in the %s context (view %i) by its gate, changing nothing', (_, viewMode, rows) => {
    const [judged, idle] = [scene(), scene()];
    for (const world of [judged, idle]) {
      add(world, 17);
      world.state.player.viewMode = viewMode;
      world.state.player.leftDisplay.page = 4;
      world.state.player.communications.menu = { level: 4, table: 'other', items: [{ key: key('1'), value: { type: 'command', source: 0, code: 7 } }, { key: key('x'), value: { type: 'exit' } }] };
      world.state.player.communications.partner = 2;
    }
    const events = judgeTick(judged.state, rows.map(([command]) => command)).events;
    expect(events).toEqual(rows.map(([command, reason], index) => result(index, command, reason === 'not-implemented' ? 'rejected' : 'ignored', reason)));
    judgeTick(idle.state, []);
    expect(stateText(judged.state)).toBe(stateText(idle.state));
  });

  it('keeps a menu through the base context and uses it again once back in flight (comm §7.6)', () => {
    const world = scene();
    const base = add(world, 17);
    const outer = constructWorld(world.state);
    outer.step(tickInput([open, digit(1)]));
    world.state.player.viewMode = 6;
    const events = judgeTick(world.state, [digit(1), close]).events;
    expect(events).toEqual([result(0, digit(1), 'ignored', 'wrong-context', 2), result(1, close, 'ignored', 'wrong-context', 2)]);
    world.state.player.viewMode = FLIGHT;
    const back = judgeTick(world.state, [digit(1)]);
    expect(deliveries(back)).toEqual([expect.objectContaining({ receiver: base.id, code: 7 })]);
  });

  it('takes a menu page whose menu has another level as a broken invariant', () => {
    const world = scene();
    world.state.player.leftDisplay.page = 2;
    world.state.player.communications.menu = { level: 4, table: 'other', items: [{ key: key('x'), value: { type: 'exit' } }] };
    expectFault(() => constructWorld(world.state).step(tickInput([digit(1)])), 'invariant-violated', 'communications.menu-page');
    const opened = scene();
    opened.state.player.leftDisplay.page = 3;
    opened.state.player.communications.menu = { level: 2, table: 'categories', items: [{ key: key('x'), value: { type: 'exit' } }] };
    expectFault(() => constructWorld(opened.state).step(tickInput([open])), 'invariant-violated', 'communications.menu-page');
  });

  it('gives confirm-selection in the base and map contexts player-unavailable first, and not-implemented to an available player', () => {
    const enter: Command = { type: 'confirm-selection' };
    for (const viewMode of [6, 8]) {
      const world = scene();
      world.state.player.viewMode = viewMode;
      expect(judgeTick(world.state, [enter]).events).toEqual([result(0, enter, 'rejected', 'not-implemented')]);
      world.player.destroyed = true;
      expect(judgeTick(world.state, [enter]).events).toEqual([result(0, enter, 'ignored', 'player-unavailable', 2)]);
    }
  });
});

describe('the menu page handler at frame end (CB-09 item 1; comm §7.5)', () => {
  it('sets a menu page without a menu to 0 without a command, unless field 13 is 2 or the view has no left display', () => {
    const cases: { page: LeftPage; viewMode: number; field: 0 | 1 | 2; expected: LeftPage }[] = [
      { page: 3, viewMode: FLIGHT, field: 0, expected: 0 },
      { page: 4, viewMode: 6, field: 1, expected: 0 },
      { page: 2, viewMode: FLIGHT, field: 2, expected: 2 },
      { page: 3, viewMode: 8, field: 0, expected: 3 },
    ];
    for (const { page: shownPage, viewMode, field, expected } of cases) {
      const world = scene();
      world.state.player.leftDisplay.page = shownPage;
      world.state.player.viewMode = viewMode;
      setCommunicationsField(world, field);
      const events = constructWorld(world.state).step(tickInput());
      expect(events.filter(({ type }) => type === 'left-page-changed')).toEqual(expected === shownPage ? [] : [page(shownPage, 0, null)]);
      expect(world.state.player.leftDisplay.page).toBe(expected);
    }
  });

  it('leaves a menu page with its menu, and a no-candidate digit on a page without one, in the same tick before the handler', () => {
    const world = scene();
    add(world, 17);
    const outer = constructWorld(world.state);
    outer.step(tickInput([open]));
    expect(outer.step(tickInput())).toEqual([]);
    expect(shown(world).page).toBe(2);
    world.state.player.communications.menu = null;
    expect(outer.step(tickInput([digit(1)]))).toEqual([result(0, digit(1), 'ignored', 'no-candidate', 3), page(2, 0, null, 3)]);
  });
});
