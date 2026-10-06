import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'node_modules/@playwright/test/cli.js');

function parsed(project: string): ts.ParsedCommandLine {
  const config = ts.getParsedCommandLineOfConfigFile(join(root, `tsconfig.${project}.json`), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: diagnostic => { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')); },
  });
  if (!config) throw new Error(`Cannot parse ${project}`);
  expect(config.errors).toEqual([]);
  return config;
}

async function fixture(testSource: string, configSource: string): Promise<{ code: number | null; output: string }> {
  const directory = mkdtempSync(join(tmpdir(), 'osr-e2e-config-'));
  try {
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    writeFileSync(join(directory, 'playwright.config.ts'), configSource);
    writeFileSync(join(directory, 'failure.spec.ts'), testSource);
    return await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [cli, 'test', '--config', join(directory, 'playwright.config.ts')], {
        cwd: directory,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      let output = '';
      child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`Fixture timed out:\n${output}`)); }, 20_000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('close', code => { clearTimeout(timeout); resolveResult({ code, output }); });
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const config = `export default { testDir: '.', workers: 1, retries: 0, reporter: 'list', timeout: 5000`;
const emptyTest = `import { test } from '@playwright/test'; test('startup prerequisite', () => {});`;

describe('local E2E integration', () => {
  it('discovers E2E separately without widening Core, Node or Vitest', async () => {
    const e2e = parsed('e2e');
    expect(e2e.fileNames).toContain(join(root, 'playwright.config.ts'));
    expect(e2e.fileNames).toContain(join(root, 'e2e/bootstrap.spec.ts'));
    expect(e2e.options.lib).toContain('lib.dom.d.ts');
    for (const name of ['core', 'node']) {
      const existing = parsed(name);
      expect(existing.options.lib).not.toContain('lib.dom.d.ts');
      expect(existing.fileNames.some(file => file.includes('/e2e/'))).toBe(false);
    }
    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(vite).toContain("include: ['src/**/*.test.ts', 'tools/**/*.test.ts']");
    const eslint = new ESLint({ cwd: root });
    for (const filePath of ['e2e/probe.spec.ts', 'playwright.config.ts']) {
      const [result] = await eslint.lintText('export const value: string = 1;\nconst unused = true;', { filePath });
      expect(result.fatalErrorCount).toBe(0);
      expect(result.messages.some(message => message.ruleId === '@typescript-eslint/no-unused-vars')).toBe(true);
      expect(result.messages.some(message => message.ruleId === null)).toBe(false);
    }
    const source = ts.createSourceFile('probe.spec.ts', 'export const value: string = 1;', ts.ScriptTarget.ES2023);
    const host = ts.createCompilerHost(e2e.options);
    const original = host.getSourceFile.bind(host);
    const probe = join(root, 'e2e/probe.spec.ts');
    host.getSourceFile = (file, language, onError, newFile) => file === probe ? source : original(file, language, onError, newFile);
    const program = ts.createProgram([probe], e2e.options, host);
    expect(program.getSemanticDiagnostics().some(diagnostic => diagnostic.code === 2322)).toBe(true);
  });

  it('lists ordinary projects, keeps native routing and serial zero-retry settings', () => {
    const result = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as { config: { workers: number; projects: { name: string; retries: number }[] } };
    expect(report.config.workers).toBe(1);
    expect(report.config.projects.map(project => project.name)).toEqual(['development', 'production', 'development-headed']);
    expect(report.config.projects.every(project => project.retries === 0)).toBe(true);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"test:e2e": "pnpm build && playwright test"');
  });

  it.each(['resource-cache.spec.ts', 'audio-playback.spec.ts'])('runs %s only on the development server, which serves its /src imports', spec => {
    const result = spawnSync(process.execPath, [cli, 'test', spec, '--list', '--reporter=json'], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    interface Suite { specs?: { tests: { projectName: string }[] }[]; suites?: Suite[] }
    const projects = new Set<string>();
    const visit = (suite: Suite): void => {
      suite.specs?.forEach(spec => spec.tests.forEach(({ projectName }) => projects.add(projectName)));
      suite.suites?.forEach(visit);
    };
    (JSON.parse(result.stdout) as { suites: Suite[] }).suites.forEach(visit);
    expect([...projects]).toEqual(['development']);
  });

  it('propagates a genuine assertion failure', async () => {
    const result = await fixture(`import { test, expect } from '@playwright/test'; test('controlled assertion', () => { expect(1).toBe(2); });`, `${config} };`);
    expect(result.code).toBe(1);
    expect(result.output).toContain('controlled assertion');
    expect(result.output).toContain('Expected: 2');
  });

  it.each(['build', 'startup'])('propagates a failed %s prerequisite', async name => {
    const command = `${process.execPath} -e "console.error('controlled-${name}-failure'); process.exit(7)"`;
    const result = await fixture(emptyTest, `${config}, webServer: { command: ${JSON.stringify(command)}, url: 'http://127.0.0.1:1', timeout: 3000, reuseExistingServer: false } };`);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(`controlled-${name}-failure`);
    expect(result.output).toContain('Exit code: 7');
  });

  it('rejects an occupied HTTP origin without reusing or stopping it', async () => {
    const server = createServer((_request, response) => { response.end('unrelated fixture'); });
    await new Promise<void>(resolveReady => { server.listen(0, '127.0.0.1', resolveReady); });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture needs a TCP port');
      const url = `http://127.0.0.1:${address.port}`;
      const result = await fixture(emptyTest, `${config}, webServer: { command: 'must-not-run', url: '${url}', reuseExistingServer: false } };`);
      expect(result.code).not.toBe(0);
      expect(result.output).toContain('already used');
      expect(await (await fetch(url)).text()).toBe('unrelated fixture');
    } finally {
      await new Promise<void>((resolveClosed, reject) => { server.close(error => { if (error) reject(error); else resolveClosed(); }); });
    }
  });

  it('reports a missing executable as failure rather than downloading or skipping', async () => {
    const result = await fixture(`import { test } from '@playwright/test'; test('missing installed browser', async ({ page }) => { await page.goto('about:blank'); });`,
      `${config}, use: { launchOptions: { executablePath: '/osr-fixture-missing/chromium' } } };`);
    expect(result.code).toBe(1);
    expect(result.output).toContain('missing installed browser');
    expect(result.output).toContain("executable doesn't exist");
  });
});
