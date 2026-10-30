import type { TickOutput } from '../../app/runtime/game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import type { GameRunSpec, GameSessionFrame, GameSessionRun } from '../../app/session/game-session.ts';
import { current, sessionSetup } from '../../app/session/game-session.test-support.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { missile, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { readRuleDataContent } from '../../content/rule-data/rule-data-payload.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { Projection } from '../../core/projections/projection.ts';
import type { RenderState } from '../../core/projections/render-state.ts';
import type { Recording } from '../../core/replay/recording.ts';
import type { RandStream } from '../../core/rules/original-random.ts';
import {
  aiProgramsContent, commMessagesContent, craftInfoContent, declaration, missionFrame, worldInput,
} from '../../core/world/create-world.test-support.ts';
import { createDestructionCamera } from '../flight/presentation/destruction-camera/destruction-camera.ts';
import { createPresentationEffects } from '../flight/presentation/effects/presentation-effects.ts';
import { createFlightPresentation, presentationRandom, type FlightPresentation } from '../flight/presentation/flight-presentation.ts';
import type { PresentationCamera } from '../flight/presentation/presentation-contract.ts';
import { presentationContent } from '../flight/presentation/presentation.test-support.ts';
import { RUN_SETTINGS } from '../flight/renderer/flight-run.test-support.ts';
import { backPlane } from '../flight/scene/projection.ts';
import { createCockpitRun, type CockpitContent, type CockpitRun } from './composition/cockpit-run.ts';
import { syntheticCockpitContent, syntheticCockpitCopy } from './composition/cockpit-run.test-support.ts';
import type { CockpitTick } from './presentation/cockpit-contract.ts';
import { syntheticModel } from './target-display/target-display.test-support.ts';

// The real chain for P3-13/26 (docs/plan/p3/13/spec.md, AC-01, AC-03, AC-04, AC-13, AC-14; DC-03, DC-04; D-02 DD-05):
// formal Core, Runtime and Session on a ControlledHost, P3-12's presentation module and every real cockpit module, wired
// as wireFlightRun wires them (flight-run.ts): per tick P3-12's module, then the cockpit by the frame's ticks in order,
// from the same host seed. Code-generated synthetic content and inputs only, never original data.

/** Inputs change only at the first tick of a block, where every grouping below starts a frame. */
export const BLOCK = 5;
/** Past every scripted change: the zero-length reply, the lock, the map, the wingman's Warp and the player's. */
export const TICKS = 200;
const HOST_SEED = 0x2468_ace1;
const WORLD_SEED = 0x1234;

/** Ticks per frame: one, five, and 2 + 0 + 3 for every block (AC-03). */
export const GROUPINGS = {
  '1×5': Array.from({ length: TICKS }, () => 1),
  '5': Array.from({ length: TICKS / BLOCK }, () => BLOCK),
  '2+0+3': Array.from({ length: TICKS / BLOCK }, () => [2, 0, 3]).flat(),
} satisfies Record<string, readonly number[]>;
export const GROUPING_NAMES = Object.keys(GROUPINGS) as (keyof typeof GROUPINGS)[];

const frames = (...frameDurations: number[]) => ({ present: true, frameDurations });
const open: Command = { type: 'communications', operation: 'open' };
const digit = (value: number): Command => ({ type: 'select-number', value });

/** Each block's commands and fire, given before the frame that runs its first tick, keyed by that tick. */
const SCRIPT: Readonly<Record<number, { readonly commands: readonly Command[]; readonly primaryFire?: boolean }>> = {
  1: { commands: [{ type: 'target', operation: 'enemy' }] },
  // Missiles: the lock on the target ahead runs through its levels.
  6: { commands: [{ type: 'select-missile', direction: 'next' }] },
  // The energy page, the damage report.
  11: { commands: [{ type: 'energy', operation: 'open' }] },
  16: { commands: [{ type: 'damage-report' }] },
  // The menu, the wingman (key 1), attack (code 1): its reply plays for two eighths.
  21: { commands: [open, digit(1), digit(1)] },
  // The menu, the base (key 2), its status (key 1): a reply of zero length, which starts and ends in one tick.
  41: { commands: [open, digit(2), digit(1)] },
  56: { commands: [], primaryFire: true },
  91: { commands: [], primaryFire: false },
  // The map: opened, a destination near the far hostiles, closed.
  101: { commands: [{ type: 'toggle-map' }] },
  106: { commands: [{ type: 'map-point', operation: 'select', right: 350.5 / 400, down: 350.5 / 400 }] },
  111: { commands: [{ type: 'toggle-map' }] },
  // The base, then the wingman as the target; the wingman to the destination (code 6, a Warp departure), which clears
  // the player's target with cause `warp`.
  116: { commands: [{ type: 'target', operation: 'friendly' }, { type: 'target', operation: 'previous' }] },
  121: { commands: [open, digit(1), digit(6)] },
  // The player's own Warp: view 1 and back to 0xC in one tick.
  166: { commands: [{ type: 'request-warp' }] },
};

