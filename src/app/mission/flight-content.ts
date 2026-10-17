/**
 * The flight presentation's content from a held package (docs/plan/p3/12/spec.md, 内容输入与校验): the models group's
 * `explosion-table` Asset, every explosion animation its lists name, and its `nebula-backgrounds` Asset, each decoded
 * strictly with `decodeFlightDataPayload`. A complete package has exactly one Asset of each of the two roles; one the
 * package lacks, or a named animation it lacks, is a content error, as is any decoding error, which keeps its code and
 * reason at `models[<Asset ID>].<path>`. The presentation module then checks what it needs of the content itself.
 */
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { ExplosionAnimation, ExplosionTable, FlightDataPayload, NebulaBackgrounds } from '../../content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import type { PresentationContent } from '../../render/flight/presentation/explosion-selection.ts';
import type { PackageGroup } from '../resources/mission-input.ts';

const PATH = 'models';

type Content = { readonly [Role in FlightDataPayload['role']]: Extract<FlightDataPayload, { readonly role: Role }>['content'] };

export function presentationContentOf(groups: readonly PackageGroup[]): PresentationContent {
  const models = groups.find(({ group }) => group === 'models');
  if (!models) throw new ContentContractError('invalid-resource-group', PATH, 'the package holds no complete models group');
  const { assets } = readGroupManifest(models.manifest, `groups.${PATH}.manifest`);
  const payloads = new Map(readPayloadRecords(models.payloads, `groups.${PATH}.payloads`).map(({ id, bytes }) => [id, bytes]));
  const decode = <Role extends FlightDataPayload['role']>(descriptor: AssetDescriptor, role: Role): Content[Role] => {
    const bytes = payloads.get(descriptor.id);
    if (!bytes) throw new ContentContractError('invalid-record', `${PATH}[${descriptor.id}]`, 'has no payload');
    let payload: FlightDataPayload;
    try {
      payload = decodeFlightDataPayload(bytes, descriptor);
    } catch (error) {
      if (error instanceof ContentContractError) throw new ContentContractError(error.code, `${PATH}[${descriptor.id}].${error.path}`, error.reason);
      throw error;
    }
    if (payload.role !== role) throw new ContentContractError('invalid-role', `${PATH}[${descriptor.id}]`, `must be a ${role} Asset`);
    return payload.content as Content[Role];
  };
  const only = (role: 'explosion-table' | 'nebula-backgrounds'): AssetDescriptor => {
    const found = assets.filter((descriptor) => descriptor.role === role);
    if (found.length !== 1) throw new ContentContractError('invalid-role', PATH, `must hold exactly one ${role} Asset`);
    return found[0];
  };
  const explosions: ExplosionTable = decode(only('explosion-table'), 'explosion-table');
  const animations = new Map<AssetId, ExplosionAnimation>();
  for (const { animation } of explosions.lists.flat()) {
    if (animations.has(animation.id)) continue;
    const descriptor = assets.find(({ id }) => id === animation.id);
    if (!descriptor) throw new ContentContractError('flight-data-reference-mismatch', `${PATH}[${animation.id}]`, 'is named by the explosion table but missing');
    animations.set(animation.id, decode(descriptor, 'explosion-animation'));
  }
  const nebula: NebulaBackgrounds = decode(only('nebula-backgrounds'), 'nebula-backgrounds');
  return Object.freeze({ explosions, animations, nebula });
}
