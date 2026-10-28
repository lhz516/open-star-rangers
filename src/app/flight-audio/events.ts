import type { AssetId } from '../../content/asset-id.ts';
import type {
  DomainEvent, ExplosionCreatedEvent, ExplosionStartedEvent, HitEvent, ObjectLeftWorldEvent, ObjectRetiredEvent, ShotFiredEvent, ViewSwitchedEvent,
} from '../../core/contracts/domain-events.ts';
import { WARP_VIEW_MODE } from '../../core/systems/view-switch.ts';
import type { DomainEventType } from '../runtime/game-event-bus.ts';
import type { TickOutput } from '../runtime/game-runtime.ts';
import { craftSounds, type FlightSoundContent } from './content.ts';
import type { VoiceClass } from './voices.ts';

// The flight sounds' reading of Core's domain events (P3-14 S-02, S-04, S-07; D-02 DW-06, DW-09; subtask 15): what each
// event of a tick means for sound, by docs/original/formats/audio.md, "Presentation-item dispatch (A-01)", "Per-object
// sound table (A-02)" and "Play-by-ID boundaries and reachability (A-10)". Every DomainEvent variant has its own entry
// in a table the compiler checks, with no default for unknown variants. The reading is pure: it plays, stops and
// remembers nothing, and resolves an object's sound from the static bindings by the event's kind bit, never from the
// current Render State, so an event whose source has left the world still resolves. Each item keeps its event, the
// tick and the event's emission index; the delivery's `commandId` is never part of a sound's identity, and two equal
// events stay two items. The run's consumer (subtask 16) orders the items by DW-04 and plays them.

/** The sounds played by ID (P3-03 Asset table; A-10): the original's SND entry is in each comment. */
export const EVENT_SOUNDS = Object.freeze({
  /** 11087 */
  targetSelect: 'sound/event/target-select' as AssetId,
  /** 11381 */
  weaponSelect: 'sound/event/weapon-select' as AssetId,
  /** 10485 */
  keyCommand: 'sound/event/key-command' as AssetId,
  /** 10463 */
  mapDestination: 'sound/event/map-destination' as AssetId,
  /** 10401 */
  warpStart: 'sound/warp' as AssetId,
  /** 10181, 8 plays */
  warpArrival: 'sound/event/warp-arrival' as AssetId,
  /** 10055 */
  transponderCreated: 'sound/event/transponder-created' as AssetId,
  /** 10167 */
  baseSelectKey: 'sound/event/base-select-key' as AssetId,
  /** 10169 */
  baseExecuteKey: 'sound/event/base-execute-key' as AssetId,
});

/** An object item's presentation item type (A-01): type 4 is dispatched before type 8 in a tick. */
export type DispatchType = 4 | 8;

/** Kinds whose update and removal items are type 4, and type 8 (A-01; mask bit n is kind bit n). */
const TYPE_4_KINDS = 0x21fffff;
const TYPE_8_KINDS = 0x1600000;
/** Kinds whose removal `0x55894` skips: gun projectiles, missiles, fragments and the map marker (A-02). */
const UNSTOPPED_KINDS = 0x3300000;

const hasKind = (mask: number, kindBit: number): boolean => ((mask >>> kindBit) & 1) === 1;

/**
 * The presentation item type of an object of kind bit `kindBit`'s update and removal items, or null for a kind in
 * neither mask, which the original posts none for. A value that is not a kind bit position 0–31 is a RangeError.
 */
export function dispatchTypeOfKind(kindBit: number): DispatchType | null {
  if (!Number.isInteger(kindBit) || kindBit < 0 || kindBit > 31) throw new RangeError(`${kindBit} is not a kind bit position 0–31`);
  if (hasKind(TYPE_4_KINDS, kindBit)) return 4;
  return hasKind(TYPE_8_KINDS, kindBit) ? 8 : null;
}

/**
 * Why an event has no sound of its own: `no-sound` the original posts no sound item for it; `out-of-slice` its sound is
 * a gap of the slice (G-01, G-03; D1-09); `condition` the event's fields say the original posts none (a page write
 * without a command, an arrival without an enemy near, a view switch not into the Warp view); `parked` a parked
 * engagement's hit, which posts no hit item.
 */
export type SilenceReason = 'no-sound' | 'out-of-slice' | 'condition' | 'parked';

interface Item<Action extends string, Event extends DomainEvent> {
  readonly action: Action;
  /** The emitting tick, as the event's own. */
  readonly tick: number;
  /** The event's index in the tick's emission order. */
  readonly index: number;
  readonly event: Event;
}

/** No sound and no other effect on sound. */
export interface SilentItem extends Item<'silent', DomainEvent> {
  readonly reason: SilenceReason;
}

/** A type-2 item (A-01, A-03): played by ID in class 4 with preemption, keeping no handle. */
export interface ByIdItem extends Item<'by-id', DomainEvent> {
  readonly sound: AssetId;
  readonly voiceClass: 4;
  readonly preempt: true;
}

