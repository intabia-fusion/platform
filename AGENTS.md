# Foundation Platform

TypeScript/Svelte 4 monorepo. Rush.js (pnpm), Node >=24 <25, Webpack 5, Electron, Jest.

## Repository Structure

- `models/*` - Shared types/models. New components go to api/resources/model package
- `server/*`, `server-*`, `server-plugins/*` - Server packages
- `plugins/*` - Client plugins
- `packages/*` - Reusable utilities
- `pods/*` - Deployable service bundles
- `services/*` - Standalone services
- `desktop/`, `desktop-package/` - Electron app
- `dev/` - Dev-server, docker-compose, local tooling
- `tests/`, `ws-tests/`, `qms-tests/` - Integration/e2e (Playwright, Docker)
- `common/` - Shared Rush config, scripts
- `docs/` - Project documentation (per-topic files)

Projects sit 2-3 levels deep, each with its own `package.json`.

## Build & Validation

Use `rush fast-build:*`. All accept `--to PKG` to scope to a package + dependencies.

```bash
rush update                       # Install/update deps
rush fast-build:validate          # Compile + validate
rush fast-build:bundle            # Compile + bundle
rush fast-build:package           # Compile + bundle + package
rush fast-build:docker-build      # Compile + bundle + docker build
rush svelte-check                 # Compile + validate + svelte-check
rush fast-build:watch:validate    # Watch + validate
rush add -p PKG                   # Add dependency
```

Flags: `--to PKG`, `--list`, `-v/--verbose`, `--force` (disable cache).

### Scoped validation after edits

```bash
# Strict: compile + typecheck + eslint. Default check.
rush fast-build:lint --to @hcengineering/<pkg>

# Lighter: compile + typecheck only.
rush fast-build:validate --to @hcengineering/<pkg>
```

`fast-build:lint` is a superset of `fast-build:validate`. Cache is content-hashed; add `--force` to bypass.

Per-package direct (fastest inside one package):

```bash
cd <package-dir>
rushx _phase:validate
rushx build
```

Not every package defines `lint`. On "command not defined", use `rushx _phase:validate` or `rush fast-build:lint --to <pkg>`.

Do NOT:
- Run `rush fast-build:validate` without `--to` (hits unrelated broken packages).
- Run `rush build` for error checking.
- Run `rushx format` (user handles it).

### Docker Workflow

Changes under `services/` or `pods/` require Docker rebuild:

```bash
rush fast-build:docker-build --to @hcengineering/pod-ai-bot
docker compose -f dev/docker-compose.yaml up -d aibot --force-recreate
```

UI via `rush dev` auto-picks changes, no container restart needed.

## Changelog

```bash
git log --pretty=format:'- %h %s' <range> | grep -v -F 'Merge remote-tracking' | sed -E 's/\s*Signed-off-by:.*$//'
```

Full workflow: `docs/changelog.update.task.md`.

## License Headers

**Existing files**: NEVER replace or rewrite the existing license header. Only ADD a `Copyright © <year> Intabia Fusion.` line alongside the original copyright (keep original Hardcore Engineering / other copyrights intact). Do not touch the license terms block.

**New files only**: use the full header below.

**TypeScript** (new files):
```ts
//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//
```

**TypeScript** (modified files with prior copyright):
```ts
//
// Copyright © 2025 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// ...
```
Keep existing copyright lines, add `Intabia Fusion` line if missing.

**Svelte** (HTML comment, `//` prefix):
```svelte
<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
```

**Existing file example** (add Intabia line, keep original):
```ts
//
// Copyright © 2023 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// ... (rest unchanged)
//
```

## Sanity tests (Playwright)

Run from `tests/sanity/`. Stand must be up at `localhost:8083` (front) and `localhost:3003` (LOCAL_URL). Tests build their own bundle via setup project. Always use `rushx uitest` (it wires `LOCAL_URL`, `DEV_URL` and the right config). Always pass `--reporter=list --retries=0` — the default html reporter spawns a local server and blocks the terminal (looks like hang), and default retries waste minutes re-running a real failure before showing output.

```bash
cd tests/sanity

# full suite
rushx uitest --reporter=list --retries=0

# narrowed
rushx uitest tests/tracker/kanban.spec.ts --reporter=list --retries=0 --workers=1
rushx uitest tests/love/meetings.all.spec.ts -g "<title>" --reporter=list --retries=0 --workers=1
```

Flags:
- `--reporter=list` — mandatory; no html server pops up at the end.
- `--retries=0` — mandatory for dev; fail fast instead of 3x re-running the same failure.
- `--workers=1` — serial; sanity tests share workspace state. Use for love/meeting tests.
- `-g "<name>"` or append `:LINE` to the spec path to run a single test.
- Extra playwright flags pass through `rushx uitest` unchanged.

Do not run the bare `npx playwright test` — without `rushx uitest`'s env wiring and `-c ./tests/playwright.config.ts` neither dotenv nor `storageState` load and every test fails on login with `BadRequest`.

For meeting/love-specific test setup (LiveKit, `meetings-ws`, page objects, data-id list), see [`docs/sanity-meetings-tests.md`](docs/sanity-meetings-tests.md).
