import { describe, expect, it } from 'vitest';
import { syntheticInstrumentAssets } from '../../content/hud/instruments.test-support.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { PointerInput } from '../../platform/input/pointer-lock.ts';
import { moment } from '../../ui/game-input/game-input.test-support.ts';
import type { InputMoment } from '../../ui/game-input/input-state.ts';
import type { CapabilityState, MapInputStatus } from '../../ui/game-input/input-status.ts';
import { MapInput } from '../../ui/game-input/map-input.ts';
import type { MapPictureDrawn, MapPictureModule } from '../cockpit/map-picture/map-picture.ts';
import { mapPictureGeometry } from '../cockpit/map-picture/map-picture-geometry.ts';
import { createTestMapPicture, mapPatch } from '../cockpit/map-picture/map-picture.test-support.ts';
import type { CockpitPresentation } from '../cockpit/presentation/cockpit-contract.ts';
import {
  cockpitBatch, cockpitTick, createTestPresentation, FLIGHT_VIEW, MAP_VIEW, viewSwitched,
} from '../cockpit/presentation/cockpit.test-support.ts';
import { zoneMapGeometry, type MapInputGeometry } from './map-input-geometry.ts';
import { createMapPresentationPort, type MapPresentationPort } from './map-presentation-port.ts';

// P3-13 subtask 23: the production map input's readiness from the submitted picture's credential (P3-13 spec
// 地图输入几何与指针 “就绪”, DC-09 “ready 凭证”; P3-05's P3-13 sync “绘制 ready”), and the right button's level reaching
// the map picture's DC-09 toggle. Synthetic content and geometry only.

const LOGICAL = mapPictureGeometry(syntheticInstrumentAssets().mapGeometry);
const ZONE = { left: 0, top: 0, width: 800, height: 600 };
const SHOWN = { left: 0, top: 0, width: 800, height: 600 };
const GEOMETRY = zoneMapGeometry(LOGICAL, ZONE, SHOWN)!;

const DRAWN: MapPictureDrawn = Object.freeze({
  opening: 1, serial: 1, tick: 1, geometry: LOGICAL, pointer: { column: 0, row: 0 }, pointerSource: 'confirmed',
});

function portOf(geometry: { current: MapInputGeometry | null } = { current: GEOMETRY }) {
  const revocations: number[] = [];
  const port = createMapPresentationPort({ geometry: { read: () => geometry.current }, revoked: () => { revocations.push(1); } });
  return { port, geometry, revocations };
}

describe('map presentation port', () => {
  it('grants nothing before a submitted picture and then only for the geometry the input reads', () => {
    const { port, geometry } = portOf();
    expect({ draw: port.cursor.draw(), ready: port.cursor.ready }).toEqual({ draw: false, ready: false });
    port.submitted(DRAWN);
    // Ready only follows a draw: the input reads it after its own draw call.
    expect(port.cursor.ready).toBe(false);
    expect({ draw: port.cursor.draw(), ready: port.cursor.ready }).toEqual({ draw: true, ready: true });
    // A resize keeps the picture: the same screen and main map under another frame.
    geometry.current = zoneMapGeometry(LOGICAL, ZONE, { ...SHOWN, width: 400, height: 300 });
    expect(port.cursor.draw()).toBe(true);
    // A picture of another main map, no layout, or an invalid geometry grants nothing, and the port does not throw.
    geometry.current = { ...GEOMETRY, mainMap: { ...GEOMETRY.mainMap, right: GEOMETRY.mainMap.right - 1 } };
    expect({ draw: port.cursor.draw(), ready: port.cursor.ready }).toEqual({ draw: false, ready: false });
    geometry.current = null;
    expect(port.cursor.draw()).toBe(false);
    geometry.current = zoneMapGeometry(LOGICAL, ZONE, { ...SHOWN, width: 0, height: 0 });
    expect(port.cursor.draw()).toBe(false);
    geometry.current = { ...GEOMETRY, frame: { ...GEOMETRY.frame, left: Number.NaN } };
    expect(port.cursor.draw()).toBe(false);
    geometry.current = GEOMETRY;
    expect(port.cursor.draw()).toBe(true);
    // A frame submitted without a map picture ends the credential.
    port.submitted(null);
    expect({ draw: port.cursor.draw(), ready: port.cursor.ready }).toEqual({ draw: false, ready: false });
  });

  it('revokes at once, telling the input only when a credential ended, and the next submission grants again', () => {
    const { port, revocations } = portOf();
    port.revoke();
    expect(revocations).toEqual([]);
    port.submitted(DRAWN);
    port.cursor.draw();
    port.revoke();
    expect({ ready: port.cursor.ready, revocations }).toEqual({ ready: false, revocations: [1] });
    expect(port.cursor.draw()).toBe(false);
    port.submitted({ ...DRAWN, serial: 2 });
    expect(port.cursor.draw()).toBe(true);
  });

  it('ignores late submissions after dispose', () => {
    const { port, revocations } = portOf();
    port.submitted(DRAWN);
    port.cursor.draw();
    port.dispose();
    expect(port.cursor.ready).toBe(false);
    port.submitted(DRAWN);
    port.revoke();
    expect({ draw: port.cursor.draw(), revocations }).toEqual({ draw: false, revocations: [] });
  });
});

