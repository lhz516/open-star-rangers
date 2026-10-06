import { expect, test } from '@playwright/test';
import { audioState, EXACT_SAMPLES, expectedS16, expectedU8, setUpAudioPage, withAudioTargets } from './support/audio-playback.ts';
import { until } from './support/native-lifecycle.ts';

// P2-08 AC-10 in real Chrome with code-generated samples, through the production browser factory and real AudioContext.
// Each case owns its browser so the autoplay policy is fixed; the development project alone serves the `/src` modules.

test('blocks audio without activation, then plays exact buffers audibly after a trusted click and releases everything', async ({ baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Audio playback requires a development origin');
  await withAudioTargets(baseURL, {}, async ({ browser, app }) => {
    const setUp = await app.evaluate(setUpAudioPage, EXACT_SAMPLES);
    expect(setUp).toEqual({ loaded: { status: 'loaded', count: 4 }, activated: false });

    const blocked = await app.evaluate(() => {
      const { controller } = window.osrAudioTest;
      return { unlock: controller.unlock(), play: controller.play('sound/loop') };
    });
    expect(blocked).toEqual({ unlock: 'locked', play: { status: 'rejected', code: 'audio-locked' } });
    await new Promise(resolve => setTimeout(resolve, 200));
    const silent = await app.evaluate(audioState);
    expect(silent).toMatchObject({ status: 'locked', voices: 0, contexts: ['suspended'], peak: 0, activated: false });

    await app.click('#osr-audio-unlock');
    const unlocked = await until(() => app.evaluate(audioState), state => state.status === 'running', 'Trusted unlock');
    expect(unlocked).toMatchObject({ contexts: ['running'], activated: true });

    const buffers = await app.evaluate(() => window.osrAudioProbe.buffers(5));
    expect(buffers).toEqual([
      { sampleRate: 22_050, length: 3, channels: expectedS16 },
      { sampleRate: 8_000, length: 5, channels: [expectedU8] },
    ]);

    const loop = await app.evaluate(() => window.osrAudioTest.controller.play('sound/loop'));
    expect(loop.status).toBe('started');
    const playing = await until(() => app.evaluate(audioState), state => state.peak > 0.25, 'Audible looping output');
    expect(playing.voices).toBe(1);
    const stopped = await app.evaluate(voice => window.osrAudioTest.controller.stop(voice), loop.status === 'started' ? loop.voice : -1);
    expect(stopped).toBe(true);
    const silentAfterStop = await until(() => app.evaluate(audioState), state => state.peak === 0, 'Silence after stop');
    expect(silentAfterStop).toMatchObject({ voices: 0, routed: 0 });

    expect((await app.evaluate(() => window.osrAudioTest.controller.play('sound/blip'))).status).toBe('started');
    await until(() => app.evaluate(audioState), state => state.peak > 0.25, 'Audible one-shot output');
    const ended = await until(() => app.evaluate(audioState), state => state.voices === 0 && state.peak === 0, 'Natural end and silence');
    expect(ended.routed).toBe(0);

    // Dispose while a loop is audible: afterwards no node feeds the destination and the closed context renders nothing.
    expect((await app.evaluate(() => window.osrAudioTest.controller.play('sound/loop'))).status).toBe('started');
    const beforeRelease = await until(() => app.evaluate(audioState), state => state.peak > 0.25, 'Audible loop before release');
    expect(beforeRelease.routed).toBe(1);
    const disposed = await app.evaluate(() => {
      window.osrAudioTest.controller.dispose();
      return window.osrAudioTest.controller.getSnapshot();
    });
    expect(disposed).toEqual({ status: 'disposed', loaded: 0, voices: 0 });
    const released = await until(() => app.evaluate(audioState), state => state.contexts[0] === 'closed', 'Context closed');
    expect(released).toMatchObject({ voices: 0, routed: 0, activeListeners: [], reported: [] });
    expect(released.listenerTypes.sort()).toEqual(['ended', 'ended', 'ended', 'pagehide', 'pageshow', 'statechange', 'visibilitychange']);
    expect(await app.evaluate(() => window.osrAudioTest.controller.play('sound/blip'))).toEqual({ status: 'rejected', code: 'disposed' });
    expect(app.errors, 'Browser errors').toEqual([]);
    console.info(`Audio ${browser.version()}: blocked ${silent.status}/${silent.contexts.join()} peak ${silent.peak}, unlocked ${unlocked.status}, `
      + `loop peak ${playing.peak.toFixed(3)}, after stop ${silentAfterStop.peak}, after end ${ended.peak}, `
      + `released ${released.contexts.join()} routed ${beforeRelease.routed} -> ${released.routed}`);
    await testInfo.attach('audio-playback', {
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, blocked, silent, unlocked, playing, silentAfterStop, ended, released }),
      contentType: 'application/json',
    });
  });
});

