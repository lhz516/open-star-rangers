import { describe, expect, it } from 'vitest';
import type { AssetId } from '../../content/asset-id.ts';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import { AUDIO_ENDED_HISTORY, AUDIO_VOICE_LIMIT, createAudioController, type AudioController } from '../../platform/audio/audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound, type FakeVoice } from '../../platform/audio/audio-controller.test-support.ts';
import {
  createVoiceLedger, VOICE_CLASS_CAPS, VOICE_POOL_SIZE, type VoiceClass, type VoiceHandle, type VoiceLedger, type VoicePlayResult,
  type VoiceRequest, type VoiceSource,
} from './voices.ts';

const id = (name: string) => `sound/synthetic-flight/${name}` as AssetId;
const NAMES = ['shot', 'missile', 'hit', 'kill', 'blast', 'engine', 'loop', 'pulse', 'warning', 'by-id', 'speech'] as const;

const entity = (id: number, slot: 0 | 1 | 2 | 3 | 4): VoiceSource => ({ namespace: 'entity', id, slot });
const effect = (id: string): VoiceSource => ({ namespace: 'effect', id });
const BY_ID: VoiceSource = { namespace: 'by-id' };

// The A-03 callers (audio.md, "Voice pool and classes"): shots class 1 preempting, hits and an explosion's first play
// class 2 preempting, its replays not, continuous sounds class 5 not, sounds by ID and the lock tone class 4 preempting,
// the instrument-9 warning class 4 not, the timed list class 3 preempting.
const shot = (shooter: number): VoiceRequest => ({ source: entity(shooter, 1), sound: id('shot'), voiceClass: 1, preempt: true });
const hit = (victim: number, shieldDown = false): VoiceRequest =>
  ({ source: entity(victim, shieldDown ? 4 : 3), sound: id(shieldDown ? 'kill' : 'hit'), voiceClass: 2, preempt: true });
const blast = (key: string, first = true): VoiceRequest => ({ source: effect(key), sound: id('blast'), voiceClass: 2, preempt: first });
const engine = (source: number): VoiceRequest => ({ source: entity(source, 0), sound: id('engine'), voiceClass: 5, preempt: false });
const lockLoop: VoiceRequest = { source: { namespace: 'cue', cue: 'lock-loop' }, sound: id('loop'), voiceClass: 4, preempt: true };
const lockPulse: VoiceRequest = { source: { namespace: 'cue', cue: 'lock-pulse' }, sound: id('pulse'), voiceClass: 4, preempt: true };
const warning: VoiceRequest = { source: { namespace: 'cue', cue: 'instrument-9-craft' }, sound: id('warning'), voiceClass: 4, preempt: false };
const byId: VoiceRequest = { source: BY_ID, sound: id('by-id'), voiceClass: 4, preempt: true };
const speech: VoiceRequest = { source: BY_ID, sound: id('speech'), voiceClass: 3, preempt: true };

function setup({ ownerId = 1, runId = 1 } = {}) {
  const audio = new FakeAudio();
  audio.initialState = 'running';
  const lifecycle = new FakeLifecycle();
  const controller = createAudioController({ audio, lifecycle, reportError: error => { throw error; } });
  const records = NAMES.map(name => ({ id: id(name), schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: sound() }));
  expect(controller.load(records)).toEqual({ status: 'loaded', count: NAMES.length });
  expect(controller.unlock()).toBe('running');
  const ledger = createVoiceLedger({ controller, ownerId, runId });
  /** The host voice of each started request, by handle. */
  const hosts = new Map<VoiceHandle, FakeVoice>();
  const play = (request: VoiceRequest, on: VoiceLedger = ledger): VoicePlayResult => {
    const result = on.play(request);
    if (result.status === 'started') hosts.set(result.handle, audio.context.voices.at(-1)!);
    return result;
  };
  /** Plays a request that must start, returning its handle. */
  const start = (request: VoiceRequest, on: VoiceLedger = ledger): VoiceHandle => {
    const result = play(request, on);
    if (result.status !== 'started') throw new Error(`not started: ${JSON.stringify(result)}`);
    return result.handle;
  };
  const host = (handle: VoiceHandle) => hosts.get(handle)!;
  return { audio, lifecycle, controller, ledger, play, start, host };
}

