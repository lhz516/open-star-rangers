import { expect, type Page } from '@playwright/test';

export async function enterDemo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start synthetic demo', exact: true }).click();
  await expect(page.getByTestId('phase')).toHaveText('running');
}

export async function projection(page: Page): Promise<{ tick: number; x: number; run: string }> {
  return page.evaluate(() => {
    const text = (name: string): string => {
      const value = document.querySelector(`[data-testid="${name}"]`)?.textContent;
      if (!value) throw new Error(`Missing ${name} projection`);
      return value;
    };
    const position = / at \(([-\d.]+),/.exec(text('mover'));
    if (!position) throw new Error('Invalid mover projection');
    const tick = Number(text('tick'));
    const x = Number(position[1]);
    if (!Number.isFinite(tick) || !Number.isFinite(x)) throw new Error('Non-numeric projection');
    return { tick, x, run: text('run-id') };
  });
}

export async function stableAxis(page: Page): Promise<{ tick: number; x: string; time: number }[]> {
  const samples = await page.evaluate(async () => {
    const read = () => {
      const tick = Number(document.querySelector('[data-testid="tick"]')?.textContent);
      const position = document.querySelector('[data-testid="mover"]')?.textContent?.match(/ at \(([-\d.]+),/);
      if (!Number.isFinite(tick) || !position) throw new Error('Missing running projection');
      return { tick, x: position[1], time: performance.now() };
    };
    const before = read().tick;
    const deadline = performance.now() + 5000;
    let first = read();
    while (first.tick <= before) {
      if (performance.now() >= deadline) throw new Error('No fresh running projection after clear');
      await new Promise(resolve => setTimeout(resolve, 25));
      first = read();
    }
    const result = [first];
    for (let index = 0; index < 3; index++) {
      await new Promise(resolve => setTimeout(resolve, 120));
      result.push(read());
    }
    return result;
  });
  expect(samples.length).toBeGreaterThanOrEqual(3);
  expect(samples.at(-1)!.time - samples[0].time).toBeGreaterThanOrEqual(300);
  expect(samples.at(-1)!.tick).toBeGreaterThan(samples[0].tick);
  expect(new Set(samples.map(sample => sample.x)).size).toBe(1);
  return samples;
}

export async function diagnostics(page: Page) {
  await page.getByRole('button', { name: 'Refresh diagnostics', exact: true }).click();
  return page.evaluate(() => {
    const text = (name: string): string => {
      const value = document.querySelector(`[data-testid="render-${name}"]`)?.textContent;
      if (value === undefined || value === null) throw new Error(`Missing render ${name}`);
      return value;
    };
    const gpu = /^(\d+) geometries, (\d+) textures, (\d+) programs$/.exec(text('gpu'));
    return {
      state: text('state'), run: text('run-id'), tick: text('drawn-tick'), draws: Number(text('draws')),
      entities: Number(text('entities')), gpu: gpu ? gpu.slice(1).map(Number) : null, layout: text('layout'),
    };
  });
}

export async function frameWindow(page: Page, duration = 400) {
  return page.evaluate(async milliseconds => {
    window.osrProbe.resetFrames();
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    return window.osrProbe.snapshot();
  }, duration);
}
