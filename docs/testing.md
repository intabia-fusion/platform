# Testing

[← README](../README.md)

## Three groups, told apart by file name

| group | files | needs | runs |
|---|---|---|---|
| unit | `*.test.ts`, `*.spec.ts` | nothing | build phase, `pnpm test` |
| integration | `*.itest.ts` | its own containers per suite (testcontainers) | `pnpm integration` |
| bench | `*.bench.ts` | nothing (some are env-gated) | `pnpm bench`, by hand |

`*.itest.ts` and `*.bench.ts` do not match a package's default `testMatch`, so a rename is
all it takes to move a file between groups - no config and no `package.json` field lists them.

## Unit tests

```bash
pnpm test          # All tests, from the repository root
pnpm run test      # A single package, from inside its directory
pnpm test --to @hcengineering/core   # Scope to a package and its dependencies
```

Jest is configured at the root (`jest.config.js`); `pnpm jest` runs the shared runner
directly. The group runs without Docker; if a unit test needs a service, it is in the
wrong group.

## Integration tests (`pnpm integration`)

```bash
pnpm integration             # builds, then runs; needs a running Docker, and nothing else
pnpm integration -t 'name'   # jest flags pass through
```

The build comes first because workspace dependencies resolve to their `lib/`; on a built tree it is a cache hit. `pnpm api-test` does the same for `api-tests/` (plus `common/scripts/docker-api.sh` for the stand images; jest args narrow the api-tests and skip the backup-tests), and `pnpm fulltest` runs unit, integration and both api suites in a row - everything but Playwright. All three live in `common/scripts/test-suite.sh`.

```bash
pnpm api-test                                  # api-tests, then backup-tests, stand up and down
pnpm api-test src/__tests__/rest.test.ts       # one api-tests file
API_STAND=keep pnpm api-test                   # leave the stand running afterwards
```

Each suite starts the services it needs itself, through `@hcengineering/test-containers`
(testcontainers): `postgresUrl()`, `elasticUrl()`, `kafkaBrokers()`, `minioConfig()`. One container
per kind per jest worker, started on first use, removed when the process ends - a suite that needs
only postgres never starts elasticsearch. `tests/prepare-tests.sh` is for the Playwright stand now;
the integration group does not use it.

An address already in the environment wins and no container is started for it, so a prepared stand
still works: `DB_URL`, `ELASTIC_URL`, `QUEUE_CONFIG`, `MINIO_ENDPOINT`.

Nine packages have `*.itest.ts` files: `postgres`, `elastic`, `minio`, `s3`, `kafka`,
`pod-fulltext`, `account`, `pod-ai-bot`, `pod-telegram-bot`. Two suites still skip themselves:
`s3` wants a real S3 (`S3_ENDPOINT`), and the `pod-ai-bot` LLM suites want a local model server
(`AI_BOT_E2E=1`). `kafka` and `pod-fulltext` carry `testIsolated`: they get a jest of their own, run one at a time by `pnpm test` and side by side by `pnpm coverage`.

## Benchmarks (`pnpm bench`)

Never part of a CI phase. jest packages run through their own `jest.config.js` with the
`*.bench.ts` matcher and a 600s timeout; `packages/ui` runs its own `bench` script
(`vitest bench`).

## Coverage (`pnpm coverage`)

```bash
pnpm coverage                    # unit only
pnpm coverage --integration      # unit + integration, starts its own containers
pnpm coverage --allow-failures   # report even when a test failed (exit 0)
pnpm coverage --server           # server code only: what is untested, worst first
```

Prints a per-package table worst-first and one total, and writes into `coverage/`:

| file | for |
|---|---|
| `coverage-final.json` | merged istanbul, input to any other reporter |
| `lcov.info` | Codecov, SonarQube, editors |
| `cobertura-coverage.xml` | GitLab's `artifacts:reports:coverage_report` |
| `html/index.html` | reading it by hand |

