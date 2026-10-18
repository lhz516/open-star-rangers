import type { FrameReport } from '../../../app/runtime/game-runtime.ts';
import type { GameSessionFrame } from '../../../app/session/game-session.ts';
import type { SessionCleanup } from '../../../app/session/session-host.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import { readSceneSettings } from '../../../content/flight/flight-data-readers.ts';
import { syntheticSceneSettings } from '../../../content/flight/flight-data.test-support.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { attemptAll } from '../../scene/cleanup.ts';
import { DATA, grey } from '../lighting/lighting.test-support.ts';
import { objectContent } from '../objects/objects.test-support.ts';
import type { PresentationTickInput } from '../presentation/presentation-contract.ts';
import { presentationContent, renderState } from '../presentation/presentation.test-support.ts';
import { thresholdsImage } from '../shimmer/shimmer.test-support.ts';
import type { FlightRunHandle } from './flight-run.ts';
import { prepareFlightContent, type FlightRunContent, type PreparedFlightContent } from './flight-passes.ts';

// Code-generated synthetic content and run handles for the flight run and pass integration tests; never original data.

export const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });

/**
 * Scene settings every pass draws with: a directional light of 0.5 and ambient 0.125, device quality 3, device values
 * ordered as the shipped data's and flashes of levels 0–63 with non-zero durations.
 */
export const RUN_SETTINGS: SceneSettings = readSceneSettings({
  ...syntheticSceneSettings(), lightType3Colour: grey(0.5), lightType0Colour: grey(0.125), deviceByte: 3,
  deviceValues: { base: 600, kinds1c7c: 1200, kindsF8000: 4000 },
  screenFlashes: [
    { randomMask: 6, duration: 0.5, drawIntervalTicks: 1, level: 63 },
    { randomMask: 0, duration: 0.25, drawIntervalTicks: 2, level: 20 },
    { randomMask: 4, duration: 1, drawIntervalTicks: 1, level: 40 },
  ],
});

/** A `width` × `height` image of DATA indices `seed + pixel`, shown directly; opaque unless `masked`. */
function dataImage(width: number, height: number, seed: number, masked = false): ImagePayload {
  return Object.freeze({
    kind: 'image', width, height, palette: DATA, display: 'direct',
    indices: Uint8Array.from({ length: width * height }, (_, pixel) => (seed + pixel) & 0xff),
    mask: masked ? new Uint8Array(height * ((width + 7) >> 3)).fill(0xff) : null,
  });
}

/** The synthetic presentation content with every image it names, on the object tests' models and the shimmer thresholds. */
export function flightRunContent(): FlightRunContent {
  const presentation = presentationContent();
  const passes = objectContent();
  const images = new Map(passes.images);
  for (const { frames } of presentation.animations.values()) frames.forEach(({ id }, at) => images.set(id, dataImage(3, 2, 10 * at, true)));
  presentation.nebula.images.forEach(({ id }, at) => images.set(id, dataImage(128, 128, 40 * at)));
  return { presentation, settings: RUN_SETTINGS, passes: { ...passes, images, thresholds: thresholdsImage() } };
}

export const preparedContent = (): PreparedFlightContent => prepareFlightContent(flightRunContent());

/** A run handle the test drives: its cleanups run newest first at `end`, and `deliver` notifies its frame listeners. */
export function fakeRun(runId = 1, initial: RenderState = renderState(0)) {
  const cleanups: SessionCleanup[] = [];
  const listeners = new Set<(frame: GameSessionFrame) => undefined>();
  const log: string[] = [];
  const state = { refuse: undefined as unknown, previous: initial, current: initial };
  const run: FlightRunHandle = {
    runId,
    renderFrame: () => ({ previous: state.current, current: state.current, alpha: 0 }),
    onFrame: (listener) => {
      listeners.add(listener);
      return () => { log.push('frames'); listeners.delete(listener); return undefined; };
    },
    ownCleanup: (cleanup) => {
      if (state.refuse !== undefined) throw state.refuse;
      cleanups.push(cleanup);
      return cleanup;
    },
  };
  /** A frame of `outputs`, null for a still frame, drawn at `alpha` between the last two Render States. */
  const deliver = (outputs: readonly PresentationTickInput[] | null, alpha = 0) => {
    const last = outputs?.at(-1)?.render;
    if (last) {
      state.previous = outputs!.length > 1 ? outputs!.at(-2)!.render : state.current;
      state.current = last;
    }
    const report = outputs && ({ outputs } as unknown as FrameReport);
    const render = { previous: last ? state.previous : state.current, current: state.current, alpha: last ? alpha : 0 };
    const frame = { runId, phase: 'running', render, projection: null, report } as unknown as GameSessionFrame;
    for (const listener of [...listeners]) listener(frame);
  };
  const end = () => attemptAll([...cleanups].reverse());
  return { run, state, log, deliver, end, listeners };
}
