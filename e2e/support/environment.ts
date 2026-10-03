import type { LaunchOptions } from '@playwright/test';

function port(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) {
    throw new Error(`${name} must be an integer port between 1024 and 65535`);
  }
  return Number(value);
}

export const devPort = port('OSR_E2E_DEV_PORT', 4173);
export const previewPort = port('OSR_E2E_PREVIEW_PORT', 4174);
if (devPort === previewPort) throw new Error('E2E development and preview ports must differ');
export const devOrigin = `http://127.0.0.1:${devPort}`;
export const previewOrigin = `http://127.0.0.1:${previewPort}`;

export function installedBrowser(headless = true): LaunchOptions {
  const executablePath = process.env.OSR_E2E_EXECUTABLE;
  if (executablePath !== undefined && executablePath.trim() === '') {
    throw new Error('OSR_E2E_EXECUTABLE must name an existing compatible Chromium executable');
  }
  return {
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
    headless,
  };
}
