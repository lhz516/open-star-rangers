/**
 * The table-program interpreter `0x64cb8` (docs/plan/p3/08/spec.md, 解释器与脚本, S-05; docs/plan/p3/02/spec.md,
 * CR-16, CR-17, CR-23–CR-25; docs/original/formats/ai.md §5.4, §11, §12): the handler of every table record, with its
 * install path `0x64b54` (and `0x5e4d0`), its state machine `0x64d58` and the script executor `0x5f4f4` over the 25
 * supported opcodes. Piloting, targeting and firing are the primitives of ai-piloting.ts, steering.ts, ai-targeting.ts,
 * ai-firing.ts and ai-attack-pass.ts; nothing here is a rule of its own beyond the interpreter's.
 *
 * Each controller owns its interpreter state and its current script's execution state; the parsed arguments are shared
 * through the world's parse cache (ai-script.ts). An install's install script has an execution state for that call only.
 *
 * The executor has no step counter in the original: a script that never yields hangs it. Core counts item dispatches
 * against CORE_LIMITS.aiDispatchesPerRun and, across the tick, aiDispatchesPerTick (CR-25), checked before each
 * dispatch: going past either is a budget fault, which latches the world; nothing is truncated or made to yield.
 *
 * Clock comparisons are plain (Core's clock never wraps, P3-02); a window the original compares unsigned is taken as its
 * u32 value. A negative script delay acts as 0: its deadline is max(clock + delay, 0) (CR-24 decision 16).
 */
