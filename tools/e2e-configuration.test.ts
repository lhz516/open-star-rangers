import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import playwrightConfiguration from '../playwright.config.ts';

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

// Both cases load a toolchain or start the Playwright runner, which can take seconds while other checks share the cores.
describe('local E2E integration', { timeout: 20_000 }, () => {
  // The spec files belong to the e2e program, which `pnpm typecheck` checks; lint must reach them too.
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
    const eslint = new ESLint({ cwd: root });
    for (const filePath of ['e2e/probe.spec.ts', 'playwright.config.ts']) {
      const [result] = await eslint.lintText('export const value: string = 1;\nconst unused = true;', { filePath });
      expect(result.fatalErrorCount).toBe(0);
      expect(result.messages.some(message => message.ruleId === '@typescript-eslint/no-unused-vars')).toBe(true);
      expect(result.messages.some(message => message.ruleId === null)).toBe(false);
    }
  });

  // One listing covers every project; the runner's own failure propagation is Playwright's contract, not this config's.
  it('lists ordinary projects with serial zero-retry settings, never reuses servers, and routes specs to their projects', () => {
    const result = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    interface Suite { file?: string; specs?: { tests: { projectName: string }[] }[]; suites?: Suite[] }
    const report = JSON.parse(result.stdout) as { config: { workers: number; projects: { name: string; retries: number }[] }; suites: Suite[] };
    // One worker: the Fast Refresh cases edit sources the shared development server pushes into every open page.
    expect(report.config.workers).toBe(1);
    expect(report.config.projects.map(project => project.name)).toEqual(['development', 'production', 'development-headed']);
    expect(report.config.projects.every(project => project.retries === 0)).toBe(true);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"test:e2e": "pnpm build && playwright test"');
    const servers = [playwrightConfiguration.webServer ?? []].flat();
    expect(servers).toHaveLength(2);
    expect(servers.every(server => server.reuseExistingServer === false)).toBe(true);
    const projectsOf = (suite: Suite): string[] => [...new Set([
      ...(suite.specs ?? []).flatMap(({ tests }) => tests.map(({ projectName }) => projectName)),
      ...(suite.suites ?? []).flatMap(projectsOf),
    ])];
    for (const spec of ['resource-cache.spec.ts', 'audio-playback.spec.ts']) {
      expect(projectsOf(report.suites.find(suite => suite.file === spec) ?? {}), spec).toEqual(['development']);
    }
    // P3-14/22: the flight sound's output runs in both builds, its locked and failure cases only in development.
    expect(projectsOf(report.suites.find(suite => suite.file === 'flight-audio.spec.ts') ?? {})).toEqual(['development', 'production']);
    expect(projectsOf(report.suites.find(suite => suite.file === 'flight-audio.development.spec.ts') ?? {})).toEqual(['development']);
    // Holds vacuously until such specs exist, then constrains every new one without another config change.
    for (const suite of report.suites) {
      const project = /\.(development|production)\.spec\.ts$/.exec(suite.file ?? '')?.[1];
      if (project) expect(projectsOf(suite), suite.file).toEqual([project]);
    }
  });
});
