# Детектор async-кнопок без прогресса

`pnpm check-async-buttons [paths...] [--guarded] [--json]` (`common/scripts/check-async-buttons.js`, self-test: `--self-test`).

- Разобранные безопасные случаи - `common/scripts/async-buttons-reviewed.json` (`file`, `id`, `handler`, `reason`). `id` = sha1 от имени компонента + всего текста обработчика (пробелы схлопнуты): правка обработчика снимает отметку и требует повторного разбора; одинаковые обработчики в одном файле делят `id`. Записи, которые больше не совпадают, печатаются как `reviewed entry no longer matches`.

- Разметка - `svelte.preprocess` + `svelte.parse` (svelte берётся через `createRequire` из `packages/ui`, в `common/scripts` его нет); `<script>` и `<style>` заменяются пробелами, офсеты сохраняются. Сам script - TS AST (`typescript` 6).
- Async = `async`/`Promise<>` у функции, `.then/.catch/.finally`, вызов `getClient()`-клиента (кроме `getHierarchy/getModel/apply`), вызов локальной async-функции или экспорта из относительного `.ts`. Вложенные колбэки (результат `showPopup`, `setTimeout`) не считаются кликом.
- Защищено = `loading` не `false`, или `disabled` ссылается на переменную, которую пишет обработчик (с раскрытием `$: x = ...` на 1 уровень). `{...spread}` считается защищённым.
- Не видит: обработчики из props, импорты из workspace-пакетов (`@hcengineering/*`), Promise от других объектов (`client` не из `getClient()`, `accountClient` и т.п.).
- На 2026-10-16: 311 находок в 2621 файле - 139 исправлено, 172 в reviewed. `Card` `okAction` сам ставит `loading`, кнопки футера Card не в счёте.
- `leaveMeeting()` (`plugins/love-resources/src/meetings.ts`) без guard на повторный вход намеренно: `joinMeeting` делает `await leaveMeeting()` и сразу ставит `currentMeeting`, ранний return дал бы гонку с незавершённым disconnect. Защита - локальные флаги в кнопках.
- `MessageBox` (presentation) вызывает `action` до `dispatch('close', true)`: попап, открытый внутри action, успевает появиться до close-колбэка.
