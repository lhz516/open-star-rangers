import type { Page } from '@playwright/test';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import { messageLabel, messageSummary, SLICE_GAPS } from '../src/ui/mission/slice-gaps-copy.ts';
import { scenarioEntryProfile } from '../src/workers/import-scenarios.test-support.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { seedTestEntryPackage } from './support/ai-wingman.ts';
import { button, openTestEntry } from './support/app-entry.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import {
  after, bandStatic, calmPicture, CLEAN, clockAt, cockpitChecks, cockpitState, collisionPackage, COLOUR, diagCadence, diagExplanations,
  diagSchedules, distanceX, energyPageWrong, entityNames, findText, flashFits, formatText, frameElementPixels, imageMismatches,
  incomingPageWrong, instrument, interferenceFrames, menuPageWrong, messageLineWrong, messageOffset, pageBackground, pageFrameWrong, pause,
  pauseWhen, pixelsOf, radarRings, radarSpans, rectPoints, resume, reticle, shot, showsText, startableCockpit, targetDisplayRead,
  textPixels, twoBasesPackage, upperTexts, visibleLength, withData, wrongPixels, type CockpitState, type DiagSample, type MessageMode,
} from './support/cockpit.ts';
import { F1_BOTTOM, pagePixels, same, type LogicalImage } from './support/flight-pictures.ts';
import { FLIGHT_VIEW, readLog, submitEditorCommand, WARP_VIEW } from './support/map-warp.ts';
import { endingPackage } from './support/mission-result.ts';
import { chooseWingman, endPlaceholder, enterMission, missionEntry, waitForFrame } from './support/mission-observations.ts';
import { missionPackage } from './support/production-cache.ts';

// P3-13/27 (docs/plan/p3/13/spec.md, 验证策略; AC-08 to AC-15, AC-19, AC-20): the Classic cockpit in the formal mission
// flow of a development build. Each case seeds its isolated cache with a converted synthetic package under the test
// entry's profile and restores it through the main menu: the startable mission, P3-10's docking mission, P3-11's
// failure variant (the player destroyed at once) or the collision variant (support/cockpit.ts), whose run seeds were
// chosen in a Node world for the display damage they give. The run goes through the real composition and is driven
// only by trusted keys in the game input zone and, for the Warp destination, the diagnostics panel's command editor.
// Pictures are the composited page's logical pixels; every expectation is written out from the original's drawing
// rules (support/cockpit.ts) and checked against the run's own projection, mission clock and event log, and each
// check is also run once against a wrong expectation, which it must reject. The network audit runs throughout.

test.describe.configure({ timeout: 240_000 });

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** Run seeds; the collision variant's damage needs 23 (field 11 at 2) and then 79 (field 14 at 2), see support/cockpit.ts. */
const SEEDS = Object.freeze({ startable: [0x0eed_2701], docking: [0x0eed_2702], failure: [0x0eed_2703], collisions: [23, 79] });

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');

/** Seeds `groups` under the test entry's profile of `worker`, restores it and flies the mission with `wingman`. */
async function seededFlight(page: Page, worker: string, groups: Promise<readonly HeldGroup[]>, seeds: readonly number[], wingman: number | null): Promise<void> {
  await openTestEntry(page, { worker, seeds: seeds.join(',') });
  await seedTestEntryPackage(page, await groups);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await departWith(page, wingman);
}

/** From the start page, with `wingman`, through the departure into running flight with the input zone focused. */
async function departWith(page: Page, wingman: number | null): Promise<void> {
  await chooseWingman(page, wingman);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
}

/** The ticks of the logged events of `type`. */
async function loggedTicks(page: Page, type: string): Promise<number[]> {
  return (await page.evaluate(readLog, [type])).map(({ tick }) => tick);
}

/** The synthetic disc's file-name marker and the docking disc's source fingerprint must not leave the browser. */
function watchCanaries(audit: Audit): void {
  audit.canaries({ name: 'file-name', value: MARKER }, { name: 'source-fingerprint', value: scenarioEntryProfile('mission-docking')!.sourceFingerprint });
}

