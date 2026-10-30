import { describe, expect, it } from 'vitest';
import { SOUND_PAYLOAD_SCHEMA_VERSION as SCHEMA } from '../../content/sound-payload.ts';
import {
  AUDIO_ENDED_HISTORY, AUDIO_RATE_LIMIT, AUDIO_VOICE_LIMIT, createAudioController, type AudioController, type PlayResult,
} from './audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound, type FakeParameterVoice, type FakeVoice } from './audio-controller.test-support.ts';

// The controller never changes these bytes, which the ownership test checks with a record of its own.
const SOUND_RECORDS = Object.freeze([
  Object.freeze({ id: 'sound/fire', schemaVersion: SCHEMA, bytes: sound() }),
  Object.freeze({ id: 'sound/warp', schemaVersion: SCHEMA, bytes: sound({ channels: 2, encoding: 's16le', loop: 'whole', sampleRate: 22_050, pcm: Uint8Array.of(0, 0x80, 0xff, 0x7f) }) }),
]);
/** A sound of 1000 frames at 8000 Hz, 0.125 s, that plays three times through. */
const REPEAT_RECORD = Object.freeze({
  id: 'sound/arrival', schemaVersion: SCHEMA, bytes: sound({ sampleRate: 8_000, loop: 'repeat', plays: 3, pcm: new Uint8Array(1_000).fill(192) }),
});

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
    ['an invalid payload', [SOUND_RECORDS[0], { id: 'sound/bad', schemaVersion: SCHEMA, bytes: Uint8Array.of(1, 2, 3) }], 'invalid-sound-payload', 'sound/bad'],
    // Schema 1 `none` and `whole` payloads have the same bytes; only the record's version tells them apart.
    ['a schema 1 sound', [{ ...SOUND_RECORDS[0], schemaVersion: 1 }], 'invalid-sound-payload', 'sound/fire'],
    ['a later payload schema', [{ ...SOUND_RECORDS[0], schemaVersion: 3 }], 'invalid-sound-payload', 'sound/fire'],
    ['a non-sound Asset', [{ id: 'image/fire', schemaVersion: SCHEMA, bytes: sound() }], 'invalid-sound-payload', 'image/fire'],
    ['an invalid Asset ID', [{ id: 'Sound Fire', schemaVersion: SCHEMA, bytes: sound() }], 'invalid-sound-payload', null],
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
    const record = { id: 'sound/explosion', schemaVersion: SCHEMA, bytes: sound({ pcm: Uint8Array.of(255, 255) }) };
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

  it('loops a repeat sound from a context time and stops it after its passes, released when it ends or stops early', () => {
    const { audio, controller } = running();
    expect(controller.load([REPEAT_RECORD])).toEqual({ status: 'loaded', count: 1 });
    // One pass of the clip: the voice repeats it, so the buffer holds no copies.
    expect(audio.buffers.slice(2).map(({ channels, sampleRate }) => [sampleRate, channels.map(channel => channel.length)])).toEqual([[8_000, [1_000]]]);
    audio.context.currentTime = 1.5;
    const ended = controller.play('sound/arrival');
    audio.context.currentTime = 2;
    const stopped = controller.play('sound/arrival');
    if (ended.status !== 'started' || stopped.status !== 'started') throw new Error('expected two voices');
    const [endedVoice, stoppedVoice] = audio.context.voices;
    // Three passes of 0.125 s from the start time.
    expect([endedVoice.loop, endedVoice.buffer, endedVoice.calls]).toEqual([true, audio.buffers[2], ['start 1.5', 'stop 1.875']]);
    expect(stoppedVoice.calls).toEqual(['start 2', 'stop 2.375']);
    // The host ends the voice at its scheduled stop; the controller only releases it.
    endedVoice.end();
    expect([endedVoice.calls, endedVoice.ended.size, controller.getSnapshot().voices]).toEqual([['start 1.5', 'stop 1.875', 'disconnect'], 0, 1]);
    // Stopped before its passes are done: an immediate stop replaces the scheduled one.
    expect(controller.stop(stopped.voice)).toBe(true);
    expect([stoppedVoice.calls, stoppedVoice.ended.size, controller.getSnapshot().voices]).toEqual([['start 2', 'stop 2.375', 'stop', 'disconnect'], 0, 0]);
  });

  it('fails when the host cannot schedule a repeat sound', () => {
    const { audio, controller } = running();
    controller.load([REPEAT_RECORD]);
    Object.defineProperty(audio.context, 'currentTime', { get: () => { throw new Error('InvalidStateError'); } });
    expect(controller.play('sound/arrival')).toEqual({ status: 'rejected', code: 'audio-failed' });
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 3, voices: 0 });
    expect(audio.context.voices[0].calls).toEqual(['stop', 'disconnect']);
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

