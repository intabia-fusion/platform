# Stress test plan (scale + peak load)

Goal: emulate prod - thousands of spaces, mixed sizes, peak reconnect storm
(1000+ users reconnect when transactor restarts). Find bottlenecks with slow-SQL
tool + stats, fix iteratively (mostly ordered indexes so far).

Stand: `tests/` compose (sanity project), pure-PG. Big-data restored from tierM
dump, indexes applied from `../deployment/deployments/indexes.yaml`.

## CORRECTION (2026-07-08): SaaS multi-tenant, not one big workspace

SaaS install - many COMPANIES = many WORKSPACES, each own users, working
concurrently. Real emulation = **~1000 distinct workspaces**, each own owner user
(+ optionally few projects/issues), NOT 1000 projects in one workspace. All indexes
`workspaceId`-prefixed, so query only scans own workspace rows - single big workspace
tests per-tenant query size, but SaaS stress is CONCURRENCY ACROSS TENANTS:

- **Reconnect storm (headline)**: transactor restart -> every tenant's users reconnect.
  Each connect cold-starts that tenant's workspace pipeline (model + adapters), because
  `sessionManager.workspaces` empty after restart. 1000 tenants = up to 1000 cold
  pipeline builds + 1000 account round-trips. Earlier 1-workspace storm test SHARED
  one pipeline, badly under-counted this.
- Tooling: `tests/generate-saas.sh` with `NO_FILL=1` (N accounts + N workspaces, parallel),
  `ws-tests/api-tests/storm-tenants.mjs` (each connection uses distinct user+workspace).

Size-cohort work below stays valid for single-tenant per-workspace query speed, but
secondary to multi-tenant concurrency story.

## Size cohorts (per workspace, ~1000 spaces total)

| cohort | spaces | issues/space | purpose |
|---|---|---|---|
| small  | ~900   | up to 1k     | typical space - must be sub-10ms on everything |
| medium | ~90    | up to 10k    | active project |
| large  | ~5-10  | up to 100k   | worst-case single project (board, all-issues) |

Rationale: real installs mostly small spaces, long tail of few huge ones. Small cohort
= SLA floor (small install / typical space = instant); large cohort stresses per-space
ordered scans (board rank, in-space lists).

## Phases (do in order, measure each)

- [ ] **P0 - generate.** Create cohorts. Idempotent; resumable. Record fill rate (issues/s).
- [ ] **P1 - read scenarios per cohort.** all-issues (cross-space), in-space board (rank sort),
      point-lookup, activity-feed. Assert budgets scale by cohort. Extend `scenario-perf.sh`.
- [ ] **P2 - write load.** Concurrent issue creation across cohorts; watch tx slow-SQL
      (preference bulk-update, collaborator, activity), wrapPipeline broadcast growth.
- [ ] **P3 - peak reconnect storm.** Restart transactor with N (->1000) live sessions;
      measure reconnect wall-time, per-session model-load cost, pg connection saturation,
      event-loop lag. Headline peak scenario.
- [ ] **P4 - findings + fixes.** Index/pagination/throttle changes, re-measure, lock budgets into CI gate.

## Tooling

- `ws-tests/scenario-perf.sh` + `api-tests/scenario-perf.mjs` - per-scenario p95 + slow-SQL dump, budget gate.
- `stats-slow-sql --details` - raw SQL shapes (find/tx), p95 from latency buckets.
- Slow SQL UI panel (Server Manager -> Statistics -> Slow SQL) - live view.
- `stats-wipe` between scenarios to scope registry.
- `RECORD_SLOW_SQL=false` - measure collector overhead (already: ~26ns/query, negligible).

## P3 reconnect-storm findings (2026-07-08, sanity-ws, single-user N-connect storm)

Harness: `ws-tests/api-tests/storm-reconnect.mjs` - N concurrent `connect()` (each = addSession
+ hello + account round-trip + initial findAll), measured on cold transactor.

Result: **throughput ~16 connects/s, linear in N** (100->6s, 250->15s, 500->31s -> 1000 ≈ 60s+).
All succeed (0 fail) but per-connect latency scales with N (500-storm: p50=26s).

Where time goes (transactor stats, top ops by total ms):
- **`get-login-with-workspace-info` = 292ms/connect, uncached** (`sessionManager.ts:524,766`) - account-pod
  RPC (`getAccountClient().getLoginWithWorkspaceInfo()`) returns account + ALL its workspaces.
  `add-session` (292ms) almost entirely this call. Under N-concurrency account service saturates ->
  each call stretches to seconds. **Storm ceiling.**
