/**
 * Game input actions and binding matching (docs/plan/p3/05/spec.md: 绑定表, 修饰键与布局, 数据模型与契约). A binding
 * names a physical `code`, the Shift, effective Ctrl and applicable NumLock states it requires, the interaction
 * contexts it acts in, its action, whether that action repeats while held, and its source. Matching never reads `key`
 * or `keyCode`; Alt is not a matching modifier, as it is the independent primary-fire level, and Meta and composition
 * are refused before matching. The production table is subtask 19's data; this module only types and checks tables.
 */
import type { Command } from '../../core/contracts/tick-input.ts';
import type { PlayerProjection } from '../../core/projections/projection.ts';

export type InputContext = PlayerProjection['interactionContext'];
export const INPUT_CONTEXTS: readonly InputContext[] = Object.freeze(['flight', 'warp', 'map', 'base']);

export type SteeringAxis = 'pitch' | 'yaw' | 'roll';
export type SessionControl = 'toggle-pause' | 'open-menu';
/** The P3 slice gaps a key press marks instead of acting (P3-01 G-08 to G-10). */
export type InputGapId = 'G-08' | 'G-09' | 'G-10';

export type InputAction =
  /** Held: one direction of a digital stick axis, −1 or +1 as TickAxes counts them. */
  | { readonly kind: 'steer'; readonly axis: SteeringAxis; readonly direction: -1 | 1 }
  /** Held: the primary-fire level the Runtime samples each tick. */
  | { readonly kind: 'primary-fire' }
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'session'; readonly control: SessionControl }
  | { readonly kind: 'gap'; readonly gap: InputGapId };

/** The actions one new press carries out once, rather than holding a level. */
export type DiscreteAction = Extract<InputAction, { readonly kind: 'command' | 'session' | 'gap' }>;

/** `true` requires the modifier, `false` requires its absence, `'any'` accepts both. */
export type ModifierRule = boolean | 'any';
/** Original fact, project choice, or slice-gap notice. */
export type BindingSource = 'original' | 'project' | 'gap';

export interface Binding {
  readonly code: string;
  readonly shift: ModifierRule;
  /** The effective Ctrl after AltGr normalization, not the raw `ctrlKey` flag. */
  readonly ctrl: ModifierRule;
  /** `'any'` unless the platform's NumLock report tells this keypad key's meanings apart. */
  readonly numLock: ModifierRule;
  readonly contexts: readonly InputContext[];
  readonly action: InputAction;
  /** Only a command repeats while held (spec 离散命令与重复). */
  readonly repeatable: boolean;
  readonly source: BindingSource;
}

/** The modifier state a press is matched under. */
export interface MatchModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly numLock: boolean;
}

export interface BindingConflict {
  readonly code: string;
  /** The contexts in which both bindings can match the same modifier state. */
  readonly contexts: readonly InputContext[];
  readonly bindings: readonly [Binding, Binding];
}

export interface BindingTable {
  readonly bindings: readonly Binding[];
  /** The one binding of `code` under `modifiers` in `context`, or null. */
  resolve(code: string, modifiers: MatchModifiers, context: InputContext | null): Binding | null;
  /** Whether `code` under `modifiers` has a binding in any context: page interception does not depend on the context. */
  bound(code: string, modifiers: MatchModifiers): boolean;
}

const ruleMatches = (rule: ModifierRule, value: boolean): boolean => rule === 'any' || rule === value;
const rulesOverlap = (a: ModifierRule, b: ModifierRule): boolean => a === 'any' || b === 'any' || a === b;

function matches(binding: Binding, { shift, ctrl, numLock }: MatchModifiers): boolean {
  return ruleMatches(binding.shift, shift) && ruleMatches(binding.ctrl, ctrl) && ruleMatches(binding.numLock, numLock);
}

/**
 * Every pair of bindings that one code, modifier state and context could select both of. A table without conflicts
 * gives each press at most one action (spec: 同一有效组合至多一个离散动作).
 */
export function findBindingConflicts(bindings: readonly Binding[]): readonly BindingConflict[] {
  const conflicts: BindingConflict[] = [];
  for (let i = 0; i < bindings.length; i += 1) {
    for (let j = i + 1; j < bindings.length; j += 1) {
      const a = bindings[i];
      const b = bindings[j];
      if (a.code !== b.code || !rulesOverlap(a.shift, b.shift) || !rulesOverlap(a.ctrl, b.ctrl) || !rulesOverlap(a.numLock, b.numLock)) continue;
      const contexts = a.contexts.filter(context => b.contexts.includes(context));
      if (contexts.length > 0) conflicts.push(Object.freeze({ code: a.code, contexts: Object.freeze(contexts), bindings: Object.freeze([a, b] as const) }));
    }
  }
  return Object.freeze(conflicts);
}

/** The contexts a held action may act in (spec 输入上下文): the axes stay 0 in map and base, fire only in flight. */
const HELD_CONTEXTS: Partial<Record<InputAction['kind'], readonly InputContext[]>> = {
  steer: ['flight', 'warp'],
  'primary-fire': ['flight'],
};

function freezeAction(action: InputAction): InputAction {
  return Object.freeze(action.kind === 'command' ? { ...action, command: Object.freeze({ ...action.command }) } : { ...action });
}

function copyBinding(binding: Binding, index: number): Binding {
  const where = `binding ${index} (${binding.code})`;
  if (binding.code === '') throw new Error(`${where}: code must not be empty`);
  if (binding.contexts.length === 0) throw new Error(`${where}: contexts must not be empty`);
  if (new Set(binding.contexts).size !== binding.contexts.length || binding.contexts.some(context => !INPUT_CONTEXTS.includes(context))) {
    throw new Error(`${where}: contexts must be distinct interaction contexts`);
  }
  const held = HELD_CONTEXTS[binding.action.kind];
  if (held && binding.contexts.some(context => !held.includes(context))) {
    throw new Error(`${where}: ${binding.action.kind} acts only in ${held.join(', ')}`);
  }
  if (binding.repeatable && binding.action.kind !== 'command') throw new Error(`${where}: only a command can repeat`);
  return Object.freeze({ ...binding, contexts: Object.freeze([...binding.contexts]), action: freezeAction(binding.action) });
}

/** Copies and freezes a table; throws on an invalid entry or any conflict, so a bad table fails as it loads. */
export function createBindingTable(entries: readonly Binding[]): BindingTable {
  const bindings = Object.freeze(entries.map(copyBinding));
  const conflict = findBindingConflicts(bindings)[0];
  if (conflict) throw new Error(`bindings conflict: ${conflict.code} in ${conflict.contexts.join(', ')}`);
  const byCode = new Map<string, Binding[]>();
  for (const binding of bindings) {
    const same = byCode.get(binding.code);
    if (same) same.push(binding);
    else byCode.set(binding.code, [binding]);
  }
  const table: BindingTable = {
    bindings,
    resolve: (code, modifiers, context) => (context === null ? undefined : byCode.get(code)
      ?.find(binding => binding.contexts.includes(context) && matches(binding, modifiers))) ?? null,
    bound: (code, modifiers) => byCode.get(code)?.some(binding => matches(binding, modifiers)) ?? false,
  };
  return Object.freeze(table);
}