/** Eight passes of 1000 frames at 11025 Hz, as the warp arrival plays them. */
const ARRIVAL_RECORD = Object.freeze({
  id: 'sound/warp-arrival', schemaVersion: SCHEMA, bytes: sound({ sampleRate: 11_025, loop: 'repeat', plays: 8, pcm: new Uint8Array(1_000).fill(64) }),
});

/** A running controller with the two plain sounds and both repeat sounds. */
function withRepeats() {
  const fixture = running();
  expect(fixture.controller.load([REPEAT_RECORD, ARRIVAL_RECORD])).toEqual({ status: 'loaded', count: 2 });
  return fixture;
}

const voiceOf = (result: PlayResult): number => {
  if (result.status !== 'started') throw new Error(`expected a voice, got ${result.code}`);
  return result.voice;
};
const parameterVoice = (audio: FakeAudio, index: number) => audio.context.voices[index] as FakeParameterVoice;
/** The context time of a voice's last scheduled stop. */
const lastStop = (voice: FakeVoice): number => Number(voice.calls.filter(call => call.startsWith('stop ')).at(-1)!.slice('stop '.length));
const ended = (reason: string) => ({ status: 'ended', reason });
const updateRejected = (code: string) => ({ status: 'rejected', code });

describe('audio controller voice parameters', () => {
  it('applies initial parameters when it creates the voice, before it starts, defaulting what is not given', () => {
    const { audio, controller } = running();
    voiceOf(controller.play('sound/fire', { volume: 64, pan: 0, rate: 22_050 }));
    voiceOf(controller.play('sound/fire', {}));
    voiceOf(controller.play('sound/fire'));
    const [given, defaults, fixed] = audio.context.voices;
    // A fixed voice gets no parameter nodes.
    expect([given.initial, defaults.initial, fixed.initial, 'setParameters' in fixed]).toEqual([
      { gain: 64 / 127, left: 1, right: 0, playbackRate: 2 },
      { gain: 1, left: 1, right: 1, playbackRate: 1 },
      null,
      false,
    ]);
    expect(audio.context.voices.map(voice => voice.calls)).toEqual([['start'], ['start'], ['start']]);
  });

  it('rejects invalid parameters without a handle, a node or a count, after the earlier refusals', () => {
    const idle = setup();
    idle.controller.load(SOUND_RECORDS);
    expect(idle.controller.play('sound/fire', { volume: 999 })).toEqual({ status: 'rejected', code: 'audio-locked' });
    const { audio, controller } = running();
    expect(controller.play('sound/missing', { volume: 999 })).toEqual({ status: 'rejected', code: 'unknown-sound' });
    const first = voiceOf(controller.play('sound/fire'));
    for (const parameters of [{ volume: 128 }, { pan: -1 }, { rate: 0 }, { rate: AUDIO_RATE_LIMIT + 1 }, { volume: 1.5 }, { pan: Number.NaN }, { volume: 1, rate: -1 }]) {
      expect(controller.play('sound/fire', parameters)).toEqual({ status: 'rejected', code: 'invalid-parameters' });
    }
    expect(controller.play('sound/fire', null as never)).toEqual({ status: 'rejected', code: 'invalid-parameters' });
    expect([audio.context.voices.length, controller.getSnapshot().voices]).toEqual([1, 1]);
    expect(voiceOf(controller.play('sound/fire', { volume: 0, pan: 127, rate: AUDIO_RATE_LIMIT }))).toBe(first + 1);
    expect(controller.voiceState(first + 1)).toEqual({ status: 'playing' });
  });

  it('disconnects a voice whose end listener the host cannot add, and fails', () => {
    const { audio, controller } = running();
    const other = voiceOf(controller.play('sound/warp', {}));
    audio.context.failEnded = true;
    expect(controller.play('sound/fire', { pan: 0 })).toEqual({ status: 'rejected', code: 'audio-failed' });
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 2, voices: 0 });
    expect(audio.context.voices.map(port => port.calls)).toEqual([['start', 'stop', 'disconnect'], ['disconnect']]);
    expect(controller.voiceState(other)).toEqual(ended('released'));
  });

  it('defaults to the stored rate, which only a given rate is checked against', () => {
    const { audio, controller } = running();
    const record = { id: 'sound/fast', schemaVersion: SCHEMA, bytes: sound({ sampleRate: 48_000 }) };
    controller.load([record]);
    const voice = voiceOf(controller.play('sound/fast', { pan: 0 }));
    expect(controller.update(voice, { volume: 5 })).toEqual({ status: 'updated' });
    expect(controller.update(voice, { rate: 48_000 })).toEqual(updateRejected('invalid-parameters'));
    expect([parameterVoice(audio, 0).initial.playbackRate, parameterVoice(audio, 0).settings.map(({ parameters }) => parameters.playbackRate)]).toEqual([1, [1]]);
  });

  it('counts parameterised voices toward the voice limit', () => {
    const { audio, controller } = running();
    for (let index = 0; index < AUDIO_VOICE_LIMIT; index++) voiceOf(controller.play('sound/fire', { pan: index }));
    expect(controller.play('sound/fire', { pan: 0 })).toEqual({ status: 'rejected', code: 'voice-limit' });
    expect(audio.context.voices).toHaveLength(AUDIO_VOICE_LIMIT);
  });

  it('updates a parameterised voice all at once at the context time, or not at all', () => {
    const { audio, controller } = running();
    const voice = voiceOf(controller.play('sound/fire', { volume: 10 }));
    const port = parameterVoice(audio, 0);
    audio.context.currentTime = 0.5;
    expect(controller.update(voice, { pan: 127, rate: 5_512 })).toEqual({ status: 'updated' });
    const applied = { gain: 10 / 127, left: 0, right: 1, playbackRate: 5_512 / 11_025 };
    expect(port.settings).toEqual([{ parameters: applied, when: 0.5 }]);
    // One bad value applies none of the given ones; the next update starts from the last applied.
    expect(controller.update(voice, { volume: 20, pan: 128 })).toEqual(updateRejected('invalid-parameters'));
    expect(port.settings).toHaveLength(1);
    // Values that change nothing need no host call.
    audio.context.currentTime = 0.75;
    expect(controller.update(voice, {})).toEqual({ status: 'updated' });
    expect(controller.update(voice, { volume: 10, pan: 127 })).toEqual({ status: 'updated' });
    expect(controller.update(voice, { volume: 11 })).toEqual({ status: 'updated' });
    expect(port.settings[1]).toEqual({ parameters: { ...applied, gain: 11 / 127 }, when: 0.75 });
    // A `none` voice has no stop to reschedule.
    expect(port.calls).toEqual(['start', 'set 0.5', 'set 0.75']);
  });

  it('rejects an update for a fixed, unknown or ended voice and after disposal', () => {
    const { audio, controller } = running();
    const fixed = voiceOf(controller.play('sound/fire'));
    expect(controller.update(fixed, { volume: 1 })).toEqual(updateRejected('fixed-parameters'));
    expect(controller.update(fixed, { volume: 999 })).toEqual(updateRejected('fixed-parameters'));
    expect(controller.update(999, {})).toEqual(updateRejected('unknown-voice'));
    const done = voiceOf(controller.play('sound/fire', {}));
    audio.context.voices[1].end();
    expect(controller.update(done, { volume: 1 })).toEqual(updateRejected('unknown-voice'));
    expect(audio.context.voices[0].calls).toEqual(['start']);
    controller.dispose();
    expect(controller.update(fixed, {})).toEqual(updateRejected('disposed'));
  });

  it('fails and releases every voice when the host cannot apply an update', () => {
    const { audio, controller } = running();
    const voice = voiceOf(controller.play('sound/fire', {}));
    const other = voiceOf(controller.play('sound/warp'));
    parameterVoice(audio, 0).failSet = true;
    expect(controller.update(voice, { volume: 1 })).toEqual(updateRejected('audio-failed'));
    expect(controller.getSnapshot()).toEqual({ status: 'failed', loaded: 2, voices: 0 });
    expect([controller.voiceState(voice), controller.voiceState(other)]).toEqual([ended('released'), ended('released')]);
    expect(audio.context.voices.map(port => port.calls)).toEqual([['start', 'stop', 'disconnect'], ['start', 'stop', 'disconnect']]);
  });
});

