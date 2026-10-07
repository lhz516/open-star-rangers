import { describe, expect, it } from 'vitest';
import { AUDIO_VOICE_LIMIT, createAudioController, type AudioController } from './audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound } from './audio-controller.test-support.ts';

// The controller never changes these bytes, which the ownership test checks with a record of its own.
const SOUND_RECORDS = Object.freeze([
  Object.freeze({ id: 'sound/fire', schemaVersion: 1, bytes: sound() }),
  Object.freeze({ id: 'sound/warp', schemaVersion: 1, bytes: sound({ channels: 2, encoding: 's16le', loop: 'whole', sampleRate: 22_050, pcm: Uint8Array.of(0, 0x80, 0xff, 0x7f) }) }),
]);

function setup(options: { visible?: boolean; initialState?: string } = {}) {
  const audio = new FakeAudio();
  audio.initialState = options.initialState ?? 'suspended';
  const lifecycle = new FakeLifecycle();
  lifecycle.isVisible = options.visible ?? true;
  const errors: unknown[] = [];
  const controller = createAudioController({ audio, lifecycle, reportError: error => errors.push(error) });
  return { audio, lifecycle, errors, controller };
}

/** A controller whose context runs, with both synthetic sounds loaded. */
function running() {
  const fixture = setup({ initialState: 'running' });
  expect(fixture.controller.load(SOUND_RECORDS)).toEqual({ status: 'loaded', count: 2 });
  expect(fixture.controller.unlock()).toBe('running');
  return fixture;
}

const statuses = (controller: AudioController) => controller.getSnapshot().status;

describe('audio controller creation and loading', () => {
  it('starts idle without a context and listens to the page lifecycle', () => {
    const { audio, lifecycle, controller } = setup();
    expect(controller.getSnapshot()).toEqual({ status: 'idle', loaded: 0, voices: 0 });
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true);
    expect(audio.contexts).toHaveLength(0);
    expect([...lifecycle.listeners.keys()].sort()).toEqual(['pagehide', 'pageshow', 'visibilitychange']);
    expect(AUDIO_VOICE_LIMIT).toBeGreaterThanOrEqual(4);
  });

  it('removes the listeners it added when a lifecycle registration fails', () => {
    const audio = new FakeAudio();
    const lifecycle = new FakeLifecycle();
    lifecycle.failOn = 'pageshow';
    expect(() => createAudioController({ audio, lifecycle, reportError: () => undefined })).toThrow('listen failed');
    expect([lifecycle.count, lifecycle.removed]).toEqual([0, 2]);
  });

  it('loads sounds while idle into buffers of the exact float samples', () => {
    const { audio, controller } = setup();
    expect(controller.load(SOUND_RECORDS)).toEqual({ status: 'loaded', count: 2 });
    expect(audio.contexts).toHaveLength(0);
    expect(audio.buffers.map(({ channels, sampleRate }) => [sampleRate, channels.map(channel => [...channel])])).toEqual([
      [11_025, [[-1, 0, 127 / 128]]],
      [22_050, [[-32_768 / 32_768], [32_767 / 32_768]]],
    ]);
    expect(controller.getSnapshot()).toEqual({ status: 'idle', loaded: 2, voices: 0 });
  });

  it.each([
    ['an invalid payload', [SOUND_RECORDS[0], { id: 'sound/bad', schemaVersion: 1, bytes: Uint8Array.of(1, 2, 3) }], 'invalid-sound-payload', 'sound/bad'],
    ['another payload schema', [{ ...SOUND_RECORDS[0], schemaVersion: 2 }], 'invalid-sound-payload', 'sound/fire'],
    ['a non-sound Asset', [{ id: 'image/fire', schemaVersion: 1, bytes: sound() }], 'invalid-sound-payload', 'image/fire'],
    ['an invalid Asset ID', [{ id: 'Sound Fire', schemaVersion: 1, bytes: sound() }], 'invalid-sound-payload', null],
    ['a repeated sound', [SOUND_RECORDS[0], SOUND_RECORDS[0]], 'duplicate-sound', 'sound/fire'],
  ])('registers nothing for %s', (_name, sounds, code, assetId) => {
    const { controller } = setup();
    expect(controller.load(sounds)).toEqual({ status: 'failed', code, assetId });
    expect(controller.getSnapshot().loaded).toBe(0);
  });

  it('rejects a sound that is already registered, and a buffer the host cannot create', () => {
    const { audio, controller } = setup();
    controller.load([SOUND_RECORDS[0]]);
    expect(controller.load(SOUND_RECORDS)).toEqual({ status: 'failed', code: 'duplicate-sound', assetId: 'sound/fire' });
    audio.failBuffer = true;
    expect(controller.load([SOUND_RECORDS[1]])).toEqual({ status: 'failed', code: 'audio-failed', assetId: 'sound/warp' });
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 1, voices: 0 });
  });

  it('fails and stops every voice when the host cannot create a buffer while playing', () => {
    const { audio, controller } = running();
    controller.play('sound/warp');
    audio.failBuffer = true;
    expect(controller.load([{ ...SOUND_RECORDS[0], id: 'sound/missile' }])).toEqual({ status: 'failed', code: 'audio-failed', assetId: 'sound/missile' });
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 2, voices: 0 });
    expect(audio.context.voices[0].calls).toEqual(['start', 'stop', 'disconnect']);
  });

  it('never keeps, changes or transfers the caller payload', () => {
    const { audio, controller } = running();
    const record = { id: 'sound/explosion', schemaVersion: 1, bytes: sound({ pcm: Uint8Array.of(255, 255) }) };
    const before = [...record.bytes];
    controller.load([record]);
    expect([...record.bytes]).toEqual(before);
    record.bytes.fill(0);
    structuredClone(record.bytes, { transfer: [record.bytes.buffer] });
    expect([...audio.buffers[2].channels[0]]).toEqual([127 / 128, 127 / 128]);
    expect(controller.play('sound/explosion').status).toBe('started');
  });
});

