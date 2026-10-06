import { describe, expect, it } from 'vitest';
import { SourceError } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { DEFAULT_MODEL_IDS } from '../formats/formats.test-support.ts';
import { bindCraftTypes } from './craft-binding.ts';

const LIST = 'archive:/MAIN/SR.NOB#10649';
const REFERENCED = [17, 0, 7, 1, 8, 14, 7, 0];

/** M2ID slots with the given MODL entry IDs and zero elsewhere. */
const ids = (slots: Record<number, number>) => Array.from({ length: 22 }, (_, slot) => slots[slot] ?? 0);

function failure(action: () => unknown): { code: string; location: string } {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SourceError);
    const data = (error as SourceError).toData();
    expect(inLocationGrammar(data)).toBe(true);
    expect(data.reason).not.toMatch(/\d{3}/);
    return { code: data.code, location: data.location };
  }
  throw new Error('expected a SourceError');
}

describe('craft type binding', () => {
  it('binds only the referenced craft types, naming each model once by category', () => {
    const { table, models } = bindCraftTypes(REFERENCED, DEFAULT_MODEL_IDS, LIST);
    const model = (id: string) => ({ id, kind: 'model' });
    expect(table.entries).toEqual([
      { craftType: 0, side: 'player', baseInteraction: false, model: model('model/player-ship') },
      { craftType: 1, side: 'friendly', baseInteraction: false, model: model('model/player-ship') },
      { craftType: 7, side: 'enemy', baseInteraction: false, model: model('model/enemy-ship-1') },
      { craftType: 8, side: 'enemy', baseInteraction: false, model: model('model/enemy-ship-2') },
      { craftType: 14, side: 'friendly', baseInteraction: false, model: model('model/friendly-craft-1') },
      { craftType: 17, side: 'friendly', baseInteraction: true, model: model('model/base-1') },
    ]);
    expect(models).toEqual([
      { id: 'model/base-1', modelEntryId: DEFAULT_MODEL_IDS[17] },
      { id: 'model/enemy-ship-1', modelEntryId: DEFAULT_MODEL_IDS[7] },
      { id: 'model/enemy-ship-2', modelEntryId: DEFAULT_MODEL_IDS[8] },
      { id: 'model/friendly-craft-1', modelEntryId: DEFAULT_MODEL_IDS[14] },
      { id: 'model/player-ship', modelEntryId: DEFAULT_MODEL_IDS[0] },
    ]);
    expect(Object.isFrozen(table) && Object.isFrozen(models) && Object.isFrozen(models[0])).toBe(true);
  });

  it('shares one ID between craft types of one category with the same model, and numbers distinct models', () => {
    const shared = bindCraftTypes([0, 7, 8, 9], ids({ 0: 1, 7: 70, 8: 70, 9: 90 }), LIST);
    expect(shared.table.entries.map(entry => entry.model.id)).toEqual(['model/player-ship', 'model/enemy-ship-1', 'model/enemy-ship-1', 'model/enemy-ship-2']);
    expect(shared.models).toHaveLength(3);
    const bases = bindCraftTypes([0, 15, 17, 18, 2], ids({ 0: 1, 2: 20, 15: 150, 17: 170, 18: 150 }), LIST);
    expect(bases.table.entries.map(entry => [entry.craftType, entry.model.id])).toEqual([
      [0, 'model/player-ship'], [2, 'model/friendly-craft-1'], [15, 'model/base-1'], [17, 'model/base-2'], [18, 'model/base-1'],
    ]);
  });

  it.each([
    ['no player craft type', [7, 8], ids({ 7: 70, 8: 80 }), 'invalid-payload', `${LIST}/ids[0]`],
    ['a zero M2ID slot', [0, 3], ids({ 0: 1 }), 'invalid-payload', `${LIST}/ids[3]`],
    ['a craft type past the M2ID list', [0, 25], ids({ 0: 1 }), 'invalid-payload', `${LIST}/ids[25]`],
    ['a craft type without a side', [0, 20], ids({ 0: 1, 20: 200 }), 'unsupported-payload', `${LIST}/ids[20]`],
    ['an enemy sharing the player model', [0, 7], ids({ 0: 1, 7: 1 }), 'invalid-payload', `${LIST}/ids[7]`],
    ['a base sharing an enemy model', [0, 7, 17], ids({ 0: 1, 7: 70, 17: 70 }), 'invalid-payload', `${LIST}/ids[17]`],
    ['a friendly craft sharing a base model', [0, 14, 17], ids({ 0: 1, 14: 170, 17: 170 }), 'invalid-payload', `${LIST}/ids[14]`],
  ])('rejects %s', (_, referenced, list, code, location) => {
    expect(failure(() => bindCraftTypes(referenced, list, LIST))).toEqual({ code, location });
  });
});
