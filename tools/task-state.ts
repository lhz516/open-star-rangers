// Deterministic router for the spec -> review -> goal -> execute task graph.
// Reads only the task's planning documents and reports the next node; it never runs a skill.
// Usage: node tools/task-state.ts <p1/03 | docs/plan/p1/03[/spec.md|/goal.md]> [--json] [--mark-reviewed]
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type NodeId =
  | 'generate-spec'
  | 'review-spec'
  | 'approve-spec'
  | 'generate-goal'
  | 'approve-goal'
  | 'execute-goal'
  | 'resolve-blocker'
  | 'repair-plan'
  | 'done';

export type NodeKind = 'agent' | 'human' | 'terminal';

export interface TaskState {
  task: string;
  node: NodeId;
  kind: NodeKind;
  reason: string;
  /** Slash command for agent nodes. */
  command?: string;
  /** Next subtask ID for execute-goal. */
  subtask?: string;
  details: string[];
  /** Hash of all planning documents; unchanged across a node means no progress. */
  fingerprint: string;
}

export interface TaskRef {
  phase: string;
  task: string;
  /** Repository-relative task directory with `/` separators. */
  dir: string;
}

export interface TrackerRow {
  id: string;
  file: string;
  deps: string[];
  status: string;
}

const KIND: Record<NodeId, NodeKind> = {
  'generate-spec': 'agent',
  'review-spec': 'agent',
  'approve-spec': 'human',
  'generate-goal': 'agent',
  'approve-goal': 'human',
  'execute-goal': 'agent',
  'resolve-blocker': 'human',
  'repair-plan': 'human',
  done: 'terminal',
};

const TRACKER_STATUSES = new Set(['pending', 'in-progress', 'blocked', 'completed']);
const DOC_STATUSES = new Set(['draft', 'accepted']);
const NO_DEPS = new Set(['', '—', '-', '无']);

export function resolveTask(selector: string): TaskRef {
  const match = /(?:^|[\\/])(p[1-6])[\\/](\d{2,})(?:[\\/]|$)/.exec(selector.trim());
  if (!match) {
    throw new Error(`cannot resolve task from "${selector}"; expected p1/03 or docs/plan/p1/03/spec.md`);
  }
  const [, phase, task] = match;
  return { phase, task, dir: `docs/plan/${phase}/${task}` };
}

export function frontMatter(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (field) fields.set(field[1], field[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return fields;
}

/** Body of a `## heading` section, or undefined when the section is absent. */
export function section(text: string, heading: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return undefined;
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

/** Hash of the spec with its own `reviewed:` marker removed, so any later edit invalidates the review. */
export function specReviewHash(text: string): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, (block) => block.replace(/^reviewed:.*\n/m, ''));
  return `sha256:${createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`;
}

export function withReviewMarker(text: string): string {
  const marker = `reviewed: ${specReviewHash(text)}`;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) throw new Error('spec has no front matter');
  if (/^reviewed:.*$/m.test(match[1])) {
    return text.replace(/^reviewed:.*$/m, marker);
  }
  const closing = match[0].lastIndexOf('---');
  return `${text.slice(0, closing)}${marker}\n${text.slice(closing)}`;
}

/** Scope and acceptance IDs defined by a spec (`- S-01：` or `- **S-01 …**` items and `| AC-01 |` rows). */
export function definedIds(spec: string): string[] {
  const ids = new Set<string>();
  for (const match of spec.matchAll(/^\s*(?:-|\|)\s*(?:\*\*|__)?((?:S|AC)-\d+)(?=[\s:：|*_])/gm)) ids.add(match[1]);
  return [...ids];
}

/** IDs listed in the first column of the goal's coverage table. */
export function coveredIds(goal: string): string[] {
  const body = section(goal, '验收覆盖') ?? '';
  const ids = new Set<string>();
  for (const match of body.matchAll(/^\|\s*((?:S|AC)-\d+)\s*\|/gm)) ids.add(match[1]);
  return [...ids];
}

function parseIds(cell: string): string[] {
  const value = cell.trim().replace(/[。.]$/, '');
  if (NO_DEPS.has(value)) return [];
  return value.split(/[,，、\s]+/).filter(Boolean);
}