/** The controller's methods, bound, to wrap one of them. */
const bound = (controller: AudioController): AudioController => ({
  unlock: () => controller.unlock(),
  load: sounds => controller.load(sounds),
  play: (sound, parameters) => controller.play(sound, parameters),
  update: (voice, parameters) => controller.update(voice, parameters),
  voiceState: voice => controller.voiceState(voice),
  stop: (voice, reason) => controller.stop(voice, reason),
  stopAll: () => controller.stopAll(),
  pause: () => controller.pause(),
  resume: () => controller.resume(),
  getSnapshot: () => controller.getSnapshot(),
  subscribe: listener => controller.subscribe(listener),
  dispose: () => controller.dispose(),
});
const counts = (partial: Partial<Record<VoiceClass, number>>) => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ...partial });
const sounding = (controller: AudioController) => controller.getSnapshot().voices;

describe('voice ledger classes and budget', () => {
  it('keeps the original classes, whose caps fill the pool, within the platform guard', () => {
    expect(Object.isFrozen(VOICE_CLASS_CAPS)).toBe(true);
    expect(Object.values(VOICE_CLASS_CAPS).reduce((sum, cap) => sum + cap, 0)).toBe(VOICE_POOL_SIZE);
    expect(VOICE_POOL_SIZE).toBeLessThanOrEqual(AUDIO_VOICE_LIMIT);
  });

  it('fills each class to its cap in record order and refuses budget + 1 without a handle or a host voice', () => {
    const { audio, controller, ledger, play } = setup();
    const requests = [shot(1), shot(2), hit(3), speech, lockLoop, warning, engine(1), engine(2)];
    expect(requests.map(request => play(request))).toMatchObject(
      requests.map((_, record) => ({ status: 'started', record, reaped: null, preempted: null })),
    );
    expect(ledger.counts()).toEqual(counts({ 1: 2, 2: 1, 3: 1, 4: 2, 5: 2 }));
    expect(sounding(controller)).toBe(VOICE_POOL_SIZE);
    for (const request of [{ ...shot(3), preempt: false }, blast('a', false), { ...speech, preempt: false }, warning, engine(3)]) {
      expect(play(request)).toEqual({ status: 'refused', code: 'voice-limit', reaped: null });
    }
    expect(audio.context.voices).toHaveLength(VOICE_POOL_SIZE);
    expect(sounding(controller)).toBe(VOICE_POOL_SIZE);
    expect(ledger.counts()).toEqual(counts({ 1: 2, 2: 1, 3: 1, 4: 2, 5: 2 }));
  });

  it('lets a preempting request at its cap cut the lowest record of its class, never another class', () => {
    const { audio, controller, ledger, play, start, host } = setup();
    const [first, second] = [start(shot(1)), start(shot(2))];
    const loop = start(lockLoop);
    const engines = [start(engine(1)), start(engine(2))];
    expect(play(byId)).toMatchObject({ status: 'started', record: 5, preempted: null });
    const third = play(shot(3));
    expect(third).toMatchObject({
      status: 'started', record: 0, reaped: null,
      preempted: { handle: first, source: entity(1, 1), voiceClass: 1, record: 0, reason: 'preempted' },
    });
    expect(host(first).calls).toContain('stop');
    expect(ledger.query(first)).toEqual({ status: 'ended', reason: 'preempted' });
    // Preemption goes by record, not age: the newest shot in record 0 is cut before the older one in record 1.
    const fourth = play(shot(4));
    expect(fourth).toMatchObject({ status: 'started', record: 0, preempted: { source: entity(3, 1), reason: 'preempted' } });
    expect(ledger.query(second)).toEqual({ status: 'playing' });
    // Sounds by ID and the lock tone preempt the class 4 warning and loop; the warning itself never preempts.
    expect(play(warning)).toMatchObject({ status: 'refused' });
    expect(play(lockPulse)).toMatchObject({ status: 'started', record: 2, preempted: { handle: loop, reason: 'preempted' } });
    for (const handle of engines) expect(ledger.query(handle)).toEqual({ status: 'playing' });
    expect(audio.context.voices).toHaveLength(9);
    expect(sounding(controller)).toBe(6);
    expect(ledger.counts()).toEqual(counts({ 1: 2, 4: 2, 5: 2 }));
  });
});

