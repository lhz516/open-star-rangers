/**
 * The attack pass `0x63c00` (docs/original/formats/executable.md, WA7; ai.md §5.4 opcode 1101; docs/plan/p3/02/spec.md,
 * CR-16, CR-24 decision 15) with its break-off point `0x640d8` and phase-1 throttle `0x64474`, and the "in front" test
 * `0x5e844` it shares with the interpreter's state machine and the wingman. The table-program interpreter calls it for
 * opcode 1101 (P3-08/16); the wingman's step 8 reuses it (P3-08/19).
 *
 * A pass runs against the subject's +0x8C while that target is a large kind or slower than half the subject's speed
 * limit: phase 1 closes in with lead mode 5 and size class 3, firing when ready; phase 2 flies out to a break-off point
 * offset from the target in world axes; then phase 1 again. Leaving the pass restores the size class and the lead-mode
 * byte (not the lead constant). The list-1 bookkeeping C+0x160 is always 0 (its restore loop is dead code) and is not
 * kept.
 *
 * Numbers follow the native instructions: f64 steps are JavaScript double operations, f32 stores `Math.fround`, the
 * chopped quotients FISTP dword (a value beyond i32 is the integer indefinite −2³¹), shifts and clock sums in i32 and
 * then plain clocks (Core's clock never wraps, P3-02). FCOS is Math.cos. The weave reads the f32 mission time, which
 * starts at Core's mission clock (CR-24 decision 15).
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { AiControllerCommon, Entity } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { channelRange, firingDataOf, isChannelInRange, isSteady, pressChannel } from './ai-firing.ts';
import { aiPilot, evade, postSteering, postThrottle, type AiPilot } from './ai-piloting.ts';
import { proximityClearance, recentAttacker } from './ai-targeting.ts';
import type { CraftEntity } from './combat-init.ts';
import { motionStep } from './flight-motion.ts';
import { normalise } from './load-transforms.ts';
import { rowOf, speedOf } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { hasKind } from './radio.ts';
import { randomDirection } from './random-direction.ts';
import { toInt32 } from './record-defaults.ts';
import {
  axis, clearTargetOffset, computeSteering, controlBlock, forwardDot, setLeadMode, setSizeClass, setTargetOffset, updateTargetPoint,
} from './steering.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-attack-pass.${site}`);

/** An f32 store, a fault when it is not finite (the original unmasks overflow). */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

/** `clock + delay` (an i32) as a clock; one Core cannot represent is a budget fault (P3-02). */
function clockAfter(clock: number, delay: number): number {
  const due = clock + delay;
  if (!Number.isSafeInteger(due) || due < 0) throw new CoreFaultError('budget-exhausted', 'ai-attack-pass.clock');
  return due;
}

/** FISTP dword under the chop mode `0x74518` sets: truncation, and −2³¹ (integer indefinite) beyond i32. */
function chop32(value: number): number {
  const chopped = Math.trunc(value);
  return chopped >= -0x8000_0000 && chopped <= 0x7fff_ffff ? chopped + 0 : -0x8000_0000;
}

/** The deadline clock + (chop(D(`quotient`)) << 6) + `extra`, in i32 before the clock sum. */
const passDeadline = (clock: number, quotient: number, extra: number): number => clockAfter(clock, toInt32(toInt32(chop32(quotient) * 64) + extra));

/**
 * `0x5e844`(subject, other): whether `other` lies ahead of `subject`, 0 < D(D(D(r3y·F(dy)) + D(r3z·F(dz))) + D(r3x·F(dx)))
 * with r3 the subject's row 3 and d = other's position − the subject's (an unordered sum counts as ahead).
 */
export function isInFront(subject: Entity, other: Entity): boolean {
  const { x, y, z } = rowOf(subject.orientation, 2);
  const dx = Math.fround(other.position.x - subject.position.x);
  const dy = Math.fround(other.position.y - subject.position.y);
  const dz = Math.fround(other.position.z - subject.position.z);
  return !(y * dy + z * dz + x * dx <= 0);
}

/** One attack-pass call on an AI subject in its object update. */
export interface AttackPassCall {
  readonly world: WorldState;
  readonly subject: CraftEntity;
  readonly rand: RandSource;
  readonly post: AiPilot['post'];
}

