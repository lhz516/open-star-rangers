import { describe, expect, it } from 'vitest';
import { parameterEntry, scriptItem, tableProgram } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import { createRecordingSession, recordState } from '../replay/recording.ts';
import { PRODUCER } from '../replay/replay.test-support.ts';
import { initialWorldState } from '../world/create-world.ts';
import { AI_PROGRAMS_LIMITS } from '../../content/rule-data/ai-programs.ts';
import { aiProgramsContent, asCreateInput, declaration, missionFrame, ruleInputs, worldInput } from '../world/create-world.test-support.ts';
import { ALL_KINDS, RETURN_STACK_DEPTH, TRANSPONDER_KIND_BIT, type Entity } from '../world/entity-table.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, expectFault, stillEntityInit, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { registerTick, runTick, type Request, type TickContext } from './pipeline.ts';

// P3-08 AC-17's Node part on the real pipeline (docs/plan/p3/08/spec.md; docs/plan/p3/02/spec.md, CR-25): the executor
// budgets, the request and entity budgets the AI and `b` count against, the structural bounds of the stack, the
// execution states and the parse cache, and the fault latch, with synthetic content only (code-generated, never
// original data). The exact limit / limit + 1 of one executor run against a scripted RNG is ai-interpreter.test.ts's;
// RequestQueue's own is pipeline.test.ts's.

type ScriptItem = ReturnType<typeof scriptItem>;

const repeat = (count: number, item: ScriptItem): ScriptItem[] => Array.from({ length: count }, () => item);
/** A test that changes nothing (210: distance below 1, no branch). */
const NO_OP = scriptItem(210, '1');
/** A throttle action: one `steer` request. */
const THROTTLE = scriptItem(104, '0.5');
const END = scriptItem(10000);
const WAIT = scriptItem(1000, '100');
/** `dispatches` dispatches in the install's run: no-ops, then the end. */
const installOf = (dispatches: number, item = NO_OP): ScriptItem[] => [...repeat(dispatches - 1, item), END];
/** `dispatches` dispatches in an update's run: no-ops, then a wait that yields; the end is never reached. */
const stateOf = (dispatches: number, item = NO_OP): ScriptItem[] => [...repeat(dispatches - 1, item), WAIT, END];
/** An action branching to itself: it posts a `steer` per dispatch and never yields. */
const ENDLESS = [scriptItem(104, '0.5', 0), END];

interface Scripts {
  readonly install: readonly ScriptItem[] | null;
  readonly state: readonly ScriptItem[];
}

/**
 * The synthetic AI programs with table record 0 for kind 7 and, if given, record 1 for kind 8, each with a DFPG of its
 * own naming `install` (or none) and `state` for every state 1–6, entries in the order the loader reaches them; the
 * built-in records stay.
 */
function programs(sevens: Scripts, eights: Scripts | null = null) {
  const content = aiProgramsContent();
  const entries: unknown[] = [];
  const records = [[0x80, sevens], ...(eights === null ? [] : [[0x100, eights]])] as [number, Scripts][];
  content.programs = records.map(([kindMask, { install, state }]) => {
    const parameters = entries.length;
    const installIndex = install === null ? null : parameters + 1;
    const stateIndex = parameters + (install === null ? 1 : 2);
    entries.push(parameterEntry(installIndex, Object.fromEntries([1, 2, 3, 4, 5, 6].map((index) => [`state${index}`, [stateIndex]]))));
    if (install !== null) entries.push({ kind: 'script', items: [...install] });
    entries.push({ kind: 'script', items: [...state] });
    return tableProgram(parameters, { kindMask, at0C: 0x7fff_ffff, at10: 0 });
  }) as typeof content.programs;
  content.entries = entries as typeof content.entries;
  return content;
}

/**
 * The player at runtime (187.5, 375, 0) and `sevens` kind-7 and `eights` kind-8 hostiles placed at random
 * inside its active area (runtime 937.5–4687.5 on x and y), all instantiated at tick 1.
 */
function hostileMission(sevens: number, eights = 0) {
  const mission = missionFrame();
  mission.spawnRegions = [{ x0: 500, y0: 500, x1: 2500, y1: 2500 }];
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, placement: { region: 0, anchor: null }, ruleInputs: ruleInputs({ craftCount: sevens }) }),
    ...(eights === 0 ? [] : [declaration(2, { craftType: 8, placement: { region: 0, anchor: null }, ruleInputs: ruleInputs({ craftCount: eights }) })]),
  ];
  return mission;
}