import type { AiParameterEntry } from '../../content/rule-data/ai-programs.ts';
import { fitsLimit } from '../contracts/limits.ts';
import { CoreFaultError } from '../errors.ts';
import { clearedControllerCommon, type AiControllerCommon, type Entity, type ExecutionState, type InterpreterState, type SteeringBlock, type TableController } from '../world/entity-table.ts';
import type { ParsedArgument, WorldState } from '../world/world-state.ts';
import { attackPass, isInFront } from './ai-attack-pass.ts';
import { enableAiLock, firingDataOf, isChannelInRange, isSteady, pressChannel } from './ai-firing.ts';
import { aiPilot, evade, postAxes, postBreakTurn, postRates, postSpeedMatch, postSteering, postThrottle, type AiPilot } from './ai-piloting.ts';
import { loadScript, parsedScript, releaseScript, resetExecution } from './ai-script.ts';
import type { LoadedTableProgram } from './ai-support.ts';
import { armEngagement, engageTarget, isSameSide, proximityClearance, recentAttacker, refreshEngagement, type EngagementCall } from './ai-targeting.ts';
import type { CraftEntity } from './combat-init.ts';
import type { MountList } from './mounts.ts';
import type { RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';
import {
  computeSteering, forwardDot, setLeadMode, setSizeClass, setSteeringFractions, setSteeringNoise, updateReverseView, updateTargetPoint,
  type SteeringCraft,
} from './steering.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-interpreter.${site}`);

/** `clock + duration` as a clock; a sum Core cannot represent is a budget fault (P3-02). */
function clockAfter(clock: number, duration: number): number {
  const due = clock + duration;
  if (!Number.isSafeInteger(due) || due < 0) throw new CoreFaultError('budget-exhausted', 'ai-interpreter.clock');
  return due;
}

/** A script's wait deadline, clock + `delay` (i32), with a negative delay acting as 0 (CR-24 decision 16). */
function scriptDeadline(clock: number, delay: number): number {
  return clockAfter(clock, Math.max(delay, -clock));
}

/** The interpreter's installed controller. */
export type InterpreterController = Extract<TableController, { readonly handler: 'interpreter' }>;

/** The item dispatches of the current tick, which every executor run adds to (CR-25). */
export interface DispatchCount {
  dispatches: number;
}

/** One handler call on a table-program subject in its object update. */
export interface InterpreterCall {
  readonly world: WorldState;
  readonly subject: CraftEntity;
  /** The call's draws, from the world's RNG. */
  readonly rand: RandSource;
  /** Posts a piloting request (`steer`, `ai-match-speed`) for the request handling of this tick. */
  readonly post: AiPilot['post'];
  /** `0x5e6cc`: the subject's Warp departure request; whether it was posted. */
  depart(): boolean;
  /** This tick's dispatch count. */
  readonly tick: DispatchCount;
}

/** The subject's table record (after the load transforms) and its DFPG with F(+0x08²). */
interface Program {
  readonly record: LoadedTableProgram;
  readonly parameters: AiParameterEntry;
  readonly thresholdSquared: number;
}

function programOf({ world, subject }: InterpreterCall): Program {
  const { program } = subject.ai;
  if (program.type !== 'table') throw fault('program');
  const record = world.ruleData.ai.tablePrograms[program.record];
  const parameters = world.ruleData.inputs.aiPrograms.content.entries[record?.parameters ?? -1];
  const thresholdSquared = world.ruleData.ai.thresholdsSquared[record?.parameters ?? -1];
  if (parameters?.kind !== 'parameters' || thresholdSquared === null || thresholdSquared === undefined) throw fault('parameters');
  return { record, parameters, thresholdSquared };
}

function craftOf({ world, subject }: InterpreterCall): SteeringCraft {
  const craft = world.craftInfo.content.craft[subject.kindBit];
  if (craft === undefined) throw fault('craft');
  return craft;
}

const pilotOf = (call: InterpreterCall, controller: AiControllerCommon): AiPilot => aiPilot(call.world, call.subject, controller, call.rand, call.post);

function engagementOf(call: InterpreterCall, controller: AiControllerCommon, pilot: AiPilot): EngagementCall {
  return { world: call.world, controller, scene: pilot.scene, rand: call.rand, depart: () => call.depart() };
}

/** `0x5c530` on the steering block: cleared, size class 2, lead mode 0, approach radius 0, then `0x5c768`(1.0, 1.0, 0). */
function resetSteering(block: SteeringBlock, craft: SteeringCraft): void {
  Object.assign(block, clearedControllerCommon().steering, { sizeClass: 2, leadMode: 0, approachRadius: 0 });
  setSteeringFractions(block, craft, 1, 1, false);
}

/** f32 0.65 and 0.5, the floors of `0x5e4d0`'s speed and turn fractions. */
const SPEED_FLOOR = Math.fround(0.65);
const TURN_FLOOR = 0.5;

/**
 * `0x5e4d0`(C, a, b, g, c) (ai §11.2), from the install with the record's +0x40, +0x3C, +0x38 and 1. A negative runtime
 * +0xE0 is written back as its i32 negation and turns the lock gate off. s1 = 1.0 without record +0x10, else F(D((e −
 * +0x10) × 0.01)) at least 0; s2 = F(D(trunc(100 × (+0x0C − k) ÷ +0x0C) × 0.01)). With the gate on and g, the AI lock
 * goes on. s2 > 0.5 lengthens the period by half; otherwise s1 > 0.3 shortens it by a third, rewrites the speed limit
 * C+0x10C and resets the steering block. Then the fractions v1 (from a, at least 0.65) and v2 (from b, at least 0.5) with
 * roll matching `c`, and both noise amplitudes F(D(s2 × 0.0625)).
 */
function adjustToSkill(call: InterpreterCall, common: AiControllerCommon, record: LoadedTableProgram, a: number, b: number, lock: boolean, rollMatch: boolean): void {
  const { subject } = call;
  const craft = craftOf(call);
  let e = subject.ruleInputs.aiValueB;
  const gate = e >= 0;
  if (!gate) {
    e = toInt32(-e);
    subject.ruleInputs = Object.freeze({ ...subject.ruleInputs, aiValueB: e });
  }
  let s1 = 1;
  if (record.at10 !== 0) {
    s1 = Math.fround(toInt32(e - record.at10) * 0.01);
    if (s1 < 0) s1 = 0;
  }
  const dividend = toInt32(100 * toInt32(record.at0C - subject.ruleInputs.aiValueA));
  // IDIV: a zero divisor is rejected at creation (CR-15); −2³¹ ÷ −1 overflows (#DE).
  if (record.at0C === 0 || (dividend === -0x8000_0000 && record.at0C === -1)) throw fault('skill-divide');
  const s2 = Math.fround(Math.trunc(dividend / record.at0C) * 0.01);
  if (gate && lock) enableAiLock(common, subject);
  if (s2 > TURN_FLOOR) {
    common.period = Math.trunc(toInt32(3 * common.period) / 2);
  } else if (s1 > 0.3) {
    common.period = Math.trunc(toInt32(2 * common.period) / 3);
    common.limits.speed = Math.fround(record.at28 * 3.1415927 * 0.005555555555555555 * ((1 + s1) * 0.5));
    resetSteering(common.steering, craft);
  }
  if (common.period < 0) throw fault('period');
  const fraction = (value: number, floor: number): number => {
    const scaled = value - value * s2 * 0.125;
    return scaled < floor ? floor : Math.fround(scaled);
  };
  setSteeringFractions(common.steering, craft, fraction(a, SPEED_FLOOR), fraction(b, TURN_FLOOR), rollMatch);
  const noise = Math.fround(s2 * 0.0625);
  setSteeringNoise(common.steering, noise, noise);
}

/** A newly allocated, zeroed interpreter state I. */
const newInterpreterState = (): InterpreterState => ({ state: 0, execution: null, lastRunEnded: false, steadyClock: 0, stateDeadline: 0, state4Deadline: 0 });

/**
 * Steps 3–5 of `0x64cb8`: the state machine, then, unless it returned 1, a run of the current script (its result kept
 * at I+8); then I+0x0C := the sample when the cone bits are 3.
 */
function updateBody(call: InterpreterCall, controller: InterpreterController): void {
  const { interpreter } = controller;
  if (!runStateMachine(call, controller) && interpreter.execution !== null) {
    interpreter.lastRunEnded = runScript(call, controller, interpreter.execution);
  }
  if (controller.steering.coneBits === 3) interpreter.steadyClock = call.world.clock;
}

/**
 * `0x64cb8` in mode 0 on the common controller `0x5dc0c` installed: C+0xF0 := sample + C+0xF4; the install path
 * `0x64b54`: the engagement timer with DFPG +0x04 (`0x63250`, one draw unless 0), `0x5e4d0` when record +0x50 is set,
 * `0x5c768` (and the AI lock with +0x38) when +0x34 is set, `0x5c7e8` when +0x44 is set, and one run of the DFPG's
 * install script, loaded and released around it; then a zeroed interpreter state and, in the same call, the first
 * update (updateBody). Returns the installed controller.
 */
export function installInterpreter(call: InterpreterCall, common: AiControllerCommon): InterpreterController {
  const { world, subject, rand } = call;
  const { clock } = world;
  common.nextUpdateClock = clockAfter(clock, common.period);
  const { record, parameters } = programOf(call);
  armEngagement(common, parameters.at04, 0, clock, rand);
  if (record.at50 !== 0) adjustToSkill(call, common, record, record.at40, record.at3C, record.at38 !== 0, true);
  if (record.at34 !== 0) {
    setSteeringFractions(common.steering, craftOf(call), record.at40, record.at3C, true);
    if (record.at38 !== 0) enableAiLock(common, subject);
  }
  if (record.at44 !== 0) setSteeringNoise(common.steering, record.at4C, record.at48);
  if (parameters.installScript !== null) {
    const execution = loadScript(world, parameters.installScript, rand);
    runScript(call, common, execution);
    releaseScript(world, execution);
  }
  const controller: InterpreterController = { ...common, handler: 'interpreter', interpreter: newInterpreterState() };
  updateBody(call, controller);
  return controller;
}

/** `0x64cb8` in mode 1, when the AI step finds it due: C+0xF0 := sample + C+0xF4, then the update (updateBody). */
export function updateInterpreter(call: InterpreterCall, controller: InterpreterController): void {
  controller.nextUpdateClock = clockAfter(call.world.clock, controller.period);
  updateBody(call, controller);
}

/** `0x64cb8` in mode 2, at the removal: the current script's execution state is released; the interpreter state goes. */
export function removeInterpreter(world: WorldState, controller: InterpreterController): void {
  const { execution } = controller.interpreter;
  if (execution !== null) releaseScript(world, execution);
}

/** A DFPG's list for a state 1–6 (ai §4): 1 +0x3C/+0x40, 2 +0x44, 3 +0x4C, 5 +0x54, 4 +0x5C, 6 +0x64. */
function stateList(parameters: AiParameterEntry, state: number): readonly number[] {
  if (!Number.isInteger(state) || state < 1 || state > 6) throw fault('state');
  return parameters.stateScripts[`state${state as 1 | 2 | 3 | 4 | 5 | 6}`];
}

/** Whether `clock − since` (unsigned; `since` ≤ clock) is at most `window` (u32). */
function isWithin(clock: number, since: number, window: number): boolean {
  const elapsed = clock - since;
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) throw fault('elapsed');
  return elapsed <= window >>> 0;
}

