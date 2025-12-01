import pluginNext from '@next/eslint-plugin-next'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/', '.next/', 'out/', 'dist/', 'next-env.d.ts'],
  },
  {
    plugins: {
      '@next/next': pluginNext,
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...pluginNext.configs.recommended.rules,
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // allow unused vars if prefixed with underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // any is fine for internal api calls and background processes
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Prettier must be last to override other formatting rules
  eslintConfigPrettier,
]
