// Lint rules enforce the module boundaries of master plan §4.1 and the determinism rules of §5.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { capabilityOf, familyOf, isProductEntry, PRODUCT_ENTRY_EXPORT, urlTarget } from './tools/original-data-capabilities.ts';

const browserOnly = ['react', 'react-dom', 'zustand', 'three', 'idb', 'idb-keyval'];
const appLayers = ['app', 'render', 'ui', 'platform', 'workers'].flatMap((layer) => [`**/${layer}`, `**/${layer}/**`]);
const pureModuleImports = {
  paths: browserOnly.map((name) => ({ name, message: 'Pure modules must not depend on UI, rendering, or storage libraries.' })),
  patterns: [
    { group: browserOnly.map((name) => `${name}/*`), message: 'Pure modules must not depend on UI, rendering, or storage libraries.' },
    { group: appLayers, message: 'Pure modules must not import app layers.' },
  ],
};
// P2-01 AC-05: consumers use canonical Asset IDs; original locators and archive structure stay in original-data.
const originalDataImports = {
  group: ['**/original-data', '**/original-data/**'],
  message: 'Content consumers must not import original-data locators or archive structure.',
};
// Network APIs import Workers must not use, as globals or as properties of any object such as self or globalThis.
const networkApis = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'];
const networkMessage = 'Import Workers read only the files the player selected; they must not use the network.';
// The byte reading port (P2-02 S-07), the only original-data module platform adapters may see.
const bytePort = '**/original-data/io/byte-source.ts';
/** `no-restricted-syntax` entries for re-exports, string or template dynamic imports and import types matching `pattern`. */
const restrictedModuleSyntax = (pattern, messages) => [
  { selector: `:matches(ExportNamedDeclaration, ExportAllDeclaration)[source.value=${pattern}]`, message: messages.reexport },
  { selector: `ImportExpression:matches([source.value=${pattern}], [source.quasis.0.value.raw=${pattern}])`, message: messages.dynamic },
  { selector: `TSImportType[argument.literal.value=${pattern}]`, message: messages.type },
];

// P2-03 S-07/AC-14: low-level capabilities that open discs, archives or custom whitelists without production version
// identification. Only their own family, the source family, tests and tools/ may use them; type-only import
// declarations carry no capability. The rule resolves each relative specifier against the linted file, so same-named
// directories elsewhere are unaffected; tools/engineering-boundaries.test.ts applies the same classification to the
// TypeScript dependency graph, which also catches local re-exports that lint cannot trace.
// P2-04 AC-11: every production module under src/ is checked for tests, test support and tools, including the URL of
// a Worker entry; the capability families themselves are checked only in workers and original-data, since every other
// layer is kept away from original-data as a whole.
const repositoryRoot = import.meta.dirname;
// `eslint --cache` identifies a plugin only by its name and version, so the version follows the rule sources.
const ruleSources = createHash('sha256');
for (const file of ['eslint.config.js', 'tools/original-data-capabilities.ts']) ruleSources.update(readFileSync(resolve(repositoryRoot, file)));
const osrMeta = { name: 'osr', version: ruleSources.digest('hex').slice(0, 16) };
const projectPath = (file) => relative(repositoryRoot, file).split(sep).join('/');

const literalSpecifier = (source) => {
  if (source?.type === 'Literal' && typeof source.value === 'string') return source.value;
  return source?.type === 'TemplateLiteral' && source.expressions.length === 0 ? source.quasis[0].value.cooked : undefined;
};

const originalDataCapabilities = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      restricted: 'Read original data through the verified-source product entry, original-data/source/open-verified-source.ts.',
      support: 'Production code must not depend on tests, test support or tools.',
      entry: `The product entry exports only the ${PRODUCT_ENTRY_EXPORT} function as a value; export everything else type-only.`,
    },
  },
  create(context) {
    const importer = projectPath(context.filename);
    const own = familyOf(importer);
    const familyChecked = /^src\/(?:workers|original-data)\//.test(importer) && own !== 'source';
    const classify = (node, target) => {
      const capability = capabilityOf(target);
      if (capability === 'support') context.report({ node, messageId: 'support' });
      else if (capability && familyChecked && capability !== own) context.report({ node, messageId: 'restricted' });
    };
    const check = (node, specifier) => {
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) return;
      let target = projectPath(resolve(dirname(context.filename), specifier));
      if (/\.js$/.test(target)) target = target.replace(/\.js$/, '.ts');
      else if (!/\.tsx?$/.test(target)) target += '.ts';
      classify(node, target);
    };
    const checkUrl = (node, specifier) => {
      const target = typeof specifier === 'string' ? urlTarget(importer, specifier) : null;
      if (target !== null) classify(node, target);
    };
    const typeOnly = (node) => node.importKind === 'type'
      || (node.specifiers.length > 0 && node.specifiers.every(specifier => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type'));
    // `new URL('…', import.meta.url)` names a module, such as a Worker entry, without importing it.
    const moduleUrl = (node) => node.callee.type === 'Identifier' && node.callee.name === 'URL' && node.arguments[1]?.type === 'MemberExpression'
      && node.arguments[1].object.type === 'MetaProperty' && node.arguments[1].property.name === 'url';
    const references = {
      ImportDeclaration(node) { if (!typeOnly(node)) check(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) check(node, node.source.value); },
      ExportAllDeclaration(node) { check(node, node.source.value); },
      ImportExpression(node) { check(node, literalSpecifier(node.source)); },
      TSImportType(node) { check(node, literalSpecifier(node.source ?? node.argument?.literal)); },
      NewExpression(node) { if (moduleUrl(node)) checkUrl(node, literalSpecifier(node.arguments[0])); },
    };
    if (!isProductEntry(importer)) return references;
    // The entry uses every capability itself, so its export surface is what keeps them in: no value but its opening.
    const entry = (node) => context.report({ node, messageId: 'entry' });
    const allowed = (declaration) => ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(declaration.type)
      || (declaration.type === 'FunctionDeclaration' && declaration.id?.name === PRODUCT_ENTRY_EXPORT && declaration.body !== null);
    return {
      ...references,
      ExportNamedDeclaration(node) {
        references.ExportNamedDeclaration(node);
        if (node.exportKind === 'type') return;
        if (node.declaration ? !allowed(node.declaration) : node.specifiers.some(specifier => specifier.exportKind !== 'type')) entry(node);
      },
      ExportAllDeclaration(node) {
        references.ExportAllDeclaration(node);
        if (node.exportKind !== 'type') entry(node);
      },
      ExportDefaultDeclaration: entry,
      TSExportAssignment: entry,
    };
  },
};

