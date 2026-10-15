import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { readAiPrograms } from '../../content/rule-data/ai-programs.ts';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { F32_DENORMAL, scriptItem } from '../../content/rule-data/rule-data.test-support.ts';
import { CoreInputError } from '../errors.ts';
import { aiProgramsContent, BASE_HANDLER, craftInfoContent, WINGMAN_HANDLER, type CraftInfoDraft } from '../world/create-world.test-support.ts';
import type { InstantiableRecord } from '../world/setup-check.ts';
import { thrownBy } from '../world/world.test-support.ts';
import { aiRuleData, builtInHandler, DEFAULT_KIND_MASK, loadTableProgram, scanProgramTable, SELECTION_KINDS, type SelectableRecord } from './ai-support.ts';

// The AI support closure and its creation-time checks (docs/plan/p3/02/spec.md, CR-15; ai.md §1, §10). Synthetic
// content only (aiProgramsContent); every expectation is derived from the selection rule of ai.md §1 and CR-15's table,
// not from the code under test.

type Content = ReturnType<typeof aiProgramsContent>;
const AI = 'input.aiPrograms.content';
const CRAFT = 'input.craftInfo.content';
const WINGMAN_PATH = 'input.wingmanRoster.content.options[2]';

/** A source of `kindBit` with runtime +0xDC `dc` and +0xE0 `e0` after the build's defaults. */
const source = (kindBit: number, dc = 3, e0 = 3, path = `input.mission.content.declarations[${kindBit}]`): InstantiableRecord => ({
  kindBit, model: readAssetId(`model/craft-${kindBit}`), path,
  ruleInputs: { percentA: 100, craftCount: 1, percentB: 100, percentC: 100, percentD: 100, aiValueA: dc, aiValueB: e0, aiValueC: 20 },
});
const wingman = (dc = 3) => source(1, dc, 4, WINGMAN_PATH);

/** The slice-shaped sources: the player, two kind-0x80 records (+0xDC 3 and a group member's 0), kind 0x100, a base and Xpons. */
const SLICE = [source(0), source(7), source(7, 0, 0), source(8, 0, 0), source(17), source(14)];

/** aiRuleData on the default content and craft info after the changes, read as world creation reads them. */
function build(sources: readonly InstantiableRecord[], change: (content: Content) => void = () => {}, changeInfo: (info: CraftInfoDraft) => void = () => {}) {
  const content = aiProgramsContent();
  change(content);
  const info = craftInfoContent();
  changeInfo(info);
  return aiRuleData(readAiPrograms(content, AI), readCraftInfo(info, CRAFT), sources);
}

/** Asserts a CoreInputError at `path` with `reason`, its message only the two. */
function expectRejected(work: () => unknown, path: string, reason: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject({ path, reason });
  expect((error as Error).message).toBe(`${path} ${reason}`);
}

/** Every item list of the default content's reachable short script (entry 3) replaced by `items`. */
const shortScript = (items: ReturnType<typeof scriptItem>[]) => (content: Content) => void ((content.entries[3] as { items: unknown[] }).items = items);

