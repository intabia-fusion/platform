# Fulltext: переиндексация воркспейса со старой версией

Область: [Архитектура](../architecture.md)

## Исходное ограничение

Фуллтекст индексирует воркспейс, только если версия воркспейса в account точно совпадает с версией пода (`createIndexer`, `pods/fulltext/src/manager.ts`). Иначе индексатор не создаётся, а запрос пропускается:

- воркспейс без визита больше суток - сразу;
- остальные - после 4 попыток с паузой 10 с (надежда, что апгрейд вот-вот закончится).

Пропуск виден по `wrong version` в логе. `withIndexer` возвращает `'wrong-version'`.

Запросы на переиндексацию приходят двумя путями, и каждый защищён от пропуска по-своему.

## Путь 1: запросы от миграций - хранятся до `upgrade-done`

Проблема: миграция просит reindex (`client.fullReindex()` / `client.reindex(domain, classes)`) в середине апгрейда, а версию в account повышает только `upgrade-done` после всех миграций. Отправленный сразу запрос всегда приходил бы в фуллтекст на старой версии.

Как устроено:

- `MigrateClientImpl` (`server/tool/src/upgrade.ts`) ничего не шлёт, а записывает запрос в `_migrations` воркспейса: `MigrationState` с `plugin: 'fulltext-reindex'`, `state` - домен или `full`, у частичного ещё `classes` (`server/tool/src/reindex.ts`).
- `upgradeWorkspaceWith` (`server/workspace-service/src/ws-operations.ts`) после `upgrade-done` отправляет записи (`sendPendingReindex`) и удаляет их. Если есть `full`, частичные не шлются - полный их покрывает.
- При создании воркспейса записи удаляются без отправки: после создания приходит `Created`, и фуллтекст всё равно делает полную переиндексацию.
- `dev/tool upgrade-workspace` повышает версию прямо в колбэке `upgrade-done`, иначе запросы ушли бы до повышения версии.
- Частичный `Reindex` приходит в топик Workspace; фуллтекст пересылает его в свой топик (`processWorkspaceEvent`).

Почему в БД, а не в памяти:

- `tryMigrate` записывает state миграции сразу после неё (`foundations/core/packages/model/src/migration.ts`), повторно она не запустится.
- На SIGTERM workspace-service не ждёт текущий апгрейд (`server/workspace-service/src/index.ts`).
- Значит, при рестарте посреди апгрейда буфер в памяти пропал бы, а запрос - навсегда. Запись в БД делается внутри миграции, до её state, и переживает рестарт; упавший апгрейд повторяется и отправляет её после своего `upgrade-done`.
- `_id` записи фиксирован на домен, `upload` - upsert: повторный прогон миграции не создаёт дубль.

## Путь 2: всё остальное - флаг `needs_reindex`

Когда нужен: ручной reindex (`fulltext-reindex-all`, админский) заброшенного воркспейса. Апгрейдер берёт только воркспейсы с визитом в окне `WS_LIVENESS_DAYS` (`getPendingWorkspace`), а `fulltext-reindex-all` версию не проверяет - такой reindex заведомо пропускается. Ещё флаг ловит под фуллтекста на другой версии при rolling deploy.

Как устроено:

- Фуллтекст пропустил `FullReindex` или `Reindex` из-за версии → `setNeedsReindex()` → `workspace_status.needs_reindex = true` в account.
- Флаг не помнит домен: пропущенный частичный reindex выполнится как полный.
- Снимает флаг `takeNeedsReindex()` - один `UPDATE ... WHERE needs_reindex RETURNING`; из одновременных вызовов `true` получает только один (`server/account/src/__tests__/needs-reindex-real.itest.ts`).

Где флаг снимается и запускается полная переиндексация:

- на `Upgraded`, после `closeWorkspace`;
- в `createIndexer`, если версия совпала, а флаг стоит: `Upgraded` мог достаться поду на другой версии, второго `Upgraded` не будет;
- в начале `FullReindex`, до создания индексатора - иначе `createIndexer` увидит флаг и поставит вторую переиндексацию. Если этот `FullReindex` не дошёл до конца, флаг возвращается.

Детали вызовов account:

- только с сервисным токеном фуллтекста (`withAccount`): `createIndexer` вызывается и из поиска (`pods/fulltext/src/server.ts`) с токеном пользователя, а RPC пускает только `extra.service === 'fulltext'`;
- 3 попытки через 1 с, потом `ctx.error` и обработка идёт дальше: per-message consumer (`@hcengineering/kafka`) повторяет упавшее сообщение бесконечно и держит партицию.

## Что не покрыто

- Под упал сразу после `upgrade-done`, до отправки: записи лежат в `_migrations` до следующего апгрейда воркспейса.
- Restore бэкапа с записями `fulltext-reindex` даст лишнюю переиндексацию на следующем апгрейде.

## Связанные заметки

- [account_db_migrations.md](account_db_migrations.md)
- [fulltext_bulk_mode.md](fulltext_bulk_mode.md)
