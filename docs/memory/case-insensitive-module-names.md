# Имена модулей, различающиеся только регистром

Область: [getting-started.md](../getting-started.md)

- На macOS (регистронезависимая ФС) `link.ts` и `Link.svelte` в одной папке ломают импорт `'./link'`: webpack фронта
  берёт `Link.svelte`, функции из `link.ts` приходят `undefined` (`nonEmpty is not a function` в `LinkCard`).
  `check-svelte-imports.js` ловит это как «is not exported by Link.svelte». На Linux CI всё собирается.
- Vite (Storybook) находит `.ts` раньше `.svelte`, поэтому пара `helpers/Matrix.svelte` + `helpers/matrix.ts` там работает.
- Два файла с одним именем в разном регистре (`Link.test.ts` и `link.test.ts`) на macOS - один файл: checkout тихо
  оставляет один из них, а git показывает второй изменённым.
- Помощники папки компонента называть не по имени компонента: `ui-kit/link/utils.ts`, а не `link.ts`.