/**
 * The world, after ai-replay.test.ts's: the player (1) faces two kind-7 hostiles 750 ahead (3, 4) with a friendly base
 * of kind 17 (5) beside it, the wingman (2) is roster entry 0, two kind-8 hostiles wait far away. A kind-16 craft
 * without shield or hull stands in the player and dies in their collision at tick 2, which damages the player's hull
 * (its shield capacity is 50) and so a subsystem. The hostiles also carry missiles, so one comes at the player (the
 * type-9 warning); the player carries a fixed gun and four missiles. The base's status reply has a frame of length 0;
 * every wingman reply two eighths.
 */
function scenarioInput(mapGeometry: CockpitContent['mapGeometry']) {
  const info = craftInfoContent();
  Object.assign(info.guns[0], { at08: 100, at24: 3200, at2C: 3 });
  Object.assign(info.guns[1], { at08: 2000, at14: 8, at18: 5, at1C: 400, at24: 160, at28: 0 });
  info.missiles[1] = missile({
    body: 1, at18: 1, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0, at44: 320, at48: 32, at4C: 10, at54: 0, at58: 4,
    at5C: 800, at60: 4, at64: 20,
  }) as never;
  Object.assign(info.missileBodies[1], { atB8: 640, atBC: 640, atC0: 640 });
  const missiles = () => mount({ at10: 1, weapon: 1, at0C: 4 });
  for (const kindBit of [1, 7, 8]) Object.assign(info.craft[kindBit], { mounts: [mount({ weapon: 0, at20: 0, at34: 0 }), missiles()], mountLists: [[0], [1], []] });
  Object.assign(info.craft[0], {
    pairs: [{ at00: 1_000_000, at04: 1 }], at74: 100, at9C: 400, atA8: 1, at5C: 50,
    mounts: [mount({ weapon: 1, at20: 0, at34: 0 }), missiles()], mountLists: [[0], [1], []],
  });
  Object.assign(info.craft[16], { at5C: 0, at9C: 1 });
  const aiPrograms = aiProgramsContent();
  Object.assign(aiPrograms.entries[0], { at10: 800, at14: 400 });
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 400 } }),
    declaration(2, { craftType: 7, position: { x: 160, y: 200, z: 400 } }),
    declaration(3, { craftType: 17, position: { x: 300, y: 200, z: 200 }, nameCandidates: ['base-a'] }),
    declaration(4, { craftType: 8, position: { x: 18_000, y: 18_000, z: 0 } }),
    declaration(5, { craftType: 8, position: { x: 18_060, y: 18_000, z: 0 } }),
    declaration(6, { craftType: 16, position: { x: 100, y: 200, z: 2 } }),
  ];
  const commMessages = commMessagesContent();
  commMessages.faceTables[0] = Array.from({ length: 5 }, () => [frames(3, 9), frames(0)]) as never;
  commMessages.faceTables[2] = Array.from({ length: 5 }, () => Array.from({ length: 0x17 }, () => frames(2))) as never;
  // The map picture checks Core's map geometry against its instruments' map record, so Core gets the cockpit's.
  return worldInput({ mission, craftInfo: info, aiPrograms, commMessages, mapGeometry, run: { wingman: 0, seed: WORLD_SEED } } as never);
}

/** A fresh spec of the scenario, recording a checkpoint every tick. */
function scenarioSpec(): GameRunSpec {
  return { ...scenarioInput(syntheticCockpitContent().mapGeometry), recording: recordingOptions(1), initialTransition: null } as unknown as GameRunSpec;
}

/** The synthetic cockpit content with the run's craft info, whose weapon names the overlay draws. */
function cockpitContentFor(spec: GameRunSpec): CockpitContent {
  const { id, content } = spec.craftInfo as unknown as { readonly id: AssetId; readonly content: unknown };
  return { ...syntheticCockpitContent(), craftInfo: { id, content: readRuleDataContent('craft-info', content).content as CraftInfo } };
}

/** A model for every model of the run (the right display draws its target's). */
const modelsFor = (spec: GameRunSpec) => new Map((spec.models as unknown as readonly { readonly id: AssetId }[]).map(({ id }) => [id, syntheticModel()]));