export function parseTracker(goal: string): TrackerRow[] {
  const body = section(goal, '子任务跟踪') ?? '';
  const rows: TrackerRow[] = [];
  for (const line of body.split('\n')) {
    const match = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|([^|]*)\|([^|]*)\|\s*$/.exec(line.trim());
    if (!match) continue;
    const [, label, target, deps, status] = match;
    rows.push({
      id: /^(\d+)-/.exec(label)?.[1] ?? label,
      file: target.replace(/^\.\//, ''),
      deps: parseIds(deps),
      status: status.trim(),
    });
  }
  return rows;
}

function findCycle(rows: TrackerRow[]): string[] | undefined {
  const deps = new Map(rows.map((row) => [row.id, row.deps]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | undefined => {
    if (state.get(id) === 'done') return undefined;
    if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      // Unknown and self dependencies are reported separately.
      if (!deps.has(dep) || dep === id) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return undefined;
  };
  for (const row of rows) {
    const cycle = visit(row.id);
    if (cycle) return cycle;
  }
  return undefined;
}

/** Structural problems that make the tracker unsafe to execute. */
export function trackerProblems(rows: TrackerRow[], taskDir: string): string[] {
  if (rows.length === 0) return ['goal tracker has no subtask rows'];
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (!/^\d{2,}$/.test(row.id)) problems.push(`subtask "${row.id}" is not a zero-padded numeric ID`);
    if (ids.has(row.id)) problems.push(`duplicate subtask ID ${row.id}`);
    ids.add(row.id);
    if (!TRACKER_STATUSES.has(row.status)) problems.push(`subtask ${row.id} has invalid status "${row.status}"`);
    if (!row.file.startsWith('subtasks/')) problems.push(`subtask ${row.id} link is outside subtasks/: ${row.file}`);
  }
  for (const row of rows) {
    for (const dep of row.deps) {
      if (dep === row.id) problems.push(`subtask ${row.id} depends on itself`);
      else if (!ids.has(dep)) problems.push(`subtask ${row.id} depends on unknown ${dep}`);
    }
    const path = join(taskDir, row.file);
    if (!existsSync(path)) {
      problems.push(`subtask file missing: ${row.file}`);
      continue;
    }
    const line = /^\*\*依赖：\*\*\s*(.*)$/m.exec(readFileSync(path, 'utf8'))?.[1];
    const fileDeps = line === undefined ? undefined : parseIds(line);
    if (fileDeps === undefined) problems.push(`${row.file} has no **依赖：** line`);
    else if ([...fileDeps].sort().join() !== [...row.deps].sort().join()) {
      problems.push(`${row.file} dependencies (${fileDeps.join(', ') || '无'}) differ from tracker (${row.deps.join(', ') || '无'})`);
    }
  }
  const subtaskDir = join(taskDir, 'subtasks');
  const linked = new Set(rows.map((row) => row.file));
  if (existsSync(subtaskDir)) {
    for (const name of readdirSync(subtaskDir).filter((n) => n.endsWith('.md'))) {
      if (!linked.has(`subtasks/${name}`)) problems.push(`orphan subtask file not in tracker: subtasks/${name}`);
    }
  }
  const cycle = findCycle(rows);
  if (cycle) problems.push(`dependency cycle: ${cycle.join(' -> ')}`);
  const final = rows.at(-1)!;
  const missing = rows.slice(0, -1).filter((row) => !final.deps.includes(row.id));
  if (missing.length > 0) {
    problems.push(`final alignment ${final.id} must depend on every other subtask; missing ${missing.map((r) => r.id).join(', ')}`);
  }
  return problems;
}

function fingerprint(taskDir: string): string {
  const hash = createHash('sha256');
  const files = ['spec.md', 'goal.md'].filter((name) => existsSync(join(taskDir, name)));
  const subtaskDir = join(taskDir, 'subtasks');
  if (existsSync(subtaskDir)) {
    files.push(...readdirSync(subtaskDir).filter((n) => n.endsWith('.md')).sort().map((n) => `subtasks/${n}`));
  }
  for (const file of files) hash.update(`${file}\0`).update(readFileSync(join(taskDir, file))).update('\0');
  return hash.digest('hex').slice(0, 12);
}

export function routeTask(root: string, selector: string): TaskState {
  const ref = resolveTask(selector);
  const taskDir = join(root, ref.dir);
  const specPath = `${ref.dir}/spec.md`;
  const goalPath = `${ref.dir}/goal.md`;
  const task = `${ref.phase}/${ref.task}`;
  const state = (node: NodeId, reason: string, extra: Partial<TaskState> = {}): TaskState => ({
    task,
    node,
    kind: KIND[node],
    reason,
    details: [],
    fingerprint: fingerprint(taskDir),
    ...extra,
  });

  if (!existsSync(join(root, specPath))) {
    return state('generate-spec', 'spec.md does not exist', { command: `/generate-spec ${task} <task description>` });
  }
  const spec = readFileSync(join(root, specPath), 'utf8');
  const specMeta = frontMatter(spec);
  const specStatus = specMeta.get('status') ?? '';
  if (!DOC_STATUSES.has(specStatus)) {
    return state('repair-plan', `spec status "${specStatus}" is not draft or accepted`);
  }
  const decisions = section(spec, '未决事项');
  const openDecisions = decisions === undefined || !decisions.startsWith('无');
  const approval = section(spec, '审批');
  const approvalRecorded = approval !== undefined && approval !== '' && !approval.startsWith('待用户确认');

  if (specStatus === 'draft') {
    if (specMeta.get('reviewed') !== specReviewHash(spec)) {
      const reason = specMeta.has('reviewed') ? 'spec changed after its last review' : 'spec has not been reviewed';
      return state('review-spec', reason, { command: `/review-spec ${specPath}` });
    }
    return state(
      'approve-spec',
      openDecisions ? 'spec reviewed; open decisions must be resolved before approval' : 'spec reviewed; awaiting explicit user approval',
      { details: openDecisions ? [`未决事项: ${decisions ?? '(section missing)'}`] : [] },
    );
  }

  const inconsistent = [
    ...(openDecisions ? ['spec is accepted but 未决事项 is not "无"'] : []),
    ...(approvalRecorded ? [] : ['spec is accepted but 审批 has no approval record']),
  ];
  if (inconsistent.length > 0) return state('repair-plan', 'accepted spec is inconsistent', { details: inconsistent });

  if (!existsSync(join(root, goalPath))) {
    return state('generate-goal', 'spec is accepted and goal.md does not exist', { command: `/generate-goal ${specPath}` });
  }
  const goal = readFileSync(join(root, goalPath), 'utf8');
  const specIds = definedIds(spec);
  const goalIds = coveredIds(goal);
  const stale = [
    ...specIds.filter((id) => !goalIds.includes(id)).map((id) => `goal coverage is missing ${id}`),
    ...goalIds.filter((id) => !specIds.includes(id)).map((id) => `goal covers ${id}, which the spec no longer defines`),
  ];
  if (stale.length > 0) {
    return state('generate-goal', 'goal is stale against the accepted spec', { command: `/generate-goal ${specPath}`, details: stale });
  }

  const rows = parseTracker(goal);
  const problems = trackerProblems(rows, taskDir);
  if (problems.length > 0) return state('repair-plan', 'goal tracker is structurally invalid', { details: problems });

  const goalStatus = frontMatter(goal).get('status') ?? '';
  if (!DOC_STATUSES.has(goalStatus)) return state('repair-plan', `goal status "${goalStatus}" is not draft or accepted`);
  if (goalStatus === 'draft') {
    return state('approve-goal', 'goal is valid; awaiting explicit user approval', { details: [`${rows.length} subtasks`] });
  }

  const status = new Map(rows.map((row) => [row.id, row.status]));
  const ready = (row: TrackerRow) => row.deps.every((dep) => status.get(dep) === 'completed');
  if (rows.every((row) => row.status === 'completed')) return state('done', 'every subtask is completed');
  const next =
    rows.find((row) => row.status === 'in-progress' && ready(row)) ?? rows.find((row) => row.status === 'pending' && ready(row));
  if (next) {
    return state('execute-goal', `subtask ${next.id} is ${next.status === 'in-progress' ? 'in progress' : 'eligible'}`, {
      command: `/execute-goal ${goalPath}`,
      subtask: next.id,
    });
  }
  const blocked = rows.filter((row) => row.status === 'blocked');
  // An acyclic tracker always has an eligible or blocked row, so only blockers remain here.
  return state('resolve-blocker', 'no eligible subtask; blocked rows need their recorded prerequisite', {
    details: blocked.map((row) => `blocked: ${row.file}`),
  });
}

export function markReviewed(root: string, selector: string): string {
  const path = join(root, resolveTask(selector).dir, 'spec.md');
  if (!existsSync(path)) throw new Error(`spec does not exist: ${relative(root, path)}`);
  const text = withReviewMarker(readFileSync(path, 'utf8'));
  writeFileSync(path, text);
  return specReviewHash(text);
}

function format(state: TaskState): string {
  return [
    `${state.task} -> ${state.node} (${state.kind})`,
    `reason: ${state.reason}`,
    ...(state.command ? [`run: ${state.command}`] : []),
    ...(state.subtask ? [`next subtask: ${state.subtask}`] : []),
    ...state.details.map((detail) => `- ${detail}`),
    `fingerprint: ${state.fingerprint}`,
  ].join('\n');
}

function main(argv: string[]): number {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const [selector, ...rest] = argv.filter((arg) => !arg.startsWith('--'));
  const unknown = [...flags].filter((flag) => flag !== '--json' && flag !== '--mark-reviewed');
  if (!selector || rest.length > 0 || unknown.length > 0) {
    console.error('usage: node tools/task-state.ts <p1/03 | docs/plan/p1/03/spec.md> [--json] [--mark-reviewed]');
    return 2;
  }
  const root = resolve(import.meta.dirname, '..');
  try {
    if (flags.has('--mark-reviewed')) markReviewed(root, selector);
    const state = routeTask(root, selector);
    console.log(flags.has('--json') ? JSON.stringify(state, null, 2) : format(state));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
