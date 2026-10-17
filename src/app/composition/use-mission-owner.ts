/**
 * Holds the mission owner of the mission screen through the app's mission slot (docs/plan/p3/04/spec.md: 应用流程,
 * 消费者接线与释放, UI 桥接与命令反馈, 开发诊断). The effect opens the slot with the held package and the mission ports;
 * the slot creates the owner only when it may, and only then does this hook create what the owner is given:
 * - a session host from the ports;
 * - a `ui` consumer that, as the owner connects it, creates the owner's UI store, session bridge and command feedback,
 *   binds the bridge to the owner's session and unbinds it on release;
 * - a `media` consumer for the flight picture (P3-12): the owner's one WebGL 2 surface, created in a container element of
 *   its own that the mounted flight area holds (`bindFlightArea`), so remounting the area keeps the canvas and context;
 * - in development builds only, the frame timing that wraps that host, the diagnostics and the recording options. Their
 *   modules load through a dynamic import behind the compile-time `import.meta.env.DEV`, so production builds contain
 *   none of them.
 * Once open, the owner's flow is written into the store on every snapshot. The effect closes the slot on unmount, a
 * StrictMode re-run or a Fast Refresh, so the old owner is released before the next exists and the new one begins at
 * G-02/1; leaving the screen releases the slot first, so this cleanup then finds it closed.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MissionDiagnostics } from '../../ui/dev/mission-diagnostics.ts';
import { createGameCommandFeedback, type GameCommandFeedback } from '../../ui/game/game-command-feedback.ts';
import { createGameSessionBridge } from '../../ui/game/game-session-bridge.ts';
import { createGameStore, type GameStoreWriter } from '../../ui/game/game-store.ts';
import { GAME_INPUT_BINDINGS, KEYBOARD_LOCK_CODES } from '../../ui/game-input/bindings.ts';
import { createInputConsumer, type GameInputConsumer } from '../../ui/game-input/input-consumer.ts';
import { MAP_INPUT_POLICY } from '../../ui/game-input/map-input-policy.ts';
import { createBrowserMapCursor } from '../../render/map/browser-map-cursor.ts';
import type { MapCursorDrawer } from '../../render/map/map-cursor.ts';
import type { MapInputGeometryPort } from '../../render/map/map-input-geometry.ts';
import { FLIGHT_SURFACE, type FlightRenderer } from '../../render/flight/renderer/flight-renderer.ts';
import { appProducer } from '../app-version.ts';
import type { MissionSlot } from './mission-slot.ts';
import type { MissionFlowState } from '../mission/mission-flow.ts';
import { createFlightConsumer, type FlightConsumer } from '../mission/flight-consumer.ts';
import {
  developmentRecording, type MissionOwner, type MissionOwnerConsumer, type MissionOwnerSetup,
} from '../mission/mission-owner.ts';
import type { AppPorts } from '../ports.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';

/** What the mission screen shows of one owner. */
export interface MissionScreenParts {
  readonly owner: MissionOwner;
  readonly store: GameStoreWriter<MissionFlowState>;
  readonly feedback: GameCommandFeedback;
  readonly input: GameInputConsumer<HTMLElement>;
  /** Supplies the mounted game's input zone to the keyboard and Pointer Lock ports. */
  readonly bindInputZone: (zone: HTMLElement | null) => void;
  readonly flight: MissionFlightParts;
  /** Development builds only. */
  readonly diagnostics: MissionDiagnostics | null;
}

/** The owner's flight picture. */
export interface MissionFlightParts {
  readonly renderer: FlightRenderer;
  /** Places the flight canvas's container in the mounted flight area, or takes it out for null. */
  readonly bindFlightArea: (area: HTMLElement | null) => void;
}

export interface MissionOwnerHandle {
  /** Null before the effect runs, between owners, and when none could be opened. */
  readonly mission: MissionScreenParts | null;
  /** Why none could be opened: what the slot threw, or the latched cleanup failure that stopped it. */
  readonly openFailure: { readonly cause: unknown } | null;
}

const NONE: MissionOwnerHandle = Object.freeze({ mission: null, openFailure: null });

/** The development measurement and diagnostics, loaded before this module finishes evaluating; null in production. */
const development = import.meta.env.DEV
  ? await Promise.all([import('../mission/dev-frame-timing.ts'), import('../../ui/dev/mission-diagnostics.ts')])
    .then(([{ createFrameTiming }, { createMissionDiagnostics }]) => ({ createFrameTiming, createMissionDiagnostics }))
  : null;

/** One owner's assembly: the setup the slot asks for, and what the owner's consumers created once it exists. */
interface Assembly {
  setup(): MissionOwnerSetup;
  parts(owner: MissionOwner): MissionScreenParts;
}

