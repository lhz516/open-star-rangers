/**
 * The object event `0x6977c` (docs/plan/p3/02/spec.md, ME-04, ME-08; docs/original/formats/executable.md, object events
 * `0x6977c`, P3-11/02): the section-2 counters of the trigger the object's own source record names. Its callers are the
 * three normal-play sites of CR-13, each at the place of its event:
 * - damage.ts, the destruction in `0x2a694`: right after `0x3c0f4` and `object-destroyed`, with its event class (0 the
 *   player's kill, 1 any other);
 * - area.ts, the world exit of the parked travel: right after `object-left-world`, type 2 (never the wingman);
 * - spawn.ts, instantiation `0x67938`: its last step, type 3.
 *
 * An object without a source (missiles, projectiles, explosions, fragments, dynamic Xpon, map markers) does nothing,
 * so their removal, and the teardown's, which reports nothing, never counts. The player and the declared objects count
 * when their declaration names a trigger; a wingman option never does. The per-kind rows `0x1b45b4`, the player's
 * kill tally `0x1b46ec`, the appearance flags `0x176744`/`0x176748` and the sector bookkeeping `0x6a2b0` have no reader
 * in this task and are not modelled (ME-01). Spawn pairs are rejected at the raw parsing boundary.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity } from '../world/entity-table.ts';
import type { MissionEventCounts } from '../world/world-state.ts';
import type { TickContext } from './pipeline.ts';

/** `0x6977c`'s type: 0 destroyed by the player, 1 destroyed otherwise, 2 left the world, 3 instantiated. */
export type ObjectEventType = 0 | 1 | 2 | 3;

const COUNTER: Readonly<Record<ObjectEventType, keyof MissionEventCounts>> = { 0: 'destroyed', 1: 'destroyed', 2: 'left', 3: 'instantiated' };

/** `0x6977c(entity, type)`: one more event of `type` on the trigger of `entity`'s source declaration, if it names one. */
export function reportObjectEvent(context: TickContext, entity: Entity, type: ObjectEventType): void {
  const { world } = context;
  const { source } = entity;
  if (source === null) return;
  const declaration = (source.collection === 'mission' ? world.setup.declarations : world.setup.wingmanOptions)[source.index];
  if (declaration === undefined) throw new CoreFaultError('invariant-violated', 'mission-events.source');
  if (declaration.eventTrigger === null) return;
  const counts = world.missionEvents.triggers[declaration.eventTrigger];
  if (counts === undefined) throw new CoreFaultError('invariant-violated', 'mission-events.trigger');
  const counter = COUNTER[type];
  // Every count is at most the run's instantiations, far below the i32 range (ME-04).
  if (counts[counter] >= 0x7fff_ffff) throw new CoreFaultError('invariant-violated', 'mission-events.count');
  counts[counter] += 1;
}
