/**
 * The isolated strategic map input entry (docs/plan/p3/05/subtask 27; spec 战略地图输入, 执行前提 “地图交接”, 验证策略),
 * served only by the development server at `/e2e/entries/map-input.html`. It is not the real mission's map path (P3-09,
 * P3-13 and P3-15 own that) and not a production demonstration map.
 *
 * Production components, unchanged: the input consumer (`createInputConsumer`) with its map input and capabilities, the
 * browser keyboard source, the browser Pointer Lock port, the map cursor drawer on its browser canvas, the map
 * geometry's checks and conversions and `mapStartPosition`, `GameInputZone`, the formal Session on the browser session
 * host, and the game store, bridge and command feedback.
 *
 * Synthetic, test support only:
 * - **Run:** the formal Session runs a world of Core's code-generated test content. Core reports no map context yet, so
 *   the run handle the consumer wires shows the context this entry keeps instead of Core's: `flight` first, toggled by
 *   each `toggle-map` the run took or set by the test. Core still receives every `map-point`; its results are P3-09's.
 * - **Owner:** a stand-in for the mission owner's input context (owner 1, previous owners closed); its run port sends
 *   the session `clear-input` while running and pauses or resumes for `p`, and records `openMenu` only.
 * - **Bindings:** the TEST binding table of `game-input.test-support.ts`, not the production table (subtask 19).
 * - **Geometry:** a 320×240 logical screen whose main map spans (16, 8)–(256, 200), shown in the 4:3 frame
 *   `computeViewportLayout` fits into the input zone; the test may replace it with none or an inverted one.
 * - **Policy:** checkpoint K's start formula through `mapStartPosition`, and a repeat interval of 8 clock units.
 * - **Pointer Lock host:** the browser host, whose request the test may hold open (`pending`) until it grants or refuses
 *   it, refuse at once (`refuse`) or report unsupported (`unsupported`); `native` leaves it as it is.
 * - **Submission:** each command passes through to the real command feedback, unless the test asked that the next
 *   hovers fail, which then return null as a refused submission does.
 * - The system pointer over the input zone is hidden exactly while `status.map.systemPointerHidden` is true, as the
 *   assembly will do (subtask 25).
 *
 * Observation hooks are on `window.osrMapInput`; the test drives input with real browser mouse and key events.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { MissionInputContext, MissionRunInputControl } from '../../app/mission/mission-owner.ts';
import { createGameSession, type GameSession, type GameSessionRun } from '../../app/session/game-session.ts';
import { runSpec } from '../../app/session/game-session.test-support.ts';
import type { GameSessionError } from '../../app/session/session-errors.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { Projection } from '../../core/projections/projection.ts';
import { createBrowserSessionHost } from '../../platform/browser/browser-session-host.ts';
import { createBrowserPointerLockHost } from '../../platform/input/browser-pointer-lock.ts';
import { createBrowserKeyboardSource } from '../../platform/input/browser-keyboard-source.ts';
import { createPointerLock, type PointerLockHost } from '../../platform/input/pointer-lock.ts';
import { createBrowserMapCursor } from '../../render/map/browser-map-cursor.ts';
import type { MapCursorDrawer } from '../../render/map/map-cursor.ts';
import { mapStartPosition, type MapInputGeometry, type MapPosition } from '../../render/map/map-input-geometry.ts';
import { computeViewportLayout } from '../../render/viewport/viewport-layout.ts';
import { GameInputZone } from '../mission/GameInputZone.tsx';
import { createGameCommandFeedback } from '../game/game-command-feedback.ts';
import { createGameSessionBridge, type GameSessionBridge } from '../game/game-session-bridge.ts';
import { createGameStore } from '../game/game-store.ts';
import { TEST_BINDINGS } from './game-input.test-support.ts';
import type { InputContext } from './input-action.ts';
import { createInputConsumer, type GameInputConsumer } from './input-consumer.ts';
import type { MapInputPolicy } from './map-input.ts';

export type LockMode = 'native' | 'pending' | 'refuse' | 'unsupported';
export type GeometryMode = 'live' | 'null' | 'inverted';

/**
 * One command the input submitted, with the run's clock as it was submitted and the number of session frames
 * the input had been given by then; `id` is null when refused.
 */