describe('audio controller voice states', () => {
  it('reports playing voices and keeps each voice\'s first end reason, whatever arrives later', () => {
    const { audio, lifecycle, controller } = running();
    const [natural, stopped, preempted, all] = ['sound/fire', 'sound/fire', 'sound/fire', 'sound/warp'].map(id => voiceOf(controller.play(id, {})));
    const ports = audio.context.voices;
    const before = ports.map(port => [...port.calls]);
    expect([natural, stopped, preempted, all].map(voice => controller.voiceState(voice))).toEqual(Array(4).fill({ status: 'playing' }));
    // Reading touches nothing in the host.
    expect([ports.map(port => port.calls), audio.context.calls]).toEqual([before, []]);
    ports[0].end();
    // An end event that arrives after the voice was stopped changes nothing.
    const lateEnd = [...ports[1].ended];
    expect(controller.stop(stopped)).toBe(true);
    for (const listener of lateEnd) listener();
    expect(controller.stop(preempted, 'preempted')).toBe(true);
    expect(controller.stop(preempted)).toBe(false);
    expect(controller.getSnapshot().voices).toBe(1);
    controller.stopAll();
    const hidden = voiceOf(controller.play('sound/fire', {}));
    lifecycle.hide();
    expect([natural, stopped, preempted, all, hidden].map(voice => controller.voiceState(voice))).toEqual([
      ended('natural'), ended('stopped'), ended('preempted'), ended('stopped'), ended('released'),
    ]);
    // Every parameterised voice was disconnected once, whatever ended it.
    expect(ports.map(port => port.calls.filter(call => call === 'disconnect').length)).toEqual([1, 1, 1, 1, 1]);
    expect(ports.map(port => port.ended.size)).toEqual([0, 0, 0, 0, 0]);
    expect([controller.voiceState(0), controller.voiceState(hidden + 1), controller.voiceState(1.5)]).toEqual(Array(3).fill({ status: 'unknown' }));
  });

  it('releases voices on disposal and keeps the end reasons of the last AUDIO_ENDED_HISTORY voices only', () => {
    const { controller } = running();
    const first = voiceOf(controller.play('sound/fire'));
    controller.stop(first);
    for (let index = 1; index < AUDIO_ENDED_HISTORY; index++) controller.stop(voiceOf(controller.play('sound/fire')));
    expect(controller.voiceState(first)).toEqual(ended('stopped'));
    const last = voiceOf(controller.play('sound/fire'));
    controller.dispose();
    expect([controller.voiceState(first), controller.voiceState(first + 1), controller.voiceState(last)]).toEqual([
      { status: 'unknown' }, ended('stopped'), ended('released'),
    ]);
  });
});

