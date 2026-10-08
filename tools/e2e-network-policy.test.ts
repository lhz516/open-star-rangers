import { describe, expect, it } from 'vitest';
import { RESOURCE_CACHE_FAILURE_CODES } from '../src/platform/storage/resource-cache-contract.ts';
import { FAILURE_MATRIX } from '../src/workers/failure-matrix.test-support.ts';
import { IMPORT_SCENARIOS, PROTOCOL_SCRIPTS } from '../src/workers/import-scenarios.test-support.ts';
import {
  auditNetwork, findCanaries, TEST_ENTRY_QUERY, type AuditEvent, type AuditTarget, type Canary, type DeclaredRequest,
  type NetworkPolicy, type RequestRecord, type WebSocketRecord,
} from './e2e-network-policy.ts';

// P2-12/02: every rule of the network audit classifier with a positive and a negative sample. Only synthetic records.

const ORIGIN = 'http://127.0.0.1:4174';
const DIST = ['index.html', 'LICENSE.txt', 'assets/index-AbC123.js', 'assets/index-AbC123.js.map', 'assets/index-Xy9.css',
  'assets/import-worker-Qq1.js', 'compliance-inventory.json'];
const SOURCES = ['src/main.tsx', 'src/app/app.css', 'src/workers/import-worker.ts', 'src/workers/import-worker.test-support.ts', 'e2e/entries/app.html'];
const CANARIES: Canary[] = [{ name: 'content', value: 'OSR-CANARY-CONTENT' }, { name: 'bytes', value: Uint8Array.of(0, 255, 1, 254, 2, 253, 3, 252, 4) }];
const PAGE: AuditTarget = { id: 'page-1', type: 'page', url: `${ORIGIN}/`, covered: true };

const production = (declared: DeclaredRequest[] = []): NetworkPolicy => ({ mode: 'production', origin: ORIGIN, files: DIST, declared, canaries: CANARIES });
const development = (declared: DeclaredRequest[] = []): NetworkPolicy => ({ mode: 'development', origin: ORIGIN, files: SOURCES, declared, canaries: CANARIES });
const base64 = (text: string | Uint8Array): string => Buffer.from(text).toString('base64');

function request(path: string, overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    kind: 'request', target: 'page-1', initiator: 'page', phase: 'test', method: 'GET', url: path.startsWith('/') ? `${ORIGIN}${path}` : path,
    resourceType: 'Script', headers: [['Accept', '*/*']], body: '', delivery: 'sent', status: 200, ...overrides,
  };
}
const socket = (overrides: Partial<WebSocketRecord> = {}): WebSocketRecord => ({
  kind: 'websocket', target: 'page-1', initiator: 'page', phase: 'test', url: 'ws://127.0.0.1:4174/?token=Ab-c_1',
  headers: [['Sec-WebSocket-Protocol', 'vite-hmr']], protocol: 'vite-hmr', frames: [], ...overrides,
});
const frame = (direction: 'sent' | 'received', message: unknown, opcode = 1) => ({ direction, opcode, data: base64(typeof message === 'string' ? message : JSON.stringify(message)) });

function audit(policy: NetworkPolicy, events: AuditEvent[], targets: AuditTarget[] = [PAGE]) {
  return auditNetwork({ targets, events }, policy);
}
const categories = (policy: NetworkPolicy, event: AuditEvent): string[] => audit(policy, [event]).violations.map(violation => violation.category).sort();
const allowedAs = (policy: NetworkPolicy, event: AuditEvent): string | undefined => {
  const report = audit(policy, [event]);
  return report.violations.length === 0 ? report.allowed[0]?.kind : undefined;
};

