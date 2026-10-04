export type ContentContractErrorCode =
  | 'invalid-record'
  | 'invalid-dependencies'
  | 'invalid-asset-id'
  | 'invalid-kind'
  | 'kind-mismatch'
  | 'invalid-resource-group'
  | 'invalid-role'
  | 'invalid-version'
  | 'unsupported-schema'
  | 'invalid-slice-id'
  | 'invalid-identity'
  | 'invalid-origin'
  | 'invalid-payload-identity'
  | 'duplicate-dependency'
  | 'dependency-order';

export class ContentContractError extends Error {
  readonly code: ContentContractErrorCode;
  readonly path: string;
  readonly reason: string;

  constructor(code: ContentContractErrorCode, path: string, reason: string) {
    super(`${path} ${reason}`);
    this.name = 'ContentContractError';
    this.code = code;
    this.path = path;
    this.reason = reason;
  }
}

export function fail(code: ContentContractErrorCode, path: string, reason: string): never {
  throw new ContentContractError(code, path, reason);
}

export function matchesWhole(value: unknown, pattern: RegExp): value is string {
  // JavaScript's $ also matches before a trailing newline.
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

export function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) fail('invalid-record', path, 'must be a plain data record');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('invalid-record', path, 'must be a plain data record');
  const record: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !property.enumerable || !('value' in property)) {
      fail('invalid-record', path, 'must contain only enumerable string-keyed data fields');
    }
    record[key] = property.value;
  }
  return record;
}

export function requireFields(record: Record<string, unknown>, path: string, fields: readonly string[]): void {
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) fail('invalid-record', `${path}.${field}`, 'is required');
  }
  // Never echo unknown keys, which may contain private source paths or content.
  if (Object.keys(record).length !== fields.length) fail('invalid-record', path, 'contains unknown fields');
}
