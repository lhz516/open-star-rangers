import { arch, cpus, release, totalmem, type } from 'node:os';
import { expect, type Page, type TestInfo } from '@playwright/test';

// P2-12 S-05 and AC-05: main-page responsiveness. A window, which the test opens before an operation and closes after
// its observable end, collects every Long Tasks API record (the API's 50 ms definition) that intersects it and the
// intervals between the frames delivered inside it. The observer is installed before the page's own scripts and stays
// for the document. Closing first lets one frame and one task pass, so work the operation's end queued is inside the
// window, then waits until the same observer delivers a performance mark made after the window ended: records are
// delivered in the order they were queued, so every long task that ended before the mark has arrived with it. An
// unavailable API or undelivered records are an error, never zero.
//
// `InputOrder` separately records trusted clicks, frames and the import page's status in one order, for the controlled
// busy-Worker and failure scenarios (I-7). Its timings are test wiring, never performance evidence.

/** A long task on the page clock (ms since the document's time origin). */
export interface LongTaskRecord {
  readonly startMs: number;
  readonly durationMs: number;
  /** The Long Tasks API's attribution name, such as `self`. */
  readonly name: string;
}

export interface ResponsivenessEnvironment {
  /** Browser engine and version. */
  readonly browser: string;
  readonly machine: string;
  /** `document.visibilityState` when the window opened and when it closed. */
  readonly visibility: { readonly start: string; readonly end: string };
  /** What the probe and the automation add to the page, which the record includes. */
  readonly overhead: readonly string[];
}

export interface ResponsivenessRecord {
  /** The operation the test measured, such as `import`, `commit` or `restore`. */
  readonly operation: string;
  /** The window on the page clock (ms since the document's time origin) and its length. */
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  /** Every long task intersecting the window, in start order. */
  readonly longTasks: readonly LongTaskRecord[];
  readonly longTaskCount: number;
  /** null when the window had no long task. */
  readonly longestTaskMs: number | null;
  /** Frames delivered inside the window. */
  readonly frames: number;
  /** The longest gap between the window's start, each frame inside it and its end. */
  readonly maxFrameIntervalMs: number;
  readonly environment: ResponsivenessEnvironment;
}

const OVERHEAD = Object.freeze([
  'one PerformanceObserver for longtask and mark entries, installed before the page scripts for the whole document',
  'one test-owned requestAnimationFrame callback per frame while a window is open',
  'closing waits one frame and one task, then one performance mark proves delivery',
  'Playwright drives the page over the Chrome DevTools Protocol, as does the network audit when attached',
]);

interface ClosedWindow {
  operation: string;
  start: number;
  end: number;
  tasks: { start: number; duration: number; name: string }[];
  frames: number[];
  visibility: { start: string; end: string };
}

interface ResponsivenessProbe {
  /** Why the probe cannot measure in this document, or null. */
  readonly unavailable: string | null;
  /**
   * Opens a window and returns its ID. Page code may call it at the exact start of an operation the test cannot start
   * itself; `ResponsivenessWindow.adopt` then closes that window from the test.
   */
  open(operation: string): number;
  /** The ID of the latest open window of `operation` that is not closing, or null. */
  find(operation: string): number | null;
  close(id: number): Promise<ClosedWindow>;
}

type StatusEntry = { readonly event: 'status'; readonly status: string; readonly at: number };
type InputEntry = {
  readonly event: 'input' | 'handled'; readonly target: string; readonly trusted: boolean; readonly at: number;
  /** The import page's status and each Worker's state when the entry was made. */
  readonly status: string; readonly workers: readonly WorkerState[] | null;
};

/** A Worker as the browser probes saw it: how many messages it had sent and how often it was terminated. */
export interface WorkerState { readonly name: string; readonly messages: number; readonly terminations: number }

/**
 * One event in page order: a delivered frame; the start (`input`, capture on `window`) and end (`handled`, bubble on
 * `window`) of a click's dispatch, labelled `probe` for the test's control or by the clicked button's text; or a change
 * of the import page's status. A change between a click's `input` and `handled` happened inside that dispatch, before
 * any other task. `at` is the page clock.
 */
export type OrderEntry = { readonly event: 'frame'; readonly at: number } | InputEntry | StatusEntry;

