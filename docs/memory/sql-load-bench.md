# SQL Load Bench (FUSIO-777)

## Stand
- Active stand = docker project `qms-*` (not `sanity-*`). Ports same: nginx 8083, postgres 5433, pgbouncer 6433, cockroach 26258.
- account DB_URL via pgbouncer:6433 (PG). WORKSPACE_LIMIT_PER_USER=100 set in docker-compose.yaml:184.
- region-config on account has ONLY region `''` (name America), transactor0. NO `europe` region -> `accountClient.createWorkspace(name, 'europe')` fails `InternalServerError {"region":"europe"}`. Use region `''` (America) - already PG-backed.

## Creating workspaces "as a user"
- Use account API, NOT tool create-workspace (tool-pg create-workspace fails this stand; inline init slow/hangs).
- `getAccountClient(ACCOUNTS_URL).login('user1','1234')` -> account token (NOT getWorkspaceToken - does selectWorkspace, 403s if ws not accessible).
- `accountClient.createWorkspace(name, '')` creates pending record; workspace-service picks up async, inits.
- Poll `accountClient.getUserWorkspaces()` + `isActiveMode(ws.mode)` until active.
- Test: `ws-tests/api-tests/src/__tests__/create-bench-workspaces.benchmark.test.ts`, gated `BENCH_CREATE_WS=1`, env BENCH_WS_COUNT/BENCH_WS_PREFIX/BENCH_WS_REGION.
- Result: 24 ws active in 18s (~753ms/ws). workspace-service parallelizes init.

## Bulk data load (planned)
- api-client per-doc await too slow for 200k issues + 100k msgs PER ws (25 ws = 5M+2.5M).
- Bulk path: `pipeline.context.lowLevelStorage.upload(ctx, domain, docs[])` -> PG batched multi-row INSERT (foundations/server/packages/postgres/src/storage.ts:1714, batches 200, ON CONFLICT upsert, sets %hash% itself).
- Pipeline access: `createBackupPipeline(toolCtx, dbUrl, txes, {externalStorage, usePassedCtx:true})(...)` -> `pipeline.context.lowLevelStorage` + `.hierarchy` (dev/tool/src/index.ts:3083-3103).
- Domains: tracker Issue -> `task`, chunter ChatMessage -> `activity`, chunter Channel -> `chunter-doc`.

## Stand 2026-07-03 (sanity, tests/prepare-pg.sh)
- Active stand = `tests/` compose, project `sanity-*`, pure-PG: region-config has ONLY region `''` (America) -> transactor0 -> pgbouncer:6433 -> postgres:5433. NO transactor-europe service, NO europe region.
- `ws-tests/tool-europe.sh` still works (DB_URL=localhost:5433 direct PG, ACCOUNTS_URL via nginx 8083) BUT `create-workspace --region europe` writes region='europe' into account DB -> workspace unreachable (no such region). Check `docker exec sanity-account-1 cat /var/cfg/region-config.yaml` BEFORE creating workspaces.
- Workspace name NOT unique: second `create-workspace sanity-ws` made duplicate (url got `-<suffix>`). `generate-big <name>` matches by name over ALL workspaces (last match wins) -> wrote into duplicate. ALWAYS pass workspace **uuid** to generate-big/generate-data.
- Fix applied: `UPDATE global_account.workspace SET region=''`, renamed dup to bench-trash, deleted its rows from all public tables (66 tables have workspaceId).
- `backup-restore` resolves by url/name -> restored into ORIGINAL sanity-ws; restore direct-to-PG matches stand DB here, so data visible in UI after account+transactor restart.
- prepare.sh index apply may not run when user brings stand up differently; verify with `select count(*) from pg_indexes where indexname='notification_ws_user_class_createdon_idx'` and re-apply via `./tool-europe.sh apply-indexes ../../deployment/deployments/indexes.yaml --apply` (67 indexes).
- generate-big rate this stand: ~13-16 issues/s at batch=100 (fresh PG, indexes on). Trigger errors `write CONNECTION_ENDED localhost:5433` appear when stand DB recreated mid-run (docker down -v) - generator hangs, must pkill.

