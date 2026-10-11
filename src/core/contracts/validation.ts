/**
 * Structure and number readers for formal Core inputs (docs/plan/p3/02/spec.md, 输入与命令). Each reader accepts
 * only plain data and reads every value exactly once, through its property descriptor, so accessors never run and
 * what is returned is what was checked. Errors are CoreInputError with the value's path and never echo unknown keys
 * or values.
 */
import { CoreInputError } from '../errors.ts';

/** A validity check on a number and the message used when it fails. */
export type NumberRule = readonly [valid: (value: number) => boolean, rule: string];

/**
 * Reads a plain object of at most `maxFields` enumerable string-keyed data properties into a null-prototype copy.
 * Nested values are still the caller's, so readers copy what they accept.
 */
export function readDataRecord(value: unknown, path: string, maxFields: number): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new CoreInputError(path, 'must be a plain object');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new CoreInputError(path, 'must be a plain object');
  const keys = Reflect.ownKeys(value);
  if (keys.length > maxFields) throw new CoreInputError(path, 'contains unknown fields');
  const record: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !property?.enumerable || !('value' in property)) {
      throw new CoreInputError(path, 'must contain only enumerable data fields');
    }
    record[key] = property.value;
  }
  return record;
}

/** Checks that a record from readDataRecord has exactly `fields`. */
export function requireExactFields(record: Record<string, unknown>, path: string, fields: readonly string[]): void {
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) throw new CoreInputError(`${path}.${field}`, 'is required');
  }
  if (Object.keys(record).length !== fields.length) throw new CoreInputError(path, 'contains unknown fields');
}

/** Reads a plain object whose fields are exactly `fields`; see readDataRecord. */
export function readExactRecord(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const record = readDataRecord(value, path, fields.length);
  requireExactFields(record, path, fields);
  return record;
}

/**
 * Reads a dense plain array of at most `maxLength` data elements into a new frozen array of `readItem` results. The
 * length is checked before any element is read, so an oversized array costs nothing.
 */
export function readList<T>(
  value: unknown,
  path: string,
  maxLength: number,
  readItem: (item: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new CoreInputError(path, 'must be an array');
  const { length } = value;
  if (length > maxLength) throw new CoreInputError(path, `must have at most ${maxLength} items`);
  // An array's own keys are its indices plus `length`; anything else is a hole or an extra field.
  if (Reflect.ownKeys(value).length !== length + 1) throw new CoreInputError(path, 'must be a dense array without extra fields');
  const items: T[] = [];
  for (let index = 0; index < length; index++) {
    const at = `${path}[${index}]`;
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property?.enumerable || !('value' in property)) throw new CoreInputError(at, 'must be a data element');
    items.push(readItem(property.value, at));
  }
  return Object.freeze(items);
}

/** Returns `value` with -0 normalised to +0 (`-0 + 0` is `+0`), or throws if it is not a number passing `rule`. */
export function readNumber(value: unknown, path: string, [valid, rule]: NumberRule): number {
  if (typeof value !== 'number' || !valid(value)) throw new CoreInputError(path, rule);
  return value + 0;
}

/** Returns `value` if it is one of `choices`. */
export function readChoice<const Choice extends string>(value: unknown, path: string, choices: readonly Choice[]): Choice {
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    throw new CoreInputError(path, `must be one of ${choices.join(', ')}`);
  }
  return value as Choice;
}

/** A closed interval; the comparison also rejects NaN and ±Infinity. */
export function numberIn(min: number, max: number): NumberRule {
  return [(value) => value >= min && value <= max, `must be a number from ${min} to ${max}`];
}

export function integerIn(min: number, max: number): NumberRule {
  return [(value) => Number.isInteger(value) && value >= min && value <= max, `must be an integer from ${min} to ${max}`];
}