describe('canary matching', () => {
  const content = CANARIES[0].value as string;
  it('finds raw, URL-encoded and Base64 representations of text and binary markers', () => {
    expect(findCanaries(CANARIES, `prefix ${content} suffix`)).toEqual([{ name: 'content', encoding: 'raw' }]);
    expect(findCanaries(CANARIES, `q=${content.split('').map(character => `%${character.charCodeAt(0).toString(16)}`).join('')}`))
      .toEqual([{ name: 'content', encoding: 'url' }]);
    expect(findCanaries(CANARIES, encodeURIComponent(`a ${content.replace('-', ' ')} b`).replace(/%20/g, '+'))).toEqual([]);
    expect(findCanaries([{ name: 'spaced', value: 'OSR CANARY SPACED' }], 'OSR+CANARY+SPACED')).toEqual([{ name: 'spaced', encoding: 'url' }]);
    const bytes = CANARIES[1].value as Uint8Array;
    expect(findCanaries(CANARIES, Uint8Array.of(9, 9, ...bytes, 9))).toEqual([{ name: 'bytes', encoding: 'raw' }]);
    expect(findCanaries(CANARIES, `%00%FF%01%fe%02%FD%03%fc%04`)).toEqual([{ name: 'bytes', encoding: 'url' }]);
  });

  it('finds Base64 at every byte alignment, padded or not, in both alphabets and inside URL encoding', () => {
    for (const shift of [0, 1, 2, 3, 4, 5]) {
      for (const tail of [0, 1, 2]) {
        const embedded = Buffer.concat([Buffer.alloc(shift, 7), Buffer.from(CANARIES[0].value as string), Buffer.alloc(tail, 9)]);
        expect(findCanaries(CANARIES, embedded.toString('base64')), `shift ${shift}, tail ${tail}`).toEqual([{ name: 'content', encoding: 'base64' }]);
        expect(findCanaries(CANARIES, embedded.toString('base64url'))).toEqual([{ name: 'content', encoding: 'base64' }]);
      }
    }
    const binary = Buffer.concat([Buffer.of(1), CANARIES[1].value as Uint8Array]).toString('base64');
    expect(binary).toMatch(/[+/]/);
    expect(findCanaries(CANARIES, `v=${encodeURIComponent(binary)}`)).toEqual([{ name: 'bytes', encoding: 'base64' }]);
  });

  it('does not match altered, truncated or differently aligned unrelated data, and rejects markers too short to be unique', () => {
    const content = CANARIES[0].value as string;
    expect(findCanaries(CANARIES, content.slice(0, -1))).toEqual([]);
    expect(findCanaries(CANARIES, content.toLowerCase())).toEqual([]);
    expect(findCanaries(CANARIES, base64(content.replace('CONTENT', 'CONTENS')))).toEqual([]);
    expect(findCanaries(CANARIES, base64(content).slice(0, 12))).toEqual([]);
    expect(findCanaries(CANARIES, '%4F%53%52-CANARY-CONTEN')).toEqual([]);
    expect(() => findCanaries([{ name: 'short', value: 'OSR-1' }], 'anything')).toThrow('at least 8 bytes');
  });
});

