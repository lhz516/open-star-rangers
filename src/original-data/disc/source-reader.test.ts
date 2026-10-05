import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { deferredByteSource, memoryByteSource, SyntheticByteSource } from '../synthetic.ts';
import { failure, failureOf, MARKER, rejection } from './disc.test-support.ts';
import { MAX_PORT_READ_BYTES, readCancellation, readSourceLimits, snapshotSource, SourceReader, type CancellationProbe } from './source-reader.ts';

const MAX = Number.MAX_SAFE_INTEGER;
const CONTENT = Uint8Array.from({ length: 64 }, (_, index) => index * 3);
const limits = (sourceReadBytes: number): BudgetRecord => Object.freeze({ ...EMPTY_BUDGET_USAGE, sourceReadBytes });
const used = (reader: SourceReader): number => reader.usage().sourceReadBytes;

describe('source snapshots', () => {
  it('keeps the size reported when the source was snapshotted', async () => {
    const port = memoryByteSource(CONTENT);
    const snapshot = snapshotSource(port, 'image');
    (port as { byteLength: number }).byteLength = 1_000;
    expect(snapshot).toEqual({ port, byteLength: 64 });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(await failure(() => new SourceReader(limits(MAX)).read(snapshot, 64, 1, 'image'))).toEqual(failureOf('invalid-range', 'image'));
    expect(port.requests).toEqual([]);
  });

  it('accepts sizes from zero to the largest safe integer', () => {
    expect(snapshotSource(new SyntheticByteSource(0, () => undefined), 'descriptor').byteLength).toBe(0);
    expect(snapshotSource(new SyntheticByteSource(MAX, () => undefined), 'image').byteLength).toBe(MAX);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX + 1, '64'])('rejects size %s as invalid-range', async size => {
    const port = new SyntheticByteSource(size as number, () => undefined);
    expect(await failure(() => snapshotSource(port, 'image'))).toEqual(failureOf('invalid-range', 'image'));
  });

  it('maps a size getter failure to read-failed without its host text', async () => {
    const port = { get byteLength(): number { throw new Error(MARKER); }, read: () => Promise.resolve(new Uint8Array()) };
    expect(await failure(() => snapshotSource(port, 'descriptor'))).toEqual(failureOf('read-failed', 'descriptor'));
  });
});

describe('source limits', () => {
  it('reads a complete limits record as a frozen copy', () => {
    const input: Record<string, number> = { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 10 };
    const record = readSourceLimits(input);
    input.sourceReadBytes = 1;
    expect(record).toEqual(limits(10));
    expect(Object.isFrozen(record)).toBe(true);
  });

  const missing: Record<string, unknown> = { ...EMPTY_BUDGET_USAGE };
  delete missing.sourceReadBytes;
  it.each([
    ['a non-record', null, 'invalid-record', 'limits'],
    ['a missing dimension', missing, 'missing-budget-dimension', 'limits.sourceReadBytes'],
    ['an unknown dimension', { ...EMPTY_BUDGET_USAGE, [MARKER]: 1 }, 'unknown-budget-dimension', 'limits'],
    ['an invalid amount', { ...EMPTY_BUDGET_USAGE, sourceReadBytes: -1 }, 'invalid-budget-value', 'limits.sourceReadBytes'],
  ] as const)('keeps the P2-01 code and path for %s', async (_case, value, code, location) => {
    expect(await failure(() => readSourceLimits(value))).toEqual(failureOf(code, location));
  });
});

