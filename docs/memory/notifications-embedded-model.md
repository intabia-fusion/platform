# Уведомления: встроенная модель и сервис

Область: [Уведомления](../features/notifications.md)

Уведомления встроены в `DocNotifyContext` (карточки `latestNotifications`, массивы `unread*`, три счётчика), а пишет их не транзактор, а сервис `services/notifications`, читающий `Tx` из Kafka и применяющий результат обратно через `TxApplyIf`. Отсюда два источника неочевидных решений: Kafka доставляет «хотя бы раз» и по порядку внутри партиции, а клиент и сервис видят одно и то же состояние с разной задержкой. Что ниже - именно про это, плюс несколько ловушек БД и безопасности.

## Счётчики и БД

- Три счётчика контекста считаются по-разному, и это намеренно. `unreadCount` двигается `$inc` в момент записи в inbox (`services/notifications/src/module/notification.ts`). `unreadMessagesCount` и `notifiedMessagesCount` пересчитываются абсолютно в конце обработки каждой Tx: берётся контекст из кэша (или `findOne`), на `structuredClone` реплеятся все накопленные в результате операции, из итога считается сумма (`setUnreadMessagesCounts`, `services/notifications/src/utils/context.ts`). Инкрементальный подсчёт расходился при повторной доставке Kafka-сообщения и когда одна Tx давала несколько операций над одним контекстом.
- На колонке `unreadCount` стоит `CHECK (>= 0)` (`0001_reworkNotifications.sql`). Сервис отправляет апдейты батчем в одном `TxApplyIf`, поэтому одна просевшая строка роняла бы уведомления всех получателей батча. `setUnreadMessagesCounts` обнуляет отрицательное значение до отправки.
- Старые covering-индексы `notification_dnc` содержали `INCLUDE data`. После того как карточки и `unread*` переехали в `data`, строка индекса превышала лимит btree (`index row size N exceeds btree version 4 maximum 2704`), и любая запись контекста падала. Индексы дропнуты (`0002_dropOversizedDncIndexes.sql`), их ключи покрыты индексами из 0001. Новые индексы с `INCLUDE data` на этой таблице создавать нельзя.
- `services/db-migrator/src/db.ts:applyMigration` раньше помечал упавшую SQL-миграцию применённой и поднимал версию схемы, оставляя полусхему. Теперь ошибка пробрасывается: транзактор будет ждать нужную версию, но не стартует. Индексы создаются без `CONCURRENTLY` (внутри `sql.begin` нельзя), миграция рассчитана на оффлайн-окно.
- `activity.replies` вынесен в колонку (`0005_activityReplies.sql`), потому что jsonb-число сравнивается как текст и не индексируется, а списку тредов нужен `WHERE replies > 0 ORDER BY modifiedOn DESC`.

## Кто получает уведомление

- Автор сообщения отсекается до расчёта провайдеров (`isSender`, `module/message.ts`), поэтому флаг `notifyAuthor` у `MessageNotificationType` не действует. Он работает только для `TxNotificationType` в `module/tx.ts` (запросы, ToDo): там нет сообщения, о котором «сам себе» не нужно сообщать.
- `systemAccountUuid` и аккаунт ai-bot отсекаются в одном месте - `getReceivers` (`services/notifications/src/cache.ts`), через который идут все модули. До этого бот получал уведомления по каждому пути отдельно, а его подтверждённый email (домен без MX) уходил в `pod-mail` и копил ошибки отправки. Второй барьер - `BLOCKED_RECIPIENTS` в `pod-mail` с email бота по умолчанию (`services/mail/pod-mail/src/config.ts`).
- Общий read-only гость (`readOnlyGuestAccountUuid`) - один аккаунт на всех анонимных посетителей публичной ссылки; его непрочитанное некому чистить, оно бы только росло. `handleCreateNotificationAction` (`module/action.ts`) даёт ему карточку, но не unread.
- Сообщения ai-bot несут `tx.meta.inboxOnly` (ставит `services/ai-bot`): сервис оставляет карточку в inbox, но обнуляет `queueMessages` и app-push, чтобы ответы бота не звенели и не шли на почту (`Workspace.tx`, `services/notifications/src/workspace.ts`).

## Гонки клиента и сервиса

