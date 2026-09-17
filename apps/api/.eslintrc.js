/**
 * apps/api's package.json already had a "lint" script pointing at
 * eslint, but eslint itself was never added as a dependency and no
 * config existed anywhere in the repo — this is that config, added
 * alongside the CI workflow that runs it. See ci.yml's own comment on
 * why the lint job is currently non-blocking: this could not be
 * executed against the ~100 existing files in this sandbox (no npm
 * registry access to install eslint here), so a first real run in CI
 * is what establishes whether the existing code is actually clean
 * against these rules.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, jest: true, es2022: true },
  ignorePatterns: ['.eslintrc.js', 'jest.config.js', 'dist', 'node_modules'],
  rules: {
    // Prisma/NestJS DI boundaries and mocked test fixtures lean on `any`
    // deliberately throughout this codebase (see e.g. wallet.controller.ts's
    // serializeWallet/serializeTransaction helpers) — banning it outright
    // would mean either a large unrelated refactor or a wall of disable
    // comments, neither of which belongs in this change.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-empty-function': 'off',
  },
};
