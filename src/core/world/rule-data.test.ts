import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { MARKER as CRAFT_INFO_MARKER, debrisRecord, gun, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { CoreInputError } from '../errors.ts';
import { createWorld, initialWorldState } from './create-world.ts';
import { programRecord } from '../rules/steering.ts';
import { STARTUP_ROTATIONS } from '../rules/startup-rotations.ts';
import {
  aiProgramsContent, animationContent, animationId, asCreateInput, craftInfoContent, debrisContent, declaration, MARKER, modelContent, modelOf,
  originalImportIdentity, playerOnlyMission, projectileVisualsContent, rosterContent, ruleInputs, worldInput, type CraftInfoDraft, type WorldInputParts,
} from './create-world.test-support.ts';
import { RULE_DATA_LIMITS } from './rule-data.ts';
import { thrownBy } from './world.test-support.ts';

// World creation's rule-data inputs and static rule data (docs/plan/p3/02/spec.md, CR-01; P3-07 AC-02). Synthetic
// content only; expectations follow from CR-01 and craft.md, not from the code under test.

type Input = ReturnType<typeof worldInput>;
type Asset = { id: unknown; content: Record<string, unknown> };
type Lists = { animation: { id: string }; sound: unknown }[][];

const CRAFT_INFO = 'input.craftInfo.content';
const DEBRIS = 'input.debrisParameters.content';
const EXPLOSIONS = 'input.explosions.content';
const AI_PROGRAMS = 'input.aiPrograms.content';

/** The default creation input after `change`. */
function inputWith(change: (input: Input & Record<string, unknown>) => void, parts: WorldInputParts = {}): Input {
  const input = worldInput(parts);
  change(input as Input & Record<string, unknown>);
  return input;
}

const asset = (input: Input, field: 'debrisParameters' | 'projectileVisuals' | 'explosions' | 'aiPrograms') => input[field] as unknown as Asset;
const listsOf = (input: Input) => asset(input, 'explosions').content.lists as Lists;
const models = (input: Input) => input.models as { id: string; content: ReturnType<typeof modelContent> }[];
const animations = (input: Input) => input.explosionAnimations as { id: string; content: ReturnType<typeof animationContent> }[];
const create = (input: unknown) => initialWorldState(asCreateInput(input));

/** Craft info input after `change`. */
function craftInfoWith(change: (info: CraftInfoDraft) => void): CraftInfoDraft {
  const info = craftInfoContent();
  change(info);
  return info;
}

/** Asserts that creation throws `type` at `path`, naming no imported value. */
function expectRejected(input: unknown, path: string, reason?: string, type: new (...args: never[]) => Error = CoreInputError): Error {
  const error = thrownBy(() => createWorld(asCreateInput(input)));
  expect(error).toBeInstanceOf(type);
  expect(error).toMatchObject({ path });
  if (reason !== undefined) expect((error as CoreInputError).reason).toContain(reason);
  expect((error as Error).message).not.toContain(MARKER);
  expect((error as Error).message).not.toContain(CRAFT_INFO_MARKER);
  return error as Error;
}

/** Asserts that creation succeeds. */
const expectAccepted = (input: unknown) => expect(() => createWorld(asCreateInput(input))).not.toThrow();

describe('rule-data inputs (CR-01): reading and extraction', () => {
  it('keeps the IDs, the projectile lengths, the animation references, frame counts and part counts, frozen', () => {
    const { ruleData } = create(worldInput());
    const { inputs } = ruleData;
    expect(inputs.debrisParameters.id).toBe('data/debris-parameters');
    expect(inputs.debrisParameters.content).toEqual(debrisContent());
    expect(inputs.projectileVisuals).toEqual({ id: 'data/projectile-visuals', lengths: [1.5, 6] });
    expect(inputs.explosions).toEqual({ id: 'data/explosions', lists: [[animationId(2), animationId(1)], [animationId(3), animationId(2)], [animationId(4)]] });
    expect(inputs.explosionAnimations).toEqual([1, 2, 3, 4].map((number) => ({ id: animationId(number), frames: number === 4 ? 6 : 12 })));
    // The slice-shaped mission instantiates kinds 0, 7, 8, 14 and 17; the parts follow the synthetic DEBRIS counts.
    expect(inputs.models).toEqual([[0, 4], [14, 0], [17, 3], [7, 2], [8, 3]].map(([kindBit, parts]) => ({ id: modelOf(kindBit), parts })));
    expect(inputs.aiPrograms).toEqual({ id: 'data/ai-programs', content: aiProgramsContent() });
    expect(deepFrozen(ruleData)).toBe(true);
  });

  it('keeps nothing of the input: changing it afterwards, typed arrays included, changes no world', () => {
    const input = worldInput();
    const state = create(input);
    const before = structuredClone(state.ruleData);
    (asset(input, 'projectileVisuals').content.records as { length: number }[])[1].length = 99;
    listsOf(input)[0].reverse();
    animations(input)[0].content.frames.pop();
    models(input)[0].content.partLists[1].pop();
    (asset(input, 'debrisParameters').content.byCraftType as { at00: number[] }[][])[0][0].at00[0] = 50;
    const builtIn = asset(input, 'aiPrograms').content.builtInPrograms as { at14: number; at24: number }[];
    builtIn[1].at14 = 99;
    builtIn[2].at24 = 7;
    (asset(input, 'aiPrograms').content.globals as { at08: number }).at08 = 1;
    const typed = Float32Array.of(1, 2);
    const withTyped = worldInput();
    (models(withTyped)[0].content as Record<string, unknown>).geometries = [{ positions: typed }];
    const typedState = create(withTyped);
    typed[0] = 9;
    expect(state.ruleData).toEqual(before);
    expect(typedState.ruleData).toEqual(before);
  });

  it('requires the nine fields, each exactly { id, content }', () => {
    for (const field of ['debrisParameters', 'projectileVisuals', 'explosions', 'explosionAnimations', 'models', 'aiPrograms', 'commMenus', 'baseRepairItems', 'commMessages'] as const) {
      expectRejected(inputWith((input) => void Reflect.deleteProperty(input, field)), `input.${field}`, 'is required');
    }
    expectRejected(inputWith((input) => void (input.extra = {})), 'input', 'contains unknown fields');
    expectRejected(inputWith((input) => void Reflect.deleteProperty(input.debrisParameters, 'content')), 'input.debrisParameters.content', 'is required');
    expectRejected(inputWith((input) => void ((input.explosions as Record<string, unknown>).extra = 1)), 'input.explosions', 'contains unknown fields');
    expectRejected(inputWith((input) => void Reflect.deleteProperty(input.aiPrograms, 'id')), 'input.aiPrograms.id', 'is required');
    expectRejected(inputWith((input) => void ((input.models as Record<string, unknown>[])[0].extra = 1)), 'input.models[0]', 'contains unknown fields');
    expectRejected(inputWith((input) => void (input.explosionAnimations = {} as never)), 'input.explosionAnimations', 'must be an array');
  });

  it('checks Asset IDs: malformed keeps the content error; data for the five data inputs, model for the models', () => {
    expectRejected(inputWith((input) => void (asset(input, 'explosions').id = 'Data/Bad')), 'input.explosions.id', undefined, ContentContractError);
    expectRejected(inputWith((input) => void (asset(input, 'debrisParameters').id = 'model/debris-parameters')), 'input.debrisParameters.id', 'must be a data Asset ID');
    expectRejected(inputWith((input) => void (asset(input, 'aiPrograms').id = 'model/ai-programs')), 'input.aiPrograms.id', 'must be a data Asset ID');
    expectRejected(inputWith((input) => void (asset(input, 'aiPrograms').id = 'data/AI')), 'input.aiPrograms.id', undefined, ContentContractError);
    expectRejected(inputWith((input) => void (animations(input)[0].id = 'image/explosion-animation/01')), 'input.explosionAnimations[0].id', 'must be a data Asset ID');
    expectRejected(inputWith((input) => void (models(input)[0].id = 'data/craft-0')), 'input.models[0].id', 'must be a model Asset ID');
  });

  it('takes only the production Assets for original-import content, and any data Asset for synthetic content', () => {
    const renamed = (field: 'debrisParameters' | 'projectileVisuals' | 'explosions' | 'aiPrograms') => (input: Input) => void (asset(input, field).id = 'data/other');
    for (const field of ['debrisParameters', 'projectileVisuals', 'explosions', 'aiPrograms'] as const) {
      expectAccepted(inputWith(renamed(field)));
      expectRejected(inputWith(renamed(field), { identity: originalImportIdentity() }), `input.${field}.id`, 'must be the production Asset');
    }
    const otherAnimations = (input: Input) => {
      animations(input).forEach((animation) => void (animation.id = animation.id.replace('explosion-animation', 'other-animation')));
      for (const list of listsOf(input)) for (const entry of list) entry.animation.id = entry.animation.id.replace('explosion-animation', 'other-animation');
    };
    expectAccepted(inputWith(otherAnimations));
    expectRejected(inputWith(otherAnimations, { identity: originalImportIdentity() }), 'input.explosionAnimations[0].id', 'must be the production Asset');
    // Production animations are numbered with two digits from 01.
    for (const [index, entry, id] of [
      [0, [0, 1], 'data/explosion-animation/00'],
      [3, [2, 0], 'data/explosion-animation/100'],
      [3, [2, 0], 'data/explosion-animation/1'],
      [3, [2, 0], 'data/explosion-animation/04/a'],
    ] as const) {
      const renumbered = (input: Input) => {
        animations(input)[index].id = id;
        listsOf(input)[entry[0]][entry[1]].animation.id = id;
      };
      expectAccepted(inputWith(renumbered));
      expectRejected(inputWith(renumbered, { identity: originalImportIdentity() }), `input.explosionAnimations[${index}].id`, 'must be the production Asset');
    }
    expectAccepted(inputWith((input) => {
      animations(input)[3].id = 'data/explosion-animation/99';
      listsOf(input)[2][0].animation.id = 'data/explosion-animation/99';
    }, { identity: originalImportIdentity() }));
    expectAccepted(worldInput({ identity: originalImportIdentity() }));
  });

  it('keeps the content readers\' ContentContractError for the debris parameters, the table, the animations and the AI programs', () => {
    expectRejected(inputWith((input) => void ((asset(input, 'debrisParameters').content.byCraftType as unknown[]).pop())), `${DEBRIS}.byCraftType`, undefined, ContentContractError);
    expectRejected(inputWith((input) => void (listsOf(input)[0][0].sound = { id: 'sound/x', kind: 'image' })), `${EXPLOSIONS}.lists[0][0].sound.kind`, undefined, ContentContractError);
    expectRejected(inputWith((input) => void (animations(input)[1].content.frames = [])), 'input.explosionAnimations[1].content.frames', undefined, ContentContractError);
    expectRejected(inputWith((input) => void ((asset(input, 'aiPrograms').content.programs as { parameters: number }[])[0].parameters = 1)),
      `${AI_PROGRAMS}.programs[0].parameters`, undefined, ContentContractError);
  });

  it('reads of the projectile visuals only the kind and each record\'s finite f32 length', () => {
    const at = 'input.projectileVisuals.content';
    const visuals = (change: (content: ReturnType<typeof projectileVisualsContent>) => void) => inputWith((input) => change(asset(input, 'projectileVisuals').content as never));
    expectRejected(visuals((content) => void (content.kind = 'missile')), `${at}.kind`, 'must be projectile');
    expectRejected(visuals((content) => void (content.records[1].length = 0.1)), `${at}.records[1].length`, 'must be a finite f32 value');
    expectRejected(visuals((content) => void (content.records[0].length = Number.POSITIVE_INFINITY)), `${at}.records[0].length`);
    expectRejected(visuals((content) => void Reflect.deleteProperty(content.records[0], 'length')), `${at}.records[0].length`, 'must be a finite f32 value');
    expectRejected(visuals((content) => void ((content as Record<string, unknown>).extra = 1)), at, 'contains unknown fields');
    // Selectors, widths, colours and templates are not read.
    expectAccepted(visuals((content) => {
      content.records[0] = { selector: -1, width: Number.NaN, length: 2, colour: [] as unknown as number[] };
      content.templates = 'unread' as never;
    }));
  });

  it(`takes ${RULE_DATA_LIMITS.projectileRecords} projectile records and rejects one more before reading any`, () => {
    const lengths = (count: number) => Array.from({ length: count }, () => 1);
    expectAccepted(worldInput({ projectileVisuals: projectileVisualsContent(lengths(RULE_DATA_LIMITS.projectileRecords)) }));
    const over = projectileVisualsContent(lengths(RULE_DATA_LIMITS.projectileRecords + 1));
    over.records.forEach((record) => void (record.length = Number.NaN));
    expectRejected(worldInput({ projectileVisuals: over }), 'input.projectileVisuals.content.records', `must have at most ${RULE_DATA_LIMITS.projectileRecords} items`);
  });

  it('reads of a model only the kind and the length of part list 1, at most 256 parts', () => {
    const model = (change: (content: ReturnType<typeof modelContent>) => void) => inputWith((input) => change(models(input)[0].content));
    const at = 'input.models[0].content';
    expectRejected(model((content) => void (content.kind = 'image')), `${at}.kind`, 'must be model');
    expectRejected(model((content) => void content.partLists.pop()), `${at}.partLists`, 'must have 3 part lists');
    expectRejected(model((content) => void (content.partLists[1] = 'parts' as never)), `${at}.partLists[1]`, 'must be an array');
    expectAccepted(model((content) => {
      content.partLists[0] = 'unread' as never;
      content.partLists[1] = content.partLists[1].map(() => 'unread') as never;
      content.geometries = 'unread' as never;
    }));
    const parts = (count: number) => (content: ReturnType<typeof modelContent>) => void (content.partLists[1] = Array.from({ length: count }, () => null) as never);
    // At the limit the DEBRIS mapping rejects it; one more is a limit error before the parts are read.
    expectRejected(model(parts(RULE_DATA_LIMITS.modelParts)), `${DEBRIS}.byCraftType[0]`);
    expectRejected(model(parts(RULE_DATA_LIMITS.modelParts + 1)), `${at}.partLists[1]`, `must have at most ${RULE_DATA_LIMITS.modelParts} items`);
  });

  it('takes the animations and models in strictly ascending ID order, within their limits', () => {
    expectRejected(inputWith((input) => void animations(input).reverse()), 'input.explosionAnimations[1].id', 'strictly ascending');
    expectRejected(inputWith((input) => void models(input).splice(1, 0, models(input)[0])), 'input.models[1].id', 'strictly ascending');
    const many = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `data/explosion-animation/${index}`, content: null }));
    expectRejected(worldInput({ explosionAnimations: many(RULE_DATA_LIMITS.explosionAnimations + 1) }), 'input.explosionAnimations', `must have at most ${RULE_DATA_LIMITS.explosionAnimations} items`);
    expectRejected(worldInput({ explosionAnimations: many(RULE_DATA_LIMITS.explosionAnimations) }), 'input.explosionAnimations[0].content', undefined, ContentContractError);
    const modelList = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `model/m-${String(index).padStart(2, '0')}`, content: modelContent(0) }));
    expectRejected(worldInput({ models: modelList(RULE_DATA_LIMITS.models + 1) }), 'input.models', `must have at most ${RULE_DATA_LIMITS.models} items`);
    expectRejected(worldInput({ models: modelList(RULE_DATA_LIMITS.models) }), 'input.mission.content.declarations[0].craftType', 'binds a model missing');
  });
});