test('F1: frame, band, rings, lamp, overlay and right display; page 0 types its DIAG line on the mission clock; page 1 by e; the speed-assist message scrolls from its first display', async ({ page }, testInfo) => {
  const fixture = await startableCockpit();
  await seededFlight(page, 'mission-startable', missionPackage(), SEEDS.startable, null);

  // Page 0, sampled at paused ticks in F1 over more than one cycle of the four upper messages (DIAG timing: interval 2
  // and hold 31 units, so a character every tick and a release 16 ticks after the last one).
  const rect6 = instrument(fixture, 6);
  const samples: DiagSample[] = [];
  const states: CockpitState[] = [];
  const pictures: LogicalImage[] = [];
  await waitForFrame(page, frame => (frame.tick ?? 0) >= 30);
  for (const gap of [3, 5, 7, 4, 9, 6, 8, 5, 7, 6, 4, 9, 5, 8, 3, 6, 7, 4, 9, 5]) {
    await pause(page);
    const { image, state } = await shot(page);
    expect(state).toMatchObject({ viewMode: FLIGHT_VIEW, combat: { leftPage: 0 } });
    states.push(state);
    pictures.push(image);
    await resume(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= state.tick + gap);
  }
  // The upper line's colour is the code's; read it at the first message character, an `S` in every synthetic format.
  const upper = pictures[0].at(...textPixels(fixture.small, 'S', rect6.x0 + 4, rect6.y0 + 5)[0]);
  expect(same(upper, fixture.data[0])).toBe(false);
  const texts = upperTexts(fixture, states);
  const all = [0, 1, 2, 3].flatMap(texts);
  states.forEach((state, index) => samples.push({ tick: state.tick, states: diagExplanations(pictures[index], fixture, all, upper) }));
  expect(samples.filter(({ states: found }) => found.length === 0).map(({ tick }) => tick), 'every sample shows a typed state').toEqual([]);
  const typing = samples.filter(({ states: found }) => found.some(({ text, typed }) => typed < visibleLength(text)));
  expect(typing.length, 'samples while a message is being typed').toBeGreaterThanOrEqual(3);
  const cadence = diagCadence(fixture.status.upper);
  const fits = diagSchedules(samples, texts, cadence);
  // The schedule starts with the first format at the first logical display of the run, tick 1 (tick 0 draws no step).
  expect(fits, `the schedule on the mission clock from tick 1 explains every sample: ${JSON.stringify(samples)}`).toContainEqual({ first: 0, generated: 1 });
  // Wrong cadences: a character every second tick, or the hold read as ticks.
  expect(diagSchedules(samples, texts, { ...cadence, typeTicks: 2 })).toEqual([]);
  expect(diagSchedules(samples, texts, { ...cadence, holdTicks: fixture.status.upper.holdTicks })).toEqual([]);

  // The rest of the cockpit on one of those pictures, and the same checks against a wrong palette.
  const [picture] = pictures;
  const [state] = states;
  expect(cockpitChecks(picture, fixture, state)).toEqual(CLEAN);
  const wrongPalette = cockpitChecks(picture, withData(fixture, fixture.map), state);
  for (const [check, wrong] of Object.entries(wrongPalette)) expect(wrong.length, `${check} rejects the map palette`).toBeGreaterThan(0);
  // A drawn element is visible over the world; the panel element (every frame, pass 0) is never copied into the band.
  expect(frameElementPixels(fixture).length).toBeGreaterThan(0);
  expect(fixture.front.elements.some(({ y }) => y > F1_BOTTOM)).toBe(true);
  // The radar shows contacts in F1 (marks other than index 0 and the rings within its disc spans).
  expect(state.combat!.contacts).toBeGreaterThan(0);
  const ringOrClear = new Set([fixture.data[0], fixture.data[COLOUR.rings]].map(rgb => rgb.join()));
  expect(radarSpans(fixture).filter(([px, py]) => !ringOrClear.has(picture.at(px, py).join())).length).toBeGreaterThan(0);
  // The F1 overlay's reticle (§4.6): one colour, 0xC or 10 by the aim flag's phase.
  const reticleColours = new Set(reticle().map(([px, py]) => picture.at(px, py).join()));
  expect([...reticleColours]).toHaveLength(1);
  expect([0x0c, 0x0a].map(entry => fixture.data[entry].join())).toContain([...reticleColours][0]);

  // The right display with the run's target (§4.5): background, colour-8 text and at most the synthetic model's pixel
  // or two (its list-0 part is a one-unit triangle); the shield percentage and the distance as last refreshed.
  const rect7 = instrument(fixture, 7);
  const target = state.combat!.target!;
  expect(target).not.toBeNull();
  const display = targetDisplayRead(picture, fixture);
  expect(display.wrong).toEqual([]);
  expect(display.model).toBeLessThanOrEqual(2);
  expect(targetDisplayRead(picture, fixture, 1).wrong.length, 'a background shifted by one texel column is rejected').toBeGreaterThan(0);
  const percent = formatText(fixture.hudText.targetCraftPercent, (100 * target.shield!.current) / target.shield!.maximum);
  const percentX = rect7.x0 + 3 + 8 * (3 - percent.length + 1);
  expect(showsText(picture, fixture.regular, percent, percentX, rect7.y1 - 8, fixture.data[COLOUR.targetText])).toBe(true);
  const distances = Array.from({ length: 201 }, (_, index) => Math.round(target.distance) - 100 + index)
    .filter(value => showsText(picture, fixture.regular, formatText(fixture.hudText.targetDistance, value), distanceX(fixture, value), rect7.y0 + 2, fixture.data[COLOUR.targetText]));
  expect(distances, 'the distance readout of a recent refresh').toHaveLength(1);

  // Page 1 by `e` (the run is running again): drawn at once, the view of its last draw being none yet, with the
  // allocation's level records.
  await page.keyboard.press('e');
  const energy = await pauseWhen(page, current => current.combat?.leftPage === 1, 'e opens page 1');
  const { shieldLevel, chargeLevel } = energy.state.combat!.allocation;
  expect(energyPageWrong(energy.image, fixture, [shieldLevel, chargeLevel])).toEqual([]);
  if (shieldLevel !== chargeLevel) expect(energyPageWrong(energy.image, fixture, [chargeLevel, shieldLevel]).length).toBeGreaterThan(0);
  expect(energyPageWrong(energy.image, withData(fixture, fixture.map), [shieldLevel, chargeLevel]).length).toBeGreaterThan(0);

  // Back on page 0 by `d`. The target's name on the right display (§4.5): at (x0 + 3, y1 − 17), as the diagnostics
  // panel names the entity.
  await resume(page);
  await page.keyboard.press('d');
  const name = await entityNames(page, missionPackage());
  const named = await pauseWhen(page, current => current.combat?.leftPage === 0, 'd returns to page 0');
  const targetName = name(named.state.combat!.target!.entityId);
  expect(targetName.length).toBeGreaterThan(0);
  expect(showsText(named.image, fixture.regular, targetName.slice(0, 16), rect7.x0 + 3, rect7.y1 - 17, fixture.data[COLOUR.targetText])).toBe(true);

  // The speed-assist message (Ctrl+Enter; §4.7: colour 0xF, mode 2): it scrolls from the draw of the toggle's tick.
  await resume(page);
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => loggedTicks(page, 'speed-assist-toggled')).toHaveLength(1);
  const [toggled] = await loggedTicks(page, 'speed-assist-toggled');
  const line = instrument(fixture, 8);
  const lineWidth = line.x1 - line.x0 - 1;
  const text = fixture.flightMessages.speedAssistOn;
  const scroll: { tick: number; offset: number }[] = [];
  const expectLine = (image: LogicalImage, current: CockpitState, mode: MessageMode, message: string, colour: number, start: number) => {
    const offset = messageOffset(mode, current.clock - clockAt(current, start), lineWidth);
    expect(messageLineWrong(image, fixture, line, message, offset, colour)).toEqual([]);
    // The neighbouring first displays are other pictures.
    for (const other of [start - 1, start + 1]) {
      const shifted = messageOffset(mode, current.clock - clockAt(current, other), lineWidth);
      expect(messageLineWrong(image, fixture, line, message, shifted, colour).length, `first display at tick ${other}`).toBeGreaterThan(0);
    }
    return offset;
  };
  for (const ticks of [8, 25]) {
    const { image, state: current } = await pauseWhen(page, now => now.tick >= toggled + ticks, `speed assist + ${ticks}`);
    scroll.push({ tick: current.tick, offset: expectLine(image, current, 2, text, COLOUR.speedAssist, toggled) });
    await resume(page);
  }
  expect(scroll[1].offset).toBeLessThan(scroll[0].offset);
  // It leaves once its width is past the left end: then none of its glyphs shows anywhere on the text row.
  const gone = Math.ceil(((lineWidth + text.length * 8) * 64) / 120 / 2) + 2;
  const { image: cleared } = await pauseWhen(page, now => now.tick >= toggled + gone, 'the message has left');
  const y = Math.trunc((line.y0 + line.y1 - 8) / 2);
  const left = [...new Set(text)].flatMap(character => Array.from({ length: line.x1 - line.x0 - 8 }, (_, dx) => line.x0 + dx)
    .filter(x => showsText(cleared, fixture.regular, character, x, y, fixture.data[COLOUR.speedAssist])));
  expect(left).toEqual([]);
  const summary = { ticks: samples.map(({ tick }) => tick), typing: typing.length, scroll, distances, toggled };
  await testInfo.attach('cockpit-f1', { body: JSON.stringify({ ...summary, fits }), contentType: 'application/json' });
  console.info(`Cockpit F1: ${JSON.stringify(summary)}`);
});

