import { open } from 'node:fs/promises';
import { isCount } from '../src/original-data/disc/source-reader.ts';
import type { ByteSource } from '../src/original-data/io/byte-source.ts';

// Node byte port (P2-02 S-09): positioned reads from a read-only file handle, for local tools only.

/** The part of a Node `FileHandle` the port uses; tests substitute short reads and failures. */
export interface ReadHandle {
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ readonly bytesRead: number }>;
  close(): Promise<void>;
}

export type NodeByteSourceErrorCode = 'open-failed' | 'read-failed' | 'unexpected-eof' | 'closed' | 'close-failed' | 'invalid-range';

/** A failure with a stable code and no host path or host error text. */
export class NodeByteSourceError extends Error {
  readonly code: NodeByteSourceErrorCode;

  constructor(code: NodeByteSourceErrorCode) {
    super(`node byte source: ${code}`);
    this.name = 'NodeByteSourceError';
    this.code = code;
  }
}

/** A byte port its owner must close. */
export interface ClosableByteSource extends ByteSource {
  close(): Promise<void>;
}

/**
 * A read-only file as a byte port. Short reads continue until the request is filled; an early end of file or an I/O
 * error rejects. The owner closes it explicitly; closing is idempotent and later reads reject.
 */
export class NodeByteSource implements ClosableByteSource {
  readonly byteLength: number;
  readonly #handle: ReadHandle;
  #closing: Promise<void> | undefined;

  constructor(handle: ReadHandle, byteLength: number) {
    this.#handle = handle;
    this.byteLength = byteLength;
  }

  /** Opens `path` read-only and records its size; a failure leaves no handle open. */
  static async open(path: string): Promise<NodeByteSource> {
    let handle;
    try {
      handle = await open(path, 'r');
    } catch {
      throw new NodeByteSourceError('open-failed');
    }
    try {
      return new NodeByteSource(handle, (await handle.stat()).size);
    } catch {
      await handle.close().catch(() => undefined);
      throw new NodeByteSourceError('open-failed');
    }
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (this.#closing) throw new NodeByteSourceError('closed');
    if (!isCount(offset) || !isCount(length) || length === 0 || offset > this.byteLength - length) {
      throw new NodeByteSourceError('invalid-range');
    }
    // Unfilled, unpooled memory: every byte is read before the view is returned, and a failure returns nothing.
    const memory = Buffer.allocUnsafeSlow(length);
    const bytes = new Uint8Array(memory.buffer, memory.byteOffset, length);
    for (let filled = 0; filled < length;) {
      let bytesRead: number;
      try {
        ({ bytesRead } = await this.#handle.read(bytes, filled, length - filled, offset + filled));
      } catch {
        throw new NodeByteSourceError('read-failed');
      }
      if (bytesRead === 0) throw new NodeByteSourceError('unexpected-eof');
      filled += bytesRead;
    }
    return bytes;
  }

  /** Closes the handle once; every call returns the same outcome, even when the handle throws synchronously. */
  close(): Promise<void> {
    this.#closing ??= (async () => {
      try {
        await this.#handle.close();
      } catch {
        throw new NodeByteSourceError('close-failed');
      }
    })();
    return this.#closing;
  }
}
