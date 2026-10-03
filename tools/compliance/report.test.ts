import { describe, expect, it } from 'vitest';
import { ComplianceError, diagnostic, relativePath, report, serializeReport, packageIdentity, sourceIdentity } from './report.ts';

const counts = Object.fromEntries(['worktree', 'index', 'untracked', 'build'].map(scope => [scope, { checked: 0, completed: true }]));
describe('local report contract', () => {
  it('passes only explicit complete required ranges', () => {
    expect(report('original', { counts, findings: [] })).toMatchObject({ format: 'osr-local-compliance', version: 1, kind: 'original', passed: true });
    expect(report('original', { counts: {}, findings: [] }).passed).toBe(false);
    expect(report('licenses', { counts, findings: [] }).passed).toBe(false);
    expect(report('compliance', { counts, findings: [] }).passed).toBe(false);
    expect(report('original', { counts: { ...counts, index: { checked: 1, completed: false } }, findings: [] }).passed).toBe(false);
    expect(report('original', { counts, findings: [{ code: 'hit', path: 'renamed.txt', reason: 'Complete file hash matched' }] }).passed).toBe(false);
    expect(report('compliance', {
      counts: { ...counts, ...Object.fromEntries(['dependencies', 'distribution', 'artifacts'].map(scope => [scope, { checked: 1, completed: true }])) },
      findings: [],
    }).passed).toBe(true);
  });
  it('sorts output deterministically and preserves explicit failure reasons', () => {
    const findings = [{ code: 'z', path: 'z', reason: 'Missing input' }, { code: 'a', path: 'a', reason: 'Bad table' }];
    expect(serializeReport(report('original', { counts, findings }))).toBe(serializeReport(report('original', { counts, findings: findings.toReversed() })));
    expect(diagnostic(new ComplianceError('bad-table', 'Required table missing', 'docs/manifest.md'))).toEqual({ code: 'bad-table', reason: 'Required table missing', path: 'docs/manifest.md' });
  });
  it.each(['/private/person/secret', '../local/file', 'C:\\private\\file', 'a/../file', '', './file'])('rejects non-relative paths %s', path => {
    expect(() => relativePath(path)).toThrow();
  });
  it('does not forward arbitrary errors, private paths or contents into JSON', () => {
    const error = Object.assign(new Error('/private/person contains secret=synthetic-test-secret'), { code: 'ENOENT' });
    const output = serializeReport(report('original', { counts: {}, findings: [diagnostic(error)] }));
    expect(output).toContain('ENOENT');
    expect(output).not.toContain('/private');
    expect(output).not.toContain('synthetic-test-secret');
  });
  it('rejects unknown or invalid counts instead of claiming completion', () => {
    expect(() => report('original', { counts: { index: { checked: -1, completed: true } }, findings: [] })).toThrow();
  });
  it('validates package and source ownership instead of forwarding host paths', () => {
    expect(packageIdentity('@scope/name@1.2.3#node_modules/.pnpm/name@1.2.3_peer@2.0.0/node_modules/@scope/name')).toContain('@1.2.3');
    expect(sourceIdentity('project:src/main.tsx')).toBe('project:src/main.tsx');
    for (const value of ['/private/person', 'name@1.0.0#/private/person', 'name@1.0.0#../local/file']) expect(() => packageIdentity(value)).toThrow();
    expect(() => sourceIdentity('project:/private/person')).toThrow();
    expect(() => report('original', { counts, findings: [{ code: 'bad', reason: 'Invalid package', package: '/private/person' }] })).toThrow();
  });
});
