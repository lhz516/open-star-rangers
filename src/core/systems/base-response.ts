/**
 * A friendly's answer to a delivered command, the communications part `0x3bed0` of its own update
 * (docs/plan/p3/02/spec.md, CB-04 and CB-12; docs/original/formats/executable.md, CD3, RQ1, RQ2 and RQ4). It runs in the
 * `object-update` walk for every entity of kinds `0x6807c` in state 7, whatever its activity (parked and docked ones
 * too), after the AI step, and reads the pending command a `deliver-command` wrote in an earlier tick's request
 * handling (CD4):
 *
 * - **7, status:** the threat test `0x3c040` first updates the threat stamp (no threat: none; a threat and no stamp:
 *   this clock). Then the speaker's face and, by the stamp, the message: 20019 index 1 stamped or 0 for kinds `0x87c`,
 *   otherwise (bases) 20011 index 4 stamped or 1; queued in due order without a callback when it resolves.
 * - **9, docking:** the face, then 20011 index 0, queued at the head with the docking reply's callback when it resolves.
 *   There is no refusal: no hull, damage, activity or distance is read (RQ1).
 * - Every non-zero code is cleared after it is handled, other codes doing nothing.
 *
 * - **No command, the threat re-announce:** once the threat stamp is more than 0xB40 units old, the threat test runs
 *   again: no threat clears the stamp; a threat with a stamp more than 0x2D00 units old clears it and re-announces
 *   through `0x3c208(0x93780, 0, self, 0)` (comm-reactions.ts), whose step 3 then passes its limit and stamps again
 *   unless the name is in neither list (RX4).
 *
 * No message resolves for a face outside its table or an entry of 0: nothing is queued, and a docking request then
 * expires (RQ7).
 */
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { FRIENDLY_RESPONDER_KINDS, HOSTILE_KINDS, PERIODS } from '../rules/comm-reactions.ts';
import { hasKind } from '../rules/radio.ts';
import { squaredDistance } from '../rules/speed-match.ts';
import { isActiveState, type Entity } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { reactToHit } from './comm-reactions.ts';
import type { TickContext } from './pipeline.ts';
import { CRAFT_SPEAKER_KINDS, queueMessage, speakerFace, speakerSnapshot } from './radio.ts';

const STATUS_CODE = 7;
const DOCKING_CODE = 9;

/**
 * `0x3c040(friendly)`: whether a hostile (kinds `0x93780`) not flagged destroyed, in state 4 or 7 and above (activity
 * not read), lies strictly within r of it, r the f32 +0x0C of the friendly's craft record, compared as squares with r²
 * rounded to f32 (RQ2). An unordered distance counts as near.
 */
export function threatened(world: WorldState, friendly: Entity): boolean {
  const record = world.craftInfo.content.craft[friendly.kindBit];
  if (record === undefined) throw new CoreFaultError('invariant-violated', 'base-response.craft-record');
  const radiusSquared = Math.fround(record.at0C * record.at0C);
  for (const hostile of world.entities.walk(HOSTILE_KINDS)) {
    if (hostile.destroyed || !(hostile.state === 'destroyed-source' || isActiveState(hostile.state))) continue;
    if (!(squaredDistance(friendly.position, hostile.position) >= radiusSquared)) return true;
  }
  return false;
}

/** Code 7: the threat stamp, then the status message by the stamp. */
function replyStatus(context: TickContext, friendly: Entity): void {
  const { communications } = friendly;
  if (!threatened(context.world, friendly)) communications.threatStamp = null;
  else communications.threatStamp ??= context.time.clock;
  const face = speakerFace(context, friendly.id);
  const stamped = communications.threatStamp !== null;
  const message = hasKind(CRAFT_SPEAKER_KINDS, friendly.kindBit)
    ? { table: 20019, face, index: stamped ? 1 : 0 } as const
    : { table: 20011, face, index: stamped ? 4 : 1 } as const;
  queueMessage(context, message, 'none', speakerSnapshot(friendly));
}

/** Code 9: the docking reply, at the head of the queue. */
function replyDocking(context: TickContext, friendly: Entity): void {
  const face = speakerFace(context, friendly.id);
  queueMessage(context, { table: 20011, face, index: 0 }, 'docking-reply', speakerSnapshot(friendly));
}

/** No command: the threat re-announce, while the stamp is older than the recheck period (module comment). */
function reannounceThreat(context: TickContext, friendly: Entity): void {
  const { communications } = friendly;
  const stamp = communications.threatStamp;
  const sample = context.time.clock;
  if (stamp === null || !isDue(sample, stamp + PERIODS.threatRecheck)) return;
  if (!threatened(context.world, friendly)) {
    communications.threatStamp = null;
  } else if (isDue(sample, stamp + PERIODS.threat)) {
    communications.threatStamp = null;
    reactToHit(context, HOSTILE_KINDS, null, friendly, 0);
  }
}

/** `0x3bed0` in a craft's update: only in state 7 and for kinds in `0x6807c` (module comment). */
export function answerCommand(context: TickContext, friendly: Entity): void {
  if (friendly.state !== 'active' || !hasKind(FRIENDLY_RESPONDER_KINDS, friendly.kindBit)) return;
  const command = friendly.ai.pendingCommand;
  if (command === null) {
    reannounceThreat(context, friendly);
    return;
  }
  if (command.code === STATUS_CODE) replyStatus(context, friendly);
  else if (command.code === DOCKING_CODE) replyDocking(context, friendly);
  friendly.ai.pendingCommand = null;
}