export interface SubmittedCommand {
  readonly type: Command['type'];
  readonly operation: string | null;
  readonly right: number | null;
  readonly down: number | null;
  readonly clock: number;
  readonly frame: number;
  readonly id: number | null;
}

export interface MapInputEntryState {
  readonly open: boolean;
  readonly phase: string | null;
  readonly context: InputContext;
  readonly clock: number | null;
  /** The session frames the input was given. */
  readonly frames: number;
  readonly userActivation: boolean;
  readonly map: { readonly state: string; readonly systemPointerHidden: boolean; readonly error: string | null };
  readonly pointerLock: { readonly state: string; readonly failure: string | null };
  readonly cursor: MapPosition | null;
  /** The Pointer Lock host's request calls. */
  readonly requests: number;
  readonly commands: readonly SubmittedCommand[];
  readonly portCalls: readonly string[];
  readonly geometry: MapInputGeometry | null;
  readonly zoneCursor: string;
  readonly errors: readonly string[];
}

export interface MapInputEntry {
  open(options: { readonly lock: LockMode; readonly geometry?: GeometryMode; readonly movementScale?: number }): void;
  setContext(context: InputContext): void;
  setGeometry(mode: GeometryMode): void;
  control(type: 'pause' | 'resume'): void;
  /** Makes the next `count` hover submissions fail. */
  failHovers(count: number): void;
  /** Answers a held (`pending`) request: grants it through the browser, or refuses it. */
  settleLock(answer: 'grant' | 'refuse'): void;
  /** The explicit new request that the unlocked fallback waits for. */
  retryLock(): void;
  state(): MapInputEntryState;
  /** Refuses a held request, then releases the input, the session and the cursor; resolves to the failures as text. */
  close(): Promise<readonly string[]>;
}

declare global {
  interface Window { osrMapInput?: MapInputEntry }
}

const SCREEN = Object.freeze({ width: 320, height: 240 });
const MAIN_MAP = Object.freeze({ left: 16, top: 8, right: 256, bottom: 200 });
const INVERTED_MAP = Object.freeze({ left: 256, top: 8, right: 16, bottom: 200 });
const NO_FRAME = Object.freeze({ left: 0, top: 0, width: 0, height: 0 });
const POLICY: MapInputPolicy = Object.freeze({ start: ({ mainMap }: MapInputGeometry) => mapStartPosition(mainMap), repeatInterval: 8 });
const OWNER_ID = 1;

const text = (cause: unknown): string => (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));

function lockHost(zone: HTMLElement, mode: LockMode, counter: { requests: number; held: { grant(): void; refuse(): void } | null }): PointerLockHost {
  const host = createBrowserPointerLockHost(zone);
  return {
    ...host,
    supported: () => mode !== 'unsupported' && host.supported(),
    request() {
      counter.requests += 1;
      if (mode === 'refuse') return Promise.reject(new DOMException('Refused by the test entry', 'NotAllowedError'));
      if (mode !== 'pending') return host.request();
      return new Promise<void>((resolve, reject) => {
        counter.held = {
          grant: () => { Promise.resolve(host.request()).then(resolve, reject); },
          refuse: () => { reject(new DOMException('Refused by the test entry', 'NotAllowedError')); },
        };
      });
    },
  };
}

interface Opened {
  readonly session: GameSession;
  readonly bridge: GameSessionBridge;
  readonly consumer: GameInputConsumer<HTMLElement>;
  readonly release: () => unknown;
  readonly drawer: MapCursorDrawer;
  readonly lock: { requests: number; held: { grant(): void; refuse(): void } | null };
  readonly stopCursor: () => void;
}

