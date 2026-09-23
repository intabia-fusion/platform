# Admin plugin gotchas

Область: [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)

- `WorkspaceUserOperation` экспортируется из `@hcengineering/core`, не из `account-client` - импортировать из `core`. - `plugins/admin-resources/src/utils.ts`.
- `ButtonMenu` (`packages/ui`) отбрасывает falsy `id` при диспатче выбора - пункт меню с `id: 0` или `''` не сработает. - `packages/ui/src/components/ButtonMenu.svelte`.
- У пакета `html2pdf.js` нет типов - для TS нужен собственный `.d.ts` в проекте. - `plugins/admin-resources/src/html2pdf.d.ts`.
- `WorkspacesPagedQuery` и `AccountsFilter` - независимые копии интерфейса в двух пакетах (без re-export), менять оба синхронно. - `server/account/src/types.ts`, `foundations/core/packages/account-client/src/types.ts`.
- Таблица `global_account.admin_action` (миграция v35) намеренно без FK на цель действия - лог должен переживать удаление своей цели (person/workspace).
- Регистрация нового клиентского плагина - 4 точки в `dev/prod/src/platform.ts` (import, `addStringsLoader`, компонент/роут, `addLocation`) и те же 4 в `desktop/src/ui/platform.ts`, плюс оба `package.json` и `pnpm-workspace.yaml`.
- `pnpm check-versions` требует svelte строго `^4.2.20` во всех пакетах - расхождение версии ломает `pnpm install`. - `pnpm-workspace.yaml`.
- jsonb-колонки `backup_info`/`usage_info` в БД хранятся snake_case, клиент получает camelCase через рекурсивную конвертацию на границе.

## Связанные документы

- [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)
- [Отложенное удаление пространств и аккаунтов](deferred-deletion.md)
