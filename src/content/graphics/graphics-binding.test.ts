import { describe, expect, it } from 'vitest';
import { readAssetDescriptor, type AssetDescriptor } from '../asset-contract.ts';
import { readAssetId } from '../asset-id.ts';
import { validateGroup } from '../completeness.ts';
import { sha256Fingerprint } from '../sha256.ts';
import { CLASSIC_P2_SLICE } from '../slice-definition.ts';
import { SYNTHETIC_ASSETS, syntheticGroup } from '../synthetic-content.test-support.ts';
import { encodeFontPayload, readFontPayload } from './font-payload.ts';
import { checkGraphicsBinding, referencedPalettes, type GraphicsPayload } from './graphics-binding.ts';
import { encodeImagePayload, readImagePayload, type ImageDisplay } from './image-payload.ts';
import { encodePalettePayload, readPalettePayload } from './palette-payload.ts';
import { expectContractError } from './graphics.test-support.ts';

const SOURCE = readAssetId('palette/synthetic-texture');
const FLIGHT = readAssetId('palette/synthetic-flight');

const paletteBytes = () => encodePalettePayload({ entries: Uint8Array.from({ length: 48 }, (_, index) => index * 5) });
const fontBytes = () => encodeFontPayload({ cellWidth: 8, height: 8, glyphRows: 8, glyphs: Uint8Array.from({ length: 2048 }, (_, index) => index % 251), charMap: [{ code: 65, glyph: 65 }] });
const imageBytes = (display: ImageDisplay = 'direct', palette = SOURCE) => encodeImagePayload({
  width: 3, height: 2, palette, display, indices: new Uint8Array([1, 0, 3, 4, 0, 6]), mask: new Uint8Array([0b1010_0000, 0b1010_0000]),
});

const image = (display: ImageDisplay) => readImagePayload(imageBytes(display), 1);

/** A typed descriptor built without the reader, so tests can state inconsistent dependencies directly. */
function descriptor(kind: GraphicsPayload['kind'], dependencies: readonly [string, string][] = []): AssetDescriptor {
  return {
    id: readAssetId(`${kind}/synthetic`), kind, role: 'synthetic', group: 'models',
    dependencies: dependencies.map(([dependencyKind, id]) => ({ kind: dependencyKind as 'palette', id: readAssetId(id) })),
    payloadIdentity: { schemaVersion: 1, byteLength: 0, fingerprint: `sha256:${'0'.repeat(64)}` } as AssetDescriptor['payloadIdentity'],
  };
}

describe('graphics payload bindings', () => {
  it('derives the referenced palettes, deduplicated in ascending order', () => {
    expect(referencedPalettes(image('direct'))).toEqual([SOURCE]);
    expect(referencedPalettes(image({ nearest: FLIGHT }))).toEqual([FLIGHT, SOURCE]);
    expect(referencedPalettes(image({ nearest: SOURCE }))).toEqual([SOURCE]);
    expect(referencedPalettes(readPalettePayload(paletteBytes(), 1))).toEqual([]);
    expect(referencedPalettes(readFontPayload(fontBytes(), 1))).toEqual([]);
  });

  it('accepts descriptors whose kind and dependencies match the payload', () => {
    expect(() => checkGraphicsBinding(descriptor('image', [['palette', SOURCE]]), image('direct'))).not.toThrow();
    expect(() => checkGraphicsBinding(descriptor('image', [['palette', FLIGHT], ['palette', SOURCE]]), image({ nearest: FLIGHT }))).not.toThrow();
    expect(() => checkGraphicsBinding(descriptor('palette'), readPalettePayload(paletteBytes(), 1))).not.toThrow();
    expect(() => checkGraphicsBinding(descriptor('font'), readFontPayload(fontBytes(), 1))).not.toThrow();
  });

  it.each([
    ['another kind', descriptor('font', [['palette', SOURCE]]), image('direct'), 'asset.kind'],
    ['no palette dependency', descriptor('image'), image('direct'), 'asset.dependencies'],
    ['an extra dependency', descriptor('image', [['palette', FLIGHT], ['palette', SOURCE]]), image('direct'), 'asset.dependencies'],
    ['a missing nearest target', descriptor('image', [['palette', SOURCE]]), image({ nearest: FLIGHT }), 'asset.dependencies'],
    ['another palette', descriptor('image', [['palette', FLIGHT]]), image('direct'), 'asset.dependencies'],
    ['a non-palette dependency kind', descriptor('image', [['image', SOURCE]]), image('direct'), 'asset.dependencies'],
    ['a palette with a dependency', descriptor('palette', [['palette', SOURCE]]), readPalettePayload(paletteBytes(), 1), 'asset.dependencies'],
    ['a font with a dependency', descriptor('font', [['palette', SOURCE]]), readFontPayload(fontBytes(), 1), 'asset.dependencies'],
  ] as const)('reports binding-mismatch for %s', (_, asset, payload, path) => {
    expectContractError(() => checkGraphicsBinding(asset, payload), 'binding-mismatch', path);
  });

  it('encodes the same input to the same bytes and SHA-256', () => {
    for (const encode of [paletteBytes, fontBytes, () => imageBytes({ nearest: FLIGHT })]) {
      const [first, second] = [encode(), encode()];
      expect(first).toEqual(second);
      expect(sha256Fingerprint(first)).toBe(sha256Fingerprint(second));
    }
  });

  it('gives payload identities that validateGroup accepts in a complete synthetic group', () => {
    const bytes: Record<string, Uint8Array> = {
      'font/synthetic-hud': fontBytes(),
      'image/synthetic-mfd': imageBytes('direct', FLIGHT),
      'image/synthetic-panel': imageBytes('direct', FLIGHT),
      [FLIGHT]: paletteBytes(),
    };
    const specs = [...SYNTHETIC_ASSETS['cockpit-hud-map'], { id: FLIGHT, role: 'flight-palette' }].map(spec => ({
      ...spec,
      bytes: bytes[spec.id] ?? undefined,
      dependencies: spec.id.startsWith('image/') ? [FLIGHT] : spec.dependencies,
    }));
    const input = syntheticGroup('cockpit-hud-map', specs);
    expect(validateGroup(CLASSIC_P2_SLICE, input).status).toBe('group-complete');
    const readers: Record<string, (bytes: unknown, schemaVersion: unknown) => GraphicsPayload> =
      { font: readFontPayload, image: readImagePayload, palette: readPalettePayload };
    const graphics = input.manifest.assets.filter(asset => Object.hasOwn(readers, asset.kind));
    expect(graphics).toHaveLength(4);
    for (const asset of graphics) {
      const { schemaVersion, bytes: payload } = input.payloads.find(({ id }) => id === asset.id)!;
      expect(() => checkGraphicsBinding(readAssetDescriptor(asset), readers[asset.kind](payload, schemaVersion))).not.toThrow();
    }
  });
});
