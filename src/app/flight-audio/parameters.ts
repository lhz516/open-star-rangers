import type { HitEvent, ShotFiredEvent, Vec3 } from '../../core/contracts/domain-events.ts';
import type { MotionPlayer, MotionReady, NotImplementedPartition } from '../../core/projections/projection.ts';
import type { RenderEntity } from '../../core/projections/render-state.ts';
import type { Matrix3 } from '../../core/world/entity-table.ts';
import { AUDIO_RATE_LIMIT, type VoiceParameters } from '../../platform/audio/audio-controller.ts';

// The flight sounds' playback parameters (P3-14 S-05, AC-06; subtask 13): the original's laws from
// docs/original/formats/audio.md, "Non-player sources (A-04)" (`0x55984`) and "Player sources and the engine (A-05)"
// (`0x55d20`), turned into the audio controller's integer parameters. The listener is P3-12's tick-end camera in every
// view (D-02, DW-05, D2-04); a source is read from its movement block (position, third row, speed), never from a
// difference of positions, so a placement-serial change or a collapsed frame cannot make up a speed.
//
// Arithmetic follows the original's f32 stores (`Math.fround`); its x87 runs at 53-bit precision, so the unstored
// intermediates are JavaScript doubles. Every float-to-integer conversion truncates toward zero (`0x74518`), and the
// game's setters clamp volume and pan to 0–127 and the rate to 0–44,100 Hz (A-09). Each result holds only what the
// original sets on that pass, in the controller's `Partial<VoiceParameters>`: an absent value keeps the voice's
// current one, or the start value (volume 127, pan 64, the stored rate) when the result is the voice's initial
// parameters, which the controller applies before the voice starts.
//
// Where the original's FPU traps (control word 0x1272; reaction not traced), a source at the camera's position, a zero
// record maximum and no player entity skip the rate update (D1-06); a game rate below 1 Hz is given as 1 Hz (A-09,
// D1-13), which is also the controller's floor. Any other bad input throws a `FlightSoundParameterError`.

/** A sound's listener on one tick: the camera's position and Core's rows (0 right, 1 up, 2 forward). */
export interface AudioListener {
  readonly camera: { readonly position: Vec3; readonly rows: Matrix3 };
  /** The player's current speed (movement block +0x08, runtime units/s); null without a player entity. */
  readonly playerSpeed: number | null;
}

/** A non-player source as its movement block holds it: runtime units, the third orientation row and units/s. */
export interface SourceReading {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly speed: number;
}

/**
 * Why an input is refused: a non-finite number, a motion group not yet implemented, a missing field (a snapshot without
 * a speed, a ready motion group without its player entry), a listed entity of another ID, or values whose f32 store or
 * integer conversion would trap in the original.
 */
export type FlightSoundParameterFailure = 'non-finite' | 'not-implemented' | 'missing-field' | 'entity-mismatch' | 'out-of-range';

/** A parameter input breaks its contract; `path` names the input, never its value. */
export class FlightSoundParameterError extends Error {
  readonly failure: FlightSoundParameterFailure;
  readonly path: string;

  constructor(failure: FlightSoundParameterFailure, path: string) {
    super(`Flight sound parameter input ${path}: ${failure}`);
    this.name = 'FlightSoundParameterError';
    this.failure = failure;
    this.path = path;
  }
}

/** The start values (`0x53bf0`): volume 127 and pan 64 at the stored rate, which a player's sound keeps (A-05). */
export const START_PARAMETERS: Partial<VoiceParameters> = Object.freeze({ volume: 127, pan: 64 });

const MAX_LEVEL = 127;
/** A-04's constants as the EXE holds them (f64). */
const AUDIBLE_DISTANCE = 3800;
const VOLUME_SCALE = 0.0334213428695565;
const RATE_GATE = 1e-6;
const RATE_OFFSET = 800;
const RATE_SCALE = 0.00125;
const RATE_BASE = 11025;
const PROJECTABLE_LENGTH = 1e-6;
/** A-05's constants. */
const ENGINE_THRESHOLD = 1;
const ENGINE_SCALE = 16000;
const ENGINE_BASE = 3000;

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

type Row = readonly [number, number, number];

const row = (rows: Matrix3, k: 0 | 1 | 2): Row => [rows[3 * k], rows[3 * k + 1], rows[3 * k + 2]];
/** (v.y r.y + v.z r.z) + v.x r.x: the original's order of a dot product, before any f32 store. */
const dotSum = (v: Vec3, [x, y, z]: Row): number => v.y * y + v.z * z + v.x * x;

