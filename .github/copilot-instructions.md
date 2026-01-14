# Foundation Platform - Copilot Instructions

TypeScript/Svelte 4 monorepo using Rush.js (pnpm 10.15.1), Node >=20 <25, Webpack 5, Electron, Jest.

## Interaction preferences

Respond to user using Russian language, all comments should be in English.

## Code Style

**TypeScript**: Strict types, interfaces over types, avoid `any`, export types separately
**Svelte**: Script/style/markup order, reactive `$:`, stores for state, small focused components
**Naming**: Files `kebab-case`, Components `PascalCase`, functions `camelCase`, constants `UPPER_SNAKE_CASE`

## Structure

- `models/*` - Shared types/models
- `server-*` - Server packages
- `plugins/*` - Client plugins
- `packages/*` - Reusable utilities
- Projects 2-3 levels deep, each with `package.json`

## Rush Commands

```bash
rush install         # Install deps
rush build           # Build all
rush build --to PKG  # Build specific
rush add -p PKG      # Add dependency
```

## Error Checking

**IMPORTANT**: Use `diagnostics` tool to check for TypeScript/Svelte errors, NOT `rush build`:

- ✅ `diagnostics()` - Check all files for errors/warnings (fast, uses language server)
- ✅ `diagnostics({ path: "plugins/tracker-resources/src/utils.ts" })` - Check specific file
- ❌ `rush build` - Don't use for error checking (runs full transpilation, slower)

`rush build` performs transpilation which may succeed even with type errors. Always use `diagnostics` to verify code correctness.

## Formatting and Linting

After making changes to a package, run formatting and linting in the modified package directory:

```bash
cd <package-directory>
rushx format --force   # Format code and run linting
```

This ensures code style consistency and catches linting errors before commit.

## Changelog generation

When generating changelogs (the "All commits" lists), follow these rules:

- Exclude commits whose subject contains `Merge remote-tracking` (filter them out).
- Strip `Signed-off-by:` footers from commit messages (remove the footer content and any lines that are only `Signed-off-by:`).
- Recommended pipeline (example):
```/dev/null/changelog-filter.sh#L1-3
git log --pretty=format:'- %h %s' <range> | grep -v -F 'Merge remote-tracking' | sed -E 's/\s*Signed-off-by:.*$//'
```
- Note: `git log --no-merges` removes all merge commits; use it only if you intentionally want to omit all merges.

Apply these filters when updating `changelog.md` or generating release notes so the generated logs exclude noisy merge-tracking commits and signed-off-by lines.

## Patterns

- Always handle errors (proper Error subclasses, catch promises)
- Use async/await, Promise.all() for parallel ops
- Svelte stores for shared state, separate business logic
- JSDoc public APIs, tests alongside code
- Check with `diagnostics` before committing changes
- Run `rushx test` before commit

## Debugging Workflow

When debugging issues:
1. **Add comprehensive logging first** - use `console.log` with structured objects showing state, parameters, IDs
2. **Test and analyze logs** - let user run the app and provide actual console output
3. **Identify root cause** from logs - trace the flow, compare expected vs actual values
4. **Fix the issue** based on findings
5. **Remove all logging** after fix is confirmed - keep production code clean

Logging format:
```typescript
console.log('[ComponentName.methodName] Description', {
  key1: value1,
  key2: value2,
  objectId: object?._id  // Use optional chaining for safety
})
```

## Avoid

❌ `any` without reason ❌ `console.log()` in production ❌ Mixed concerns ❌ Circular deps ❌ Ignoring TS errors ❌ Using `rush build` to check for errors

## When Coding

- Infer location from context (models/server/plugins/packages)
- Match existing patterns in codebase
- Include proper imports/types
- Add error handling
- Use existing utils first
- When fixing bugs:
  - Read existing code thoroughly before changing
  - Use logging to understand actual runtime behavior
  - Trace data flow through components
  - Verify assumptions with logs before implementing fixes
  - Test incrementally, remove debug code when done

## Navigation & Selection Architecture

The app uses a provider-based selection/focus system:
- `focusStore` - global focus state
- `selectionStore` - global selection state  
- `ListSelectionProvider` - manages list navigation, delegates to view-specific handlers
- `SelectDirection` - `'vertical'` (up/down) or `'horizontal'` (left/right in tables, first/last in lists)

Key principles:
- Navigation uses **actual displayed order** (from `getLimited()`) not projection order
- Focus changes propagate through `updateFocus()` 
- Selection follows focus via provider delegation
- Scroll happens automatically via `scrollIntoView()` on navigation


# License: 

For every new files please add a 2026 Intabia Fusion license header like this:

```ts
/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  
  See the License for the specific language governing permissions and
  limitations under the License.
*/
```
