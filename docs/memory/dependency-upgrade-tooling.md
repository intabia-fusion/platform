# Dependency upgrade tooling

Область: [Сборка и инструменты](../getting-started.md)

```bash
node common/scripts/outdated.js                                   # -> combined_dependencies/UPGRADE.md + cache
node common/scripts/outdated-apply.js --category ui --bump patch  # bumps versions, prints the check command
node common/scripts/outdated-bench.js fast-equals                 # compares current vs target version under load
```

`outdated.js` scans every `package.json` in the tree (including nested workspaces `foundations/net`, `foundations/core`), not just the top-level `pnpm-workspace.yaml` list. `--category` restricts which deps are reported/bumped but `outdated-apply.js` still rewrites the version text in every `package.json` that depends on it - a single version per dependency across the repo is required (`pnpm check-versions`).

Node target: `nodeTargetMajor()` reads `engines.node` from the root `package.json` (`common/scripts/outdated.js`), so the `node` category and `@types/node` are automatically capped at the Node major the repo targets - override with `NODE_TARGET_MAJOR`.

Bench scripts live in `common/scripts/bench/<pkg>.js`, run via `outdated-bench.js <pkg> [verA verB] | --all`, fixtures in `common/scripts/bench/_data.js`. Covers: fast-equals, fast-copy, uuid, lru-cache, msgpackr, ws, express, koa.

## Pins (`common/config/dependency-pins.json`)

`maxMajor` or exact `maxVersion` + reason; `outdated.js`/`outdated-apply.js` never suggest or apply above it. Current: `fast-copy<=3` (v4 slower, maxDepth counter), `svelte<=4` (v5 is runes/mount API, separate migration), `uuid<=11` (12+ is ESM-only, repo is CJS), `intl-messageformat<=10` (11 is ESM-only), `lru-cache<=11.1.0` (11.5.2 regressed read perf), `dotenv<=16` (17 prints "injecting env" to stdout by default), `tar-stream<=3.1.9` (3.2 ships its own `.d.ts` over `@types/tar-stream` without `Readable` on `Pack`, breaks `server/backup`), `sanitize-html<=2.17.5` (2.17.6+ pulls `htmlparser2@^12`, ESM-only, jest 29 cannot `require()` it), `snappy<=7.3.3` (7.4.x `require`s a `.mjs` polyfill, `SyntaxError` under jest 29).

A pin needs a verified reason, not "just in case": the earlier `msgpackr` pin was lifted after re-benchmarking showed no measurable difference between the 1.x and 2.x line for this repo's usage.

`msgpackr` is held at `>=2.1.0` (catalog) instead: 1.x's `unpack.js` allocated `new Array(length)` from the wire header before reading the array body, so 5 bytes (`array32` claiming 20M elements, no payload) could force a large heap allocation before the read failed. 2.1.0 added `length > srcEnd - position` bounds checks.

## Прочие грабли

- `postgres` 3.4.8 narrowed `TransactionSql` so it no longer assigns to `Sql` - code taking `client?: postgres.Sql` but receiving a `begin()`/`retryTxn` client breaks. Fixed with a union alias: `type SqlClient = Sql | TransactionSql` (`server/account/src/collections/postgres/postgres.ts`).
- `image-size` 2.x: the `image-size/fromFile` subpath does not resolve under this repo's `moduleResolution` (TS2307) - read the file and call `imageSize(buffer)` instead (`pods/link-preview/src/parse.ts`, `packages/importer/src/huly/huly.ts`, `services/mail/mail-common/src/utils.ts`).
- OTel bump to 0.222 moved the exporter into the options object: `new BatchLogRecordProcessor({ exporter, ...opts })` (`foundations/core/packages/measurements-otlp/src/telemetry.ts`).

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
