import type { AssetId } from '../../content/asset-id.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';
import { readRuleDataContent } from '../../content/rule-data/rule-data-payload.ts';
import { gun, missile, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import type { DomainEvent, ExplosionCreatedEvent, PipelineStageName, Vec3 } from '../../core/contracts/domain-events.ts';
import type { MotionPlayer, Projection } from '../../core/projections/projection.ts';
import type { RenderDisplay, RenderEntity, RenderState } from '../../core/projections/render-state.ts';
import { COCKPIT_VIEW_MODE } from '../../core/world/player-state.ts';
import { craftInfoContent, declaration, missionFrame, worldInput } from '../../core/world/create-world.test-support.ts';
import { EXPLOSION_KIND_BIT, type EntityPresentation, type ExplosionVariant, type Matrix3 } from '../../core/world/entity-table.ts';
import { createAudioController } from '../../platform/audio/audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound } from '../../platform/audio/audio-controller.test-support.ts';
import { createCockpitRun, type CockpitRun } from '../../render/cockpit/composition/cockpit-run.ts';
import { syntheticCockpitContent, syntheticCockpitCopy } from '../../render/cockpit/composition/cockpit-run.test-support.ts';
import { syntheticModel } from '../../render/cockpit/target-display/target-display.test-support.ts';
import { createDestructionCamera } from '../../render/flight/presentation/destruction-camera/destruction-camera.ts';
import { createPresentationEffects } from '../../render/flight/presentation/effects/presentation-effects.ts';
import { createFlightPresentation, presentationRandom, type FlightPresentation } from '../../render/flight/presentation/flight-presentation.ts';
import type { CameraPose, PresentationCamera, PresentationTick } from '../../render/flight/presentation/presentation-contract.ts';
import { presentationContent } from '../../render/flight/presentation/presentation.test-support.ts';
import { RUN_SETTINGS } from '../../render/flight/renderer/flight-run.test-support.ts';
import { backPlane } from '../../render/flight/scene/projection.ts';
import type { TickOutput } from '../runtime/game-runtime.ts';
import type { GameRunSpec, GameSessionFrame, GameSessionRun } from '../session/game-session.ts';
import type { SessionCleanup } from '../session/session-host.ts';
import { bindFlightSounds, type FlightSoundContent } from './content.ts';
import { soundPackage } from './content.test-support.ts';
import type { AudioPresentation, AudioPresentationExplosion, AudioPresentationTick, FlightSoundDecision, RunAudio, RunAudioHandle } from './consumer.ts';
import { attachRunAudio } from './consumer.ts';
import { EVENT_SOUNDS } from './events.ts';
import { HUD_CUE_SOUNDS } from './hud-cues.ts';

// Synthetic ports for the run's flight sound consumer (P3-14 subtask 16): a run handle and a presentation module that
// tests drive frame by frame, code-generated tick outputs and presentation ticks holding only what the consumer reads,
// and a real audio controller over the platform's fake capabilities. For the joint tests of subtask 20, P3-12's real
// presentation module wired as wireFlightRun wires it, over a hand-driven run or a formal session. Never original data.

/** The bindings of the synthetic sound package (content.test-support.ts). */
export const CONTENT: FlightSoundContent = (() => {
  const { held, bound } = soundPackage();
  return bindFlightSounds(held, bound);
})();

/** The synthetic craft type table's kinds: the player's model (0, 1), enemy A (7), enemy B with every slot empty (8), the base (17). */
export const KINDS = Object.freeze({ player: 0, friendly: 1, enemy: 7, silent: 8, base: 17 });

export const OWNER = 3;
export const RUN = 5;

export const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
export const IDENTITY: Matrix3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** The camera at the origin looking along +z. */
export const ORIGIN_CAMERA: CameraPose = Object.freeze({ position: at(0, 0, 0), rows: IDENTITY });

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export interface EntitySpec {
  readonly id: number;
  readonly kindBit: number;
  readonly position?: Vec3;
  /** Orientation row 2. */
  readonly forward?: Vec3;
  readonly speed?: number;
  readonly display?: RenderDisplay;
  readonly presentation?: EntityPresentation;
}

/** A listed entity; a craft kind has a model presentation, an explosion its own. */
export function renderEntity({ id, kindBit, position = at(0, 0, 1000), forward = at(0, 0, 1), speed = 0, display = 'shown', presentation }: EntitySpec): RenderEntity {
  const shown = presentation ?? (kindBit === EXPLOSION_KIND_BIT ? { type: 'explosion', variant: 'other' } : { type: 'model', model: 'model/synthetic' as AssetId });
  return {
    id, kindBit, presentation: shown, position, orientation: [1, 0, 0, 0, 1, 0, forward.x, forward.y, forward.z] as unknown as Matrix3,
    placementSerial: 0, hitShimmerStart: null, explosionStart: null, inWarp: false, sourceKindBit: null, display, state: 'active', speed,
  } as RenderEntity;
}

export interface TickSpec {
  readonly tick: number;
  /** Twice the tick by default. */
  readonly clock?: number;
  readonly entities?: readonly EntitySpec[];
  readonly events?: readonly DomainEvent[];
  /** The player's entity, 1 by default. */
  readonly playerId?: number | null;
  readonly viewMode?: number;
  readonly subMode?: number;
  /** The Render State's active area centre, which the presentation effects' area check reads; none by default. */
  readonly activeAreaCentre?: Vec3 | null;
  /** The entity the destruction camera follows; none by default. */
  readonly followedEntityId?: number | null;
  readonly docked?: boolean;
  /** The player's motion entry; null without one. */
  readonly motion?: Partial<MotionPlayer> | null;
}

/** A frozen tick output holding what the consumer and its HUD cues read; the HUD cues stay silent. */
export function tickOutput({ tick, clock = tick * 2, entities = [], events = [], playerId = 1, viewMode = COCKPIT_VIEW_MODE, subMode = 0, activeAreaCentre = null, followedEntityId = null, docked = false, motion = {} }: TickSpec): TickOutput {
  const render = {
    tick, clock, viewMode, observedEntityId: playerId, entities: [...entities].sort((left, right) => left.id - right.id).map(renderEntity),
    warp: null, subMode, followedEntityId, activeAreaCentre, speedShare: 0,
  } as unknown as RenderState;
  const player = motion === null || playerId === null
    ? null
    : { entityId: playerId, position: at(0, 0, 0), orientation: IDENTITY, speed: 0, commandedSpeed: 0, maximumSpeed: 400, recordMaximumSpeed: 400, ...motion };
  const projection = {
    clock: { tick, clock, clockUnitsPerTick: 2 },
    player: { entityId: playerId, viewMode, previousViewMode: viewMode, subMode, interactionContext: 'flight' },
    flight: { motion: { readiness: 'ready', player }, combat: { readiness: 'ready', player: null } },
    communications: {
      readiness: 'ready',
      player: playerId === null ? null : { entityId: playerId, docking: { subState: 0, dockingObject: null, docked } },
      warnings: { missileIncoming: false, attackerOnTail: false },
    },
  } as unknown as Projection;
  return deepFreeze({ tick, clock, render, projection, events: events.map(event => ({ event, commandId: null })) });
}

export interface PresentationSpec {
  readonly explosions?: readonly AudioPresentationExplosion[];
  /** The number of activations; none by default. */
  readonly activations?: number;
  readonly afterStep?: CameraPose;
  readonly ownerId?: number;
  readonly runId?: number;
  /** Tick and clock, by default the output's. */
  readonly tick?: number;
  readonly clock?: number;
}

/** A presentation explosion: `core:<id>` for a Core explosion, `extra:<n>` for a presentation one. */
export function explosion(key: string, { list = 1, item = 0, position = at(0, 0, 1000), forward = at(0, 0, 1), speed = 0 }: {
  readonly list?: 1 | 2 | 3; readonly item?: number; readonly position?: Vec3; readonly forward?: Vec3; readonly speed?: number;
} = {}): AudioPresentationExplosion {
  return deepFreeze({ key: key as AudioPresentationExplosion['key'], selection: { list, item }, position, forward, speed });
}

export function presentationTick(output: TickOutput, { explosions = [], activations = 0, afterStep = ORIGIN_CAMERA, ownerId = OWNER, runId = RUN, tick, clock }: PresentationSpec = {}): AudioPresentationTick {
  return deepFreeze({
    ownerId, runId, tick: tick ?? output.tick, clock: clock ?? output.clock, afterStep, explosions,
    activations: Array.from({ length: activations }, () => ({})) as unknown as AudioPresentationTick['activations'],
  });
}

/** Synthetic domain events: only the fields the consumer reads, cast to their variant. */
export const events = {
  shot: (tick: number, { shooter, kindBit, family = 'gun', position = at(0, 0, 1000), forward = at(0, 0, 1), speed = 0 }: {
    readonly shooter: number; readonly kindBit: number; readonly family?: 'gun' | 'missile'; readonly position?: Vec3; readonly forward?: Vec3; readonly speed?: number | null;
  }): DomainEvent => ({
    type: 'shot-fired', tick, shooterEntityId: shooter, shooterKindBit: kindBit, shooterPosition: position, shooterForward: forward, shooterSpeed: speed, family,
  }) as unknown as DomainEvent,
  hit: (tick: number, { victim, kindBit, shieldWasEmpty = false, position = at(0, 0, 1000) }: {
    readonly victim: number; readonly kindBit: number; readonly shieldWasEmpty?: boolean; readonly position?: Vec3;
  }): DomainEvent => ({
    type: 'hit', tick, victimEntityId: victim, victimKindBit: kindBit, victimPosition: position, victimForward: at(0, 0, 1), victimSpeed: 0,
    cause: 'projectile', shieldWasEmpty, gated: false,
  }) as unknown as DomainEvent,
  retired: (tick: number, entityId: number, kindBit: number): DomainEvent => ({ type: 'object-retired', tick, entityId, kindBit, state: 'pending-removal' }) as unknown as DomainEvent,
  weaponSelected: (tick: number, commandIndex: number | null = 0): DomainEvent =>
    ({ type: 'weapon-selected', tick, entityId: 1, list: 0, index: 0, mount: 0, changed: true, commandIndex }) as unknown as DomainEvent,
  docked: (tick: number): DomainEvent => ({ type: 'docked', tick, playerEntityId: 1, baseEntityId: 9, wingmanEntityId: null, previousViewMode: COCKPIT_VIEW_MODE }) as unknown as DomainEvent,
  explosionStarted: (tick: number, entityId: number, { sourceKindBit = KINDS.enemy, variant = 'other', position = at(0, 0, 1000) }: ExplosionFacts = {}): DomainEvent =>
    ({ type: 'explosion-started', tick, entityId, sourceEntityId: 2, sourceKindBit, variant, position, activationClock: tick * 2 }) as unknown as DomainEvent,
  /** Built in the collision stage: its first callback, and so its `explosion-started`, is in the next tick. */
  explosionCreated: (tick: number, entityId: number, { sourceKindBit = KINDS.enemy, variant = 'other', position = at(0, 0, 1000), velocity = at(0, 0, 0) }: ExplosionFacts & { readonly velocity?: Vec3 } = {}): DomainEvent =>
    ({ type: 'explosion-created', tick, entityId, sourceEntityId: 2, sourceKindBit, variant, stage: 'collision' satisfies ExplosionCreatedEvent['stage'], position, velocity }) as unknown as DomainEvent,
  /** A switch in `stage`, with the player's pose at it. */
  viewSwitched: (tick: number, viewMode: number, subMode: number, stage: PipelineStageName, player: CameraPose): DomainEvent => ({
    type: 'view-switched', tick, fromViewMode: COCKPIT_VIEW_MODE, fromSubMode: 0, viewMode, subMode, stage, player: { entityId: 1, position: player.position, orientation: player.rows },
  }) as unknown as DomainEvent,
};

interface ExplosionFacts {
  readonly sourceKindBit?: number;
  readonly variant?: ExplosionVariant;
  readonly position?: Vec3;
}

/** Every sound the consumer can play: the bindings', the sounds played by ID and the HUD cues'. */
const ALL_SOUNDS: readonly string[] = [...new Set([...CONTENT.sounds, ...Object.values(EVENT_SOUNDS), ...Object.values(HUD_CUE_SOUNDS)])];

/** A real audio controller over fake capabilities with every sound loaded; unlocked unless `locked`. */
export function audioRig({ locked = false }: { readonly locked?: boolean } = {}) {
  const audio = new FakeAudio();
  audio.initialState = 'running';
  const lifecycle = new FakeLifecycle();
  const controller = createAudioController({ audio, lifecycle, reportError: (error) => { throw error; } });
  const loaded = controller.load(ALL_SOUNDS.map(id => ({ id, schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: sound() })));
  if (loaded.status !== 'loaded') throw new Error(`could not load the synthetic sounds: ${JSON.stringify(loaded)}`);
  if (!locked) controller.unlock();
  return { audio, lifecycle, controller };
}

type FrameListener = (frame: GameSessionFrame) => undefined;

/** A run handle driven by hand: `frame` notifies a session frame, `end` releases what was handed to `ownCleanup`. */
export class FakeRun implements RunAudioHandle {
  readonly runId: number;
  readonly frameListeners = new Set<FrameListener>();
  readonly cleanups: SessionCleanup[] = [];
  tick = 0;

  constructor(runId = RUN) {
    this.runId = runId;
  }

  onFrame(listener: FrameListener): SessionCleanup {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  ownCleanup(cleanup: SessionCleanup): SessionCleanup {
    this.cleanups.push(cleanup);
    return cleanup;
  }

  renderFrame(): ReturnType<GameSessionRun['renderFrame']> {
    return { current: { tick: this.tick }, previous: { tick: this.tick }, alpha: 1 } as unknown as ReturnType<GameSessionRun['renderFrame']>;
  }

  /** Notifies a frame of `outputs`; null for a still frame without a report. */
  frame(outputs: readonly TickOutput[] | null): void {
    if (outputs?.length) this.tick = outputs.at(-1)!.tick;
    const frame = {
      runId: this.runId, phase: 'running', render: null, projection: null,
      report: outputs === null ? null : { ticks: outputs.length, capped: false, stop: null, cut: null, transitions: [], completion: null, outputs },
    } as unknown as GameSessionFrame;
    for (const listener of [...this.frameListeners]) listener(frame);
  }

  end(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}

/** A presentation module driven by hand. */
export class FakePresentation implements AudioPresentation {
  readonly ownerId: number;
  readonly runId: number;
  readonly listeners = new Set<(tick: AudioPresentationTick) => void>();
  tick = 0;

  constructor(ownerId = OWNER, runId = RUN) {
    this.ownerId = ownerId;
    this.runId = runId;
  }

  camera(): { readonly tick: number } {
    return { tick: this.tick };
  }

  subscribe(listener: (tick: AudioPresentationTick) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(tick: AudioPresentationTick): void {
    this.tick = tick.tick;
    for (const listener of [...this.listeners]) listener(tick);
  }
}

/** Which of the frame's two inputs reaches the consumer first. */
export type InputOrder = 'outputs-first' | 'presentation-first';

/** One tick as the test gives it: the tick output and its presentation tick's spec. */
export type TickInput = TickSpec & { readonly presentation?: PresentationSpec };

/**
 * A consumer wired to a hand-driven run and presentation over a real controller. `frame` delivers one session frame of
 * its ticks, the two inputs in `order`, and returns the decisions it made.
 */
export function harness({ order = 'outputs-first', locked = false }: { readonly order?: InputOrder; readonly locked?: boolean } = {}) {
  const rig = audioRig({ locked });
  const run = new FakeRun();
  const presentation = new FakePresentation();
  const decisions: FlightSoundDecision[] = [];
  const consumer: RunAudio = attachRunAudio(run, {
    ownerId: OWNER, content: CONTENT, controller: rig.controller, presentation, record: (decision) => { decisions.push(decision); },
  });
  const frame = (ticks: readonly TickInput[]): FlightSoundDecision[] => {
    const from = decisions.length;
    const outputs = ticks.map(spec => tickOutput(spec));
    const presentationTicks = outputs.map((output, index) => presentationTick(output, ticks[index].presentation));
    if (order === 'presentation-first') for (const tick of presentationTicks) presentation.emit(tick);
    run.frame(ticks.length === 0 ? null : outputs);
    if (order === 'outputs-first') for (const tick of presentationTicks) presentation.emit(tick);
    return decisions.slice(from);
  };
  return { ...rig, run, presentation, consumer, decisions, frame };
}

/** A decision in short: `<result> <sound or code> <source>`, e.g. `started sound/... entity:2:0`. */
export function brief({ result, code, sound, source }: FlightSoundDecision): string {
  const what = result === 'started' ? sound : `${code}${sound ? ` ${sound}` : ''}`;
  const from = source === null ? 'all' : source.namespace === 'entity' ? `entity:${source.id}:${source.slot}`
    : source.namespace === 'effect' ? `effect:${source.id}` : source.namespace === 'cue' ? `cue:${source.cue}` : 'by-id';
  return `${result} ${what} ${from}`;
}

/**
 * A formal run of the synthetic combat world (as events.test.ts's): the player (kind 0) with a gun and a missile, enemy A
 * (kind 7) ahead, enemy B (kind 8, every sound slot empty) and a second enemy A further on; seed 12. `mapGeometry` is
 * Core's map geometry content, for a cockpit whose map record must match it.
 */
export function combatRunSpec({ mapGeometry }: { readonly mapGeometry?: unknown } = {}): GameRunSpec {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: KINDS.player, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: KINDS.enemy, position: { x: 100, y: 200, z: 60 } }),
    declaration(2, { craftType: KINDS.silent, position: { x: 100, y: 200, z: 120 } }),
    declaration(3, { craftType: KINDS.enemy, position: { x: 100, y: 200, z: 300 } }),
  ];
  const info = craftInfoContent();
  info.hitDamageScale = 1;
  info.guns = info.guns.map(() => gun({ at08: 2000, at14: 8, at18: 5, at1C: 400, at24: 64, at28: 0 }));
  info.missiles[1] = missile({
    body: 1, at18: 1, at1C: 6, at20: 0, at28: 0.5, at30: 10, at34: 20, at38: 30, at3C: 0, at44: 320, at48: 32, at4C: 10, at54: 0, at58: 4,
    at5C: 800, at60: 4, at64: 20,
  });
  Object.assign(info.missileBodies[1], { atB8: 640, atBC: 640, atC0: 640 });
  Object.assign(info.craft[KINDS.player], {
    at74: 100, at9C: 400, mounts: [mount({ weapon: 0, at20: 0, at34: 0 }), mount({ at10: 1, weapon: 1, at0C: 4 })], mountLists: [[0], [1], []],
  });
  for (const kindBit of [KINDS.enemy, KINDS.silent]) info.craft[kindBit].atB8 = 0;
  return { ...worldInput({ mission, craftInfo: info, mapGeometry, run: { seed: 12 } }), recording: null, initialTransition: null } as unknown as GameRunSpec;
}

/** The presentation random seed of the joint tests' presentation modules. */
export const PRESENTATION_SEED = 0x2468_ace1;

/** What P3-12's module needs of a run: a formal session run, or a hand-driven one with its tick-0 Render State. */
type PresentedRun = Pick<GameSessionRun, 'runId' | 'onFrame'>;

/**
 * P3-12's real presentation module for `run`, wired as wireFlightRun wires it without a renderer (P3-14 subtask 20): the
 * synthetic presentation content (the same three EXPL lists as CONTENT's), the real presentation effects and
 * destruction camera, and a presentation random source of its own. `connect` registers the frame consumer that
 * advances it one tick at a time, then hands `then` the frame's ticks with the camera each ended with (as wireFlightRun
 * then steps the cockpit); `ticks` records every tick the module notified, from a subscription made first.
 */
export function realPresentation(run: PresentedRun, initial: RenderState, { ownerId = OWNER, seed = PRESENTATION_SEED }: { readonly ownerId?: number; readonly seed?: number } = {}) {
  const content = presentationContent();
  const presentation: FlightPresentation = createFlightPresentation({
    ownerId, runId: run.runId, content, initial, random: presentationRandom(seed), effects: createPresentationEffects({ content }), destructionCamera: createDestructionCamera(),
  });
  const ticks: PresentationTick[] = [];
  presentation.subscribe((tick) => { ticks.push(tick); });
  const connect = (then?: (ticks: readonly { readonly output: TickOutput; readonly camera: PresentationCamera }[]) => void) => run.onFrame(({ report }) => {
    const stepped = (report?.outputs ?? []).map((output) => {
      presentation.advance({ ownerId, runId: run.runId, outputs: [output] });
      return { output, camera: presentation.camera() };
    });
    then?.(stepped);
    return undefined;
  });
  return { presentation, ticks, connect };
}

export interface RealHarnessOptions {
  readonly order?: InputOrder;
  readonly locked?: boolean;
  /** Another harness's controller, as a retry's run uses its owner's, instead of the harness's own. */
  readonly controller?: ReturnType<typeof audioRig>['controller'];
  readonly runId?: number;
  /** False wires the consumer only when `attach` is called. */
  readonly attached?: boolean;
}

/**
 * A consumer wired to a hand-driven run and P3-12's real presentation module (`realPresentation`) over a real
 * controller: `order` says which of the two frame consumers the run calls first. `frame` delivers one session frame of
 * its ticks (null for a still frame) and returns the decisions it made.
 */
export function realHarness({ order = 'outputs-first', locked = false, controller: shared, runId = RUN, attached = true }: RealHarnessOptions = {}) {
  const rig = audioRig({ locked });
  const controller = shared ?? rig.controller;
  const run = new FakeRun(runId);
  const flight = realPresentation(run, tickOutput({ tick: 0 }).render);
  const port: AudioPresentation = flight.presentation;
  const decisions: FlightSoundDecision[] = [];
  let consumer: RunAudio | null = null;
  const attach = () => {
    consumer = attachRunAudio(run, { ownerId: OWNER, content: CONTENT, controller, presentation: port, record: (decision) => { decisions.push(decision); } });
    return consumer;
  };
  if (order === 'presentation-first') flight.connect();
  if (attached) attach();
  if (order === 'outputs-first') flight.connect();
  const frame = (ticks: readonly TickSpec[] | null): FlightSoundDecision[] => {
    const from = decisions.length;
    run.frame(ticks === null ? null : ticks.map(tickOutput));
    return decisions.slice(from);
  };
  return { rig, controller, run, flight, decisions, frame, attach, consumer: () => consumer };
}

/** The synthetic cockpit's map geometry, which Core's must equal for the cockpit to accept the run. */
export const COCKPIT_MAP_GEOMETRY = syntheticCockpitContent().mapGeometry;

/**
 * P3-13's real cockpit for a formal run of `spec` at tick 0, as wireFlightRun starts it (after
 * cockpit-integration.test-support.ts): the synthetic cockpit content with the run's craft info, the presentation
 * module's camera and seed, and a model for every model of the run. Core's map geometry must be COCKPIT_MAP_GEOMETRY.
 */
export function cockpitFor(run: GameSessionRun, spec: GameRunSpec, camera: PresentationCamera): CockpitRun {
  const { id, content } = spec.craftInfo as unknown as { readonly id: AssetId; readonly content: unknown };
  const models = new Map((spec.models as unknown as readonly { readonly id: AssetId }[]).map(({ id: model }) => [model, syntheticModel()]));
  return createCockpitRun({
    ownerId: OWNER, runId: run.runId, seed: PRESENTATION_SEED, copy: syntheticCockpitCopy(), models, pointer: () => null,
    content: { ...syntheticCockpitContent(), craftInfo: { id, content: readRuleDataContent('craft-info', content).content as CraftInfo } },
    initial: { render: run.renderFrame().current, projection: run.projection(), camera },
    backPlane: (render) => backPlane(RUN_SETTINGS.deviceValues, render.entities),
  });
}