/** States 3, 4 and 5, whose entry from outside them sets the state deadline (rules 7 and 13). */
const isEngagedState = (state: number): boolean => state >= 3 && state <= 5;

/**
 * The state machine `0x64d58` (ai §11.3): returns true only from rule 1, when the executor is skipped. `t` is the target
 * the code carries in a register, `t0` the subject's +0x8C before rule 2, `d` the controller's distance C+0x2C, read
 * where the code reads it.
 */
export function runStateMachine(call: InterpreterCall, controller: InterpreterController): boolean {
  const { world, subject } = call;
  const { clock } = world;
  const { interpreter, steering } = controller;
  const { parameters: d, thresholdSquared } = programOf(call);
  const pilot = pilotOf(call, controller);
  const resolve = (id: number | null): Entity | undefined => (id === null ? undefined : pilot.scene.resolve(id));
  const { combat } = subject;

  // 1. Proximity escape.
  const proximity = combat.proximity;
  const near = resolve(proximity?.entity ?? null);
  if (proximity !== null && near !== undefined
    && !(proximityClearance(world.ruleData, subject.kindBit, proximity.distanceSquared, near.kindBit) >= thresholdSquared) && isInFront(subject, near)) {
    evade(pilot, near.id);
    return true;
  }

  const current = interpreter.state;
  let next: number = current;
  const t0 = subject.ai.objectTarget;
  // 2. Retarget.
  refreshEngagement(engagementOf(call, controller, pilot));
  let t = subject.ai.objectTarget;
  if (t !== t0) {
    updateTargetPoint(steering, pilot.scene);
    next = steering.distance < d.at14 ? 3 : steering.distance < d.at10 ? 2 : 1;
  }
  // 3. State 5.
  const target = resolve(t);
  if (next !== 1 && next !== 2 && stateList(d, 5).length > 0 && target !== undefined) {
    if (next === 5) next = 3;
    updateTargetPoint(steering, pilot.scene);
    if ((steering.relativeFlags & 4) === 0) {
      updateReverseView(steering, pilot.scene);
      if ((steering.reverseFlags & 4) !== 0 && !(steering.distance >= d.at2C) && forwardDot(subject, target) >= d.at30) next = 5;
    }
  }
  // 4. Attacker.
  const attacker = recentAttacker(subject, resolve, clock, d.at24, true);
  if (attacker !== undefined && !isSameSide(subject, attacker)) {
    if (t !== attacker.id) {
      engageTarget(controller, pilot.scene, attacker.id);
      t = attacker.id;
    }
    if (stateList(d, 4).length === 0) {
      next = 3;
    } else {
      next = 4;
      if (interpreter.state4Deadline === 0) interpreter.state4Deadline = clockAfter(clock, d.at28);
    }
  }
  // 5. Victim.
  const victimRecord = combat.lastVictim;
  const victim = resolve(victimRecord?.entity ?? null);
  if (d.at34 !== 0 && victimRecord !== null && victim !== undefined && isSameSide(subject, victim) && isWithin(clock, victimRecord.clock, controller.period)) next = 2;
  // 6.
  if (next === 1 && steering.distance < d.at10) next = 2;
  // 7. Stall.
  if (isEngagedState(next) && d.at18 !== 0 && t === t0 && clock > interpreter.stateDeadline) {
    const sinceSteady = clock - interpreter.steadyClock;
    const sinceVictim = clock - (victimRecord?.clock ?? 0);
    updateTargetPoint(steering, pilot.scene);
    if ((sinceSteady > d.at18 || sinceVictim > d.at18) && steering.distance < d.at20) next = 6;
  }
  // 8 and 9.
  if (current === 4 && next !== 2 && clock < interpreter.state4Deadline && t === t0) next = 4;
  if (current === 4 && next === 4 && clock > interpreter.state4Deadline) next = 3;
  // 10.
  if ((next === 1 || next === 2 || next === 6) && stateList(d, next).length === 0) {
    interpreter.state4Deadline = 0;
    next = 3;
  }
  // 11. Same state.
  if (next === current) {
    const { execution } = interpreter;
    if (execution === null || !interpreter.lastRunEnded) return false;
    if (current === 2 || current === 6) {
      next = 3;
    } else if (stateList(d, current).length === 1) {
      resetExecution(execution);
      return false;
    }
  }
  // 12. Switch.
  if (interpreter.execution !== null) releaseScript(world, interpreter.execution);
  interpreter.execution = null;
  if (next !== 4) interpreter.state4Deadline = 0;
  // 13. Select.
  const state = next as InterpreterState['state'];
  const list = stateList(d, state);
  if (list.length !== 0) interpreter.execution = loadScript(world, list[call.rand.next() % list.length], call.rand);
  if (isEngagedState(state) && !isEngagedState(current)) interpreter.stateDeadline = clockAfter(clock, d.at1C);
  interpreter.state = state;
  return false;
}

