import type { AssetId } from '../../content/asset-id.ts';
import type { CombatPlayer, ThreatWarnings } from '../../core/projections/projection.ts';
import { BASE_VIEW_MODE, MAP_VIEW_MODE, WARP_VIEW_MODE } from '../../core/systems/view-switch.ts';
import { COCKPIT_VIEW_MODE } from '../../core/world/player-state.ts';
import type { PlayFailureCode } from '../../platform/audio/audio-controller.ts';
import type { TickOutput } from '../runtime/game-runtime.ts';
import type { VoiceHandle, VoiceLedger, VoicePlayResult, VoiceRequest, VoiceSource } from './voices.ts';

// The sound side of the two HUD cues (P3-14 S-06, D-02 DW-10; subtask 14): the lock tone and the instrument-9 warning
// of docs/original/formats/audio.md, "Lock tone (A-06)" and "Instrument-9 warning (A-07)". One instance per run starts
// from the original's initial values (D2-12). It reads each tick's frozen projection only, never the cockpit's state
// (P3-13 DD-01), and plays through the run's voice ledger; it reads no host time and draws no random numbers.
//
// Handles stay set when a voice ends for an in-game reason (natural end, preemption, a stop of every voice), so an
// unchanged condition does not restart it, as in the original. After a project-specific interruption (D1-08 (c)) the
// loop that should be sounding is rebuilt at the next call, a pulse never: a voice the ledger reports `interrupted`,
// or a lock loop whose start the controller rejected while it could not play, retried until it can.

/** The HUD cues' sounds (P3-03 Asset table): SND 10455, 10457 and 10409. */
export const HUD_CUE_SOUNDS = Object.freeze({
  lockLoop: 'sound/hud/overlay-loop' as AssetId,
  lockPulse: 'sound/hud/overlay-pulse' as AssetId,
  instrument9: 'sound/hud/instrument-9-loop' as AssetId,
});

const DESTRUCTION_VIEW_MODE = 0x11;
const DESTRUCTION_SUB_MODE = 8;
/** The original's views 1, 6, 8 and 0xC–0x12 that the project supports (DW-10); not 0x13. */
const INSTRUMENT_9_VIEW_MODES: ReadonlySet<number> = new Set([WARP_VIEW_MODE, BASE_VIEW_MODE, MAP_VIEW_MODE, COCKPIT_VIEW_MODE, DESTRUCTION_VIEW_MODE]);
/** The lock tone's value for no live target, and its initial previous value. */
const NO_LOCK = -1;

// A-06: both class 4 and preempting, at their stored parameters. A-07: class 4 without preemption; the missile voice
// about an octave up at full volume, the craft voice at volume 50 and its stored rate, given before the start.
const cueRequest = (cue: Extract<VoiceSource, { namespace: 'cue' }>['cue'], sound: AssetId, preempt: boolean, parameters?: VoiceRequest['parameters']): VoiceRequest =>
  Object.freeze({ source: Object.freeze({ namespace: 'cue', cue }), sound, voiceClass: 4, preempt, ...(parameters && { parameters: Object.freeze(parameters) }) });
const LOCK_LOOP = cueRequest('lock-loop', HUD_CUE_SOUNDS.lockLoop, true);
const LOCK_PULSE = cueRequest('lock-pulse', HUD_CUE_SOUNDS.lockPulse, true);
const MISSILE_WARNING = cueRequest('instrument-9-missile', HUD_CUE_SOUNDS.instrument9, false, { rate: 22_000, volume: 127 });
const CRAFT_WARNING = cueRequest('instrument-9-craft', HUD_CUE_SOUNDS.instrument9, false, { volume: 50 });

/** The rejections that mean the controller cannot play yet rather than a sound result (D1-08 (c)). */
const NOT_PLAYABLE_YET: ReadonlySet<PlayFailureCode> = new Set(['audio-locked', 'audio-suspended', 'audio-unavailable', 'audio-paused']);

/** What the cues read of one tick's output (P3-04); the consumer passes the `TickOutput` itself. */
export type HudCueTick = Pick<TickOutput, 'tick' | 'projection' | 'events'>;

export interface HudCues {
  /** DW-04 step 1, before the tick's dispatch: each `view-switched` into the Warp view calls the lock tone with −1. */
  beforeDispatch(output: HudCueTick): void;
  /** DW-04 step 4, after the tick's dispatch: the lock tone, then the instrument-9 warning, each in its views. */
  afterDispatch(output: HudCueTick): void;
}

const handleOf = (result: VoicePlayResult): VoiceHandle | null => result.status === 'started' ? result.handle : null;
const notPlayableYet = (result: VoicePlayResult): boolean => result.status === 'failed' && NOT_PLAYABLE_YET.has(result.code);

