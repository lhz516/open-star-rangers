import { readAssetDescriptor, type AssetDescriptor, type AssetReference } from '../asset-contract.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { compareText, fail } from '../contract-validation.ts';
import {
  FLIGHT_DATA_LIMITS, FLIGHT_DATA_ROLES, FLIGHT_DATA_SCHEMA_VERSIONS, type FlightDataPayload, type FlightDataRole,
} from './flight-data-content.ts';
import { readFlightDataContent } from './flight-data-readers.ts';

// Flight data payloads are the canonical JSON of their content (canonical-json.ts); the readers build every object in
// contract field order and accept only printable ASCII Asset IDs.
const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'flight data payload', byteLimit: FLIGHT_DATA_LIMITS.payloadBytes, invalid: 'invalid-flight-data-payload',
});

/** Every Asset reference a strictly read payload makes, in content order, repeats included. */
function referencesOf({ role, content }: FlightDataPayload): readonly AssetReference[] {
  switch (role) {
    case 'scene-settings': return [];
    case 'explosion-table': return content.lists.flatMap(list => list.flatMap(({ sound, animation }) => [sound, animation]));
    case 'explosion-animation': return content.frames;
    case 'nebula-backgrounds': return content.images;
  }
}

/** The distinct references in strict ascending ID order: the exact dependency list of the payload's descriptor. */
function dependenciesOf(payload: FlightDataPayload): readonly AssetReference[] {
  const unique = new Map(referencesOf(payload).map(reference => [reference.id, reference]));
  return Object.freeze([...unique.values()].sort((left, right) => compareText(left.id, right.id)));
}

/**
 * Reads `payload` strictly and returns the dependencies its descriptor must have: every Asset it references, once, in
 * strict ascending ID order.
 */
export function flightDataDependencies(payload: FlightDataPayload): readonly AssetReference[] {
  return dependenciesOf(readFlightDataContent(payload.role, payload.content));
}

/**
 * Reads `payload` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated, so a converter can charge
 * it to its budget first.
 */
export function encodeFlightDataPayload(payload: FlightDataPayload, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readFlightDataContent(payload.role, payload.content).content, FORMAT, reserve);
}

function checkDependencies(payload: FlightDataPayload, descriptor: AssetDescriptor): void {
  const expected = dependenciesOf(payload);
  const actual = descriptor.dependencies;
  if (expected.length !== actual.length || expected.some((reference, index) =>
    reference.id !== actual[index].id || reference.kind !== actual[index].kind)) {
    fail('flight-data-reference-mismatch', 'descriptor.dependencies', 'must be exactly the Asset references of the payload');
  }
}

const isFlightDataRole = (role: string): role is FlightDataRole => FLIGHT_DATA_ROLES.some(known => known === role);

/**
 * Decodes the payload bytes of the `data` Asset `descriptor` describes. The byte length limit is checked first; the
 * bytes must be printable ASCII JSON in canonical form, the content must pass the strict reader of the descriptor's role,
 * and its Asset references must be exactly the descriptor's dependencies. The payload identity itself is checked by
 * completeness validation.
 */
export function decodeFlightDataPayload(bytes: Uint8Array, descriptor: AssetDescriptor): FlightDataPayload {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  const { role } = asset;
  if (!isFlightDataRole(role)) fail('invalid-flight-data-payload', 'descriptor.role', 'must be a flight data payload role');
  if (asset.kind !== 'data') fail('invalid-flight-data-payload', 'descriptor.kind', 'must be data');
  if (asset.payloadIdentity.schemaVersion !== FLIGHT_DATA_SCHEMA_VERSIONS[role]) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be the supported flight data payload schema of the role');
  }
  const payload = decodeCanonicalJson(bytes, FORMAT, value => readFlightDataContent(role, value), read => read.content);
  checkDependencies(payload, asset);
  return payload;
}