describe('audio controller unlocking and playing', () => {
  it('runs at once when the browser allows audio, creating one context and no resume', () => {
    const { audio, controller } = setup({ initialState: 'running' });
    expect(controller.unlock()).toBe('running');
    expect(controller.unlock()).toBe('running');
    expect(audio.contexts).toHaveLength(1);
    expect(audio.context.count('resume')).toBe(0);
  });

  it('stays locked while the browser blocks audio, never waiting for resume, until a later gesture unlocks it', () => {
    const { audio, controller } = setup();
    controller.load(SOUND_RECORDS);
    expect(controller.unlock()).toBe('locked');
    expect(audio.context.count('resume')).toBe(1);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-locked' });
    expect(audio.context.voices).toHaveLength(0);
    expect(controller.unlock()).toBe('locked');
    expect(audio.context.count('resume')).toBe(2);
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
    expect(controller.play('sound/fire').status).toBe('started');
    expect(audio.contexts).toHaveLength(1);
  });

  it('becomes unavailable for good when no context can be created', () => {
    const { audio, controller } = setup();
    audio.failContext = true;
    expect(controller.unlock()).toBe('unavailable');
    audio.failContext = false;
    expect(controller.unlock()).toBe('unavailable');
    expect(audio.contexts).toHaveLength(0);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-unavailable' });
    expect(controller.load(SOUND_RECORDS)).toEqual({ status: 'failed', code: 'audio-unavailable', assetId: null });
  });

  it('rejects play while idle, for an unknown sound and at the voice limit', () => {
    const idle = setup();
    expect(idle.controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-locked' });
    const { audio, controller } = running();
    expect(controller.play('sound/missing')).toEqual({ status: 'rejected', code: 'unknown-sound' });
    for (let index = 0; index < AUDIO_VOICE_LIMIT; index++) expect(controller.play('sound/fire').status).toBe('started');
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'voice-limit' });
    expect(controller.getSnapshot().voices).toBe(AUDIO_VOICE_LIMIT);
    expect(audio.context.voices).toHaveLength(AUDIO_VOICE_LIMIT);
  });

  it('starts a new voice per play, loops a whole-loop sound, and releases a voice when it ends', () => {
    const { audio, controller } = running();
    const fire = controller.play('sound/fire');
    const warp = controller.play('sound/warp');
    expect(fire.status === 'started' && warp.status === 'started' && fire.voice !== warp.voice).toBe(true);
    const [fireVoice, warpVoice] = audio.context.voices;
    expect([fireVoice.loop, warpVoice.loop, fireVoice.calls, fireVoice.buffer]).toEqual([false, true, ['start'], audio.buffers[0]]);
    fireVoice.end();
    expect([fireVoice.calls, fireVoice.ended.size, controller.getSnapshot().voices]).toEqual([['start', 'disconnect'], 0, 1]);
    fireVoice.end();
    expect(controller.getSnapshot().voices).toBe(1);
  });

  it('stops one voice or all of them, repeatably', () => {
    const { audio, controller } = running();
    const first = controller.play('sound/fire');
    controller.play('sound/warp');
    if (first.status !== 'started') throw new Error('expected a voice');
    expect([controller.stop(first.voice), controller.stop(first.voice), controller.stop(999)]).toEqual([true, false, false]);
    expect(audio.context.voices[0].calls).toEqual(['start', 'stop', 'disconnect']);
    controller.stopAll();
    controller.stopAll();
    expect(audio.context.voices[1].calls).toEqual(['start', 'stop', 'disconnect']);
    expect(controller.getSnapshot().voices).toBe(0);
  });

  it('fails when the host cannot start a voice', () => {
    const { audio, controller } = running();
    controller.play('sound/warp');
    audio.context.failVoice = true;
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-failed' });
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 2, voices: 0 });
    expect(controller.unlock()).toBe('failed');
    expect(controller.load([{ ...SOUND_RECORDS[0], id: 'sound/missile' }])).toEqual({ status: 'failed', code: 'audio-failed', assetId: null });
  });

  it('fails without escaping unlock when the context cannot report state changes, and still closes it', () => {
    const { audio, controller } = setup();
    audio.failListen = true;
    expect(controller.unlock()).toBe('failed');
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-failed' });
    controller.dispose();
    expect(audio.context.count('close')).toBe(1);
  });

  it('fails when the host closes the context', () => {
    const { audio, controller } = running();
    controller.play('sound/warp');
    audio.context.setState('closed');
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 2, voices: 0 });
    expect(audio.context.voices[0].calls).toEqual(['start', 'stop', 'disconnect']);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-failed' });
    audio.context.setState('running');
    expect(statuses(controller)).toBe('failed');
  });

  it.each(['suspended', 'interrupted'])('stops every voice when the browser makes the context %s, and never replays', state => {
    const { audio, controller } = running();
    controller.play('sound/warp');
    audio.context.setState(state);
    expect(controller.getSnapshot()).toEqual({ status: 'suspended', loaded: 2, voices: 0 });
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-suspended' });
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 2, voices: 0 });
    audio.context.setState(state);
    expect(controller.unlock()).toBe('suspended');
    expect(audio.context.count('resume')).toBe(1);
  });
});