class Cues implements HudCues {
  readonly #ledger: VoiceLedger;
  /** The last tick a call advanced, and whether its after-dispatch step ran. */
  #tick = -1;
  #dispatched = true;
  // A-06: `0x175b14`, `0x175b18`, `0x175994`, `0x175990`.
  #lockValue = NO_LOCK;
  #pulseDue = 0;
  #loop: VoiceHandle | null = null;
  #pulse: VoiceHandle | null = null;
  /** The loop's start was rejected while the controller could not play: retried while the value holds at 0. */
  #loopPending = false;
  // A-07: `0x175f20` and `0x175f1c`.
  #missile: VoiceHandle | null = null;
  #craft: VoiceHandle | null = null;

  constructor(ledger: VoiceLedger) {
    this.#ledger = ledger;
  }

  beforeDispatch({ tick, projection, events }: HudCueTick): void {
    if (tick === this.#tick) return;
    if (tick < this.#tick || !this.#dispatched) throw new Error(`HUD cues: tick ${tick} began after tick ${this.#tick}'s steps were not complete or in order`);
    this.#tick = tick;
    this.#dispatched = false;
    for (const { event } of events) if (event.type === 'view-switched' && event.viewMode === WARP_VIEW_MODE) this.#lockTone(NO_LOCK, projection.clock.clock);
  }

  afterDispatch({ tick, projection }: HudCueTick): void {
    if (tick === this.#tick && this.#dispatched) return;
    if (tick !== this.#tick) throw new Error(`HUD cues: tick ${tick}'s dispatch step came without its before-dispatch step`);
    this.#dispatched = true;
    const { player: { viewMode, subMode }, clock: { clock } } = projection;
    if (viewMode === COCKPIT_VIEW_MODE || (viewMode === DESTRUCTION_VIEW_MODE && subMode === DESTRUCTION_SUB_MODE)) {
      const { combat } = projection.flight;
      if (combat.readiness !== 'ready') throw new Error('HUD cues: the flight combat group is not implemented');
      if (combat.player) this.#lockTone(lockToneValue(combat.player), clock);
    }
    if (INSTRUMENT_9_VIEW_MODES.has(viewMode)) {
      const { communications } = projection;
      if (communications.readiness !== 'ready') throw new Error('HUD cues: the communications partition is not implemented');
      this.#instrument9(communications.warnings);
    }
  }

  /** `0x46ecc` (A-06). */
  #lockTone(value: number, clock: number): void {
    if (value === this.#lockValue) {
      if (value === 0) this.#rebuildLoop();
      return;
    }
    this.#lockValue = value;
    this.#loopPending = false;
    if (value === NO_LOCK) {
      this.#pulse = this.#release(this.#pulse);
      this.#loop = this.#release(this.#loop);
    } else if (value === 0) {
      // An existing loop is not stopped: its handle is overwritten, as in the original.
      if (this.#pulse) this.#ledger.stop(this.#pulse);
      this.#startLoop();
    } else if (this.#pulseDue < clock) {
      if (this.#loop) this.#ledger.stop(this.#loop);
      // The previous pulse's handle is overwritten, not stopped; the due time is set even when the start fails.
      this.#pulse = handleOf(this.#ledger.play(LOCK_PULSE));
      this.#pulseDue = clock + (value >> 1);
    }
  }

  #startLoop(): void {
    const result = this.#ledger.play(LOCK_LOOP);
    this.#loop = handleOf(result);
    this.#loopPending = notPlayableYet(result);
  }

  /** D1-08 (c): the loop the held value 0 keeps sounding, after a project-specific interruption only. */
  #rebuildLoop(): void {
    if (this.#loopPending || (this.#loop && this.#interrupted(this.#loop))) this.#startLoop();
  }

  /** `0x4edf4`'s voices on every call (A-07); a failed start leaves its handle empty and is retried at the next call. */
  #instrument9({ missileIncoming, attackerOnTail }: ThreatWarnings): void {
    if (missileIncoming && this.#missile && this.#interrupted(this.#missile)) this.#missile = null;
    if (attackerOnTail && this.#craft && this.#interrupted(this.#craft)) this.#craft = null;
    if (missileIncoming && !this.#missile) {
      this.#craft = this.#release(this.#craft);
      this.#missile = handleOf(this.#ledger.play(MISSILE_WARNING));
    } else if (!missileIncoming) {
      this.#missile = this.#release(this.#missile);
    }
    // After the missile voice's clear, so the craft voice can take over in the same call.
    if (attackerOnTail && !this.#craft && !this.#missile) this.#craft = handleOf(this.#ledger.play(CRAFT_WARNING));
    else if (!attackerOnTail) this.#craft = this.#release(this.#craft);
  }

  /** Stops a handle's voice, if any, and clears it. */
  #release(handle: VoiceHandle | null): null {
    if (handle) this.#ledger.stop(handle);
    return null;
  }

  #interrupted(handle: VoiceHandle): boolean {
    const state = this.#ledger.query(handle);
    return state.status === 'ended' && state.reason === 'interrupted';
  }
}

/** −1 without a target or for one below state 7, whatever its activity; otherwise the lock progress (W8). */
function lockToneValue({ target, lock }: CombatPlayer): number {
  return target?.activeState ? lock.progress : NO_LOCK;
}

/** A run's HUD cue state at the original's initial values. */
export function createHudCues(ledger: VoiceLedger): HudCues {
  return new Cues(ledger);
}
