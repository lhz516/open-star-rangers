import { expect, type Page } from '@playwright/test';
import { syntheticNebula } from '../../src/original-data/conversion/production-flight-graphics.test-support.ts';
import { button } from './app-entry.ts';
import { bandStatic, inF1Cockpit, startableCockpit, viewportCockpit, wrongPixels, type CockpitFixture } from './cockpit.ts';
import {
  F1_BOTTOM, identityBackground, isBlack, logicalImage, mismatches, nextFrames, PRODUCTION_DATA, rect, type LogicalImage, type Mismatch, type Rgb,
} from './flight-pictures.ts';
import { endPlaceholder, enterMission, waitForFrame } from './mission-observations.ts';

// The flight picture of the formal mission flow (P3-12/25) with the synthetic production package
// (`mission-startable` in development, `missionPackage()` in production): its reads, its development diagnostics and
// the independent expectation of its F1 background, which the player's identity rows at the start make predictable.

/** From the main menu: the mission's introduction and start page skipped, the run started and its departure skipped. */
export async function flyMission(page: Page): Promise<{ readonly owner: number | null }> {
  const { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  return { owner };
}

/** Pauses the running flight with its button and waits for the paused status. */
export async function pauseFlight(page: Page): Promise<void> {
  await button(page, 'Pause').click();
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  await waitForFrame(page, frame => frame.position === 'flight');
}

/** The flight renderer's development diagnostics after a refresh. */
export interface FlightDiagnosticsRead {
  readonly state: string;
  readonly run: string;
  readonly draws: number;
  readonly lastTick: number | null;
  readonly gpu: string;
  readonly resources: string;
  readonly buffer: string;
}

/** Refreshes and reads the panel's flight render section (development builds). */
export async function flightDiagnostics(page: Page): Promise<FlightDiagnosticsRead> {
  await page.getByTestId('dev-flight-refresh').click();
  const text = (name: string) => page.getByTestId(`dev-flight-${name}`).innerText();
  const lastTick = await text('last-tick');
  return {
    state: await text('state'), run: await text('run'), draws: Number(await text('draws')), lastTick: lastTick === 'none' ? null : Number(lastTick),
    gpu: await text('gpu'), resources: await text('resources'), buffer: await text('buffer'),
  };
}

export interface FlightRead {
  readonly image: LogicalImage;
  /** The synthetic package's cockpit content, whose drawing the picture shows over the 3D viewport and in the band. */
  readonly cockpit: CockpitFixture;
}

/** The flight picture as composited, with the cockpit content of the synthetic mission package. */
export async function flightPicture(page: Page): Promise<FlightRead> {
  await nextFrames(page);
  const image = await logicalImage(page, page.getByTestId('flight-area'));
  return { image, cockpit: await startableCockpit() };
}

/** The synthetic package's nebula images (`syntheticNebula`), by NEBC position. */
const NEBULAE = Array.from({ length: 15 }, (_, index) => syntheticNebula(index).indices);

export interface F1Check {
  /** The NEBC position of the image shown in slot 0, the run's start. */
  readonly start: number;
  /** Pixels other than the background's, all explained as speed dust. */
  readonly dust: number;
  readonly dustColours: readonly string[];
  /** The next best start's mismatch count. */
  readonly runnerUp: number;
}

/**
 * Expects the F1 picture of the identity rows (the player's at the start of the synthetic mission) in the 3D viewport
 * (rows 0–315): black, the nebula of one start of the package's list in slot 0 and the 57 stars, in the production DATA
 * colours, under the cockpit's pixels there (its element and instrument rectangles and the overlay's colours,
 * cockpit.ts `inF1Cockpit`); the only other pixels are speed dust: at most its 50 particles, in DATA 2–7, in columns
 * 1–638 and rows 1–314 (SD5). The cockpit band (rows 316–479) is the cockpit regression's (cockpit.*.spec.ts).
 */
export function expectF1Background({ image, cockpit }: FlightRead): F1Check {
  const covered = inF1Cockpit(cockpit);
  const viewport = [...rect(0, 0, 639, F1_BOTTOM)];
  const world = ({ x, y, actual }: Mismatch) => !covered(x, y, actual);
  const fits = NEBULAE.map((indices, start) => ({ start, wrong: mismatches(image, identityBackground(PRODUCTION_DATA, indices, F1_BOTTOM), viewport).filter(world) }))
    .sort((a, b) => a.wrong.length - b.wrong.length);
  const [best, runnerUp] = fits;
  const dustColours = new Set(PRODUCTION_DATA.slice(2, 8).map(rgb => rgb.join()));
  const unexplained = best.wrong.filter(({ x, y, actual }) => !(x >= 1 && x <= 638 && y >= 1 && y <= 314 && dustColours.has(actual.join())));
  expect(unexplained.slice(0, 10), `${unexplained.length} pixels are neither background nor dust`).toEqual([]);
  expect(best.wrong.length).toBeLessThanOrEqual(50);
  expect(runnerUp.wrong.length).toBeGreaterThan(1000);
  return { start: best.start, dust: best.wrong.length, dustColours: [...new Set(best.wrong.map(({ actual }) => actual.join()))], runnerUp: runnerUp.wrong.length };
}

/** Whether a colour is the Warp effect's: (0, e, 0) or (e, e, e) for e a 6-bit level expanded (WT8); no production DATA colour is. */
export function isTunnelColour([r, g, b]: Rgb): boolean {
  const expanded = (value: number) => value > 0 && ((value >> 2) << 2 | (value >> 6)) === value;
  return (r === 0 && b === 0 && expanded(g)) || (r === g && g === b && expanded(r));
}

/**
 * Counts of a picture's pixels in the 3D viewport outside the cockpit's rectangles there, by kind, and `band`, the
 * static band pixels (cockpit.ts `bandStatic`) not in index 0: 0 outside a flash, which recolours the whole picture.
 */
export function classifyWarp({ image, cockpit }: FlightRead) {
  const rects = viewportCockpit(cockpit);
  const counts = { tunnel: 0, palette: 0, black: 0, other: 0, band: wrongPixels(image, bandStatic(cockpit), cockpit.data[0]).length };
  const palette = new Set(PRODUCTION_DATA.slice(1, 8).map(rgb => rgb.join()));
  const dust = new Set<string>();
  for (let y = 0; y <= F1_BOTTOM; y++) {
    for (let x = 0; x < 640; x++) {
      const rgb = image.at(x, y);
      if (rects.some(({ x0, y0, x1, y1 }) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
      if (isBlack(rgb)) counts.black += 1;
      else if (isTunnelColour(rgb)) counts.tunnel += 1;
      else if (palette.has(rgb.join())) {
        counts.palette += 1;
        dust.add(`${x},${y}`);
      } else counts.other += 1;
    }
  }
  const joined = [...dust].filter(key => {
    const [x, y] = key.split(',').map(Number);
    return [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => (dx || dy) && dust.has(`${x + dx},${y + dy}`)));
  }).length;
  return { ...counts, joined };
}
