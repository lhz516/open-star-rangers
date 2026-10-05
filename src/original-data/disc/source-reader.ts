import { chargeBudget, EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { ByteSource } from '../io/byte-source.ts';
import { BUDGET_SHAPE_CODES, DiscReadError, type BudgetShapeCode } from './disc-error.ts';

/** One port read covers at most 2,048 raw 2,352-byte sectors, bounding temporary allocation between cancellation checks. */
export const MAX_PORT_READ_BYTES = 2_048 * 2_352;

/** Structural cancellation probe that a DOM `AbortSignal` satisfies; the live reference is read at every check. */
export interface CancellationProbe {
  readonly aborted: boolean;
}

declare const snapshotBrand: unique symbol;

/** A port with the size it reported when `snapshotSource` validated it; reads are bounded by that size. */
export interface SourceSnapshot {
  readonly [snapshotBrand]: 'SourceSnapshot';
  readonly port: ByteSource;
  readonly byteLength: number;
}

const isBudgetShapeCode = (code: string): code is BudgetShapeCode => (BUDGET_SHAPE_CODES as readonly string[]).includes(code);

/** Whether `value` is a nonnegative safe integer. */
export const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Reads the source size once; later reads never consult the port's size again. */
export function snapshotSource(port: ByteSource, location: string): SourceSnapshot {
  let byteLength: unknown;
  try {
    byteLength = port.byteLength;
  } catch {
    throw new DiscReadError('read-failed', location, 'the source could not report its size');
  }
  if (!isCount(byteLength)) throw new DiscReadError('invalid-range', location, 'the source size must be a nonnegative safe integer');
  return Object.freeze({ port, byteLength }) as SourceSnapshot;
}

/** Reads a P2-01 limits record; a malformed record keeps its P2-01 code, with the P2-01 path as its location. */
export function readSourceLimits(value: unknown, path = 'limits'): BudgetRecord {
  try {
    return readBudgetRecord(value, path);
  } catch (error) {
    if (error instanceof ContentContractError && isBudgetShapeCode(error.code)) {
      throw new DiscReadError(error.code, error.path, error.reason);
    }
    throw error;
  }
}

const ABORTED: CancellationProbe = Object.freeze({ aborted: true });

/**
 * Checks that a cancellation probe reports a boolean `aborted` now. An abort seen here is kept, so the reader starts
 * cancelled even if the probe later reports false; otherwise the live reference is kept for later checks.
 */
export function readCancellation(value: unknown, path = 'cancellation'): CancellationProbe | undefined {
  if (value === undefined) return undefined;
  let aborted: unknown;
  try {
    aborted = typeof value === 'object' && value !== null ? (value as CancellationProbe).aborted : undefined;
  } catch {
    aborted = undefined;
  }
  if (typeof aborted !== 'boolean') throw new DiscReadError('invalid-record', path, 'must be an object with a boolean aborted flag');
  return aborted ? ABORTED : value as CancellationProbe;
}

function intrinsicGetter(target: object, key: PropertyKey): (this: unknown) => unknown {
  return Object.getOwnPropertyDescriptor(target, key)!.get!;
}

// Intrinsic accessors read internal slots, so a subclass, proxy or reassigned prototype cannot fake a result's shape.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayName = intrinsicGetter(typedArrayPrototype, Symbol.toStringTag);
const typedArrayBuffer = intrinsicGetter(typedArrayPrototype, 'buffer');
const typedArrayByteOffset = intrinsicGetter(typedArrayPrototype, 'byteOffset');
const typedArrayByteLength = intrinsicGetter(typedArrayPrototype, 'byteLength');
const arrayBufferByteLength = intrinsicGetter(ArrayBuffer.prototype, 'byteLength');

/**
 * A plain view over a port result of exactly `length` (at least 1) bytes in a non-shared ArrayBuffer; undefined
 * otherwise. A view over a detached buffer reports length 0, so the length check also rejects it.
 */
function exactBytes(value: unknown, length: number): Uint8Array | undefined {
  try {
    if (typedArrayName.call(value) !== 'Uint8Array' || typedArrayByteLength.call(value) !== length) return undefined;
    const buffer = typedArrayBuffer.call(value) as ArrayBuffer;
    // Throws for a SharedArrayBuffer, whatever prototype it claims.
    arrayBufferByteLength.call(buffer);
    return new Uint8Array(buffer, typedArrayByteOffset.call(value) as number, length);
  } catch {
    return undefined;
  }
}

/**
 * Guarded port reads for one opened image: every request is range-checked, metered as `sourceReadBytes` before it is
 * issued and checked for cancellation before and after it waits. Requests already issued stay metered when they fail
 * or are cancelled; there is no cache, so repeated reads are metered again.
 */
export class SourceReader {
  readonly #limits: BudgetRecord;
  readonly #cancellation: CancellationProbe | undefined;
  #usage: BudgetRecord = EMPTY_BUDGET_USAGE;
  #cancelled = false;

  constructor(limits: BudgetRecord, cancellation?: CancellationProbe) {
    this.#limits = limits;
    this.#cancellation = cancellation;
  }

  /** All twelve budget dimensions as a frozen snapshot that later reads never change. */
  usage(): BudgetRecord {
    return this.#usage;
  }

  /** Throws `cancelled` once the probe has been seen aborted; the reader stays cancelled from then on. */
  throwIfCancelled(location: string): void {
    if (!this.#cancelled && this.#probeAborted()) this.#cancelled = true;
    if (this.#cancelled) throw new DiscReadError('cancelled', location, 'the operation was cancelled');
  }

  /** Fails closed: a probe that throws or stops reporting exactly false counts as aborted, and its error is dropped. */
  #probeAborted(): boolean {
    if (!this.#cancellation) return false;
    try {
      return this.#cancellation.aborted !== false;
    } catch {
      return true;
    }
  }

  /** Throws `budget-exceeded` unless `bytes` more source reads fit the budget; usage is unchanged. */
  precheck(bytes: number, location: string): void {
    this.#charge(bytes, location);
  }

  async read(source: SourceSnapshot, offset: number, length: number, location: string): Promise<Uint8Array> {
    if (!isCount(offset) || !isCount(length) || length === 0) {
      throw new DiscReadError('invalid-range', location, 'a source read needs a nonnegative offset and a positive length');
    }
    // Subtraction keeps the bound check exact where offset + length would not be a safe integer.
    if (offset > source.byteLength - length) {
      throw new DiscReadError('invalid-range', location, 'a source read must lie inside the source');
    }
    if (length > MAX_PORT_READ_BYTES) {
      throw new DiscReadError('limit-exceeded', location, 'a source read is too long', { name: 'portReadBytes', limit: MAX_PORT_READ_BYTES, observed: length });
    }
    this.throwIfCancelled(location);
    // Updated before waiting, so overlapping reads never lose each other's usage.
    this.#usage = this.#charge(length, location);
    let result: unknown;
    let rejected = false;
    try {
      result = await source.port.read(offset, length);
    } catch {
      rejected = true;
    }
    this.throwIfCancelled(location);
    if (rejected) throw new DiscReadError('read-failed', location, 'the source failed to read');
    const bytes = exactBytes(result, length);
    if (!bytes) throw new DiscReadError('read-failed', location, 'the source returned bytes that break the port contract');
    return bytes;
  }

  #charge(bytes: number, location: string): BudgetRecord {
    const result = chargeBudget(this.#limits, this.#usage, { ...EMPTY_BUDGET_USAGE, sourceReadBytes: bytes }, location);
    if (result.status === 'within-budget') return result.usage;
    const [{ limit, observed }] = result.violations;
    throw new DiscReadError('budget-exceeded', location, 'the source read budget is exhausted', { name: 'sourceReadBytes', limit, observed });
  }
}
