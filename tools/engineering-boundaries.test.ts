import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { capabilityOf, familyOf, isProductEntry, PRODUCT_ENTRY_EXPORT, urlTarget } from './original-data-capabilities.ts';
import { beforeAll, describe, expect, it } from 'vitest';
import { configDefaults } from 'vitest/config';
import viteConfiguration from '../vite.config.ts';

const root = resolve(import.meta.dirname, '..');
const pureLayers = ['core', 'original-data', 'content'] as const;
const eslint = new ESLint({ cwd: root });

describe('Vitest discovery', () => {
  it('runs every source and tool test in exactly one project without overriding deadlines', () => {
    const test = viteConfiguration.test;
    expect(test?.environment).toBe('node');
    const projects = (test?.projects ?? []).map(project => {
      if (typeof project !== 'object' || !('test' in project) || !project.test) throw new Error('Vitest projects must be inline');
      return project.test;
    });
    expect(projects.map(project => project.name)).toEqual(['shared', 'isolated']);
    const [shared, isolated] = projects;
    expect(shared.include).toEqual(['src/**/*.test.ts', 'tools/**/*.test.ts']);
    expect(shared.isolate).toBe(false);
    // Every file left out of the shared module graph runs isolated, and only files that replace modules need that.
    const isolatedFiles = isolated.include ?? [];
    expect(isolatedFiles.length).toBeGreaterThan(0);
    expect(shared.exclude?.filter(pattern => !configDefaults.exclude.includes(pattern))).toEqual(isolatedFiles);
    for (const file of isolatedFiles) expect(readFileSync(join(root, file), 'utf8'), file).toMatch(/^vi\.mock\(/m);
    for (const options of [test, ...projects]) {
      expect(options?.testTimeout).toBeUndefined();
      expect(options?.hookTimeout).toBeUndefined();
    }
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

/**
 * Parsed declaration files of installed packages, such as the TypeScript libs, shared by every program here: the
 * fixtures differ only in their own sources, and parsing lib.dom.d.ts again for each would dominate their cost.
 */
const packageSourceFiles = new Map<string, ts.SourceFile>();

function program(project: string, directory = root): ts.Program {
  const config = configuration(project, directory);
  const host = ts.createCompilerHost(config.options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, language, onError, fresh) => {
    if (fresh || !fileName.includes('/node_modules/')) return read(fileName, language, onError, fresh);
    const key = `${typeof language === 'object' ? `${language.languageVersion}:${language.impliedNodeFormat}` : language}:${fileName}`;
    let file = packageSourceFiles.get(key);
    if (!file) {
      file = read(fileName, language, onError);
      if (file) packageSourceFiles.set(key, file);
    }
    return file;
  };
  return ts.createProgram(config.fileNames, config.options, host);
}

const COMPUTED_IMPORT = '<computed import>';

/** Whether an import declaration imports types only: `import type` or only `type`-marked named bindings. */
function typeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return !clause.name && bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.length > 0
    && bindings.elements.every(element => element.isTypeOnly);
}

/**
 * References of real import/export declarations, dynamic imports and import types; comments and other strings are
 * ignored. A dynamic import whose argument is not a string literal yields COMPUTED_IMPORT. Only an import declaration
 * can be `typeOnly`: type re-exports and import types still reach the module.
 */
function moduleReferences(file: ts.SourceFile): { specifier: string; typeOnly: boolean }[] {
  const found: { specifier: string; typeOnly: boolean }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, typeOnly: typeOnlyImport(node) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, typeOnly: false });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      found.push({ specifier: argument && ts.isStringLiteralLike(argument) ? argument.text : COMPUTED_IMPORT, typeOnly: false });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      found.push({ specifier: node.argument.literal.text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const moduleSpecifiers = (file: ts.SourceFile): string[] => moduleReferences(file).map(({ specifier }) => specifier);

/**
 * Literal specifiers of `new URL('…', import.meta.url)`, such as a Worker entry. They name a module without importing
 * it, so they are no edge of the module graph, but a production module must not name test support this way either.
 */
function urlReferences(file: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
      const [specifier, base] = node.arguments ?? [];
      if (specifier && ts.isStringLiteralLike(specifier) && base && ts.isPropertyAccessExpression(base)
        && ts.isMetaProperty(base.expression) && base.name.text === 'url') found.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

let appProgram: ts.Program | undefined;
/** The real app program covers every production source; source rules share one build of it. */
const sharedAppProgram = (): ts.Program => appProgram ??= program('app');
let nodeProgramFiles: ReadonlySet<string> | undefined;
/** The resolved files of the real Node program, which type-checks the DOM-free modules its tests import. */
const sharedNodeFiles = (): ReadonlySet<string> => nodeProgramFiles ??= new Set(program('node').getSourceFiles().map(file => resolve(file.fileName)));
// Builds the Node program once for its readers: 0.6 s alone, but 7.6 s at load 12 and 13 s at load 90.
beforeAll(() => void sharedNodeFiles(), 30_000);

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
  // `pnpm typecheck` reports the diagnostics of this program; here only its declarations are checked.
  it('builds the actual pure program without DOM or Node declarations', () => {
    const compilation = program('core');
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

  /** Each form, with `id` suffixing its names so that samples can share one linted source. */
  const importForms = [
    (specifier: string, id = '') => `import { value${id} } from '${specifier}'; export { value${id} };`,
    (specifier: string, id = '') => `import type { Value${id} } from '${specifier}'; export type Result${id} = Value${id};`,
    (specifier: string) => `export * from '${specifier}';`,
    (specifier: string, id = '') => `export type { Value${id} } from '${specifier}';`,
  ];

  /**
   * Lints one-line samples as a single source, one per line, and returns the rules reported on each sample. A sample's
   * `value` identifiers outside string literals are suffixed with its line so that declarations stay distinct.
   */
  async function lintSamples(samples: readonly string[], filePath: string): Promise<string[][]> {
    expect(samples.every(sample => !sample.includes('\n')), 'samples must be single lines').toBe(true);
    const distinct = (sample: string, index: number): string => sample.split(/('[^']*')/)
      .map((part, position) => position % 2 ? part : part.replace(/\bvalue\b/g, `value${index}`)).join('');
    const result = await lint(samples.map(distinct).join('\n'), filePath);
    return samples.map((_, index) => result.messages.filter(message => message.line === index + 1).map(message => message.ruleId ?? ''));
  }

  async function expectSampleRules(samples: readonly (readonly [string, string])[], filePath: string): Promise<void> {
    const reported = await lintSamples(samples.map(([source]) => source), filePath);
    samples.forEach(([source, rule], index) => expect(reported[index], `${filePath}: ${source}`).toContain(rule));
  }

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
      const samples = forbiddenPackages.flatMap(name => [name, `${name}/subpath`, `${name}/nested/subpath`])
        .flatMap((specifier, index) => importForms.map((form, kind) => form(specifier, `${index}_${kind}`)));
      samples.push("export { jsx } from 'react/jsx-runtime';");
      await expectSampleRules(samples.map(source => [source, 'no-restricted-imports'] as const), file);
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

      it('attributes batched samples by line, so a hit cannot cover another sample', async () => {
        const hit = "import { value } from 'react'; export { value };";
        const reported = await lintSamples([hit, 'export const value = 1;'], 'src/core/probe.ts');
        expect(reported[0]).toContain('no-restricted-imports');
        expect(reported[1]).toEqual([]);
        await expect(expectSampleRules([[hit, 'no-restricted-imports'], ['export const value = 1;', 'no-restricted-imports']], 'src/core/probe.ts'))
          .rejects.toThrow();
      });

    });

    it.each(pureFiles)('rejects application entrypoints and nested imports in %s', async (file) => {
      const samples = forbiddenLayers.flatMap(layer => [`../${layer}`, `../${layer}/index.ts`, `../../${layer}/nested/component.tsx`])
        .flatMap((specifier, index) => importForms.map((form, kind) => form(specifier, `${index}_${kind}`)));
      await expectSampleRules(samples.map(source => [source, 'no-restricted-imports'] as const), file);
    });

    // P2-01 AC-05: canonical content consumers never import original locators or archive structure. P2-11 S-05: nor
    // does the production package profile, which the main thread reads.
    const contentConsumerFiles = [
      ...['core', 'content', 'render', 'platform', 'ui', 'app'].flatMap((layer) => ['ts', 'tsx'].map((extension) => `src/${layer}/probe.${extension}`)),
      'src/workers/production-package.ts',
    ];

    const bytePort = '../original-data/io/byte-source.ts';

    it.each(contentConsumerFiles)('rejects original-data imports in %s', async (file) => {
      // Platform files use the typescript-eslint variant of the rule, which can allow the byte port's type-only imports;
      // only platform adapters may see the port (P2-02 AC-09), so every other consumer rejects it in every form.
      const platform = file.startsWith('src/platform/');
      const rule = platform ? '@typescript-eslint/no-restricted-imports' : 'no-restricted-imports';
      const specifiers = ['../original-data', '../original-data/source-mapping.ts', '../../original-data/imfat.ts'];
      for (const specifier of platform ? specifiers : [...specifiers, bytePort]) {
        const source = importForms.map(form => form(specifier)).join('\n');
        const result = await lint(source, file);
        const restricted = result.messages.filter(message => message.ruleId === rule);
        expect([...new Set(restricted.map(message => message.line))], `${file}: ${source}`).toEqual(importForms.map((_, index) => index + 1));
      }
    });

    it.each(['ts', 'tsx'])('lets platform .%s files import only the byte port, and only type-only', async (extension) => {
      const file = `src/platform/files/probe.${extension}`;
      const port = `../${bytePort}`;
      for (const source of [
        `import type { ByteSource } from '${port}'; export type Port = ByteSource;`,
        `import { type ByteSource } from '${port}'; export type Port = ByteSource;`,
      ]) {
        expect((await lint(source, file)).messages, source).toEqual([]);
      }
      const rejected: [string, string][] = [
        [`import { ByteSource } from '${port}'; export type Port = ByteSource;`, '@typescript-eslint/no-restricted-imports'],
        [`import '${port}';`, '@typescript-eslint/no-restricted-imports'],
        [`export type { ByteSource } from '${port}';`, 'no-restricted-syntax'],
        [`export { type ByteSource } from '${port}';`, 'no-restricted-syntax'],
        [`export * from '${port}';`, 'no-restricted-syntax'],
        [`export type * from '${port}';`, 'no-restricted-syntax'],
        [`export const load = () => import('${port}');`, 'no-restricted-syntax'],
        [`export const load = () => import(\`${port}\`);`, 'no-restricted-syntax'],
        [`export type Port = import('${port}').ByteSource;`, 'no-restricted-syntax'],
        ["import type { ImfatEntry } from '../../original-data/imfat.ts'; export type Entry = ImfatEntry;", '@typescript-eslint/no-restricted-imports'],
        ["import type { DiscImage } from '../../original-data/disc/disc-image.ts'; export type Image = DiscImage;", '@typescript-eslint/no-restricted-imports'],
        ["import type { Other } from '../../original-data/io/other.ts'; export type Port = Other;", '@typescript-eslint/no-restricted-imports'],
      ];
      for (const [source, rule] of rejected) expectRule(await lint(source, file), rule, source);
    });

    it('keeps audio playback away from original data and the app, render, ui and workers layers', async () => {
      const file = 'src/platform/audio/probe.ts';
      const rule = '@typescript-eslint/no-restricted-imports';
      for (const specifier of [`../${bytePort}`, '../../original-data/source-mapping.ts', '../../original-data',
        '../../app/import/import-job-owner.ts', '../../render/scene/cleanup.ts', '../../ui/game/describe-error.ts', '../../workers/import-protocol.ts', '../../workers']) {
        for (const form of importForms.slice(0, 2)) expectRule(await lint(form(specifier), file), rule, form(specifier));
      }
      const allowed = "import { readSoundPayload } from '../../content/sound-payload.ts'; export const read = readSoundPayload;";
      expect((await lint(allowed, file)).messages, allowed).toEqual([]);
    });

    it('keeps original-data available to itself, the import workers and tests', async () => {
      const cases = [
        ['src/original-data/probe.ts', "export { readSourceMappingTable } from './source-mapping.ts';"],
        ['src/original-data/probe.ts', "export { readAssetReference } from '../content/asset-contract.ts';"],
        ['src/workers/probe.ts', "export { readSourceMappingTable } from '../original-data/source-mapping.ts';"],
        ['src/core/probe.test.ts', "export { parseImfat } from '../original-data/imfat.ts';"],
      ];
      for (const [file, source] of cases) expect((await lint(source, file)).messages, `${file}: ${source}`).toEqual([]);
    });

    // P2-03 AC-14: workers and original-data outside the capability families reach discs and archives only through the
    // verified-source product entry; type-only imports, errors, the disc path grammar and source mappings stay open.
    it('keeps low-level original-data capabilities inside their families, the source family, tests and tools', async () => {
      const rule = 'osr/original-data-capabilities';
      const rejected: [string, string, string][] = [
        ['src/original-data/convert/nested/probe.ts', "import { openImfatArchive } from '../../archive/archive-reader.ts'; export const open = openImfatArchive;", rule],
        ['src/original-data/disc/internal/probe.ts', "import { parseImfat } from '../../imfat.ts'; export const parse = parseImfat;", rule],
        ['src/workers/probe.ts', "import { openDiscImage } from '../original-data/disc/disc-image.ts'; export const open = openDiscImage;", rule],
        ['src/workers/probe.ts', "import { readFileRange } from '../original-data/disc/file-range.ts'; export const read = readFileRange;", rule],
        ['src/workers/probe.ts', "import { openImfatArchive } from '../original-data/archive/archive-reader.ts'; export const open = openImfatArchive;", rule],
        ['src/workers/probe.ts', "import { readImfatDirectory } from '../original-data/archive/imfat-rules.ts'; export const read = readImfatDirectory;", rule],
        ['src/workers/probe.ts', "import { parseImfat } from '../original-data/imfat.ts'; export const parse = parseImfat;", rule],
        ['src/workers/probe.ts', "import { identifySource } from '../original-data/source/identify-source.ts'; export const identify = identifySource;", rule],
        ['src/workers/probe.ts', "export { openDiscImage } from '../original-data/disc/disc-image.ts';", rule],
        ['src/workers/probe.ts', "export type { DiscImage } from '../original-data/disc/disc-image.ts';", rule],
        ['src/workers/probe.ts', "export * from '../original-data/imfat.ts';", rule],
        ['src/workers/probe.ts', "export const load = () => import('../original-data/archive/archive-reader.ts');", rule],
        ['src/workers/probe.ts', 'export const load = () => import(`../original-data/source/identify-source.ts`);', rule],
        ['src/workers/probe.ts', "export type Open = typeof import('../original-data/disc/disc-image.ts').openDiscImage;", rule],
        ['src/original-data/convert/probe.ts', "import { parseImfat } from '../imfat.ts'; export const parse = parseImfat;", rule],
        ['src/original-data/convert/probe.ts', "import { openImfatArchive } from '../archive/archive-reader.ts'; export const open = openImfatArchive;", rule],
        ['src/original-data/convert/probe.ts', "import { identifySource } from '../source/identify-source.ts'; export const identify = identifySource;", rule],
        ['src/original-data/probe.ts', "import { openDiscImage } from './disc/disc-image.ts'; export const open = openDiscImage;", rule],
        ['src/original-data/disc/probe.ts', "import { parseImfat } from '../imfat.ts'; export const parse = parseImfat;", rule],
        ['src/original-data/disc/probe.ts', "export const load = () => import('../archive/archive-reader.ts');", rule],
        ['src/original-data/archive/probe.ts', "import { openDiscImage } from '../disc/disc-image.ts'; export const open = openDiscImage;", rule],
        ['src/original-data/archive/probe.ts', "import { identifySource } from '../source/identify-source.ts'; export const identify = identifySource;", rule],
        ['src/workers/probe.ts', "import { openDiscImage } from '../original-data/disc/disc-image'; export const open = openDiscImage;", rule],
        ['src/workers/probe.ts', "import { openDiscImage } from '../original-data/disc/disc-image.js'; export const open = openDiscImage;", rule],
        ['src/workers/nested/probe.ts', "import { parseImfat } from '../../original-data/imfat'; export const parse = parseImfat;", rule],
        ['src/workers/probe.ts', "export * from '../original-data/imfat';", rule],
        ['src/workers/probe.ts', "export const load = () => import('../original-data/source/identify-source.js');", rule],
        ['src/original-data/convert/probe.ts', "import { readFileRange } from '../disc/file-range'; export const read = readFileRange;", rule],
        ['src/workers/probe.ts', "import { readSectors } from '../original-data/disc/internal/sectors.ts'; export const read = readSectors;", rule],
        ['src/workers/probe.ts', "export * from '../original-data/archive/formats/table.ts';", rule],
        ['src/original-data/convert/probe.ts', "export const load = () => import('../disc/internal/sectors.ts');", rule],
        ['src/workers/probe.ts', "import { open } from '../original-data/source/barrel.ts'; export const run = open;", rule],
        ['src/workers/probe.ts', "export * from '../original-data/source/barrel';", rule],
        ['src/original-data/convert/probe.ts', "export const load = () => import('../source/nested/wrapper.ts');", rule],
        ['src/original-data/source/open-verified-source.ts', "export { openDiscImage } from '../disc/disc-image.ts';", rule],
        ['src/original-data/source/open-verified-source.ts', "export * from './identify-source.ts';", rule],
        ['src/original-data/source/open-verified-source.ts', "import { openDiscImage } from '../disc/disc-image.ts'; const leak = openDiscImage; export default leak;", rule],
        ['src/original-data/source/open-verified-source.ts', "import { openDiscImage } from '../disc/disc-image.ts'; export { openDiscImage as openVerifiedSource };", rule],
        ['src/original-data/source/open-verified-source.ts', "import { openDiscImage } from '../disc/disc-image.ts'; export const openVerifiedSource = openDiscImage;", rule],
        ['src/original-data/source/source-catalog.ts', "export { openDiscImage } from '../disc/disc-image.ts';", rule],
        ['src/original-data/source/verify-source-mappings.ts', "import { openImfatArchive } from '../archive/archive-reader.ts'; export const open = openImfatArchive;", rule],
      ];
      for (const [file, source, expected] of rejected) expectRule(await lint(source, file), expected, source);
      // Tests, test support and tools may use every capability, so production code must not receive one through them.
      const support: [string, string][] = [
        ['src/workers/probe.ts', "import { openDiscImage } from '../original-data/disc/disc.test-support.ts'; export const open = openDiscImage;"],
        ['src/workers/probe.ts', "export * from '../original-data/source/source.test-support';"],
        ['src/workers/nested/probe.ts', "import { identify } from '../../../tools/barrel.ts'; export const run = identify;"],
        ['src/workers/probe.ts', "export const load = () => import('../../tools/source-check.js');"],
        ['src/original-data/convert/probe.ts', "import { open } from './support.test-support.ts'; export const run = open;"],
        ['src/original-data/archive/probe.ts', "import { ARCHIVE_SAMPLES } from './archive.test-support.ts'; export const samples = ARCHIVE_SAMPLES;"],
        ['src/original-data/disc/probe.ts', "export { syntheticFileDisc } from './disc.test-support.ts';"],
        ['src/workers/probe.ts', "import { open } from '../../e2e/support/barrel.ts'; export const run = open;"],
        ['src/original-data/convert/probe.ts', "export * from '../../../vite.config.ts';"],
      ];
      for (const [file, source] of support) {
        expect((await lint(source, file)).messages.map(message => message.messageId), `${file}: ${source}`).toEqual(['support']);
      }
      const allowed: [string, string][] = [
        ['src/workers/probe.ts', "import { openVerifiedSource } from '../original-data/source/open-verified-source.ts'; export const open = openVerifiedSource;"],
        ['src/workers/probe.ts', "import { verifySourceMappings } from '../original-data/source/verify-source-mappings.ts'; export const verify = verifySourceMappings;"],
        ['src/workers/probe.ts', "import { DiscReadError } from '../original-data/disc/disc-error.ts'; export const error = DiscReadError;"],
        ['src/workers/probe.ts', "import { SourceError } from '../original-data/source-error.ts'; export const error = SourceError;"],
        ['src/workers/probe.ts', "import { readSourceMappingTable } from '../original-data/source-mapping.ts'; export const read = readSourceMappingTable;"],
        ['src/workers/probe.ts', "import type { DiscImage } from '../original-data/disc/disc-image.ts'; export type Image = DiscImage;"],
        ['src/workers/probe.ts', "import { type ImfatEntry } from '../original-data/imfat.ts'; export type Entry = ImfatEntry;"],
        ['src/original-data/convert/probe.ts', "import { isDiscPath } from '../disc/disc-path.ts'; export const valid = isDiscPath;"],
        ['src/original-data/disc/probe.ts', "import { openDiscImage } from './disc-image.ts'; export const open = openDiscImage;"],
        ['src/original-data/archive/probe.ts', "import { parseImfat } from '../imfat.ts'; import type { DiscFile } from '../disc/disc-image.ts'; export type File = DiscFile; export const parse = parseImfat;"],
        ['src/original-data/source/probe.ts', "import { openDiscImage } from '../disc/disc-image.ts'; import { parseImfat } from '../imfat.ts'; export const open = [openDiscImage, parseImfat];"],
        ['src/original-data/convert/probe.test.ts', "import { parseImfat } from '../imfat.ts'; export const parse = parseImfat;"],
        ['tools/probe.ts', "import { openImfatArchive } from '../src/original-data/archive/archive-reader.ts'; export const open = openImfatArchive;"],
        ['src/workers/probe.ts', "export { DiscReadError } from '../original-data/disc/disc-error.ts';"],
        ['src/workers/probe.ts', "export const load = () => import('../original-data/disc/disc-path.ts');"],
        ['src/workers/probe.ts', "export * from '../original-data/source/open-verified-source.ts';"],
        ['src/workers/probe.ts', "export * from '../platform/disc/open.ts';"],
        ['src/workers/probe.ts', "export const load = () => import('../render/archive/open.ts');"],
        ['src/workers/probe.ts', "import { probe } from '../platform/discovery.ts'; export const found = probe;"],
        ['src/workers/probe.ts', "import { probe } from '../ui/imfat.ts'; import { other } from '../app/identify-source.ts'; export const found = [probe, other];"],
        ['src/original-data/convert/probe.ts', "export { isDiscPath } from '../disc/disc-path';"],
        ['src/original-data/convert/nested/probe.ts', "import { helper } from '../archive/helper.ts'; import { other } from '../disc/helper.ts'; export const found = [helper, other];"],
        ['src/original-data/disc/internal/probe.ts', "import { openDiscImage } from '../disc-image.ts'; export const open = openDiscImage;"],
        ['src/original-data/archive/formats/probe.ts', "import { parseImfat } from '../../imfat.ts'; import type { DiscFile } from '../../disc/disc-image.ts'; export type File = DiscFile; export const parse = parseImfat;"],
        ['src/workers/probe.ts', "import { PRODUCTION_CATALOG, sourceFingerprint } from '../original-data/source/source-catalog.ts'; export const found = [PRODUCTION_CATALOG, sourceFingerprint];"],
        ['src/original-data/convert/probe.ts', "export { openVerifiedSource } from '../source/open-verified-source';"],
        ['src/workers/probe.ts', "import type { Barrel } from '../original-data/source/barrel.ts'; import type { Tool } from '../../tools/barrel.ts'; export type Found = [Barrel, Tool];"],
        ['src/workers/probe.ts', "import { helper } from '../tools/barrel.ts'; import { other } from '../original-data/sources/barrel.ts'; export const found = [helper, other];"],
        ['src/original-data/source/open-verified-source.ts', [
          "import { openDiscImage } from '../disc/disc-image.ts'; import { identifySource } from './identify-source.ts';",
          "export type { DiscImage } from '../disc/disc-image.ts'; export type * from './identify-source.ts'; export { type VerifiedSource } from './identify-source.ts';",
          'export interface Options { readonly cancel: boolean } export type Opening = typeof openDiscImage;',
          'export async function openVerifiedSource(): Promise<unknown> { return identifySource(openDiscImage()); }',
        ].join(' ')],
        ['src/workers/helper.test-support.tsx', "import { openDiscImage } from '../original-data/disc/disc-image.ts'; export const open = openDiscImage;"],
        ['src/original-data/source/verify-source-mappings.ts', "import type { ImfatArchiveHandle } from '../archive/archive-reader.ts'; import { SourceError } from '../source-error.ts'; export const verify = (archive: ImfatArchiveHandle): unknown => [archive, SourceError];"],
        ['src/workers/probe.ts', "import { z } from 'zod'; import { join } from 'node:path'; export const found = [z, join];"],
      ];
      for (const [file, source] of allowed) expect((await lint(source, file)).messages, `${file}: ${source}`).toEqual([]);
    });

    // P2-04 S-09/AC-11: production import Worker code uses no network API, as a global or as a property of any object.
    it('rejects network APIs in production import Worker code only', async () => {
      const [globalsRule, propertiesRule] = ['no-restricted-globals', 'no-restricted-properties'];
      const rejected: [string, string, string][] = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'].flatMap(name => [
        ['src/workers/probe.ts', `export const value = ${name};`, globalsRule],
        ['src/workers/probe.ts', `export const value = self.${name};`, propertiesRule],
        ['src/workers/probe.ts', `export const value = globalThis.${name};`, propertiesRule],
      ] as [string, string, string][]);
      rejected.push(
        ['src/workers/nested/probe.tsx', 'export const value = new WebSocket(self.location.href);', globalsRule],
        ['src/workers/probe.ts', "export const value = self['fetch'];", propertiesRule],
        ['src/workers/probe.ts', 'export const { fetch: value } = globalThis;', propertiesRule],
        ['src/workers/probe.ts', 'const scope = self; export const value = new scope.EventSource(scope.location.href);', propertiesRule],
        ['src/workers/probe.ts', 'export const value = navigator.sendBeacon;', propertiesRule],
        ['src/workers/probe.ts', 'export const value = self.navigator.sendBeacon;', propertiesRule],
        ['src/workers/probe.ts', "export const value = globalThis.navigator['sendBeacon'];", propertiesRule],
      );
      for (const [file, source, rule] of rejected) expectRule(await lint(source, file), rule, source);
      const network = 'export const value = [fetch, self.fetch, new XMLHttpRequest(), navigator.sendBeacon];';
      const allowed: [string, string][] = [
        ['src/workers/probe.ts', 'export const read = (blob: Blob) => blob.slice(0, 1).arrayBuffer(); export const send = (message: unknown) => self.postMessage(message);'],
        ['src/workers/probe.ts', "export const entry = new URL('./import-worker.ts', import.meta.url);"],
        ['src/workers/probe.test.ts', network],
        ['src/workers/probe.test-support.ts', network],
      ];
      for (const [file, source] of allowed) expect((await lint(source, file)).messages, `${file}: ${source}`).toEqual([]);
    });

    // P2-04 AC-11: no production module, in any layer, depends on tests, test support or tools, or names one as a URL.
    it('keeps tests, test support and tools out of every production module, including Worker entry URLs', async () => {
      const rule = 'osr/original-data-capabilities';
      const findings = async (source: string, file: string): Promise<string[]> =>
        (await lint(source, file)).messages.filter(message => message.ruleId === rule).map(message => message.messageId ?? '');
      const support: [string, string][] = [
        ['src/app/import/probe.ts', "import { boundGroups } from '../../workers/synthetic-import.test-support.ts'; export const groups = boundGroups;"],
        ['src/app/import/probe.ts', "export * from '../../workers/import-host.test-support.ts';"],
        ['src/app/import/probe.ts', "export const load = () => import('../../workers/synthetic-import.test-support.ts');"],
        ['src/app/import/probe.ts', "export type Job = typeof import('../../workers/synthetic-import.test-support.ts').syntheticGroupsJob;"],
        ['src/platform/workers/probe.ts', "export const create = () => new Worker(new URL('../../workers/import-worker.test-support.ts', import.meta.url), { type: 'module' });"],
        ['src/platform/workers/probe.ts', 'export const entry = new URL(`../../workers/probe.test.ts`, import.meta.url);'],
        ['src/workers/probe.ts', "export const entry = new URL('./import-worker.test-support.ts', import.meta.url);"],
        ['src/workers/probe.ts', "export const entry = new URL('import-worker.test-support.ts', import.meta.url);"],
        ['src/workers/probe.ts', "export const entry = new URL('./import-worker.test-support.ts?worker', import.meta.url);"],
        ['src/workers/probe.ts', "export const entry = new URL('./import-worker.test-support.ts#entry', import.meta.url);"],
        ['src/workers/probe.ts', "export const entry = new URL('./import-worker.test-support.js', import.meta.url);"],
        ['src/app/probe.ts', "export const entry = new URL('/src/workers/import-worker.test-support.ts', import.meta.url);"],
        ['src/app/probe.ts', "export const entry = new URL('/tools/source-check.ts', import.meta.url);"],
        ['src/app/probe.ts', "export const entry = new URL('..\\\\..\\\\tools\\\\source-check.ts', import.meta.url);"],
        ['src/ui/probe.tsx', "import { syntheticGroup } from '../content/synthetic-content.test-support.ts'; export const group = syntheticGroup;"],
        ['src/render/probe.ts', "export { value } from './scene/probe.test.ts';"],
        ['src/core/probe.ts', "import { helper } from './world/probe.test-support.ts'; export const value = helper;"],
        ['src/content/probe.ts', "import { syntheticGroup } from './synthetic-content.test-support.ts'; export const group = syntheticGroup;"],
        ['src/app/probe.ts', "import { run } from '../../tools/source-check.ts'; export const check = run;"],
        ['src/original-data/source/probe.ts', "import { catalogFor } from './source.test-support.ts'; export const catalog = catalogFor;"],
        ['src/original-data/source/open-verified-source.ts', "import { catalogFor } from './source.test-support.ts'; export async function openVerifiedSource(): Promise<unknown> { return catalogFor; }"],
      ];
      for (const [file, source] of support) expect(await findings(source, file), `${file}: ${source}`).toEqual(['support']);
      // The capability families are checked in workers and original-data only; other layers never reach original-data.
      expect(await findings("import { identifySource } from '../original-data/source/identify-source.ts'; export const open = identifySource;", 'src/workers/import-job.ts')).toEqual(['restricted']);
      expect(await findings("export const entry = new URL('..\\\\original-data\\\\disc\\\\disc-image.ts', import.meta.url);", 'src/workers/probe.ts')).toEqual(['restricted']);
      const consumer = await lint("import { openDiscImage } from '../../original-data/disc/disc-image.ts'; export const open = openDiscImage;", 'src/app/import/probe.ts');
      expect(consumer.messages.map(message => message.ruleId)).toEqual(['no-restricted-imports']);
      const allowed: [string, string][] = [
        ['src/platform/workers/probe.ts', "export const create = () => new Worker(new URL('../../workers/import-worker.ts', import.meta.url), { type: 'module' });"],
        ['src/workers/import-job.ts', "import { openVerifiedSource } from '../original-data/source/open-verified-source.ts'; import { BlobByteSource } from '../platform/files/blob-byte-source.ts'; export const parts = [openVerifiedSource, BlobByteSource];"],
        ['src/app/import/probe.test.ts', "import { boundGroups } from '../../workers/synthetic-import.test-support.ts'; export const groups = boundGroups;"],
        ['src/workers/probe.test-support.ts', "export const entry = new URL('./import-worker.test-support.ts', import.meta.url);"],
        // Type-only declarations carry no code; re-exporting the name is rejected by the dependency graph.
        ['src/app/import/probe.ts', "import type { SyntheticGroups } from '../../workers/synthetic-import.test-support.ts'; export const none = (groups: SyntheticGroups) => groups;"],
        ['src/app/probe.ts', "export const asset = new URL('./logo.png', import.meta.url);"],
        ['src/app/probe.ts', "export const assets = [new URL('logo.png?url', import.meta.url), new URL('/src/app/logo.png', import.meta.url)];"],
        ['src/app/probe.ts', "export const external = [new URL('https://example.invalid/x.test-support.ts', import.meta.url), new URL('//cdn.invalid/x.test.ts', import.meta.url), new URL('data:text/javascript,1', import.meta.url), new URL('\\\\\\\\cdn.invalid\\\\x.test.ts', import.meta.url)];"],
        ['src/app/probe.ts', 'export const entry = (name: string) => new URL(`./${name}.test-support.ts`, import.meta.url);'],
      ];
      for (const [file, source] of allowed) expect((await lint(source, file)).messages, `${file}: ${source}`).toEqual([]);
    });

    it.each(['ts', 'tsx'])('rejects host scheduling, time, randomness and async syntax in core .%s', async (extension) => {
      await expectSampleRules(hostOperations.map(({ source, rule }) => [source, rule] as const), `src/core/probe.${extension}`);
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
        const samples = [
          ...hostOperations.map(({ source }) => source),
          ...forbiddenPackages.map(name => `export * from '${name}/subpath';`),
          "export { value } from '../core/value.ts';",
        ];
        const reported = await lintSamples(samples, file);
        samples.forEach((source, index) => expect(reported[index], `${file}: ${source}`).toEqual([]));
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

/** Every identifier in real code; comments and strings are ignored. */
function identifierNames(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

describe('render layer boundaries', () => {
  // docs/plan/p1/07/spec.md AC-01/AC-04/AC-17. Browser adapters in render/ are named `browser-*`;
  // they and React `.tsx` files belong to the app program only.
  const src = join(root, 'src');
  const relativeSource = (fileName: string): string => relative(src, fileName).split(sep).join('/');
  const inRender = (fileName: string): boolean => relativeSource(fileName).startsWith('render/');
  const isBrowserModule = (fileName: string): boolean => /^browser-.*\.ts$/.test(basename(fileName)) || fileName.endsWith('.tsx');
  const scheduling = new Set(['requestAnimationFrame', 'setAnimationLoop', 'setTimeout', 'setInterval', 'queueMicrotask', 'requestIdleCallback']);

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
    expect(moduleSpecifiers(parse("type T = import('./t.ts').T; const d = import(name); const e = import(`./e.ts`);")))
      .toEqual(['./t.ts', COMPUTED_IMPORT, './e.ts']);
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
    const nodeFiles = sharedNodeFiles();
    const unchecked = renderProduction.filter(file => !isBrowserModule(file.fileName) && !nodeFiles.has(resolve(file.fileName)));
    expect(unchecked.map(file => relativeSource(file.fileName))).toEqual([]);
    const browserInNode = [...nodeFiles].filter(fileName => fileName.startsWith(`${src}${sep}`) && isBrowserModule(fileName));
    expect(browserInNode.map(relativeSource)).toEqual([]);
  });
});

describe('resource cache boundaries', () => {
  // docs/plan/p2/10/spec.md AC-14/AC-15: the cache sends nothing over the network and needs only the IndexedDB and
  // StorageManager capabilities, so it also runs in a dedicated Worker. Its DOM-free modules are checked in the Node
  // program; the `browser-*` adapter is kept out of it by the render layer rule above, which covers every browser module.
  const src = join(root, 'src');
  const relativeSource = (fileName: string): string => relative(src, fileName).split(sep).join('/');
  const appProgram = sharedAppProgram();
  const storage = appProgram.getRootFileNames()
    .filter(fileName => relativeSource(fileName).startsWith('platform/storage/') && !fileName.endsWith('.test-support.ts'))
    .map(fileName => appProgram.getSourceFile(fileName)!);
  const banned = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'window', 'document', 'localStorage']);

  it('uses no network API, window, document, package or other-layer import', () => {
    expect(storage.length).toBeGreaterThanOrEqual(3);
    const violations = storage.flatMap(file => [
      ...[...identifierNames(file)].filter(name => banned.has(name)),
      ...moduleSpecifiers(file).filter(specifier => !/^\.\.?\//.test(specifier) || /original-data|\/(?:render|ui|app|workers)\//.test(specifier)),
    ].map(entry => `${relativeSource(file.fileName)}: ${entry}`));
    expect(violations).toEqual([]);
  });

  it('checks every DOM-free storage module in the Node program', () => {
    const nodeFiles = sharedNodeFiles();
    const unchecked = storage.filter(file => !basename(file.fileName).startsWith('browser-') && !nodeFiles.has(resolve(file.fileName)));
    expect(unchecked.map(file => relativeSource(file.fileName))).toEqual([]);
  });
});

describe('app resource and viewer boundaries', () => {
  // docs/plan/p2/11/spec.md S-03/S-08/S-12/AC-22: the resource holder and the viewer's DOM-free logic are owned by the
  // app shell. They use no network API, window, document or local storage, import no package and not the ui layer, and
  // every one of their modules is checked in the Node program. Only the viewer, which owns its renderer, sees render.
  const src = join(root, 'src');
  const relativeSource = (fileName: string): string => relative(src, fileName).split(sep).join('/');
  const appProgram = sharedAppProgram();
  const resources = appProgram.getRootFileNames()
    .filter(fileName => /^app\/(?:resources|viewer)\//.test(relativeSource(fileName)) && !fileName.endsWith('.test-support.ts'))
    .map(fileName => appProgram.getSourceFile(fileName)!);
  const banned = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'window', 'document', 'localStorage']);

  it('uses no network API, window, document, package or ui import, and render only in the viewer', () => {
    expect(resources.length).toBeGreaterThanOrEqual(4);
    const violations = resources.flatMap(file => {
      const layers = relativeSource(file.fileName).startsWith('app/viewer/') ? /\/ui(?:\/|$)/ : /\/(?:render|ui)(?:\/|$)/;
      return [
        ...[...identifierNames(file)].filter(name => banned.has(name)),
        ...moduleSpecifiers(file).filter(specifier => !/^\.\.?\//.test(specifier) || layers.test(specifier)),
      ].map(entry => `${relativeSource(file.fileName)}: ${entry}`);
    });
    expect(violations).toEqual([]);
  });

  it('checks every app resource and viewer module in the Node program', () => {
    const nodeFiles = sharedNodeFiles();
    expect(resources.filter(file => !nodeFiles.has(resolve(file.fileName))).map(file => relativeSource(file.fileName))).toEqual([]);
  });
});

describe('import and viewer main-thread network boundaries', () => {
  const banned = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']);
  const projectPath = (fileName: string): string => relative(root, fileName).split(sep).join('/');
  const inScope = (path: string): boolean =>
    /^src\/(?:app\/|ui\/|render\/viewer\/)/.test(path) && capabilityOf(path) !== 'support';

  function networkReferences(file: ts.SourceFile): string[] {
    const names = identifierNames(file);
    const visit = (node: ts.Node): void => {
      const property = ts.isElementAccessExpression(node) ? node.argumentExpression
        : ts.isBindingElement(node) ? node.propertyName : undefined;
      if (property && ts.isStringLiteralLike(property)) names.add(property.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
    return [...names].filter(name => banned.has(name)).sort();
  }

  it('covers app, UI and viewer production modules, excluding tests and test support', () => {
    for (const directory of ['app', 'ui', 'render/viewer']) {
      for (const extension of ['ts', 'tsx']) {
        expect(inScope(`src/${directory}/nested/module.${extension}`)).toBe(true);
        for (const suffix of ['test', 'test-support']) {
          expect(inScope(`src/${directory}/nested/module.${suffix}.${extension}`)).toBe(false);
        }
      }
    }
    expect(inScope('src/workers/import-worker.ts')).toBe(false);
    expect(inScope('src/render/scene/cleanup.ts')).toBe(false);
  });

  it('finds globals, property access and destructuring, but not comments or ordinary strings', () => {
    const parse = (source: string): ts.SourceFile => ts.createSourceFile('sample.tsx', source, ts.ScriptTarget.Latest, true);
    for (const name of banned) {
      for (const source of [
        `const value = ${name};`,
        `const value = globalThis.${name};`,
        `const value = navigator['${name}'];`,
        `const value = window[\`${name}\`];`,
        `const { ${name}: value } = globalThis;`,
        `const { '${name}': value } = navigator;`,
      ]) expect(networkReferences(parse(source)), source).toEqual([name]);
      expect(networkReferences(parse(`// ${name}\nconst label = '${name}';`))).toEqual([]);
    }
  });

  it('uses none of the five network APIs in production app, UI or viewer code', () => {
    const compilation = sharedAppProgram();
    const files = compilation.getRootFileNames().filter(fileName => inScope(projectPath(fileName)));
    for (const directory of ['app', 'ui', 'render/viewer']) {
      expect(files.some(fileName => projectPath(fileName).startsWith(`src/${directory}/`)), directory).toBe(true);
    }
    expect(files.flatMap(fileName => networkReferences(compilation.getSourceFile(fileName)!)
      .map(name => `${projectPath(fileName)}: ${name}`))).toEqual([]);
  });
});

describe('audio playback boundaries', () => {
  // docs/plan/p2/08/spec.md AC-11: playback uses no network API or localStorage, imports only relative modules outside
  // original-data and the app, render, ui and workers layers, and checks its DOM-free modules in the Node program.
  const src = join(root, 'src');
  const relativeSource = (fileName: string, base = src): string => relative(base, fileName).split(sep).join('/');
  const parse = (source: string): ts.SourceFile => ts.createSourceFile('probe.ts', source, ts.ScriptTarget.Latest, true);
  const banned = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'localStorage']);
  const violations = (file: ts.SourceFile): string[] => [
    ...[...identifierNames(file)].filter(name => banned.has(name)),
    ...moduleSpecifiers(file).filter(specifier => !/^\.\.?\//.test(specifier) || /original-data|\/(?:render|ui|app|workers)(?:\/|$)/.test(specifier)),
  ];
  const audioFiles = (compilation: ts.Program, base: string) => compilation.getRootFileNames()
    .filter(fileName => relativeSource(fileName, base).startsWith('platform/audio/') && !/\.test(?:-support)?\.ts$/.test(fileName))
    .map(fileName => compilation.getSourceFile(fileName)!);
  /** DOM-free audio modules missing from the Node program, which only the tests that import them pull in. */
  const unchecked = (directory: string, app = program('app', directory),
    nodeFiles: ReadonlySet<string> = new Set(program('node', directory).getSourceFiles().map(file => resolve(file.fileName)))): string[] => {
    const base = join(directory, 'src');
    return audioFiles(app, base)
      .filter(file => !basename(file.fileName).startsWith('browser-') && !nodeFiles.has(resolve(file.fileName)))
      .map(file => relativeSource(file.fileName, base));
  };

  it('flags each banned API and import in counterexamples, and accepts content imports', () => {
    const cases: [string, string][] = [
      ['export const a = fetch;', 'fetch'],
      ['export const a = new XMLHttpRequest();', 'XMLHttpRequest'],
      ["export const a = new WebSocket('ws://localhost');", 'WebSocket'],
      ["export const a = navigator.sendBeacon('/');", 'sendBeacon'],
      ["export const a = new EventSource('/');", 'EventSource'],
      ["export const a = localStorage.getItem('volume');", 'localStorage'],
      ["import { Scene } from 'three'; export { Scene };", 'three'],
      ["import type { ByteSource } from '../../original-data/io/byte-source.ts'; export type A = ByteSource;", '../../original-data/io/byte-source.ts'],
      ["export { cleanup } from '../../render/scene/cleanup.ts';", '../../render/scene/cleanup.ts'],
      ["export const load = () => import('../../ui/game/describe-error.ts');", '../../ui/game/describe-error.ts'],
      ["export type A = import('../../app/flow/app-flow.ts').AppFlow;", '../../app/flow/app-flow.ts'],
      ["import '../../workers';", '../../workers'],
    ];
    for (const [source, expected] of cases) expect(violations(parse(source)), source).toEqual([expected]);
    expect(violations(parse("import { readSoundPayload } from '../../content/sound-payload.ts'; export const a = document.hidden;"))).toEqual([]);
  });

  it('uses no network API, localStorage, package or other-layer import', () => {
    const files = audioFiles(sharedAppProgram(), src);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.flatMap(file => violations(file).map(entry => `${relativeSource(file.fileName)}: ${entry}`))).toEqual([]);
  });

  it('checks every DOM-free audio module in the Node program', () => {
    expect(unchecked(root, sharedAppProgram(), sharedNodeFiles())).toEqual([]);
  });

  it('flags a DOM-free audio module that no test brings into the Node program', () => {
    withFixtures({
      'src/platform/audio/checked.ts': 'export const checked = 1;',
      'src/platform/audio/checked.test.ts': "import { checked } from './checked.ts'; export const value = checked;",
      'src/platform/audio/orphan.ts': 'export const orphan = 1;',
      'src/platform/audio/browser-adapter.ts': 'export const hidden = document.hidden;',
    }, directory => {
      expect(unchecked(directory)).toEqual(['platform/audio/orphan.ts']);
    });
  });

  /** Audio modules whose transitive source dependencies reach a forbidden layer, or an unverifiable computed import. */
  function audioReach(compilation: ts.Program, directory: string): string[] {
    const options = compilation.getCompilerOptions();
    const project = (fileName: string): string => relative(directory, fileName).split(sep).join('/');
    const forbidden = /^src\/(?:original-data|app|render|ui|workers)\//;
    const found = new Set<string>();
    for (const start of compilation.getRootFileNames()) {
      const origin = project(start);
      if (!origin.startsWith('src/platform/audio/') || /\.test(?:-support)?\.ts$/.test(origin)) continue;
      const seen = new Set([start]);
      const queue = [start];
      for (let index = 0; index < queue.length; index++) {
        for (const specifier of moduleSpecifiers(compilation.getSourceFile(queue[index])!)) {
          if (specifier === COMPUTED_IMPORT) {
            found.add(`${origin} -> computed import in ${project(queue[index])}`);
            continue;
          }
          const next = ts.resolveModuleName(specifier, queue[index], options, ts.sys).resolvedModule?.resolvedFileName;
          if (!next || !project(next).startsWith('src/') || seen.has(next)) continue;
          seen.add(next);
          if (forbidden.test(project(next))) found.add(`${origin} -> ${project(next)}`);
          else queue.push(next);
        }
      }
    }
    return [...found].sort();
  }

  it('reaches no forbidden layer through intermediaries', () => {
    expect(audioReach(sharedAppProgram(), root)).toEqual([]);
  });

  it('flags forbidden layers reached through re-exports, import types and computed imports', () => {
    withFixtures({
      'src/platform/audio/player.ts': "export { describe } from '../shared/bridge.ts';",
      'src/platform/shared/bridge.ts': "export { describe } from '../../ui/describe.ts';",
      'src/ui/describe.ts': 'export const describe = 1;',
      'src/platform/audio/port.ts': "export type Port = import('../../original-data/io/byte-source.ts').ByteSource;",
      'src/original-data/io/byte-source.ts': 'export interface ByteSource { readonly byteLength: number }',
      'src/platform/audio/dynamic.ts': 'export const load = (name: string) => import(name);',
      'src/platform/audio/clean.ts': "export { value } from '../../content/value.ts';",
      'src/content/value.ts': 'export const value = 1;',
    }, directory => {
      expect(audioReach(program('app', directory), directory)).toEqual([
        'src/platform/audio/dynamic.ts -> computed import in src/platform/audio/dynamic.ts',
        'src/platform/audio/player.ts -> src/ui/describe.ts',
        'src/platform/audio/port.ts -> src/original-data/io/byte-source.ts',
      ]);
    });
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

/**
 * The cached direct dependencies of a module in `compilation`: its imports, re-exports, dynamic imports and import
 * types resolved to source files under `directory/src`, and `COMPUTED_IMPORT` for each import it cannot resolve.
 */
function sourceDependencies(compilation: ts.Program, directory: string): (fileName: string) => string[] {
  const options = compilation.getCompilerOptions();
  const project = (fileName: string): string => relative(directory, fileName).split(sep).join('/');
  const edges = new Map<string, string[]>();
  return fileName => {
    let resolved = edges.get(fileName);
    if (!resolved) {
      const file = compilation.getSourceFile(fileName);
      resolved = file ? moduleSpecifiers(file)
        .map(specifier => specifier === COMPUTED_IMPORT ? specifier : ts.resolveModuleName(specifier, fileName, options, ts.sys).resolvedModule?.resolvedFileName)
        .filter((name): name is string => name === COMPUTED_IMPORT || (name !== undefined && project(name).startsWith('src/'))) : [];
      edges.set(fileName, resolved);
    }
    return resolved;
  };
}

describe('original-data dependency boundary', () => {
  // docs/plan/p2/01/spec.md S-06/AC-05: only original-data and the import workers may reach original locators,
  // directly or through re-exports, dynamic imports or import types.
  // P2-02 AC-09: a platform adapter may also depend on the byte port, through type-only import declarations only and
  // without exporting anything the port declares, so the port never reaches the adapter's own consumers.
  // P2-11 S-05: the production package profile in workers/ is read by the main thread, so it is a consumer too.
  const mayReachOriginalData = (path: string): boolean =>
    /^src\/(?:original-data|workers)\//.test(path) && path !== 'src/workers/production-package.ts';
  const BYTE_PORT = 'src/original-data/io/byte-source.ts';

  /** Consumers whose transitive source dependencies reach original-data or an unverifiable computed import. */
  function originalDataReach(compilation: ts.Program, directory: string): string[] {
    const options = compilation.getCompilerOptions();
    const checker = compilation.getTypeChecker();
    const project = (fileName: string): string => relative(directory, fileName).split(sep).join('/');
    const resolveFrom = (specifier: string, fileName: string): string | undefined =>
      ts.resolveModuleName(specifier, fileName, options, ts.sys).resolvedModule?.resolvedFileName;
    const resolveAlias = (symbol: ts.Symbol): ts.Symbol => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
    const declaredByPort = (symbol: ts.Symbol | undefined): boolean =>
      symbol?.declarations?.some(declaration => project(declaration.getSourceFile().fileName) === BYTE_PORT) ?? false;
    /** Whether a declaration names a port type anywhere: alias bodies, type parameters, heritage or members. */
    const namesPort = (node: ts.Node): boolean => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol && declaredByPort(resolveAlias(symbol))) return true;
      }
      return ts.forEachChild(node, namesPort) ?? false;
    };
    const privatePortUse = new Map<string, boolean>();
    /**
     * Whether a platform file uses the port only privately: every reference is a type-only import declaration, and no
     * export is a port type or an exported type alias or interface that names one. Exported functions and classes may
     * mention the port in their signatures; that is how adapters are used.
     */
    const usesPortPrivately = (fileName: string): boolean => {
      let allowed = privatePortUse.get(fileName);
      if (allowed === undefined) {
        const file = compilation.getSourceFile(fileName)!;
        const toPort = (specifier: string): boolean => project(resolveFrom(specifier, fileName) ?? '') === BYTE_PORT;
        const references = moduleSpecifiers(file).filter(toPort).length;
        const typeImports = file.statements.filter(statement => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
          && toPort(statement.moduleSpecifier.text) && typeOnlyImport(statement)).length;
        const moduleSymbol = checker.getSymbolAtLocation(file);
        const leaks = (moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []).some(exported => {
          const target = resolveAlias(exported);
          return declaredByPort(target) || (target.declarations ?? [])
            .some(declaration => (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) && namesPort(declaration));
        });
        allowed = project(fileName).startsWith('src/platform/') && references === typeImports && !leaks;
        privatePortUse.set(fileName, allowed);
      }
      return allowed;
    };
    const dependencies = sourceDependencies(compilation, directory);
    const violations = new Set<string>();
    for (const start of compilation.getRootFileNames()) {
      const consumer = project(start);
      if (!consumer.startsWith('src/') || mayReachOriginalData(consumer) || /\.test-support\.tsx?$/.test(consumer)) continue;
      const seen = new Set([start]);
      const queue = [start];
      for (let index = 0; index < queue.length; index++) {
        for (const next of dependencies(queue[index])) {
          if (next === COMPUTED_IMPORT) violations.add(`${consumer} -> computed import in ${project(queue[index])}`);
          else if (seen.has(next)) continue;
          else if (project(next) === BYTE_PORT && usesPortPrivately(queue[index])) continue;
          else if (project(next).startsWith('src/original-data/')) violations.add(`${consumer} -> ${project(next)}`);
          else queue.push(next);
          seen.add(next);
        }
      }
    }
    return [...violations].sort();
  }

  it('follows re-exports, dynamic imports and import types through intermediaries and rejects computed imports', () => {
    withFixtures({
      'src/original-data/locator.ts': 'export interface Locator { readonly discPath: string }',
      'src/workers/bridge.ts': "export type { Locator } from '../original-data/locator.ts';",
      'src/workers/protocol.ts': 'export interface ImportProgress { readonly done: number }',
      'src/core/direct.ts': "export type { Locator } from '../original-data/locator.ts';",
      'src/render/via-worker.ts': "import type { Locator } from '../workers/bridge.ts'; export type Seen = Locator;",
      'src/ui/type-query.ts': "export type Seen = import('../original-data/locator.ts').Locator;",
      'src/app/lazy.ts': "export const load = () => import('../original-data/locator.ts');",
      'src/platform/clean.ts': "import type { ImportProgress } from '../workers/protocol.ts'; export type Seen = ImportProgress;",
      'src/ui/computed.ts': 'export const load = (name: string) => import(`../original-data/${name}.ts`);',
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      expect(originalDataReach(compilation, directory)).toEqual([
        'src/app/lazy.ts -> src/original-data/locator.ts',
        'src/core/direct.ts -> src/original-data/locator.ts',
        'src/render/via-worker.ts -> src/original-data/locator.ts',
        'src/ui/computed.ts -> computed import in src/ui/computed.ts',
        'src/ui/type-query.ts -> src/original-data/locator.ts',
      ]);
    });
  });

  it('keeps the byte port a type-only module that imports nothing', () => {
    const port = sharedAppProgram().getSourceFile(join(root, BYTE_PORT))!;
    expect(port.statements.length).toBeGreaterThan(0);
    expect(moduleSpecifiers(port)).toEqual([]);
    expect(port.statements.every(statement => ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))).toBe(true);
  });

  it('allows only private, type-only use of the byte port by platform adapters', () => {
    const port = '../../original-data/io/byte-source.ts';
    withFixtures({
      'src/original-data/io/byte-source.ts': 'export interface ByteSource { readonly byteLength: number }',
      'src/original-data/disc/reader.ts': 'export interface Reader { readonly ready: boolean }',
      'src/platform/files/adapter.ts': `import type { ByteSource } from '${port}'; export function source(): ByteSource { return { byteLength: 0 }; }`,
      'src/platform/files/inline.ts': `import { type ByteSource } from '${port}'; export const size = (source: ByteSource): number => source.byteLength;`,
      'src/platform/files/class.ts': `import type { ByteSource } from '${port}'; export class Empty implements ByteSource { readonly byteLength = 0; }`,
      'src/app/uses-adapter.ts': [
        "import { source } from '../platform/files/adapter.ts'; import { size } from '../platform/files/inline.ts';",
        "import { Empty } from '../platform/files/class.ts'; export const bytes = size(source()) + size(new Empty());",
      ].join('\n'),
      'src/ui/direct.ts': "import type { ByteSource } from '../original-data/io/byte-source.ts'; export type Port = ByteSource;",
      'src/platform/files/reexport.ts': `export type { ByteSource } from '${port}';`,
      'src/app/via-reexport.ts': "import type { ByteSource } from '../platform/files/reexport.ts'; export type Port = ByteSource;",
      'src/platform/files/local-export.ts': `import type { ByteSource } from '${port}'; export type { ByteSource };`,
      'src/ui/via-local-export.ts': "import type { ByteSource } from '../platform/files/local-export.ts'; export type Port = ByteSource;",
      'src/platform/files/alias.ts': `import type { ByteSource } from '${port}'; export type Source = ByteSource;`,
      'src/platform/files/generic.ts': `import type { ByteSource } from '${port}'; export type Source<T extends ByteSource = ByteSource> = T;`,
      'src/platform/files/mapped.ts': `import type { ByteSource } from '${port}'; export type Source = { readonly [Key in keyof ByteSource]: ByteSource[Key] };`,
      'src/platform/files/heritage.ts': `import type { ByteSource } from '${port}'; export interface Source extends ByteSource { readonly name: string }`,
      'src/platform/files/default.ts': `import type { ByteSource } from '${port}'; export default interface Source extends ByteSource { readonly name: string }`,
      'src/platform/files/namespace.ts': `import type * as port from '${port}'; export type Source = port.ByteSource;`,
      'src/ui/via-generic.ts': "import type { Source } from '../platform/files/generic.ts'; export type Port = Source;",
      'src/platform/files/value.ts': `import * as port from '${port}'; export type Port = port.ByteSource;`,
      'src/platform/files/lazy.ts': `export const load = () => import('${port}');`,
      'src/platform/files/type-query.ts': `export type Port = import('${port}').ByteSource;`,
      'src/platform/files/other.ts': "import type { Reader } from '../../original-data/disc/reader.ts'; export const ready = (reader: Reader): boolean => reader.ready;",
      'src/render/via-other.ts': "import { ready } from '../platform/files/other.ts'; export const check = ready;",
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      expect(originalDataReach(compilation, directory)).toEqual([
        `src/app/via-reexport.ts -> ${BYTE_PORT}`,
        `src/platform/files/alias.ts -> ${BYTE_PORT}`,
        `src/platform/files/default.ts -> ${BYTE_PORT}`,
        `src/platform/files/generic.ts -> ${BYTE_PORT}`,
        `src/platform/files/heritage.ts -> ${BYTE_PORT}`,
        `src/platform/files/lazy.ts -> ${BYTE_PORT}`,
        `src/platform/files/local-export.ts -> ${BYTE_PORT}`,
        `src/platform/files/mapped.ts -> ${BYTE_PORT}`,
        `src/platform/files/namespace.ts -> ${BYTE_PORT}`,
        'src/platform/files/other.ts -> src/original-data/disc/reader.ts',
        `src/platform/files/reexport.ts -> ${BYTE_PORT}`,
        `src/platform/files/type-query.ts -> ${BYTE_PORT}`,
        `src/platform/files/value.ts -> ${BYTE_PORT}`,
        'src/render/via-other.ts -> src/original-data/disc/reader.ts',
        `src/ui/direct.ts -> ${BYTE_PORT}`,
        `src/ui/via-generic.ts -> ${BYTE_PORT}`,
        `src/ui/via-local-export.ts -> ${BYTE_PORT}`,
      ]);
    });
  });

  /**
   * The product entry's runtime exports other than its opening function, read from the syntax: export declarations of
   * values, value specifiers (local or re-exported), value star exports and default exports. Type-only forms are free.
   */
  function entryValueExports(file: ts.SourceFile): string[] {
    const found: string[] = [];
    const hasModifier = (statement: ts.Statement, kind: ts.SyntaxKind): boolean =>
      ts.canHaveModifiers(statement) && (ts.getModifiers(statement)?.some(modifier => modifier.kind === kind) ?? false);
    const isOpening = (statement: ts.Statement): boolean => ts.isFunctionDeclaration(statement) && statement.body !== undefined
      && statement.name?.text === PRODUCT_ENTRY_EXPORT && !hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    for (const statement of file.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        const clause = statement.exportClause;
        if (!clause) found.push('*');
        else if (ts.isNamespaceExport(clause)) found.push(clause.name.text);
        else found.push(...clause.elements.filter(element => !element.isTypeOnly).map(element => element.name.text));
      } else if (ts.isExportAssignment(statement)) {
        found.push('default');
      } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword) && !isOpening(statement)) {
        if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
        if (ts.isVariableStatement(statement)) found.push(...statement.declarationList.declarations.map(item => item.name.getText(file)));
        else found.push((statement as ts.DeclarationStatement).name?.getText(file) ?? 'default');
      }
    }
    return found;
  }

  // P2-03 S-07/AC-14: production modules use the low-level original-data capabilities only inside their own family or
  // the source family; anything else, such as workers or converters, goes through the product entry and the public
  // source modules, and the entry exports no value but its opening. Tests, test support and every file outside
  // src/ may hold any capability, so no production module, the source family included, may import them or name them
  // in `new URL('…', import.meta.url)` (P2-04 AC-11). Type-only import declarations carry no capability; re-exports
  // (also of types), dynamic imports and import types do.
  function capabilityViolations(compilation: ts.Program, directory: string): string[] {
    const options = compilation.getCompilerOptions();
    const project = (fileName: string): string => relative(directory, fileName).split(sep).join('/');
    const violations = new Set<string>();
    for (const fileName of compilation.getRootFileNames()) {
      const importer = project(fileName);
      if (!importer.startsWith('src/') || capabilityOf(importer) === 'support') continue;
      const file = compilation.getSourceFile(fileName)!;
      if (isProductEntry(importer)) {
        for (const name of entryValueExports(file)) violations.add(`${importer} exports ${name}`);
      }
      const own = familyOf(importer);
      const restricted = (target: string): string | null => {
        const capability = capabilityOf(target);
        if (capability === 'support') return target;
        return capability && own !== 'source' && own !== capability ? target : null;
      };
      const restrictedTarget = (specifier: string): string | null => {
        const resolved = ts.resolveModuleName(specifier, fileName, options, ts.sys).resolvedModule;
        // Linked packages resolve outside node_modules, so ask the resolver rather than the path.
        if (!resolved || resolved.isExternalLibraryImport) return null;
        return restricted(project(resolved.resolvedFileName));
      };
      for (const specifier of urlReferences(file)) {
        const target = urlTarget(importer, specifier);
        if (target !== null && restricted(target)) violations.add(`${importer} -> ${target}`);
      }
      for (const { specifier, typeOnly } of moduleReferences(file)) {
        if (specifier === COMPUTED_IMPORT) {
          if (/^src\/(?:original-data|workers)\//.test(importer)) violations.add(`${importer} -> computed import`);
          continue;
        }
        const target = restrictedTarget(specifier);
        if (target && !typeOnly) violations.add(`${importer} -> ${target}`);
      }
      // A type-only import is allowed only for private use: exporting the imported name again is a re-export.
      const restrictedNames = new Map<string, string>();
      for (const statement of file.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const target = restrictedTarget(statement.moduleSpecifier.text);
        const clause = statement.importClause;
        if (!target || !clause) continue;
        if (clause.name) restrictedNames.set(clause.name.text, target);
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) restrictedNames.set(bindings.name.text, target);
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) restrictedNames.set(element.name.text, target);
      }
      for (const statement of file.statements) {
        const exported = ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)
          ? statement.exportClause.elements.map(element => (element.propertyName ?? element.name).getText(file))
          : ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression) ? [statement.expression.text] : [];
        for (const name of exported) {
          const target = restrictedNames.get(name);
          if (target) violations.add(`${importer} -> ${target}`);
        }
      }
    }
    return [...violations].sort();
  }

  it('confines low-level capabilities to their families and the source family, following every reference form', () => {
    withFixtures({
      'src/original-data/disc/disc-image.ts': 'export interface DiscImage { readonly sectors: number } export const openDiscImage = (): number => 1;',
      'src/original-data/disc/disc-error.ts': 'export class DiscReadError extends Error {}',
      'src/original-data/disc/disc-path.ts': "export const isDiscPath = (value: unknown): boolean => typeof value === 'string';",
      'src/original-data/disc/cross.ts': "import { parseImfat } from '../imfat.ts'; export const parse = parseImfat;",
      'src/original-data/imfat.ts': 'export const parseImfat = (): number => 1;',
      'src/original-data/archive/archive-reader.ts': "import type { DiscImage } from '../disc/disc-image.ts'; import { parseImfat } from '../imfat.ts'; export const open = (image: DiscImage): number => image.sectors + parseImfat();",
      'src/original-data/source/identify-source.ts': "import { openDiscImage } from '../disc/disc-image.ts'; import { open } from '../archive/archive-reader.ts'; export const identifySource = (): unknown[] => [openDiscImage, open]; export class VerifiedSource { readonly open = true; }",
      'src/original-data/source/open-verified-source.ts': "import { identifySource } from './identify-source.ts'; export function openVerifiedSource(): unknown { return identifySource; } export type { DiscImage } from '../disc/disc-image.ts'; export type { VerifiedSource } from './identify-source.ts';",
      'src/original-data/source-mapping.ts': "import type { DiscImage } from './disc/disc-image.ts'; import { isDiscPath } from './disc/disc-path.ts'; export const check = (image: DiscImage): boolean => isDiscPath(image);",
      'src/original-data/convert/model.ts': "import { parseImfat } from '../imfat.ts'; export const parse = parseImfat;",
      'src/original-data/convert/identify.ts': "import { identifySource } from '../source/identify-source.ts'; export const identify = identifySource;",
      'src/original-data/convert/lazy.ts': 'export const load = (name: string) => import(`../disc/${name}.ts`);',
      'src/original-data/convert/support.test-support.ts': "import { openDiscImage } from '../disc/disc-image.ts'; export const open = openDiscImage;",
      'src/workers/good.ts': [
        "import { openVerifiedSource } from '../original-data/source/open-verified-source.ts';",
        "import { DiscReadError } from '../original-data/disc/disc-error.ts';",
        "import { isDiscPath } from '../original-data/disc/disc-path.ts';",
        "import type { DiscImage } from '../original-data/disc/disc-image.ts';",
        'export const entry = [openVerifiedSource, DiscReadError, isDiscPath];',
        'export type Image = DiscImage;',
      ].join('\n'),
      'src/workers/value.ts': "import { openDiscImage } from '../original-data/disc/disc-image.ts'; export const open = openDiscImage;",
      'src/workers/reexport.ts': "export type { DiscImage } from '../original-data/disc/disc-image.ts';",
      'src/workers/lazy.ts': "export const load = () => import('../original-data/imfat.ts');",
      'src/workers/query.ts': "export type Open = typeof import('../original-data/archive/archive-reader.ts').open;",
      'src/original-data/disc/internal/sectors.ts': 'export const readSectors = (): number => 1;',
      'src/original-data/archive/formats/table.ts': 'export const readTable = (): number => 1;',
      'src/original-data/disc/internal/reader.tsx': 'export interface Reader { readonly ready: boolean }',
      'src/workers/tsx-type.ts': "import type { Reader } from '../original-data/disc/internal/reader.tsx'; export type { Reader };",
      'src/workers/nested.ts': "import { readSectors } from '../original-data/disc/internal/sectors.ts'; export const read = readSectors;",
      'src/workers/nested-archive.ts': "export type { readTable } from '../original-data/archive/formats/table.ts';",
      'src/workers/local-type.ts': "import type { DiscImage } from '../original-data/disc/disc-image.ts'; export type { DiscImage };",
      'src/workers/local-alias.ts': "import type { DiscImage as Image } from '../original-data/disc/disc-image.ts'; export type { Image as Disc };",
      'src/workers/local-default.ts': "import { parseImfat } from '../original-data/imfat.ts'; export default parseImfat;",
      'src/workers/private-type.ts': "import type { DiscImage } from '../original-data/disc/disc-image.ts'; export const sectors = (image: DiscImage): number => image.sectors;",
      'src/workers/entry-types.ts': "export type { DiscImage } from '../original-data/source/open-verified-source.ts';",
      // Second-hand capabilities: wrappers and re-exports in non-public source modules, test support and tools.
      'src/original-data/source/source-catalog.ts': "export const PRODUCTION_CATALOG = { versionId: 'synthetic' };",
      'src/original-data/source/verify-source-mappings.ts': 'export const verifySourceMappings = (): boolean => true;',
      'src/original-data/source/barrel.ts': "import { openDiscImage } from '../disc/disc-image.ts'; export { openDiscImage }; export const wrap = (): number => openDiscImage();",
      'src/original-data/disc/disc.test-support.ts': "export { openDiscImage } from './disc-image.ts';",
      'tools/barrel.ts': "import { identifySource } from '../src/original-data/source/identify-source.ts'; export const identify = (): unknown[] => identifySource();",
      'src/workers/public-source.ts': [
        "import { PRODUCTION_CATALOG } from '../original-data/source/source-catalog.ts';",
        "import { verifySourceMappings } from '../original-data/source/verify-source-mappings.ts';",
        "import type { wrap } from '../original-data/source/barrel.ts';",
        "import type { identify } from '../../tools/barrel.ts';",
        'export const found = [PRODUCTION_CATALOG, verifySourceMappings];',
        'export type Found = [typeof wrap, typeof identify];',
      ].join('\n'),
      'src/workers/via-source-wrapper.ts': "import { wrap } from '../original-data/source/barrel.ts'; export const open = wrap;",
      'src/workers/via-source-reexport.ts': "export { openDiscImage } from '../original-data/source/barrel.ts';",
      'src/workers/via-test-support.ts': "import { openDiscImage } from '../original-data/disc/disc.test-support.ts'; export const open = openDiscImage;",
      'src/workers/via-tools.ts': "import { identify } from '../../tools/barrel.ts'; export const run = identify;",
      'src/original-data/convert/via-test-support.ts': "export * from './support.test-support.ts';",
      'src/original-data/disc/own-test-support.ts': "import { openDiscImage } from './disc.test-support.ts'; export const open = openDiscImage;",
      'e2e/support/barrel.ts': "export { openDiscImage as open } from '../../src/original-data/disc/disc-image.ts';",
      'src/workers/via-e2e.ts': "import { open } from '../../e2e/support/barrel.ts'; export const run = open;",
      'src/workers/helper.test-support.tsx': "import { openDiscImage } from '../original-data/disc/disc-image.ts'; export const open = openDiscImage;",
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      expect(capabilityViolations(compilation, directory)).toEqual([
        'src/original-data/convert/identify.ts -> src/original-data/source/identify-source.ts',
        'src/original-data/convert/lazy.ts -> computed import',
        'src/original-data/convert/model.ts -> src/original-data/imfat.ts',
        'src/original-data/convert/via-test-support.ts -> src/original-data/convert/support.test-support.ts',
        'src/original-data/disc/cross.ts -> src/original-data/imfat.ts',
        'src/original-data/disc/own-test-support.ts -> src/original-data/disc/disc.test-support.ts',
        'src/workers/lazy.ts -> src/original-data/imfat.ts',
        'src/workers/local-alias.ts -> src/original-data/disc/disc-image.ts',
        'src/workers/local-default.ts -> src/original-data/imfat.ts',
        'src/workers/local-type.ts -> src/original-data/disc/disc-image.ts',
        'src/workers/nested-archive.ts -> src/original-data/archive/formats/table.ts',
        'src/workers/nested.ts -> src/original-data/disc/internal/sectors.ts',
        'src/workers/query.ts -> src/original-data/archive/archive-reader.ts',
        'src/workers/reexport.ts -> src/original-data/disc/disc-image.ts',
        'src/workers/tsx-type.ts -> src/original-data/disc/internal/reader.tsx',
        'src/workers/value.ts -> src/original-data/disc/disc-image.ts',
        'src/workers/via-e2e.ts -> e2e/support/barrel.ts',
        'src/workers/via-source-reexport.ts -> src/original-data/source/barrel.ts',
        'src/workers/via-source-wrapper.ts -> src/original-data/source/barrel.ts',
        'src/workers/via-test-support.ts -> src/original-data/disc/disc.test-support.ts',
        'src/workers/via-tools.ts -> tools/barrel.ts',
      ]);
    });
  });

  it('rejects values exported by the product entry besides its opening, and capabilities in the public source modules', () => {
    withFixtures({
      'src/original-data/disc/disc-image.ts': 'export interface DiscImage { readonly sectors: number } export const openDiscImage = (): number => 1;',
      'src/original-data/source/identify-source.ts': 'export const identifySource = (): number => 1; export class VerifiedSource { readonly open = true; }',
      'src/original-data/source/open-verified-source.ts': [
        "import { openDiscImage } from '../disc/disc-image.ts';",
        "import { identifySource } from './identify-source.ts';",
        "export * from './identify-source.ts';",
        "export * as disc from '../disc/disc-image.ts';",
        'export { openDiscImage, identifySource as identify, type openDiscImage as Opener };',
        'const leak = openDiscImage;',
        'export default leak;',
        'export const opened = leak();',
        'export class Handle { readonly open = true; }',
        "export type * from '../disc/disc-image.ts';",
        "export type { VerifiedSource } from './identify-source.ts';",
        'export interface Options { readonly cancel: boolean }',
        'export type Opening = typeof openDiscImage;',
        'export function openVerifiedSource(): number { return identifySource() + openDiscImage(); }',
      ].join('\n'),
      'src/original-data/source/source-catalog.ts': "export { openDiscImage } from '../disc/disc-image.ts';",
      'src/original-data/source/verify-source-mappings.ts': "import { identifySource } from './identify-source.ts'; export const verify = (): number => identifySource();",
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      expect(capabilityViolations(compilation, directory)).toEqual([
        'src/original-data/source/open-verified-source.ts exports *',
        'src/original-data/source/open-verified-source.ts exports Handle',
        'src/original-data/source/open-verified-source.ts exports default',
        'src/original-data/source/open-verified-source.ts exports disc',
        'src/original-data/source/open-verified-source.ts exports identify',
        'src/original-data/source/open-verified-source.ts exports openDiscImage',
        'src/original-data/source/open-verified-source.ts exports opened',
        'src/original-data/source/source-catalog.ts -> src/original-data/disc/disc-image.ts',
        'src/original-data/source/verify-source-mappings.ts -> src/original-data/source/identify-source.ts',
      ]);
    });
  });

  it.each([
    ['src/original-data/source/open-verified-source.ts', null],
    ['src/original-data/source/source-catalog.ts', null],
    ['src/original-data/source/verify-source-mappings.ts', null],
    ['src/original-data/source/identify-source.ts', 'source'],
    ['src/original-data/source/nested/wrapper.tsx', 'source'],
    ['src/original-data/disc/disc-path.ts', null],
    ['src/original-data/disc/internal/disc-path.ts', 'disc'],
    ['src/original-data/archive/formats/table.tsx', 'archive'],
    ['src/original-data/source-mapping.ts', null],
    ['src/original-data/archive/archive.test-support.ts', 'support'],
    ['src/workers/helper.test-support.tsx', 'support'],
    ['tools/source-check.ts', 'support'],
    ['e2e/support/environment.ts', 'support'],
    ['vite.config.ts', 'support'],
    ['node_modules/.pnpm/three@0.180.0/node_modules/three/build/three.module.js', null],
  ])('classifies %s as %s', (path, expected) => expect(capabilityOf(path)).toBe(expected));

  it('keeps tests and test support out of every production module, including Worker entry URLs', () => {
    withFixtures({
      'src/workers/import-worker.ts': "export const entry = 'production';",
      'src/workers/import-worker.test-support.ts': "export const entry = 'test';",
      'src/workers/synthetic.test-support.ts': 'export interface Groups { readonly count: number } export const groups = (): number => 1;',
      'src/platform/workers/factory.ts': "export const create = (): URL => new URL('../../workers/import-worker.ts', import.meta.url);",
      'src/platform/workers/test-factory.ts': "export const create = (): URL => new URL('../../workers/import-worker.test-support.ts', import.meta.url);",
      'src/platform/workers/template.ts': 'export const create = (): URL => new URL(`../../workers/import-worker.test-support.ts`, import.meta.url);',
      'src/workers/dotless.ts': "export const entry = (): URL => new URL('import-worker.test-support.ts', import.meta.url);",
      'src/workers/query.ts': "export const entry = (): URL => new URL('./import-worker.test-support.ts?worker#entry', import.meta.url);",
      'src/app/import/rooted.ts': "export const entry = (): URL => new URL('/src/workers/import-worker.test-support.ts', import.meta.url);",
      'src/app/import/backslash.ts': "export const entry = (): URL => new URL('..\\\\..\\\\workers\\\\import-worker.test-support.ts', import.meta.url);",
      'src/app/import/external.ts': "export const entry = (): URL[] => [new URL('https://example.invalid/a.test.ts', import.meta.url), new URL('/src/app/logo.png', import.meta.url)];",
      'src/app/import/value.ts': "import { groups } from '../../workers/synthetic.test-support.ts'; export const run = groups;",
      'src/app/import/reexport.ts': "export * from '../../workers/synthetic.test-support.ts';",
      'src/app/import/lazy.ts': "export const load = () => import('../../workers/synthetic.test-support.ts');",
      'src/app/import/query.ts': "export type Run = typeof import('../../workers/synthetic.test-support.ts').groups;",
      'src/app/import/local-type.ts': "import type { Groups } from '../../workers/synthetic.test-support.ts'; export type { Groups };",
      'src/app/import/private-type.ts': "import type { Groups } from '../../workers/synthetic.test-support.ts'; export const count = (groups: Groups): number => groups.count;",
      'src/original-data/source/catalog.test-support.ts': 'export const catalogFor = (): number => 1;',
      'src/original-data/source/identify.ts': "import { catalogFor } from './catalog.test-support.ts'; export const identify = catalogFor;",
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      expect(capabilityViolations(compilation, directory)).toEqual([
        'src/app/import/backslash.ts -> src/workers/import-worker.test-support.ts',
        'src/app/import/lazy.ts -> src/workers/synthetic.test-support.ts',
        'src/app/import/local-type.ts -> src/workers/synthetic.test-support.ts',
        'src/app/import/query.ts -> src/workers/synthetic.test-support.ts',
        'src/app/import/reexport.ts -> src/workers/synthetic.test-support.ts',
        'src/app/import/rooted.ts -> src/workers/import-worker.test-support.ts',
        'src/app/import/value.ts -> src/workers/synthetic.test-support.ts',
        'src/original-data/source/identify.ts -> src/original-data/source/catalog.test-support.ts',
        'src/platform/workers/template.ts -> src/workers/import-worker.test-support.ts',
        'src/platform/workers/test-factory.ts -> src/workers/import-worker.test-support.ts',
        'src/workers/dotless.ts -> src/workers/import-worker.test-support.ts',
        'src/workers/query.ts -> src/workers/import-worker.test-support.ts',
      ]);
    });
  });

  it('keeps the import protocol, owner and Worker adapter away from original-data, ignoring Worker entry URLs', () => {
    // Two chains: a clean protocol as in the repository, and one that imports original-data.
    const chain = (directory: string, protocol: string) => ({
      [`src/app/${directory}/import-worker-port.ts`]: `import type { Start } from '../../workers/${protocol}.ts'; export interface Port { post(message: Start): void }`,
      [`src/app/${directory}/import-job-owner.ts`]: "import type { Port } from './import-worker-port.ts'; export const owner = (port: Port): Port => port;",
      [`src/platform/${directory}/browser-import-worker.ts`]: `import type { Port } from '../../app/${directory}/import-worker-port.ts'; export const entry = (): URL => new URL('../../workers/import-worker.ts', import.meta.url); export type Created = Port;`,
    });
    withFixtures({
      'src/original-data/source/open-verified-source.ts': 'export function openVerifiedSource(): number { return 1; }',
      'src/original-data/source/identify-source.ts': 'export interface VerifiedSource { readonly open: boolean }',
      'src/content/contract.ts': 'export interface GroupInput { readonly manifest: unknown }',
      'src/workers/import-protocol.ts': "import type { GroupInput } from '../content/contract.ts'; export interface Start { readonly input: GroupInput }",
      'src/workers/leaky-protocol.ts': "import type { VerifiedSource } from '../original-data/source/identify-source.ts'; export interface Start { readonly source: VerifiedSource }",
      'src/workers/import-worker.ts': "import { openVerifiedSource } from '../original-data/source/open-verified-source.ts'; export const run = openVerifiedSource;",
      ...chain('import', 'import-protocol'),
      ...chain('leaky', 'leaky-protocol'),
    }, (directory) => {
      const compilation = program('app', directory);
      expect(ts.getPreEmitDiagnostics(compilation)).toEqual([]);
      expect(originalDataReach(compilation, directory)).toEqual([
        'src/app/leaky/import-job-owner.ts -> src/original-data/source/identify-source.ts',
        'src/app/leaky/import-worker-port.ts -> src/original-data/source/identify-source.ts',
        'src/platform/leaky/browser-import-worker.ts -> src/original-data/source/identify-source.ts',
      ]);
    });
  });

  it('keeps every production module within the low-level capability boundary', () => {
    expect(capabilityViolations(sharedAppProgram(), root)).toEqual([]);
  });

  it('keeps every production consumer away from original-data', () => {
    expect(originalDataReach(sharedAppProgram(), root)).toEqual([]);
  });

  /** Every source module reachable from `start` through imports, re-exports, dynamic imports and import types. */
  function reachableFrom(compilation: ts.Program, start: string): string[] {
    const dependencies = sourceDependencies(compilation, root);
    const seen = new Set([start]);
    const queue = [start];
    for (let index = 0; index < queue.length; index++) {
      for (const next of dependencies(queue[index])) {
        if (next === COMPUTED_IMPORT || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return [...seen].map(fileName => relative(root, fileName).split(sep).join('/')).sort();
  }

  // P2-11 AC-09: the page's production module graph holds neither the converters nor test support; only the import
  // Worker entry, which the page loads by URL, reaches original-data.
  it('keeps original-data and test support out of the page graph from src/main.tsx, and in the Worker graph', () => {
    const page = reachableFrom(sharedAppProgram(), join(root, 'src/main.tsx'));
    expect(page).toEqual(expect.arrayContaining(['src/app/App.tsx', 'src/app/browser-ports.ts', 'src/workers/production-package.ts']));
    expect(page.filter(path => path.startsWith('src/original-data/') || /\.test(?:-support)?\.tsx?$/.test(path))).toEqual([]);
    const worker = reachableFrom(sharedAppProgram(), join(root, 'src/workers/import-worker.ts'));
    expect(worker.filter(path => path.startsWith('src/original-data/')).length).toBeGreaterThan(10);
    expect(page).not.toContain('src/workers/import-worker.ts');
  });
});

describe('content and original-data test data', () => {
  // AGENTS.md and docs/plan/p2/01/spec.md AC-11: these tests generate synthetic data in code and never read files.
  // They import only the test runner, a hash oracle and real files of the two layers, and use no host module loader.
  // The guard catches honest mistakes, not deliberately obfuscated code.
  const ownLayers = ['src/content/', 'src/original-data/'];
  const allowedPackages = new Set(['vitest', 'node:crypto']);
  // Loaders that bypass import declarations: require(), process.getBuiltinModule() and vi.importActual()/vi.mock().
  const hostLoaders = new Set(['require', 'process', 'vi']);

  function testDataAccess(directory: string): string[] {
    const roots = ownLayers.map(layer => realpathSync(join(directory, layer)) + sep);
    // Symlinks are followed, so a link inside a layer cannot lead an import elsewhere.
    const insideLayers = (target: string): boolean => {
      if (!existsSync(target)) return false;
      const real = realpathSync(target);
      return roots.some(own => real.startsWith(own));
    };
    const violations = new Set<string>();
    for (const layer of ownLayers) {
      for (const name of readdirSync(join(directory, layer), { recursive: true, encoding: 'utf8' })) {
        if (!/\.test(?:-support)?\.ts$/.test(name)) continue;
        const fileName = join(directory, layer, name);
        const reject = (access: string): void => { violations.add(`${layer}${name.split(sep).join('/')} -> ${access}`); };
        const file = ts.createSourceFile(fileName, readFileSync(fileName, 'utf8'), ts.ScriptTarget.Latest);
        for (const specifier of moduleSpecifiers(file)) {
          if (specifier.startsWith('.') ? !insideLayers(resolve(dirname(fileName), specifier)) : !allowedPackages.has(specifier)) reject(specifier);
        }
        const visit = (node: ts.Node): void => {
          if (ts.isIdentifier(node) && hostLoaders.has(node.text)) reject(node.text);
          else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) reject('import.meta');
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
    }
    return [...violations].sort();
  }

  it('rejects file-system, tool, computed, symlinked and host-loader access in tests and test support only', () => {
    withFixtures({
      'src/content/clean.test.ts': [
        "import { it } from 'vitest';", "import { createHash } from 'node:crypto';",
        "import { value } from './value.ts';", "import type { Other } from '../original-data/other.ts';",
      ].join('\n'),
      'src/content/reads.test.ts': "import { readFileSync } from 'node:fs';",
      'src/content/helper.test-support.ts': "export { readFile } from 'fs/promises';",
      'src/content/value.ts': "export { readFileSync as value } from 'node:fs';",
      'src/content/builtin.test.ts': "export const read = () => process.getBuiltinModule('node:fs');",
      'src/content/actual.test.ts': "import { vi } from 'vitest'; export const load = () => vi.importActual('node:fs');",
      'src/content/escape.test.ts': "import { data } from './external/generated.ts'; export const copy = data;",
      'src/original-data/other.ts': 'export interface Other { readonly value: number }',
      'src/original-data/tool.test.ts': "import { main } from '../../tools/nob-list.ts';",
      'src/original-data/computed.test.ts': 'export const load = (name: string) => import(name);',
      'src/original-data/required.test.ts': "export const read = () => require('node:fs');",
      'src/original-data/meta.test.ts': "export const files = import.meta.glob('../../local/**');",
      'local/research/generated.ts': 'export const data = 1;',
    }, (directory) => {
      symlinkSync(join(directory, 'local', 'research'), join(directory, 'src', 'content', 'external'), 'junction');
      expect(testDataAccess(directory)).toEqual([
        'src/content/actual.test.ts -> vi',
        'src/content/builtin.test.ts -> process',
        'src/content/escape.test.ts -> ./external/generated.ts',
        'src/content/helper.test-support.ts -> fs/promises',
        'src/content/reads.test.ts -> node:fs',
        `src/original-data/computed.test.ts -> ${COMPUTED_IMPORT}`,
        'src/original-data/meta.test.ts -> import.meta',
        'src/original-data/required.test.ts -> require',
        'src/original-data/tool.test.ts -> ../../tools/nob-list.ts',
      ]);
    });
  });

  it('keeps every content and original-data test on code-generated data', () => {
    expect(testDataAccess(root)).toEqual([]);
  });
});
