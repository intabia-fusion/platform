# Foundation Platform - AI Agent Instructions

TypeScript/Svelte 4 monorepo. Rush.js (pnpm), Node >=24 <25, Webpack 5, Electron, Jest.

## Documentation Policy

**Every task = create/update `docs/memory/<topic>.md`**. Capture heuristics, decisions, edge cases, and workflows discovered during implementation.

### What to document
- Non-obvious architectural decisions with rationale
- Complex feature flows (step-by-step with diagrams if needed)
- Debugging findings (root causes, workarounds, gotchas)
- Integration patterns (how to use APIs, services)
- Migration/upgrade procedures

### What NOT to document
- Obvious code behavior (let code speak)
- Temporary debugging logs (clean after fix)
- Trivial setup steps (covered by README)

### Location
- `docs/memory/<topic>.md` - accumulate knowledge here
- Keep concise, update incrementally
- One file per topic/feature

## Core Rules

**Output**: Answer first, reasoning after. No preamble. No hollow closings. ASCII only (no em dashes, smart quotes, Unicode bullets).

**Code**: Simplest working solution. Read before modify. No over-engineering. Three similar lines > premature abstraction. No `any` without reason. Strict types, interfaces over types.

**Accuracy**: Never speculate about unread code. Reference file = read first. Unsure = "I don't know." User corrections = ground truth.

**Git**: Read-only (diff, status, log). NO commits, resets, reverts, branch switches.

**Formatting**: NEVER run `rushx format`. User handles it. Can corrupt/erase files.

## Build & Validation

**Use `rush fast-build:*` commands. All support `--to PKG` for specific package + dependencies.**

```bash
rush update                    # Install/Update deps
rush fast-build:validate        # Compile + validate all
rush fast-build:bundle          # Compile + bundle
rush fast-build:package         # Compile + bundle + package
rush fast-build:docker-build    # Compile + bundle + docker build
rush svelte-check    # Compile + validate + svelte-check
rush fast-build:watch:validate  # Watch + validate
rush add -p PKG                 # Add dependency
```

**Common flags**:
- `--to PKG` - Build specific package and dependencies
- `--list` - Print packages without building
- `-v, --verbose` - Detailed output
- `--force` - Disable cache (full rebuild)

### Validation Workflow

After modifying packages, validate ONLY the affected package(s) — never run a global validate, it will hit unrelated broken packages and obscure real failures.

**Preferred (scoped, fast, uses cache)**:

```bash
# Strictest: lint supersets validate (compile + typecheck + eslint).
# Use this as the default check after edits.
rush fast-build:lint --to @hcengineering/<pkg>

# Lighter: compile + typecheck only, no eslint. Use when you only need
# to confirm types compile and do not care about lint rules yet.
rush fast-build:validate --to @hcengineering/<pkg>
```

`fast-build:lint` is a strict superset of `fast-build:validate` — it runs the same compile/typecheck plus eslint. Prefer `:lint` for the final check; `:validate` is only useful for a faster intermediate pass.

If the cache reports "(cached)" but you know the file changed, the cache is content-hashed — a real content change will invalidate it automatically. To force a rebuild add `--force`.

**Direct per-package (no dependency walk, fastest after edits within one package)**:

```bash
cd <package-dir>
rushx _phase:validate      # compile + validate only this package
rushx build                # if the package exposes a build script
```

Note: not every package defines `lint` in `package.json`. If `rushx lint` fails with "command not defined", use `rushx _phase:validate` or go through `rush fast-build:lint --to <pkg>`.

**Do NOT**:
- Run `rush fast-build:validate` without `--to` (global, slow, trips on unrelated failures).
- Run `rush build` for error checking.
- Run `rushx format` (user handles it).

### Docker Workflow

Service changes (`services/`, `pods/`) require Docker rebuild:

```bash
# Build Docker image
rush fast-build:docker-build --to @hcengineering/pod-ai-bot

# Restart container
docker compose -f dev/docker-compose.yaml up -d aibot --force-recreate
```

**Note**: UI via `rush dev` (dev-server) auto-picks changes, no container restart needed.

## Structure & Patterns

### Repository Structure
- `models/*` - Shared types/models. New components -> api/resources/model package
- `server-*` - Server packages
- `plugins/*` - Client plugins
- `packages/*` - Reusable utilities
- Projects 2-3 levels deep, each with `package.json`

### Code Style
- **TypeScript**: Strict types, interfaces over types, no `any`
- **Svelte**: Script/style/markup order, reactive `$:`, stores for state
- **Naming**: Files `kebab-case`, Components `PascalCase`, functions `camelCase`, constants `UPPER_SNAKE_CASE`

### Patterns
- Errors: always handle (Error subclasses, catch promises)
- Async: async/await, Promise.all() for parallel
- State: Svelte stores, separate business logic
- APIs: JSDoc public interfaces, tests alongside code
- IntlString: add entries to `component-assets/lang` for every locale (min English), run `diagnostics()`

## Debugging Workflow

1. **Log** - structured objects: state, params, IDs
2. **Test** - user runs app, provides console output
3. **Options** - outline approaches (pros/cons/risks), ask user pick
4. **Root cause** - trace flow, expected vs actual
5. **Fix** - from findings
6. **Clean** - remove debug logs

```typescript
console.log('[ComponentName.methodName] Description', {
  key1: value1,
  key2: value2,
  objectId: object?._id
})
```

## Navigation & Selection

Provider-based architecture:
- `focusStore` / `selectionStore` - global state
- `ListSelectionProvider` - delegates to view-specific handlers
- `SelectDirection`: `'vertical'` (up/down) or `'horizontal'` (left/right)

Principles:
- Navigation uses **displayed order** (from `getLimited()`) not projection
- Focus via `updateFocus()`, selection follows via delegation
- Scroll auto via `scrollIntoView()`

## Changelog Generation

```bash
git log --pretty=format:'- %h %s' <range> | grep -v -F 'Merge remote-tracking' | sed -E 's/\s*Signed-off-by:.*$//'
```

- Exclude merge commits and `Signed-off-by:` footers
- See `docs/changelog.update.task.md` for full workflow

## License Headers

**Existing files**: NEVER replace or rewrite the existing license header. Only ADD a `Copyright © <year> Intabia Fusion.` line alongside the original copyright (keep original Hardcore Engineering / other copyrights intact). Do not touch the license terms block.

**New files only**: use the full header below.

**TypeScript** (new files):
```ts
/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/
```

**Svelte** (new files, HTML comment, `//` prefix):
```svelte
<!--
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// See https://www.eclipse.org/legal/epl-2.0
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