The last line is `Coverage: NN.NN% of statements`, which is what GitLab's `coverage:` regex
reads. A failing test fails the command unless `--allow-failures` is passed.

Two runners feed it: jest for everything with a `jest.config.js`, vitest for the packages with a
`vitest.config.mts` (`packages/ui`, `plugins/attachment-resources`). Packages that jest cannot run together - `desktop` and `presentation` declare
their own `projects`, which jest will not nest - get their own invocation; flattened into the
shared run they lose their preset and babel then fails to parse TypeScript.

Two things the number does not include, both reported as separate lines:

- packages with a `src/` and no test at all - they are in neither report, so they cannot be
  told apart from 0% any other way
- `.svelte` outside the vitest packages, which no runner mounts

### Stand coverage (`pnpm coverage:stand`)

`api-tests/api` (26 files, 301 cases), `api-tests/backup` and the Playwright suites drive a live stand, so the server code they exercise runs inside containers where istanbul cannot see it. V8 can: each pod is started with `NODE_V8_COVERAGE` and drops a profile of its bundle when it exits, and the pods' external sourcemaps map that back onto `src/`.

```bash
common/scripts/docker-api.sh               # images from the checkout
cd api-tests/api && STAND_COVERAGE=true pnpm run api-test && cd ../..
pnpm coverage:stand                        # writes coverage-stand.json
pnpm coverage --integration --stand        # folds it into the whole-repo number
```

Two rules, both of which silently produce nothing when broken:

- **Let the pods exit on their own.** V8 writes the profile as the process exits; a pod that is
  killed loses everything it collected. The Kubernetes teardown scales the deployments down and
  waits for the pods before taking the stand apart.
- **The images must be built from the checkout.** The profile carries ranges of the bundle in the
  image, and the sourcemap used to decode it is the one on disk - a stale image maps its ranges
  onto whatever lines that file has now.

On Kubernetes the profiles are written into a shared `stand-coverage` PVC (`global.coverage`,
switched on by `STAND_COVERAGE=true`); the teardown (`scripts/coverage-collect.sh` from
`api-tests/api/src/stand.ts`) scales the pods down, waits for them to flush and copies the tree
into `api-tests/coverage/`, and `pnpm coverage:stand` decodes it the same way as before.

### `--server`: where to write the next test

`pnpm coverage --integration --server` replaces the per-package table with three lists over
`foundations/net`, `foundations/server`, `pods`, `server`, `server-plugins` and `services`
(`-assets` and `model-*` packages are left out - they are declarations):

1. **Server packages with no coverage report at all.** No test ever runs there, so they are in no
   istanbul report; size is counted from `src/` in lines, biggest gap first.
2. **Server files at 0%, inside packages that do run tests.** These are in the report only because
   of `--collectCoverageFrom`; no test ever reached them.
3. **Server packages by coverage, worst first**, plus a SERVER total over the packages that have a
   report.

## UI tests (Playwright)

The pg and ws suites run against a Kubernetes stand; qms and cockroach stay on their compose
stands. Full setup (version-override variant, AI bot `@llm` suite, allure, debug/codegen) is in
[`tests/readme.md`](../tests/readme.md).

Kubernetes (sanity; `ws-tests` is the same with `./prepare.sh`):

```bash
pnpm install --frozen-lockfile
pnpm docker:build          # stand images, pushed into the local k3d registry by prepare

cd tests
./prepare-pg.sh            # k3d cluster + base (first run), clean stand, seed

pnpm -w stand:test:front   # webpack dev-server on http://localhost:8081, proxies to the stand

cd sanity
pnpm run uitest:k8s
```

`uitest:k8s` drives the browser through the dev-server on :8081, so it needs `@hcengineering/prod`
built (`pnpm build --to @hcengineering/prod`). The browser talks plain HTTP to localhost; the
dev-server talks HTTPS to the stand with the mkcert CA via `NODE_EXTRA_CA_CERTS` - no system trust
store changes. The stand address comes from `pnpm -w stand:configure` (default: local k3d,
namespace `fusion-sanity`).

