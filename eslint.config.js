import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Clean Architecture dependency rule: the domain core must not depend on
// infrastructure adapters, delivery apps, or framework/IO libraries.
const CORE_FORBIDDEN_IMPORTS = [
  { group: ['@weft/infra-*', '@weft/api', '@weft/web', '@weft/worker'], message: 'core must not depend on infra or apps (Clean Architecture).' },
  { group: ['drizzle-orm', 'drizzle-orm/*', 'postgres', 'hono', 'hono/*', '@hono/*', 'better-auth', 'better-auth/*', 'next', 'next/*', 'react', '@aws-sdk/*', 'pg-boss'], message: 'core must stay framework-free; depend on a port instead.' },
  { group: ['node:*'], message: 'core must not use Node IO directly; depend on a port instead.' },
]

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/drizzle/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CORE_FORBIDDEN_IMPORTS }],
    },
  },
)
