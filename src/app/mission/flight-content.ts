/**
 * The flight picture's content from a held package (docs/plan/p3/12/spec.md, 内容输入与校验), all from its models group,
 * each payload decoded strictly and checked against its descriptor:
 *
 * - for the presentation module, the `explosion-table` Asset, every explosion animation its lists name and the
 *   `nebula-backgrounds` Asset (`decodeFlightDataPayload`); for the renderer, the `scene-settings` Asset (RENS 10751's
 *   header);
 * - for the passes (P3-12/17–22, 31), every `model` (`readModelPayload`), `image` (`readImagePayload`) and `palette`
 *   (`readPalettePayload`) Asset of the group, so every model a run can show, every texture, explosion frame and nebula
 *   image and every palette they index are there; the DATA palette, the group's one `flight-palette` palette; the
 *   hit-shimmer thresholds, its one `hit-shimmer` image; the projectile, missile and debris visuals, its one `data`
 *   Asset of each of those roles (`readEffectPayload`); and the debris model, its one `debris` model.
 *
 * A complete package has exactly one Asset of each of the roles named here; one the package lacks, or a named animation
 * it lacks, is a content error, as is any decoding error, which keeps its code and reason at `models[<Asset ID>].<path>`.
 * The presentation module and the passes then check what they need of it themselves (`prepareFlightContent`).
 */
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { checkEffectBinding, readEffectPayload, type EffectKind } from '../../content/effects/effect-payload.ts';
import type { ExplosionAnimation, ExplosionTable, FlightDataPayload } from '../../content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import { checkGraphicsBinding } from '../../content/graphics/graphics-binding.ts';
import { readImagePayload, type ImagePayload } from '../../content/graphics/image-payload.ts';
import { readPalettePayload, type PalettePayload } from '../../content/graphics/palette-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { checkModelBinding, readModelPayload, type ModelPayload } from '../../content/models/model-payload.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import type { FlightRunContent } from '../../render/flight/renderer/flight-passes.ts';
import type { PackageGroup } from '../resources/mission-input.ts';

const PATH = 'models';

type Content = { readonly [Role in FlightDataPayload['role']]: Extract<FlightDataPayload, { readonly role: Role }>['content'] };

export function flightContentOf(groups: readonly PackageGroup[]): FlightRunContent {
  const models = groups.find(({ group }) => group === 'models');
  if (!models) throw new ContentContractError('invalid-resource-group', PATH, 'the package holds no complete models group');
  const { assets } = readGroupManifest(models.manifest, `groups.${PATH}.manifest`);
  const payloads = new Map(readPayloadRecords(models.payloads, `groups.${PATH}.payloads`).map(({ id, bytes }) => [id, bytes]));
  /** `read`'s result for the Asset of `descriptor`, a decoding error moved to the Asset's path. */
  const decoded = <T>(descriptor: AssetDescriptor, read: (bytes: Uint8Array, path: string) => T): T => {
    const bytes = payloads.get(descriptor.id);
    if (!bytes) throw new ContentContractError('invalid-record', `${PATH}[${descriptor.id}]`, 'has no payload');
    try {
      return read(bytes, 'payload');
    } catch (error) {
      if (error instanceof ContentContractError) throw new ContentContractError(error.code, `${PATH}[${descriptor.id}].${error.path}`, error.reason);
      throw error;
    }
  };
  const decode = <Role extends FlightDataPayload['role']>(descriptor: AssetDescriptor, role: Role): Content[Role] => {
    const payload = decoded(descriptor, (bytes) => decodeFlightDataPayload(bytes, descriptor));
    if (payload.role !== role) throw new ContentContractError('invalid-role', `${PATH}[${descriptor.id}]`, `must be a ${role} Asset`);
    return payload.content as Content[Role];
  };
  const only = (role: string, kind: AssetDescriptor['kind'] = 'data'): AssetDescriptor => {
    const found = assets.filter((descriptor) => descriptor.role === role && descriptor.kind === kind);
    if (found.length !== 1) throw new ContentContractError('invalid-role', PATH, `must hold exactly one ${kind} Asset of role ${role}`);
    return found[0];
  };
  const schema = ({ payloadIdentity }: AssetDescriptor): number => payloadIdentity.schemaVersion;
  /** Reads a payload with `read`, then checks it against its descriptor with `check`. */
  const checked = <T>(read: (bytes: Uint8Array, schemaVersion: number, path: string) => T, check: (descriptor: AssetDescriptor, payload: T, path: string) => void) =>
    (descriptor: AssetDescriptor, bytes: Uint8Array, path: string): T => {
      const payload = read(bytes, schema(descriptor), path);
      check(descriptor, payload, path);
      return payload;
    };
  const ofKind = <T>(kind: AssetDescriptor['kind'], read: (descriptor: AssetDescriptor, bytes: Uint8Array, path: string) => T): ReadonlyMap<AssetId, T> =>
    new Map(assets.filter((descriptor) => descriptor.kind === kind).map((descriptor) => [descriptor.id, decoded(descriptor, (bytes, path) => read(descriptor, bytes, path))]));
  const effect = <Kind extends EffectKind>(kind: Kind) => {
    const descriptor = only(kind);
    const read = checked((bytes, schemaVersion, path) => readEffectPayload(bytes, schemaVersion, kind, path), checkEffectBinding);
    return decoded(descriptor, (bytes, path) => read(descriptor, bytes, path));
  };

  const explosions: ExplosionTable = decode(only('explosion-table'), 'explosion-table');
  const animations = new Map<AssetId, ExplosionAnimation>();
  for (const { animation } of explosions.lists.flat()) {
    if (animations.has(animation.id)) continue;
    const descriptor = assets.find(({ id }) => id === animation.id);
    if (!descriptor) throw new ContentContractError('flight-data-reference-mismatch', `${PATH}[${animation.id}]`, 'is named by the explosion table but missing');
    animations.set(animation.id, decode(descriptor, 'explosion-animation'));
  }
  const nebula = decode(only('nebula-backgrounds'), 'nebula-backgrounds');
  const settings = decode(only('scene-settings'), 'scene-settings');

  const modelPayloads = ofKind<ModelPayload>('model', checked(readModelPayload, checkModelBinding));
  const images = ofKind<ImagePayload>('image', checked(readImagePayload, checkGraphicsBinding));
  const palettes = ofKind<PalettePayload>('palette', checked(readPalettePayload, checkGraphicsBinding));
  const projectiles = only('projectile');
  return Object.freeze({
    presentation: Object.freeze({ explosions, animations, nebula }),
    settings,
    passes: Object.freeze({
      data: only('flight-palette', 'palette').id,
      models: modelPayloads,
      images,
      palettes,
      thresholds: images.get(only('hit-shimmer', 'image').id)!,
      projectiles: Object.freeze({ id: projectiles.id, visuals: effect('projectile') }),
      missiles: effect('missile'),
      debris: effect('debris'),
      debrisModel: only('debris', 'model').id,
    }),
  });
}
