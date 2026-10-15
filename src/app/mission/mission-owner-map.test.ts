import { describe, expect, it } from 'vitest';
import type { KeyboardSignal, KeyboardSink, KeyboardSource, KeyboardZoneBinding } from '../../platform/input/keyboard-input.ts';
import {
  createPointerLock, type PointerEventType, type PointerHostEvent, type PointerLockHost, type PointerLockState,
} from '../../platform/input/pointer-lock.ts';
import type { MapInputGeometryPort } from '../../render/map/map-input-geometry.ts';
import { createGameCommandFeedback, type GameCommandFeedback } from '../../ui/game/game-command-feedback.ts';
import { createGameSessionBridge } from '../../ui/game/game-session-bridge.ts';
import { createGameStore, type GameStoreWriter } from '../../ui/game/game-store.ts';
import { GAME_INPUT_BINDINGS } from '../../ui/game-input/bindings.ts';
import { down, up } from '../../ui/game-input/game-input.test-support.ts';
import { createInputConsumer } from '../../ui/game-input/input-consumer.ts';
import { MAP_INPUT_POLICY } from '../../ui/game-input/map-input-policy.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { MissionOwnerConsumer } from './mission-owner.ts';
import { openMission, toFlight } from './mission.test-support.ts';

// P3-09 subtask 21 (Node): the app's input and UI wiring on a real mission owner, Session and Core while the production
// map geometry port is still null (P3-13 owns it; use-mission-owner.ts). Core opens and closes the map, the bridge
// publishes it at once, and the map input stays `not-ready` (P3-05: 战略地图输入): no Pointer Lock, the system pointer
// shown and no mouse commands, while `m` and an Esc outside Pointer Lock leave the map.

class Keyboard implements KeyboardSource, KeyboardZoneBinding<string> {
  sink: KeyboardSink | null = null;
  readonly bind = (): void => undefined;

  connect(sink: KeyboardSink): () => void {
    this.sink = sink;
    sink.signal({ type: 'initial', eligible: false });
    return () => { this.sink = null; };
  }

  signal(type: KeyboardSignal['type'], eligible: boolean): void {
    this.sink!.signal(Object.freeze({ type, eligible }));
  }

  tap(code: string): void {
    this.sink!.key(down(code), true);
    this.sink!.key(up(code), true);
  }
}

/** A document whose pointer is never locked; it counts lock requests and hands pointer events to the port. */
class Pointer implements PointerLockHost {
  requests = 0;
  readonly pointers = new Map<PointerEventType, (event: PointerHostEvent) => void>();
  supported = (): boolean => true;
  readLock = (): PointerLockState => 'none';
  readRect = () => ({ left: 0, top: 0, width: 640, height: 480 });
  request(): undefined {
    this.requests += 1;
    return undefined;
  }
  exit(): void {}
  listenLock(): () => void {
    return () => undefined;
  }
  listenPointer(type: PointerEventType, listener: (event: PointerHostEvent) => void): () => void {
    this.pointers.set(type, listener);
    return () => { this.pointers.delete(type); };
  }
  send(type: PointerEventType): void {
    this.pointers.get(type)?.({ button: 0, movementX: 30, movementY: 20, clientX: 200, clientY: 200 });
  }
}

/** The production input consumer and `ui` consumer as use-mission-owner.ts assembles them, on a null map geometry. */
async function assembled() {
  const keyboard = new Keyboard();
  const pointer = new Pointer();
  let ui: { readonly store: GameStoreWriter; readonly feedback: GameCommandFeedback } | null = null;
  const geometry: MapInputGeometryPort = Object.freeze({ read: () => null });
  const input = createInputConsumer<string>({
    keyboard: () => keyboard,
    bindings: GAME_INPUT_BINDINGS,
    feedback: () => ui?.feedback ?? null,
    pointerLock: () => createPointerLock(pointer),
    map: { policy: MAP_INPUT_POLICY, geometry, cursor: () => null, movementScale: () => 1, userActivation: () => true },
  });
  const uiConsumer: MissionOwnerConsumer = {
    stage: 'ui',
    connect({ ownerId, session }) {
      const store = createGameStore(ownerId);
      const feedback = createGameCommandFeedback(store);
      const bridge = createGameSessionBridge({ store, clock: () => 0, consumers: [feedback] });
      bridge.bind(session);
      ui = { store, feedback };
      return { release: () => { bridge.unbind(); }, onSessionError: bridge.onError };
    },
  };
  const mission = await openMission('mission-startable', { consumers: [input, uiConsumer] });
  toFlight(mission.owner);
  let now = 0;
  mission.host.deliver(now);
  keyboard.signal('focusin', true);
  const frame = () => { now += TICK_MS; mission.host.deliver(now); };
  frame();
  frame();
  const commands: string[] = [];
  mission.run()!.on('command-result', (event) => { commands.push(`${event.commandType} ${event.outcome}`); return undefined; });
  const published = () => ui!.store.reader.getState().projection!;
  return {
    ...mission, keyboard, pointer, frame, commands,
    mapInput: () => input.status.getState().map,
    /** The map state the store last published, which the bridge's sampling clock never makes due (it stays 0). */
    mapShown: () => {
      const { map, player } = published();
      return [player.interactionContext, map.readiness === 'ready' ? map.player?.state : map.readiness];
    },
  };
}

describe('mission owner: the strategic map with no production geometry', () => {
  it('opens and closes Core\'s map with m and an unlocked Esc, without locking, hiding the pointer or sending mouse commands', async () => {
    const f = await assembled();
    expect(f.mapShown()).toEqual(['flight', 'closed']);
    f.keyboard.tap('KeyM');
    f.frame();
    expect(f.mapShown()).toEqual(['map', 'open']);
    expect(f.mapInput()).toEqual({ state: 'not-ready', systemPointerHidden: false, error: null });
    for (const type of ['mousemove', 'mousedown', 'mouseup', 'mousedown'] as const) {
      f.pointer.send(type);
      f.frame();
    }
    f.pointer.send('mouseup');
    expect(f.pointer.requests).toBe(0);
    expect(f.mapInput()).toMatchObject({ state: 'not-ready', systemPointerHidden: false });

    f.keyboard.tap('KeyM');
    f.frame();
    expect(f.mapShown()).toEqual(['flight', 'closed']);
    expect(f.mapInput().state).toBe('off');
    f.keyboard.tap('KeyM');
    f.frame();
    expect(f.mapShown()).toEqual(['map', 'open']);
    f.keyboard.tap('Escape');
    f.frame();
    expect(f.mapShown()).toEqual(['flight', 'closed']);
    expect(f.commands).toEqual(['toggle-map accepted', 'toggle-map accepted', 'toggle-map accepted', 'toggle-map accepted']);
    expect(f.pointer.requests).toBe(0);
  });
});