function assemble({ mission: ports, createSurface, reportError }: AppPorts, holder: ResourceHolder): Assembly {
  let ui: Pick<MissionScreenParts, 'store' | 'feedback'> | null = null;
  let diagnostics: MissionDiagnostics | null = null;
  let mapCursor: MapCursorDrawer | null = null;
  let flight: { readonly consumer: FlightConsumer; readonly container: HTMLElement } | null = null;
  const inputZone: { current: HTMLElement | null } = { current: null };
  const mapGeometry: MapInputGeometryPort = Object.freeze({ read: () => null });
  const input = createInputConsumer<HTMLElement>({
    keyboard: ports.createKeyboardSource,
    bindings: GAME_INPUT_BINDINGS,
    feedback: () => ui?.feedback ?? null,
    fullscreen: ports.createFullscreen,
    pointerLock: () => ports.createPointerLock(() => inputZone.current),
    keyLockCodes: KEYBOARD_LOCK_CODES,
    map: {
      policy: MAP_INPUT_POLICY,
      geometry: mapGeometry,
      cursor: () => mapCursor,
      movementScale: () => 1,
      userActivation: () => navigator.userActivation?.isActive ?? false,
    },
  });
  const bindInputZone = (zone: HTMLElement | null): void => {
    inputZone.current = zone;
    input.bindZone(zone);
    mapCursor?.dispose();
    mapCursor = zone ? createBrowserMapCursor(zone, mapGeometry, input.mapCursor) : null;
  };
  const uiConsumer: MissionOwnerConsumer = {
    stage: 'ui',
    connect({ ownerId, session }) {
      const store = createGameStore<MissionFlowState>(ownerId);
      const feedback = createGameCommandFeedback(store);
      const bridge = createGameSessionBridge({ store, clock: ports.clock, consumers: [feedback] });
      bridge.bind(session);
      ui = { store, feedback };
      return { release: () => { bridge.unbind(); }, onSessionError: bridge.onError };
    },
  };
  return {
    setup() {
      const host = ports.createSessionHost();
      const base = { holder, seed: ports.seed, clock: ports.clock, timer: ports.timer, leaveGuard: ports.leaveGuard, reportError };
      const container = document.createElement('div');
      container.className = 'flight-canvas';
      const consumer = createFlightConsumer({ holder, createSurface: () => createSurface(container, FLIGHT_SURFACE), seed: ports.presentationSeed, reportError });
      flight = { consumer, container };
      if (development && ports.createFileSave) {
        const timing = development.createFrameTiming(host, ports.clock);
        diagnostics = development.createMissionDiagnostics({ timing, fileSave: ports.createFileSave });
        return {
          ...base,
          host: timing.host,
          recording: developmentRecording(appProducer(import.meta.env.MODE)),
          consumers: [input, uiConsumer, timing.consumer, diagnostics.consumer, consumer],
        };
      }
      return { ...base, host, recording: null, consumers: [input, uiConsumer, consumer] };
    },
    parts(owner) {
      const renderer = flight?.consumer.renderer();
      if (!ui || !flight || !renderer) throw new Error('The mission owner did not connect its UI and flight consumers');
      const { container } = flight;
      const bindFlightArea = (area: HTMLElement | null): void => {
        if (area) area.append(container);
        else container.remove();
      };
      return Object.freeze({ owner, ...ui, input, bindInputZone, diagnostics, flight: Object.freeze({ renderer, bindFlightArea }) });
    },
  };
}

export function useMissionOwner(slot: MissionSlot, ports: AppPorts, holder: ResourceHolder): MissionOwnerHandle {
  const [handle, setHandle] = useState<MissionOwnerHandle>(NONE);
  /**
   * Memoized, so a Fast Refresh of this hook, which rebuilds it, re-runs the effect below and replaces the owner with the
   * edited code, as `useViewerOwner` does with its options.
   */
  const assembleFor = useCallback((held: ResourceHolder) => assemble(ports, held), [ports]);
  useEffect(() => {
    let stopFlow = (): void => undefined;
    try {
      const assembly = assembleFor(holder);
      const owner = slot.open(assembly.setup);
      if (owner) {
        const parts = assembly.parts(owner);
        const writeFlow = (): void => { parts.store.commit({ flow: owner.getSnapshot().flow }); };
        writeFlow();
        stopFlow = owner.subscribe(writeFlow);
        setHandle(Object.freeze({ mission: parts, openFailure: null }));
      } else {
        setHandle(Object.freeze({ mission: null, openFailure: slot.cleanupFailure() }));
      }
    } catch (error) {
      // The slot has already latched a failed rollback; every creation failure is also reported.
      setHandle(Object.freeze({ mission: null, openFailure: Object.freeze({ cause: error }) }));
      ports.reportError(error);
    }
    return () => {
      stopFlow();
      setHandle(NONE);
      slot.release();
    };
  }, [assembleFor, holder, ports, slot]);
  return handle;
}
