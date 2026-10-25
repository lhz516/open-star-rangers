import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { ruleDataInputs, runModelInputs, type PackageGroup } from '../../src/app/resources/mission-input.ts';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { AssetDescriptor } from '../../src/content/asset-contract.ts';
import { LOGIC_PAYLOAD_SCHEMA_VERSION, type MissionContent, type MissionDeclaration } from '../../src/content/logic/logic-content.ts';
import { decodeLogicPayload, encodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import type { CraftInfo } from '../../src/content/rule-data/craft-info.ts';
import { decodeRuleDataPayload, RULE_DATA_SCHEMA_VERSIONS } from '../../src/content/rule-data/rule-data-payload.ts';
import type { Recording, ReplayResult } from '../../src/core/replay/recording.ts';
import { replayRecord, type ReplayContent } from '../../src/core/replay/replay.ts';
import { missionAssetContent, ruleDataBytes, withPayloads } from './ai-wingman.ts';
import type { SeededPackage } from './production-cache.ts';

// P3-11 subtask 18 (docs/plan/p3/11/spec.md, AC-12; 验证策略, 浏览器验证): short synthetic missions that end in the browser
// from the run's own rules, and the observations of their rescue holds, ending placeholders and result page. The
// startable synthetic mission cannot end through inputs (no loss, no reachable all-clear), so each variant replaces the
// converted `mission-startable` package's mission and craft-info payloads in Node: the same Assets, every craft type
// still declared, the player at a stored point and the craft that decide the ending beside it. Everything is
// code-generated from the synthetic disc's conversion; none of it holds original data. Nothing here writes application
// state: the page is read through its DOM, and the run advances only by its own rules and trusted input.

/**
 * The ending a package reaches by itself, whatever the seed and the player's input (each checked in a Node world):
 * - `failure`: a friendly of kind 14 with a huge hull sits on the player, whose collision destroys the player in the
 *   first ticks (G-02/5 after the escape pod); the player, with 1 % of a small energy store and a speed cost, runs dry
 *   twice (G-02/6 after the beacon, then the third loss). G-02/7 `energy`; about 1,400 ticks.
 * - `success`: hostiles of kinds 7 and 8 without shields sit on the player, whose large hull outlasts the collision that
 *   destroys them all: the all-clear, the settlement wait, the completion message and the latch. G-02/8 alone; an empty
 *   summary. About 650 ticks.
 * - `success-cutscene`: the same with a summary of two messages and the cutscene selector CUTSCENE_ROW: G-02/8, G-02/9.
 * Hostiles that must not decide the failure are queued far beyond the run, which also keeps the all-clear away.
 */
export type EndingVariant = 'failure' | 'success' | 'success-cutscene';

/** The summary the cutscene variant's range holds: its two messages, which the original appends without separators. */
export const SUMMARY_MESSAGES = Object.freeze(['OSR-SYNTHETIC-SUMMARY-7c41 every hostile ', 'is gone']);
export const SUMMARY_TEXT = SUMMARY_MESSAGES.join('');
/** The cutscene variant's summary selector, a valid G-02/9 row (13–19). */
export const CUTSCENE_ROW = 16;

const MISSION_ASSET = 'mission/first-campaign';
const CRAFT_INFO_ASSET = 'data/craft-info';
/** The stored point of the player and the craft beside it, in reference units. */
const POINT = Object.freeze({ x: 100, y: 200, z: 0 });
/** A spawn time far beyond any run here, in source units: such a record stays queued. */
const NEVER = 4_000_000;
const PLAYER = 0;
const WINGMAN_FRIENDLY = 14;
const BASE = 17;
const HOSTILES = Object.freeze([7, 8]);
/** The spawn rectangle away from the player that the craft not deciding the ending take. */
const AWAY_REGION = 1;

/**
 * A plain object record of one craft of `kind` from `template`'s fields, with `changes` applied: at the stored POINT, or
 * anywhere in spawn rectangle `region` (from the zero point, as the converted records are).
 */
function record(template: MissionDeclaration, kind: number, changes: Partial<MissionDeclaration> = {}, region: number | null = null): MissionDeclaration {
  return {
    ...template, origins: ['object'], craftType: kind, nameCandidates: [], position: region === null ? POINT : { x: 0, y: 0, z: 0 }, spawnTime: 0,
    gridSpacing: 0, placement: { region, anchor: null }, memberOf: null, aiTarget: null, eventTrigger: null, aiTargetCraftTypes: [], ...changes,
    ruleInputs: { ...template.ruleInputs, craftCount: null, ...changes.ruleInputs },
  };
}

/** The variant's mission: the converted one's frame and triggers' shape, with its own records and no groups. */
function endingMission(converted: MissionContent, variant: EndingVariant): MissionContent {
  const template = (kind: number) => converted.declarations.find(({ craftType }) => craftType === kind) ?? converted.declarations[0];
  const player = template(PLAYER);
  const failure = variant === 'failure';
  const hostile = (kind: number): MissionDeclaration => {
    const from = template(kind);
    return failure
      ? record(from, kind, { spawnTime: NEVER, eventTrigger: 0 }, AWAY_REGION)
      : record(from, kind, { eventTrigger: 0, ruleInputs: { ...from.ruleInputs, percentC: 1 } });
  };
  const declarations = [
    record(player, PLAYER, { ruleInputs: { ...player.ruleInputs, percentC: 40, percentD: failure ? 1 : 50 } }),
    ...HOSTILES.map(hostile),
    record(template(WINGMAN_FRIENDLY), WINGMAN_FRIENDLY, {}, failure ? null : AWAY_REGION),
    record(template(BASE), BASE, {}, AWAY_REGION),
  ].map((declaration, index) => ({ ...declaration, index }));
  const range = variant === 'success-cutscene'
    ? { lower: 100, upper: 100, messages: [...SUMMARY_MESSAGES], summarySelector: CUTSCENE_ROW }
    : { lower: failure ? 0 : 100, upper: 100, messages: [], summarySelector: 0 };
  return { ...converted, declarations, groups: [], eventTriggers: [{ ranges: [range] }] };
}

/**
 * The variant's craft info: the player's +0xC0 positive, so a rescue's throttle stays in its table (the converted
 * record's is negative), and the hull or energy figures that decide the ending.
 */
function endingCraftInfo(converted: CraftInfo, variant: EndingVariant): CraftInfo {
  const craft = [...converted.craft];
  if (variant === 'failure') {
    // Energy (+0x54 ÷ 100) × 1 % = 10, spent at full speed (+0x88) in seconds; the friendly's hull outlasts collisions.
    craft[PLAYER] = { ...craft[PLAYER], atC0: 2, at54: 1000, at88: 1000 };
    craft[WINGMAN_FRIENDLY] = { ...craft[WINGMAN_FRIENDLY], at9C: 100_000 };
  } else {
    craft[PLAYER] = { ...craft[PLAYER], atC0: 2, at9C: 100_000 };
  }
  return { ...converted, craft };
}

/** The variant's package: the mission's bytes from the strict logic encoder the import uses, the craft info's as rule data. */
async function buildEndingPackage(variant: EndingVariant): Promise<readonly HeldGroup[]> {
  const [mission, craftInfo] = await Promise.all([
    missionAssetContent<MissionContent>(MISSION_ASSET, decodeLogicPayload), missionAssetContent<CraftInfo>(CRAFT_INFO_ASSET),
  ]);
  return withPayloads({
    [MISSION_ASSET]: { bytes: encodeLogicPayload({ role: 'mission', content: endingMission(mission, variant) }), schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION },
    [CRAFT_INFO_ASSET]: { bytes: ruleDataBytes(endingCraftInfo(craftInfo, variant)), schemaVersion: RULE_DATA_SCHEMA_VERSIONS['craft-info'] },
  });
}

const packages: Partial<Record<EndingVariant, Promise<readonly HeldGroup[]>>> = {};

/** The startable package with the variant's mission and craft info, built once per worker process. */
export const endingPackage = (variant: EndingVariant): Promise<readonly HeldGroup[]> => (packages[variant] ??= buildEndingPackage(variant));

/** What world creation reads from `seeded`, the package a test stored, as tools/replay-check.ts assembles it. */
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

/** The recording the development panel exported to `path`, and Core's replay of its record on the seeded package. */
export async function replayedEnding(path: string, seeded: SeededPackage): Promise<{ readonly recording: Recording; readonly replayed: ReplayResult }> {
  const recording = JSON.parse(await readFile(path, 'utf8')) as Recording;
  return { recording, replayed: replayRecord(recording.record, seededContent(seeded, recording.record.run)) };
}

/** What the result page shows, read from its DOM attributes and text. */
export interface ShownResult {
  readonly outcome: string;
  readonly reason: string;
  readonly heading: string;
  readonly outcomeText: string;
  readonly reasonText: string;
  readonly summary: string;
  readonly summaryText: string | null;
  readonly rescues: string;
  readonly kills: string;
}

/** The result page's state, or null while it is not shown. */
export function shownResult(page: Page): Promise<ShownResult | null> {
  return page.evaluate(() => {
    const result = document.querySelector<HTMLElement>('[data-testid="mission-result"]');
    if (!result) return null;
    const text = (id: string): string | null => result.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
    return {
      outcome: result.dataset.outcome ?? '', reason: result.dataset.reason ?? '',
      heading: result.querySelector('h2')?.textContent ?? '',
      outcomeText: text('mission-result-outcome') ?? '', reasonText: text('mission-result-reason') ?? '',
      summary: result.querySelector<HTMLElement>('[data-testid="mission-result-summary"]')?.dataset.summary ?? '',
      summaryText: text('mission-result-summary-text'),
      rescues: text('mission-result-rescues') ?? '', kills: text('mission-result-kills') ?? '',
    };
  });
}

/** A shown G-02 placeholder: its gap, status, transitionId, variant and place in its sequence. */
export interface ShownPlaceholder {
  readonly gap: string;
  readonly status: string;
  readonly transition: number | null;
  readonly variant: string | null;
  readonly index: number | null;
  readonly count: number | null;
}

/** The shown placeholder, or null while none shows. */
export function shownPlaceholder(page: Page): Promise<ShownPlaceholder | null> {
  return page.evaluate(() => {
    const placeholder = document.querySelector<HTMLElement>('[data-testid="mission-placeholder"]');
    if (!placeholder) return null;
    const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
    const sequence = placeholder.querySelector<HTMLElement>('[data-testid="mission-placeholder-sequence"]');
    return {
      gap: placeholder.dataset.gap ?? '', status: placeholder.dataset.status ?? '', transition: number(placeholder.dataset.transition),
      variant: placeholder.querySelector<HTMLElement>('[data-testid="mission-placeholder-variant"]')?.dataset.variant ?? null,
      index: number(sequence?.dataset.index), count: number(sequence?.dataset.count),
    };
  });
}

declare global {
  interface Window {
    osrPages?: { readonly log: { readonly page: string; readonly time: number }[]; readonly observer: MutationObserver };
  }
}

/**
 * Starts logging, with the page's monotonic clock, every change of the shown page as the DOM commits it: the mission
 * screen's position and, when a placeholder shows, its gap (`ending G-02/8`): two ending placeholders share the position,
 * so the gap tells them apart. Install it before the first page to time; `stopWatchingPages` ends it.
 */
export function watchPages(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.osrPages?.observer.disconnect();
    const log: { page: string; time: number }[] = [];
    let last: string | undefined;
    const record = (): void => {
      const position = document.querySelector('[data-testid="mission-screen"]')?.getAttribute('data-position') ?? 'none';
      const gap = document.querySelector('[data-testid="mission-placeholder"]')?.getAttribute('data-gap');
      const current = gap ? `${position} ${gap}` : position;
      if (current === last) return;
      last = current;
      log.push({ page: current, time: performance.now() });
    };
    record();
    const observer = new MutationObserver(record);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-position', 'data-gap'] });
    window.osrPages = { log, observer };
  });
}

/** Ends `watchPages` and resolves to its log, oldest first. */
export function stopWatchingPages(page: Page): Promise<{ readonly page: string; readonly time: number }[]> {
  return page.evaluate(() => {
    window.osrPages?.observer.disconnect();
    const log = window.osrPages?.log.map(entry => ({ ...entry })) ?? [];
    delete window.osrPages;
    return log;
  });
}

/** How long `from` showed before the page changed to `to`, by a `watchPages` log; fails unless `to` directly followed it. */
export function shownBefore(log: readonly { readonly page: string; readonly time: number }[], from: string, to: string): number {
  const end = log.findIndex((entry, index) => index > 0 && entry.page === to && log[index - 1].page === from);
  if (end < 0) throw new Error(`No change from ${from} to ${to}: ${JSON.stringify(log)}`);
  return log[end].time - log[end - 1].time;
}

/** Expects the element with `testId` to keep the Classic 4:3 box. */
export async function expectClassicBox(page: Page, testId: string): Promise<void> {
  const box = (await page.getByTestId(testId).boundingBox())!;
  expect(Math.abs(box.width / box.height - 4 / 3), `${testId} keeps 4:3`).toBeLessThan(0.01);
}
