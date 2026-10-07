# Закладки на удалённые сообщения и вложения (FUSIO-1508)

Найдено при анализе кода и воспроизведено: сохранить сообщение, удалить его - запись закладки остаётся.

## Что было

Закладка - `activity.class.SavedMessage` (сообщение) или `attachment.class.SavedAttachments` (вложение): `Preference` в `core.space.Workspace`, `attachedTo` - id цели. При удалении сообщения или вложения закладки никто не удалял.

Счётчик "Сохранённое" (`ChatSpecialElement.svelte`) считает все `SavedMessage`, а список (`SavedMessages.svelte`) показывает только те, у которых нашёлся `$lookup.attachedTo`. Счётчик расходился со списком, и сироты копились в `preference` навсегда.

## Почему триггер

Закладки - чужие `Preference`: удаляет сообщение автор, а сохраняли его другие. Клиент автора их не видит - `PrivateMiddleware` фильтрует `findAll` по `Preference` условием `createdBy in account.socialIds`. Удалять их может только сервер.

`TriggersMiddleware` стоит в конвейере после `PrivateMiddleware` (`server/server-pipeline/src/pipeline.ts`), поэтому `control.findAll` триггера видит закладки всех пользователей, а производные транзакции (`context.derived`, вход после `MarkDerivedEntryMiddleware`) не проходят проверку `Forbidden` из `PrivateMiddleware.tx`. Так же устроены `card-resources` и `view-resources`, которые правят чужие `ViewletPreference`.

## Что сделано

| Где | Что |
|---|---|
| `server-plugins/activity-resources/src/index.ts`, `OnActivityMessageRemoved` | на `TxRemoveDoc` любого `ActivityMessage` (`ChatMessage`, `ThreadMessage`, `DocUpdateMessage`, ...) удаляет `SavedMessage` всех пользователей с этим `attachedTo`. Асинхронный: каскад удаления канала не нагружает запрос пользователя, счётчик Saved обновляется следующим broadcast. Срабатывает и на `removeCollection` ответа в треде, и на сообщения, удалённые каскадом (`OnDocRemoved`, коллекции) |
| `models/server-activity/src/index.ts`, `server-plugins/activity/src/plugin.ts` | регистрация триггера с `txMatch` по `TxRemoveDoc` + `ActivityMessage` (наследники подхватываются `Triggers.addDerived`) |
| `server-plugins/attachment-resources/src/index.ts`, `OnAttachmentDelete` | существующий триггер удаления вложения заодно удаляет `SavedAttachments` всех пользователей |
| `models/preference/src/migration.ts`, `removeOrphanPreferences` | обход `preference` курсором пачками по 500: закладки, чей `attachedTo` не найден ни в одном домене цели и её наследников, удаляются. Повторный запуск ничего не меняет |
| `models/activity/src/migration.ts`, `models/attachment/src/migration.ts` | миграции `remove-orphan-saved-messages-v1` и `remove-orphan-saved-attachments-v1` на `removeOrphanPreferences` |

## Тесты

- `server-plugins/activity-resources/src/__tests__/messageRemoved.test.ts`, `server-plugins/attachment-resources/src/__tests__/attachmentDelete.test.ts` - юнит-тесты триггеров: закладки двух пользователей на удалённую цель удаляются, на другие цели - нет.
- `server/server-pipeline/src/__tests__/savedOrphans.itest.ts` - настоящий конвейер (`getServerPipeline`, полная модель, триггеры) на Postgres из testcontainers. Три аккаунта: двое сохраняют, третий удаляет сообщение, ответ в треде (`removeCollection`) и вложение; отдельно - удаление канала с сообщениями (каскад `OnDocRemoved`). Миграция: готовые сироты удаляются, живые закладки остаются, второй прогон ничего не меняет.

Без исправления юнит-тесты и интеграционные сценарии удаления падают.

```bash
cd server/server-pipeline
env -u DB_URL npx jest --testMatch '**/savedOrphans.itest.ts' --forceExit
```

В интеграционном тесте серверные плагины подключаются через `require` только для activity, attachment и chunter: загрузчики `registerServerPlugins()` используют динамический `import()`, который jest без `--experimental-vm-modules` не выполняет. Триггеры остальных плагинов в тесте не работают и пишут ошибки загрузки в лог.
