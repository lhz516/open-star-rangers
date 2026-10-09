import { ContentContractError, fail, readArray, readRecord, requireFields } from '../contract-validation.ts';

// Strict field readers shared by the rule-data payload families (P3-03 spec, 字段处理规则 and 规范 payload). They return
// frozen copies isolated from their input. A structural failure is `invalid-logic-payload`; a reference inside one payload
// that names no fitting target is `logic-reference-mismatch`. Diagnostics carry only the structural path.

/** A byte string: every code unit is one stored byte, 1–255, without the terminating NUL (text rule 8). */
export type ByteString = string;

export function invalid(path: string, reason: string): never {
  return fail('invalid-logic-payload', path, reason);
}

export function mismatch(path: string, reason: string): never {
  return fail('logic-reference-mismatch', path, reason);
}

/**
 * A copy of the own data fields of a plain data record, with exactly `fields` when they are given. Failures of the shared
 * record readers are reported as `invalid-logic-payload`.
 */
export function readPlainRecord(value: unknown, path: string, fields?: readonly string[]): Record<string, unknown> {
  try {
    const record = readRecord(value, path);
    if (fields) requireFields(record, path, fields);
    return record;
  } catch (error) {
    if (error instanceof ContentContractError) invalid(error.path, error.reason);
    throw error;
  }
}

/** A dense plain array of `min` to `max` items; the length is checked before any item is read. */
export function readList<T>(value: unknown, path: string, max: number, readItem: (item: unknown, path: string) => T, min = 0): readonly T[] {
  if (Array.isArray(value) && value.length > max) invalid(path, `must contain at most ${max} items`);
  const items = readArray(value, path, 'invalid-logic-payload', readItem);
  if (items.length < min) invalid(path, `must contain at least ${min} item(s)`);
  return items;
}

/** A reader of lists of `min` to `max` items, each read by `readItem`. */
export const listOf = <T>(max: number, readItem: (item: unknown, path: string) => T, min = 0) =>
  (value: unknown, path: string): readonly T[] => readList(value, path, max, readItem, min);

/** A dense plain array of exactly `length` items, a fixed count of the source format. */
export function readTuple<T>(value: unknown, path: string, length: number, readItem: (item: unknown, path: string) => T): readonly T[] {
  if (Array.isArray(value) && value.length !== length) invalid(path, `must contain exactly ${length} items`);
  return readArray(value, path, 'invalid-logic-payload', readItem);
}

function readInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(path, `must be an integer from ${min} to ${max}`);
  }
  // Adding 0 turns -0 into 0, the canonical spelling.
  return value + 0;
}

/** Signed 32-bit integer. */
export const readI32 = (value: unknown, path: string): number => readInteger(value, path, -0x8000_0000, 0x7fff_ffff);
/** Unsigned 32-bit integer; also a 32-bit pattern whose sign the code never observes (ai.md §6). */
export const readU32 = (value: unknown, path: string): number => readInteger(value, path, 0, 0xffff_ffff);
/** A 32-bit integer whose uses do not depend on its sign: only 0 to 2³¹−1 is converted (craft.md, integer types). */
export const readInt32 = (value: unknown, path: string): number => readInteger(value, path, 0, 0x7fff_ffff);
export const readU8 = (value: unknown, path: string): number => readInteger(value, path, 0, 0xff);
/** A position in another array; the caller checks that it names a fitting target. */
export const readIndex = (value: unknown, path: string): number => readInteger(value, path, 0, Number.MAX_SAFE_INTEGER);

/**
 * A finite value that an `f32` holds exactly, so it round-trips bit for bit, denormals included. The canonical form has
 * no -0, so -0 reads as 0; a converter must not produce it from a source -0.0.
 */
export function readF32(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.fround(value) !== value) invalid(path, 'must be a finite f32 value');
  return value + 0;
}

export const readNullable = <T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T | null =>
  (value === null ? null : read(value, path));

/** Reads a byte string of at most `maxBytes` bytes, each 1–255. */
function readByteString(value: unknown, path: string, maxBytes: number): ByteString {
  if (typeof value !== 'string' || value.length > maxBytes) invalid(path, `must be a string of at most ${maxBytes} bytes`);
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 1 || code > 255) invalid(path, 'must hold only byte values 1 to 255');
  }
  return value;
}

/** A reader of byte strings of at most `maxBytes` bytes. */
export const byteStrings = (maxBytes: number) => (value: unknown, path: string): ByteString => readByteString(value, path, maxBytes);

/** A reader of tuples of `length` values, each read by `read`. */
export const tuples = <T extends readonly number[]>(length: T['length'], read: (value: unknown, path: string) => number) =>
  (value: unknown, path: string): T => readTuple(value, path, length, read) as unknown as T;

/** Reports `index` at `path` unless it names one of `count` targets. */
export function requireTarget(index: number, count: number, path: string, target: string): void {
  if (index >= count) mismatch(path, `must index ${target}`);
}

/** One reader per field of `T`; the shape's key order is the canonical field order. */
export type Shape<T> = { readonly [K in keyof T]-?: (value: unknown, path: string) => T[K] };

/** A reader of plain data records with exactly the fields of `shape`, each read by its reader into a frozen record in shape order. */
export function records<T>(shape: Shape<T>): (value: unknown, path: string) => T {
  const names = Object.keys(shape) as (keyof T & string)[];
  return (value, path) => {
    const record = readPlainRecord(value, path, names);
    const result: Partial<Record<keyof T, unknown>> = {};
    for (const name of names) result[name] = shape[name](record[name], `${path}.${name}`);
    return Object.freeze(result) as T;
  };
}