describe('the selection scan 0x5de18 (ai.md §1)', () => {
  const record = (kindMask: number, at0C: number, at10: number, at04 = 0): SelectableRecord => ({ kindMask, at04, at0C, at10 });
  // 0: partial for +0xDC ≤ 5, full for |+0xE0| ≥ 10; 1: partial and full for +0xDC ≤ 5; 2: another kind; 3: skipped unless the flag is set.
  const TABLE = [record(0x80, 5, 10), record(0x80, 5, 0), record(0x100, 99, 0), record(0x80, 99, 0, 1)];
  const subject = (dc: number, e0: number) => ({ kindBit: 7, dc, e0 });

  it('scans from the start, wrapping, and stops after the first full match; every partial match is recorded in scan order', () => {
    expect(scanProgramTable(TABLE, 0, subject(5, 3))).toEqual({ full: 1, partial: 1 });
    expect(scanProgramTable(TABLE, 2, subject(5, 3))).toEqual({ full: 1, partial: 1 });
    expect(scanProgramTable(TABLE, 0, subject(5, 10))).toEqual({ full: 0, partial: 0 });
    expect(scanProgramTable(TABLE, 1, subject(5, -10))).toEqual({ full: 1, partial: 1 });
    expect(scanProgramTable(TABLE, 0, subject(6, 99))).toEqual({ full: null, partial: null });
  });

  it('compares signed, and keeps |0x80000000| negative as NEG does', () => {
    // No full match: the last partial one in scan order wins.
    expect(scanProgramTable(TABLE, 0, subject(-0x8000_0000, -0x8000_0000))).toEqual({ full: null, partial: 1 });
    expect(scanProgramTable(TABLE, 1, subject(-0x8000_0000, -0x8000_0000))).toEqual({ full: null, partial: 0 });
    expect(scanProgramTable([record(0x80, 0x7fff_ffff, -0x8000_0000)], 0, subject(0, -0x8000_0000))).toEqual({ full: 0, partial: 0 });
  });

  it('skips records whose +0x04 is 1 unless the flag is set', () => {
    expect(scanProgramTable(TABLE, 3, subject(50, 0))).toEqual({ full: null, partial: null });
    expect(scanProgramTable(TABLE, 3, subject(50, 0), 1)).toEqual({ full: 3, partial: 3 });
  });

  it('selects for kinds 2, 8, 0x10, 0x40, 0x80–0x2000 and 0x8000–0x80000 only', () => {
    const kinds = [1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19];
    expect(Array.from({ length: 32 }, (_, bit) => bit).filter((bit) => ((SELECTION_KINDS >>> bit) & 1) === 1)).toEqual(kinds);
  });
});

describe('static AI data', () => {
  it('applies the load transforms to table records: +0x08 0 → 0x380, +0x2C ±0 → 1.0, and drops the name', () => {
    const [first, second] = aiProgramsContent().programs;
    const loaded = loadTableProgram(readAiPrograms(aiProgramsContent()).programs[1]);
    expect(loaded).toMatchObject({ kindMask: DEFAULT_KIND_MASK, at2C: 1, at0C: second.at0C, at14: second.at14 });
    expect(loaded).not.toHaveProperty('name');
    expect(loadTableProgram(readAiPrograms(aiProgramsContent()).programs[0])).toMatchObject({ kindMask: 0x180, at2C: first.at2C });
  });

  it('maps the wingman and base handler identities and no other', () => {
    expect(builtInHandler({ object: 2, offset: WINGMAN_HANDLER })).toBe('wingman');
    expect(builtInHandler({ object: 2, offset: BASE_HANDLER })).toBe('base');
    for (const identity of [{ object: 1, offset: WINGMAN_HANDLER }, { object: 2, offset: WINGMAN_HANDLER + 1 }, { object: 2, offset: 0x40aa0 }]) {
      expect(builtInHandler(identity)).toBeNull();
    }
  });

  it('closes over the slice-shaped run: table record 0, the base record, DFPG 0 and its three scripts', () => {
    const data = build(SLICE);
    expect(data.reachable).toEqual({ tablePrograms: [0], builtInPrograms: [4], parameters: [0], scripts: [1, 2, 3] });
    expect(data.builtInHandlers).toEqual([null, null, null, 'wingman', 'base']);
    // DFPG 0's +0x08 is 1.5.
    expect(data.thresholdsSquared).toEqual([2.25, null, null, null, null, null]);
    expect(data.scripts.map((plans) => plans?.length ?? null)).toEqual([null, 3, 24, 3, null, null]);
    // The install script's keywords: 300 reads the second table, 301 the third (their values 2 and 0).
    expect(data.scripts[1]).toEqual([
      { type: 'integer', term: { type: 'value', value: 2 } }, { type: 'integer', term: { type: 'value', value: 0 } }, { type: 'integer', term: { type: 'value', value: 0 } },
    ]);
    expect(data.tablePrograms).toHaveLength(3);
    expect(deepFrozen(data)).toBe(true);
  });

  it('adds the wingman record with a wingman, and nothing for kinds that do not select', () => {
    expect(build([...SLICE, wingman()]).reachable.builtInPrograms).toEqual([3, 4]);
    // Kind 0x4000, the player and kinds 4 and 0x20 select nothing, even with a table record of every kind.
    const every = (content: Content) => void (content.programs[0].kindMask = 0xffff_ffff);
    expect(build([source(0), source(14), source(2), source(5)], every).reachable).toEqual({ tablePrograms: [], builtInPrograms: [], parameters: [], scripts: [] });
  });

  it('reaches a record that only matches partially when no record matches fully, and the built-in table only without any match', () => {
    // Kind 0x200 with +0xDC 0 matches record 1 (mask 0x380 after the load) partially, and nothing fully.
    expect(build([source(9, 0, 0)]).reachable.tablePrograms).toEqual([1]);
    // For kind 0x80 with +0xDC 0 record 0's full match comes first from every start.
    expect(build([source(7, 0, 0)]).reachable.tablePrograms).toEqual([0]);
    // +0xDC 1 misses record 1; kind 0x8000 has no record in either table: no program, no check.
    expect(build([source(9, 1, 0), source(15)]).reachable).toEqual({ tablePrograms: [], builtInPrograms: [], parameters: [], scripts: [] });
    // A table record of the wingman's kind takes precedence over the built-in table.
    expect(build([wingman()], (content) => void (content.programs[0].kindMask = 0x2)).reachable).toMatchObject({ tablePrograms: [0], builtInPrograms: [] });
  });

  it('enumerates every start: a record any start can reach is in the closure', () => {
    // Two full matches: the start decides which, so both are reachable (record 2's script then needs supported opcodes).
    const both = (content: Content) => {
      content.programs[2].kindMask = 0x80;
      (content.entries[5] as { items: unknown[] }).items = [scriptItem(10000)];
    };
    expect(build([source(7)], both).reachable).toEqual({ tablePrograms: [0, 2], builtInPrograms: [], parameters: [0, 4], scripts: [1, 2, 3, 5] });
  });
});

