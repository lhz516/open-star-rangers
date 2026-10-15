import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { Command } from '../contracts/tick-input.ts';
import { snapshotHash } from '../replay/snapshot.ts';
import { idleBaseService } from '../systems/base-interior.test-support.ts';
import { DOCKING_REPLY, radioItem, snapshotOf, STATUS_REPLY, TEST_MESSAGES } from '../systems/radio.test-support.ts';
import type { Entity, EntityInit, SubsystemState } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stateText, stillEntityInit, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { MessageIdentity, WorldState } from '../world/world-state.ts';
import { projectCommunications } from './communications.ts';
import { projectWorld, type CommunicationsPlayer, type CommunicationsProjection } from './projection.ts';

// Consumer contract of the communications partition (docs/plan/p3/02/spec.md, CB-14; docs/plan/p3/10/spec.md, AC-05,
// 规则输入与读模型边界 and D-01 item 2 ⑥). Expectations are written out by hand from CB-02, CB-03, CB-09, CB-11 and
// comm.md §7, not from the projection or the rules' helpers. The synthetic menus (create-world.test-support.ts):
// categories W (kind bit 1, item 0), B (kind bit 17, item 1) and N (kind bit 18, item 2) with the exit `x`; the object
// list's exit `X`; TABL 2003 '1' → 7, '2' → 9, 'X'; TABL 2005 '1' → 7, 'x'. The service selectors are
// [0, 33, 34, 5, 7, 8, 1, 2, 18, 3, 9]. Eight clock units per tick make one 1/8 s of playback per tick.

const UNITS_PER_TICK = 8;
const COMM_MENUS = 'data/comm-menus';
const key = (character: string): number => character.charCodeAt(0);

const open: Command = { type: 'communications', operation: 'open' };
const close: Command = { type: 'communications', operation: 'close' };
const digit = (value: number): Command => ({ type: 'select-number', value });

const STATUS_MESSAGE: MessageIdentity = { table: 20011, face: 0, index: 1 };
const DOCKING_MESSAGE: MessageIdentity = { table: 20011, face: 0, index: 0 };

interface Scene {
  readonly state: WorldState;
  readonly player: Entity;
  readonly world: World;
}

/** A drained world with TEST_MESSAGES and an available player at the origin whose automatic target selection is not due. */
function scene(): Scene {
  const drained = testState({ clockUnitsPerTick: UNITS_PER_TICK });
  const { communications } = drained.ruleData;
  const state: WorldState = { ...drained, ruleData: { ...drained.ruleData, communications: { ...communications, messages: TEST_MESSAGES } } };
  const player = addPlayerEntity(state, { position: { x: 0, y: 0, z: 0 } });
  player.state = 'active';
  state.player.targeting!.autoTargetDueClock = 1e9;
  return { state, player, world: constructWorld(state) };
}

/** An active, standing entity of `kindBit` in state 7, at x = 100 unless overridden; a base has face 0 already. */
function add({ state }: Scene, kindBit: number, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position: { x: 100, y: 0, z: 0 }, ...overrides }));
  entity.state = 'active';
  entity.communications.face = 0;
  return entity;
}

function craftCombat(player: Entity) {
  if (player.combat.type !== 'craft') throw new Error('the test player is a craft');
  return player.combat;
}

function setSubsystems(player: Entity, fields: Readonly<Record<number, SubsystemState>>): void {
  const combat = craftCombat(player);
  combat.subsystems = combat.subsystems.map((value, field) => fields[field] ?? value);
}

function readings(world: World): CommunicationsPlayer {
  const { communications } = world.projection();
  if (communications.readiness !== 'ready' || communications.player === null) throw new Error('no communications player');
  return communications.player;
}

/** Steps until `done` holds, at most `limit` ticks; returns the tick it held at. */
function stepUntil(world: World, state: WorldState, done: (player: CommunicationsPlayer) => boolean, limit = 200): number {
  for (let count = 0; count < limit; count++) {
    world.step(tickInput());
    if (done(readings(world))) return state.tick;
  }
  throw new Error('the condition never held');
}

const IDLE_DOCKING = { subState: 0, dockingObject: null, docked: false };
const NO_WARNINGS = { attackerOnTail: false, missileIncoming: false };

