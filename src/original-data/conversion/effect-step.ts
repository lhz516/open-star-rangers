import { readAssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, readBudgetRecord } from '../../content/budget.ts';
import { compareText, ContentContractError } from '../../content/contract-validation.ts';
import {
  EFFECT_LIMITS, EFFECT_PAYLOAD_SCHEMA_VERSION, EFFECT_SHAPES as S, MISSILE_CONSTANTS, checkEffectBinding, effectPayloadLength,
  effectReferences, encodeEffectPayload, faceTriangles,
  type DebrisTemplate, type EffectColour, type EffectPayload, type MissileConstants, type MissileFin, type MissileType,
  type ProjectileRecord, type ProjectileTemplate,
} from '../../content/effects/effect-payload.ts';
import { effectExpansionSize } from '../../content/effects/expand-effects.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import type { AssetSourceState } from '../../content/source-state.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import { openLeExecutable, type LeExecutable } from '../formats/le-executable.ts';
import { SourceError } from '../source-error.ts';
import {
  archiveLocator, assetSourceStates, executableRegion, isRegionLocator, readSourceMappingTable, type ExecutableRegionLocator, type SourceMapping,
} from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { chargeConversionBudget, readConversionUsage } from './conversion-budget.ts';
import { EFFECT_REGION_USES, MISSILE_RECORD_BYTES, readEffectDeclarations, type EffectDeclaration } from './effect-declarations.ts';
import type { GraphicsStepResult } from './graphics-step.ts';
import { stepEntryReader } from './step-entry-reader.ts';

// The effect step (docs/plan/p2/06/spec.md, effect geometry data): converts the RENS projectile records and the
// executable's regions into the three effect `data` payloads. It only reads bytes; no code is executed or emulated.
// Field layouts and builder rules are in docs/original/formats/executable.md (effect geometry data).

/** The archive of the RENS entry. */
export const EFFECT_ARCHIVE = 'MAIN/SR.NOB';
/** RENS layout: the record table pointer and count, the header length and the record length. */
const RENS = Object.freeze({ pointer: 0x58, count: 0x5c, headerBytes: 0x60, recordBytes: 28 });

/** The effect step's result has the graphics step's shape: only the `models` group, present when it has Assets. */
export type EffectStepResult = GraphicsStepResult;

const viewOf = (block: Uint8Array): DataView => new DataView(block.buffer, block.byteOffset, block.byteLength);

/** The 32-bit float with these bits. */
const f32FromBits = (bits: number): number => new Float32Array(Uint32Array.of(bits).buffer)[0];
/** The 64-bit float with these low and high words. */
const f64FromWords = (low: number, high: number): number => new Float64Array(Uint32Array.of(low, high).buffer)[0];

function invalid(location: string, reason: string): never {
  throw new SourceError('invalid-payload', location, reason);
}

function counted(observed: number, name: 'effectRecords' | 'missileTypes' | 'ringSegments', minimum: number, limit: number, location: string): number {
  if (observed < minimum || observed > limit) throw new SourceError('limit-exceeded', location, `must be ${minimum} to ${limit}`, { name, limit, observed });
  return observed;
}

function finite(value: number, location: string): number {
  if (!Number.isFinite(value)) invalid(location, 'a float is not finite');
  return value;
}

/** The regions of one Asset by use, with readers of their fields; each value is located at its region. */
class Regions {
  readonly #bytes: ReadonlyMap<string, Uint8Array>;
  readonly #at: ReadonlyMap<string, string>;

  constructor(bytes: ReadonlyMap<string, Uint8Array>, at: ReadonlyMap<string, string>) {
    this.#bytes = bytes;
    this.#at = at;
  }

  at(use: string): string {
    return this.#at.get(use)!;
  }