/** The world after tick 1, its hostiles (two of kind 8 with `eights`) instantiated; their first callbacks, which install, are tick 2's. */
function hostiles(sevens: number, scripts: Scripts, eights: Scripts | null = null): { readonly state: WorldState; readonly world: World } {
  const world = initialWorldState(asCreateInput(worldInput({ mission: hostileMission(sevens, eights === null ? 0 : 2), aiPrograms: programs(scripts, eights) })));
  const constructed = constructWorld(world);
  constructed.step(tickInput());
  expect([...world.entities.walk((1 << 7) | (1 << 8))]).toHaveLength(sevens + (eights === null ? 0 : 2));
  return { state: world, world: constructed };
}

/** Lists every request the tick posts or defers, in order. */
function recordRequests(context: TickContext): Request[] {
  const requests: Request[] = [];
  for (const method of ['post', 'defer'] as const) {
    const original = context.requests[method].bind(context.requests);
    context.requests[method] = (request: Request) => {
      requests.push(request);
      original(request);
    };
  }
  return requests;
}

/** Runs one tick through the real pipeline, outside a World, and returns its context's counts and the requests posted. */
function countedTick(state: WorldState) {
  const context = registerTick(state, readTickInput(tickInput()));
  const requests = recordRequests(context);
  let events: readonly DomainEvent[] | null = null;
  let fault: unknown = null;
  try {
    events = runTick(context);
  } catch (error) {
    fault = error;
  }
  return { dispatches: context.aiDispatches.dispatches, requests, events, fault };
}

/** Every later call on a faulted world throws the same fault: nothing of the faulting tick is published. */
function expectLatched(world: World, fault: unknown): void {
  for (const call of [() => world.step(tickInput()), () => world.snapshot(), () => world.projection(), () => world.renderState()]) expect(thrownBy(call)).toBe(fault);
}

const tableControllers = (state: WorldState) =>
  [...state.entities.walk(ALL_KINDS)].flatMap(({ ai: { program } }) => (program.type === 'table' && program.controller !== null ? [program.controller] : []));

// Ticks with up to a thousand AI craft through the real pipeline: under 0.2 s per case alone.
describe('the executor budgets in the world (AC-17; CR-25)', { timeout: 60_000 }, () => {
  // Instantiation makes at most spawnExpansion − 1 craft besides the player: 1,021 kind-7 craft with the install's run
  // and the first update's of 64 dispatches each, 130,688, and two kind-8 craft.
  const SEVENS = { install: installOf(64), state: stateOf(64) };

  it(`counts both runs of every install against aiDispatchesPerTick: ${CORE_LIMITS.aiDispatchesPerTick} dispatches in a tick pass`, () => {
    // The kind-8 craft's 96 + 96 each: 131,072.
    const { state } = hostiles(1021, SEVENS, { install: installOf(96), state: stateOf(96) });
    const tick = countedTick(state);
    expect(tick.fault).toBeNull();
    expect(tick.dispatches).toBe(CORE_LIMITS.aiDispatchesPerTick);
    const controllers = tableControllers(state);
    expect(controllers).toHaveLength(CORE_LIMITS.spawnExpansion - 1);
    // Every first update ran its state script to the wait: the run yielded rather than being cut short.
    for (const controller of controllers) expect(controller.handler === 'interpreter' && controller.interpreter.execution?.wait.active).toBe(true);
    // Each state script is cached once with a use per live execution state; the install scripts' went with their calls.
    expect(state.ai.parseCache.map(({ script, uses }) => [script, uses])).toEqual([[2, 1021], [5, 2]]);
  });

  it('faults at the tick\'s next dispatch, in the last kind-8 craft\'s first update, and latches the world', () => {
    // 97 + 96 each: the 131,073rd dispatch is the second kind-8 craft's 192nd.
    const eights = { install: installOf(97), state: stateOf(96) };
    const tick = countedTick(hostiles(1021, SEVENS, eights).state);
    expect(tick.fault).toMatchObject({ code: 'budget-exhausted', site: 'ai.dispatches-per-tick' });
    expect(tick.dispatches).toBe(CORE_LIMITS.aiDispatchesPerTick);
    const { world } = hostiles(1021, SEVENS, eights);
    const fault = expectFault(() => world.step(tickInput()), 'budget-exhausted', 'ai.dispatches-per-tick');
    expectLatched(world, fault);
  });

  it(`stops a script that never yields at dispatch ${CORE_LIMITS.aiDispatchesPerRun + 1}: the run's ${CORE_LIMITS.aiDispatchesPerRun} dispatches went through, nothing is cut or yielded`, () => {
    const { state } = hostiles(1, { install: null, state: ENDLESS });
    const tick = countedTick(state);
    expect(tick.fault).toMatchObject({ code: 'budget-exhausted', site: 'ai.dispatches-per-run' });
    expect(tick.events).toBeNull();
    // One steer a dispatch, every one of the 1,024 before the fault.
    const [hostile] = state.entities.walk(1 << 7);
    expect(tick.requests.filter((request) => request.type === 'steer' && request.entityId === hostile.id)).toHaveLength(CORE_LIMITS.aiDispatchesPerRun);
    expect(tick.dispatches).toBe(CORE_LIMITS.aiDispatchesPerRun);
  });

  it('latches that fault in a recording: the step publishes nothing and the recording cannot be exported', () => {
    const input = asCreateInput(worldInput({ mission: hostileMission(1), aiPrograms: programs({ install: null, state: ENDLESS }) }));
    const session = createRecordingSession(input, { producer: PRODUCER, checkpointInterval: 1 });
    session.step(tickInput());
    const fault = expectFault(() => session.step(tickInput()), 'budget-exhausted', 'ai.dispatches-per-run');
    expectLatched(session, fault);
    expect(thrownBy(() => session.exportRecording())).toBe(fault);
  });
});

