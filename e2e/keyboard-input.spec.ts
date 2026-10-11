import { expect, test } from './support/browser-test.ts';
import { dispatchKeyboardEvent, keyboardEvents, openKeyboardMenu, startKeyboardFlight, tabTo, watchKeyboardEvents, type KeyboardBuild } from './support/keyboard-input.ts';
import { button } from './support/app-entry.ts';
import { expectAdvancingTick, expectStableTick, missionEntry, missionFrame, waitForFrame } from './support/mission-observations.ts';

test.describe.configure({ timeout: 60_000 });

test('the focused input zone owns page-level bindings, slice-gap notices, pause and menu controls', async ({ page }, testInfo) => {
  const build: KeyboardBuild = testInfo.project.name === 'development' ? 'development' : 'production';
  await openKeyboardMenu(page, build);
  await watchKeyboardEvents(page);
  await startKeyboardFlight(page);
  const zone = page.getByTestId('game-input-zone');
  await expect(zone).toBeVisible();
  expect(await page.locator('[data-testid="game-input-zone"]').count()).toBe(1);
  await expect(page.getByTestId('input-focus-hint')).not.toBeVisible();

  await page.keyboard.press('Tab');
  await expect(button(page, 'Pause')).toBeFocused();
  await expect(page.getByTestId('input-focus-hint')).toBeVisible();
  expect((await keyboardEvents(page)).at(-1)).toMatchObject({ code: 'Tab', defaultPrevented: false });
  await page.keyboard.press('a');
  await expect(page.getByTestId('input-gap-notice')).toHaveAttribute('data-gap', '');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await zone.click();
  await expect(page.getByTestId('input-focus-hint')).not.toBeVisible();

  const commandStart = await missionFrame(page);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'ArrowUp', key: 'ArrowUp' })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'ArrowUp', key: 'ArrowUp' })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'KeyA', key: 'a' })).toBe(true);
  await expect(page.getByTestId('input-gap-notice')).toHaveAttribute('data-gap', 'G-09');
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'F11', key: 'F11' })).toBe(true);
  await expect(page.getByTestId('input-gap-notice')).toHaveAttribute('data-gap', 'G-10');
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'F2', key: 'F2' })).toBe(true);
  await expect(page.getByTestId('input-gap-notice')).toHaveAttribute('data-gap', 'G-08');
  await expect(zone).toBeFocused();
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'F12', key: 'F12' })).toBe(false);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'KeyS', key: 's', ctrlKey: true })).toBe(false);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'KeyR', key: 'r', metaKey: true })).toBe(false);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'KeyS', key: 's', altKey: true })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'KeyS', key: 's', altKey: true, ctrlKey: true, altGraph: true })).toBe(true);
  expect((await keyboardEvents(page)).find(event => event.code === 'KeyS' && event.altKey && event.ctrlKey))
    .toMatchObject({ altGraph: true });
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'AltLeft', key: 'Alt', altKey: true })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'AltLeft', key: 'Alt' })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'KeyA', key: 'a', isComposing: true })).toBe(false);
  expect(await missionFrame(page)).toMatchObject({ owner: commandStart?.owner, run: commandStart?.run, position: 'flight' });
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  await expect(page.getByTestId('input-gap-notice')).toHaveAttribute('data-gap', '', { timeout: 5_000 });
  expect((await keyboardEvents(page)).filter(event => event.code === 'Tab')).toEqual([
    expect.objectContaining({ type: 'keydown', defaultPrevented: false }),
    expect.objectContaining({ type: 'keyup', defaultPrevented: false }),
  ]);

  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  const paused = await expectStableTick(page);
  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(paused);

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'Escape', key: 'Escape' })).toBe(false);
  await expect(page.getByTestId('mission-menu')).toBeVisible();
  const menuTick = await expectStableTick(page);
  expect(await missionFrame(page)).toMatchObject({ owner: commandStart?.owner, run: commandStart?.run, tick: menuTick, position: 'menu' });
  await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
  await page.keyboard.press('p');
  expect(await expectStableTick(page)).toBe(menuTick);
  await tabTo(page, button(page, 'Continue'));
  await page.keyboard.press('Space');
  await waitForFrame(page, frame => frame.position === 'flight');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'Escape', key: 'Escape' })).toBe(false);
  await waitForFrame(page, frame => frame.position === 'menu');
  await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
  await tabTo(page, button(page, 'Return to main menu'));
  await page.keyboard.press('Space');
  await expect(missionEntry(page)).toBeFocused();
  expect(await page.getByTestId('game-input-zone').count()).toBe(0);
  expect(await page.getByTestId('mission-screen').count()).toBe(0);
});
