/**
 * The communications menus' builders and key matching (docs/plan/p3/02/spec.md, CB-03 and CB-07;
 * docs/original/formats/comm.md §7; docs/original/formats/executable.md, CD5). They read the entity table and the
 * static menus as they are when a key is handled, draw nothing and change nothing; a menu is never refreshed after it
 * is built (comm §7.5).
 *
 * - **Category menu `0x2c850`:** TABL 2007's items in order up to the exit (kind mask 0); a category is shown when its
 *   object list is not empty at this moment, with a generated key by its position among the shown ones (1 first). The
 *   exit keeps its data key. Only the exit left means no menu: one category and the exit is a menu (no skip here).
 * - **Object list `0x2c9d0`:** the mask's entities walked by ascending kind bit and allocation order (`0x5261c`) whose
 *   state is 7 or above; activity (parked and docked included), the destroyed flag, distance and the player's target
 *   are not read. Each item takes the entity's ID, kind and name, its tone at this moment and a generated key by
 *   position; TABL 2009's exit comes last. An empty list is no list.
 * - **Command menu `0x2cbb4`:** fails when the object no longer resolves. Kind bit 1 (kind 2) takes TABL 2013; a kind
 *   in 0x68000 whose near-menu gate holds TABL 2003; any other TABL 2005. The table's items keep their data keys.
 * - **Near-menu gate `0x394c4(0, target)` with `0x33390` (CD5):** the view is not 0 or 1, the object is active
 *   (activity 1), its squared distance from the player, Σ dᵢ × f32(dᵢ) in double as `0x56b50` forms it, is at most the
 *   f32 1,000,000 (so equality passes), main-flow state 3 and sub-state 0.
 * - **Keys `0x27e10`:** the first item whose key equals the key, both folded A–Z to a–z; duplicates keep their order.
 *
 * Generated keys stay below 10 by world creation's check 2 (comm-input.ts) over every source of the run; a tenth item
 * would break that invariant, which is a fault rather than a truncation.
 */
import { CoreFaultError } from '../errors.ts';
import { foldKey, type CommunicationsRuleData } from '../world/comm-input.ts';
import { isActiveState, type Entity, type EntityId, type EntityTable } from '../world/entity-table.ts';
import type { CategoryValue, CommunicationsMenu, MenuCommandTable, MenuItem, ObjectValue } from '../world/player-state.ts';
import type { MissionFlow } from '../world/world-state.ts';
import { squaredDistance } from './speed-match.ts';

type Menus = CommunicationsRuleData['menus'];
type CategoryMenu = Extract<CommunicationsMenu, { readonly level: 2 }>;
type ObjectList = Extract<CommunicationsMenu, { readonly level: 3 }>;
type CommandMenu = Extract<CommunicationsMenu, { readonly level: 4 }>;

/** The keys `communications close` and `select-number n` stand for: `x` and the digit n. */
export const CLOSE_KEY = 0x78;
export const digitKey = (value: number): number => 0x30 + value;

const EXIT = Object.freeze({ type: 'exit' } as const);

/** The highest generated key position world creation leaves reachable (comm-input.ts, check 2). */
const LAST_GENERATED_POSITION = 9;

/** The generated key of the item at `index` (0 first): the ASCII digit of its position. */
function generatedKey(index: number, site: string): number {
  if (index >= LAST_GENERATED_POSITION) throw new CoreFaultError('invariant-violated', site);
  return digitKey(index + 1);
}

/** The first item whose key matches `key`, both folded; undefined when none does. */
export function matchItem<Value>(items: readonly MenuItem<Value>[], key: number): MenuItem<Value> | undefined {
  const folded = foldKey(key);
  return items.find((item) => foldKey(item.key) === folded);
}

/** An object item's colour at build time: active, otherwise threatened while stamped, otherwise other. */
function tone(entity: Entity): ObjectValue['tone'] {
  if (entity.activity === 'active') return 'active';
  return entity.communications.threatStamp === null ? 'other' : 'threatened';
}

/** The entities an object list of `kindMask` admits, in walk order. */
function* listedEntities(entities: EntityTable, kindMask: number): Generator<Entity, void, undefined> {
  for (const entity of entities.walk(kindMask)) if (isActiveState(entity.state)) yield entity;
}

