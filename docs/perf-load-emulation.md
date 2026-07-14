# Prod-like load emulation (FUSIO-776)

Goal: fill local PG stand with **prod-shaped** dataset — thousands of users across thousands of spaces — so ordinary flows (open issue, list issues, read comments, open channel with threads) profile against realistic data. One machine slower than prod, but **shape** of load (row counts, per-space cardinality, status mix) must match, so measure real queries not generation artifacts.

## Why (lesson learned)

First loaded-DB run put **50k issues in one project** and **20k meetings all Active**. Distorted measurements:
- love store `{status: {$ne: Finished}}` pulled 16.5k rows (82ms) — pure artifact of "all Active". Real workspaces have single-digit active meetings.
- Genuine data-independent bug: LiveQuery `$inc` storm (idle tab hits server per transcription message) — reproduced with **one** meeting.

Takeaway: generate realistic **distributions**, then hunt slow queries.

## Realistic profile (targets, tunable %)

Per product owner:
- One busy project with everything = valid case — keep single-project support.
- Live project **mostly Done**: ~60% Done, ~15% Cancelled, ~15% In Progress, ~7% Todo, ~3% Backlog (tunable via flags).
- Active meetings rare: ~0.5% Active/Pending, rest Finished.

## Generator work (dev/tool `generate-big`)

1. **Multi-space** `--projects N`: create N tracker Projects, distribute tasks across them (round-robin or weighted so few projects large, most small — prod long-tailed). Each project gets own sequence/rank continuation.
2. **Status mix** `--status-dist "done=60,cancelled=15,inprogress=15,todo=7,backlog=3"`: assign issue status by category weight, resolve category → real Status ref of project's task type.
3. **Channels + threads** `--channels N --threads <pct>`: share of channel messages get ThreadMessage replies (chunter.class.ThreadMessage attachedTo the ChatMessage). Thread depth 1, N replies per threaded message.
4. **Users** `--users N` scale to hundreds/thousands; creators & assignees drawn from pool (done, just raise cap).
5. Keep idempotent top-up (per project, per channel) so runs resume.

## Scale tiers (define, then walk up)

| tier | projects | issues/proj | channels | msgs/ch | meetings | users |
|------|----------|-------------|----------|---------|----------|-------|
| S    | 10       | 500         | 20       | 200     | 200      | 50    |
| M    | 50       | 2000        | 100      | 500     | 2000     | 200   |
| L    | 200      | 3000        | 500      | 1000    | 10000    | 1000  |
| XL   | 1000     | 3000        | 2000     | 1000    | 40000    | 5000  |

(XL ≈ prod order of magnitude: 3M issues, thousands of spaces/users.)

## Measurement per tier

Each tier record:
- **DB size**: `pg_database_size` + per-table `pg_total_relation_size` (top 15).
- **Row counts** per domain table.
- **slow-SQL** find/tx from transactor (`stats-slow-sql --kind both -s p95`), wiped before each measured scenario.
- **Target scenarios** driven from UI or REST: open issue, list issues (project board), read comments, open channel + thread, all-issues view. Capture transactor findAll avg + PG server-side mean (pg_stat_statements) to separate node overhead from DB.

Write results into `docs/memory/sql-load-bench.md` per tier.

## Findings so far (before this plan)

- FIXED (real): LiveQuery `$inc` storm — `query/src/index.ts`, tests in `inc-match.test.ts`. Idle tab 83→5 req / 20s of 2msg/s transcription.
- MINOR: love store `$ne Finished` → `$in [Active,Pending]` (defensive; acute cost was all-Active artifact).
- `data#>>'{status}'` on space has **no index** → seq scan even at 100 rows; revisit if meetings list shows hot at scale.
- create path (per issue ~100ms tx): adapter-tx + triggers + tx-push + reserveContext serialization — separate optimization track.

## Real bug found while building the generator

`TxOperations.apply()` batching of **context-creating** ops by **same account** into one `TxApplyIf` violates unique index `chunter_doc_unique_workspaceid_attachedto_attachedtoclass_account` (DocNotifyContext / collaborator context, one row per account+attachedTo). Cause: posting comment/message/reply auto-collaborates author on target; trigger's `notMatch` guard evaluated against pre-apply DB state, so multiple context-creates for same key inside one apply don't see each other and collide. Same failure for **concurrent** same-author creates.

