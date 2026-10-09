import { readAssetReference, type AssetReference } from '../asset-contract.ts';
import { readAssetId, type AssetId } from '../asset-id.ts';
import { ContentContractError, fail, matchesWhole, readArray, readOrderedArray, readRecord, requireFields } from '../contract-validation.ts';
import { CLASSIC_P2_SLICE } from '../slice-definition.ts';
import {
  LOGIC_LIMITS,
  type CraftSide, type CraftTypeEntry, type CraftTypeTable, type DeclarationOrigin, type EventRange, type EventTrigger, type LogicPayload,
  type LogicRole, type MapAxis, type MissionContent, type MissionDeclaration, type MissionGroup, type RuleInputs, type SpawnRegion,
  type StrategicMapFrame, type Vector3, type WingmanRoster,
} from './logic-content.ts';

// Strict readers for already decoded logic content. Each returns frozen copies isolated from its input and checks the
// references inside one payload; references between Assets are checked by the converter and by Core.

function invalid(path: string, reason: string): never {
  return fail('invalid-logic-payload', path, reason);
}

function mismatch(path: string, reason: string): never {
  return fail('logic-reference-mismatch', path, reason);
}

/** Runs a reader so that every structural failure, including those of shared base readers, is `invalid-logic-payload`. */
function asLogic<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentContractError && error.code !== 'invalid-logic-payload' && error.code !== 'logic-reference-mismatch') {
      throw new ContentContractError('invalid-logic-payload', error.path, error.reason);
    }
    throw error;
  }
}

function readFields(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const record = readRecord(value, path);
  requireFields(record, path, fields);
  return record;
}

/** Checks the length before reading any item, so an oversized array is rejected without visiting its elements. */
function readList<T>(value: unknown, path: string, max: number, readItem: (item: unknown, path: string) => T, min = 0): readonly T[] {
  if (Array.isArray(value) && value.length > max) invalid(path, `must contain at most ${max} items`);
  const items = readArray(value, path, 'invalid-logic-payload', readItem);
  if (items.length < min) invalid(path, `must contain at least ${min} item(s)`);
  return items;
}

function readInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(path, `must be an integer from ${min} to ${max}`);
  }
  // Adding 0 turns -0 into 0, the canonical spelling.
  return value + 0;
}

const readU32 = (value: unknown, path: string): number => readInteger(value, path, 0, 0xffffffff);
const readI32 = (value: unknown, path: string): number => readInteger(value, path, -0x80000000, 0x7fffffff);
const readI8 = (value: unknown, path: string): number => readInteger(value, path, -0x80, 0x7f);
const readIndex = (value: unknown, path: string): number => readInteger(value, path, 0, Number.MAX_SAFE_INTEGER);
const readCraftType = (value: unknown, path: string): number => readInteger(value, path, 0, 31);

function readFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path, 'must be a finite number');
  return value + 0;
}

function readPositive(value: unknown, path: string): number {
  const number = readFinite(value, path);
  if (number <= 0) invalid(path, 'must be positive');
  return number;
}

const readNullable = <T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T | null =>
  (value === null ? null : read(value, path));

const NAME = new RegExp(`[\\x20-\\x7e]{1,${LOGIC_LIMITS.nameLength}}`);

function readName(value: unknown, path: string): string {
  if (!matchesWhole(value, NAME)) invalid(path, `must be 1 to ${LOGIC_LIMITS.nameLength} printable ASCII characters`);
  return value;
}

/** A byte string: each code unit is one stored byte of 1–255; the NUL that ends it in the source is not part of it. */
const MESSAGE = new RegExp(`[\\x01-\\xff]{1,${LOGIC_LIMITS.eventMessageBytes}}`);

function readMessage(value: unknown, path: string): string {
  if (!matchesWhole(value, MESSAGE)) invalid(path, `must be a byte string of 1 to ${LOGIC_LIMITS.eventMessageBytes} bytes from 1 to 255`);
  return value;
}

function readLiteral<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) invalid(path, 'must be one of the allowed values');
  return value as T;
}

function readDataAssetId(value: unknown, path: string): AssetId {
  const id = readAssetId(value, path);
  if (!id.startsWith('data/')) invalid(path, 'must be a data Asset ID');
  return id;
}