  view(use: string): DataView {
    return viewOf(this.#bytes.get(use)!);
  }

  words(use: string): Uint32Array {
    const view = this.view(use);
    return Uint32Array.from({ length: view.byteLength / 4 }, (_, index) => view.getUint32(index * 4, true));
  }

  /** The region's 32-bit floats, all finite, else `invalid-payload` at `location`. */
  floats(use: string, location = this.at(use)): Float32Array {
    const view = this.view(use);
    const values = Float32Array.from({ length: view.byteLength / 4 }, (_, index) => view.getFloat32(index * 4, true));
    if (!values.every(Number.isFinite)) invalid(location, 'a float is not finite');
    return values;
  }

  u32(use: string): number {
    return this.view(use).getUint32(0, true);
  }

  f32(use: string): number {
    return finite(this.view(use).getFloat32(0, true), this.at(use));
  }

  f64(use: string, index = 0): number {
    return finite(this.view(use).getFloat64(index * 8, true), this.at(use));
  }

  /** An immediate operand's 32 bits: an 8-bit operand is sign-extended, as the instruction does. */
  immediate(use: string): number {
    const view = this.view(use);
    return view.byteLength === 1 ? view.getInt8(0) >>> 0 : view.getUint32(0, true);
  }

  /** Three immediate operands taken as 32-bit floats, in argument order. */
  colour(prefix: string): EffectColour {
    const channel = (index: number) => finite(f32FromBits(this.immediate(`${prefix}-${index}`)), this.at(`${prefix}-${index}`));
    return Object.freeze([channel(0), channel(1), channel(2)] as const);
  }

  /** A face list template that must suit its shape, with (vertex, normal) pairs when `normals` is above 0, located at the template. */
  faces(use: string, vertices: number, normals: number, location: string): Uint32Array {
    const words = this.words(use);
    try {
      faceTriangles(words, vertices, normals, location);
    } catch (error) {
      if (error instanceof ContentContractError) invalid(location, error.reason);
      throw error;
    }
    return words;
  }
}

function projectilePayload({ bytes, relocations }: ArchiveEntryRead, regions: Regions, at: string): EffectPayload {
  if (bytes.length < RENS.headerBytes || !relocations.includes(RENS.pointer)) invalid(`${at}.source`, 'the RENS header has no record table pointer');
  const view = viewOf(bytes);
  const count = counted(view.getUint32(RENS.count, true), 'effectRecords', 1, EFFECT_LIMITS.effectRecords, `${at}.source`);
  // The record table directly follows the header and fills the rest of the entry.
  const pointer = view.getUint32(RENS.pointer, true);
  if (pointer !== RENS.headerBytes || bytes.length !== pointer + count * RENS.recordBytes) invalid(`${at}.source`, 'the RENS records do not fill the entry after the header');
  const records = Array.from({ length: count }, (_, index): ProjectileRecord => {
    const start = pointer + index * RENS.recordBytes;
    const location = `${at}.records[${index}]`;
    if (relocations.some(offset => offset + 4 > start && offset < start + RENS.recordBytes)) invalid(location, 'a RENS record holds a pointer');
    const f32 = (offset: number) => finite(view.getFloat32(start + offset, true), location);
    return Object.freeze({ selector: view.getUint32(start, true), width: f32(4), length: f32(8), colour: Object.freeze([f32(16), f32(20), f32(24)] as const) });
  });
  const template = (index: number): ProjectileTemplate => {
    const name = `template-${index}`;
    const location = `${at}.templates[${index}]`;
    return Object.freeze({
      faces: regions.faces(`${name}-faces`, S.projectileVertices, 0, location),
      vertices: regions.floats(`${name}-vertices`, location),
      widthMarkers: Uint32Array.from({ length: S.widthMarkers }, (_, marker) => regions.u32(`${name}-width-marker-${marker}`)),
      lengthMarker: regions.u32(`${name}-length-marker`),
      lengthConstant: regions.f64(`${name}-length-constant`),
    });
  };
  return Object.freeze({ kind: 'projectile', templates: Object.freeze([template(0), template(1)] as const), records: Object.freeze(records) });
}

function missileType(view: DataView, index: number, location: string): MissileType {
  const start = index * MISSILE_RECORD_BYTES;
  const f32 = (offset: number) => finite(view.getFloat32(start + offset, true), location);
  const colour = (offset: number) => {
    const packed = view.getUint32(start + offset, true);
    if (packed > EFFECT_LIMITS.packedColour) invalid(location, 'a packed colour exceeds 24 bits');
    return packed;
  };
  const parts = view.getUint32(start, true);
  if (parts < 1 || parts > EFFECT_LIMITS.missileParts) invalid(location, 'the part count must be 1 to 4');
  const segments = counted(view.getInt32(start + 0x28, true), 'ringSegments', EFFECT_LIMITS.minRingSegments, EFFECT_LIMITS.ringSegments, location);
  const body = Object.freeze({ r0: f32(0x1c), r1: f32(0x20), length: f32(0x24), segments, colour: colour(0x2c) });
  const fins = Array.from({ length: parts - 1 }, (_, fin): MissileFin => {
    const finAt = 0x30 + fin * 0x14;
    return Object.freeze({ params: Object.freeze([f32(finAt), f32(finAt + 4), f32(finAt + 8), f32(finAt + 12)] as const), colour: colour(finAt + 16) });
  });
  return Object.freeze({ parts, body, fins: Object.freeze(fins), element: Object.freeze([f32(0x6c), f32(0x70), f32(0x74)] as const), flag: f32(0x78) });
}

function missilePayload(regions: Regions, texture: AssetId, at: string): EffectPayload {
  const count = counted(regions.u32('type-count'), 'missileTypes', 1, EFFECT_LIMITS.missileTypes, regions.at('type-count'));
  const table = regions.view('types');
  if (table.byteLength !== count * MISSILE_RECORD_BYTES) invalid(regions.at('types'), 'the type table does not hold exactly the counted types');
  const template = (use: string, vertices: number, index: number) => regions.faces(use, vertices, 0, `${at}.templates[${index}]`);
  const constants = Object.freeze(Object.fromEntries(MISSILE_CONSTANTS.map((name, index) => [name, regions.f64('constants', index)])) as MissileConstants);
  const rotationScale = finite(f64FromWords(regions.immediate('rotation-scale-low'), regions.u32('rotation-scale-high')), regions.at('rotation-scale-high'));
  return Object.freeze({
    kind: 'missile',
    texture,
    types: Object.freeze(Array.from({ length: count }, (_, index) => missileType(table, index, `${at}.records[${index}]`))),
    faces: Object.freeze({
      fin: template('fin-faces', S.finVertices, 0),
      element: template('element-faces', S.elementVertices, 1),
      flaggedElement: template('flagged-element-faces', S.elementVertices, 2),
      extra: template('extra-faces', S.extraVertices, 3),
    }),
    constants,
    rotationScale,
    extraColour: regions.colour('extra-colour'),
  });
}

function debrisPayload(regions: Regions, texture: AssetId, at: string): EffectPayload {
  const template = (name: 'untextured' | 'textured', index: number): DebrisTemplate => {
    const location = `${at}.templates[${index}]`;
    return Object.freeze({
      faces: regions.faces(`${name}-faces`, S.debrisVertices, S.debrisNormals, location),
      vertices: regions.floats(`${name}-vertices`, location),
      perVertex: regions.words(`${name}-per-vertex`),
    });
  };
  const scales = (name: string, count: number) => Array.from({ length: count }, (_, index) => regions.f32(`${name}-scale-${index}`));
  return Object.freeze({
    kind: 'debris',
    texture,
    templates: Object.freeze([template('untextured', 0), template('textured', 1)] as const),
    untexturedScales: Object.freeze(scales('untextured', S.untexturedScales) as [number, number, number]),
    texturedScales: Object.freeze(scales('textured', S.texturedScales) as [number, number]),
    untexturedColour: regions.colour('untextured-colour'),
    texturedColour: regions.colour('textured-colour'),
  });
}

/**
 * Checks that a mapping has the parts its declaration's role needs: for projectiles one whole RENS entry of
 * `MAIN/SR.NOB` before the regions, otherwise only regions; and exactly one region per declared use, each with a
 * length the use accepts. Any other mapping is a declaration error. Returns the region locators in part order.
 */
function checkParts(declaration: EffectDeclaration, mapping: SourceMapping): readonly ExecutableRegionLocator[] {
  const at = `effects[${declaration.asset.id}]`;
  const entries = declaration.role === 'projectile' ? 1 : 0;
  const [first] = mapping.parts;
  if (entries === 1 && !first.alternatives.every(({ discPath, entry, subresource }) => discPath === EFFECT_ARCHIVE && entry?.type === 'RENS' && subresource === null)) {
    throw new SourceError('invalid-declaration', `${at}.source`, 'a projectile mapping must start with one whole RENS entry of the effect archive');
  }
  const regions = mapping.parts.slice(entries).map(({ alternatives: [locator] }) => locator);
  if (regions.length !== declaration.regions.length) {
    throw new SourceError('invalid-declaration', `${at}.source`, 'the mapping must have exactly one region per declared use');
  }
  const uses = EFFECT_REGION_USES[declaration.role];
  return regions.map((locator, index) => {
    if (!isRegionLocator(locator)) throw new SourceError('invalid-declaration', `${at}.source`, 'the mapping must have exactly one region per declared use');
    if (!uses.get(declaration.regions[index])!(executableRegion(locator).length)) {
      throw new SourceError('invalid-declaration', `${at}.regions[${index}]`, 'the region length does not suit its use');
    }
    return locator;
  });
}

/**
 * Runs the effect step. It pairs each declaration with exactly one mapping of the parts its role needs, verifies the
 * mappings (reading RENS entries; region locators are checked for coverage only), opens each executable once, reads
 * every region, checks the format rules and charges each Asset before encoding it. Only then are the mappings marked
 * verified. Failures are located under `effects`; P2-02 disc failures pass through unchanged. Any failure rejects the
 * whole step without results; reads already issued stay charged to the source.
 */
export async function runEffectStep(
  source: VerifiedSource,
  mappings: unknown,
  declarations: unknown,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
): Promise<EffectStepResult> {
  const checked = readEffectDeclarations(declarations);
  const checkedLimits = readBudgetRecord(limits, 'limits');
  let current = readConversionUsage(usage);
  const table = readSourceMappingTable(mappings);
  const mappingById = new Map<string, SourceMapping>(table.mappings.map(mapping => [mapping.asset.id, mapping]));
  checked.forEach(({ asset }, index) => {
    if (!mappingById.has(asset.id)) throw new SourceError('invalid-declaration', `effects.declarations[${index}]`, 'the Asset has no source mapping');
  });
  if (table.mappings.length !== checked.length) throw new SourceError('invalid-declaration', 'effects.declarations', 'every mapped Asset must be declared');
  const ordered = [...checked].sort((left, right) => compareText(left.asset.id, right.asset.id));
  const regionLocators = new Map(ordered.map(declaration => [declaration.asset.id, checkParts(declaration, mappingById.get(declaration.asset.id)!)]));

  const readEntry = stepEntryReader(source);
  // Verification binds the source fingerprint; region mappings stay declared until the regions below are read.
  const bound = await verifySourceMappings(table, source, readEntry);
  const executables = new Map<string, Promise<LeExecutable>>();
  const openExecutable = (discPath: string, at: string): Promise<LeExecutable> => {
    let executable = executables.get(discPath);
    if (!executable) {
      executable = source.openFile(discPath).then(file => openLeExecutable({ byteLength: file.entry.byteLength, read: (offset, length) => file.read(offset, length) }, at));
      executables.set(discPath, executable);
    }
    return executable;
  };

  const assets: { readonly id: AssetId; readonly role: string; readonly payload: EffectPayload }[] = [];
  for (const declaration of ordered) {
    const { asset: { id }, role, texture } = declaration;
    const at = `effects[${id}]`;
    const locators = regionLocators.get(id)!;
    const locations = declaration.regions.map((_, index) => `${at}.regions[${index}]`);
    const read = await Promise.all(locators.map(async (locator, index) =>
      (await openExecutable(locator.discPath, `${at}.source`)).readRegion(executableRegion(locator), locations[index])));
    const regions = new Regions(
      new Map(declaration.regions.map((use, index) => [use, read[index]])),
      new Map(declaration.regions.map((use, index) => [use, locations[index]])),
    );
    let payload: EffectPayload;
    switch (role) {
      case 'projectile':
        payload = projectilePayload(await readEntry(archiveLocator(mappingById.get(id)!.parts[0].alternatives[0])), regions, at);
        break;
      case 'missile':
        payload = missilePayload(regions, texture!, at);
        break;
      case 'debris':
        payload = debrisPayload(regions, texture!, at);
        break;
    }
    assets.push({ id, role, payload });
  }

  const converted = assets.map(({ id, role, payload }) => {
    const dependencies = effectReferences(payload);
    const size = effectExpansionSize(payload);
    current = chargeConversionBudget(checkedLimits, current, {
      assets: 1, dependencyEdges: dependencies.length, payloadBytes: effectPayloadLength(payload), vertices: size.vertices, triangles: size.triangles,
    }, `effects[${id}]`);
    const encoded = encodeEffectPayload(payload, `effects[${id}]`);
    const payloadIdentity = { schemaVersion: EFFECT_PAYLOAD_SCHEMA_VERSION, byteLength: encoded.length, fingerprint: sha256Fingerprint(encoded) };
    const descriptor = readAssetDescriptor({ id, kind: 'data', role, group: 'models', dependencies, payloadIdentity });
    checkEffectBinding(descriptor, payload);
    return { descriptor, payload: Object.freeze({ id, schemaVersion: EFFECT_PAYLOAD_SCHEMA_VERSION, bytes: encoded }) };
  });

  const verified = readSourceMappingTable({ ...bound, mappings: bound.mappings.map(mapping => ({ ...mapping, resolution: 'verified' })) });
  const stateById = new Map<string, AssetSourceState>(assetSourceStates(verified).states.map(state => [state.id, state]));
  const groups = converted.length === 0 ? [] : [Object.freeze({
    group: 'models' as const,
    descriptors: Object.freeze(converted.map(({ descriptor }) => descriptor)),
    payloads: Object.freeze(converted.map(({ payload }) => payload)),
    sources: Object.freeze(converted.map(({ descriptor }) => stateById.get(descriptor.id)!)),
  })];
  return Object.freeze({ groups: Object.freeze(groups), usage: current });
}

