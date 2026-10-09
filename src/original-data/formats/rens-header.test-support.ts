import type { SceneSettings } from '../../content/flight/flight-data-content.ts';
import { readSceneSettings } from '../../content/flight/flight-data-readers.ts';
import { syntheticSceneSettings } from '../../content/flight/flight-data.test-support.ts';
import { ByteWriter } from '../synthetic.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';
import { RENS_HEADER_LAYOUT } from './rens-header.ts';

// Code-generated synthetic RENS blocks for P3-03 tests; they never hold original data. By default the header holds the
// content tests' synthetic scene settings, whose values cover each stored type's edges (subnormal, extreme and negative
// f32, u32 with the top bit set, extreme i32, a device byte of 128 or above).

/** The content tests' synthetic scene settings, read strictly into the typed contract. */
export const syntheticRensSettings = (): SceneSettings => readSceneSettings(syntheticSceneSettings());

/** The header bytes +0x00–+0x57 of `settings`, with zero in the unread bytes +0x19–+0x1B. */
export function rensHeaderBytes(settings: SceneSettings): Uint8Array {
  const { base, kinds1c7c, kindsF8000 } = settings.deviceValues;
  const writer = new ByteWriter()
    .f32(...settings.lightType3Colour, ...settings.lightType0Colour)
    .u32(settings.deviceByte)
    .f32(base, kinds1c7c, kindsF8000);
  for (const { randomMask, duration, drawIntervalTicks, level } of settings.screenFlashes) writer.u32(randomMask).f32(duration).u32(drawIntervalTicks, level);
  return writer.toBytes();
}

/**
 * A whole RENS block: the header of `settings`, the relocated record table pointer at +0x58, the record count at +0x5C
 * and `records` 28-byte records of a generated pattern, which the header parser does not read.
 */
export function syntheticRens(settings: SceneSettings = syntheticRensSettings(), records = 3): SyntheticBlock {
  const { headerBytes, recordBytes } = RENS_HEADER_LAYOUT;
  const bytes = Uint8Array.from({ length: headerBytes + records * recordBytes }, (_, index) => (index * 29 + 5) & 0xff);
  bytes.set(rensHeaderBytes(settings));
  const view = new DataView(bytes.buffer);
  view.setUint32(0x58, headerBytes, true);
  view.setUint32(0x5c, records, true);
  return { bytes, relocations: [0x58] };
}