describe('communications partition readiness (CB-14)', () => {
  it('is ready with a null player without a player entity, and keeps a destroyed player\'s readings', () => {
    const state = testState();
    const none: CommunicationsProjection = { readiness: 'ready', player: null };
    expect(projectWorld(state).communications).toEqual(none);
    const player = addPlayerEntity(state);
    const live = projectWorld(state).communications;
    player.destroyed = true;
    expect(projectWorld(state).communications).toEqual(live);
    expect(live).toMatchObject({ readiness: 'ready', player: { entityId: player.id } });
    state.player.entityId = null;
    expect(projectWorld(state).communications).toEqual(none);
  });

  it('reads a player at rest: the page, field 13, no menu, no message, no docking, no base and no warning', () => {
    const { world, player } = scene();
    setSubsystems(player, { 13: 1 });
    world.step(tickInput());
    expect(world.projection().communications).toEqual({
      readiness: 'ready',
      player: { entityId: player.id, page: 0, subsystem: 1, menu: null, incoming: null, docking: IDLE_DOCKING, base: null, warnings: NO_WARNINGS },
    });
  });

  it('is a Core fault when the player entity does not resolve or is not a craft', () => {
    const state = testState();
    addPlayerEntity(state);
    state.player.entityId = 99;
    expectFault(() => projectCommunications(state), 'invariant-violated', 'communications.player');
    state.player.entityId = state.entities.allocate(entityInit(20)).id;
    expect(state.entities.get(state.player.entityId)?.combat.type).not.toBe('craft');
    expectFault(() => projectCommunications(state), 'invariant-violated', 'communications.player');
  });
});

describe('the menu view (CB-14; comm §7.2, §7.3)', () => {
  it('shows each level with its table, partner, positions, keys and source references, and nothing once closed', () => {
    const current = scene();
    const { world, state } = current;
    add(current, 1, { position: { x: 0, y: 9000, z: 0 } });
    const near = add(current, 17);
    const far = add(current, 17, { position: { x: 0, y: 5000, z: 0 } });
    state.player.leftDisplay.page = 1;

    world.step(tickInput([open]));
    expect(readings(world)).toMatchObject({ page: 2 });
    expect(readings(world).menu).toEqual({
      menu: { asset: COMM_MENUS, table: 'categories' },
      level: 2,
      partnerEntityId: null,
      options: [
        { position: 1, key: key('1'), value: { type: 'category', source: 0, kindMask: 0x2 } },
        { position: 2, key: key('2'), value: { type: 'category', source: 1, kindMask: 0x20000 } },
        { position: 3, key: key('x'), value: { type: 'exit' } },
      ],
    });

    world.step(tickInput([digit(2)]));
    const object = (entity: Entity) => ({ type: 'object', entityId: entity.id, kindBit: 17, name: entity.name, tone: 'active' });
    expect(readings(world).menu).toEqual({
      menu: { asset: COMM_MENUS, table: 'objects' },
      level: 3,
      partnerEntityId: null,
      options: [
        { position: 1, key: key('1'), value: object(near) },
        { position: 2, key: key('2'), value: object(far) },
        { position: 3, key: key('X'), value: { type: 'exit' } },
      ],
    });

    // The near base within 1000 units of the player, active, in sub-state 0 and flight: TABL 2003.
    world.step(tickInput([digit(1)]));
    expect(readings(world)).toMatchObject({ page: 4 });
    expect(readings(world).menu).toEqual({
      menu: { asset: COMM_MENUS, table: 'gated' },
      level: 4,
      partnerEntityId: near.id,
      options: [
        { position: 1, key: key('1'), value: { type: 'command', source: 0, code: 7 } },
        { position: 2, key: key('2'), value: { type: 'command', source: 1, code: 9 } },
        { position: 3, key: key('X'), value: { type: 'exit' } },
      ],
    });

    // Closed: back to the saved page, no menu; the partner stays until the next `c`.
    world.step(tickInput([close]));
    expect(readings(world)).toMatchObject({ page: 1, menu: null });
    expect(state.player.communications.partner).toBe(near.id);
  });

  it('shows no dormant menu: a built menu off pages 2–4 is not shown, and shows again when its page returns', () => {
    const current = scene();
    const { world, state } = current;
    add(current, 17);
    add(current, 17, { position: { x: 0, y: 5000, z: 0 } });
    world.step(tickInput([open, digit(1)]));
    const objects = readings(world).menu;
    expect(objects).toMatchObject({ level: 3 });
    // The rules leave a built menu under page 5 while a message plays (RQ8); the menu is dormant, not closed.
    state.communications.queue.push(radioItem(STATUS_MESSAGE, 0));
    world.step(tickInput());
    expect(readings(world)).toMatchObject({ page: 3, incoming: null });
    world.step(tickInput());
    expect(readings(world)).toMatchObject({ page: 5, menu: null, incoming: { shown: true } });
    expect(state.player.communications.menu).not.toBeNull();
    stepUntil(world, state, (player) => player.incoming === null);
    expect(readings(world)).toMatchObject({ page: 3, incoming: null });
    expect(readings(world).menu).toEqual(objects);
  });
});