Compose (cockroach, unchanged):

```bash
pnpm install --frozen-lockfile
pnpm docker:build

cd tests
./prepare-cockroach.sh

cd sanity
pnpm run uitest
```

`prepare-cockroach.sh` is the CockroachDB variant of the same compose stand. After changing
application code, rebuild (`pnpm docker:build`) and re-run the prepare script - Playwright tests
exercise the built bundle, not the source tree. The same holds on Kubernetes: prepare pushes the
locally built images into the cluster registry.

`scripts/persona-stand.sh` brings up a stand for persona UX runs (skill `persona-test` in foundation-tasks) beside the sanity one: compose project `persona`, overlays `tests/docker-compose.mail.yaml` and `tests/docker-compose.persona.yaml`, which publish only nginx on 8084 and mailpit on 8025 (sign-up codes go through the `mail` service in queue mode, as on prod). Russian branding (`tests/branding-persona.json`), prod themes, `DISABLED_FEATURES` and `rating`, no seeded accounts. From the prod chart (`CHART=`, default `../fusion-deployment/charts/fusion`) it takes the landing, docs and legal images, `files/plan-config.yaml` and the landing routes, which go into `tests/.persona/nginx-landing.conf` through the `include /etc/nginx/extra/*.conf` hook in `tests/nginx.conf`. LiveKit on the host is shared with the sanity stand.

`tests/prepare-secure.sh` brings up the secure stand beside the sanity one: compose project `secure`, overlays `tests/docker-compose.mail.yaml` and `tests/docker-compose.secure.yaml`. Only nginx on https://localhost:8443 (`tests/nginx-ssl.conf`, certificate in `tests/.secure/`, from mkcert when installed, otherwise self-signed) and mailpit on 8026 are published. The account service runs with the production sign-up checks: no `ALLOW_SKIP_OTP_PASSWORD_SIGNUP`, no `ADMIN_OTP_DEV_CODE`, `WORKSPACE_LIMIT_PER_USER=10`; the front uses `USE_OTP=true`. No seeded accounts - sign up with the code from mailpit.

Flags (`-g "<title>"`, `--workers=1` for love/meetings), tracing, flake diagnosis (`analyze_failures.js`) and the whole-run profiling harness (`do-test.sh`) are in the "Sanity tests (Playwright)" section of [`AGENTS.md`](../AGENTS.md).

## Integration tests

- `api-tests/` - API (`api-tests/api`) and backup (`api-tests/backup`) tests against the Kubernetes
  `api` stand of their own, without the web UI. The jest run prepares the stand itself
  (`api-tests/api/src/stand.ts` -> `deployment/kubernetes/scripts/prepare-test-stand.sh api`: reset
  of the api data, deploy, in-cluster seed through the stand-tool pod) against the configured stand
  runtime (`pnpm -w stand:configure`; namespace `fusion-api` by default). Locally built images are
  pushed into the cluster registry unless `STAND_PUSH_IMAGES=0` (then the cluster must be able to
  pull them, e.g. the CI images). Run with `cd api-tests/api && pnpm run api-test` and
  `cd api-tests/backup && pnpm run backup-test`. `API_STAND` picks what a run does with the stand:
  unset - start it unless it is up, take down only a stand this run started; `keep` - leave it
  running (a second run reuses it without re-seeding); `stop` - take down only the api stand at the
  end either way; `external` - touch nothing. `STAND_COVERAGE=true` makes the pods run under
  `NODE_V8_COVERAGE` and lands their profiles under `api-tests/coverage/` at teardown. Needs
  kubectl/helm (and Docker, unless `STAND_PUSH_IMAGES=0`) - see
  `deployment/kubernetes/scripts/with-stand-env.sh`, which the package scripts wrap themselves in.
