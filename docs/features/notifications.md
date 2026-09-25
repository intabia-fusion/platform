# Уведомления

> Сверено с кодом: коммит 94bd827fd9, 2026-09-25.

Всё, что сообщает пользователю о событиях платформы: inbox, бейджи непрочитанного (чат, приложения, другие воркспейсы), in-app и системные push (Web Push/APNs/FCM), email, упоминания, реакции, режимы mute документа. Чат как таковой (каналы, DM, треды, загрузка и чтение сообщений) - в [chat.md](chat.md).

## Картина целиком

Три слоя, между ними Kafka:

```
клиент (браузер/desktop)                 транзактор                         сервисы
------------------------                 ----------                         -------
пишет сообщение, реакцию,   --tx-->   валидирует, пишет в БД,   --topic tx-->   services/notifications:
ReadState, Read/Create-               кладёт Tx в Kafka                         кому, по каким каналам,
NotificationAction                                                              что записать в DocNotifyContext
                                                                                          |
читает DocNotifyContext,    <--live query--  применяет TxApplyIf   <--REST tx--            |
AppPushNotification                          от сервиса                                    | topic user-notifications
                                                                                          v
показывает inbox, бейджи,                                                       pod-notification (push),
тосты, звук; service worker                                                     pod-mail (email)
```

Ключевые решения:

- **Уведомления встроены в контекст.** У аккаунта на каждый документ ровно один `DocNotifyContext`. В нём лежат последние карточки для inbox (`latestNotifications`), непрочитанные записи по типам (`unreadMessages`, `unreadReactions`, `unreadMentions`, `unreadCommons`) и три счётчика. Отдельных документов-уведомлений (`InboxNotification` и наследники) больше нет: меньше строк, один live-запрос на бейдж, одна запись на событие.
- **Контексты пишет сервис, а не транзактор.** Триггеры транзактора больше не решают, кому и как уведомлять. Это делает `services/notifications`, читая поток `Tx` из Kafka. Транзактор только проверяет права записи (`NotificationMiddleware`) и обновляет заголовки/иконки объектов в контекстах.
- **Клиент общается с сервисом через транзиентные документы.** «Я прочитал вот это» - `ReadNotificationAction`, «создай common-уведомление» - `CreateNotificationAction`. Они не сохраняются в БД (`DOMAIN_TRANSIENT`, `broadcastOnly`), а только проходят через Kafka до сервиса.
- **Доставка вовне - через топик `user-notifications`.** Сервис публикует `QueueNotificationMessage`, поды push и mail его потребляют независимо. Транзактор больше не ходит в push-под по HTTP и не шлёт email.

## Словарь

| Термин | Что это |
| --- | --- |
| Контекст | `DocNotifyContext` - подписка аккаунта на документ и всё его непрочитанное |
| Карточка | Элемент `latestNotifications` (`ContextNotification`), то, что рисуется в inbox под заголовком документа. Хранится не больше `LatestNotificationsSliceSize` (5) |
| Unread-запись | Элемент одного из массивов `unread*`. Для сообщений это `UnreadMessageId {id, createdOn, notified?, mentioned?}` либо чанк `UnreadMessageChunk {from, to, count, notifiedCount?}` |
| `unreadCount` | Сколько записей реально попало в inbox: notified-сообщения + реакции + упоминания + commons. Двигает бейдж inbox и суммарный счётчик |
| `unreadMessagesCount` | Все непрочитанные сообщения чата, включая те, что не породили уведомления (mentions-only или muted канал). Число в навигаторе чата |
| `notifiedMessagesCount` | Непрочитанные сообщения, породившие уведомление. Цвет бейджа в навигаторе: `> 0` - красный, иначе серый |
| Провайдер | Канал доставки: `InboxNotificationProvider`, `PushNotificationProvider` (зависит от Inbox), `SoundNotificationProvider` (зависит от Push) в `notification`; `EmailNotificationProvider` в `gmail` |
| Тип уведомления | `NotificationType`: что случилось (сообщение в DM, реакция, приглашение, смена статуса задачи). `MessageNotificationType` - для `ActivityMessage`, `TxNotificationType` - для любых Tx |
| Режим документа | `DocNotificationSetting.mode`: `all` (по умолчанию), `mentions` (только упоминания), `mute` |
| notified | Флаг unread-записи сообщения: было ли по нему уведомление (карточка в inbox, push). В `mentions`/`mute` режимах сообщения копятся без `notified` |

