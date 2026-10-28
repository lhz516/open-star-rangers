import { describe, expect, it } from 'vitest';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { scriptedRand } from '../../../core/rules/rand.test-support.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { WARP_EDGE_DRAWS, WARP_SLOT_COUNT } from './warp-tunnel-image.ts';
import { WarpTunnel } from './warp-tunnel.ts';
import { flightState, warpState } from './warp.test-support.ts';

/** Picks 0–39 (rand % 50 of 50 + slot), then a pass's edge draws: rand % 10 < 5 for 4, 5, 32764 and 32767. */
const PICKS = Array.from({ length: WARP_SLOT_COUNT }, (_, slot) => 50 + slot);
const passDraws = (pattern: readonly number[] = [4, 5, 32764, 32767]) => Array.from({ length: WARP_EDGE_DRAWS }, (_, index) => pattern[index % pattern.length]);
const EXPECTED_EDGES = Array.from({ length: WARP_EDGE_DRAWS }, (_, index) => index % 4 === 0 || index % 4 === 2);

const rotated = (by: number) => Array.from({ length: WARP_SLOT_COUNT }, (_, slot) => (slot + by) % WARP_SLOT_COUNT);

const snapshot = (state: RenderState): string => JSON.stringify(state);

describe('Warp tunnel pass (AC-15)', () => {
  it('draws nothing and takes no draw outside a Warp', () => {
    const random = scriptedRand([]);
    const tunnel = new WarpTunnel(random);
    expect(tunnel.pass).toBeNull();
    tunnel.step(flightState(1));
    tunnel.step({ ...warpState(2, 1), viewMode: 0x0c });
    expect(tunnel.pass).toBeNull();
    expect(random.used).toBe(0);
  });

  it('starts a Warp with 40 template picks, then makes the tick\'s pass with 60 ring-edge draws', () => {
    const random = scriptedRand([...PICKS, ...passDraws()]);
    const tunnel = new WarpTunnel(random);
    tunnel.step(flightState(1));
    tunnel.step(warpState(2, 7));
    expect(random.used).toBe(40 + 60);
    expect(tunnel.pass).toEqual({ tick: 2, serial: 7, templates: rotated(0), edges: EXPECTED_EDGES });
    expect(Object.isFrozen(tunnel.pass)).toBe(true);
  });

  it('advances the template cursor and draws 60 more once per tick, wrapping after 40', () => {
    const draws = [...PICKS];
    for (let tick = 0; tick < 42; tick++) draws.push(...passDraws());
    const random = scriptedRand(draws);
    const tunnel = new WarpTunnel(random);
    for (let tick = 1; tick <= 42; tick++) {
      tunnel.step(warpState(tick, 1));
      expect(random.used).toBe(40 + 60 * tick);
      expect(tunnel.pass?.templates).toEqual(rotated((tick - 1) % WARP_SLOT_COUNT));
    }
  });

  it('resets the picks and the cursor when the serial changes', () => {
    const second = Array.from({ length: WARP_SLOT_COUNT }, (_, slot) => 100 + 2 * slot);
    const random = scriptedRand([...PICKS, ...passDraws(), ...passDraws(), ...second, ...passDraws()]);
    const tunnel = new WarpTunnel(random);
    tunnel.step(warpState(1, 1));
    tunnel.step(warpState(2, 1));
    expect(tunnel.pass?.templates).toEqual(rotated(1));
    tunnel.step(warpState(3, 2));
    expect(random.used).toBe(40 + 60 + 60 + 40 + 60);
    expect(tunnel.pass).toMatchObject({ tick: 3, serial: 2, templates: second.map((value) => value % 50) });
  });

  it('stops at once when warp becomes null, and starts afresh at the next Warp', () => {
    const random = scriptedRand([...PICKS, ...passDraws(), ...PICKS, ...passDraws()]);
    const tunnel = new WarpTunnel(random);
    tunnel.step(warpState(1, 1));
    tunnel.step(flightState(2));
    expect(tunnel.pass).toBeNull();
    expect(random.used).toBe(100);
    tunnel.step(flightState(3));
    expect(random.used).toBe(100);
    tunnel.step(warpState(4, 2));
    expect(random.used).toBe(200);
    expect(tunnel.pass?.templates).toEqual(rotated(0));
  });

  it('advances only on a later tick, so a frame without a tick draws nothing new', () => {
    const random = scriptedRand([...PICKS, ...passDraws()]);
    const tunnel = new WarpTunnel(random);
    tunnel.step(warpState(5, 1));
    expect(() => tunnel.step(warpState(5, 1))).toThrow(FlightRenderError);
    expect(() => tunnel.step(warpState(4, 1))).toThrow(FlightRenderError);
    expect(random.used).toBe(100);
    expect(tunnel.pass?.tick).toBe(5);
  });

  it('reads the Render State without changing it', () => {
    const state = warpState(1, 3);
    const before = snapshot(state);
    new WarpTunnel(scriptedRand([...PICKS, ...passDraws()])).step(state);
    expect(snapshot(state)).toBe(before);
  });
});