/** FNV-1a over the items of `items`. */
export function hashOf(items: ArrayLike<number>): string {
  let hash = 0x811c_9dc5;
  for (let at = 0; at < items.length; at++) hash = Math.imul(hash ^ (items[at] & 0xff), 0x0100_0193) >>> 0;
  return `${items.length}:${hash.toString(16)}`;
}

/** What the cockpit shows and keeps after its last processed tick: its schedule, surfaces, message line and map. */
export function cockpitState(cockpit: CockpitRun) {
  const { back, screen } = cockpit.presentation.surfaces();
  return {
    diagnostics: cockpit.diagnostics(),
    layout: cockpit.presentation.layout(),
    surfaces: [hashOf(back.indices), hashOf(back.coverage!), hashOf(screen.indices)],
    message: cockpit.messageLine.snapshot(),
    map: cockpit.mapPicture.drawn(),
  };
}
export type CockpitState = ReturnType<typeof cockpitState>;

/** The Core facts the cockpit reads in one tick's projection (DD-02), and the tick's events. */
export interface TickFacts {
  readonly tick: number;
  readonly page: number | null;
  readonly subsystems: readonly number[] | null;
  readonly lock: CombatPlayer['lock'] | null;
  readonly warnings: { readonly attackerOnTail: boolean; readonly missileIncoming: boolean } | null;
  readonly events: readonly DomainEvent[];
}

type CombatPlayer = NonNullable<Extract<Projection['flight']['combat'], { readonly readiness: 'ready' }>['player']>;

function factsOf({ tick, projection, events }: TickOutput): TickFacts {
  const { combat } = projection.flight;
  const player = combat.readiness === 'ready' ? combat.player : null;
  const communications = projection.communications.readiness === 'ready' ? projection.communications.player : null;
  return {
    tick, page: communications?.page ?? null, subsystems: player?.subsystems ?? null, lock: player?.lock ?? null, warnings: projection.communications.readiness === 'ready' && communications !== null ? projection.communications.warnings : null,
    events: events.map(({ event }) => event),
  };
}

export interface WiringOptions {
  /** Wires the cockpit; false wires P3-12's module alone. */
  readonly cockpit?: boolean;
  /** Adds another frame consumer that reads every tick's lock, target and warnings, as P3-14's sounds would (DD-04). */
  readonly reader?: boolean;
  /** The right display's models; by default one for every model of the run. */
  readonly models?: ReadonlyMap<AssetId, ReturnType<typeof syntheticModel>>;
  /** Changes the cockpit's batch before it is given. */
  readonly tamper?: (ticks: readonly CockpitTick[]) => readonly CockpitTick[];
}

/** P3-12's ticks as its subscribers see them: the camera after the step and the activations. */
export interface FlightRecord {
  readonly tick: number;
  readonly camera: PresentationCamera;
  readonly activations: unknown;
}

/**
 * Wires `run`, held at tick 0, as wireFlightRun does without a renderer: P3-12's module with its effects and destruction
 * camera, and (unless `cockpit` is false) the cockpit from the same host seed, with P3-12's back plane of the synthetic
 * run settings. Each frame the module advances by one tick
 * at a time, then the cockpit by all of the frame's ticks, each with its own output and camera. Every frame's cockpit
 * batch is kept, empty ones included, so a test can process the same ticks again.
 */
