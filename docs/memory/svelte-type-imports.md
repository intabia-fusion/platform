# Type imports in .svelte files

Область: [Сборка и инструменты](../getting-started.md)

svelte-preprocess runs TypeScript with `verbatimModuleSyntax` (dev/prod webpack config, `platform-rig/profiles/ui/svelte.config.js`), so every import without `type` reaches webpack. A type imported as a value becomes "export not found", which dev/prod hides with `ignoreWarnings: [(warning) => true]`. Before the fix (2026-09-27) there were 3221 such imports in 1395 files. `pnpm check:svelte-imports` finds them (`--types`) and exits 1 on unresolved imports or missing value exports.

Lint config (`profiles/ui/eslint.config.json`, `**/*.svelte` override):
- `consistent-type-imports` with `fixStyle: 'separate-type-imports'`. `inline-type-imports` writes `import { type A }`, which verbatimModuleSyntax turns into a bare `import 'x'` side-effect import (124 new ones in tracker-resources alone).
- `no-import-type-side-effects` turns existing all-inline `import { type A }` into `import type`.
- `import/no-duplicates` is off: the eslint-plugin-import 2.32 fixer merges `import type { A }` with `import d, { b, type C }` into the invalid `import d, type { A, b, type C }`, and with `prefer-inline` or `consistent-type-specifier-style` it moves value names under `import type`, dropping them at runtime with no parse error.

A mass autofix is verified per file by compiling it (svelte-preprocess + svelte compile + esbuild `loader: 'ts'`, which drops unused imports) before and after `prettier` + `eslint --fix`, and comparing the runtime import set. TypeScript's transpile tolerates syntax errors, so a parse check through eslint is needed too.
