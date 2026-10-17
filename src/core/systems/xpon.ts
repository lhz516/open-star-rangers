/**
 * Kind 0x4000, the transponder (Xpon) of P3-08 (docs/plan/p3/02/spec.md, CR-20 to CR-23; docs/original/formats/
 * executable.md, X1–X6): the `drop-transponder` command (the original's `b`, Likely normal play, X5), the constructor
 * `0x38780` that its `create-transponder` request runs in request handling, and the kind callback `0x3897c` that
 * pipeline.ts runs in place of the generic craft callback, with no AI and no Warp-transit check, before the generic
 * part `0x20ae4`.
 *
 * The callback reuses object +0x14 (TransponderState.callback): a `b` transponder created active starts at
 * `first-update`, whose first callback in states 0–3 starts the tumble (two draws) and stores the clock F₀ (`tumbling`);
 * the first callback in state 7 whose clock is strictly past F₀ + 0x80 settles it (`none`): it decelerates to rest and
 * spins about row 2 for the rest of its life. Any other callback in states 0–3 holds (the same spin), and states 5 and 6
 * drop a pending settle. Everything steers through P3-06's float control path `0x21fd8`, called directly, not through a
 * request; its gate (a block, a craft record, no lock) leaves a parked transponder still and undrawn.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { resourceArithmetic } from '../rules/combat-init.ts';
import { applyFloatControl, type FloatControl } from '../rules/flight-control.ts';
import { craftMovementBlock, speedRatio, THROTTLE_TABLE } from '../rules/flight-state.ts';
import { RAND_SCALE, RandStream, type RandSource } from '../rules/original-random.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import {
  allocatorFlightState, blankCraftCombat, TRANSPONDER_KIND_BIT,
  type CraftCombat, type Entity, type Matrix3, type ObjectState, type SteeredMovementBlock, type TransponderState,
} from '../world/entity-table.ts';
import { transponderModel } from '../world/rule-data.ts';
import type { WorldState } from '../world/world-state.ts';
import { combatCommandPlayer, emitCommandResult, type CommandOf } from './commands.ts';
import { emit, type TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `xpon.${site}`);

/** Clock units from the tumble's start F₀ past which the first state-7 callback settles it (X3: u32 add, unsigned strict). */
const TUMBLE_DURATION = 0x80;

/** `0x3060c`(new, record, 100, 0, 0) (D13): the energy percentage; the shield and charge percentages are 0. */
const ENERGY_PERCENT = 100;
/** The first energy update comes 0x80 + rand % 64 clock units after the clock (D13). */
const FIRST_ENERGY_DELAY = 0x80;
const ENERGY_DELAY_RANGE = 64;

/** X2 step 7, f64 `0x171418` and `0x171420`: one unit along −row 2 and fifteen along −row 3. */
const OFFSET_ROW_2 = -1;
const OFFSET_ROW_3 = -15;
/** X2 step 8, f64 `0x171428` and `0x171430`: the fraction of the source's speed, and the ratio-to-throttle factor. */
const SPEED_FRACTION = 0.75;
const THROTTLE_PER_RATIO = 128;
const THROTTLE_TABLE_MIDDLE = (THROTTLE_TABLE.length - 1) / 2;

/**
 * X3's tumble value r = F(D(D(D(rand) × K) × −0.2) + −0.8): K is f32 `0x171438`, f32(1 ÷ 32767) (Confirmed, code,
 * P3-08/06: the value Ghidra reads there), −0.2 and −0.8 the f64 `0x17143c` and `0x171444`; so r lies in [−1, −0.8] and
 * the rate it sets is 0.8 to 1 of the craft rate.
 */
const TUMBLE_SPAN = -0.2;
const TUMBLE_BASE = -0.8;

const ACCEPTED = Object.freeze({ outcome: 'accepted', reason: null } as const);

/** The states 0–3 of the callback table (X3). */
const FIRST_STATES: ReadonlySet<ObjectState> = new Set(['new', 'presentation-ready', 'awaiting-presentation']);
/** States 5 and 6, in which `0x20ae4` frees a non-zero +0x14. */
const LEAVING_STATES: ReadonlySet<ObjectState> = new Set(['area-switch', 'pending-removal']);

/** CB := {scale 1.0; row 2 set, value 1.0; speed flag 1, factor 0}: the hold, a yaw at the craft rate and speed 0. */
const HOLD: FloatControl = Object.freeze({ scale: 1, axes: Object.freeze({ pitch: null, yaw: 1, roll: null }), speedFactor: 0 });
/** The settle: the hold, and pitch and roll set to 0. */
const SETTLE: FloatControl = Object.freeze({ ...HOLD, axes: Object.freeze({ ...HOLD.axes, pitch: 0, roll: 0 }) });
const NO_CALLBACK = Object.freeze({ phase: 'none' } as const);
const FIRST_UPDATE = Object.freeze({ phase: 'first-update' } as const);