/** Truncation toward zero (`0x74518`); the integer store traps outside 32 bits. */
function truncate(value: number, path: string): number {
  const integer = Math.trunc(value);
  if (!(integer >= INT32_MIN && integer <= INT32_MAX)) throw new FlightSoundParameterError('out-of-range', path);
  return integer;
}

/** An f32 store, which traps on overflow. */
function store(value: number, path: string): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw new FlightSoundParameterError('out-of-range', path);
  return stored;
}

const clamp = (value: number, high: number): number => Math.min(Math.max(value, 0), high);

/** |y| + |x| + |z|, the original's order of a Manhattan length, before its f32 store. */
const manhattan = (x: number, y: number, z: number): number => Math.abs(y) + Math.abs(x) + Math.abs(z);

/** The game's rate setter (clamp 0–44,100) and the mixer's floor of 1 Hz. */
const gameRate = (integer: number): number => Math.max(1, clamp(integer, AUDIO_RATE_LIMIT));

function finite(value: number, path: string): void {
  if (!Number.isFinite(value)) throw new FlightSoundParameterError('non-finite', path);
}

function finiteVec(v: Vec3, path: string): void {
  finite(v.x, `${path}.x`);
  finite(v.y, `${path}.y`);
  finite(v.z, `${path}.z`);
}

function checkListener({ camera, playerSpeed }: AudioListener): void {
  finiteVec(camera.position, 'listener.camera.position');
  camera.rows.forEach((value, i) => {
    if (!Number.isFinite(value)) throw new FlightSoundParameterError('non-finite', `listener.camera.rows[${i}]`);
  });
  if (playerSpeed !== null) finite(playerSpeed, 'listener.playerSpeed');
}

function checkSource({ position, forward, speed }: SourceReading): void {
  finiteVec(position, 'source.position');
  finiteVec(forward, 'source.forward');
  finite(speed, 'source.speed');
}

/**
 * The listener of one tick: `camera` is P3-12's `afterStep` camera of that tick (DW-05), `motion` the same tick's
 * `projection.flight.motion`. A motion group not yet implemented is a missing input, not the absence of a player.
 */
export function audioListener(camera: AudioListener['camera'], motion: MotionReady | NotImplementedPartition): AudioListener {
  if (motion.readiness !== 'ready') throw new FlightSoundParameterError('not-implemented', 'projection.flight.motion');
  if (motion.player === undefined) throw new FlightSoundParameterError('missing-field', 'projection.flight.motion.player');
  const listener: AudioListener = Object.freeze({ camera, playerSpeed: motion.player === null ? null : motion.player.speed });
  checkListener(listener);
  return listener;
}

/** A listed entity's current reading: Render State's position, orientation row 2 (indices 6–8) and speed (FA-04). */
export function entityReading({ position, orientation, speed }: RenderEntity): SourceReading {
  return Object.freeze({ position, forward: Object.freeze({ x: orientation[6], y: orientation[7], z: orientation[8] }), speed });
}

/**
 * A one-shot sound's source reading (D1-04, DW-05): the source's entity in the tick's Render State when it is still
 * listed there (`current`, null otherwise), else the event's snapshot taken when the event was emitted.
 */
function oneShotReading(id: number, current: RenderEntity | null, position: Vec3, forward: Vec3, speed: number | null, path: string): SourceReading {
  if (current !== null) {
    if (current.id !== id) throw new FlightSoundParameterError('entity-mismatch', `${path}EntityId`);
    return entityReading(current);
  }
  if (speed === null) throw new FlightSoundParameterError('missing-field', `${path}Speed`);
  return Object.freeze({ position, forward, speed });
}

/** The shooter's reading for a shot's sound. */
export const shotReading = (event: ShotFiredEvent, current: RenderEntity | null): SourceReading =>
  oneShotReading(event.shooterEntityId, current, event.shooterPosition, event.shooterForward, event.shooterSpeed, 'shot-fired.shooter');

/** The victim's reading for a hit's sound; a parked victim has no speed and no hit sound. */
export const hitReading = (event: HitEvent, current: RenderEntity | null): SourceReading =>
  oneShotReading(event.victimEntityId, current, event.victimPosition, event.victimForward, event.victimSpeed, 'hit.victim');

/**
 * A non-player source's parameters (`0x55984`, A-04): volume from the Manhattan distance; when audible, the rate from
 * the radial relative speed and the pan from the direction on the camera's row-1 plane. Out of range only the volume
 * (0) is set; the rate is kept while the source's and the camera's forward rows are within 1e−6 of perpendicular.
 */