## generate-big evolution (2026-07-03)
- Idempotent top-up: counts existing docs by createdBy in [System, bench-user-*], creates only difference. Channels matched by name big-channel-<i>, per-channel msg target derived from index (deterministic), msg top-up counts existing.
- Bench users: ensureBenchUsers() creates Person+Employee mixin+SocialIdentity with explicit _id `bench-user-<i>` (PersonId), find-or-create by social key email:bench-user-<i>@bench.local. TxOperations(ops.client, personId) per user -> createdBy resolves to Person in UI.
- Issue.description = MarkupBlobRef: saveCollabJson(ctx, storage, wsIds, makeCollabId(Issue, issueId, 'description'), markup) BEFORE addCollection with explicit issueId.
- apply() batching: issue+comments+updates one TxApplyIf (one creator); meeting+transcripts one apply; channel msgs grouped per user per batch into one apply. ApplyOperations.commit() sends all as one pipeline.tx.
- Channel trigger race: concurrent first messages in channel race on unique chunter_doc (ws, attachedTo, account) ChannelInfo index -> tx fails -> Promise.all killed run (CONNECTION_ENDED flood = aftermath of pipeline.close, not cause). Fixed by per-user apply grouping + Promise.allSettled.
- Rates (M1-class laptop, pure-PG stand, batch=100): issues ~30/s flat after wrapPipeline O(n²) fix (see [[wrap-pipeline-broadcast-leak]]), meetings ~20-23/s, channel msgs ~150/s. Trigger cost per message: point lookups channel/contact/collaborator avg 7-15ms each (slow-SQL FIND registry) - main target for create-path speedup.
- Bench DB backup: /Users/haiodo/Develop/private/bench-backups/pg-sanity-loaded-full-*.dump + restore-pg-bench.sh (pg_restore --clean into sanity-postgres-1; blobs in minio volume not included).

