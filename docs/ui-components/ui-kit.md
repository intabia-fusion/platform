# ui-kit - базовые компоненты

Актуальные базовые компоненты платформы: `packages/ui/src/ui-kit/`, импорт из отдельной точки входа:

```ts
import { Button } from '@hcengineering/ui/kit'
```

Компонент кита заменяет одноимённые и похожие компоненты из `packages/ui/src/components` и самописные аналоги
в плагинах. Старые переводятся на кит и удаляются, параллельно их не поддерживаем.

## Компоненты

| Component | Purpose | Key props | Заменяет |
|---|---|---|---|

## Правила

- Новый базовый компонент (кнопка, поле, переключатель, ...) - только сюда, не в `components/` и не в плагин.
- Внешний вид задают токены темы (`packages/theme/styles`), стили scoped в самом компоненте; глобальные
  классы под кит не заводятся.
- Нет пропсов раскладки (`width`, `padding`, `flex`, ...) - размеры и отступы задаёт место использования.
- Событие не глушится по умолчанию (`stopPropagation`/`preventDefault` решает вызывающий код).
- Компонент приходит вместе с историей Storybook (`dev/storybook/src/ui-kit/<Component>.stories.ts`), тестом
  (`packages/ui/src/__test__`) и строкой в таблице выше.

## Storybook

`dev/storybook` - витрина компонентов: Storybook 8.6 (`@storybook/svelte-vite`), истории в CSF3 (`*.stories.ts`).

```bash
cd dev/storybook
pnpm run storybook         # http://localhost:6006
pnpm run build-storybook   # статическая сборка в storybook-static/
```

- Тема, акцент и язык - в тулбаре; декоратор `src/decorators/StoryTheme.svelte` рисует истории через `Theme` из
  `@hcengineering/theme`, как приложение.
- `src/helpers/Matrix.svelte` + `axis()` - таблица вариантов (`kind` x `size`, состояния) для сверки компонента.
- `src/legacy/` - эталонная отрисовка старых компонентов, которые заменяет кит; удаляется вместе с ними.
- Проверки: `pnpm svelte-check --to @hcengineering/storybook` (typecheck историй), eslint - через `pnpm format`.
  В `pnpm build` Storybook не входит.

## Точка входа

`./kit` объявлен в `exports` пакета `packages/ui/package.json`. С появлением `exports` резолвятся только
перечисленные в нём пути, поэтому там же оставлены глубокие импорты `@hcengineering/ui/src/*` (типы, цвета,
`lang`, `plugin`) и `lang/*.json`. Новая глубокая точка входа в `ui` - сначала строка в `exports`.
