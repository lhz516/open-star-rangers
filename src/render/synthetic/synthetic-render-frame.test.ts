import { describe, expect, it } from 'vitest';
import { createSyntheticRuntime, type RenderFrame } from '../../app/runtime/synthetic-runtime.ts';
import { SYNTHETIC_MOVER_ID, type SyntheticRenderEntity, type SyntheticRenderState } from '../../core/synthetic/synthetic-scene.ts';
import { SyntheticFrameHistory, SyntheticRenderFrameError } from './synthetic-render-frame.ts';

const MOVER: SyntheticRenderEntity = { id: SYNTHETIC_MOVER_ID, kind: 'mover', position: { x: 0, y: 0, z: 0 } };
const MARKER: SyntheticRenderEntity = { id: SYNTHETIC_MOVER_ID + 1, kind: 'marker', position: { x: 1, y: 2, z: 3 } };

function state(tick: number, ...entities: SyntheticRenderEntity[]): SyntheticRenderState {
  return { tick, entities };
}
function frame(previous: SyntheticRenderState, current: SyntheticRenderState, alpha = 0): RenderFrame {
  return { previous, current, alpha };
}
/** An array of `length` with only its last index set, so earlier indices are holes. */
function sparse(entity: SyntheticRenderEntity, length: number): SyntheticRenderEntity[] {
  const entities = new Array<SyntheticRenderEntity>(length);
  entities[length - 1] = entity;
  return entities;
}
function accepted(history: SyntheticFrameHistory, value: RenderFrame) {
  const plan = history.plan(value);
  plan.commit();
  return plan;
}

describe('SyntheticFrameHistory with a real Runtime', () => {
  it('interpolates positions present in both states by the frame alpha and keeps new entities at current', () => {
    // 50 Hz makes a 20 ms tick, so 5 ms steps give exactly representable alphas.
    const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    const history = new SyntheticFrameHistory();
    runtime.setInput({ moveX: 1 });
    runtime.frame(0);
    runtime.frame(40);
    for (const [now, alpha] of [[40, 0], [45, 0.25], [50, 0.5], [55, 0.75]] as const) {
      runtime.frame(now);
      const value = runtime.renderFrame();
      expect(value.alpha).toBe(alpha);
      const plan = accepted(history, value);
      const [mover] = plan.entities;
      const [before] = value.previous.entities;
      const [after] = value.current.entities;
      expect(Math.abs(mover.position.x - (before.position.x + (after.position.x - before.position.x) * value.alpha))).toBeLessThanOrEqual(1e-12);
      expect(after.position.x - before.position.x).toBeCloseTo(0.02, 12);
      expect([mover.position.y, mover.position.z]).toEqual([after.position.y, after.position.z]);
    }
    runtime.submitCommand({ type: 'add-marker' });
    runtime.frame(65);
    const added = runtime.renderFrame();
    expect(added.alpha).toBe(0.25);
    const plan = accepted(history, added);
    const marker = added.current.entities.find(entity => entity.kind === 'marker')!;
    expect(added.previous.entities.some(entity => entity.id === marker.id)).toBe(false);
    expect(plan.entities.map(entity => [entity.id, entity.kind])).toEqual(added.current.entities.map(entity => [entity.id, entity.kind]));
    expect(plan.entities.find(entity => entity.id === marker.id)!.position).toEqual(marker.position);
    runtime.foldRenderState();
    const paused = runtime.renderFrame();
    expect(accepted(history, paused).entities.map(entity => entity.position)).toEqual(paused.current.entities.map(entity => entity.position));
  });

  it('shows a removed entity no longer, while a zero-tick frame may still carry it in previous', () => {
    const history = new SyntheticFrameHistory();
    accepted(history, frame(state(0, MOVER, MARKER), state(1, MOVER, MARKER)));
    const removal = frame(state(1, MOVER, MARKER), state(2, MOVER), 0.5);
    expect(accepted(history, removal).entities.map(entity => entity.id)).toEqual([1]);
    expect(accepted(history, { ...removal, alpha: 0.75 }).entities.map(entity => entity.id)).toEqual([1]);
  });
});

