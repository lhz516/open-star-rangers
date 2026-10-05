import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { NodeByteSource, NodeByteSourceError, type ReadHandle } from './node-byte-source.ts';

const directory = mkdtempSync(join(tmpdir(), 'osr-node-byte-source-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const CONTENT = Uint8Array.from({ length: 10_000 }, (_, index) => (index * 7) % 256);

/** A handle over CONTENT that returns at most `chunk` bytes per call and may fail on demand. */
function fakeHandle(options: { chunk?: number; failRead?: boolean; endAt?: number; failClose?: boolean } = {}) {
  const calls = { reads: 0, closes: 0 };
  const handle: ReadHandle = {
    read(buffer, offset, length, position) {
      calls.reads++;
      if (options.failRead) return Promise.reject(new Error(`EIO ${directory}`));
      const available = Math.max(0, (options.endAt ?? CONTENT.length) - position);
      const count = Math.min(length, options.chunk ?? length, available);
      buffer.set(CONTENT.subarray(position, position + count), offset);
      return Promise.resolve({ bytesRead: count });
    },
    close() {
      calls.closes++;
      return options.failClose ? Promise.reject(new Error(`close ${directory}`)) : Promise.resolve();
    },
  };
  return { handle, calls };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(NodeByteSourceError);
    expect(String(error)).not.toContain(directory);
    return (error as NodeByteSourceError).code;
  }
  throw new Error('expected a failure');
}

describe('Node byte source', () => {
  it('opens a read-only file and reads exact ranges at their positions', async () => {
    const path = join(directory, 'read-only.bin');
    writeFileSync(path, CONTENT);
    chmodSync(path, 0o444);
    const source = await NodeByteSource.open(path);
    expect(source.byteLength).toBe(10_000);
    expect(await source.read(9_000, 1_000)).toEqual(CONTENT.subarray(9_000));
    expect(await source.read(0, 1)).toEqual(CONTENT.subarray(0, 1));
    await source.close();
  });

  it('reports an open failure without the host path', async () => {
    expect(await codeOf(NodeByteSource.open(join(directory, 'missing.bin')))).toBe('open-failed');
  });

  it('continues short reads until the request is filled', async () => {
    const { handle, calls } = fakeHandle({ chunk: 3 });
    expect(await new NodeByteSource(handle, CONTENT.length).read(100, 10)).toEqual(CONTENT.subarray(100, 110));
    expect(calls.reads).toBe(4);
  });

  it('rejects an early end of file and an I/O failure instead of returning short data', async () => {
    expect(await codeOf(new NodeByteSource(fakeHandle({ endAt: 105 }).handle, CONTENT.length).read(100, 10))).toBe('unexpected-eof');
    expect(await codeOf(new NodeByteSource(fakeHandle({ failRead: true }).handle, CONTENT.length).read(0, 10))).toBe('read-failed');
  });

  it.each([[-1, 1], [0.5, 1], [0, 0], [9_999, 2], [Number.MAX_SAFE_INTEGER, 1]])('rejects the range %s+%s before reading', async (offset, length) => {
    const { handle, calls } = fakeHandle();
    expect(await codeOf(new NodeByteSource(handle, CONTENT.length).read(offset, length))).toBe('invalid-range');
    expect(calls.reads).toBe(0);
  });

  it('closes once, idempotently, and reads nothing afterwards', async () => {
    const { handle, calls } = fakeHandle();
    const source = new NodeByteSource(handle, CONTENT.length);
    await Promise.all([source.close(), source.close()]);
    await source.close();
    expect(calls.closes).toBe(1);
    expect(await codeOf(source.read(0, 1))).toBe('closed');
    expect(calls.reads).toBe(0);
  });

  it('turns a synchronously throwing close into the same failure on every call', async () => {
    let closes = 0;
    const handle: ReadHandle = { read: () => Promise.resolve({ bytesRead: 0 }), close: () => { closes++; throw new Error(`close ${directory}`); } };
    const source = new NodeByteSource(handle, 1);
    expect(await codeOf(source.close())).toBe('close-failed');
    expect(await codeOf(source.close())).toBe('close-failed');
    expect(closes).toBe(1);
  });

  it('reports a failed close on every call without the host error', async () => {
    const { handle, calls } = fakeHandle({ failClose: true });
    const source = new NodeByteSource(handle, CONTENT.length);
    expect(await codeOf(source.close())).toBe('close-failed');
    expect(await codeOf(source.close())).toBe('close-failed');
    expect(calls.closes).toBe(1);
  });
});
