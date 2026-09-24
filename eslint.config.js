import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['lib/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '_site/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['src/boot.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['scripts/service-worker.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js', 'playwright.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
