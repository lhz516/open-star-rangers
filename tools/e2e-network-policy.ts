/**
 * P2-12 S-06: the pure classification of a browser network audit. The E2E collector (e2e/support/network-audit.ts)
 * records what the page, its Workers and the browser attempted; this module decides which of those events the
 * production allowlist or the development rules permit, which are violations, and where the evidence is incomplete.
 * It does no I/O and reads no clock, so every rule is unit-tested with synthetic records.
 */

/** Who started an event: a covered page or Worker, the browser on behalf of a covered page, or nobody known. */
export type Initiator = 'page' | 'worker' | 'browser' | 'unknown';

/**
 * How far a request got: `sent` went through the browser's network layer to its destination; `intercepted` never left
 * the browser (a test route answered it, the renderer served it from memory, or it was cancelled first); `blocked` was
 * refused before any request was made.
 */
export type Delivery = 'sent' | 'intercepted' | 'blocked';

/** A synthetic marker that must never leave the browser. */
export interface Canary {
  readonly name: string;
  readonly value: string | Uint8Array;
}
export type CanaryEncoding = 'raw' | 'url' | 'base64';
export type CanaryLocation = 'url' | 'header' | 'body' | 'cookie' | 'frame';
export interface CanaryHit {
  readonly name: string;
  readonly encoding: CanaryEncoding;
}

export interface AuditTarget {
  readonly id: string;
  /** CDP target type: `page`, `worker`, `service_worker`, `shared_worker`, `iframe`, … */
  readonly type: string;
  readonly url: string;
  /** Whether the collector observed the target from before its first script ran until it ended. */
  readonly covered: boolean;
  readonly note?: string;
}

export type Header = readonly [name: string, value: string];

interface EventBase {
  /** The target the event belongs to, or `browser` for traffic seen only at the browser's network layer. */
  readonly target: string;
  readonly initiator: Initiator;
  /** The test phase the collector was in, such as `test` or `close`. */
  readonly phase: string;
}

export interface RequestRecord extends EventBase {
  readonly kind: 'request';
  readonly method: string;
  /** Absolute URL, including any fragment. */
  readonly url: string;
  /** CDP resource type: `Document`, `Script`, `Stylesheet`, `Image`, `Fetch`, `XHR`, `Ping`, `EventSource`, `Other`, … */
  readonly resourceType: string;
  /** Every request header seen, including those the network layer added, such as `Cookie`. */
  readonly headers: readonly Header[];
  /** Base64 of the request body: empty for none, null when a body exists that could not be read. */
  readonly body: string | null;
  readonly delivery: Delivery;
  readonly status?: number;
  readonly failure?: string;
}

export interface WebSocketFrame {
  readonly direction: 'sent' | 'received';
  /** 1 for text, 2 for binary. */
  readonly opcode: number;
  /** Base64 of the frame payload bytes. */
  readonly data: string;
}

export interface WebSocketRecord extends EventBase {
  readonly kind: 'websocket';
  readonly url: string;
  /** Handshake request headers. */
  readonly headers: readonly Header[];
  /** The subprotocol the server accepted, if any. */
  readonly protocol: string | null;
  readonly frames: readonly WebSocketFrame[];
}

export interface NavigationRecord extends EventBase {
  readonly kind: 'navigation';
  /** The committed URL of a main-frame navigation, within the document or not, including any fragment. */
  readonly url: string;
}

export interface PopupRecord extends EventBase {
  readonly kind: 'popup';
  /** Every URL requested for or committed by the new page. */
  readonly urls: readonly string[];
}

export interface CookieRecord extends EventBase {
  readonly kind: 'cookie';
  /** `write` is an attempt to set a cookie; `stored` is a cookie found in the context's jar. */
  readonly action: 'write' | 'stored';
  readonly source: 'script' | 'cookie-store' | 'http' | 'jar';
  /** The document or response URL, or the cookie's domain and path for the jar. */
  readonly url: string;
  readonly value: string;
}

export interface ServiceWorkerRecord extends EventBase {
  readonly kind: 'service-worker';
  /**
   * `register` is a `register()` call and its outcome; `version` is a service worker version the browser installed, with
   * its last lifecycle state; `target` is a service worker the browser started.
   */
  readonly action: 'register' | 'version' | 'target';
  readonly url: string;
  /** `pending`, `fulfilled` or `rejected:<error name>`; the version's status and running state; or the target's state. */
  readonly state: string;
}