/** The centre of main-map pixel column 230, row 127 (of 400 × 400), clear of the synthetic mission's icons (P3-09). */
const DESTINATION = Object.freeze({ operation: 'select', right: String(230.5 / 400), down: String(127.5 / 400) });

test('Warp: the same frame and band, page 6, rings without contacts and no F1 overlay; F1 and page 0 after it', async ({ page }, testInfo) => {
  const fixture = await startableCockpit();
  await seededFlight(page, 'mission-startable', missionPackage(), SEEDS.startable, null);
  // The player enters the world in the run's first ticks; commands before that find no player.
  await waitForFrame(page, frame => (frame.tick ?? 0) >= 20);
  await page.keyboard.press('m');
  await expect.poll(async () => (await cockpitState(page)).viewMode).toBe(0x08);
  expect(await submitEditorCommand(page, 'map-point', DESTINATION)).toMatchObject({ outcome: 'accepted' });
  await zone(page).click();
  await page.keyboard.press('w');
  await expect.poll(async () => (await cockpitState(page)).viewMode).toBe(WARP_VIEW);
  await expect.poll(() => loggedTicks(page, 'warp-started')).toHaveLength(1);
  const [started] = await loggedTicks(page, 'warp-started');
  const rect = instrument(fixture, 6);
  // After the start's flash (the band back in index 0): a Warp picture.
  const { image, state } = await calmPicture(page, fixture, started + 60, WARP_VIEW);
  expect(state.combat!.leftPage).toBe(6);
  expect(cockpitChecks(image, fixture, state)).toEqual(CLEAN);
  // Page 6 (§4.4 `0x4dcec`): BITM and row y0; the title in fonts/0 at (x1 − 66, y0 + 2) and the base line y0 + 52
  // from x0 + 2 to x1 − 2, each in one colour other than index 0; the bars' labels at their tops + 1 (a at y1 − 40, s at
  // y1 − 26, p at y1 − 12); and index 0 between the trace's ticks (down to y0 + 54, as on `srangers_066`) and the bars,
  // as the Warp publishes every pixel of the rectangle the handler does not write (cockpit.md, view 1).
  const title = textPixels(fixture.regular, fixture.hudText.leftWarpTitle, rect.x1 - 66, rect.y0 + 2);
  expect(pageFrameWrong(image, fixture, title)).toEqual([]);
  const titleColour = image.at(...title[0]);
  expect(same(titleColour, fixture.data[0])).toBe(false);
  expect(wrongPixels(image, title, titleColour)).toEqual([]);
  expect(wrongPixels(image, textPixels(fixture.regular, fixture.hudText.leftWarpTitle, rect.x1 - 65, rect.y0 + 2), titleColour).length, 'a shifted title').toBeGreaterThan(0);
  const baseLine = rectPoints({ x0: rect.x0 + 2, y0: rect.y0 + 52, x1: rect.x1 - 2, y1: rect.y0 + 52 });
  expect(new Set(baseLine.map(([x, y]) => image.at(x, y).join())).size).toBe(1);
  expect(same(image.at(...baseLine[0]), fixture.data[0])).toBe(false);
  const { leftWarpBar1Label, leftWarpBar2Label, leftWarpBar3Label } = fixture.hudText;
  for (const [label, top] of [[leftWarpBar1Label, rect.y1 - 40], [leftWarpBar2Label, rect.y1 - 26], [leftWarpBar3Label, rect.y1 - 12]] as const) {
    const found = findText(image, fixture.regular, label, { ...rect, y0: top + 1, y1: top + 1 }).filter(({ rgb }) => !same(rgb, fixture.data[0]));
    expect(found.length, `the label ${label} at row ${top + 1}`).toBeGreaterThan(0);
  }
  expect(wrongPixels(image, rectPoints({ ...rect, y0: rect.y0 + 55, y1: rect.y1 - 41 }), fixture.data[0])).toEqual([]);
  // The radar is cleared and ringed without contacts; the overlay is not drawn.
  const ringOrClear = new Set([fixture.data[0], fixture.data[COLOUR.rings]].map(rgb => rgb.join()));
  expect(radarSpans(fixture).filter(([x, y]) => !ringOrClear.has(image.at(x, y).join()))).toEqual([]);
  const overlay = new Set([0x0c, 0x0a].map(entry => fixture.data[entry].join()));
  expect(reticle().filter(([x, y]) => overlay.has(image.at(x, y).join()))).toEqual([]);

  // After the Warp: F1, page 0 again (the saved page), contacts and the reticle back.
  await resume(page);
  await expect.poll(() => loggedTicks(page, 'warp-completed'), { timeout: 90_000 }).toHaveLength(1);
  const [completed] = await loggedTicks(page, 'warp-completed');
  const f1 = await calmPicture(page, fixture, completed + 40, FLIGHT_VIEW);
  expect(f1.state.combat!.leftPage).toBe(0);
  expect(cockpitChecks(f1.image, fixture, f1.state)).toEqual(CLEAN);
  const reticleColours = new Set(reticle().map(([x, y]) => f1.image.at(x, y).join()));
  expect([...reticleColours].every(colour => overlay.has(colour))).toBe(true);
  const summary = { started, warpTick: state.tick, completed, f1: f1.state.tick };
  await testInfo.attach('cockpit-warp', { body: JSON.stringify(summary), contentType: 'application/json' });
  console.info(`Cockpit Warp: ${JSON.stringify(summary)}`);
});