/**
 * A run's map as the composition wires it: per frame the map input first (as the input consumer's frame listener),
 * then the cockpit presentation advances one tick with the input's right-button level, and the frame is submitted
 * with the picture's credential. The map is open from tick `opensAt`.
 */
function wired({ lock = 'idle' as CapabilityState, activation = true, opensAt = 1 } = {}) {
  const state = { lock, activation, status: null as MapInputStatus | null, tick: 0, running: true, eligible: true };
  const log: string[] = [];
  let port: MapPresentationPort | null = null;
  const now = (): InputMoment => moment({
    context: state.tick >= opensAt ? 'map' : 'flight', clock: 2 * state.tick, running: state.running, eligible: state.eligible,
  });
  const input = new MapInput({
    policy: { start: () => ({ right: 0.5, down: 0.5 }), repeatInterval: 8 },
    geometry: { read: () => GEOMETRY },
    cursor: () => port?.cursor ?? null,
    movementScale: () => 1,
    userActivation: () => state.activation,
  }, {
    submit: (command: Command) => {
      log.push(command.type);
      return true;
    },
    lock: {
      requestPointerLock: () => {
        log.push('request');
        if (state.lock === 'idle') state.lock = 'pending';
      },
      exitPointerLock: () => {
        log.push('exit');
        state.lock = 'idle';
      },
    },
    lockState: () => state.lock,
    setStatus: (status) => { state.status = status; },
    reportError: (cause) => { throw cause; },
  });
  port = createMapPresentationPort({ geometry: { read: () => GEOMETRY }, revoked: () => { input.sync(now()); } });
  const picture: MapPictureModule = createTestMapPicture();
  const presentation: CockpitPresentation = createTestPresentation({ modules: [picture], viewMode: FLIGHT_VIEW });
  const levels: boolean[] = [];
  return {
    state, log, input, port, picture, levels,
    /** One frame of one tick; `submit: false` stands for a frame whose submission failed. */
    frame({ submit = true } = {}) {
      state.tick += 1;
      input.frame(now());
      const map = state.tick >= opensAt;
      const before = state.tick - 1 >= opensAt;
      const button = input.rightButton.read();
      levels.push(button);
      presentation.advance(cockpitBatch([cockpitTick(state.tick, {
        viewMode: map ? MAP_VIEW : FLIGHT_VIEW,
        mapRightButton: button,
        patch: map ? mapPatch() : undefined,
        events: map === before ? [] : [viewSwitched(state.tick, before ? MAP_VIEW : FLIGHT_VIEW, map ? MAP_VIEW : FLIGHT_VIEW)],
      })]));
      if (submit) port!.submitted(picture.drawn());
    },
    pointer(event: PointerInput) { input.pointer(event, now()); },
    /** The host confirms the requested lock. */
    confirm() {
      state.lock = 'active';
      input.refresh();
    },
    /** Opens the map and locks it once the picture of the opening was submitted. */
    locked() {
      this.frame();
      this.frame();
      this.confirm();
      log.splice(0);
    },
    mapState: () => state.status?.state,
  };
}

