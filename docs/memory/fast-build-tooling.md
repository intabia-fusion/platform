# fast-build tooling (platform-rig/bin)

Область: [Сборка и инструменты](../getting-started.md)

Code: `foundations/utils/packages/platform-rig/bin/`. Most of the bug fixes this note used to track (worker pool respawn, memory-probing page size, cache invalidation scope) now ship as comments next to the code they fix (`libs/workers.js`, `libs/utils.js`, `libs/cache.js`, `libs/composite-hash.js`)
- read those files directly rather than this note for that history.

`compile build-ui` (UI packages, `isUi` branch in `runBuildPhase`, `phases/build.js`) still runs tsc with `--emitDeclarationOnly`: it type-checks and writes `types/`, it does not skip validation - only the JS emit is skipped, because JS comes from webpack/esbuild at bundle time instead.

UI packages resolve for TypeScript through `"types": "types/index.d.ts"`, while webpack and jest keep `main: src/index.ts`. `compile build-ui` also writes `*.svelte.d.ts` (`emitSvelteDts` in `compile.js`, svelte2tsx `emitDts`, in a child process), otherwise the `./X.svelte` re-exports in `types/` resolve to nothing. Before this, every dependent's tsc/eslint/svelte-check program compiled the dependencies' sources: tracker-resources lint 13.9-16.6 s -> 8.6-9.2 s (same 279 messages), svelte-check 12.5 s -> 3.8 s, all 55 svelte-check packages 387 s -> 94 s CPU (2026-09-28). The emit costs 1-2.8 s per package, 82 s CPU for all 65 on a cold build.
- A `.svelte.d.ts` keeps the component's relative imports: `'../../src/kits/editor-kit'` from `src/components` pointed dependents back into text-editor-resources sources (67 files per program).
- A relative import of the package root (`'..'` from `src/utils.ts`) now resolves to the package's own `types/` and tsc fails with TS5055 "would overwrite input file".
- Component props, slot lets and methods were `any` through the `*.svelte` shim and are typed now; `NodeJS.*` no longer arrives via dependency sources in browser packages.
- `.eslintcache` (lint-worker, content strategy) is not cleared by `--force`; delete it for a cold lint measurement.

`models/all` is resolved from `phases/bundle-phase.js` as `resolve(__dirname, '../../../../../../models/all')` (6 levels up) - get that `../` count wrong and `getModelHash()` silently returns `null`, breaking the model-change cache invalidation it implements with no visible symptom.

## Tests

`bin/__tests__/`, plain `node --test`. `fixtures/mini-repo.js` builds a throwaway pnpm workspace on disk (writes `pnpm-workspace.yaml` directly) since the tooling reads that file, not a package list from a separate index. `compile_all` is driven via `spawnSync` as a child process (`smoke.test.js`) because it calls `process.exit`.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
- [typescript7-migration.md](typescript7-migration.md) - tsc7 compile path specifics.
- [fast_build_cache_external_deps.md](fast_build_cache_external_deps.md) - cache key gap for external dependencies.
