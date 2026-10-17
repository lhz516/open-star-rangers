import { describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_ASSETS, syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import { FakeAudio, FakeLifecycle, sound } from '../../platform/audio/audio-controller.test-support.ts';
import type { HeldGroup } from '../resources/resource-holder.ts';
import { createViewerAudio } from './viewer-audio.ts';

/** The synthetic `audio` group with a real sound payload for every Asset. */
function audioGroup(): HeldGroup {
  const specs = SYNTHETIC_ASSETS.audio.map((spec, index) => ({ ...spec, bytes: sound({ pcm: Uint8Array.of(index, 128, 255 - index) }) }));
  const input = syntheticGroup('audio', specs);
  return Object.freeze({ group: 'audio', manifest: input.manifest, payloads: input.payloads, sources: input.sources });
}

const IDS = SYNTHETIC_ASSETS.audio.map(({ id }) => id);

function setup({ initialState = 'suspended', group = audioGroup() as HeldGroup | null } = {}) {
  const capability = new FakeAudio();
  capability.initialState = initialState;
  const lifecycle = new FakeLifecycle();
  const reportError = vi.fn();
  const audio = createViewerAudio({ capability, lifecycle, reportError }, group);
  return { audio, capability, lifecycle, reportError };
}

/** Whether a promise has settled after pending reactions ran. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => { done = true; }, () => { done = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  return done;
}

describe('viewer audio sounds', () => {
  it('lists exactly the audio group Assets with their roles, and loads every one', () => {
    const { audio } = setup();
    expect(audio.getSnapshot()).toEqual({
      status: 'idle', sounds: SYNTHETIC_ASSETS.audio.map(({ id, role }) => ({ id, role })), load: { status: 'loaded', count: IDS.length }, pending: null, voices: 0,
    });
    expect(Object.isFrozen(audio.getSnapshot())).toBe(true);
  });

  it('lists nothing and loads nothing without an audio group', () => {
    const { audio } = setup({ group: null });
    expect(audio.getSnapshot()).toMatchObject({ sounds: [], load: null });
    expect(audio.audition(IDS[0])).toEqual({ status: 'rejected', code: 'unknown-sound' });
  });

  it('reports a load failure as the controller does', () => {
    const capability = new FakeAudio();
    capability.failBuffer = true;
    const audio = createViewerAudio({ capability, lifecycle: new FakeLifecycle(), reportError: vi.fn() }, audioGroup());
    expect(audio.getSnapshot()).toMatchObject({ status: 'failed', load: { status: 'failed', code: 'audio-failed' } });
    expect(audio.audition(IDS[0])).toEqual({ status: 'rejected', code: 'audio-failed' });
  });
});

describe('audition', () => {
  it('plays at once when the controller already runs', () => {
    const { audio, capability } = setup({ initialState: 'running' });
    expect(audio.audition(IDS[1])).toEqual({ status: 'started' });
    expect(capability.context.voices).toHaveLength(1);
    expect(audio.getSnapshot()).toMatchObject({ status: 'running', pending: null, voices: 1 });
  });

  it('plays fixed voices exactly as before voice parameters: no parameter nodes, the stored rate, no settings', () => {
    const { audio, capability } = setup({ initialState: 'running' });
    audio.audition(IDS[0]);
    audio.audition(IDS[1]);
    const voices = capability.context.voices;
    expect(voices.map(voice => [voice.initial, 'setParameters' in voice, voice.calls])).toEqual([[null, false, ['start']], [null, false, ['start']]]);
  });

  it('keeps one pending audition through a delayed unlock and plays it exactly once', () => {
    const { audio, capability } = setup();
    expect(audio.audition(IDS[0])).toEqual({ status: 'pending' });
    // A later click replaces the pending sound.
    expect(audio.audition(IDS[2])).toEqual({ status: 'pending' });
    expect(audio.getSnapshot()).toMatchObject({ status: 'locked', pending: IDS[2], voices: 0 });
    capability.context.setState('running');
    expect(capability.context.voices).toHaveLength(1);
    expect(audio.getSnapshot()).toMatchObject({ status: 'running', pending: null, voices: 1 });
    capability.context.setState('suspended');
    capability.context.setState('running');
    expect(capability.context.voices).toHaveLength(1);
  });

  it.each([
    ['stopping that sound', (audio: ReturnType<typeof setup>['audio']) => audio.stop(IDS[0])],
    ['stopping all sounds', (audio: ReturnType<typeof setup>['audio']) => audio.stopAll()],
    ['cancelling, as on leaving or replacing the package', (audio: ReturnType<typeof setup>['audio']) => audio.cancelPending()],
    ['disposing', (audio: ReturnType<typeof setup>['audio']) => { void audio.dispose(); }],
  ])('never plays a pending audition after %s, even when the controller runs later', (_name, drop) => {
    const { audio, capability } = setup();
    audio.audition(IDS[0]);
    drop(audio);
    expect(audio.getSnapshot().pending).toBeNull();
    capability.context.setState('running');
    expect(capability.context.voices).toHaveLength(0);
  });

  it.each(['hide', 'pagehide'] as const)('drops a pending audition when the page is hidden (%s)', (event) => {
    const { audio, capability, lifecycle } = setup();
    audio.audition(IDS[0]);
    if (event === 'hide') lifecycle.hide();
    else lifecycle.fire('pagehide');
    expect(audio.getSnapshot().pending).toBeNull();
    lifecycle.show();
    capability.context.setState('running');
    expect(capability.context.voices).toHaveLength(0);
  });

  it('drops a pending audition when the controller fails instead of running', () => {
    const { audio, capability } = setup();
    audio.audition(IDS[0]);
    capability.context.setState('closed');
    expect(audio.getSnapshot()).toMatchObject({ status: 'failed', pending: null });
  });

  it('rejects an unknown sound and reports an unavailable capability without failing anything else', () => {
    const capability = new FakeAudio();
    capability.failContext = true;
    const audio = createViewerAudio({ capability, lifecycle: new FakeLifecycle(), reportError: vi.fn() }, audioGroup());
    expect(audio.audition('sound/unknown')).toEqual({ status: 'rejected', code: 'unknown-sound' });
    expect(audio.audition(IDS[0])).toEqual({ status: 'rejected', code: 'audio-unavailable' });
    expect(audio.getSnapshot()).toMatchObject({ status: 'unavailable', pending: null, load: { status: 'loaded' } });
  });

  it('stops the voices of one sound or all voices', () => {
    const { audio, capability } = setup({ initialState: 'running' });
    audio.audition(IDS[0]);
    audio.audition(IDS[1]);
    audio.audition(IDS[0]);
    audio.stop(IDS[0]);
    expect(capability.context.voices.map(voice => voice.calls.includes('stop'))).toEqual([true, false, true]);
    expect(audio.getSnapshot().voices).toBe(1);
    audio.stopAll();
    expect(audio.getSnapshot().voices).toBe(0);
  });

  it('lets a listener stop a sound as soon as it starts', () => {
    const { audio, capability } = setup({ initialState: 'running' });
    audio.subscribe(() => { if (audio.getSnapshot().voices === 1) audio.stop(IDS[0]); });
    expect(audio.audition(IDS[0])).toEqual({ status: 'started' });
    expect(capability.context.voices[0].calls).toEqual(['start', 'stop', 'disconnect']);
    expect(audio.getSnapshot().voices).toBe(0);
  });

  it('forgets each voice when it ends, while another keeps playing', () => {
    const { audio, capability } = setup({ initialState: 'running' });
    audio.audition(IDS[0]);
    for (let round = 0; round < 3; round++) {
      audio.audition(IDS[1]);
      capability.context.voices.at(-1)!.end();
    }
    expect(audio.getSnapshot().voices).toBe(1);
    // Only the playing voice is still recorded: stopping the ended sound touches none of its voices.
    audio.stop(IDS[1]);
    expect(capability.context.voices.slice(1).map(voice => voice.calls)).toEqual(Array(3).fill(['start', 'disconnect']));
    expect([...capability.context.voices[0].ended]).toHaveLength(2);
    audio.stop(IDS[0]);
    expect([...capability.context.voices[0].ended]).toHaveLength(0);
  });

  it('reports what a listener throws and notifies the others', () => {
    const { audio, reportError } = setup({ initialState: 'running' });
    const failure = new Error('listener');
    const other = vi.fn();
    audio.subscribe(() => { throw failure; });
    audio.subscribe(other);
    audio.audition(IDS[0]);
    expect(other).toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(failure);
  });
});

describe('closing the audio context', () => {
  it('reports no context when no audition ever unlocked one', async () => {
    const { audio, lifecycle } = setup();
    expect(await audio.dispose()).toEqual({ status: 'no-context' });
    expect(lifecycle.count).toBe(0);
  });

  it.each([
    ['resolves', 'resolve', { status: 'closed' }],
    ['rejects', 'reject', { status: 'close-failed', cause: new Error('close rejected') }],
    ['throws', 'throw', { status: 'close-failed', cause: new Error('close threw') }],
  ] as const)('observes the context close when it %s', async (_name, closing, outcome) => {
    const { audio, capability, lifecycle } = setup({ initialState: 'running' });
    audio.audition(IDS[0]);
    capability.context.closing = closing;
    const first = audio.dispose();
    expect(audio.dispose()).toBe(first);
    expect(await first).toEqual(outcome);
    expect(capability.context.count('close')).toBe(1);
    expect(lifecycle.count).toBe(0);
    expect(audio.audition(IDS[0])).toEqual({ status: 'rejected', code: 'disposed' });
  });

  it('stays unconfirmed while the close is pending', async () => {
    const { audio, capability } = setup({ initialState: 'running' });
    audio.audition(IDS[0]);
    capability.context.closing = 'pending';
    expect(await settled(audio.dispose())).toBe(false);
  });

  it('counts a context the host already closed as closed', async () => {
    const { audio, capability } = setup({ initialState: 'running' });
    audio.audition(IDS[0]);
    capability.context.setState('closed');
    expect(await audio.dispose()).toEqual({ status: 'closed' });
    expect(capability.context.count('close')).toBe(0);
  });

  it('notifies no one after disposal', async () => {
    const { audio, capability } = setup();
    const listener = vi.fn();
    audio.subscribe(listener);
    audio.audition(IDS[0]);
    listener.mockClear();
    await audio.dispose();
    capability.context.setState('running');
    expect(listener).not.toHaveBeenCalled();
  });
});
