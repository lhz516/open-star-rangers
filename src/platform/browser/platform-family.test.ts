import { describe, expect, it } from 'vitest';
import { classifyPlatformFamily } from './platform-family.ts';
import type { PlatformFacts, PlatformFamily } from './platform-family.ts';

describe('platform family', () => {
  it.each<[string, PlatformFacts, PlatformFamily]>([
    ['userAgentData macOS', { userAgentDataPlatform: 'macOS', platform: 'MacIntel' }, 'mac'],
    ['userAgentData Windows', { userAgentDataPlatform: 'Windows', platform: 'Win32' }, 'windows'],
    ['userAgentData Linux', { userAgentDataPlatform: 'Linux', platform: 'Linux x86_64' }, 'linux'],
    ['userAgentData Chrome OS', { userAgentDataPlatform: 'Chrome OS', platform: 'Linux x86_64' }, 'other'],
    ['userAgentData Android', { userAgentDataPlatform: 'Android', platform: 'Linux armv8l' }, 'other'],
    ['userAgentData Unknown', { userAgentDataPlatform: 'Unknown', platform: 'Win32' }, 'other'],
    ['userAgentData before platform', { userAgentDataPlatform: 'Windows', platform: 'MacIntel' }, 'windows'],
    ['platform MacIntel', { platform: 'MacIntel' }, 'mac'],
    ['platform Macintosh', { platform: 'Macintosh' }, 'mac'],
    ['platform Win32', { platform: 'Win32' }, 'windows'],
    ['platform Win64', { platform: 'Win64' }, 'windows'],
    ['platform Linux x86_64', { platform: 'Linux x86_64' }, 'linux'],
    ['platform Linux aarch64', { platform: 'Linux aarch64' }, 'linux'],
    ['platform iPhone', { platform: 'iPhone' }, 'other'],
    ['platform FreeBSD', { platform: 'FreeBSD amd64' }, 'other'],
    ['platform X11', { platform: 'X11' }, 'other'],
    ['empty userAgentData falls back', { userAgentDataPlatform: '', platform: 'Win32' }, 'windows'],
    ['blank userAgentData falls back', { userAgentDataPlatform: '  ', platform: 'Linux i686' }, 'linux'],
    ['non-string userAgentData falls back', { userAgentDataPlatform: 42, platform: 'MacIntel' }, 'mac'],
    ['padded value', { userAgentDataPlatform: ' macOS ' }, 'mac'],
    ['empty platform', { platform: '' }, 'other'],
    ['nothing reported', {}, 'other'],
    ['non-string platform', { platform: null }, 'other'],
  ])('%s', (_label, facts, family) => {
    expect(classifyPlatformFamily(facts)).toBe(family);
  });
});