- initial `findAll` boot-burst: 594ms each (DB 297ms + event-loop convoy) - one per session on connect.
- broadcast `backpressure`: ~5900ms - session-connect broadcasts pile up.

Bottlenecks (from explore + measured):
1. Account round-trip per connect, uncached - dominant. Fixes (security-sensitive, user call):
   (a) cache login/workspace-info by token, short TTL - collapses same-user multi-tab reconnects (revoked
   token stays valid ≤TTL); (b) scope lookup to connecting workspace instead of loading all of
   account's workspaces; (c) account-service throughput (pool/caching) for distinct-user storms.
2. No client reconnect jitter/backoff (`client-resources/src/connection.ts:351-377`) - all sockets redial
   at once on transactor death. Jitter spreads herd (lower peak concurrency -> faster per-call).
3. Single transactor PG pool `max:10` (`postgres-base:239-240`) + `USE_RESERVE_CTX` - secondary; account
   round-trip saturates before PG here.

Note: test used 1 user x N connects (over-represents cacheable case). Real 1000-DISTINCT-user storm
can't cache-collapse account lookups -> account service + its DB is true ceiling. Re-test with
distinct bench users once P0 cohorts (with bench users) exist.

## P3 MULTI-TENANT reconnect storm (2026-07-09, 1000 tenant workspaces)

Setup: `N=1000 NO_FILL=1 ./generate-saas.sh` (1000 accounts + workspaces) + `assign-tenants.sh` (owner
membership - create-workspace does NOT add owner to workspace_members, login is
Forbidden until assigned). Harness: `storm-tenants.mjs` (each connect = distinct
user+workspace). Cold = transactor restarted (empty workspaces map) before storm.

Cold storm N=100 distinct tenants: wall 9.3s, connect p50 **9050ms**, throughput 10.8/s
-> 1000-tenant reconnect ≈ **90s+**. Transactor stats top ops (avg per op):
- **`status` (user online-status write on connect): 10147ms** - DOMINANT. setStatus +
  chunter `OnUserStatus` trigger.
- **`init-space-security` (cold workspace security build): 4387ms** per cold workspace.
- **`server-chunter:trigger:OnUserStatus`: 2671ms** - fires on every connect (user comes
  online) -> broadcast + queries.
- **`loadModel` / `fetch-model`: 2316ms** per cold workspace (model nearly shared but
  re-fetched per workspace pipeline).
- boot `client-find-all` burst: 445-890ms each.

KEY: unlike single-workspace storm (dominated by account round-trip, 292ms), multi-tenant
storm dominated by **per-connect user-status update (setStatus + OnUserStatus chunter
trigger, ~13s combined)** plus **cold per-workspace security init (4.4s) and model load
(2.3s)**. Account round-trip no longer top cost.

Scaling (cold, restarted per run): N=100 -> 9.3s/10.8s⁻¹, N=250 -> 23.6s/10.6s⁻¹,
N=500 -> 43.7s/11.5s⁻¹. **Throughput flat ~11/s, linear -> 1000 tenants ≈ 90s, 0 failures.**
Bounded by transactor's single event-loop serializing per-connect work (status +
security + boot), NOT pg pool (max 80 enough) or memory - degrades gracefully (slow),
doesn't crash.

Warm vs cold (same 100 tenants): cold 9.05s/connect vs warm 4.70s/connect -> cold pipeline
build ≈ 4.3s (security-init + model-load), plus further ~4.7s per-connect warm work
(status/OnUserStatus + account round-trip + boot findAll burst under 100-concurrency).
Two cost layers: (1) cold per-workspace build, (2) per-connect work; both fixable.

`syncChat` (inside OnUserStatus) has ChatSyncInfo debounce and returns empty for fresh
tenants, so its 2.7s is COLD-pipeline query cost, not its logic - confirms root is cold
workspace build + per-connect contention, not trigger per se.

### Root cause (2026-07-09): cold per-workspace model build, not the client model transfer

Mass reconnect trigger is TRANSACTOR RESTART (deploy/crash - all clients reconnect at
once). Network-loss reconnects per-client and rare, so transactor-restart is THE scenario.

