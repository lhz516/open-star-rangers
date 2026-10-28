import type { AssetId } from '../../content/asset-id.ts';
import type { Vec3 } from '../../core/contracts/domain-events.ts';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import type { RenderEntity } from '../../core/projections/render-state.ts';
import { EXPLOSION_KIND_BIT, FRAGMENT_KIND_BIT, MISSILE_KIND_BIT, PROJECTILE_KIND_BIT } from '../../core/world/entity-table.ts';
import type { AudioController, PlayFailureCode, VoiceParameters } from '../../platform/audio/audio-controller.ts';
import { PRESENTATION_LIMITS } from '../../render/flight/presentation/presentation-budget.ts';
import type { CameraPose, PresentationExplosion, PresentationTick } from '../../render/flight/presentation/presentation-contract.ts';
import { MAX_TICKS_PER_FRAME, type TickOutput } from '../runtime/game-runtime.ts';
import type { GameSessionFrame, GameSessionRun } from '../session/game-session.ts';
import { craftSounds, explosionSound, type FlightSoundContent } from './content.ts';
import { dispatchTypeOfKind, readTickEventSounds, type DispatchType, type EventSoundItem, type HitItem, type RetireItem, type ShotItem } from './events.ts';
import { createHudCues, type HudCues } from './hud-cues.ts';
import {
  audioListener, engineParameters, entityReading, hitReading, nonPlayerParameters, shotReading, START_PARAMETERS, type AudioListener, type SourceReading,
} from './parameters.ts';
import { createVoiceLedger, type VoiceClass, type VoiceHandle, type VoiceLedger, type VoicePlayResult, type VoiceRequest, type VoiceSource } from './voices.ts';

// The run's flight sound consumer (P3-14 S-04, S-05, S-06, S-08; D-02 DW-03, DW-04, DW-07, DW-08 and the run's part of
// DW-11; subtask 16). One per run, wired at tick 0: it pairs each tick's `TickOutput` from the session's frame with
// P3-12's `PresentationTick` of the same tick, whichever arrives first, and handles each pair as one original frame
// (D2-03) in the original's dispatch order (A-01): the tick's stop of every voice, the sounds played by ID, the type-4
// and then the type-8 object items (event items before update items), then the HUD cues. Each object's sound table and
// its voices follow docs/original/formats/audio.md, "Per-object sound table (A-02)"; an explosion's activation is
// P3-12's, and only its voice is replayed while it lives (D2-06). The voice ledger allocates (A-03), the parameter
// laws place each voice (A-04, A-05), and the HUD cue state keeps the lock tone and the instrument-9 warning (DW-10).
//
// It keeps one frame's inputs at most and no event history; it never calls Core, steps the run or submits a command,
// and it has no frame loop or timer of its own. A broken contract (an input of another run, a tick out of order or left
// unpaired, a budget exceeded, a sound the bindings lack) throws, which the session turns into a consumer fault, and the
// run's sound ends. The run's end, or `invalidate()` once the session completed, stopped or faulted, ends it as well:
// every voice stops, the tables and buffers are cleared and both subscriptions are cancelled; later inputs do nothing.

/** One explosion of a presentation tick as the consumer reads it: P3-12's `PresentationExplosion` with DW-02's motion. */
export interface AudioPresentationExplosion extends Pick<PresentationExplosion, 'key' | 'selection' | 'position'> {
  /** The explosion's movement block third row (R2) at the tick's end. */
  readonly forward: Vec3;
  /** Its movement block +0x08, runtime units/s. */
  readonly speed: number;
}

/** One P3-12 presentation tick as the consumer reads it (DW-01, DW-02); the delivered `PresentationTick` is structurally one. */
export interface AudioPresentationTick extends Pick<PresentationTick, 'ownerId' | 'runId' | 'tick' | 'clock' | 'activations'> {
  /** The tick-end camera, the listener in every view (DW-05, D2-04). */
  readonly afterStep: CameraPose;
  /** The explosions activated and not ended at the tick's end, in activation order (DW-02). */
  readonly explosions: readonly AudioPresentationExplosion[];
}

