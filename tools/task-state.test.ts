import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markReviewed, resolveTask, routeTask, specReviewHash, withReviewMarker } from './task-state.ts';

const TASK = 'p1/07';
const DIR = 'docs/plan/p1/07';
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'task-state-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, text: string): void {
  const full = join(root, DIR, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function read(path: string): string {
  return readFileSync(join(root, DIR, path), 'utf8');
}

interface SpecOptions {
  status?: string;
  decisions?: string;
  approval?: string;
  acceptance?: string[];
}

function spec({ status = 'draft', decisions = '无。', approval = '待用户确认。', acceptance = ['AC-01', 'AC-02'] }: SpecOptions = {}): string {
  return [
    '---',
    'type: plan',
    `status: ${status}`,
    'phase: P1',
    'task: "07"',
    'updated: 2026-10-02',
    '---',
    '',
    '# P1-07：合成 — Spec',
    '',
    '## 范围',
    '',
    '- **S-01 合成交付：** 说明。',
    '- S-02：另一项。',
    '',
    '## 验收标准',
    '',
    '| ID | 条件 | 方法 |',
    '|---|---|---|',
    ...acceptance.map((id) => `| ${id} | 条件 | 方法 |`),
    '',
    '## 未决事项',
    '',
    decisions,
    '',
    '## 审批',
    '',
    approval,
    '',
  ].join('\n');
}

const ACCEPTED = { status: 'accepted', approval: '**2026-10-02 用户明确批准完整 Spec。**' };

interface Row {
  id: string;
  deps?: string[];
  status?: string;
  fileDeps?: string[];
}

function goal(rows: Row[], { status = 'accepted', coverage = ['S-01', 'S-02', 'AC-01', 'AC-02'] } = {}): string {
  return [
    '---',
    'type: plan',
    `status: ${status}`,
    'phase: P1',
    'task: "07"',
    'updated: 2026-10-02',
    '---',
    '',
    '# P1-07：合成 — Goal',
    '',
    '## 验收覆盖',
    '',
    '| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |',
    '|---|---|---|',
    ...coverage.map((id) => `| ${id} | 01 | 02 |`),
    '',
    '## 子任务跟踪',
    '',
    '| 子任务 | 依赖 | 状态 |',
    '|---|---|---|',
    ...rows.map(({ id, deps = [], status: s = 'pending' }) => `| [${id}-work.md](./subtasks/${id}-work.md) | ${deps.join(', ') || '—'} | ${s} |`),
    '',
    '## 执行记录',
    '',
    '## 审批',
    '',
    '待用户确认。',
    '',
  ].join('\n');
}

function subtask(deps: string[]): string {
  return `---\ntype: plan\nstatus: active\n---\n\n# 合成\n\n**依赖：** ${deps.length ? `${deps.join(', ')}。` : '无。'}\n`;
}

function plan(rows: Row[], options?: Parameters<typeof goal>[1]): void {
  write('spec.md', spec(ACCEPTED));
  write('goal.md', goal(rows, options));
  for (const row of rows) write(`subtasks/${row.id}-work.md`, subtask(row.fileDeps ?? row.deps ?? []));
}

const route = () => routeTask(root, TASK);

describe('resolveTask', () => {
  it('accepts selectors and spec/goal paths', () => {
    for (const selector of ['p1/07', 'docs/plan/p1/07', 'docs/plan/p1/07/spec.md', '/abs/repo/docs/plan/p1/07/goal.md']) {
      expect(resolveTask(selector)).toEqual({ phase: 'p1', task: '07', dir: DIR });
    }
  });

  it('rejects unknown phases, unpadded tasks and free text', () => {
    for (const selector of ['p7/01', 'p1/7', 'P1-07', 'spec.md']) {
      expect(() => resolveTask(selector)).toThrow(/cannot resolve task/);
    }
  });
});

describe('spec stages', () => {
  it('starts at generate-spec when no spec exists', () => {
    expect(route()).toMatchObject({ node: 'generate-spec', kind: 'agent', command: `/generate-spec ${TASK} <task description>` });
  });

  it('requires review of a draft spec until it carries a matching review marker', () => {
    write('spec.md', spec());
    expect(route()).toMatchObject({ node: 'review-spec', kind: 'agent', reason: 'spec has not been reviewed', command: `/review-spec ${DIR}/spec.md` });

    const marker = markReviewed(root, TASK);
    expect(read('spec.md')).toContain(`reviewed: ${marker}\n---`);
    expect(route()).toMatchObject({ node: 'approve-spec', kind: 'human', details: [] });

    write('spec.md', read('spec.md').replace('另一项', '修改后的另一项'));
    expect(route()).toMatchObject({ node: 'review-spec', reason: 'spec changed after its last review' });
  });

  it('keeps one marker and a stable hash when marked again', () => {
    const once = withReviewMarker(spec());
    const twice = withReviewMarker(once);
    expect(twice).toBe(once);
    expect(twice.match(/^reviewed:/gm)).toHaveLength(1);
    expect(specReviewHash(twice)).toBe(specReviewHash(spec()));
    expect(specReviewHash(spec().replace(/\n/g, '\r\n'))).toBe(specReviewHash(spec()));
    const bodyLine = spec().replace('## 审批', 'reviewed: 正文中的同名行\n\n## 审批');
    expect(specReviewHash(bodyLine)).not.toBe(specReviewHash(spec()));
  });

  it('surfaces open decisions at the approval gate', () => {
    write('spec.md', withReviewMarker(spec({ decisions: '技术决定 2 需用户确认。' })));
    const state = route();
    expect(state).toMatchObject({ node: 'approve-spec', reason: 'spec reviewed; open decisions must be resolved before approval' });
    expect(state.details).toEqual(['未决事项: 技术决定 2 需用户确认。']);
  });

  it('does not require review once the spec is accepted', () => {
    write('spec.md', spec(ACCEPTED));
    expect(route()).toMatchObject({ node: 'generate-goal', command: `/generate-goal ${DIR}/spec.md` });
  });

  it('flags an accepted spec without approval record or with open decisions', () => {
    write('spec.md', spec({ status: 'accepted', decisions: '待定。' }));
    expect(route()).toMatchObject({
      node: 'repair-plan',
      details: ['spec is accepted but 未决事项 is not "无"', 'spec is accepted but 审批 has no approval record'],
    });
  });

  it('flags unknown document statuses', () => {
    write('spec.md', spec({ status: 'active' }));
    expect(route()).toMatchObject({ node: 'repair-plan', reason: 'spec status "active" is not draft or accepted' });
  });
});

describe('goal stages', () => {
  const valid: Row[] = [{ id: '01' }, { id: '02', deps: ['01'] }, { id: '03', deps: ['01', '02'] }];

  it('regenerates a goal whose coverage drifted from the spec', () => {
    plan(valid, { coverage: ['S-01', 'S-02', 'AC-01', 'AC-09'] });
    expect(route()).toMatchObject({
      node: 'generate-goal',
      reason: 'goal is stale against the accepted spec',
      details: ['goal coverage is missing AC-02', 'goal covers AC-09, which the spec no longer defines'],
    });
  });

  it('waits for goal approval when the plan is valid', () => {
    plan(valid, { status: 'draft' });
    expect(route()).toMatchObject({ node: 'approve-goal', kind: 'human', details: ['3 subtasks'] });
  });

  it('reports every structural tracker problem', () => {
    plan([
      { id: '01', deps: ['03'] },
      { id: '01', deps: ['03'], status: 'done' },
      { id: '02', deps: ['02', '09'] },
      { id: '03', deps: ['01'], fileDeps: [] },
    ]);
    write('subtasks/04-extra.md', subtask([]));
    rmSync(join(root, DIR, 'subtasks/02-work.md'));
    const { node, details } = route();
    expect(node).toBe('repair-plan');
    expect(details).toEqual([
      'duplicate subtask ID 01',
      'subtask 01 has invalid status "done"',
      'subtask 02 depends on itself',
      'subtask 02 depends on unknown 09',
      'subtask file missing: subtasks/02-work.md',
      'subtasks/03-work.md dependencies (无) differ from tracker (01)',
      'orphan subtask file not in tracker: subtasks/04-extra.md',
      'dependency cycle: 01 -> 03 -> 01',
      'final alignment 03 must depend on every other subtask; missing 02',
    ]);
  });

  it('resumes the lowest in-progress row before starting pending work', () => {
    plan([{ id: '01', status: 'completed' }, { id: '02', deps: ['01'] }, { id: '03', deps: ['01'], status: 'in-progress' }, { id: '04', deps: ['01', '02', '03'] }]);
    expect(route()).toMatchObject({ node: 'execute-goal', subtask: '03', reason: 'subtask 03 is in progress', command: `/execute-goal ${DIR}/goal.md` });
  });

  it('starts the lowest eligible pending row', () => {
    plan([{ id: '01', status: 'completed' }, { id: '02', deps: ['01'] }, { id: '03', deps: ['01', '02'] }]);
    expect(route()).toMatchObject({ node: 'execute-goal', subtask: '02', reason: 'subtask 02 is eligible' });
  });

  it('stops at a human gate when only blocked work remains', () => {
    plan([{ id: '01', status: 'completed' }, { id: '02', deps: ['01'], status: 'blocked' }, { id: '03', deps: ['01', '02'] }]);
    expect(route()).toMatchObject({ node: 'resolve-blocker', kind: 'human', details: ['blocked: subtasks/02-work.md'] });
  });

  it('continues independent work while another row is blocked', () => {
    plan([{ id: '01', status: 'completed' }, { id: '02', deps: ['01'], status: 'blocked' }, { id: '03', deps: ['01'] }, { id: '04', deps: ['01', '02', '03'] }]);
    expect(route()).toMatchObject({ node: 'execute-goal', subtask: '03' });
  });

  it('never selects a row whose dependencies are unfinished', () => {
    plan([{ id: '01' }, { id: '02', deps: ['01'], status: 'in-progress' }, { id: '03', deps: ['01', '02'] }]);
    expect(route()).toMatchObject({ node: 'execute-goal', subtask: '01' });
  });

  it('finishes when every row is completed', () => {
    plan(valid.map((row) => ({ ...row, status: 'completed' })));
    expect(route()).toMatchObject({ node: 'done', kind: 'terminal' });
  });

  it('changes the fingerprint only when planning documents change', () => {
    plan(valid);
    const before = route().fingerprint;
    expect(route().fingerprint).toBe(before);
    write('subtasks/01-work.md', `${subtask([])}\n## 完成证据\n\n- 合成证据。\n`);
    expect(route().fingerprint).not.toBe(before);
  });
});

describe('CLI', () => {
  const script = resolve(import.meta.dirname, 'task-state.ts');
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('prints the route as JSON for a task without documents', () => {
    const result = run('p6/99', '--json');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ task: 'p6/99', node: 'generate-spec', kind: 'agent' });
  });

  it('fails on usage and selector errors', () => {
    expect(run().status).toBe(2);
    expect(run('p1/01', '--force').status).toBe(2);
    const bad = run('nowhere');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/cannot resolve task/);
  });
});
