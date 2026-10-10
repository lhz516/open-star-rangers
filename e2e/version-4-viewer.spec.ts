import { asciiBytes } from '../src/content/graphics/graphics-format.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';
import { button } from './support/app-entry.ts';
import { audibleRuns, audioSources, beginTrace, finishTrace, installAudioProbe } from './support/audio-playback.ts';
import { expect, test } from './support/audited-test.ts';
import { expectCacheArrival, type CanaryMarker, type CanarySet } from './support/canaries.ts';
import { seedProductionCache } from './support/production-cache.ts';
import { expectedPackage, ResourceBalance, settleTooling } from './support/resource-balance.ts';
import {
  decodedSound, expectNewImages, expectSilentVoices, LONG_REPEAT, openHeldViewer, playSound, REPEAT_SOUND, repeatingPackage,
} from './support/version-4.ts';

// P3-03/20 (AC-17, S-15): the version 4 synthetic package in the production preview, under its strict policy, and on
// the development server, through the production menu at `/`. Synthetic files never import successfully in the
// preview (P2-12 technical decision 1), so the package is seeded under the production identity in the test's own
// context, with its repeat sound lengthened to LONG_REPEAT so that its passes can be heard one by one; the import, save
// and reload of the converted package run on the development test entry (viewer-page.spec.ts). The network audit and
// the menu's resource balance run throughout.

test.describe.configure({ timeout: 120_000 });

const STATUS = 'original-data-status';
const NONE = 'Original game data: None in this browser.';
const FOUND = 'Original game data: Saved resources found in this browser, not yet verified.';
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
const PRODUCTION_KEY = Object.freeze({
  originType: 'original-import', originToken: PRODUCTION_PACKAGE.sourceFingerprint, converterVersion: PRODUCTION_PACKAGE.converterVersion,
} as const);
/** Context seconds allowed for the probe's analyser window and for sampling. */
const SLACK = 0.1;

test('restores the version 4 package, shows its new images, and plays the repeat sound its number of times or until stopped (AC-17)', async ({ page, audit }, testInfo) => {
  await page.addInitScript(installAudioProbe);
  await page.goto('/');
  await expect(page.getByTestId(STATUS)).toHaveText(NONE);
  const { groups, identity } = await seedProductionCache(page, await repeatingPackage());
  // The package's identity and the long sound's digest must not leave the browser; each is in the cache.
  const fingerprint = readGroupManifest(groups.find(group => readGroupManifest(group.manifest).group === 'audio')!.manifest).assets
    .find(({ id }) => id === REPEAT_SOUND)!.payloadIdentity.fingerprint;
  const marker = (name: CanaryMarker['name'], text: string): CanaryMarker => ({ name, bytes: asciiBytes(text), text, stages: ['cache'] });
  const canaries: CanarySet = {
    markers: [
      marker('source-fingerprint', PRODUCTION_PACKAGE.sourceFingerprint), marker('manifest-identity', identity.manifestIdentity),
      marker('payload-sha256', fingerprint.slice('sha256:'.length)),
    ],
  };
  audit.canaries(...canaries.markers.map(({ name, bytes }) => ({ name, value: bytes })));
  await expectCacheArrival(page, canaries);
  await page.reload();
  await expect(page.getByTestId(STATUS)).toHaveText(FOUND);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [expectedPackage(PRODUCTION_KEY, groups)] });

  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED);
  await openHeldViewer(page);
  await expectNewImages(page);

  // Natural end: one looping source over the whole buffer, stopped by schedule after exactly its passes. In the
  // output, a tone is heard once per pass, in its pass, and nothing after the last; no other stop was made.
  const { plays, pass, loop } = await decodedSound(REPEAT_SOUND, groups);
  const { lead, tone, tail, sampleRate } = LONG_REPEAT;
  expect({ loop, plays, pass }).toEqual({ loop: 'repeat', plays: LONG_REPEAT.plays, pass: (lead + tone + tail) / sampleRate });
  const total = plays * pass;
  // The trace starts before the click, which creates and resumes the context, and ends a while after the scheduled end.
  await beginTrace(page);
  const source = await playSound(page, REPEAT_SOUND);
  const start = source.start.when!;
  const natural = await finishTrace(page, start + total + 4 * SLACK);
  expect(natural.at(-1)!.time, 'the trace reached its end').toBeGreaterThanOrEqual(start + total + 4 * SLACK);
  await expectSilentVoices(page);
  expect(source).toMatchObject({ sampleRate, length: lead + tone + tail, loop: true, loopStart: 0, loopEnd: 0 });
  expect(start).toBeCloseTo(source.start.at, 1);
  const naturalStops = (await audioSources(page)).at(-1)!.stops;
  expect(naturalStops.map(({ when }) => (when === null ? 'now' : 'scheduled')), 'no stop beyond the scheduled one').toEqual(['scheduled']);
  const [scheduled] = naturalStops;
  expect(scheduled.when).toBeCloseTo(start + total, 9);
  const runs = audibleRuns(natural);
  expect(runs.map(({ start: from }) => Math.floor((from - start + SLACK) / pass)), JSON.stringify(runs)).toEqual(Array.from({ length: plays }, (_, index) => index));
  expect(runs.at(-1)!.end).toBeLessThan(start + total);
  const after = natural.filter(({ time }) => time > start + total + SLACK);
  expect(after.length, 'the trace continues after the end').toBeGreaterThan(0);
  expect(after.every(({ peak }) => peak === 0)).toBe(true);

  // Stopped early, during its first pass: the voice ends at once and nothing more is heard.
  await beginTrace(page);
  const second = await playSound(page, REPEAT_SOUND);
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.peak())).toBeGreaterThan(0.25);
  await button(page, `Stop ${REPEAT_SOUND}`).click();
  await expectSilentVoices(page);
  const earlyStops = (await audioSources(page)).at(-1)!.stops;
  expect(earlyStops.map(({ when }) => (when === null ? 'now' : 'scheduled'))).toEqual(['scheduled', 'now']);
  const [{ when: due }, immediate] = earlyStops;
  const early = await finishTrace(page, immediate.at + 4 * SLACK);
  const earlyRuns = audibleRuns(early);
  expect(due).toBeCloseTo(second.start.when! + total, 9);
  expect(immediate.at).toBeLessThan(second.start.when! + total);
  expect(earlyRuns.length).toBeLessThan(plays);
  const silent = early.filter(({ time }) => time > immediate.at + SLACK);
  expect(silent.length).toBeGreaterThan(0);
  expect(silent.every(({ peak }) => peak === 0)).toBe(true);

  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.contexts())).toEqual(['closed']);
  await balance.check('after the viewer and both auditions');
  console.info(`${testInfo.project.name} repeat audition: ${plays} passes of ${pass} s from context time ${start.toFixed(3)}, scheduled stop `
    + `${scheduled.when!.toFixed(3)}, heard ${runs.map(({ start: from, end }) => `${from.toFixed(3)}–${end.toFixed(3)}`).join(', ')}; stopped early at `
    + `${immediate.at.toFixed(3)} (due ${due!.toFixed(3)}), heard ${earlyRuns.length} pass`);
  await testInfo.attach('repeat-audition', {
    body: JSON.stringify({ plays, pass, natural: { start, scheduledStop: scheduled.when, runs }, early: { start: second.start.when, stop: immediate.at, runs: earlyRuns } }),
    contentType: 'application/json',
  });
  await balance.attach();
});
