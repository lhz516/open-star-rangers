/**
 * The sound log of the development diagnostics (docs/plan/p3/14/spec.md, 声音状态与开发诊断; S-09, AC-12): each decision of
 * the run's flight sound consumer, as its `record` option gives it, with the owner and run, tick, clock, the index of the
 * event that caused it, the Asset, the source key, the class, the result with its code, the initial parameters and the
 * voice a play cut. No sample, name, imported text or coordinate. It keeps the latest decisions in the P3-04 log's window
 * (`EVENT_LOG_LIMIT`), drops the oldest beyond that and says so: a development display window, not the original's
 * capacity or a performance threshold. Development builds only, like everything under `ui/dev`.
 */
import type { FlightSoundDecision } from '../../app/flight-audio/consumer.ts';
import type { VoiceSource } from '../../app/flight-audio/voices.ts';
import { EVENT_LOG_LIMIT, RingLog, type RingLogView } from './event-log.ts';

export const SOUND_LOG_LIMIT = EVENT_LOG_LIMIT;

export interface SoundLogEntry extends FlightSoundDecision {
  /** 1 for the first decision logged since the log was last cleared. */
  readonly sequence: number;
}

/** At most SOUND_LOG_LIMIT entries. */
export type SoundLogView = RingLogView<SoundLogEntry>;

/** `entity 12 slot 0`, `effect e7`, `cue lock-loop` or `by-id`. */
export function describeVoiceSource(source: VoiceSource): string {
  switch (source.namespace) {
    case 'entity':
      return `entity ${source.id} slot ${source.slot}`;
    case 'effect':
      return `effect ${source.id}`;
    case 'cue':
      return `cue ${source.cue}`;
    case 'by-id':
      return 'by-id';
  }
}

/** One line of the panel: `owner 1 run 2 · tick 40 · clock 80 · event #3 · 10401 · entity 5 slot 0 · class 1 · started …`. */
export function describeSoundDecision(entry: FlightSoundDecision): string {
  const { ownerId, runId, tick, clock, trigger, sound, source, voiceClass, result, code, parameters, preempted } = entry;
  const parts = [
    `owner ${ownerId} run ${runId}`,
    `tick ${tick}`,
    `clock ${clock}`,
    trigger === null ? 'no event' : `event #${trigger}`,
    sound ?? 'no sound',
    source === null ? 'every voice' : describeVoiceSource(source),
  ];
  if (voiceClass !== null) parts.push(`class ${voiceClass}`);
  parts.push(code === null ? result : `${result} (${code})`);
  if (parameters !== null) {
    const values = (['volume', 'pan', 'rate'] as const).filter(name => parameters[name] !== undefined).map(name => `${name}=${parameters[name]}`);
    if (values.length > 0) parts.push(values.join(' '));
  }
  if (preempted !== null) parts.push(`cut ${describeVoiceSource(preempted)}`);
  return parts.join(' · ');
}

/** The sound log's ring of SOUND_LOG_LIMIT decisions. */
export class SoundLog {
  readonly #log = new RingLog<SoundLogEntry>(SOUND_LOG_LIMIT);

  append(decision: FlightSoundDecision): void {
    this.#log.append(sequence => Object.freeze({ ...decision, sequence }));
  }

  clear(): void {
    this.#log.clear();
  }

  view(): SoundLogView {
    return this.#log.view();
  }
}