/** The run's presentation module, as the consumer uses it: its identity, its last processed tick and its notifications. */
export interface AudioPresentation {
  readonly ownerId: number;
  readonly runId: number;
  camera(): { readonly tick: number };
  subscribe(listener: (tick: AudioPresentationTick) => void): () => void;
}

/** What the consumer uses of the session's run. */
export type RunAudioHandle = Pick<GameSessionRun, 'runId' | 'onFrame' | 'ownCleanup' | 'renderFrame'>;

/**
 * One decision of the consumer for the development sound log (spec, 声音状态与开发诊断): a play and its result, an
 * empty slot or an ended hit's silence, or a stop. No sample, name or coordinate.
 */
export interface FlightSoundDecision {
  readonly ownerId: number;
  readonly runId: number;
  readonly tick: number;
  readonly clock: number;
  /** The index of the event that caused it in the tick's events; null for an update, a presentation explosion's end or a HUD cue. */
  readonly trigger: number | null;
  readonly sound: AssetId | null;
  /** Null for a stop of every voice. */
  readonly source: VoiceSource | null;
  readonly voiceClass: VoiceClass | null;
  readonly result: 'started' | 'refused' | 'failed' | 'silent' | 'stopped';
  /**
   * `voice-limit` for a refusal and the controller's code for a failure; `empty-slot` for a null sound (the original's
   * state 2) and `ended-hit` for a hit that found the slot's previous hit ended (A-02); `removal` or `stop-all` for a stop.
   */
  readonly code: 'voice-limit' | PlayFailureCode | 'empty-slot' | 'ended-hit' | 'removal' | 'stop-all' | null;
  /** A play's initial parameters; null otherwise and for a fixed voice. */
  readonly parameters: Partial<VoiceParameters> | null;
  /** The source of the voice a play cut to take its record (A-03 step 4), whether or not the play then started. */
  readonly preempted: VoiceSource | null;
}

export interface RunAudioOptions {
  readonly ownerId: number;
  /** The bindings of the package the owner bound. */
  readonly content: FlightSoundContent;
  /** The owner's audio controller, whose sounds are loaded. */
  readonly controller: AudioController;
  /** The run's presentation module (the flight consumer's `presentation()`); null is a wiring error. */
  readonly presentation: AudioPresentation | null;
  /** Receives each decision, for the development sound log only. */
  readonly record?: (decision: FlightSoundDecision) => void;
}

export interface RunAudio {
  /** Ends the run's sound now (DW-11: the session completed, stopped or faulted); idempotent. The run's end calls it too. */
  invalidate(): void;
}

export type FlightSoundConsumerFailure =
  /** The presentation module is missing, of another owner or run, or not at the run's current tick. */
  | 'wiring'
  /** An input of another run or owner, a tick out of order, a pair that disagrees, or an input left unpaired. */
  | 'pairing'
  /** More inputs, activations, explosions or sound tables than the approved budgets. */
  | 'budget'
  /** An object's kind the bindings do not bind, or a Core explosion without its presentation selection. */
  | 'binding'
  /** A projection group the consumer reads is not implemented, or a voice refused computed parameters. */
  | 'contract';

/** The consumer's contract was broken; `path` names the input, never its value. */
export class FlightSoundConsumerError extends Error {
  readonly failure: FlightSoundConsumerFailure;
  readonly path: string;

  constructor(failure: FlightSoundConsumerFailure, path: string, reason: string) {
    super(`${path} ${reason}`);
    this.name = 'FlightSoundConsumerError';
    this.failure = failure;
    this.path = path;
  }
}