describe('guarded reads', () => {
  it('returns exactly the requested bytes and meters the request', async () => {
    const port = memoryByteSource(CONTENT);
    const reader = new SourceReader(limits(MAX));
    expect(await reader.read(snapshotSource(port, 'image'), 60, 4, 'image')).toEqual(CONTENT.subarray(60));
    expect(port.requests).toEqual([{ offset: 60, length: 4 }]);
    expect(used(reader)).toBe(4);
  });

  it('accepts a correct view that does not start its buffer, as pooled host buffers do', async () => {
    const port = new SyntheticByteSource(64, (_offset, length) => new Uint8Array(new ArrayBuffer(length + 8), 4, length));
    expect(await new SourceReader(limits(MAX)).read(snapshotSource(port, 'image'), 0, 4, 'image')).toHaveLength(4);
  });

  it('returns a plain Uint8Array view even when the port returns a subclass', async () => {
    class PooledBytes extends Uint8Array {}
    const port = new SyntheticByteSource(64, (offset, length) => PooledBytes.from(CONTENT.subarray(offset, offset + length)));
    const bytes = await new SourceReader(limits(MAX)).read(snapshotSource(port, 'image'), 4, 4, 'image');
    expect(Object.getPrototypeOf(bytes)).toBe(Uint8Array.prototype);
    expect(bytes).toEqual(CONTENT.slice(4, 8));
  });

  it('inspects results through intrinsic accessors, so an overridden accessor neither runs nor matters', async () => {
    const port = new SyntheticByteSource(64, (offset, length) =>
      Object.defineProperty(CONTENT.slice(offset, offset + length), 'buffer', { get() { throw new Error(MARKER); } }));
    expect(await new SourceReader(limits(MAX)).read(snapshotSource(port, 'image'), 4, 4, 'image')).toEqual(CONTENT.slice(4, 8));
  });

  it('allows a request of exactly the port read limit', async () => {
    const port = new SyntheticByteSource(MAX_PORT_READ_BYTES + 1, (_offset, length) => new Uint8Array(length));
    const bytes = await new SourceReader(limits(MAX)).read(snapshotSource(port, 'image'), 1, MAX_PORT_READ_BYTES, 'image');
    expect(bytes.byteLength).toBe(4_816_896);
  });

  it.each([
    ['a negative offset', -1, 1, 'invalid-range'],
    ['a fractional offset', 0.5, 1, 'invalid-range'],
    ['a NaN offset', Number.NaN, 1, 'invalid-range'],
    ['an unsafe offset', MAX + 1, 1, 'invalid-range'],
    ['an empty length', 0, 0, 'invalid-range'],
    ['a negative length', 0, -1, 'invalid-range'],
    ['a fractional length', 0, 1.5, 'invalid-range'],
    ['a range past the end', 61, 4, 'invalid-range'],
    ['an offset whose sum is unsafe', MAX, 1, 'invalid-range'],
    ['a length beyond the source', 0, 65, 'invalid-range'],
  ] as const)('rejects %s before metering or reading', async (_case, offset, length, code) => {
    const port = memoryByteSource(CONTENT);
    const reader = new SourceReader(limits(MAX));
    expect(await failure(() => reader.read(snapshotSource(port, 'image'), offset, length, 'image'))).toEqual(failureOf(code, 'image'));
    expect(port.requests).toEqual([]);
    expect(reader.usage()).toBe(EMPTY_BUDGET_USAGE);
  });

  it('rejects one byte over the port read limit before metering or reading', async () => {
    const port = new SyntheticByteSource(MAX, (_offset, length) => new Uint8Array(length));
    const reader = new SourceReader(limits(MAX));
    expect(await failure(() => reader.read(snapshotSource(port, 'image'), 0, MAX_PORT_READ_BYTES + 1, 'image'))).toEqual(failureOf('limit-exceeded', 'image', { name: 'portReadBytes', limit: 4_816_896, observed: 4_816_897 }));
    expect(port.requests).toEqual([]);
    expect(used(reader)).toBe(0);
  });

  it('reports the source range before the port read limit when both fail', async () => {
    const port = memoryByteSource(CONTENT);
    expect(await failure(() => new SourceReader(limits(MAX)).read(snapshotSource(port, 'image'), 0, MAX_PORT_READ_BYTES + 1, 'image')))
      .toEqual(failureOf('invalid-range', 'image'));
  });
});

