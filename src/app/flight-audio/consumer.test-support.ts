import type { AssetId } from '../../content/asset-id.ts';
import { gun, missile, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import type { DomainEvent, Vec3 } from '../../core/contracts/domain-events.ts';
import type { MotionPlayer, Projection } from '../../core/projections/projection.ts';
import type { RenderDisplay, RenderEntity, RenderState } from '../../core/projections/render-state.ts';
import { COCKPIT_VIEW_MODE } from '../../core/world/player-state.ts';
import { craftInfoContent, declaration, missionFrame, worldInput } from '../../core/world/create-world.test-support.ts';
import { EXPLOSION_KIND_BIT, type EntityPresentation, type Matrix3 } from '../../core/world/entity-table.ts';
import { createAudioController } from '../../platform/audio/audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound } from '../../platform/audio/audio-controller.test-support.ts';
import type { CameraPose } from '../../render/flight/presentation/presentation-contract.ts';
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
// and a real audio controller over the platform's fake capabilities. Never original data.

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
  readonly docked?: boolean;
  /** The player's motion entry; null without one. */
  readonly motion?: Partial<MotionPlayer> | null;
}

/** A frozen tick output holding what the consumer and its HUD cues read; the HUD cues stay silent. */
export function tickOutput({ tick, clock = tick * 2, entities = [], events = [], playerId = 1, viewMode = COCKPIT_VIEW_MODE, docked = false, motion = {} }: TickSpec): TickOutput {
  const render = {
    tick, clock, viewMode, observedEntityId: playerId, entities: [...entities].sort((left, right) => left.id - right.id).map(renderEntity),
    warp: null, subMode: 0, followedEntityId: null, activeAreaCentre: null, speedShare: 0,
  } as unknown as RenderState;
  const player = motion === null || playerId === null
    ? null
    : { entityId: playerId, position: at(0, 0, 0), orientation: IDENTITY, speed: 0, commandedSpeed: 0, maximumSpeed: 400, recordMaximumSpeed: 400, ...motion };
  const projection = {
    clock: { tick, clock, clockUnitsPerTick: 2 },
    player: { entityId: playerId, viewMode, previousViewMode: viewMode, subMode: 0, interactionContext: 'flight' },
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
  explosionStarted: (tick: number, entityId: number): DomainEvent =>
    ({ type: 'explosion-started', tick, entityId, sourceEntityId: 2, sourceKindBit: KINDS.enemy, variant: 'other', position: at(0, 0, 1000), activationClock: tick * 2 }) as unknown as DomainEvent,
};

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
 * (kind 7) ahead, enemy B (kind 8, every sound slot empty) and a second enemy A further on; seed 12.
 */
export function combatRunSpec(): GameRunSpec {
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
  return { ...worldInput({ mission, craftInfo: info, run: { seed: 12 } }), recording: null, initialTransition: null } as unknown as GameRunSpec;
}

/**
 * A stand-in for the run's presentation module over the formal session (until P3-12's module gives DW-02's fields):
 * `connect` registers its own frame consumer, which notifies one presentation tick per reported tick. The listener is
 * the player's pose, or the origin camera without it; the explosions are the Core explosions past their activation
 * (list 1, item ID mod 3) and, for 6 ticks after each `explosion-started`, one presentation explosion (list 3).
 */
export function sessionPresentation(run: GameSessionRun, ownerId: number) {
  const listeners = new Set<(tick: AudioPresentationTick) => void>();
  let current = run.renderFrame().current.tick;
  let extras: { readonly key: string; readonly until: number; readonly position: Vec3 }[] = [];
  let next = 1;
  const port: AudioPresentation = {
    ownerId, runId: run.runId,
    camera: () => ({ tick: current }),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const connect = () => run.onFrame(({ report }) => {
    for (const output of report?.outputs ?? []) {
      current = output.tick;
      const started = output.events.flatMap(({ event }) => (event.type === 'explosion-started' ? [event] : []));
      for (const { position } of started) extras.push({ key: `extra:${next++}`, until: output.tick + 6, position });
      extras = extras.filter(({ until }) => until >= output.tick);
      const core = output.render.entities
        .filter(({ kindBit, display }) => kindBit === EXPLOSION_KIND_BIT && display !== 'pending')
        .map(({ id, position, orientation, speed }) => explosion(`core:${id}`, { list: 1, item: id % 3, position, forward: at(orientation[6], orientation[7], orientation[8]), speed }));
      const pose = output.render.entities.find(({ id }) => id === output.projection.player.entityId);
      const tick = deepFreeze({
        ownerId, runId: run.runId, tick: output.tick, clock: output.clock,
        afterStep: pose ? { position: pose.position, rows: pose.orientation } : ORIGIN_CAMERA,
        activations: Array.from({ length: started.length * 2 }, () => ({})) as unknown as AudioPresentationTick['activations'],
        explosions: [...core, ...extras.map(({ key, position }) => explosion(key, { list: 3, position }))],
      });
      for (const listener of [...listeners]) listener(tick);
    }
    return undefined;
  });
  return { port, connect };
}