describe('audio controller page visibility', () => {
  it('suspends a running context when hidden, stopping every voice, and resumes it when shown without replay', () => {
    const { audio, lifecycle, controller } = running();
    controller.play('sound/warp');
    lifecycle.hide();
    expect(controller.getSnapshot()).toEqual({ status: 'suspended', loaded: 2, voices: 0 });
    expect(audio.context.count('suspend')).toBe(1);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-suspended' });
    audio.context.setState('suspended');
    lifecycle.show();
    expect(audio.context.count('resume')).toBe(1);
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 2, voices: 0 });
    expect(audio.context.voices).toHaveLength(1);
  });

  it('handles pagehide and pageshow like hiding and showing', () => {
    const { audio, lifecycle, controller } = running();
    controller.play('sound/warp');
    lifecycle.isVisible = false;
    lifecycle.fire('pagehide');
    expect(controller.getSnapshot()).toEqual({ status: 'suspended', loaded: 2, voices: 0 });
    lifecycle.fire('pageshow');
    expect(audio.context.count('resume')).toBe(0);
    lifecycle.isVisible = true;
    lifecycle.fire('pageshow');
    expect(audio.context.count('resume')).toBe(1);
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
  });

  it('stays suspended when shown if the context does not run again, until the next unlock', () => {
    const { audio, lifecycle, controller } = running();
    lifecycle.hide();
    audio.context.setState('suspended');
    lifecycle.show();
    expect(statuses(controller)).toBe('suspended');
    lifecycle.hide();
    lifecycle.show();
    expect(audio.context.count('resume')).toBe(1);
    expect(controller.unlock()).toBe('suspended');
    expect(audio.context.count('resume')).toBe(2);
  });

  it('keeps an idle controller idle across hiding and showing, without creating a context', () => {
    const { audio, lifecycle, controller } = setup();
    lifecycle.hide();
    lifecycle.show();
    expect([statuses(controller), audio.contexts.length]).toEqual(['idle', 0]);
  });

  it('keeps a locked controller locked across hiding and showing', () => {
    const { audio, lifecycle, controller } = setup();
    controller.unlock();
    lifecycle.hide();
    lifecycle.show();
    expect(statuses(controller)).toBe('locked');
    expect([audio.context.count('suspend'), audio.context.count('resume')]).toEqual([0, 1]);
  });

  it('keeps a failed controller failed across hiding and showing', () => {
    const { audio, lifecycle, controller } = running();
    audio.context.setState('closed');
    lifecycle.hide();
    lifecycle.show();
    expect(statuses(controller)).toBe('failed');
    expect([audio.context.count('suspend'), audio.context.count('resume')]).toEqual([0, 0]);
  });

  it('neither creates nor resumes a context when unlocked while hidden', () => {
    const hiddenIdle = setup();
    hiddenIdle.lifecycle.hide();
    expect(hiddenIdle.controller.unlock()).toBe('idle');
    expect(hiddenIdle.audio.contexts).toHaveLength(0);

    const { audio, lifecycle, controller } = setup();
    controller.unlock();
    lifecycle.hide();
    expect(controller.unlock()).toBe('locked');
    expect(audio.context.count('resume')).toBe(1);
  });

  it('suspends again when a resume issued before hiding settles after it, so no voice starts while hidden', () => {
    const { audio, lifecycle, controller } = setup();
    controller.load(SOUND_RECORDS);
    controller.unlock();
    lifecycle.hide();
    audio.context.setState('running');
    expect(statuses(controller)).toBe('suspended');
    expect(audio.context.count('suspend')).toBe(1);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-suspended' });
    expect(audio.context.voices).toHaveLength(0);
    audio.context.setState('suspended');
    lifecycle.show();
    expect(audio.context.count('resume')).toBe(2);
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
  });

  it('starts hidden when the page is hidden at creation', () => {
    const { audio, lifecycle, controller } = setup({ visible: false, initialState: 'running' });
    expect(controller.unlock()).toBe('idle');
    expect(audio.contexts).toHaveLength(0);
    lifecycle.show();
    expect(controller.unlock()).toBe('running');
  });
});