/** The craft record of kind bit `kindBit`, which world creation binds for the player and kind 0x4000 (D-01, CR-15). */
function craftRecord(world: WorldState, kindBit: number): CraftRecord {
  const record = world.craftInfo.content.craft[kindBit];
  if (record === undefined) throw fault('record');
  return record;
}

/** `entity`'s block as the float path reads it: a steered one, or none. */
function steeredBlock(entity: Entity): SteeredMovementBlock | null {
  const block = entity.movement;
  if (block === null || block.mode === 'craft' || block.mode === 'warp') return block;
  throw fault('block');
}

/** Runs `use` with a rand source on the world's generator, one RNG step per value. */
function withWorldRand<Result>(world: WorldState, use: (rand: RandSource) => Result): Result {
  const rand = new RandStream(world.rngState);
  const result = use(rand);
  world.rngState = rand.state;
  return result;
}

/**
 * Judges `drop-transponder` (CR-20): the common pre-judgement of the flight commands (CR-05; combatCommandPlayer), then
 * accepted with no count, energy, cooldown or state gate (X2), posting one `create-transponder` for the player.
 */
export function judgeDropTransponder(context: TickContext, command: CommandOf<'drop-transponder'>, commandIndex: number): void {
  const player = combatCommandPlayer(context);
  if (typeof player === 'string') {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: player });
    return;
  }
  emitCommandResult(context, command, commandIndex, ACCEPTED);
  context.requests.post({ type: 'create-transponder', entityId: player.id });
}

/**
 * `0x3060c`(new, record, 100, 0, 0) on a blank craft combat state (D13): energy full, shield and charge 0 at levels 0,
 * the spare and full-speed power, the energy clocks with one draw. The hull, subsystems and weapon block stay the
 * allocator's: hull 0, no mounts on a kind-14 record (X2 step 4).
 */
function transponderCombat(craft: CraftRecord, clock: number, rand: RandSource): CraftCombat {
  const combat = blankCraftCombat();
  const { resources, steps } = resourceArithmetic(craft, ENERGY_PERCENT, 0, combat.shieldLevel, combat.chargeLevel);
  if (!steps.every((step) => toInt32(step) === step)) throw fault('resources');
  Object.assign(combat, resources, { charge: 0 });
  const nextEnergyClock = clock + FIRST_ENERGY_DELAY + (rand.next() % ENERGY_DELAY_RANGE);
  if (!Number.isSafeInteger(nextEnergyClock)) throw new CoreFaultError('budget-exhausted', 'xpon.energy-clock');
  combat.lastEnergyClock = clock;
  combat.nextEnergyClock = nextEnergyClock;
  return combat;
}

/** X2 step 7 on axis k: p := F(D(F(D(p + F(R2 × −1.0))) + F(D(R3 × −15.0)))). */
const offsetAxis = (position: number, row2: number, row3: number): number =>
  Math.fround(Math.fround(position + Math.fround(row2 * OFFSET_ROW_2)) + Math.fround(row3 * OFFSET_ROW_3));

function offsetPosition({ x, y, z }: Vec3, orientation: Matrix3): Vec3 {
  return Object.freeze({
    x: offsetAxis(x, orientation[3], orientation[6]),
    y: offsetAxis(y, orientation[4], orientation[7]),
    z: offsetAxis(z, orientation[5], orientation[8]),
  });
}

/**
 * X2 steps 8 and 9: the throttle t := chop(D(D(D(v × 0.75) ÷ D(F(new +0x78))) × 128.0)) from the source's speed v (0
 * without a block), replacing the old-ratio throttle of `0x218e8`, then `0x21794`'s mode-0 block at t. A throttle beyond
 * i32 or a table index outside the table is a fault (CR-20), not the clamp of P3-06's commands.
 */
function transponderBlock(sourceSpeed: number, maximumSpeed: number, baseMaximumSpeed: number): SteeredMovementBlock {
  const throttle = Math.trunc(((sourceSpeed * SPEED_FRACTION) / maximumSpeed) * THROTTLE_PER_RATIO) + 0;
  const index = THROTTLE_TABLE_MIDDLE + Math.floor(throttle / 2);
  if (toInt32(throttle) !== throttle || index < 0 || index >= THROTTLE_TABLE.length) throw fault('throttle');
  return craftMovementBlock(throttle, maximumSpeed, baseMaximumSpeed);
}