Пример. В канале #general Алиса пишет сообщение, Боб - участник канала и не открывал его. У Боба контекст на #general получает: карточку `MessageNotification` в начало `latestNotifications`, запись `{id, createdOn, notified: true}` в `unreadMessages`, `unreadCount +1`, `unreadMessagesCount = 1`, `notifiedMessagesCount = 1`. Если у Боба #general в режиме `mentions`, карточки и уведомления нет, но `unreadMessages` получает `{id, createdOn}` без `notified`: `unreadCount = 0`, `unreadMessagesCount = 1`, `notifiedMessagesCount = 0` - серая единица в навигаторе, бейджа inbox нет.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| notification | plugins/notification/src | Типы (`types.ts`), интерфейс `NotificationClient`, `collapse.ts` (чанки непрочитанного), `utils.ts` (счётчики, перевод, компакция встроенных сообщений), `serviceWorker.ts` (Web Push) |
| model-notification | models/notification/src | T-классы, домены, индексы, провайдеры, actions, миграции (`migration.ts`, `migrations/*`) |
| notification-resources | plugins/notification-resources/src | `NotificationClientImpl` (`client.ts`), сторы inbox (`stores.ts`), действия (`actions.ts`), in-app push (`appPush.ts`), Web Push подписка (`webpush.ts`), UI inbox и настроек (`components/`) |
| notification-assets | plugins/notification-assets/src | Иконки и переводы |
| server-notification | server-plugins/notification/src | `NotificationMiddleware`: права записи в `ReadState`/`DocNotifyContext`/`AppPushNotification`/`PushSubscription` |
| server-notification-resources | server-plugins/notification-resources/src | Триггеры транзактора над контекстами: `OnDocUpdate` (заголовки/иконки по `triggerFields`), удаление контекстов при удалении документа |
| server-activity | server-plugins/activity/src | Серверные презентеры `TitlePresenter`/`LabelPresenter`/`IdentifierPresenter`/`IconPresenter`/`UrlPresenter` (mixin на класс, `triggerFields`) |
| server-activity-resources | server-plugins/activity-resources/src | `references.ts`: `UserMentionInfo`, ссылки между документами |
| services/notifications | services/notifications/src | Сервис-генератор: `index.ts` (consumer'ы), `worker.ts` (воркспейсы, user-статусы), `workspace.ts` (диспетчер Tx, `applyResult`), `cache.ts`, `module/*` (message, reaction, mention, action, read, tx, notification), `utils/*` (providers, context, display, workspace) |
| pod-notification | services/notification/pod-notification/src | Consumer `user-notifications`: Web Push / APNs / FCM, удаление мёртвых подписок |
| pod-mail | services/mail/pod-mail/src | Consumer `user-notifications` (group `mail-user-notifications`): email по `template` |
| db-migrator | services/db-migrator/migrations/0001..0005 | SQL: колонки и индексы `notification_dnc`, `notification_read_state`, `activity.replies` |
| workbench-resources | plugins/workbench-resources/src | Бейджи приложений (`Applications.svelte`), `crossWorkspaceNotificationStore` |
| desktop | desktop/src/ui/notifications.ts | Нативные тосты Electron, бейдж дока |
| presentation | packages/presentation/src/sound.ts | `playThrottledSound` |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `DocNotifyContext` | Домен `DOMAIN_DOC_NOTIFY` (таблица `notification_dnc`), уникален по `(user, objectId, objectClass)`. Поля: `objectId/objectClass/objectSpace`; отображаемые `objectTitle/objectIdentifier/objectLabel/objectIcon` (чтобы inbox не ходил за объектами); `object?` - частичная копия объекта (для тредов - само сообщение); `parentObject*` (тред -> канал); `lastNotify` (сортировка inbox); `latestNotifications`; `unreadMessages/unreadReactions/unreadMentions/unreadCommons`; `unreadCount/unreadMessagesCount/notifiedMessagesCount` | plugins/notification/src/types.ts; models/notification/src/index.ts |
| `ContextNotification` | `MessageNotification` (встроенное `ActivityMessageLite`, `truncated` если эксцерпт), `ReactionNotification` (сообщение + реакция), `MentionNotification` (markup-эксцерпт), `CommonNotification` (`header`, `messageIntl`, `intlParams`, `icon`) | plugins/notification/src/types.ts |
| `UnreadMessage` | `UnreadMessageId` либо `UnreadMessageChunk`; свыше 100 записей старые схлопываются в чанки | plugins/notification/src/types.ts; plugins/notification/src/collapse.ts |
| `ReadState` | Один на документ (`attachedTo`), домен `DOMAIN_READ_STATE`: `[accountUuid]: {messageId, timestamp}` (позиция чтения каждого) + `latestMessageId/latestMessageTimestamp` (последнее сообщение документа, ведёт сервис) | plugins/notification/src/types.ts |
| `ReadNotificationAction` | Команда клиента «прочитано»: `attachedTo`, `attachedToClass`, `account`, списки `reactionIds/messageIds/commonIds/mentionIds`. `DOMAIN_TRANSIENT`, `broadcastOnly`, create - роль `Guest` | models/notification/src/index.ts |
| `CreateNotificationAction` | Команда «создай common-уведомление» для сервисов и триггеров: `attachedTo`, `account`, `type?`, `notification: CommonNotificationLite`, `intl?`. create - роль `Admin` | models/notification/src/index.ts |
| `AppPushNotification` | Push для клиента: `account`, `onClickLocation`, `tag` (= id карточки), `messageId`, `titleIntl/bodyIntl/intlParams`, `soundAlert`. Клиент удаляет после показа | plugins/notification/src/types.ts |
| `PushSubscription` / `PushSubscriptionSetting` | Подписка браузера/устройства (`endpoint`, `keys`, `name` = user agent) и её включённость | plugins/notification/src/types.ts |
| `DocNotificationSetting` | Preference: режим документа для аккаунта | plugins/notification/src/types.ts |
| `NotificationAppearancePreference` | `showChatBadge` | plugins/notification/src/types.ts |
| `NotificationType` и наследники | `defaultEnabled`, `notifyAuthor`, `isMention`, `templates` (email), `priority`, `notificationMessage`; `MessageNotificationType`: `messageClass`, `attachedToClass`, `field`, `match`; `TxNotificationType`: `txClasses`, `field`, `attrTypes`, `match`, `attachToParent` | plugins/notification/src/types.ts |
| `NotificationProvider` | `defaultEnabled`, `canDisable` (Inbox нельзя выключить), `depends` (Push -> Inbox, Sound -> Push), `order` | models/notification/src/index.ts |
| `NotificationProviderDefaults` | Для провайдера: `ignoredTypes` (тип запрещён), `enabledTypes` (тип включён поверх `type.defaultEnabled`) | plugins/notification/src/types.ts |
| `NotificationProviderSetting` / `NotificationTypeSetting` | Пользовательские тумблеры: провайдер целиком; пара тип + провайдер | plugins/notification/src/types.ts |
| `QueueNotificationMessage` | Сообщение топика `user-notifications`: `id`, `title/body` (уже переведены), `account`, `language`, `url/domain`, `template? {subject, text, html}`, `pushSubscriptions`, `providers: {provider -> typeIds}`, `objectId/objectClass/objectSpace` | plugins/notification/src/types.ts |
| `WorkspacesNotification` | Кросс-воркспейс «есть непрочитанное» по аккаунту (pulse) | plugins/pulse/src/types.ts |
| `InboxNotification*` | Только заглушки `as any` для миграций старых данных; в рантайме не создаются | models/notification/src/index.ts; models/notification/src/migrations/types.ts |

## Как работает

### 1. Путь сообщения: от Tx до карточки в inbox

1. Транзактор сохраняет `TxCreateDoc<ChatMessage>` и кладёт её в Kafka-топик `tx` (`QueueMiddleware.handleBroadcast`, foundations/server/packages/middleware/src/queue.ts). Для `TxRemoveDoc` туда же подставляется `removedDoc` из `removedMap` - потребитель видит документ, которого в БД уже нет.
2. `services/notifications/src/index.ts` читает топик одной consumer-group на сервис (реплики делят партиции). `Worker.tx` (worker.ts): если воркспейс ещё не загружен и класс Tx не триггерный (`isTxTrigger`: `ReadState`, `ActivityMessage`, `Reaction`, `ReadNotificationAction`, `CreateNotificationAction`, плюс `objectClass` всех `TxNotificationType`), Tx пропускается без загрузки воркспейса. Иначе поднимается `Workspace` (workspace.ts): мини-pipeline поверх БД без триггеров (`disableTriggers: true`), `RestClient` к транзактору, модель через `client.getModel`.
3. `Workspace.tx` вызывает по очереди `module/action.ts` (для `*NotificationAction`), `module/read.ts` (для `ReadState`), затем, если `tx.meta.silent !== true`, `module/tx.ts` (`handleTxNotification` - tx-типы, реакции, упоминания) и `module/message.ts` (`handleMessage` - для `ActivityMessage`). Все они складывают результат в `Result`: `createContextTx`, `updateContextTx`, `createAppPushNotificationTx`, `queueMessages` и т.д.
4. `handleCreateMessage` (module/message.ts): находит документ и его пространство; двигает `ReadState.latestMessageId/latestMessageTimestamp` (`trackLatestMessage`); собирает коллабораторов документа (`cache.getCollaborators` + `getCollaboratorAccounts`, utils/misc.ts: приватное пространство ограничивает членами, employee - коллаборатор своего документа); `cache.getReceivers` превращает аккаунты в `Receiver` (employee, socialIds, язык, online) и **исключает** `systemAccountUuid` и аккаунт ai-bot.
5. Для каждого получателя, кроме автора (`isSender`): режим документа `getMode` (utils/context.ts); если не `mute` - `getMessageNotifyProviders` (см. п.2); `alreadyRead = ReadState[account].timestamp >= createdOn`. Дальше три исхода: есть Inbox-провайдер -> `pushNotification` (карточка, unread-запись если не `alreadyRead`, push/email); Inbox-провайдера нет, но не прочитано -> `addUnreadMessage` (только `unreadMessages` без `notified`); прочитано и без провайдера -> ничего.
6. `pushNotification` (module/notification.ts) - единая точка записи для сообщений, реакций, упоминаний и commons. Сначала `isNotificationRecorded`: если карточка с таким id уже в контексте, это повторная доставка Kafka - выход. Затем `QueueNotificationMessage` (title/body через `translateNotification` на языке получателя, `url` - deep link на контекст/сообщение, `template` - email-шаблон типа через `getTemplate`, если у типа есть `templates`). Затем контекст:
   - существует -> `TxUpdateDoc`: `lastNotify = max(...)`, `$push {latestNotifications: {$each: [карточка], $position: 0, $slice: 5}}`; если есть unread-запись - `$inc {unreadCount: 1}` и `$push` в нужный массив (для сообщений `appendAndCollapseUnreadMessages` может вернуть схлопнутый массив, тогда `unreadMessages` заменяется целиком);
   - не существует -> `getCreateContextTx` (utils/context.ts) с отображаемыми полями из презентеров (`getObjectDisplayData`, utils/display.ts), в атрибуты которого дописываются карточка и unread.
   Если среди провайдеров есть Push - `createAppPushNotification`: `AppPushNotification` в `PersonSpace` получателя с `onClickLocation` (`getNotificationLocation`) и `soundAlert` при Sound-провайдере.
7. В конце `Workspace.tx`: `tx.meta.inboxOnly === true` (так помечает свои сообщения ai-bot) обнуляет `queueMessages` и app-push, оставляя только inbox; `setUnreadMessagesCounts` (utils/context.ts) пересчитывает `unreadMessagesCount`/`notifiedMessagesCount` по итоговому состоянию контекста (кэш или `findOne`) с реплеем всех накопленных операций; `applyResult` шлёт Tx батчами по `ApplyTxBatchSize` (100) одним `TxApplyIf` от `core.space.DerivedTx` на транзактор с 4 попытками при транзиентных ошибках, зеркалит их в кэш и публикует `queueMessages` в `user-notifications`.
8. Клиент получает `TxUpdateDoc<DocNotifyContext>` через live-запросы и обновляет inbox, бейджи и `AppPushNotification` (см. п.6-8).

### 2. Кто получает и по каким каналам

- **Получатели** - коллабораторы документа (`core.class.Collaborator`). Для `DocUpdateMessage` о добавлении коллаборатора добавляется и он сам. Отправитель никогда не получает уведомление о своём сообщении.
- **Типы**: для сообщения берутся все `MessageNotificationType`, чьи `messageClass`/`objectClass`/`attachedToClass`/`field`/`match` совпали (`getMatchedMessageTypes`, utils/providers.ts), в порядке `priority`. Для чата это `DMNotification`, `ChannelNotification`, `ThreadNotification`, `JoinChannelNotification` (models/chunter/src/notifications.ts). Для остальных Tx - `TxNotificationType` через `isMatchedTxType` (класс Tx, `attachedToClass`, `objectClass`, `field`, `attrTypes`, `match`).
- **Фильтры по типу** (`resolveNotifyProviders`): режим `mute` отсекает всё; тип без `notifyAuthor` не идёт автору Tx; режим `mentions` пропускает только `isMention`; mixin `serverNotification.mixin.TypeMatch` с ресурсом `match` может дополнительно отсеять по получателю (например, ToDo при закрытии задачи).
- **Провайдер включён?** `isTypeAllowed`, строго по порядку:
  1. `NotificationProviderSetting` пользователя на провайдер: все выключены -> нет; настроек нет и `provider.defaultEnabled` false -> нет.
  2. `NotificationProviderDefaults.ignoredTypes` содержит тип -> нет.
  3. `NotificationTypeSetting` пользователя на пару тип+провайдер -> его `enabled`, дальше не смотрим.
  4. `NotificationProviderDefaults.enabledTypes` содержит тип -> да.
  5. Иначе `type.defaultEnabled`.

  Пример: у чат-типов `defaultEnabled: false`, но они перечислены в `enabledTypes` дефолтов Inbox/Push/Sound, поэтому сообщения в DM уведомляют всех, пока пользователь не выключит тип или провайдер в настройках.
- Список провайдеров, которые сервис вообще рассматривает, ограничивает env `NOTIFICATION_PROVIDERS` (`all` по умолчанию). Итог - карта `provider -> типы`; первый тип Inbox-провайдера задаёт текст карточки и email-шаблон.

### 3. Права записи в транзакторе

`NotificationMiddleware` (server-plugins/notification/src/middleware.ts) - единственная защита данных, которые пишет сервис:

- `DocNotifyContext` create/update, `AppPushNotification` create/update, `ReadState` create/remove - только системный аккаунт или `ctx.contextData.isTriggerCtx` (`isSystemAccess`). `TxRemoveDoc<DocNotifyContext>` разрешён владельцу (отписка из inbox).
- `ReadState` update от пользователя: `operations` обрезаются до ключа `[account.uuid]`, обязательны `timestamp` и `messageId`; если сохранённый `timestamp` новее - Tx не отклоняется, а пропускается (`skip`). При первом `ThreadMessage` middleware сам создаёт `ReadState` треда через `derived.tx`.
- `PushSubscription`: создать/обновить - только со своим `user`, удалить - только свою.
- Любой `TxMixin` на эти классы от пользователя - `Forbidden`.
- `TriggersMiddleware.processDerivedTxes` (foundations/server/packages/middleware/src/triggers.ts) выставляет `isTriggerCtx = true` на время derived-tx и восстанавливает в `finally` - так триггеры транзактора (обновление заголовков, `ReadState` треда) проходят проверку, а пользовательские Tx нет.

### 4. Чтение

Три способа снять непрочитанное, все сходятся в сервисе:

- **Позиция чтения (чат).** Клиент пишет `ReadState[me] = {messageId, timestamp}` (`readMessages`, plugins/chunter-resources/src/scroll.ts, или `forceReadDocState`, plugins/notification-resources/src/client.ts). `module/read.ts` `handleReadState` для каждого аккаунта в `operations` вызывает `readContext`: `$pull` всех `UnreadMessageId` с `createdOn <= timestamp` и чанков с `to <= timestamp`, `$inc unreadCount` на минус число `notified` (для чанков - `notifiedCount`). Ненотифицированные записи уменьшают только `unreadMessagesCount`.
- **Явные списки.** Клиент создаёт `ReadNotificationAction` с id: `readDoc`/`readNotificationsWithoutMessage` (mentions и commons при открытии документа или выборе в inbox), `readAll`, а чат - с `reactionIds` сообщений, попавших во вьюпорт. `module/action.ts` `handleReadNotificationAction`: проверяет, что `tx.modifiedBy` соответствует `action.account`, `$pull` перечисленное из `unread*`, для `messageIds` при наличии чанков считает `maxTs` и снимает чанки с `to <= maxTs`.
- **Открытие документа.** `EditDoc.svelte` и панели `Edit*` плагинов вызывают `readDoc` при уходе с документа; inbox - при выборе контекста (`updateSelectedPanel`, Inbox.svelte: для чат-каналов только `readNotificationsWithoutMessage`, сообщения читает сам чат).

Пока клиент ждёт, что сервер обработает чтение, счётчики на клиенте «врут». Поэтому открытый и досмотренный до низа канал помечается `setDocReading(doc, true, reader)`, и `publishUnread` (client.ts) вычитает его `min(notifiedMessagesCount, unreadCount)` из `totalUnreadCount` и убирает из `unreadByDoc`.

### 5. Доставка push и email

Топик `user-notifications` (`QueueTopic.UserNotifications`, 10 партиций, foundations/server/packages/kafka/src/index.ts). Каждое сообщение несёт `providers`, и каждый под сам решает, его ли это:

- **pod-notification** (services/notification/pod-notification/src/main.ts): берёт сообщения с `providers[PushNotificationProvider]`. `sendPushToSubscription` для каждой подписки выбирает транспорт по `endpoint` (`pushTarget`, mobile.ts: `apns://token`, `fcm://token`, иначе Web Push с `Urgency: high`, `TTL`). Подписка считается мёртвой при 404/410 или телах `expired`/`Unregistered`/`No such subscription`/`VapidPkHashMismatch` (Web Push), 410/`BadDeviceToken`/`DeviceTokenNotForTopic` (APNs), 404/`UNREGISTERED`/`INVALID_ARGUMENT` (FCM); такие удаляются через `createRestClient(...).removeDoc(PushSubscription)` под системным токеном. Вся обработка в `withRetry` (3 попытки, бэкофф до 5 с), после чего сообщение подтверждается, чтобы не блокировать партицию. HTTP-порта у пода нет. APNs получает alert-push, не silent (iOS троттлит silent); токен APNs кэшируется 40 минут.
- **pod-mail** (services/mail/pod-mail/src/notification.ts, `createUserNotificationsHandler`, group `mail-user-notifications`): берёт сообщения с `template` и `gmail.providers.EmailNotificationProvider`; email - первый подтверждённый `EMAIL`/`GOOGLE` social id аккаунта из `getPersonInfo`; html оборачивается в `wrapWithHtmlCard(html, APP_NAME)`; дальше `MailClient.sendMessage` (SMTP/SES) или форвард клиентам в режиме `server`. `withoutBlockedRecipients` (utils.ts) выкидывает адреса из `BLOCKED_RECIPIENTS` (по умолчанию email ai-bot) и не шлёт письмо без получателей. Старый consumer `NotificationQueue` (`AccountNotification`: коды, приглашения) работает параллельно.
- **Telegram** - отключён: consumer в services/telegram-bot/pod-telegram-bot/src/start.ts закомментирован, `QueueTopic.TelegramBot` удалён, продюсера нет.

### 6. Push на клиенте

- `appPush.ts` (plugins/notification-resources/src) при старте пробует системный push: на мобильном не подписывается вовсе; если Web Push уже разрешён или `subscribePush()` вернул `success` - live-запрос `AppPushNotification` не держится (системный push покроет). Иначе `appPushStore` получает новые записи.
- `subscribePush` (webpush.ts): регистрирует `/serviceWorker.js` со scope воркспейса, `Notification.requestPermission`, `PushManager.subscribe` с VAPID-ключом `notification.metadata.PushPublicKey`, создаёт `PushSubscription`.
- `AppNotificator.svelte`: на каждую запись `appPushStore` (кроме мобильного и desktop с включённым системным push) проверяет, что документ не открыт в текущей локации или сайдбаре, переводит `titleIntl/bodyIntl` и показывает тост через `addNotification`; `Notification.svelte` при `soundAlert` играет `playThrottledSound`; запись удаляется `removeAppPush` (гость не удаляет).
- Desktop (desktop/src/ui/notifications.ts): `electronAPI.sendNotification` по `appPushStore` с учётом `preferences.showNotifications/playSound/bounceAppIcon`; бейдж дока по `totalUnreadCount` (`updateBadge`), при нуле и наличии кросс-воркспейс непрочитанного - точка.
- Service worker (plugins/notification/src/serviceWorker.ts): на `push` показывает уведомление с `tag` и `data {domain, url, notificationId}`; на клик ищет вкладку с тем же путём, иначе тем же origin, шлёт `postMessage({type: 'notification-click', url, _id})` и фокусирует, без вкладки - `openWindow`. Вкладка (`addWorkerListener`, webpush.ts) делает `navigate` по url и `cleanTag` - удаляет `AppPushNotification` с этим `tag`.

### 7. Inbox

- **Лента**: `updateInboxContexts` (plugins/notification-resources/src/stores.ts) - live-запрос `DocNotifyContext {user, lastNotify: {$gt: 0}}` (+ `unreadCount: {$gt: 0}` для фильтра Unreads, + `objectClass` для вкладки), сортировка `lastNotify desc`, `limit + 1` - если пришло больше `limit`, `hasInboxNextPageStore = true`. `Inbox.svelte`: стартовый `limit` 20, +20 при подскролле к низу; выбранный контекст подгружается отдельно, если он вне страницы или фильтра.
- **Вкладки** (`InboxHeader.svelte`): по множеству `objectClass` контекстов (запрос с проекцией); все `ActivityMessage`-производные сводятся в одну вкладку Threads (`messagesTab`); остальные - `pluralLabel` класса; плюс All. Там же фильтр `all | unread` и меню Read all / Clear all (`InboxMenuButton.svelte`).
- **Карточка** `DocNotifyContextCard.svelte`: `DocNotifyContextCardHeader.svelte` (иконка/заголовок из `objectIcon/objectTitle`, для тредов родитель `parentObject*`, чекбокс, кнопка clear) и `DocNotifyContextCardContent.svelte` - первые 3 `latestNotifications` через `inbox/NotificationPresenter.svelte`, который по `type` выбирает `Message/Reaction/Mention/CommonNotificationPresenter.svelte` (для сообщений сначала ищется `ActivityNotificationViewlet` по `messageMatch`).
- **Список** `InboxGroupedListView.svelte`: клавиатура (стрелки, Home/End, Backspace/Delete = удалить контекст), `removeContext` -> `removeDocNotifyContext` (actions.ts: `removeDoc` + `forceReadDocState`).
- **Массовые действия** (client.ts, одним `client.apply`): `readAll` - по каждому контексту с `unreadCount > 0` `ReadNotificationAction` для реакций/упоминаний/commons + `forceReadDocState`; `clearAll` - `removeDoc` всех контекстов + `forceReadDocState` (сервис создаст контекст заново при следующем событии, подписка не теряется). Флаги `readingAllInbox`/`clearingAllInbox` блокируют друг друга и показывают лоадер.
- **Переход по карточке**: `resolveLocation`/`navigateToInboxDoc` (utils.ts) - путь `[workbench, ws, inbox, contextId, objectId|class, thread?]` + `query.message`.

### 8. Бейджи

- `NotificationClientImpl` держит два live-запроса с проекцией (`objectId, objectClass, unreadCount, unreadMessagesCount, notifiedMessagesCount, modifiedOn`): `unreadCount > 0` и `unreadMessagesCount > 0`. Из них `unreadByDoc` (объединение) и `totalUnreadCount` (сумма `unreadCount`) с поправкой на читаемые документы (п.4).
- **Приложения**: `Applications.svelte` по каждому приложению вызывает ресурс `showNotifyMarkerFn(unreadCount, preference)` (`plugins/workbench/src/types.ts`); у чата (plugins/chunter-resources/src/index.ts) маркер зависит от `showChatBadge` и `notifiedMessagesCount`; inbox - от `totalUnreadCount`. `SpacesNav`/`StarredNav` подсвечивают пространства с `unreadCount > 0`.
- **Навигатор чата**: число `unreadMessagesCount`, цвет по `notifiedMessagesCount` (ChatNavItem.svelte), см. chat.md.
- **Кросс-воркспейс**: `Worker.updateUserNotifyStatus` (services/notifications/src/worker.ts) на каждую Tx над `DocNotifyContext` вычисляет `hasUnread` владельца (по `unreadCount` в операции либо `findOne` с `unreadCount > 0`), копит в `pendingStatusUpdates` и раз в секунду батчами по 25 шлёт `userEvents.notifyStatusChanged({user, hasUnread})` в `QueueTopic.Users`; неудачные оставляет на следующий тик. Account-сервис хранит статусы и раздаёт `WorkspacesNotification`, которую `NotificationMiddleware` переносит в `PersonSpace` получателя; клиент читает `crossWorkspaceNotificationStore` (plugins/workbench-resources/src/workbench.ts) для логотипа, меню воркспейсов и desktop-точки. Ai-bot и system исключены.

### 9. Упоминания, реакции, common-уведомления

- **Упоминания** (module/mention.ts, из `handleTxNotification` при совпадении `MentionNotificationType`): `createMentionsData` извлекает ссылки из markup и collaborative-полей Tx (`extractReferences`), сверяет с `UserMentionInfo` (семантическое сравнение markup, а не строк): новые - уведомить, пропавшие - удалить упоминание и снять его `unreadMentions`/флаг `mentioned`. `@everyone`/`@here` разворачиваются в коллабораторов пространства (`here` - только online), один получатель - одно уведомление. Упоминание в `ActivityMessage` пишется в `unreadMessages` с `mentioned: true, notified: true` (чанки его обходят), вне сообщения - в `unreadMentions {id}`. Markup длиннее `EMBEDDED_MARKUP_LIMIT` (4096) сохраняется эксцерптом `EMBEDDED_EXCERPT_LENGTH` (1024).
- **Реакции** (module/reaction.ts): уведомляется только автор сообщения, не сам поставивший; тип `activity.ids.AddReactionNotification`; unread-запись `{id, attachedTo}` в `unreadReactions`; удаление реакции снимает её и карточку.
- **Common-уведомления** (`CreateNotificationAction` -> `handleCreateNotificationAction`, module/action.ts): создают calendar-mailer (встречи), export (готов/ошибка), github (с дедупом по `latestNotifications` через `isSameProps`), love (`createInviteNotificationTxs`: приглашение или knock). Сервис строит `CommonNotification` с `header`/`icon`/`messageIntl`, провайдеры - по `type` (или все Inbox-типы объекта). Общий read-only гость (`readOnlyGuestAccountUuid`) получает карточку без unread.
- **Прочие `TxNotificationType`** (запросы, ToDo, статусы) - `module/tx.ts`: для каждого получателя `getTxNotifyProviders`, mixin `TypeMatch` с ресурсом `create` формирует `CommonNotification`; `attachToParent` группирует коллабораторов по родителю.

### 10. Отображаемые поля контекста

Inbox не запрашивает объекты: заголовок, идентификатор, метку класса и иконку сервис кладёт в контекст при создании (`getObjectDisplayData`, services/notifications/src/utils/display.ts) через серверные презентеры-mixin'ы `TitlePresenter`/`IdentifierPresenter`/`LabelPresenter`/`IconPresenter`/`UrlPresenter` (server-plugins/activity/src/types.ts), с кэшем в `TxCache` (персонализированные презентеры - по паре doc+account). Для тредов заполняются `parentObject*` и `object` (само сообщение). Когда объект меняется, триггер `OnDocUpdate` (server-plugins/notification-resources/src/index.ts) сравнивает изменённые ключи с `triggerFields` презентера и переписывает поля во всех контекстах документа. Презентеры регистрируются в `models/server-*/src/index.ts`: `builder.mixin(Class, core.class.Class, serverActivity.mixin.TitlePresenter, {presenter, triggerFields})`.

### 11. Сервис: кэш, жизненный цикл, ошибки

- `WorkspaceCache` (services/notifications/src/cache.ts): LRU по 1000 на коллабораторов, контексты, документы, настройки документов, `ReadState`, персоны, `PersonSpace`, employee, social ids, подписки; настройки провайдеров/типов и `UserStatus` - без лимита. Обновляется по входящим Tx; свои Tx помечены в `serviceTxes` (LRU 10000), чтобы эхо не применялось дважды; чужой апдейт контекста инвалидирует запись. Tx старше кэшированного `modifiedOn` игнорируется.
- Второй consumer `workspace`-топика (своя группа `${clientId}-${generateId()}` на реплику): `Restored`/`Upgraded`/`Deleted` -> `Worker.dropWorkspace` (ждёт идущую загрузку) -> `Workspace.close()` (ждёт текущую Tx). Неактивные 5 минут воркспейсы закрываются.
- Tx, падающая дольше `giveUpAfterMs` (5 минут), логируется и дропается. Нетранзиентная ошибка `TxApplyIf` - батч дропается, кэш контекстов сбрасывается; транзиентная - Tx уходит на повтор.
- `getWorkspaceInfo` (utils/workspace.ts) ретраит `ECONNRESET`/`ECONNREFUSED`/`ENOTFOUND`; отключённый воркспейс - не загружается; `Forbidden`/`WorkspaceNotFound` - «удалён», без повторов. Аккаунт ai-bot резолвится раз в минуту в фоне, ждём только первый запрос.

## Фичи

### Модель и сервер

- **Embedded-контексты** (модель выше). SQL: services/db-migrator/migrations/0001_reworkNotifications.sql - колонки `objectSpace/lastNotify/unreadCount/parentObject*`, уникальный индекс `(workspaceId, user, objectId, objectClass)`, индексы под inbox (`user, lastNotify desc`), бейджи (частичные `WHERE unreadCount > 0`, `unreadMessagesCount > 0`, `notifiedMessagesCount > 0`), вкладки (`user, objectClass`), fan-out по документу и родителю; `notification_read_state.latestMessageId/latestMessageTimestamp`.
- **Три счётчика** - словарь выше; `setUnreadMessagesCounts`, services/notifications/src/utils/context.ts; SQL 0003/0004.
- **Чанки непрочитанного.** До `UNREAD_MESSAGES_FLAT_LIMIT=100` - плоский список; выше - старые схлопываются чанками `getChunkSize` (10/20/30/50/100 по числу кандидатов), последние `UNREAD_MESSAGES_TAIL=20` остаются, `mentioned` не схлопываются. - plugins/notification/src/collapse.ts.
- **Компакция встроенных сообщений.** `DocUpdateMessage` с markup-атрибутом - плейсхолдер вместо текста; чат-сообщение длиннее 4096 символов JSON - эксцерпт 1024 с сохранением структуры markup. - `compactNotificationMessage`/`excerptMarkup`, plugins/notification/src/utils.ts.
- **Правка и удаление сообщения.** `handleUpdateMessage` обновляет встроенную копию в карточках через `$update {latestNotifications: {$query, $update}}` (отдельно для `message` и `mention` записей одного сообщения) и `object` тредовых контекстов; `handleRemoveMessage` снимает карточку и unread-запись (или уменьшает чанк), чистит реакции, `restoreLatestNotifications` подтягивает следующие `notified` id в карточки. - services/notifications/src/module/message.ts.
- **Идемпотентность.** `isNotificationRecorded`; `unreadCount` защищён от ухода ниже нуля. - module/notification.ts; utils/context.ts.
- **Операторы ядра.** `$push` с `$slice`/`$position`, `$pull` с `$in`, `$update` с `$query`, `TxRemoveDoc.removedDoc`. - foundations/core/packages/core/src/{operator,tx}.ts; foundations/server/packages/middleware/src/queue.ts.
- **Валидация записи.** `NotificationMiddleware` (п.3). - server-plugins/notification/src/middleware.ts.
- **Серверные презентеры с `triggerFields`** (п.10). - server-plugins/activity/src; server-plugins/notification-resources/src/index.ts.
- **Кросс-воркспейс статус** (п.8). - services/notifications/src/worker.ts; docs/memory/presence-fanout.md.
- **Транзактор не шлёт push/email.** Удалены `server-plugins/notification-resources/src/push.ts`, email-триггеры `gmail-resources`, telegram-триггеры и `QueueTopic.TelegramBot`.

### Клиент

- **`NotificationClientImpl`.** Сторы `contextByDoc/contextById/readStateByDoc/docSettingByDoc` (нет ключа - не спрашивали; `null` - нет или запрос в полёте), запросы одного тика склеиваются в один `$in`; tx-listener патчит `DocNotifyContext`/`ReadState` локально через `TxProcessor.updateDoc2Doc`. Методы `readDoc`, `forceReadDoc` (добавит `Collaborator`, если контекста нет), `forceReadDocState`, `readNotificationsWithoutMessage`, `readAll`, `clearAll`, `setDocReading`, `getContextByDoc`/`getContextsById`. - plugins/notification-resources/src/client.ts.
- **Inbox UI** (п.7). - plugins/notification-resources/src/components/inbox, components/DocNotifyContextCard*.svelte, LoadingHistory.svelte.
- **Actions.** `ReadNotifyContext`, `RemoveDocNotifyContext`, `Unsubscribe` (снять себя из коллабораторов), `ClearAll`, `ReadAll`, `EditDocNotifications` (`MutePopup.svelte`: all/mentions/mute -> `DocNotificationSetting`; видим только коллаборатору). - models/notification/src/actions.ts; plugins/notification-resources/src/actions.ts.
- **Настройки.** `NotificationSettings.svelte` (группы типов, скрывает пустые), `GeneralPreferencesGroup.svelte` + `ProviderPreferences.svelte` (провайдеры; включение зависимого включает родителя, выключение родителя гасит зависимых), `NotificationGroupSetting.svelte` (тип x провайдер), `WebpushesPreferencesPresenter.svelte` (подписки устройств), `NotificationAppearancePreferencesPresenter.svelte` (`showChatBadge`). - plugins/notification-resources/src/components/settings.
- **Открытие документа = прочитано.** - plugins/view-resources/src/components/EditDoc.svelte и `Edit*` панели плагинов.
- **Звук.** `playThrottledSound`: не чаще раза в `THROTTLE_WINDOW_MS=15000`, при `THROTTLE_MAX_PENDING=5` отложенных - сразу; `AudioContext` закрывается при нуле активных воспроизведений (иначе на iOS мешает CarPlay и звонку). - packages/presentation/src/sound.ts.
- **Фокус окна.** `isAppFocusedStore` по `focus/blur` окна, а не `document.hasFocus()` в момент события. - packages/ui/src/components/internal/Root.svelte.
- **Кэш объектов для карточек активности.** `objectCache.ts`: батч-поиск по id/классу, `maxSize=50`, любая не-create Tx инвалидирует запись. - plugins/activity-resources/src/objectCache.ts.
- **Deep-link из inbox/push.** `resolveLocation`/`navigateToInboxDoc`/`selectInboxContext`. - plugins/notification-resources/src/utils.ts.

### Миграции

Оператор `notificationOperation` (models/notification/src/migration.ts). Ключевые состояния в порядке выполнения и зачем каждое:

1. `init-read-states-latest-messages-v6` - у каждого `ReadState` заполнить `latestMessageId/latestMessageTimestamp` по последнему сообщению документа (нужно `syncChat` и вьюпорту чата). - migrations/readState.ts.
2. `update-read-states-from-contexts-v6` - перенести старую позицию `DocNotifyContext.lastView` в `ReadState[user]`. - migrations/readState.ts.
3. `migrate-doc-notify-context-settings-v1` - старый `context.settings.mode` -> отдельный `DocNotificationSetting`, чтобы пустые контексты можно было удалять без потери mute. - migrations/settings.ts.
4. `remove-archived-contexts-v6`, `remove-archived-notifications-v6`, `remove-empty-contexts-v6` - убрать архивные и пустые перед встраиванием (уникальный индекс не терпит дублей). - migrations/clear.ts.
5. `migrate-notifications-to-embedded-v6` - по 500 контекстов, чанками по 100: собрать старые `InboxNotification*` контекста, реакции, вложения, объект и родителя; восстановить `objectTitle/…` class-specific fallback'ами; непрочитанные -> `unread*` (все `notified: true`) с `collapseUnreadMessages`; 5 последних -> `latestNotifications`; счётчики; контексты без объекта удалить; старые документы удалить. - migrations/migrateNotificationsToEmbedded.ts.
6. `hide-inactive-chats-v1` - разово скрыть чаты без сообщений 2 недели и без notified-непрочитанного (то же правило, что `syncChat`). - migration.ts.
7. `init-badge-statuses-v1` - пересчитать кросс-воркспейс статусы в account-сервис батчами. - migration.ts.

SQL (services/db-migrator/migrations): `0001_reworkNotifications.sql` (колонки, дедуп контекстов, индексы, `notification_read_state`, `activity` индекс), `0002_dropOversizedDncIndexes.sql` (старые covering-индексы с `INCLUDE data` после встраивания превышали лимит btree-строки 2704 байт и ломали запись), `0003_unreadMessagesCount.sql`, `0004_notifiedMessagesCount.sql`, `0005_activityReplies.sql`. `EXPECTED_SCHEMA_VERSION` = 15 (foundations/server/packages/postgres/src/version.ts); SQL-миграция без повышения версии не применится. `applyMigration` (services/db-migrator/src/db.ts) теперь не помечает упавшую миграцию применённой; `getTableSchema` логирует, если у таблицы нет объявленной в `schemas.ts` колонки.

## Куда смотреть, если нужно...

- Добавить тип уведомления -> `TxNotificationType`/`MessageNotificationType` в `models/<x>/src`, дефолты в `NotificationProviderDefaults`; матчинг - `isMatchedTxType`/`isMessageTypeMatched`, services/notifications/src/utils/providers.ts; чат - models/chunter/src/notifications.ts.
- Поменять, кто получает уведомление о сообщении -> `handleCreateMessage`, services/notifications/src/module/message.ts; `getCollaboratorAccounts` (utils/misc.ts), `getReceivers` (cache.ts).
- Изменить правило «провайдер включён» -> `isTypeAllowed`/`resolveNotifyProviders`, services/notifications/src/utils/providers.ts.
- Поменять содержимое карточки -> `toNotificationMessage` (utils/misc.ts), `compactNotificationMessage` (plugins/notification/src/utils.ts); текст push - `getMessageIntl` (module/message.ts).
- Изменить чанкование непрочитанного -> plugins/notification/src/collapse.ts; чтение чанков - `readContext` (module/read.ts), `handleReadNotificationAction` (module/action.ts).
- Создать уведомление из сервиса/триггера -> `TxCreateDoc<CreateNotificationAction>` (пример: services/export/pod-export/src/notifications.ts).
- Изменить текст/локализацию push и email -> `translateNotification` (plugins/notification/src/utils.ts), `getTemplate`/`translateTemplate` (module/notification.ts), `templates` типа; html-обёртка письма - `wrapWithHtmlCard`, services/mail/pod-mail/src/notification.ts.
- Добавить транспорт push -> `pushTarget`, services/notification/pod-notification/src/mobile.ts.
- Поменять права записи в контексты/ReadState -> `NotificationMiddleware`, server-plugins/notification/src/middleware.ts.
- Обновлять заголовок контекста при изменении поля -> `triggerFields` презентера в `models/server-<x>/src/index.ts`; `OnDocUpdate`, server-plugins/notification-resources/src/index.ts.
- Изменить ленту inbox -> plugins/notification-resources/src/stores.ts, components/inbox/{Inbox,InboxHeader,InboxGroupedListView}.svelte.
- Поменять бейджи -> `publishUnread` (client.ts), `Applications.svelte`, `updateUserNotifyStatus` (services/notifications/src/worker.ts), desktop/src/ui/notifications.ts.
- Web Push подписка/клик -> plugins/notification-resources/src/webpush.ts, plugins/notification/src/serviceWorker.ts.
- Включить Telegram-доставку -> services/telegram-bot/pod-telegram-bot/src/{start,worker}.ts (закомментированный consumer; топика и продюсера пока нет).
- Отладить «уведомление не пришло» -> логи `services/notifications` (`No receivers resolved`, `notification already recorded`, `Tx batch rejected`), затем `providers` в сообщении топика `user-notifications`, затем логи пода.

## Настройки и конфигурация

- `services/notifications` (services/notifications/src/config.ts): обязательные `QUEUE_CONFIG`, `QUEUE_REGION`, `ACCOUNTS_URL`, `STORAGE_CONFIG`, `DB_URL`, `FRONT_URL`; `SECRET` (default `secret`), `SERVICE_ID` (`notifications`), `NOTIFICATION_PROVIDERS` (`all` или список id), `APPLY_TX_BATCH_SIZE` (100), `LATEST_NOTIFICATIONS_SLICE_SIZE` (5), `BRANDING_PATH`, `EXTERNAL_REGIONS`, `MODEL_JSON`.
- `pod-notification` (services/notification/pod-notification/src/config.ts): обязательные `SOURCE`, `ACCOUNTS_URL`, `SECRET`; `QUEUE_CONFIG`/`QUEUE_REGION`, `SERVICE_ID` (`web-push-service`), `TTL` (86400 с), VAPID `PUSH_PUBLIC_KEY`/`PUSH_PRIVATE_KEY`/`PUSH_SUBJECT`, APNs `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_KEY`/`APNS_TOPIC`/`APNS_PRODUCTION`, `FCM_SERVICE_ACCOUNT`. Без ключей APNs/FCM соответствующие подписки пропускаются. В dev/docker-compose.yaml `PORT` убран, добавлены `depends_on: redpanda, account`.
- `pod-mail` (services/mail/pod-mail/src/config.ts): для consumer'а нужны `ACCOUNTS_URL`, `SECRET`, `SERVICE_ID` (`mail-service`; в account-сервисе разрешён рядом с `huly-mail`), `APP_NAME`; `BLOCKED_RECIPIENTS` (default email ai-bot).
- Tx-мета: `tx.meta.silent` - сервис не генерирует уведомления; `tx.meta.inboxOnly` - только inbox, без push/звука/email (ставит ai-bot).
- Клиент: `notification.metadata.PushPublicKey` (VAPID), `NotificationAppearancePreference.showChatBadge`; desktop `preferences.showNotifications/playSound/bounceAppIcon`.
- Транзактор: `EXPECTED_SCHEMA_VERSION=15`.

## Тесты

- Unit, сервис: services/notifications/src/{__tests__,module/__tests__,utils/__tests__} - cache, worker (drop/ai-bot), workspace (retry/close), message, notification, mention, reaction, read, action, providers, context (`setUnreadMessagesCounts`), display, workspace utils.
- Unit, транзактор: server-plugins/notification/src/__tests__/middleware.test.ts; foundations/server/packages/middleware/src/__tests__/triggers.test.ts (`isTriggerCtx`); foundations/core/packages/core/src/__tests__/operator.test.ts (`$push.$slice`); server-plugins/notification-resources/src/__tests__/docClassChanged.test.ts.
- Unit, клиент: plugins/notification/src/__tests__/{collapse,compact,utils}.test.ts; plugins/notification-resources/src/__tests__/{client,stores}.test.ts; desktop/src/__test__/ui/notifications.test.ts.
- Unit, поды: services/notification/pod-notification/src/main.test.ts, src/__tests__/mobile.test.ts; services/mail/pod-mail/src/__tests__/{blockedRecipients,createEmailMessage}.test.ts.
- Sanity (Playwright): tests/sanity/tests/inbox/{inbox,inbox-notifications}.spec.ts (карточки, фильтр Unreads, вкладки, Read all / Clear all, unsubscribe, muted-канал, mention в mentions-only); tests/sanity/tests/chat/{chat-unread,chat-notifications}.spec.ts; page objects tests/sanity/tests/model/inbox.ts/inbox-page.ts, model/chat-unread-page.ts; REST-помощник tests/sanity/tests/API/ChatApi.ts.

## Связанные документы

- [chat.md](chat.md) - чат: окно сообщений, чтение при скролле, навигатор, треды.
- [../memory/notifications-embedded-model.md](../memory/notifications-embedded-model.md) - неочевидные решения сервиса и модели.
- [../memory/chat-viewport.md](../memory/chat-viewport.md) - гонки клиента чата с сервисом уведомлений.
- [../memory/presence-fanout.md](../memory/presence-fanout.md), [../pulse.md](../pulse.md) - кросс-воркспейс статус непрочитанного.
- [integrations.md](integrations.md) - исходящая почта (`pod-mail`).
