/**
 * The imported texts the mission pages show (docs/plan/p3/11/spec.md: 结果页、重试与返回, 数据模型与契约; docs/plan/p3/04/spec.md,
 * 终局与救援衔接（P3-11 的修订）: 结果页): the summary a successful result references, the messages of one section-2 range of
 * the mission Asset, and the flight messages of the message line (P3-13). Both come from the package generation the
 * mission owner bound, decoded lazily, once, with the readers world creation uses. They are app data for the UI: they
 * never enter Core, its snapshots or a recording.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { MissionContent } from '../../content/logic/logic-content.ts';
import type { FlightMessages } from '../../content/rule-data/flight-messages.ts';
import type { SummaryReference } from '../../core/world/world-state.ts';
import { flightMessagesInput, missionInput, type PackageGroup } from './mission-input.ts';

/** Why a summary reference could not be resolved in the bound package. */
export type SummaryFailure =
  /** The reference names another mission Asset than the bound package's: a result of another package. */
  | { readonly kind: 'mission-mismatch'; readonly expected: AssetId; readonly referenced: AssetId }
  /** The trigger or range index lies outside the mission's section-2 table. */
  | { readonly kind: 'out-of-range'; readonly field: 'trigger' | 'range'; readonly index: number; readonly count: number }
  /** The package's mission Asset is missing or does not decode. */
  | { readonly kind: 'content'; readonly cause: unknown };

export type SummaryText =
  /** The result references no summary: a failure, or a success whose ratio matched no range. */
  | { readonly status: 'none' }
  /**
   * The range's messages in array order, appended without separators; empty for a range without messages, which is a
   * valid empty summary. A byte string whose code units are the stored bytes, for a text node, never markup.
   */
  | { readonly status: 'resolved'; readonly text: string }
  | { readonly status: 'failed'; readonly failure: SummaryFailure };

export type FlightMessagesText =
  | { readonly status: 'resolved'; readonly messages: FlightMessages }
  /** The package lacks the Asset (cause undefined) or it does not decode. */
  | { readonly status: 'failed'; readonly cause: unknown };

/** The texts of one bound package generation. */
export interface MissionTexts {
  summary(reference: SummaryReference | null): SummaryText;
  flightMessages(): FlightMessagesText;
}

type Read<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };

/** `read` once, on first use; its value or what it threw. */
function once<Value>(read: () => Value): () => Read<Value> {
  let result: Read<Value> | null = null;
  return () => {
    if (result === null) {
      try {
        result = { ok: true, value: read() };
      } catch (cause) {
        result = { ok: false, cause };
      }
    }
    return result;
  };
}

const failed = (failure: SummaryFailure): SummaryText => Object.freeze({ status: 'failed', failure: Object.freeze(failure) });

/** The item at `index`, or undefined unless it is a whole number within `items`. */
const at = <Item>(items: readonly Item[], index: number): Item | undefined =>
  (Number.isSafeInteger(index) && index >= 0 && index < items.length ? items[index] : undefined);

/**
 * The texts of `logic`, the logic group of the package generation the mission owner bound when it opened; undefined
 * when that package has none. Nothing is decoded until a text is asked for; a decoding error is kept and returned as the
 * failure each later read reports.
 */
export function missionTexts(logic: PackageGroup | undefined): MissionTexts {
  const mission = once(() => {
    const asset = logic && missionInput(logic).mission;
    if (!asset) throw new Error('The bound package has no mission Asset');
    return { id: asset.id, content: asset.content as MissionContent };
  });
  const flight = once(() => (logic && flightMessagesInput(logic))?.content as FlightMessages | undefined);
  return Object.freeze({
    summary(reference: SummaryReference | null): SummaryText {
      if (reference === null) return Object.freeze({ status: 'none' });
      const read = mission();
      if (!read.ok) return failed({ kind: 'content', cause: read.cause });
      const { id, content } = read.value;
      if (reference.mission !== id) return failed({ kind: 'mission-mismatch', expected: id, referenced: reference.mission });
      const triggers = content.eventTriggers;
      const trigger = at(triggers, reference.trigger);
      if (!trigger) return failed({ kind: 'out-of-range', field: 'trigger', index: reference.trigger, count: triggers.length });
      const range = at(trigger.ranges, reference.range);
      if (!range) return failed({ kind: 'out-of-range', field: 'range', index: reference.range, count: trigger.ranges.length });
      return Object.freeze({ status: 'resolved', text: range.messages.join('') });
    },
    flightMessages(): FlightMessagesText {
      const read = flight();
      if (!read.ok) return Object.freeze({ status: 'failed', cause: read.cause });
      return read.value === undefined
        ? Object.freeze({ status: 'failed', cause: undefined })
        : Object.freeze({ status: 'resolved', messages: read.value });
    },
  });
}
