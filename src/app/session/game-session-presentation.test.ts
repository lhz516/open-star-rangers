import { Texture, type BufferAttribute, type Material, type ShaderMaterial } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentIdentityKey } from '../../content/content-identity.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { compareReplayResults } from '../../core/replay/compare.ts';
import type { Recording } from '../../core/replay/recording.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf } from '../../core/replay/replay.test-support.ts';
import type { PresentationTick } from '../../render/flight/presentation/presentation-contract.ts';
import { prepareFlightContent, type PreparedFlightContent } from '../../render/flight/renderer/flight-passes.ts';
import { createFlightRenderer, type FlightRenderer } from '../../render/flight/renderer/flight-renderer.ts';
import { wireFlightRun, type FlightRunHandle, type FlightRunWiring } from '../../render/flight/renderer/flight-run.ts';
import { RecordingSurface, type PassRecord } from '../../render/scene/render-surface.test-support.ts';
import { GraphicsDeviceError, GraphicsUnavailableError } from '../../render/scene/render-surface.ts';
import { flightContentOf } from '../mission/flight-content.ts';
import { missionHolder } from '../mission/mission.test-support.ts';
import { craftInfoInput, missionInput, ruleDataInputs, runModelInputs } from '../resources/mission-input.ts';
import type { FrameReport, GameIntent, TickOutput } from '../runtime/game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameRunSpec, GameSessionFrame, GameSessionRun } from './game-session.ts';
import { current, departure, sessionSetup } from './game-session.test-support.ts';

// P3-12 AC-17 (docs/plan/p3/12/spec.md, 技术决定 1, 2, 5 and 6; docs/plan/p3/02/spec.md, FS-06/FS-07): the formal Session
// and Runtime on a ControlledHost, wired as the mission owner's flight consumer wires each run (wireFlightRun) to the
// presentation module and the renderer with every pass. The same per-tick input is grouped into frames of one tick, of
// five, and of zero to five ticks, with no presentation, with a drawing picture on a recording surface, with one that
// cannot draw, through a context loss, with WebGL 2 unavailable and after a device failure. Core's events, checkpoints
// and state hashes stay those of the run without a presentation, and the presentation's choices and derived state stay
// those of its one-tick run under the same seed. A consumer fault inside a batch is tested on its own.

/** Inputs change only at multiples of BLOCK ticks, where every grouping below starts a frame. */
const BLOCK = 5;
/**
 * Ends before the player's own explosion starts at tick 100: its escape pod draws parts 0–2 of the synthetic player
 * model, which has one list-1 part, and the renderer refuses that.
 */
const TICKS = 60;
const PRESENTATION_SEED = 0x2468_ace1;
const WORLD_SEED = 0x1234_5678;

const GROUPINGS = {
  'one tick a frame': Array.from({ length: TICKS }, () => 1),
  'five ticks a frame': Array.from({ length: TICKS / BLOCK }, () => BLOCK),
  'zero to five ticks a frame': Array.from({ length: TICKS / 10 }, () => [0, 2, 0, 3, 5, 0, 0]).flat(),
} satisfies Record<string, readonly number[]>;
type Grouping = keyof typeof GROUPINGS;
const GROUPING_NAMES = Object.keys(GROUPINGS) as Grouping[];

/** Each block's intent and commands, given before the first frame that runs its first tick. */
const SCRIPT: readonly { readonly intent: GameIntent; readonly commands: readonly Command[] }[] = [
  { intent: { axes: { pitch: 0.5, yaw: -0.25, roll: 0 }, primaryFire: true }, commands: [{ type: 'target', operation: 'enemy' }] },
  { intent: { axes: NEUTRAL_AXES, primaryFire: false }, commands: [{ type: 'fire', channel: 'secondary' }] },
  { intent: { axes: { pitch: 0, yaw: 1, roll: -1 }, primaryFire: true }, commands: [{ type: 'select-number', value: 3 }, { type: 'launch' }] },
  { intent: { axes: NEUTRAL_AXES, primaryFire: false }, commands: [{ type: 'target', operation: 'friendly' }] },
];

/** The pictures a presentation can be drawn with; `none` wires no presentation at all. */
const PICTURES = ['drawing', 'not-drawing', 'context-lost', 'unavailable', 'device-failed'] as const;
type Picture = (typeof PICTURES)[number] | 'none';

/** Block starts at which the device changes: the context is lost and restored, or the device fails. */
const LOST_AT = 10;
const RESTORED_AT = 30;
const FAILED_AT = 20;