function createEntry(zone: () => HTMLElement): MapInputEntry {
  let opened: Opened | null = null;
  let context: InputContext = 'flight';
  let geometryMode: GeometryMode = 'live';
  let hoverFailures = 0;
  let frames = 0;
  const commands: SubmittedCommand[] = [];
  const portCalls: string[] = [];
  const errors: string[] = [];

  const geometry = {
    read(): MapInputGeometry | null {
      if (geometryMode === 'null') return null;
      const element = zone();
      const layout = computeViewportLayout({
        width: element.clientWidth, height: element.clientHeight, devicePixelRatio: window.devicePixelRatio, maxDrawingBufferSize: 16_384,
      });
      return { screen: SCREEN, mainMap: geometryMode === 'inverted' ? INVERTED_MAP : MAIN_MAP, frame: layout?.frame ?? NO_FRAME };
    },
  };

  const shown = (projection: Projection): Projection =>
    Object.freeze({ ...projection, player: Object.freeze({ ...projection.player, interactionContext: context }) });

  function wrapped(run: GameSessionRun): GameSessionRun {
    return Object.freeze({
      ...run,
      setIntent: (intent) => { run.setIntent(intent); },
      submitCommand: (command) => run.submitCommand(command),
      on: run.on.bind(run),
      onAny: (listener) => run.onAny(listener),
      onFrame: (listener) => run.onFrame((frame) => {
        frames += 1;
        return listener(Object.freeze({ ...frame, projection: shown(frame.projection) }));
      }),
      onCommandsCancelled: (listener) => run.onCommandsCancelled(listener),
      ownCleanup: (cleanup) => run.ownCleanup(cleanup),
      projection: () => shown(run.projection()),
      renderFrame: () => run.renderFrame(),
      snapshot: () => run.snapshot(),
      exportRecording: () => run.exportRecording(),
    } satisfies GameSessionRun);
  }

  function inputContext(session: GameSession): MissionInputContext {
    const forRun = (runId: number): MissionRunInputControl => {
      const current = (): boolean => session.status().runId === runId;
      return {
        clearInput(reason) {
          portCalls.push(`clear-input ${reason}`);
          if (current() && session.status().phase === 'running') session.control({ type: 'clear-input', reason });
        },
        togglePause() {
          portCalls.push('toggle-pause');
          const { phase } = session.status();
          if (current() && (phase === 'running' || phase === 'paused')) session.control({ type: phase === 'running' ? 'pause' : 'resume' });
        },
        openMenu() { portCalls.push('open-menu'); },
      };
    };
    return { ownerId: OWNER_ID, session, previousClosed: Promise.resolve(true), control: { forRun } };
  }

  return {
    open({ lock, geometry: mode = 'live', movementScale = 1 }) {
      if (opened) throw new Error('The map input entry is already open');
      context = 'flight';
      geometryMode = mode;
      hoverFailures = 0;
      frames = 0;
      commands.length = 0;
      portCalls.length = 0;
      errors.length = 0;
      const element = zone();
      const store = createGameStore(OWNER_ID);
      const feedback = createGameCommandFeedback(store);
      const bridge = createGameSessionBridge({ store, clock: () => performance.now(), consumers: [feedback] });
      const session = createGameSession(createBrowserSessionHost(), (error: GameSessionError) => {
        errors.push(`session: ${text(error)}`);
        return bridge.onError(error);
      });
      const counter: Opened['lock'] = { requests: 0, held: null };
      let drawer: MapCursorDrawer | null = null;
      const consumer = createInputConsumer<HTMLElement>({
        keyboard: createBrowserKeyboardSource,
        bindings: TEST_BINDINGS,
        pointerLock: () => createPointerLock(lockHost(element, lock, counter)),
        feedback: () => ({
          submit(command: Command) {
            const refused = command.type === 'map-point' && command.operation === 'hover' && hoverFailures > 0;
            if (refused) hoverFailures -= 1;
            const id = refused ? null : feedback.submit(command);
            const point = command.type === 'map-point' ? command : null;
            const run = session.currentRun()?.projection();
            commands.push(Object.freeze({
              type: command.type, operation: point?.operation ?? null, right: point?.right ?? null, down: point?.down ?? null,
              clock: run?.clock.clock ?? -1, frame: frames, id,
            }));
            if (command.type === 'toggle-map' && id !== null) context = context === 'map' ? 'flight' : 'map';
            return id;
          },
        }),
        map: {
          policy: POLICY,
          geometry,
          cursor: () => drawer,
          movementScale: () => movementScale,
          userActivation: () => navigator.userActivation.isActive,
        },
      });
      consumer.bindZone(element);
      drawer = createBrowserMapCursor(element, geometry, consumer.mapCursor);
      const stopCursor = consumer.status.subscribe(({ map }) => { element.style.cursor = map.systemPointerHidden ? 'none' : ''; });
      bridge.bind(session);
      const connection = consumer.connect(inputContext(session));
      session.control({ type: 'start', spec: runSpec() });
      const run = session.currentRun();
      if (!run) throw new Error('The session did not start a run');
      connection.attachRun?.(wrapped(run), { ownerId: OWNER_ID, runId: run.runId });
      opened = { session, bridge, consumer, release: () => connection.release(), drawer, lock: counter, stopCursor };
    },
    setContext(next) {
      context = next;
    },
    setGeometry(mode) {
      geometryMode = mode;
    },
    control(type) {
      opened?.session.control({ type });
    },
    failHovers(count) {
      hoverFailures = count;
    },
    settleLock(answer) {
      const held = opened?.lock.held;
      if (!held) throw new Error('No Pointer Lock request is held');
      opened!.lock.held = null;
      held[answer]();
    },
    retryLock() {
      opened?.consumer.capabilities.requestPointerLock();
    },
    state() {
      const status = opened?.consumer.status.getState();
      const run = opened?.session.currentRun();
      const lockStatus = status?.capabilities.pointerLock;
      return {
        open: opened !== null,
        phase: opened?.session.status().phase ?? null,
        context,
        clock: run?.projection().clock.clock ?? null,
        frames,
        userActivation: navigator.userActivation.isActive,
        map: {
          state: status?.map.state ?? 'off', systemPointerHidden: status?.map.systemPointerHidden ?? false,
          error: status?.map.error ? text(status.map.error) : null,
        },
        pointerLock: { state: lockStatus?.state ?? 'unsupported', failure: lockStatus?.failure?.reason ?? null },
        cursor: opened?.consumer.mapCursor.read() ?? null,
        requests: opened?.lock.requests ?? 0,
        commands: [...commands],
        portCalls: [...portCalls],
        geometry: geometry.read(),
        zoneCursor: getComputedStyle(zone()).cursor,
        errors: [...errors],
      };
    },
    async close() {
      const current = opened;
      if (!current) return [];
      opened = null;
      // A held request never settles by itself, and the release waits for it: the prompt is dismissed, as on leaving.
      current.lock.held?.refuse();
      current.lock.held = null;
      const failures: string[] = [];
      const attempt = async (action: () => unknown): Promise<void> => {
        try {
          await action();
        } catch (cause) {
          failures.push(text(cause));
        }
      };
      await attempt(current.release);
      await attempt(() => { current.session.control({ type: 'dispose' }); });
      await attempt(() => { current.bridge.unbind(); });
      await attempt(() => { current.stopCursor(); });
      await attempt(() => { current.drawer.dispose(); });
      zone().style.cursor = '';
      return failures;
    },
  };
}

let zoneElement: HTMLElement | null = null;
const zoneRef = (element: HTMLElement | null): void => { zoneElement = element; };

window.osrMapInput = createEntry(() => {
  if (!zoneElement) throw new Error('The input zone is not mounted');
  return zoneElement;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameInputZone zoneRef={zoneRef}>{null}</GameInputZone>
  </StrictMode>,
);