describe('audio controller disposal and snapshots', () => {
  it('never creates a context to dispose, and removes every listener', () => {
    const { audio, lifecycle, controller } = setup();
    controller.load(SOUND_RECORDS);
    controller.dispose();
    expect([audio.contexts.length, lifecycle.count, controller.getSnapshot()]).toEqual([0, 0, { status: 'disposed', loaded: 0, voices: 0 }]);
    expect(controller.unlock()).toBe('disposed');
    expect(audio.contexts).toHaveLength(0);
  });

  it('stops every voice and closes a live context exactly once', () => {
    const { audio, lifecycle, controller } = running();
    controller.play('sound/warp');
    const notified: string[] = [];
    controller.subscribe(() => notified.push(statuses(controller)));
    controller.dispose();
    controller.dispose();
    expect(audio.context.count('close')).toBe(1);
    expect(audio.context.voices[0].calls).toEqual(['start', 'stop', 'disconnect']);
    expect([audio.context.listeners.size, audio.context.voices[0].ended.size, lifecycle.count]).toEqual([0, 0, 0]);
    expect(notified).toEqual(['disposed']);
    audio.context.setState('running');
    lifecycle.hide();
    expect(notified).toEqual(['disposed']);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'disposed' });
    expect(controller.load(SOUND_RECORDS)).toEqual({ status: 'failed', code: 'disposed', assetId: null });
    expect(controller.stop(1)).toBe(false);
    expect(controller.subscribe(() => notified.push('late'))).toBeTypeOf('function');
  });

  it('does not close a context the host already closed', () => {
    const { audio, controller } = running();
    audio.context.setState('closed');
    controller.dispose();
    expect(audio.context.count('close')).toBe(0);
  });

  it('keeps one frozen snapshot between changes', () => {
    const { controller } = running();
    const first = controller.getSnapshot();
    controller.unlock();
    controller.stopAll();
    expect(controller.getSnapshot()).toBe(first);
    controller.play('sound/fire');
    expect(controller.getSnapshot()).not.toBe(first);
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true);
  });

  it.each([
    ['hiding', (fixture: ReturnType<typeof running>) => fixture.lifecycle.hide(), 'audio-suspended'],
    ['a browser suspension', (fixture: ReturnType<typeof running>) => fixture.audio.context.setState('suspended'), 'audio-suspended'],
    ['a host failure', (fixture: ReturnType<typeof running>) => fixture.audio.context.setState('closed'), 'audio-failed'],
  ] as const)('lets no subscriber start a voice while leaving running for %s', (_name, leave, code) => {
    const fixture = running();
    const { audio, controller } = fixture;
    controller.play('sound/warp');
    const attempts: unknown[] = [];
    controller.subscribe(() => attempts.push(controller.play('sound/fire')));
    leave(fixture);
    expect(attempts).toEqual([{ status: 'rejected', code }]);
    expect(audio.context.voices).toHaveLength(1);
    expect(controller.getSnapshot().voices).toBe(0);
  });

  it('lets no subscriber re-dispose or play during disposal', () => {
    const { audio, controller } = running();
    controller.play('sound/warp');
    const attempts: unknown[] = [];
    controller.subscribe(() => {
      attempts.push(controller.play('sound/fire'));
      controller.dispose();
    });
    controller.dispose();
    expect(attempts).toEqual([{ status: 'rejected', code: 'disposed' }]);
    expect([audio.context.count('close'), audio.context.voices.length]).toEqual([1, 1]);
  });

  it('isolates subscriber and voice cleanup errors', () => {
    const { audio, errors, controller } = running();
    const calls: string[] = [];
    const failure = new Error('subscriber failed');
    controller.subscribe(() => { calls.push('first'); throw failure; });
    const unsubscribe = controller.subscribe(() => calls.push('second'));
    controller.play('sound/fire');
    expect(calls).toEqual(['first', 'second']);
    expect(errors).toEqual([failure]);
    unsubscribe();
    audio.context.voices[0].failStop = true;
    controller.stopAll();
    expect(errors).toHaveLength(3);
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 2, voices: 0 });
    expect(audio.context.voices[0].calls).toEqual(['start', 'stop', 'disconnect']);
  });
});
