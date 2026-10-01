// Lists the directory of one or more IMFAT (.NOB) archives.
// Usage: node tools/nob-list.ts <file.NOB>... [--entries]
// Prints structure only (ids, types, sizes); never prints entry contents.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { entryRelocations, parseImfat } from '../src/original-data/imfat.ts';

const args = process.argv.slice(2);
const showEntries = args.includes('--entries');
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('usage: node tools/nob-list.ts <file.NOB>... [--entries]');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const bytes = new Uint8Array(readFileSync(file));
  try {
    const archive = parseImfat(bytes);
    const byType = new Map<string, { count: number; bytes: number }>();
    for (const entry of archive.entries) {
      entryRelocations(bytes, entry);
      const stat = byType.get(entry.type) ?? { count: 0, bytes: 0 };
      stat.count++;
      stat.bytes += entry.size;
      byType.set(entry.type, stat);
    }
    console.log(`${basename(file)}: version ${archive.version}, ${archive.entries.length} entries, id base ${archive.idBase}`);
    for (const [type, stat] of [...byType].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${type.padEnd(4)} ${String(stat.count).padStart(4)} entries ${String(stat.bytes).padStart(9)} bytes`);
    }
    if (showEntries) {
      for (const e of archive.entries) {
        console.log(`    ${e.id} ${e.type.padEnd(4)} size=${e.size} relocs=${e.relocationCount} flags=0x${e.flags.toString(16)}`);
      }
    }
  } catch (error) {
    failed = true;
    console.error(`${basename(file)}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
