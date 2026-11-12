// ESLint flat config for Famara.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'expo-env.d.ts',
      'supabase/**',
      'tools/data/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'import/no-duplicates': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Image'],
              message: 'Use expo-image for every image.',
            },
          ],
        },
      ],
    },
  },
  {
    // Test and tooling files may use Node and Jest globals freely.
    files: ['**/*.test.{ts,tsx}', 'jest.setup.ts', 'test/**', 'tools/**'],
    rules: {
      'no-console': 'off',
    },
  },
]);
