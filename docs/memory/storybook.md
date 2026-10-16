# Storybook (dev/storybook)

- Storybook 9+ требует Svelte 5 (`@storybook/svelte@9/10` peer `svelte: ^5`, `addon-svelte-csf@5` тоже); на Svelte 4 потолок - 8.6. Истории в CSF3 `.ts`, чтобы при переходе на Svelte 5 обновить только Storybook.
- `@storybook/svelte-vite` 8 не добавляет svelte-плагин сам - без `vite.config.mts` с `svelte()` сборка падает на `PreviewRender.svelte (1:0): Expression expected`.
- `lib/` workspace-пакетов (`analytics`, `platform`, `core`) - CommonJS; vite конвертирует CJS только в node_modules ("Analytics is not exported"). Плагин `workspaceSources` (`platform-rig/profiles/ui/vite.mjs`) ведёт bare-импорт на исходники: поле `svelte`, иначе TS-`main`.
- Тип, импортированный как значение в `.svelte`, в vite dev роняет весь модуль (`does not provide an export named`); webpack это глотает. Поиск: `pnpm check:svelte-imports -- --types`.
- `@mdx-js/react` (docs-аддон) просит peer `@types/react` - внесён в `peerDependencyRules.ignoreMissing`, React-типы не нужны.
- `compile_all --lint` линтит только пакеты с фазой build; у Storybook её нет, eslint идёт через `_phase:format`.
- Svelte docgen раскрывает алиасы (`IntlString` -> `string & { __id: true; } & ...`); имена возвращает `argTypesEnhancers` `prettifyTypeNames` (`src/helpers/argTypes.ts`) по бренду типа.
