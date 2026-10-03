import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ComplianceError } from './report.ts';
import { safeFile } from './scan.ts';

export const COMPLIANCE_OUTPUTS = ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt', 'compliance-inventory.json'] as const;
export function clearComplianceOutputs(root: string): void {
  if (!existsSync(join(root, 'dist'))) return;
  safeFile(root, 'dist');
  const failures: unknown[] = [];
  for (const name of COMPLIANCE_OUTPUTS) for (const suffix of ['', '.tmp']) {
    const path = `dist/${name}${suffix}`;
    if (!existsSync(join(root, path))) continue;
    try { unlinkSync(safeFile(root, path)); } catch (cause) { failures.push(cause); }
  }
  if (failures.length) throw new ComplianceError('cleanup-outputs', 'Previous compliance outputs could not all be invalidated');
}
