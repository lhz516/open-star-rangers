import { readFile } from 'node:fs/promises';
import { ruleDataInputs, runModelInputs, type PackageGroup } from '../../src/app/resources/mission-input.ts';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { AssetDescriptor } from '../../src/content/asset-contract.ts';
import { LOGIC_PAYLOAD_SCHEMA_VERSION, type MissionContent, type MissionDeclaration } from '../../src/content/logic/logic-content.ts';
import { decodeLogicPayload, encodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import type { AiPrograms, ScriptItem } from '../../src/content/rule-data/ai-programs.ts';
import type { CraftInfo } from '../../src/content/rule-data/craft-info.ts';
import { decodeRuleDataPayload, RULE_DATA_SCHEMA_VERSIONS } from '../../src/content/rule-data/rule-data-payload.ts';
import type { ThreatWarnings } from '../../src/core/projections/projection.ts';
import { compareReplayResults, type ReplayComparison } from '../../src/core/replay/compare.ts';
import { recordState, type Recording } from '../../src/core/replay/recording.ts';
import { startReplay, type ReplayContent } from '../../src/core/replay/replay.ts';
import { AI_PROGRAMS_ASSET, missionAssetContent, ruleDataBytes, withPayloads } from './ai-wingman.ts';
import { radarSpans, rectPoints, textPixels, wrongPixels, type CockpitFixture, type Point } from './cockpit.ts';
import type { LogicalImage } from './flight-pictures.ts';
import type { SeededPackage } from './production-cache.ts';

// P3-15 subtask 04 (docs/plan/p3/15/spec.md, S-06; AC-06): the type-9 warning end to end. A variant of the converted
// `mission-startable` package in which Core's own rules raise and clear both warnings of FA-01's partition-level
// `communications.warnings`, whatever the run seed: a hostile behind the player closes its missile lock on it through
// CR-16's AI lock update (0 → 2 → 3 → 4, `attackerOnTail` from level 3), fires the missile at level 4 through its script
// (the launch drops its lock to 0), and the missile homes on the player (`missileIncoming`) until its lifetime ends. As
// e2e/support/joint-loop.ts does, the mission, craft-info and AI-programs payloads are replaced in Node; everything is
// code-generated from the synthetic disc's conversion and holds no original data. Nothing here writes application
// state: the page is read through its DOM and the mission's UI store, the run is replayed in Node from its own recording.

/** The kind bits of the variant's objects: the player, the hostile (a tail attacker kind of 0x780) and missiles. */
export const WARNING_KINDS = Object.freeze({ player: 0, hostile: 7, missile: 20 });

const MISSION_ASSET = 'mission/first-campaign';
const CRAFT_INFO_ASSET = 'data/craft-info';
/** A spawn time far beyond any run here, in source units: such a record stays queued. */
const NEVER = 4_000_000;

/** Stored points in reference units (×50/3 at runtime): the player faces +z, the hostile 250 units behind it faces it. */
const POINTS = Object.freeze({ player: { x: 100, y: 200, z: 0 }, hostile: { x: 100, y: 200, z: -15 } });

/** One craft of `kind` from `template`'s fields at the stored `point`, with `changes` applied. */
function placed(template: MissionDeclaration, kind: number, point: MissionDeclaration['position'], changes: Partial<MissionDeclaration> = {}): MissionDeclaration {
  return {
    ...template, origins: ['object'], craftType: kind, nameCandidates: [], position: point, spawnTime: 0, gridSpacing: 0,
    placement: { region: null, anchor: null }, memberOf: null, aiTarget: null, eventTrigger: null, aiTargetCraftTypes: [], ...changes,
    ruleInputs: { ...template.ruleInputs, craftCount: null, ...changes.ruleInputs },
  };
}

/**
 * The variant's mission: the player and the hostile. The other craft types the converted table lists must still be
 * declared; they stay queued beyond the run, which also keeps the all-clear away (the hostile counts for trigger 0).
 */
function warningMission(converted: MissionContent): MissionContent {
  const template = (kind: number) => converted.declarations.find(({ craftType }) => craftType === kind) ?? converted.declarations[0];
  const declarations = [
    placed(template(WARNING_KINDS.player), WARNING_KINDS.player, POINTS.player),
    placed(template(WARNING_KINDS.hostile), WARNING_KINDS.hostile, POINTS.hostile, { eventTrigger: 0 }),
    ...[8, 14, 17].map(kind => placed(template(kind), kind, POINTS.player, { spawnTime: NEVER })),
  ].map((declaration, index) => ({ ...declaration, index }));
  return { ...converted, declarations, groups: [], eventTriggers: [{ ranges: [{ lower: 100, upper: 100, messages: [], summarySelector: 0 }] }] };
}

/**
 * The variant's craft info. The hostile stays where it is put (no speed, deceleration, no parked Warp jumps), so the
 * player flying on ahead stays in its lock cone, and carries one guided missile 0 (the player's missile mount with
 * weapon 0 and one round) as its only list-1 mount. Missile 0's stages take 0x80 units each (+0x34 SAR 1), and at
 * 256 units a second for 320 units (+0x44, its body's +0xB8) its range is 1,280, which holds the player through the
 * lock, while its lifetime ends before it catches the player.
 */
function warningCraftInfo(converted: CraftInfo): CraftInfo {
  const craft = [...converted.craft];
  const missileMount = { ...craft[WARNING_KINDS.player].mounts[2], weapon: 0, at0C: 1 };
  craft[WARNING_KINDS.hostile] = { ...craft[WARNING_KINDS.hostile], atB8: 0, atC0: 2, atA4: 0, mounts: [missileMount], mountLists: [[], [0], []] };
  const [missile] = converted.missiles;
  const missiles = [{ ...missile, at34: 0x100, at44: 320 }, ...converted.missiles.slice(1)];
  const missileBodies = converted.missileBodies.map((body, index) => (index === missile.body ? { ...body, atB8: 256 } : body));
  return { ...converted, missiles, missileBodies, craft };
}

const item = (opcode: number, argument: string | null, branch: number | null = null): ScriptItem => Object.freeze({ opcode, argument, branch });

/** Opcode 232 tests the missile-ready flag (lock level 4) and steadiness; 401 presses the missile channel; 1000 waits 4 units. */
const ATTACK: readonly ScriptItem[] = Object.freeze([item(232, 'Y', 2), item(1000, '4', 0), item(401, '0', 1), item(10000, null)]);

/**
 * The variant's AI programs: every table record switches the AI lock on once at the install (+0x34, +0x38) and no
 * skill adjustment switches it again (+0x50 off), as src/core/replay/tail-warning-replay.test.ts does; every state
 * script is ATTACK, whichever record the hostile's selection draws.
 */
function warningPrograms(converted: AiPrograms): AiPrograms {
  const states = new Set(converted.entries.flatMap(entry => (entry.kind === 'parameters' ? Object.values(entry.stateScripts).flat() : [])));
  return {
    ...converted,
    programs: converted.programs.map(program => ({ ...program, at34: 1, at38: 1, at50: 0 })),
    entries: converted.entries.map((entry, index) => (states.has(index) ? { kind: 'script', items: ATTACK } : entry)),
  };
}

/** The variant's package: the logic payload from the strict encoder the import uses, the rule data as canonical JSON. */
async function buildWarningPackage(): Promise<readonly HeldGroup[]> {
  const [mission, craftInfo, programs] = await Promise.all([
    missionAssetContent<MissionContent>(MISSION_ASSET, decodeLogicPayload), missionAssetContent<CraftInfo>(CRAFT_INFO_ASSET),
    missionAssetContent<AiPrograms>(AI_PROGRAMS_ASSET),
  ]);
  return withPayloads({
    [MISSION_ASSET]: { bytes: encodeLogicPayload({ role: 'mission', content: warningMission(mission) }), schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION },
    [CRAFT_INFO_ASSET]: { bytes: ruleDataBytes(warningCraftInfo(craftInfo)), schemaVersion: RULE_DATA_SCHEMA_VERSIONS['craft-info'] },
    [AI_PROGRAMS_ASSET]: { bytes: ruleDataBytes(warningPrograms(programs)), schemaVersion: RULE_DATA_SCHEMA_VERSIONS['ai-programs'] },
  });
}

let built: Promise<readonly HeldGroup[]> | undefined;

/** The startable package as the warning variant, built once per worker process; seed it under a test's key. */
export const jointWarningPackage = (): Promise<readonly HeldGroup[]> => (built ??= buildWarningPackage());

// Core's timeline, from the browser's recording replayed in Node

/** What one tick of the replayed run left: the partition's warnings and the facts that raise them. */
export interface WarningTick {
  readonly tick: number;
  readonly warnings: ThreatWarnings;
  /** The hostile's missile lock level and object target. */
  readonly hostile: { readonly lock: number; readonly target: number | null };
  /** The targets of the missiles in flight. */
  readonly missiles: readonly (number | null)[];
  /** The player's subsystem fields 9 (the type-9 visual gate) and 12 (the radar gate). */
  readonly gates: readonly [number, number];
}

/** A run of ticks over which a warning holds: its first tick and the first tick after it. */
export interface WarningSpan {
  readonly from: number;
  readonly to: number;
}

/** Each warning's spans in `timeline`. */
export function warningSpans(timeline: readonly WarningTick[]): Record<keyof ThreatWarnings, WarningSpan[]> {
  const spans = (key: keyof ThreatWarnings): WarningSpan[] => {
    const found: { from: number; to: number }[] = [];
    for (const { tick, warnings } of timeline) {
      if (!warnings[key]) continue;
      const open = found.at(-1);
      if (open?.to === tick) open.to++;
      else found.push({ from: tick, to: tick + 1 });
    }
    return found;
  };
  return { attackerOnTail: spans('attackerOnTail'), missileIncoming: spans('missileIncoming') };
}

/**
 * World creation's inputs from `seeded`, the package a test stored: a copy of e2e/support/mission-result.ts's private
 * `seededContent`, which keeps it in step.
 */
function seededContent({ identity, groups }: SeededPackage, run: unknown): ReplayContent {
  const packageGroups: PackageGroup[] = groups.map(({ manifest, payloads }) => ({ group: readGroupManifest(manifest).group, manifest, payloads }));
  const logic = groups.find(({ manifest }) => readGroupManifest(manifest).group === 'logic')!;
  const payloads = new Map(readPayloadRecords(logic.payloads).map(({ id, bytes }) => [id as string, bytes]));
  const decode = (descriptor: AssetDescriptor | undefined, decoder: typeof decodeLogicPayload | typeof decodeRuleDataPayload = decodeLogicPayload) => {
    const bytes = descriptor && payloads.get(descriptor.id);
    if (!descriptor || !bytes) throw new Error('The seeded package lacks a logic Asset world creation reads');
    return { id: descriptor.id, content: decoder(bytes, descriptor).content };
  };
  const { assets } = readGroupManifest(logic.manifest);
  const mission = decode(assets.find(({ role }) => role === 'mission'));
  const { references } = mission.content as MissionContent;
  const craftTypes = decode(assets.find(({ id }) => id === references.craftTypes));
  const wingmanRoster = decode(assets.find(({ id }) => id === references.wingmanRoster));
  return {
    mission, craftTypes, wingmanRoster,
    craftInfo: decode(assets.find(({ role }) => role === 'craft-info'), decodeRuleDataPayload),
    ...ruleDataInputs(packageGroups),
    models: runModelInputs(packageGroups, { mission, craftTypes, wingmanRoster, identity, run } as Parameters<typeof runModelInputs>[1]),
    identity,
  } as ReplayContent;
}

/**
 * The recording the development panel exported to `path`, replayed tick by tick in Node on `seeded` with Core's formal
 * replay start: each tick's partition-level warnings as the projection gives them, with the hostile's lock, the
 * missiles' targets and the player's gates from the tick's snapshot, and Core's comparison of the replayed result with
 * the recorded one.
 */
export async function warningTimeline(path: string, seeded: SeededPackage): Promise<{ readonly recording: Recording; readonly timeline: WarningTick[]; readonly comparison: ReplayComparison }> {
  const recording = JSON.parse(await readFile(path, 'utf8')) as Recording;
  const { record, state } = startReplay(recording.record, seededContent(seeded, recording.record.run));
  const session = recordState(state, { producer: record.producer, checkpointInterval: record.checkpointInterval });
  const timeline: WarningTick[] = [];
  for (const input of record.ticks) {
    session.step(input);
    const { communications, clock } = session.projection();
    if (communications.readiness !== 'ready') throw new Error('The communications partition is not ready');
    const { entities } = session.snapshot().state;
    const hostile = entities.find(({ kindBit }) => kindBit === WARNING_KINDS.hostile);
    const player = entities.find(({ kindBit }) => kindBit === WARNING_KINDS.player);
    if (player?.combat.type !== 'craft' || hostile?.combat.type !== 'craft') throw new Error('The player or the hostile is missing or not a craft');
    timeline.push({
      tick: clock.tick,
      warnings: communications.warnings,
      hostile: { lock: hostile.combat.weapons.lock.level, target: hostile.ai.objectTarget },
      missiles: entities.flatMap(({ kindBit, combat }) => (kindBit === WARNING_KINDS.missile && combat.type === 'missile' ? [combat.target] : [])),
      gates: [player.combat.subsystems[9], player.combat.subsystems[12]],
    });
  }
  return { recording, timeline, comparison: compareReplayResults(recording.result, session.exportRecording().result) };
}

// The page: the mission's UI store, the sound log and the cockpit's type-9 strip

/**
 * Page function: the tick and the partition-level warnings the mission screen's store (its `game` prop) holds, the input
 * the cockpit and the sound consumer each read; null without a projection.
 */
export function readWarnings(): { readonly tick: number; readonly warnings: ThreatWarnings } | null {
  interface Fiber { readonly memoizedProps?: { readonly game?: { getState(): unknown } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) return null;
  const key = Object.keys(screen).find(name => name.startsWith('__reactFiber$'));
  let fiber = key ? (screen as unknown as Record<string, Fiber>)[key] : null;
  while (fiber && typeof fiber.memoizedProps?.game?.getState !== 'function') fiber = fiber.return;
  if (!fiber) return null;
  // The store's shapes, as far as read here (src/ui/game/game-store.ts, src/core/projections/projection.ts).
  const { projection } = fiber.memoizedProps!.game!.getState() as {
    projection: { clock: { tick: number }; communications: { readiness: string; warnings: ThreatWarnings } } | null;
  };
  if (projection?.communications.readiness !== 'ready') return null;
  const { attackerOnTail, missileIncoming } = projection.communications.warnings;
  return { tick: projection.clock.tick, warnings: { attackerOnTail, missileIncoming } };
}

/** A development sound log line of the instrument-9 cue (src/ui/dev/audio-log.ts `describeSoundDecision`). */
export interface CueDecision {
  readonly tick: number;
  readonly cue: 'instrument-9-craft' | 'instrument-9-missile';
  readonly result: string;
  /** A failure's code, null otherwise. */
  readonly code: string | null;
  readonly text: string;
}

/** The instrument-9 decisions among the sound log's lines. */
export function cueDecisions(log: readonly { readonly result: string | null; readonly text: string }[]): CueDecision[] {
  return log.flatMap(({ result, text }) => {
    const cue = / · cue (instrument-9-(?:craft|missile)) · /.exec(text);
    if (!cue) return [];
    const code = / · failed \(([^)]+)\)/.exec(text)?.[1] ?? null;
    return [{ tick: Number(/ · tick (\d+) · /.exec(text)![1]), cue: cue[1] as CueDecision['cue'], result: result ?? '', code, text }];
  });
}

/**
 * One label range of the type-9 strip in a picture: `label` when every pixel of its label shows in its colour, `clear`
 * when the whole range shows colour 0, `other` otherwise (the cockpit art before the strip drew there). Pixels in the
 * radar's disc spans are left out: the synthetic slot's radar (type 5) overlaps both ranges, and its rebuilds clear and
 * redraw those spans after the strip's blink steps.
 */
export type StripRange = 'label' | 'clear' | 'other';

export interface StripRead {
  readonly craft: StripRange;
  readonly missile: StripRange;
}

/** Per range of the strip: its label's pixels, its range's pixels, both outside the radar spans, and the label colour. */
type StripPoints = Record<keyof StripRead, { readonly label: readonly Point[]; readonly range: readonly Point[]; readonly colour: number }>;

const stripPoints = new WeakMap<CockpitFixture, StripPoints>();

/** The pixels `stripRead` reads, from the type-9 record's rows and params (`0x4eb3c`; indicator-strip.ts; hud §4.8). */
function pointsOf(fixture: CockpitFixture): StripPoints {
  const record = fixture.slots.find(({ slot }) => slot === 0)!.instruments.find(({ type }) => type === 9);
  if (!record) throw new Error('Slot 0 has no type-9 instrument');
  const radar = new Set(radarSpans(fixture).map(([x, y]) => y * 640 + x));
  const own = (points: readonly Point[]) => points.filter(([x, y]) => !radar.has(y * 640 + x));
  const { rectangle: { y0, y1 }, params: [first, firstEnd, second, secondEnd] } = record;
  const range = (text: string, x0: number, x1: number, colour: number) =>
    ({ label: own(textPixels(fixture.small, text, x0, y0)), range: own(rectPoints({ x0, y0, x1, y1 })), colour });
  return {
    craft: range(fixture.hudText.indicatorCraftAimed, first, firstEnd, 0x0f),
    missile: range(fixture.hudText.indicatorMissileAimed, second, secondEnd, 10),
  };
}

/** The strip's two ranges in `image`. */
export function stripRead(image: LogicalImage, fixture: CockpitFixture): StripRead {
  if (!stripPoints.has(fixture)) stripPoints.set(fixture, pointsOf(fixture));
  const points = stripPoints.get(fixture)!;
  const read = ({ label, range, colour }: StripPoints[keyof StripRead]): StripRange =>
    wrongPixels(image, label, fixture.data[colour]).length === 0 ? 'label'
      : wrongPixels(image, range, fixture.data[0]).length === 0 ? 'clear' : 'other';
  return { craft: read(points.craft), missile: read(points.missile) };
}
