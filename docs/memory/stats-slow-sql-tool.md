# Stats SQL analysis tools (dev/tool)

Область: [Архитектура](../architecture.md)

Commands for finding slow PostgreSQL queries and missing indexes from the stats service: `stats-dump`, `stats-slow-sql`, plus file-dump modes added to the pre-existing `dump-indexes`/`stats-analytics`.

## Where SQL lives in stats

Real SQL is in the metrics tree at `topResult[].params.sql` (raw) / `.psql` (formatted lines) / `.query` (original DocumentQuery). Populated by the postgres adapter's `findAll` (`foundations/server/packages/postgres/src/storage.ts`): the `ctx.with('findAll', ..., () => ({ query, psql, sql }), { metric: DB_QUERY_DURATION })` params callback, `DB_QUERY_DURATION = 'db.query.duration'`. Observed path in a real dump: `stats.measurements["session"].measurements["findAll"].measurements["client-find-all"].measurements.findAll.topResult[].params.sql`.

`/api/v1/analytics`'s `walk()` (`pods/stats/src/stats.ts`) only emits a node's `params` into `top` when that node has no child measurements (`!hasChildMeasurements && hasParams`); the postgres `findAll` node that carries the SQL params sits nested under `client-find-all` with further children, so its params never surface there in practice. Use `/api/v1/statistics?name=<service>` per-service to get the raw tree with SQL instead.

## Endpoints (pods/stats/src/stats.ts)

- `/api/v1/overview?token=` - all live services (data keys = service names), admin only
- `/api/v1/statistics?name=<service>&token=` - raw ServiceStatistics tree for one service (has SQL)
- `/api/v1/analytics?...` - aggregated top per leaf/param, `top.params` present but rarely populated for SQL nodes (see above)

All need admin token: `generateToken(systemAccountUuid, undefined, { admin: 'true' }, SERVER_SECRET)`.

## Commands

- `stats-dump --url <platform> -o <dir> [--filter transactor]` - overview + per-service raw JSON to dir
- `stats-slow-sql --from <dir> | --url <platform>` - collect SQL from topResults, normalize, group by shape, rank by max/sum/count/avg. `--indexes <yaml>` checks coverage vs `dump-indexes` output, prints COVERED/MISSING + CREATE INDEX suggestions. `--missing-only`, `--json <file>`.
- `dump-indexes <file>` - dumps pg_indexes per domain to YAML (needs DB access). `slowsql.ts` reuses this YAML format.
- `stats-analytics --json <file>` - file-dump mode for the existing command.

## Gotcha: tool env gate

`buildToolProgram` (`dev/tool/src/index.ts`) hard-throws if `SERVER_SECRET` or `ACCOUNTS_URL` is unset, even for an offline `--from` run; `TRANSACTOR_URL` only logs a warning (does not throw) when it and both `REGION_CONFIG`/`REGION_CONFIG_JSON` are unset. Run with all three set anyway to avoid the warning: `SERVER_SECRET=secret ACCOUNTS_URL=http://localhost:3000 TRANSACTOR_URL=ws://localhost:3333 npx ts-node src/__start.ts stats-slow-sql --from ./dir ...`

## Coverage logic (slowsql.ts analyzeCoverage)

Column covered if it is the leading index column OR the 2nd column in a `workspaceId`-leading composite. `workspaceId` and `data:*` JSON paths are not "discriminating".

Output (with `--indexes`) is not auto-suggestions by design: it prints, per query, the normalized SQL, filter columns color-coded (green=covered, red=uncovered discriminating, gray=non-discriminating), and the current indexes on that table with their columns (or NONE); the operator decides per case. Summary line: N MISSING / M COVERED.

Heuristic only - no EXPLAIN, no selectivity ranking. `_class` is low-selectivity, so a `(workspaceId, _class)` composite may not actually help even though it reads as COVERED.

## Colors

Inline ANSI in `slowsql.ts` (no chalk dep in tool), disabled when `NO_COLOR` set or stdout not a TTY. `colorMs` thresholds: >=5000ms red, >=1000ms yellow, else green.
