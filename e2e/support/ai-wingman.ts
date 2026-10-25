import type { Page } from '@playwright/test';
import { ruleDataInputs, runModelInputs, type PackageGroup } from '../../src/app/resources/mission-input.ts';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { AssetDescriptor } from '../../src/content/asset-contract.ts';
import { readConverterVersion } from '../../src/content/content-identity.ts';
import { encodeCanonicalJson } from '../../src/content/canonical-json.ts';
import { validatePackage } from '../../src/content/completeness.ts';
import type { MissionContent } from '../../src/content/logic/logic-content.ts';
import { decodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import type { AiPrograms, ScriptItem } from '../../src/content/rule-data/ai-programs.ts';
import type { CommMenus } from '../../src/content/rule-data/comm-menus.ts';
import { decodeRuleDataPayload, RULE_DATA_SCHEMA_VERSIONS } from '../../src/content/rule-data/rule-data-payload.ts';
import { sha256Fingerprint } from '../../src/content/sha256.ts';
import { CLASSIC_P2_SLICE } from '../../src/content/slice-definition.ts';
import type { Recording } from '../../src/core/replay/recording.ts';
import { recordState } from '../../src/core/replay/recording.ts';
import { startReplay, type ReplayContent } from '../../src/core/replay/replay.ts';
import type { GameSnapshot } from '../../src/core/replay/snapshot.ts';
import type { ExpectedPackageProfile } from '../../src/workers/production-package.ts';
import { missionPackage, seedProductionCache, type SeededPackage } from './production-cache.ts';

// P3-08 subtask 24 (docs/plan/p3/08/spec.md, AC-10, AC-14 and AC-17 browser parts). Variants of the startable mission's
// converted synthetic package, whose rule-data payloads are replaced in Node, re-identified by their own schema version,
// length and SHA-256, and seeded into the test's isolated cache under the development test entry's expected profile;
// and the Node replay of a recording the browser exported, for the Core state the diagnostics panel does not show.
// Everything is code-generated from the synthetic disc's conversion; none of it holds original data.

export const AI_PROGRAMS_ASSET = 'data/ai-programs';
export const COMM_MENUS_ASSET = 'data/comm-menus';

/** The payload schema the current converter writes for `data/ai-programs` (P3-03 revision 3). */
export const AI_PROGRAMS_SCHEMA = RULE_DATA_SCHEMA_VERSIONS['ai-programs'];
export const COMM_MENUS_SCHEMA = RULE_DATA_SCHEMA_VERSIONS['comm-menus'];

/** Canonical JSON with no content check, so a variant may hold what the strict reader refuses. */
const UNCHECKED = Object.freeze({ name: 'test rule-data payload', byteLimit: 1 << 30, invalid: 'invalid-logic-payload' as const });

/** The decoded content of the startable package's Asset `id`, by its payload decoder: rule data unless given. */
export async function missionAssetContent<Content>(
  id: string, decode: (bytes: Uint8Array, descriptor: AssetDescriptor) => { readonly content: unknown } = decodeRuleDataPayload,
): Promise<Content> {
  for (const { manifest, payloads } of await missionPackage()) {
    const asset = readGroupManifest(manifest).assets.find(descriptor => descriptor.id === id);
    const payload = asset && readPayloadRecords(payloads).find(record => record.id === id);
    if (asset && payload) return decode(payload.bytes, asset).content as Content;
  }
  throw new Error(`The startable package has no ${id}`);
}

/** The decoded content of the startable package's rule-data Asset `id`. */
export const missionRuleData = <Content>(id: string): Promise<Content> => missionAssetContent<Content>(id);

/** A replacement rule-data payload: its content as canonical JSON, declared as payload schema `schemaVersion`. */
interface RuleDataChange {
  readonly content: unknown;
  readonly schemaVersion: number;
}

/** A replacement payload: its encoded bytes, declared as payload schema `schemaVersion`. */
export interface PayloadChange {
  readonly bytes: Uint8Array;
  readonly schemaVersion: number;
}

/** The startable package with the rule-data payloads `changes` names replaced; every other payload is the converted one. */
export function withRuleData(changes: Readonly<Record<string, RuleDataChange>>): Promise<readonly HeldGroup[]> {
  return withPayloads(Object.fromEntries(Object.entries(changes).map(([id, { content, schemaVersion }]) =>
    [id, { bytes: ruleDataBytes(content), schemaVersion }])));
}

/** `content` as a rule-data payload's canonical JSON, without the content check the strict reader makes. */
export const ruleDataBytes = (content: unknown): Uint8Array => encodeCanonicalJson(content, UNCHECKED);

/**
 * The startable package with the payloads `changes` names replaced by their bytes, each re-identified by its schema
 * version, length and SHA-256; every other payload is the converted one.
 */
export async function withPayloads(changes: Readonly<Record<string, PayloadChange>>): Promise<readonly HeldGroup[]> {
  const replaced = new Map(Object.entries(changes).map(([id, { bytes, schemaVersion }]) =>
    [id, { bytes, payloadIdentity: { schemaVersion, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) } }]));
  return (await missionPackage()).map(group => {
    const manifest = readGroupManifest(group.manifest);
    return {
      ...group,
      manifest: {
        ...manifest,
        assets: manifest.assets.map(asset => {
          const change = replaced.get(asset.id);
          return change ? { ...asset, payloadIdentity: change.payloadIdentity } : asset;
        }),
      },
      payloads: readPayloadRecords(group.payloads).map(payload => {
        const change = replaced.get(payload.id);
        return change ? { ...payload, schemaVersion: change.payloadIdentity.schemaVersion, bytes: change.bytes } : payload;
      }),
    };
  });
}