interface PackageRun {
  /** A fresh run spec of the changed package, recording a checkpoint every tick and held for its departure. */
  readonly spec: () => GameRunSpec;
  readonly content: PreparedFlightContent;
  readonly generation: number;
  readonly identity: string;
}

/**
 * The synthetic `mission-startable` package (never original data), its decoded inputs changed in memory: craft of
 * kinds 7 and 8 do not move and collide within 700 of their centre, so the enemies around the player collide with it
 * and each other from tick 2. Eight craft are destroyed, the player among them, seven explode by tick 5 and their
 * fragments fly. The flight content is the package's own, prepared once as the flight consumer does.
 */
async function packageRun(): Promise<PackageRun> {
  const { holder } = await missionHolder('mission-startable');
  const held = holder.current();
  if (held?.completeness.status !== 'complete') throw new Error('Expected a complete package');
  const { identity } = held.completeness;
  const logic = held.groups.find(({ group }) => group === 'logic')!;
  const content = prepareFlightContent(flightContentOf(held.groups));
  const { mission, craftTypes, wingmanRoster } = missionInput(logic);
  const craftInfo = craftInfoInput(logic)!;
  const info = structuredClone(craftInfo.content) as CraftInfo;
  for (const kindBit of [7, 8]) {
    const craft = info.craft[kindBit];
    (info.craft as CraftInfo['craft'][number][])[kindBit] = { ...craft, atB8: 0, collision: { ...craft.collision, at00: 1000, at08: [-700, -700, -700, 700, 700, 700] } };
  }
  const run = { rawDifficulty: 19, wingman: null, seed: WORLD_SEED };
  const assets = { mission, craftTypes, wingmanRoster };
  // Decoded once: world creation reads its inputs without changing them.
  const inputs = {
    ...assets, craftInfo: { ...craftInfo, content: info }, ...ruleDataInputs(held.groups),
    models: runModelInputs(held.groups, { ...assets, identity, run } as Parameters<typeof runModelInputs>[1]), identity, run,
  };
  const spec = () => ({ ...inputs, recording: recordingOptions(1), initialTransition: departure() }) as unknown as GameRunSpec;
  return { spec, content, generation: held.generation, identity: contentIdentityKey(identity) };
}

/** What the presentation shows after one tick: its notice, then its explosions, fragments and flash requests. */
interface PresentationRecord {
  readonly tick: PresentationTick;
  readonly explosions: unknown;
  readonly fragments: unknown;
  readonly flashes: unknown;
}

/** Changes a frame before the wiring's frame consumer sees it. */
type FrameTamper = (frame: GameSessionFrame) => GameSessionFrame;

/**
 * The run as the wiring gets it: only the members it may use, so it cannot set an intent, submit a command, control
 * the session or read Core. `tamper` changes the frames its listeners get.
 */
function wiringHandle(run: GameSessionRun, tamper: FrameTamper | undefined): FlightRunHandle {
  return {
    runId: run.runId,
    renderFrame: () => run.renderFrame(),
    onFrame: (listener) => run.onFrame(tamper ? (frame) => listener(tamper(frame)) : listener),
    ownCleanup: (cleanup) => run.ownCleanup(cleanup),
  };
}

/** FNV-1a over the items of `items`, which are bytes or floats. */
function hashOf(items: ArrayLike<number>): string {
  let hash = 0x811c_9dc5;
  for (let at = 0; at < items.length; at++) hash = Math.imul(hash ^ (Math.fround(items[at]) * 4096 | 0), 0x0100_0193) >>> 0;
  return `${items.length}:${hash.toString(16)}`;
}

const versionedHashes = new WeakMap<object, { readonly version: number; readonly hash: string }>();

/** `hashOf(items)` for the data of a texture or attribute, hashed again only after an update raised its version. */
function versionedHash(owner: { readonly version: number }, items: ArrayLike<number>): string {
  const cached = versionedHashes.get(owner);
  if (cached?.version === owner.version) return cached.hash;
  const hash = hashOf(items);
  versionedHashes.set(owner, { version: owner.version, hash });
  return hash;
}

/**
 * A comparable copy of a draw's value: numbers and the like as they are, typed arrays hashed, vectors, colours and
 * matrices as arrays, textures by size and data, plain objects by their entries, and other objects by their class only,
 * so that run-specific IDs, UUIDs and upload versions stay out.
 */
function valueDigest(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return hashOf(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(valueDigest);
  if (value instanceof Texture) {
    const image = value.image as { width?: number; height?: number; data?: ArrayLike<number> } | null;
    return { texture: [image?.width ?? null, image?.height ?? null], data: image?.data ? versionedHash(value, image.data) : null, offset: value.offset.toArray(), repeat: value.repeat.toArray() };
  }
  if (typeof (value as { toArray?: unknown }).toArray === 'function') return (value as { toArray: () => unknown }).toArray();
  if (Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, valueDigest(item)]));
  return value.constructor.name;
}

