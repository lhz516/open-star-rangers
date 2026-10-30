import { mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { commMessagesContent, craftInfoContent, declaration, missionFrame, worldInput } from '../../core/world/create-world.test-support.ts';
import type { packageCraftTypes } from '../resources/resource-holder.test-support.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { TickOutput } from '../runtime/game-runtime.ts';
import { isRunningTransition, type GameRunSpec, type GameSessionStatus, type RunningTransition } from '../session/game-session.ts';
import { current, sessionSetup } from '../session/game-session.test-support.ts';
import type { GameSessionError } from '../session/session-errors.ts';
import { bindFlightSounds, type FlightSoundContent } from './content.ts';
import { MODELS, soundPackage } from './content.test-support.ts';
import { attachRunAudio, type AudioPresentation, type FlightSoundDecision } from './consumer.ts';
import { audioRig, OWNER, realPresentation } from './consumer.test-support.ts';

// Formal rule chains for the flight sound consumer (P3-14 subtask 19): a GameSession of a synthetic world (code-generated
// content and inputs, never original data) driven one tick a frame by a command script, its holds completed as the
// mission page would, the run's sound wired as the owner wires it, and the session's completion ending it. Nothing
// replaces a rule: every event comes from Core's own step, every decision from the consumer over a real controller.
// The presentation module is P3-12's real one, wired as wireFlightRun wires it (consumer.test-support.ts, subtask 20).

/**
 * The synthetic models of the sound package by the world's craft type: the player's for the friendly craft, enemy A's
 * (every slot set) for the hostiles and the transponder, enemy B's (every slot empty) for kind 8 and the base's for the
 * bases. A kind outside this table is the world's own and must be added here.
 */
const MODEL_OF_KIND: Readonly<Record<number, string>> = Object.freeze({
  0: MODELS.player, 1: MODELS.player, 2: MODELS.player, 7: MODELS.enemyA, 8: MODELS.enemyB, 13: MODELS.enemyA, 14: MODELS.enemyA,
  15: MODELS.base, 16: MODELS.enemyA, 17: MODELS.base, 18: MODELS.base, 25: MODELS.enemyB,
});

/**
 * The sound bindings of a package whose craft type table is the run's own (`spec.craftTypes`), each kind bound to the
 * synthetic model above: the bindings and the world come from one package, as the mission owner's do.
 */
export function soundContentFor(spec: GameRunSpec): FlightSoundContent {
  const { entries } = spec.craftTypes.content as ReturnType<typeof packageCraftTypes>;
  const craftTypes = {
    entries: entries.map((entry) => {
      const id = MODEL_OF_KIND[entry.craftType];
      if (id === undefined) throw new Error(`No synthetic sound model for craft type ${entry.craftType}`);
      return { ...entry, model: { ...entry.model, id } };
    }),
  };
  const { held, bound } = soundPackage({ craftTypes });
  return bindFlightSounds(held, bound);
}

/** A Core world input or Runtime spec at the default step as a Session run spec, without a recording or a departure hold. */
export const runSpecOf = (input: unknown): GameRunSpec => ({ ...(input as object), recording: null, initialTransition: null }) as unknown as GameRunSpec;

/** What a test reads of one tick the run reported. */
export interface TickFacts {
  readonly tick: number;
  readonly clock: number;
  readonly events: readonly DomainEvent[];
  readonly viewMode: number;
  /** The player's docking activity (FA-07), false without a player. */
  readonly docked: boolean;
  /** Whether the projection has a player motion entry: without it the camera step posts no update item (DW-04). */
  readonly posing: boolean;
  /** The entities the Render State gives a pose item (`shown` or `hidden`, FS-01), by ID. */
  readonly posed: ReadonlyMap<number, { readonly kindBit: number; readonly presentation: string }>;
  /** The player's current missile mount (weapon list 1), null without one. */
  readonly missileMount: number | null;
}

function factsOf({ tick, clock, events, projection, render }: TickOutput): TickFacts {
  const { communications, flight, player } = projection;
  const posed = new Map(render.entities
    .filter(({ display }) => display === 'shown' || display === 'hidden')
    .map(({ id, kindBit, presentation }) => [id, { kindBit, presentation: presentation.type }] as const));
  return {
    tick, clock, events: events.map(({ event }) => event), viewMode: player.viewMode,
    docked: communications.readiness === 'ready' && communications.player?.docking.docked === true,
    posing: flight.motion.readiness === 'ready' && flight.motion.player !== null,
    posed,
    missileMount: flight.combat.readiness === 'ready' ? flight.combat.player?.weapons[1].mount ?? null : null,
  };
}

/** The commands for tick `tick`, chosen from the run so far (every tick reported before it). */
export type RuleScript = (tick: number, ticks: readonly TickFacts[]) => readonly Command[];

export interface RuleRunOptions {
  /** Stop after this tick if the run has not completed. */
  readonly until: number;
  /** Ticks a frame; 1 by default. A script's commands for a frame go to its first tick. */
  readonly ticksPerFrame?: number;
}

export interface RuleRun {
  readonly ticks: readonly TickFacts[];
  readonly decisions: readonly FlightSoundDecision[];
  /** The decisions of each tick that has any, in order. */
  readonly decisionsByTick: ReadonlyMap<number, readonly FlightSoundDecision[]>;
  /** Each running hold the run entered, as the Session reported it before it was completed. */
  readonly holds: readonly RunningTransition[];
  readonly status: GameSessionStatus;
  readonly errors: readonly GameSessionError[];
  /** The controller's voices after the run's end. */
  readonly voicesAtEnd: number;
  /** The tick of the last frame before the session completed, null if it did not. */
  readonly completedTick: number | null;
  /** Decisions made after the session completed. */
  readonly decisionsAfterCompletion: number;
  /** The consumer's presentation subscriptions just before the session completed (or at the end), and at the end. */
  readonly subscriptions: { readonly beforeCompletion: number; readonly atEnd: number };
}

/**
 * Plays `spec` from tick 1, `ticksPerFrame` ticks a frame, until it completes or `until` passes, submitting `script`'s
 * commands for the next tick before each frame and completing each running hold. The run's flight sound is attached as the owner attaches
 * it (DW-01: at tick 0, after the presentation module), and the session's completion invalidates it (DW-11, D2-14).
 */
export function playRules(spec: GameRunSpec, script: RuleScript, { until, ticksPerFrame = 1 }: RuleRunOptions): RuleRun {
  const { session, host, errors } = sessionSetup();
  session.control({ type: 'start', spec });
  const run = current(session);
  const ticks: TickFacts[] = [];
  run.onFrame(({ report }) => {
    for (const output of report?.outputs ?? []) ticks.push(factsOf(output));
    return undefined;
  });
  const { controller } = audioRig();
  const { presentation: port, connect } = realPresentation(run, run.renderFrame().current);
  connect();
  let subscribed = 0;
  const presentation: AudioPresentation = {
    ownerId: port.ownerId,
    runId: port.runId,
    camera: () => port.camera(),
    subscribe: (listener) => {
      const cancel = port.subscribe(listener);
      subscribed++;
      return () => {
        subscribed--;
        cancel();
      };
    },
  };
  const decisions: FlightSoundDecision[] = [];
  let completedAt: number | null = null;
  let beforeCompletion: number | null = null;
  const audio = attachRunAudio(run, { ownerId: OWNER, content: soundContentFor(spec), controller, presentation, record: (decision) => { decisions.push(decision); } });
  session.onStatus(({ phase }) => {
    if (phase === 'completed' && completedAt === null) {
      completedAt = decisions.length;
      beforeCompletion = subscribed;
      audio.invalidate();
    }
    return undefined;
  });
  const holds: RunningTransition[] = [];
  const submitted = new Set<number>();
  let now = 0;
  host.deliver(now);
  for (let frames = 0; frames < until * 2 + 10; frames++) {
    const { phase, transition } = session.status();
    if (phase === 'transition' && isRunningTransition(transition)) {
      holds.push(transition);
      session.control({ type: 'complete-transition', runId: run.runId, transitionId: transition.transitionId });
      continue;
    }
    const next = (ticks.at(-1)?.tick ?? 0) + 1;
    if (phase !== 'running' || next > until) break;
    // A frame may run no tick (the first after a hold); the commands already queued wait for that tick.
    if (!submitted.has(next)) {
      submitted.add(next);
      for (const command of script(next, ticks)) run.submitCommand(command);
    }
    now += ticksPerFrame * TICK_MS;
    host.deliver(now);
  }
  const status = session.status();
  const decisionsByTick = new Map<number, FlightSoundDecision[]>();
  for (const decision of decisions) {
    const list = decisionsByTick.get(decision.tick);
    if (list) list.push(decision);
    else decisionsByTick.set(decision.tick, [decision]);
  }
  return {
    ticks, decisions, decisionsByTick, holds, status, errors, voicesAtEnd: controller.getSnapshot().voices,
    completedTick: status.phase === 'completed' ? ticks.at(-1)!.tick : null,
    decisionsAfterCompletion: completedAt === null ? 0 : decisions.length - completedAt,
    subscriptions: { beforeCompletion: beforeCompletion ?? subscribed, atEnd: subscribed },
  };
}

/** A script of fixed commands by tick. */
export const scripted = (commands: Readonly<Record<number, readonly Command[]>>): RuleScript => (tick) => commands[tick] ?? [];

/**
 * P3-10's docking world (as comm-replay.test.ts's): the player at runtime (187.5, 375, 0); base A of kind 18 375 ahead,
 * within the docking range; base B of kind 17 out of range; nothing moves, and the face tables give every base's
 * docking and status replies. The player's missile list has two mounts, so the base's missile walk (energy step, every
 * 4 clock units while in the base view) moves its current missile mount at each step (BS9).
 */
export function dockingSpec(): GameRunSpec {
  const frames = (...frameDurations: number[]) => ({ present: true, frameDurations });
  const messages = commMessagesContent();
  messages.faceTables[0] = Array.from({ length: 5 }, () => [frames(3, 9), frames(2, 2)]) as never;
  const info = craftInfoContent();
  for (const kindBit of [17, 18]) info.craft[kindBit].atB8 = 0;
  Object.assign(info.craft[0], { atB8: 1, at88: 2 ** 30 });
  const [gunMount] = info.craft[0].mounts;
  const missileMount = () => mount({ at10: 1, weapon: 1, at0C: 4 });
  Object.assign(info.craft[0], { mounts: [gunMount, missileMount(), missileMount()], mountLists: [[0], [1, 2], []] });
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 18, position: { x: 100, y: 200, z: 200 }, nameCandidates: ['base-a'] }),
    declaration(2, { craftType: 17, position: { x: -300, y: 600, z: 200 }, nameCandidates: ['base-b'] }),
  ];
  return runSpecOf(worldInput({ mission, commMessages: messages, craftInfo: info }));
}