/** Whether the next dispatch fits the run's and the tick's budgets (CR-25); a fault otherwise. */
function countDispatch(call: InterpreterCall, run: { dispatches: number }): void {
  if (!fitsLimit('aiDispatchesPerRun', run.dispatches, 1)) throw new CoreFaultError('budget-exhausted', 'ai.dispatches-per-run');
  if (!fitsLimit('aiDispatchesPerTick', call.tick.dispatches, 1)) throw new CoreFaultError('budget-exhausted', 'ai.dispatches-per-tick');
  run.dispatches += 1;
  call.tick.dispatches += 1;
}

/** An integer slot (integer, boolean and keyword classes). */
function integerOf(argument: ParsedArgument): number {
  if (argument.type !== 'integer') throw fault('argument');
  return argument.value;
}

/** A float slot. */
function floatOf(argument: ParsedArgument): number {
  if (argument.type !== 'float') throw fault('argument');
  return argument.value;
}

/** A channel argument: the slot's low byte, one of the three lists. */
function channelOf(argument: ParsedArgument): MountList {
  const channel = integerOf(argument) & 0xff;
  if (channel > 2) throw fault('channel');
  return channel as MountList;
}

/** `0x5e154` and `0x5e15c`: the missile-ready flag, then (only when set) the steadiness. */
const isReadyAndSteady = (controller: AiControllerCommon, subject: Entity): boolean => controller.missileReady && isSteady(subject);