export interface CspRecord extends EventBase {
  readonly kind: 'csp';
  readonly directive: string;
  /** The blocked URL, or empty for inline/eval violations. */
  readonly blockedUrl: string;
  readonly reportOnly: boolean;
  readonly violation: string;
}

export type AuditEvent = RequestRecord | WebSocketRecord | NavigationRecord | PopupRecord | CookieRecord | ServiceWorkerRecord | CspRecord;

export interface AuditCapture {
  readonly targets: readonly AuditTarget[];
  readonly events: readonly AuditEvent[];
}

/** A test-only request the case expects, such as a deliberately missing Worker script. */
export interface DeclaredRequest {
  readonly label: string;
  readonly method: string;
  /** Exact path, or a pattern for a hashed file name. */
  readonly path: string | RegExp;
  /** Query parameters allowed by name, each value matching its pattern; none by default. */
  readonly query?: Readonly<Record<string, RegExp>>;
  /** The response status the case expects, or `failed` for no response; unchecked when omitted. */
  readonly expect?: number | 'failed';
}

export interface NetworkPolicy {
  readonly mode: 'production' | 'development';
  /** The page origin, such as `http://127.0.0.1:4174`. */
  readonly origin: string;
  /**
   * Production: the candidate's `dist/` files, relative to it. Development: repository files the development server may
   * serve as modules or test entries, relative to the repository (`src/…`, `e2e/entries/…`).
   */
  readonly files: readonly string[];
  readonly declared: readonly DeclaredRequest[];
  readonly canaries: readonly Canary[];
}

export type ViolationCategory =
  | 'canary' | 'origin' | 'scheme' | 'method' | 'body' | 'query' | 'path' | 'resource-type' | 'blocked'
  | 'websocket' | 'websocket-frame' | 'event-source' | 'navigation' | 'popup' | 'cookie' | 'service-worker' | 'csp'
  | 'declared-outcome';

export interface Violation {
  readonly category: ViolationCategory;
  readonly channel: AuditEvent['kind'];
  readonly initiator: Initiator;
  readonly phase: string;
  readonly target: string;
  /** The URL the event concerns. */
  readonly subject: string;
  readonly delivery?: Delivery;
  readonly canary?: { readonly name: string; readonly location: CanaryLocation; readonly encoding: CanaryEncoding };
  readonly detail: string;
}

export type GapReason = 'unknown-initiator' | 'uncovered-target' | 'unread-body';
export interface Gap {
  readonly reason: GapReason;
  readonly target: string;
  readonly subject: string;
  readonly detail: string;
}

/** Why an event was allowed: product code, the Vite toolchain, a test entry or declared request, the favicon probe, or browser-local. */
export type AllowedKind = 'product' | 'toolchain' | 'test' | 'known-404' | 'local';
export interface Allowed {
  readonly kind: AllowedKind;
  readonly channel: AuditEvent['kind'];
  readonly initiator: Initiator;
  readonly phase: string;
  readonly subject: string;
  readonly rule: string;
}

export interface AuditReport {
  readonly violations: readonly Violation[];
  readonly gaps: readonly Gap[];
  readonly allowed: readonly Allowed[];
  /** Labels of declared requests that never occurred. */
  readonly missing: readonly string[];
  /** No gaps: the capture can support a zero-leak claim. */
  readonly complete: boolean;
}

// Canary matching

const MINIMUM_CANARY_BYTES = 8;
const encoder = new TextEncoder();
const bytesOf = (value: string | Uint8Array): Uint8Array => typeof value === 'string' ? encoder.encode(value) : value;

/** Percent-decodes `%XX` sequences byte by byte, leaving malformed ones as they are; optionally `+` as a space. */
function percentDecoded(bytes: Uint8Array, plusAsSpace: boolean): Uint8Array {
  const out: number[] = [];
  const hex = (byte: number | undefined): number => {
    if (byte === undefined) return -1;
    if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
    const lower = byte | 0x20;
    return lower >= 0x61 && lower <= 0x66 ? lower - 0x57 : -1;
  };
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    const high = hex(bytes[index + 1]);
    const low = hex(bytes[index + 2]);
    if (byte === 0x25 && high >= 0 && low >= 0) {
      out.push(high * 16 + low);
      index += 2;
    } else out.push(plusAsSpace && byte === 0x2b ? 0x20 : byte);
  }
  return Uint8Array.from(out);
}

