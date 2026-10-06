import { describe, expect, it } from 'vitest';
import { readContentIdentity } from './content-identity.ts';
import { computeManifestIdentity } from './manifest-identity.ts';
import { CLASSIC_P2_SLICE, type SliceDefinition } from './slice-definition.ts';
import { payloadIdentityOf, syntheticIdentity, syntheticSourceGroup } from './synthetic-content.test-support.ts';

type Origin = { type: 'synthetic'; fixtureId: string } | { type: 'original-import'; sourceFingerprint: string };
type Draft = { group: string; assets: Record<string, unknown>[]; sources: { sourceFingerprint: string | null; states: { id: string; state: string; unknowns: string[] }[] } | null };

/** Fresh mutable drafts of the synthetic models and audio groups, as an original import of one source. */
function drafts(): { schemaVersion: number; converterVersion: string; origin: Origin; groups: Draft[] } {
  return {
    schemaVersion: 1,
    converterVersion: 'osr-import.audio-1',
    origin: { type: 'original-import', sourceFingerprint: 'source:synthetic-disc' },
    groups: (['models', 'audio'] as const).map(group => {
      const { manifest, sources } = syntheticSourceGroup(group, 'source:synthetic-disc');
      return { group, assets: manifest.assets as unknown as Record<string, unknown>[], sources };
    }),
  };
}

const identity = (input: unknown, definition: SliceDefinition = CLASSIC_P2_SLICE) => computeManifestIdentity(definition, input);

const audio = (input: ReturnType<typeof drafts>) => input.groups[1];
const asset = (input: ReturnType<typeof drafts>, id: string) => audio(input).assets.find(item => item.id === id)!;

