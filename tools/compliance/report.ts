import { createHash } from 'node:crypto';

export type ReportKind = 'original' | 'licenses' | 'compliance';
export interface Finding { readonly code: string; readonly reason: string; readonly path?: string; readonly package?: string }
export interface Count { readonly checked: number; readonly completed: boolean }
export interface Fingerprint { readonly path: string; readonly sha256: string }
export interface DependencyEvidence {
  readonly identity: string;
  readonly name: string;
  readonly version: string;
  readonly instance: string;
  readonly license: string;
  readonly direct: boolean;
  readonly distributed: boolean;
  readonly classification: string;
  readonly selectedLicenses: readonly string[];
}
export interface ArtifactEvidence extends Fingerprint { readonly sources: readonly string[] }
export interface ReportInput {
  readonly counts: Readonly<Record<string, Count>>;
  readonly findings: readonly Finding[];
  readonly dependencies?: readonly DependencyEvidence[];
  readonly distribution?: readonly ArtifactEvidence[];
  readonly fingerprints?: readonly Fingerprint[];
}

export class ComplianceError extends Error {
  readonly finding: Finding;
  constructor(code: string, reason: string, path?: string) {
    super(reason);
    this.name = 'ComplianceError';
    this.finding = { code, reason, ...(path === undefined ? {} : { path: relativePath(path) }) };
  }
}

export function relativePath(path: string): string {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new ComplianceError('unsafe-path', 'Expected a nonempty root-relative path');
  }
  return path;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

export function packageIdentity(value: string): string {
  const match = /^((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]+)?)(?:#(.+))?$/.exec(value);
  if (!match) throw new ComplianceError('invalid-package-identity', 'Expected an exact package name/version and optional relative instance');
  if (match[3]) relativePath(match[3]);
  return value;
}

export function sourceIdentity(value: string): string {
  if (value.startsWith('package:')) packageIdentity(value.slice(8));
  else if (value.startsWith('project:')) relativePath(value.slice(8));
  else if (value.startsWith('generated:')) relativePath(value.slice(10));
  else throw new ComplianceError('invalid-source-identity', 'Expected explicit package, project or generated ownership');
  return value;
}

export function diagnostic(error: unknown): Finding {
  if (error instanceof ComplianceError) return error.finding;
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    && /^[A-Z_]{1,32}$/.test(error.code) ? error.code : 'unexpected-error';
  return { code, reason: `Required operation failed (${code}); no input contents or host paths are included.` };
}

export function report(kind: ReportKind, input: ReportInput) {
  const required = [
    ...(kind === 'licenses' ? [] : ['worktree', 'index', 'untracked', 'build']),
    ...(kind === 'original' ? [] : ['dependencies', 'distribution', 'artifacts']),
  ];
  const counts = Object.fromEntries(Object.entries(input.counts).sort(([a], [b]) => compare(a, b)));
  for (const count of Object.values(counts)) {
    if (!Number.isSafeInteger(count.checked) || count.checked < 0 || typeof count.completed !== 'boolean') {
      throw new ComplianceError('invalid-report', 'Counts require nonnegative safe integers and explicit completion');
    }
  }
  const findings = [...input.findings].map(finding => ({
    ...finding, ...(finding.path === undefined ? {} : { path: relativePath(finding.path) }),
    ...(finding.package === undefined ? {} : { package: packageIdentity(finding.package) }),
  })).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  const fingerprints = [...(input.fingerprints ?? [])].map(fingerprint => ({
    path: relativePath(fingerprint.path), sha256: fingerprint.sha256,
  })).sort((a, b) => compare(a.path, b.path));
  const distribution = [...(input.distribution ?? [])].map(artifact => ({
    ...artifact, path: relativePath(artifact.path), sources: artifact.sources.map(sourceIdentity).sort(compare),
  })).sort((a, b) => compare(a.path, b.path));
  return {
    format: 'osr-local-compliance' as const, version: 1 as const, kind,
    passed: findings.length === 0 && required.every(scope => counts[scope]?.completed === true),
    counts, findings,
    dependencies: [...(input.dependencies ?? [])].map(dependency => ({
      ...dependency, identity: packageIdentity(dependency.identity), instance: relativePath(dependency.instance),
    })).sort((a, b) => compare(a.identity, b.identity)),
    distribution, fingerprints,
  };
}

export function serializeReport(value: ReturnType<typeof report>): string { return `${JSON.stringify(value, null, 2)}\n`; }
