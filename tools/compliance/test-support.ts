import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { sha256 } from './report.ts';
import { queryPnpm } from './packages.ts';

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
    // Replacing the entry avoids mutating shared pnpm-store hard links.
    writeFileSync(`${destination}.fixture-tmp`, content, { flag: 'wx' });
    renameSync(`${destination}.fixture-tmp`, destination);
  };
  try { return await run(root, write); } finally { rmSync(root, { recursive: true, force: true }); }
}

/** The project manifest, lock and a code-owned application, without installing packages. */
export function buildFixtureFiles(write: (path: string, content: string | Uint8Array) => void): void {
  const project = new URL('../../', import.meta.url);
  for (const name of ['package.json', 'pnpm-lock.yaml', 'LICENSE']) write(name, readFileSync(new URL(name, project)));
  write('.gitignore', 'node_modules/\ndist/\nlocal/\n');
  write('docs/original/manifest.md', syntheticManifest());
  write('index.html', '<main>Code-owned compliance fixture</main><script type="module" src="/main.js"></script>');
  write('main.js', 'document.body.dataset.fixture = "code-owned synthetic application";');
}

export function installedBuildFixture(root: string, write: (path: string, content: string | Uint8Array) => void): void {
  buildFixtureFiles(write);
  queryPnpm(['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile', '--ignore-workspace', '--reporter=silent'], root);
}
