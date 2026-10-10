/**
 * The event log of the development diagnostics (docs/plan/p3/04/spec.md: 开发诊断, 事件日志): a structured summary of
 * each domain event a run delivers, with its tick, type, main fields and commandId. It keeps the latest
 * EVENT_LOG_LIMIT entries, drops the oldest beyond that and says so, and holds no snapshot history. The limit is a
 * development display window, not a performance or gameplay threshold.
 */
import type { EventDelivery } from '../../app/runtime/game-event-bus.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { describeSource } from './entity-inspection.ts';

export const EVENT_LOG_LIMIT = 500;

export type EventFieldValue = string | number | boolean | null;

export interface EventLogEntry {
  /** 1 for the first event logged since the log was last cleared. */
  readonly sequence: number;
  readonly tick: number;
  readonly type: DomainEvent['type'];
  /** The submitted command's ID for its own `command-result`; null otherwise. */
  readonly commandId: number | null;
  /** The event's main fields in a fixed order. */
  readonly fields: readonly (readonly [name: string, value: EventFieldValue])[];
}

export interface EventLogView {
  /** Oldest first, at most EVENT_LOG_LIMIT. */
  readonly entries: readonly EventLogEntry[];
  /** Events logged since the last clear, dropped ones included. */
  readonly total: number;
  /** Older entries were dropped. */
  readonly truncated: boolean;
}

function fieldsOf(event: DomainEvent): (readonly [string, EventFieldValue])[] {
  switch (event.type) {
    case 'command-result':
      return [['commandIndex', event.commandIndex], ['commandType', event.commandType], ['outcome', event.outcome], ['reason', event.reason]];
    case 'object-instantiated': {
      const { x, y, z } = event.position;
      return [['entityId', event.entityId], ['kindBit', event.kindBit], ['source', describeSource(event.source)], ['x', x], ['y', y], ['z', z]];
    }
    case 'speed-assist-toggled':
      return [['commandIndex', event.commandIndex], ['enabled', event.enabled]];
    case 'speed-matched':
      return event.origin === 'command'
        ? [['targetEntityId', event.targetEntityId], ['origin', event.origin], ['commandIndex', event.commandIndex]]
        : [['targetEntityId', event.targetEntityId], ['origin', event.origin], ['speedDifferenceExceeded', event.speedDifferenceExceeded]];
    case 'speed-assist-released':
      return [];
    case 'object-left-world':
      return [['entityId', event.entityId], ['kindBit', event.kindBit], ['source', describeSource(event.source)]];
  }
}

/** The summary of one delivered event. */
export function summarizeEvent(event: DomainEvent, { commandId }: EventDelivery, sequence: number): EventLogEntry {
  const fields = fieldsOf(event);
  for (const field of fields) Object.freeze(field);
  Object.freeze(fields);
  return Object.freeze({ sequence, tick: event.tick, type: event.type, commandId, fields });
}

const EMPTY_VIEW: EventLogView = Object.freeze({ entries: Object.freeze([]), total: 0, truncated: false });

/** A ring of EVENT_LOG_LIMIT entries; `view()` returns the same frozen object until the log changes. */
export class EventLog {
  readonly #ring: EventLogEntry[] = [];
  /** The ring index of the oldest entry once the ring is full. */
  #oldest = 0;
  #total = 0;
  #view: EventLogView | null = EMPTY_VIEW;

  append(event: DomainEvent, delivery: EventDelivery): void {
    const entry = summarizeEvent(event, delivery, ++this.#total);
    if (this.#ring.length < EVENT_LOG_LIMIT) {
      this.#ring.push(entry);
    } else {
      this.#ring[this.#oldest] = entry;
      this.#oldest = (this.#oldest + 1) % EVENT_LOG_LIMIT;
    }
    this.#view = null;
  }

  clear(): void {
    this.#ring.length = 0;
    this.#oldest = 0;
    this.#total = 0;
    this.#view = EMPTY_VIEW;
  }

  view(): EventLogView {
    this.#view ??= Object.freeze({
      entries: Object.freeze([...this.#ring.slice(this.#oldest), ...this.#ring.slice(0, this.#oldest)]),
      total: this.#total,
      truncated: this.#total > EVENT_LOG_LIMIT,
    });
    return this.#view;
  }
}