describe('the incoming view (CB-09, CB-14; D-03 items 2, 3)', () => {
  it('gives the playing message, its speaker snapshot after the speaker goes, and its frame at the world clock', () => {
    const current = scene();
    const { world, state } = current;
    const base = add(current, 17);
    state.communications.queue.push(radioItem(STATUS_MESSAGE, 0, 'none', snapshotOf(base)));
    // Tick 1 takes it (loading, not shown); tick 2 plays it from clock 16.
    world.step(tickInput());
    expect(readings(world)).toMatchObject({ page: 0, incoming: null });
    const speaker = { entityId: base.id, kindBit: 17, name: base.name };
    const incoming = (frame: number) => ({ message: STATUS_MESSAGE, speaker, frame, frameCount: STATUS_REPLY.length, shown: true });
    world.step(tickInput());
    expect(readings(world)).toMatchObject({ page: 5, incoming: incoming(0) });

    base.state = 'pending-removal';
    // 5 + 8 + 5 eighths from clock 16, one eighth a tick: frame 0 to tick 6, frame 1 from tick 7, frame 2 from tick 15.
    const frames: [number, number | null][] = [];
    for (let tick = 3; tick <= 20; tick++) {
      world.step(tickInput());
      frames.push([tick, readings(world).incoming?.frame ?? null]);
    }
    expect(state.entities.get(base.id)).toBeUndefined();
    expect(frames).toEqual([
      ...[3, 4, 5, 6].map((tick) => [tick, 0]),
      ...[7, 8, 9, 10, 11, 12, 13, 14].map((tick) => [tick, 1]),
      ...[15, 16, 17, 18, 19].map((tick) => [tick, 2]),
      [20, null],
    ]);
    expect(readings(world)).toMatchObject({ page: 0, incoming: null });
  });

  it('plays the message off page 5 in the Warp view and under a menu opened over it', () => {
    const warp = scene();
    warp.state.player.viewMode = 1;
    warp.state.communications.queue.push(radioItem(STATUS_MESSAGE, 0));
    warp.world.step(tickInput());
    warp.world.step(tickInput());
    expect(readings(warp.world)).toMatchObject({ page: 0, incoming: { message: STATUS_MESSAGE, speaker: null, frame: 0, shown: false } });
    // Page 5 left over in the Warp view does not show the message there either.
    warp.state.player.leftDisplay.page = 5;
    expect(projectCommunications(warp.state).player).toMatchObject({ page: 5, incoming: { shown: false } });

    const over = scene();
    add(over, 17);
    over.state.communications.queue.push(radioItem(STATUS_MESSAGE, 0));
    over.world.step(tickInput());
    over.world.step(tickInput());
    expect(readings(over.world)).toMatchObject({ page: 5, incoming: { shown: true } });
    over.world.step(tickInput([open]));
    expect(readings(over.world)).toMatchObject({ page: 2, menu: { level: 2 }, incoming: { frame: 0, shown: false } });
  });
});