describe('SyntheticFrameHistory contract violations', () => {
  const base = (): SyntheticFrameHistory => {
    const history = new SyntheticFrameHistory();
    accepted(history, frame(state(4, MOVER, MARKER), state(5, MOVER)));
    return history;
  };
  const cases: readonly (readonly [string, RenderFrame])[] = [
    ['alpha below zero', frame(state(5, MOVER), state(6, MOVER), -0.1)],
    ['alpha of one', frame(state(5, MOVER), state(6, MOVER), 1)],
    ['non-finite alpha', frame(state(5, MOVER), state(6, MOVER), Number.NaN)],
    ['fractional tick', frame(state(5, MOVER), state(5.5, MOVER))],
    ['negative tick', frame(state(-1, MOVER), state(0, MOVER))],
    ['tick gap above one', frame(state(5, MOVER), state(7, MOVER))],
    ['current before previous', frame(state(6, MOVER), state(5, MOVER))],
    ['tick going back', frame(state(3, MOVER), state(4, MOVER))],
    ['zero ID', frame(state(5, MOVER), state(6, { ...MOVER, id: 0 }))],
    ['unsafe ID', frame(state(5, MOVER), state(6, { ...MOVER, id: 2 ** 53 }))],
    ['descending IDs', frame(state(5, MOVER), state(6, { ...MARKER, id: 3 }, MOVER))],
    ['duplicate IDs', frame(state(5, MOVER), state(6, MOVER, MOVER))],
    ['unknown kind', frame(state(5, MOVER), state(6, { ...MOVER, kind: 'ship' as never }))],
    ['non-finite coordinate', frame(state(5, MOVER), state(6, { ...MOVER, position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 } }))],
    ['missing coordinate', frame(state(5, MOVER), state(6, { ...MOVER, position: { x: 0, y: 0 } as never }))],
    ['entities not an array', frame(state(5, MOVER), { tick: 6, entities: null } as never)],
    ['kind differs between states', frame(state(5, MOVER), state(6, { ...MOVER, kind: 'marker' }))],
    ['kind changes within the run', frame(state(5, { ...MOVER, kind: 'marker' }), state(5, { ...MOVER, kind: 'marker' }))],
    ['removed ID reused', frame(state(5, MOVER), state(6, MOVER, MARKER))],
    ['removed ID reused in previous only', frame(state(5, MOVER, MARKER), state(6, MOVER))],
    ['removed ID reused with another kind', frame(state(5, MOVER), state(6, MOVER, { ...MARKER, kind: 'mover' }))],
    ['sparse current entities', frame(state(5, MOVER), { tick: 6, entities: sparse(MOVER, 2) } as never)],
    ['sparse previous entities', frame({ tick: 5, entities: sparse(MOVER, 2) } as never, state(6, MOVER))],
  ];
  for (const [name, value] of cases) {
    it(`rejects ${name} before changing anything`, () => {
      const history = base();
      expect(() => history.plan(value)).toThrow(SyntheticRenderFrameError);
      // The history is unchanged: the same valid next frame still passes, with the same result as a fresh copy.
      const next = frame(state(5, MOVER), state(6, MOVER), 0.5);
      const shown = ({ tick, entities }: { tick: number; entities: unknown }) => ({ tick, entities });
      expect(shown(history.plan(next))).toEqual(shown(base().plan(next)));
    });
  }

  it('interpolates finite extremes without overflow', () => {
    const plan = new SyntheticFrameHistory().plan(frame(
      state(0, { ...MOVER, position: { x: -Number.MAX_VALUE, y: 0, z: 0 } }),
      state(1, { ...MOVER, position: { x: Number.MAX_VALUE, y: 0, z: 0 } }), 0.25,
    ));
    expect(plan.entities[0].position.x).toBe(-Number.MAX_VALUE * 0.75 + Number.MAX_VALUE * 0.25);
  });

  it('accepts catch-up frames and repeats of the removal frame, but not the removed ID afterwards', () => {
    const history = new SyntheticFrameHistory();
    accepted(history, frame(state(9, MOVER, MARKER), state(10, MOVER, MARKER)));
    // A multi-tick frame: the marker vanished and a new one appeared between notifications.
    const catchUp = frame(state(13, MOVER, { ...MARKER, id: 3 }), state(14, MOVER, { ...MARKER, id: 3 }), 0.2);
    expect(accepted(history, catchUp).entities.map(entity => entity.id)).toEqual([1, 3]);
    const removal = frame(state(14, MOVER, { ...MARKER, id: 3 }), state(15, MOVER), 0.4);
    accepted(history, removal);
    expect(accepted(history, { ...removal, alpha: 0.9 }).entities.map(entity => entity.id)).toEqual([1]);
    expect(() => history.plan(frame(state(15, MOVER, { ...MARKER, id: 3 }), state(16, MOVER)))).toThrow(SyntheticRenderFrameError);
    expect(() => history.plan(frame(state(15, MOVER), state(16, MOVER, MARKER)))).toThrow(SyntheticRenderFrameError);
  });

  it('starts each run with an empty history', () => {
    expect(() => base().plan(frame(state(0, MOVER), state(1, MOVER)))).toThrow(SyntheticRenderFrameError);
    expect(new SyntheticFrameHistory().plan(frame(state(0, MOVER, MARKER), state(1, MOVER, MARKER))).entities).toHaveLength(2);
  });

  it('commits a plan only while no newer plan was committed', () => {
    const history = new SyntheticFrameHistory();
    const stale = history.plan(frame(state(0, MOVER), state(1, MOVER)));
    accepted(history, frame(state(1, MOVER), state(2, MOVER)));
    expect(() => stale.commit()).toThrow('newer render frame plan');
    expect(() => history.plan(frame(state(0, MOVER), state(1, MOVER)))).toThrow(SyntheticRenderFrameError);
  });

  it('returns frozen plans with copied positions', () => {
    const plan = new SyntheticFrameHistory().plan(frame(state(0, MOVER), state(0, MOVER)));
    expect(Object.isFrozen(plan) && Object.isFrozen(plan.entities) && Object.isFrozen(plan.entities[0].position)).toBe(true);
    expect(plan.entities[0].position).not.toBe(MOVER.position);
  });
});
