# @typescript-eslint 6->8 fix patterns

Область: [Сборка и инструменты](../getting-started.md)

Non-obvious `@typescript-eslint` (currently 8.70.0, `pnpm-workspace.yaml` catalog) quirks found while fixing lint errors across the repo:

- **`typeof x !== 'object'` does not narrow `unknown` to primitives.** TS narrows the negative branch to `{}`, which still trips `no-base-to-string` on `String(x)`. Workaround: explicit cast `String(x as string | number | boolean | bigint | symbol)` after the runtime check. See `stringifyValue` in `server-plugins/workflow-resources/src/post-functions/transforms.ts` and `safeStringify` in `services/ai-bot/pod-ai-bot/src/workspace/compaction.ts`.

- **Explicit `.toString()` and even a `.toJSON()`-shaped fallback do not bypass `no-base-to-string`**
  - the rule checks the resolved type, not the call form. Use a properly-typed method instead: yjs `YText.toJSON(): string` (`toEqualYdoc` matcher, `foundations/core/packages/text-ydoc/src/__tests__/ydoc.test.ts`) is typed where `toString()` is not, even though both return the same content at runtime for `YText`.

- Debugging trick: `./node_modules/.bin/eslint --no-eslintrc --config .eslintrc.js <file> --format json` prints the exact autofix/suggestion text per error - faster than guessing the intended rewrite for rules like `prefer-optional-chain`.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