/** The kinds the pass treats as large, `0xf9c7c`. */
const LARGE_KINDS = 0xf9c7c;
/** The size class and lead mode a pass flies with. */
const PASS_SIZE_CLASS = 3;
const PASS_LEAD_MODE = 5;
/** The extra time of a pass's approach, 0x100 units. */
const APPROACH_EXTRA = 0x100;
/** Phase 2 turns back to phase 1 within 50 units (f32 0x1724d0). */
const TURN_BACK_DISTANCE = 50;
/** The holds of the pass's presses. */
const MISSILE_HOLD = -1;
const GUN_HOLD = 0x80;
/** The range without a usable channel (f32 750.0). */
const FALLBACK_RANGE = 750;
/** The f64 constants of `0x640d8`: π′, 2, 0.5, 1/3, 100, 0.9. */
const PI = 3.1415927;
const LARGE_FAR = 2;
const HALF = 0.5;
const THIRD = 1 / 3;
const SCATTER = 100;
const ALONG_X = 0.9;

/**
 * `0x640d8`: the break-off offset, in world axes from the target, and the pass deadline C+0x154. r is the channel-1
 * range while the AI lock is on and the list works, else channel 0's, else 750; d0 = D(D(π′ ÷ S+0x58) × S+0x4C). A
 * large target: u the unit vector from it to the subject, hi = F(d0 + 2r), lo = F(D(d0 + 2r) − r × 0.5), one draw x =
 * lo + r·c × (hi − lo), D = x + S+0x48, offset F(u × D), deadline from D ÷ S+0x4C, then F(offset + F(random direction ×
 * 100)) (two draws). Another: u from the subject to it, a perpendicular p, hi = F(d0 + r), lengthened when the target
 * moves away along u, lo = F(hi − r × 0.5), one draw as above, offset F(F(u × D) + F(p × D ÷ 3)), deadline as above.
 */
function breakOffPoint(call: AttackPassCall, controller: AiControllerCommon, target: Entity, targetSpeed: number, large: boolean): Vec3 {
  const { world, subject, rand } = call;
  const { steering, attackPass } = controller;
  const data = firingDataOf(world);
  const range = (controller.aiLock ? channelRange(data, subject, 1) : null) ?? channelRange(data, subject, 0) ?? FALLBACK_RANGE;
  const { speedLimit, approachRadius } = steering;
  const rate = steering.turnRates[1];
  if (rate === 0 || speedLimit === 0) throw fault('rate');
  const d0 = (PI / rate) * speedLimit;
  const own = subject.position;
  const at = target.position;
  const draw = (hi: number, lo: number): number => rand.next() * RAND_SCALE * (hi - lo) + lo + approachRadius;
  if (large) {
    const u = normalise({ x: store(own.x - at.x), y: store(own.y - at.y), z: store(own.z - at.z) });
    const far = d0 + range * LARGE_FAR;
    const distance = draw(store(far), store(far - range * HALF));
    attackPass.deadline = passDeadline(world.clock, distance / speedLimit, 0);
    const scatter = randomDirection(rand);
    return {
      x: store(store(u.x * distance) + store(scatter.x * SCATTER)),
      y: store(store(u.y * distance) + store(scatter.y * SCATTER)),
      z: store(store(u.z * distance) + store(scatter.z * SCATTER)),
    };
  }
  const u = normalise({ x: store(at.x - own.x), y: store(at.y - own.y), z: store(at.z - own.z) });
  const side = store(Math.sqrt(u.y * u.y + u.z * u.z));
  if (side === 0) throw fault('perpendicular');
  const inverse = store(1 / side);
  const py = u.z * inverse;
  const pz = -u.y * inverse;
  const p: Vec3 = !(py * store(py) + pz * store(pz) >= ALONG_X)
    ? { x: side, y: store(-u.x * u.y * inverse), z: store(-u.x * u.z * inverse) }
    : { x: 0, y: store(py), z: store(pz) };
  const row = rowOf(target.orientation, 2);
  const away = store(row.y * u.y + row.z * u.z + row.x * u.x);
  let hi = store(d0 + range);
  if (!(away <= 0)) hi = store(((away * targetSpeed * hi) / speedLimit) + hi);
  const distance = draw(hi, store(hi - range * HALF));
  attackPass.deadline = passDeadline(world.clock, distance / speedLimit, 0);
  const third = distance * THIRD;
  return {
    x: store(store(u.x * distance) + store(p.x * third)),
    y: store(store(u.y * distance) + store(p.y * third)),
    z: store(store(u.z * distance) + store(p.z * third)),
  };
}

