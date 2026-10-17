import type { DomainEvent } from '../../core/contracts/domain-events.ts';

// One event of each P3-07 type (docs/plan/p3/02/spec.md, CR-06) and of each P3-09 type (MW-05), with made-up values in
// the shapes Core emits, for the tests of the Runtime's Event Bus and the development event log.

const at = (x: number, y: number, z: number) => Object.freeze({ x, y, z });
const SOURCE = Object.freeze({ collection: 'mission', index: 2, group: null });
const SHOOTER = Object.freeze({ type: 'shooter', entityId: 1, kindBit: 0 });

/** In the order of their types in the DomainEvent union. */
export const COMBAT_EVENTS: readonly DomainEvent[] = Object.freeze(([
  { type: 'target-changed', tick: 5, playerEntityId: 1, previousTarget: null, target: 14, targetKindBit: 7, mode: 'enemy', origin: 'command', commandIndex: 2 },
  { type: 'target-cleared', tick: 5, playerEntityId: 1, previousTarget: 14, cause: 'invalid' },
  { type: 'weapon-selected', tick: 5, entityId: 1, list: 1, index: 0, mount: 2, changed: false, commandIndex: null },
  {
    type: 'shot-fired', tick: 5, shooterEntityId: 1, shooterKindBit: 0, shooterPosition: at(1, 2, 3), shooterForward: at(0, 0, 1), shooterSpeed: 64,
    entityId: 20, family: 'gun', weapon: 1, mount: 0, position: at(1.5, 2, 3), trigger: Object.freeze({ type: 'command', channel: 'primary', commandIndex: 0 }),
  },
  {
    type: 'hit', tick: 5, victimEntityId: 14, victimKindBit: 7, victimPosition: at(4, 5, 6), victimForward: at(0, 1, 0), victimSpeed: 32, cause: 'projectile', sourceEntityId: 20, attacker: SHOOTER,
    damage: 12, gated: false, shield: Object.freeze({ before: 30, after: 18 }), hull: Object.freeze({ before: 50, after: 50 }), shieldWasEmpty: false,
    impact: Object.freeze({ point: at(4, 5, 5), local: at(0, 0, -1), face: 4 }), projectile: 'removed',
  },
  {
    type: 'object-destroyed', tick: 5, entityId: 14, kindBit: 7, source: SOURCE, position: at(4, 5, 6), activity: 'active', attacker: SHOOTER,
    eventClass: 0, outcome: 'explodes',
  },
  { type: 'explosion-started', tick: 5, entityId: 21, sourceEntityId: 14, sourceKindBit: 7, variant: 'large', position: at(4, 5, 6), activationClock: 10 },
  {
    type: 'missile-ended', tick: 5, entityId: 22, shooterEntityId: null, outcome: 'fizzled', position: at(7, 8, 9),
    orientation: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  },
  { type: 'fragment-expired', tick: 5, entityId: 23, sourceKindBit: 0, part: 0, position: at(1, 1, 1), outcome: 'escape-pod' },
  { type: 'source-released', tick: 5, entityId: 1, kindBit: 0, fragmentEntityId: 23, removed: false },
  { type: 'energy-depleted', tick: 5, entityId: 1, kindBit: 0, position: at(1, 2, 3) },
  { type: 'energy-allocation-changed', tick: 5, entityId: 1, shieldLevel: 2, chargeLevel: 1, commandIndex: 3 },
  { type: 'left-page-changed', tick: 5, page: 1, previousPage: 0, commandIndex: null },
] satisfies DomainEvent[]).map((event) => Object.freeze(event)));

/** P3-09's map and Warp events, in the order of their types in the DomainEvent union. */
export const MAP_WARP_EVENTS: readonly DomainEvent[] = Object.freeze(([
  { type: 'map-toggled', tick: 6, open: true, viewMode: 8, previousViewMode: 0xc, commandIndex: 0 },
  {
    type: 'warp-destination-set', tick: 7, playerEntityId: 1, destination: at(-45000, 2250, 3), pixel: Object.freeze({ column: 0, row: 210 }),
    icon: Object.freeze({ entityId: 14, kindBit: 7 }), marker: Object.freeze({ type: 'created', entityId: 30 }), commandIndex: 1,
  },
  {
    type: 'warp-started', tick: 8, playerEntityId: 1, serial: 1, origin: at(1, 2, 3), destination: at(-45000, 2250, 3), distance: 45100.5,
    check: Object.freeze({ cost: 90, energy: 1000 }), transitLength: 3.5, fromViewMode: 8, commandIndex: 0,
  },
  { type: 'warp-completed', tick: 20, serial: 1, viewMode: 0xc, previousViewMode: 1, arrival: null },
] satisfies DomainEvent[]).map((event) => Object.freeze(event)));
