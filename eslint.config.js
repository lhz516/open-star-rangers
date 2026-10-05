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
    files: ['src/render/**/*.{ts,tsx}', 'src/platform/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [originalDataImports] }] },
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