describe('every event is checked for canaries', () => {
  const content = CANARIES[0].value as string;
  const hits = (policy: NetworkPolicy, event: AuditEvent) => audit(policy, [event]).violations.flatMap(violation => violation.canary ? [violation.canary] : []);

  it('in request URLs with fragments, headers, cookies and bodies, keeping how far the request got', () => {
    expect(hits(production(), request(`/assets/index-AbC123.js#${content}`))).toEqual([{ name: 'content', location: 'url', encoding: 'raw' }]);
    expect(hits(production(), request('/', { resourceType: 'Document', headers: [['X-Trace', base64(content)]] })))
      .toEqual([{ name: 'content', location: 'header', encoding: 'base64' }]);
    expect(hits(production(), request('/', { resourceType: 'Document', headers: [['Cookie', `id=${encodeURIComponent(content)}`]] })))
      .toEqual([{ name: 'content', location: 'cookie', encoding: 'raw' }]);
    const posted = audit(production(), [request('/', { method: 'POST', body: base64(CANARIES[1].value), delivery: 'intercepted' })]).violations;
    expect(posted.find(violation => violation.category === 'canary')).toMatchObject({ canary: { name: 'bytes', location: 'body', encoding: 'raw' }, delivery: 'intercepted' });
    expect(hits(production(), request('/', { resourceType: 'Document' }))).toEqual([]);
  });

  it('in WebSocket URLs, handshake headers and sent frames, but not in frames the server sent', () => {
    const event = socket({ url: `ws://127.0.0.1:9/x?m=${content}`, frames: [frame('sent', base64(content)), frame('received', content)] });
    expect(hits(development(), event)).toEqual([
      { name: 'content', location: 'url', encoding: 'raw' }, { name: 'content', location: 'frame', encoding: 'base64' },
    ]);
    expect(hits(development(), socket({ frames: [frame('received', content)] }))).toEqual([]);
  });

  it('in navigations, popups, cookies, service workers and blocked URLs', () => {
    const at = { target: 'page-1', initiator: 'page', phase: 'test' } as const;
    expect(hits(production(), { ...at, kind: 'navigation', url: `${ORIGIN}/#${content}` })).toHaveLength(1);
    expect(hits(production(), { ...at, kind: 'popup', urls: ['about:blank', `${ORIGIN}/x?${content}`] })).toHaveLength(1);
    expect(hits(production(), { ...at, kind: 'cookie', action: 'write', source: 'script', url: `${ORIGIN}/`, value: `a=${content}` })).toEqual([{ name: 'content', location: 'cookie', encoding: 'raw' }]);
    expect(hits(production(), { ...at, kind: 'service-worker', action: 'register', url: `${ORIGIN}/sw.js?${content}`, state: 'rejected:SecurityError' })).toHaveLength(1);
    const blocked = audit(production(), [{ ...at, kind: 'csp', directive: 'connect-src', blockedUrl: `http://127.0.0.1:9/?${content}`, reportOnly: false, violation: 'kURLViolation' }]);
    expect(blocked.violations.map(({ category, delivery }) => [category, delivery])).toEqual([['canary', 'blocked'], ['csp', 'blocked']]);
  });
});

