import { expect, type Page } from '@playwright/test';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import { seedTestEntryPackage } from './ai-wingman.ts';
import { button, openTestEntry, type TestEntryOptions } from './app-entry.ts';
import type { LogicalImage } from './flight-pictures.ts';
import { missionEntry } from './mission-observations.ts';

// P3-13/29 (docs/plan/p3/13/subtasks/29-browser-lifecycle.md; spec 接线与生命周期, 地图输入几何与指针; AC-18, AC-19): a
// read-only recorder of the page's WebGL 2 calls, which the cockpit lifecycle regression uses to show which passes clear
// or write the game image's depth, which render targets and depth attachments exist, and, for its fault cases, one
// injected failure of a GPU call. The application is never changed: the recorder wraps `WebGL2RenderingContext`'s
// prototype before any page script runs, keeps only counts and object identities, and passes every call through.

/** One composited frame, from one canvas clear (the screen stage's, P3-12) to the next. */
export interface GlFrame {
  /** Clears of a framebuffer other than the canvas's (the game image, the run's one render target) with the depth bit. */
  readonly gameDepthClears: number;
  /** Draws into the game image by the cockpit layer's program (cockpit-layer.ts, its `texelFetch(picture` fragment). */
  readonly cockpitDraws: number;
  /** Cockpit draws with depth writes on or the depth test enabled; the layer must do neither. */
  readonly cockpitDepth: number;
  /** Draws into the game image by any other program. */
  readonly otherGameDraws: number;
  /** The depth texture attached to the game image's framebuffer at its draws, by recorder ID (0 for none). */
  readonly depthTexture: number;
  /** `performance.now()` at the frame's first call on the game image (null without one), and at its canvas clear. */
  readonly opened: number | null;
  readonly closed: number;
}

export interface GlRecord {
  readonly frames: readonly GlFrame[];
  /** Framebuffers created since the page loaded. */
  readonly framebuffers: number;
  /** Depth allocations (depth internal formats) since the page loaded, as `width × height`. */
  readonly depthAllocations: readonly string[];
  /** Every WebGL 2 context that made a call since the page loaded: its canvas still in the document, and whether it is lost. */
  readonly contexts: readonly { readonly connected: boolean; readonly lost: boolean }[];
  /** Injected failures that fired, by call. */
  readonly injected: readonly string[];
  /** Every `pointerlockchange` since the page loaded: when, and whether the document is then locked. */
  readonly locks: readonly { readonly time: number; readonly locked: boolean }[];
}

/** Which call the recorder makes fail once, for the cockpit picture's texture only. */
export type GlFault = 'delete-cockpit-texture' | 'draw-cockpit';

interface GlRecorder {
  take(): GlRecord;
  arm(fault: GlFault): void;
}

declare global {
  interface Window { osrGl?: GlRecorder }
}