## Sanity on loaded DB - findings (2026-07-03 evening, to continue)
- Loaded sanity-ws: 50k issues (SECON project), 20k meetings, 100 channels/24.5k msgs. Sanity uitest run on top.
- stats-slow-sql (kind=find, transactor0, wiped before run): p95 2.5-3.5 SECONDS on ~12 shapes incl. POINT lookups (task._id=$? with security EXISTS). But EXPLAIN of worst space shape = 11ms, point lookups 0.06ms => DB fine, seconds accumulate in transactor node process (pool queueing / event-loop lag under load). NEXT: rerun chat/channel test section while sampling transactor CPU + event-loop to confirm.
- 20k MeetingMinutes are SPACES -> space table 20k rows; every space list query with data#>>'{status}' filter reads ~2.5k buffers. space_ws_class_roomid_idx etc applied (67 indexes from deployment yaml).
- TX writes ok-ish (p95 <700ms), outlier: preference UPDATE 1055 calls max 2s.
- Slowest passed tests (all chat/inbox/channel-heavy, 20-33s): "Checking backlinks in the Chat" 33.5s, assign+inbox pairs ~26s, channel create/add-user tests 20-24s.
- Sanity failures mostly love/* (no LiveKit on stand) + some perf timeouts (customize-task-types, create-tag-candidate 1.0m) - user said failures NOT priority, speed is.
- Sanity log: /private/tmp/claude-501/-Users-haiodo-Develop-private-foundation/25e3f24c-68e4-4bcb-b8ca-c6ca4c2bf1a9/scratchpad/sanity-run.log; slow-sql JSON: same dir sanity-slowsql-find.json.
- TODO next session: (1) transactor CPU/event-loop sampling under chat-test load; (2) issue-create path cost (task: apply() batching landed in gendata, compare rates); (3) preference UPDATE hotspot; (4) space table bloat effect (MeetingMinutes as spaces) on security EXISTS; (5) uncommitted changes: wrapPipeline drain fix (server/core/utils.ts), gendata users/status/description/apply, prepare.sh indexes, topRegistry tests, slowsql ESC fix.

## Transactor latency investigation (2026-07-06)
- Symptom: client db.query avg 27-38ms vs pg_stat_statements mean 0.1ms (40:1). NOT the DB: pgbouncer cl_waiting=0, PG CPU <10%, RTT 0.3ms.
- pg_stat_statements enabled on stand: shared_preload_libraries in /var/lib/postgresql/18/docker/postgresql.conf + PG restart.
- ROOT CAUSE #1 (fixed): love-resources stores.ts:169 liveQuery { status: { $ne: Finished } } on MeetingMinutes pulled ALL non-finished meeting spaces (16.5k rows x 82ms server + ~100ms transfer) on EVERY workbench session open; 369 calls per 5-min chat-test run. Fix: status $in [Active, Pending] (user's call - simpler than reactive $in-by-participant-ids). Also gendata now makes ~0.5% Active, rest Finished. Result: PG total -39%, transactor findAll time -30%. Test wall times UNCHANGED (tests UI-paced).
- Remaining overhead: bimodal. Point lookups <=10ms; session-open bursts (preference/setting/notification/contact) 10-100ms band, avg 20-27ms for sub-ms server queries = event-loop convoy (eld p50 ~10ms, p99 26ms, max 187ms under chat load) + parallel query waves. No single hot function (profile: 63% idle, top = Packr/sendJson broadcast serialization).
- tx path: client-tx avg 102-116ms = adapter-tx ~36ms + sync/async triggers ~28ms (ManageCollaboratorsTrigger top) + tx-push ~36ms. Per-tx reserveContext (USE_RESERVE_CTX=true default) serializes ALL trigger reads of one tx onto one reserved PG connection (foundations/server/packages/server/src/client.ts:278, postgres-base ConnectionMgr.getConnection managed=true).
- Profiling harness: tests/docker-compose.inspect.yaml (NODE_OPTIONS=--inspect=0.0.0.0:9229, port 9229) + scratchpad cdp-profile.mjs (CDP Profiler via ws from repo node_modules) + cdp-eval.mjs (Runtime.evaluate, e.g. monitorEventLoopDelay). Recreate transactor: docker compose -f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml -f docker-compose.inspect.yaml -p sanity up -d --no-deps transactor0.
- fetch_types runs on every reserve(): 100 catalog queries (393 rows each) per chat run - minor, fixable via fetch_types:false + explicit types.
- Next levers (by expected impact): (1) reduce per-session-open query count (preference fired 400+ times/29 tests); (2) trigger read batching / cache in tx path; (3) multiple transactor processes per host (event-loop convoy); (4) broadcast serialization cost (Packr per session).

## LiveQuery $inc storm (2026-07-06, rate-limit field report)
- Report: 2 tabs, tab A in meeting w/ live transcription, tab B idle -> user hits rate limit. Limit PER USER (sessionManager.ts:1473, RATE_LIMIT_MAX=1500/30s) - tabs share budget.
- Chain: transcript ChatMessage -> triggers.ts:461 derived TxUpdateDoc {$inc:{transcription:1}} on MeetingMinutes -> broadcast to all sessions -> each tab's space-class liveQueries react.
- ROOT CAUSE: query/src/index.ts matchQuery: `const { $inc, ...ops } = tx.operations; emptyOps => matched=true` -> $inc-only tx treated as "matches anything" -> getDocFromCache -> SERVER findOne per non-matching liveQuery per message. Repro: playwright idle tab = ~2 req/msg; node LiveQuery probe = 1 findOne per msg per query where doc not in result.
- FIX 1 (matchQuery): $inc-only tx returns false unless inc'ed key referenced in q.query or q.options.sort. Probe: 5 msgs -> 0 server calls (was 5).
- FIX 2 (handleDocUpdate): doc IN result + equal modifiedOn used to go getCurrentDoc -> server findOne (derived counter txes share parent tx timestamp - playwright shape-2, 41 calls). $inc commutative -> equal-ts $inc-only tx now applied locally.
- E2E after front rebuild (fix 1 only): idle tab 83 -> 5 requests per 20s of 2 msg/s transcription (amplification 2.0 -> 0.025/msg).
- Tests: query/src/__tests__/inc-match.test.ts - 5 cases (no-server for unrelated $inc, server check when query filters/sorts by inc'ed field, local apply in-result incl. equal-ts, mixed update unchanged). Full suite 170 pass.
- NOTE: test 'apply locally in-result' fails on pre-fix-2 code because create+inc land in same ms - this is how shape-2 caught.
- Probe tooling: ws-tests/api-tests/lq-storm-probe.mjs (api-client connect + createLiveQuery + patched findAll with stacks; needs globalThis.WebSocket = require('ws')). Playwright repro: tests/sanity/tests/love/meetings.rate-storm.spec.ts (RATE_STORM=1, counts ws frames of idle tab).
- noInc marker on Collection (server-side skip of counter txes) drafted then REVERTED - user chose fixing liveQuery instead; counter txes still broadcast (cheap), clients now ignore them.
- tests/prepare-pg.sh: BENCH_DUMP=<pg_dump -Fc file> restores full DB snapshot (accounts+data) instead of seeding, then restarts platform services; snapshots in ~/Develop/private/bench-backups/.

## run-sql-load-bench.sh
- ws-tests/api-tests/run-sql-load-bench.sh: all tool-europe.sh calls must run with cwd=ws-tests via `run_tool()` helper (tool-europe.sh uses ../common, ../dev, ./region-config.yaml relative paths). Fixed 4 call sites + removed stray `--` before drop-indexes.