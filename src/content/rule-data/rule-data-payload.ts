import { readAssetDescriptor, type AssetDescriptor } from '../asset-contract.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { fail } from '../contract-validation.ts';
import { LOGIC_LIMITS } from '../logic/logic-content.ts';
import { readAiPrograms, type AiPrograms } from './ai-programs.ts';
import { readBaseRepairItems, type BaseRepairItems } from './base-repair-items.ts';
import { readCommMenus, type CommMenus } from './comm-menus.ts';
import { readCraftInfo, type CraftInfo } from './craft-info.ts';
import { readDebrisParameters, type DebrisParameters } from './debris-parameters.ts';
import { readFlightMessages, type FlightMessages } from './flight-messages.ts';
import { invalid, mismatch } from './rule-data-fields.ts';

// Payloads of the logic group's rule-data roles (P3-03 spec, 规范 payload): `data` Assets without dependencies whose bytes
// are the canonical JSON of their content (canonical-json.ts). Each role has its own payload schema version.

/** A rule-data payload with the descriptor role that selects its shape. */
export type RuleDataPayload =
  | { readonly role: 'craft-info'; readonly content: CraftInfo }
  | { readonly role: 'debris-parameters'; readonly content: DebrisParameters }
  | { readonly role: 'ai-programs'; readonly content: AiPrograms }
  | { readonly role: 'comm-menus'; readonly content: CommMenus }
  | { readonly role: 'base-repair-items'; readonly content: BaseRepairItems }
  | { readonly role: 'flight-messages'; readonly content: FlightMessages };

export type RuleDataRole = RuleDataPayload['role'];

type ContentOf<R extends RuleDataRole> = Extract<RuleDataPayload, { readonly role: R }>['content'];

interface RoleFormat<R extends RuleDataRole> {
  /** Payload schema version; a shape or meaning change increments it and the converter version. */
  readonly schemaVersion: number;
  readonly read: (value: unknown, path?: string) => ContentOf<R>;
}

const FORMATS: { readonly [R in RuleDataRole]: RoleFormat<R> } = Object.freeze({
  'craft-info': { schemaVersion: 1, read: readCraftInfo },
  'debris-parameters': { schemaVersion: 1, read: readDebrisParameters },
  'ai-programs': { schemaVersion: 1, read: readAiPrograms },
  'comm-menus': { schemaVersion: 1, read: readCommMenus },
  'base-repair-items': { schemaVersion: 1, read: readBaseRepairItems },
  'flight-messages': { schemaVersion: 1, read: readFlightMessages },
});

/** The rule-data roles, in the order of the spec. */
export const RULE_DATA_ROLES = Object.freeze(Object.keys(FORMATS) as RuleDataRole[]);

/** The payload schema version of each rule-data role. */
export const RULE_DATA_SCHEMA_VERSIONS: Readonly<Record<RuleDataRole, number>> = Object.freeze(
  Object.fromEntries(RULE_DATA_ROLES.map(role => [role, FORMATS[role].schemaVersion])) as Record<RuleDataRole, number>,
);

/** The canonical JSON family: a rule-data payload is a logic group payload, so the logic payload byte limit bounds it. */
const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'rule-data payload', byteLimit: LOGIC_LIMITS.payloadBytes, invalid: 'invalid-logic-payload',
});

const isRole = (role: string): role is RuleDataRole => Object.hasOwn(FORMATS, role);

/** Reads already decoded content of `role` strictly into frozen data isolated from `value`. */
export function readRuleDataContent(role: RuleDataRole, value: unknown, path?: string): RuleDataPayload {
  if (typeof role !== 'string' || !isRole(role)) invalid(path ?? 'role', 'must be a rule-data payload role');
  const read = FORMATS[role].read as (value: unknown, path?: string) => RuleDataPayload['content'];
  return Object.freeze({ role, content: read(value, path) }) as RuleDataPayload;
}

/**
 * Reads `payload` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated, so a converter can charge
 * it to its budget first.
 */
export function encodeRuleDataPayload(payload: RuleDataPayload, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readRuleDataContent(payload.role, payload.content).content, FORMAT, reserve);
}

function readBinding(descriptor: AssetDescriptor, path: string): AssetDescriptor & { readonly role: RuleDataRole } {
  const asset = readAssetDescriptor(descriptor, path);
  if (!isRole(asset.role)) invalid(`${path}.role`, 'must be a rule-data payload role');
  if (asset.kind !== 'data') invalid(`${path}.kind`, 'must be data');
  if (asset.dependencies.length !== 0) mismatch(`${path}.dependencies`, 'must be empty, as the payload references no Asset');
  return asset as AssetDescriptor & { readonly role: RuleDataRole };
}

/**
 * Checks that `descriptor` binds a rule-data payload: a `data` Asset of a rule-data role without dependencies, as rule-data
 * payloads reference no Asset. Returns the role.
 */
export const checkRuleDataBinding = (descriptor: AssetDescriptor, path = 'descriptor'): RuleDataRole => readBinding(descriptor, path).role;

/**
 * Decodes the payload bytes of the Asset `descriptor` describes. The byte limit is checked first; the descriptor must bind
 * a rule-data payload of its role's schema version, the bytes must be printable ASCII JSON in canonical form, and the
 * content must pass its role's strict reader. The payload identity itself is checked by completeness validation.
 */
export function decodeRuleDataPayload(bytes: Uint8Array, descriptor: AssetDescriptor): RuleDataPayload {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const { role, payloadIdentity } = readBinding(descriptor, 'descriptor');
  if (payloadIdentity.schemaVersion !== FORMATS[role].schemaVersion) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be the supported payload schema of the role');
  }
  return decodeCanonicalJson(bytes, FORMAT, value => readRuleDataContent(role, value), read => read.content);
}