/** An update item does nothing until 12 clock units after its entry was last processed (A-02). */
const THROTTLE_UNITS = 12;
/** A presentation tick's activations: its `explosion-started` events plus at most every presentation object (DW-03). */
const ACTIVATION_ALLOWANCE = PRESENTATION_LIMITS.objects;
/** Kinds whose update items have no sound: missiles, gun projectiles and fragments (A-01). */
const SILENT_UPDATE_KINDS: ReadonlySet<number> = new Set([MISSILE_KIND_BIT, PROJECTILE_KIND_BIT, FRAGMENT_KIND_BIT]);

/** One entry of a sound table (A-02): {voice handle, state, last-processed clock}; the clock is unset at creation. */
interface SoundEntry {
  state: 0 | 1 | 2;
  handle: VoiceHandle | null;
  clock: number | null;
}
type SoundTable = SoundEntry[];

const newTable = (entries: number): SoundTable => Array.from({ length: entries }, () => ({ state: 0, handle: null, clock: null }));

/** One object item addressing an entry of a sound table. */
interface ObjectItem {
  readonly code: 'shot' | 'hit' | 'update';
  readonly explosion: boolean;
  readonly table: SoundTable;
  /** The item created the table: an explosion's first play preempts (A-02). */
  readonly created: boolean;
  readonly slot: number;
  readonly sound: AssetId | null;
  readonly source: VoiceSource;
  readonly voiceClass: VoiceClass;
  readonly trigger: number | null;
  /** The voice's parameters after a play or a processed item; null keeps the start values (the player's one-shots). */
  readonly parameters: () => Partial<VoiceParameters> | null;
}

/** One tick being handled. */
interface TickContext {
  readonly output: TickOutput;
  readonly presentation: AudioPresentationTick;
  readonly clock: number;
  readonly playerId: number | null;
  readonly entities: ReadonlyMap<number, RenderEntity>;
  /** The tick's Core explosions in the presentation list, by entity ID. */
  readonly coreExplosions: ReadonlyMap<number, AudioPresentationExplosion>;
  /** The tick's presentation explosions (not Core's), in list order. */
  readonly effects: readonly AudioPresentationExplosion[];
  /**
   * The update items of each dispatch type: listed entities with a pose item, by kind then ID, and for type 8 then the
   * presentation explosions (DW-04); none without a player entity.
   */
  readonly updates: Readonly<Record<DispatchType, readonly RenderEntity[]>>;
  readonly effectUpdates: readonly AudioPresentationExplosion[];
  listener: AudioListener | null;
}

const CORE_KEY = 'core:';
/** A Core entity's sound table holds the model's five sound slots (A-02); an effect's only its EXPL sound. */
const ENTITY_SLOTS = 5;

const pairing = (path: string, reason: string): never => {
  throw new FlightSoundConsumerError('pairing', path, reason);
};

class RunSound implements RunAudio {
  readonly #ownerId: number;
  readonly #runId: number;
  readonly #content: FlightSoundContent;
  readonly #record: ((decision: FlightSoundDecision) => void) | null;
  readonly #ledger: VoiceLedger;
  readonly #cues: HudCues;
  /** Each tick's inputs not yet paired, oldest first; at most one frame's. */
  readonly #outputs: TickOutput[] = [];
  readonly #ticks: AudioPresentationTick[] = [];
  /** The last tick of each input accepted. */
  #lastOutput: number;
  #lastPresentation: number;
  /** Core entities' sound tables (5 entries, slot order) and presentation explosions' (1 entry), by namespace. */
  readonly #entities = new Map<number, SoundTable>();
  readonly #effects = new Map<string, SoundTable>();
  #current: TickContext | null = null;
  #cancel: (() => unknown)[] = [];
  #ended = false;

