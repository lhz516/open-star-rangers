import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import type { Browser, CDPSession, Page, Request, Response } from '@playwright/test';
import type {
  AuditCapture, AuditEvent, AuditTarget, CookieRecord, CspRecord, Header, Initiator, NavigationRecord, RequestRecord, ServiceWorkerRecord,
  WebSocketFrame, WebSocketRecord,
} from '../../tools/e2e-network-policy.ts';

// P2-12 S-06: the network audit collector. It observes before any product script runs and records what pages, their
// dedicated Workers and the browser attempted; tools/e2e-network-policy.ts classifies the capture. Two views are joined:
//
// - Target sessions on each page and, through auto-attach, each dedicated Worker: who started a request, its headers
//   (including the Cookie the network layer added), CSP issues, WebSocket frames, navigations, service worker versions,
//   and cookie writes and service worker registrations reported by a hook installed in every document.
// - A browser session that intercepts every request reaching the browser's network layer and continues it unchanged,
//   and discovers new targets. It alone sees a keepalive request sent while a page closes; Fetch interception in the
//   browser reports a Worker's request with its page's frame, so attribution comes from the target sessions by request ID.
//
// Chrome creates a Worker's target only once its main script has arrived, and Playwright resumes every Worker it
// auto-attaches at once, so a Worker may run before the audit's session for it is ready. When a main script (whose
// request ID is the Worker's target ID) passes the network layer, the browser session holds every other request until
// that session is ready: whatever the Worker sends first is still in flight then, and the session's later events for
// it attribute it. A Worker counts as covered only if its script passed the network layer, or was refused and so never
// ran (for a script a page route answered, Playwright's own report of the response tells). A WebSocket a target opened
// before its session was ready leaves that target uncovered.
//
// The collector changes no request or response except those a case asks it to `serve`. Everything it keeps stays in
// the test process.

/** The CDP events the collector reads, with the fields it uses. */
interface CdpRequest {
  readonly url: string;
  readonly urlFragment?: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly postData?: string;
  readonly hasPostData?: boolean;
  readonly postDataEntries?: readonly { readonly bytes?: string }[];
}
interface TargetInfo {
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly openerId?: string;
  readonly browserContextId?: string;
}
interface CdpEvents {
  'Network.requestWillBeSent': {
    requestId: string; frameId?: string; type?: string; request: CdpRequest; redirectResponse?: { status: number };
    initiator?: { type: string; requestId?: string };
  };
  'Network.requestWillBeSentExtraInfo': { requestId: string; headers: Readonly<Record<string, string>> };
  'Network.responseReceived': { requestId: string; type?: string; response: { url: string; status: number; mimeType?: string; headers: Readonly<Record<string, string>> } };
  'Network.responseReceivedExtraInfo': { requestId: string; headers: Readonly<Record<string, string>> };
  'Network.loadingFailed': { requestId: string; type?: string; errorText: string; blockedReason?: string };
  'Network.loadingFinished': { requestId: string };
  'Network.dataReceived': { requestId: string };
  'Network.webSocketCreated': { requestId: string; url: string };
  'Network.webSocketWillSendHandshakeRequest': { requestId: string; request: { headers: Readonly<Record<string, string>> } };
  'Network.webSocketHandshakeResponseReceived': { requestId: string; response: { headers: Readonly<Record<string, string>> } };
  'Network.webSocketFrameSent': { requestId: string; response: { opcode: number; payloadData: string } };
  'Network.webSocketFrameReceived': { requestId: string; response: { opcode: number; payloadData: string } };
  'Page.frameAttached': { frameId: string };
  'Page.frameNavigated': { frame: { id: string; parentId?: string; url: string; urlFragment?: string } };
  'Page.navigatedWithinDocument': { frameId: string; url: string };
  'Page.windowOpen': { url: string };
  'Audits.issueAdded': {
    issue: {
      code: string;
      details: { contentSecurityPolicyIssueDetails?: { blockedURL?: string; violatedDirective: string; isReportOnly: boolean; contentSecurityPolicyViolationType: string } };
    };
  };
  'Runtime.bindingCalled': { name: string; payload: string };
  'ServiceWorker.workerVersionUpdated': { versions: readonly { versionId: string; scriptURL: string; status: string; runningStatus: string }[] };
  'Target.attachedToTarget': { sessionId: string; targetInfo: TargetInfo; waitingForDebugger: boolean };
  'Target.detachedFromTarget': { sessionId: string };
  'Target.receivedMessageFromTarget': { sessionId: string; message: string };
  'Target.targetCreated': { targetInfo: TargetInfo };
  'Target.targetInfoChanged': { targetInfo: TargetInfo };
  'Target.targetDestroyed': { targetId: string };
  'Fetch.requestPaused': {
    requestId: string; request: CdpRequest; frameId?: string; resourceType?: string; networkId?: string;
    responseStatusCode?: number; responseErrorReason?: string; responseHeaders?: readonly { name: string; value: string }[];
  };
}
type Method = keyof CdpEvents;
const EVENTS = [
  'Network.requestWillBeSent', 'Network.requestWillBeSentExtraInfo', 'Network.responseReceived', 'Network.responseReceivedExtraInfo',
  'Network.loadingFailed', 'Network.loadingFinished', 'Network.dataReceived', 'Network.webSocketCreated', 'Network.webSocketWillSendHandshakeRequest', 'Network.webSocketHandshakeResponseReceived',
  'Network.webSocketFrameSent', 'Network.webSocketFrameReceived', 'Page.frameAttached', 'Page.frameNavigated', 'Page.navigatedWithinDocument',
  'Page.windowOpen', 'Audits.issueAdded', 'Runtime.bindingCalled', 'ServiceWorker.workerVersionUpdated', 'Target.attachedToTarget', 'Target.detachedFromTarget',
  'Target.receivedMessageFromTarget', 'Target.targetCreated', 'Target.targetInfoChanged', 'Target.targetDestroyed', 'Fetch.requestPaused',
] as const satisfies readonly Method[];
type Handlers = { readonly [M in Method]?: (params: CdpEvents[M]) => void };

/** A protocol session to one target: a Playwright CDP session, or a non-flat child session reached through its parent. */
interface Channel {
  send(method: string, params?: object): Promise<unknown>;
  listen(listener: (method: string, params: unknown) => void): () => void;
}