`ModelMiddleware.loadModel(lastModelTx, hash)` returns `{full:false, transactions:[]}` when
`hash === this.lastHash` - data-free reconnect. `getModel` orders deterministically
(`ORDER BY modifiedOn, _id`), so hash IS stable across restarts. BUT: on COLD workspace
(pipeline just rebuilt after restart), `init()` applies every model tx (`hierarchy.tx(tx)`)
to build THIS workspace's Hierarchy/ModelDb from scratch, hash known only AFTER that build.
So first client to touch cold workspace pays full build regardless of its hash. Hash-match
(data-free) path only helps 2nd+ client of SAME workspace.

In SaaS with ~1 user per tenant, every reconnect after restart is first-touch cold build
-> ~1000 cold Hierarchy rebuilds (each from ~3200 systemTx -> ~2.3s CPU) -> ~90s storm.
"Model is shared" means SOURCE txes (systemTx from bundle) shared, but BUILT Hierarchy/ModelDb
rebuilt per workspace.

Empirically confirmed: keeping clients open + killing transactor (correct container
`sanity-transactor0-1` - earlier tests used wrong name and no-op'd) -> reconnecting clients
still issue `SELECT * FROM model_tx ORDER BY modified` (full build). N=100 reconnect spread
~7.9s, N=200 ~16s - linear, not cheaper than first-login.

Headline fix: **share built base Hierarchy/ModelDb across workspaces of same model version**
(systemTx identical per version); apply only per-workspace userTx on top - removes
per-workspace 3200-tx rebuild xN. Secondary: throttle concurrent cold builds;
snapshot/warm-start model on boot.

Harness note: `storm-tenants.mjs` = fresh-connect (first-login, full model) worst case;
`storm-reconnect-real.mjs` = kept-open clients + real transactor restart (kill
`sanity-transactor0-1` + start) = true mass-reconnect.

Fix candidates (P4), highest value first:
- **Share built model (Hierarchy/ModelDb) across workspaces of same version** -
  saves ~2.3s x N cold builds; model.json identical per version, rebuilding per ws is waste.
- **Throttle concurrent cold pipeline builds** (semaphore) so 1000 don't saturate
  event-loop at once - each build finishes faster, total bounded.
- **Defer/incrementalize space-security init** (4.4s on cold build).
- **Debounce online-status write** + cache account round-trip (per-token TTL) -
  cuts per-connect warm cost.

## P4 landed + realistic multi-user (2026-07-09)

Root cause of reconnect-storm dominant cost: **UserStatus is `DOMAIN_TRANSIENT`**
(`models/core/src/transient.ts:21`), wiped on restart -> every reconnect re-creates it ->
`OnUserStatus -> syncChat` fires. `setStatus`'s online-unchanged short-circuit can't fire
(prior state gone with restart).

Landed changes:
- **Server cold-build throttle** `TSessionManager.coldBuildLimiter` (RateLimiter,
  `COLD_BUILD_CONCURRENCY`=8) around pipeline `factory()` - safety cap, ~neutral on wall
  (build isn't bottleneck).
- **Client reconnect jitter** `reconnectHerdJitterMs=3000` in connection.ts `onclose` -
  spreads redials; neutral at N=100 (window < processing).
- **syncChat throttle** RateLimiter=4 + 60s coalesce in `OnUserStatus` - trigger
  2083->1120ms/op (-46%); `void`-ed off hello so wall unchanged.
- **Presence broadcast batching** `queueStatus`/`flushStatus` - accumulate per-ws
  online/offline changes, flush once/sec (`STATUS_FLUSH_MS`) as ONE batched pipeline.tx ->
  ONE broadcast (system SessionDataImpl, mirrors online-user-tx consumer). Replaces
  setStatus/trySetStatus. Fixes O(M^2) presence fan-out.

Realistic multi-user storm (`make-multiuser.sh` 1000 users -> 113 ws sized 1-50 skewed
small; `storm-multiuser.mjs`, `node --max-old-space-size=10240`):
- Recovery IMPROVES with ws size (1-5: 82s, 6-20: 59s, 21-50: 43s) - shared cold build +
  model hash-match amortize. **build-chain only 113 ops (not 1000): cold build NOT the
  multi-user bottleneck; "share built model" barely helps.**
- Batching effect: **broadcast-all 7066ms/1000ops -> 330ms/279ops (21x)**, status write
  client-tx & OnUserStatus 1000 -> 279 ops.
- Remaining wall (~98s) bound by `client-find-all` 39s = boot Refresh burst + PG query
  contention (trivial findAll = 14.5s at N=1000, pool/reserve-ctx saturation) + single-node
  harness saturation.

Open bottleneck A - **boot Refresh burst**: transactor restart -> cold pipeline
`context.lastTx=undefined` (txPush.ts only sets it on real tx; transient excluded at
txPush.ts:59) -> hello sends undefined -> client (remembers real id) mismatches ->
`Refresh` (client.ts:361-368) -> `LiveQuery.refreshConnect` refetches EVERY active
subscription (~12 always-on: notifications/contacts/spaces/Version). Fix: init
`context.lastTx` from DB last-tx at cold build -> restart-with-no-change -> `Reconnected`
(no burst); correctness-positive. Needs `(workspaceId, modifiedOn DESC)` tx index
(class-agnostic last-tx is 5.2s on big ws without it; existing
`tx_ws_class_modifiedon_idx` has `_class` mid-key). My api-client harness under-measures
this (headless ~1.3 findAll/user vs ~12 browser).

### Boot lastTx cache LANDED (2026-07-09) — fixes the Refresh burst, no index needed
Instead of per-build query (5.2s on big ws) + new index, do ONE cross-workspace query
at transactor boot: `SELECT DISTINCT ON ("workspaceId") "workspaceId", _id FROM tx ORDER BY
"workspaceId", ("modifiedOn")::numeric DESC` (single scan, ~1.17s for 1209 ws). Fills
shared `Map<workspaceUuid, txId>` (`pods/server/src/server.ts loadLastTxCache`) threaded via
`pipelineContextVars.lastTxCache` into every `PipelineContext.contextVars`;
`server-pipeline/src/pipeline.ts` seeds `context.lastTx` from it at cold build. Restart with
no data change -> hello returns real lastTx -> client gate (client.ts:361) matches ->
`Reconnected` (no LiveQuery refetch). Correctness-safe: cache is DB max-modifiedOn, never
newer than client's memory; mismatch only falls back to Refresh. Reloads every boot.

Verified (`ws-tests/api-tests/reconnect-refresh-probe.mjs`, LiveQuery per client counting
refetches across real restart): cached ws **0/20 refetch = Reconnected** (counter validated
by baseline = 20 initial fires). Pre-fix Refresh inferred from gate + undefined-lastTx-
on-cold-build, not A/B-measured this run.

### Read-pool reserve LANDED (2026-07-09) — reads no longer starved by reserved writes
Transactor postgres pool shared per DB_URL (max from POSTGRES_OPTIONS, 100 in sanity).
`USE_RESERVE_CTX` holds managed connection for whole user-tx incl. triggers; in storm
those reserves starve boot findAll reads (trivial `findAll(Issue,5)` = 14.8s at DB, pure
connection-acquire wait). Fix (`postgres-base ConnectionMgr`): cap number of reserved
(managed) connections at `floor(poolMax * (1 - READ_POOL_RESERVE))` (default 10%); writes past
cap fall back to unmanaged (pool per-op). Pool max threaded from `getDBClient`
(`sql.options.max`) into ConnectionMgr. Reads (retry path) never gated -> always >=10% of
pool free.

Clean env A/B (same build, `READ_POOL_RESERVE` toggle, 1000-user multiuser storm): read
`@db.query.duration` 14825ms (reserve=0) -> **9659ms (reserve=0.1, -35%)**. Dynamic
warmup variant (50% reads for first 120s) measured no better than static 10% here (writes
already minimal after presence batching) so dropped for static 10% default.
Note: multiuser storm wall itself masked by single-node 1000-client harness saturation
(±15% run noise); server-side @db.query A/B is reliable signal.

## Findings so far (baseline, pre-stress)

- all-issues cross-space `ORDER BY (modifiedOn)::numeric DESC` -> needs `task (ws, (modon)::numeric DESC)`;
  6s->42ms under load. Same for `activity` (67->8ms). In `indexes.yaml`.
- security EXISTS on every read Memoized by space -> cheap with early-stop index; villain is
  always missing ordered index (full scan -> security rides as hash join), never security itself.
- transactor spends ~6.6ms/200-doc result on serialize+transport, not query processing.
- space JSON-path filters (`data#>>'{account}'`/`'{status}'`) seq-scan 20k spaces -> functional indexes (100x/5.7x).
- loading class with 20k instances (all MeetingMinutes spaces) = ~200ms result-size, NOT index-fixable -> app pagination.
- tierM dump carries non-yaml `task_ws_class_modon_num_idx` that misleads planner; use `sync-indexes` or drop post-restore.