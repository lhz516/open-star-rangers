import { describe, expect, it } from 'vitest';
import type { MissionLoadState } from '../../app/resources/mission-diagnostics.ts';
import { readAssetId } from '../../content/asset-id.ts';
import { appearanceText, missionLines, variantLabel } from './viewer-copy.ts';
import { viewerKeyAction } from './viewer-keys.ts';

const key = (name: string, modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {}) =>
  viewerKeyAction({ key: name, ctrlKey: false, metaKey: false, altKey: false, ...modifiers });

describe('viewer keys', () => {
  it('turns with the arrows, zooms with + or = and -, and resets with 0', () => {
    expect(key('ArrowLeft')).toEqual({ type: 'rotate', axis: 'vertical', steps: -1 });
    expect(key('ArrowRight')).toEqual({ type: 'rotate', axis: 'vertical', steps: 1 });
    expect(key('ArrowUp')).toEqual({ type: 'rotate', axis: 'horizontal', steps: -1 });
    expect(key('ArrowDown')).toEqual({ type: 'rotate', axis: 'horizontal', steps: 1 });
    expect(key('+')).toEqual({ type: 'zoom', steps: 1 });
    expect(key('=')).toEqual({ type: 'zoom', steps: 1 });
    expect(key('-')).toEqual({ type: 'zoom', steps: -1 });
    expect(key('0')).toEqual({ type: 'reset' });
  });

  it('leaves other keys and keys with Control, Meta or Alt to the browser', () => {
    for (const name of ['a', 'Enter', ' ', 'Tab', '1', 'Escape']) expect(key(name)).toBeNull();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) expect(key('+', { [modifier]: true })).toBeNull();
  });
});

describe('viewer copy', () => {
  it('labels part lists with their notes and effect views by kind and position', () => {
    expect(variantLabel({ kind: 'part-list', list: 1, parts: 1, content: 'fragments', confidence: 'confirmed' }))
      .toBe('Part list 1: hull fragments drawn when a craft is destroyed (confirmed), 1 part');
    expect(variantLabel({ kind: 'part-list', list: 2, parts: 0, content: 'unknown', confidence: 'unconfirmed' })).toBe('Part list 2: purpose unknown (unconfirmed), 0 parts');
    expect(variantLabel({ kind: 'effect-view', label: 'missile-type', index: 3, shapes: [] })).toBe('Missile type 3');
    expect(variantLabel({ kind: 'effect-view', label: 'textured-shape', index: 0, shapes: [] })).toBe('Textured shape 0');
  });

  it('shows effect colours as given, with the bytes drawn, and names the diagnostic grey', () => {
    expect(appearanceText({ rgb: [64, 0, 255], colour: [0.25, -0, 1.75], textured: false, seamUnconfirmed: false })).toBe('Colour 0.25, -0, 1.75, drawn as 64, 0, 255');
    expect(appearanceText({ rgb: [128, 128, 128], colour: null, textured: false, seamUnconfirmed: false })).toBe('No colour: shown in diagnostic grey 128, 128, 128, not an original colour');
    expect(appearanceText({ rgb: [255, 255, 255], colour: null, textured: true, seamUnconfirmed: true })).toBe('Texture texels shown unchanged; no source colour');
  });

  it('describes a loaded mission by structure and counts only, and nothing otherwise', () => {
    const mission: MissionLoadState = {
      status: 'loaded',
      summary: {
        mission: readAssetId('mission/synthetic-first'), campaign: { group: 2, slot: 5 }, mapAxes: { right: '+x', up: '-z' },
        units: { coordinates: 'scen-reference', layout: 'scen-runtime' }, player: 0,
        counts: { declarations: 9, groups: 1, spawnRegions: 3, wingmanOptions: 5, namePool: 19 },
        sides: { player: 1, friendly: 2, enemy: 4, none: 2 },
      },
      references: {
        declarationsWithModel: 7, wingmanOptionsWithModel: 5, modelsGroup: 'held',
        models: [{ id: readAssetId('model/a'), present: true }, { id: readAssetId('model/b'), present: false }],
      },
    };
    expect(missionLines(mission)).toEqual([
      'Mission mission/synthetic-first, campaign group 2, slot 5',
      'Map axes: right +x, up -z; units: scen-reference coordinates, scen-runtime layout',
      '9 declarations (player is declaration 0), 1 group, 3 spawn regions, 5 wingman options, 19 pool names',
      'Sides: 1 player, 2 friendly, 4 enemy, 2 without a craft type',
      'Models: 7 declarations and 5 wingman options resolve to 2 models, 1 present in the held models group',
      'Model model/a: present in the models group',
      'Model model/b: missing from the models group',
    ]);
    expect(missionLines({ status: 'not-attempted' })).toBeNull();
    expect(missionLines({ status: 'failed', failure: { kind: 'content', path: 'p', reason: 'r' } })).toBeNull();
  });
});