describe('voice ledger reaping and ends', () => {
  it('keeps an ended voice counted until a request reaps it, one per request and the lowest record first', () => {
    const { controller, ledger, play, start, host } = setup();
    const shots = [start(shot(1)), start(shot(2))];
    start(engine(1));
    for (const handle of shots) host(handle).end();
    expect(sounding(controller)).toBe(1);
    expect(ledger.counts()).toEqual(counts({ 1: 2, 5: 1 }));
    // An engine request reaps only the first finished shot and takes its record.
    expect(play(engine(2))).toMatchObject({
      status: 'started', record: 0, preempted: null, reaped: { handle: shots[0], record: 0, reason: 'natural' },
    });
    expect(ledger.counts()).toEqual(counts({ 1: 1, 5: 2 }));
    // A refused request still reaps: the second shot leaves its record although the third engine finds class 5 full.
    expect(play(engine(3))).toEqual({
      status: 'refused', code: 'voice-limit',
      reaped: { handle: shots[1], source: entity(2, 1), voiceClass: 1, record: 1, reason: 'natural' },
    });
    expect(ledger.counts()).toEqual(counts({ 5: 2 }));
    expect(ledger.query(shots[1])).toEqual({ status: 'ended', reason: 'natural' });
  });

  it('lets a preempting request take a held voice that has already ended, cutting nothing', () => {
    const { ledger, play, start, host } = setup();
    const gun = start(shot(1));
    const first = start(hit(2));
    host(gun).end();
    host(first).end();
    const stops = host(first).calls.length;
    // The reap frees the lower record (the shot), so class 2 is still held by the finished hit, which is taken as it is.
    expect(play(hit(3))).toMatchObject({
      status: 'started', record: 1, reaped: { handle: gun, record: 0 }, preempted: { handle: first, record: 1, reason: 'natural' },
    });
    expect(host(first).calls).toHaveLength(stops);
    expect(ledger.counts()).toEqual(counts({ 2: 1 }));
  });

  it('releases a voice once, whichever of its end, query, stop and late callbacks come first or again', () => {
    const { controller, ledger, play, start, host } = setup();
    const kept = start(shot(1));
    const ended = start(shot(2));
    host(ended).end();
    host(ended).end();
    expect(ledger.counts()).toEqual(counts({ 1: 2 }));
    expect(ledger.query(ended)).toEqual({ status: 'ended', reason: 'natural' });
    expect(ledger.counts()).toEqual(counts({ 1: 1 }));
    expect([ledger.query(ended), ledger.stop(ended), ledger.counts()]).toEqual([{ status: 'ended', reason: 'natural' }, false, counts({ 1: 1 })]);
    expect(ledger.stop(kept)).toBe(true);
    host(kept).end();
    expect([ledger.stop(kept), ledger.query(kept), ledger.counts()]).toEqual([false, { status: 'ended', reason: 'stopped' }, counts({})]);
    // Stopping a held voice that has ended frees its record and keeps its own reason.
    const late = start(shot(3));
    host(late).end();
    expect([ledger.stop(late), ledger.query(late)]).toEqual([true, { status: 'ended', reason: 'natural' }]);
    // A new voice in the same record is out of every old handle's reach.
    const next = start(shot(4));
    expect(play(shot(5))).toMatchObject({ status: 'started', record: 1 });
    for (const old of [kept, ended, late]) {
      expect(ledger.stop(old)).toBe(false);
      expect(ledger.update(old, { volume: 1 })).toEqual({ status: 'rejected', code: 'unknown-voice' });
    }
    expect([ledger.query(next), sounding(controller), ledger.counts()]).toEqual([{ status: 'playing' }, 2, counts({ 1: 2 })]);
  });

  it('stops every voice and frees every record, keeping finished voices their reasons', () => {
    const { controller, ledger, start, host } = setup();
    const [ended, playing, loop] = [start(shot(1)), start(hit(2)), start(lockLoop)];
    host(ended).end();
    ledger.stopAll();
    expect([ended, playing, loop].map(handle => ledger.query(handle))).toEqual([
      { status: 'ended', reason: 'natural' }, { status: 'ended', reason: 'stopped' }, { status: 'ended', reason: 'stopped' },
    ]);
    expect([sounding(controller), ledger.counts()]).toEqual([0, counts({})]);
    expect(start(engine(1))).toBeDefined();
  });

  it('tells an interruption by hiding from a host failure, and keeps both counted until released', () => {
    const { audio, lifecycle, controller, ledger, play, start } = setup();
    const [first, second] = [start(shot(1)), start(engine(1))];
    lifecycle.hide();
    expect(controller.getSnapshot().status).toBe('suspended');
    expect(ledger.counts()).toEqual(counts({ 1: 1, 5: 1 }));
    expect(ledger.query(first)).toEqual({ status: 'ended', reason: 'interrupted' });
    // Requests while suspended fail with the controller's code and take no record; one still reaps.
    expect(play(shot(2))).toMatchObject({ status: 'failed', code: 'audio-suspended', reaped: { handle: second, reason: 'interrupted' }, preempted: null });
    expect(ledger.counts()).toEqual(counts({}));
    lifecycle.show();
    audio.context.setState('running');
    const third = start(shot(3));
    audio.context.setState('closed');
    expect(ledger.query(third)).toEqual({ status: 'ended', reason: 'failed' });
    expect(play(shot(4))).toMatchObject({ status: 'failed', code: 'audio-failed' });
  });
});

