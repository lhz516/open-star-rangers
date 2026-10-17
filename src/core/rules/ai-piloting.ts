/**
 * The AI movement helpers (docs/plan/p3/08/spec.md, AI 驾驶; docs/plan/p3/02/spec.md, CR-21; docs/original/formats/
 * executable.md, A5–A7): the posters of messages 0x40000 (`steer`) and 0x80000 (`ai-match-speed`) and the evasion
 * `0x5d374`, on an installed controller's steering block. AI code reaches movement only through these requests (A5);
 * request handling applies them in posting order through P3-06's `0x21fd8` (systems/missiles.ts, applySteer) and the
 * generalised `0x21adc` (systems/flight-control.ts), in the same tick.
 *
 * The handlers (the interpreter, the wingman and the base, P3-08/16, 18, 19) call these in an object update with an
 * AiPilot: the scene of rules/steering.ts, the controller's block, the RandSource of the update (the noise routines draw
 * when a block is posted, in posting order) and where to post. A helper posts at most what its original posts; the
 * original's message pool never runs out in Core (CORE_LIMITS.requestsPerTick is a fault instead), so every post the
 * original would make is made.
 */
import { CoreFaultError } from '../errors.ts';
import type { AxisControl, ControlBlock, RequestOf } from '../systems/pipeline.ts';
import type { AiControllerCommon, Entity, EntityId, SteeringBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import type { RandSource } from './original-random.ts';
import {
  axis, computeSteering, controlBlock, float32Argument, rateControl, setSteeringFractions, steerAtTarget, steeringNoise, throttleControl,
  throttleNoise, updateTargetPoint, type AiSteeringScene,
} from './steering.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-piloting.${site}`);

/** A request an AI movement helper posts. */
export type PilotRequest = RequestOf<'steer'> | RequestOf<'ai-match-speed'>;

/** One controller's piloting in an object update: its scene and steering block, the update's draws and its posts. */
export interface AiPilot {
  readonly scene: AiSteeringScene;
  readonly steering: SteeringBlock;
  readonly rand: RandSource;
  post(request: PilotRequest): void;
}

/**
 * The scene of `entity`, an AI craft whose controller is `controller`, in `world` at its clock: its craft record (S+0x08)
 * and the controller limits; a target's record +0x10 is its kind's collision radius after the load (craft §3.5.1), 0 for
 * the map marker (kind 0x2000000); lead mode 5 reads the gun of the subject's current list-0 mount (+0x08).
 */
export function pilotScene(world: WorldState, entity: Entity, controller: AiControllerCommon): AiSteeringScene {
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (craft === undefined || entity.combat.type !== 'craft') throw fault('subject');
  const { weapons } = entity.combat;
  return {
    subject: entity,
    craft,
    limits: controller.limits,
    clock: world.clock,
    resolve: (id) => world.entities.get(id),
    targetRadius: (target) => {
      if (target.combat.type === 'marker') return 0;
      const kind = world.ruleData.craft[target.kindBit];
      if (kind === null || kind === undefined) throw fault('target-record');
      return kind.shape.radius;
    },
    mainWeaponSpeed: () => {
      // 0x2dd38 writes nothing for an empty list, so the original reads a stale stack word: not reachable in the slice.
      const { mount } = weapons.selections[0];
      const record = mount === null ? undefined : craft.mounts[mount];
      if (record === undefined || record.at10 !== 0) throw fault('main-weapon');
      return world.craftInfo.content.guns[record.weapon].at08;
    },
  };
}

/** The pilot of `entity`'s controller (pilotScene) with `rand` and `post`. */
export function aiPilot(world: WorldState, entity: Entity, controller: AiControllerCommon, rand: RandSource, post: AiPilot['post']): AiPilot {
  return { scene: pilotScene(world, entity, controller), steering: controller.steering, rand, post };
}

function postSteer({ scene, post }: AiPilot, control: ControlBlock): void {
  post({ type: 'steer', entityId: scene.subject.id, control });
}

/**
 * `0x5d014`(S): nothing without S+0x0C (false). Otherwise the steering noise, and the throttle noise when CB has the
 * speed flag (which `0x5cd1c` clears), change CB in place, and CB is posted as left (normally by `0x5cd1c`); true.
 */
export function postSteering(pilot: AiPilot): boolean {
  const { steering, rand } = pilot;
  if (!steering.targetValid) return false;
  let control = steeringNoise(steering.steeringNoise, steering.control, rand);
  if (control.speedFactor !== null) control = throttleNoise(steering.throttleNoise, control, rand);
  steering.control = control;
  postSteer(pilot, control);
  return true;
}

/**
 * `0x5d0ec`(S, r1, r2, r3, throttle): a fresh block (S's CB untouched): scale S+0xCC, rows 1–3 set (not cleared) to the
 * three rates, the steering noise; then, unless the throttle is below 0, the speed factor F(throttle × S+0xC8) and the
 * throttle noise. Always posts.
 */
export function postRates(pilot: AiPilot, rates: readonly [number, number, number], throttle: number): void {
  const { steering, rand } = pilot;
  // rateControl writes the factor before the steering noise runs; neither routine reads what the other writes.
  const control = steeringNoise(steering.steeringNoise, rateControl(steering.turnFraction, steering.speedFraction, rates, throttle), rand);
  postSteer(pilot, throttleNoise(steering.throttleNoise, control, rand));
}

/**
 * `0x5d1ac`(S, has1, v1, has2, v2, has3, v3): a fresh block with scale S+0xCC: each row with a value is set to it, each
 * without one (null) is cleared; no speed flag; then the steering noise. Always posts.
 */
export function postAxes(pilot: AiPilot, [first, second, third]: readonly [number | null, number | null, number | null]): void {
  const { steering, rand } = pilot;
  const row = (value: number | null): AxisControl => (value === null ? axis(true, false, 0) : axis(false, true, value));
  const control = controlBlock(steering.turnFraction, [row(first), row(second), row(third)], null);
  postSteer(pilot, steeringNoise(steering.steeringNoise, control, rand));
}

/** `0x5d41c`(S, throttle): a fresh block with only the speed factor F(throttle × S+0xC8), then the throttle noise; posts. */
export function postThrottle(pilot: AiPilot, throttle: number): void {
  const { steering, rand } = pilot;
  postSteer(pilot, throttleNoise(steering.throttleNoise, throttleControl(throttle, steering.speedFraction), rand));
}

/** The scale of the break turn (f32 1.5). */
const BREAK_TURN_SCALE = 1.5;

/** A break turn's row: full deflection away from the computed value, +1.0 when it is ≤ 0, else −1.0. */
function breakAway({ clear, set, value }: AxisControl): AxisControl {
  // 0x5cd1c sets rows 1 and 2 whenever S+0x0C is set, so the original's random-sign branches for an unset row are dead.
  if (!set) throw fault('break-turn');
  return axis(clear, set, value <= 0 ? 1 : -1);
}

/**
 * `0x5d274`(S): nothing without S+0x0C (false). Otherwise `0x5cd1c`, then CB's scale := 1.5 and rows 1 and 2 turn away
 * (breakAway), row 3 as `0x5cd1c` left it; CB is posted without noise; true.
 */
export function postBreakTurn(pilot: AiPilot): boolean {
  const { scene, steering } = pilot;
  if (!steering.targetValid) return false;
  computeSteering(steering, scene);
  const [pitch, yaw, roll] = steering.control.axes;
  steering.control = controlBlock(BREAK_TURN_SCALE, [breakAway(pitch), breakAway(yaw), roll], steering.control.speedFactor);
  postSteer(pilot, steering.control);
  return true;
}

/**
 * `0x5d090`(S, a, lo, hi): nothing without the target handle S+0x10 (false), whether or not it is still valid; otherwise
 * message 0x80000 for the subject and that target with (a, lo, hi), f32; true.
 */
export function postSpeedMatch(pilot: AiPilot, a: number, lo: number, hi: number): boolean {
  const { scene, steering } = pilot;
  if (steering.target === null) return false;
  for (const value of [a, lo, hi]) float32Argument(value);
  pilot.post({ type: 'ai-match-speed', entityId: scene.subject.id, targetEntityId: steering.target, a, lo, hi });
  return true;
}

/** `0x5d080`(S): `0x5d090`(S, 0, 0, 1.0), the player's match. */
export const postTargetSpeedMatch = (pilot: AiPilot): boolean => postSpeedMatch(pilot, 0, 0, 1);

/** A copy of the 0xEC bytes of S that shares nothing the library changes in place. */
const copyBlock = (block: SteeringBlock): SteeringBlock =>
  ({ ...block, throttleNoise: { ...block.throttleNoise }, steeringNoise: { ...block.steeringNoise } });

/**
 * `0x5d374`(S, threat), the evasion: on a copy of S (lead mode 0, offset off, `0x5c768`(1.0, 1.0, 0)) it aims at the
 * threat (`0x5c584`, which also clears the subject's lock level when the threat is not S+0x10), runs `0x5c8b0`, posts
 * the break turn and then full throttle (`0x5d41c`(1.0), with the throttle noise of S), and restores the subject's +0x8C
 * to its target at entry (null when that no longer resolved). S itself is unchanged. Returns the break turn's result.
 *
 * The copy keeps the sample of S+0x14, so when `0x5c8b0` already ran on S in this sample the copy's runs at once and the
 * break turn is computed from the current target's view, not the threat's (A7; P3-02 CR-24 decision 6).
 */
export function evade(pilot: AiPilot, threat: EntityId | null): boolean {
  const { scene, steering } = pilot;
  const { subject } = scene;
  const entry = subject.ai.objectTarget;
  const restored = entry !== null && scene.resolve(entry) !== undefined ? entry : null;
  const copy = copyBlock(steering);
  copy.leadMode = 0;
  copy.offset = Object.freeze({ ...copy.offset, enabled: false });
  setSteeringFractions(copy, scene.craft, 1, 1, false);
  steerAtTarget(copy, scene, threat);
  updateTargetPoint(copy, scene);
  const copied: AiPilot = { ...pilot, steering: copy };
  const result = postBreakTurn(copied);
  postThrottle(copied, 1);
  subject.ai.objectTarget = restored;
  return result;
}
