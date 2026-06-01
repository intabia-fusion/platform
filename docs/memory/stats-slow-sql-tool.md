# Stats SQL analysis tools (dev/tool)

Three commands for finding slow PostgreSQL queries and missing indexes from the stats service.

## Where SQL lives in stats

Real SQL is in the metrics tree at `topResult[].params.sql` (raw) / `.psql` (formatted lines) / `.query` (original DocumentQuery). Populated by PG adapter `findAll` fullParams in `foundations/server/packages/postgres/src/storage.ts` (~line 571), marker `metric: 'db.query.duration'`. Path in tree: `stats.measurements["🧲 session"].measurements["🧨 findAll"].measurements["client-find-all"].measurements.findAll.topResult[].params.sql`.

The `/api/v1/analytics` endpoint does NOT expose `top.params` (its `top` arrives empty from prod). Must use `/api/v1/statistics?name=<service>` per-service to get the raw tree with SQL.

## Endpoints (pods/stats/src/stats.ts)

- `/api/v1/overview?token=` - all live services (data keys = service names), admin only
- `/api/v1/statistics?name=<service>&token=` - raw ServiceStatistics tree for one service (has SQL)
- `/api/v1/analytics?...` - aggregated top (no params)

All need admin token: `generateToken(systemAccountUuid, undefined, { admin: 'true' }, SERVER_SECRET)`.

## Commands

- `stats-dump --url <platform> -o <dir> [--filter transactor]` - overview + per-service raw JSON to dir
- `stats-slow-sql --from <dir> | --url <platform>` - collect SQL from topResults, normalize, group by shape, rank by max/sum/count/avg. `--indexes <yaml>` checks coverage vs `dump-indexes` output, prints COVERED/MISSING + CREATE INDEX suggestions. `--missing-only`, `--json <file>`.
- `dump-indexes <file>` - existing command, dumps pg_indexes per domain to YAML (needs DB access). `slowsql.ts` reuses this YAML format.
- `stats-analytics --json <file>` - added file-dump mode to existing command.

## Gotcha: devTool global env gate

`devTool()` in index.ts (~line 170) hard-requires SERVER_SECRET + ACCOUNTS_URL + TRANSACTOR_URL before any command runs, even `--from` (offline). Run with:
`SERVER_SECRET=secret ACCOUNTS_URL=http://localhost:3000 TRANSACTOR_URL=ws://localhost:3333 npx ts-node src/__start.ts stats-slow-sql --from ./dir ...`

## Coverage logic (slowsql.ts analyzeCoverage)

Column covered if it is the leading index column OR the 2nd column in a `workspaceId`-leading composite. `workspaceId` and `data:*` JSON paths are not "discriminating".

Output (with --indexes) is NOT auto-suggestions (user rejected that). It prints, per query: the normalized SQL, filter columns color-coded (green=covered, red=uncovered discriminating, gray=non-discriminating), and the CURRENT indexes on that table with their columns (or NONE). Operator decides per case. Summary line: N MISSING / M COVERED.

Heuristic only - no EXPLAIN, no selectivity ranking. `_class` is low-selectivity so a `(workspaceId, _class)` composite may not actually help even though it reads as COVERED.

## Colors

Inline ANSI in slowsql.ts (no chalk dep in tool). `wrap()` uses `[..m` template. Disabled when NO_COLOR set or stdout not a TTY. colorMs thresholds: >=5000ms red, >=1000ms yellow, else green.