describe('the request and entity budgets the AI and `b` count against (AC-17; CR-25)', { timeout: 60_000 }, () => {
  /** The install posts 127 and ends, the first update 126 and waits: 253 per craft. */
  const STEERING = { install: installOf(128, THROTTLE), state: stateOf(127, THROTTLE) };

  it(`counts the AI's requests in requestsPerTick: 129 craft post ${129 * 253} within ${CORE_LIMITS.requestsPerTick}, 130 fault`, () => {
    const { state } = hostiles(129, STEERING);
    const tick = countedTick(state);
    expect(tick.fault).toBeNull();
    expect(tick.requests.filter(({ type }) => type === 'steer')).toHaveLength(129 * 253);
    expect(tick.requests.length).toBeLessThanOrEqual(CORE_LIMITS.requestsPerTick);

    const over = hostiles(130, STEERING);
    expect(130 * 253).toBeGreaterThan(CORE_LIMITS.requestsPerTick);
    const fault = expectFault(() => over.world.step(tickInput()), 'budget-exhausted', 'pipeline.requests');
    expectLatched(over.world, fault);
  });

  /** A player in flight and still friendly craft up to `size` entities. */
  function crowded(size: number): WorldState {
    const state = testState();
    addPlayerEntity(state).state = 'active';
    for (let index = state.entities.size; index < size; index++) {
      state.entities.allocate(stillEntityInit(1, { position: { x: -40_000 + (index % 64) * 1000, y: -40_000 + Math.floor(index / 64) * 1000, z: 0 } })).state = 'active';
    }
    return state;
  }
  const DROP: Command = { type: 'drop-transponder' };
  const transponders = (state: WorldState): Entity[] => [...state.entities.walk(2 ** TRANSPONDER_KIND_BIT)];

  it(`fans out one transponder, request and event per \`b\`: ${CORE_LIMITS.commandsPerTick} in a tick`, () => {
    const state = crowded(2);
    const context = registerTick(state, readTickInput(tickInput(Array.from({ length: CORE_LIMITS.commandsPerTick }, () => DROP))));
    const requests = recordRequests(context);
    const events = runTick(context);
    expect(requests.filter(({ type }) => type === 'create-transponder')).toHaveLength(CORE_LIMITS.commandsPerTick);
    expect(events.filter(({ type }) => type === 'transponder-deployed')).toHaveLength(CORE_LIMITS.commandsPerTick);
    expect(transponders(state)).toHaveLength(CORE_LIMITS.commandsPerTick);
  });

  it(`creates the ${CORE_LIMITS.entities}th entity with \`b\`, and faults at one more without publishing the tick's earlier drop`, () => {
    const state = crowded(CORE_LIMITS.entities - 1);
    const world = constructWorld(state);
    world.step(tickInput([DROP]));
    expect(state.entities.size).toBe(CORE_LIMITS.entities);
    expect(transponders(state)).toHaveLength(1);

    const full = crowded(CORE_LIMITS.entities - 1);
    const latched = constructWorld(full);
    const fault = expectFault(() => latched.step(tickInput([DROP, DROP])), 'budget-exhausted', 'entities.count');
    expectLatched(latched, fault);
  });
});

