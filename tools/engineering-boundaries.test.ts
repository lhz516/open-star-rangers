import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const pureLayers = ['core', 'original-data', 'content'] as const;
const eslint = new ESLint({ cwd: root });

function configuration(project: string, directory = root): ts.ParsedCommandLine {
  const config = ts.getParsedCommandLineOfConfigFile(join(directory, `tsconfig.${project}.json`), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  });
  if (!config) throw new Error(`Cannot load ${project} TypeScript configuration`);
  expect(config.errors, `${project} configuration diagnostics`).toEqual([]);
  expect(config.fileNames.length, `${project} input files`).toBeGreaterThan(0);
  return config;
}

function program(project: string, directory = root): ts.Program {
  const config = configuration(project, directory);
  return ts.createProgram(config.fileNames, config.options);
}

function withFixtures<T>(files: Record<string, string>, check: (directory: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), 'star-rangers-boundaries-'));
  try {
    for (const name of ['base', 'core', 'app', 'node']) {
      const filename = `tsconfig.${name}.json`;
      writeFileSync(join(directory, filename), readFileSync(join(root, filename)));
    }
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
    for (const [filename, source] of Object.entries(files)) {
      const destination = join(directory, filename);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, source);
    }
    return check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const hostCapabilities = [
  { name: 'document', source: 'export const value = document.title;', codes: [2584] },
  { name: 'HTMLElement', source: 'export type Value = HTMLElement;', codes: [2304] },
  { name: 'indexedDB', source: 'export const value = indexedDB;', codes: [2304] },
  { name: 'localStorage', source: 'export const value = localStorage;', codes: [2304] },
  { name: 'process', source: 'export const value = process.version;', codes: [2591] },
  { name: 'Buffer', source: 'export const value = Buffer.alloc(0);', codes: [2591] },
  { name: 'node-fs', source: "export { readFileSync } from 'node:fs';", codes: [2591] },
] as const;

function diagnosticsFor(compilation: ts.Program, file: string): ts.Diagnostic[] {
  expect(compilation.getRootFileNames(), `Fixture must be discovered: ${file}`).toContain(file);
  const source = compilation.getSourceFile(file);
  if (!source) throw new Error(`Fixture was not compiled: ${file}`);
  return [...compilation.getSyntacticDiagnostics(source), ...compilation.getSemanticDiagnostics(source)];
}