interface InputOrderRecorder {
  readonly entries: OrderEntry[];
  stop(): void;
}

declare global {
  interface Window {
    osrResponsiveness?: ResponsivenessProbe;
    osrInputOrder?: InputOrderRecorder;
  }
}

/** Serialized before navigation; everything it keeps belongs to the test. */
export function installResponsivenessProbe(): void {
  const now = (): number => performance.now();
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  const prefix = 'osr-responsiveness-flush-';
  const delivered = new Set<string>();
  const windows = new Map<number, { operation: string; start: number; visibility: string }>();
  const closing = new Set<number>();
  let frames: number[] = [];
  let tasks: ClosedWindow['tasks'] = [];
  let loop: number | null = null;
  let opened = 0;
  let unavailable: string | null = null;
  const types = typeof PerformanceObserver === 'function' ? PerformanceObserver.supportedEntryTypes : [];
  if (!types.includes('longtask')) unavailable = 'The Long Tasks API is unavailable: PerformanceObserver does not support longtask entries';
  else if (!types.includes('mark')) unavailable = 'The Long Tasks API cannot be flushed: PerformanceObserver does not support mark entries';
  else {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // A task delivered while no window is open ended before any later window can start.
          if (entry.entryType === 'longtask') { if (windows.size > 0) tasks.push({ start: entry.startTime, duration: entry.duration, name: entry.name }); }
          else if (entry.name.startsWith(prefix)) delivered.add(entry.name);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      observer.observe({ type: 'mark' });
    } catch (error) {
      unavailable = `The Long Tasks API is unavailable: ${String(error)}`;
    }
  }
  function frame(): void {
    frames.push(now());
    loop = windows.size > 0 ? requestFrame(frame) : null;
  }
  const pause = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms); });
  window.osrResponsiveness = Object.freeze({
    unavailable,
    open(operation: string): number {
      if (unavailable !== null) throw new Error(unavailable);
      const id = ++opened;
      windows.set(id, { operation, start: now(), visibility: document.visibilityState });
      loop ??= requestFrame(frame);
      return id;
    },
    find(operation: string): number | null {
      const ids = [...windows].filter(([id, opening]) => opening.operation === operation && !closing.has(id)).map(([id]) => id);
      return ids.at(-1) ?? null;
    },
    async close(id: number): Promise<ClosedWindow> {
      const opening = windows.get(id);
      if (!opening || closing.has(id)) throw new Error(`No open responsiveness window ${id} in this document`);
      closing.add(id);
      // Work the operation's end queued, such as a render or a hand-off, runs inside the window.
      await new Promise<void>(resolve => {
        const done = (): void => { clearTimeout(timer); cancelFrame(handle); resolve(); };
        const timer = setTimeout(done, 1_000);
        const handle = requestFrame(done);
      });
      await pause(0);
      const end = now();
      const visibility = { start: opening.visibility, end: document.visibilityState };
      const inside = frames.filter(time => time >= opening.start && time <= end);
      if (windows.size === 1 && loop !== null) {
        cancelFrame(loop);
        loop = null;
      }
      const mark = `${prefix}${id}`;
      performance.mark(mark);
      const deadline = now() + 2_000;
      try {
        while (!delivered.has(mark)) {
          if (now() > deadline) throw new Error(`Long task records were not delivered within 2000 ms of closing the ${opening.operation} window`);
          await pause(10);
        }
      } finally {
        windows.delete(id);
        closing.delete(id);
        delivered.delete(mark);
        performance.clearMarks(mark);
      }
      const found = tasks.filter(task => task.start < end && task.start + task.duration > opening.start).sort((left, right) => left.start - right.start);
      // Keep only what a window still open can intersect.
      const earliest = Math.min(...[...windows.values()].map(({ start }) => start));
      frames = frames.filter(time => time >= earliest);
      tasks = tasks.filter(task => task.start + task.duration > earliest);
      return { operation: opening.operation, start: opening.start, end, frames: inside, visibility, tasks: found };
    },
  });
}

/** Installs the probe in every document the page loads from now on; call it before the first navigation. */
export async function installResponsiveness(page: Page): Promise<void> {
  await page.addInitScript(installResponsivenessProbe);
}