/** Serialized into the page before navigation. */
export function installGlRecorder(): void {
  const proto = WebGL2RenderingContext.prototype;
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (value: object | null): number => {
    if (value === null) return 0;
    let known = ids.get(value);
    if (known === undefined) ids.set(value, known = ++next);
    return known;
  };
  const COCKPIT_BYTES = 640 * 480 * 4;
  const sources = new WeakMap<WebGLShader, string>();
  const cockpitPrograms = new WeakSet<WebGLProgram>();
  const cockpitTextures = new WeakSet<WebGLTexture>();
  const attachedTextures = new WeakSet<WebGLTexture>();
  const depthOf = new WeakMap<WebGLFramebuffer, number>();
  interface State { program: WebGLProgram | null; framebuffer: WebGLFramebuffer | null; texture: WebGLTexture | null; depthMask: boolean; depthTest: boolean }
  const states = new WeakMap<WebGL2RenderingContext, State>();
  const state = (gl: WebGL2RenderingContext): State => {
    let known = states.get(gl);
    if (!known) states.set(gl, known = { program: null, framebuffer: null, texture: null, depthMask: true, depthTest: false });
    return known;
  };
  const contexts: WebGL2RenderingContext[] = [];
  const frames: GlFrame[] = [];
  const blank = () => ({
    gameDepthClears: 0, cockpitDraws: 0, cockpitDepth: 0, otherGameDraws: 0, depthTexture: 0, opened: null as number | null, closed: 0,
  });
  const locks: { time: number; locked: boolean }[] = [];
  document.addEventListener('pointerlockchange', () => { locks.push({ time: performance.now(), locked: document.pointerLockElement !== null }); });
  let current: ReturnType<typeof blank> | null = null;
  let framebuffers = 0;
  const depthAllocations: string[] = [];
  const injected: string[] = [];
  const armed = new Set<GlFault>();
  const DEPTH_FORMATS = new Set<number>([proto.DEPTH_COMPONENT16, proto.DEPTH_COMPONENT24, proto.DEPTH_COMPONENT32F, proto.DEPTH24_STENCIL8, proto.DEPTH32F_STENCIL8, proto.DEPTH_COMPONENT, proto.DEPTH_STENCIL]);
  const see = (gl: WebGL2RenderingContext) => {
    if (!states.has(gl)) contexts.push(gl);
    return state(gl);
  };
  // Every wrapper passes its call through unchanged, before or after recording.
  type Method = (this: WebGL2RenderingContext, ...args: never[]) => unknown;
  const wrap = <K extends keyof WebGL2RenderingContext>(name: K, before: (gl: WebGL2RenderingContext, args: unknown[]) => void) => {
    const original = proto[name] as unknown as Method;
    (proto as unknown as Record<string, Method>)[name] = function (this: WebGL2RenderingContext, ...args: never[]) {
      before(this, args);
      return original.apply(this, args);
    };
  };
  wrap('shaderSource', (_gl, [shader, source]) => { sources.set(shader as WebGLShader, source as string); });
  wrap('attachShader', (_gl, [program, shader]) => {
    if ((sources.get(shader as WebGLShader) ?? '').includes('texelFetch(picture')) cockpitPrograms.add(program as WebGLProgram);
  });
  wrap('useProgram', (gl, [program]) => { see(gl).program = program as WebGLProgram | null; });
  wrap('bindFramebuffer', (gl, [target, framebuffer]) => {
    if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) see(gl).framebuffer = framebuffer as WebGLFramebuffer | null;
  });
  wrap('createFramebuffer', () => { framebuffers += 1; });
  wrap('depthMask', (gl, [flag]) => { see(gl).depthMask = Boolean(flag); });
  wrap('enable', (gl, [cap]) => { if (cap === gl.DEPTH_TEST) see(gl).depthTest = true; });
  wrap('disable', (gl, [cap]) => { if (cap === gl.DEPTH_TEST) see(gl).depthTest = false; });
  wrap('bindTexture', (gl, [target, texture]) => { if (target === gl.TEXTURE_2D) see(gl).texture = texture as WebGLTexture | null; });
  wrap('framebufferTexture2D', (gl, [, attachment, , texture]) => {
    const { framebuffer } = see(gl);
    if (texture) attachedTextures.add(texture as WebGLTexture);
    if (framebuffer && (attachment === gl.DEPTH_ATTACHMENT || attachment === gl.DEPTH_STENCIL_ATTACHMENT)) depthOf.set(framebuffer, id(texture as WebGLTexture | null));
  });
  wrap('texStorage2D', (_gl, [, , format, width, height]) => {
    if (DEPTH_FORMATS.has(format as number)) depthAllocations.push(`${width as number} × ${height as number}`);
  });
  const upload = (gl: WebGL2RenderingContext, pixels: unknown) => {
    const { texture } = see(gl);
    if (!texture || !ArrayBuffer.isView(pixels) || pixels.byteLength !== COCKPIT_BYTES || attachedTextures.has(texture)) return;
    cockpitTextures.add(texture);
  };
  wrap('texImage2D', (gl, args) => {
    if (args.length >= 9) {
      if (DEPTH_FORMATS.has(args[2] as number)) depthAllocations.push(`${args[3] as number} × ${args[4] as number}`);
      upload(gl, args[8]);
    }
  });
  wrap('texSubImage2D', (gl, args) => { if (args.length >= 9) upload(gl, args[8]); });
  wrap('deleteTexture', (_gl, [texture]) => {
    if (texture && cockpitTextures.has(texture as WebGLTexture) && armed.delete('delete-cockpit-texture')) {
      injected.push('delete-cockpit-texture');
      throw new Error('Synthetic failure releasing the cockpit picture (P3-13/29)');
    }
  });
  wrap('clear', (gl, [mask]) => {
    const { framebuffer } = see(gl);
    if (framebuffer === null) {
      // The screen stage clears the canvas once per composited frame, after every layer drew into the game image.
      if (current) {
        current.closed = performance.now();
        frames.push(current);
      }
      if (frames.length > 5000) frames.splice(0, frames.length - 5000);
      current = blank();
      return;
    }
    current ??= blank();
    current.opened ??= performance.now();
    if (((mask as number) & gl.DEPTH_BUFFER_BIT) !== 0) current.gameDepthClears += 1;
  });
  const draw = (gl: WebGL2RenderingContext) => {
    const { framebuffer, program, depthMask, depthTest } = see(gl);
    if (framebuffer === null) return;
    current ??= blank();
    current.opened ??= performance.now();
    current.depthTexture = depthOf.get(framebuffer) ?? 0;
    if (program && cockpitPrograms.has(program)) {
      if (armed.delete('draw-cockpit')) {
        injected.push('draw-cockpit');
        throw new Error('Synthetic failure of the cockpit layer\'s draw (P3-13/29)');
      }
      current.cockpitDraws += 1;
      if (depthMask || depthTest) current.cockpitDepth += 1;
    } else current.otherGameDraws += 1;
  };
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'] as const) wrap(name, (gl) => { draw(gl); });
  window.osrGl = {
    take() {
      const record = {
        frames: frames.splice(0), framebuffers, depthAllocations: [...depthAllocations], injected: [...injected], locks: [...locks],
        contexts: contexts.map(gl => ({ connected: gl.canvas instanceof HTMLCanvasElement && gl.canvas.isConnected, lost: gl.isContextLost() })),
      };
      return JSON.parse(JSON.stringify(record)) as GlRecord;
    },
    arm(fault) { armed.add(fault); },
  };
}

