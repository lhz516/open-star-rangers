import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft as craftRecord, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { buildWeaponBlock } from './combat-init.ts';
import { chainAmmunition, damageListMount, listStatus, repairListMounts, selectMount } from './mounts.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations follow docs/original/formats/executable.md W1–W4 and W8 (`0x2dd04`) and docs/plan/p3/02/spec.md CR-02
// and CR-05. A mount's +0x18 names the mount it fires together with, +0x1C the one it alternates with.

const gun = (overrides: Record<string, unknown> = {}) => mount({ at10: 0, weapon: 0, ...overrides });
const missile = (ammunition: number, overrides: Record<string, unknown> = {}) => mount({ at10: 1, weapon: 0, at0C: ammunition, ...overrides });

/**
 * Mounts: 0 gun firing together with 1; 1 gun alternating with 2; 2 gun; 3 gun alone; 4 missile alternating with 5; 5
 * missile; 6 missile alone; 7 an automatic-style gun in no list. Lists: 0 = [0, 3], 1 = [4, 6], 2 = [].
 */
function record(lists: number[][] = [[0, 3], [4, 6], []]): CraftRecord {
  return craftRecord({
    mounts: [gun({ at18: 1, at0C: 3 }), gun({ at1C: 2 }), gun({ at0C: 10 }), gun(), missile(2, { at1C: 5 }), missile(3), missile(1), gun()],
    mountLists: lists,
  }) as unknown as CraftRecord;
}

const damages = (block: ReturnType<typeof buildWeaponBlock>) => block.mounts.map(({ damage }) => damage);

describe('selection 0x2e4ec (W3, AC-05)', () => {
  it('steps through a list and wraps both ways', () => {
    const craft = record([[0, 3, 6], [4, 6], []]);
    const block = buildWeaponBlock(craft);
    expect(selectMount(block, craft, 0, 1)).toEqual({ index: 1, mount: 3, changed: true });
    expect(selectMount(block, craft, 0, 1)).toEqual({ index: 2, mount: 6, changed: true });
    expect(selectMount(block, craft, 0, 1)).toEqual({ index: 0, mount: 0, changed: true });
    expect(selectMount(block, craft, 0, -1)).toEqual({ index: 2, mount: 6, changed: true });
    expect(block.selections[0]).toEqual({ index: 2, mount: 6 });
  });

  it('keeps a single-entry list on its entry, unchanged, and an empty one at no mount with index −1 below 0', () => {
    const craft = record([[3], [], []]);
    const block = buildWeaponBlock(craft);
    expect(selectMount(block, craft, 0, 1)).toEqual({ index: 0, mount: 3, changed: false });
    expect(selectMount(block, craft, 0, -1)).toEqual({ index: 0, mount: 3, changed: false });
    expect(selectMount(block, craft, 1, -1)).toEqual({ index: -1, mount: null, changed: false });
    expect(selectMount(block, craft, 1, -1)).toEqual({ index: -1, mount: null, changed: false });
    expect(selectMount(block, craft, 1, 1)).toEqual({ index: 0, mount: null, changed: false });
  });

  it('does not skip a destroyed mount or one without ammunition', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    block.mounts[6].ammunition = 0;
    block.mounts[6].damage = 2;
    expect(selectMount(block, craft, 1, 1)).toEqual({ index: 1, mount: 6, changed: true });
  });

  it('clears the lock level on list 1 only, also when the mount stays', () => {
    const craft = record([[0, 3], [6], []]);
    const block = buildWeaponBlock(craft);
    Object.assign(block.lock, { level: 3, stageDueClock: 9, losing: true, graceDueClock: 8, nextUpdateClock: 7 });
    selectMount(block, craft, 0, 1);
    expect(block.lock.level).toBe(3);
    expect(selectMount(block, craft, 1, 1)?.changed).toBe(false);
    expect(block.lock).toEqual({ level: 0, stageDueClock: 9, losing: true, graceDueClock: 8, nextUpdateClock: 7 });
  });

  it('changes nothing for a craft without mounts', () => {
    const craft = craftRecord() as unknown as CraftRecord;
    const block = buildWeaponBlock(craft);
    block.lock.level = 2;
    expect(selectMount(block, craft, 1, 1)).toBeNull();
    expect(block.selections[1]).toEqual({ index: 0, mount: null });
    expect(block.lock.level).toBe(2);
  });
});

