import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import viteConfiguration from '../vite.config.ts';

const root = resolve(import.meta.dirname, '..');
const pureLayers = ['core', 'original-data', 'content'] as const;
const eslint = new ESLint({ cwd: root });

describe('Vitest scheduling', () => {
  it('serializes files without reducing test discovery or overriding deadlines', () => {
    expect(viteConfiguration.test?.fileParallelism).toBe(false);
    expect(viteConfiguration.test?.maxWorkers).toBe(1);
    expect(viteConfiguration.test?.include).toEqual(['src/**/*.test.ts', 'tools/**/*.test.ts']);
    expect(viteConfiguration.test?.environment).toBe('node');
    expect(viteConfiguration.test?.testTimeout).toBeUndefined();
    expect(viteConfiguration.test?.hookTimeout).toBeUndefined();
  });
});

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

let appProgram: ts.Program | undefined;
/** The real app program covers every production source; source rules share one build of it. */
const sharedAppProgram = (): ts.Program => appProgram ??= program('app');

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
    expect(source.trim().length, `${filePath} fixture must not be empty`).toBeGreaterThan(0);
    const results = await eslint.lintText(source, { filePath });
    expect(results, `ESLint must check ${filePath}`).toHaveLength(1);
    const result = results[0];
    expect(result.fatalErrorCount, `${filePath} parser errors`).toBe(0);
    expect(result.messages.some((message) => message.ruleId === null), `${filePath} ignored/configuration warnings`).toBe(false);
    return result;
  }

  function expectRule(result: ESLint.LintResult, rule: string, source: string): void {
    expect(result.messages.map((message) => message.ruleId), `${result.filePath}: ${source}`).toContain(rule);
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
            expectRule(result, 'no-restricted-imports', source);
          }
        }
      }
      const result = await lint("export { jsx } from 'react/jsx-runtime';", file);
      expectRule(result, 'no-restricted-imports', "export { jsx } from 'react/jsx-runtime';");
    });

    describe('Boundary checker failure contract', () => {
      it('requires non-empty capability and syntax matrices', () => {
        for (const [name, cases] of Object.entries({
          pureLayers, hostCapabilities, pureFiles, importForms, forbiddenPackages, forbiddenLayers, hostOperations,
        })) {
          expect(cases.length, `${name} cases must not be empty`).toBeGreaterThan(0);
        }
      });

      it('rejects an empty TypeScript project instead of passing without inputs', () => {
        withFixtures({}, (directory) => {
          expect(() => configuration('core', directory)).toThrow(/configuration diagnostics/);
        });
      });

      it('propagates fixture callback failures', () => {
        expect(() => withFixtures({}, () => {
          throw new Error('synthetic checker failure');
        })).toThrow('synthetic checker failure');
      });

      it('rejects empty, ignored and unparseable lint samples', async () => {
        await expect(lint('', 'src/core/probe.ts')).rejects.toThrow(/must not be empty/);
        await expect(lint('export const value = 1;', 'local/probe.ts')).rejects.toThrow(/ignored\/configuration warnings/);
        await expect(lint('export const = ;', 'src/core/probe.ts')).rejects.toThrow(/parser errors/);
      });

      it('fails mismatched negative and positive expectations', async () => {
        const legal = await lint('export const value = 1;', 'src/core/probe.ts');
        expect(() => expectRule(legal, 'no-restricted-imports', 'export const value = 1;')).toThrow();
        const illegal = await lint('export const value = Math.random();', 'src/core/probe.ts');
        expect(() => expect(illegal.messages).toEqual([])).toThrow();
      });

      it('returns a nonzero Vitest exit for a real unmet boundary assertion', () => {
        withFixtures({
          'failure.config.ts': `import actual from ${JSON.stringify(join(root, 'vite.config.ts'))};
    export default { ...actual, root: import.meta.dirname, test: { ...actual.test, include: ['failure.test.ts'] } };`,
          'failure.test.ts': `import { ESLint } from 'eslint';
    import { expect, it } from 'vitest';
    it('boundary expectation deliberately unmet', async () => {
      const eslint = new ESLint({ cwd: ${JSON.stringify(root)} });
      const [result] = await eslint.lintText('export const value = 1;', { filePath: 'src/core/probe.ts' });
      expect(result.messages.map(message => message.ruleId)).toContain('no-restricted-imports');
    });`,
        }, (directory) => {
          const result = spawnSync(process.execPath, [
            join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', join(directory, 'failure.config.ts'),
          ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
          if (result.error) throw result.error;
          expect(result.signal, 'Failure probe must finish normally').toBeNull();
          expect(result.status).toBe(1);
          const output = result.stdout + result.stderr;
          expect(output).toContain('boundary expectation deliberately unmet');
          expect(output).toContain('AssertionError');
          expect(output).toContain('no-restricted-imports');
        });
      });
    });

    it.each(pureFiles)('rejects application entrypoints and nested imports in %s', async (file) => {
      for (const layer of forbiddenLayers) {
        for (const specifier of [`../${layer}`, `../${layer}/index.ts`, `../../${layer}/nested/component.tsx`]) {
          for (const form of importForms) {
            const source = form(specifier);
            const result = await lint(source, file);
            expectRule(result, 'no-restricted-imports', source);
          }
        }
      }
    });

    it.each(['ts', 'tsx'])('rejects host scheduling, time, randomness and async syntax in core .%s', async (extension) => {
      for (const { source, rule } of hostOperations) {
        const file = `src/core/probe.${extension}`;
        const result = await lint(source, file);
        expectRule(result, rule, source);
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

describe('render layer boundaries', () => {
  // docs/plan/p1/07/spec.md AC-01/AC-04/AC-17. Browser adapters in render/ are named `browser-*`;
  // they and React `.tsx` files belong to the app program only.
  const src = join(root, 'src');
  const relativeSource = (fileName: string): string => relative(src, fileName).split(sep).join('/');
  const inRender = (fileName: string): boolean => relativeSource(fileName).startsWith('render/');
  const isBrowserModule = (fileName: string): boolean => /^browser-.*\.ts$/.test(basename(fileName)) || fileName.endsWith('.tsx');
  const scheduling = new Set(['requestAnimationFrame', 'setAnimationLoop', 'setTimeout', 'setInterval', 'queueMicrotask', 'requestIdleCallback']);

  /** Real import/export declarations and string dynamic imports; comments and other strings are ignored. */
  function moduleSpecifiers(file: ts.SourceFile): string[] {
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        found.push(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        found.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  }

  function identifierNames(file: ts.SourceFile): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) names.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
    return names;
  }

  const parse = (source: string): ts.SourceFile => ts.createSourceFile('sample.ts', source, ts.ScriptTarget.Latest, true);
  const appProgram = sharedAppProgram();
  const production = appProgram.getRootFileNames()
    .filter(fileName => !fileName.endsWith('.test-support.ts'))
    .map(fileName => appProgram.getSourceFile(fileName)!);
  const renderProduction = production.filter(file => inRender(file.fileName));

  it('parses real imports and identifiers only', () => {
    const sample = parse([
      "import type { A } from './a.ts';", 'export { b } from "../b.ts";', "const c = import('./c.ts');",
      "import /* note */ { X } from 'three/addons/x.js';", "// import './commented.ts';", "const s = 'setTimeout';",
    ].join('\n'));
    expect(moduleSpecifiers(sample)).toEqual(['./a.ts', '../b.ts', './c.ts', 'three/addons/x.js']);
    expect(identifierNames(sample).has('setTimeout')).toBe(false);
    expect(identifierNames(parse('window.setTimeout(f);')).has('setTimeout')).toBe(true);
  });

  it('imports Three.js only from its package root, only in render, and never R3F or WebGPU', () => {
    expect(production.length).toBeGreaterThan(10);
    const violations = production.flatMap(file => {
      const specifiers = moduleSpecifiers(file);
      const bad = specifiers.filter(specifier => /^three\/|^@react-three\//.test(specifier));
      if (!inRender(file.fileName) && specifiers.includes('three')) bad.push('three outside render');
      if (identifierNames(file).has('WebGPURenderer')) bad.push('WebGPURenderer');
      return bad.map(entry => `${relativeSource(file.fileName)}: ${entry}`);
    });
    expect(violations).toEqual([]);
  });

  it('schedules no frame, timer or microtask in render code', () => {
    const violations = renderProduction.flatMap(file => [...identifierNames(file)]
      .filter(name => scheduling.has(name)).map(name => `${relativeSource(file.fileName)}: ${name}`));
    expect(violations).toEqual([]);
  });

  it('checks every DOM-free render module in the Node program and no browser module there', () => {
    const nodeFiles = new Set(program('node').getSourceFiles().map(file => resolve(file.fileName)));
    const unchecked = renderProduction.filter(file => !isBrowserModule(file.fileName) && !nodeFiles.has(resolve(file.fileName)));
    expect(unchecked.map(file => relativeSource(file.fileName))).toEqual([]);
    const browserInNode = [...nodeFiles].filter(fileName => fileName.startsWith(`${src}${sep}`) && isBrowserModule(fileName));
    expect(browserInNode.map(relativeSource)).toEqual([]);
  });
});

describe('content slice definition boundary', () => {
  // docs/plan/p2/01/spec.md AC-01: the branded SliceDefinition is constructed only by its owner module.
  const owner = 'src/content/slice-definition.ts';
  const contentModules = ['asset-contract', 'asset-id', 'content-identity', 'contract-validation', 'slice-definition'];

  /** Type assertions whose target can stand in for a SliceDefinition; explicit `any` is left to lint. */
  function definitionAssertions(compilation: ts.Program, directory: string, fileNames: readonly string[]): string[] {
    const checker = compilation.getTypeChecker();
    const declaration = compilation.getSourceFile(join(directory, owner))?.statements
      .find((statement): statement is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(statement) && statement.name.text === 'SliceDefinition');
    if (!declaration) throw new Error('SliceDefinition declaration not found');
    const definition = checker.getTypeAtLocation(declaration.name);
    return fileNames.flatMap(fileName => {
      const file = compilation.getSourceFile(fileName);
      if (!file) throw new Error(`Not compiled: ${fileName}`);
      const found: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
          const target = checker.getTypeFromTypeNode(node.type);
          if (!(target.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) && checker.isTypeAssignableTo(target, definition)) {
            found.push(`${relative(directory, fileName).split(sep).join('/')}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return found;
    });
  }

  it('detects aliased, mapped and direct assertions but not consumers of the singleton', () => {
    const modules = Object.fromEntries(contentModules.map(name =>
      [`src/content/${name}.ts`, readFileSync(join(root, 'src', 'content', `${name}.ts`), 'utf8')]));
    withFixtures({
      ...modules,
      'src/sample/forged.ts': [
        "import { CLASSIC_P2_SLICE, type SliceDefinition } from '../content/slice-definition.ts';",
        'type Alias = SliceDefinition;',
        'export const aliased = { ...CLASSIC_P2_SLICE } as Alias;',
        'export const mapped = structuredClone(CLASSIC_P2_SLICE) as Readonly<SliceDefinition>;',
        "export const direct = JSON.parse('{}') as SliceDefinition;",
      ].join('\n'),
      'src/sample/consumer.ts': [
        "import { CLASSIC_P2_SLICE, type SliceDefinition } from '../content/slice-definition.ts';",
        'export const count = (definition: SliceDefinition): number => definition.roles.length;',
        'export const active: SliceDefinition = CLASSIC_P2_SLICE;',
        'export const copy = structuredClone(CLASSIC_P2_SLICE);',
        "export const parsed = JSON.parse('1') as unknown;",
        'export const width = 4 as number;',
      ].join('\n'),
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      const sample = (name: string): string => join(directory, 'src', 'sample', name);
      expect(definitionAssertions(compilation, directory, [sample('forged.ts')]))
        .toEqual(['src/sample/forged.ts:3', 'src/sample/forged.ts:4', 'src/sample/forged.ts:5']);
      expect(definitionAssertions(compilation, directory, [sample('consumer.ts')])).toEqual([]);
    });
  });

  it('constructs the only SliceDefinition in its owner module', () => {
    const compilation = sharedAppProgram();
    const production = compilation.getRootFileNames().filter(fileName => !fileName.endsWith('.test-support.ts'));
    expect(definitionAssertions(compilation, root, production).map(entry => entry.replace(/:\d+$/, ''))).toEqual([owner]);
  });
});