  constructor(run: RunAudioHandle, { ownerId, content, controller, presentation, record }: RunAudioOptions) {
    const tick = run.renderFrame().current.tick;
    if (presentation === null) throw new FlightSoundConsumerError('wiring', 'presentation', 'must be the run\'s presentation module');
    if (presentation.ownerId !== ownerId || presentation.runId !== run.runId) {
      throw new FlightSoundConsumerError('wiring', 'presentation', 'must belong to the run\'s owner and run');
    }
    if (presentation.camera().tick !== tick) throw new FlightSoundConsumerError('wiring', 'presentation.camera().tick', 'must be the run\'s current tick');
    this.#ownerId = ownerId;
    this.#runId = run.runId;
    this.#content = content;
    this.#record = record ?? null;
    this.#lastOutput = tick;
    this.#lastPresentation = tick;
    this.#ledger = createVoiceLedger({ controller, ownerId, runId: run.runId });
    this.#cues = createHudCues(this.#recordingLedger());
    try {
      // Kept until the run ends: releasing it from `invalidate`, which the owner calls from a session notification, is
      // not allowed there, and calling it at the run's end does nothing more.
      run.ownCleanup(() => { this.invalidate(); });
      this.#cancel.push(presentation.subscribe(tick => this.#guard(() => this.#onPresentation(tick))));
      this.#cancel.push(run.onFrame(frame => this.#guard(() => this.#onFrame(frame))));
    } catch (error) {
      this.invalidate();
      throw error;
    }
  }

