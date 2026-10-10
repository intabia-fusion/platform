# Desktop renderer memory

Область: [Платформа: рабочее место, настройки, экспорт, бэкап, desktop](../features/platform-infra.md)

Measured 2026-10-10 on a local production build (`desktop`, `pnpm run package`), cold start into the same workspace page, renderer footprint via `footprint <pid>`, allocator split via CDP `Tracing.requestMemoryDump` (memory-infra, detailed).

## Script source is kept in the Blink memory cache

`web_cache/Script_resources` holds the full source of every loaded script for the whole page lifetime. With one 57M-char `bundle.js` that contains any char above U+00FF the source is stored as UTF-16: 114.6 MB.

- esbuild `charset: 'ascii'` escapes strings and identifiers but leaves chars inside regex literals (linkify TLD list, mermaid box-drawing classes, KaTeX, markdown-it). One such char keeps the whole script UTF-16. `EscapeNonLatin1Plugin` in `desktop/webpack.config.js` escapes the rest through `ReplaceSource`, so the source map survives.
- `charset: 'ascii'` alone measured worse than `utf8` (bigger file, still UTF-16). Check `web_cache/Script_resources` in a memory dump, not file size.
- The helpers live in `common/scripts/escape-non-latin1.js`: `EscapeNonLatin1Plugin` for webpack (desktop, `dev/prod`), `escapeNonLatin1File` for esbuild output (`common/scripts/esbuild.js` and `runEsbuildDirect` in `platform-rig/bin/phases/bundle-phase.js` - `pnpm bundle` builds server bundles in-process there, not through `esbuild.js`).
- Node/V8 keeps module source in the heap the same way: a 16M-char file with one `—` in a comment costs +35.6 MB instead of +19.4 MB. `pods/server` bundle: 41.5 MB -> 22.0 MB per process.
- The bundle phase cache hashes only `common/scripts/version.txt` from `common/scripts`, so a change there needs `--force` to rebuild bundles.

## Single bundle vs async chunks

`chunkFormat: false` in the UI config put every `*-resources` package into `bundle.js`, although `platform.ts` loads them through `addLocation(..., import(...))`. Without it the build emits ~1000 chunks, the entry is 20 MB and startup loads ~27 MB of scripts.

| Build | Renderer footprint | Script_resources |
|---|---|---|
| utf8, one bundle | 281-286 MB | 114.6 MB |
| Latin-1, one bundle | 236 MB | 63.6 MB |
| Latin-1, chunks | 174-192 MB | 27.8 MB |

`love-resources` loads at startup even when `desktop/src/ui/screenShare.ts` does not import it, so making that import lazy gains nothing. `@livekit/krisp-noise-filter` (6.35M chars of JS with inlined wasm, disabled by a flag since FUSIO-220) was removed from it: entry 20.3 MB -> 14.2 MB, cold footprint 164 MB.

## Old page contexts leak through pending contextBridge promises

A promise returned by a `contextBridge.exposeInMainWorld` function is held by an `Electron / PromiseHandle` (a C++ persistent root) until it settles. If the page reloads first, the handle keeps the old main-world `NativeContext` alive with the entire app state of that page. In a heap snapshot it shows as several `system / Script / .../bundle.js` copies and `NativeContext` nodes retained from `C++ Persistent roots -> Electron / PromiseHandle`.

Trigger seen: `electron.config()` in `desktop/src/ui/preload.ts` - `loadServerConfig` retries forever while the server is unreachable, so every reload while offline leaked one context (+12 MB V8 each on the login page, much more on a loaded workbench). Repro: CDP `Network.emulateNetworkConditions({ offline: true })` + 5x `Page.reload` -> V8 60 -> 120 MB; online reloads stay at 60 MB. Fix: the preload rejects the pending config promise on `pagehide`. Any new bridged call that can stay pending across a reload needs the same treatment.

Paths through `(Eternal handles) -> FunctionTemplateInfo -> ... part of key` are ephemeron edges and do not retain the context on their own; look for the strong root.

## Not reproduced

- Plain `Page.reload` / `location.reload()` with the app online does not leak (V8 heap stable at ~64 MB over 5 reloads); the leak needs a bridged promise pending at reload time.
- A second copy of the script source held by `(Global handles) / DevTools debugger` is a measurement artifact of an open DevTools window.