/** Playwright's CDP session typed by protocol method; the collector reads only the fields declared in `CdpEvents`. */
interface RawSession {
  send(method: string, params?: object): Promise<unknown>;
  on(event: string, listener: (params: unknown) => void): unknown;
  off(event: string, listener: (params: unknown) => void): unknown;
  detach(): Promise<void>;
}
const raw = (session: CDPSession): RawSession => session as unknown as RawSession;

function sessionChannel(session: RawSession): Channel {
  return {
    send: (method, params) => session.send(method, params),
    listen(listener) {
      const subscriptions = EVENTS.map(method => {
        const handler = (params: unknown): void => { listener(method, params); };
        session.on(method, handler);
        return () => { session.off(method, handler); };
      });
      return () => { for (const unsubscribe of subscriptions) unsubscribe(); };
    },
  };
}

const COMMAND_TIMEOUT = 5000;
/** How long the network layer must stay quiet after a page closes before its unload traffic is taken as complete. */
const CLOSE_QUIET = 300;
/** How long other requests wait for a starting Worker to be observed before they continue anyway. */
const WORKER_WAIT = 3000;
/** Target IDs, which are also the request IDs of Worker main scripts and navigations. */
const TARGET_ID = /^[0-9A-F]{32}$/;

/** A session attached with `flatten: false`: commands and events travel inside its parent's target messages. */
function childChannel(parent: Channel, sessionId: string): Channel & { close(): void } {
  let next = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<(method: string, params: unknown) => void>();
  const fail = (reason: string): void => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    pending.clear();
  };
  const stop = parent.listen((method, params) => {
    const event = params as { sessionId?: string; message?: string };
    if (event.sessionId !== sessionId) return;
    if (method === 'Target.detachedFromTarget') { fail('Target detached'); return; }
    if (method !== 'Target.receivedMessageFromTarget' || typeof event.message !== 'string') return;
    const message = JSON.parse(event.message) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
    if (typeof message.id === 'number') {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(message.error.message ?? 'CDP error'));
      else waiting.resolve(message.result);
    } else if (message.method) for (const listener of listeners) listener(message.method, message.params ?? {});
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, COMMAND_TIMEOUT);
        pending.set(id, { resolve, reject, timer });
        parent.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch((error: unknown) => {
          clearTimeout(timer);
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
    },
    listen(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close() {
      stop();
      fail('Channel closed');
      listeners.clear();
    },
  };
}

const BINDING = '__osrNetworkAudit';

/**
 * Installed in every document before its scripts: reports `document.cookie` and Cookie Store writes and service worker
 * registration attempts with their outcome through the CDP binding, which it then hides from the page.
 */
function installAuditHooks(binding: string): void {
  const scope = globalThis as unknown as Record<string, unknown>;
  const report = scope[binding];
  if (typeof report !== 'function') return;
  try { delete scope[binding]; } catch { /* the binding stays visible; reporting still works */ }
  const send = (record: object): void => {
    try { (report as (payload: string) => void)(JSON.stringify(record)); } catch { /* the document is going away */ }
  };
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (cookie?.get && cookie.set) {
    const { get, set } = cookie;
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true, enumerable: cookie.enumerable,
      get(this: Document) { return get.call(this) as string; },
      set(this: Document, value: unknown) {
        send({ kind: 'cookie', source: 'script', url: location.href, value: String(value) });
        set.call(this, value);
      },
    });
  }
  const store = (globalThis as unknown as { CookieStore?: { prototype: Record<string, unknown> } }).CookieStore?.prototype;
  for (const name of ['set', 'delete']) {
    const original = store?.[name];
    if (!store || typeof original !== 'function') continue;
    store[name] = function (this: unknown, ...args: unknown[]) {
      send({ kind: 'cookie', source: 'cookie-store', url: location.href, value: `${name} ${JSON.stringify(args)}` });
      return (original as (...values: unknown[]) => unknown).apply(this, args);
    };
  }
  const container = (globalThis as unknown as { ServiceWorkerContainer?: { prototype: ServiceWorkerContainer } }).ServiceWorkerContainer?.prototype;
  const register = container?.register;
  let attempts = 0;
  if (container && register) {
    container.register = function (this: ServiceWorkerContainer, ...args: Parameters<ServiceWorkerContainer['register']>) {
      const id = ++attempts;
      const url = String(args[0]);
      send({ kind: 'service-worker', id, url, state: 'pending' });
      const result = register.apply(this, args);
      result.then(
        () => { send({ kind: 'service-worker', id, url, state: 'fulfilled' }); },
        (error: unknown) => { send({ kind: 'service-worker', id, url, state: `rejected:${error instanceof Error ? error.name : 'unknown'}` }); },
      );
      return result;
    };
  }
}
const HOOK_SOURCE = `(${installAuditHooks.toString()})(${JSON.stringify(BINDING)});`;

const headersOf = (headers: Readonly<Record<string, string>> | undefined): Header[] => Object.entries(headers ?? {}).map(([name, value]) => [name, value]);
const headerValue = (headers: Readonly<Record<string, string>>, name: string): string | undefined =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];

/** Base64 of a request body: empty for none, null when the event says a body exists but does not carry it. */
function bodyOf(request: CdpRequest): string | null {
  const entries = request.postDataEntries?.filter(entry => entry.bytes !== undefined) ?? [];
  if (entries.length > 0) return Buffer.concat(entries.map(entry => Buffer.from(entry.bytes ?? '', 'base64'))).toString('base64');
  if (request.postData !== undefined) return Buffer.from(request.postData, 'utf8').toString('base64');
  return request.hasPostData ? null : '';
}

function mergeHeaders(target: Header[], extra: readonly Header[]): void {
  for (const header of extra) {
    if (!target.some(([name, value]) => name.toLowerCase() === header[0].toLowerCase() && value === header[1])) target.push(header);
  }
}

/** One request as a target session reported it: a hop of `requestWillBeSent`, with the response details of that hop. */
interface Hop {
  readonly phase: string;
  readonly method: string;
  readonly url: string;
  readonly resourceType: string;
  readonly headers: Header[];
  body: string | null;
  status?: number;
}

