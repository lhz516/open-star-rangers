/**
 * The radio queue and the incoming channel of a world (docs/plan/p3/02/spec.md, CB-05, CB-06, CB-09 and CB-12;
 * docs/plan/p3/10/spec.md, D-03 items 2–5; docs/original/formats/executable.md, RQ3–RQ8 and RX1). The rules they apply
 * are rules/radio.ts's. Other tasks queue through these entries rather than keeping a queue of their own:
 *
 * - `queueRadio` (`0x2c740`): inserts an item due at the sample of its call (every delay is 0) and emits `radio-queued`. A
 *   docking reply goes to the head. More than CORE_LIMITS.radioQueueItems items is a budget fault, never a drop.
 * - `queueLine` (`0x38d54`): a wingman line of 20985, with its draw before the lookup.
 * - `speakerFace` (`0x3c894`): a speaker's face, drawn from its class's pool at a craft's or a base's first speech.
 * - `flushRadio` (`0x2cd20`): empties the queue, stops a playing message (restoring the saved page while page 5 shows
 *   it) or cancels a loading one without its callback, then sets page 0, and emits `radio-flushed` last.
 *
 * Every tick, the `communications-reply` stage takes at most the head (`takeRadio`, `0x2cd60`): once due, while the
 * channel is idle and the flow gate `0x3336c` holds; the channel then loads it, without running its callback. The
 * presentation sub-step (`presentIncoming`) ends `frame-end`, in every view mode, in place of the original's render
 * hooks `0x4e308` and `0x4e5a0` (D-03 item 3):
 *
 * 1. a message loading since the previous tick starts playing at this tick's clock: a fixed load latency of one tick,
 *    an approved difference (RQ5). Outside the Warp view (1) its page 5 shows, saving the page it replaces in the
 *    incoming slot, apart from the menu's and Warp's saved pages (RQ8); `incoming-started`;
 * 2. a playing message (one that just started included) ends once its frames are consumed: the channel is idle, the
 *    saved page returns only while page 5 still shows, then its callback runs, and `incoming-ended`. The docking reply's
 *    callback `0x333d4` moves sub-state 3 to 4, due DOCKING_COUNTDOWN after this clock, whoever replied (DK1); the
 *    mission flow reads it at the next tick.
 *
 * Page writes here have no command: each emits `left-page-changed` only when the page changes (CB-03).
 */
import type { RadioFlushedEvent } from '../contracts/domain-events.ts';
import { fitsLimit } from '../contracts/limits.ts';
import { CoreFaultError } from '../errors.ts';
import { INCOMING_PAGE } from '../rules/displays.ts';
import { RandStream } from '../rules/original-random.ts';
import { assignFace, DOCKING_COUNTDOWN, elapsedEighths, hasKind, insertionIndex, lookupMessage, messageFrames, playbackFrame, takesRadio } from '../rules/radio.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import type { MessageIdentity, RadioCallback, SpeakerSnapshot } from '../world/world-state.ts';
import { setLeftPage } from './displays.ts';
import { emit, type TickContext } from './pipeline.ts';

/** The Warp view mode, in which an incoming message shows no page 5 (RQ5). */
const WARP_VIEW_MODE = 1;

/** Kind bit 1, the wingman, whose face is its +0xDC − 1 (RX1). */
const WINGMAN_KIND_BIT = 1;
/** Craft kinds `0x87c`, which take a face from the 3-face pool, and base kinds `0x68000`, from the 5-face pool. */
export const CRAFT_SPEAKER_KINDS = 0x87c;
const BASE_SPEAKER_KINDS = 0x68000;

/** The speaker as a message keeps it, so that it stays displayable once the entity is gone. */
export function speakerSnapshot(entity: Entity): SpeakerSnapshot {
  return { entityId: entity.id, kindBit: entity.kindBit, name: entity.name };
}

/** Draws through the world's generator, writing its state back once `draws` returns. */
function withRand<Result>(context: TickContext, draws: (rand: () => number) => Result): Result {
  const { world } = context;
  const stream = new RandStream(world.rngState);
  const result = draws(() => stream.next());
  world.rngState = stream.state;
  return result;
}

