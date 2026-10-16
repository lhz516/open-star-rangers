import { describe, expect, it } from 'vitest';
import { mount, parameterEntry, script, scriptItem } from '../../content/rule-data/rule-data.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import type { Request } from '../systems/pipeline.ts';
import { initialWorldState } from '../world/create-world.ts';
import { aiProgramsContent, asCreateInput, craftInfoContent, declaration, missionFrame, worldInput } from '../world/create-world.test-support.ts';
import { ALL_KINDS, type AiControllerCommon, type Entity, type ExecutionState } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { expectFault, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { degreeSlot } from './ai-parameters.ts';
import { channelRange, firingDataOf } from './ai-firing.ts';
import {
  installInterpreter, removeInterpreter, runScript, runStateMachine, updateInterpreter, type InterpreterCall, type InterpreterController,
} from './ai-interpreter.ts';
import { pilotScene } from './ai-piloting.ts';
import { loadScript, parsedScript } from './ai-script.ts';
import { installedController } from './ai-selection.ts';
import type { CraftEntity } from './combat-init.ts';
import { scriptedRand } from './rand.test-support.ts';
import { steerAtTarget } from './steering.ts';

// P3-08/16 (docs/plan/p3/08/spec.md, 解释器与脚本, AC-04, AC-17; docs/plan/p3/02/spec.md, CR-16, CR-17, CR-23–CR-25;
// docs/original/formats/ai.md §5.4, §11, §12). Expectations are worked out from those records with scripted rand values:
// the words each opcode posts, its branch, the state machine's thirteen rules and the install path's order of effects.
// The subject is a kind-7 craft at runtime z 112.5 ahead of the player at the origin plane (positions ×1.875); its craft
// record has turn rates +0xAC 0.75, +0xB4 0.25, +0xB0 0.5 and maximum +0xB8 64 (the synthetic craft record).

const f32 = Math.fround;
type Items = ReturnType<typeof scriptItem>[];
type Lists = Partial<Record<'state1' | 'state2' | 'state3' | 'state5' | 'state4' | 'state6', number[]>>;

interface Setup {
  /** Scripts by position; the lists name positions. */
  readonly scripts?: readonly Items[];
  readonly lists?: Lists;
  readonly install?: Items;
  /** DFPG fields. */
  readonly parameters?: Record<string, unknown>;
  /** Table record 0's fields. */
  readonly record?: Record<string, unknown>;
  /** The kind-7 craft's declared position. */
  readonly enemyAt?: Vec3;
}

const LIST_ORDER = ['state1', 'state2', 'state3', 'state5', 'state4', 'state6'] as const;

/** AI programs with DFPG 0 (records 0 and 1) holding the given scripts in first-reach order, then record 2's DFPG. */
function aiContent({ scripts = [], lists = {}, install, parameters = {}, record = {} }: Setup) {
  const order: number[] = [];
  for (const state of LIST_ORDER) for (const position of lists[state] ?? []) if (!order.includes(position)) order.push(position);
  const base = install === undefined ? 1 : 2;
  const indexOf = (position: number): number => base + order.indexOf(position);
  const tail = base + order.length;
  const content = aiProgramsContent();
  const stateScripts = Object.fromEntries(LIST_ORDER.map((state) => [state, (lists[state] ?? []).map(indexOf)]));
  content.entries = [
    { ...parameterEntry(install === undefined ? null : 1, stateScripts), ...parameters },
    ...(install === undefined ? [] : [{ kind: 'script', items: install }]),
    ...order.map((position) => ({ kind: 'script', items: scripts[position] })),
    parameterEntry(null, { state1: [tail + 1] }),
    script(),
  ] as typeof content.entries;
  content.programs[0] = { ...content.programs[0], ...record };
  content.programs[2] = { ...content.programs[2], parameters: tail };
  return { content, indexOf };
}

interface Harness {
  readonly state: WorldState;
  readonly craft: CraftEntity;
  readonly player: Entity;
  readonly posted: Request[];
  readonly departures: number[];
  readonly indexOf: (position: number) => number;
  /** A call drawing `draws` (scripted) and counting into `tick`. */
  call(draws: readonly number[], tick?: { dispatches: number }): InterpreterCall & { readonly rand: { readonly used: number } };
  /** The controller `0x5dc0c` installs for the craft (table record 0), before the handler's mode 0. */
  common(): AiControllerCommon;
}

function harness(setup: Setup = {}): Harness {
  const { content, indexOf } = aiContent(setup);
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: setup.enemyAt ?? { x: 100, y: 200, z: 60 } }),
  ];
  // Kind 7 mounts one gun on list 0, of range 5000 (speed 100 for 3200 units).
  const craftInfo = craftInfoContent();
  Object.assign(craftInfo.guns[0], { at08: 100, at24: 3200 });
  Object.assign(craftInfo.craft[7], { mounts: [mount({ weapon: 0, at20: 0, at34: 0 })], mountLists: [[0], [], []] });
  const state = initialWorldState(asCreateInput(worldInput({ mission, craftInfo, aiPrograms: content })));
  constructWorld(state).step(tickInput());
  const entities = [...state.entities.walk(ALL_KINDS)];
  const craft = entities.find(({ kindBit }) => kindBit === 7) as CraftEntity;
  const player = entities.find(({ kindBit }) => kindBit === 0)!;
  const posted: Request[] = [];
  const departures: number[] = [];
  return {
    state, craft, player, posted, departures, indexOf,
    call: (draws, tick = { dispatches: 0 }) => {
      const rand = scriptedRand(draws);
      return { world: state, subject: craft, rand, post: (request) => void posted.push(request), depart: () => departures.push(state.clock) > 0, tick };
    },
    common: () => installedController(state.ruleData.ai.tablePrograms[0], state.craftInfo.content.craft[7]),
  };
}