- `ws-tests/` - the workspace-admin Playwright suite (`ws-tests/sanity`). `ws-tests/prepare.sh`
  resets and seeds its Kubernetes stand (`fusion-ws`, two regions: the main region on the stand
  database, europe on its own `wstesteurope`). UI tests through the webpack dev-server, like
  sanity: `pnpm -w stand:test:front ws`, then `cd ws-tests/sanity && pnpm run uitest:k8s`
  (the script itself resolves the stand env and account-DB port-forward through
  `with-stand-env.sh`).
- `qms-tests/` - the controlled-documents (QMS) suite (`qms-tests/sanity`). `qms-tests/prepare-qms.sh`
  resets and seeds its own Kubernetes stand (`fusion-qms`, host `qms.fusion.localhost`, workspace
  `sanity-ws-qms` restored from `qms-tests/sanity-ws-qms`). The compose stand was removed. UI tests
  through the webpack dev-server, like sanity: `qms-tests/stand-front.sh`, then
  `cd qms-tests/sanity && pnpm run uitest:k8s` (the script itself resolves the stand env and
  account-DB port-forward through `qms-tests/with-stand-env.sh`).

## CI

All server-side checks run in one job, `ci_test.sh`, right after `pnpm bundle`:

1. `common/scripts/ci-k8s-tools.sh` installs pinned k3d/kubectl/helm/mkcert into a cache dir
   (no sudo, no system trust stores) and `pnpm -w stand:configure` pins the target
   (default: local k3d, namespace `fusion-api`).
2. `common/scripts/docker-api.sh` builds the images of the Kubernetes api stand from the bundles
   on disk. No web UI: `front` is built with an empty `dist/`, since the api-tests only need its
   `/config.json`; the stand scripts push the images into the cluster registry.
3. `api-tests/api` runs with `API_STAND=keep` and brings the stand up (with `STAND_COVERAGE=true`
   the pods run under `NODE_V8_COVERAGE`), `api-tests/backup` reuses it with `API_STAND=stop` and
   takes it down (logs go to `api-tests/logs/`, Kubernetes pod logs/events into
   `api-tests/logs/k8s-fusion-api/`), then `pnpm coverage:stand` turns the pods' V8 profiles into
   `coverage-stand.json`.
4. `pnpm coverage --integration --stand` runs the unit and integration groups under istanbul, folds
   the stand run in and is the gate for both jest groups. The integration group and the vitest run
   go side by side, and packages with `testIsolated` run alongside the shared jest - each jest
   process starts its own containers - unless `QUEUE_CONFIG` points at a shared stand.

`STAND_COVERAGE=true` is set for the api-tests; `rest.test.ts`'s `find avg` timing check returns
early under it, since pods under `NODE_V8_COVERAGE` answer 2-3x slower.

Cleanup is explicit and scoped (`common/scripts/ci-k8s-cleanup.sh`, env `STAND_CLEANUP`):
`none` (default, right for one-shot CI VMs) does nothing; `stand` removes the stand namespace and
the local LiveKit; `cluster` additionally deletes the local k3d/kind cluster and its registry -
and never anything on a remote (`STAND_RUNTIME=existing`) cluster beyond the stand namespace.

- GitHub - the `build` job in `.github/workflows/main.yml` (bundle, then `ci_test.sh` on an
  ephemeral ubuntu VM; the VM is discarded, so `STAND_CLEANUP` stays `none`); `docker-build` and
  `dist-build` hang off it. The job summary carries the TOTAL/STAND lines and the per-package
  table, `coverage/` goes up as the `coverage` artifact.
