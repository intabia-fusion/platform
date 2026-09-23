# Presence: логин и кросс-воркспейс непрочитанное

Область: [Планировщик/Календарь - Pulse](../features/planner-calendar.md)

- `workspace_members` (`server/account/src/collections/postgres/migrations.ts`) проиндексирована только PK `(workspace_uuid, account_uuid)` - поиск по одному `account_uuid` (`getAccountWorkspaces`, `getWorkspaceRoles`, дважды на каждый логин) идёт Seq Scan. Соседняя таблица `workspace_permissions` эту же проблему уже закрыла индексом `workspace_permissions_account_idx (account_uuid)` в том же файле - у `workspace_members` аналогичного индекса нет.
- `getLoginWithWorkspaceInfo` (`server/account/src/operations.ts`) отдаёт клиенту сразу все активные workspace аккаунта (endpoint, роль, branding) без пагинации - размер ответа на логин растёт линейно с числом workspace у аккаунта.