describe('TypeScript module environments', () => {
  it('checks the actual pure program without DOM or Node declarations', () => {
    const compilation = program('core');
    expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
    const names = compilation.getSourceFiles().map((source) => source.fileName);
    expect(names.some((name) => /\/lib\.dom(?:\.iterable)?\.d\.ts$/.test(name))).toBe(false);
    expect(names.some((name) => name.includes('/@types/node/'))).toBe(false);
  });

  async function lint(source: string, filePath: string): Promise<ESLint.LintResult> {
    const results = await eslint.lintText(source, { filePath });
    expect(results, `ESLint must check ${filePath}`).toHaveLength(1);
    const result = results[0];
    expect(result.fatalErrorCount, `${filePath} parser errors`).toBe(0);
    expect(result.messages.some((message) => message.ruleId === null), `${filePath} ignored/configuration warnings`).toBe(false);
    return result;
  }

  const importForms = [
    (specifier: string) => `import { value } from '${specifier}'; export { value };`,
    (specifier: string) => `import type { Value } from '${specifier}'; export type Result = Value;`,
    (specifier: string) => `export * from '${specifier}';`,
    (specifier: string) => `export type { Value } from '${specifier}';`,
  ];

  const forbiddenPackages = ['react', 'react-dom', 'zustand', 'three', 'idb', 'idb-keyval'];
  const forbiddenLayers = ['app', 'render', 'ui', 'platform', 'workers'];
  const pureFiles = pureLayers.flatMap((layer) => ['ts', 'tsx'].map((extension) => `src/${layer}/probe.${extension}`));
  const hostOperations = [
    { source: 'export const value = Math.random();', rule: 'no-restricted-properties' },
    { source: 'export const value = Date.now();', rule: 'no-restricted-properties' },
    { source: 'export const value = new Date();', rule: 'no-restricted-globals' },
    { source: 'export const value = performance.now();', rule: 'no-restricted-properties' },
    { source: 'export const value = setTimeout(() => {}, 1);', rule: 'no-restricted-globals' },
    { source: 'export const value = setInterval(() => {}, 1);', rule: 'no-restricted-globals' },
    { source: 'export const value = requestAnimationFrame(() => {});', rule: 'no-restricted-globals' },
    { source: 'export const value = await Promise.resolve(1);', rule: 'no-restricted-syntax' },
    { source: 'export async function value() { return 1; }', rule: 'no-restricted-syntax' },
    { source: 'export const value = async function () { return 1; };', rule: 'no-restricted-syntax' },
    { source: 'export const value = async () => 1;', rule: 'no-restricted-syntax' },
    { source: 'export const value = { async method() { return 1; } };', rule: 'no-restricted-syntax' },
    { source: 'export class Value { async method() { return 1; } }', rule: 'no-restricted-syntax' },
  ];

  describe('ESLint production boundaries', () => {
    it.each(pureFiles)('rejects package roots and subpaths in %s', async (file) => {
      for (const name of forbiddenPackages) {
        for (const specifier of [name, `${name}/subpath`, `${name}/nested/subpath`]) {
          for (const form of importForms) {
            const source = form(specifier);
            const result = await lint(source, file);
            expect(result.messages.map((message) => message.ruleId), `${file}: ${source}`).toContain('no-restricted-imports');
          }
        }
      }
      const result = await lint("export { jsx } from 'react/jsx-runtime';", file);
      expect(result.messages.map((message) => message.ruleId), file).toContain('no-restricted-imports');
    });

    it.each(pureFiles)('rejects application entrypoints and nested imports in %s', async (file) => {
      for (const layer of forbiddenLayers) {
        for (const specifier of [`../${layer}`, `../${layer}/index.ts`, `../../${layer}/nested/component.tsx`]) {
          for (const form of importForms) {
            const source = form(specifier);
            const result = await lint(source, file);
            expect(result.messages.map((message) => message.ruleId), `${file}: ${source}`).toContain('no-restricted-imports');
          }
        }
      }
    });

    it.each(['ts', 'tsx'])('rejects host scheduling, time, randomness and async syntax in core .%s', async (extension) => {
      for (const { source, rule } of hostOperations) {
        const file = `src/core/probe.${extension}`;
        const result = await lint(source, file);
        expect(result.messages.map((message) => message.ruleId), `${file}: ${source}`).toContain(rule);
      }
    });

    it('accepts pure imports and deterministic computation in every pure layer', async () => {
      for (const file of pureFiles) {
        const source = "import { value } from '../content/value.ts'; export const doubled = value * 2;";
        expect((await lint(source, file)).messages, file).toEqual([]);
      }
      expect((await lint('export function value(tick: number) { return tick * 2; }', 'src/core/probe.ts')).messages).toEqual([]);
    });

    it('preserves consumer capabilities and Node test exceptions', async () => {
      for (const file of ['src/app/probe.tsx', 'src/platform/probe.ts', 'src/core/probe.test.ts', 'tools/probe.test.ts']) {
        for (const { source } of hostOperations) {
          expect((await lint(source, file)).messages, `${file}: ${source}`).toEqual([]);
        }
        for (const name of forbiddenPackages) {
          expect((await lint(`export * from '${name}/subpath';`, file)).messages, file).toEqual([]);
        }
        expect((await lint("export { value } from '../core/value.ts';", file)).messages, file).toEqual([]);
      }
      expect((await lint('export const value = <main>Shell</main>;', 'src/app/probe.tsx')).messages).toEqual([]);
    });
  });

  it.each(pureLayers)('rejects host capabilities in %s with target type diagnostics', (layer) => {
    const fixtures = ['ts', 'tsx'].flatMap((extension) => hostCapabilities.map((capability) => ({
      ...capability,
      file: `src/${layer}/${capability.name}-${extension}.${extension}`,
    })));
    withFixtures(Object.fromEntries(fixtures.map(({ file, source }) => [file, source])), (directory) => {
      const compilation = program('core', directory);
      expect(compilation.getOptionsDiagnostics()).toEqual([]);
      for (const fixture of fixtures) {
        const file = join(directory, fixture.file);
        const diagnostics = diagnosticsFor(compilation, file);
        expect(diagnostics.map((diagnostic) => diagnostic.code), file).toEqual(fixture.codes);
        expect(diagnostics.every((diagnostic) => diagnostic.file?.fileName === file), file).toBe(true);
      }
    });
  });

  it('accepts the same browser and Node sources in their owning projects', () => {
    const files: Record<string, string> = {};
    for (const capability of hostCapabilities) {
      const layer = ['process', 'Buffer', 'node-fs'].includes(capability.name) ? 'tools' : 'src/app';
      files[`${layer}/${capability.name}.ts`] = capability.source;
    }
    files['src/core/capabilities.test.ts'] = "import { expect, it } from 'vitest'; it('Node', () => expect(process.version).toBeTruthy());";
    files['src/core/value.ts'] = 'export const value = 1;';
    withFixtures(files, (directory) => {
      for (const project of ['app', 'node']) {
        expect(ts.getPreEmitDiagnostics(program(project, directory)), project).toEqual([]);
      }
      expect(configuration('core', directory).fileNames).not.toContain(join(directory, 'src/core/capabilities.test.ts'));
    });
  });

  it('accepts pure data and pure-module imports without creating production files', () => {
    withFixtures({
      'src/content/value.ts': 'export const value = 2;',
      'src/original-data/value.ts': "export { value } from '../content/value.ts';",
      'src/core/value.tsx': "import { value } from '../original-data/value.ts'; export const doubled = value * 2;",
    }, (directory) => {
      expect(ts.getPreEmitDiagnostics(program('core', directory))).toEqual([]);
    });
  });
});
