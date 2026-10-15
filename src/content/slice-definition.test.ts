import { describe, expect, it } from 'vitest';
import { RESOURCE_GROUPS } from './asset-contract.ts';
import { SLICE_ID } from './content-identity.ts';
import { CLASSIC_P2_SLICE, SLICE_DEFINITION_VERSION } from './slice-definition.ts';

// Oracle of the P2-01 spec S-03 roles and the P3-03 version 4 and 5 additions: [role, group, allowed kinds, min, max].
const S03_ROLES = [
  ['mission', 'logic', ['mission'], 1, 1],
  ['player-ship', 'models', ['model'], 1, 1],
  ['enemy-ship', 'models', ['model'], 1, 2],
  ['base', 'models', ['model'], 1, 1],
  ['projectile', 'models', ['model', 'image', 'data'], 1, null],
  ['missile', 'models', ['model', 'image', 'data'], 1, null],
  ['debris', 'models', ['model', 'image', 'data'], 1, null],
  ['front-cockpit', 'cockpit-hud-map', ['layout'], 1, 1],
  ['hud-mfd', 'cockpit-hud-map', ['image', 'layout'], 1, null],
  ['font', 'cockpit-hud-map', ['font'], 1, null],
  ['strategic-map', 'cockpit-hud-map', ['image', 'layout'], 1, null],
  ['fire-sound', 'audio', ['sound'], 1, null],
  ['missile-sound', 'audio', ['sound'], 1, null],
  ['explosion-sound', 'audio', ['sound'], 1, null],
  ['warp-sound', 'audio', ['sound'], 1, null],
  ['craft-info', 'logic', ['data'], 1, 1],
  ['debris-parameters', 'logic', ['data'], 1, 1],
  ['ai-programs', 'logic', ['data'], 1, 1],
  ['comm-menus', 'logic', ['data'], 1, 1],
  ['base-repair-items', 'logic', ['data'], 1, 1],
  ['flight-messages', 'logic', ['data'], 1, 1],
  ['scene-settings', 'models', ['data'], 1, 1],
  ['explosion-table', 'models', ['data'], 1, 1],
  ['nebula-backgrounds', 'models', ['data'], 1, 1],
  ['hit-shimmer', 'models', ['image'], 1, 1],
  ['target-display', 'cockpit-hud-map', ['image'], 1, 1],
  ['view-labels', 'cockpit-hud-map', ['data'], 1, 1],
  ['hud-text', 'cockpit-hud-map', ['data'], 1, 1],
  ['event-sound', 'audio', ['sound'], 8, 8],
  ['hud-sound', 'audio', ['sound'], 3, 3],
  ['comm-messages', 'logic', ['data'], 1, 1],
] as const;

describe('classic-p2-slice definition', () => {
  it('records the approved candidate and configuration without source entry IDs', () => {
    expect(CLASSIC_P2_SLICE.sliceId).toBe(SLICE_ID);
    expect(CLASSIC_P2_SLICE.version).toBe(SLICE_DEFINITION_VERSION);
    // Version 2 (P2-01 revision, 2026-10-06) admits data for the effect roles and the models group; version 3
    // (P2-07 revision, 2026-10-08) lets the cockpit-hud-map group own data; version 4 (P3-03) adds the rule-data,
    // flight-data, HUD text, event and HUD sound roles; version 5 (P3-03 revision 2) adds the communications messages.
    expect(SLICE_DEFINITION_VERSION).toBe(5);
    expect(CLASSIC_P2_SLICE.candidate).toEqual({ campaignGroup: 0, campaignSlot: 1 });
    expect(CLASSIC_P2_SLICE.configuration).toEqual({ wingman: 'optional' });
    const serialized = JSON.stringify(CLASSIC_P2_SLICE);
    // `scene-settings` names a role, not the SCEN entry type.
    expect(serialized).not.toMatch(/entry|nob|\bscen\b|scct|m2id|locator|path/i);
    expect(serialized).not.toMatch(/\d{3,}/);
  });

  it.each(S03_ROLES)('requires role %s in group %s with kinds %j and %i..%s Assets', (role, group, kinds, min, max) => {
    const matches = CLASSIC_P2_SLICE.roles.filter(requirement => requirement.role === role);
    expect(matches).toEqual([{ role, group, kinds, minAssets: min, maxAssets: max }]);
  });

  it('defines exactly the S-03 and version 4 roles and all four resource groups', () => {
    expect(CLASSIC_P2_SLICE.roles.map(requirement => requirement.role)).toEqual(S03_ROLES.map(([role]) => role));
    expect(CLASSIC_P2_SLICE.groups).toEqual([...RESOURCE_GROUPS]);
  });

  it('assigns each group its owned kinds and keeps every role inside its group', () => {
    expect(CLASSIC_P2_SLICE.groupKinds).toEqual({
      logic: ['mission', 'data'],
      models: ['model', 'image', 'palette', 'data'],
      'cockpit-hud-map': ['image', 'palette', 'font', 'layout', 'data'],
      audio: ['sound'],
    });
    for (const { role, group, kinds } of CLASSIC_P2_SLICE.roles) {
      expect(kinds.every(kind => CLASSIC_P2_SLICE.groupKinds[group].includes(kind)), role).toBe(true);
    }
  });

  it('is deeply frozen and independently structured-cloneable', () => {
    const containers = [
      CLASSIC_P2_SLICE,
      CLASSIC_P2_SLICE.candidate,
      CLASSIC_P2_SLICE.configuration,
      CLASSIC_P2_SLICE.groups,
      CLASSIC_P2_SLICE.groupKinds,
      ...Object.values(CLASSIC_P2_SLICE.groupKinds),
      CLASSIC_P2_SLICE.roles,
      ...CLASSIC_P2_SLICE.roles,
      ...CLASSIC_P2_SLICE.roles.map(requirement => requirement.kinds),
    ];
    for (const container of containers) {
      expect(Object.isFrozen(container)).toBe(true);
      expect(Reflect.set(container, 'extra', 1)).toBe(false);
    }
    const clone = structuredClone(CLASSIC_P2_SLICE);
    expect(clone).toEqual(CLASSIC_P2_SLICE);
    Reflect.set(clone.roles[2].kinds, '1', 'image');
    Reflect.set(clone.roles[2], 'maxAssets', 3);
    Reflect.set(clone.candidate, 'campaignGroup', 1);
    expect(CLASSIC_P2_SLICE.roles[2]).toEqual({ role: 'enemy-ship', group: 'models', kinds: ['model'], minAssets: 1, maxAssets: 2 });
    expect(CLASSIC_P2_SLICE.candidate.campaignGroup).toBe(0);
  });
});
