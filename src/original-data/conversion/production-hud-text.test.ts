import { describe, expect, it } from 'vitest';
import { addBudgets, BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { decodeHudTextPayload, HUD_TEXT_FORMATS, HUD_TEXT_KEYS, HUD_TEXT_LIMITS, matchesHudTextFormat } from '../../content/hud/hud-text-payload.ts';
import { diagnoseSourceMappings, executableRegion, isRegionLocator, readSourceMappingTable, type ExecutableRegionLocator } from '../source-mapping.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { countedVerifiedSource } from './conversion.test-support.ts';
import { readGraphicsDeclarations, type HudTextDeclaration } from './graphics-declarations.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { regionExecutable } from './production-graphics.test-support.ts';
import {
  HUD_TEXT_ASSET, hudTextGraphic, PRODUCTION_HUD_TEXT_DECLARATIONS, PRODUCTION_HUD_TEXT_MAPPINGS, PRODUCTION_HUD_TEXT_REGIONS, PRODUCTION_HUD_TEXT_SHARE,
} from './production-hud-text.ts';
import { HUD_TEXT_USAGE, PRODUCTION_HUD_TEXT_REGION_WRITES, SYNTHETIC_HUD_TEXT, syntheticRegionText } from './production-hud-text.test-support.ts';

// The regions of docs/original/formats/executable.md (HUD, map and communications text from the EXE), written here per
// key in schema order as an oracle independent of the production module: the documented address and the region length
// with its NUL.
const ORACLE: readonly (readonly [number, number])[] = [
  [0x17_1a34, 7], [0x17_1a44, 10], [0x17_1a50, 6], [0x17_1a58, 7], [0x17_1a60, 8], [0x17_1a68, 7], [0x17_1a70, 7], [0x17_1a78, 6],
  [0x17_1a80, 5], [0x17_1a88, 4], [0x17_1a8c, 3],
  [0x17_19bc, 2], [0x17_19cc, 2], [0x17_19dc, 2], [0x17_19f4, 2],
  [0x17_1c30, 13], [0x17_1c40, 14], [0x17_1c60, 15], [0x17_1c70, 6], [0x17_1c78, 5], [0x17_1c80, 3], [0x17_1c84, 4], [0x17_0fc4, 5], [0x17_1860, 10],
  [0x17_1d18, 12], [0x17_1d10, 8], [0x17_1d24, 5], [0x17_1d2c, 8], [0x17_1d44, 3],
  [0x17_1d50, 9], [0x17_1d74, 7], [0x17_1d94, 9], [0x17_1da0, 8], [0x17_1da8, 10], [0x17_1d88, 9], [0x17_1d7c, 9], [0x17_1d5c, 7], [0x17_1d64, 8],
  [0x17_1d6c, 8], [0x17_1db4, 3], [0x17_1db8, 8], [0x17_1dc0, 7], [0x17_1dc8, 6],
  [0x17_1dd0, 10], [0x17_1ddc, 12], [0x17_1de8, 11], [0x17_1df4, 12], [0x17_1e00, 12], [0x17_1e0c, 9], [0x17_1e18, 12], [0x17_1e24, 10], [0x17_1e30, 11],
  [0x17_1e60, 2], [0x17_1e64, 2], [0x17_1e68, 2], [0x17_1e6c, 15], [0x17_0f98, 3], [0x17_1e44, 9], [0x17_1e7c, 6], [0x17_1e84, 6], [0x17_1e8c, 11],
  [0x17_1e98, 5], [0x17_1ea0, 5], [0x17_1ea8, 5],
];
/** Object 4 starts at 0x170000 (executable §4). */
const oracleLocator = ([address, length]: readonly [number, number]) => `MAIN/SRANGERS.EXE#le/4/0x${(address - 0x17_0000).toString(16)}/${length}`;
const EVIDENCE = 'docs/original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324';

/** The production HUD text step: the mapping and declaration alone, on a disc whose executable holds the synthetic texts. */
async function productionStep(limits: unknown, usage?: unknown, writes = PRODUCTION_HUD_TEXT_REGION_WRITES) {
  const { source } = await countedVerifiedSource({ 'MAIN/SRANGERS.EXE': regionExecutable(writes) });
  return { source, run: () => runGraphicsStep(source, PRODUCTION_HUD_TEXT_MAPPINGS, PRODUCTION_HUD_TEXT_DECLARATIONS, limits, usage) };
}

describe('production HUD text', () => {
  it('locates each key at its documented region, in schema key order', () => {
    expect(Object.keys(PRODUCTION_HUD_TEXT_REGIONS)).toEqual(HUD_TEXT_KEYS);
    expect(ORACLE).toHaveLength(64);
    const { declaration, mapping } = hudTextGraphic(PRODUCTION_HUD_TEXT_REGIONS);
    const byKey = new Map(declaration.regions.map((key, index) => [key, mapping.parts[index].alternatives[0]]));
    expect(HUD_TEXT_KEYS.map(key => {
      const { discPath, subresource } = byKey.get(key)!;
      return `${discPath}#${subresource}`;
    })).toEqual(ORACLE.map(oracleLocator));
    // The 64 regions hold 467 bytes with their NULs; none is longer than the text limit allows.
    expect(ORACLE.reduce((total, [, length]) => total + length, 0)).toBe(467);
    expect(Math.max(...ORACLE.map(([, length]) => length)) - 1).toBeLessThanOrEqual(HUD_TEXT_LIMITS.textBytes);
    expect(Object.isFrozen(PRODUCTION_HUD_TEXT_REGIONS)).toBe(true);
  });

  it('declares one data Asset of the hud-text role whose regions name the keys in part order', () => {
    expect(PRODUCTION_HUD_TEXT_DECLARATIONS).toHaveLength(1);
    const [declaration] = PRODUCTION_HUD_TEXT_DECLARATIONS as readonly HudTextDeclaration[];
    expect(declaration).toMatchObject({ asset: { id: 'data/hud/text', kind: 'data' }, role: 'hud-text', group: 'cockpit-hud-map' });
    expect(HUD_TEXT_ASSET).toEqual({ id: 'data/hud/text', kind: 'data' });
    expect([...declaration.regions].sort()).toEqual([...HUD_TEXT_KEYS].sort());
    const [mapping] = PRODUCTION_HUD_TEXT_MAPPINGS.mappings;
    // Part i is the region of key regions[i], and the parts ascend by offset.
    declaration.regions.forEach((key, index) => {
      expect(`MAIN/SRANGERS.EXE#${(mapping.parts[index].alternatives[0] as ExecutableRegionLocator).subresource}`).toBe(oracleLocator(ORACLE[HUD_TEXT_KEYS.indexOf(key)]));
    });
    const offsets = mapping.parts.map(({ alternatives: [locator] }) => executableRegion(locator as ExecutableRegionLocator).offset);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(readGraphicsDeclarations(PRODUCTION_HUD_TEXT_DECLARATIONS)).toEqual(PRODUCTION_HUD_TEXT_DECLARATIONS);
  });

  it('maps the Asset to its 64 regions with the confidence, unknowns and evidence of the Asset table', () => {
    expect(PRODUCTION_HUD_TEXT_MAPPINGS.sourceFingerprint).toBeNull();
    const [mapping] = PRODUCTION_HUD_TEXT_MAPPINGS.mappings;
    expect(PRODUCTION_HUD_TEXT_MAPPINGS.mappings).toHaveLength(1);
    expect({ ...mapping, parts: mapping.parts.length }).toEqual({
      asset: { id: 'data/hud/text', kind: 'data' }, parts: 64, confidence: 'confirmed', unknowns: ['U-026', 'U-030'], evidence: [EVIDENCE], resolution: 'declared',
    });
    expect(mapping.parts.every(({ alternatives }) => alternatives.length === 1 && isRegionLocator(alternatives[0]))).toBe(true);
    expect(readSourceMappingTable(PRODUCTION_HUD_TEXT_MAPPINGS)).toEqual(PRODUCTION_HUD_TEXT_MAPPINGS);
    expect(diagnoseSourceMappings(PRODUCTION_HUD_TEXT_MAPPINGS, [HUD_TEXT_ASSET]).map(({ code }) => code)).toEqual(['source-unverified']);
  });

  it('fills every production region with a synthetic text of its length that fits its key, within the HUD font character maps', () => {
    expect(PRODUCTION_HUD_TEXT_REGION_WRITES).toHaveLength(64);
    HUD_TEXT_KEYS.forEach((key, index) => {
      const text = SYNTHETIC_HUD_TEXT.entries[key];
      expect(text.length + 1, key).toBe(ORACLE[index][1]);
      expect(matchesHudTextFormat(key, text), key).toBe(true);
    });
    expect(Object.values(SYNTHETIC_HUD_TEXT.entries).join('')).toMatch(/^[\x20-\x7a\x7c-\x7e]+$/);
    expect(syntheticRegionText('targetCraftPercent', 6)).toMatch(/^%\.0f%%$/);
    expect(() => syntheticRegionText('targetCraftPercent', 5)).toThrow();
    expect(HUD_TEXT_KEYS.filter(key => HUD_TEXT_FORMATS[key] !== null)).toHaveLength(39);
  });

  it('converts the Asset from the production regions, verifying its mapping only after the conversion', async () => {
    const { source, run } = await productionStep(HUD_TEXT_USAGE);
    const bound = await verifySourceMappings(PRODUCTION_HUD_TEXT_MAPPINGS, source);
    expect(bound.mappings.map(({ resolution }) => resolution)).toEqual(['declared']);
    const result = await run();
    expect(result.usage).toEqual(HUD_TEXT_USAGE);
    const [group] = result.groups;
    expect(group.group).toBe('cockpit-hud-map');
    expect(group.sources).toEqual([{ id: 'data/hud/text', state: 'verified', unknowns: ['U-026', 'U-030'] }]);
    expect(group.descriptors[0]).toMatchObject({ id: 'data/hud/text', kind: 'data', role: 'hud-text', group: 'cockpit-hud-map', dependencies: [] });
    expect(decodeHudTextPayload(group.payloads[0].bytes, group.descriptors[0])).toEqual(SYNTHETIC_HUD_TEXT);
  });

  it('rejects a production region whose text does not fit its key, without results', async () => {
    const index = HUD_TEXT_KEYS.indexOf('mapCursorReadout');
    const writes = PRODUCTION_HUD_TEXT_REGION_WRITES.map((write, at) => (at === index ? { ...write, bytes: Uint8Array.from('%d     \0', character => character.charCodeAt(0)) } : write));
    expect(writes[index].bytes).toHaveLength(ORACLE[index][1]);
    const { run } = await productionStep(HUD_TEXT_USAGE, undefined, writes);
    const part = (PRODUCTION_HUD_TEXT_DECLARATIONS[0] as HudTextDeclaration).regions.indexOf('mapCursorReadout');
    await expect(run()).rejects.toMatchObject({
      code: 'unsupported-payload', location: `sources.mappings[0].parts[${part}].alternatives[0]/entries/mapCursorReadout`, limit: null,
    });
  });

  it('passes its share dimensions at the usage on top of earlier steps and rejects one more in each', async () => {
    const charged = BUDGET_DIMENSIONS.filter(dimension => PRODUCTION_HUD_TEXT_SHARE[dimension] !== 0);
    expect(charged).toEqual(['assets', 'payloadBytes']);
    expect(BUDGET_DIMENSIONS.filter(dimension => HUD_TEXT_USAGE[dimension] !== 0)).toEqual(charged);
    const earlier: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 300, payloadBytes: 50_000, imagePixels: 9 };
    const exact = addBudgets(earlier, HUD_TEXT_USAGE, 'limits');
    expect((await (await productionStep(exact, earlier)).run()).usage).toEqual(exact);
    for (const dimension of charged) {
      await expect((await productionStep({ ...exact, [dimension]: exact[dimension] - 1 }, earlier)).run()).rejects.toMatchObject({
        name: 'SourceError', code: 'budget-exceeded', location: 'graphics[data/hud/text].messages', limit: { name: dimension, limit: exact[dimension] - 1, observed: exact[dimension] },
      });
    }
    expect(HUD_TEXT_USAGE.payloadBytes).toBeLessThanOrEqual(PRODUCTION_HUD_TEXT_SHARE.payloadBytes);
  });
});