describe('the production allowlist', () => {
  it('allows only same-origin GETs of candidate files with the resource type of their purpose', () => {
    expect(allowedAs(production(), request('/', { resourceType: 'Document' }))).toBe('product');
    expect(allowedAs(production(), request('/index.html', { resourceType: 'Document' }))).toBe('product');
    expect(allowedAs(production(), request('/LICENSE.txt', { resourceType: 'Document' }))).toBe('product');
    expect(allowedAs(production(), request('/assets/index-AbC123.js'))).toBe('product');
    expect(allowedAs(production(), request('/assets/import-worker-Qq1.js'))).toBe('product');
    expect(allowedAs(production(), request('/assets/index-Xy9.css', { resourceType: 'Stylesheet' }))).toBe('product');
    expect(categories(production(), request('/assets/index-AbC123.js', { resourceType: 'Fetch' }))).toEqual(['resource-type']);
    expect(categories(production(), request('/assets/index-Xy9.css'))).toEqual(['resource-type']);
    expect(categories(production(), request('/assets/index-AbC123.js.map', { resourceType: 'Other' }))).toEqual(['resource-type']);
    expect(categories(production(), request('/compliance-inventory.json', { resourceType: 'Fetch' }))).toEqual(['resource-type']);
    expect(categories(production(), request('/assets/missing.js'))).toEqual(['path']);
    expect(categories(production(), request('/assets/index-AbC123.js?v=1'))).toEqual(['query']);
    expect(categories(production(), request('/', { resourceType: 'Document', method: 'HEAD' }))).toEqual(['method']);
    expect(categories(production(), request('/', { resourceType: 'Fetch', method: 'POST', body: base64('x') }))).toEqual(['body', 'method', 'resource-type']);
    expect(categories(production(), request('http://127.0.0.1:9/assets/index-AbC123.js'))).toEqual(['origin']);
    expect(categories(production(), request('https://example.invalid/'))).toEqual(['origin']);
  });

  it('records the favicon probe as a known 404 without widening the allowlist', () => {
    expect(allowedAs(production(), request('/favicon.ico', { resourceType: 'Other', status: 404 }))).toBe('known-404');
    expect(allowedAs(production(), request('/favicon.ico', { resourceType: 'Other', status: undefined, failure: 'net::ERR_ABORTED' }))).toBe('known-404');
    expect(allowedAs(development(), request('/favicon.ico', { resourceType: 'Other', initiator: 'browser', status: 404 }))).toBe('known-404');
    // A script's request for the same path, a Worker's, one still unanswered, or one that failed otherwise is not the probe.
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Fetch', status: 404 }))).toEqual(['path']);
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Image', status: 404 }))).toEqual(['path']);
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Other', initiator: 'worker', status: 404 }))).toEqual(['path']);
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Other', status: undefined }))).toEqual(['path']);
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Other', status: undefined, failure: 'net::ERR_CONNECTION_REFUSED' }))).toEqual(['path']);
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Other', status: 200 }))).toEqual(['path']);
    expect(categories(production(), request('/favicon.ico?x=1', { resourceType: 'Other', status: 404 }))).toEqual(['path', 'query']);
    expect(categories(production(), request('/favicon.ico', { resourceType: 'Other', method: 'POST', status: 404 }))).toEqual(['method', 'path']);
  });

  it('allows no WebSocket, EventSource, cookie, new page, service worker, CSP violation or blocked attempt', () => {
    const at = { target: 'page-1', initiator: 'page', phase: 'test' } as const;
    expect(categories(production(), socket())).toEqual(['websocket']);
    expect(categories(production(), request('/', { resourceType: 'EventSource' }))).toEqual(['event-source', 'resource-type']);
    expect(categories(production(), request('/', { resourceType: 'Document', headers: [['Cookie', 'a=b']] }))).toEqual(['cookie']);
    expect(categories(production(), { ...at, kind: 'cookie', action: 'stored', source: 'jar', url: '127.0.0.1/', value: 'a=b' })).toEqual(['cookie']);
    expect(categories(production(), { ...at, kind: 'popup', urls: [`${ORIGIN}/`] })).toEqual(['popup']);
    expect(categories(production(), { ...at, kind: 'service-worker', action: 'target', url: `${ORIGIN}/sw.js`, state: 'started' })).toEqual(['service-worker']);
    expect(categories(production(), { ...at, kind: 'service-worker', action: 'version', url: `${ORIGIN}/sw.js`, state: 'redundant, stopped' })).toEqual(['service-worker']);
    expect(categories(production(), { ...at, kind: 'csp', directive: 'script-src', blockedUrl: '', reportOnly: false, violation: 'kInlineViolation' })).toEqual(['csp']);
    expect(categories(production(), request('/assets/index-AbC123.js', { delivery: 'blocked', failure: 'mixed-content' }))).toEqual(['blocked']);
  });

  it('allows navigations only to candidate documents without a query or fragment', () => {
    const navigation = (url: string): AuditEvent => ({ kind: 'navigation', target: 'page-1', initiator: 'page', phase: 'test', url });
    expect(allowedAs(production(), navigation(`${ORIGIN}/`))).toBe('product');
    expect(allowedAs(production(), navigation('about:blank'))).toBe('local');
    expect(categories(production(), navigation(`${ORIGIN}/#section`))).toEqual(['navigation']);
    expect(categories(production(), navigation(`${ORIGIN}/?q=1`))).toEqual(['navigation']);
    expect(categories(production(), navigation(`${ORIGIN}/assets/index-AbC123.js`))).toEqual(['navigation']);
    expect(categories(production(), navigation('http://127.0.0.1:9/'))).toEqual(['navigation']);
  });

  it('keeps browser-local URLs out of the network and rejects other schemes', () => {
    expect(allowedAs(production(), request('blob:http://127.0.0.1:4174/1f2e', { resourceType: 'Other', delivery: 'intercepted' }))).toBe('local');
    expect(allowedAs(production(), request('data:text/plain,hello', { resourceType: 'Other', delivery: 'intercepted' }))).toBe('local');
    expect(categories(production(), request('chrome-extension://abc/x.js'))).toEqual(['scheme']);
  });
});