describe('voice ledger failures and ownership', () => {
  it('records a release with the status that caused it, whatever the controller does before the next query', () => {
    const { audio, lifecycle, controller, ledger, start } = setup();
    const hidden = start(shot(1));
    lifecycle.hide();
    lifecycle.show();
    audio.context.setState('running');
    const closed = start(shot(2));
    audio.context.setState('closed');
    expect([ledger.query(hidden), ledger.query(closed)]).toEqual([
      { status: 'ended', reason: 'interrupted' }, { status: 'ended', reason: 'failed' },
    ]);
    expect(controller.getSnapshot().status).toBe('failed');
  });

  it('keeps a natural end although later voices of a shared controller push it out of the controller history', () => {
    const { controller, ledger, start, host } = setup();
    const ended = start(shot(1));
    host(ended).end();
    for (let index = 0; index <= AUDIO_ENDED_HISTORY; index += 1) {
      const other = controller.play(id('by-id'));
      if (other.status === 'started') controller.stop(other.voice);
    }
    expect(ledger.query(ended)).toEqual({ status: 'ended', reason: 'natural' });
  });

  it('refuses a call from a controller subscriber during its own operation and stays consistent', () => {
    const { controller, ledger, start } = setup();
    const errors: unknown[] = [];
    let nested = true;
    controller.subscribe(() => {
      if (!nested) return;
      try {
        ledger.play(shot(9));
      } catch (error) {
        errors.push(error);
      }
    });
    const first = start(shot(1));
    start(shot(2));
    start(shot(3));
    nested = false;
    // One per notification: each start, and the preemption's stop before the third.
    expect(errors).toHaveLength(4);
    expect(String(errors[0])).toMatch(/called again/);
    expect([ledger.query(first), ledger.counts(), controller.getSnapshot().voices]).toEqual([
      { status: 'ended', reason: 'preempted' }, counts({ 1: 2 }), 2,
    ]);
  });

  it('stops listening to the controller when disposed', () => {
    const { controller, ledger, start, host } = setup();
    const voice = start(shot(1));
    ledger.dispose();
    expect(controller.getSnapshot().voices).toBe(0);
    host(voice).end();
    expect(ledger.query(voice)).toEqual({ status: 'ended', reason: 'stopped' });
  });

  it('keeps a bad reference and parameters apart from refusals, taking no record', () => {
    const { audio, ledger, play, start } = setup();
    expect(play({ ...shot(1), sound: id('missing') })).toEqual({ status: 'failed', code: 'unknown-sound', reaped: null, preempted: null });
    expect(play({ ...shot(1), parameters: { volume: 128 } })).toMatchObject({ status: 'failed', code: 'invalid-parameters' });
    expect([audio.context.voices.length, ledger.counts()]).toEqual([0, counts({})]);
    start(hit(1));
    // A failed preempting request has already cut its victim, which stays released.
    expect(play({ ...hit(2), sound: id('missing') })).toMatchObject({ status: 'failed', code: 'unknown-sound', preempted: { source: entity(1, 3), reason: 'preempted' } });
    expect(ledger.counts()).toEqual(counts({}));
  });

  it('updates a parameterised voice only while it sounds in its record', () => {
    const { ledger, start, host } = setup();
    const voice = start({ ...engine(1), parameters: { volume: 127, pan: 64, rate: 11_025 } });
    const fixed = start(engine(2));
    expect(ledger.update(voice, { volume: 40, rate: 22_050 })).toEqual({ status: 'updated' });
    expect(ledger.update(voice, { pan: 200 })).toEqual({ status: 'rejected', code: 'invalid-parameters' });
    expect(ledger.update(fixed, { volume: 40 })).toEqual({ status: 'rejected', code: 'fixed-parameters' });
    host(voice).end();
    expect(ledger.update(voice, { volume: 1 })).toEqual({ status: 'rejected', code: 'unknown-voice' });
  });

  it('reports a voice the controller keeps paused as paused and never reaps it', () => {
    const { controller } = setup();
    let paused = false;
    // The controller keeps voices paused only under its pause gate; this view reports every live voice so.
    const pausing: AudioController = {
      ...bound(controller),
      voiceState: voice => {
        const state = controller.voiceState(voice);
        return paused && state.status === 'playing' ? { status: 'paused' } : state;
      },
    };
    const ledger = createVoiceLedger({ controller: pausing, ownerId: 1, runId: 1 });
    const results = [ledger.play(shot(1)), ledger.play(shot(2))];
    paused = true;
    const [first] = results.map(result => (result.status === 'started' ? result.handle : null));
    expect(ledger.query(first!)).toEqual({ status: 'paused' });
    expect(ledger.play({ ...shot(3), preempt: false })).toEqual({ status: 'refused', code: 'voice-limit', reaped: null });
    expect(ledger.counts()).toEqual(counts({ 1: 2 }));
    paused = false;
    expect(ledger.query(first!)).toEqual({ status: 'playing' });
  });

  it('binds handles to their owner, run and ledger, so an old run cannot reach a new one', () => {
    const fixture = setup({ ownerId: 7, runId: 3 });
    const old = fixture.start(shot(1));
    expect(old).toEqual({ ownerId: 7, runId: 3, serial: 1 });
    expect(Object.isFrozen(old)).toBe(true);
    fixture.ledger.dispose();
    fixture.ledger.dispose();
    expect(fixture.ledger.query(old)).toEqual({ status: 'ended', reason: 'stopped' });
    expect(fixture.ledger.play(shot(2))).toEqual({ status: 'failed', code: 'disposed', reaped: null, preempted: null });
    const next = createVoiceLedger({ controller: fixture.controller, ownerId: 7, runId: 4 });
    const fresh = fixture.start(shot(3), next);
    expect(fresh).toEqual({ ownerId: 7, runId: 4, serial: 1 });
    expect([next.query(old), next.stop(old), next.update(old, { volume: 1 })]).toEqual([
      { status: 'unknown' }, false, { status: 'rejected', code: 'unknown-voice' },
    ]);
    expect([fixture.ledger.stop(fresh), fixture.ledger.query(fresh)]).toEqual([false, { status: 'unknown' }]);
    expect(next.query(fresh)).toEqual({ status: 'playing' });
  });
});

