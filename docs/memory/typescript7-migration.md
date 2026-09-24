# TypeScript 7 (tsgo) build

Область: [Сборка и инструменты](../getting-started.md)

Build compiles with the `typescript7` alias (`npm:typescript@7.0.2`, `foundations/utils/packages/platform-rig/package.json`). Packages themselves depend on the regular `typescript` catalog entry (`^6.0.3`, `pnpm-workspace.yaml`) - see AGENTS.md "Build & Validation" for why two versions coexist.

typescript@7.0.2 ships only `bin/tsc` plus `./unstable/*` - no classic Compiler API (`ts.createProgram`/`getPreEmitDiagnostics`). `resolveTsc7()` (`foundations/utils/packages/platform-rig/bin/compile.js`) spawns the native platform binary directly instead of the node shim.

tsgo does not compile `.svelte`. Only one package still routes through esbuild-svelte for JS, `foundations/utils/packages/ui-test` (`runEsbuildPackage`, `foundations/utils/packages/platform-rig/bin/phases/build.js`) - a prototype for precompiling svelte into packages instead of webpack. Every other UI package emits only declarations via `tsc` (`isUi` branch in `runBuildPhase`, same file) and gets its JS from webpack/esbuild at bundle time.

`--tsBuildInfoFile .build/build.tsbuildinfo` is passed on the tsc CLI (`runTsc`, `phases/build.js`), not set in `tsconfig.json` or a rig profile: a relative path declared in a shared rig profile resolves against the profile's own location, so every UI package sharing that profile would collide on one tsbuildinfo file.

`pnpm-workspace.yaml`: `strictPeerDependencies: true` with `peerDependencyRules.ignoreMissing` covering `@emnapi/core`, `@rspack/core`, `@types/dom-mediacapture-record`, `@types/dom-mediacapture-transform`, `electron-builder-squirrel-windows` - all optional peers nothing in the repo actually pulls in (wasm variants of `sharp`, a Windows-only electron-builder target, unused rspack/WebRTC types).

Non-UI packages: tsc runs with `--emitDeclarationOnly` and writes only `types/`, esbuild alone writes `lib/` (`emitLib`, `compile.js`, sources taken from the tsconfig `rootDir` - the sanity test packages use `./tests`). A single writer is required: `pnpm docker` (`--esbuild-emit`) and the regular build share `lib/`, and incremental tsc re-emits only changed files, leaving a mixed `lib/`. In a mixed `lib/` an esbuild module importing the default export of a half-loaded tsc module through an import cycle snapshots its exports without `default` (`__toESM`), e.g. `setting.component` undefined in `getRoleAttributeProps`. The build phase cache key is `build-split*`.

esbuild is also the bundler for pods/services with a docker phase (`--bundle=true`, externals, single-file output) and the ui-test svelte compiler above.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
- [fast-build-tooling.md](fast-build-tooling.md) - platform-rig/bin worker pool and cache internals.