/** An action whose branch is itself (opcode 104, a half-second argument), then the end: its update never yields. */
const SELF_BRANCH: readonly ScriptItem[] = Object.freeze([
  Object.freeze({ opcode: 104, argument: '0.5', branch: 0 }),
  Object.freeze({ opcode: 10000, argument: null, branch: null }),
]);

/**
 * The AI programs with every state script replaced by `SELF_BRANCH`, as P3-08/23's Session fault case replaces one
 * (src/app/session/game-session-ai.test.ts): the first interpreter update runs out of the dispatch budget of one run
 * (AC-17). Install scripts stay as converted.
 */
export function selfBranchingPrograms(programs: AiPrograms): AiPrograms {
  const install = new Set(programs.entries.flatMap(entry => (entry.kind === 'script' || entry.installScript === null ? [] : [entry.installScript])));
  return {
    ...programs,
    entries: programs.entries.map((entry, index) => (entry.kind === 'script' && !install.has(index) ? { kind: 'script', items: SELF_BRANCH } : entry)),
  };
}

/** The AI programs in the payload schema 1 shape, which had no keyword tables (before P3-03 revision 3). */
export function schemaOnePrograms({ keywordTables, ...rest }: AiPrograms): Omit<AiPrograms, 'keywordTables'> {
  void keywordTables;
  return rest;
}

/** The AI programs with a second entry in the first keyword table whose name differs from its first only in case (refused). */
export function duplicateKeywordPrograms(programs: AiPrograms): AiPrograms {
  const [first, ...rest] = programs.keywordTables;
  const { name, value } = first[0];
  const other = name.replace(/[A-Za-z]/g, letter => (letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()));
  if (other === name) throw new Error('The first keyword name has no letter to change the case of');
  return { ...programs, keywordTables: [[...first, { name: other, value }], ...rest] as unknown as AiPrograms['keywordTables'] };
}

/** The wingman's kind bit, 1 (kind 2 of the original's numbering). */
export const WINGMAN_KIND_BIT = 1;
/** The synthetic mission's hostile craft's kind bit. */
export const HOSTILE_KIND_BIT = 7;

/** Whether an entity of `kindBit` is a craft the AI flies in the startable mission: a hostile or the wingman. */
export const isAiCraftKind = (kindBit: number): boolean => kindBit === HOSTILE_KIND_BIT || kindBit === WINGMAN_KIND_BIT;

/**
 * The communications menus with the first category listing the wingman's kind instead, so `c` and its key reach the
 * wingman's command menu (kind2TargetCommands). The converted synthetic menus list no wingman category.
 */
export function wingmanCategoryMenus(menus: CommMenus): CommMenus {
  return { ...menus, categories: menus.categories.map((category, index) => (index === 0 ? { ...category, kindMask: 1 << WINGMAN_KIND_BIT } : category)) };
}

/**
 * Seeds `groups` into the page's isolated cache under the test entry's expected profile, or under `converterVersion`
 * instead of the profile's (an earlier release's key). Needs the test entry open; resolves to what it stored.
 */
export async function seedTestEntryPackage(page: Page, groups: readonly HeldGroup[], converterVersion?: string): Promise<SeededPackage> {
  const profile = await page.evaluate(() => window.osrTestEntry!.profile) as ExpectedPackageProfile;
  return seedProductionCache(page, groups, converterVersion === undefined ? profile : { ...profile, converterVersion: readConverterVersion(converterVersion) });
}

/**
 * What world creation reads from the startable package, as tools/replay-check.ts's private `replayContent` assembles it
 * from a converted disc (keep the two in step):
 * the mission and its craft types and roster, the craft info, the rule-data inputs, the run's models and the identity.
 */
async function missionContent(run: unknown): Promise<ReplayContent> {
  const groups = await missionPackage();
  const validation = validatePackage(CLASSIC_P2_SLICE, groups);
  if (validation.status !== 'complete') throw new Error('The startable package must be complete');
  const { identity } = validation;
  const packageGroups: PackageGroup[] = groups.map(({ manifest, payloads }) => ({ group: readGroupManifest(manifest).group, manifest, payloads }));
  const logic = groups.find(({ manifest }) => readGroupManifest(manifest).group === 'logic')!;
  const { assets } = readGroupManifest(logic.manifest);
  const payloads = new Map(readPayloadRecords(logic.payloads).map(({ id, bytes }) => [id as string, bytes]));
  const decode = (descriptor: AssetDescriptor | undefined, decoder: typeof decodeLogicPayload | typeof decodeRuleDataPayload = decodeLogicPayload) => {
    const bytes = descriptor && payloads.get(descriptor.id);
    if (!descriptor || !bytes) throw new Error('The startable package lacks a logic Asset world creation reads');
    return { id: descriptor.id, content: decoder(bytes, descriptor).content };
  };
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
 * The snapshot after the last tick of `recording`, a run of the startable package the browser exported, replayed in
 * Node on the same synthetic content: the run's Core state, which the diagnostics panel shows only in part and the
 * replay check's report not at all.
 */
export async function replayedSnapshot(recording: Recording): Promise<GameSnapshot> {
  const { record, state } = startReplay(recording.record, await missionContent(recording.record.run));
  const session = recordState(state, { producer: record.producer, checkpointInterval: record.checkpointInterval });
  for (const input of record.ticks) session.step(input);
  return session.snapshot();
}
