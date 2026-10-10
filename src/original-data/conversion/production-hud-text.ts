import type { AssetReference } from '../../content/asset-contract.ts';
import { readAssetId, readAssetKind } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { HUD_TEXT_KEYS, HUD_TEXT_ROLE, type HudTextKey } from '../../content/hud/hud-text-payload.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { compareLocators, readSourceMappingTable, type ExecutableRegion, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type GraphicsDeclaration } from './graphics-declarations.ts';
import { executableRegionOf, PRODUCTION_EXECUTABLE, regionLocator } from './production-executable.ts';

// The production source of `data/hud/text` (P3-03 spec, S-08, Asset 与角色 and technical decision 14): the 64 EXE text
// regions of closure #47 that the HUD, map and information-window code draws directly, each exactly a string and its
// NUL, keyed as the payload's entries. Addresses and lengths are the structural facts of docs/original/formats/
// executable.md (HUD, map and communications text from the EXE), never the bytes they hold. production-graphics.ts
// merges the declaration, the mapping and the share into the production graphics step, which reads these regions with
// the executable regions of its other Assets.

/** The HUD text Asset. */
export const HUD_TEXT_ASSET: AssetReference = Object.freeze({ id: readAssetId('data/hud/text'), kind: readAssetKind('data') });

/** The EXE region of each HUD text key. */
export type HudTextRegionTable = { readonly [Key in HudTextKey]: ExecutableRegion };

/** A region of `length` bytes, the NUL included, at a documented address. */
const regionAt = executableRegionOf;

/** The 64 regions in schema key order, row by row as executable.md lists them per instrument. */
export const PRODUCTION_HUD_TEXT_REGIONS: HudTextRegionTable = Object.freeze({
  // Target display, instrument type 7.
  targetWarpNotice: regionAt(0x17_1a34, 7),
  targetNone: regionAt(0x17_1a44, 10),
  targetDistance: regionAt(0x17_1a50, 6),
  targetDistanceScaled: regionAt(0x17_1a58, 7),
  targetBlockValue: regionAt(0x17_1a60, 8),
  targetCraftPercent: regionAt(0x17_1a68, 7),
  targetCraftValueScaledTwice: regionAt(0x17_1a70, 7),
  targetCraftValueScaledOnce: regionAt(0x17_1a78, 6),
  targetMarkerBlockValue: regionAt(0x17_1a80, 5),
  targetMarkerCraftPercent: regionAt(0x17_1a88, 4),
  targetMarkerCraftValue: regionAt(0x17_1a8c, 3),
  // Bar gauges, instrument types 0–3.
  barGauge0Label: regionAt(0x17_19bc, 2),
  barGauge1Label: regionAt(0x17_19cc, 2),
  barGauge2Label: regionAt(0x17_19dc, 2),
  barGauge3Label: regionAt(0x17_19f4, 2),
  // Flight-view overlays.
  overlayAutopilotChange: regionAt(0x17_1c30, 13),
  overlaySpeedAssistChange: regionAt(0x17_1c40, 14),
  overlayPlayerState4: regionAt(0x17_1c60, 15),
  overlayValueReadout: regionAt(0x17_1c70, 6),
  overlayPercentReadout: regionAt(0x17_1c78, 5),
  overlayReadoutUnavailable: regionAt(0x17_1c80, 3),
  overlayTargetDistance: regionAt(0x17_1c84, 4),
  overlayEmptyWeaponSlot: regionAt(0x17_0fc4, 5),
  mapMarkerName: regionAt(0x17_1860, 10),
  // Strategic map, instrument type 10.
  mapCornerLabel: regionAt(0x17_1d18, 12),
  mapWarpCostReadout: regionAt(0x17_1d10, 8),
  mapCursorReadoutNone: regionAt(0x17_1d24, 5),
  mapCursorReadout: regionAt(0x17_1d2c, 8),
  mapUnitLabel: regionAt(0x17_1d44, 3),
  // Information window: kind words, the name and position lines, then the count lines.
  mapInfoKindWord0x1: regionAt(0x17_1d50, 9),
  mapInfoKindWord0x2: regionAt(0x17_1d74, 7),
  mapInfoKindWord0x4: regionAt(0x17_1d94, 9),
  mapInfoKindWord0x8: regionAt(0x17_1da0, 8),
  mapInfoKindWord0x10: regionAt(0x17_1da8, 10),
  mapInfoKindWord0x20: regionAt(0x17_1d88, 9),
  mapInfoKindWord0x40And0x800: regionAt(0x17_1d7c, 9),
  mapInfoKindWord0x8000: regionAt(0x17_1d5c, 7),
  mapInfoKindWord0x20000: regionAt(0x17_1d64, 8),
  mapInfoKindWord0x40000: regionAt(0x17_1d6c, 8),
  mapInfoUnitName: regionAt(0x17_1db4, 3),
  mapInfoPosition1: regionAt(0x17_1db8, 8),
  mapInfoPosition2: regionAt(0x17_1dc0, 7),
  mapInfoPosition3: regionAt(0x17_1dc8, 6),
  mapInfoKindCount0x80: regionAt(0x17_1dd0, 10),
  mapInfoKindCount0x100: regionAt(0x17_1ddc, 12),
  mapInfoKindCount0x200: regionAt(0x17_1de8, 11),
  mapInfoKindCount0x400: regionAt(0x17_1df4, 12),
  mapInfoKindCount0x80000: regionAt(0x17_1e00, 12),
  mapInfoKindCount0x2000: regionAt(0x17_1e0c, 9),
  mapInfoKindCount0x4000: regionAt(0x17_1e18, 12),
  mapInfoKindCount0x10000: regionAt(0x17_1e24, 10),
  mapInfoKindCount0x1000: regionAt(0x17_1e30, 11),
  // Left display, instrument type 6.
  leftEnergyBar1Label: regionAt(0x17_1e60, 2),
  leftEnergyBar2Label: regionAt(0x17_1e64, 2),
  leftEnergyBar3Label: regionAt(0x17_1e68, 2),
  leftCommPanelTitle: regionAt(0x17_1e6c, 15),
  leftCommListSeparator: regionAt(0x17_0f98, 3),
  leftWarpTitle: regionAt(0x17_1e44, 9),
  leftWarpBar1Label: regionAt(0x17_1e7c, 6),
  leftWarpBar2Label: regionAt(0x17_1e84, 6),
  leftWarpBar3Label: regionAt(0x17_1e8c, 11),
  // Indicators, instrument types 9 and 12.
  indicatorMissileAimed: regionAt(0x17_1e98, 5),
  indicatorCraftAimed: regionAt(0x17_1ea0, 5),
  indicatorWarpInterval: regionAt(0x17_1ea8, 5),
});