interface ObjectSound<Action extends string, Event extends DomainEvent> extends Item<Action, Event> {
  readonly dispatch: DispatchType;
  /** The entity whose sound table the item addresses: the shooter's or the victim's. */
  readonly entityId: number;
  readonly slot: 1 | 2 | 3 | 4;
  /** The model's sound in that slot; null for an empty slot, the original's state 2 (legal silence, never retried). */
  readonly sound: AssetId | null;
  readonly voiceClass: VoiceClass;
  readonly preempt: true;
}

/**
 * A shot's code-0 item (A-01, A-02): the shooter's slot 1 for a gun (type 8) or 2 for a missile (type 4), class 1. Its
 * source reading is the event's shooter snapshot when the shooter is not in the tick's Render State (DW-05).
 */
export type ShotItem = ObjectSound<'shot', ShotFiredEvent>;

/** A hit's item (A-01, A-02): type 4, the victim's slot 4 when its shield was empty before, otherwise 3, class 2. */
export type HitItem = ObjectSound<'hit', HitEvent>;

/**
 * An entity's retirement (DW-07). For a kind of the dispatch masks it is a removal item of type `dispatch`, which stops
 * the entity's tracked voices when `stopsVoices` (a kind outside `0x3300000`); a kind outside the masks has no removal
 * item (`dispatch` null, nothing stopped). The entity's sound table is dropped either way.
 */
export interface RetireItem extends Item<'retire', ObjectRetiredEvent> {
  readonly dispatch: DispatchType | null;
  readonly entityId: number;
  readonly stopsVoices: boolean;
}

/** A parked object's exit from the world (DW-07): its sound table is dropped without stopping a voice. */
export interface LeaveItem extends Item<'leave', ObjectLeftWorldEvent> {
  readonly entityId: number;
}

/** A stop of every voice (DW-09), before every sound of the tick. */
export type StopAllItem = Item<'stop-all', DomainEvent>;

/** P3-12's explosion facts: the presentation module selects and keeps the EXPL item; the explosion sounds through its updates (DW-08). */
export type PresentationItem = Item<'presentation', ExplosionStartedEvent | ExplosionCreatedEvent>;

/** A view switch into the Warp view: the HUD cues call the lock tone with −1 before the tick's dispatch (DW-04 step 1). */
export type HudInputItem = Item<'hud-input', ViewSwitchedEvent>;

export type EventSoundItem = SilentItem | ByIdItem | ShotItem | HitItem | RetireItem | LeaveItem | StopAllItem | PresentationItem | HudInputItem;

/** One tick's events read for sound, in emission order. */
export interface TickEventSounds {
  readonly tick: number;
  /** A stop event is among them: one stop of every voice comes before any of the tick's sounds (DW-09). */
  readonly stopAll: boolean;
  /** One item per event, in emission order. */
  readonly items: readonly EventSoundItem[];
}

export type FlightSoundEventFailure = 'unbound-kind' | 'tick-mismatch';

/** An event the bindings or the tick cannot account for: a contract error, never silence. */
export class FlightSoundEventError extends Error {
  readonly failure: FlightSoundEventFailure;
  readonly path: string;

  constructor(failure: FlightSoundEventFailure, path: string, reason: string) {
    super(`${path} ${reason}`);
    this.name = 'FlightSoundEventError';
    this.failure = failure;
    this.path = path;
  }
}

type EventOf<Type extends DomainEventType> = Extract<DomainEvent, { readonly type: Type }>;
type ItemFields<Result extends EventSoundItem> = Omit<Result, 'tick' | 'index' | 'event'>;
type Reading<Type extends DomainEventType> = (event: EventOf<Type>, content: FlightSoundContent) => ItemFields<EventSoundItem>;

const silent = (reason: SilenceReason): ItemFields<SilentItem> => ({ action: 'silent', reason });
const noSound = (): ItemFields<SilentItem> => silent('no-sound');
const byId = (sound: AssetId): ItemFields<ByIdItem> => ({ action: 'by-id', sound, voiceClass: 4, preempt: true });
const played = (sound: AssetId) => (): ItemFields<ByIdItem> => byId(sound);
const stopAll = (): ItemFields<StopAllItem> => ({ action: 'stop-all' });
const presentation = (): ItemFields<PresentationItem> => ({ action: 'presentation' });

/** The sound in slot `slot` of the model of kind `kindBit`; a kind the bindings lack is a contract error. */
function slotSound(content: FlightSoundContent, kindBit: number, slot: 1 | 2 | 3 | 4, path: string): AssetId | null {
  const craft = craftSounds(content, kindBit);
  if (craft === null) throw new FlightSoundEventError('unbound-kind', path, `is kind bit ${kindBit}, which the mission's craft type table does not bind`);
  return craft.soundSlots[slot];
}

