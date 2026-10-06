import { readAssetDescriptor, type AssetDescriptor, type AssetReference } from '../asset-contract.ts';
import { compareText, fail } from '../contract-validation.ts';
import { isDetached } from '../ownership.ts';
import { LOGIC_LIMITS, LOGIC_PAYLOAD_SCHEMA_VERSION, type LogicPayload, type LogicRole } from './logic-content.ts';
import { readLogicContent } from './logic-readers.ts';

// Canonical byte form of logic payloads: printable ASCII JSON in contract field order without whitespace, numbers in
// ECMAScript's shortest round-trip form and -0 as 0. Pure modules have no TextDecoder, so bytes map to characters one
// to one, which printable ASCII makes exact.

/** The Asset kind each role requires, and the reader path of its content. */
const ROLES: Readonly<Record<LogicRole, { readonly kind: string; readonly path: string }>> = Object.freeze({
  mission: { kind: 'mission', path: 'mission' },
  'craft-types': { kind: 'data', path: 'craftTypes' },
  'wingman-roster': { kind: 'data', path: 'wingmanRoster' },
});

/** Read results are built in contract field order and hold only printable ASCII strings, so this text is canonical. */
const canonicalText = (payload: LogicPayload): string => JSON.stringify(payload.content);

/** Reads `payload` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length. */
export function encodeLogicPayload(payload: LogicPayload): Uint8Array {
  const text = canonicalText(readLogicContent(payload.role, payload.content));
  if (text.length > LOGIC_LIMITS.payloadBytes) fail('invalid-logic-payload', 'payload', 'must not exceed the logic payload byte limit');
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}

function asciiText(bytes: Uint8Array): string {
  const chunk = 4096;
  let text = '';
  for (let start = 0; start < bytes.length; start += chunk) {
    const part = bytes.subarray(start, start + chunk);
    if (part.some(byte => byte < 0x20 || byte > 0x7e)) fail('invalid-logic-payload', 'payload', 'must be printable ASCII');
    text += String.fromCharCode(...part);
  }
  return text;
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
  if (!(bytes instanceof Uint8Array)) fail('invalid-logic-payload', 'payload', 'must be a Uint8Array');
  if (isDetached(bytes.buffer)) fail('payload-detached', 'payload', 'was transferred away and can no longer be used');
  if (bytes.length > LOGIC_LIMITS.payloadBytes) fail('invalid-logic-payload', 'payload', 'must not exceed the logic payload byte limit');
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  const role = Object.hasOwn(ROLES, asset.role) ? asset.role as LogicRole : fail('invalid-logic-payload', 'descriptor.role', 'must be a logic payload role');
  if (asset.kind !== ROLES[role].kind) fail('invalid-logic-payload', 'descriptor.kind', 'must be the kind of the logic payload role');
  if (asset.payloadIdentity.schemaVersion !== LOGIC_PAYLOAD_SCHEMA_VERSION) {
    fail('unsupported-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be the supported logic payload schema');
  }
  const text = asciiText(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) fail('invalid-logic-payload', 'payload', 'must be JSON text');
    throw error;
  }
  const payload = readLogicContent(role, parsed, ROLES[role].path);
  // Bytes and characters correspond one to one, so comparing the texts compares the bytes.
  if (canonicalText(payload) !== text) fail('non-canonical-payload', 'payload', 'must be the canonical encoding of its content');
  checkDependencies(payload, asset);
  return payload;
}