/** The interpreter's controller on `common`, as installed but before any state chose a script. */
const interpreterOf = (common: AiControllerCommon): InterpreterController => ({
  ...common, handler: 'interpreter', interpreter: { state: 0, execution: null, lastRunEnded: false, steadyClock: 0, stateDeadline: 0, state4Deadline: 0 },
});

const UNSET = { clear: false, set: false, value: 0 };
const throttle = (entityId: number, factor: number) => ({ type: 'steer', entityId, control: { scale: 0, axes: [UNSET, UNSET, UNSET], speedFactor: factor } });

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Entity['orientation'];

/** Both bodies unturned (row 3 along +z), the player at runtime z `playerZ` below or above the craft at 112.5. */
function face(h: Harness, playerZ: number): void {
  h.craft.orientation = IDENTITY;
  h.player.orientation = IDENTITY;
  h.player.position = { ...h.player.position, z: playerZ };
}

/** Aims the controller at the player through `0x5c584`, the sample's `0x5c8b0` then cached so tests can set its view. */
function aimAtPlayer(h: Harness, controller: AiControllerCommon, cache = true): void {
  steerAtTarget(controller.steering, pilotScene(h.state, h.craft, controller), h.player.id);
  if (cache) controller.steering.targetSample = h.state.clock;
}