/**
 * low32(trunc(D(D(a ÷ rate) × 64.0))) as an i32 (`0x74518` with FISTP qword): the delay of opcodes 1001–1003. An
 * integer-indefinite result (beyond 64 bits) has a low dword of 0.
 */
function turnDelay(angle: number, rate: number): number {
  if (rate === 0) throw fault('zero-rate');
  const chopped = Math.trunc((angle / rate) * 64);
  if (!Number.isFinite(chopped) || Math.abs(chopped) >= 2 ** 63) return 0;
  return Number(BigInt.asIntN(32, BigInt(chopped)));
}

/** Opcodes 1000–1003: the wait until `until`, continuing at `next`; a yield. */
function waitFor(execution: ExecutionState, until: number, next: number): false {
  execution.wait = Object.freeze({ active: true, until });
  execution.item = next;
  return false;
}

/** f32 0.6, the hold step's lower speed-match bound. */
const HOLD_SPEED_LOW = Math.fround(0.6);
/** The hold of the wait step's channel-0 press. */
const WAIT_HOLD = 0x20;

/**
 * The executor `0x5f4f4`(C, X) (ai §5.4): one run of `execution` on `controller` (the interpreter's, or the common one
 * an install runs its install script on). A wait still running steers and returns (yield); a hold still running runs
 * the hold step and returns. Otherwise items are dispatched from X+0x28 until a yield (false) or the end (true): an
 * action continues at its branch target or the next item, a test at its target only when its condition holds.
 */