/**
 * Everything the target sessions reported about one request ID. The session of the renderer that made the request owns
 * it: the one that reported it starting, or else any of its later events, which a session that enabled Network after
 * the request started still reports. The browser reports the network-layer details (`ExtraInfo`) of a Worker's request
 * on its page's session, so those never decide the owner.
 */
interface Sighting {
  target: TargetState;
  initiator: Initiator;
  /** 2 when the owner reported the request starting, 1 for a later renderer event, 0 for network-layer details only. */
  strength: number;
  /** Network-layer headers reported before the first hop. */
  readonly early: Header[];
  readonly hops: Hop[];
  /** `Set-Cookie` values of its responses, with the phase each arrived in. */
  readonly cookies: { readonly phase: string; readonly url: string; readonly value: string }[];
  resourceType?: string;
  status?: number;
  mimeType?: string;
  failure?: string;
  blocked: boolean;
}

/** A request as the browser's network layer saw it. */
interface NetworkEntry {
  /** The interception ID, which the response stage of the same request repeats. */
  readonly fetchId: string;
  readonly networkId?: string;
  readonly frameId?: string;
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly headers: Header[];
  readonly body: string | null;
  readonly phase: string;
  /** Answered by `serve`, so it never left the browser. */
  readonly served: boolean;
  /** The response of a Worker's main script, which the audit also observes at this layer. */
  status?: number;
  mimeType?: string;
  failure?: string;
}

/** A response the audit gives at the browser's network layer, for control samples. */
export interface ServedResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

interface TargetState {
  readonly id: string;
  readonly type: string;
  url: string;
  covered: boolean;
  note?: string;
  /** Frames of a page target, by which the browser's network layer names the requester. */
  readonly frames: Set<string>;
  /** A page whose closing has started: what its frames still send belongs to the `close` phase. */
  closing: boolean;
}

type SocketState = Omit<WebSocketRecord, 'headers' | 'frames' | 'protocol'> & { headers: Header[]; frames: WebSocketFrame[]; protocol: string | null };

interface Discovered {
  info: TargetInfo;
  readonly phase: string;
  readonly urls: string[];
  destroyed: boolean;
}

interface BrowserObserver {
  readonly browser: Browser;
  readonly session: RawSession;
  readonly channel: Channel;
  readonly contexts: Set<string>;
  readonly discovered: Map<string, Discovered>;
  readonly waiting: Map<string, () => void>;
  readonly stop: () => void;
}

interface AttachedPage {
  readonly targetId: string;
  readonly channel: Channel;
  readonly observer: BrowserObserver;
  close(): Promise<unknown>;
  detach(): Promise<unknown>;
  closed: boolean;
}

/** Ignored discovered targets: the browser's own UI, not web content an audited page could use. */
const browserUi = (info: TargetInfo): boolean => ['browser', 'browser_ui', 'tab'].includes(info.type) || /^(?:chrome|chrome-untrusted|devtools):/.test(info.url);
/** Whether a response refused a Worker's script, so that the Worker never ran. */
const refused = (response: { status?: number; mimeType?: string; failure?: string } | undefined): boolean => response !== undefined
  && (response.failure !== undefined || (response.status ?? 0) >= 400 || (response.mimeType !== undefined && !/(?:java|ecma)script/.test(response.mimeType)));

/**
 * Records the network channels of attached pages and their Workers. Attach every page before it navigates; `capture()`
 * returns what was seen so far, `finish()` closes the attached pages as the `close` phase and ends the observation.
 */
export class NetworkAudit {
  #phase = 'test';
  readonly #browsers = new Map<Browser, Promise<BrowserObserver>>();
  readonly #targets = new Map<string, TargetState>();
  readonly #pages: AttachedPage[] = [];
  readonly #closers: (() => void)[] = [];
  readonly #sightings = new Map<string, Sighting>();
  readonly #network: NetworkEntry[] = [];
  readonly #sockets: SocketState[] = [];
  readonly #events: AuditEvent[] = [];
  readonly #serviceWorkers = new Map<string, ServiceWorkerRecord>();
  /** Service worker versions by ID, with their latest lifecycle state. */
  readonly #versions = new Map<string, ServiceWorkerRecord>();
  readonly #popupUrls = new Map<string, string[]>();
  /** Work started by events, which a drain waits for. */
  readonly #pending = new Set<Promise<unknown>>();
  /** Browser-layer entries by interception ID, for their response stage. */
  readonly #byFetchId = new Map<string, NetworkEntry>();
  readonly #faults: string[] = [];
  readonly #served: { readonly url: RegExp; readonly response: ServedResponse }[] = [];
  /**
   * Script responses Playwright reported for attached pages, in order. Playwright observes a Worker's script even when a
   * page route answers it before the network layer, which tells whether a Worker the audit could not attach ever ran.
   */
  readonly #playwrightScripts: { readonly url: string; readonly status?: number; readonly mimeType?: string; readonly failure?: string }[] = [];
  /** Workers whose script passed the network layer but whose session is not ready yet, by target ID. */
  readonly #starting = new Map<string, { readonly promise: Promise<void>; resolve(): void }>();
  #finished = false;

  /** Labels the events that follow, such as `import` or `restore`; `close` is used while attached pages close. */
  phase(name: string): void {
    this.#phase = name;
  }

  /**
   * For control samples: answers requests whose URL matches at the browser's network layer, so they never leave the
   * browser. Unlike a page route, which answers before that layer, it lets the audit cover a served Worker.
   */
  serve(url: RegExp, response: ServedResponse): void {
    this.#served.push({ url, response });
  }