describe('the executor 0x5f4f4: dispatch, branches, yields and ends (ai §5.4)', () => {
  /** The executor's world with `scripts` in state 2's list; runs `position` on a fresh common controller. */
  function executor(scripts: readonly Items[]) {
    const h = harness({ scripts, lists: { state2: scripts.map((_, index) => index) } });
    const controller = h.common();
    const load = (position: number): ExecutionState => loadScript(h.state, h.indexOf(position), scriptedRand(Array(8).fill(0)));
    return { h, controller, load };
  }

  it('continues an action at its branch target, a test only when its condition holds; the end returns true and stays put', () => {
    const { h, controller, load } = executor([
      [scriptItem(104, '0.5', 2), scriptItem(104, '0.25'), scriptItem(9999, '1'), scriptItem(10000)],
      [scriptItem(210, '-1', 2), scriptItem(104, '0.25'), scriptItem(10000)],
    ]);
    const first = load(0);
    expect(runScript(h.call([]), controller, first)).toBe(true);
    expect(first.item).toBe(2);
    expect(h.posted).toEqual([throttle(h.craft.id, 0.5)]);
    // A further run ends at once.
    expect(runScript(h.call([]), controller, first)).toBe(true);
    expect(h.posted).toHaveLength(1);
    // A false test falls through to the next item whatever its branch.
    expect(runScript(h.call([]), controller, load(1))).toBe(true);
    expect(h.posted).toEqual([throttle(h.craft.id, 0.5), throttle(h.craft.id, 0.25)]);
  });

  it('posts opcode 100 as 0x5d0ec with three rows and 0x5d1ac (+ 0x5d41c) otherwise', () => {
    const { h, controller, load } = executor([
      [scriptItem(100, '1 0.5 -0.5 0.75'), scriptItem(100, '1 0.5 -0.5 x'), scriptItem(100, 'x 0.5 x 0.75'), scriptItem(100, '0.25 x x x'), scriptItem(10000)],
    ]);
    runScript(h.call([]), controller, load(0));
    const set = (value: number) => ({ clear: false, set: true, value });
    const cleared = { clear: true, set: false, value: 0 };
    const id = h.craft.id;
    expect(h.posted).toEqual([
      { type: 'steer', entityId: id, control: { scale: 1, axes: [set(1), set(0.5), set(-0.5)], speedFactor: 0.75 } },
      { type: 'steer', entityId: id, control: { scale: 1, axes: [set(1), set(0.5), set(-0.5)], speedFactor: null } },
      { type: 'steer', entityId: id, control: { scale: 1, axes: [cleared, set(0.5), cleared], speedFactor: null } },
      throttle(id, 0.75),
      { type: 'steer', entityId: id, control: { scale: 1, axes: [set(0.25), cleared, cleared], speedFactor: null } },
    ]);
  });

  it('runs 104, 106, 107 and 111 through the movement helpers, the steering ones only with a valid target', () => {
    const script = [scriptItem(106), scriptItem(107, null, 4), scriptItem(111, '0.5, 0.2, 1'), scriptItem(104, '0.25'), scriptItem(10000)];
    const { h, controller, load } = executor([script]);
    // No target: 106 and 111 post nothing and 107, posting nothing, branches past 111 and 104.
    runScript(h.call([]), controller, load(0));
    expect(h.posted).toEqual([]);
    aimAtPlayer(h, controller, false);
    runScript(h.call([]), controller, load(0));
    const id = h.craft.id;
    expect(h.posted.map(({ type }) => type)).toEqual(['steer', 'steer', 'ai-match-speed', 'steer']);
    // 106 posts the block 0x5cd1c computed; 107 the break turn of scale 1.5.
    expect(h.posted[0]).toMatchObject({ entityId: id, control: { scale: 1, axes: [{ set: true }, { set: true }, { set: false }] } });
    expect(h.posted[1]).toMatchObject({ entityId: id, control: { scale: 1.5 } });
    expect(h.posted[2]).toEqual({ type: 'ai-match-speed', entityId: id, targetEntityId: h.player.id, a: 0.5, lo: f32(0.2), hi: 1 });
    expect(h.posted[3]).toEqual(throttle(id, 0.25));
  });

  it('tests the ahead flag (200), the distance (210, 211) and the cone bits (222) against its argument', () => {
    const { h, controller, load } = executor([
      [scriptItem(200, 'Y', 2), scriptItem(104, '0.1'), scriptItem(210, '100', 4), scriptItem(104, '0.2'), scriptItem(211, '100', 6), scriptItem(104, '0.3'), scriptItem(222, 'n', 8), scriptItem(104, '0.4'), scriptItem(10000)],
    ]);
    aimAtPlayer(h, controller);
    const steering = controller.steering;
    const factors = () => h.posted.map((request) => (request.type === 'steer' ? request.control.speedFactor : null));
    Object.assign(steering, { relativeFlags: 4, distance: 50, coneBits: 0 });
    runScript(h.call([]), controller, load(0));
    // 200 true skips 0.1; 210 (50 < 100) skips 0.2; 211 false posts 0.3; 222 (no bit = n) skips 0.4.
    expect(factors()).toEqual([f32(0.3)]);
    h.posted.length = 0;
    Object.assign(steering, { relativeFlags: 3, distance: 100, coneBits: 2 });
    runScript(h.call([]), controller, load(0));
    expect(factors()).toEqual([f32(0.1), f32(0.2), f32(0.3), f32(0.4)]);
  });

  it('tests a channel out of range (231), readiness and steadiness (232) and a draw (240)', () => {
    // Keyword table 0's first name, in lower case, is channel 0.
    const channel0 = aiProgramsContent().keywordTables[0][0].name.toLowerCase();
    const { h, controller, load } = executor([
      [scriptItem(231, channel0, 2), scriptItem(104, '0.1'), scriptItem(232, 'T', 4), scriptItem(104, '0.2'), scriptItem(240, '50', 6), scriptItem(104, '0.3'), scriptItem(10000)],
    ]);
    aimAtPlayer(h, controller);
    const range = channelRange(firingDataOf(h.state), h.craft, 0)!;
    const factors = () => h.posted.map((request) => (request.type === 'steer' ? request.control.speedFactor : null));
    controller.steering.distance = f32(range * 2);
    controller.missileReady = true;
    const call = h.call([49]);
    runScript(call, controller, load(0));
    // Out of range skips 0.1; ready and steady skips 0.2; 49 % 101 < 50 skips 0.3.
    expect(factors()).toEqual([]);
    expect(call.rand.used).toBe(1);
    h.posted.length = 0;
    controller.steering.distance = f32(range / 2);
    controller.missileReady = false;
    runScript(h.call([50]), controller, load(0));
    expect(factors()).toEqual([f32(0.1), f32(0.2), f32(0.3)]);
  });

  it('sets the lead mode (300) and size class (301) and presses channels 0–2 with the argument as hold (400–402)', () => {
    const keywords = aiProgramsContent().keywordTables;
    const { h, controller, load } = executor([
      [scriptItem(300, keywords[1][4].name), scriptItem(301, keywords[2][1].name), scriptItem(400, '32'), scriptItem(401, '-1'), scriptItem(402), scriptItem(10000)],
    ]);
    controller.steering.leadConstant = 7;
    runScript(h.call([]), controller, load(0));
    // Keyword values 4 (lead mode 4 keeps its constant) and 1 (size class 1, radius 10 without a target).
    expect(controller.steering).toMatchObject({ leadMode: 4, leadConstant: 7, sizeClass: 1, approachRadius: 10 });
    const clock = h.state.clock;
    expect(controller.triggers).toEqual([{ pressed: true, holdDeadline: clock + 32 }, { pressed: true, holdDeadline: clock + 0x7d00 }, { pressed: true, holdDeadline: 0 }]);
  });

  it('yields at a wait (1000), steering and pressing channel 0 while it runs, and resumes at its continuation', () => {
    const { h, controller, load } = executor([[scriptItem(1000, '8', 2), scriptItem(104, '0.1'), scriptItem(104, '0.2'), scriptItem(10000)]]);
    const execution = load(0);
    expect(runScript(h.call([]), controller, execution)).toBe(false);
    const clock = h.state.clock;
    expect(execution).toMatchObject({ item: 2, wait: { active: true, until: clock + 8 } });
    // While waiting no item runs, but the craft steers: the player 187.5 ahead of it is within its cone and channel 0's range,
    // so channel 0 is pressed with hold 0x20 (no post: the block is only computed).
    face(h, 300);
    aimAtPlayer(h, controller, false);
    h.state.clock = clock + 7;
    expect(runScript(h.call([]), controller, execution)).toBe(false);
    expect(h.posted).toEqual([]);
    expect(controller.steering.coneBits).toBe(3);
    expect(controller.steering.distance).toBeLessThan(channelRange(firingDataOf(h.state), h.craft, 0)!);
    expect(controller.triggers[0]).toEqual({ pressed: true, holdDeadline: clock + 7 + 0x20 });
    // At the deadline (sample ≥ it) the wait ends and the script continues at item 2.
    h.state.clock = clock + 8;
    expect(runScript(h.call([]), controller, execution)).toBe(true);
    expect(h.posted).toEqual([throttle(h.craft.id, f32(0.2))]);
    expect(execution.wait.active).toBe(false);
  });

  it('waits low32(trunc(a ÷ turn rate × 64)) for 1001–1003, a negative delay acting as 0 (CR-24 decision 16)', () => {
    const { h, controller, load } = executor([
      [scriptItem(1001, '45'), scriptItem(1002, '45'), scriptItem(1003, '45'), scriptItem(1001, '-45'), scriptItem(10000)],
    ]);
    const execution = load(0);
    const clock = h.state.clock;
    const delays = [0.75, 0.25, 0.5].map((rate) => Math.trunc((degreeSlot(45) / rate) * 64));
    expect(delays).toEqual([67, 201, 100]);
    for (const delay of delays) {
      runScript(h.call([]), controller, execution);
      expect(execution.wait).toEqual({ active: true, until: clock + delay });
      execution.wait = { active: false, until: 0 };
    }
    runScript(h.call([]), controller, execution);
    // −67 from clock 2: max(2 − 67, 0) = 0, which the next run is already past.
    expect(execution).toMatchObject({ item: 4, wait: { active: true, until: 0 } });
    expect(runScript(h.call([]), controller, execution)).toBe(true);
  });

  it('yields at 9500 at its target or the first item, clearing the return stack', () => {
    const { h, controller, load } = executor([[scriptItem(104, '0.1'), scriptItem(9500, null, 3), scriptItem(104, '0.2'), scriptItem(9500), scriptItem(10000)]]);
    const execution = load(0);
    execution.returnStack = [2];
    expect(runScript(h.call([]), controller, execution)).toBe(false);
    expect(execution).toMatchObject({ item: 3, returnStack: [] });
    expect(runScript(h.call([]), controller, execution)).toBe(false);
    expect(execution.item).toBe(0);
    expect(h.posted).toHaveLength(1);
  });

  it('tests the attack pass (1101): without a target it does not apply, so `f` branches', () => {
    const { h, controller, load } = executor([[scriptItem(1101, 'f', 2), scriptItem(104, '0.1'), scriptItem(1101, 't', 4), scriptItem(104, '0.2'), scriptItem(10000)]]);
    h.craft.ai.objectTarget = null;
    runScript(h.call([]), controller, load(0));
    expect(h.posted).toEqual([throttle(h.craft.id, f32(0.2))]);
  });

  it('runs the hold step while a hold runs: the 0.6 speed match, the steering, and its three conditional presses', () => {
    const { h, controller, load } = executor([[scriptItem(104, '0.1'), scriptItem(10000)]]);
    aimAtPlayer(h, controller, false);
    const execution = load(0);
    execution.hold = { active: true, until: h.state.clock + 1 };
    controller.missileReady = true;
    controller.period = 40;
    controller.steering.distance = 1;
    expect(runScript(h.call([]), controller, execution)).toBe(false);
    expect(h.posted.map(({ type }) => type)).toEqual(['ai-match-speed', 'steer']);
    expect(h.posted[0]).toMatchObject({ a: 0, lo: f32(0.6), hi: 1 });
    expect(controller.triggers[1]).toEqual({ pressed: true, holdDeadline: h.state.clock + 0x7d00 });
    expect(execution.item).toBe(0);
  });
});

