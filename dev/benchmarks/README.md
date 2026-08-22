# dev/benchmarks - load & stress testing kit

Reusable tooling from FUSIO-776 perf effort. Two areas:

| Area | What | Where |
|------|------|-------|
| **Benchmarks** | ts-node load scenarios (REST throughput + live WebSocket storms/probes) | `src/`, plan in `plan.md` |
| **Generator** | data provisioning: pointers to `generate-big` seeder + `dev/stand-snapshot.sh` | `generator/` |

## Benchmarks

Standalone ts-node package (no rush build). One CLI dispatches every scenario:

```
cd dev/benchmarks
npx ts-node src/run.ts --url <url> --scenario <name> [flags]
```

Common flags: `--url` (or `HULY_URL`), `--email`, `--password`, `--workspace`.

### REST scenarios (connection pool)

| scenario | what | key flags |
|----------|------|-----------|
| `rest-throughput` | REST req rate vs client count | `--clients 1,10,20,50 --duration 30` |
| `multi-workspace` | simultaneous multi-ws stress | `--workspaces 10 --clients 5` |

CPU profiling: `--profile true --transactor-url http://localhost:3332`.

### Live scenarios (WebSocket, api-client)

Self-connecting probes. Shared primitives in `src/live.ts` (connect,
percentile, `timeIt` budget gate, `runStorm`, `disrupt`, `measureRecovery`).

| scenario | what | key flags |
|----------|------|-----------|
| `read-perf` | hot read-latency gate, p95 budgets (CI: exits non-zero on breach) | `--iters 30` `--small/--medium/--large <spaceId>` for per-cohort in-space reads |
| `connect-storm` | N cold session-boots at once (thundering herd) | `--count 100` `--tenants` (own ws each) `--prefix co --start 1` `--keep-open` |
| `recover-storm` | kept-open clients, disrupt, measure recovery | `--count 100 --prefix co` or `--manifest m.json` (buckets by ws size); `--disrupt "docker kill sanity-transactor0-1 && docker start sanity-transactor0-1"` |
| `refresh-probe` | after a restart, counts clients that hit Refresh (LiveQuery refetch) vs Reconnected | `--count 50 --prefix co --disrupt "..."` |

Examples:
```
npx ts-node src/run.ts --url http://localhost:8083 --scenario read-perf --workspace sanity-ws --iters 30
npx ts-node src/run.ts --url http://localhost:8083 --scenario connect-storm --count 200 --tenants
npx ts-node src/run.ts --url http://localhost:8083 --scenario recover-storm --manifest ../../tests/multiuser-manifest.json
```

Full scenario params + baseline numbers: `plan.md`.

## Generator

Seed prod-shaped dataset, move between instances. See `generator/README.md`.
Heavy `generate-big` seeder stays in `dev/tool` (needs server pipeline);
snapshot dump/restore is `dev/stand-snapshot.sh`.

