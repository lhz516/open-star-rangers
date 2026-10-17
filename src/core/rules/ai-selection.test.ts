import { describe, expect, it } from 'vitest';
import type { BuiltInProgram, TableProgram } from '../../content/rule-data/ai-programs.ts';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { clearedControllerCommon, isValidAiProgram, NO_AI_PROGRAM } from '../world/entity-table.ts';
import { thrownBy } from '../world/world.test-support.ts';
import { installedController, isControllerDue, selectionSubject, selectProgram, selectsProgram } from './ai-selection.ts';
import { loadTableProgram, type SelectableRecord } from './ai-support.ts';
import { scriptedRand } from './rand.test-support.ts';

// Selection `0x5dbc8`/`0x5de18` and the controller `0x5dc0c` installs (docs/plan/p3/02/spec.md, CR-16, CR-23;
// docs/original/formats/ai.md §1, §1.1, §6; executable.md A1, A2). Expectations are derived from those records, not
// from the code under test.

/** Every rand value: rand() gives 0–32767. */
const RAND_VALUES = Array.from({ length: 32768 }, (_, value) => value);

/** A table record of the fields the scan reads, matching kind 0x80 (bit 7) by default. */
const record = (overrides: Partial<SelectableRecord> = {}): SelectableRecord => ({ kindMask: 0x80, at04: 0, at0C: 10, at10: 0, ...overrides });

/** A built-in record whose scan fields are those of `record`. */
const builtIn = (overrides: Partial<SelectableRecord> = {}) => record(overrides) as unknown as BuiltInProgram;
const table = (overrides: Partial<SelectableRecord> = {}) => record(overrides) as unknown as ReturnType<typeof loadTableProgram>;

const KIND_7 = { kindBit: 7, dc: 3, e0: 3 };

describe('which kinds select (ai §1: 2, 8, 0x10, 0x40, 0x80–0x2000, 0x8000–0x80000)', () => {
  it('selects for exactly those kinds and draws nothing for any other', () => {
    const selecting = [1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19];
    expect(Array.from({ length: 32 }, (_, kindBit) => kindBit).filter(selectsProgram)).toEqual(selecting);
    for (const kindBit of [0, 2, 5, 14, 20, 24, 31]) {
      const rand = scriptedRand([]);
      expect(selectProgram({ kindBit, dc: 0, e0: 0 }, [table({ kindMask: 0xffffffff })], [builtIn({ kindMask: 0xffffffff })], rand)).toBe(NO_AI_PROGRAM);
      expect(rand.used).toBe(0);
    }
  });

  it('reads the kind and runtime +0xDC and +0xE0 of the entity', () => {
    const entity = { kindBit: 8, ruleInputs: { percentB: 1, percentC: 2, percentD: 3, aiValueA: -4, aiValueB: 5, aiValueC: 6 } };
    expect(selectionSubject(entity as never)).toEqual({ kindBit: 8, dc: -4, e0: 5 });
  });
});

