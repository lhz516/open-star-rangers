import { readFileSync } from 'node:fs';
import { ComplianceError, relativePath, sha256 } from './report.ts';

/** A manifest row; game rows carry their validated byte size, image rows have no size column. */
export type BlacklistEntry =
  | { readonly table: 'images'; readonly source: string; readonly sha256: string; readonly size: null }
  | { readonly table: 'game'; readonly source: string; readonly sha256: string; readonly size: number };
export interface Blacklist { readonly entries: readonly BlacklistEntry[]; readonly fingerprint: string }

export function parseManifest(text: string): Blacklist {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const entries: BlacklistEntry[] = [];
  for (const table of ['images', 'game'] as const) {
    const headings = lines.flatMap((line, index) => (table === 'images' ? /^## 光盘镜像$/.test(line)
      : /^## 游戏文件（光盘 `MAIN\/` 与 `FLICS\/`）$/.test(line)) ? [index] : []);
    if (headings.length !== 1) throw new ComplianceError('manifest-table', `Required ${table} heading must occur exactly once`);
    let index = headings[0] + 1;
    while (lines[index]?.trim() === '') index++;
    const columns = table === 'images' ? ['文件', 'SHA-256'] : ['路径', '大小（字节）', 'SHA-256'];
    function cells(line: string | undefined): string[] {
      if (!line?.startsWith('|') || !line.endsWith('|')) throw new ComplianceError('manifest-row', `Malformed ${table} table row`);
      const result = line.slice(1, -1).split('|').map(cell => cell.trim());
      if (result.length !== columns.length) throw new ComplianceError('manifest-row', `Unexpected ${table} column count`);
      return result;
    }
    if (JSON.stringify(cells(lines[index++])) !== JSON.stringify(columns)) throw new ComplianceError('manifest-columns', `Invalid ${table} table header`);
    if (!cells(lines[index++]).every(cell => /^:?-{3,}:?$/.test(cell))) throw new ComplianceError('manifest-columns', `Invalid ${table} separator`);
    const start = entries.length;
    for (; lines[index]?.trim(); index++) {
      const row = cells(lines[index]);
      const name = /^`([^`]+)`(?:（[^|]*）)?$/.exec(row[0]);
      const digest = /^`([0-9a-f]{64})`$/.exec(row.at(-1)!);
      if (!name || !digest || (table === 'game' && !/^(MAIN|FLICS)\/[^\\`]+$/.test(name[1]))) {
        throw new ComplianceError('manifest-row', `Invalid ${table} source label or SHA-256 at table row ${entries.length - start + 1}`);
      }
      relativePath(name[1]);
      if (table === 'game' && (!/^\d+$/.test(row[1]) || !Number.isSafeInteger(Number(row[1])))) {
        throw new ComplianceError('manifest-size', 'Game file size must be a nonnegative safe integer');
      }
      if (entries.some(entry => entry.table === table && entry.source === name[1])) throw new ComplianceError('manifest-duplicate', 'Duplicate source label');
      entries.push(table === 'game'
        ? { table, source: name[1], sha256: digest[1], size: Number(row[1]) }
        : { table, source: name[1], sha256: digest[1], size: null });
    }
    if (entries.length === start) throw new ComplianceError('manifest-empty', `Required ${table} table is empty`);
  }
  return { entries, fingerprint: sha256(text) };
}

export function readManifest(filename: string): Blacklist { return parseManifest(readFileSync(filename, 'utf8')); }
