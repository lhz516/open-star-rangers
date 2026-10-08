import { button, openTestEntry, smallFile } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { InputOrder, orderTokens, type OrderEntry } from './support/responsiveness.ts';

// P2-12 subtask 03 (S-05, AC-05, controlled part): the production App on the development test entry with the `busy`
// Worker scenario, which announces itself with one progress message and then computes until it is terminated, so the
// job has an active window of the test's choosing. While it runs, a trusted click on the test's control is handled and
// a frame follows; a trusted click on "Cancel import" ends the job inside its own dispatch, terminating the Worker, and
// nothing but frames follows. The page and Worker run under the network audit. The timings are test wiring, not
// performance evidence; the real windows are measured by the joint cases.

const SETTLE_FRAMES = 10;

/** The first `event` entry of a click on `target`, with its position. */
function click(entries: readonly OrderEntry[], event: 'input' | 'handled', target: string) {
  const index = entries.findIndex(entry => entry.event === event && entry.target === target);
  if (index === -1) throw new Error(`No ${event} entry for ${target}`);
  return { entry: entries[index], index };
}

test('a trusted click is handled and a frame follows while the Worker computes, and a trusted cancel ends the job at once', async ({ page, audit }, testInfo) => {
  await openTestEntry(page, { worker: 'busy' });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles(['disc.ccd', 'disc.img'].map(smallFile));
  const order = await InputOrder.start(page);
  await button(page, 'Start import').click();
  await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', 'identify-source');
  // The Worker's script passed the network layer; let the audit observe the Worker before it is terminated.
  await audit.ready();
  const busy = await page.evaluate(() => window.osrProbe.snapshot().workers.map(({ name, messages, terminations }) => ({
    name, messages: messages.map(({ type, stage }) => `${type}:${stage ?? '-'}`), terminations,
  })));
  expect(busy).toEqual([{ name: 'busy', messages: ['ready:-', 'progress:identify-source'], terminations: 0 }]);

  await order.clickProbe();
  await button(page, 'Cancel import').click();
  await order.framesAfter(entry => entry.event === 'handled' && entry.target === 'Cancel import', SETTLE_FRAMES);
  const entries = await order.stop();
  const tokens = orderTokens(entries);
  console.info(`event order: ${tokens.filter((token, index) => token !== 'frame' || tokens[index - 1] !== 'frame').join(' → ')}`);
  await testInfo.attach('input-order', { contentType: 'application/json', body: JSON.stringify(entries, null, 1) });

  // The job was running in identify-source before either click.
  const running = tokens.indexOf('status:import:running:identify-source');
  const probeInput = click(entries, 'input', 'probe');
  const probeHandled = click(entries, 'handled', 'probe');
  const cancelInput = click(entries, 'input', 'Cancel import');
  const cancelHandled = click(entries, 'handled', 'Cancel import');
  expect(running).toBeGreaterThan(-1);
  expect(probeInput.index).toBeGreaterThan(running);
  // The probe click was trusted and handled in one dispatch, the job still running, and at least one frame followed.
  expect(probeHandled.index).toBe(probeInput.index + 1);
  expect(probeInput.entry).toMatchObject({ trusted: true, status: 'import:running:identify-source' });
  expect(probeHandled.entry).toMatchObject({ trusted: true, status: 'import:running:identify-source', workers: [{ name: 'busy', messages: 2, terminations: 0 }] });
  expect(tokens.slice(probeHandled.index + 1, cancelInput.index)).toContain('frame');
  expect(tokens.slice(probeHandled.index + 1, cancelInput.index).filter(token => token !== 'frame')).toEqual([]);
  // The trusted cancel click found the job running; within its own dispatch the page showed it cancelled and the Worker
  // was terminated, before any frame or other task.
  expect(cancelInput.entry).toMatchObject({ trusted: true, status: 'import:running:identify-source', workers: [{ name: 'busy', messages: 2, terminations: 0 }] });
  expect(entries.slice(cancelInput.index + 1, cancelHandled.index)).toEqual([
    { event: 'status', status: 'import:cancelled', at: expect.any(Number) },
  ]);
  expect(cancelHandled.entry).toMatchObject({ trusted: true, status: 'import:cancelled', workers: [{ name: 'busy', messages: 2, terminations: 1 }] });
  // Nothing but frames followed: no late message, status or Worker.
  const after = tokens.slice(cancelHandled.index + 1);
  expect(after.length).toBeGreaterThanOrEqual(SETTLE_FRAMES);
  expect(after.filter(token => token !== 'frame')).toEqual([]);
  const workers = await page.evaluate(() => window.osrProbe.snapshot().workers);
  expect(workers).toEqual([expect.objectContaining({ name: 'busy', terminations: 1, posts: 1, jobs: [1] })]);
  expect(workers[0].messages.every(({ at }) => at < workers[0].terminatedAt!)).toBe(true);
  await expect(page.getByTestId('import-result')).toHaveText(/^Import cancelled after \d+(?: ms|\.\d\d s)\. No partial result was kept\.$/);
  await expect(page.getByTestId('import-statuses')).toHaveCount(0);
  await expect(button(page, 'Start import')).toBeEnabled();
  await expect(page.getByTestId('responsiveness-probe')).toHaveCount(0);
});