describe('mount damage of subsystems 8 and 5 (W4)', () => {
  it('damages the drawn list-0 entry: rand % count, then rand % ammunition when it becomes damaged with ammunition', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    // Draw 3 → entry 3 % 2 = 1, mount 3 (no ammunition): damaged, ammunition 0, one draw.
    const rand = scriptedRand([3]);
    damageListMount(block, craft, 0, rand);
    expect(rand.used).toBe(1);
    expect(damages(block)).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
    // Entry 0, mount 0 with 3 rounds: 7 % 3 = 1 round left.
    damageListMount(block, craft, 0, scriptedRand([0, 7]));
    expect([block.mounts[0].damage, block.mounts[0].ammunition]).toEqual([1, 1]);
    // Damaged again it is destroyed and loses every round, without a second draw.
    const again = scriptedRand([2]);
    damageListMount(block, craft, 0, again);
    expect([block.mounts[0].damage, block.mounts[0].ammunition, again.used]).toEqual([2, 0, 1]);
  });

  it('walks list 0 past destroyed mounts along the fire-together link, else the alternate link', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    block.mounts[0].damage = 2;
    block.mounts[1].damage = 2;
    // Mount 0 → 1 (together) → 2 (alternate): mount 2 with 10 rounds keeps 25 % 10 = 5.
    damageListMount(block, craft, 0, scriptedRand([0, 25]));
    expect([block.mounts[2].damage, block.mounts[2].ammunition]).toEqual([1, 5]);
    block.mounts[2].damage = 2;
    const rand = scriptedRand([0]);
    damageListMount(block, craft, 0, rand);
    expect(damages(block)).toEqual([2, 2, 2, 0, 0, 0, 0, 0]);
    expect(rand.used).toBe(1);
  });

  it('walks list 1 along the alternate link only', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    block.mounts[4].damage = 2;
    damageListMount(block, craft, 1, scriptedRand([0, 1]));
    expect([block.mounts[5].damage, block.mounts[5].ammunition]).toEqual([1, 1]);
  });

  it('draws nothing for an empty list and never damages list 2 or the automatic mounts', () => {
    const craft = record([[0, 3], [], [7]]);
    const block = buildWeaponBlock(craft);
    damageListMount(block, craft, 1, scriptedRand([]));
    expect(damages(block)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('repair and status (W4)', () => {
  it('reports 0 without damage, 1 for some, 2 when every mount of the walks is destroyed', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    expect([listStatus(block, craft, 0), listStatus(block, craft, 1)]).toEqual([0, 0]);
    block.mounts[2].damage = 1;
    expect(listStatus(block, craft, 0)).toBe(1);
    for (const index of [0, 1, 2, 3]) block.mounts[index].damage = 2;
    expect(listStatus(block, craft, 0)).toBe(2);
    // List 1's walk from mount 4 leaves out mount 6's own entry only when it is not listed: here both entries count.
    block.mounts[4].damage = 2;
    block.mounts[5].damage = 2;
    expect(listStatus(block, craft, 1)).toBe(1);
    block.mounts[6].damage = 2;
    expect(listStatus(block, craft, 1)).toBe(2);
  });

  it('repairs the first damaged mount and returns 0, or every one and returns 1, without restoring ammunition', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    block.mounts[1].damage = 2;
    block.mounts[1].ammunition = 0;
    block.mounts[3].damage = 1;
    expect(repairListMounts(block, craft, 0, false)).toBe(0);
    expect(damages(block)).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
    expect(block.mounts[1].ammunition).toBe(0);
    block.mounts[2].damage = 2;
    expect(repairListMounts(block, craft, 0, true)).toBe(1);
    expect(damages(block)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(repairListMounts(block, craft, 0, false)).toBe(1);
  });

  it('repairs list 1 along the alternate link only', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    block.mounts[5].damage = 1;
    block.mounts[0].damage = 1;
    expect(repairListMounts(block, craft, 1, false)).toBe(0);
    expect(damages(block)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('the ammunition of a missile entry 0x2dd04 (W8)', () => {
  it('sums the alternate chain from the mount, and is −1 for a gun', () => {
    const craft = record();
    const block = buildWeaponBlock(craft);
    expect(chainAmmunition(block, craft, 4)).toBe(5);
    expect(chainAmmunition(block, craft, 5)).toBe(3);
    expect(chainAmmunition(block, craft, 6)).toBe(1);
    expect(chainAmmunition(block, craft, 0)).toBe(-1);
  });
});
