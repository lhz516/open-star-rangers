import { chromium, type CDPSession } from '@playwright/test';
import { installedBrowser } from './environment.ts';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class NativeTarget {
  readonly #root: CDPSession;
  readonly #sessionId: string;
  readonly #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; method: string }>();
  readonly #requests = new Map<string, string>();
  readonly errors: string[] = [];
  readonly allowed: string[] = [];
  #next = 0;

  constructor(root: CDPSession, sessionId: string) {
    this.#root = root;
    this.#sessionId = sessionId;
    root.on('Target.receivedMessageFromTarget', this.#receive);
  }

  readonly #receive = (event: { sessionId: string; message: string }): void => {
    if (event.sessionId !== this.#sessionId) return;
    const message: unknown = JSON.parse(event.message);
    if (!object(message)) throw new Error('Invalid CDP target message');
    if (typeof message.id === 'number') {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (object(message.error)) pending.reject(new Error(`${pending.method}: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
      return;
    }
    if (!object(message.params)) return;
    const params = message.params;
    if (message.method === 'Runtime.exceptionThrown') this.errors.push(`Uncaught: ${JSON.stringify(params.exceptionDetails)}`);
    if (message.method === 'Runtime.consoleAPICalled' && params.type === 'error') this.errors.push(`console: ${JSON.stringify(params.args)}`);
    if (message.method === 'Network.requestWillBeSent' && typeof params.requestId === 'string' && object(params.request)) {
      if (typeof params.request.url === 'string') this.#requests.set(params.requestId, params.request.url);
    }
    if (message.method === 'Network.loadingFailed') {
      this.errors.push(`request: ${this.#requests.get(String(params.requestId))}: ${String(params.errorText)}`);
    }
    if (message.method === 'Network.responseReceived' && object(params.response) && typeof params.response.status === 'number' && params.response.status >= 400) {
      const response = params.response;
      if (typeof response.url === 'string' && new URL(response.url).pathname === '/favicon.ico' && response.status === 404) {
        this.allowed.push('favicon.ico: 404');
      } else this.errors.push(`HTTP ${String(response.status)}: ${String(response.url)}`);
    }
    if (message.method === 'Log.entryAdded' && object(params.entry) && params.entry.level === 'error') {
      const entry = params.entry;
      if (typeof entry.url === 'string' && /\/favicon\.ico$/.test(entry.url) && String(entry.text).includes('404')) {
        this.allowed.push('favicon.ico: 404');
      } else this.errors.push(`Log: ${JSON.stringify(entry)}`);
    }
  };

  command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 5000);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#root.send('Target.sendMessageToTarget', {
        sessionId: this.#sessionId, message: JSON.stringify({ id, method, params }),
      }).catch(error => {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      });
    });
  }

  async evaluate<T, A = undefined>(read: (argument: A) => T | Promise<T>, argument?: A): Promise<T> {
    const response = await this.command('Runtime.evaluate', {
      expression: `(${read.toString()})(${JSON.stringify(argument) ?? 'undefined'})`, returnByValue: true, awaitPromise: true,
    });
    if (!object(response)) throw new Error('Missing Runtime.evaluate response');
    if (response.exceptionDetails) throw new Error(`Runtime.evaluate exception: ${JSON.stringify(response.exceptionDetails)}`);
    if (!object(response.result)) throw new Error('Missing Runtime.evaluate result');
    // Like Playwright evaluate, this typed boundary serializes the supplied function's return value.
    return response.result.value as T;
  }

  async click(selector: string): Promise<void> {
    const point = await this.evaluate(selector => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing click target: ${selector}`);
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
    if (typeof point.x !== 'number' || typeof point.y !== 'number') throw new Error('Invalid click coordinates');
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.command('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
    }
  }

  async key(code: 'ArrowRight' | 'KeyP', type: 'keyDown' | 'keyUp', autoRepeat = false): Promise<void> {
    const right = code === 'ArrowRight';
    await this.command('Input.dispatchKeyEvent', {
      type, code, key: right ? 'ArrowRight' : 'p', windowsVirtualKeyCode: right ? 39 : 80,
      nativeVirtualKeyCode: right ? 39 : 80, autoRepeat,
      ...(right || type === 'keyUp' ? {} : { text: 'p', unmodifiedText: 'p' }),
    });
  }

  dispose(): void {
    this.#root.off('Target.receivedMessageFromTarget', this.#receive);
    for (const { reject, timer, method } of this.#pending.values()) {
      clearTimeout(timer);
      reject(new Error(`CDP ${method} disposed before response`));
    }
    this.#pending.clear();
  }
}

export async function nativeBrowser(args: readonly string[] = []) {
  return chromium.launch({
    ...installedBrowser(false),
    args: ['--enable-automation', ...args],
    ignoreDefaultArgs: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
}

export async function until<T>(read: () => Promise<T>, accepted: (value: T) => boolean, description: string): Promise<T> {
  const deadline = Date.now() + 5000;
  let last = await read();
  while (!accepted(last)) {
    if (Date.now() >= deadline) throw new Error(`${description} timed out; last observation: ${JSON.stringify(last)}`);
    await new Promise(resolve => setTimeout(resolve, 50));
    last = await read();
  }
  return last;
}