/**
 * `0x3c894(entityId)`: null when it does not resolve; the wingman's +0xDC − 1; a craft's of `0x87c` or a base's own
 * face, assigned from its class's pool at the first call; 0 for any other kind (RQ4).
 */
export function speakerFace(context: TickContext, entityId: EntityId | null): number | null {
  const entity = entityId === null ? undefined : context.world.entities.get(entityId);
  if (entity === undefined) return null;
  if (entity.kindBit === WINGMAN_KIND_BIT) return entity.ruleInputs.aiValueA - 1;
  const pools = context.world.communications.facePools;
  const pool = hasKind(CRAFT_SPEAKER_KINDS, entity.kindBit) ? pools.craft : hasKind(BASE_SPEAKER_KINDS, entity.kindBit) ? pools.base : null;
  if (pool === null) return 0;
  const { communications } = entity;
  communications.face ??= withRand(context, (rand) => assignFace(pool, rand));
  return communications.face;
}

/** `0x2c740` with delay 0: `radio-queued`; a docking reply goes to the head (`0x2c728`). */
export function queueRadio(context: TickContext, message: MessageIdentity, callback: RadioCallback, speaker: SpeakerSnapshot | null): void {
  const { world, time } = context;
  const { queue } = world.communications;
  if (!fitsLimit('radioQueueItems', queue.length, 1)) throw new CoreFaultError('budget-exhausted', 'radio.queue');
  const head = callback === 'docking-reply';
  // The sample at the call: the world's clock, still the previous tick's in `mission-flow` (C3).
  const item = Object.freeze({ message: Object.freeze({ ...message }), due: world.clock, callback, speaker: speaker === null ? null : Object.freeze({ ...speaker }) });
  queue.splice(insertionIndex(queue, item.due, head), 0, item);
  emit(context, { type: 'radio-queued', tick: time.tick, message: item.message, callback, speaker: item.speaker, position: head ? 'head' : 'sorted', length: queue.length });
}

/** Looks the message up (`0x3c618`) and queues it when it resolves; returns whether it did. */
export function queueMessage(
  context: TickContext,
  { table, face, index }: { readonly table: MessageIdentity['table']; readonly face: number | null; readonly index: number },
  callback: RadioCallback,
  speaker: SpeakerSnapshot | null,
): boolean {
  if (lookupMessage(context.world.ruleData.communications.messages, table, face, index) === null) return false;
  // A resolved lookup had a face of 0 or more; the direct list's identity has none.
  const message: MessageIdentity = table === 20983 ? { table, face: null, index } : { table, face: face as number, index };
  queueRadio(context, message, callback, speaker);
  return true;
}

/** The line types `0x38d54` draws for: type 0 adds rand % 3, these types rand % 2, type 7 becomes 5 + rand % 3. */
const PAIRED_LINE_TYPES: ReadonlySet<number> = new Set([3, 5, 8, 0xe, 0x10]);
/** The type whose line queues with the music step `0x2c6cc`. */
const MUSIC_STEP_LINE_TYPE = 8;

/** The 20985 index of a line of `type`, drawing as `0x38d54` does. */
function lineIndex(type: number, rand: () => number): number {
  if (type === 0) return rand() % 3;
  if (PAIRED_LINE_TYPES.has(type)) return type + (rand() % 2);
  return type === 7 ? 5 + (rand() % 3) : type;
}

/**
 * `0x38d54(speaker, type)`: false before any draw when the speaker does not resolve or its face is outside 0–4;
 * otherwise draws for the type, then queues the line of 20985 when it resolves (type 8 with the music step) and returns
 * whether it did.
 */
export function queueLine(context: TickContext, speaker: EntityId | null, type: number): boolean {
  const entity = speaker === null ? undefined : context.world.entities.get(speaker);
  if (entity === undefined) return false;
  const face = speakerFace(context, entity.id);
  if (face === null || face < 0 || face > 4) return false;
  const index = withRand(context, (rand) => lineIndex(type, rand));
  return queueMessage(context, { table: 20985, face, index }, type === MUSIC_STEP_LINE_TYPE ? 'music-step' : 'none', speakerSnapshot(entity));
}