describe('the start draw and its preimages (AC-03)', () => {
  /** The result for every rand value, counted by record; null for none. */
  function preimages(tablePrograms: readonly SelectableRecord[], subject = KIND_7) {
    const counts = new Map<string, number>();
    for (const value of RAND_VALUES) {
      const slot = selectProgram(subject, tablePrograms as never, [builtIn({ kindMask: 0 })], scriptedRand([value, 0]));
      const key = slot.type === 'none' ? 'none' : `${slot.type}:${slot.record}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  // Three records: 0 is full only for |+0xE0| ≥ 5, 1 has another kind, 2 is full for any +0xE0. A start s = rand mod 3
  // has the preimages 0, 3, …, 32766 (10,923 values), 1, 4, …, 32767 (10,923) and 2, 5, …, 32765 (10,922).
  const THREE = [record({ at10: 5 }), record({ kindMask: 0x100 }), record()];

  it('starts at rand mod count and takes the first full match in the order s … count − 1, 0 … s − 1', () => {
    // |−6| = 6 ≥ 5: start 0 gives record 0; starts 1 and 2 reach record 2 first.
    expect(preimages(THREE, { kindBit: 7, dc: 3, e0: -6 })).toEqual(new Map([['table:0', 10923], ['table:2', 10923 + 10922]]));
    // |3| < 5: record 0 is partial, record 2 full and reached from every start.
    expect(preimages(THREE)).toEqual(new Map([['table:2', 32768]]));
  });

  it('keeps 0x80000000 negative under NEG, so neither record is full and the last partial in scan order wins', () => {
    // Start 0 scans 0, 1, 2 (last partial 2); start 1 scans 1, 2, 0 and start 2 scans 2, 0, 1 (last partial 0).
    expect(preimages(THREE, { kindBit: 7, dc: 3, e0: -0x8000_0000 })).toEqual(new Map([['table:2', 10923], ['table:0', 10923 + 10922]]));
  });

  it('prefers any full match to an earlier partial one, and draws exactly once when the group table matches', () => {
    const records = [record({ at10: 100 }), record({ at10: 3 })];
    for (const value of [0, 1, 32766, 32767]) {
      const rand = scriptedRand([value]);
      expect(selectProgram(KIND_7, records as never, [], rand)).toEqual({ type: 'table', record: 1, controller: null });
      expect(rand.used).toBe(1);
    }
    // Only partial matches: the one met last from the start.
    const partial = [record({ at10: 100 }), record({ kindMask: 0x40 }), record({ at10: 100 })];
    expect([0, 1, 2].map((value) => selectProgram(KIND_7, partial as never, [], scriptedRand([value])))).toEqual(
      [2, 0, 0].map((index) => ({ type: 'table', record: index, controller: null })),
    );
  });

  it('matches +0xDC ≤ +0x0C and |+0xE0| ≥ +0x10 as signed values, at equality, and skips records whose +0x04 is 1', () => {
    const at = (dc: number, e0: number, overrides: Partial<SelectableRecord>) =>
      selectProgram({ kindBit: 7, dc, e0 }, [table(overrides)], [builtIn({ kindMask: 0 })], scriptedRand([0, 0])).type;
    expect(at(10, 0, { at0C: 10 })).toBe('table');
    expect(at(11, 0, { at0C: 10 })).toBe('none');
    expect(at(-0x8000_0000, 0, { at0C: -1 })).toBe('table');
    expect(at(0, -7, { at10: 7 })).toBe('table');
    expect(at(0, 6, { at10: 7 })).toBe('table');
    expect(at(0, 0, { at10: -1 })).toBe('table');
    expect(at(0, 0, { at04: 1 })).toBe('none');
    expect(at(0, 0, { at04: 2 })).toBe('table');
    expect(at(0, 0, { kindMask: 0xffffff7f })).toBe('none');
  });
});

describe('the built-in fallback (`0x5dbc8`)', () => {
  const BUILT_IN = [builtIn({ kindMask: 0x2 }), builtIn({ kindMask: 0x82, at10: 50 }), builtIn({ kindMask: 0x80 })];

  it('scans the built-in table from a second draw only when the group table gives neither match', () => {
    const rand = scriptedRand([5, 4]);
    // Group: one record of another kind. Built-in: start 4 mod 3 = 1 meets record 1 (partial: |3| < 50), then record 2 (full).
    expect(selectProgram(KIND_7, [table({ kindMask: 0x100 })], BUILT_IN, rand)).toEqual({ type: 'built-in', record: 2, controller: null });
    expect(rand.used).toBe(2);
    const partial = scriptedRand([0, 0]);
    expect(selectProgram({ kindBit: 1, dc: 0, e0: 0 }, [table({ kindMask: 0x100 })], [builtIn({ kindMask: 0x2, at10: 9 })], partial)).toEqual(
      { type: 'built-in', record: 0, controller: null },
    );
  });

  it('gives none after both draws when neither table matches', () => {
    const rand = scriptedRand([1, 2]);
    expect(selectProgram({ kindBit: 9, dc: 0, e0: 0 }, [table()], BUILT_IN, rand)).toBe(NO_AI_PROGRAM);
    expect(rand.used).toBe(2);
  });

  it('faults on an empty table, a division by zero world creation rejects', () => {
    expect(thrownBy(() => selectProgram(KIND_7, [], BUILT_IN, scriptedRand([0, 0])))).toMatchObject({ code: 'invariant-violated', site: 'ai-selection.empty-table' });
    expect(thrownBy(() => selectProgram(KIND_7, [table({ kindMask: 0 })], [], scriptedRand([0, 0])))).toBeInstanceOf(CoreFaultError);
  });

  it('selects through the load transforms: a stored kind mask 0 matches the kinds 0x80, 0x100 and 0x200', () => {
    const stored = { kindMask: null, at04: 0, at0C: 10, at10: 0, at2C: null } as unknown as TableProgram;
    const loaded = [loadTableProgram({ ...stored, name: 'x' } as TableProgram)];
    const kinds = Array.from({ length: 20 }, (_, kindBit) => kindBit).filter(selectsProgram)
      .filter((kindBit) => selectProgram({ kindBit, dc: 0, e0: 0 }, loaded, [builtIn({ kindMask: 0 })], scriptedRand([0, 0])).type === 'table');
    expect(kinds).toEqual([7, 8, 9]);
  });
});

describe('the controller `0x5dc0c` installs (ai §1, §1.1; A1, A2)', () => {
  /** f64 0x17232c and 0x172334 (ai §1; executable H5): the decimals 3.1415927 and 1/180 to double precision. */
  const PI = 3.1415927;
  const PER_DEGREE = 1 / 180;
  const limit = (degrees: number) => Math.fround(degrees * PI * PER_DEGREE);
  const craft = { atAC: 1.5, atB4: Math.fround(2.2), atB0: 0.25, atB8: Math.fround(100.3) } as CraftRecord;
  const RECORD = { at14: 70, at24: 45, at28: 7.5, at2C: 0.75, at30: Math.fround(0.9) };

  it('writes the period, the limits and the steering block of `0x5c530` and `0x5c768`(1.0, 1.0, 0), and clears the rest', () => {
    const controller = installedController(RECORD, craft);
    const cleared = clearedControllerCommon();
    expect(controller).toEqual({
      ...cleared,
      period: 70,
      limits: { turn: limit(45), speed: limit(7.5), saturation: 0.75, rollMatchThreshold: Math.fround(0.9) },
      aiLock: false,
      steering: {
        ...cleared.steering,
        sizeClass: 2, leadMode: 0, approachRadius: 0, speedFraction: 1, turnFraction: 1, rollMatch: false,
        speedLimit: Math.fround(100.3), halfSpeedLimit: Math.fround(Math.fround(100.3) / 2), turnRates: [1.5, Math.fround(2.2), 0.25],
      },
    });
    // The deadline is the handler's to write; nothing is due-dated yet.
    expect(controller.nextUpdateClock).toBe(0);
    expect(isValidAiProgram(7, { type: 'table', record: 0, controller: { ...controller, handler: 'parked' } })).toBe(true);
  });

  it('takes the saturation of a table record through its load transform (+0x2C ±0 becomes 1.0)', () => {
    const loaded = loadTableProgram({ ...RECORD, at2C: null, kindMask: 0x80, name: 'x' } as unknown as TableProgram);
    expect(installedController(loaded, craft).limits.saturation).toBe(1);
  });

  it('faults on a period that is not a non-negative i32 and on a limit that is not a finite f32', () => {
    expect(thrownBy(() => installedController({ ...RECORD, at14: -1 }, craft))).toMatchObject({ site: 'ai-selection.period' });
    expect(thrownBy(() => installedController({ ...RECORD, at24: 1e41 }, craft))).toMatchObject({ site: 'steering.result' });
  });
});

describe('the AI step\'s schedule (`0x5dcd4`)', () => {
  it('is due only when the sample is strictly past the deadline', () => {
    const controller = { ...clearedControllerCommon(), nextUpdateClock: 100 };
    expect([98, 99, 100, 101, 102].map((clock) => isControllerDue(controller, clock))).toEqual([false, false, false, true, true]);
  });
});
