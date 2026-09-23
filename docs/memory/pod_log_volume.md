# Pod log volume: what was actually filling it

Область: [Архитектура](../architecture.md)

A sanity run left these line counts, with zero errors in the two biggest:

| pod | lines | what most of it was |
|---|---|---|
| front0 | 45822 | 45600 morgan access lines, one per static asset request |
| workspace | 9420 | 84% in five messages, all reporting success |
| transactor0 | 13464 | a workflow trigger logging every update tx, and again when it did nothing |
| fulltext | 11928 | 88% a `reindex verify` / `reindex done` pair, at warn level |

## The measurement that decided the threshold

The per-operation logs in `server/tool/src/index.ts` were gated on `tdelta > 0`, which is true for essentially everything. Pulling the timings out of the logs:

| message | n | p50 | p95 | max |
|---|---|---|---|---|
| `Create` | 4231 | 0.02 ms | 51 ms | 372 ms |
| `migrate:` | 3991 | 0.02 ms | 6 ms | 50 ms |
| `pre-migrate:` | 404 | 1.8 ms | 10 ms | 79 ms |

Eight thousand lines described work measured in hundredths of a millisecond. `SLOW_OP_MS = 250` (`server/tool/src/index.ts`) prints nothing on a healthy run and still surfaces an operation worth looking at.

## Policy applied

Only failures are logged unconditionally. Success gets a line when it was slow enough to matter, or when it actually changed something (`reindex done` only when `processed > 0`). Conditions that belong to the deployment rather than the workspace are reported once per process, not per workspace (`PlanLimitsBootMiddleware`, `foundations/server/packages/middleware/src/planLimitsMiddleware.ts`).

The pre-migration log in `foundations/core/packages/model/src/migration.ts` reports after the fact (`migration done`, only past `SLOW_MIGRATION_MS = 250`), not before running it - a migration that hangs rather than throws has no per-migration breadcrumb; the nearest signal is a missing `---CREATE-DONE---------` from `server/workspace-service/src/service.ts` at the end of the workspace-creation flow that runs the migration.

## Left alone deliberately

- `no document found, failed to apply model transaction, skipping` (`foundations/core/packages/core/src/memdb.ts`, three call sites) - a model `TxUpdateDoc`/`TxRemoveDoc`/`TxMixin` against a document that is not there. Either a real model divergence or an expected race; silencing it without understanding it would hide a defect.
- `TxApplyIf failed` (`foundations/server/packages/middleware/src/applyTx.ts`) - same reasoning.

## Where the knobs are

- `SLOW_OP_MS` - `server/tool/src/index.ts`
- `SLOW_MIGRATION_MS` - `foundations/core/packages/model/src/migration.ts`
- `ACCESS_LOG=all` - restores the full front access log, `server/front/src/index.ts` (`accessLogAll`, gates the morgan `skip` callback)