const round = (ms: number): number => Math.round(ms * 10) / 10;

function machine(): string {
  const processors = cpus();
  return `${type()} ${release()} ${arch()}; ${processors.length} × ${processors[0]?.model.trim() ?? 'unknown CPU'}; ${Math.round(totalmem() / 2 ** 30)} GiB`;
}

/** A window of the page's current document; a reload ends it, and closing it then fails. */
export class ResponsivenessWindow {
  private readonly page: Page;
  private readonly id: number;

  private constructor(page: Page, id: number) {
    this.page = page;
    this.id = id;
  }

  /** Opens a window for `operation`; fails when the probe is missing or the Long Tasks API is unavailable. */
  static async open(page: Page, operation: string): Promise<ResponsivenessWindow> {
    const id = await page.evaluate(name => {
      if (!window.osrResponsiveness) throw new Error('The responsiveness probe is not installed in this document; install it before navigating');
      return window.osrResponsiveness.open(name);
    }, operation);
    return new ResponsivenessWindow(page, id);
  }

  /** The latest open window of `operation` that page code opened through the probe; fails when there is none. */
  static async adopt(page: Page, operation: string): Promise<ResponsivenessWindow> {
    const id = await page.evaluate(name => window.osrResponsiveness?.find(name) ?? null, operation);
    if (id === null) throw new Error(`No open responsiveness window of ${operation} in this document`);
    return new ResponsivenessWindow(page, id);
  }

  /**
   * Closes the window after the operation's observable end and returns its record once every intersecting long task
   * has been delivered; fails when the records do not arrive.
   */
  async close(): Promise<ResponsivenessRecord> {
    const closed = await this.page.evaluate(id => {
      if (!window.osrResponsiveness) throw new Error('The responsiveness probe is not installed in this document');
      return window.osrResponsiveness.close(id);
    }, this.id);
    const points = [closed.start, ...closed.frames, closed.end];
    const intervals = points.slice(1).map((time, index) => time - points[index]);
    const longTasks = closed.tasks.map(({ start, duration, name }) => ({ startMs: round(start), durationMs: round(duration), name }));
    const browser = this.page.context().browser();
    return {
      operation: closed.operation,
      startMs: round(closed.start), endMs: round(closed.end), durationMs: round(closed.end - closed.start),
      longTasks, longTaskCount: longTasks.length,
      longestTaskMs: longTasks.length === 0 ? null : Math.max(...longTasks.map(({ durationMs }) => durationMs)),
      frames: closed.frames.length, maxFrameIntervalMs: round(Math.max(...intervals)),
      environment: {
        browser: browser ? `${browser.browserType().name()} ${browser.version()}` : 'unknown (persistent context)',
        machine: machine(), visibility: closed.visibility, overhead: OVERHEAD,
      },
    };
  }
}

/** Measures `action` in one window. */
export async function measureResponsiveness(page: Page, operation: string, action: () => Promise<unknown>): Promise<ResponsivenessRecord> {
  const measured = await ResponsivenessWindow.open(page, operation);
  await action();
  return measured.close();
}

/** One line for the test log. */
export const describeResponsiveness = (record: ResponsivenessRecord): string =>
  `${record.operation}: ${record.durationMs} ms, ${record.longTaskCount} long tasks${record.longestTaskMs === null ? '' : ` (longest ${record.longestTaskMs} ms)`}, `
  + `${record.frames} frames, max frame interval ${record.maxFrameIntervalMs} ms, ${record.environment.visibility.start}→${record.environment.visibility.end}`;

/** Attaches the records as the test's responsiveness evidence, with the project and its headless setting. */
export async function attachResponsiveness(testInfo: TestInfo, records: readonly ResponsivenessRecord[]): Promise<void> {
  const { headless, launchOptions } = testInfo.project.use;
  await testInfo.attach('responsiveness', {
    contentType: 'application/json',
    body: JSON.stringify({ project: testInfo.project.name, headless: launchOptions?.headless ?? headless ?? true, records }, null, 1),
  });
}

