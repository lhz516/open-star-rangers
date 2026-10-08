import type { Page } from '@playwright/test';
import type { Canary } from '../tools/e2e-network-policy.ts';
import { expect, test } from './support/audited-test.ts';
import { loopbackReceiver } from './support/network-audit.ts';

// P2-12 AC-11, development project: the Vite HMR connection is the one WebSocket the development rules allow, with only
// its protocol messages; any other WebSocket, here to the test-owned loopback receiver, is detected with the markers in
// its URL and in the frames it sends.

const MARKERS = { url: 'osr-audit-socket-url-5e1f0b', text: 'osr-audit-text-frame-c2a974', binary: 'osr-audit-binary-frame-83d6e1' } as const;
const CANARIES: Canary[] = Object.entries(MARKERS).map(([name, value]) => ({ name, value }));

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
}

const hmr = { kind: 'toolchain', channel: 'websocket', initiator: 'page', rule: 'Vite HMR WebSocket' };

test('the Vite HMR connection is identified and allowed', async ({ page, audit }) => {
  audit.canaries(...CANARIES);
  await openApp(page);
  await expect.poll(async () => (await audit.report()).allowed.filter(entry => entry.channel === 'websocket')).toEqual([expect.objectContaining(hmr)]);
  const report = await audit.report();
  expect(report.allowed.find(entry => entry.channel === 'websocket')?.subject).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+$/);
  expect(report.violations).toEqual([]);
  expect(report.gaps).toEqual([]);
});

test('a WebSocket other than Vite HMR is detected with the markers in its URL and in the frames it sends', async ({ page, audit }) => {
  const receiver = await loopbackReceiver();
  try {
    const url = `${receiver.origin.replace(/^http:/, 'ws:')}/socket?m=${MARKERS.url}`;
    audit.canaries(...CANARIES);
    audit.expectViolations({ subject: url });
    await openApp(page);
    audit.phase('controls');
    await page.evaluate(async ({ url, text, binary }) => {
      const socket = new WebSocket(url);
      await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
      socket.send(text);
      socket.send(new TextEncoder().encode(btoa(binary)));
      socket.close();
      await new Promise(resolve => { socket.onclose = resolve; });
    }, { url, text: MARKERS.text, binary: MARKERS.binary });
    expect(receiver.sockets).toEqual([{ url: `/socket?m=${MARKERS.url}`, protocol: undefined, frames: [MARKERS.text, Buffer.from(btoa(MARKERS.binary)).toString('base64')] }]);

    const report = await audit.report();
    expect(report.violations).toContainEqual(expect.objectContaining({ category: 'websocket', channel: 'websocket', initiator: 'page', phase: 'controls', subject: url }));
    expect(report.violations.flatMap(({ canary, subject }) => canary && subject === url ? [canary] : [])).toEqual([
      { name: 'url', location: 'url', encoding: 'raw' }, { name: 'text', location: 'frame', encoding: 'raw' }, { name: 'binary', location: 'frame', encoding: 'base64' },
    ]);
    expect(report.allowed).toContainEqual(expect.objectContaining(hmr));
    expect(report.gaps).toEqual([]);
  } finally {
    await receiver.close();
  }
});
