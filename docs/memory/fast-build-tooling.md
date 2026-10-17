# fast-build tooling (@intabia-fusion/yama)

Область: [Сборка и инструменты](../getting-started.md)

Code: npm package `@intabia-fusion/yama` (repo `yama`, TypeScript, `src/build/`). `foundations/utils/packages/platform-rig` keeps `profiles/` and thin shims at the old `bin/*.js` and `bin/libs/{workspace,test-groups}.js` paths that `require` yama, so build commands and require paths are unchanged. Repo-specific settings (version.txt hashing, in-process bundle via `common/scripts/esbuild.js`, `models/all`, non-Latin-1 escaping, docker namespace, eslint plugins package, coverage server dirs, update-deps scope) are in `yama.config.json` at the repo root; the format is described in the yama `readme.md` and `docs/protocol.md`.

Mapping of the internals (yama paths): `libs/<x>` -> `src/build/libs/<x>.ts` (`workers`, `utils`, `cache`, `composite-hash`), `phases/<x>` -> `src/build/phases/<x>.ts` (`bundle-phase.js` is `bundle.ts`), `lint-worker`/`format-worker` -> `src/build/workers/`, tsc spawn (`resolveTsc7`) -> `src/build/drivers/tsc.ts`, `compile_all`/`watch_all` -> `src/build/compile-all.ts`/`watch-all.ts`, esbuild/svelte helpers -> `src/build/compile.ts`, other bin scripts -> `src/bin/<name>.ts`.

Bug fixes for the worker pool respawn, memory-probing page size and cache invalidation scope ship as comments next to the code they fix (`libs/workers.ts`, `libs/utils.ts`, `libs/cache.ts`, `libs/composite-hash.ts` in yama) - read those files for the reasoning.

`compile build-ui` (UI packages, `isUi` branch in `runBuildPhase`, yama `src/build/phases/build.ts`) still runs tsc with `--emitDeclarationOnly`: it type-checks and writes `types/`, it does not skip validation - only the JS emit is skipped, because JS comes from webpack/esbuild at bundle time instead.

UI packages resolve for TypeScript through `"types": "types/index.d.ts"`, while webpack and jest keep `main: src/index.ts`. `compile build-ui` also writes `*.svelte.d.ts` (`emitSvelteDts` in yama `src/build/compile.ts`, svelte2tsx `emitDts`), otherwise the `./X.svelte` re-exports in `types/` resolve to nothing. Before this, every dependent's tsc/eslint/svelte-check program compiled the dependencies' sources: tracker-resources lint 13.9-16.6 s -> 8.6-9.2 s (same 279 messages), svelte-check 12.5 s -> 3.8 s, all 55 svelte-check packages 387 s -> 94 s CPU (2026-09-28). The emit costs 1-2.8 s per package, 82 s CPU for all 65 on a cold build.
- A `.svelte.d.ts` keeps the component's relative imports: `'../../src/kits/editor-kit'` from `src/components` pointed dependents back into text-editor-resources sources (67 files per program).
- A relative import of the package root (`'..'` from `src/utils.ts`) now resolves to the package's own `types/` and tsc fails with TS5055 "would overwrite input file".
- Component props, slot lets and methods were `any` through the `*.svelte` shim and are typed now; `NodeJS.*` no longer arrives via dependency sources in browser packages.
- `.eslintcache` (`src/build/workers/lint-worker.ts` in yama, content strategy) is not cleared by `--force`; delete it for a cold lint measurement.

The model package comes from `bundle.modelPackage` in `yama.config.json` (`models/all`), resolved against the repo root in `getModelHash` (yama `src/build/phases/bundle.ts`). It reads `.fast-build-cache.json` of that package, then `bundle/model.json`. Without `modelPackage` or both files, `getModelHash()` returns `null` and the model-change cache invalidation silently does not happen.

## typescript7 and peer dependencies

yama depends on `typescript7: npm:typescript@7.0.2`. pnpm then satisfies the `typescript` peer of any package inside yama's dependency tree with that alias (7.0.2), so `svelte2tsx`, `svelte-preprocess` and `esbuild-svelte` are optional `peerDependencies` of yama, resolved from platform-rig (typescript 6.0.3). Making them plain `dependencies` of yama breaks `pnpm install` with `ERR_PNPM_PEER_DEP_ISSUES`.

`@intabia-fusion/yama` is in `minimumReleaseAgeExclude` of `pnpm-workspace.yaml`, so a freshly published version installs at once.

## Tests

Tests live in yama (`src/build/__tests__/`, vitest, `pnpm test` in the yama repo). `fixtures/mini-repo.ts` builds a throwaway pnpm workspace on disk (writes `pnpm-workspace.yaml` directly) since the tooling reads that file, not a package list from a separate index. `compile-all` is driven via `spawnSync` as a child process (`smoke.test.ts`) because it calls `process.exit`.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
- [typescript7-migration.md](typescript7-migration.md) - tsc7 compile path specifics.
- [fast_build_cache_external_deps.md](fast_build_cache_external_deps.md) - cache key gap for external dependencies.