describe('voice ledger sequences', () => {
  it('follows the A-03 order through kills in successive frames, beside shots and engines', () => {
    const { ledger, play, start, host } = setup();
    const engines = [start(engine(1)), start(engine(5))];
    const shots = [start(shot(1)), start(shot(1))];
    // Frame N: the kill's hit on craft 5 (slot 4, its shield gone) takes the free class 2 voice.
    const kill5 = start(hit(5, true));
    // Frame N + 1: the explosion's first play finds class 2 held by the still sounding hit and cuts it.
    const blast5 = play(blast('explosion-5'));
    expect(blast5).toMatchObject({ status: 'started', record: 4, reaped: null, preempted: { handle: kill5, reason: 'preempted' } });
    // A third shot cuts the lower of the two shot records.
    expect(play(shot(1))).toMatchObject({ status: 'started', record: 2, preempted: { handle: shots[0] } });
    // Frame N + 2: craft 6's kill cuts the first blast; the blast's replay finds class 2 held and is refused.
    const kill6 = play(hit(6, true));
    expect(kill6).toMatchObject({ status: 'started', record: 4, preempted: { source: effect('explosion-5'), reason: 'preempted' } });
    expect(play(blast('explosion-5', false))).toEqual({ status: 'refused', code: 'voice-limit', reaped: null });
    // Frame N + 3: craft 6's explosion cuts its hit, and an extra explosion of the same kill then cuts that blast.
    expect(play(blast('explosion-6'))).toMatchObject({ status: 'started', record: 4, preempted: { source: entity(6, 4) } });
    const extra = play(blast('explosion-6-extra-1'));
    expect(extra).toMatchObject({ status: 'started', record: 4, preempted: { source: effect('explosion-6') } });
    expect(play(blast('explosion-6', false))).toMatchObject({ status: 'refused' });
    for (const handle of [...engines, shots[1]]) expect(ledger.query(handle)).toEqual({ status: 'playing' });
    // Once the extra blast has ended, the main blast's replay reaps it and plays without preempting.
    if (extra.status === 'started') host(extra.handle).end();
    expect(play(blast('explosion-6', false))).toMatchObject({
      status: 'started', record: 4, preempted: null, reaped: { source: effect('explosion-6-extra-1'), reason: 'natural' },
    });
    expect(ledger.counts()).toEqual(counts({ 1: 2, 2: 1, 5: 2 }));
  });

  it('matches an independent model of the original pool over long mixed sequences', () => {
    const requests = [shot(1), shot(2), hit(3), hit(4, true), blast('a'), blast('a', false), speech, lockLoop, lockPulse, warning, byId, engine(1), engine(2)];
    for (let seed = 1; seed <= 40; seed += 1) {
      const { ledger, play, host } = setup();
      const model = new OriginalPool();
      let state = seed;
      const next = (limit: number) => {
        state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
        return (state >>> 8) % limit;
      };
      for (let step = 0; step < 300; step += 1) {
        const choice = next(10);
        if (choice < 6) {
          const request = requests[next(requests.length)];
          const result = play(request);
          const expected = model.allocate(request.voiceClass, request.preempt);
          expect(result.status).toBe(expected.started ? 'started' : 'refused');
          expect(result.reaped?.record ?? null).toBe(expected.reaped);
          if (result.status === 'started') {
            expect([result.record, result.preempted?.record ?? null]).toEqual([expected.record, expected.preempted]);
            model.handles[expected.record!] = result.handle;
          }
        } else {
          const record = next(VOICE_POOL_SIZE);
          const handle = model.handles[record];
          if (!handle) continue;
          if (choice < 8) {
            host(handle).end();
            model.end(handle);
          } else if (choice < 9) {
            ledger.query(handle);
            model.query(handle);
          } else {
            expect(ledger.stop(handle)).toBe(model.stop(handle));
          }
        }
        expect(ledger.counts()).toEqual(model.count);
      }
    }
  });
});