/** DW-06: each variant's reading. */
const READINGS: { readonly [Type in DomainEventType]: Reading<Type> } = {
  'command-result': noSound,
  'object-instantiated': noSound,
  'speed-assist-toggled': noSound,
  'speed-matched': noSound,
  'speed-assist-released': noSound,
  'object-left-world': ({ entityId }) => ({ action: 'leave', entityId }),
  'target-changed': played(EVENT_SOUNDS.targetSelect),
  'target-cleared': noSound,
  // Also unchanged (`changed` false) and the rescue's (`commandIndex` null) (FA-06).
  'weapon-selected': played(EVENT_SOUNDS.weaponSelect),
  'shot-fired': ({ shooterEntityId, shooterKindBit, family }, content) => {
    const slot = family === 'gun' ? 1 : 2;
    return {
      action: 'shot', dispatch: family === 'gun' ? 8 : 4, entityId: shooterEntityId, slot,
      sound: slotSound(content, shooterKindBit, slot, 'shot-fired.shooterKindBit'), voiceClass: 1, preempt: true,
    };
  },
  // A gated hit sounds; a parked engagement's posts no item (E6).
  hit: ({ victimEntityId, victimKindBit, cause, shieldWasEmpty }, content) => {
    if (cause === 'parked') return silent('parked');
    const slot = shieldWasEmpty ? 4 : 3;
    return {
      action: 'hit', dispatch: 4, entityId: victimEntityId, slot,
      sound: slotSound(content, victimKindBit, slot, 'hit.victimKindBit'), voiceClass: 2, preempt: true,
    };
  },
  // Slot 4 comes from the hit; a removed object's exit is its `object-retired`.
  'object-destroyed': noSound,
  'explosion-started': presentation,
  'missile-ended': noSound,
  'fragment-expired': noSound,
  'source-released': noSound,
  'energy-depleted': noSound,
  'energy-allocation-changed': played(EVENT_SOUNDS.keyCommand),
  // Only a command's page change posts 10485; a direct page write does not (A-10).
  'left-page-changed': ({ commandIndex }) => (commandIndex === null ? silent('condition') : byId(EVENT_SOUNDS.keyCommand)),
  'map-toggled': noSound,
  // Once per event, also at an unchanged point (MW-05).
  'warp-destination-set': played(EVENT_SOUNDS.mapDestination),
  'warp-started': played(EVENT_SOUNDS.warpStart),
  'warp-completed': ({ arrival }) => (arrival?.hostileNear ? byId(EVENT_SOUNDS.warpArrival) : silent('condition')),
  // A communications command's 10485 is its `left-page-changed`'s.
  'command-delivered': noSound,
  'radio-queued': noSound,
  'radio-taken': noSound,
  'incoming-started': () => silent('out-of-slice'),
  'incoming-ended': noSound,
  'radio-flushed': noSound,
  'docking-requested': noSound,
  'docking-cancelled': noSound,
  docked: stopAll,
  departed: stopAll,
  transition: noSound,
  // Also at either end of the list (`moved` false) and without a base service (A-10).
  'base-navigated': played(EVENT_SOUNDS.baseSelectKey),
  'base-confirmed': played(EVENT_SOUNDS.baseExecuteKey),
  'wingman-command-consumed': noSound,
  // Emitted only for the audible path, an active creator's `b` (CR-20).
  'transponder-deployed': played(EVENT_SOUNDS.transponderCreated),
  'all-clear': noSound,
  'settlement-started': noSound,
  'settlement-deferred': noSound,
  'flight-message': noSound,
  // The destruction view stops nothing (A-08).
  'player-loss-started': noSound,
  'player-rescued': stopAll,
  'result-latched': stopAll,
  'teardown-started': stopAll,
  'mission-completed': noSound,
  'wingman-loss-timer-started': noSound,
  'wingman-loss-timer-expired': noSound,
  'explosion-created': presentation,
  'view-switched': ({ viewMode }) => (viewMode === WARP_VIEW_MODE ? { action: 'hud-input' } : silent('condition')),
  'warp-wall-contact': noSound,
  'object-retired': ({ entityId, kindBit }) => {
    const dispatch = dispatchTypeOfKind(kindBit);
    return { action: 'retire', dispatch, entityId, stopsVoices: dispatch !== null && !hasKind(UNSTOPPED_KINDS, kindBit) };
  },
};

/** What `event`, the `index`th event of its tick, means for sound (DW-06), resolved against `content`. */
export function readEventSound(content: FlightSoundContent, event: DomainEvent, index: number): EventSoundItem {
  const reading = READINGS[event.type] as Reading<DomainEventType>;
  return Object.freeze({ ...reading(event, content), tick: event.tick, index, event }) as EventSoundItem;
}

/** One tick's events read for sound (DW-06, DW-09); an event of another tick is a contract error. */
export function readTickEventSounds(content: FlightSoundContent, { tick, events }: Pick<TickOutput, 'tick' | 'events'>): TickEventSounds {
  const items = events.map(({ event }, index) => {
    if (event.tick !== tick) throw new FlightSoundEventError('tick-mismatch', `events[${index}].tick`, `is ${event.tick}, not the output's tick ${tick}`);
    return readEventSound(content, event, index);
  });
  return Object.freeze({ tick, stopAll: items.some(({ action }) => action === 'stop-all'), items: Object.freeze(items) });
}
