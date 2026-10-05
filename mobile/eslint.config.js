// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'expo-env.d.ts', 'coverage/*'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // HTML-only concern: apostrophes and quotes are plain text inside React Native <Text>.
      'react/no-unescaped-entities': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Use src/api/client.ts and the endpoint modules instead of axios directly.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    // The API client is the one place allowed to import axios.
    files: ['src/api/client.ts', 'src/test/**', '**/__tests__/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
