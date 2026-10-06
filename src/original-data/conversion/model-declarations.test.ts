import { describe, expect, it } from 'vitest';
import { expectSourceError } from './conversion.test-support.ts';
import { readModelDeclarations } from './model-declarations.ts';

const declaration = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ asset: { id, kind: 'model' }, role: 'enemy-ship', group: 'models', ...overrides });

describe('model declarations', () => {
  it('reads frozen declarations in the given order', () => {
    const declarations = readModelDeclarations([declaration('model/synthetic-b'), declaration('model/synthetic-a', { role: 'friendly-craft' })]);
    expect(declarations).toEqual([
      { asset: { id: 'model/synthetic-b', kind: 'model' }, role: 'enemy-ship', group: 'models' },
      { asset: { id: 'model/synthetic-a', kind: 'model' }, role: 'friendly-craft', group: 'models' },
    ]);
    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
    expect(readModelDeclarations([])).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ['a non-array set', { length: 0 }, 'models.declarations'],
    ['a non-record declaration', [null], 'models.declarations[0]'],
    ['a source field', [declaration('model/synthetic-a', { source: 'MAIN/SR.NOB' })], 'models.declarations[0]'],
    ['a texture field', [declaration('model/synthetic-a', { textures: [] })], 'models.declarations[0]'],
    ['a missing role', [{ asset: { id: 'model/synthetic-a', kind: 'model' }, group: 'models' }], 'models.declarations[0].role'],
    ['an image Asset', [declaration('image/synthetic-a', { asset: { id: 'image/synthetic-a', kind: 'image' } })], 'models.declarations[0].asset.kind'],
    ['a kind that differs from the ID', [declaration('model/synthetic-a', { asset: { id: 'model/synthetic-a', kind: 'image' } })], 'models.declarations[0].asset.kind'],
    ['a malformed Asset ID', [declaration('model/Synthetic')], 'models.declarations[0].asset.id'],
    ['a malformed role', [declaration('model/synthetic-a', { role: 'Enemy Ship' })], 'models.declarations[0].role'],
    ['another group', [declaration('model/synthetic-a', { group: 'audio' })], 'models.declarations[0].group'],
    ['an unknown group', [declaration('model/synthetic-a', { group: 'meshes' })], 'models.declarations[0].group'],
    ['a duplicate Asset ID', [declaration('model/synthetic-a'), declaration('model/synthetic-a', { role: 'base' })], 'models.declarations[1].asset.id'],
  ])('rejects %s as an invalid declaration', (_, value, location) => {
    expectSourceError(() => readModelDeclarations(value), 'invalid-declaration', location);
  });
});