test('destruction view: the view label over the full-screen world, no frame, band, radar or overlay required or drawn, and an empty slot-7 message line', async ({ page }) => {
  const fixture = await startableCockpit();
  await seededFlight(page, 'mission-startable', endingPackage('failure'), SEEDS.failure, null);
  const { image, state } = await pauseWhen(page, current => current.viewMode === 0x11 && current.subMode === 8 && current.tick >= 8, 'the destruction view');
  // The label of sub-mode 8 in fonts/1, colour 0xF, at (0, 0) (§4.6).
  expect(wrongPixels(image, textPixels(fixture.small, fixture.viewLabel, 0, 0), fixture.data[COLOUR.viewLabel])).toEqual([]);
  expect(wrongPixels(image, textPixels(fixture.small, fixture.hudText.leftWarpTitle, 0, 0), fixture.data[COLOUR.viewLabel]).length).toBeGreaterThan(0);
  // The world fills the screen (stars in the band rows); the F1 cockpit's checks all fail here.
  const stars = new Set(fixture.data.slice(1, 7).map(rgb => rgb.join()));
  expect(rectPoints({ x0: 0, y0: F1_BOTTOM + 1, x1: 639, y1: 479 }).some(([x, y]) => stars.has(image.at(x, y).join()))).toBe(true);
  const band = bandStatic(fixture);
  expect(pixelsOf(image, band, fixture.data[0]).length, 'no band in index 0').toBeLessThan(band.length / 100);
  const rings = radarRings(fixture);
  expect(pixelsOf(image, rings, fixture.data[COLOUR.rings]).length, 'no radar rings').toBeLessThan(rings.length / 10);
  expect(imageMismatches(image, frameElementPixels(fixture)).length, 'no frame element').toBeGreaterThan(0);
  const overlay = new Set([0x0c, 0x0a].map(entry => fixture.data[entry].join()));
  expect(reticle().filter(([x, y]) => overlay.has(image.at(x, y).join()))).toEqual([]);
  // The slot-7 message line, empty here (the run's messages were flushed with the loss, and the speed assist is
  // refused without a player), leaves no index-0 rectangle behind after its first clear.
  const line = instrument(fixture, 8, 7);
  expect(state.head).toBeNull();
  expect(pixelsOf(image, rectPoints(line), fixture.data[0]).length).toBeLessThan(rectPoints(line).length / 10);
});

