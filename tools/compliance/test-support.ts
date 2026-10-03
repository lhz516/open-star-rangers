import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { sha256 } from './report.ts';

export const syntheticBytes = Buffer.from('code-owned compliance fixture\n');
export function syntheticManifest(digest = sha256(syntheticBytes)): string {
  return `# Synthetic metadata

## 光盘镜像

| 文件 | SHA-256 |
|---|---|
| \`synthetic.img\` | \`${digest}\` |

## 游戏文件（光盘 \`MAIN/\` 与 \`FLICS/\`）

| 路径 | 大小（字节） | SHA-256 |
|---|---:|---|
| \`MAIN/SYNTHETIC.DAT\` | ${syntheticBytes.length} | \`${digest}\` |

`;
}

export async function fixture<T>(run: (root: string, write: (path: string, content: string | Uint8Array) => void) => T | Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'osr-compliance-'));
  const write = (path: string, content: string | Uint8Array): void => {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  try { return await run(root, write); } finally { rmSync(root, { recursive: true, force: true }); }
}