describe('rule-data inputs (CR-01): complete sets', () => {
  it('requires exactly the animations the explosion table names', () => {
    expectRejected(inputWith((input) => void animations(input).push({ id: animationId(5), content: animationContent(12) })), 'input.explosionAnimations[4].id', 'is not an animation the explosion table names');
    expectRejected(inputWith((input) => void animations(input).splice(2, 1)), `${EXPLOSIONS}.lists[1][0].animation`, 'missing from input.explosionAnimations');
  });

  it('requires exactly the models of the craft the run instantiates: records, group members and the selected wingman', () => {
    expectRejected(inputWith((input) => void models(input).splice(3, 1)), 'input.mission.content.declarations[3].craftType', 'binds a model missing from input.models');
    expectRejected(inputWith((input) => void models(input).push({ id: 'model/extra', content: modelContent(0) })), 'input.models[5].id', 'is not the model of an instantiable craft');
    // The roster binds kind 1, but without a wingman nothing instantiates it.
    expect(create(worldInput()).ruleData.inputs.models.map(({ id }) => id)).not.toContain(modelOf(1));
    expect(create(worldInput({ run: { wingman: 3 } })).ruleData.inputs.models.map(({ id }) => id)).toContain(modelOf(1));
    const withWingman = worldInput({ run: { wingman: 3 } });
    withWingman.run.wingman = null;
    expectRejected(withWingman, `input.models[${models(withWingman).findIndex(({ id }) => id === modelOf(1))}].id`, 'is not the model of an instantiable craft');
  });

  it('does not require the models of records that post no request', () => {
    const mission = playerOnlyMission();
    // A craft count of 2^32 − 1 is −1 as i32: no request.
    mission.declarations.push(declaration(1, { craftType: 7, ruleInputs: ruleInputs({ craftCount: 0xffffffff }) }));
    expect(create(worldInput({ mission })).ruleData.inputs.models.map(({ id }) => id)).toEqual([modelOf(0)]);
  });
});