test('pages 2–5: the menus by c, 2, 1; page 5 shows the G-03 label, the summary scrolls on the message line from the next draw, and the base page shows the same summary (G-05)', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  const fixture = await startableCockpit();
  await seededFlight(page, 'mission-docking', twoBasesPackage(), SEEDS.docking, null);
  await waitForFrame(page, frame => (frame.tick ?? 0) >= 20);
  const name = await entityNames(page, twoBasesPackage());
  // `c`, 2, 1, 2: the category menu (page 2), the two bases (page 3), the first base's command menu (page 4) and its
  // docking request (P3-10), each page checked against the menu Core built.
  for (const [key, menuPage] of [['c', 2], ['2', 3], ['1', 4]] as const) {
    await page.keyboard.press(key);
    const menu = await pauseWhen(page, state => state.combat?.leftPage === menuPage && state.menu !== null, `${key} opens page ${menuPage}`);
    expect(menuPageWrong(menu.image, fixture, menu.state, name)).toEqual([]);
    expect(menuPageWrong(menu.image, withData(fixture, fixture.map), menu.state, name).length).toBeGreaterThan(0);
    if (menuPage === 3) expect(menu.state.menu!.options.filter(({ value }) => value.type === 'object')).toHaveLength(2);
    await resume(page);
  }
  await page.keyboard.press('2');
  await expect.poll(() => loggedTicks(page, 'incoming-started'), { timeout: 30_000 }).toHaveLength(1);
  const [started] = await loggedTicks(page, 'incoming-started');
  const line = instrument(fixture, 8);
  const lineWidth = line.x1 - line.x0 - 1;
  const reads: { tick: number; offset: number }[] = [];
  for (const ticks of [16, 40]) {
    const { image, state } = await pauseWhen(page, current => current.tick >= started + ticks, `incoming + ${ticks}`);
    expect(state.incoming).toMatchObject({ shown: true });
    expect(state.combat!.leftPage).toBe(5);
    const { message } = state.incoming!;
    const summary = messageSummary(message)!;
    const label = messageLabel(message)!;
    expect(state.head).toEqual({ text: summary, origin: 'project' });
    expect(label.at(-1)).toContain('G-03');
    // Page 5's G-03 placeholder: the label's lines centred in the 96 × 96 area in index 0; another kind's label is not.
    expect(incomingPageWrong(image, fixture, label)).toEqual([]);
    const other = { ...message, index: message.index + 1 };
    expect(incomingPageWrong(image, fixture, messageLabel(other)!).length).toBeGreaterThan(0);
    // The summary on the message line (§4.7: colour 8, mode 1), first shown in the draw after the incoming start (RQ5).
    const offset = messageOffset(1, state.clock - clockAt(state, started + 1), lineWidth);
    expect(messageLineWrong(image, fixture, line, summary, offset, COLOUR.incoming)).toEqual([]);
    const early = messageOffset(1, state.clock - clockAt(state, started), lineWidth);
    expect(early).not.toBe(offset);
    expect(messageLineWrong(image, fixture, line, summary, early, COLOUR.incoming).length, 'shown in the start tick\'s own draw').toBeGreaterThan(0);
    expect(messageLineWrong(image, fixture, line, messageSummary(other)!, offset, COLOUR.incoming).length, 'another summary').toBeGreaterThan(0);
    reads.push({ tick: state.tick, offset });
    await resume(page);
  }
  expect(reads[1].offset).toBeLessThan(reads[0].offset);

  // Docked: the base page (G-05) shows the same summary from the same queue, marked as the project's.
  await expect(page.getByTestId('mission-placeholder')).toHaveAttribute('data-gap', 'G-02/3', { timeout: 60_000 });
  await endPlaceholder(page, 'G-02/3', 'button');
  await expect(page.getByTestId('base-page')).toBeVisible();
  const g05 = page.locator('[data-testid="base-page"] .slice-gap[data-gap="G-05"]');
  await expect(g05).toBeVisible();
  await expect(g05).toContainText(SLICE_GAPS['G-05'].title);
  const summary = (await cockpitState(page)).head!.text;
  await expect(page.getByTestId('base-message-line')).toContainText(summary);
  await expect(page.getByTestId('base-message-line')).toHaveAttribute('data-origin', 'project');
  await testInfo.attach('cockpit-incoming', { body: JSON.stringify({ started, reads, summary }), contentType: 'application/json' });
  console.info(`Cockpit incoming: ${JSON.stringify({ started, reads })}`);
});