describe('the execution budget (CR-25, AC-17)', () => {
  /** A 240 test that branches to itself while its draw mod 101 is below 100, then a wait. */
  const loop = [scriptItem(240, '100', 0), scriptItem(1000, '1'), scriptItem(10000)];

  it('allows 1,024 dispatches in a run and faults before the 1,025th, without truncating or yielding', () => {
    const h = harness({ scripts: [loop], lists: { state2: [0] } });
    const controller = h.common();
    const execution = loadScript(h.state, h.indexOf(0), scriptedRand([]));
    // 1,022 trues and one false at item 0, then the wait: 1,024 dispatches.
    const tick = { dispatches: 0 };
    expect(runScript(h.call([...Array(1022).fill(0), 100], tick), controller, execution)).toBe(false);
    expect(tick.dispatches).toBe(CORE_LIMITS.aiDispatchesPerRun);
    execution.item = 0;
    execution.wait = { active: false, until: 0 };
    expectFault(() => runScript(h.call(Array(1024).fill(0)), controller, execution), 'budget-exhausted', 'ai.dispatches-per-run');
  });

  it('counts every run of a tick: the tick\'s last allowed dispatch passes, the next faults', () => {
    const h = harness({ scripts: [[scriptItem(1000, '1'), scriptItem(10000)]], lists: { state2: [0] } });
    const controller = h.common();
    const tick = { dispatches: CORE_LIMITS.aiDispatchesPerTick - 1 };
    const execution = loadScript(h.state, h.indexOf(0), scriptedRand([]));
    runScript(h.call([], tick), controller, execution);
    expect(tick.dispatches).toBe(CORE_LIMITS.aiDispatchesPerTick);
    h.state.clock += 2;
    expectFault(() => runScript(h.call([], tick), controller, execution), 'budget-exhausted', 'ai.dispatches-per-tick');
  });
});