test('reports audio as unavailable without an AudioContext constructor', async ({ baseURL }) => {
  if (!baseURL) throw new Error('Audio playback requires a development origin');
  await withAudioTargets(baseURL, { withoutAudioContext: true }, async ({ app }) => {
    expect(await app.evaluate(() => 'AudioContext' in window)).toBe(false);
    expect((await app.evaluate(setUpAudioPage, EXACT_SAMPLES)).loaded).toEqual({ status: 'loaded', count: 4 });
    await app.click('#osr-audio-unlock');
    const state = await until(() => app.evaluate(audioState), value => value.unlocks.length === 1, 'Trusted unlock attempt');
    expect(state).toMatchObject({ status: 'unavailable', unlocks: ['unavailable'], contexts: [], activated: true });
    expect(await app.evaluate(() => window.osrAudioTest.controller.play('sound/blip'))).toEqual({ status: 'rejected', code: 'audio-unavailable' });
    expect(app.errors, 'Browser errors').toEqual([]);
  });
});

test('stops and suspends audio while the tab is really hidden, and resumes without replay when it returns', async ({ baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Audio playback requires a development origin');
  await withAudioTargets(baseURL, { headed: true }, async ({ browser, root, app, appId, alternateId }) => {
    expect((await app.evaluate(setUpAudioPage, EXACT_SAMPLES)).loaded).toEqual({ status: 'loaded', count: 4 });
    await app.click('#osr-audio-unlock');
    await until(() => app.evaluate(audioState), state => state.status === 'running', 'Trusted unlock');
    expect((await app.evaluate(() => window.osrAudioTest.controller.play('sound/loop'))).status).toBe('started');
    const playing = await until(() => app.evaluate(audioState), state => state.peak > 0.25, 'Audible looping output');

    await root.send('Target.activateTarget', { targetId: alternateId! });
    const hidden = await until(() => app.evaluate(audioState), state => state.visibility === 'hidden' && state.contexts[0] === 'suspended', 'Native hidden and suspension');
    // A suspended context renders nothing, so its tap keeps the last frame; no routed node is the silence evidence.
    expect(hidden).toMatchObject({ status: 'suspended', voices: 0, routed: 0 });
    expect(await app.evaluate(() => window.osrAudioTest.controller.play('sound/blip'))).toEqual({ status: 'rejected', code: 'audio-suspended' });

    await root.send('Target.activateTarget', { targetId: appId });
    const shown = await until(() => app.evaluate(audioState), state => state.visibility === 'visible' && state.status === 'running', 'Native visible and resumed');
    await new Promise(resolve => setTimeout(resolve, 300));
    const afterReturn = await app.evaluate(audioState);
    expect(afterReturn).toMatchObject({ status: 'running', voices: 0, routed: 0, peak: 0, contexts: ['running'] });
    expect(afterReturn.visibilityEvents.slice(-3)).toEqual(['visible', 'hidden', 'visible']);

    expect((await app.evaluate(() => window.osrAudioTest.controller.play('sound/blip'))).status).toBe('started');
    await until(() => app.evaluate(audioState), state => state.peak > 0.25, 'Audible output after return');
    await app.evaluate(() => window.osrAudioTest.controller.dispose());
    await until(() => app.evaluate(audioState), state => state.contexts[0] === 'closed' && state.routed === 0 && state.activeListeners.length === 0, 'Released');
    expect(app.errors, 'Browser errors').toEqual([]);
    console.info(`Audio headed ${browser.version()}: ${afterReturn.visibilityEvents.join(' -> ')}, playing peak ${playing.peak.toFixed(3)}, `
      + `hidden ${hidden.status}/${hidden.contexts.join()} voices ${hidden.voices}, returned ${afterReturn.status} voices ${afterReturn.voices} peak ${afterReturn.peak}`);
    await testInfo.attach('audio-visibility', {
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, playing, hidden, shown, afterReturn }),
      contentType: 'application/json',
    });
  });
});
