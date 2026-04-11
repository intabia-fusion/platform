# Lint Phase Memory & Performance Optimization

## Problem
Lint phase used ~24GB RAM on 8-core machines: `validationWorkers` (up to 8) was passed as concurrency,
creating 8 ESLint worker threads simultaneously, each holding large AST/rule caches in heap.

## Changes (2026-04-11)

### phases/lint.js
- Concurrency capped: `lintConcurrency = Math.max(1, Math.min(concurrency, 2))` — max 2 lint workers
- Pool created with `workerOptions: { execArgv: ['--expose-gc'] }` to enable manual GC in worker
- Per-package timing with `performance.now()` before/after `pool.runTask`
- Log format: `[L] N/total name linted Xms YMB`
- After Promise.all: prints top-5 slowest packages and peak worker memory

### lint-worker.js
- After `eslint.lintFiles` + format: `eslint = null; results = null` to release heap refs
- Calls `global.gc()` if available (enabled by `--expose-gc` execArgv)
- Returns `memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)` in every response

### libs/workers.js
- `GenericWorkerPool` constructor accepts optional 3rd arg `poolOptions = {}`
- `poolOptions.workerOptions` forwarded to `new Worker(path, workerOptions)` — enables per-pool execArgv
- `getNamedWorkerPool` accepts 4th arg `poolOptions` and passes to constructor
- Fully backward-compatible (validate pool unchanged, no poolOptions passed there)

## Expected Impact
- Memory: ~24GB -> ~6GB (2 workers x ~3GB each instead of 8)
- Time: minimal regression (lint is I/O bound, 2 concurrent workers still saturate disk)
- GC after each package prevents heap growth within a single worker session