function materialDigest(material: Material) {
  const { type, transparent, opacity, depthTest, depthWrite, blending } = material;
  const uniforms = (material as Partial<ShaderMaterial>).uniforms;
  return {
    type, transparent, opacity, depthTest, depthWrite, blending,
    map: valueDigest((material as { map?: unknown }).map ?? null), colour: valueDigest((material as { color?: unknown }).color ?? null),
    uniforms: uniforms ? Object.fromEntries(Object.entries(uniforms).map(([name, { value }]) => [name, valueDigest(value)])) : null,
  };
}

/**
 * What a recorded frame drew, taken right after the draw since the objects are live: by pass, its scene, camera,
 * target and clearing, and each object's transform, geometry and material with its uniforms.
 */
const frameDigest = (frame: readonly PassRecord[]) => frame.map(({ scene, camera, projection, target, clearColor, clearDepth, scissor, objects }) => ({
  scene: scene.name, camera: [camera.position.toArray(), camera.quaternion.toArray(), projection],
  target: target && [target.width, target.height], clearColor, clearDepth, scissor,
  objects: objects.map(({ mesh, name, geometry, material }) => ({
    name, transform: [mesh.position.toArray(), mesh.quaternion.toArray(), mesh.scale.toArray(), mesh.renderOrder],
    geometry: [Object.entries(geometry.attributes).map(([key, attribute]) => [key, versionedHash(attribute as BufferAttribute, (attribute as BufferAttribute).array)]), geometry.index && versionedHash(geometry.index, geometry.index.array), geometry.drawRange],
    material: materialDigest(material),
  })),
}));

/** A renderer for `picture`; null for none. */
function rendererFor(picture: Picture): { renderer: FlightRenderer | null; surface: RecordingSurface | null } {
  const reportError = () => undefined;
  if (picture === 'none') return { renderer: null, surface: null };
  if (picture === 'unavailable') return { renderer: createFlightRenderer({ ownerId: 1, unavailable: new GraphicsUnavailableError({ cause: null }), reportError }), surface: null };
  const surface = new RecordingSurface();
  const renderer = createFlightRenderer({ ownerId: 1, surface, reportError });
  // A surface without a positive size never draws.
  if (picture !== 'not-drawing') surface.resize();
  return { renderer, surface };
}

/** Device changes at block starts, given with that block's input. */
function deviceSchedule(picture: Picture, surface: RecordingSurface | null): Readonly<Record<number, () => void>> {
  if (picture === 'context-lost') return { [LOST_AT]: () => surface!.events!.contextLost(), [RESTORED_AT]: () => surface!.events!.contextRestored() };
  if (picture === 'device-failed') return { [FAILED_AT]: () => { surface!.drawFailure = new GraphicsDeviceError('lost', { cause: null }); } };
  return {};
}

interface RunOptions {
  /** Changes the frames the wiring's frame consumer gets. */
  readonly tamper?: FrameTamper;
  /** Exports the recording after each frame's ticks, before the run's consumers see the frame. */
  readonly exportEachFrame?: boolean;
}

/**
 * Starts a run of the changed package, wires `picture` while it is held at tick 0, completes the departure and plays
 * `frames` (ticks per frame) after a first frame that anchors the clock, stopping early once the session faults. Every
 * frame that ends a block and was drawn is digested, by the tick it ends.
 */
