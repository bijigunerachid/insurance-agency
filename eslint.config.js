import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      'playwright-report/',
      'test-results/',
      'backend/src/generated/',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: [
      'backend/**/*.js',
      'e2e/**/*.js',
      'e2e-production/**/*.js',
      'deployment/**/*.mjs',
      '*.config.js',
      'frontend/vite.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Code passed to page.evaluate() runs in the browser.
    files: ['e2e/**/*.js', 'e2e-production/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['backend/**/*.js'],
    rules: {
      // Raw SQL must use tagged templates ($queryRaw`...`) so values are always parameters.
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'Use $queryRaw with a tagged template.' },
        { property: '$executeRawUnsafe', message: 'Use $executeRaw with a tagged template.' },
      ],
    },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: globals.browser,
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...react.configs.flat['jsx-runtime'],
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    rules: {
      // The browser console must never receive data or error details.
      'no-console': 'error',
      'react/prop-types': 'off',
      'react/no-danger': 'error',
    },
  },
  {
    files: ['frontend/test/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
