vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('../runtime/transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});
vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => capacity.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions, RecordingSession } from '../../core/replay/recording.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { FakeAudio, FakeLifecycle, type FakeVoice } from '../../platform/audio/audio-controller.test-support.ts';
import { GraphicsUnavailableError } from '../../render/scene/render-surface.ts';
import { createFlightConsumer, type FlightConsumer } from '../mission/flight-consumer.ts';
import { developmentRecording, type MissionOwnerConsumer } from '../mission/mission-owner.ts';
import {
  missionHolder, missionJob, ownerSetup, sessionProbe, skip, TestConsumer, testPorts, testSlot, toConfig, toDeparture, toFlight,
} from '../mission/mission.test-support.ts';
import { flush } from '../resources/resource-holder.test-support.ts';
import type { HeldPackage, ResourceHolder } from '../resources/resource-holder.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { injectedResult, injection } from '../runtime/transition-injection.test-support.ts';
import { FlightSoundConsumerError } from './consumer.ts';
import { bindFlightSounds } from './content.ts';
import { withPayload } from './content.test-support.ts';
import { createFlightAudioConsumer, FlightSoundCloseError, FlightSoundLoadError, type FlightAudioOptions } from './owner.ts';

// P3-14 subtask 17 (S-08, AC-10, AC-11; P3-04 spec, 任务音频接线（P3-14 的修订）and its D-02 supplement): the mission
// owner's flight sound as a `media` consumer, with real owners, slots, sessions on a ControlledHost, the real flight
// consumer (without WebGL 2) for each run's presentation module, and the audio controller over fake host capabilities.
// Completions, Core faults and recording refusals are injected where the world and recording are created.