describe('port contract', () => {
  const detached = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    return bytes;
  };
  it.each([
    ['a rejection', () => Promise.reject(new Error(MARKER))],
    ['a thrown host error', () => { throw new Error(MARKER); }],
    ['a short result', (offset: number, length: number) => CONTENT.slice(offset, offset + length - 1)],
    ['a long result', (offset: number, length: number) => CONTENT.slice(offset, offset + length + 1)],
    ['a plain array', (_offset: number, length: number) => Array.from({ length }, () => 0)],
    ['a DataView', (_offset: number, length: number) => new DataView(new ArrayBuffer(length))],
    ['an Int8Array', (_offset: number, length: number) => new Int8Array(length)],
    ['a detached view', (_offset: number, length: number) => detached(length)],
    ['a SharedArrayBuffer view', (_offset: number, length: number) => new Uint8Array(new SharedArrayBuffer(length))],
    ['marker text', () => MARKER],
    ['nothing', () => undefined],
    ['a proxy of a correct view', (_offset: number, length: number) => new Proxy(new Uint8Array(length), {})],
    ['a shared view claiming an ordinary buffer', (_offset: number, length: number) =>
      Object.defineProperty(new Uint8Array(new SharedArrayBuffer(length)), 'buffer', { value: new ArrayBuffer(length) })],
    ['a shared buffer with an ordinary prototype', (_offset: number, length: number) =>
      new Uint8Array(Object.setPrototypeOf(new SharedArrayBuffer(length), ArrayBuffer.prototype) as ArrayBuffer)],
    ['a short view claiming the full length', (_offset: number, length: number) =>
      Object.defineProperty(new Uint8Array(length - 1), 'byteLength', { value: length })],
  ])('maps %s to read-failed, still metered, without leaking bytes or host text', async (_case, respond) => {
    const port = new SyntheticByteSource(64, respond);
    const reader = new SourceReader(limits(MAX));
    expect(await failure(() => reader.read(snapshotSource(port, 'image'), 8, 4, 'image'))).toEqual(failureOf('read-failed', 'image'));
    expect(port.requests).toEqual([{ offset: 8, length: 4 }]);
    expect(used(reader)).toBe(4);
  });

  it('maps a synchronously throwing read method to read-failed', async () => {
    const port = { byteLength: 64, read(): Promise<Uint8Array> { throw new Error(MARKER); } };
    expect(await failure(() => new SourceReader(limits(MAX)).read(snapshotSource(port, 'image'), 0, 1, 'image'))).toEqual(failureOf('read-failed', 'image'));
  });
});