describe('creation-time checks of the closure (CR-15)', () => {
  it('needs both selection tables to be non-empty where a source selects from them', () => {
    const empty = (content: Content) => {
      content.programs = [];
      content.entries = [];
    };
    expectRejected(() => build([source(7)], empty), `${AI}.programs`, 'zero-divisor');
    expectRejected(() => build([source(15)], (content) => void (content.builtInPrograms = [])), `${AI}.builtInPrograms`, 'zero-divisor');
    expect(() => build([source(0), source(14)], empty)).not.toThrow();
  });

  it('rejects a reachable record whose +0x50 divides by a +0x0C of 0, or whose period is negative or triples past i32', () => {
    expectRejected(() => build([source(8, 0, 0)], (content) => void (content.programs[0].at0C = 0)), `${AI}.programs[0].at0C`, 'zero-divisor');
    expect(() => build([source(8, 0, 0)], (content) => Object.assign(content.programs[0], { at0C: 0, at50: 0 }))).not.toThrow();
    expectRejected(() => build([source(7)], (content) => void (content.programs[0].at14 = -1)), `${AI}.programs[0].at14`, 'negative-period');
    expectRejected(() => build([source(7)], (content) => void (content.programs[0].at14 = 0x2aaa_aaab)), `${AI}.programs[0].at14`, 'negative-period');
    expect(() => build([source(7)], (content) => void (content.programs[0].at14 = 0x2aaa_aaaa))).not.toThrow();
    expect(() => build([source(7)], (content) => Object.assign(content.programs[0], { at14: 0x7fff_ffff, at50: 0 }))).not.toThrow();
    // Record 2 is not reachable: its values are not checked.
    expect(() => build(SLICE, (content) => Object.assign(content.programs[2], { at14: -1, at0C: 0 }))).not.toThrow();
    expectRejected(() => build(SLICE, (content) => void (content.builtInPrograms[4].at14 = -1)), `${AI}.builtInPrograms[4].at14`, 'negative-period');
    expectRejected(() => build(SLICE, (content) => void ((content.entries[0] as { at04: number }).at04 = -1)), `${AI}.entries[0].at04`, 'negative-period');
    expect(() => build(SLICE, (content) => void ((content.entries[4] as { at04: number }).at04 = -1))).not.toThrow();
  });

  it('rejects a reachable built-in record whose handler identity Core does not implement', () => {
    const moved = (content: Content) => void (content.builtInPrograms[4].handler = { object: 2, offset: BASE_HANDLER + 4 });
    expectRejected(() => build(SLICE, moved), `${AI}.builtInPrograms[4].handler`, 'unsupported-handler');
    // Base record with the wingman's handler is still an implemented identity; record 0's identity is never selected.
    const swapped = (content: Content) => void (content.builtInPrograms[4].handler = { object: 2, offset: WINGMAN_HANDLER });
    expect(() => build(SLICE, swapped)).not.toThrow();
    // Its checks then follow the handler, not the kind: the base's element, top speed and the weave period.
    expectRejected(() => build([source(17, 0)], swapped), 'input.mission.content.declarations[17].ruleInputs.aiValueA', 'element-out-of-range');
    expectRejected(() => build(SLICE, swapped, (info) => void (info.craft[17].atB8 = 0)), `${CRAFT}.craft[17].atB8`, 'zero-rate');
    expectRejected(() => build(SLICE, (content) => { swapped(content); content.globals.at3C = 0; }), `${AI}.globals.at3C`, 'zero-craft-divisor');
    expect(build([source(0)], moved).builtInHandlers[4]).toBeNull();
  });

  it('rejects an unsupported opcode or argument in a reachable script, and accepts them where unreachable', () => {
    expectRejected(() => build(SLICE, shortScript([scriptItem(109, '5'), scriptItem(10000)])), `${AI}.entries[3].items[0].opcode`, 'unsupported-opcode');
    expectRejected(() => build(SLICE, shortScript([scriptItem(240, '1'), scriptItem(9000, null, 0), scriptItem(10000)])), `${AI}.entries[3].items[1].opcode`, 'unsupported-opcode');
    expectRejected(() => build(SLICE, shortScript([scriptItem(240, '[3 2]'), scriptItem(10000)])), `${AI}.entries[3].items[0].argument`, 'zero-range');
    // A negative wait is accepted (CR-24 decision 16).
    expect(() => build(SLICE, shortScript([scriptItem(1000, '-8'), scriptItem(10000)]))).not.toThrow();
    expectRejected(() => build(SLICE, shortScript([scriptItem(231, 'none of them'), scriptItem(10000)])), `${AI}.entries[3].items[0].argument`, 'unknown-keyword');
    expectRejected(() => build(SLICE, (content) => void ((content.entries[1] as { items: { argument: string | null }[] }).items[0].argument = null)), `${AI}.entries[1].items[0].argument`, 'missing-argument');
    // Entry 5 holds opcodes 109 and 9000 and is reached only through record 2, which no source selects.
    expect(build(SLICE).scripts[5]).toBeNull();
  });

  describe('zero-rate: a divisor of the AI paths of a kind that reaches it (CR-15)', () => {
    it('rejects a zero turn rate for opcodes 1001–1003, each with its craft field', () => {
      for (const field of ['atAC', 'atB4', 'atB0'] as const) {
        expectRejected(() => build(SLICE, undefined, (info) => void (info.craft[8][field] = 0)), `${CRAFT}.craft[8].${field}`, 'zero-rate');
      }
      // The top speed is no divisor without the attack pass, and kinds without the program are not checked.
      expect(() => build(SLICE, undefined, (info) => { info.craft[7].atB8 = 0; info.craft[17].atAC = 0; })).not.toThrow();
      // 1003 alone needs only +0xB0.
      const noLists = (content: Content) => {
        shortScript([scriptItem(1003, '5'), scriptItem(10000)])(content);
        (content.entries[2] as { items: unknown[] }).items = [scriptItem(10000)];
      };
      expect(() => build([source(7)], noLists, (info) => Object.assign(info.craft[7], { atAC: 0, atB4: 0 }))).not.toThrow();
      expectRejected(() => build([source(7)], noLists, (info) => void (info.craft[7].atB0 = 0)), `${CRAFT}.craft[7].atB0`, 'zero-rate');
    });

    it('rejects a turn rate that underflows to 0 at the smallest scale, 0.5 from 0x5e4d0', () => {
      expectRejected(() => build(SLICE, undefined, (info) => void (info.craft[7].atAC = F32_DENORMAL)), `${CRAFT}.craft[7].atAC`, 'zero-rate');
      // Without +0x50 the scale stays 1.0.
      expect(() => build(SLICE, (content) => void (content.programs[0].at50 = 0), (info) => void (info.craft[7].atAC = F32_DENORMAL))).not.toThrow();
    });

    it('checks the top speed and +0xB4 where the attack pass (1101) is reachable', () => {
      const pass = shortScript([scriptItem(1101, 'Y'), scriptItem(10000)]);
      expectRejected(() => build(SLICE, pass, (info) => void (info.craft[7].atB8 = 0)), `${CRAFT}.craft[7].atB8`, 'zero-rate');
      expect(() => build(SLICE, pass)).not.toThrow();
    });

    it('takes the raw scales of +0x34: +0x40 for speed, +0x3C for turns', () => {
      const raw = (fields: Record<string, number>) => (content: Content) => {
        Object.assign(content.programs[0], { at34: 1, ...fields });
        shortScript([scriptItem(1101, 'n'), scriptItem(10000)])(content);
      };
      expectRejected(() => build(SLICE, raw({ at3C: 0 })), `${AI}.programs[0].at3C`, 'zero-rate');
      expectRejected(() => build(SLICE, raw({ at40: 0 })), `${AI}.programs[0].at40`, 'zero-rate');
      expect(() => build(SLICE, raw({ at40: -1, at3C: -0.5 }))).not.toThrow();
    });

    it('checks the wingman\'s AICO element and craft through its attack pass', () => {
      // +0xDC 3: element 2.
      expectRejected(() => build([wingman()], (content) => void (content.globals.elements[2][0] = 0)), `${AI}.globals.elements[2]`, 'zero-rate');
      expectRejected(() => build([wingman()], (content) => void (content.globals.elements[2][1] = 0)), `${AI}.globals.elements[2]`, 'zero-rate');
      expectRejected(() => build([wingman()], undefined, (info) => void (info.craft[1].atB8 = 0)), `${CRAFT}.craft[1].atB8`, 'zero-rate');
      expectRejected(() => build([wingman()], undefined, (info) => void (info.craft[1].atB4 = 0)), `${CRAFT}.craft[1].atB4`, 'zero-rate');
      expect(() => build([wingman()], (content) => void (content.globals.elements[1][0] = 0), (info) => void (info.craft[1].atAC = 0))).not.toThrow();
    });
  });

  it('rejects a wingman whose +0xDC − 1 is outside the AICO elements', () => {
    for (const dc of [0, 6]) expectRejected(() => build([wingman(dc)]), `${WINGMAN_PATH}.ruleInputs.aiValueA`, 'element-out-of-range');
    for (const dc of [1, 5]) expect(() => build([wingman(dc)])).not.toThrow();
  });

  it('rejects a wingman with a hull capacity of 0, and a weave period range holding 0 where the attack pass is reachable', () => {
    expectRejected(() => build([wingman()], undefined, (info) => void (info.craft[1].at9C = 0)), `${CRAFT}.craft[1].at9C`, 'zero-craft-divisor');
    expect(() => build(SLICE, undefined, (info) => void (info.craft[1].at9C = 0))).not.toThrow();
    for (const [at3C, at40] of [[0, 1], [-1, 1], [1, -1], [-0.5, 0]]) {
      const period = (content: Content) => Object.assign(content.globals, { at3C, at40 });
      expectRejected(() => build([wingman()], period), `${AI}.globals.at3C`, 'zero-craft-divisor');
      // Without a wingman and without 1101 the weave is unreachable.
      expect(() => build(SLICE, period)).not.toThrow();
      expectRejected(() => build(SLICE, (content) => { period(content); shortScript([scriptItem(1101, 'y'), scriptItem(10000)])(content); }), `${AI}.globals.at3C`, 'zero-craft-divisor');
    }
    expect(() => build([wingman()], (content) => Object.assign(content.globals, { at3C: -2, at40: -1 }))).not.toThrow();
  });
});