  invalidate(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#outputs.length = 0;
    this.#ticks.length = 0;
    this.#entities.clear();
    this.#effects.clear();
    this.#current = null;
    const steps = [...this.#cancel, () => this.#ledger.dispose()];
    this.#cancel = [];
    const errors: unknown[] = [];
    for (const step of steps) {
      try {
        step();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'The run\'s flight sound could not be ended cleanly');
  }

  /** Ignores input once ended; a failure ends the run's sound before it reaches the session. */
  #guard(handle: () => void): undefined {
    if (this.#ended) return;
    try {
      handle();
    } catch (error) {
      try {
        this.invalidate();
      } catch {
        // The contract error is the cause; the session reports it.
      }
      throw error;
    }
  }

  #onFrame(frame: GameSessionFrame): void {
    if (frame.runId !== this.#runId) pairing('frame.runId', 'must be the run\'s');
    if (this.#outputs.length > 0) pairing('frame', 'arrived while the previous frame\'s outputs were unpaired');
    const outputs = frame.report?.outputs ?? [];
    if (this.#ticks.length > outputs.length) pairing('frame', 'arrived while the previous frame\'s presentation ticks were unpaired');
    if (outputs.length > MAX_TICKS_PER_FRAME) throw new FlightSoundConsumerError('budget', 'frame.report.outputs', `must hold at most ${MAX_TICKS_PER_FRAME} ticks`);
    for (const output of outputs) {
      if (output.tick !== this.#lastOutput + 1) pairing('frame.report.outputs', `must continue from tick ${this.#lastOutput + 1}`);
      this.#lastOutput = output.tick;
      this.#outputs.push(output);
    }
    this.#drain();
    // Every presentation tick of this frame has its output now.
    if (this.#ticks.length > 0) pairing('presentation', 'notified a tick the frame did not report');
  }

  #onPresentation(tick: AudioPresentationTick): void {
    if (tick.ownerId !== this.#ownerId || tick.runId !== this.#runId) pairing('presentation.tick', 'must be of the run\'s owner and run');
    if (tick.tick !== this.#lastPresentation + 1) pairing('presentation.tick.tick', `must continue from tick ${this.#lastPresentation + 1}`);
    if (this.#ticks.length >= MAX_TICKS_PER_FRAME) throw new FlightSoundConsumerError('budget', 'presentation', `must notify at most ${MAX_TICKS_PER_FRAME} ticks a frame`);
    this.#lastPresentation = tick.tick;
    this.#ticks.push(tick);
    this.#drain();
  }

  /** Handles each tick whose two inputs have both arrived, in tick order. */
  #drain(): void {
    while (this.#outputs.length > 0 && this.#ticks.length > 0) {
      const output = this.#outputs.shift()!;
      const presentation = this.#ticks.shift()!;
      if (presentation.tick !== output.tick || presentation.clock !== output.clock) pairing('presentation.tick', 'must have its output\'s tick and clock');
      if (output.render.tick !== output.tick || output.projection.clock.tick !== output.tick) pairing('output', 'must hold one tick\'s render state and projection');
      this.#tick(output, presentation);
    }
  }

  /** DW-04: one tick as one original frame. */
  #tick(output: TickOutput, presentation: AudioPresentationTick): void {
    const reading = readTickEventSounds(this.#content, output);
    checkPresentationBudget(reading.items, presentation);
    const { communications } = output.projection;
    if (communications.readiness !== 'ready') throw new FlightSoundConsumerError('contract', 'projection.communications', 'must be implemented');
    const { motion } = output.projection.flight;
    if (motion.readiness !== 'ready') throw new FlightSoundConsumerError('contract', 'projection.flight.motion', 'must be implemented');
    // The camera step posts update items only while the player state holds a player entity (A-01, DW-04).
    const posing = motion.player !== null;
    const entities = new Map<number, RenderEntity>();
    const updates: Record<DispatchType, RenderEntity[]> = { 4: [], 8: [] };
    for (const entity of output.render.entities) {
      entities.set(entity.id, entity);
      if (!posing || (entity.display !== 'shown' && entity.display !== 'hidden') || SILENT_UPDATE_KINDS.has(entity.kindBit)) continue;
      const type = dispatchTypeOfKind(entity.kindBit);
      if (type !== null) updates[type].push(entity);
    }
    // Listed in ascending ID order, so a stable sort by kind gives kind, then ID.
    for (const list of Object.values(updates)) list.sort((left, right) => left.kindBit - right.kindBit);
    const coreExplosions = new Map<number, AudioPresentationExplosion>();
    const effects: AudioPresentationExplosion[] = [];
    for (const explosion of presentation.explosions) {
      if (explosion.key.startsWith(CORE_KEY)) coreExplosions.set(Number(explosion.key.slice(CORE_KEY.length)), explosion);
      else effects.push(explosion);
    }
    const context: TickContext = {
      output, presentation, clock: output.clock, playerId: output.projection.player.entityId, entities, coreExplosions, effects, updates,
      effectUpdates: posing ? effects : [], listener: null,
    };
    this.#current = context;
    try {
      // 1. Before the render: the tick's stop of every voice (DW-09), then a switch into the Warp view clears the lock tone.
      if (reading.stopAll) this.#stopAll();
      this.#cues.beforeDispatch(output);
      // 3. The dispatch (A-01): type 2, type 4, type 8; type-4 and type-8 items are skipped while docked (2., D2-15).
      for (const item of reading.items) if (item.action === 'by-id') this.#play({ source: { namespace: 'by-id' }, sound: item.sound, voiceClass: item.voiceClass, preempt: item.preempt }, item.index);
      const live = new Set<string>(effects.map(({ key }) => key));
      if (communications.player?.docking.docked !== true) {
        this.#dispatch(4, reading.items, context, []);
        this.#dispatch(8, reading.items, context, [...this.#effects.keys()].filter(key => !live.has(key)));
      }
      // 4. The HUD cues, after the dispatch.
      this.#cues.afterDispatch(output);
      this.#forget(reading.items, context, live);
    } finally {
      this.#current = null;
    }
  }

  /** The object items of one presentation item type: event items in event order, then update items (DW-04 step 3). */
  #dispatch(type: DispatchType, items: readonly EventSoundItem[], context: TickContext, ended: readonly string[]): void {
    for (const item of items) {
      if ((item.action === 'shot' || item.action === 'hit') && item.dispatch === type) this.#oneShot(item, context);
      else if (item.action === 'retire' && item.dispatch === type && item.stopsVoices) this.#retire(item);
    }
    // A presentation explosion's end is its removal item (DW-07), after the tick's Core items.
    for (const key of ended) this.#remove(this.#effects.get(key), () => ({ namespace: 'effect', id: key }), null);
    for (const entity of context.updates[type]) this.#update(entity, context);
    if (type === 8) for (const explosion of context.effectUpdates) this.#effectUpdate(explosion, context);
  }

  /** A shot's or a hit's item: the shooter's or the victim's slot, placed at the source's reading (DW-05). */
  #oneShot(item: ShotItem | HitItem, context: TickContext): void {
    const { entityId, slot } = item;
    const { table, created } = this.#table(this.#entities, entityId, ENTITY_SLOTS, CORE_LIMITS.entities, 'entities');
    const reading = () => {
      const listed = context.entities.get(entityId) ?? null;
      return item.action === 'shot' ? shotReading(item.event, listed) : hitReading(item.event, listed);
    };
    this.#object(context, {
      code: item.action, explosion: false, table, created, slot, sound: item.sound, voiceClass: item.voiceClass, trigger: item.index,
      source: { namespace: 'entity', id: entityId, slot },
      parameters: () => (entityId === context.playerId ? null : this.#placed(context, reading())),
    });
  }

  /** A listed Core entity's update item: an explosion's EXPL sound, a model's slot 0, or nothing (A-01). */
  #update(entity: RenderEntity, context: TickContext): void {
    const { id, kindBit } = entity;
    const explosion = kindBit === EXPLOSION_KIND_BIT;
    let sound: AssetId | null;
    if (explosion) {
      const listed = context.coreExplosions.get(id);
      if (!listed) throw new FlightSoundConsumerError('binding', `presentation.explosions[${CORE_KEY}${id}]`, 'must list every shown Core explosion');
      sound = explosionSound(this.#content, listed.selection);
    } else if (entity.presentation.type === 'model') {
      const craft = craftSounds(this.#content, kindBit);
      if (craft === null) throw new FlightSoundConsumerError('binding', `render.entities[${id}].kindBit`, `is kind bit ${kindBit}, which the mission's craft type table does not bind`);
      sound = craft.soundSlots[0];
    } else {
      // The map marker: the original reads slot sounds through the object's visual, and the scene step makes none for
      // the marker (executable.md, "the marker"), so it is taken as silent; A-01 records its slot 0 as Unconfirmed.
      return;
    }
    const { table, created } = this.#table(this.#entities, id, ENTITY_SLOTS, CORE_LIMITS.entities, 'entities');
    const player = id === context.playerId;
    this.#object(context, {
      code: 'update', explosion, table, created, slot: 0, sound, voiceClass: explosion ? 2 : 5, trigger: null,
      source: { namespace: 'entity', id, slot: 0 },
      parameters: () => (player ? this.#engine(context) : this.#placed(context, entityReading(entity))),
    });
  }

  /** A presentation explosion's update item: its EXPL sound in its effect entry (DW-08). */
  #effectUpdate(explosion: AudioPresentationExplosion, context: TickContext): void {
    const { table, created } = this.#table(this.#effects, explosion.key, 1, PRESENTATION_LIMITS.selections, 'effects');
    const { position, forward, speed } = explosion;
    this.#object(context, {
      code: 'update', explosion: true, table, created, slot: 0, sound: explosionSound(this.#content, explosion.selection), voiceClass: 2,
      trigger: null, source: { namespace: 'effect', id: explosion.key },
      parameters: () => this.#placed(context, { position, forward, speed }),
    });
  }

  /** `0x55534` for one item (A-02): throttle, state machine, play or parameter refresh. */
  #object(context: TickContext, item: ObjectItem): void {
    const { code, explosion, table, created, slot, sound, source, voiceClass, trigger } = item;
    const entry = table[slot];
    const now = context.clock;
    if (code === 'update' && entry.clock !== null && now - entry.clock < THROTTLE_UNITS) return;
    if (entry.state === 2) return;
    if (sound === null) {
      entry.state = 2;
      this.#log(context, { trigger, sound, source, voiceClass, result: 'silent', code: 'empty-slot', parameters: null });
      return;
    }
    if (entry.state === 1) {
      if (this.#sounding(entry.handle)) {
        entry.clock = now;
        // An explosion's or an update's voice keeps playing and is placed again; a shot or a hit plays into a new voice.
        if (code === 'update') {
          this.#refresh(entry.handle!, item.parameters());
          return;
        }
      } else {
        entry.state = 0;
        if (code === 'hit') {
          this.#log(context, { trigger, sound, source, voiceClass, result: 'silent', code: 'ended-hit', parameters: null });
          return;
        }
        if (explosion) return;
      }
    }
    if (!created) entry.clock = now;
    const preempt = explosion ? created : code !== 'update';
    const parameters = item.parameters() ?? START_PARAMETERS;
    const result = this.#play({ source, sound, voiceClass, preempt, parameters }, trigger);
    if (result.status !== 'started') return;
    entry.state = 1;
    entry.handle = result.handle;
    entry.clock = now;
  }

  #retire({ entityId, index }: RetireItem): void {
    this.#remove(this.#entities.get(entityId), slot => ({ namespace: 'entity', id: entityId, slot: slot as 0 | 1 | 2 | 3 | 4 }), index);
  }