describe('the structural bounds of the executor and the parse cache (AC-17; CR-25)', { timeout: 60_000 }, () => {
  const create = (state: readonly ScriptItem[]) =>
    initialWorldState(asCreateInput(worldInput({ mission: hostileMission(1), aiPrograms: programs({ install: null, state }) })));

  it(`caches a script of ${AI_PROGRAMS_LIMITS.scriptItems} items whole, and refuses one item more at creation`, () => {
    const state = create(stateOf(AI_PROGRAMS_LIMITS.scriptItems - 1));
    const world = constructWorld(state);
    world.step(tickInput());
    world.step(tickInput());
    expect(state.ai.parseCache.map(({ items }) => items.length)).toEqual([AI_PROGRAMS_LIMITS.scriptItems]);
    expect(thrownBy(() => create(stateOf(AI_PROGRAMS_LIMITS.scriptItems)))).toMatchObject({ path: expect.stringContaining('entries[1].items') });
  });

  it('refuses the return stack\'s push (9001) at creation, so the stack never leaves 0 of its 8', () => {
    expect(thrownBy(() => create([scriptItem(9001, null, 0), END]))).toMatchObject({ reason: 'unsupported-opcode' });
  });

  it('keeps them on every tick of an AI run: stack, execution states, cache entries, items and uses', () => {
    // 48 hostiles of the synthetic table record 0 (DFPG 0's distances moved to 8000 and 400, so they start in state 2,
    // whose list holds scripts 3 and 2, and change state and script as they close in), a wingman and the player firing.
    const aiPrograms = aiProgramsContent();
    Object.assign(aiPrograms.entries[0], { at10: 8000, at14: 400 });
    const input = asCreateInput(worldInput({ mission: hostileMission(48), aiPrograms, run: { wingman: 0 } }));
    const scriptCount = aiPrograms.entries.filter(({ kind }) => kind === 'script').length;
    const state = initialWorldState(input);
    const session = recordState(state, { producer: PRODUCER, checkpointInterval: 64 });
    const scripts = new Set<number>();
    let peakExecutions = 0;
    for (let tick = 1; tick <= 320; tick++) {
      session.step(tick % 5 === 0 ? tickInput([{ type: 'fire', channel: 'primary' }]) : tickInput());
      const controllers = tableControllers(state);
      const executions = controllers.flatMap((controller) => (controller.handler === 'interpreter' && controller.interpreter.execution !== null ? [controller.interpreter.execution] : []));
      peakExecutions = Math.max(peakExecutions, executions.length);
      for (const { returnStack } of executions) expect(returnStack.length).toBeLessThanOrEqual(RETURN_STACK_DEPTH);
      // At most one live execution state a controller (the install's own is gone by the end of its call).
      expect(executions.length).toBeLessThanOrEqual(controllers.length);
      const { parseCache } = state.ai;
      expect(parseCache.length).toBeLessThanOrEqual(scriptCount);
      expect(parseCache.map(({ script }) => script)).toEqual([...parseCache.map(({ script }) => script)].sort((a, b) => a - b));
      for (const { uses, items } of parseCache) {
        expect(items.length).toBeLessThanOrEqual(AI_PROGRAMS_LIMITS.scriptItems);
        expect(uses).toBeGreaterThan(0);
        expect(uses).toBeLessThanOrEqual(CORE_LIMITS.entities + 1);
      }
      expect(parseCache.reduce((sum, { uses }) => sum + uses, 0)).toBe(executions.length);
      for (const { script } of parseCache) scripts.add(script);
    }
    expect(peakExecutions).toBe(48);
    expect(scripts.size).toBeGreaterThan(1);
  });
});