describe('docking and the base view (CB-02, CB-10, CB-11, CB-14)', () => {
  it('follows a docking request through the reply, the countdown and docking into the base view', () => {
    const current = scene();
    const { world, state, player } = current;
    const base = add(current, 17);
    // Fields 2 at 2, 3 at 1 and 15 at 1: records 7 (selector 2), 9 (3) and 1 (group 33) need service. A full hull keeps
    // the status display's field 1 at 0; it writes fields 5 and 8 from the intact mounts, 0.
    setSubsystems(player, { 2: 2, 3: 1, 15: 1 });
    craftCombat(player).hull = state.craftInfo.content.craft[0].at9C;
    world.step(tickInput([open, digit(1), digit(2)]));
    expect(readings(world).docking).toEqual({ subState: 3, dockingObject: base.id, docked: false });

    const started = stepUntil(world, state, (reading) => reading.incoming !== null);
    expect(readings(world)).toMatchObject({
      page: 5,
      incoming: { message: DOCKING_MESSAGE, speaker: { entityId: base.id, kindBit: 17, name: base.name }, frame: 0, frameCount: 3, shown: true },
      docking: { subState: 3 },
    });
    // 5 + 10 + 5 eighths, one a tick; the reply's callback starts the countdown as it ends.
    const ended = stepUntil(world, state, (reading) => reading.incoming === null);
    expect(ended - started).toBe(DOCKING_REPLY.reduce((sum, duration) => sum + duration, 0));
    expect(readings(world)).toMatchObject({ docking: { subState: 4, dockingObject: base.id, docked: false }, base: null });

    // 0x200 units after the end's clock, read by the mission flow one tick later: docking 65 ticks after the end.
    const docked = stepUntil(world, state, (reading) => reading.docking.docked);
    expect(docked - ended).toBe(0x200 / UNITS_PER_TICK + 1);
    // Rows: record 0, then 1 (state 1) before it, 2–6 after, 7 (state 2) first, 8 after, 9 (state 1) before record 0, 10.
    const row = (record: number, selector: number, serviceState = 0) => ({ record, selector, state: serviceState });
    expect(readings(world)).toEqual({
      entityId: player.id,
      page: 0,
      subsystem: 0,
      menu: null,
      incoming: null,
      docking: { subState: 5, dockingObject: base.id, docked: true },
      base: {
        baseEntityId: base.id,
        rows: [row(7, 2, 2), row(1, 33, 1), row(9, 3, 1), row(0, 0), row(2, 34), row(3, 5), row(4, 7), row(5, 8), row(6, 1), row(8, 18), row(10, 9)],
        cursor: 0,
        flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
      },
      warnings: NO_WARNINGS,
    });
    expect(world.projection().player.interactionContext).toBe('base');
  });

  it('reads the rows in their one order with each selector\'s state, the groups folded, and follows the base keys', () => {
    const current = scene();
    const { world, state, player } = current;
    const base = add(current, 17);
    player.activity = 'docked';
    state.flow.subState = 5;
    state.player.dockingObject = base.id;
    state.player.viewMode = 6;
    state.baseService = { ...idleBaseService(), rows: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10], cursor: 1 };
    state.baseService.flags.hullFull = true;
    // Group 33 over fields 15–18 [2, 1, 0, 2] counts 2; group 34 over fields 10–14 [0, 1, 1, 0, 2] counts 2.
    setSubsystems(player, { 5: 1, 15: 2, 16: 1, 18: 2, 11: 1, 12: 1, 14: 2 });
    const rowsOf = () => readings(world).base?.rows.map(({ record, selector, state: serviceState }) => [record, selector, serviceState]);
    expect(rowsOf()).toEqual([[3, 5, 1], [0, 0, 0], [1, 33, 2], [2, 34, 2], [4, 7, 0], [5, 8, 0], [6, 1, 0], [7, 2, 0], [8, 18, 2], [9, 3, 0], [10, 9, 0]]);
    expect(readings(world).base).toMatchObject({ baseEntityId: base.id, cursor: 1, flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: true } });

    // Down to row 2 (record 1, state 2), then Enter moves it to the top; the cursor row stays.
    world.step(tickInput([{ type: 'navigate-selection', direction: 'next' }, { type: 'confirm-selection' }]));
    expect(rowsOf()?.map(([record]) => record)).toEqual([1, 3, 0, 2, 4, 5, 6, 7, 8, 9, 10]);
    expect(readings(world).base?.cursor).toBe(2);
  });

  it('shows no base outside view 6, and is a Core fault in view 6 without a base service', () => {
    const { state } = scene();
    state.baseService = idleBaseService();
    state.player.viewMode = 8;
    expect(projectCommunications(state).player?.base).toBeNull();
    state.player.viewMode = 6;
    state.baseService = null;
    const fault = expectFault(() => projectWorld(state), 'invariant-violated', 'communications.base');
    expect(thrownBy(() => constructWorld(state).projection())).toMatchObject({ site: fault.site });
  });
});

