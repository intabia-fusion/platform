# dev/prod webpack prod build profile (2026-09-22, 16-core Mac)

| | terser (default) | EsbuildPlugin |
|---|---|---|
| wall | 101.5 s | 89.9 s |
| peak RSS | 11.7 GB (footprint 14 GB) | 6.9 GB |
| minify phase | 21.3 s | 3.0 s |
| CompressionPlugin | 46.5 s | 52.3 s |
| JS raw / gz / br | 50M / 12M / 8.1M | 51M / 13M / 8.7M |

- Biggest phase is `CompressionPlugin`, not the minifier: gzip + brotli level 11 over JS **and** `.map` (93 MB of maps).
- `EsbuildPlugin` needs `charset: 'utf8'`, otherwise non-ASCII is escaped to `\uXXXX` (emoji-data-ru +78%).
- fork-ts-checker is off in production (`doValidate = !prod`); dev/prod type-check is 1.7 s on tsc 6, so tsgo there buys ~1 s.
- tsc 7 rejects dev/prod tsconfig: `moduleResolution=node` removed (TS5108).
- History: EsbuildPlugin minimizer added in 34b16ae88d, removed in 0a682d03e3 ("Switch huly core"); breakage reason not recorded.
- Under heavy swap the terser run stalls for an hour at `TerserPlugin` (parallel workers, 14 GB footprint).

## Compression fixes (esbuild minifier, same machine)

| change | CompressionPlugin | wall | peak RSS |
|---|---|---|---|
| baseline | 52.3 s | 89.9 s | 6.9 GB |
| `exclude: /\.map$/` | 39.2 s | 84.1 s | 6.0 GB |
| + `UV_THREADPOOL_SIZE=16` | 16.0 s | 64.5 s | 5.7 GB |

- zlib gzip/brotli runs on the libuv threadpool (default 4 threads), so brotli 11 was pool-bound.
- Not applied: GitHub runners have 4 vCPU, so a larger pool gives nothing there.
- Uncompressed `.map` is safe: express-static-gzip falls back to the plain file, staticMemoryCache skips `.map`.

## Terser vs esbuild with compression fixes (no .map compression, UV_THREADPOOL_SIZE=16)

| | terser | esbuild |
|---|---|---|
| wall | 68.6 s | 64.5 s |
| peak RSS | 13.6 GB | 5.7 GB |
| minify | 22.9 s | 4.0 s |
| compression | 11.8 s | 16.0 s |
| JS br | 8.1M | 8.7M (+7%) |

- After the compression fix the minifier choice saves only ~4 s wall; esbuild's win is memory, its cost is +7% brotli.

## Decision (2026-09-23)

- Terser stays (esbuild gains ~4 s only).
- Compression gated: `DO_COMPRESS=true` only in the GitHub release docker build step for `refs/tags/v*`/`s*` (the pushed images). Local, GitLab and uitest docker builds skip .gz/.br.
- desktop: CompressionPlugin removed. electron-builder packs `./dist/**` into asar and windows use `loadFile`, so .gz were never read.
- `package` phase cache hash does not include `DO_COMPRESS`: a cached local dist stays uncompressed.
- front `index.ts` checks `request.accepts().includes('gzip')` (Accept, not Accept-Encoding), so it serves plain `index.html` either way.

## webpack 5.111 upgrade: lang loaders (2026-09-23)

- webpack 5.111 needs enhanced-resolve ^5.25. Since enhanced-resolve 5.21.0 (PR #495) a context import
  `import(`@hcengineering/x/lang/${l}.json`)` fails: "Package path ./lang is exported ... but no valid target file".
  Cause: ExportsFieldPlugin treats `result === undefined` as missing target, but webpack resolves contexts in
  `yield` mode where the callback never carries a result. Upstream issue not filed yet (repro in scratchpad).
- Fix chosen: each lang package has `src/lang.ts` with a default `registerStrings()` doing literal
  `import('../lang/<l>.json')` per language; `exports["./lang"]` now points to `lib/lang.js`.
  dev/prod and desktop `configureI18n` just call these functions.
- platform and core stay registered in dev/prod/desktop with literal `@hcengineering/<pkg>/lang/<l>.json`
  imports: their profile is CommonJS, tsc would turn `import()` into `require` and inline all langs.
- ui, presentation, ai-bot-resources have no `exports`; imported as `@hcengineering/<pkg>/src/lang`.
- dev/prod tsconfig switched to `moduleResolution: bundler`; node10 ignores `exports` (TS2307 on `/lang`).
- `platform-rig/profiles/assets/tsconfig.json` back to `module: commonjs`: ESM `lib/lang.js` breaks plain
  node/ts-node/jest (named import from CJS `@hcengineering/platform` fails, json import needs attributes).
  esnext was only needed for the old templated `import()`. Lazy lang loading is not lost: webpack cacheGroup
  `/-assets/` -> `bundle-assets` already put all 12 languages of every -assets package into one eager chunk.
- Build cache ignores rig profile changes: delete `.fast-build-cache.json` of affected packages to re-emit lib.
- server-pipeline `internationalization.ts` (1210 lines, 507 json imports) now calls the same functions.
  Runs only bundled (esbuild) or under ts-jest: `@hcengineering/github` pulls `@hcengineering/ui/src/colors`, as before.
- pod-github, pod-telegram-bot, pod-ai-bot register English (ai-bot also ru) only; left as is.

## webpack 5.102.1 vs 5.111.1 (same code, enhanced-resolve 5.25.1 in both, no compression, 2026-09-23)

| | prod 5.102 | prod 5.111 | desktop 5.102 | desktop 5.111 |
|---|---|---|---|---|
| wall | 56.5 s | 57.2 s | 48.0 s | 42.5 s |
| peak RSS | 9.1 GB | 6.7 GB | 5.8 GB | 4.6 GB |
| JS | 50.07 MB | 50.03 MB | 59.19 MB | 59.10 MB |

- Minifier is still the biggest phase: TerserPlugin 22.5 s (5.102) vs MinimizerPlugin 26.7 s (5.111); load average
  was 7-14 during runs, so +-5 s is noise. Code generation dropped from 3.7 s to under 1.7 s.
- No package.json in the repo has `sideEffects`; ui-profile packages (69) have `main: src/index.ts`, so webpack
  compiles their sources and never reads their lib.