export function wire(run: GameSessionRun, spec: GameRunSpec, { cockpit: withCockpit = true, reader = false, models, tamper }: WiringOptions = {}) {
  const initial = run.renderFrame().current;
  const random = presentationRandom(HOST_SEED);
  const content = presentationContent();
  const flight: FlightPresentation = createFlightPresentation({
    ownerId: 1, runId: run.runId, content, initial, random, effects: createPresentationEffects({ content }), destructionCamera: createDestructionCamera(),
  });
  const flightRecords: FlightRecord[] = [];
  flight.subscribe(({ tick, afterStep, activations }) => { flightRecords.push({ tick, camera: afterStep, activations }); });
  const cockpitInput = {
    ownerId: 1, runId: run.runId, content: cockpitContentFor(spec), copy: syntheticCockpitCopy(), seed: HOST_SEED,
    initial: { render: initial, projection: run.projection(), camera: flight.camera() }, models: models ?? modelsFor(spec),
    backPlane: (render: RenderState) => backPlane(RUN_SETTINGS.deviceValues, render.entities), pointer: () => null,
  };
  const cockpit = withCockpit ? createCockpitRun(cockpitInput) : null;
  const batches: CockpitTick[][] = [];
  const facts: TickFacts[] = [];
  run.onFrame((frame: GameSessionFrame) => {
    const ticks: CockpitTick[] = [];
    for (const output of frame.report?.outputs ?? []) {
      flight.advance({ ownerId: 1, runId: run.runId, outputs: [output] });
      ticks.push({ output, camera: flight.camera(), mapRightButton: false });
      facts.push(factsOf(output));
    }
    if (!cockpit) return undefined;
    const batch = tamper ? tamper(ticks) : ticks;
    batches.push([...batch]);
    // As wireFlightRun, a frame without a tick does not call the cockpit.
    if (batch.length > 0) cockpit.presentation.advance({ ownerId: 1, runId: run.runId, ticks: batch });
    return undefined;
  });
  const heard: unknown[] = [];
  if (reader) {
    run.onFrame(({ report }) => {
      for (const { tick, projection } of report?.outputs ?? []) {
        const { flight: { combat }, communications } = projection;
        heard.push({ tick, lock: combat.readiness === 'ready' ? combat.player?.lock : null, warnings: communications.readiness === 'ready' && communications.player !== null ? communications.warnings : null });
      }
      return undefined;
    });
  }
  return { flight, random: random as RandStream, flightRecords, cockpit, cockpitInput, batches, facts, heard };
}
export type Wired = ReturnType<typeof wire>;

/** A new cockpit of the same run input, given `batches` one tick at a time: the reference a grouped run must equal. */
export function oneTickAtATime(wired: Wired, batches: readonly (readonly CockpitTick[])[] = wired.batches): CockpitRun {
  const cockpit = createCockpitRun(wired.cockpitInput);
  for (const tick of batches.flat()) cockpit.presentation.advance({ ownerId: 1, runId: wired.cockpitInput.runId, ticks: [tick] });
  return cockpit;
}

export interface PlayOptions extends WiringOptions {
  /** Wires nothing: Core, Runtime and Session alone. */
  readonly bare?: boolean;
  /** Called before the frame that starts at tick `tick` (after the block's input). */
  readonly beforeFrame?: (tick: number, ticks: number) => void;
  /** Exports the recording after each frame's ticks, before the wiring's consumers see the frame. */
  readonly exportEachFrame?: boolean;
}

/**
 * Starts the scenario, wires it and plays `frames` (ticks per frame) after a first frame that anchors the clock, giving
 * each block's input before the frame that runs its first tick, until the session leaves `running`. The cockpit state
 * is kept at every block end.
 */
export function play(frameSizes: readonly number[], { bare = false, beforeFrame, exportEachFrame = false, ...options }: PlayOptions = {}) {
  const { session, host, errors } = sessionSetup();
  const spec = scenarioSpec();
  session.control({ type: 'start', spec });
  const run = current(session);
  const events: DomainEvent[] = [];
  run.onAny((event) => { events.push(event); });
  let exported: Recording | null = null;
  // Before the wiring's consumers, so the recording of a frame they fail on is kept.
  if (exportEachFrame) run.onFrame(({ report }) => { if (report) exported = run.exportRecording(); });
  const wired = bare ? null : wire(run, spec, options);
  const blockEnds = new Map<number, CockpitState>();
  let now = 0;
  let tick = 0;
  host.deliver(now);
  for (const ticks of frameSizes) {
    if (session.status().phase !== 'running') break;
    if (ticks > 0 && tick % BLOCK === 0) {
      const block = SCRIPT[tick + 1] as (typeof SCRIPT)[number] | undefined;
      if (block?.primaryFire !== undefined) run.setIntent({ axes: NEUTRAL_AXES, primaryFire: block.primaryFire });
      for (const command of block?.commands ?? []) run.submitCommand(command);
    }
    beforeFrame?.(tick + 1, ticks);
    now += ticks * TICK_MS;
    host.deliver(now);
    if (session.status().phase !== 'running') break;
    tick += ticks;
    if (ticks > 0 && tick % BLOCK === 0 && wired?.cockpit) blockEnds.set(tick, cockpitState(wired.cockpit));
  }
  return { session, host, errors, run, spec, events, wired, blockEnds, exported: exported as Recording | null };
}
export type Played = ReturnType<typeof play>;

/** Core's outcome of a run that did not fault: its events as delivered and its recording with a checkpoint every tick. */
export function coreOf({ events, run }: Played) {
  const recording = run.exportRecording();
  if (!recording) throw new Error('Expected a recording');
  return { events, recording };
}