/** The frames recorded since the last read, and the page's totals. */
export const glRecord = (page: Page): Promise<GlRecord> => page.evaluate(() => window.osrGl!.take());

/** Makes the next matching call fail once. */
export const armGlFault = (page: Page, fault: GlFault): Promise<void> => page.evaluate(name => { window.osrGl!.arm(name); }, fault);

/** The development test entry with `groups` seeded under its profile and restored through the menu; the mission eligible. */
export async function seededMenu(page: Page, groups: readonly HeldGroup[], options: TestEntryOptions): Promise<void> {
  await openTestEntry(page, options);
  await seedTestEntryPackage(page, groups);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').getByText('Mission loads into Core', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

/** The flight renderer's development diagnostics, refreshed by a DOM click that a pointer lock cannot divert. */
export async function renderDiagnostics(page: Page): Promise<Record<string, string>> {
  await page.evaluate(() => { document.querySelector<HTMLButtonElement>('[data-testid="dev-flight-refresh"]')!.click(); });
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid^="dev-flight-"]')]
    .filter(element => element.tagName === 'DD').map(element => [element.getAttribute('data-testid')!.slice('dev-flight-'.length), element.textContent ?? ''])));
}

/** The panel's cockpit counts of the current run, or null without a run with a cockpit (development builds). */
export async function cockpitCounts(page: Page): Promise<{ messages: number; messageDrops: number; radarNoiseDropped: number } | null> {
  await page.evaluate(() => { document.querySelector<HTMLButtonElement>('[data-testid="dev-cockpit-refresh"]')!.click(); });
  return page.evaluate(() => {
    if (document.querySelector('[data-testid="dev-cockpit-none"]')) return null;
    const count = (name: string) => Number(document.querySelector(`[data-testid="dev-cockpit-${name}"]`)!.textContent);
    return { messages: count('messages'), messageDrops: count('messageDrops'), radarNoiseDropped: count('radarNoiseDropped') };
  });
}

/** Contexts whose canvas is in the document with the context live, and all others. */
export function liveContexts({ contexts }: GlRecord): { live: number; stale: number } {
  const live = contexts.filter(({ connected, lost }) => connected && !lost).length;
  return { live, stale: contexts.length - live };
}

/**
 * The pixels of `scaled`, read at logical `scale`, that show no logical pixel of `reference` the device pixel's centre
 * may fall in (two where a centre lies exactly on a texel edge), as flight-render.development.spec.ts compares.
 */
export function scaledMismatches(reference: LogicalImage, scaled: LogicalImage, scale: number): { x: number; y: number }[] {
  const sources = (logical: number, size: number) => {
    const at = (Math.floor((logical + 0.5) * scale) + 0.5) / scale;
    const below = Math.min(size - 1, Math.floor(at));
    return Number.isInteger(at) ? [below - 1, below] : [below];
  };
  const wrong: { x: number; y: number }[] = [];
  for (let y = 0; y < 480; y++) {
    for (let x = 0; x < 640; x++) {
      const actual = scaled.at(x, y).join();
      if (!sources(y, 480).some(sy => sources(x, 640).some(sx => reference.at(sx, sy).join() === actual))) wrong.push({ x, y });
    }
  }
  return wrong.slice(0, 10);
}