describe('the state machine 0x64d58 (ai §11.3)', () => {
  /** Scripts: 0 ends at once, 1 yields, 2 ends; lists by state as given. */
  const ENDS = [scriptItem(10000)];
  const YIELDS = [scriptItem(1000, '100'), scriptItem(10000)];

  function machine(lists: Lists, parameters: Record<string, unknown> = {}) {
    const h = harness({ scripts: [ENDS, YIELDS, ENDS], lists, parameters });
    face(h, 0);
    h.craft.ai.objectTarget = null;
    const controller = interpreterOf(h.common());
    return { h, controller, interpreter: controller.interpreter };
  }

  it('rule 2 then 13: a new target picks state 3, 2 or 1 by the distance, and the state\'s list with one draw, also for one script', () => {
    // The craft stands 112.5 from the player.
    for (const [at10, at14, expected] of [[0, 200, 3], [200, 100, 2], [100, 50, 1]] as const) {
      const { h, controller, interpreter } = machine({ state1: [0], state2: [0], state3: [0] }, { at10, at14 });
      const call = h.call([7]);
      expect(runStateMachine(call, controller)).toBe(false);
      expect(call.rand.used).toBe(1);
      expect(h.craft.ai.objectTarget).toBe(h.player.id);
      expect(interpreter).toMatchObject({ state: expected, execution: { script: h.indexOf(0), item: 0 } });
      // Entering 3 from outside {3, 4, 5} sets the state deadline.
      expect(interpreter.stateDeadline).toBe(expected === 3 ? h.state.clock + 0xffff_ffff : 0);
    }
  });

  it('rule 11: a running script keeps its state; an ended one restarts in a one-script list without a draw, else reselects', () => {
    const { h, controller, interpreter } = machine({ state1: [0], state2: [0], state3: [1, 0] }, { at10: 100, at14: 50 });
    runStateMachine(h.call([0]), controller);
    expect(interpreter.state).toBe(1);
    const execution = interpreter.execution!;
    execution.item = 1;
    interpreter.lastRunEnded = false;
    expect(runStateMachine(h.call([]), controller)).toBe(false);
    expect(interpreter.execution).toBe(execution);
    interpreter.lastRunEnded = true;
    runStateMachine(h.call([]), controller);
    expect(interpreter.execution).toBe(execution);
    expect(execution.item).toBe(0);
  });

  it('rules 11 and 12: an ended state-2 script falls back to state 3, releasing first, loading after', () => {
    const { h, controller, interpreter } = machine({ state1: [0], state2: [2], state3: [1, 0] }, { at10: 200, at14: 100 });
    runStateMachine(h.call([0]), controller);
    expect(interpreter.state).toBe(2);
    interpreter.lastRunEnded = true;
    const call = h.call([3]);
    runStateMachine(call, controller);
    // rand % 2 = 1: the second script of state 3's list.
    expect(interpreter).toMatchObject({ state: 3, execution: { script: h.indexOf(0) }, stateDeadline: h.state.clock + 0xffff_ffff });
    expect(h.state.ai.parseCache.map(({ script }) => script)).toEqual([h.indexOf(0)]);
  });

  it('rule 10: an empty list of state 1, 2 or 6 goes to state 3; an empty state-3 list leaves no script', () => {
    const { h, controller, interpreter } = machine({ state3: [] as number[] }, { at10: 100, at14: 50 });
    const call = h.call([]);
    runStateMachine(call, controller);
    expect(call.rand.used).toBe(0);
    expect(interpreter).toMatchObject({ state: 3, execution: null, state4Deadline: 0 });
  });

  it('rule 4: a recent attacker of the other side is engaged and takes state 4 with its deadline (3 without a state-4 list)', () => {
    const { h, controller, interpreter } = machine({ state3: [0], state4: [2] }, { at10: 100, at14: 50, at24: 10, at28: 30 });
    h.craft.combat.lastAttacker = { entity: h.player.id, clock: h.state.clock - 10 };
    runStateMachine(h.call([0]), controller);
    expect(interpreter).toMatchObject({ state: 4, state4Deadline: h.state.clock + 30, execution: { script: h.indexOf(2) } });
    // Outside the window (u32 ≤ 10) the attacker does not count.
    const other = machine({ state1: [0], state3: [0], state4: [2] }, { at10: 100, at14: 50, at24: 9 });
    other.h.craft.combat.lastAttacker = { entity: other.h.player.id, clock: other.h.state.clock - 10 };
    runStateMachine(other.h.call([0]), other.controller);
    expect(other.interpreter.state).toBe(1);
  });

  it('rules 8 and 9: state 4 holds while the sample is before its deadline with the same target, and ends past it', () => {
    const { h, controller, interpreter } = machine({ state3: [0], state4: [1] }, { at10: 100, at14: 50 });
    aimAtPlayer(h, controller, false);
    h.craft.ai.objectTarget = h.player.id;
    Object.assign(interpreter, { state: 4, state4Deadline: h.state.clock + 1, execution: loadScript(h.state, h.indexOf(1), scriptedRand([])), lastRunEnded: false });
    controller.engagement.dueClock = 0;
    runStateMachine(h.call([]), controller);
    expect(interpreter.state).toBe(4);
    // At the deadline neither rule applies: still 4.
    h.state.clock = interpreter.state4Deadline;
    runStateMachine(h.call([]), controller);
    expect(interpreter.state).toBe(4);
    h.state.clock += 1;
    runStateMachine(h.call([0]), controller);
    expect(interpreter).toMatchObject({ state: 3, state4Deadline: 0 });
  });

  it('rule 5: a recent victim on the own side sends state 2 when D+0x34 is set', () => {
    const { h, controller, interpreter } = machine({ state1: [0], state2: [2] }, { at10: 100, at14: 50, at34: 1 });
    // The only kind-7 craft is the subject itself, which is on its own side.
    h.craft.combat.lastVictim = { entity: h.craft.id, clock: h.state.clock };
    runStateMachine(h.call([0]), controller);
    expect(interpreter.state).toBe(2);
  });

  it('rule 7: a stalled state 3 with the same target goes to state 6, and on to 3 without a state-6 list', () => {
    const { h, controller, interpreter } = machine({ state3: [0, 2], state6: [1] }, { at10: 100, at14: 200, at18: 4, at20: 1000 });
    runStateMachine(h.call([0]), controller);
    expect(interpreter.state).toBe(3);
    interpreter.lastRunEnded = false;
    h.state.clock = interpreter.stateDeadline;
    controller.engagement.dueClock = 0;
    runStateMachine(h.call([]), controller);
    expect(interpreter.state).toBe(3);
    interpreter.stateDeadline = 0;
    h.state.clock += 6;
    runStateMachine(h.call([0]), controller);
    expect(interpreter).toMatchObject({ state: 6, execution: { script: h.indexOf(1) } });
  });

  it('rule 3: a target ahead of the subject and seen from behind with aligned rows sends state 5', () => {
    // The craft above the player faces +z, as does the player: the player is behind it (S+0x68 bit 2 clear), and the craft
    // ahead of the target point in its frame (S+0x78 bit 2 set); the row-3 dot 1 ≥ D+0x30.
    const { h, controller, interpreter } = machine({ state3: [0], state5: [2] }, { at10: 100, at14: 200, at2C: 1000, at30: 0.5 });
    runStateMachine(h.call([0]), controller);
    expect(interpreter.state).toBe(5);
    expect(controller.steering.reverseFlags & 4).toBe(4);
  });

  it('rule 1: a close proximity record ahead makes the evasion and skips everything else', () => {
    const { h, controller, interpreter } = machine({ state3: [0] }, { at08: 1000 });
    h.craft.combat.proximity = { entity: h.player.id, distanceSquared: 1 };
    // The player stands behind the craft (it faces +z from z 112.5): not ahead, no escape.
    expect(runStateMachine(h.call([0]), controller)).toBe(false);
    interpreter.state = 0;
    h.player.position = { x: h.craft.position.x, y: h.craft.position.y, z: 200 };
    h.posted.length = 0;
    expect(runStateMachine(h.call([]), controller)).toBe(true);
    expect(h.posted.map(({ type }) => type)).toEqual(['steer', 'steer']);
  });
});