const relative = (type: 'down' | 'up', button: number): PointerInput =>
  ({ type, button, sample: { mode: 'relative', unit: 'host-reported', movementX: 0, movementY: 0 } });

describe('map input readiness from the submitted picture', () => {
  it('draws the first picture without waiting for input, which qualifies at the frame after its submission', () => {
    const w = wired({ lock: 'idle', activation: true, opensAt: 2 });
    w.frame();
    w.frame();
    // The opening's picture is drawn and submitted while the input is not ready yet: no deadlock.
    expect({ state: w.mapState(), drawn: w.picture.drawn()?.opening, log: w.log }).toEqual({ state: 'not-ready', drawn: 1, log: [] });
    w.frame();
    expect({ state: w.mapState(), log: w.log }).toEqual({ state: 'locking', log: ['request'] });
  });

  it('withholds readiness after a failed submission, a lost device or layout, and grants it again from the next picture without relocking or selecting', () => {
    const w = wired();
    w.frame({ submit: false });
    w.frame({ submit: false });
    expect(w.mapState()).toBe('not-ready');
    w.frame();
    w.frame();
    w.confirm();
    expect({ state: w.mapState(), log: w.log.splice(0) }).toEqual({ state: 'locked', log: ['request'] });
    w.state.activation = false;
    w.pointer(relative('down', 2));
    expect(w.input.rightButton.read()).toBe(true);
    // The device is lost: the credential ends at once, the input drops its button and exits its lock.
    w.port.revoke();
    expect({ state: w.mapState(), hidden: w.state.status?.systemPointerHidden, right: w.input.rightButton.read(), log: w.log })
      .toEqual({ state: 'not-ready', hidden: false, right: false, log: ['exit'] });
    // While it stays lost nothing is submitted; after the restore the picture is drawn first.
    w.frame({ submit: false });
    expect(w.mapState()).toBe('not-ready');
    w.frame();
    expect(w.mapState()).toBe('not-ready');
    w.frame();
    // Without a user activation it only shows click-to-lock: no request, hover or select of its own.
    expect({ state: w.mapState(), log: w.log }).toEqual({ state: 'click-to-lock', log: ['exit'] });
  });
});

describe('right button level into the map picture (DC-09)', () => {
  const toggles = (w: ReturnType<typeof wired>, frames: number): number[] => {
    const seen: number[] = [];
    let on = w.picture.labels().labelsOn;
    for (let frame = 0; frame < frames; frame++) {
      w.frame();
      if (w.picture.labels().labelsOn !== on) seen.push(w.state.tick);
      on = w.picture.labels().labelsOn;
    }
    return seen;
  };

  it('toggles a held button every 16 ticks from the first read, and a release stops it', () => {
    const w = wired();
    w.locked();
    expect(w.mapState()).toBe('locked');
    w.pointer(relative('down', 2));
    // Reads every fourth tick from the opening (ticks 2, 6, 10, …): the first after the press is tick 6.
    expect(toggles(w, 36)).toEqual([6, 22, 38]);
    w.pointer(relative('up', 2));
    expect(toggles(w, 40)).toEqual([]);
  });

  it('sees nothing of a press released before the next read, nor of a press held into a pause', () => {
    const w = wired();
    w.locked();
    w.pointer(relative('down', 2));
    w.pointer(relative('up', 2));
    expect(toggles(w, 8)).toEqual([]);
    w.pointer(relative('down', 2));
    w.state.running = false;
    w.input.sync(moment({ context: 'map', clock: 2 * w.state.tick, running: false }));
    w.state.running = true;
    w.frame();
    w.confirm();
    expect({ state: w.mapState(), right: w.input.rightButton.read() }).toEqual({ state: 'locked', right: false });
    expect(toggles(w, 20)).toEqual([]);
    expect(w.levels.every((level) => !level)).toBe(true);
  });
});