/** The recorder's page side; serialized into the page. */
function startRecorder(): void {
  if (window.osrInputOrder) throw new Error('An input order recorder is already running in this document');
  const entries: OrderEntry[] = [];
  const now = (): number => performance.now();
  const status = (): string => {
    const progress = document.querySelector('[data-testid="import-progress"]');
    if (progress) return `import:${progress.getAttribute('data-stage') ? `running:${progress.getAttribute('data-stage')}` : 'starting'}`;
    return `import:${document.querySelector('[data-testid="import-result"]')?.getAttribute('data-result') ?? 'none'}`;
  };
  const workers = (): WorkerState[] | null => window.osrProbe?.snapshot().workers
    .map(({ name, messages, terminations }) => ({ name, messages: messages.length, terminations })) ?? null;
  const control = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Responsiveness probe' });
  control.dataset.testid = 'responsiveness-probe';
  control.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647';
  const label = (target: EventTarget | null): string => {
    const element = target instanceof Element ? target.closest('button') ?? target : null;
    if (element === control) return 'probe';
    return element ? (element.textContent ?? '').trim() || element.tagName.toLowerCase() : 'unknown';
  };
  let last = status();
  const click = (event: Event): void => {
    entries.push({
      event: event.eventPhase === Event.CAPTURING_PHASE ? 'input' : 'handled', target: label(event.target), trusted: event.isTrusted, at: now(),
      status: status(), workers: workers(),
    });
  };
  const changes = new MutationObserver(() => {
    const current = status();
    if (current === last) return;
    last = current;
    entries.push({ event: 'status', status: current, at: now() });
  });
  let frame = requestAnimationFrame(function loop() {
    entries.push({ event: 'frame', at: now() });
    frame = requestAnimationFrame(loop);
  });
  window.addEventListener('click', click, true);
  window.addEventListener('click', click);
  changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-stage', 'data-result'] });
  document.body.append(control);
  window.osrInputOrder = {
    entries,
    stop: () => {
      cancelAnimationFrame(frame);
      changes.disconnect();
      window.removeEventListener('click', click, true);
      window.removeEventListener('click', click);
      control.remove();
      delete window.osrInputOrder;
    },
  };
}

/** A compact form of each entry, such as `frame`, `input:probe`, `handled:Cancel import` or `status:import:cancelled`. */
export const orderTokens = (entries: readonly OrderEntry[]): string[] =>
  entries.map(entry => (entry.event === 'frame' ? 'frame' : entry.event === 'status' ? `status:${entry.status}` : `${entry.event}:${entry.target}`));

/**
 * I-7: trusted input, frames and the import page's status in one page order, during a controlled active window. It adds
 * a fixed control, two `window` click listeners, a MutationObserver and a frame loop, all removed by `stop`.
 */
export class InputOrder {
  private readonly page: Page;

  private constructor(page: Page) {
    this.page = page;
  }

  /** Starts recording on the current document. */
  static async start(page: Page): Promise<InputOrder> {
    await page.evaluate(startRecorder);
    return new InputOrder(page);
  }

  entries(): Promise<OrderEntry[]> {
    return this.page.evaluate(() => {
      if (!window.osrInputOrder) throw new Error('No input order recorder in this document');
      return window.osrInputOrder.entries;
    });
  }

  /** Waits until `count` frames follow the last entry that `match` accepts. */
  async framesAfter(match: (entry: OrderEntry) => boolean, count = 1): Promise<void> {
    await expect.poll(async () => {
      const entries = await this.entries();
      const index = entries.findLastIndex(match);
      return index === -1 ? -1 : entries.slice(index + 1).filter(({ event }) => event === 'frame').length;
    }, { timeout: 5_000 }).toBeGreaterThanOrEqual(count);
  }

  /** A trusted click on the test's control; resolves once its dispatch was handled and a frame followed. */
  async clickProbe(): Promise<void> {
    await this.page.getByTestId('responsiveness-probe').click();
    await this.framesAfter(entry => entry.event === 'handled' && entry.target === 'probe');
  }

  /** Stops recording, removes everything it added, and returns the entries. */
  stop(): Promise<OrderEntry[]> {
    return this.page.evaluate(() => {
      const recorder = window.osrInputOrder;
      if (!recorder) throw new Error('No input order recorder in this document');
      recorder.stop();
      return recorder.entries;
    });
  }
}
