// Lint rules enforce the module boundaries of master plan §4.1 and the determinism rules of §5.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
// The byte reading port (P2-02 S-07), the only original-data module platform adapters may see.
const bytePort = '**/original-data/io/byte-source.ts';
// P2-03 S-07/AC-14: low-level capabilities that open discs, archives or custom whitelists without production version
// identification. Only their own family, the source family, tests and tools/ may use them; type-only imports carry no
// capability. Lint matches import specifiers (with or without .ts/.js), anchored at the original-data layout; the
// dependency graph check in tools/engineering-boundaries.test.ts resolves the real modules as well.
const DISC = String.raw`disc/(?!disc-(?:error|path)(?:\.[jt]s)?$)[^/]+`;
const ARCHIVE = String.raw`archive/[^/]+|imfat(?:\.[jt]s)?`;
const IDENTIFY = String.raw`source/identify-source(?:\.[jt]s)?`;
/** Specifiers from src/workers reach original-data through parent segments. */
const FROM_WORKERS = String.raw`^(?:\.\./)+original-data/`;
/** Specifiers from inside original-data are relative to their own directory. */
const FROM_ORIGINAL_DATA = String.raw`^(?:\./|(?:\.\./)+)(?:(?:\.\./)*original-data/)?`;
const capabilityRegex = (prefix, tails) => `${prefix}(?:${tails.join('|')})$`;
/** `no-restricted-syntax` entries for re-exports, string or template dynamic imports and import types matching `pattern`. */
const restrictedModuleSyntax = (pattern, messages) => [
  { selector: `:matches(ExportNamedDeclaration, ExportAllDeclaration)[source.value=${pattern}]`, message: messages.reexport },
  { selector: `ImportExpression:matches([source.value=${pattern}], [source.quasis.0.value.raw=${pattern}])`, message: messages.dynamic },
  { selector: `TSImportType[argument.literal.value=${pattern}]`, message: messages.type },
];
function capabilityRules(prefix, tails) {
  const regex = capabilityRegex(prefix, tails);
  const pattern = `/${regex.replaceAll('/', '\\/')}/`;
  return {
    '@typescript-eslint/no-restricted-imports': ['error', {
      patterns: [{ regex, allowTypeImports: true, message: 'Use the verified-source product entry, original-data/source/open-verified-source.ts.' }],
    }],
    'no-restricted-syntax': ['error', ...restrictedModuleSyntax(pattern, {
      reexport: 'Do not re-export a low-level original-data capability.',
      dynamic: 'Do not load a low-level original-data capability dynamically.',
      type: 'Use a type-only import declaration.',
    })],
  };
}

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
    files: ['src/render/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
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
    // P2-03 AC-14: import workers reach discs and archives only through the verified-source product entry.
    files: ['src/workers/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test-support.ts'],
    rules: capabilityRules(FROM_WORKERS, [DISC, ARCHIVE, IDENTIFY]),
  },
  {
    // Original-data outside the capability families, such as converters, does the same.
    files: ['src/original-data/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.ts', '**/*.test-support.ts',
      'src/original-data/disc/**', 'src/original-data/archive/**', 'src/original-data/imfat.ts', 'src/original-data/source/**',
    ],
    rules: capabilityRules(FROM_ORIGINAL_DATA, [DISC, ARCHIVE, IDENTIFY]),
  },
  {
    files: ['src/original-data/disc/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test-support.ts'],
    rules: capabilityRules(FROM_ORIGINAL_DATA, [ARCHIVE, IDENTIFY]),
  },
  {
    files: ['src/original-data/archive/**/*.{ts,tsx}', 'src/original-data/imfat.ts'],
    ignores: ['**/*.test.ts', '**/*.test-support.ts'],
    rules: capabilityRules(FROM_ORIGINAL_DATA, [DISC, IDENTIFY]),
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
