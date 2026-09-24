# Lint phase memory

Lint concurrency and per-worker heap come from a single measured profile, not a hardcoded cap: `PHASE_MEMORY.lint = { minHeapMB: 2048, heapMB: 2560 }` (`foundations/utils/packages/platform-rig/bin/libs/utils.js`, `getOptimalWorkerCount`). `@typescript-eslint` 8 builds a bigger type graph than 6 did - `pod-gmail` OOMs below 2048MB per worker. Worker count is `budgetMB / minHeapMB` capped by CPU, so a low-memory box runs fewer, not smaller, workers.

Each worker gets a hard V8 heap ceiling (`resourceLimits: { maxOldGenerationSizeMb: heapMB, maxYoungGenerationSizeMb: 512 }`, `phases/lint.js`) instead of relying on manual GC - `--expose-gc`/`global.gc()` are not used. A worker recycles after 15 packages or once it reports memory above 80% of its heap ceiling (`recycleAfter`/ `recycleMemoryMB`, `getNamedWorkerPool` in `libs/workers.js`), so heap growth within one long-lived worker cannot accumulate across the whole run.

`lint-worker.js` lints files in chunks of 50 (`chunkSize`) - ESLint retains AST/messages for every file in a `lintFiles()` call, so chunking bounds peak retention regardless of package size. ESLint's own file cache is content-keyed (`cacheStrategy: 'content'`, per-package `.eslintcache`) rather than mtime-keyed, because a git checkout changes mtimes without changing content.

The phase-level cache key is a composite hash, not the plain package hash: own source plus every transitive dependency's `types/` hash plus `.eslintrc.js`/`.eslintrc.json`/`eslint.config.js` (`compositeHashFromTypes`, `libs/composite-hash.js`) - lint only ever sees a dependency through its emitted `.d.ts`, so keying on dependency sources would re-lint the whole downstream closure on any upstream edit.

## Связанные документы

- [getting-started.md](getting-started.md) - build commands.
- [memory/fast-build-tooling.md](memory/fast-build-tooling.md) - platform-rig/bin worker pool internals.
