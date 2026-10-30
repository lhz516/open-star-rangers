import { expect, type Page } from '@playwright/test';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import { contentIdentityKey } from '../../src/content/content-identity.ts';
import { LOGIC_PAYLOAD_SCHEMA_VERSION, type MissionContent, type MissionDeclaration } from '../../src/content/logic/logic-content.ts';
import { decodeLogicPayload, encodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import type { CraftInfo, CraftRecord } from '../../src/content/rule-data/craft-info.ts';
import { RULE_DATA_SCHEMA_VERSIONS } from '../../src/content/rule-data/rule-data-payload.ts';
import { compareReplayResults, type ReplayComparison } from '../../src/core/replay/compare.ts';
import { completedRun, type Recording, type ReplayResult } from '../../src/core/replay/recording.ts';
import { dockingRuleDataContents } from '../../src/workers/synthetic-import.test-support.ts';
import { COMM_MENUS_ASSET, missionAssetContent, ruleDataBytes, withPayloads } from './ai-wingman.ts';
import { canvasBox, mapView, waitForMapView, ZONE, zoneLocked, type MapView } from './map-picture.ts';
import { replayedEnding, shownPlaceholder, shownResult, type ShownPlaceholder, type ShownResult } from './mission-result.ts';
import { missionFrame, waitForFrame } from './mission-observations.ts';
import type { SeededPackage } from './production-cache.ts';

// P3-15 subtask 01 (docs/plan/p3/15/spec.md, S-01, S-02; AC-01, AC-02): the synthetic joint loop, a variant of the
// converted `mission-startable` package whose runs pass, by trusted input and the run's own rules, through takeoff,
// flight, target selection, firing, the strategic map and a Warp, docking and launch, and end in success or failure.
// As e2e/support/mission-result.ts does, the variant replaces the package's mission and craft info payloads in Node
// (the startable mission cannot end through inputs), and here also its communications menus and messages with those of
// P3-10's docking disc, so `c`, 2, 2 requests docking at the one base. Everything is code-generated from the synthetic
// disc's conversion; none of it holds original data. Nothing here writes application state: the page is read through
// its DOM and the mission's UI store, and advances only by trusted input on the game input zone and the map cursor.

/**
 * The ending a variant's run reaches, each checked in Node worlds under many seeds and input delays:
 * - `success`: the player, with a large hull, shoots the craft ahead (kind 7), opens the map, selects the base and
 *   Warps to it (the arrival snaps 600 above the base), stops, docks, launches and shoots the craft on the launch line
 *   (kind 8). That last kill is the all-clear; the settlement ends in success through G-02/8. About 1,900 ticks.
 * - `failure`: the friendly beside the player (kind 14) sits on it with a huge hull, so the collision destroys the
 *   player in the first ticks (G-02/5 after the escape pod); with 1 % of a small energy store and a speed cost the
 *   rescued player runs dry twice (G-02/6, then the third loss, G-02/7 `energy`). About 1,600 ticks.
 */
export type JointLoopVariant = 'success' | 'failure';

/** The kind bits of the joint loop's craft. */
export const JOINT_KINDS = Object.freeze({ player: 0, wingman: 1, ahead: 7, byBase: 8, friendly: 14, base: 17 });

/** The communications command code of the docking request (P3-10), which `c`, 2, 2 sends to the base. */
export const DOCKING_COMMAND = 9;

const MISSION_ASSET = 'mission/first-campaign';
const CRAFT_INFO_ASSET = 'data/craft-info';
const COMM_MESSAGES_ASSET = 'data/comm-messages';

/**
 * Stored points in reference units (×50/3 at runtime). The player faces +z: the craft ahead is 1,000 units in front
 * of it and the friendly 333 to its side. The base lies about 8,300 units away; its pose, which zero turn rates keep,
 * puts a launched player 1,000 units from it facing along (√½, −√½, 0), and the craft by the base 500 units further.
 */
const POINTS = Object.freeze({
  player: { x: 100, y: 200, z: 0 },
  ahead: { x: 100, y: 200, z: 60 },
  friendly: { x: 120, y: 200, z: 0 },
  base: { x: -200, y: -200, z: 0 },
  byBase: { x: -136, y: -264, z: 0 },
});

/** One craft of `kind` from `template`'s fields at the stored `point`, with `changes` applied. */
function placed(template: MissionDeclaration, kind: number, point: MissionDeclaration['position'], changes: Partial<MissionDeclaration> = {}): MissionDeclaration {
  return {
    ...template, origins: ['object'], craftType: kind, nameCandidates: [], position: point, spawnTime: 0, gridSpacing: 0,
    placement: { region: null, anchor: null }, memberOf: null, aiTarget: null, eventTrigger: null, aiTargetCraftTypes: [], ...changes,
    ruleInputs: { ...template.ruleInputs, craftCount: null, ...changes.ruleInputs },
  };
}

/** The variant's mission: the converted one's frame, the five craft above and no groups. */
function jointMission(converted: MissionContent, variant: JointLoopVariant): MissionContent {
  const template = (kind: number) => converted.declarations.find(({ craftType }) => craftType === kind) ?? converted.declarations[0];
  const failure = variant === 'failure';
  const player = template(JOINT_KINDS.player);
  const declarations = [
    placed(player, JOINT_KINDS.player, POINTS.player, { ruleInputs: { ...player.ruleInputs, percentC: 40, percentD: failure ? 1 : 50 } }),
    placed(template(JOINT_KINDS.ahead), JOINT_KINDS.ahead, POINTS.ahead, { eventTrigger: 0 }),
    placed(template(JOINT_KINDS.byBase), JOINT_KINDS.byBase, POINTS.byBase, { eventTrigger: 0 }),
    placed(template(JOINT_KINDS.friendly), JOINT_KINDS.friendly, failure ? POINTS.player : POINTS.friendly),
    placed(template(JOINT_KINDS.base), JOINT_KINDS.base, POINTS.base),
  ].map((declaration, index) => ({ ...declaration, index }));
  return { ...converted, declarations, groups: [], eventTriggers: [{ ranges: [{ lower: failure ? 0 : 100, upper: 100, messages: [], summarySelector: 0 }] }] };
}

/** A craft record whose collision shape is a sphere of `radius`. */
const sphere = (record: CraftRecord, radius: number): CraftRecord =>
  ({ ...record, collision: { ...record.collision, at00: radius, at08: [-radius, -radius, -radius, radius, radius, radius] } });

/** Stays where it is put: no speed, deceleration rather than acceleration, no parked Warp jumps and no turns for the base. */
const still = (record: CraftRecord): CraftRecord => ({ ...record, atB8: 0, atC0: 2, atA4: 0 });

/**
 * The variant's craft info. The player's gun 0 (mount 0, list 0) fires straight ahead at 2,000 units a second for a
 * second, for 5 of its charge 100, and its 400 damage gives way to the targets' shields and hulls in one shot (P3-07's
 * combat replay values). The player's +0xC0 is positive, so it decelerates and a rescue's throttle stays in its table
 * (the converted record's is negative), and its +0xA8 is 3, so a Warp's tunnel is short and straight and arrives within
 * the snap of the selected base. The targets are spheres, 100 and 300 units, which the shots hit however little they
 * drift. Success gives the player a hull no collision outlasts; failure gives it 1 % of a 1,000 store with a speed cost
 * (+0x88), and the friendly a huge hull.
 */
function jointCraftInfo(converted: CraftInfo, variant: JointLoopVariant): CraftInfo {
  const craft = [...converted.craft];
  const mount = { ...craft[JOINT_KINDS.player].mounts[0], at18: null, at1C: null };
  craft[JOINT_KINDS.player] = {
    ...craft[JOINT_KINDS.player], at74: 100, atA8: 3, atC0: 32,
    mounts: [{ ...mount, weapon: 0, at0C: 0, at10: 0, at20: 0, at34: 0 }, { ...mount, weapon: 1, at0C: 4, at10: 1 }],
    mountLists: [[0], [1], []],
    ...(variant === 'success' ? { at9C: 100_000 } : { at54: 1000, at88: 1000 }),
  };
  craft[JOINT_KINDS.ahead] = sphere(still(craft[JOINT_KINDS.ahead]), 100);
  craft[JOINT_KINDS.byBase] = sphere(still(craft[JOINT_KINDS.byBase]), 300);
  craft[JOINT_KINDS.base] = { ...still(craft[JOINT_KINDS.base]), atAC: 0, atB0: 0, atB4: 0 };
  if (variant === 'failure') craft[JOINT_KINDS.friendly] = { ...craft[JOINT_KINDS.friendly], at9C: 100_000 };
  const guns = converted.guns.map(gun => ({ ...gun, at08: 2000, at14: 8, at18: 5, at1C: 400, at24: 64, at28: 0 }));
  return { ...converted, hitDamageScale: 1, guns, craft };
}

/** The variant's package: the logic payload from the strict encoder the import uses, the rule data as canonical JSON. */
async function buildJointLoopPackage(variant: JointLoopVariant): Promise<readonly HeldGroup[]> {
  const [mission, craftInfo] = await Promise.all([
    missionAssetContent<MissionContent>(MISSION_ASSET, decodeLogicPayload), missionAssetContent<CraftInfo>(CRAFT_INFO_ASSET),
  ]);
  const docking = dockingRuleDataContents();
  const ruleData = (id: string, role: keyof typeof RULE_DATA_SCHEMA_VERSIONS, content: unknown) =>
    [id, { bytes: ruleDataBytes(content), schemaVersion: RULE_DATA_SCHEMA_VERSIONS[role] }] as const;
  return withPayloads(Object.fromEntries([
    [MISSION_ASSET, { bytes: encodeLogicPayload({ role: 'mission', content: jointMission(mission, variant) }), schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION }],
    ruleData(CRAFT_INFO_ASSET, 'craft-info', jointCraftInfo(craftInfo, variant)),
    ruleData(COMM_MENUS_ASSET, 'comm-menus', docking['comm-menus']),
    ruleData(COMM_MESSAGES_ASSET, 'comm-messages', docking['comm-messages']),
  ]));
}

const packages: Partial<Record<JointLoopVariant, Promise<readonly HeldGroup[]>>> = {};

/** The startable package as the joint loop's variant, built once per worker process; seed it under a test's key. */
export const jointLoopPackage = (variant: JointLoopVariant): Promise<readonly HeldGroup[]> => (packages[variant] ??= buildJointLoopPackage(variant));

// Node replay

/** What a joint-loop recording and its Node replay show, for the evidence (S-02): identities, run, sizes and the comparison. */
export interface JointLoopReplay {
  readonly recording: Recording;
  readonly replayed: ReplayResult;
  readonly comparison: ReplayComparison;
  readonly summary: {
    readonly identity: string;
    readonly rulesVersion: number;
    readonly producer: string;
    readonly mission: string;
    readonly setupHash: string;
    readonly run: Recording['record']['run'];
    readonly checkpointInterval: number;
    readonly finalTick: number;
    readonly events: number;
    readonly checkpoints: number;
    readonly lastCheckpoint: Recording['result']['checkpoints'][number] | undefined;
    readonly completed: boolean;
    readonly replayedIn: string;
  };
}

/**
 * Replays the recording the development panel exported to `path` on `seeded`, the package the test stored, in this
 * Node process with Core's formal replay, and compares the result with the recording's own by Core's comparison.
 */
export async function replayJointLoop(path: string, seeded: SeededPackage): Promise<JointLoopReplay> {
  const { recording, replayed } = await replayedEnding(path, seeded);
  const { record, result } = recording;
  return {
    recording, replayed, comparison: compareReplayResults(result, replayed),
    summary: {
      identity: contentIdentityKey(record.content), rulesVersion: record.rulesVersion, producer: record.producer, mission: record.mission,
      setupHash: record.setupHash, run: record.run, checkpointInterval: record.checkpointInterval, finalTick: result.finalTick,
      events: result.events.length, checkpoints: result.checkpoints.length, lastCheckpoint: result.checkpoints.at(-1),
      completed: completedRun(replayed), replayedIn: `Node ${process.version}`,
    },
  };
}

// Trusted input

/** Waits until the run is `count` ticks past the tick it shows now: room for what a key would still cause. */
export async function afterTicks(page: Page, count: number): Promise<number> {
  const { tick } = (await missionFrame(page))!;
  return (await waitForFrame(page, frame => (frame.tick ?? 0) >= tick! + count)).tick!;
}

/** Presses `key` in the focused input zone and lets `ticks` ticks pass, so the next key reaches a later tick. */
export async function pressInZone(page: Page, key: string, ticks = 3): Promise<void> {
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await page.keyboard.press(key);
  await afterTicks(page, ticks);
}

/** Holds Alt, the primary trigger (fire per sampled tick), for `ticks` ticks. */
export async function holdGun(page: Page, ticks = 6): Promise<void> {
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await page.keyboard.down('Alt');
  try {
    await afterTicks(page, ticks);
  } finally {
    await page.keyboard.up('Alt');
  }
}

/** The communications menu by keys: `c` opens it, 2 chooses the base category and 2 its docking request. */
export async function requestDocking(page: Page): Promise<void> {
  for (const key of ['c', '2', '2']) await pressInZone(page, key);
}

// The map cursor

/** Each page's mouse position, which locked moves are relative to (Chrome puts it back where a lock began). */
const mice = new WeakMap<Page, { x: number; y: number }>();

/** Moves the mouse to `x`, `y` of the viewport. */
async function moveMouse(page: Page, x: number, y: number): Promise<void> {
  mice.set(page, { x, y });
  await page.mouse.move(x, y);
}

/**
 * `m` in the focused input zone with the mouse at its centre: Core's open map, pointer-locked at once by `m`'s
 * activation or else by a first click, which only locks. Resolves to the open map.
 */
export async function openLockedMap(page: Page): Promise<MapView> {
  const box = (await page.locator(ZONE).boundingBox())!;
  await moveMouse(page, box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('m');
  const view = await waitForMapView(page, candidate => candidate.context === 'map' && candidate.map !== null, 'm did not open the map');
  let locked = false;
  await expect.poll(async () => (locked = await zoneLocked(page)) || (await page.getByTestId('input-status').innerText()).includes('Click the map')).toBe(true);
  if (!locked) {
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => zoneLocked(page)).toBe(true);
  }
  return view;
}

/**
 * Moves the locked pointer by whole logical pixels until Core's cursor is on the open map's contact of `kindBit`, then
 * clicks: a select there. Resolves to the map before the click.
 */
export async function selectContact(page: Page, kindBit: number): Promise<MapView> {
  const [{ map }, { scale, scaleY }] = await Promise.all([mapView(page), canvasBox(page)]);
  const contact = map!.contacts.find(candidate => candidate.kindBit === kindBit);
  if (!contact) throw new Error(`The open map shows no contact of kind ${kindBit}`);
  const from = map!.cursor.pixel;
  const mouse = mice.get(page)!;
  await moveMouse(page, mouse.x + (contact.pixel.column - from.column) * scale, mouse.y + (contact.pixel.row - from.row) * scaleY);
  const view = await waitForMapView(page, candidate => candidate.map?.cursor.pixel.column === contact.pixel.column && candidate.map.cursor.pixel.row === contact.pixel.row,
    `The cursor did not follow the locked pointer to ${JSON.stringify(contact.pixel)}`);
  await page.mouse.down();
  await page.mouse.up();
  return view;
}

// Pages

/** Waits for the placeholder of `gap`, timing, and resolves to it; a rescue's or an ending's comes after a long flight. */
export async function awaitPlaceholder(page: Page, gap: string, timeout = 60_000): Promise<ShownPlaceholder> {
  const placeholder = page.getByTestId('mission-placeholder');
  await expect(placeholder).toHaveAttribute('data-gap', gap, { timeout });
  await expect(placeholder).toHaveAttribute('data-status', 'timing');
  return (await shownPlaceholder(page))!;
}

/**
 * Waits for the shown hold's placeholder (docking, launch or rescue) to end by itself after its visible time, into
 * flight. A Skip racing that natural end could miss its button or reach a later page's, so the loop never presses it;
 * Skip has its own tests (e2e/mission-result.development.spec.ts, e2e/base-interaction.development.spec.ts).
 */
export const holdEnded = (page: Page) => waitForFrame(page, frame => frame.position === 'flight', 15_000);

/** The result page as it opens, its heading focused and no game input zone; resolves to what it shows. */
export async function resultPage(page: Page): Promise<ShownResult> {
  await waitForFrame(page, frame => frame.position === 'result', 15_000);
  await expect(page.getByTestId('mission-result')).toBeVisible();
  await expect(page.locator('#mission-result-heading')).toBeFocused();
  await expect(page.getByTestId('game-input-zone')).toHaveCount(0);
  return (await shownResult(page))!;
}