export function nonPlayerParameters(listener: AudioListener, source: SourceReading): Partial<VoiceParameters> {
  checkListener(listener);
  checkSource(source);
  const { camera: { position: c, rows }, playerSpeed } = listener;
  const { position: p, forward: f, speed } = source;

  // Δ = C − P: Δy is stored before the sum, Δx and Δz enter it unstored; all three are stored for the rate.
  const dx = c.x - p.x;
  const dy = Math.fround(c.y - p.y);
  const dz = c.z - p.z;
  const distance = store(manhattan(dx, dy, dz), 'distance');
  const level = Math.fround(AUDIBLE_DISTANCE - distance);
  if (level <= 0) return Object.freeze({ volume: 0 });
  const volume = clamp(Math.trunc(level * VOLUME_SCALE), MAX_LEVEL);
  const pan = panOf(rows, c, p);

  const r2 = row(rows, 2);
  const alignment = dotSum(f, r2);
  // D1-06: the original divides by zero at the camera's position and reads a null player; the rate is kept.
  if (!(alignment > -RATE_GATE && alignment < RATE_GATE) && distance !== 0 && playerSpeed !== null) {
    const inverse = Math.fround(1 / distance);
    const unit = (delta: number): number => Math.fround(Math.fround(delta) * inverse);
    const ux = unit(dx);
    const uy = unit(dy);
    const uz = unit(dz);
    // V = R2ₛ·sₛ − R2·sₚ with each product and difference stored, except that Δ's y product enters unstored.
    const vx = Math.fround(Math.fround(f.x * speed) - Math.fround(r2[0] * playerSpeed));
    const vy = Math.fround(f.y * speed - Math.fround(r2[1] * playerSpeed));
    const vz = Math.fround(Math.fround(f.z * speed) - Math.fround(r2[2] * playerSpeed));
    const radial = store(vy * uy + vz * uz + vx * ux, 'radial');
    const rate = gameRate(truncate((radial + RATE_OFFSET) * RATE_SCALE * RATE_BASE, 'rate'));
    return Object.freeze({ volume, rate, pan });
  }
  return Object.freeze({ volume, pan });
}

/**
 * The pan (`0x40d44` on plane 1 with the Manhattan length, then `0x55984`): the source's offset with its camera row-1
 * component removed, normalised, against row 0; 64 when that offset is within 1e−6 of zero.
 */
function panOf(rows: Matrix3, camera: Vec3, p: Vec3): number {
  const r1 = row(rows, 1);
  // `0x40c90`'s plane offset −f32(R1 · C), then h = f32(R1 · P + offset).
  const height = Math.fround(dotSum(p, r1) - Math.fround(dotSum(camera, r1)));
  const inPlane = (r: number, pk: number, ck: number): number => Math.fround(Math.fround(Math.fround(-height * r) + pk) - ck);
  const q = { x: inPlane(r1[0], p.x, camera.x), y: inPlane(r1[1], p.y, camera.y), z: inPlane(r1[2], p.z, camera.z) };
  const length = store(manhattan(q.x, q.y, q.z), 'pan');
  if (length > -PROJECTABLE_LENGTH && length < PROJECTABLE_LENGTH) return 64;
  const inverse = 1 / length;
  const unit = { x: Math.fround(q.x * inverse), y: Math.fround(q.y * inverse), z: Math.fround(q.z * inverse) };
  const across = store(dotSum(unit, row(rows, 0)), 'pan');
  return clamp(Math.trunc((1 + across) * 0.5 * MAX_LEVEL), MAX_LEVEL);
}

/**
 * The player's engine (`0x55d20`, A-05) from its commanded speed c and its craft record's maximum M: below 1 unit/s
 * volume 0 with the rate kept; otherwise volume 127 and the rate trunc(c / M × 16,000) + 3,000 Hz.
 */
export function engineParameters(player: Pick<MotionPlayer, 'commandedSpeed' | 'recordMaximumSpeed'>): Partial<VoiceParameters> {
  const { commandedSpeed, recordMaximumSpeed } = player;
  finite(commandedSpeed, 'player.commandedSpeed');
  finite(recordMaximumSpeed, 'player.recordMaximumSpeed');
  if (commandedSpeed < ENGINE_THRESHOLD) return Object.freeze({ volume: 0 });
  // D1-06: a zero maximum divides by zero in the original; the rate is kept.
  if (recordMaximumSpeed === 0) return Object.freeze({ volume: MAX_LEVEL });
  const term = truncate((commandedSpeed / recordMaximumSpeed) * ENGINE_SCALE, 'engine rate');
  // The integer addition wraps like the original's 32-bit add.
  return Object.freeze({ volume: MAX_LEVEL, rate: gameRate((term + ENGINE_BASE) | 0) });
}