describe('rule-data inputs (CR-01): semantic checks', () => {
  it('requires equal frame counts in lists 1 and 2 together and in list 3, both lists 1 and 2 non-empty', () => {
    expectRejected(inputWith((input) => void (animations(input)[2].content = animationContent(11))), `${EXPLOSIONS}.lists[1][0].animation`, 'as many frames');
    expectRejected(inputWith((input) => void (animations(input)[0].content = animationContent(6))), `${EXPLOSIONS}.lists[0][1].animation`, 'as many frames');
    expectRejected(inputWith((input) => {
      listsOf(input)[2].push({ ...listsOf(input)[0][0] });
    }), `${EXPLOSIONS}.lists[2][1].animation`, 'as many frames');
    expectRejected(inputWith((input) => {
      listsOf(input)[1] = [];
      animations(input).splice(2, 1);
    }), `${EXPLOSIONS}.lists[1]`, 'must not be empty');
    // n₁₂ and n₃ come out as the static data.
    expect(create(worldInput()).ruleData.explosionFrames).toEqual({ lists12: 12, list3: 6 });
  });

  it('requires list 3 only while an instantiable craft has a missile mount', () => {
    const noList3 = (input: Input) => {
      listsOf(input)[2] = [];
      animations(input).pop();
    };
    expectRejected(inputWith(noList3), `${EXPLOSIONS}.lists[2]`, 'missile mount');
    const unarmed = craftInfoWith((info) => {
      info.craft[0].mounts = [];
      info.craft[0].mountLists = [[], [], []];
    });
    expect(create(inputWith(noList3, { craftInfo: unarmed })).ruleData.explosionFrames).toEqual({ lists12: 12, list3: null });
  });

  it('maps DEBRIS records to the model\'s parts: c − 3 for kinds 1 and 2, which need a part, c for others', () => {
    const debris = (change: (content: ReturnType<typeof debrisContent>) => void) => {
      const content = debrisContent();
      change(content);
      return content;
    };
    // Kind bit 7: two records for its two parts; a third record, or one fewer, does not match.
    expectRejected(worldInput({ debrisParameters: debris((content) => void content.byCraftType[7].push(debrisRecord())), models: worldInput().models }), `${DEBRIS}.byCraftType[7]`, 'one record per part');
    expectRejected(worldInput({ debrisParameters: debris((content) => void content.byCraftType[7].pop()), models: worldInput().models }), `${DEBRIS}.byCraftType[7]`);
    // The player: max(c − 3, 0) records, so two or three parts need none; no part at all is rejected.
    const player = (parts: number) => inputWith((input) => {
      (asset(input, 'debrisParameters').content.byCraftType as unknown[][])[0] = [];
      models(input)[0].content = modelContent(parts);
    });
    expectAccepted(player(3));
    expectAccepted(player(1));
    expectRejected(player(0), 'input.models[0].content.partLists[1]', 'escape pod');
    // A kind no record instantiates is not read.
    expectAccepted(worldInput({ debrisParameters: debris((content) => void (content.byCraftType[19] = [])) }));
  });

  it('requires a projectile length for every non-automatic gun mount of an instantiable craft', () => {
    // The player's mount 1 fires gun 1, which is fixed; mount 0's gun 0 is automatic.
    expectRejected(worldInput({ projectileVisuals: projectileVisualsContent([1.5]) }), `${CRAFT_INFO}.craft[0].mounts[1].weapon`, 'without a projectile record length');
    const automatic = craftInfoWith((info) => void (info.guns[1].at28 = 2));
    expectAccepted(worldInput({ craftInfo: automatic, projectileVisuals: projectileVisualsContent([]) }));
    // Kind 19, which mounts the fixed gun 2 without a record, is never instantiated.
    const unread = craftInfoWith((info) => {
      info.guns.push(gun({ at28: 0 }) as never);
      info.craft[19].mounts = [mount({ weapon: 2 })];
    });
    expectAccepted(worldInput({ craftInfo: unread }));
  });

  it('rejects mount link cycles and the two arrangements whose tried flags outlive a call (W5)', () => {
    const mounts = (change: (info: CraftInfoDraft) => void) => worldInput({ craftInfo: craftInfoWith(change) });
    const at = `${CRAFT_INFO}.craft[0]`;
    expectRejected(mounts((info) => void (info.craft[0].mounts[2].at18 = 1)), `${at}.mounts[1].at18`, 'cycle');
    expectRejected(mounts((info) => void (info.craft[0].mounts[0].at1C = 0)), `${at}.mounts[0].at1C`, 'cycle');
    // List 0's second entry, mount 1, also alternating.
    expectRejected(mounts((info) => void (info.craft[0].mounts[1].at1C = 0)), `${at}.mountLists[0][1]`, 'both links');
    // Mount 1 fires together with mount 2, which alternates with mount 0.
    expectRejected(mounts((info) => void (info.craft[0].mounts[2].at1C = 0)), `${at}.mountLists[0][1]`, 'later group alternates');
    // A head that only alternates, and alternates that fire together, are fine.
    expectAccepted(mounts((info) => {
      info.craft[0].mounts[1].at18 = null;
      info.craft[0].mounts[1].at1C = 2;
      info.craft[0].mounts[2].at18 = 0;
    }));
  });

  it('checks the divisors of instantiable kinds: the player\'s c9C and c5C, a shield\'s c60, aimed guns and blast falloffs', () => {
    const at = (kindBit: number) => `${CRAFT_INFO}.craft[${kindBit}]`;
    const changed = (change: (info: CraftInfoDraft) => void) => worldInput({ craftInfo: craftInfoWith(change) });
    expectRejected(changed((info) => void (info.craft[0].at9C = 0)), `${at(0)}.at9C`, 'must be positive');
    expectRejected(changed((info) => void (info.craft[0].at5C = 0)), `${at(0)}.at5C`, 'must be positive');
    expectRejected(changed((info) => void (info.craft[7].at60 = 0)), `${at(7)}.at60`, 'must not be 0');
    expectRejected(changed((info) => void (info.craft[7].at60 = 0x800000)), `${at(7)}.at60`, 'overflows i32');
    expectAccepted(changed((info) => Object.assign(info.craft[7], { at5C: 0, at60: 0 })));
    expectAccepted(changed((info) => void (info.craft[19].at60 = 0)));
    expectRejected(changed((info) => Object.assign(info.guns[1], { at28: 1, at08: 0 })), `${CRAFT_INFO}.guns[1].at08`, 'aimed gun');
    expectRejected(changed((info) => void (info.missiles[1].at64 = info.missiles[1].at60)), `${CRAFT_INFO}.missiles[1].at64`, 'must differ from at60');
    // Missile 0 is on no mount.
    expectAccepted(changed((info) => void (info.missiles[0].at64 = info.missiles[0].at60)));
  });

  it('bounds +0x14 of reachable guns to 0–32', () => {
    const cooldown = (value: number) => worldInput({ craftInfo: craftInfoWith((info) => void (info.guns[0].at14 = value)) });
    expectAccepted(cooldown(0));
    expectAccepted(cooldown(32));
    expectRejected(cooldown(-1), `${CRAFT_INFO}.guns[0].at14`, '0 to 32');
    expectRejected(cooldown(33), `${CRAFT_INFO}.guns[0].at14`, '0 to 32');
    expectAccepted(worldInput({ craftInfo: craftInfoWith((info) => void info.guns.push(gun({ at14: 99 }) as never)) }));
  });

  it('rejects a negative +0x24, the projectile lifetime, of reachable guns', () => {
    const lifetime = (gunIndex: number, value: number) => worldInput({ craftInfo: craftInfoWith((info) => void (info.guns[gunIndex].at24 = value)) });
    expectAccepted(lifetime(0, 0));
    expectAccepted(lifetime(1, 0x7fff));
    expectRejected(lifetime(0, -1), `${CRAFT_INFO}.guns[0].at24`, 'must not be negative');
    expectRejected(lifetime(1, -0x8000_0000), `${CRAFT_INFO}.guns[1].at24`, 'must not be negative');
    // A gun no instantiable craft mounts is not read.
    expectAccepted(worldInput({ craftInfo: craftInfoWith((info) => void info.guns.push(gun({ at24: -1 }) as never)) }));
  });

  it('rejects the guidance times of reachable missiles that the first callback would fault on (P3-07/24)', () => {
    const missiles = (change: (info: CraftInfoDraft) => void) => worldInput({ craftInfo: craftInfoWith(change) });
    // +0x44 is the one guidance time the content reads as an i32, so the one that can be negative.
    expectAccepted(missiles((info) => Object.assign(info.missiles[1], { at44: 0, at48: 0, at54: 0 })));
    expectAccepted(missiles((info) => Object.assign(info.missiles[1], { at44: 0x7fffffff, at48: 0x7fffffff, at54: 0xffffffff, at58: -0x8000_0000 })));
    expectRejected(missiles((info) => void (info.missiles[1].at44 = -1)), `${CRAFT_INFO}.missiles[1].at44`, 'must not be negative, as it is the lifetime');
    expectRejected(missiles((info) => void (info.missiles[1].at44 = -0x8000_0000)), `${CRAFT_INFO}.missiles[1].at44`, 'must not be negative');
    // The content reader already holds +0x48 non-negative, +0x54 to u32 and +0x58 to i32.
    expectRejected(missiles((info) => void (info.missiles[1].at48 = -1)), `${CRAFT_INFO}.missiles[1].at48`, undefined, ContentContractError);
    expectRejected(missiles((info) => void (info.missiles[1].at54 = -1)), `${CRAFT_INFO}.missiles[1].at54`, undefined, ContentContractError);
    expectRejected(missiles((info) => void (info.missiles[1].at58 = 2 ** 31)), `${CRAFT_INFO}.missiles[1].at58`, undefined, ContentContractError);
    // Missile 0 is on no mount.
    expectAccepted(missiles((info) => void (info.missiles[0].at44 = -1)));
  });

  it('rejects i32 overflow of the hull and the resources at an instantiable record\'s percentages', () => {
    const record = 'input.mission.content.declarations[3]';
    const hull = worldInput({ craftInfo: craftInfoWith((info) => void (info.craft[7].at9C = 0x7fffffff)) });
    expectAccepted(hull);
    const overHull = inputWith((input) => void ((input.mission.content as { declarations: { ruleInputs: Record<string, number> }[] }).declarations[3].ruleInputs.percentB = 101),
      { craftInfo: craftInfoWith((info) => void (info.craft[7].at9C = 0x7fffffff)) });
    expectRejected(overHull, `${record}.ruleInputs.percentB`, 'hull');
    // The charge: c74 × 100.
    const charge = worldInput({ craftInfo: craftInfoWith((info) => void (info.craft[7].at74 = 30_000_000)) });
    expectRejected(charge, `${record}.ruleInputs`, 'resources');
    const allocation = worldInput({ craftInfo: craftInfoWith((info) => void (info.craft[8].at64[0] = 0x7fffffff)) });
    expectRejected(allocation, 'input.mission.content.declarations[6].ruleInputs', 'resources');
    // The wingman's record, when selected.
    const roster = rosterContent();
    roster.options[1].ruleInputs = ruleInputs({ percentC: 0x7fffffff });
    expectAccepted(worldInput({ roster }));
    expectRejected(worldInput({ roster, run: { wingman: 1 } }), 'input.wingmanRoster.content.options[1].ruleInputs', 'resources');
  });

  it('rejects derived values outside the f32 range: a lengthened mount, a range, a box radius', () => {
    const large = Math.fround(3.4e38);
    expectRejected(worldInput({ projectileVisuals: projectileVisualsContent([1, large]), craftInfo: craftInfoWith((info) => void (info.craft[0].mounts[1].at00[2] = large)) }),
      `${CRAFT_INFO}.craft[0].mounts[1].at00`, 'f32 range');
    expectRejected(worldInput({ craftInfo: craftInfoWith((info) => Object.assign(info.guns[1], { at24: 0x7fffffff, at08: large })) }), `${CRAFT_INFO}.guns[1].at24`, 'f32 range');
    expectRejected(worldInput({ craftInfo: craftInfoWith((info) => void (info.craft[0].collision.boxes[0].upper = [large, large, large])) }), `${CRAFT_INFO}.craft[0].collision`, 'f32 range');
  });
});

