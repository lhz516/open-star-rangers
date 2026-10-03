import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readManifest } from './manifest.ts';
import { runGit, safeFile, scanOriginal } from './scan.ts';
import { clearComplianceOutputs } from './outputs.ts';
import { ComplianceError, diagnostic, report, requiredScopes, serializeReport, type ReportKind } from './report.ts';

function rootDirectory(directory: string): string {
  const root = resolve(directory);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ComplianceError('unsafe-root', 'CLI requires an ordinary repository root');
  const top = runGit(root, ['rev-parse', '--show-toplevel']).toString('utf8').replace(/\n$/, '');
  if (realpathSync(root) !== realpathSync(top)) throw new ComplianceError('repository-root', 'CLI must cover the complete repository root');
  return realpathSync(root);
}
function failed(kind: ReportKind, cause: unknown) {
  return report(kind, {
    counts: Object.fromEntries(requiredScopes(kind).map(scope => [scope, { checked: 0, completed: false }])),
    findings: [diagnostic(cause)],
  });
}

export function checkOriginal(root: string) {
  try { return scanOriginal(root, readManifest(safeFile(root, 'docs/original/manifest.md'))); }
  catch (cause) {
    const finding = diagnostic(cause);
    return failed('original', new ComplianceError(finding.code, finding.reason, finding.path ?? 'docs/original/manifest.md'));
  }
}

export async function checkLicenses(root: string) {
  const counts = {
    dependencies: { checked: 0, completed: false },
    distribution: { checked: 0, completed: false },
    artifacts: { checked: 0, completed: false },
  };
  try {
    const { auditPackages } = await import('./packages.ts');
    const { ordinaryFiles, validateInventory } = await import('./distribution.ts');
    const { ownLicense, thirdPartyNotices } = await import('./notices.ts');
    const audit = auditPackages(root);
    counts.dependencies = { checked: audit.packages.length, completed: true };
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(safeFile(root, 'dist/compliance-inventory.json'), 'utf8')); } catch (cause) {
      const finding = diagnostic(cause);
      throw new ComplianceError('inventory-read', `Current inventory cannot be read (${finding.code}); rebuild current code`, 'dist/compliance-inventory.json');
    }
    const inventory = validateInventory(root, raw, audit);
    counts.distribution = { checked: inventory.artifacts.length, completed: true };
    const own = ownLicense(root);
    const thirdParty = thirdPartyNotices(root, audit, inventory.dependencies);
    for (const [name, expected] of [['LICENSE.txt', own.text], ['THIRD-PARTY-NOTICES.txt', thirdParty.text]] as const) {
      if (readFileSync(safeFile(root, `dist/${name}`), 'utf8') !== expected) throw new ComplianceError('notice-mismatch', 'Current statement does not retain the required exact license/NOTICE text', `dist/${name}`);
    }
    counts.artifacts = { checked: ordinaryFiles(root, 'dist').length, completed: true };
    return report('licenses', {
      counts, findings: [], dependencies: inventory.dependencies, distribution: inventory.artifacts, fingerprints: inventory.inputs, coverage: inventory.coverage,
    });
  } catch (cause) {
    return report('licenses', { counts, findings: [diagnostic(cause)] });
  }
}

export async function executeCompliance(kind: ReportKind, directory: string) {
  let root: string;
  try { root = rootDirectory(directory); } catch (cause) { return failed(kind, cause); }
  if (kind === 'original') return checkOriginal(root);
  if (kind === 'licenses') return checkLicenses(root);
  let stage = 'cleanup';
  try {
    clearComplianceOutputs(root);
    stage = 'build';
    const { queryPnpm } = await import('./packages.ts');
    queryPnpm(['build'], root);
  } catch (cause) {
    const result = failed('compliance', cause);
    return { ...result, findings: result.findings.map(finding => ({ ...finding, scope: stage })) };
  }
  const original = checkOriginal(root);
  const licenses = await checkLicenses(root);
  const findings = [...original.findings, ...licenses.findings];
  const fingerprints = new Map<string, typeof original.fingerprints[number]>();
  // Reject input drift between the two independent checks.
  for (const fingerprint of [...original.fingerprints, ...licenses.fingerprints]) {
    if (fingerprints.has(fingerprint.path) && fingerprints.get(fingerprint.path)!.sha256 !== fingerprint.sha256) {
      findings.push({ code: 'input-snapshot-mismatch', path: fingerprint.path, reason: 'Independent checks observed different input fingerprints' });
    }
    fingerprints.set(fingerprint.path, fingerprint);
  }
  return report('compliance', {
    counts: { ...original.counts, ...licenses.counts }, findings,
    dependencies: licenses.dependencies, distribution: licenses.distribution,
    fingerprints: [...fingerprints.values()], ...(licenses.coverage ? { coverage: licenses.coverage } : {}),
  });
}

async function main(args: string[]): Promise<void> {
  const selected = args[0];
  const kind: ReportKind = selected === 'original' || selected === 'licenses' || selected === 'compliance' ? selected : 'compliance';
  let result: ReturnType<typeof report>;
  if (selected !== kind || (args.length !== 1 && !(args.length === 3 && args[1] === '--root' && args[2].trim()))) {
    result = failed(kind, new ComplianceError('cli-arguments', 'Use original, licenses or compliance with optional --root directory'));
  } else result = await executeCompliance(kind, args.length === 3 ? args[2] : process.cwd());
  process.stdout.write(serializeReport(result));
  process.exitCode = result.passed ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) await main(process.argv.slice(2));