function readVector3(value: unknown, path: string): Vector3 {
  const record = readFields(value, path, ['x', 'y', 'z']);
  return Object.freeze({ x: readFinite(record.x, `${path}.x`), y: readFinite(record.y, `${path}.y`), z: readFinite(record.z, `${path}.z`) });
}

const ORDER_CODES = Object.freeze({ invalid: 'invalid-logic-payload', duplicate: 'invalid-logic-payload', order: 'invalid-logic-payload' } as const);

/** Reads strictly ascending items, so the result has no duplicates and one canonical order. */
function readAscending<T>(value: unknown, path: string, max: number, readItem: (item: unknown, path: string) => T, rank: (item: T) => number): readonly T[] {
  if (Array.isArray(value) && value.length > max) invalid(path, `must contain at most ${max} items`);
  return readOrderedArray(value, path, ORDER_CODES, readItem, item => String(rank(item)), (left, right) => rank(left) - rank(right));
}

const MAP_AXES: readonly MapAxis[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

function readStrategicMapFrame(value: unknown, path: string): StrategicMapFrame {
  const record = readFields(value, path, ['rightAxis', 'upAxis', 'center', 'halfExtent']);
  const rightAxis = readLiteral(record.rightAxis, `${path}.rightAxis`, MAP_AXES);
  const upAxis = readLiteral(record.upAxis, `${path}.upAxis`, MAP_AXES);
  if (rightAxis[1] === upAxis[1]) invalid(`${path}.upAxis`, 'must use another axis than rightAxis');
  const center = readFields(record.center, `${path}.center`, ['right', 'up']);
  return Object.freeze({
    rightAxis,
    upAxis,
    center: Object.freeze({ right: readFinite(center.right, `${path}.center.right`), up: readFinite(center.up, `${path}.center.up`) }),
    halfExtent: readPositive(record.halfExtent, `${path}.halfExtent`),
  });
}

const ORIGINS: readonly DeclarationOrigin[] = ['object', 'group-template', 'group-member', 'wingman-option'];
const MISSION_ORIGINS: readonly DeclarationOrigin[] = ['object', 'group-template', 'group-member'];
const ROSTER_ORIGINS: readonly DeclarationOrigin[] = ['wingman-option'];

function readOrigins(value: unknown, path: string, allowed: readonly DeclarationOrigin[]): readonly DeclarationOrigin[] {
  const origins = readAscending(value, path, ORIGINS.length, (item, at) => readLiteral(item, at, allowed), origin => ORIGINS.indexOf(origin));
  if (origins.length === 0) invalid(path, 'must not be empty');
  return origins;
}

function readPlacement(value: unknown, path: string): MissionDeclaration['placement'] {
  const record = readFields(value, path, ['region', 'anchor']);
  return Object.freeze({
    region: readNullable(record.region, `${path}.region`, readIndex),
    anchor: readNullable(record.anchor, `${path}.anchor`, readIndex),
  });
}

function readRuleInputs(value: unknown, path: string): RuleInputs {
  const record = readFields(value, path, ['percentA', 'craftCount', 'percentB', 'percentC', 'percentD', 'aiValueA', 'aiValueB', 'aiValueC']);
  const u32 = (field: 'percentA' | 'craftCount') => readNullable(record[field], `${path}.${field}`, readU32);
  const i32 = (field: Exclude<keyof RuleInputs, 'percentA' | 'craftCount'>) => readNullable(record[field], `${path}.${field}`, readI32);
  return Object.freeze({
    percentA: u32('percentA'),
    craftCount: u32('craftCount'),
    percentB: i32('percentB'),
    percentC: i32('percentC'),
    percentD: i32('percentD'),
    aiValueA: i32('aiValueA'),
    aiValueB: i32('aiValueB'),
    aiValueC: i32('aiValueC'),
  });
}

function readDeclaration(value: unknown, path: string, allowedOrigins: readonly DeclarationOrigin[]): MissionDeclaration {
  const record = readFields(value, path, [
    'index', 'origins', 'craftType', 'nameCandidates', 'position', 'spawnTime', 'gridSpacing', 'placement', 'memberOf',
    'aiTarget', 'eventTrigger', 'ruleInputs', 'aiTargetCraftTypes',
  ]);
  return Object.freeze({
    index: readIndex(record.index, `${path}.index`),
    origins: readOrigins(record.origins, `${path}.origins`, allowedOrigins),
    craftType: readNullable(record.craftType, `${path}.craftType`, readCraftType),
    nameCandidates: readList(record.nameCandidates, `${path}.nameCandidates`, LOGIC_LIMITS.nameCandidates, readName),
    position: readVector3(record.position, `${path}.position`),
    spawnTime: readU32(record.spawnTime, `${path}.spawnTime`),
    gridSpacing: readI32(record.gridSpacing, `${path}.gridSpacing`),
    placement: readPlacement(record.placement, `${path}.placement`),
    memberOf: readNullable(record.memberOf, `${path}.memberOf`, readIndex),
    aiTarget: readNullable(record.aiTarget, `${path}.aiTarget`, readIndex),
    eventTrigger: readNullable(record.eventTrigger, `${path}.eventTrigger`, readIndex),
    ruleInputs: readRuleInputs(record.ruleInputs, `${path}.ruleInputs`),
    aiTargetCraftTypes: readAscending(record.aiTargetCraftTypes, `${path}.aiTargetCraftTypes`, 32, readCraftType, type => type),
  });
}

function readSpawnRegion(value: unknown, path: string): SpawnRegion {
  const record = readFields(value, path, ['x0', 'y0', 'x1', 'y1']);
  return Object.freeze({
    x0: readI32(record.x0, `${path}.x0`), y0: readI32(record.y0, `${path}.y0`),
    x1: readI32(record.x1, `${path}.x1`), y1: readI32(record.y1, `${path}.y1`),
  });
}

function readGroup(value: unknown, path: string): MissionGroup {
  const record = readFields(value, path, ['template', 'members', 'spawnCount', 'layout']);
  return Object.freeze({
    template: readIndex(record.template, `${path}.template`),
    members: readList(record.members, `${path}.members`, LOGIC_LIMITS.groupMembers, readIndex),
    spawnCount: readU32(record.spawnCount, `${path}.spawnCount`),
    layout: readList(record.layout, `${path}.layout`, LOGIC_LIMITS.layoutElements, readVector3, 1),
  });
}

function readEventRange(value: unknown, path: string): EventRange {
  const record = readFields(value, path, ['lower', 'upper', 'messages', 'summarySelector']);
  return Object.freeze({
    lower: readI32(record.lower, `${path}.lower`),
    upper: readI32(record.upper, `${path}.upper`),
    messages: readList(record.messages, `${path}.messages`, LOGIC_LIMITS.eventMessages, readMessage),
    summarySelector: readI8(record.summarySelector, `${path}.summarySelector`),
  });
}

function readEventTrigger(value: unknown, path: string): EventTrigger {
  const record = readFields(value, path, ['ranges']);
  return Object.freeze({ ranges: readList(record.ranges, `${path}.ranges`, LOGIC_LIMITS.eventRanges, readEventRange) });
}

/** Declaration indexes are consecutive from 0. */
function checkIndexes(declarations: readonly MissionDeclaration[], path: string): void {
  declarations.forEach(({ index }, at) => {
    if (index !== at) mismatch(`${path}[${at}].index`, 'must equal the declaration position');
  });
}

/**
 * Declarations are canonically ordered: section-1 records (origin `object`) first, then each record reached only through
 * groups at its first use, visiting groups in order and each group's template before its members.
 */
function checkDeclarationOrder(content: MissionContent, path: string): void {
  const { declarations, groups } = content;
  const objects = declarations.findIndex(declaration => !declaration.origins.includes('object'));
  const objectCount = objects === -1 ? declarations.length : objects;
  if (objectCount > LOGIC_LIMITS.objects) invalid(`${path}.declarations`, `must contain at most ${LOGIC_LIMITS.objects} object declarations`);
  let next = objectCount;
  for (const group of groups) {
    for (const index of [group.template, ...group.members]) {
      if (index === next) next++;
      else if (index > next) mismatch(`${path}.declarations[${next}]`, 'must be the next declaration a group uses first');
    }
  }
  if (next < declarations.length) mismatch(`${path}.declarations[${next}]`, 'must follow the object declarations or be first used by a group');
}

/**
 * Checks every reference inside one mission payload: indexes, placement, AI targets, event triggers, groups and their
 * membership. Every event trigger must be the `eventTrigger` of some declaration, as every section-2 element is.
 */
function checkMissionReferences(content: MissionContent, path: string): void {
  const { declarations, groups, spawnRegions, eventTriggers } = content;
  checkIndexes(declarations, `${path}.declarations`);
  const inRange = (index: number | null, length: number, at: string, reason: string): void => {
    if (index !== null && index >= length) mismatch(at, reason);
  };
  const templates = new Set<number>();
  const members = new Set<number>();
  groups.forEach((group, index) => {
    const at = `${path}.groups[${index}]`;
    if (!declarations[group.template]?.origins.includes('group-template')) mismatch(`${at}.template`, 'must be a declaration marked group-template');
    templates.add(group.template);
    group.members.forEach((member, position) => {
      const declaration = declarations[member];
      if (!declaration?.origins.includes('group-member')) mismatch(`${at}.members[${position}]`, 'must be a declaration marked group-member');
      if (declaration.memberOf !== index) mismatch(`${at}.members[${position}]`, 'must be a declaration whose memberOf is this group');
      members.add(member);
    });
  });
  declarations.forEach((declaration, index) => {
    const at = `${path}.declarations[${index}]`;
    inRange(declaration.placement.region, spawnRegions.length, `${at}.placement.region`, 'must index a spawn region');
    inRange(declaration.placement.anchor, declarations.length, `${at}.placement.anchor`, 'must index a declaration');
    inRange(declaration.aiTarget, declarations.length, `${at}.aiTarget`, 'must index a declaration');
    inRange(declaration.eventTrigger, eventTriggers.length, `${at}.eventTrigger`, 'must index an event trigger');
    if (declaration.origins.includes('group-template') !== templates.has(index)) {
      mismatch(`${at}.origins`, 'must mark group-template exactly when a group uses the declaration as template');
    }
    if (declaration.origins.includes('group-member') !== members.has(index)) {
      mismatch(`${at}.origins`, 'must mark group-member exactly when a group lists the declaration');
    }
    // A listed member already has a memberOf equal to its group, so a non-null memberOf must come from a listing.
    if ((declaration.memberOf !== null) !== members.has(index)) mismatch(`${at}.memberOf`, 'must name the group that lists the declaration');
  });
  const referenced = new Set(declarations.map(({ eventTrigger }) => eventTrigger));
  eventTriggers.forEach((_, index) => {
    if (!referenced.has(index)) mismatch(`${path}.eventTriggers[${index}]`, 'must be the event trigger of a declaration');
  });
  checkDeclarationOrder(content, path);
}

/** Reads a mission payload (`mission/…`, role `mission`). */
export function readMissionContent(value: unknown, path = 'mission'): MissionContent {
  return asLogic(() => {
    const record = readFields(value, path, [
      'campaign', 'coordinates', 'references', 'mapFrame', 'namePool', 'spawnRegions', 'declarations', 'groups', 'eventTriggers',
    ]);
    const campaign = readFields(record.campaign, `${path}.campaign`, ['group', 'slot']);
    const group = readIndex(campaign.group, `${path}.campaign.group`);
    const slot = readIndex(campaign.slot, `${path}.campaign.slot`);
    const { candidate } = CLASSIC_P2_SLICE;
    if (group !== candidate.campaignGroup || slot !== candidate.campaignSlot) invalid(`${path}.campaign`, 'must be the slice candidate');
    const coordinates = readFields(record.coordinates, `${path}.coordinates`, ['unit', 'referenceScale', 'layoutUnit']);
    const references = readFields(record.references, `${path}.references`, ['craftTypes', 'wingmanRoster']);
    const content: MissionContent = Object.freeze({
      campaign: Object.freeze({ group, slot }),
      coordinates: Object.freeze({
        unit: readLiteral(coordinates.unit, `${path}.coordinates.unit`, ['scen-reference'] as const),
        referenceScale: readPositive(coordinates.referenceScale, `${path}.coordinates.referenceScale`),
        layoutUnit: readLiteral(coordinates.layoutUnit, `${path}.coordinates.layoutUnit`, ['scen-runtime'] as const),
      }),
      references: Object.freeze({
        craftTypes: readDataAssetId(references.craftTypes, `${path}.references.craftTypes`),
        wingmanRoster: readDataAssetId(references.wingmanRoster, `${path}.references.wingmanRoster`),
      }),
      mapFrame: readStrategicMapFrame(record.mapFrame, `${path}.mapFrame`),
      namePool: readList(record.namePool, `${path}.namePool`, LOGIC_LIMITS.namePool, readName),
      spawnRegions: readList(record.spawnRegions, `${path}.spawnRegions`, LOGIC_LIMITS.spawnRegions, readSpawnRegion),
      declarations: readList(record.declarations, `${path}.declarations`, LOGIC_LIMITS.declarations,
        (item, at) => readDeclaration(item, at, MISSION_ORIGINS)),
      groups: readList(record.groups, `${path}.groups`, LOGIC_LIMITS.groups, readGroup),
      eventTriggers: readList(record.eventTriggers, `${path}.eventTriggers`, LOGIC_LIMITS.eventTriggers, readEventTrigger),
    });
    if (content.references.craftTypes === content.references.wingmanRoster) {
      mismatch(`${path}.references.wingmanRoster`, 'must name another Asset than craftTypes');
    }
    checkMissionReferences(content, path);
    return content;
  });
}

const SIDES: readonly CraftSide[] = ['player', 'friendly', 'enemy'];

function readModelReference(value: unknown, path: string): AssetReference {
  const reference = readAssetReference(value, path);
  if (reference.kind !== 'model') invalid(`${path}.kind`, 'must be a model reference');
  return reference;
}

function readCraftTypeEntry(value: unknown, path: string): CraftTypeEntry {
  const record = readFields(value, path, ['craftType', 'side', 'baseInteraction', 'model']);
  if (typeof record.baseInteraction !== 'boolean') invalid(`${path}.baseInteraction`, 'must be a boolean');
  return Object.freeze({
    craftType: readCraftType(record.craftType, `${path}.craftType`),
    side: readLiteral(record.side, `${path}.side`, SIDES),
    baseInteraction: record.baseInteraction,
    model: readModelReference(record.model, `${path}.model`),
  });
}

/** Reads a craft type table (`data/…`, role `craft-types`). */
export function readCraftTypeTable(value: unknown, path = 'craftTypes'): CraftTypeTable {
  return asLogic(() => {
    const record = readFields(value, path, ['entries']);
    const entries = readAscending(record.entries, `${path}.entries`, 32, readCraftTypeEntry, entry => entry.craftType);
    if (entries.filter(entry => entry.side === 'player').length !== 1) invalid(`${path}.entries`, 'must have exactly one player craft type');
    return Object.freeze({ entries });
  });
}

/** Reads a wingman roster (`data/…`, role `wingman-roster`). */
export function readWingmanRoster(value: unknown, path = 'wingmanRoster'): WingmanRoster {
  return asLogic(() => {
    const record = readFields(value, path, ['references', 'options']);
    const references = readFields(record.references, `${path}.references`, ['craftTypes']);
    const roster: WingmanRoster = Object.freeze({
      references: Object.freeze({ craftTypes: readDataAssetId(references.craftTypes, `${path}.references.craftTypes`) }),
      options: readList(record.options, `${path}.options`, LOGIC_LIMITS.wingmanOptions, (item, at) => readDeclaration(item, at, ROSTER_ORIGINS)),
    });
    checkIndexes(roster.options, `${path}.options`);
    roster.options.forEach((option, index) => {
      const { placement, memberOf, aiTarget, eventTrigger } = option;
      if (placement.region !== null || placement.anchor !== null || memberOf !== null || aiTarget !== null || eventTrigger !== null) {
        mismatch(`${path}.options[${index}]`, 'must not reference mission structures');
      }
    });
    return roster;
  });
}

/** Reads already decoded content of `role` with the reader for that payload shape. */
export function readLogicContent(role: LogicRole, value: unknown, path?: string): LogicPayload {
  switch (role) {
    case 'mission': return Object.freeze({ role, content: readMissionContent(value, path) });
    case 'craft-types': return Object.freeze({ role, content: readCraftTypeTable(value, path) });
    case 'wingman-roster': return Object.freeze({ role, content: readWingmanRoster(value, path) });
    default: return invalid(path ?? 'role', 'must be a logic payload role');
  }
}