function play(source: PackageRun, picture: Picture, frames: readonly number[], { tamper, exportEachFrame = false }: RunOptions = {}) {
  const { session, host, errors } = sessionSetup();
  session.control({ type: 'start', spec: source.spec() });
  const run = current(session);
  const events: DomainEvent[] = [];
  const reports: FrameReport[] = [];
  let exported: Recording | null = null;
  run.onAny((event) => { events.push(event); });
  run.onFrame(({ report }) => {
    if (report) reports.push(report);
    if (exportEachFrame) exported = run.exportRecording();
  });
  const { renderer, surface } = rendererFor(picture);
  let wiring: FlightRunWiring | null = null;
  const presentation: PresentationRecord[] = [];
  if (renderer) {
    const binding = { ownerId: 1, runId: run.runId, generation: source.generation, identity: source.identity };
    wiring = wireFlightRun(wiringHandle(run, tamper), { renderer, binding, content: source.content, seed: PRESENTATION_SEED });
    const { presentation: module, effects } = wiring;
    module.subscribe((tick) => {
      presentation.push({ tick, explosions: module.explosions(), fragments: effects.fragments(), flashes: effects.flashRequests(tick.tick) });
    });
  }
  session.control({ type: 'complete-departure', runId: run.runId });
  const device = deviceSchedule(picture, surface);
  const drawn = new Map<number, ReturnType<typeof frameDigest>>();
  let now = 0;
  let tick = 0;
  host.deliver(now);
  for (const ticks of frames) {
    if (session.status().phase === 'faulted') break;
    if (ticks > 0 && tick % BLOCK === 0) {
      const block = SCRIPT[(tick / BLOCK) % SCRIPT.length];
      run.setIntent(block.intent);
      for (const command of block.commands) run.submitCommand(command);
      device[tick]?.();
    }
    const before = surface?.frames.length ?? 0;
    now += ticks * TICK_MS;
    host.deliver(now);
    tick += ticks;
    if (ticks > 0 && tick % BLOCK === 0 && surface && surface.frames.length > before) drawn.set(tick, frameDigest(surface.frames.at(-1)!));
  }
  return { session, host, errors, run, events, reports, exported: exported as Recording | null, renderer, wiring, presentation, drawn };
}

/** Core's outcome of a finished run: its events as delivered, and its recording with a checkpoint every tick. */
function coreOf({ run, events, reports }: ReturnType<typeof play>) {
  const recording = run.exportRecording();
  if (!recording) throw new Error('Expected a recording');
  return { events, recording, ticks: reports.flatMap(({ outputs }) => outputs.map((output) => output.tick)) };
}

/** The block ends at which every grouping ends a frame, after the first. */
const BLOCK_ENDS = Array.from({ length: TICKS / BLOCK }, (_, at) => (at + 1) * BLOCK);

/** The block ends whose frames each picture draws. */
const DRAWN_ENDS: Readonly<Record<(typeof PICTURES)[number], readonly number[]>> = {
  drawing: BLOCK_ENDS,
  'not-drawing': [],
  'context-lost': BLOCK_ENDS.filter((end) => end <= LOST_AT || end > RESTORED_AT),
  unavailable: [],
  'device-failed': BLOCK_ENDS.filter((end) => end <= FAILED_AT),
};

/** The end of the frame of `frames` that runs `tick`, and of the frame before. */
function frameAround(frames: readonly number[], tick: number): { readonly previous: number; readonly end: number } {
  let end = 0;
  for (const ticks of frames) {
    if (end + ticks >= tick) return { previous: end, end: end + ticks };
    end += ticks;
  }
  throw new Error(`No frame runs tick ${tick}`);
}