Rule for generator (and any bulk writer): never batch or concurrently run two context-creating ops for same (account, attachedTo). Implementation:
- issues: create issue (own tx), then comments/updates as separate txes;
- channels: warm-up one message per author sequentially (creates each author's channel context), then fan out rest concurrently; thread replies sequential per root.

Worth platform-side fix later (dedup contexts within TxApplyIf, or upsert context) — bulk importers hit it too.

## Tier S measurement (bench-ws, 2026-07-07)

10 projects (long-tailed), 5854 issues, 200 meetings, 20 channels + threads. Bench-ws row counts vs 5854 issues:
- collaborator: **57532** (~10/issue) — 2nd biggest table globally (366 MB)
- chunter_doc (DocNotifyContext): 26321 (~4.5/issue)
- activity: 25532 (comments + updates + thread replies + doc-update messages)
- tx: 43504 (674 MB globally — biggest table; every op logged)
- notification_read_state: 7041
- task: 5854, space: 301

Extrapolate to L (600k issues): collaborator ~6M rows, activity ~2.5M. There the security `EXISTS(space sec ...)` join + collaborator/notification lookups dominate. **collaborator + activity growth is thing to watch.**

Note: tier S too small to surface slow queries (full read scenario = 65ms). Need M/L to see p95 climb. slowSqlFind empty right after scenario (stats push interval ~30s; re-query later or drive more load).

Distribution bugs fixed while validating tier S:
- freshly-created projects not in pipeline space-security cache → their security-filtered count queries wrong → mark `isNew`, treat as empty.
- `findOne(Project,{})` could return bench project as base then double-fill it → prefer non-bench base (`description != bench-generated`) + dedupe by _id.

## collaborator table analysis (tracker, tier S)

Rows (bench-ws, 5854 issues): collaborator=57.5k, 2nd biggest table globally (366 MB). Breakdown by attachedToClass:
- ChatMessage (comments): 25.3k — **each comment gets own collaborator row** (ActivityMessage collaborators = createdBy + repliedPersons).
- Issue: 25.3k, avg **4.3/issue** (defineCollaborators fields createdBy+assignee, plus each commenter/updater auto-added as collaborator).
- ThreadMessage: 3.6k, ProjectToDo: 2.3k, Channel: 1k.
So ~10 collaborator rows per issue once comments/todos counted. Inherent to notification model, not a bug; realistic (reporter+assignee+watchers).

**Over-indexing (real inefficiency).** `collaboratorSchema` (postgres schemas.ts) marks 5 fields `index:true` → 5 single-column auto-indexes, plus deployment composite `(workspaceId, attachedTo, _class)`. Index usage since reset (busiest write table, ~10 inserts/issue):
- `collaborator_ws_attachedto_class_idx`: **94518 scans** — workhorse.
- `collaborator_attachedto__index`: 98 (redundant with composite prefix), 31 MB.
- `space` / `attachedToClass` / `_class` single-col: **0 scans**, ~25 MB total.
- `collaborator` (reverse): 0 this window but needed for inbox "docs I collaborate on" lookup — keep.
Every collaborator insert maintains all 6 secondary indexes; reads use only composite (+ reverse). Candidate: override `index:false` for `_class`, `space`, `attachedToClass` (and drop redundant `attachedTo` single-col) in collaboratorSchema; keep composite + `collaborator` reverse. Cuts write amplification and ~40 MB/1M-rows on hottest write table. Needs migration to drop existing indexes + before/after write-rate measurement — decide before applying. Reads 0.1 ms at tier S (composite covers them), so this is write-cost / size optimization, not read fix.

## Index drift: code over-creates vs prod (2026-07-07)

Prod `indexes.yaml` = source of truth for prod. Diffing stand's actual indexes against it: prod **dropped bare single-column indexes on hot write tables** (collaborator, task, activity, tx) but kept them on chunter_doc / notification_read_state. Our Postgres schema (`schemas.ts`, `index:true` fields) auto-creates those single-col indexes on every fresh workspace → write amplification on busiest tables that prod does not have.

Drift dropped on stand (18 indexes, DB 1813→1673 MB): collaborator ×5, task ×3, activity ×6, tx ×4. Reads use composites (`ws_attachedto_class` etc); bare single-col ones had ~0 scans. Speeds task creation + generation fill, makes measurements prod-shaped.

**Durable fix (recommended, not yet applied):** set `index:false` on those fields in hot-table schemas (`collaboratorSchema`, task/`defaultSchema`, `activitySchema`, `txSchema`) so fresh workspaces match prod. `_class`/`space` come from `baseSchema` (shared) — override per hot schema, don't touch base (chunter_doc/notification_read_state keep them). Needs migration to drop existing on already-provisioned workspaces + before/after write-rate measure.

## Provisioning entry points (dev/tool)

- Generate: `generate-big` / `generate-data` (see `dev/tool/BENCH.md`).
- Snapshot dump/restore: `dev/stand-snapshot.sh dump|restore` (PG + MinIO). Stand via `STAND=dev|sanity`, or `DB_URL=<url>` for a remote instance (DB only). Local stand: `BENCH_DUMP=<f>
  tests/prepare-pg.sh`.

## Tracker "busy project" index analysis (50k issues, prod-aligned indexes)

EXPLAIN on SECON (50007 issues, one project) after aligning stand to prod's `indexes.yaml`. Only task secondary index is `task_workspaceid__class_space_storing_rec_idx (workspaceId, _class, space)
INCLUDE (modifiedOn)`.

| op | plan | 50k | ~200k |
|----|------|-----|-------|
| board: space+class, sort rank, limit 200 | index seek (14.5k candidates) + **in-mem top-N sort** | 28 ms | ~110 ms |
| all-issues: sort modifiedOn desc | **in-mem top-N sort** (INCLUDE gives value, not order) | 50 ms | ~200 ms |
| filter status=Done | **Seq Scan**, 64.5k rows removed | 31 ms | ~120 ms |
| filter assignee | **Seq Scan**, 73k rows removed | 27 ms | ~110 ms |

Current index covers "issues in a project" but NOT ordered retrieval (sort in-memory) nor attribute filtering (status/assignee/priority seq-scan). All linear in project size → busy project (200k-500k) hits 100-500 ms/query.

**Candidates for deployment yaml (big installs, supplied via apply-indexes; NOT lean default):**
- ordered index for board/list: `(workspaceId, space, _class, ((data#>>'{rank}')))` and/or `(workspaceId, space, _class, (("modifiedOn")::numeric) DESC)` — kills in-mem sort.
- filter indexes IF tracker UI filters server-side (verify first via stats-slow-sql during real board/filter interaction): `(workspaceId, space, ((data#>>'{status}')))`, same for assignee/priority.

Next: drive real tracker board + filter interaction (UI or sanity test) with stats wiped, read actual SQL shapes from stats-slow-sql, then add only indexes real queries need to yaml. (Board may fetch-all + group client-side, then only sort index matters, not per-attribute ones.)

## BIG FIND: cross-space "All Issues" seq-scans + disk-sorts (2026-07-07)

Question that led here: with many spaces × up to 50k issues each, does space filter matter? **Hugely.** Single-space query seeks `(ws,_class,space)` index (28 ms). Cross-space query (All Issues, no space filter — only security EXISTS on membership) can't use it:

EXPLAIN on sanity-ws (50125 issues, 2 spaces), `ORDER BY modifiedOn DESC LIMIT 200`:
- **Parallel Seq Scan** on task + **external merge Sort → DISK (16 MB spill)** → 74 ms. Sorts ALL matching issues before limit. Security EXISTS cheap (Memoize + space_pkey, few spaces). At many-spaces × 50k = millions of rows this is seconds + heavy disk.

Two things fix it, both required:
1. **Code (applied, storage.ts):** query builder emitted `_class = ANY(ARRAY['Issue'])` even for single class (`fillClass` → `{$in: classes}` with one descendant). `= ANY(...)` **blocks planner from using ordered index**. Fix: single-element `$in` → `= x` equality (general, in `$in` builder — helps every single-element `$in`, incl. `_class`).
2. **Ordered index (deployment yaml, big installs):** `task (workspaceId, _class, ((modifiedOn)::numeric) DESC)` — mirrors existing `tx_ws_class_modifiedon_idx`. modifiedOn is NumericType so buildOrder emits `(modifiedOn)::numeric DESC`; index must match cast.

Result (real transactor query form, `_class=` + numeric index): **74 ms → 0.586 ms (126×)** — Index Scan in modifiedOn order, security EXISTS per row, early stop at 200. No seq scan, no disk sort.

Same shape applies to board sort-by-rank → add `(workspaceId, _class,
((data#>>'{rank}'))))` for ranked list, and per-project variants with `space` if single-space board sort hot. Verify against real UI SQL before finalizing yaml.

## CORRECTION: all-issues index is (ws, modifiedOn), NOT (ws, _class, modifiedOn)

Earlier claim (single-class `_class=` + `(ws,_class,modon)` index = 126×) does NOT apply to real tracker all-issues query. UI queries Issue **class hierarchy**: `_class = ANY([Issue, Milestone, ...])` (getDescendants(Issue) is multi-element), so `_class` can't sit in sort-prefix of btree — no single `(ws,_class,modon)` index can produce modifiedOn-ordered stream across several `_class` groups. `$in`→equality fix (storage.ts) correctly does NOT collapse multi-element array, so doesn't help this query (still helps genuine single-leaf-class queries, valid general cleanup — keep it).

Right index for cross-space all-issues (multi-class, sort by modifiedOn): `task (workspaceId, ((modifiedOn)::numeric) DESC)` — NO `_class`. Planner scans in modifiedOn order, applies `_class = ANY(...)` + security EXISTS as inline filters, stops at LIMIT. EXPLAIN on sanity-ws (50k, 2 spaces): **74 ms (seq scan + disk sort) → 0.43 ms (170×)**, Index Scan + early stop.

Board (single project, sort by rank) has `space=` filter, so its index can keep space: `(workspaceId, space, ((data#>>'{rank}')))` — verify against real board SQL.

Deployment-yaml candidates (big installs, via apply-indexes; NOT lean default):
- `task (workspaceId, ((modifiedOn)::numeric) DESC)` — all-issues / cross-space sort.
- board rank index once real SQL confirmed.

Note: 3-5 s task times seen during concurrent sanity run were event-loop convoy under 5 parallel workers, not single-query cost (same query ~29 ms single-threaded pre-index, sub-ms with index). Index cuts DB portion; transactor concurrency handling is separate axis.

## Build verification gotcha (NOT a cache bug)

**No** compile cache bug: `compile.js` re-transpiles all src via esbuild every run, and `compile_all.js`/`cache.js` content-hash src dir (xxh64), so src edit always invalidates package + dependents. Confusion was bad verification: **esbuild (minify:false) strips comments**, so grepping emitted lib/bundle for code *comment* returns 0 even when code shipped. storage.ts fix WAS deployed first time; `_class = ANY(...)` seen in query is correct multi-class behavior, not missing fix. Lesson: verify build by grepping for **code** (`val.length === 1`), never a comment.

Robustness fixes applied (compile.js CLI):
1. Clean `lib/` before main `src` transpile so renamed/deleted sources can't leave orphaned `.js` (esbuild non-incremental + overwrite-only, never removes stale outputs). Guarded to `srcDir === 'src'` so separate `transpile tests` pass doesn't wipe src output.
2. Invalidate package's `.fast-build-cache.json` after direct `rushx compile`/`build` (`resetFastBuildCache`). Manual compile rewrites `lib/` but doesn't touch cache (only `compile_all.js`'s phases do), leaving stale hash; dropping it makes next `fast-build:docker` re-run transpile/bundle/docker for that package instead of trusting stale entry.
Both live only in CLI `require.main === module` block, so never fire during `fast-build:docker` run (which imports `performESBuild` directly and manages cache itself). Verified: orphan removed, cache dropped on `rushx
build`, fix present in lib, query pkg builds + 170 tests pass.

## Confirmed on big data (2026-07-08, 73k tasks, sanity-ws 50k in one project)

Slow-SQL collector overhead (micro-bench, `RECORD_SLOW_SQL` flag added to disable):
- steady state (normalize cache-hit + recordTopInto): **26 ns/query** — at 10k qps = 0.026% CPU. Negligible.
- uncached normalize regex: 3.2 µs, but once per distinct SQL shape (cache ≤2000) → amortized ~0.
- Goal met: lightweight always-on slow-SQL tracking. `RECORD_SLOW_SQL=false` is escape hatch, not needed for perf.

all-issues index (EXPLAIN on 50k-issue sanity-ws):
- wrong `(ws, _class, modon)` index: 216 ms (scans all 50125 matching _class + security per row + top-N sort).
- correct **`task (workspaceId, ((modifiedOn)::numeric) DESC)`** (no _class): **0.34 ms** — Index Scan in modon order, `_class ANY` + security as inline filters, early stop at LIMIT. 635× vs wrong index, ~200× vs seq-scan.
- Added to deployment `indexes.yaml` as `task_ws_modon_idx`. Dropped wrong `(ws,_class,modon)`.
- board (single project + rank sort): 15.7 ms at 50k (composite finds space, in-mem top-N heapsort by rank). Grows with project size; candidate `(ws, space, ((data#>>'{rank}')))`, lower priority.

## Restore

Full snapshots in `~/Develop/private/bench-backups/pg-sanity-loaded-*.dump`. `BENCH_DUMP=<dump> tests/prepare-pg.sh` restores + restarts services.