  /** Attaches a Playwright page, normally still blank so that its first document is covered. */
  async attachPage(page: Page): Promise<void> {
    const browser = page.context().browser();
    if (!browser) throw new Error('The network audit needs the page\'s browser');
    const observer = await this.#browser(browser);
    const session = await page.context().newCDPSession(page);
    const channel = sessionChannel(raw(session));
    const { targetInfo } = await channel.send('Target.getTargetInfo') as { targetInfo: TargetInfo };
    const responded = (response: Response): void => {
      if (response.request().resourceType() !== 'script') return;
      this.#playwrightScripts.push({ url: response.url(), status: response.status(), mimeType: response.headers()['content-type'] });
    };
    const failed = (request: Request): void => {
      if (request.resourceType() === 'script') this.#playwrightScripts.push({ url: request.url(), failure: request.failure()?.errorText ?? 'failed' });
    };
    page.on('response', responded);
    page.on('requestfailed', failed);
    this.#closers.push(() => {
      page.off('response', responded);
      page.off('requestfailed', failed);
    });
    await this.#observePage(channel, targetInfo, observer);
    this.#pages.push({ targetId: targetInfo.targetId, channel, observer, close: () => page.close(), detach: () => session.detach(), closed: false });
  }

  /** Attaches a target another CDP client created, such as the native-lifecycle browser's tab, before it navigates. */
  async attachTarget(browser: Browser, targetId: string): Promise<void> {
    const observer = await this.#browser(browser);
    const { sessionId } = await observer.channel.send('Target.attachToTarget', { targetId, flatten: false }) as { sessionId: string };
    const channel = childChannel(observer.channel, sessionId);
    this.#closers.push(() => { channel.close(); });
    const { targetInfo } = await observer.channel.send('Target.getTargetInfo', { targetId }) as { targetInfo: TargetInfo };
    await this.#observePage(channel, targetInfo, observer);
    this.#pages.push({
      targetId, channel, observer, closed: false,
      close: () => observer.channel.send('Target.closeTarget', { targetId }),
      detach: () => observer.channel.send('Target.detachFromTarget', { sessionId }),
    });
  }

  /** Closes an attached page under the `close` phase and waits until the traffic of its unloading has arrived. */
  async close(page: Page | string): Promise<void> {
    const targetId = typeof page === 'string' ? page : await this.#targetOf(page);
    const attached = this.#pages.find(candidate => candidate.targetId === targetId);
    if (!attached) throw new Error('The page is not attached to the network audit');
    const previous = this.#phase;
    await this.#drain();
    this.#phase = 'close';
    try {
      await this.#closePage(attached);
    } finally {
      this.#phase = previous;
    }
  }

  /**
   * Waits until every Worker whose script has passed the network layer is observed. A case that ends a Worker right
   * after creating it can wait for this first; otherwise the Worker may end before the audit observes it, which leaves
   * it uncovered.
   */
  async ready(): Promise<void> {
    await this.#drain();
    await Promise.all([...this.#starting.values()].map(starting => starting.promise));
  }

  /** What was observed so far. */
  async capture(): Promise<AuditCapture> {
    await this.#drain();
    return this.#capture(await this.#cookieJar(), await Promise.all(this.#browsers.values()));
  }

  /** Closes the attached pages as the `close` phase, ends every observation and returns the complete capture. */
  async finish(): Promise<AuditCapture> {
    if (this.#finished) throw new Error('The network audit already finished');
    this.#finished = true;
    try {
      await this.#drain();
      this.#phase = 'close';
      for (const page of [...this.#pages].reverse()) {
        if (page.closed) continue;
        if (page.observer.browser.isConnected()) await this.#closePage(page);
        else this.#faults.push(`page ${page.targetId} ended with its browser before the audit closed it`);
      }
      await this.#drain();
      return this.#capture(await this.#cookieJar(), await Promise.all(this.#browsers.values()));
    } finally {
      await this.#stop();
    }
  }

  async #targetOf(page: Page): Promise<string> {
    const session = await page.context().newCDPSession(page);
    try {
      const { targetInfo } = await raw(session).send('Target.getTargetInfo') as { targetInfo: TargetInfo };
      return targetInfo.targetId;
    } finally {
      await session.detach();
    }
  }

  async #closePage(page: AttachedPage): Promise<void> {
    const destroyed = new Promise<void>(resolve => {
      if (page.observer.discovered.get(page.targetId)?.destroyed) resolve();
      else page.observer.waiting.set(page.targetId, resolve);
    });
    const target = this.#targets.get(page.targetId);
    if (target) target.closing = true;
    page.closed = true;
    try {
      await page.close();
    } catch (error) {
      this.#faults.push(`page ${page.targetId} could not be closed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ended = await Promise.race([destroyed.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => { resolve(false); }, COMMAND_TIMEOUT); })]);
    clearTimeout(timer);
    if (!ended) this.#faults.push(`page ${page.targetId} did not end within ${COMMAND_TIMEOUT} ms of closing`);
    // The browser may start a keepalive request of the unloading document after the target ends; no event marks the
    // last one, so wait until the network layer has been quiet for a while.
    for (let quiet = 0, seen = this.#network.length; quiet < CLOSE_QUIET; seen = this.#network.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
      quiet = this.#network.length === seen ? quiet + 50 : 0;
    }
    await page.observer.channel.send('Target.getTargets');
  }

  /** Waits for events already sent: every live session answers a command only after the events before it. */
  async #drain(): Promise<void> {
    const observers = (await Promise.all(this.#browsers.values())).filter(observer => observer.browser.isConnected());
    await Promise.all([
      ...observers.map(observer => observer.channel.send('Target.getTargets')),
      ...this.#pages.filter(page => !page.closed && page.observer.browser.isConnected()).map(page => page.channel.send('Target.getTargetInfo').catch(() => undefined)),
    ]);
    await Promise.all(this.#pending);
  }

  async #cookieJar(): Promise<CookieRecord[]> {
    const records: CookieRecord[] = [];
    for (const observer of await Promise.all(this.#browsers.values())) {
      if (!observer.browser.isConnected()) continue;
      for (const browserContextId of observer.contexts) {
        let cookies: { name: string; value: string; domain: string; path: string }[];
        try {
          ({ cookies } = await observer.channel.send('Storage.getCookies', { browserContextId }) as { cookies: typeof cookies });
        } catch {
          continue; // A context its creator disposed holds no cookies any more.
        }
        for (const cookie of cookies) {
          records.push({
            kind: 'cookie', action: 'stored', source: 'jar', target: 'browser', initiator: 'browser', phase: this.#phase,
            url: `${cookie.domain}${cookie.path}`, value: `${cookie.name}=${cookie.value}`,
          });
        }
      }
    }
    return records;
  }

  async #stop(): Promise<void> {
    for (const close of this.#closers) close();
    for (const page of this.#pages) if (!page.closed) await page.detach().catch(() => undefined);
    for (const starting of this.#starting.values()) starting.resolve();
    for (const observer of await Promise.all(this.#browsers.values())) {
      observer.stop();
      await observer.channel.send('Fetch.disable').catch(() => undefined);
      await observer.session.detach().catch(() => undefined);
    }
  }

  #browser(browser: Browser): Promise<BrowserObserver> {
    let observer = this.#browsers.get(browser);
    if (!observer) {
      observer = this.#startBrowser(browser);
      this.#browsers.set(browser, observer);
    }
    return observer;
  }

  async #startBrowser(browser: Browser): Promise<BrowserObserver> {
    const session = raw(await browser.newBrowserCDPSession());
    const channel = sessionChannel(session);
    const discovered = new Map<string, Discovered>();
    const waiting = new Map<string, () => void>();
    const note = (info: TargetInfo): void => {
      // A service worker or shared worker script also has its target's ID; no dedicated Worker will claim it.
      if (info.type !== 'worker') this.#starting.get(info.targetId)?.resolve();
      const known = discovered.get(info.targetId);
      if (!known) discovered.set(info.targetId, { info, phase: this.#phase, urls: info.url ? [info.url] : [], destroyed: false });
      else {
        known.info = info;
        if (info.url && known.urls.at(-1) !== info.url) known.urls.push(info.url);
      }
    };
    const handlers: Handlers = {
      'Fetch.requestPaused': event => {
        if (event.responseStatusCode !== undefined || event.responseErrorReason !== undefined) {
          const entry = this.#byFetchId.get(event.requestId);
          if (entry) {
            entry.status = event.responseStatusCode;
            entry.mimeType = event.responseHeaders?.find(({ name }) => name.toLowerCase() === 'content-type')?.value;
            entry.failure = event.responseErrorReason;
            if (refused(entry) && entry.networkId !== undefined) this.#starting.get(entry.networkId)?.resolve();
          }
          this.#track(channel.send('Fetch.continueRequest', { requestId: event.requestId }));
          return;
        }
        const url = event.request.url + (event.request.urlFragment ?? '');
        const served = this.#served.find(rule => rule.url.test(url))?.response;
        const owner = [...this.#targets.values()].find(target => event.frameId !== undefined && target.frames.has(event.frameId));
        const entry: NetworkEntry = {
          fetchId: event.requestId, networkId: event.networkId, frameId: event.frameId, url, method: event.request.method, resourceType: event.resourceType ?? 'Other',
          headers: headersOf(event.request.headers), body: bodyOf(event.request), phase: owner?.closing ? 'close' : this.#phase, served: served !== undefined,
        };
        this.#network.push(entry);
        this.#byFetchId.set(event.requestId, entry);
        // A Worker's main script has the Worker's target ID as its request ID, and the browser creates the target only
        // when that script arrives. Until its session is ready, other requests wait, so that any the new Worker sends
        // first are still in flight when it is observed. Its response is observed too, as a refused script never runs.
        const script = event.networkId !== undefined && TARGET_ID.test(event.networkId) && event.resourceType !== 'Document';
        if (served) Object.assign(entry, { status: served.status ?? 200, mimeType: headerValue(served.headers ?? {}, 'content-type') });
        const release = (): Promise<unknown> => served
          ? channel.send('Fetch.fulfillRequest', {
            requestId: event.requestId, responseCode: served.status ?? 200, body: Buffer.from(served.body, 'utf8').toString('base64'),
            responseHeaders: Object.entries(served.headers ?? {}).map(([name, value]) => ({ name, value })),
          })
          : channel.send('Fetch.continueRequest', { requestId: event.requestId, ...(script ? { interceptResponse: true } : {}) });
        if (script) this.#start(event.networkId ?? '');
        const wait = script || event.resourceType === 'Document' ? Promise.resolve() : Promise.all([...this.#starting.values()].map(starting => starting.promise));
        this.#track(wait.then(release));
      },
      'Target.targetCreated': event => { note(event.targetInfo); },
      'Target.targetInfoChanged': event => { note(event.targetInfo); },
      'Target.targetDestroyed': event => {
        const known = discovered.get(event.targetId);
        if (known) known.destroyed = true;
        waiting.get(event.targetId)?.();
        waiting.delete(event.targetId);
      },
    };
    const stop = channel.listen(this.#dispatch(handlers));
    await channel.send('Target.setDiscoverTargets', { discover: true });
    await channel.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    return { browser, session, channel, contexts: new Set(), discovered, waiting, stop };
  }

  /** Marks a Worker as starting until its session is ready, its script is refused, or a while has passed. */
  #start(targetId: string): void {
    if (this.#starting.has(targetId)) return;
    let resolve = (): void => undefined;
    const promise = new Promise<void>(done => { resolve = done; });
    const timer = setTimeout(resolve, WORKER_WAIT);
    this.#starting.set(targetId, { promise, resolve });
    void promise.then(() => {
      clearTimeout(timer);
      this.#starting.delete(targetId);
    });
  }

  /** Keeps an event's work until it settles, so that a drain waits for it; its failure is not the audit's. */
  #track(work: Promise<unknown>): void {
    const tracked = work.catch(() => undefined).finally(() => { this.#pending.delete(tracked); });
    this.#pending.add(tracked);
  }

  #dispatch(handlers: Handlers): (method: string, params: unknown) => void {
    return (method, params) => {
      const handler = handlers[method as Method] as ((params: unknown) => void) | undefined;
      if (!handler) return;
      try {
        handler(params);
      } catch (error) {
        this.#faults.push(`${method}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  }

  #target(id: string, type: string, url: string, covered: boolean, note?: string): TargetState {
    const target: TargetState = { id, type, url, covered, ...(note ? { note } : {}), frames: new Set(type === 'page' ? [id] : []), closing: false };
    this.#targets.set(id, target);
    return target;
  }

  #uncover(target: TargetState, note: string): void {
    target.covered = false;
    target.note = note;
  }

  async #observePage(channel: Channel, info: TargetInfo, observer: BrowserObserver): Promise<void> {
    const fresh = info.url === 'about:blank' || info.url === '';
    const target = this.#target(info.targetId, 'page', info.url, fresh, fresh ? undefined : 'attached after the page loaded');
    if (info.browserContextId) observer.contexts.add(info.browserContextId);
    this.#observe(channel, target, 'page');
    // A session runs its commands in order, so the binding exists before the hook that uses it.
    await Promise.all([
      channel.send('Page.enable'),
      channel.send('Network.enable', { maxPostDataSize: 1 << 22 }),
      channel.send('Audits.enable'),
      channel.send('ServiceWorker.enable'),
      channel.send('Runtime.enable'),
      channel.send('Runtime.addBinding', { name: BINDING }),
      channel.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK_SOURCE, runImmediately: true }),
      channel.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false }),
    ]);
  }

  /** Subscribes to one target's events; `kind` is the initiator its own requests are attributed to. */
  #observe(channel: Channel, target: TargetState, kind: 'page' | 'worker'): void {
    const sockets = new Map<string, SocketState>();
    /** The sighting of a request ID, whose owner a stronger report from this session replaces. */
    const sight = (requestId: string, strength: number, initiator: Initiator = kind): Sighting => {
      let sighting = this.#sightings.get(requestId);
      if (!sighting) {
        sighting = { target, initiator, strength, early: [], hops: [], cookies: [], blocked: false };
        this.#sightings.set(requestId, sighting);
      } else if (strength > sighting.strength) Object.assign(sighting, { target, initiator, strength });
      return sighting;
    };
    const setCookies = (sighting: Sighting, url: string, headers: Readonly<Record<string, string>>): void => {
      for (const value of (headerValue(headers, 'set-cookie') ?? '').split('\n').filter(Boolean)) {
        if (!sighting.cookies.some(cookie => cookie.value === value)) sighting.cookies.push({ phase: this.#phase, url, value });
      }
    };
    /** A WebSocket first seen after it was created lacks its URL, so the target's own record is incomplete. */
    const socket = (requestId: string, url?: string): SocketState => {
      let state = sockets.get(requestId);
      if (!state) {
        state = { kind: 'websocket', target: target.id, initiator: kind, phase: this.#phase, url: url ?? '', headers: [], frames: [], protocol: null };
        if (url === undefined) this.#uncover(target, 'a WebSocket started before the audit observed this target');
        sockets.set(requestId, state);
        this.#sockets.push(state);
      }
      return state;
    };
    const frame = (direction: WebSocketFrame['direction']) => (event: CdpEvents['Network.webSocketFrameSent']): void => {
      const { opcode, payloadData } = event.response;
      socket(event.requestId).frames.push({ direction, opcode, data: opcode === 1 ? Buffer.from(payloadData, 'utf8').toString('base64') : payloadData });
    };
    /** A Worker whose script was refused never runs, so it need not hold other requests. */
    const settled = (requestId: string): void => {
      if (refused(this.#sightings.get(requestId))) this.#starting.get(requestId)?.resolve();
    };
    const handlers: Handlers = {
      'Network.requestWillBeSent': event => {
        const original = event.initiator?.type === 'preflight' && event.initiator.requestId ? this.#sightings.get(event.initiator.requestId) : undefined;
        const sighting = sight(event.requestId, 2, original?.initiator);
        const previous = sighting.hops.at(-1);
        if (previous && event.redirectResponse) previous.status = event.redirectResponse.status;
        const hop: Hop = {
          phase: this.#phase, method: event.request.method, url: event.request.url + (event.request.urlFragment ?? ''), resourceType: event.type ?? 'Other',
          headers: headersOf(event.request.headers), body: bodyOf(event.request),
        };
        if (!previous) mergeHeaders(hop.headers, sighting.early);
        if (hop.body === null) {
          this.#track(channel.send('Network.getRequestPostData', { requestId: event.requestId })
            .then(result => { hop.body = Buffer.from((result as { postData: string }).postData, 'utf8').toString('base64'); }));
        }
        sighting.hops.push(hop);
      },
      'Network.requestWillBeSentExtraInfo': event => {
        const sighting = sight(event.requestId, 0);
        mergeHeaders(sighting.hops.at(-1)?.headers ?? sighting.early, headersOf(event.headers));
      },
      'Network.responseReceived': event => {
        const sighting = sight(event.requestId, 1);
        sighting.status = event.response.status;
        sighting.mimeType = event.response.mimeType;
        sighting.resourceType ??= event.type;
        setCookies(sighting, event.response.url, event.response.headers);
        settled(event.requestId);
      },
      'Network.responseReceivedExtraInfo': event => {
        const sighting = sight(event.requestId, 0);
        setCookies(sighting, sighting.hops.at(-1)?.url ?? '', event.headers);
      },
      'Network.dataReceived': event => { sight(event.requestId, 1); },
      'Network.loadingFinished': event => { sight(event.requestId, 1); },
      'Network.loadingFailed': event => {
        const sighting = sight(event.requestId, 1);
        sighting.resourceType ??= event.type;
        sighting.failure = event.blockedReason ? `${event.errorText} (${event.blockedReason})` : event.errorText;
        if (event.blockedReason) sighting.blocked = true;
        settled(event.requestId);
      },
      'Network.webSocketCreated': event => { socket(event.requestId, event.url); },
      'Network.webSocketWillSendHandshakeRequest': event => { mergeHeaders(socket(event.requestId).headers, headersOf(event.request.headers)); },
      'Network.webSocketHandshakeResponseReceived': event => { socket(event.requestId).protocol = headerValue(event.response.headers, 'sec-websocket-protocol') ?? null; },
      'Network.webSocketFrameSent': frame('sent'),
      'Network.webSocketFrameReceived': frame('received'),
      'Page.frameAttached': event => { target.frames.add(event.frameId); },
      'Page.frameNavigated': event => {
        target.frames.add(event.frame.id);
        if (event.frame.parentId) return;
        target.url = event.frame.url;
        this.#navigation(target, event.frame.url + (event.frame.urlFragment ?? ''));
      },
      'Page.navigatedWithinDocument': event => { if (event.frameId === target.id) this.#navigation(target, event.url); },
      'Page.windowOpen': event => { this.#popupUrls.set(target.id, [...this.#popupUrls.get(target.id) ?? [], event.url]); },
      // Audits.enable also reports the issues raised before it.
      'Audits.issueAdded': event => {
        const details = event.issue.details.contentSecurityPolicyIssueDetails;
        if (event.issue.code !== 'ContentSecurityPolicyIssue' || !details) return;
        const record: CspRecord = {
          kind: 'csp', target: target.id, initiator: kind, phase: this.#phase, directive: details.violatedDirective, blockedUrl: details.blockedURL ?? '',
          reportOnly: details.isReportOnly, violation: details.contentSecurityPolicyViolationType,
        };
        this.#events.push(record);
      },
      'Runtime.bindingCalled': event => {
        if (event.name !== BINDING) return;
        const record = JSON.parse(event.payload) as { kind: string; source?: 'script' | 'cookie-store'; url: string; value?: string; id?: number; state?: string };
        if (record.kind === 'cookie') {
          this.#events.push({ kind: 'cookie', action: 'write', source: record.source ?? 'script', target: target.id, initiator: kind, phase: this.#phase, url: record.url, value: record.value ?? '' });
        } else if (record.kind === 'service-worker') {
          const key = `${target.id}:${record.id}`;
          const known = this.#serviceWorkers.get(key);
          const state = record.state ?? 'unknown';
          this.#serviceWorkers.set(key, known ? { ...known, state } : {
            kind: 'service-worker', action: 'register', target: target.id, initiator: kind, phase: this.#phase, url: record.url, state,
          });
        }
      },
      'ServiceWorker.workerVersionUpdated': event => {
        for (const version of event.versions) {
          const state = `${version.status}, ${version.runningStatus}`;
          const known = this.#versions.get(version.versionId);
          this.#versions.set(version.versionId, known ? { ...known, state } : {
            kind: 'service-worker', action: 'version', target: target.id, initiator: 'browser', phase: this.#phase, url: version.scriptURL, state,
          });
        }
      },
      'Target.attachedToTarget': event => { this.#track(this.#attachChild(channel, event)); },
    };
    channel.listen(this.#dispatch(handlers));
  }

  #navigation(target: TargetState, url: string): void {
    const record: NavigationRecord = { kind: 'navigation', target: target.id, initiator: 'page', phase: this.#phase, url };
    this.#events.push(record);
  }

  /** Observes an auto-attached dedicated Worker; other targets are left alone and stay uncovered. */
  async #attachChild(parent: Channel, event: CdpEvents['Target.attachedToTarget']): Promise<void> {
    const { sessionId, targetInfo, waitingForDebugger } = event;
    const channel = childChannel(parent, sessionId);
    this.#closers.push(() => { channel.close(); });
    if (targetInfo.type !== 'worker') {
      this.#starting.get(targetInfo.targetId)?.resolve();
      this.#target(targetInfo.targetId, targetInfo.type, targetInfo.url, false, 'not observed by the audit');
      await channel.send('Runtime.runIfWaitingForDebugger').catch(() => undefined);
      await parent.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
      return;
    }
    // Covered only once its session is ready; #capture also requires its script to have passed the network layer.
    const target = this.#target(targetInfo.targetId, 'worker', targetInfo.url, false, waitingForDebugger ? undefined : 'attached after it started');
    this.#observe(channel, target, 'worker');
    try {
      await Promise.all([
        channel.send('Network.enable', { maxPostDataSize: 1 << 22 }),
        channel.send('Audits.enable'),
        channel.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false }),
      ]);
      if (waitingForDebugger && target.note === undefined) target.covered = true;
    } catch (error) {
      this.#uncover(target, `not observed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.#starting.get(targetInfo.targetId)?.resolve();
      await channel.send('Runtime.runIfWaitingForDebugger').catch(() => undefined);
    }
  }

  /** Joins the two views of each request, and adds what only the browser saw or discovered. */
  #capture(jar: readonly CookieRecord[], observers: readonly BrowserObserver[]): AuditCapture {
    const byNetworkId = new Map<string, NetworkEntry[]>();
    for (const entry of this.#network) if (entry.networkId !== undefined) byNetworkId.set(entry.networkId, [...byNetworkId.get(entry.networkId) ?? [], entry]);
    const matched = new Set<NetworkEntry>();
    // A Worker's script answered by a page route reports its response only to that Worker, which may end before the
    // audit attaches; Playwright's own report of the response, paired by URL in order, supplies it.
    const reported = [...this.#playwrightScripts];
    const playwrightResponse = (url: string) => {
      const index = reported.findIndex(response => response.url === url);
      return index === -1 ? undefined : reported.splice(index, 1)[0];
    };
    const requests: RequestRecord[] = [];
    for (const [networkId, sighting] of this.#sightings) {
      sighting.hops.forEach((hop, index) => {
        const entry = byNetworkId.get(networkId)?.find(candidate => !matched.has(candidate) && candidate.url === hop.url);
        if (entry) matched.add(entry);
        const last = index === sighting.hops.length - 1;
        const headers = [...hop.headers];
        if (entry) mergeHeaders(headers, entry.headers);
        const fallback = hop.resourceType === 'Script' ? playwrightResponse(hop.url) : undefined;
        const unanswered = last && sighting.status === undefined && sighting.failure === undefined && entry?.status === undefined && entry?.failure === undefined;
        const status = last ? sighting.status ?? entry?.status ?? (unanswered ? fallback?.status : undefined) : hop.status;
        const failure = last ? sighting.failure ?? entry?.failure ?? (unanswered ? fallback?.failure : undefined) : undefined;
        requests.push({
          kind: 'request', target: sighting.target.id, initiator: sighting.initiator, phase: hop.phase, method: hop.method, url: hop.url,
          resourceType: hop.resourceType, headers, body: hop.body ?? entry?.body ?? null,
          delivery: last && sighting.blocked ? 'blocked' : entry && !entry.served ? 'sent' : 'intercepted',
          ...(status === undefined ? {} : { status }), ...(failure === undefined ? {} : { failure }),
        });
      });
    }
    const pages = [...this.#targets.values()].filter(target => target.type === 'page');
    for (const entry of this.#network.filter(candidate => !matched.has(candidate))) {
      // A session that started observing late still reported later events of the request, which attribute it.
      const seen = entry.networkId === undefined ? undefined : this.#sightings.get(entry.networkId);
      const sighting = seen && seen.strength > 0 ? seen : undefined;
      const owner = pages.find(page => entry.frameId !== undefined && page.frames.has(entry.frameId));
      const headers = [...entry.headers];
      if (sighting) mergeHeaders(headers, sighting.early);
      const status = sighting?.status ?? entry.status;
      const failure = sighting?.failure ?? entry.failure;
      requests.push({
        kind: 'request', target: sighting?.target.id ?? owner?.id ?? 'browser', initiator: sighting?.initiator ?? (owner ? 'browser' : 'unknown'),
        phase: entry.phase, method: entry.method, url: entry.url, resourceType: sighting?.resourceType ?? entry.resourceType, headers, body: entry.body,
        delivery: sighting?.blocked ? 'blocked' : entry.served ? 'intercepted' : 'sent',
        ...(status === undefined ? {} : { status }), ...(failure === undefined ? {} : { failure }),
      });
    }
    // A request a renderer reported only from its later events, which never reached the network layer, cannot be described.
    const httpCookies: CookieRecord[] = [];
    for (const [networkId, sighting] of this.#sightings) {
      if (sighting.strength === 1 && !byNetworkId.has(networkId)) {
        this.#uncover(sighting.target, 'a request started before the audit observed this target');
      }
      for (const { phase, url, value } of sighting.cookies) {
        httpCookies.push({ kind: 'cookie', action: 'write', source: 'http', target: sighting.target.id, initiator: sighting.initiator, phase, url: url || sighting.hops.at(-1)?.url || '', value });
      }
    }
    const playwrightScripts = [...this.#playwrightScripts];
    const targets: AuditTarget[] = [...this.#targets.values()].map(({ id, type, url, covered, note }) => {
      if (type !== 'worker') return { id, type, url, covered, ...(note ? { note } : {}) };
      // A Worker whose script was refused never ran. Otherwise it ran once its script arrived, which must have passed
      // the network layer, where the audit holds what the Worker sends first. Workers and Playwright's script
      // responses for the same URL pair up in order.
      const script = byNetworkId.get(id)?.[0];
      const index = playwrightScripts.findIndex(response => response.url === url);
      const reported = index === -1 ? undefined : playwrightScripts.splice(index, 1)[0];
      if (refused(script) || refused(this.#sightings.get(id)) || (!script && refused(reported))) return { id, type, url, covered: true, note: 'its script was refused' };
      if (!covered) return { id, type, url, covered, ...(note ? { note } : {}) };
      return script ? { id, type, url, covered: true }
        : { id, type, url, covered: false, note: 'its script did not pass the network layer, so it may have sent before the audit observed it' };
    });
    const extra: AuditEvent[] = [];
    for (const observer of observers) {
      for (const [id, { info, phase, urls }] of observer.discovered) {
        if (browserUi(info) || !info.browserContextId || !observer.contexts.has(info.browserContextId)) continue;
        if (info.type === 'service_worker') extra.push({ kind: 'service-worker', action: 'target', target: id, initiator: 'browser', phase, url: info.url, state: 'started' });
        if (this.#targets.has(id)) continue;
        if (info.type === 'page' && info.openerId && this.#targets.has(info.openerId)) {
          extra.push({ kind: 'popup', target: id, initiator: 'page', phase, urls: [...this.#popupUrls.get(info.openerId) ?? [], ...urls] });
        }
        targets.push({ id, type: info.type, url: urls.find(url => url !== 'about:blank') ?? info.url, covered: false, note: info.openerId ? `opened by ${info.openerId}` : 'not attached to the audit' });
      }
    }
    if (this.#faults.length > 0) targets.push({ id: 'collector', type: 'collector', url: '', covered: false, note: this.#faults.join('; ') });
    const sockets: WebSocketRecord[] = this.#sockets.map(socket => ({ ...socket, headers: [...socket.headers], frames: [...socket.frames] }));
    return { targets, events: [...requests, ...sockets, ...this.#events, ...httpCookies, ...this.#serviceWorkers.values(), ...this.#versions.values(), ...extra, ...jar] };
  }
}

// Loopback receiver for control samples

export interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}
export interface ReceivedSocket {
  readonly url: string;
  readonly protocol: string | undefined;
  /** Each text frame as text and each binary frame as Base64, in arrival order. */
  readonly frames: string[];
}
export interface LoopbackReceiver {
  /** `http://127.0.0.1:<port>`; the WebSocket endpoint is the same host with `ws:`. */
  readonly origin: string;
  readonly requests: ReceivedRequest[];
  readonly sockets: ReceivedSocket[];
  close(): Promise<void>;
}

/**
 * A test-owned HTTP and WebSocket endpoint on 127.0.0.1 for control samples, so nothing they send leaves the machine.
 * It answers GET with a small synthetic page and other methods with nothing, readable from any origin, and accepts every
 * WebSocket, recording what arrived.
 */
export async function loopbackReceiver(): Promise<LoopbackReceiver> {
  const requests: ReceivedRequest[] = [];
  const sockets: ReceivedSocket[] = [];
  const connections = new Set<Socket>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    request.on('end', () => {
      requests.push({ method: request.method ?? '', url: request.url ?? '', body: Buffer.concat(chunks).toString('utf8') });
      // A page to navigate to, or an empty answer any page may read.
      const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
      if (request.method !== 'GET') response.writeHead(204, headers).end();
      else response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Loopback receiver</title>');
    });
  });
  server.on('connection', socket => {
    connections.add(socket);
    socket.on('close', () => { connections.delete(socket); });
  });
  server.on('upgrade', (request, socket: Duplex) => {
    const protocol = request.headers['sec-websocket-protocol']?.split(',')[0]?.trim();
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key'] ?? ''}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`,
      ...(protocol ? [`Sec-WebSocket-Protocol: ${protocol}`] : []), '', ''].join('\r\n'));
    const received: ReceivedSocket = { url: request.url ?? '', protocol, frames: [] };
    sockets.push(received);
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        const mask = (buffer[1] & 0x80) !== 0 ? buffer.subarray(offset, offset + 4) : null;
        const start = offset + (mask ? 4 : 0);
        if (buffer.length < start + length) return;
        const payload = Buffer.from(buffer.subarray(start, start + length));
        if (mask) for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
        const opcode = buffer[0] & 0x0f;
        if (opcode === 1) received.frames.push(payload.toString('utf8'));
        else if (opcode === 2) received.frames.push(payload.toString('base64'));
        else if (opcode === 8) socket.end(Buffer.from([0x88, 0]));
        buffer = buffer.subarray(start + length);
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`, requests, sockets,
    close: () => new Promise<void>(resolve => {
      for (const connection of connections) connection.destroy();
      server.close(() => { resolve(); });
    }),
  };
}