describe('source read budget', () => {
  it('allows a request that exactly uses the budget and rejects one byte more before reading', async () => {
    const port = memoryByteSource(CONTENT);
    const source = snapshotSource(port, 'image');
    const reader = new SourceReader(limits(10));
    await reader.read(source, 0, 10, 'image');
    expect(await failure(() => reader.read(source, 10, 1, 'image'))).toEqual(failureOf('budget-exceeded', 'image', { name: 'sourceReadBytes', limit: 10, observed: 11 }));
    expect(port.requests).toEqual([{ offset: 0, length: 10 }]);
    expect(used(reader)).toBe(10);
  });

  it('does not meter requests that are never issued', async () => {
    const port = memoryByteSource(CONTENT);
    const source = snapshotSource(port, 'image');
    const reader = new SourceReader(limits(9));
    await rejection(() => reader.read(source, 0, 10, 'image'));
    await rejection(() => reader.read(source, 64, 1, 'image'));
    expect(port.requests).toEqual([]);
    expect(reader.usage()).toBe(EMPTY_BUDGET_USAGE);
  });

  it('meters failed requests and never rolls them back', async () => {
    const port = new SyntheticByteSource(64, () => Promise.reject(new Error(MARKER)));
    const source = snapshotSource(port, 'image');
    const reader = new SourceReader(limits(8));
    for (let attempt = 0; attempt < 2; attempt++) await rejection(() => reader.read(source, 0, 4, 'image'));
    expect(used(reader)).toBe(8);
    expect((await rejection(() => reader.read(source, 0, 1, 'image'))).code).toBe('budget-exceeded');
    expect(port.requests).toHaveLength(2);
  });

  it('meters overlapping reads before either waits, so neither loses the other', async () => {
    const { source: port, pending } = deferredByteSource(64);
    const source = snapshotSource(port, 'image');
    const reader = new SourceReader(limits(10));
    const first = reader.read(source, 0, 6, 'image');
    const second = reader.read(source, 6, 4, 'image');
    expect(used(reader)).toBe(10);
    expect(await failure(() => reader.read(source, 10, 1, 'image'))).toEqual(failureOf('budget-exceeded', 'image', { name: 'sourceReadBytes', limit: 10, observed: 11 }));
    expect(pending.map(({ offset, length }) => [offset, length])).toEqual([[0, 6], [6, 4]]);
    pending[1].resolve(CONTENT.slice(6, 10));
    pending[0].resolve(CONTENT.slice(0, 6));
    expect([...await first, ...await second]).toEqual([...CONTENT.subarray(0, 10)]);
    expect(used(reader)).toBe(10);
  });

  it('meters repeated reads of the same bytes again', async () => {
    const port = memoryByteSource(CONTENT);
    const source = snapshotSource(port, 'image');
    const reader = new SourceReader(limits(MAX));
    await reader.read(source, 0, 8, 'image');
    await reader.read(source, 0, 8, 'image');
    expect(port.requests).toHaveLength(2);
    expect(used(reader)).toBe(16);
  });

  it('prechecks a whole operation without changing usage', async () => {
    const reader = new SourceReader(limits(10));
    await reader.read(snapshotSource(memoryByteSource(CONTENT), 'image'), 0, 4, 'image');
    reader.precheck(6, 'image');
    expect(await failure(() => reader.precheck(7, 'image'))).toEqual(failureOf('budget-exceeded', 'image', { name: 'sourceReadBytes', limit: 10, observed: 11 }));
    expect(used(reader)).toBe(4);
  });

  it('reports a total beyond the safe integer range with a null observed amount', async () => {
    const reader = new SourceReader(limits(MAX));
    await reader.read(snapshotSource(memoryByteSource(CONTENT), 'image'), 0, 4, 'image');
    expect(await failure(() => reader.precheck(MAX - 3, 'image'))).toEqual(failureOf('budget-exceeded', 'image', { name: 'sourceReadBytes', limit: MAX, observed: null }));
  });

  it('returns all twelve dimensions as a frozen snapshot that later reads and callers cannot change', async () => {
    const reader = new SourceReader(limits(MAX));
    const before = reader.usage();
    const source = snapshotSource(memoryByteSource(CONTENT), 'image');
    await reader.read(source, 0, 4, 'image');
    const after = reader.usage();
    expect(Object.keys(after)).toEqual(BUDGET_DIMENSIONS);
    expect(after).toEqual({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: 4 });
    expect(() => { (after as Record<string, number>).sourceReadBytes = 0; }).toThrow(TypeError);
    await reader.read(source, 0, 4, 'image');
    expect([before.sourceReadBytes, after.sourceReadBytes, used(reader)]).toEqual([0, 4, 8]);
    expect([before, after, reader.usage()].every(Object.isFrozen)).toBe(true);
  });
});

