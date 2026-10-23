# Storybook (dev/storybook)

- Storybook 9+ требует Svelte 5 (`@storybook/svelte@9/10` peer `svelte: ^5`, `addon-svelte-csf@5` тоже); на Svelte 4 потолок - 8.6. Истории в CSF3 `.ts`, чтобы при переходе на Svelte 5 обновить только Storybook.
- `@storybook/svelte-vite` 8 не добавляет svelte-плагин сам - без `vite.config.mts` с `svelte()` сборка падает на `PreviewRender.svelte (1:0): Expression expected`.
- `lib/` workspace-пакетов (`analytics`, `platform`, `core`) - CommonJS; vite конвертирует CJS только в node_modules ("Analytics is not exported"). Плагин `workspaceSources` (`platform-rig/profiles/ui/vite.mjs`) ведёт bare-импорт на исходники: поле `svelte`, иначе TS-`main`.
- Тип, импортированный как значение в `.svelte`, в vite dev роняет весь модуль (`does not provide an export named`); webpack это глотает. Поиск: `pnpm check:svelte-imports -- --types`.
- `@mdx-js/react` (docs-аддон) просит peer `@types/react` - внесён в `peerDependencyRules.ignoreMissing`, React-типы не нужны.
- `compile_all --lint` (yama `src/build/compile-all.ts`) линтит только пакеты с фазой build; у Storybook её нет, eslint идёт через `_phase:format`.
- Svelte docgen раскрывает алиасы (`IntlString` -> `string & { __id: true; } & ...`); имена возвращает `argTypesEnhancers` `prettifyTypeNames` (`src/helpers/argTypes.ts`) по бренду типа.

## Настоящие компоненты платформы (истории вложений)

- Storybook рисует настоящие компоненты платформы, Vite строже webpack:
  - `.svelte` собираются с `verbatimModuleSyntax`: `import { Mixin }` без `type` остаётся импортом значения и падает на имени, которого нет. Плагин `typeOnlyImports` (`dev/storybook/vite.config.mts`) выкидывает такие имена по реальным экспортам модуля; кэш списка экспортов ключуется по mtime.
  - Импорты нельзя переписать в чтение из пространства имён: ломаются циклы (`ThemeOptions` в `Theme.svelte`, TDZ). Без `verbatimModuleSyntax` теряются сторы, которые разметка читает как `$store`.
  - У `emojibase` нет default, а `plugins/emoji/src/types.ts` его реэкспортирует: прокладку `src/shims/emojibase.ts` подставляет плагин `emojibase-shim` с `enforce: 'pre'` (перед `workspaceSources`).
  - У `*-assets` в `exports` нет `./src/lang`: строки грузятся `import.meta.glob` из `lang/*.json` (`src/attachments/mock.ts`).
- Список просмотрщиков (`previewTypes`) задаётся в `src/attachments/mock.ts` и держится подпиской: запрос к пустой модели отвечает позже и сбросил бы список.
- Состояние «грузится»: запросы на `/__hang/...` dev-сервер не отвечает никогда (плагин `hangingRequests`), поэтому Playwright открывает такие истории с `waitUntil: 'commit'`. После правки `vite.config.mts` Storybook перезапускается: `kill $(lsof -tiTCP:6006 -sTCP:LISTEN)` (`pkill -f "storybook dev"` процесс не находит).
- Headless Chromium не рисует PDF во фрейме: пустой PDF на скриншоте - не поломка.
- Иконки `view` (`Open`, `Sidebar`) мок ставит по одной `setMetadata` из `view-assets/assets/icons.svg?url`: `loadMetadata` требует все ключи плагина и падает на первом пропущенном.
- Превью ссылки в Storybook - blob-ссылка на JSON (в ней есть `://`, хранилище не нужно); `data:` не подходит.
- `ReferenceError: X is not defined` после нового экспорта из пакета - кэш `typeOnlyImports`: список экспортов `index.ts` хранится по mtime самого `index.ts`, а не файлов за `export *`, и плагин вырезает «неизвестное» имя из импорта. Лечится `touch` индекса пакета и импортирующих `.svelte` (их преобразование vite тоже кэширует) или перезапуском Storybook.