describe('the flight presentation and picture with Core (AC-17)', () => {
  let source: PackageRun;
  let baseline: { core: ReturnType<typeof coreOf>; presentation: readonly PresentationRecord[]; drawn: ReadonlyMap<number, unknown> };

  beforeAll(async () => {
    source = await packageRun();
    const core = coreOf(play(source, 'none', GROUPINGS['one tick a frame']));
    const { presentation, drawn } = play(source, 'drawing', GROUPINGS['one tick a frame']);
    baseline = { core, presentation, drawn };
  });

  it('has a run whose presentation has something to choose: Core explosions and extra ones', () => {
    const { core, presentation, drawn } = baseline;
    expect(core.ticks).toEqual(Array.from({ length: TICKS }, (_, at) => at + 1));
    expect(core.recording.result.checkpoints.map(({ tick }) => tick)).toEqual(Array.from({ length: TICKS + 1 }, (_, at) => at));
    expect(core.recording.record.ticks.flatMap(({ commands }) => commands).length).toBeGreaterThan(0);
    const count = (type: DomainEvent['type']) => core.events.filter((event) => event.type === type).length;
    // The player's own explosion starts at tick 100.
    expect({ destroyed: count('object-destroyed'), started: count('explosion-started'), released: count('source-released') })
      .toEqual({ destroyed: 8, started: 7, released: 7 });
    expect(presentation.map(({ tick }) => tick.tick)).toEqual(Array.from({ length: TICKS }, (_, at) => at + 1));
    const activations = presentation.flatMap(({ tick }) => tick.activations);
    expect(new Set(activations.map(({ key }) => key)).size).toBe(activations.length);
    // Seven Core explosions and ten extra ones, whose ticks and choices come from the presentation's random source.
    expect(activations.map(({ origin }) => origin.type).sort()).toEqual([...Array(7).fill('core'), ...Array(10).fill('extra')]);
    expect(new Set(activations.map(({ selection }) => selection.item)).size).toBeGreaterThan(2);
    expect([...drawn.keys()]).toEqual(BLOCK_ENDS);
    // The recording replays to the same outcome.
    expect(compareReplayResults(core.recording.result, replayRecord(core.recording.record, contentOf(source.spec() as never)))).toEqual({ match: true });
  });

  describe.each(GROUPING_NAMES)('%s', (grouping) => {
    const frames = GROUPINGS[grouping];

    it('gives Core the same input, events, checkpoints and state hashes without a presentation', () => {
      const played = play(source, 'none', frames);
      expect(played.errors).toEqual([]);
      expect(played.reports.every(({ cut, stop }) => cut === null && stop === null)).toBe(true);
      expect(coreOf(played)).toEqual(baseline.core);
    });

    it.each(PICTURES)('gives Core and the presentation the same outcome with a %s picture', (picture) => {
      const played = play(source, picture, frames);
      expect(played.errors).toEqual([]);
      expect(played.session.status().phase).toBe('running');
      expect(coreOf(played)).toEqual(baseline.core);
      expect(played.presentation).toEqual(baseline.presentation);
      // Each frame ending a block draws the state after that tick (alpha 0) as the one-tick run's does.
      expect(played.drawn).toEqual(new Map(DRAWN_ENDS[picture].map((end) => [end, baseline.drawn.get(end)])));
      const diagnostics = played.renderer!.diagnostics();
      const frameCount = frames.length + 1;
      const expected = {
        drawing: { state: 'ready', draws: frameCount, lastTick: TICKS },
        'not-drawing': { state: 'ready', draws: 0, lastTick: null },
        'context-lost': { state: 'ready', lastTick: TICKS },
        unavailable: { state: 'unavailable', draws: 0, lastTick: null },
        'device-failed': { state: 'failed', lastTick: FAILED_AT },
      }[picture];
      expect(diagnostics).toMatchObject({ runId: 1, ...expected });
      if (picture === 'context-lost') expect(diagnostics.draws).toBeLessThan(frameCount);
    });
  });

  /** The tick the wiring is handed again in place of the next one; no grouping starts a frame with the next. */
  const REPEATED_TICK = 11;

  /** Replaces the output of tick REPEATED_TICK + 1 with that of REPEATED_TICK, which an earlier frame may have held. */
  function repeatTick(): FrameTamper {
    let last: TickOutput | null = null;
    return (frame) => {
      if (!frame.report) return frame;
      const outputs = frame.report.outputs.map((output) => (output.tick === REPEATED_TICK + 1 ? last! : output));
      last = frame.report.outputs.at(-1) ?? last;
      return { ...frame, report: { ...frame.report, outputs } };
    };
  }

  it.each(GROUPING_NAMES)('faults on a malformed tick batch after the ticks before it, and stops: %s', (grouping) => {
    const frames = GROUPINGS[grouping];
    const played = play(source, 'drawing', frames, { tamper: repeatTick(), exportEachFrame: true });
    const { session, host, events, exported, renderer, wiring, presentation } = played;
    expect(session.status()).toMatchObject({
      phase: 'faulted',
      error: { kind: 'operation-failed', failures: [{ phase: 'consumer', cause: expect.objectContaining({ name: 'PresentationError', kind: 'invalid-input' }) }] },
    });
    // Core ran the whole frame that holds the refused tick, as in the run without a presentation: the same input,
    // events, checkpoints and state hashes.
    const { previous, end } = frameAround(frames, REPEATED_TICK + 1);
    const { record, result } = baseline.core.recording;
    expect(exported!.record.ticks).toEqual(record.ticks.slice(0, end));
    expect(exported!.result).toEqual({ ...result, events: result.events.filter((event) => event.tick <= end), checkpoints: result.checkpoints.slice(0, end + 1), finalTick: end });
    expect(events).toEqual(exported!.result.events);
    // The presentation processed every earlier tick of that frame as in its one-tick run, refused the batch's next
    // tick, and the frame was not drawn.
    expect(presentation).toEqual(baseline.presentation.slice(0, REPEATED_TICK));
    expect(renderer!.diagnostics()).toMatchObject({ lastTick: previous === 0 ? null : previous });
    // It stops: no frame is requested, Core is not read again, and the fault released the run's presentation and picture.
    expect(host.pending.size).toBe(0);
    expect(() => played.run.snapshot()).toThrow();
    expect(() => wiring!.presentation.camera()).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    expect(renderer!.diagnostics()).toMatchObject({ runId: null, resources: null, gpu: { geometries: 0, textures: 0 } });
  });
});