- GitLab - the `test` job in `.gitlab-ci.yml`, which runs `ci_test.sh` on a shell runner under the
  per-host stand lock (`.lock_stand`). The job reads the percentage off the last line with its
  `coverage:` regex and publishes `cobertura-coverage.xml` as the merge-request coverage report.
  `DOCKER_REGISTRY` is cleared for the stand build: the images are local and tagged without one.
  `STAND_CLEANUP=cluster` deletes the whole local cluster at job end (trap and `after_script`), so
  a canceled job cannot poison the next one; that costs one `stand:base:up` per run.

The Playwright suites (`tests/sanity`, `qms-tests`, `ws-tests/sanity`) stay in their own
`uitest:*` jobs in GitLab and `uitest-*` jobs in GitHub. pg and ws run against Kubernetes stands
(`.github/actions/ui-test` / `ci_uitest.sh` with `stand: sanity|ws`):

- GitHub builds the images in the job (`pnpm docker`) and prepare pushes them into the job's own
  k3d registry (the default push path for local runtimes).
- GitLab splits `docker-build` (publishes every image as
  `${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/<name>:${CI_COMMIT_SHA}`, tool included) and
  `uitest:pg` / `uitest:workspace`, which pull those exact images - nothing is built or pushed in
  the uitest jobs. The stand's pull address is
  `<STAND_IMAGE_REGISTRY>/<STAND_IMAGE_NAMESPACE>/<name>:<STAND_VERSION>` with
  `STAND_VERSION=${CI_COMMIT_SHA}`, `STAND_IMAGE_REGISTRY=${DOCKER_REGISTRY}` (host, optional
  path prefix, no trailing slash), `STAND_IMAGE_NAMESPACE=${DOCKER_NAMESPACE}` (falls back to
  `intabiafusion` in `ci_uitest.sh` when unset) and `STAND_PUSH_IMAGES=0`. When the pull registry
  is private, `ci_uitest.sh` maps the GitLab registry credentials to the stand's deploy env for
  the optional imagePullSecret: `STAND_REGISTRY_USERNAME`/`STAND_REGISTRY_PASSWORD` prefer
  `CICD_DOCKER_REGISTRY_{USER,PASSWORD}_PULL` and fall back to the `_PUSH` pair (values are never
  printed, empty credentials are not exported, an explicitly set `STAND_REGISTRY_*` wins);
  `STAND_REGISTRY_SERVER` comes from `CICD_DOCKER_REGISTRY_URL`. Runner requirements:
  Docker (k3d runs in it), ~30 GB free disk, and outbound access to `${DOCKER_REGISTRY}` from the
  cluster nodes for the image pulls. `LIVEKIT_MODE=docker` on Linux.

qms and cockroach keep the compose flow in both CIs (project `sanity` containers only; the cleanup
traps never stop a neighbor job's k3d cluster).

`wait-elastic.sh` takes its host from `ELASTIC_HOST` (default `localhost`) and now exits non-zero
when elasticsearch never answers, instead of reporting a healthy stand.

## Связанные документы

- [AGENTS.md](../AGENTS.md) - "Sanity tests (Playwright)" section: run flags, tracing, flake diagnosis, whole-run profiling.
- [tests/readme.md](../tests/readme.md) - full Playwright setup, AI bot tests, allure.
- [memory/sanity-flaky-tests.md](memory/sanity-flaky-tests.md) - recurring flake causes and fixes.
- [memory/sanity_love_wall_time.md](memory/sanity_love_wall_time.md) - where the love lane spends time.
- [memory/sanity_run_comparability.md](memory/sanity_run_comparability.md) - what makes two runs comparable.
- [memory/sanity_shared_workspace.md](memory/sanity_shared_workspace.md) - shared workspace per worker.
- [memory/test-phase-single-jest.md](memory/test-phase-single-jest.md) - unit test phase internals.
- [memory/test-run-telemetry.md](memory/test-run-telemetry.md) - sanity run telemetry tooling.
- [memory/ui-component-tests-vitest.md](memory/ui-component-tests-vitest.md) - Component tests in packages/ui (vitest)