export function runScript(call: InterpreterCall, controller: AiControllerCommon, execution: ExecutionState): boolean {
  const { world, subject, rand } = call;
  const { clock } = world;
  const { steering } = controller;
  const pilot = pilotOf(call, controller);
  const { scene } = pilot;
  const data = firingDataOf(world);
  const inRange = (channel: MountList): boolean => isChannelInRange(data, subject, controller, channel);
  const twicePeriod = toInt32(2 * controller.period);

  if (!execution.hold.active) {
    if (execution.wait.active && clock < execution.wait.until) {
      updateTargetPoint(steering, scene);
      computeSteering(steering, scene);
      if (steering.coneBits === 3 && inRange(0)) pressChannel(controller, 0, WAIT_HOLD, clock);
      return false;
    }
    execution.wait = Object.freeze({ ...execution.wait, active: false });
  }
  updateTargetPoint(steering, scene);
  if (execution.hold.active && clock < execution.hold.until) {
    postSpeedMatch(pilot, 0, HOLD_SPEED_LOW, 1);
    computeSteering(steering, scene);
    postSteering(pilot);
    if (isReadyAndSteady(controller, subject)) pressChannel(controller, 1, -1, clock);
    if (steering.coneBits === 3 && inRange(0)) pressChannel(controller, 0, twicePeriod, clock);
    if ((steering.relativeFlags & 4) === 0 && inRange(2)) pressChannel(controller, 2, twicePeriod, clock);
    return false;
  }
  execution.hold = Object.freeze({ ...execution.hold, active: false });

  const items = world.ruleData.inputs.aiPrograms.content.entries[execution.script];
  if (items?.kind !== 'script') throw fault('script');
  const { items: parsed } = parsedScript(world, execution.script);
  const run = { dispatches: 0 };
  for (;;) {
    countDispatch(call, run);
    const at = execution.item;
    const item = items.items[at];
    const argument = parsed[at];
    if (item === undefined || argument === undefined) throw fault('item');
    const branch = item.branch;
    const targetOrNext = branch ?? at + 1;
    // An action continues at its branch target or the next item, a test at the target only when its condition holds.
    let taken = true;
    switch (item.opcode) {
      case 100: {
        if (argument.type !== 'optional-floats') throw fault('argument');
        const [f0, f1, f2, f3] = argument.values;
        if (f0.present && f1.present && f2.present) {
          postRates(pilot, [f0.value, f1.value, f2.value], f3.present ? f3.value : -1);
        } else {
          postAxes(pilot, [f0.present ? f0.value : null, f1.present ? f1.value : null, f2.present ? f2.value : null]);
          if (f3.present) postThrottle(pilot, f3.value);
        }
        break;
      }
      case 104:
        postThrottle(pilot, floatOf(argument));
        break;
      case 106:
        computeSteering(steering, scene);
        postSteering(pilot);
        break;
      case 107:
        // The slot of this argument-less opcode is 0: it branches when nothing was posted.
        taken = !postBreakTurn(pilot);
        break;
      case 111: {
        if (argument.type !== 'floats' || argument.values.length !== 3) throw fault('argument');
        const [a, lo, hi] = argument.values;
        postSpeedMatch(pilot, a, lo, hi);
        break;
      }
      case 200:
        taken = ((steering.relativeFlags & 4) !== 0 ? 1 : 0) === integerOf(argument);
        break;
      case 210:
        taken = steering.distance < floatOf(argument);
        break;
      case 211:
        taken = steering.distance > floatOf(argument);
        break;
      case 222:
        taken = (steering.coneBits !== 0 ? 1 : 0) === integerOf(argument);
        break;
      case 231:
        taken = !inRange(channelOf(argument));
        break;
      case 232:
        taken = (isReadyAndSteady(controller, subject) ? 1 : 0) === integerOf(argument);
        break;
      case 240:
        taken = rand.next() % 101 < integerOf(argument);
        break;
      case 300:
        setLeadMode(steering, integerOf(argument) & 0xff, 0, 0);
        break;
      case 301:
        setSizeClass(steering, scene, integerOf(argument) & 0xff);
        break;
      case 400:
      case 401:
      case 402:
        pressChannel(controller, (item.opcode - 400) as MountList, integerOf(argument), clock);
        break;
      case 1000:
        return waitFor(execution, scriptDeadline(clock, integerOf(argument)), targetOrNext);
      case 1001:
      case 1002:
      case 1003:
        return waitFor(execution, scriptDeadline(clock, turnDelay(floatOf(argument), steering.turnRates[item.opcode - 1001])), targetOrNext);
      case 1101:
        taken = (attackPass(call, controller) ? 1 : 0) === integerOf(argument);
        break;
      case 9500:
        execution.returnStack = Object.freeze([]);
        execution.item = branch ?? 0;
        return false;
      case 9999:
      case 10000:
        return true;
      default:
        throw fault('opcode');
    }
    execution.item = taken ? targetOrNext : at + 1;
  }
}