const capacity = vi.hoisted(() => ({
  /** The step that the recording refuses, counted per recording; null refuses none. */
  refuseAt: null as number | null,
  wrap(session: RecordingSession): RecordingSession {
    let steps = 0;
    const refuseAt = this.refuseAt;
    return new Proxy(session, {
      get(target, key) {
        const value = Reflect.get(target, key, target) as unknown;
        if (key !== 'step' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
        return (...args: unknown[]) => {
          steps += 1;
          if (steps === refuseAt) throw new CoreInputError('recording', 'would exceed the recorded tick limit');
          return (value as (...input: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  },
}));

afterEach(() => {
  injection.reset();
  capacity.refuseAt = null;
});

interface SoundOptions extends Partial<FlightAudioOptions> {
  /** The fake context's initial state. */
  readonly state?: string;
  readonly recording?: boolean;
  /** Consumers connected before the flight consumer. */
  readonly before?: readonly MissionOwnerConsumer[];
}

/** The consumers of one owner on `holder`: the flight picture without WebGL 2, then the flight sound over fake audio. */
function soundParts(holder: ResourceHolder, reportError: (error: unknown) => void, options: SoundOptions = {}) {
  const audio = new FakeAudio();
  audio.initialState = options.state ?? 'suspended';
  const lifecycle = new FakeLifecycle();
  const flight: FlightConsumer = createFlightConsumer({
    holder, createSurface: () => { throw new GraphicsUnavailableError({ cause: null }); }, seed: () => 0x1234_5678, reportError,
  });
  const sound = createFlightAudioConsumer({ holder, audio, lifecycle, reportError, presentation: () => flight.presentation(), ...options });
  const probe = sessionProbe();
  return { audio, lifecycle, flight, consumers: [...options.before ?? [], flight, sound, probe.consumer], session: probe.session };
}

/** An owner of a fresh slot with the flight sound; the barrier of the empty slot has passed once this resolves. */
async function openSound(options: SoundOptions = {}) {
  const { holder } = await missionHolder();
  const ports = testPorts();
  const slot = testSlot();
  const parts = soundParts(holder, ports.reportError, options);
  const recording = options.recording ? developmentRecording('test') : null;
  const owner = slot.slot.open(() => ownerSetup(holder, ports, { consumers: parts.consumers, recording }))!;
  await flush();
  return { holder, ...ports, ...slot, ...parts, owner };
}

/** The number of sounds in the held package's `audio` group. */
const audioSounds = (held: HeldPackage): number => readGroupManifest(held.groups.find(({ group }) => group === 'audio')!.manifest).assets
  .filter(({ kind }) => kind === 'sound').length;

const live = (voices: readonly FakeVoice[]): FakeVoice[] => voices.filter(({ calls }) => !calls.includes('disconnect'));

/** Delivers frames from `from` until the run plays voices; returns the last frame's time. */
function play({ host, audio }: { readonly host: { deliver(now: number): void }; readonly audio: FakeAudio }, from = 0): number {
  let now = from;
  for (let frame = 0; frame < 10 && live(audio.context.voices).length === 0; frame += 1) host.deliver(now += TICK_MS);
  expect(live(audio.context.voices).length).toBeGreaterThan(0);
  return now;
}

/** Opens the run's sound: the trusted start unlocked the context, which the host now runs. */
function running(audio: FakeAudio): void {
  audio.context.setState('running');
}

/** A slot whose first owner's close the test settles, then an owner with the flight sound waiting for it. */
async function waiting() {
  const setup = await missionHolder();
  const ports = testPorts();
  const slot = testSlot();
  const previous = new TestConsumer('media', 'previous', []);
  const settle: { resolve?: () => void; reject?: (cause: unknown) => void } = {};
  previous.close = new Promise<void>((resolve, reject) => { Object.assign(settle, { resolve, reject }); });
  slot.slot.open(() => ownerSetup(setup.holder, ports, { consumers: [previous] }));
  const parts = soundParts(setup.holder, ports.reportError);
  const owner = slot.slot.open(() => ownerSetup(setup.holder, ports, { consumers: parts.consumers }))!;
  await flush();
  return { ...setup, ...ports, ...slot, ...parts, owner, settle: settle as Required<typeof settle> };
}

describe('the owner\'s controller', () => {
  it('waits for the barrier, loads every sound of the bound audio group once and creates the context only in a trusted action', async () => {
    const { holder, owner, audio, settle, host, reportError } = await waiting();
    expect(owner.getSnapshot().sound).toBe('waiting-close');
    // The start's activation finds no controller: nothing is created, and it does not count later.
    toFlight(owner);
    expect({ contexts: audio.contexts.length, buffers: audio.buffers.length }).toEqual({ contexts: 0, buffers: 0 });
    settle.resolve();
    await flush();
    expect(owner.getSnapshot().sound).toBe('needs-activation');
    expect({ contexts: audio.contexts.length, buffers: audio.buffers.length }).toEqual({ contexts: 0, buffers: audioSounds(holder.current()!) });
    // The run wired while waiting plays once a trusted action activates the controller.
    owner.pause();
    owner.resume();
    expect(audio.contexts).toHaveLength(1);
    running(audio);
    expect(owner.getSnapshot().sound).toBe('available');
    play({ host, audio });
    // A new run reuses the owner's one controller, context and loaded sounds.
    owner.restart();
    toFlight(owner);
    owner.pause();
    owner.resume();
    expect({ contexts: audio.contexts.length, buffers: audio.buffers.length }).toEqual({ contexts: 1, buffers: audioSounds(holder.current()!) });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('unlocks inside the start\'s handler, after the world was created, and shows the context\'s state', async () => {
    const { owner, audio, session } = await openSound();
    expect(owner.getSnapshot().sound).toBe('needs-activation');
    skip(owner);
    const phases: string[] = [];
    audio.createContext = new Proxy(audio.createContext.bind(audio), {
      apply: (target) => {
        phases.push(session().status().phase);
        return target();
      },
    });
    owner.start();
    // In the same call stack, with the run held for its departure.
    expect(phases).toEqual(['transition']);
    expect(audio.context.count('resume')).toBeGreaterThan(0);
    expect(owner.getSnapshot().sound).toBe('needs-activation');
    running(audio);
    expect(owner.getSnapshot().sound).toBe('available');
  });

  it('shows the host\'s lack of Web Audio as unavailable, and the game goes on silently', async () => {
    const setup = await openSound();
    setup.audio.failContext = true;
    toFlight(setup.owner);
    expect(setup.owner.getSnapshot()).toMatchObject({ sound: 'unavailable', flow: { position: 'flight' } });
    setup.host.deliver(0);
    setup.host.deliver(TICK_MS);
    expect(setup.owner.getSnapshot()).toMatchObject({ sound: 'unavailable', session: { phase: 'running' } });
    expect(setup.reportError).not.toHaveBeenCalled();
  });
});

describe('the task pause gate', () => {
  it('closes in the pause\'s notification and opens only through a trusted resume', async () => {
    const setup = await openSound();
    const { owner, audio, host } = setup;
    toFlight(owner);
    running(audio);
    const now = play(setup);
    const voices = live(audio.context.voices);
    owner.pause();
    expect(audio.context.count('suspend')).toBe(1);
    expect(owner.getSnapshot().sound).toBe('paused');
    audio.context.setState('suspended');
    // The page hides and shows again: the session stays paused, and nothing resumes the context.
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    const resumes = audio.context.count('resume');
    expect(owner.getSnapshot()).toMatchObject({ sound: 'paused', session: { phase: 'paused' } });
    owner.resume();
    expect(audio.context.count('resume')).toBe(resumes + 1);
    running(audio);
    // The kept voices continue where they were.
    expect(owner.getSnapshot().sound).toBe('available');
    expect(voices.every(({ calls }) => !calls.includes('stop'))).toBe(true);
    host.deliver(now + TICK_MS);
  });

  it('keeps the voices of a pause the resume overtook, and releases those of a pause the page hid', async () => {
    const setup = await openSound();
    const { owner, audio, lifecycle } = setup;
    toFlight(owner);
    running(audio);
    play(setup);
    const voices = live(audio.context.voices);
    owner.pause();
    owner.resume();
    audio.context.suspensions[0]!.resolve();
    await flush();
    expect(owner.getSnapshot().sound).toBe('available');
    expect(voices.every(({ calls }) => !calls.includes('stop'))).toBe(true);

    owner.pause();
    audio.context.setState('suspended');
    lifecycle.hide();
    expect(voices.every(({ calls }) => calls.includes('stop'))).toBe(true);
    const resumes = audio.context.count('resume');
    lifecycle.show();
    expect(audio.context.count('resume')).toBe(resumes);
    expect(owner.getSnapshot().sound).toBe('paused');
    owner.resume();
    expect(audio.context.count('resume')).toBe(resumes + 1);
  });

  it('only unlocks for enable-sound in the menu: the game, the menu and the last error stay; Continue opens the gate', async () => {
    const setup = await openSound();
    const { owner, audio, host } = setup;
    toFlight(owner);
    running(audio);
    play(setup);
    owner.openMenu();
    audio.context.setState('suspended');
    // A hidden page refuses Continue, which keeps the menu with its reason.
    host.emit({ type: 'visibility', visibility: 'hidden' });
    owner.continueFromMenu();
    const { actionError } = owner.getSnapshot();
    expect(actionError).toMatchObject({ operation: 'continue' });
    const resumes = audio.context.count('resume');
    owner.enableSound();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused' }, sound: 'paused', actionError });
    expect(audio.context.count('resume')).toBe(resumes);
    host.emit({ type: 'visibility', visibility: 'visible' });
    owner.continueFromMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' } });
    expect(audio.context.count('resume')).toBe(resumes + 1);
    running(audio);
    expect(owner.getSnapshot().sound).toBe('available');
  });

  it('closes the gate of a controller created while the run is paused', async () => {
    const { owner, audio, settle } = await waiting();
    toFlight(owner);
    owner.pause();
    settle.resolve();
    await flush();
    owner.enableSound();
    expect(audio.contexts).toHaveLength(1);
    expect(owner.getSnapshot().sound).toBe('paused');
    expect(audio.context.count('resume')).toBe(0);
  });
});

describe('the run\'s sound', () => {
  async function playing(options: SoundOptions = {}) {
    const setup = await openSound(options);
    toFlight(setup.owner);
    running(setup.audio);
    injection.plan({});
    return { ...setup, now: play(setup) };
  }

  it('stops every voice once the run completes, and plays nothing more', async () => {
    const setup = await playing();
    const voices = live(setup.audio.context.voices);
    injection.complete(injection.steps + 1, injectedResult([{ gap: 'G-02/8', variant: 'solo' }]));
    setup.host.deliver(setup.now + TICK_MS);
    expect(setup.session().status().phase).toBe('completed');
    expect(voices.every(({ calls }) => calls.includes('stop'))).toBe(true);
    expect(live(setup.audio.context.voices)).toEqual([]);
    // The run still exists for its ending and result, without flight sound.
    expect(setup.session().currentRun()).not.toBeNull();
    expect(setup.owner.getSnapshot().sound).toBe('available');
  });

  it('stops every voice once the run faults, before any exit', async () => {
    const setup = await playing();
    injection.fail(injection.steps + 1, () => new Error('fault'));
    setup.host.deliver(setup.now + TICK_MS);
    expect(setup.session().status().phase).toBe('faulted');
    expect(live(setup.audio.context.voices)).toEqual([]);
  });

  it('stops every voice once the recording stops the run, which keeps it for export', async () => {
    capacity.refuseAt = 20;
    const setup = await playing({ recording: true });
    for (let now = setup.now, frame = 0; frame < 40 && setup.session().status().phase === 'running'; frame += 1) setup.host.deliver(now += TICK_MS);
    expect(setup.session().status()).toMatchObject({ phase: 'stopped', stopReason: 'recording-capacity' });
    expect(live(setup.audio.context.voices)).toEqual([]);
    // Enabling sound stays possible but plays nothing.
    setup.owner.enableSound();
    expect(live(setup.audio.context.voices)).toEqual([]);
  });

  it('ends with the run on restart; the next run starts from nothing, and the old run\'s late ends change nothing', async () => {
    const setup = await playing();
    const old = live(setup.audio.context.voices);
    setup.owner.restart();
    expect(live(setup.audio.context.voices)).toEqual([]);
    toFlight(setup.owner);
    play(setup, setup.now);
    const fresh = live(setup.audio.context.voices);
    for (const voice of old) voice.end();
    expect(live(setup.audio.context.voices)).toEqual(fresh);
  });

  it('fails the start when the presentation module is missing, and rolls it back', async () => {
    const setup = await openSound({ presentation: () => null });
    skip(setup.owner);
    setup.owner.start();
    expect(setup.owner.getSnapshot()).toMatchObject({
      flow: { position: 'config', startFailure: { kind: 'assembly', stage: 'consumer', rolledBack: true } }, session: { phase: 'idle' },
    });
    expect((setup.owner.getSnapshot().flow.startFailure as { cause: unknown }).cause).toBeInstanceOf(FlightSoundConsumerError);
  });
});

describe('content and controller failures', () => {
  it('shows a package whose sounds cannot be bound as failed, reports it and runs silently', async () => {
    const { holder } = await missionHolder();
    const held = holder.current()!;
    if (held.completeness.status !== 'complete') throw new Error('The package is not complete');
    const [sound] = bindFlightSounds(held, { generation: held.generation, identity: held.completeness.identity }).sounds;
    const broken = withPayload(held, 'audio', sound!, { bytes: Uint8Array.of(1, 2, 3) });
    const ports = testPorts();
    const { slot } = testSlot();
    const parts = soundParts(holder, ports.reportError, { holder: { current: () => broken } });
    const owner = slot.open(() => ownerSetup(holder, ports, { consumers: parts.consumers }))!;
    await flush();
    expect(owner.getSnapshot().sound).toBe('failed');
    expect(ports.reportError).toHaveBeenCalledWith(expect.any(ContentContractError));
    toFlight(owner);
    ports.host.deliver(0);
    ports.host.deliver(TICK_MS);
    expect(owner.getSnapshot()).toMatchObject({ sound: 'failed', session: { phase: 'running' } });
    expect(parts.audio.contexts).toHaveLength(0);
  });

  it('shows sounds the controller cannot load as failed, with the code and Asset only, and creates nothing', async () => {
    const { holder } = await missionHolder();
    const ports = testPorts();
    const { slot } = testSlot();
    const parts = soundParts(holder, ports.reportError);
    parts.audio.failBuffer = true;
    const owner = slot.open(() => ownerSetup(holder, ports, { consumers: parts.consumers }))!;
    await flush();
    expect(owner.getSnapshot().sound).toBe('failed');
    const [[error]] = ports.reportError.mock.calls as [[FlightSoundLoadError]];
    expect(error).toBeInstanceOf(FlightSoundLoadError);
    expect(error.code).toBe('audio-failed');
    expect(error.assetId).toMatch(/^sound\//);
    toFlight(owner);
    expect(parts.audio.contexts).toHaveLength(0);
    expect(owner.release().failures).toEqual([]);
  });
});

describe('the close barrier', () => {
  it('creates nothing for an owner released before the barrier settles, true or false, and does not wait for it', async () => {
    for (const closed of [true, false]) {
      const { owner, slot, audio, settle, reportError } = await waiting();
      toDeparture(owner);
      slot.release();
      expect(await owner.release().closed).toBe(true);
      if (closed) settle.resolve();
      else settle.reject(new Error('close'));
      await flush();
      expect({ contexts: audio.contexts.length, buffers: audio.buffers.length }).toEqual({ contexts: 0, buffers: 0 });
      expect(reportError).not.toHaveBeenCalled();
    }
  });

  it('creates nothing for an owner whose package was replaced before the barrier settles', async () => {
    const { owner, holder, audio, settle, onPackageReplaced } = await waiting();
    expect(holder.acceptImport(await missionJob('mission-startable'))).toBe(true);
    expect(onPackageReplaced).toHaveBeenCalledWith(owner.ownerId);
    settle.resolve();
    await flush();
    expect({ contexts: audio.contexts.length, buffers: audio.buffers.length }).toEqual({ contexts: 0, buffers: 0 });
    expect(owner.getSnapshot().released).toBe(true);
  });

  it('shows a latched barrier as failed and creates nothing', async () => {
    const { owner, audio, settle, onCleanupFailure } = await waiting();
    const cause = new Error('close');
    settle.reject(cause);
    await flush();
    expect(onCleanupFailure).toHaveBeenCalledWith(cause);
    expect(owner.getSnapshot().sound).toBe('failed');
    toFlight(owner);
    expect({ contexts: audio.contexts.length, buffers: audio.buffers.length }).toEqual({ contexts: 0, buffers: 0 });
  });

  it('joins the release to the context\'s confirmed close: the next owner waits, a failed close latches the slot', async () => {
    for (const closing of ['resolve', 'pending', 'reject', 'throw'] as const) {
      const { holder } = await missionHolder();
      const ports = testPorts();
      const slot = testSlot();
      const first = soundParts(holder, ports.reportError);
      const owner = slot.slot.open(() => ownerSetup(holder, ports, { consumers: first.consumers }))!;
      await flush();
      toDeparture(owner);
      first.audio.context.closing = closing;
      const second = soundParts(holder, ports.reportError);
      const next = slot.slot.open(() => ownerSetup(holder, ports, { consumers: second.consumers }))!;
      expect(first.audio.context.count('close')).toBe(1);
      await flush();
      const expected = { resolve: 'needs-activation', pending: 'waiting-close', reject: 'failed', throw: 'failed' }[closing];
      expect(next.getSnapshot().sound, closing).toBe(expected);
      expect(second.audio.buffers.length > 0, closing).toBe(closing === 'resolve');
      if (closing === 'reject' || closing === 'throw') {
        expect(slot.onCleanupFailure).toHaveBeenCalledWith(expect.any(FlightSoundCloseError));
        // Opening the screen again does not get past the latch.
        expect(slot.slot.open(() => { throw new Error('not called'); })).toBeNull();
      } else {
        expect(slot.onCleanupFailure).not.toHaveBeenCalled();
      }
      // The first owner's late context state changes nothing of the next.
      first.audio.context.setState('running');
      expect(next.getSnapshot().sound, closing).toBe(expected);
    }
  });

  it('closes nothing and resolves at once for an owner that never created a context', async () => {
    const { owner, audio } = await openSound();
    toConfig(owner);
    expect(audio.contexts).toHaveLength(0);
    const released = owner.release();
    expect(released.failures).toEqual([]);
    expect(await released.closed).toBe(true);
  });

  it('returns a promise from the connection\'s release, with or without a context, rejecting a failed close', async () => {
    const { holder, session } = await openSound();
    for (const created of [false, true]) {
      const audio = new FakeAudio();
      const connection = createFlightAudioConsumer({
        holder, audio, lifecycle: new FakeLifecycle(), presentation: () => null, reportError: () => undefined,
      }).connect({ ownerId: 9, session: session(), previousClosed: Promise.resolve(true) });
      await flush();
      if (created) connection.onActivation!('enable-sound');
      expect(audio.contexts).toHaveLength(created ? 1 : 0);
      const released = connection.release();
      expect(released).toBeInstanceOf(Promise);
      if (created) await expect(released).rejects.toBeInstanceOf(FlightSoundCloseError);
      else await expect(released).resolves.toBeUndefined();
    }
  });
});