export default tseslint.config(
  { ignores: ['dist', 'local', 'node_modules', 'coverage', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.ts', 'vite.config.ts', 'playwright.config.ts', 'eslint.config.js', '**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Pure modules: no UI, rendering, or browser storage libraries, and no app layers.
    files: ['src/original-data/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', pureModuleImports] },
  },
  {
    // Pure content consumers additionally never see original-data (one rule entry, as later entries replace options).
    files: ['src/core/**/*.{ts,tsx}', 'src/content/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { ...pureModuleImports, patterns: [...pureModuleImports.patterns, originalDataImports] }],
    },
  },
  {
    // P2-11 S-05: the production package profile in workers/ is read by the main thread, so it is a consumer too.
    files: ['src/render/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/workers/production-package.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [originalDataImports] }] },
  },
  {
    // P2-02 AC-09: platform adapters implement the byte port, so they alone may import that one module, type-only;
    // every other original-data module stays forbidden, as for the consumers above.
    // The typescript-eslint rule lets type-only re-exports and dynamic imports through, so syntax rules reject those.
    files: ['src/platform/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          { ...originalDataImports, group: [...originalDataImports.group, `!${bytePort}`] },
          { group: [bytePort], allowTypeImports: true, message: 'Platform may import the byte port type-only.' },
        ],
      }],
      'no-restricted-syntax': ['error', ...restrictedModuleSyntax('/original-data/', {
        reexport: 'Platform must not re-export original-data.',
        dynamic: 'Platform must not load original-data dynamically.',
        type: 'Platform must use a type-only import declaration.',
      })],
    },
  },
  {
    // P2-08 AC-11: audio playback consumes canonical payloads only. Unlike other platform adapters it never sees
    // original data, not even the byte port type-only, nor the app, render, ui or workers layers.
    files: ['src/platform/audio/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          originalDataImports,
          {
            group: ['app', 'render', 'ui', 'workers'].flatMap((layer) => [`**/${layer}`, `**/${layer}/**`]),
            message: 'Audio playback must not import the app, render, ui or workers layers.',
          },
        ],
      }],
    },
  },
  {
    // P2-03 AC-14: import workers and the rest of original-data reach discs and archives only through the product entry.
    // P2-04 AC-11: no production module depends on tests, test support or tools.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.test-support.{ts,tsx}'],
    plugins: { osr: { meta: osrMeta, rules: { 'original-data-capabilities': originalDataCapabilities } } },
    rules: { 'osr/original-data-capabilities': 'error' },
  },
  {
    // P2-04 S-09/AC-11: import Workers handle local data only. This is a static rule; the request audit belongs to P2-12.
    files: ['src/workers/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.test-support.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...networkApis.map(name => ({ name, message: networkMessage }))],
      'no-restricted-properties': ['error', ...[...networkApis, 'sendBeacon'].map(property => ({ property, message: networkMessage }))],
    },
  },
  {
    // Core determinism: randomness and time come from the tick input, never from the host.
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in core state.' },
        { object: 'Date', property: 'now', message: 'Time comes from the tick count.' },
        { object: 'performance', property: 'now', message: 'Time comes from the tick count.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Time comes from the tick count.' },
        { name: 'setTimeout', message: 'Core is synchronous.' },
        { name: 'setInterval', message: 'Core is synchronous.' },
        { name: 'requestAnimationFrame', message: 'Scheduling belongs to GameRuntime.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'AwaitExpression', message: 'Core is synchronous.' },
        { selector: ':function[async=true]', message: 'Core is synchronous.' },
      ],
    },
  },
);
