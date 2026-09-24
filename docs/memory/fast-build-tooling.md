# fast-build tooling (platform-rig/bin)

Область: [Сборка и инструменты](../getting-started.md)

Code: `foundations/utils/packages/platform-rig/bin/`. Most of the bug fixes this note used to track (worker pool respawn, memory-probing page size, cache invalidation scope) now ship as comments next to the code they fix (`libs/workers.js`, `libs/utils.js`, `libs/cache.js`, `libs/composite-hash.js`)
- read those files directly rather than this note for that history.

`compile build-ui` (UI packages, `isUi` branch in `runBuildPhase`, `phases/build.js`) still runs tsc with `--emitDeclarationOnly`: it type-checks and writes `types/`, it does not skip validation - only the JS emit is skipped, because JS comes from webpack/esbuild at bundle time instead.

`models/all` is resolved from `phases/bundle-phase.js` as `resolve(__dirname, '../../../../../../models/all')` (6 levels up) - get that `../` count wrong and `getModelHash()` silently returns `null`, breaking the model-change cache invalidation it implements with no visible symptom.

## Tests

`bin/__tests__/`, plain `node --test`. `fixtures/mini-repo.js` builds a throwaway pnpm workspace on disk (writes `pnpm-workspace.yaml` directly) since the tooling reads that file, not a package list from a separate index. `compile_all` is driven via `spawnSync` as a child process (`smoke.test.js`) because it calls `process.exit`.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
- [typescript7-migration.md](typescript7-migration.md) - tsc7 compile path specifics.
- [fast_build_cache_external_deps.md](fast_build_cache_external_deps.md) - cache key gap for external dependencies.