/**
 * The parts of the Base64 encoding of `canary` that do not depend on its neighbours, for each of the three byte
 * alignments, in the standard and URL-safe alphabets.
 */
function base64Needles(canary: Uint8Array): string[] {
  const needles = new Set<string>();
  for (const shift of [0, 1, 2]) {
    const total = shift + canary.length;
    const encoded = Buffer.concat([Buffer.alloc(shift), canary]).toString('base64').replace(/=+$/, '');
    const start = [0, 2, 3][shift];
    const end = encoded.length - [0, 1, 1][total % 3];
    const needle = encoded.slice(start, end);
    needles.add(needle);
    needles.add(needle.replace(/\+/g, '-').replace(/\//g, '_'));
  }
  return [...needles];
}

interface CompiledCanary {
  readonly name: string;
  readonly bytes: Buffer;
  readonly base64: readonly string[];
}
const compiled = new WeakMap<Canary, CompiledCanary>();

/** A canary's needles, derived once per canary. */
function compile(canary: Canary): CompiledCanary {
  let result = compiled.get(canary);
  if (!result) {
    const bytes = Buffer.from(bytesOf(canary.value));
    if (bytes.length < MINIMUM_CANARY_BYTES) throw new Error(`Canary ${canary.name} must have at least ${MINIMUM_CANARY_BYTES} bytes`);
    result = { name: canary.name, bytes, base64: base64Needles(bytes) };
    compiled.set(canary, result);
  }
  return result;
}

/**
 * The canaries contained in `haystack` as raw bytes, after percent-decoding (URL and form encoding), or Base64-encoded
 * (also inside a percent-encoded value). Text haystacks are matched as their UTF-8 bytes.
 */
export function findCanaries(canaries: readonly Canary[], haystack: string | Uint8Array): CanaryHit[] {
  const raw = Buffer.from(bytesOf(haystack));
  // Only `%` and `+` change under decoding.
  const decoded = raw.includes(0x25) || raw.includes(0x2b) ? [percentDecoded(raw, false), percentDecoded(raw, true)].map(bytes => Buffer.from(bytes)) : [];
  const texts = [raw, ...decoded].map(bytes => bytes.toString('latin1'));
  const hits: CanaryHit[] = [];
  for (const canary of canaries.map(compile)) {
    if (raw.includes(canary.bytes)) hits.push({ name: canary.name, encoding: 'raw' });
    else if (decoded.some(bytes => bytes.includes(canary.bytes))) hits.push({ name: canary.name, encoding: 'url' });
    if (canary.base64.some(encoded => texts.some(text => text.includes(encoded)))) hits.push({ name: canary.name, encoding: 'base64' });
  }
  return hits;
}

// Rules

const HELD_OPERATION = '(?:commit|list|restore)';
/**
 * Query parameters of the development test entry (e2e/entries/app.html, read by src/app/app-entry.test-support.tsx):
 * a Worker scenario or a P2-10 cache failure code as a name, the one value `capacity` and `audio` react to, up to
 * three held cache operations, and up to 16 decimal mission seeds of at most 10 digits (P3-04).
 */
export const TEST_ENTRY_QUERY: Readonly<Record<string, RegExp>> = Object.freeze({
  worker: /^[a-z0-9][a-z0-9-]{0,39}$/,
  cache: /^[a-z0-9][a-z0-9-]{0,39}$/,
  capacity: /^insufficient$/,
  audio: /^unavailable$/,
  hold: new RegExp(`^${HELD_OPERATION}(?:,${HELD_OPERATION}){0,2}$`),
  seeds: /^\d{1,10}(?:,\d{1,10}){0,15}$/,
});

/** Query parameters the Vite development server adds to project modules: HMR timestamps, asset imports, Worker entries. */
const VITE_MODULE_QUERY: Readonly<Record<string, RegExp>> = {
  t: /^\d{1,16}$/, import: /^$/, worker_file: /^$/, type: /^module$/, direct: /^$/,
};

/** Resource types of a production `dist/` file by extension: its only purposes in the product. */
const PRODUCTION_TYPES: Readonly<Record<string, readonly string[]>> = {
  html: ['Document'], txt: ['Document'], js: ['Script'], css: ['Stylesheet'],
  png: ['Image'], jpg: ['Image'], jpeg: ['Image'], gif: ['Image'], webp: ['Image'], avif: ['Image'], svg: ['Image'], ico: ['Image'],
  woff: ['Font'], woff2: ['Font'], ttf: ['Font'], otf: ['Font'],
};

interface DevelopmentRule {
  readonly id: string;
  readonly kind: AllowedKind;
  readonly matches: (path: string, files: ReadonlySet<string>) => boolean;
  readonly types: readonly string[];
  readonly query: Readonly<Record<string, RegExp>>;
}

const MODULE_SOURCE = /^\/src\/(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|css)$/;
const TEST_SOURCE = /\.test-support\.tsx?$/;
/**
 * The development rules: entry documents, the Vite client and its dependencies, and existing project source modules.
 * Each rule names its paths, resource types and the exact Vite query parameters it allows.
 */
const DEVELOPMENT_RULES: readonly DevelopmentRule[] = [
  { id: 'app document', kind: 'product', matches: path => path === '/' || path === '/index.html', types: ['Document'], query: {} },
  {
    id: 'test entry document', kind: 'test', types: ['Document'], query: TEST_ENTRY_QUERY,
    matches: (path, files) => /^\/e2e\/entries\/[\w-]+\.html$/.test(path) && files.has(path.slice(1)),
  },
  { id: 'Vite client', kind: 'toolchain', matches: path => path === '/@vite/client' || path === '/@react-refresh', types: ['Script'], query: {} },
  {
    id: 'Vite client environment', kind: 'toolchain', types: ['Script'], query: {},
    matches: path => /^\/node_modules\/\.pnpm\/vite@[\w.+@-]+\/node_modules\/vite\/dist\/client\/env\.mjs$/.test(path),
  },
  {
    id: 'Vite pre-bundled dependency', kind: 'toolchain', types: ['Script'], query: { v: /^[0-9a-f]{8}$/ },
    matches: path => /^\/node_modules\/\.vite\/deps\/[\w.-]+\.js$/.test(path),
  },
  {
    id: 'test support module', kind: 'test', types: ['Script'], query: VITE_MODULE_QUERY,
    matches: (path, files) => MODULE_SOURCE.test(path) && TEST_SOURCE.test(path) && files.has(path.slice(1)),
  },
  {
    id: 'project module', kind: 'product', types: ['Script'], query: VITE_MODULE_QUERY,
    matches: (path, files) => MODULE_SOURCE.test(path) && files.has(path.slice(1)),
  },
];

/** The server's HMR messages, which carry nothing out of the browser. */
const HMR_RECEIVED = new Set(['connected', 'update', 'bundled-dev-update', 'custom', 'full-reload', 'prune', 'error', 'ping']);
const keysOf = (value: object): string => Object.keys(value).sort().join();
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Exactly the messages Vite's client sends: a bare ping, or the invalidation of an existing project module, whose only
 * free text is the reason the module gave.
 */
function hmrSent(message: Record<string, unknown>, files: ReadonlySet<string>): boolean {
  if (keysOf(message) === 'type') return message.type === 'ping';
  if (keysOf(message) !== 'data,event,type' || message.type !== 'custom' || message.event !== 'vite:invalidate' || !record(message.data)) return false;
  const { path, firstInvalidatedBy, message: reason } = message.data;
  const module = (value: unknown): boolean => typeof value === 'string' && MODULE_SOURCE.test(value) && files.has(value.slice(1));
  return ['firstInvalidatedBy,message,path', 'firstInvalidatedBy,path'].includes(keysOf(message.data))
    && module(path) && module(firstInvalidatedBy) && (reason === undefined || typeof reason === 'string');
}

function queryProblem(url: URL, allowed: Readonly<Record<string, RegExp>>): string | null {
  const seen = new Set<string>();
  for (const [name, value] of url.searchParams) {
    if (seen.has(name)) return `repeated query parameter ${name}`;
    seen.add(name);
    if (!Object.hasOwn(allowed, name)) return `query parameter ${name} is not allowed`;
    if (!allowed[name].test(value)) return `query parameter ${name} has a value outside ${allowed[name]}`;
  }
  return null;
}

const extension = (path: string): string => /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? '';

function parse(url: string): URL | null {
  try { return new URL(url); } catch { return null; }
}

/** Why an event that produced no violation was allowed. */
interface Allowance { readonly kind: AllowedKind; readonly rule: string }

class Classifier {
  readonly violations: Violation[] = [];
  readonly gaps: Gap[] = [];
  readonly allowed: Allowed[] = [];
  readonly #declared = new Map<DeclaredRequest, number>();
  readonly #files: ReadonlySet<string>;
  readonly #policy: NetworkPolicy;

  constructor(policy: NetworkPolicy) {
    this.#policy = policy;
    this.#files = new Set(policy.files);
    for (const request of policy.declared) this.#declared.set(request, 0);
  }

  get missing(): string[] {
    return [...this.#declared].filter(([, count]) => count === 0).map(([request]) => request.label);
  }

  /** Classifies one event; it is listed as allowed only when its rule allows it and it produced no violation at all. */
  event(event: AuditEvent): void {
    const subject = subjectOf(event);
    if (event.initiator === 'unknown') {
      this.gaps.push({ reason: 'unknown-initiator', target: event.target, subject, detail: `${event.kind} not attributable to a covered page or Worker` });
    }
    const before = this.violations.length;
    const allowance = this.#classify(event);
    if (allowance && this.violations.length === before) {
      this.allowed.push({ ...allowance, channel: event.kind, initiator: event.initiator, phase: event.phase, subject });
    }
  }

  #classify(event: AuditEvent): Allowance | null {
    switch (event.kind) {
      case 'request': return this.#request(event);
      case 'websocket': return this.#websocket(event);
      case 'navigation': return this.#navigation(event);
      case 'popup':
        for (const url of event.urls) this.#canaries(event, url, 'url', url);
        this.#violation(event, subjectOf(event), 'popup', 'a new page was opened');
        return null;
      case 'cookie':
        this.#canaries(event, event.url, 'cookie', event.value);
        this.#violation(event, event.url, 'cookie', `cookie ${event.action} by ${event.source}: ${event.value.split(/[=;]/)[0].trim()}`);
        return null;
      case 'service-worker':
        this.#canaries(event, event.url, 'url', event.url);
        this.#violation(event, event.url, 'service-worker', `service worker ${event.action}: ${event.state}`);
        return null;
      case 'csp':
        if (event.blockedUrl) this.#canaries(event, event.blockedUrl, 'url', event.blockedUrl, 'blocked');
        this.#violation(event, event.blockedUrl, 'csp', `${event.reportOnly ? 'report-only ' : ''}${event.directive} ${event.violation}`, { delivery: 'blocked' });
        return null;
    }
  }

  #violation(event: AuditEvent, subject: string, category: ViolationCategory, detail: string, extra: Partial<Violation> = {}): void {
    this.violations.push({ category, channel: event.kind, initiator: event.initiator, phase: event.phase, target: event.target, subject, detail, ...extra });
  }

  #canaries(event: AuditEvent, subject: string, location: CanaryLocation, haystack: string | Uint8Array, delivery?: Delivery): void {
    for (const hit of findCanaries(this.#policy.canaries, haystack)) {
      this.#violation(event, subject, 'canary', `${hit.name} in the ${location} (${hit.encoding})`, {
        canary: { name: hit.name, location, encoding: hit.encoding }, ...(delivery ? { delivery } : {}),
      });
    }
  }

  /** Header canaries, with the `Cookie` header reported as a cookie that was sent. */
  #headers(event: AuditEvent, subject: string, headers: readonly Header[], delivery?: Delivery): void {
    for (const [name, value] of headers) {
      const cookie = name.toLowerCase() === 'cookie';
      this.#canaries(event, subject, cookie ? 'cookie' : 'header', cookie ? value : `${name}: ${value}`, delivery);
      if (cookie) this.#violation(event, subject, 'cookie', 'the request carries a Cookie header', delivery ? { delivery } : {});
    }
  }

  #request(event: RequestRecord): Allowance | null {
    const { delivery } = event;
    const extra = { delivery };
    this.#canaries(event, event.url, 'url', event.url, delivery);
    this.#headers(event, event.url, event.headers, delivery);
    if (event.body === null) this.gaps.push({ reason: 'unread-body', target: event.target, subject: event.url, detail: 'a request body exists but could not be read' });
    else if (event.body) this.#canaries(event, event.url, 'body', Buffer.from(event.body, 'base64'), delivery);
    const url = parse(event.url);
    if (!url) { this.#violation(event, event.url, 'scheme', 'unparsable URL', extra); return null; }
    if (['blob:', 'data:', 'about:'].includes(url.protocol)) return { kind: 'local', rule: `${url.protocol} stays in the browser` };
    if (!['http:', 'https:'].includes(url.protocol)) { this.#violation(event, event.url, 'scheme', `${url.protocol} request`, extra); return null; }
    if (delivery === 'blocked') this.#violation(event, event.url, 'blocked', `blocked attempt: ${event.failure ?? 'unknown reason'}`, extra);
    if (event.resourceType === 'EventSource') this.#violation(event, event.url, 'event-source', 'EventSource connection', extra);
    if (!(this.#policy.mode === 'production' ? ['GET'] : ['GET', 'HEAD']).includes(event.method)) this.#violation(event, event.url, 'method', `${event.method} request`, extra);
    if (event.body) this.#violation(event, event.url, 'body', `request body of ${Buffer.from(event.body, 'base64').length} bytes`, extra);
    if (url.origin !== this.#policy.origin) { this.#violation(event, event.url, 'origin', `request to ${url.origin}`, extra); return null; }
    const declared = this.#declaration(event, url);
    if (declared !== undefined) return declared;
    return this.#policy.mode === 'production' ? this.#production(event, url) : this.#development(event, url);
  }

  /** A declared test request: matched by method and path with no body and no undeclared query; its outcome is then checked. */
  #declaration(event: RequestRecord, url: URL): Allowance | null | undefined {
    for (const request of this.#declared.keys()) {
      const path = typeof request.path === 'string' ? url.pathname === request.path : request.path.test(url.pathname);
      if (!path || request.method !== event.method || event.body || queryProblem(url, request.query ?? {})) continue;
      this.#declared.set(request, (this.#declared.get(request) ?? 0) + 1);
      const outcome = event.status ?? (event.failure === undefined ? 'pending' : 'failed');
      if (request.expect === undefined || outcome === request.expect) return { kind: 'test', rule: `declared: ${request.label}` };
      this.#violation(event, event.url, 'declared-outcome', `${request.label}: expected ${request.expect}, observed ${outcome}`, { delivery: event.delivery });
      return null;
    }
    return undefined;
  }

  /**
   * The browser's own favicon probe: not a candidate file, the bare path as a request of type Other from a page, which a
   * script cannot make, answered 404 or abandoned when the page moved on.
   */
  #favicon(event: RequestRecord, url: URL): boolean {
    return url.pathname === '/favicon.ico' && !url.search && event.method === 'GET' && event.resourceType === 'Other'
      && (event.initiator === 'page' || event.initiator === 'browser')
      && (event.status === 404 || (event.status === undefined && event.failure?.includes('ERR_ABORTED') === true))
      && !this.#files.has(this.#policy.mode === 'production' ? 'favicon.ico' : 'public/favicon.ico');
  }

  #production(event: RequestRecord, url: URL): Allowance | null {
    const extra = { delivery: event.delivery };
    if (url.search) this.#violation(event, event.url, 'query', 'production requests carry no query string', extra);
    if (this.#favicon(event, url)) return { kind: 'known-404', rule: 'favicon probe' };
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!this.#files.has(file)) { this.#violation(event, event.url, 'path', `${url.pathname} is not a candidate file`, extra); return null; }
    const types = PRODUCTION_TYPES[extension(file)] ?? [];
    if (!types.includes(event.resourceType)) {
      this.#violation(event, event.url, 'resource-type', `${event.resourceType} request for ${file}, allowed: ${types.join(', ') || 'none'}`, extra);
      return null;
    }
    return { kind: 'product', rule: `dist/${file} as ${event.resourceType}` };
  }

  #development(event: RequestRecord, url: URL): Allowance | null {
    const extra = { delivery: event.delivery };
    if (this.#favicon(event, url)) return { kind: 'known-404', rule: 'favicon probe' };
    const rule = DEVELOPMENT_RULES.find(candidate => candidate.matches(url.pathname, this.#files));
    if (!rule) { this.#violation(event, event.url, 'path', `${url.pathname} matches no development rule`, extra); return null; }
    const problem = queryProblem(url, rule.query);
    if (problem) this.#violation(event, event.url, 'query', `${rule.id}: ${problem}`, extra);
    if (!rule.types.includes(event.resourceType)) {
      this.#violation(event, event.url, 'resource-type', `${rule.id}: ${event.resourceType} request, allowed: ${rule.types.join(', ')}`, extra);
    }
    return { kind: rule.kind, rule: rule.id };
  }

  /** In development the single allowed WebSocket is the Vite HMR connection, and only with its protocol messages. */
  #websocket(event: WebSocketRecord): Allowance | null {
    this.#canaries(event, event.url, 'url', event.url);
    this.#headers(event, event.url, event.headers);
    for (const frame of event.frames) if (frame.direction === 'sent') this.#canaries(event, event.url, 'frame', Buffer.from(frame.data, 'base64'));
    const url = parse(event.url);
    const origin = new URL(this.#policy.origin);
    const hmr = this.#policy.mode === 'development' && url !== null && event.initiator === 'page'
      && url.protocol === (origin.protocol === 'https:' ? 'wss:' : 'ws:') && url.host === origin.host && url.pathname === '/'
      && [...url.searchParams.keys()].join() === 'token' && /^[\w-]+$/.test(url.searchParams.get('token') ?? '') && event.protocol === 'vite-hmr';
    if (!hmr) { this.#violation(event, event.url, 'websocket', `WebSocket (${event.protocol ?? 'no subprotocol'})`); return null; }
    for (const frame of event.frames) {
      let message: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = JSON.parse(Buffer.from(frame.data, 'base64').toString('utf8'));
        if (record(parsed)) message = parsed;
      } catch { /* not a protocol message */ }
      const protocol = frame.opcode === 1 && message !== null
        && (frame.direction === 'sent' ? hmrSent(message, this.#files) : typeof message.type === 'string' && HMR_RECEIVED.has(message.type));
      if (!protocol) this.#violation(event, event.url, 'websocket-frame', `${frame.direction} frame outside the Vite HMR protocol`);
    }
    return { kind: 'toolchain', rule: 'Vite HMR WebSocket' };
  }

  /** Main-frame navigations may only enter a document of the application origin, without a query outside the rules or a fragment. */
  #navigation(event: NavigationRecord): Allowance | null {
    this.#canaries(event, event.url, 'url', event.url);
    const url = parse(event.url);
    if (url?.protocol === 'about:') return { kind: 'local', rule: 'about: document' };
    if (!url || url.origin !== this.#policy.origin) { this.#violation(event, event.url, 'navigation', 'navigation away from the application origin'); return null; }
    if (url.hash) { this.#violation(event, event.url, 'navigation', 'navigation with a fragment'); return null; }
    if (this.#policy.mode === 'production') {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (this.#files.has(file) && PRODUCTION_TYPES[extension(file)]?.includes('Document') && !url.search) return { kind: 'product', rule: `dist/${file} as a document` };
    } else {
      const rule = DEVELOPMENT_RULES.find(candidate => candidate.types.includes('Document') && candidate.matches(url.pathname, this.#files));
      if (rule && !queryProblem(url, rule.query)) return { kind: rule.kind, rule: rule.id };
    }
    this.#violation(event, event.url, 'navigation', `navigation to ${url.pathname}${url.search}`);
    return null;
  }
}

function subjectOf(event: AuditEvent): string {
  switch (event.kind) {
    case 'popup': return event.urls.find(url => url && url !== 'about:blank') ?? event.urls[0] ?? '';
    case 'csp': return event.blockedUrl;
    default: return event.url;
  }
}

/**
 * Classifies a capture against a policy. Every event is checked for canaries; the allowlist or development rules then
 * decide the rest. Uncovered targets, unattributable events and unreadable bodies are gaps: the report is complete only
 * without them, and only a complete report with no violation supports a zero-leak claim.
 */
export function auditNetwork(capture: AuditCapture, policy: NetworkPolicy): AuditReport {
  const origin = parse(policy.origin);
  if (!origin || origin.origin !== policy.origin) throw new Error(`Policy origin must be a bare origin: ${policy.origin}`);
  const classifier = new Classifier(policy);
  for (const target of capture.targets) {
    if (!target.covered) classifier.gaps.push({ reason: 'uncovered-target', target: target.id, subject: target.url, detail: `${target.type}${target.note ? `: ${target.note}` : ''}` });
  }
  for (const event of capture.events) classifier.event(event);
  return { violations: classifier.violations, gaps: classifier.gaps, allowed: classifier.allowed, missing: classifier.missing, complete: classifier.gaps.length === 0 };
}
