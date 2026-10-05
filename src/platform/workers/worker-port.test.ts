import { describe, expect, it } from 'vitest';
import { IMPORT_PROTOCOL_VERSION, type ImportStartMessage } from '../../workers/import-protocol.ts';
import { connectImportWorker, type WorkerLike } from './worker-port.ts';

const MARKER = 'PRIVATE-MARKER';
type Listener = Parameters<WorkerLike['addEventListener']>[1];
type EventType = Parameters<WorkerLike['addEventListener']>[0];

/** A Worker double over an EventTarget that counts listeners and logs posts, removals and terminations. */
class FakeWorker implements WorkerLike {
  readonly log: string[] = [];
  postError: unknown = null;
  readonly #target = new EventTarget();
  readonly #listeners = new Map<Listener, (event: Event) => void>();

  postMessage(message: unknown): void {
    this.log.push(`post:${(message as { type: string }).type}`);
    if (this.postError) throw this.postError;
  }

  addEventListener(type: EventType, listener: Listener): void {
    const wrapped = (event: Event) => listener(event as Event & { data?: unknown });
    this.#listeners.set(listener, wrapped);
    this.#target.addEventListener(type, wrapped);
  }

  removeEventListener(type: EventType, listener: Listener): void {
    this.log.push(`remove:${type}`);
    this.#target.removeEventListener(type, this.#listeners.get(listener)!);
    this.#listeners.delete(listener);
  }

  terminate(): void {
    this.log.push('terminate');
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  dispatch(event: Event): Event {
    this.#target.dispatchEvent(event);
    return event;
  }
}

function connect() {
  const worker = new FakeWorker();
  const calls: unknown[][] = [];
  const port = connectImportWorker(worker, {
    message: (...args: unknown[]) => { calls.push(['message', ...args]); },
    messageError: (...args: unknown[]) => { calls.push(['messageError', ...args]); },
    error: (...args: unknown[]) => { calls.push(['error', ...args]); },
  });
  return { worker, calls, port };
}

const START: ImportStartMessage = Object.freeze({ type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 1, files: [] });
const errorEvent = () => Object.assign(new Event('error', { cancelable: true }), { message: MARKER, filename: `${MARKER}.js` });

describe('import Worker port', () => {
  it('listens for message, messageerror and error, and forwards only the data or the fact of an event', () => {
    const { worker, calls } = connect();
    expect(worker.listenerCount).toBe(3);
    const data = { type: 'ready', protocol: 1 };
    worker.dispatch(new MessageEvent('message', { data }));
    worker.dispatch(new MessageEvent('messageerror', { data: MARKER }));
    const error = worker.dispatch(errorEvent());
    expect(calls).toEqual([['message', data], ['messageError'], ['error']]);
    expect(calls[0][1]).toBe(data);
    expect(error.defaultPrevented).toBe(true);
  });

  it('posts the start message and lets a synchronous failure propagate unchanged', () => {
    const { worker, port } = connect();
    port.post(START);
    expect(worker.log).toEqual(['post:start']);
    const failure = new DOMException(MARKER, 'DataCloneError');
    worker.postError = failure;
    expect(() => port.post(START)).toThrow(failure);
  });

  it('removes every listener before terminating, once, and delivers nothing afterwards', () => {
    const { worker, calls, port } = connect();
    port.terminate();
    expect(worker.log).toEqual(['remove:message', 'remove:messageerror', 'remove:error', 'terminate']);
    expect(worker.listenerCount).toBe(0);
    port.terminate();
    expect(worker.log.filter(entry => entry === 'terminate')).toHaveLength(1);
    worker.dispatch(new MessageEvent('message', { data: 1 }));
    worker.dispatch(new MessageEvent('messageerror'));
    const error = worker.dispatch(errorEvent());
    expect(calls).toEqual([]);
    expect(error.defaultPrevented).toBe(false);
  });
});