/**
 * `0x64474`, the phase-1 throttle (no draw): 1.0 without channel 0 in range; otherwise by ρ = F(target speed ÷ S+0x4C)
 * and δ = D(D(D(T.r3y·O.r3y) + D(T.r3z·O.r3z)) + D(T.r3x·O.r3x)), in double against f64 constants: ρ < 0.1 →
 * max(ρ + 0.3, 0.5); δ > 0.707 → max(ρ + 0.2, 0.5, or 0.4 with the cone bits 3); δ > −0.707 → max(ρ + 0.4, likewise);
 * else 0.4 (0.5 with the cone bits 3). Stored f32, then at most 1.0.
 */
function passThrottle(controller: AiControllerCommon, subject: Entity, target: Entity, targetSpeed: number, inRange: boolean): number {
  if (!inRange) return 1;
  const ratio = store(targetSpeed / controller.steering.speedLimit);
  const aimed = controller.steering.coneBits === 3;
  const floor = aimed ? 0.4 : 0.5;
  const at = (value: number, low: number): number => (low > value ? low : value);
  let throttle: number;
  if (ratio < 0.1) {
    throttle = Math.fround(at(ratio + 0.3, 0.5));
  } else {
    const facing = forwardDot(target, subject);
    if (facing > 0.707) throttle = Math.fround(at(ratio + 0.2, floor));
    else if (facing > -0.707) throttle = Math.fround(at(ratio + 0.4, floor));
    else throttle = Math.fround(aimed ? 0.5 : 0.4);
  }
  return 1 <= throttle ? 1 : throttle;
}

/** The weave's f64 2.0 (its rand scale `0x1724d4` is RAND_SCALE). */
const WEAVE_TURNS = 2;
/** The roll the weave adds to an unset row 3 (f64 0.4). */
const WEAVE_ROLL = 0.4;

/**
 * The weave of phase 1, after `0x5cd1c`, while the last attacker is recent (AICO +0x38, strict): period P and amplitude M
 * drawn between AICO +0x3C/+0x40 and +0x44/+0x48 (two draws); row 1 := F(value + cos(t × 2.0 × π′ ÷ P) × M) clamped to
 * [−1, 1] when set, otherwise set to F(cos(…) × M) unclamped; an unset row 3 is set to F(value + 0.4) after a third,
 * unused draw. t is the f32 mission time.
 */
function weave(world: WorldState, controller: AiControllerCommon, rand: RandSource): void {
  const globals = world.ruleData.inputs.aiPrograms.content.globals;
  const periodSpan = store(globals.at40 - globals.at3C);
  const period = store(rand.next() * RAND_SCALE * periodSpan + globals.at3C);
  const amplitudeSpan = store(globals.at48 - globals.at44);
  const amplitude = store(rand.next() * RAND_SCALE * amplitudeSpan + globals.at44);
  if (period === 0) throw fault('weave-period');
  const time = motionStep(0, world.clock).time;
  const swing = Math.cos(((time * WEAVE_TURNS) * PI) / period) * amplitude;
  const { control } = controller.steering;
  const [, yaw] = control.axes;
  let [pitch, , roll] = control.axes;
  if (pitch.set) {
    const value = store(swing + pitch.value);
    pitch = axis(pitch.clear, true, 1 < value ? 1 : value < -1 ? -1 : value);
  } else {
    pitch = axis(pitch.clear, true, store(swing));
  }
  if (!roll.set) {
    rand.next();
    roll = axis(roll.clear, true, store(roll.value + WEAVE_ROLL));
  }
  controller.steering.control = controlBlock(control.scale, [pitch, yaw, roll], control.speedFactor);
}