describe('manifest identity', () => {
  it('is manifest:sha256 with 64 lowercase hexadecimal digits and passes the content identity reader', () => {
    const value = identity(drafts());
    expect(value).toMatch(/^manifest:sha256:[0-9a-f]{64}$/);
    expect(readContentIdentity(syntheticIdentity({ manifestIdentity: value })).manifestIdentity).toBe(value);
  });

  it('pins the canonical serialization of a fixed input', () => {
    // Cross-checked with node:crypto over the ASCII JSON text; a change here changes every package identity.
    expect(identity(drafts())).toBe('manifest:sha256:3c196518907b0eced19e1133e5c60bf8b150a4bb18271428045f5ffa486ec351');
  });

  it('is deterministic and independent of property insertion order', () => {
    const reversed = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reversed);
      if (typeof value !== 'object' || value === null) return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversed(item)]));
    };
    const input = drafts();
    expect(Object.keys(reversed(input) as object)).toEqual(['groups', 'origin', 'converterVersion', 'schemaVersion']);
    expect(identity(drafts())).toBe(identity(input));
    expect(identity(reversed(input))).toBe(identity(input));
  });

  const changes: [string, (input: ReturnType<typeof drafts>) => void, SliceDefinition?][] = [
    ['an Asset ID together with its kind', input => {
      Object.assign(input.groups[0].assets.at(-1)!, { id: 'sound/synthetic-projectile', kind: 'sound' });
    }],
    ['an Asset ID', input => { asset(input, 'sound/synthetic-warp').id = 'sound/synthetic-warq'; }],
    ['a role', input => { asset(input, 'sound/synthetic-fire').role = 'model-sound'; }],
    ['a descriptor group', input => { asset(input, 'sound/synthetic-fire').group = 'models'; }],
    ['a dependency', input => { asset(input, 'sound/synthetic-fire').dependencies = [{ id: 'sound/synthetic-engine', kind: 'sound' }]; }],
    ['a payload schema version', input => { (asset(input, 'sound/synthetic-fire').payloadIdentity as { schemaVersion: number }).schemaVersion = 2; }],
    ['a payload length', input => { (asset(input, 'sound/synthetic-fire').payloadIdentity as { byteLength: number }).byteLength += 1; }],
    ['a payload fingerprint', input => { asset(input, 'sound/synthetic-fire').payloadIdentity = payloadIdentityOf(Uint8Array.of(1)); }],
    ['a source state', input => { audio(input).sources!.states[1].state = 'unconfirmed'; }],
    ['a U item', input => { audio(input).sources!.states[1].unknowns = ['U-004']; }],
    ['the source fingerprint', input => { audio(input).sources!.sourceFingerprint = 'source:other-disc'; }],
    ['the presence of source states', input => { audio(input).sources = null; }],
    ['a group removed', input => { input.groups.pop(); }],
    ['a group added', input => {
      const { manifest, sources } = syntheticSourceGroup('logic', 'source:synthetic-disc');
      input.groups.unshift({ group: 'logic', assets: manifest.assets as unknown as Record<string, unknown>[], sources });
    }],
    ['the content schema version', input => { input.schemaVersion = 2; }],
    ['the converter version', input => { input.converterVersion = 'osr-import.audio-2'; }],
    ['the origin token', input => { input.origin = { type: 'original-import', sourceFingerprint: 'source:other-disc' }; }],
    ['the origin type', input => { input.origin = { type: 'synthetic', fixtureId: 'synthetic-disc' }; }],
    ['the slice definition version', () => undefined, { ...CLASSIC_P2_SLICE, version: 2 as SliceDefinition['version'] }],
  ];

  it.each(changes)('changes with %s', (_name, change, definition) => {
    const input = drafts();
    change(input);
    expect(identity(input, definition)).not.toBe(identity(drafts()));
  });

  it('keeps field and group boundaries unambiguous', () => {
    const split = (id: string, role: string) => {
      const input = drafts();
      audio(input).assets = [{ ...asset(input, 'sound/synthetic-fire'), id, role }];
      audio(input).sources = null;
      return identity(input);
    };
    expect(split('sound/a', 'bc')).not.toBe(split('sound/ab', 'c'));

    const moved = drafts();
    const [engine] = audio(moved).assets.splice(0, 1);
    moved.groups[0].assets.push(engine);
    moved.groups.forEach(group => { group.sources = null; });
    const unmoved = drafts();
    unmoved.groups.forEach(group => { group.sources = null; });
    expect(identity(moved)).not.toBe(identity(unmoved));
  });

  it.each([
    ['a repeated group', (input: ReturnType<typeof drafts>) => { input.groups.push(input.groups[1]); }, 'duplicate-group', 'package.groups[2]'],
    ['groups out of definition order', (input: ReturnType<typeof drafts>) => { input.groups.reverse(); }, 'group-order', 'package.groups[1]'],
    ['an unknown group', (input: ReturnType<typeof drafts>) => { input.groups[1].group = 'music'; }, 'invalid-resource-group', 'package.groups[1].group'],
    ['no groups', (input: ReturnType<typeof drafts>) => { input.groups = []; }, 'invalid-record', 'package.groups'],
    ['a kind that contradicts the ID', (input: ReturnType<typeof drafts>) => { asset(input, 'sound/synthetic-fire').kind = 'image'; }, 'kind-mismatch', 'package.groups[1].assets[2].kind'],
    ['descriptors out of order', (input: ReturnType<typeof drafts>) => { audio(input).assets.reverse(); }, 'asset-order', 'package.groups[1].assets[1]'],
    ['an invalid source state', (input: ReturnType<typeof drafts>) => { audio(input).sources!.states[0].state = 'ready'; }, 'invalid-source-mapping', 'package.groups[1].sources.states[0].state'],
    ['schema version 0', (input: ReturnType<typeof drafts>) => { input.schemaVersion = 0; }, 'invalid-version', 'package.schemaVersion'],
    ['an invalid converter version', (input: ReturnType<typeof drafts>) => { input.converterVersion = 'Audio 1'; }, 'invalid-identity', 'package.converterVersion'],
    ['an invalid origin', (input: ReturnType<typeof drafts>) => { input.origin = { type: 'cloud' } as never; }, 'invalid-origin', 'package.origin.type'],
    ['an extra field', (input: ReturnType<typeof drafts>) => { Object.assign(input.groups[0], { payloads: [] }); }, 'invalid-record', 'package.groups[0]'],
  ] as const)('rejects %s', (_name, corrupt, code, path) => {
    const input = drafts();
    corrupt(input);
    expect(() => identity(input)).toThrowError(expect.objectContaining({ name: 'ContentContractError', code, path }));
  });
});
