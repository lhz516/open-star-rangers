import type { DomainEvent } from '../core/synthetic-scene.ts';
import { GameRuntimeError } from './runtime-errors.ts';

export interface EventDelivery {
  readonly commandId: number;
}

export type EventListener<E extends DomainEvent = DomainEvent> = (event: E, delivery: EventDelivery) => undefined;

export interface PendingDelivery {
  readonly event: DomainEvent;
  readonly delivery: EventDelivery;
}

function hasType<T extends DomainEvent['type']>(event: DomainEvent, type: T): event is Extract<DomainEvent, { type: T }> {
  return event.type === type;
}

/** Owned by one Runtime. Only the Runtime may dispatch a completed frame's events. */
export class SyntheticEventBus {
  readonly #listeners = new Map<symbol, EventListener>();

  on<T extends DomainEvent['type']>(type: T, listener: EventListener<Extract<DomainEvent, { type: T }>>): () => void {
    if (type !== 'marker-added' && type !== 'marker-removed' && type !== 'command-rejected') {
      throw new GameRuntimeError({ kind: 'invalid-argument', path: 'on.type', reason: 'must be a known domain event type' });
    }
    this.#requireListener(listener, 'on.listener');
    return this.#add((event, delivery) => {
      if (hasType(event, type)) listener(event, delivery);
    });
  }

  onAny(listener: EventListener): () => void {
    this.#requireListener(listener, 'onAny.listener');
    return this.#add(listener);
  }

  clear(): void {
    this.#listeners.clear();
  }

  dispatch(batch: readonly PendingDelivery[]): void {
    const listeners = [...this.#listeners];
    const errors: unknown[] = [];
    for (const { event, delivery } of batch) {
      const metadata = Object.freeze({ commandId: delivery.commandId });
      for (const [id, listener] of listeners) {
        if (!this.#listeners.has(id)) continue;
        try {
          listener(event, metadata);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length > 0) throw new GameRuntimeError({ kind: 'listener-failed', errors });
  }

  #add(listener: EventListener): () => void {
    const id = Symbol();
    this.#listeners.set(id, listener);
    return this.#listeners.delete.bind(this.#listeners, id);
  }

  #requireListener(listener: unknown, path: string): void {
    if (typeof listener !== 'function') throw new GameRuntimeError({ kind: 'invalid-argument', path, reason: 'must be a synchronous function' });
  }
}