describe('audio controller repeat passes', () => {
  it('plays exactly the passes at the initial rate, eight for an uninterrupted warp arrival', () => {
    const { audio, controller } = withRepeats();
    audio.context.currentTime = 2;
    const plain = voiceOf(controller.play('sound/warp-arrival'));
    voiceOf(controller.play('sound/warp-arrival', { rate: 22_050 }));
    voiceOf(controller.play('sound/warp-arrival', { rate: 5_000 }));
    const [fixed, fast, slow] = audio.context.voices;
    expect([fixed.calls, fast.calls, slow.calls]).toEqual([
      ['start 2', `stop ${2 + 8_000 / 11_025}`],
      ['start 2', `stop ${2 + 8_000 / 22_050}`],
      ['start 2', `stop ${2 + 8_000 / 5_000}`],
    ]);
    // One pass in the buffer, for any rate.
    expect([fixed.buffer, fast.buffer, slow.buffer].every(buffer => buffer === audio.buffers[3])).toBe(true);
    fixed.end();
    expect(controller.voiceState(plain)).toEqual(ended('natural'));
  });

  it('reschedules the stop from the source frames left at every rate change, and only then', () => {
    const { audio, controller } = withRepeats();
    audio.context.currentTime = 1;
    // Three passes of 1000 frames at 8000 Hz.
    const voice = voiceOf(controller.play('sound/arrival', {}));
    const port = parameterVoice(audio, 0);
    // 1000 frames played; 2000 left at twice the rate.
    audio.context.currentTime = 1.125;
    controller.update(voice, { rate: 16_000 });
    // 1000 more played; 1000 left at half the rate.
    audio.context.currentTime = 1.1875;
    controller.update(voice, { rate: 4_000 });
    // The same rate: the scheduled stop holds.
    audio.context.currentTime = 1.3;
    controller.update(voice, { volume: 3, rate: 4_000 });
    expect(port.calls).toEqual(['start 1', 'stop 1.375', 'set 1.125', 'stop 1.25', 'set 1.1875', 'stop 1.4375', 'set 1.3']);
    port.end();
    expect(controller.voiceState(voice)).toEqual(ended('natural'));
  });

  it('consumes no passes while the context time stands still, and never resumes a voice stopped early', () => {
    const { audio, controller } = withRepeats();
    audio.context.currentTime = 1;
    const voice = voiceOf(controller.play('sound/arrival', {}));
    const port = parameterVoice(audio, 0);
    audio.context.currentTime = 1.125;
    controller.update(voice, { rate: 16_000 });
    controller.update(voice, { rate: 8_000 });
    expect(lastStop(port)).toBe(1.375);
    expect(controller.stop(voice)).toBe(true);
    expect(controller.update(voice, { rate: 1 })).toEqual(updateRejected('unknown-voice'));
    expect(port.calls).toEqual(['start 1', 'stop 1.375', 'set 1.125', 'stop 1.25', 'set 1.125', 'stop 1.375', 'stop', 'disconnect']);
    expect(controller.voiceState(voice)).toEqual(ended('stopped'));
  });

  it('keeps the passes within 128 output frames times each rate step, whichever changes land a render quantum late', () => {
    const contextRate = 48_000;
    const quantum = 128 / contextRate;
    const storedRate = 11_025;
    const { audio, controller } = withRepeats();
    const voice = voiceOf(controller.play('sound/warp-arrival', {}));
    const port = parameterVoice(audio, 0);
    // The main thread reads context times on quantum boundaries.
    const rates = [[10, 22_050], [30, 5_000], [50, AUDIO_RATE_LIMIT], [90, 1_000]] as const;
    for (const [at, rate] of rates) {
      audio.context.currentTime = at * quantum;
      controller.update(voice, { rate });
    }
    const stop = lastStop(port);
    /** Source frames played up to the last scheduled stop when each change takes effect its own delay late. */
    const played = (delays: readonly number[]): number => {
      const changes = [
        { at: 0, rate: port.initial.playbackRate },
        ...port.settings.map(({ parameters, when }, index) => ({ at: when + delays[index], rate: parameters.playbackRate })),
      ];
      return changes.reduce((sum, { at, rate }, index) => sum + Math.max(0, Math.min(changes[index + 1]?.at ?? stop, stop) - at) * storedRate * rate, 0);
    };
    // 128 output frames at a playbackRate step of Δ are 128 × Δ × stored rate ÷ context rate source frames.
    const steps = port.settings.map(({ parameters }, index) =>
      Math.abs(parameters.playbackRate - (index === 0 ? port.initial : port.settings[index - 1].parameters).playbackRate));
    const bound = steps.reduce((sum, step) => sum + (128 * step * storedRate) / contextRate, 0);
    expect(bound).toBeLessThanOrEqual(128 * steps.reduce((sum, step) => sum + step, 0));
    expect(played([0, 0, 0, 0])).toBeCloseTo(8_000, 6);
    // Every combination of on-time and one-quantum-late changes.
    const errors = Array.from({ length: 2 ** rates.length }, (_, mask) =>
      Math.abs(played(rates.map((_rate, index) => ((mask >> index) & 1) * quantum)) - 8_000));
    expect(Math.max(...errors)).toBeGreaterThan(0);
    for (const error of errors) expect(error).toBeLessThanOrEqual(bound + 1e-9);
  });
});