- Клиент часто успевает прочитать документ раньше, чем сервис обработает Tx сообщения. Если `ReadState[account].timestamp >= createdOn` (`alreadyRead`, `module/message.ts`), сообщение попадает в `latestNotifications`, но не в `unreadMessages`/`unreadCount`: карточка в inbox есть, бейдж не растёт.
- Открытый канал: сервис увеличивает счётчик сразу, клиент читает документ round-trip'ом позже, бейдж мигал бы +1/-1 на каждое сообщение. Клиент помечает документ `setDocReading` и вычитает его `min(notifiedMessagesCount, unreadCount)` из `totalUnreadCount` (`publishUnread`, `plugins/notification-resources/src/client.ts`).
- Повторная доставка Kafka-сообщения: `isNotificationRecorded` (`module/notification.ts`) ищет карточку с тем же id в контексте и выходит; для упоминания без `messageId` id генерируется заново на каждый проход, поэтому сравнение идёт по `createdOn`.
- Чужой `TxUpdateDoc<DocNotifyContext>` (не из `serviceTxes`) инвалидирует запись кэша, а не патчит её: это либо эхо записи, пережившей рестарт сервиса, либо чужая правка; перечитать безопаснее, чем накладывать (`updateNotifyContext`, `cache.ts`).
- При удалении сообщения чанк уменьшается только если `author.account !== context.user` (`handleRemoveMessage`): свои сообщения в собственный unread-таймлайн не попадают, и декремент снял бы чужой счётчик.

## Жизненный цикл сервиса

- Партиция читается по порядку, и одна вечно падающая Tx (сломанный воркспейс, транзактор отвечает 500) блокировала бы уведомления всех воркспейсов партиции. Tx, падающая дольше `giveUpAfterMs` = 5 мин, логируется и дропается (`services/notifications/src/index.ts`). По той же причине `pod-notification` после 3 попыток `withRetry` подтверждает сообщение: push при недоступном accounts-сервисе теряется, но партиция идёт дальше.
- Restore/upgrade воркспейса переписывает БД мимо потока Tx, поэтому кэш сервиса устаревает. `Worker.dropWorkspace` ждёт `pendingWorkspaces`-промис (загрузка, начатая до события, иначе закэшировала бы старое состояние уже после дропа), а `Workspace.close()` ждёт `inProgressPromise` текущей Tx (иначе `applyResult` внутри неё упал бы на закрытом pipeline). Consumer `workspace`-топика - своя группа на реплику (`${clientId}-${generateId()}`), чтобы событие дошло до каждой.
- Нерезолвленный отправитель (`getSender`, `cache.ts`) допускается без ретраев и `sleep`: воркспейсы партиции обрабатываются последовательно, любая пауза стопорит все. Компенсация: `isSender` сверяет по `socialId`, клиент рисует имя по `createdBy`.
- Аккаунт ai-bot может появиться после старта сервиса: `getAiBotAccount` (`worker.ts`) ждёт только первый запрос, повторные раз в минуту идут в фоне.
- `getDoc` (`cache.ts`) и `safeGetBaseClass` (`utils/providers.ts`) проверяют `hierarchy.hasClass` до запроса: Tx может ссылаться на mixin или класс, которого в модели воркспейса уже нет, а `findOne` на нём бросает `domain not found` и Tx ретраится вечно.

## Безопасность записи

- Пользовательский апдейт `ReadState` обрезается до ключа `[account.uuid]` в `NotificationMiddleware`, и `TxMixin` на `ReadState`/`DocNotifyContext` запрещён: без этого вместе со своей позицией можно протащить чужую (тесты `server-plugins/notification/src/__tests__/middleware.test.ts`).
- `isTriggerCtx` ставится на время derived-tx и восстанавливается в `finally` (`foundations/server/packages/middleware/src/triggers.ts`). `SessionData` общий на запрос, утёкший флаг давал соседним tx системный доступ к контекстам.

## Доставка и прочее

- Telegram-доставка отключена намеренно: consumer в `services/telegram-bot/pod-telegram-bot/src/start.ts` закомментирован, `QueueTopic.TelegramBot` удалён, продюсера нет. `pod-mail` держит два consumer'а одновременно: legacy `NotificationQueue` (коды, приглашения) и новый `UserNotifications`.
- `LATEST_NOTIFICATIONS_SLICE_SIZE` (5) ограничивает только карточки (`$push.$slice`); размер `unreadMessages` держит чанкование в `plugins/notification/src/collapse.ts` (100 плоских, хвост 20, `mentioned` не схлопываются).
- `hideDelay` в `syncChat` (14 дней) и порог миграции `hide-inactive-chats-v1` совпадают намеренно; старое правило было 7 дней с минимумом 10 видимых DM.
- Тест `plugins/notification-resources/src/__tests__/client.test.ts` мокает `@hcengineering/core` вручную: compiled `lib` реэкспортирует через неконфигурируемые геттеры, `jest.spyOn(getCurrentAccount)` не патчится, а `requireActual` падает на циклическом реимпорте `memdb.ts -> client.ts -> index.ts`.