/**
 * The attack pass `0x63c00`(C) (module comment). Not applying (no valid +0x8C, or a small target at least as fast as
 * half the speed limit): an active pass is undone and it returns false. Otherwise it starts a pass (saving the size
 * class and lead mode, size class 3, lead mode 5 with constant 0, offset off, `0x5c8b0`, deadline D(S+0x28 ÷ S+0x4C)
 * chopped × 64 + 0x100) or runs `0x5c8b0`; phase 1 breaks off (offset frame 1 at the break-off point, throttle 0.0,
 * phase 2) when within the approach radius or past the deadline, else presses channel 1 when ready and steady, channel
 * 0 with hold 0x80 when aimed and in range, and posts its throttle; phase 2 returns to phase 1 within 50 or past the
 * deadline, else posts throttle 1.0. Then the proximity escape (both radii against AICO +0x34, the other ahead) evades;
 * otherwise `0x5cd1c`, the weave in phase 1 and `0x5d014`. C+0xF0 := sample + C+0xF4; true.
 */
export function attackPass(call: AttackPassCall, controller: AiControllerCommon): boolean {
  const { world, subject, rand } = call;
  const { clock } = world;
  const pilot = aiPilot(world, subject, controller, rand, call.post);
  const { scene } = pilot;
  const resolve = (id: number | null): Entity | undefined => (id === null ? undefined : scene.resolve(id));
  const { steering, attackPass: pass } = controller;
  const target = resolve(subject.ai.objectTarget);
  const targetSpeed = target === undefined ? 0 : store(speedOf(target));
  const large = target !== undefined && hasKind(LARGE_KINDS, target.kindBit);
  if (target === undefined || !(large || !(targetSpeed >= steering.halfSpeedLimit))) {
    if (pass.phase !== 0) {
      clearTargetOffset(steering);
      setSizeClass(steering, scene, pass.savedSizeClass);
      pass.phase = 0;
      steering.leadMode = pass.savedLeadMode;
    }
    return false;
  }
  if (steering.speedLimit === 0) throw fault('speed-limit');
  /** Phase 1 from here: offset off, `0x5c8b0`, the deadline D(S+0x28 ÷ S+0x4C) chopped × 64 + 0x100. */
  const approach = (): void => {
    clearTargetOffset(steering);
    updateTargetPoint(steering, scene);
    pass.deadline = passDeadline(clock, steering.distance / steering.speedLimit, APPROACH_EXTRA);
    pass.phase = 1;
  };
  if (pass.phase === 0) {
    pass.savedSizeClass = steering.sizeClass;
    pass.savedLeadMode = steering.leadMode;
    setSizeClass(steering, scene, PASS_SIZE_CLASS);
    setLeadMode(steering, PASS_LEAD_MODE, 0, 0);
    approach();
  } else {
    updateTargetPoint(steering, scene);
  }
  if (pass.phase === 1) {
    if (!(steering.distance >= steering.approachRadius) || clock > pass.deadline) {
      setTargetOffset(steering, 1, breakOffPoint(call, controller, target, targetSpeed, large));
      postThrottle(pilot, 0);
      pass.phase = 2;
    } else {
      if (controller.missileReady && isSteady(subject)) pressChannel(controller, 1, MISSILE_HOLD, clock);
      const inRange = isChannelInRange(firingDataOf(world), subject, controller, 0);
      if (steering.coneBits === 3 && inRange) pressChannel(controller, 0, GUN_HOLD, clock);
      postThrottle(pilot, passThrottle(controller, subject, target, targetSpeed, inRange));
    }
  } else if (!(steering.distance >= TURN_BACK_DISTANCE) || clock > pass.deadline) {
    approach();
  } else {
    postThrottle(pilot, 1);
  }
  const globals = world.ruleData.inputs.aiPrograms.content.globals;
  const { proximity } = subject.combat;
  const near = resolve(proximity?.entity ?? null);
  if (proximity !== null && near !== undefined
    && !(proximityClearance(world.ruleData, subject.kindBit, proximity.distanceSquared, near.kindBit) >= globals.at34) && isInFront(subject, near)) {
    evade(pilot, near.id);
  } else {
    computeSteering(steering, scene);
    if (pass.phase === 1 && recentAttacker(subject, resolve, clock, globals.at38, false) !== undefined) weave(world, controller, rand);
    postSteering(pilot);
  }
  controller.nextUpdateClock = clockAfter(clock, controller.period);
  return true;
}