describe('the interpreter 0x64cb8: install, update and removal (ai §11.1, §11.2)', () => {
  const SCRIPT = [scriptItem(240, '[10 20]'), scriptItem(1000, '100'), scriptItem(10000)];

  it('installs in order: the deadline, the engagement draw, 0x5e4d0, the install script run and released, then the first update', () => {
    const install = [scriptItem(300, aiProgramsContent().keywordTables[1][4].name), scriptItem(104, '0.5'), scriptItem(10000)];
    const h = harness({ install, scripts: [SCRIPT], lists: { state1: [0], state3: [0] }, parameters: { at04: 50, at10: 100, at14: 50 }, record: { at44: 0, at50: 0 } });
    h.craft.ai.objectTarget = null;
    const common = h.common();
    const clock = h.state.clock;
    // Draws: 0x63250 (rand % 50), the state's list, the script's range, the 240 test.
    const call = h.call([60, 0, 5, 3]);
    const controller = installInterpreter(call, common);
    expect(call.rand.used).toBe(4);
    expect(controller.nextUpdateClock).toBe(clock + 70);
    expect(controller.engagement).toMatchObject({ dueClock: clock + 10, period: 50, mask: 0xfbfff });
    // The install script left lead mode 4 and posted 0.5 at its fractions; it was released, the state script cached.
    expect(controller.steering.leadMode).toBe(4);
    expect(h.state.ai.parseCache).toEqual([{ script: h.indexOf(0), uses: 1, items: [{ type: 'integer', value: 15 }, { type: 'integer', value: 100 }, { type: 'integer', value: 0 }] }]);
    expect(controller.interpreter).toMatchObject({ state: 1, execution: { script: h.indexOf(0), item: 2, wait: { active: true, until: clock + 100 } }, lastRunEnded: false });
    expect(h.posted).toEqual([throttle(h.craft.id, 0.5)]);
  });

  it('applies 0x5e4d0: a negative +0xE0 written back with the lock gate off; s2 > 0.5 lengthens the period; floors and noise', () => {
    const h = harness({ scripts: [SCRIPT], lists: { state1: [0] }, parameters: { at10: 100, at14: 50 }, record: { at44: 0, at0C: 100, at38: 1, at40: 1, at3C: 1 } });
    h.craft.ruleInputs = { ...h.craft.ruleInputs, aiValueA: 0, aiValueB: -5 };
    const controller = installInterpreter(h.call([0, 0, 0]), h.common());
    expect(h.craft.ruleInputs.aiValueB).toBe(5);
    expect(controller.aiLock).toBe(false);
    // s2 = F(trunc(100 × 100 ÷ 100) × 0.01) = 1 > 0.5: 70 × 3 / 2.
    expect(controller.period).toBe(105);
    // v = 1 − 1 × 1 × 0.125 = 0.875; w = F(1 × 0.0625).
    expect(controller.steering).toMatchObject({ speedFraction: 0.875, turnFraction: 0.875, rollMatch: true, throttleNoise: { enabled: true, high: 0.0625 }, steeringNoise: { enabled: true, high: 0.0625 } });
  });

  it('applies 0x5e4d0 with s1 > 0.3: two thirds of the period, the speed limit rewritten and the steering block reset', () => {
    const h = harness({ scripts: [SCRIPT], lists: { state1: [0] }, parameters: { at10: 100, at14: 50 }, record: { at44: 0, at0C: 100, at10: 10, at28: 90, at40: 0.5, at3C: 0.5 } });
    h.craft.ruleInputs = { ...h.craft.ruleInputs, aiValueA: 100, aiValueB: 80 };
    const controller = installInterpreter(h.call([0, 0, 0]), h.common());
    expect(controller.aiLock).toBe(true);
    expect(controller.period).toBe(46);
    // s1 = F((80 − 10) × 0.01) = F(0.7); the limit D(D(90 × π′) × 1/180′) × D(D(1 + s1) × 0.5).
    const s1 = f32(0.7);
    expect(controller.limits.speed).toBe(f32(((90 * 3.1415927) * 0.005555555555555555) * ((1 + s1) * 0.5)));
    // s2 = 0: the floors 0.65 and 0.5 and no noise.
    expect(controller.steering).toMatchObject({ speedFraction: f32(0.65), turnFraction: 0.5, throttleNoise: { enabled: false }, sizeClass: 2 });
  });

  it('updates with the deadline from the current period, and removes by releasing the script', () => {
    const h = harness({ scripts: [SCRIPT], lists: { state1: [0] }, parameters: { at10: 100, at14: 50 }, record: { at44: 0, at50: 0 } });
    const controller = installInterpreter(h.call([0, 0, 0]), h.common());
    h.state.clock += 10;
    controller.period = 33;
    updateInterpreter(h.call([]), controller);
    expect(controller.nextUpdateClock).toBe(h.state.clock + 33);
    expect(parsedScript(h.state, h.indexOf(0)).uses).toBe(1);
    removeInterpreter(h.state, controller);
    expect(h.state.ai.parseCache).toEqual([]);
  });
});
