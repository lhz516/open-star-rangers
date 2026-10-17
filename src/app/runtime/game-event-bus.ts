/**
 * Post-frame Event Bus of the formal Runtime (docs/plan/p3/04/spec.md, Runtime: 帧后事件). Only the Runtime that owns
 * it dispatches, once per frame after simulation, every event of that frame by tick and emission order. Each
 * dispatch calls the receivers registered when it starts: a subscription made during it takes effect from the next
 * frame, a cancellation at once. Receivers are synchronous; one that throws or returns anything but undefined (a
 * Promise, for instance) does not stop the others, and the failures are reported together afterwards without undoing
 * anything.
 */
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { GameRuntimeError } from './runtime-errors.ts';

/** Only a submitted command's own `command-result` carries its ID; automatic fire and other events carry null. */
export interface EventDelivery {
  readonly commandId: number | null;
}

export type GameEventListener<E extends DomainEvent = DomainEvent> = (event: E, delivery: EventDelivery) => undefined;

export interface PendingDelivery {
  readonly event: DomainEvent;
  readonly commandId: number | null;
}

const NO_COMMAND: EventDelivery = Object.freeze({ commandId: null });

export type DomainEventType = DomainEvent['type'];

/** Exactly the Core event types: a new DomainEvent variant fails to compile here until it is listed. */
const EVENT_TYPES = {
  'command-result': true,
  'object-instantiated': true,
  'speed-assist-toggled': true,
  'speed-matched': true,
  'speed-assist-released': true,
  'object-left-world': true,
  'target-changed': true,
  'target-cleared': true,
  'weapon-selected': true,
  'shot-fired': true,
  hit: true,
  'object-destroyed': true,
  'explosion-started': true,
  'missile-ended': true,
  'fragment-expired': true,
  'source-released': true,
  'energy-depleted': true,
  'energy-allocation-changed': true,
  'left-page-changed': true,
  'map-toggled': true,
  'warp-destination-set': true,
  'warp-started': true,
  'warp-completed': true,
  'command-delivered': true,
  'radio-queued': true,
  'radio-taken': true,
  'incoming-started': true,
  'incoming-ended': true,
  'radio-flushed': true,
  'docking-requested': true,
  'docking-cancelled': true,
  docked: true,
  departed: true,
  transition: true,
  'base-navigated': true,
  'base-confirmed': true,
  'wingman-command-consumed': true,
  'transponder-deployed': true,
  'explosion-created': true,
  'view-switched': true,
  'warp-wall-contact': true,
} as const satisfies Record<DomainEventType, true>;

function hasType<T extends DomainEventType>(event: DomainEvent, type: T): event is Extract<DomainEvent, { type: T }> {
  return event.type === type;
}

export class GameEventBus {
  readonly #listeners = new Map<symbol, GameEventListener>();

  on<T extends DomainEventType>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>): () => void {
    if (typeof type !== 'string' || !Object.hasOwn(EVENT_TYPES, type)) {
      throw new GameRuntimeError({ kind: 'invalid-argument', path: 'on.type', reason: 'must be a known domain event type' });
    }
    requireListener(listener, 'on.listener');
    return this.#add((event, delivery) => (hasType(event, type) ? listener(event, delivery) : undefined));
  }

  onAny(listener: GameEventListener): () => void {
    requireListener(listener, 'onAny.listener');
    return this.#add(listener);
  }

  clear(): void {
    this.#listeners.clear();
  }

  /** Delivers `batch` to every receiver; throws listener-failed after the whole batch if any receiver threw. */
  dispatch(batch: readonly PendingDelivery[]): void {
    const listeners = [...this.#listeners];
    const errors: unknown[] = [];
    for (const { event, commandId } of batch) {
      const delivery = commandId === null ? NO_COMMAND : Object.freeze({ commandId });
      for (const [id, listener] of listeners) {
        if (!this.#listeners.has(id)) continue;
        try {
          const result: unknown = listener(event, delivery);
          if (result !== undefined) {
            // Reported here; a later rejection of the returned value would otherwise go unhandled.
            Promise.resolve(result).catch(() => undefined);
            errors.push(new TypeError('An event receiver must be synchronous and return undefined'));
          }
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length > 0) throw new GameRuntimeError({ kind: 'listener-failed', errors });
  }

  #add(listener: GameEventListener): () => void {
    const id = Symbol();
    this.#listeners.set(id, listener);
    return () => { this.#listeners.delete(id); };
  }
}

function requireListener(listener: unknown, path: string): void {
  if (typeof listener !== 'function') throw new GameRuntimeError({ kind: 'invalid-argument', path, reason: 'must be a synchronous function' });
}
