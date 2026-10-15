/**
 * The event log of the development diagnostics (docs/plan/p3/04/spec.md: 开发诊断, 事件日志): a structured summary of
 * each domain event a run delivers, with its tick, type, main fields and commandId. It keeps the latest
 * EVENT_LOG_LIMIT entries, drops the oldest beyond that and says so, and holds no snapshot history. The limit is a
 * development display window, not a performance or gameplay threshold.
 */
import type { EventDelivery } from '../../app/runtime/game-event-bus.ts';
import type { Attacker, DomainEvent, ShotTrigger, Vec3 } from '../../core/contracts/domain-events.ts';
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

type Fields = (readonly [string, EventFieldValue])[];

const positionOf = ({ x, y, z }: Vec3): Fields => [['x', x], ['y', y], ['z', z]];
/** `originX`, `originY`, `originZ` for `origin`. */
const namedPosition = (name: string, { x, y, z }: Vec3): Fields => [[`${name}X`, x], [`${name}Y`, y], [`${name}Z`, z]];

/** `shooter 12 kind 7`, `lost-shooter` or `none`. */
function describeAttacker(attacker: Attacker): string {
  return attacker.type === 'shooter' ? `shooter ${attacker.entityId} kind ${attacker.kindBit}` : attacker.type;
}

/** `command primary #2`, `ai 1` or `automatic`. */
function describeTrigger(trigger: ShotTrigger): string {
  switch (trigger.type) {
    case 'command':
      return `command ${trigger.channel} #${trigger.commandIndex}`;
    case 'ai':
      return `ai ${trigger.channel}`;
    case 'automatic':
      return 'automatic';
  }
}

function fieldsOf(event: DomainEvent): Fields {
  switch (event.type) {
    case 'command-result':
      return [['commandIndex', event.commandIndex], ['commandType', event.commandType], ['outcome', event.outcome], ['reason', event.reason]];
    case 'object-instantiated':
      return [['entityId', event.entityId], ['kindBit', event.kindBit], ['source', describeSource(event.source)], ...positionOf(event.position)];
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
    case 'target-changed':
      return [
        ['target', event.target], ['targetKindBit', event.targetKindBit], ['previousTarget', event.previousTarget], ['mode', event.mode],
        ['origin', event.origin], ['commandIndex', event.commandIndex],
      ];
    case 'target-cleared':
      return [['previousTarget', event.previousTarget], ['cause', event.cause]];
    case 'weapon-selected':
      return [['entityId', event.entityId], ['list', event.list], ['index', event.index], ['mount', event.mount], ['changed', event.changed], ['commandIndex', event.commandIndex]];
    case 'shot-fired':
      return [
        ['shooterEntityId', event.shooterEntityId], ['shooterKindBit', event.shooterKindBit], ['entityId', event.entityId], ['family', event.family],
        ['weapon', event.weapon], ['mount', event.mount], ['trigger', describeTrigger(event.trigger)], ...positionOf(event.position),
      ];
    case 'hit':
      return [
        ['victimEntityId', event.victimEntityId], ['victimKindBit', event.victimKindBit], ['cause', event.cause], ['sourceEntityId', event.sourceEntityId],
        ['attacker', describeAttacker(event.attacker)], ['damage', event.damage], ['gated', event.gated], ['shieldBefore', event.shield.before],
        ['shieldAfter', event.shield.after], ['hullBefore', event.hull.before], ['hullAfter', event.hull.after], ['projectile', event.projectile],
      ];
    case 'object-destroyed':
      return [
        ['entityId', event.entityId], ['kindBit', event.kindBit], ['source', describeSource(event.source)], ['activity', event.activity],
        ['attacker', describeAttacker(event.attacker)], ['outcome', event.outcome], ...positionOf(event.position),
      ];
    case 'explosion-started':
      return [['entityId', event.entityId], ['sourceEntityId', event.sourceEntityId], ['sourceKindBit', event.sourceKindBit], ['variant', event.variant], ...positionOf(event.position)];
    case 'missile-ended':
      return [['entityId', event.entityId], ['shooterEntityId', event.shooterEntityId], ['outcome', event.outcome], ...positionOf(event.position)];
    case 'fragment-expired':
      return [['entityId', event.entityId], ['sourceKindBit', event.sourceKindBit], ['part', event.part], ['outcome', event.outcome], ...positionOf(event.position)];
    case 'source-released':
      return [['entityId', event.entityId], ['kindBit', event.kindBit], ['fragmentEntityId', event.fragmentEntityId], ['removed', event.removed]];
    case 'energy-depleted':
      return [['entityId', event.entityId], ['kindBit', event.kindBit], ...positionOf(event.position)];
    case 'energy-allocation-changed':
      return [['entityId', event.entityId], ['shieldLevel', event.shieldLevel], ['chargeLevel', event.chargeLevel], ['commandIndex', event.commandIndex]];
    case 'left-page-changed':
      return [['page', event.page], ['previousPage', event.previousPage], ['commandIndex', event.commandIndex]];
    // P3-09's (docs/plan/p3/02/spec.md, MW-05), every field: the main position as x, y, z, the others by their name.
    case 'map-toggled':
      return [['open', event.open], ['viewMode', event.viewMode], ['previousViewMode', event.previousViewMode], ['commandIndex', event.commandIndex]];
    case 'warp-destination-set': {
      const { marker } = event;
      return [
        ['playerEntityId', event.playerEntityId], ['column', event.pixel.column], ['row', event.pixel.row], ['iconEntityId', event.icon?.entityId ?? null],
        ['iconKindBit', event.icon?.kindBit ?? null], ['marker', marker.type], ['markerEntityId', marker.type === 'missing' ? null : marker.entityId],
        ['commandIndex', event.commandIndex], ...positionOf(event.destination),
      ];
    }
    case 'warp-started':
      return [
        ['playerEntityId', event.playerEntityId], ['serial', event.serial], ['distance', event.distance], ['cost', event.check.cost],
        ['energy', event.check.energy], ['transitLength', event.transitLength], ['fromViewMode', event.fromViewMode], ['commandIndex', event.commandIndex],
        ...namedPosition('origin', event.origin), ...namedPosition('destination', event.destination),
      ];
    case 'warp-completed': {
      const { arrival } = event;
      const fields: Fields = [['serial', event.serial], ['viewMode', event.viewMode], ['previousViewMode', event.previousViewMode], ['arrived', arrival !== null]];
      if (arrival === null) return fields;
      const { charge } = arrival;
      return [
        ...fields, ['playerEntityId', arrival.playerEntityId], ['error', arrival.error], ['snapped', arrival.snapped],
        ['chargeDistance', charge.distance], ['chargeCost', charge.cost], ['energyBefore', charge.energyBefore], ['energyAfter', charge.energyAfter],
        ['warpClock', arrival.warpClock], ['hostileNear', arrival.hostileNear], ...positionOf(arrival.position),
        ['orientation', arrival.orientation.join(' ')], ...namedPosition('origin', arrival.origin), ...namedPosition('destination', arrival.destination),
      ];
    }
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