describe('cancellation', () => {
  it('reads nothing and meters nothing once cancelled before a request', async () => {
    const port = memoryByteSource(CONTENT);
    const reader = new SourceReader(limits(MAX), { aborted: true });
    expect(await failure(() => reader.read(snapshotSource(port, 'image'), 0, 4, 'image'))).toEqual(failureOf('cancelled', 'image'));
    expect(port.requests).toEqual([]);
    expect(used(reader)).toBe(0);
  });

  it.each([
    ['valid bytes', (read: { resolve(value: unknown): void }) => read.resolve(CONTENT.slice(0, 4))],
    ['a short result', (read: { resolve(value: unknown): void }) => read.resolve(CONTENT.slice(0, 3))],
    ['a rejection', (read: { reject(reason: unknown): void }) => read.reject(new Error(MARKER))],
  ])('discards %s that arrive after cancellation and keeps the request metered', async (_case, settle) => {
    const { source: port, pending } = deferredByteSource(64);
    const probe = { aborted: false };
    const reader = new SourceReader(limits(MAX), probe);
    const read = reader.read(snapshotSource(port, 'image'), 0, 4, 'image');
    probe.aborted = true;
    settle(pending[0]);
    expect(await failure(() => read)).toEqual(failureOf('cancelled', 'image'));
    expect(used(reader)).toBe(4);
  });

  it('cancels every overlapping read that is still waiting', async () => {
    const { source: port, pending } = deferredByteSource(64);
    const source = snapshotSource(port, 'image');
    const probe = { aborted: false };
    const reader = new SourceReader(limits(MAX), probe);
    const reads = [rejection(() => reader.read(source, 0, 4, 'image')), rejection(() => reader.read(source, 4, 4, 'image'))];
    probe.aborted = true;
    for (const read of pending) read.resolve(CONTENT.slice(read.offset, read.offset + read.length));
    expect((await Promise.all(reads)).map(error => error.code)).toEqual(['cancelled', 'cancelled']);
  });

  it('stays cancelled after the probe has been seen aborted', async () => {
    const port = memoryByteSource(CONTENT);
    const probe = { aborted: true };
    const reader = new SourceReader(limits(MAX), probe);
    expect(await failure(() => reader.throwIfCancelled('descriptor'))).toEqual(failureOf('cancelled', 'descriptor'));
    probe.aborted = false;
    expect((await rejection(() => reader.read(snapshotSource(port, 'image'), 0, 4, 'image'))).code).toBe('cancelled');
    expect(port.requests).toEqual([]);
  });

  it('reads a probe once to check its shape and keeps the live reference', () => {
    const signal = new AbortController().signal;
    expect(readCancellation(signal)).toBe(signal);
    expect(readCancellation(undefined)).toBeUndefined();
  });

  it.each([
    ['a probe whose flag getter starts throwing host text', (probe: { flag: unknown }) => {
      Object.defineProperty(probe, 'aborted', { get() { throw new Error(MARKER); } });
    }],
    ['a probe whose flag stops being a boolean', (probe: { flag: unknown }) => { probe.flag = 0; }],
  ])('fails closed for %s after opening', async (_case, breakProbe) => {
    const probe = { flag: false as unknown, get aborted(): boolean { return this.flag as boolean; } };
    const port = memoryByteSource(CONTENT);
    const reader = new SourceReader(limits(MAX), readCancellation(probe));
    await reader.read(snapshotSource(port, 'image'), 0, 4, 'image');
    breakProbe(probe);
    expect(await failure(() => reader.read(snapshotSource(port, 'image'), 0, 4, 'image'))).toEqual(failureOf('cancelled', 'image'));
    expect(port.requests).toHaveLength(1);
  });

  it('accepts an AbortSignal as the probe and reads it live', async () => {
    const controller = new AbortController();
    const probe: CancellationProbe = controller.signal;
    const reader = new SourceReader(limits(MAX), probe);
    const source = snapshotSource(memoryByteSource(CONTENT), 'image');
    await reader.read(source, 0, 4, 'image');
    controller.abort(new Error(MARKER));
    expect(await failure(() => reader.read(source, 0, 4, 'image'))).toEqual(failureOf('cancelled', 'image'));
  });
});
