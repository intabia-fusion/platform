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
