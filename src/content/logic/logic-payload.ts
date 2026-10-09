import { readAssetDescriptor, type AssetDescriptor, type AssetReference } from '../asset-contract.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { compareText, fail } from '../contract-validation.ts';
import { LOGIC_LIMITS, LOGIC_PAYLOAD_SCHEMA_VERSION, type LogicPayload, type LogicRole } from './logic-content.ts';
import { readLogicContent } from './logic-readers.ts';

// Logic payloads are the canonical JSON of their content (canonical-json.ts); the readers build every object in
// contract field order and allow only printable ASCII names and byte-string messages, which the encoding keeps ASCII.
const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'logic payload', byteLimit: LOGIC_LIMITS.payloadBytes, invalid: 'invalid-logic-payload',
});

/** The Asset kind each role requires, and the reader path of its content. */
const ROLES: Readonly<Record<LogicRole, { readonly kind: string; readonly path: string }>> = Object.freeze({
  mission: { kind: 'mission', path: 'mission' },
  'craft-types': { kind: 'data', path: 'craftTypes' },
  'wingman-roster': { kind: 'data', path: 'wingmanRoster' },
});

/**
 * Reads `payload` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated, so a converter can charge
 * it to its budget first.
 */
export function encodeLogicPayload(payload: LogicPayload, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readLogicContent(payload.role, payload.content).content, FORMAT, reserve);
}

/** Asset references a payload makes, which must be exactly its descriptor's dependencies. */
function payloadReferences({ role, content }: LogicPayload): readonly AssetReference[] {
  switch (role) {
    case 'mission': return [
      { id: content.references.craftTypes, kind: 'data' },
      { id: content.references.wingmanRoster, kind: 'data' },
    ];
    case 'craft-types': return content.entries.map(entry => entry.model);
    case 'wingman-roster': return [{ id: content.references.craftTypes, kind: 'data' }];
  }
}

function checkDependencies(payload: LogicPayload, descriptor: AssetDescriptor): void {
  const expected = [...new Map(payloadReferences(payload).map(reference => [reference.id, reference])).values()]
    .sort((left, right) => compareText(left.id, right.id));
  const actual = descriptor.dependencies;
  if (expected.length !== actual.length || expected.some((reference, index) =>
    reference.id !== actual[index].id || reference.kind !== actual[index].kind)) {
    fail('logic-reference-mismatch', 'descriptor.dependencies', 'must be exactly the Asset references of the payload');
  }
}

/**
 * Decodes the payload bytes of the Asset `descriptor` describes. The byte length limit is checked first; the bytes must
 * be printable ASCII JSON in canonical form, the content must pass its strict reader, and its Asset references must be
 * exactly the descriptor's dependencies. The payload identity itself is checked by completeness validation.
 */
export function decodeLogicPayload(bytes: Uint8Array, descriptor: AssetDescriptor): LogicPayload {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  const role = Object.hasOwn(ROLES, asset.role) ? asset.role as LogicRole : fail('invalid-logic-payload', 'descriptor.role', 'must be a logic payload role');
  if (asset.kind !== ROLES[role].kind) fail('invalid-logic-payload', 'descriptor.kind', 'must be the kind of the logic payload role');
  if (asset.payloadIdentity.schemaVersion !== LOGIC_PAYLOAD_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be the supported logic payload schema');
  }
  const payload = decodeCanonicalJson(bytes, FORMAT, value => readLogicContent(role, value, ROLES[role].path), read => read.content);
  checkDependencies(payload, asset);
  return payload;
}
