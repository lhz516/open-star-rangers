/**
 * The isolated browser entry of the flight renderer's regression (P3-12/25; docs/plan/p3/12/spec.md, 验证策略), loaded
 * by `e2e/entries/flight-scenes.html` from the development server only: the real flight renderer on a real WebGL 2
 * surface (the browser factory with the production surface options), each run wired by the real `wireFlightRun` with the
 * synthetic scene content (flight-scenes.test-support.ts) and driven by a test-controlled run handle (`fakeRun`), so a
 * test can draw Render States and events Core cannot yet produce, such as the destruction view P3-11 has not wired.
 * Nothing here is part of a production build or the application's own flow.
 *
 * `window.osrFlightScenes`: `open` creates the area, surface and renderer; `start` wires a run from its tick-0 Render
 * State and seed; `deliver` gives the run a frame of per-tick outputs (null for a still frame); `diagnostics` reads the
 * renderer's; `resize` changes the area's CSS size; `end` ends the run; `close` disposes the renderer and the area.
 * Errors the renderer reports outside a frame are kept for `reported`.
 */
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { createBrowserWebGLSurface } from '../../webgl/browser-webgl-surface.ts';
import { tickInput } from '../presentation/presentation.test-support.ts';
import { prepareFlightContent, type PreparedFlightContent } from './flight-passes.ts';
import { createFlightRenderer, FLIGHT_SURFACE, type FlightRenderDiagnostics, type FlightRenderer } from './flight-renderer.ts';
import { wireFlightRun } from './flight-run.ts';
import { fakeRun } from './flight-run.test-support.ts';
import { flightSceneContent } from './flight-scenes.test-support.ts';

export interface SceneTick {
  readonly render: RenderState;
  readonly events?: readonly DomainEvent[];
}

export interface FlightScenes {
  open(width: number, height: number): void;
  start(seed: number, initial: RenderState): void;
  deliver(ticks: readonly SceneTick[] | null, alpha?: number): void;
  diagnostics(): FlightRenderDiagnostics;
  resize(width: number, height: number): void;
  end(): void;
  close(): void;
  reported(): string[];
}

declare global {
  interface Window {
    osrFlightScenes?: FlightScenes;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

const OWNER = 1;
let content: PreparedFlightContent | null = null;
let area: HTMLElement | null = null;
let renderer: FlightRenderer | null = null;
let run: ReturnType<typeof fakeRun> | null = null;
let runs = 0;
const reported: string[] = [];

function live(): FlightRenderer {
  if (!renderer) throw new Error('No open flight scene');
  return renderer;
}

function current(): ReturnType<typeof fakeRun> {
  if (!run) throw new Error('No running flight scene');
  return run;
}

function sized(element: HTMLElement, width: number, height: number): void {
  Object.assign(element.style, { width: `${width}px`, height: `${height}px` });
}

window.osrFlightScenes = Object.freeze<FlightScenes>({
  open(width, height) {
    if (renderer) throw new Error('A flight scene is already open');
    content ??= prepareFlightContent(flightSceneContent());
    area = document.createElement('div');
    area.dataset.testid = 'flight-scene';
    Object.assign(area.style, { position: 'absolute', left: '0px', top: '0px', background: '#000', overflow: 'hidden' });
    sized(area, width, height);
    document.body.append(area);
    renderer = createFlightRenderer({
      ownerId: OWNER,
      surface: createBrowserWebGLSurface(area, FLIGHT_SURFACE),
      reportError: (error) => { reported.push(String(error)); },
    });
  },
  start(seed, initial) {
    const drawing = live();
    if (run) throw new Error('A scene run is already running');
    runs += 1;
    const next = fakeRun(runs, deepFreeze(initial));
    wireFlightRun(next.run, { renderer: drawing, binding: { ownerId: OWNER, runId: runs, generation: 1, identity: 'e2e-flight-scenes' }, content: content!, seed });
    run = next;
    next.deliver(null);
  },
  deliver(ticks, alpha = 0) {
    current().deliver(ticks && ticks.map(({ render, events = [] }) => tickInput(deepFreeze(render), deepFreeze(events))), alpha);
  },
  diagnostics: () => live().diagnostics(),
  resize(width, height) {
    if (!area) throw new Error('No open flight scene');
    sized(area, width, height);
  },
  end() {
    const errors = current().end();
    run = null;
    if (errors.length > 0) throw new AggregateError(errors, 'The scene run did not end cleanly');
  },
  close() {
    if (run) window.osrFlightScenes!.end();
    live().dispose();
    renderer = null;
    area?.remove();
    area = null;
  },
  reported: () => [...reported],
});
