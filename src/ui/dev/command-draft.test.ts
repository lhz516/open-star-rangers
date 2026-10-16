import { describe, expect, it } from 'vitest';
import { COMMAND_TYPES, readTickInput, type CommandType } from '../../core/contracts/tick-input.ts';
import { COMMAND_FORMS, commandDraft, editDraft, readDraft, type CommandDraft } from './command-draft.ts';

// The command editor (docs/plan/p3/04/spec.md: 开发诊断, 命令提交): every Core command variant can be drafted into a
// valid command, and a field Core's rules refuse is refused before submission.

/** Every draft the forms offer: each choice of each choice field, numbers at their limits. */
function everyDraft(type: CommandType): CommandDraft[] {
  const drafts: CommandDraft[] = [commandDraft(type)];
  for (const field of COMMAND_FORMS[type]) {
    const values = field.kind === 'choice' ? field.options : [String(field.min), String(field.max)];
    for (const value of values) drafts.push(editDraft(commandDraft(type), field.name, value));
  }
  return drafts;
}

describe('command draft', () => {
  it('describes exactly the 18 Core command variants in Core\'s order', () => {
    expect(Object.keys(COMMAND_FORMS)).toEqual([...COMMAND_TYPES]);
    expect(COMMAND_TYPES).toHaveLength(18);
    expect(COMMAND_FORMS['speed-preset']).toEqual([{ name: 'level', kind: 'number', min: 1, max: 9, integer: true }]);
    expect(COMMAND_FORMS['select-number']).toEqual([{ name: 'value', kind: 'number', min: 1, max: 9, integer: true }]);
    expect(COMMAND_FORMS['map-point']).toEqual([
      { name: 'operation', kind: 'choice', options: ['hover', 'select'] },
      { name: 'right', kind: 'number', min: 0, max: 1, integer: false },
      { name: 'down', kind: 'number', min: 0, max: 1, integer: false },
    ]);
    expect(Object.isFrozen(COMMAND_FORMS) && Object.isFrozen(COMMAND_FORMS.fire) && Object.isFrozen(COMMAND_FORMS.fire[0])).toBe(true);
  });

  it.each(COMMAND_TYPES)('builds a valid %s command from every offered value', (type) => {
    for (const draft of everyDraft(type)) {
      const reading = readDraft(draft);
      if (!reading.valid) throw new Error(`${JSON.stringify(draft)}: ${reading.field} ${reading.reason}`);
      expect(reading.command.type).toBe(type);
      // The command is Core's own canonical copy: reading it again gives an equal command.
      expect(readTickInput({ axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [reading.command] }).commands[0]).toEqual(reading.command);
      expect(Object.isFrozen(reading.command)).toBe(true);
    }
  });

  it('reads number text as Core does, including -0 and exponents', () => {
    expect(readDraft(editDraft(commandDraft('select-number'), 'value', ' 9 '))).toEqual({ valid: true, command: { type: 'select-number', value: 9 } });
    expect(readDraft(editDraft(commandDraft('speed-preset'), 'level', '9'))).toEqual({ valid: true, command: { type: 'speed-preset', level: 9 } });
    expect(readDraft(editDraft(commandDraft('speed-preset'), 'level', '1e0'))).toEqual({ valid: true, command: { type: 'speed-preset', level: 1 } });
    const point = editDraft(editDraft(commandDraft('map-point'), 'right', '-0'), 'down', '5e-1');
    const reading = readDraft(point);
    expect(reading).toEqual({ valid: true, command: { type: 'map-point', operation: 'hover', right: 0, down: 0.5 } });
    expect(reading.valid && Object.is(reading.command.type === 'map-point' && reading.command.right, 0)).toBe(true);
  });

  it.each([
    ['select-number', 'value', '0', 'must be an integer from 1 to 9'],
    ['select-number', 'value', '2.5', 'must be an integer from 1 to 9'],
    ['select-number', 'value', '', 'must be an integer from 1 to 9'],
    ['select-number', 'value', '0x3', 'must be an integer from 1 to 9'],
    ['speed-preset', 'level', '0', 'must be an integer from 1 to 9'],
    ['speed-preset', 'level', '10', 'must be an integer from 1 to 9'],
    ['speed-preset', 'level', '4.5', 'must be an integer from 1 to 9'],
    ['speed-preset', 'level', '-1', 'must be an integer from 1 to 9'],
    ['speed-preset', 'level', '', 'must be an integer from 1 to 9'],
    ['speed-preset', 'level', 'Infinity', 'must be an integer from 1 to 9'],
    ['map-point', 'down', '1.01', 'must be a number from 0 to 1'],
    ['map-point', 'right', 'NaN', 'must be a number from 0 to 1'],
    ['fire', 'channel', 'tertiary', 'must be one of primary, secondary'],
    ['speed', 'operation', '', 'must be one of increase, decrease, zero, maximum, match-target, toggle-auto-match'],
  ] as const)('refuses %s with %s %j before submission', (type, field, text, reason) => {
    expect(readDraft(editDraft(commandDraft(type), field, text))).toEqual({ valid: false, field, reason });
  });

  it('refuses an unknown variant and ignores values no field uses', () => {
    expect(readDraft({ type: 'warp' as CommandType, values: {} })).toEqual({ valid: false, field: 'type', reason: 'must be a known command type' });
    expect(readDraft(editDraft(commandDraft('launch'), 'value', '3'))).toEqual({ valid: true, command: { type: 'launch' } });
  });

  it('starts each variant at its first choice or minimum, and edits without changing the draft', () => {
    expect(commandDraft('energy')).toEqual({ type: 'energy', values: { operation: 'open' } });
    expect(commandDraft('select-number')).toEqual({ type: 'select-number', values: { value: '1' } });
    expect(commandDraft('speed-preset')).toEqual({ type: 'speed-preset', values: { level: '1' } });
    expect(commandDraft('launch')).toEqual({ type: 'launch', values: {} });
    const draft = commandDraft('fire');
    const edited = editDraft(draft, 'channel', 'secondary');
    expect(draft.values.channel).toBe('primary');
    expect(edited.values.channel).toBe('secondary');
    expect(Object.isFrozen(edited) && Object.isFrozen(edited.values)).toBe(true);
  });
});