describe('the warning lights (CB-09)', () => {
  it('reads the tail check\'s two indicators as the rules left them', () => {
    const { state } = scene();
    Object.assign(state.communications.tailCheck, { attackerOnTail: true, missileIncoming: false });
    expect(projectCommunications(state).player?.warnings).toEqual({ attackerOnTail: true, missileIncoming: false });
    Object.assign(state.communications.tailCheck, { attackerOnTail: false, missileIncoming: true });
    expect(projectCommunications(state).player?.warnings).toEqual({ attackerOnTail: false, missileIncoming: true });
  });
});

describe('a read-only, recoverable reading (AC-05; 身份与快照)', () => {
  /**
   * A scene driven alike every time: tick 1 opens the object list of two bases, the farther of which has a message
   * queued; it plays from tick 2 and the speaker is removed at tick 3.
   */
  function driven(): Scene & { readonly speaker: Entity } {
    const current = scene();
    add(current, 17);
    const speaker = add(current, 17, { position: { x: 0, y: 5000, z: 0 } });
    current.state.communications.queue.push(radioItem(STATUS_MESSAGE, 0, 'none', snapshotOf(speaker)));
    return { ...current, speaker };
  }
  function drive({ world, speaker }: ReturnType<typeof driven>, tick: number) {
    if (tick === 3) speaker.state = 'pending-removal';
    return world.step(tickInput(tick === 1 ? [open, digit(1)] : []));
  }

  it('lets a consumer that attaches late read the same menu and message as one that read every tick, without changing the world', () => {
    const [reader, late] = [driven(), driven()];
    for (let tick = 1; tick <= 12; tick++) {
      const hash = snapshotHash(reader.world.snapshot());
      const rng = reader.state.rngState;
      const [first, second] = [reader.world.projection(), reader.world.projection()];
      expect(snapshotHash(reader.world.snapshot())).toBe(hash);
      expect(reader.state.rngState).toEqual(rng);
      expect(second).toEqual(first);
      expect(second.communications).not.toBe(first.communications);
      expect(deepFrozen(first)).toBe(true);
      expect(drive(reader, tick)).toEqual(drive(late, tick));
    }
    expect(stateText(reader.state)).toBe(stateText(late.state));
    // At tick 12 the dormant object list lies under page 5 and the removed base's message plays.
    const recovered = readings(late.world);
    expect(recovered).toEqual(readings(reader.world));
    expect(recovered).toMatchObject({ page: 5, menu: null, incoming: { message: STATUS_MESSAGE, frame: 1, shown: true } });
    expect(late.state.entities.get(late.speaker.id)).toBeUndefined();
    expect(recovered.incoming?.speaker).toEqual({ entityId: late.speaker.id, kindBit: 17, name: late.speaker.name });
    expect(late.state.player.communications.menu?.level).toBe(3);
  });

  it('is detached from the world: later rule changes leave an earlier reading as it was', () => {
    const current = driven();
    const { world, state } = current;
    for (let tick = 1; tick <= 3; tick++) drive(current, tick);
    world.step(tickInput([open]));
    const reading = readings(world);
    expect(reading.menu).toMatchObject({ level: 2 });
    const json = JSON.stringify(reading);
    const items = state.player.communications.menu!.items;
    expect(reading.menu?.options[0].value).not.toBe(items[0].value);
    world.step(tickInput([digit(1), close]));
    for (let tick = 0; tick < 20; tick++) world.step(tickInput());
    expect(JSON.stringify(reading)).toBe(json);
    expect(readings(world)).not.toEqual(reading);
  });

  it('gives no radio queue, loading message, docking deadline, base dues or rates, and no other entity', () => {
    const current = scene();
    const { state } = current;
    const base = add(current, 17);
    add(current, 7, { position: { x: 0, y: 0, z: 9000 } });
    state.communications.queue.push(radioItem(STATUS_MESSAGE, 0), radioItem(DOCKING_MESSAGE, 0, 'docking-reply'));
    state.communications.channel = { phase: 'loading', item: radioItem(STATUS_MESSAGE, 0), readyTick: 1 };
    Object.assign(state.flow, { subState: 5, dockingDeadline: 4321 });
    state.player.dockingObject = base.id;
    state.player.viewMode = 6;
    state.baseService = { ...idleBaseService(7777), rates: { hull: 1234, energy: 5678 } };
    const json = JSON.stringify(projectCommunications(state));
    expect(json).not.toMatch(/queue|due|deadline|rates|4321|7777|1234|5678|position|20011|readyTick|loading/);
    expect(projectCommunications(state).player).toMatchObject({ incoming: null, docking: { subState: 5, dockingObject: base.id } });
  });
});