  /** `0x55894` (A-02 consequence 5): stops each entry's voice still sounding and sets it idle. */
  #remove(table: SoundTable | undefined, source: (slot: number) => VoiceSource, trigger: number | null): void {
    if (!table) return;
    table.forEach((entry, slot) => {
      if (entry.state !== 1) return;
      if (this.#sounding(entry.handle)) {
        this.#ledger.stop(entry.handle!);
        this.#log(this.#current!, { trigger, sound: null, source: source(slot), voiceClass: null, result: 'stopped', code: 'removal', parameters: null });
      }
      entry.state = 0;
    });
  }

  /** DW-09: the ledger's stop of every voice; the tables keep their state and handles (A-02, "After all voices are lost"). */
  #stopAll(): void {
    this.#ledger.stopAll();
    this.#log(this.#current!, { trigger: null, sound: null, source: null, voiceClass: null, result: 'stopped', code: 'stop-all', parameters: null });
  }

  /**
   * DW-07 at the tick's end: a retired or departed entity's table goes, as does the table of one no longer listed
   * (parked); a presentation explosion's table goes once it has left the list. Nothing is stopped here.
   */
  #forget(items: readonly EventSoundItem[], context: TickContext, live: ReadonlySet<string>): void {
    for (const item of items) if (item.action === 'retire' || item.action === 'leave') this.#entities.delete(item.entityId);
    for (const id of this.#entities.keys()) if (!context.entities.has(id)) this.#entities.delete(id);
    for (const key of this.#effects.keys()) if (!live.has(key)) this.#effects.delete(key);
  }

  /** The source's table, created with every entry idle by the first item that reaches it; `limit` tables at most (DW-03). */
  #table<Key>(tables: Map<Key, SoundTable>, key: Key, entries: number, limit: number, path: string): { readonly table: SoundTable; readonly created: boolean } {
    const table = tables.get(key);
    if (table) return { table, created: false };
    if (tables.size >= limit) throw new FlightSoundConsumerError('budget', path, `must hold at most ${limit} tables`);
    const created = newTable(entries);
    tables.set(key, created);
    return { table: created, created: true };
  }

  /** Whether the handle's voice still owns its record and has not ended (`0x53b54`); kept while the controller is paused. */
  #sounding(handle: VoiceHandle | null): boolean {
    if (handle === null) return false;
    const { status } = this.#ledger.query(handle);
    return status === 'playing' || status === 'paused';
  }

  /** A non-player source placed against the tick's listener (A-04). */
  #placed(context: TickContext, reading: SourceReading): Partial<VoiceParameters> {
    context.listener ??= audioListener(context.presentation.afterStep, context.output.projection.flight.motion);
    return nonPlayerParameters(context.listener, reading);
  }

  /** The player's engine (A-05); null, keeping the voice's values, without a player motion entry. */
  #engine(context: TickContext): Partial<VoiceParameters> | null {
    const { motion } = context.output.projection.flight;
    if (motion.readiness !== 'ready') throw new FlightSoundConsumerError('contract', 'projection.flight.motion', 'must be implemented');
    return motion.player ? engineParameters(motion.player) : null;
  }

  #refresh(handle: VoiceHandle, parameters: Partial<VoiceParameters> | null): void {
    if (parameters === null) return;
    const result = this.#ledger.update(handle, parameters);
    // An ended voice, or a controller failed or disposed, has nothing to place; a refusal of the values is a contract error.
    if (result.status === 'rejected' && (result.code === 'invalid-parameters' || result.code === 'fixed-parameters')) {
      throw new FlightSoundConsumerError('contract', 'parameters', `were refused (${result.code})`);
    }
  }

  /** Plays through the ledger and records the decision. */
  #play(request: VoiceRequest, trigger: number | null): VoicePlayResult {
    const result = this.#ledger.play(request);
    const { source, sound, voiceClass, parameters = null } = request;
    // Every play comes from a tick being handled, the HUD cues' included.
    this.#log(this.#current!, {
      trigger, sound, source, voiceClass, parameters,
      result: result.status, code: result.status === 'started' ? null : result.code,
      preempted: result.status === 'refused' ? null : result.preempted?.source ?? null,
    });
    return result;
  }

  #log(context: TickContext, decision: Omit<FlightSoundDecision, 'ownerId' | 'runId' | 'tick' | 'clock' | 'preempted'> & { readonly preempted?: VoiceSource | null }): void {
    this.#record?.(Object.freeze({ ownerId: this.#ownerId, runId: this.#runId, tick: context.output.tick, clock: context.clock, preempted: null, ...decision }));
  }

  /** The ledger the HUD cues play through, recording their plays as the consumer's own. */
  #recordingLedger(): VoiceLedger {
    const ledger = this.#ledger;
    return {
      play: request => this.#play(request, null),
      query: handle => ledger.query(handle),
      update: (handle, parameters) => ledger.update(handle, parameters),
      stop: handle => ledger.stop(handle),
      stopAll: () => ledger.stopAll(),
      counts: () => ledger.counts(),
      dispose: () => ledger.dispose(),
    };
  }
}

/** DW-03: a tick's activations are its `explosion-started` events plus the presentation objects; its explosions the kept selections. */
function checkPresentationBudget(items: readonly EventSoundItem[], { activations, explosions }: AudioPresentationTick): void {
  const started = items.filter(({ event }) => event.type === 'explosion-started').length;
  if (activations.length > started + ACTIVATION_ALLOWANCE) {
    throw new FlightSoundConsumerError('budget', 'presentation.tick.activations', `must hold at most the tick's explosion-started events plus ${ACTIVATION_ALLOWANCE}`);
  }
  if (explosions.length > PRESENTATION_LIMITS.selections) {
    throw new FlightSoundConsumerError('budget', 'presentation.tick.explosions', `must hold at most ${PRESENTATION_LIMITS.selections}`);
  }
}

/**
 * Wires the run's flight sound at tick 0, while the run is held for its departure (DW-01): checks the presentation
 * module, subscribes to it and to the run's frames, and hands its end to `run.ownCleanup`. Throws a
 * FlightSoundConsumerError for a wrong presentation module, leaving nothing behind.
 */
export function attachRunAudio(run: RunAudioHandle, options: RunAudioOptions): RunAudio {
  return new RunSound(run, options);
}