test('damage: the screen flash recolours and shifts the whole game image, borders and controls kept; page 1 and the right display show interference', async ({ page }, testInfo) => {
  const fixture = await startableCockpit();
  await seededFlight(page, 'mission-startable', collisionPackage(), SEEDS.collisions, null);
  // The first collisions (ticks 2–4) start flash 0 of the package (0.5 s, that is 16 ticks, at level 40, a shift of up to
  // 7 rows): a pause a few ticks later holds a flash picture (one more try while the flash can still be on).
  let flash = await pauseWhen(page, state => state.tick >= 4, 'the first collisions');
  if (flashFits(flash.image, fixture).length === 0 && flash.state.tick < 12) {
    await resume(page);
    flash = await after(page, 1);
  }
  const fits = flashFits(flash.image, fixture);
  expect(fits, `a flash picture at tick ${flash.state.tick}`).toHaveLength(1);
  // Outside the game image nothing changes: the page pixels just outside the canvas (black where the view letterboxes
  // it) and the controls look the same after the flash.
  const outside = await page.getByTestId('flight-area').locator('canvas').evaluate(element => {
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return [[left - 2, (top + bottom) / 2], [right + 2, (top + bottom) / 2], [(left + right) / 2, top - 2], [(left + right) / 2, bottom + 2]]
      .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) as [number, number][];
  });
  expect(outside.length).toBeGreaterThan(0);
  const outsideFlash = await pagePixels(page, outside);
  const resumeButton = await button(page, 'Resume').screenshot();
  const placement = await page.getByTestId('flight-area').locator('canvas').evaluate(element => element.getBoundingClientRect().toJSON() as DOMRect);
  const view = await page.getByTestId('flight-view').evaluate(element => element.getBoundingClientRect().toJSON() as DOMRect);
  const borders: [number, number][] = [];
  if (placement.left - view.left >= 2) borders.push([view.left + 1, view.top + view.height / 2]);
  if (placement.top - view.top >= 2) borders.push([view.left + view.width / 2, view.top + 1]);
  if (borders.length > 0) expect(await pagePixels(page, borders)).toEqual(borders.map(() => [0, 0, 0]));
  await resume(page);
  // After it, the subsystem damage of seed 23: field 11 (the energy page) at 2.
  const calm = await after(page, 40);
  expect(flashFits(calm.image, fixture)).toEqual([]);
  expect(cockpitChecks(calm.image, fixture, calm.state).band).toEqual([]);
  expect(await button(page, 'Resume').screenshot()).toEqual(resumeButton);
  expect(await pagePixels(page, outside)).toEqual(outsideFlash);
  expect(calm.state.combat!.subsystems[11]).toBe(2);
  await resume(page);

  // Page 1 under field 11 at 2 (SNIP 10487, §4.4): from the first call on page 1 the interference is on (the entry's
  // next toggle is 0) and shows frame ((sample − start) × 12) >> 6 modulo 9 at (x0, y0 + 1) instead of the page.
  await page.keyboard.press('e');
  const rect6 = instrument(fixture, 6);
  const frames: { tick: number; clock: number; frames: number[] }[] = [];
  let reference: CockpitState | undefined;
  for (const ticks of [3, 4, 5, 7, 6]) {
    const { image, state } = await after(page, ticks);
    reference ??= state;
    expect(state.combat!.leftPage).toBe(1);
    // The synthetic frames repeat every fourth one (values (3p + f) mod 4), so frames f and f + 4 look alike.
    const shown = interferenceFrames(image, fixture, rect6);
    expect(shown.length).toBeGreaterThan(0);
    expect(imageMismatches(image, pageBackground(fixture, rect6)).length, 'not the page').toBeGreaterThan(0);
    expect(interferenceFrames(image, withData(fixture, fixture.map), rect6)).toEqual([]);
    frames.push({ tick: state.tick, clock: state.clock, frames: shown });
    await resume(page);
  }
  const opened = (await page.evaluate(readLog, ['left-page-changed'])).filter(({ fields }) => fields.page === '1').map(({ tick }) => tick);
  expect(opened).toHaveLength(1);
  const fitsFrames = (start: number) => frames.every(({ clock, frames: shown }) => shown.includes(((((clock - start) * 12) >>> 0) >>> 6) % 9));
  const start = clockAt(reference!, opened[0]);
  expect(fitsFrames(start), `frames ${JSON.stringify(frames)} from the page change at tick ${opened[0]}`).toBe(true);
  for (const shift of [-6, -3, 3, 6]) expect(fitsFrames(start + shift * reference!.unitsPerTick), `a start ${shift} ticks off`).toBe(false);

  // The next run (seed 79): field 14 at 2, so the right display shows an interference frame at (x0, y0 + 1).
  await page.keyboard.press('Escape');
  await button(page, 'Restart mission').click();
  await endPlaceholder(page, 'G-02/1', 'button');
  await departWith(page, null);
  const right = await after(page, 40);
  expect(right.state.combat!.subsystems[14]).toBe(2);
  const rect7 = instrument(fixture, 7);
  expect(interferenceFrames(right.image, fixture, rect7).length).toBeGreaterThan(0);
  expect(targetDisplayRead(right.image, fixture).wrong.length, 'not the target display').toBeGreaterThan(0);
  const summary = { flash: { tick: flash.state.tick, fits }, frames, opened: opened[0] };
  await testInfo.attach('cockpit-damage', { body: JSON.stringify(summary), contentType: 'application/json' });
  console.info(`Cockpit damage: ${JSON.stringify(summary)}`);
});