/**
 * The constructor `0x38780`(source) (X2; CR-20), shared by the player's `b` (`creator` `player`) and a wingman's drop
 * (`wingman`, from its parked step, P3-08/21): kind 0x4000 with no source, name, side, interaction, rule inputs, AI,
 * formation or Warp, the model kind 14 is bound to, and `0x3060c`'s resources (one draw). It follows the source's
 * activity: an active source gives an active transponder with a block, any other a parked one without. Its pose is the
 * source's rows and the X2 offset behind the source; a source with a block also has that block's speed ratio refreshed
 * (`0x218e8`, X2 step 6). The parked-update clock is the creation clock (X4: its initial value is unobservable). Emits
 * nothing; the request handler reports an active creation.
 */
export function constructTransponder(context: TickContext, source: Entity, creator: 'player' | 'wingman'): Entity {
  const { world } = context;
  const craft = craftRecord(world, TRANSPONDER_KIND_BIT);
  const model = transponderModel(world.setup);
  if (model === null) throw fault('model');
  const combat = withWorldRand(world, (rand) => transponderCombat(craft, world.clock, rand));
  const maximumSpeed = craft.atB8;
  const sourceBlock = steeredBlock(source);
  if (sourceBlock !== null) sourceBlock.speedRatio = speedRatio(sourceBlock.speed, craftRecord(world, source.kindBit).atB8);
  const active = source.activity === 'active';
  return world.entities.allocate({
    kindBit: TRANSPONDER_KIND_BIT,
    source: null,
    name: { type: 'none' },
    side: null,
    baseInteraction: false,
    presentation: { type: 'model', model },
    position: offsetPosition(source.position, source.orientation),
    orientation: source.orientation,
    activity: active ? 'active' : 'parked',
    ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 },
    maximumSpeed,
    lastParkedUpdateClock: world.clock,
    ...allocatorFlightState(),
    movement: active ? transponderBlock(sourceBlock?.speed ?? 0, maximumSpeed, craft.atB8) : null,
    combat,
    transponder: { creator, callback: active ? FIRST_UPDATE : NO_CALLBACK },
  });
}

/**
 * Message 0x200000 in request handling (`0x2148b`; CR-21): constructs the player's transponder behind `player` and, for
 * an active one, emits `transponder-deployed` (CR-22), the cue of the original's creation item and sound 10055.
 */
export function createTransponder(context: TickContext, player: Entity): void {
  const transponder = constructTransponder(context, player, 'player');
  if (transponder.activity !== 'active') return;
  emit(context, {
    type: 'transponder-deployed',
    tick: context.time.tick,
    entityId: transponder.id,
    creatorEntityId: player.id,
    position: transponder.position,
    orientation: transponder.orientation,
  });
}

/** r of the tumble (X3), one draw. */
const tumbleValue = (rand: RandSource): number => Math.fround(rand.next() * RAND_SCALE * TUMBLE_SPAN + TUMBLE_BASE);

/** `0x21fd8` on the transponder with the kind-14 record (object +0x1C); a disturbance draws after the caller's draws. */
function steer(world: WorldState, entity: Entity, control: FloatControl, rand: RandSource): void {
  applyFloatControl(steeredBlock(entity), craftRecord(world, entity.kindBit), entity.maximumSpeed, control, rand);
}

/**
 * The kind callback `0x3897c` (X3) without the generic part `0x20ae4`, which the caller runs after it: by state and
 * +0x14, the tumble, the hold, the settle, or dropping the callback state on leaving; nothing otherwise.
 */
export function updateTransponder(context: TickContext, entity: Entity, transponder: TransponderState): void {
  const { world } = context;
  const { callback } = transponder;
  if (FIRST_STATES.has(entity.state)) {
    if (callback.phase !== 'first-update') {
      withWorldRand(world, (rand) => steer(world, entity, HOLD, rand));
      return;
    }
    transponder.callback = Object.freeze({ phase: 'tumbling', since: world.clock });
    withWorldRand(world, (rand) => {
      // Row 3 is drawn first, then row 1.
      const roll = tumbleValue(rand);
      const pitch = tumbleValue(rand);
      steer(world, entity, { scale: 1, axes: { pitch, yaw: null, roll }, speedFactor: null }, rand);
    });
    return;
  }
  if (entity.state === 'active') {
    if (callback.phase === 'tumbling' && world.clock > callback.since + TUMBLE_DURATION) {
      transponder.callback = NO_CALLBACK;
      withWorldRand(world, (rand) => steer(world, entity, SETTLE, rand));
    }
    return;
  }
  if (LEAVING_STATES.has(entity.state)) transponder.callback = NO_CALLBACK;
}
