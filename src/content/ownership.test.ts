import { describe, expect, it } from 'vitest';
import { readPayloadIdentity } from './content-identity.ts';
import { exclusiveBytes, isDetached, payloadTransferList } from './ownership.ts';
import { payloadMismatch, readPayloadRecords } from './payload.ts';
import { payloadIdentityOf, syntheticBytes } from './synthetic-content.test-support.ts';

describe('exclusive payload bytes', () => {
  it('copies a view into its own exact buffer, isolated in both directions', () => {
    const source = new Uint8Array([9, 1, 2, 3, 9]);
    const copy = exclusiveBytes(source.subarray(1, 4));
    expect({ bytes: [...copy], offset: copy.byteOffset, size: copy.buffer.byteLength }).toEqual({ bytes: [1, 2, 3], offset: 0, size: 3 });
    expect(copy.buffer).not.toBe(source.buffer);
    source[1] = 7;
    copy[1] = 8;
    expect([...copy]).toEqual([1, 8, 3]);
    expect([...source]).toEqual([9, 7, 2, 3, 9]);
  });

  it('gives two models built from one source mesh payloads that cannot change each other', () => {
    const mesh = new Uint8Array([1, 2, 3, 4]);
    const [first, second] = [exclusiveBytes(mesh), exclusiveBytes(mesh)];
    first.fill(0);
    expect([...second]).toEqual([1, 2, 3, 4]);
    expect([...mesh]).toEqual([1, 2, 3, 4]);
    expect(payloadTransferList([first, second])).toEqual([first.buffer, second.buffer]);
  });

  it('copies a Node Buffer instead of returning a view of its memory', () => {
    const buffer = Buffer.from([5, 6, 7]);
    const copy = exclusiveBytes(buffer);
    buffer[0] = 0;
    expect(copy[0]).toBe(5);
    expect(Object.getPrototypeOf(copy)).toBe(Uint8Array.prototype);
  });

  it('tells transferred buffers apart from attached, empty and shared ones', () => {
    const [full, empty] = [new Uint8Array(2), new Uint8Array(0)];
    expect([full.buffer, empty.buffer, new SharedArrayBuffer(1)].map(isDetached)).toEqual([false, false, false]);
    structuredClone([full, empty], { transfer: [full.buffer, empty.buffer] });
    expect([full.buffer, empty.buffer].map(isDetached)).toEqual([true, true]);
  });
});

describe('payload transfer', () => {
  it('moves every payload buffer, after which the sender can neither use nor resend them', () => {
    const bytes = syntheticBytes('model/synthetic-enemy');
    const identity = readPayloadIdentity(payloadIdentityOf(bytes));
    const sent = [exclusiveBytes(bytes), exclusiveBytes(new Uint8Array(0))];
    expect(readPayloadRecords([{ id: 'model/synthetic-enemy', schemaVersion: 1, bytes: sent[0] }, { id: 'sound/synthetic-silent', schemaVersion: 1, bytes: sent[1] }]))
      .toHaveLength(2);
    const transfer = payloadTransferList(sent);
    expect(Object.isFrozen(transfer) && transfer[0] === sent[0].buffer && transfer[1] === sent[1].buffer).toBe(true);

    const received = structuredClone(sent, { transfer: [...transfer] });
    expect(received.map(view => [...view])).toEqual([[...bytes], []]);
    const [record] = readPayloadRecords([{ id: 'model/synthetic-enemy', schemaVersion: 1, bytes: received[0] }]);
    expect(payloadMismatch(identity, record)).toBeNull();

    expect(sent.map(view => view.byteLength)).toEqual([0, 0]);
    sent.forEach((view, index) => {
      expect(() => readPayloadRecords([{ id: 'sound/synthetic-silent', schemaVersion: 1, bytes: view }]))
        .toThrowError(expect.objectContaining({ code: 'payload-detached', path: 'payloads[0].bytes' }));
      expect(() => exclusiveBytes(view, `sent[${index}]`)).toThrowError(expect.objectContaining({ code: 'payload-detached', path: `sent[${index}]` }));
      expect(() => payloadTransferList([exclusiveBytes(bytes), view]))
        .toThrowError(expect.objectContaining({ code: 'payload-detached', path: 'payloads[1]' }));
    });
    expect(() => structuredClone(sent, { transfer: [...transfer] })).toThrowError(expect.objectContaining({ name: 'DataCloneError' }));
  });

  it.each([
    ['a view into a larger buffer', () => [new Uint8Array(8).subarray(2, 6)], 'payload-not-exclusive', 'payloads[0]'],
    ['a view at an offset', () => [new Uint8Array(new ArrayBuffer(4), 1)], 'payload-not-exclusive', 'payloads[0]'],
    ['a view shorter than its buffer', () => [new Uint8Array(new ArrayBuffer(4), 0, 2)], 'payload-not-exclusive', 'payloads[0]'],
    ['shared memory', () => [new Uint8Array(new SharedArrayBuffer(4))], 'payload-not-exclusive', 'payloads[0]'],
    ['one payload listed twice', () => { const view = new Uint8Array(4); return [view, view]; }, 'payload-aliased', 'payloads[1]'],
    ['two payloads on one buffer', () => { const view = new Uint8Array(4); return [view, new Uint8Array(view.buffer)]; }, 'payload-aliased', 'payloads[1]'],
  ])('rejects %s', (_name, views, code, path) => {
    expect(() => payloadTransferList(views())).toThrowError(expect.objectContaining({ code, path }));
  });
});