/** `0x2cd20` (module comment); P3-11 adds its causes. */
export function flushRadio(context: TickContext, cause: RadioFlushedEvent['cause']): void {
  const { world, time } = context;
  const communications = world.communications;
  const removed = communications.queue.splice(0).length;
  const { channel } = communications;
  if (channel.phase === 'playing' && world.player.leftDisplay.page === INCOMING_PAGE) setLeftPage(context, world.player.communications.incomingSavedPage);
  communications.channel = { phase: 'idle' };
  setLeftPage(context, 0);
  emit(context, { type: 'radio-flushed', tick: time.tick, cause, removed, interrupted: channel.phase === 'idle' ? 'none' : channel.phase });
}

/** The `communications-reply` stage (`0x2cd60`): takes the due head while the channel is idle and the flow allows it. */
export function takeRadio(context: TickContext): void {
  const { world, time } = context;
  const communications = world.communications;
  const [head] = communications.queue;
  if (head === undefined || time.clock < head.due || communications.channel.phase !== 'idle' || !takesRadio(world.flow)) return;
  communications.queue.shift();
  communications.channel = { phase: 'loading', item: head, readyTick: time.tick + 1 };
  emit(context, { type: 'radio-taken', tick: time.tick, message: head.message, speaker: head.speaker });
}

/** `0x333d4`: in mission sub-state 3, sub-state 4 due DOCKING_COUNTDOWN after this clock; returns whether it moved. */
function startDockingCountdown(context: TickContext): boolean {
  const { flow } = context.world;
  if (flow.mainState !== 3 || flow.subState !== 3) return false;
  const due = context.time.clock + DOCKING_COUNTDOWN;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'radio.docking-countdown');
  flow.subState = 4;
  flow.dockingDeadline = due;
  return true;
}

/** Step 1 of the presentation sub-step: a message loading since the previous tick starts playing. */
function startIncoming(context: TickContext): void {
  const { world, time } = context;
  const communications = world.communications;
  const { channel } = communications;
  if (channel.phase !== 'loading') return;
  if (channel.readyTick > time.tick) return;
  if (channel.readyTick < time.tick) throw new CoreFaultError('invariant-violated', 'radio.load');
  const { item } = channel;
  const frameDurations = Object.freeze([...messageFrames(world.ruleData.communications.messages, item.message)]);
  communications.channel = { phase: 'playing', item, startClock: time.clock, frameDurations };
  const shown = world.player.viewMode !== WARP_VIEW_MODE;
  if (shown) {
    world.player.communications.incomingSavedPage = world.player.leftDisplay.page;
    setLeftPage(context, INCOMING_PAGE);
  }
  emit(context, { type: 'incoming-started', tick: time.tick, message: item.message, speaker: item.speaker, frameDurations, shown });
}

/** Step 2 of the presentation sub-step: a playing message whose frames are all consumed ends and runs its callback. */
function endIncoming(context: TickContext): void {
  const { world, time } = context;
  const communications = world.communications;
  const { channel } = communications;
  if (channel.phase !== 'playing') return;
  const { frameDurations } = channel;
  if (playbackFrame(elapsedEighths(time.clock, channel.startClock), frameDurations) < frameDurations.length) return;
  communications.channel = { phase: 'idle' };
  if (world.player.leftDisplay.page === INCOMING_PAGE) setLeftPage(context, world.player.communications.incomingSavedPage);
  const { item } = channel;
  const countdownStarted = item.callback === 'docking-reply' && startDockingCountdown(context);
  emit(context, { type: 'incoming-ended', tick: time.tick, message: item.message, speaker: item.speaker, callback: item.callback, countdownStarted });
}

/** The presentation sub-step that ends `frame-end` (module comment). */
export function presentIncoming(context: TickContext): void {
  startIncoming(context);
  endIncoming(context);
}
