/**
 * Pure rules of the radio queue and the incoming channel (docs/plan/p3/02/spec.md, CB-05, CB-06, CB-09 and CB-12;
 * docs/plan/p3/10/spec.md, D-03 items 2–4; docs/original/formats/executable.md, RQ3–RQ5 and RQ10). The systems that
 * apply them to a world are systems/radio.ts's.
 *
 * - **Insert `0x2c740`:** a head item (the docking reply's `0x2c728`) goes before the current head; any other before the
 *   first item whose due clock is greater, so equal dues stay first in, first out. The original compares dues as signed
 *   i32, which differs from numeric order only for dues of 2³¹ units and above (CB-17 decision 16).
 * - **Lookup `0x3c618(table, face, index)`:** no message for no face or a negative one, a face past the table's
 *   sub-tables, an index past the sub-table or an entry of 0; otherwise the entry's frame durations. The archive is
 *   always open in the chosen model (D-03 item 1).
 * - **Face `0x3c91c(flags, n)`:** f = rand % n; when f is taken, the first free face; when every face is taken, rand % n
 *   again. One draw, or two.
 * - **Playback `0x4e5a0`:** e = ((sample − start) × 8 mod 2³²) >> 6, in 1/8 s; the message ends once e reaches the sum
 *   of its frames' durations (signed), the cumulative form of consuming the frames in turn (CB-09).
 */
import { CoreFaultError } from '../errors.ts';
import type { CommunicationsRuleData, MessageFrames } from '../world/comm-input.ts';
import type { MessageIdentity, MissionFlow, RadioItem } from '../world/world-state.ts';

/** Whether `kindBit` is in the kind mask. */
export const hasKind = (mask: number, kindBit: number): boolean => ((mask >>> kindBit) & 1) === 1;

/** Clock units from the end of a docking reply to sub-state 4's due clock (`0x333d4`). */
export const DOCKING_COUNTDOWN = 0x200;

/** The sub-state in which `0x3336c` holds the queue: the destruction sequence (P3-11, ME-03). */
const QUEUE_HELD_SUB_STATE: number = 2;

/** `0x3336c`, the take's flow gate: main-flow state 3 and sub-state other than 2. */
export function takesRadio(flow: Pick<MissionFlow, 'mainState' | 'subState'>): boolean {
  return flow.mainState === 3 && flow.subState !== QUEUE_HELD_SUB_STATE;
}

/** Where `0x2c740` inserts an item due at `due`: 0 for a head item, otherwise before the first item due later. */
export function insertionIndex(queue: readonly RadioItem[], due: number, head: boolean): number {
  if (head) return 0;
  const index = queue.findIndex((item) => item.due > due);
  return index === -1 ? queue.length : index;
}

/** `0x3c618(table, face, index)`: the message's frame durations, or null when no message resolves. */
export function lookupMessage(
  messages: CommunicationsRuleData['messages'],
  table: MessageIdentity['table'],
  face: number | null,
  index: number,
): MessageFrames {
  if (face === null || face < 0) return null;
  const entries = table === 20983 ? messages.direct : messages.faceTables[table][face];
  return entries?.[index] ?? null;
}

/** The frame durations of a message that was found when it was queued; a missing one breaks that invariant. */
export function messageFrames(messages: CommunicationsRuleData['messages'], { table, face, index }: MessageIdentity): readonly number[] {
  // The direct list's identity has no face; its lookups pass face 0.
  const frames = lookupMessage(messages, table, face ?? 0, index);
  if (frames === null) throw new CoreFaultError('invariant-violated', 'radio.message');
  return frames;
}

/** `0x3c91c(flags, n)`, taking the face it returns; `rand` gives the original's rand values, drawn only when needed. */
export function assignFace(flags: boolean[], rand: () => number): number {
  let face = rand() % flags.length;
  if (flags[face]) {
    face = flags.indexOf(false);
    if (face === -1) face = rand() % flags.length;
  }
  flags[face] = true;
  return face;
}

/** e of `0x4e5a0`: the 1/8 s elapsed since `startClock`, as the original's wrapping ×8 and logical shift form it. */
export function elapsedEighths(clock: number, startClock: number): number {
  const delta = clock - startClock;
  if (!Number.isSafeInteger(delta) || delta < 0 || delta > 0xffffffff) throw new CoreFaultError('invariant-violated', 'radio.playback-clock');
  return ((delta * 8) >>> 0) >>> 6;
}

/** The frame shown after `elapsed` eighths: an index of `frameDurations`, or its length once every frame is consumed. */
export function playbackFrame(elapsed: number, frameDurations: readonly number[]): number {
  let end = 0;
  for (const [frame, duration] of frameDurations.entries()) {
    end += duration;
    if (elapsed < end) return frame;
  }
  return frameDurations.length;
}