/**
 * The original's pool as audio.md A-03 states it, class slots and their drift edge included: records keep the class
 * of their last voice, preemption takes the lowest record of the class whether held or not, and the counts move as the
 * original moves them. Natural ends mark a record finished; it stays counted until reaped.
 */
class OriginalPool {
  readonly slot: VoiceClass[] = Array<VoiceClass>(VOICE_POOL_SIZE).fill(1);
  readonly active: boolean[] = Array<boolean>(VOICE_POOL_SIZE).fill(false);
  readonly finished: boolean[] = Array<boolean>(VOICE_POOL_SIZE).fill(false);
  readonly handles: (VoiceHandle | null)[] = Array<VoiceHandle | null>(VOICE_POOL_SIZE).fill(null);
  readonly count: Record<VoiceClass, number> = counts({});

  allocate(voiceClass: VoiceClass, preempt: boolean) {
    const reaped = this.finished.findIndex((finished, record) => finished && this.active[record]);
    if (reaped >= 0) this.#deactivate(reaped);
    const result = { started: false, record: null as number | null, preempted: null as number | null, reaped: reaped >= 0 ? reaped : null };
    if (this.count[voiceClass] !== VOICE_CLASS_CAPS[voiceClass]) {
      this.count[voiceClass] += 1;
      const record = this.active.indexOf(false);
      if (record < 0) throw new Error('no free record');
      return this.#take(result, record, voiceClass);
    }
    if (!preempt) return result;
    const record = this.slot.indexOf(voiceClass);
    if (record < 0) return result;
    if (!this.active[record]) throw new Error('drift: an idle record taken');
    this.active[record] = false;
    return this.#take({ ...result, preempted: record }, record, voiceClass);
  }

  end(handle: VoiceHandle): void {
    const record = this.handles.indexOf(handle);
    if (record >= 0 && this.active[record]) this.finished[record] = true;
  }

  query(handle: VoiceHandle): void {
    const record = this.handles.indexOf(handle);
    if (record >= 0 && this.active[record] && this.finished[record]) this.#deactivate(record);
  }

  stop(handle: VoiceHandle): boolean {
    const record = this.handles.indexOf(handle);
    if (record < 0 || !this.active[record]) return false;
    this.#deactivate(record);
    return true;
  }

  #take<T extends { started: boolean; record: number | null }>(result: T, record: number, voiceClass: VoiceClass): T {
    this.slot[record] = voiceClass;
    this.active[record] = true;
    this.finished[record] = false;
    return { ...result, started: true, record };
  }

  #deactivate(record: number): void {
    this.active[record] = false;
    this.finished[record] = false;
    this.count[this.slot[record]] -= 1;
  }
}