describe('static rule data (CR-01)', () => {
  it('holds the load transforms of the reachable records and nothing for the others', () => {
    const { ruleData } = create(worldInput());
    // Both guns are mounted by the player, missile 1 only.
    expect(ruleData.guns).toEqual([{ range: 1.5625, rangeSquared: 2.44140625 }, { range: 1.5625, rangeSquared: 2.44140625 }]);
    // Missile 1: lifetime 320 × 1/64 × body 1's +0xB8 64 = 320; fuse 1.75² = 3.0625.
    expect(ruleData.missiles).toEqual([null, { range: 320, rangeSquared: 102_400, fuseRadiusSquared: 3.0625 }]);
    expect(ruleData.craft.map((craft, kindBit) => (craft === null ? null : kindBit)).filter((kindBit) => kindBit !== null)).toEqual([0, 7, 8, 14, 17]);
    const player = ruleData.craft[0]!;
    // Boxes (−1, −2, −3)–(1, 2, 3) and (−5, −5, −5)–(0, 0, 0): r = √75, the inner box from +0x2C.
    expect(player.shape).toMatchObject({ radius: Math.fround(Math.sqrt(75)), innerBox: { lower: { x: -1, y: -1, z: -1 }, upper: { x: 1, y: 1, z: 1 } } });
    // Mount 0 fires the automatic gun 0, mount 1 the fixed gun 1 (half of 6 for the player), mount 2 a missile.
    expect(player.mountOffsets).toEqual([{ x: 0.5, y: -1, z: 2 }, { x: 0.5, y: -1, z: 5 }, { x: 0.5, y: -1, z: 2 }]);
    expect(player.parts).toBe(4);
    expect(player.debris).toHaveLength(1);
    expect(player.debris[0].weights).toEqual({ x: -0, y: -0, z: 1 });
    expect(ruleData.craft[14]).toMatchObject({ parts: 0, debris: [] });
    expect(ruleData.craft[7]!.shape).toMatchObject({ radius: 4, radiusSquared: 16 });
  });

  it('holds the 64 start-up rotations, the code rule\'s frozen table, the same in every world and outside snapshots (MW-01)', () => {
    const { ruleData } = create(worldInput());
    expect(ruleData.startupRotations).toBe(STARTUP_ROTATIONS);
    expect(ruleData.startupRotations).toHaveLength(64);
    expect(deepFrozen(ruleData.startupRotations)).toBe(true);
    expect(create(worldInput({ run: { wingman: 3 } })).ruleData.startupRotations).toBe(STARTUP_ROTATIONS);
    expect(Object.keys(createWorld(asCreateInput(worldInput())).snapshot().state)).not.toContain('ruleData');
  });
});