/** Whether an object list of `kindMask` would have an entity; leaving the loop ends the walk (entity-table.ts). */
function hasListed(entities: EntityTable, kindMask: number): boolean {
  for (const _entity of listedEntities(entities, kindMask)) return true;
  return false;
}

/** `0x2c9d0(kindMask)`: the object list, or null when no entity qualifies. */
export function buildObjectList(entities: EntityTable, menus: Menus, kindMask: number): ObjectList | null {
  const listed = [...listedEntities(entities, kindMask)];
  if (listed.length === 0) return null;
  const items: MenuItem<ObjectValue>[] = listed.map((entity, index) => Object.freeze({
    key: generatedKey(index, 'comm-menus.object-keys'),
    value: Object.freeze({ type: 'object', entityId: entity.id, kindBit: entity.kindBit, name: entity.name, tone: tone(entity) }),
  }));
  items.push(Object.freeze({ key: menus.objectListExitKey, value: EXIT }));
  return Object.freeze({ level: 3, table: 'objects', items: Object.freeze(items) });
}

/** `0x2c850`: the category menu, or null when no category has an object. */
export function buildCategoryMenu(entities: EntityTable, menus: Menus): CategoryMenu | null {
  const items: MenuItem<CategoryValue>[] = [];
  for (const [source, { key, kindMask }] of menus.categories.entries()) {
    if (kindMask === 0) {
      if (items.length === 0) return null;
      items.push(Object.freeze({ key, value: EXIT }));
      return Object.freeze({ level: 2, table: 'categories', items: Object.freeze(items) });
    }
    if (!hasListed(entities, kindMask)) continue;
    items.push(Object.freeze({ key: generatedKey(items.length, 'comm-menus.category-keys'), value: Object.freeze({ type: 'category', source, kindMask }) }));
  }
  // World creation reads TABL 2007 with its exit last.
  throw new CoreFaultError('invariant-violated', 'comm-menus.category-exit');
}

/** Kind 2, the wingman's, as a kind bit. */
const WINGMAN_KIND_BIT = 1;
/** The base kinds: bits 15, 17 and 18. */
const BASE_KINDS = 0x68000;
/** The near menu's squared range, the f32 constant `0x171468`. */
const NEAR_MENU_RANGE_SQUARED = 1_000_000;

/** What the near-menu gate reads besides the object: the player's position, the view and the mission flow. */
export interface NearMenuView {
  readonly position: Entity['position'];
  readonly viewMode: number;
  readonly flow: Pick<MissionFlow, 'mainState' | 'subState'>;
}

/** `0x394c4(0, target)` together with `0x33390` (CD5), for an object of a base kind. */
export function nearMenuGate(target: Entity, { position, viewMode, flow }: NearMenuView): boolean {
  if (viewMode === 0 || viewMode === 1 || target.activity !== 'active') return false;
  // `FCOMP`/`SETBE`: not greater, so the constant itself passes.
  if (squaredDistance(position, target.position) > NEAR_MENU_RANGE_SQUARED) return false;
  return flow.mainState === 3 && flow.subState === 0;
}

/** The command table `0x2cbb4` chooses for `target` when it builds the menu. */
export function commandTable(target: Entity, view: NearMenuView): MenuCommandTable {
  if (target.kindBit === WINGMAN_KIND_BIT) return 'kind2';
  return ((BASE_KINDS >>> target.kindBit) & 1) === 1 && nearMenuGate(target, view) ? 'gated' : 'other';
}

/** `0x2cbb4(partner)`: the command menu, or null when the partner no longer resolves. */
export function buildCommandMenu(entities: EntityTable, menus: Menus, partner: EntityId, view: NearMenuView): CommandMenu | null {
  const target = entities.get(partner);
  if (target === undefined) return null;
  const table = commandTable(target, view);
  const items = menus.commands[table].map(({ key, code }, source) => Object.freeze({
    key,
    value: code === 0 ? EXIT : Object.freeze({ type: 'command', source, code } as const),
  }));
  return Object.freeze({ level: 4, table, items: Object.freeze(items) });
}
