import type { ImportHostEndpoint, ImportHostEvent } from './import-host.ts';
import { readImportWorkerMessage, type ImportWorkerMessage } from './import-protocol.ts';

type HostEventType = Parameters<ImportHostEndpoint['addEventListener']>[0];

/** A host endpoint double that logs listeners, posts and closes, and dispatches events to the host. */
export class FakeEndpoint implements ImportHostEndpoint {
  readonly log: string[] = [];
  readonly posts: { readonly message: ImportWorkerMessage; readonly transfer: ArrayBuffer[] }[] = [];
  /** Settles at the first close. */
  readonly closed: Promise<void>;
  readonly #listeners = new Map<HostEventType, ((event: ImportHostEvent) => void)[]>();
  readonly #close: () => void;

  constructor() {
    let close!: () => void;
    this.closed = new Promise(resolve => { close = resolve; });
    this.#close = close;
  }

  postMessage(message: ImportWorkerMessage, transfer: ArrayBuffer[]): void {
    this.log.push(`post:${message.type}`);
    this.posts.push({ message, transfer });
  }

  addEventListener(type: HostEventType, listener: (event: ImportHostEvent) => void): void {
    this.log.push(`listen:${type}`);
    this.#listeners.set(type, [...this.#listeners.get(type) ?? [], listener]);
  }

  close(): void {
    this.log.push('close');
    this.#close();
  }

  dispatch(type: HostEventType, data?: unknown): { prevented: boolean } {
    const event = { data, prevented: false, preventDefault() { this.prevented = true; } };
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
    return event;
  }

  get messages(): ImportWorkerMessage[] {
    return this.posts.map(post => post.message);
  }

  /** The messages after `ready`; throws unless `ready` came first and the receiver can read every message. */
  get afterReady(): ImportWorkerMessage[] {
    const [ready, ...rest] = this.messages;
    if (ready?.type !== 'ready') throw new Error('the host did not send ready first');
    if (this.messages.some(message => readImportWorkerMessage(message).status !== 'valid')) {
      throw new Error('the host sent a message the receiver rejects');
    }
    return rest;
  }

  get closes(): number {
    return this.log.filter(entry => entry === 'close').length;
  }
}