describe('AI program input (CR-01): the homing missiles\' programs', () => {
  type BuiltIn = { at14: number; at24: number; at2C: number };
  /** The default input with built-in records changed by `change`, other parts as given. */
  const builtIn = (change: (records: BuiltIn[]) => void, parts: WorldInputParts = {}) => {
    const content = aiProgramsContent();
    change(content.builtInPrograms as BuiltIn[]);
    return worldInput({ ...parts, aiPrograms: content });
  };
  const at = (record: number, field: string) => `${AI_PROGRAMS}.builtInPrograms[${record}].${field}`;

  it('copies built-in records 1 and 2\'s period, angle and saturation, by the record a guided missile installs', () => {
    const { homingPrograms } = create(worldInput()).ruleData;
    // aiProgramsContent: record 1 (16, 30, 0.75), record 2 (0, 2.5, 1).
    expect(homingPrograms).toEqual({ 1: { at14: 16, at24: 30, at2C: 0.75 }, 2: { at14: 0, at24: 2.5, at2C: 1 } });
    expect(homingPrograms[programRecord('heat-seeker')]).toEqual({ at14: 16, at24: 30, at2C: 0.75 });
    expect(homingPrograms[programRecord('homing')]).toEqual({ at14: 0, at24: 2.5, at2C: 1 });
    expect(deepFrozen(homingPrograms)).toBe(true);
  });

  it('requires records 1 and 2, whatever the run mounts', () => {
    expectRejected(builtIn((records) => void records.pop()), `${AI_PROGRAMS}.builtInPrograms`, 'must have records 1 and 2');
    expectRejected(builtIn((records) => void records.splice(0)), `${AI_PROGRAMS}.builtInPrograms`, 'must have records 1 and 2');
    const unarmed = craftInfoWith((info) => {
      info.craft[0].mounts = [];
      info.craft[0].mountLists = [[], [], []];
    });
    expectRejected(builtIn((records) => void records.pop(), { craftInfo: unarmed }), `${AI_PROGRAMS}.builtInPrograms`, 'must have records 1 and 2');
    // Records past 2 are not required, and more are kept as read.
    expect(create(builtIn((records) => void records.push({ ...records[0] }))).ruleData.inputs.aiPrograms.content.builtInPrograms).toHaveLength(4);
  });

  it('rejects a negative period of record 1 or 2, and only of those records', () => {
    expectRejected(builtIn((records) => void (records[1].at14 = -1)), at(1, 'at14'), 'must not be negative');
    expectRejected(builtIn((records) => void (records[2].at14 = -0x8000_0000)), at(2, 'at14'), 'must not be negative');
    expectAccepted(builtIn((records) => void (records[0].at14 = -1)));
    expect(create(builtIn((records) => void (records[2].at14 = 0x7fff_ffff))).ruleData.homingPrograms[2].at14).toBe(0x7fff_ffff);
    // Beyond i32 the content reader rejects it.
    expectRejected(builtIn((records) => void (records[1].at14 = 0x8000_0000)), at(1, 'at14'), undefined, ContentContractError);
  });

  it('rejects a non-finite or non-f32 angle or saturation through the content reader', () => {
    for (const [record, field, value] of [
      [1, 'at24', Number.POSITIVE_INFINITY],
      [2, 'at24', Number.NaN],
      [1, 'at2C', Number.NEGATIVE_INFINITY],
      [2, 'at2C', 0.1],
    ] as const) {
      expectRejected(builtIn((records) => void (records[record][field] = value)), at(record, field), undefined, ContentContractError);
    }
    // Negative and zero angles and saturations are finite f32 values, as the original stores them.
    expect(create(builtIn((records) => Object.assign(records[1], { at24: -0, at2C: -2 }))).ruleData.homingPrograms[1]).toEqual({ at14: 16, at24: 0, at2C: -2 });
  });
});