describe('the development rules', () => {
  it('allow entry documents, test entries with their declared query, the Vite client and existing project modules', () => {
    expect(allowedAs(development(), request('/', { resourceType: 'Document' }))).toBe('product');
    expect(allowedAs(development(), request('/e2e/entries/app.html?worker=models-corrupt&cache=quota-exceeded', { resourceType: 'Document' }))).toBe('test');
    expect(Object.keys(TEST_ENTRY_QUERY)).toEqual(['worker', 'cache', 'capacity', 'audio', 'hold']);
    expect(allowedAs(development(), request('/@vite/client'))).toBe('toolchain');
    expect(allowedAs(development(), request('/@react-refresh'))).toBe('toolchain');
    expect(allowedAs(development(), request('/node_modules/.pnpm/vite@8.3.1_@types+node@22.20.4/node_modules/vite/dist/client/env.mjs'))).toBe('toolchain');
    expect(allowedAs(development(), request('/node_modules/.vite/deps/react-dom_client.js?v=1331d117'))).toBe('toolchain');
    expect(allowedAs(development(), request('/src/main.tsx'))).toBe('product');
    expect(allowedAs(development(), request('/src/app/app.css?t=1791427619081'))).toBe('product');
    expect(allowedAs(development(), request('/src/workers/import-worker.ts?worker_file&type=module', { initiator: 'page' }))).toBe('product');
    expect(allowedAs(development(), request('/src/workers/import-worker.test-support.ts?worker_file&type=module'))).toBe('test');
    expect(allowedAs(development(), request('/src/main.tsx', { method: 'HEAD' }))).toBe('product');
  });

  it('allow every test entry option the test support defines, and only those values', () => {
    const entry = (query: string) => request(`/e2e/entries/app.html?${query}`, { resourceType: 'Document' });
    const workers = [...Object.keys(IMPORT_SCENARIOS), ...Object.keys(PROTOCOL_SCRIPTS), ...FAILURE_MATRIX.map(({ worker }) => worker), 'production', 'missing'];
    for (const worker of new Set(workers)) expect(allowedAs(development(), entry(`worker=${worker}`)), worker).toBe('test');
    for (const cache of [...RESOURCE_CACHE_FAILURE_CODES, 'unavailable']) expect(allowedAs(development(), entry(`cache=${cache}`)), cache).toBe('test');
    for (const hold of ['commit', 'restore', 'list,restore', 'commit,list,restore', 'commit%2Clist']) {
      expect(allowedAs(development(), entry(`worker=busy&hold=${hold}`)), hold).toBe('test');
    }
    expect(allowedAs(development(), entry('worker=canary&capacity=insufficient&audio=unavailable&cache=write-failed&hold=commit'))).toBe('test');
    for (const query of ['hold=commit,upload', 'hold=commit,', 'hold=,commit', 'hold=commit;list', 'hold=commit,list,restore,commit', 'hold=',
      'capacity=plenty', 'audio=available', `worker=${'a'.repeat(41)}`, 'cache=Write-Failed']) {
      expect(categories(development(), entry(query)), query).toEqual(['query']);
    }
  });

  it('reject unknown paths, absent files, other queries, other resource types, other methods and bodies', () => {
    expect(categories(development(), request('/src/missing.ts'))).toEqual(['path']);
    expect(categories(development(), request('/src/../package.json'))).toEqual(['path']);
    expect(categories(development(), request('/e2e/entries/other.html', { resourceType: 'Document' }))).toEqual(['path']);
    expect(categories(development(), request('/api/upload'))).toEqual(['path']);
    expect(categories(development(), request('/@fs/Users/someone/file.ts'))).toEqual(['path']);
    expect(categories(development(), request('/src/main.tsx?t=abc'))).toEqual(['query']);
    expect(categories(development(), request('/src/main.tsx?type=classic'))).toEqual(['query']);
    expect(categories(development(), request('/src/main.tsx?data=x'))).toEqual(['query']);
    expect(categories(development(), request('/src/main.tsx?t=1&t=2'))).toEqual(['query']);
    expect(categories(development(), request('/e2e/entries/app.html?file=x', { resourceType: 'Document' }))).toEqual(['query']);
    expect(categories(development(), request('/e2e/entries/app.html?worker=A_B', { resourceType: 'Document' }))).toEqual(['query']);
    expect(categories(development(), request('/node_modules/.vite/deps/react.js?v=nothex00'))).toEqual(['query']);
    expect(categories(development(), request('/src/main.tsx', { resourceType: 'Fetch' }))).toEqual(['resource-type']);
    expect(categories(development(), request('/src/main.tsx', { method: 'POST', body: base64('data') }))).toEqual(['body', 'method']);
    expect(categories(development(), request('http://127.0.0.1:9/src/main.tsx'))).toEqual(['origin']);
  });

  it('allow only the Vite HMR WebSocket and only its protocol messages', () => {
    const invalidate = (data: object) => frame('sent', { type: 'custom', event: 'vite:invalidate', data });
    expect(allowedAs(development(), socket({ frames: [frame('received', { type: 'connected' }), frame('sent', { type: 'ping' }),
      invalidate({ path: '/src/main.tsx', message: 'Could not Fast Refresh', firstInvalidatedBy: '/src/main.tsx' }),
      invalidate({ path: '/src/app/app.css', firstInvalidatedBy: '/src/main.tsx' }), frame('received', { type: 'full-reload' })] }))).toBe('toolchain');
    // Extra fields, other invalidated paths or structured reasons are not the client's protocol.
    expect(categories(development(), socket({ frames: [frame('sent', { type: 'ping', payload: 'x' })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [invalidate({ path: '/src/main.tsx', firstInvalidatedBy: '/src/main.tsx', extra: 'x' })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [invalidate({ path: '/src/missing.ts', firstInvalidatedBy: '/src/main.tsx' })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [invalidate({ path: '/src/main.tsx?x=1', firstInvalidatedBy: '/src/main.tsx' })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [invalidate({ path: '/src/main.tsx', firstInvalidatedBy: '/src/main.tsx', message: { data: 'x' } })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [frame('sent', { type: 'custom', event: 'vite:invalidate', data: { path: '/src/main.tsx', firstInvalidatedBy: '/src/main.tsx' }, more: 1 })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ protocol: 'vite-ping' }))).toEqual(['websocket']);
    expect(categories(development(), socket({ url: 'ws://127.0.0.1:9/?token=abc' }))).toEqual(['websocket']);
    expect(categories(development(), socket({ url: 'ws://127.0.0.1:4174/hmr?token=abc' }))).toEqual(['websocket']);
    expect(categories(development(), socket({ url: 'ws://127.0.0.1:4174/?token=abc&x=1' }))).toEqual(['websocket']);
    expect(categories(development(), socket({ initiator: 'worker' }))).toEqual(['websocket']);
    expect(categories(development(), socket({ frames: [frame('sent', { type: 'custom', event: 'vite:forward-console', data: {} })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [frame('sent', 'not json')] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [frame('received', { type: 'upload' })] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ frames: [frame('sent', { type: 'ping' }, 2)] }))).toEqual(['websocket-frame']);
    expect(categories(development(), socket({ headers: [['Cookie', 'a=b']] }))).toEqual(['cookie']);
  });

  it('allow navigations only to entry and test documents', () => {
    const navigation = (path: string): AuditEvent => ({ kind: 'navigation', target: 'page-1', initiator: 'page', phase: 'test', url: `${ORIGIN}${path}` });
    expect(allowedAs(development(), navigation('/'))).toBe('product');
    expect(allowedAs(development(), navigation('/e2e/entries/app.html?worker=missing'))).toBe('test');
    expect(categories(development(), navigation('/e2e/entries/app.html?upload=1'))).toEqual(['navigation']);
    expect(categories(development(), navigation('/src/main.tsx'))).toEqual(['navigation']);
  });
});

describe('declared test requests', () => {
  const missingWorker: DeclaredRequest = {
    label: 'missing Worker entry', method: 'GET', path: '/src/workers/missing-import-worker.ts', query: { worker_file: /^$/, type: /^module$/ }, expect: 404,
  };
  const hashedWorker: DeclaredRequest = { label: 'Worker script replaced', method: 'GET', path: /^\/assets\/import-worker-[\w-]+\.js$/, expect: 'failed' };

  it('allow only their method, path and query without data, and record the expected outcome', () => {
    const missing = request('/src/workers/missing-import-worker.ts?worker_file&type=module', { status: 404 });
    expect(allowedAs(development([missingWorker]), missing)).toBe('test');
    expect(audit(development([missingWorker]), [missing]).allowed[0].rule).toBe('declared: missing Worker entry');
    expect(categories(development([missingWorker]), { ...missing, status: 200 })).toEqual(['declared-outcome']);
    expect(categories(development([missingWorker]), { ...missing, url: `${missing.url}&leak=1` })).toEqual(['path']);
    expect(categories(development([missingWorker]), { ...missing, method: 'POST', body: base64('x') })).toEqual(['body', 'method', 'path']);
    expect(categories(development(), missing)).toEqual(['path']);
    const replaced = request('/assets/import-worker-Zz9.js', { status: undefined, failure: 'net::ERR_FAILED' });
    expect(allowedAs(production([hashedWorker]), replaced)).toBe('test');
    expect(categories(production([hashedWorker]), { ...replaced, status: 404 })).toEqual(['declared-outcome']);
    // A request still unanswered has not failed yet.
    expect(categories(production([hashedWorker]), { ...replaced, failure: undefined })).toEqual(['declared-outcome']);
    expect(audit(production([hashedWorker]), [{ ...replaced, failure: undefined }]).violations[0].detail).toBe('Worker script replaced: expected failed, observed pending');
  });

  it('report declarations that never occurred', () => {
    expect(audit(development([missingWorker, hashedWorker]), [request('/src/main.tsx')]).missing).toEqual(['missing Worker entry', 'Worker script replaced']);
    expect(audit(production([hashedWorker]), [request('/assets/import-worker-Zz9.js', { status: undefined })]).missing).toEqual([]);
  });
});

describe('incomplete evidence', () => {
  it('marks unattributable events, uncovered targets and unread bodies as gaps, without counting them as zero leaks', () => {
    const clean = audit(production(), [request('/', { resourceType: 'Document' })]);
    expect(clean).toMatchObject({ complete: true, gaps: [], violations: [] });
    const unknown = audit(production(), [request('/', { resourceType: 'Document', initiator: 'unknown', target: 'browser' })]);
    expect(unknown.gaps.map(gap => gap.reason)).toEqual(['unknown-initiator']);
    expect(unknown.complete).toBe(false);
    const uncovered = audit(production(), [], [PAGE, { id: 'sw-1', type: 'shared_worker', url: `${ORIGIN}/x.js`, covered: false, note: 'not attached' }]);
    expect(uncovered.gaps).toEqual([{ reason: 'uncovered-target', target: 'sw-1', subject: `${ORIGIN}/x.js`, detail: 'shared_worker: not attached' }]);
    expect(uncovered.complete).toBe(false);
    const unread = audit(production(), [request('/', { resourceType: 'Document', body: null })]);
    expect(unread.gaps.map(gap => gap.reason)).toEqual(['unread-body']);
    expect(unread.complete).toBe(false);
  });

  it('keeps the initiator, phase and delivery of each violation, so Worker and close-phase traffic are told apart', () => {
    const report = audit(production(), [
      request(`/x?${CANARIES[0].value as string}`, { initiator: 'worker', target: 'worker-1', resourceType: 'Fetch', delivery: 'intercepted' }),
      request('/beacon', { initiator: 'browser', target: 'browser', phase: 'close', method: 'POST', resourceType: 'Ping', body: base64('x') }),
    ]);
    expect(report.violations.find(violation => violation.category === 'canary')).toMatchObject({ initiator: 'worker', target: 'worker-1', delivery: 'intercepted' });
    expect(report.violations.filter(violation => violation.phase === 'close').map(violation => violation.category).sort()).toEqual(['body', 'method', 'path']);
    expect(report.violations.every(violation => violation.phase !== 'close' || violation.initiator === 'browser')).toBe(true);
  });

  it('requires a bare policy origin', () => {
    expect(() => auditNetwork({ targets: [], events: [] }, { ...production(), origin: `${ORIGIN}/` })).toThrow('bare origin');
  });
});