/** Lets settled host promises run their reactions. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** A running controller with one voice of each loop mode: `none` fixed, `whole` and `repeat` with parameters. */
function withModes() {
  const fixture = withRepeats();
  const { audio, controller } = fixture;
  audio.context.currentTime = 1;
  const voices = [voiceOf(controller.play('sound/fire')), voiceOf(controller.play('sound/warp', {})), voiceOf(controller.play('sound/arrival', {}))];
  return { ...fixture, voices, ports: [...audio.context.voices] };
}

describe('audio controller task pause gate', () => {
  it('keeps every mode\'s voice where it is while paused and continues it on resume, without replay', () => {
    const { audio, controller, voices, ports } = withModes();
    audio.context.currentTime = 1.1;
    expect(controller.pause()).toBe('paused');
    expect(controller.pause()).toBe('paused');
    expect(audio.context.count('suspend')).toBe(1);
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 3 });
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill({ status: 'paused' }));
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    expect(controller.play('sound/fire', { volume: 999 })).toEqual({ status: 'rejected', code: 'audio-paused' });
    audio.context.setState('suspended');
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 3 });
    // The context time stands still while suspended, so nothing of the passes is consumed.
    expect(controller.resume()).toBe('paused');
    expect(audio.context.count('resume')).toBe(1);
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill({ status: 'paused' }));
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 3 });
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill({ status: 'playing' }));
    // Never stopped, restarted or rescheduled: the host continues each source from its position.
    expect(ports.map(port => port.calls)).toEqual([['start'], ['start'], ['start 1', 'stop 1.375']]);
    expect(audio.context.voices).toHaveLength(3);
    expect(controller.resume()).toBe('running');
    expect(audio.context.count('resume')).toBe(1);
  });

  it('applies updates to paused voices at the frozen context time, counting the passes left from there', () => {
    const { audio, controller, voices, ports } = withModes();
    audio.context.currentTime = 1.1;
    controller.pause();
    audio.context.setState('suspended');
    // 800 of 3000 source frames played; the rest at twice the rate once resumed.
    expect(controller.update(voices[2], { rate: 16_000 })).toEqual({ status: 'updated' });
    expect(controller.update(voices[1], { pan: 0 })).toEqual({ status: 'updated' });
    expect(controller.update(voices[0], { pan: 0 })).toEqual(updateRejected('fixed-parameters'));
    expect(ports[2].calls).toEqual(['start 1', 'stop 1.375', 'set 1.1', `stop ${1.1 + 2_200 / 16_000}`]);
    controller.resume();
    audio.context.setState('running');
    expect(controller.voiceState(voices[2])).toEqual({ status: 'playing' });
    ports[2].end();
    expect([controller.voiceState(voices[2]), controller.getSnapshot().voices]).toEqual([ended('natural'), 2]);
  });

  it('keeps the voices through a resume issued before the pause\'s suspension lands', () => {
    const { audio, controller, voices } = withModes();
    controller.pause();
    // A `running` before the pending suspension lands is not a resume of the paused context.
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 3 });
    expect(controller.resume()).toBe('paused');
    audio.context.setState('suspended');
    expect(controller.voiceState(voices[0])).toEqual({ status: 'paused' });
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 3 });
    expect(audio.context.count('suspend')).toBe(1);
  });

  it('keeps the voices whether the suspension settles before or after its state change is dispatched', async () => {
    const { audio, controller } = withModes();
    controller.pause();
    // As in Chromium: the state reads suspended at once and the promise settles before `statechange` is dispatched.
    audio.context.state = 'suspended';
    audio.context.suspensions[0].resolve();
    await flush();
    audio.context.setState('suspended');
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 3 });
    // A quick resume: the state reads running before the earlier suspension's `statechange` arrives.
    controller.resume();
    audio.context.state = 'running';
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 3 });
  });

  it('runs again when a quick resume left no state change, once the pause\'s suspension settles', async () => {
    const { audio, controller } = withModes();
    controller.pause();
    controller.resume();
    expect(statuses(controller)).toBe('paused');
    audio.context.suspensions[0].resolve();
    await flush();
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 3 });
  });

  it('releases what a late or spontaneous resume let play while paused, and suspends again', () => {
    const { audio, errors, controller, voices, ports } = withModes();
    controller.pause();
    audio.context.setState('suspended');
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 0 });
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill(ended('released')));
    expect(ports.map(port => port.calls.slice(-2))).toEqual(Array(3).fill(['stop', 'disconnect']));
    expect([audio.context.count('suspend'), audio.context.count('resume')]).toEqual([2, 0]);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    audio.context.setState('suspended');
    controller.resume();
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 0 });
    expect(audio.context.voices).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  it('releases every voice when the context is interrupted while paused, keeping the gate closed', () => {
    const { audio, controller, voices } = withModes();
    controller.pause();
    audio.context.setState('suspended');
    audio.context.setState('interrupted');
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 0 });
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill(ended('released')));
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    // The interruption ends with the context running: still paused, and suspended again.
    audio.context.setState('running');
    expect([statuses(controller), audio.context.count('suspend')]).toEqual(['paused', 2]);
    controller.resume();
    audio.context.setState('suspended');
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 0 });
  });

  it.each([
    ['interrupted', 'paused'],
    ['closed', 'failed'],
  ] as const)('releases every voice when the context becomes %s while the pause\'s suspension is pending', async (state, status) => {
    const { audio, errors, controller, voices } = withModes();
    controller.pause();
    audio.context.setState(state);
    expect(controller.getSnapshot()).toEqual({ status, loaded: 4, voices: 0 });
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill(ended('released')));
    // The suspension landing late keeps nothing and reports nothing.
    audio.context.suspensions[0].resolve();
    await flush();
    expect([statuses(controller), errors]).toEqual([status, []]);
  });

  it('releases every voice and stays paused when hidden while paused, and never resumes on showing', () => {
    const { audio, lifecycle, controller, voices } = withModes();
    controller.pause();
    lifecycle.hide();
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 0 });
    expect(voices.map(voice => controller.voiceState(voice))).toEqual(Array(3).fill(ended('released')));
    expect(controller.update(voices[1], { volume: 1 })).toEqual(updateRejected('unknown-voice'));
    audio.context.setState('suspended');
    // Neither showing nor a resume while hidden opens the gate.
    expect(controller.resume()).toBe('paused');
    lifecycle.show();
    lifecycle.fire('pageshow');
    expect([statuses(controller), audio.context.count('resume')]).toEqual(['paused', 0]);
    expect(controller.unlock()).toBe('paused');
    expect(audio.context.count('resume')).toBe(0);
    expect(controller.resume()).toBe('paused');
    audio.context.setState('running');
    expect(controller.getSnapshot()).toEqual({ status: 'running', loaded: 4, voices: 0 });
  });

  it('releases the voices kept for a resume still waiting for the context when hidden, as before the gate', () => {
    const { audio, lifecycle, controller } = withModes();
    controller.pause();
    audio.context.setState('suspended');
    controller.resume();
    lifecycle.hide();
    expect(controller.getSnapshot()).toEqual({ status: 'suspended', loaded: 4, voices: 0 });
    lifecycle.show();
    expect(audio.context.count('resume')).toBe(2);
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
  });

  it('pauses a context hidden before the pause, which showing then leaves suspended', () => {
    const { audio, lifecycle, controller } = running();
    lifecycle.hide();
    expect(controller.pause()).toBe('paused');
    audio.context.setState('suspended');
    lifecycle.show();
    expect([statuses(controller), audio.context.count('resume')]).toEqual(['paused', 0]);
    controller.resume();
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
  });

  it('records only the gate without a context, and takes the capability without playing when unlocked while paused', () => {
    const { audio, controller } = setup({ initialState: 'running' });
    controller.load(SOUND_RECORDS);
    expect(controller.pause()).toBe('idle');
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    expect(controller.unlock()).toBe('paused');
    // Created running in the gesture, the context is suspended again at once.
    expect(audio.context.calls).toEqual(['suspend']);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    audio.context.setState('suspended');
    expect(controller.unlock()).toBe('paused');
    expect(controller.resume()).toBe('paused');
    audio.context.setState('running');
    expect(controller.play('sound/fire').status).toBe('started');
  });

  it('waits for the autoplay policy as locked when resumed without ever having run', () => {
    const { audio, controller } = setup();
    controller.load(SOUND_RECORDS);
    controller.pause();
    expect(controller.unlock()).toBe('paused');
    expect(audio.context.calls).toEqual([]);
    expect(controller.resume()).toBe('locked');
    expect(audio.context.calls).toEqual(['resume']);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-locked' });
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
  });

  it('keeps a locked controller locked when paused, and suspends a resume that lands while paused', () => {
    const { audio, controller } = setup();
    controller.load(SOUND_RECORDS);
    expect(controller.unlock()).toBe('locked');
    expect(controller.pause()).toBe('locked');
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    // Unlocking while paused retries nothing.
    expect(controller.unlock()).toBe('locked');
    expect([audio.context.count('resume'), audio.context.count('suspend')]).toEqual([1, 0]);
    audio.context.setState('running');
    expect([statuses(controller), audio.context.count('suspend')]).toEqual(['paused', 1]);
    expect(controller.play('sound/fire')).toEqual({ status: 'rejected', code: 'audio-paused' });
    audio.context.setState('suspended');
    expect(controller.resume()).toBe('paused');
    audio.context.setState('running');
    expect(statuses(controller)).toBe('running');
  });

  it('fails and releases every voice when the pause cannot suspend the context, reporting only the error name', async () => {
    const thrown = withModes();
    thrown.audio.context.failSuspend = true;
    expect(thrown.controller.pause()).toBe('failed');
    expect(thrown.controller.getSnapshot()).toEqual({ status: 'failed', loaded: 4, voices: 0 });
    expect(thrown.voices.map(voice => thrown.controller.voiceState(voice))).toEqual(Array(3).fill(ended('released')));

    const rejecting = withModes();
    rejecting.controller.pause();
    rejecting.audio.context.suspensions[0].reject(new DOMException('secret host text', 'InvalidStateError'));
    await flush();
    expect(rejecting.controller.getSnapshot()).toEqual({ status: 'failed', loaded: 4, voices: 0 });
    for (const { errors } of [thrown, rejecting]) {
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ name: 'AudioPauseError', hostError: 'InvalidStateError' });
      expect(String((errors[0] as Error).message)).not.toContain('secret');
    }
    expect(rejecting.controller.resume()).toBe('failed');
  });

  it('ignores the settlement of a suspension no longer current: after running again, after disposal', async () => {
    const resumed = withModes();
    resumed.controller.pause();
    resumed.audio.context.setState('suspended');
    resumed.controller.resume();
    resumed.audio.context.setState('running');
    resumed.audio.context.suspensions[0].reject(new Error('late'));

    const disposed = withModes();
    disposed.controller.pause();
    disposed.controller.dispose();
    disposed.audio.context.suspensions[0].reject(new Error('late'));
    await flush();
    expect([resumed.controller.getSnapshot(), resumed.errors]).toEqual([{ status: 'running', loaded: 4, voices: 3 }, []]);
    expect([statuses(disposed.controller), disposed.errors]).toEqual(['disposed', []]);
  });

  it('returns the status unchanged for a controller that cannot play', () => {
    const { audio, controller } = running();
    audio.context.setState('closed');
    expect([controller.pause(), controller.resume()]).toEqual(['failed', 'failed']);
    controller.dispose();
    expect([controller.pause(), controller.resume()]).toEqual(['disposed', 'disposed']);
    const unavailable = setup();
    unavailable.audio.failContext = true;
    unavailable.controller.unlock();
    expect([unavailable.controller.pause(), unavailable.controller.play('sound/fire')]).toEqual(['unavailable', { status: 'rejected', code: 'audio-unavailable' }]);
  });

  it('stops paused voices on request with their own end reasons', () => {
    const { controller, voices } = withModes();
    controller.pause();
    expect(controller.stop(voices[0], 'preempted')).toBe(true);
    controller.stopAll();
    expect(voices.map(voice => controller.voiceState(voice))).toEqual([ended('preempted'), ended('stopped'), ended('stopped')]);
    expect(controller.getSnapshot()).toEqual({ status: 'paused', loaded: 4, voices: 0 });
  });
});