/** Research facts of the mapping (spec, Asset 与角色): source and use are confirmed by code; per-entry reachability is U-030, the Warp cost readout U-026. */
const MAPPING_FACTS = Object.freeze({
  confidence: 'confirmed',
  unknowns: ['U-026', 'U-030'],
  evidence: ['docs/original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324'],
});

/**
 * The declaration and the declared mapping of `data/hud/text` for `regions`, as plain data: the mapping lists one part
 * per region in canonical locator order, and the declaration names the key of each part in that order.
 */
export function hudTextGraphic(regions: HudTextRegionTable, discPath: DiscPath = PRODUCTION_EXECUTABLE as DiscPath) {
  const parts = HUD_TEXT_KEYS.map(key => ({ key, locator: regionLocator(regions[key], discPath) }))
    .sort((left, right) => compareLocators(left.locator, right.locator));
  return {
    declaration: { asset: { ...HUD_TEXT_ASSET }, role: HUD_TEXT_ROLE, group: 'cockpit-hud-map', regions: parts.map(({ key }) => key) },
    mapping: {
      asset: { ...HUD_TEXT_ASSET },
      parts: parts.map(({ locator }) => ({ alternatives: [locator] })),
      ...MAPPING_FACTS,
      unknowns: [...MAPPING_FACTS.unknowns],
      evidence: [...MAPPING_FACTS.evidence],
      resolution: 'declared',
    },
  };
}

const PRODUCTION_HUD_TEXT = hudTextGraphic(PRODUCTION_HUD_TEXT_REGIONS);

/** The HUD text declaration, which the production graphics declarations append. */
export const PRODUCTION_HUD_TEXT_DECLARATIONS: readonly GraphicsDeclaration[] = readGraphicsDeclarations([PRODUCTION_HUD_TEXT.declaration]);

/** The declared HUD text mapping without a fingerprint; the import job binds it to the verified source. */
export const PRODUCTION_HUD_TEXT_MAPPINGS: SourceMappingTable = readSourceMappingTable({ sourceFingerprint: null, mappings: [PRODUCTION_HUD_TEXT.mapping] });

/**
 * The approved HUD text share (P3-03 spec, 限值与预算): twice each dimension of the Asset's conversion usage on the
 * baseline, rounded up to a power of two (observations in the P3-03/26 completion evidence).
 */
export const PRODUCTION_HUD_TEXT_SHARE: BudgetRecord = Object.freeze({ ...EMPTY_BUDGET_USAGE, assets: 2, payloadBytes: 4_096 });
