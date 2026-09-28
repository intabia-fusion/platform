# Уведомления

> Сверено с кодом: коммит 94bd827fd9, 2026-09-25.

Всё, что сообщает пользователю о событиях платформы: inbox, бейджи непрочитанного (чат, приложения, другие воркспейсы), in-app и системные push (Web Push/APNs/FCM/RuStore), email, упоминания, реакции, режимы mute документа. Чат как таковой (каналы, DM, треды, загрузка и чтение сообщений) - в [chat.md](chat.md).

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
| notification | plugins/notification/src | Типы (`types.ts`), интерфейс `NotificationClient`, `collapse.ts` (чанки непрочитанного), `utils.ts` (счётчики, перевод, компакция встроенных сообщений, `isNativePushEndpoint`), `pushDecision.ts` (показывать ли Web Push при открытой вкладке), `serviceWorker.ts` (Web Push) |
| model-notification | models/notification/src | T-классы, домены, индексы, провайдеры, actions, миграции (`migration.ts`, `migrations/*`) |
| notification-resources | plugins/notification-resources/src | `NotificationClientImpl` (`client.ts`), сторы inbox (`stores.ts`), действия (`actions.ts`), in-app push (`appPush.ts`), Web Push подписка (`webpush.ts`), UI inbox и настроек (`components/`) |
| notification-assets | plugins/notification-assets/src | Иконки и переводы |
| server-notification | server-plugins/notification/src | `NotificationMiddleware`: права записи в `ReadState`/`DocNotifyContext`/`AppPushNotification`/`PushSubscription` |
| server-notification-resources | server-plugins/notification-resources/src | Триггеры транзактора над контекстами: `OnDocUpdate` (заголовки/иконки по `triggerFields`), удаление контекстов при удалении документа |
| server-activity | server-plugins/activity/src | Серверные презентеры `TitlePresenter`/`LabelPresenter`/`IdentifierPresenter`/`IconPresenter`/`UrlPresenter` (mixin на класс, `triggerFields`) |
| server-activity-resources | server-plugins/activity-resources/src | `references.ts`: `UserMentionInfo`, ссылки между документами |
| services/notifications | services/notifications/src | Сервис-генератор: `index.ts` (consumer'ы), `worker.ts` (воркспейсы, user-статусы), `workspace.ts` (диспетчер Tx, `applyResult`), `cache.ts`, `module/*` (message, reaction, mention, action, read, tx, notification), `utils/*` (providers, context, display, workspace) |
| pod-notification | services/notification/pod-notification/src | Consumer `user-notifications`: Web Push / APNs / FCM / RuStore, удаление мёртвых подписок |
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
| `NotificationProviderSetting` / `NotificationTypeSetting` | Пользовательские тумблеры: провайдер целиком (плюс `holdMs` - своё окно ожидания для провайдера, у которого оно есть, см. `NotificationProvider.holdMs`); пара тип + провайдер | plugins/notification/src/types.ts |
| `QueueNotificationMessage` | Сообщение топика `user-notifications`, объединение двух видов. `QueueNotifyMessage` (`kind` отсутствует или `notify`): `id`, `title/body` (уже переведены), `account`, `language`, `url/domain`, `template? {subject, text, html}`, `pushSubscriptions`, `providers: {provider -> typeIds}`, `objectId/objectClass/objectSpace`, `createdOn`. `QueueDismissMessage` (`kind: 'dismiss'`): `id`, `account`, `objectId/objectClass/objectSpace`, `pushSubscriptions` (только native), `tags` (id снятых уведомлений), `readUpTo` | plugins/notification/src/types.ts |
| `WorkspacesNotification` | Кросс-воркспейс «есть непрочитанное» по аккаунту (pulse) | plugins/pulse/src/types.ts |
| `InboxNotification*` | Только заглушки `as any` для миграций старых данных; в рантайме не создаются | models/notification/src/index.ts; models/notification/src/migrations/types.ts |

## Как работает

### 1. Путь сообщения: от Tx до карточки в inbox

1. Транзактор сохраняет `TxCreateDoc<ChatMessage>` и кладёт её в Kafka-топик `tx` (`QueueMiddleware.handleBroadcast`, foundations/server/packages/middleware/src/queue.ts). Для `TxRemoveDoc` туда же подставляется `removedDoc` из `removedMap` - потребитель видит документ, которого в БД уже нет.
2. `services/notifications/src/index.ts` читает топик одной consumer-group на сервис (реплики делят партиции). `Worker.tx` (worker.ts): если воркспейс ещё не загружен и класс Tx не триггерный (`isTxTrigger`: `ReadState`, `ActivityMessage`, `Reaction`, `ReadNotificationAction`, `CreateNotificationAction`, плюс `objectClass` всех `TxNotificationType`), Tx пропускается без загрузки воркспейса. Иначе поднимается `Workspace` (workspace.ts): мини-pipeline поверх БД без триггеров (`disableTriggers: true`), `RestClient` к транзактору, модель через `client.getModel`.
3. `Workspace.tx` вызывает по очереди `module/action.ts` (для `*NotificationAction`), `module/read.ts` (для `ReadState`), затем, если `tx.meta.silent !== true`, `module/tx.ts` (`handleTxNotification` - tx-типы, реакции, упоминания) и `module/message.ts` (`handleMessage` - для `ActivityMessage`). Все они складывают результат в `Result`: `createContextTx`, `updateContextTx`, `createAppPushNotificationTx`, `queueMessages` и т.д.
4. `handleCreateMessage` (module/message.ts): находит документ и его пространство; двигает `ReadState.latestMessageId/latestMessageTimestamp` (`trackLatestMessage`); собирает коллабораторов документа (`cache.getCollaborators` + `getCollaboratorAccounts`, utils/misc.ts: приватное пространство ограничивает членами, employee - коллаборатор своего документа); `cache.getReceivers` превращает аккаунты в `Receiver` (employee, socialIds, язык, `online`, `away` из `UserStatus.away`; офлайн-запись транзактор держит не `away`) и **исключает** `systemAccountUuid` и аккаунт ai-bot.
5. Для каждого получателя, кроме автора (`isSender`): режим документа `getMode` (utils/context.ts); если не `mute` - `getMessageNotifyProviders` (см. п.2); `alreadyRead = ReadState[account].timestamp >= createdOn`. Дальше три исхода: есть Inbox-провайдер -> `pushNotification` (карточка; unread-запись, push, звук и email только если не `alreadyRead` - для прочитанного остаётся один Inbox-провайдер, и сообщение в `user-notifications` не публикуется); Inbox-провайдера нет, но не прочитано -> `addUnreadMessage` (только `unreadMessages` без `notified`); прочитано и без провайдера -> ничего.
6. `pushNotification` (module/notification.ts) - единая точка записи для сообщений, реакций, упоминаний и commons. Сначала `isNotificationRecorded`: если карточка с таким id уже в контексте, это повторная доставка Kafka - выход. Затем `QueueNotificationMessage` (title/body через `translateNotification` на языке получателя, `url` - deep link на контекст/сообщение, `template` - email-шаблон типа через `getTemplate`, если у типа есть `templates`). Затем контекст:
   - существует -> `TxUpdateDoc`: `lastNotify = max(...)`, `$push {latestNotifications: {$each: [карточка], $position: 0, $slice: 5}}`; если есть unread-запись - `$inc {unreadCount: 1}` и `$push` в нужный массив (для сообщений `appendAndCollapseUnreadMessages` может вернуть схлопнутый массив, тогда `unreadMessages` заменяется целиком);
   - не существует -> `getCreateContextTx` (utils/context.ts) с отображаемыми полями из презентеров (`getObjectDisplayData`, utils/display.ts), в атрибуты которого дописываются карточка и unread.
   В `user-notifications` уходит только сообщение, у которого есть провайдер кроме Inbox (push и mail поды фильтруют по своим, inbox-only никто не читает). Если среди провайдеров есть Push - `createAppPushNotification`: `AppPushNotification` в `PersonSpace` получателя с `onClickLocation` (`getNotificationLocation`) и `soundAlert` при Sound-провайдере.
7. В конце `Workspace.tx`: `tx.meta.inboxOnly === true` (так помечает свои сообщения ai-bot) обнуляет `queueMessages` и app-push, оставляя только inbox; `setUnreadMessagesCounts` (utils/context.ts) пересчитывает `unreadMessagesCount`/`notifiedMessagesCount` по итоговому состоянию контекста (кэш или `findOne`) с реплеем всех накопленных операций; `applyResult` шлёт Tx батчами по `ApplyTxBatchSize` (100) одним `TxApplyIf` от `core.space.DerivedTx` на транзактор с 4 попытками при транзиентных ошибках, зеркалит их в кэш и публикует `queueMessages` в `user-notifications`. Native-часть push любого непрочитанного уведомления (сообщение, реакция, упоминание, common; подписки `apns://`/`fcm://`/`rustore://`, список `NATIVE_PUSH_SCHEMES` в plugins/notification/src/utils.ts) для получателя, который `online` и не `away`, в очередь не идёт, а ждёт в `PendingPushHolder` (services/notifications/src/pendingPush.ts, `Client.pendingPush`; `HeldPush.readBy` говорит, чем такое уведомление читается: `position` для сообщений и упоминаний в них, `reactions`/`mentions`/`commons` для остальных). Чтение отменяет её (`cancelHeldPushes`, module/dismiss.ts: позиция чтения из `readContext` снимает всё по документу до неё, списки `ReadNotificationAction` снимают по id), удаление сообщения или реакции тоже, уход получателя (`UserStatus` с `away: true`, `online: false` или удаление) досылает (`releaseHeldPushes` в `Workspace.processTx`), потолок `PUSH_HOLD_MS` (60 с) досылает после перепроверки напрямую из БД: держатель тикает раз в секунду и снимает всё, у чего срок вышел, одной пачкой, а `areHeldPushesRead` проверяет пачку одним запросом на 200 документов по каждому виду (`ReadState` с `$in` для сообщений, `DocNotifyContext` с `$in` для остальных: id ещё в `unread*`), сколько бы push ни ждало; если проверка упала (база недоступна), push возвращается в держатель и проверяется снова через 5 с, до трёх попыток, после чего уходит без проверки (лишний push лучше потерянного); `Workspace.close()` досылает всё до закрытия pipeline, а упавшая проверка при закрытии сразу шлёт без неё. Web-подписки уходят сразу той же публикацией, только без native-подписок. Письмо ждёт отдельно и дольше: провайдер с `NotificationProvider.holdMs` (email: час, models/gmail/src/notification.ts) доставляет только то, что не прочитано спустя окно; окно берётся из `NotificationProviderSetting.holdMs` получателя (настройка «Отправлять письмо, если не прочитано в течение» в разделе провайдера, `ProviderHoldPreferences.svelte`: 15, 30 мин / 1, 4, 8, 12, 24 ч), иначе из провайдера. Настройки email-провайдера открываются кнопкой «Настроить» в модальном окне (`ProviderEmailPreferences.svelte` -> `EmailPreferencesPopup.svelte`, как у Telegram): там окно ожидания и строка «Письма приходят на» с адресом, который возьмёт pod-mail - первая подтверждённая email/Google-идентичность аккаунта, не отозванная (`getCurrentAccount().fullSocialIds`; в pod-mail то же правило в `pickNotificationEmail`). Адрес не выбирается: адрес добавляют, подтверждают и отзывают в профиле. Над настройками пояснение, зачем письмо (по образцу Slack). Час в памяти сервиса не держат: письмо (`HeldPush.provider` = id провайдера, у push это `PushNotificationProvider`; в `message` `template` и один этот провайдер в `providers`) планируется в time-machine (`services/worker`: таблица `time_machine.delayed_events`, опрос раз в 20 с) командой `schedule` на `QueueTopic.TimeMachine` с ключом `letter:account:notificationId:provider` (heldLetter.ts; команды копятся в `Result.timeMachine` и уходят из `applyResult` после `rest.tx`, как `queueMessages`); повторная доставка Tx делает upsert и сдвигает срок. По сроку time-machine кладёт `HeldPush` в `QueueTopic.HeldNotifications`, третий consumer сервиса (index.ts, та же группа и партиция, что у Tx, под тем же `WorkspaceBreaker`) через `Worker.heldNotification` -> `Workspace.releaseHeld` перепроверяет чтение (`areHeldPushesRead`) и публикует письмо только непрочитанное. Чтение и удаление шлют `cancel` по префиксу `letter:account:notificationId:%` (`cancelLetters` из `cancelHeldPushes`, `handleRemoveMessage`, `handleRemoveReaction`); чанки id не несут, их закрывает перепроверка. Немедленная публикация уходит без письма и без `template`, а если кроме письма доставлять было нечего, не уходит вовсе. Присутствие на письмо не влияет: уход в `away` досылает только push из памяти.
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

- **Позиция чтения (чат).** Клиент пишет `ReadState[me] = {messageId, timestamp}` (`readMessages`, plugins/chunter-resources/src/scroll.ts, или `forceReadDocState`, plugins/notification-resources/src/client.ts). `module/read.ts` `handleReadState` для каждого аккаунта в `operations` вызывает `readContext`: `$pull` всех `UnreadMessageId` с `createdOn <= timestamp` и чанков с `to <= timestamp`, `$inc unreadCount` на минус число `notified` (для чанков - `notifiedCount`). Ненотифицированные записи уменьшают только `unreadMessagesCount`. Если среди снятого были `notified` записи и у аккаунта есть native-подписка, в `queueMessages` добавляется `QueueDismissMessage` (`pushDismissMessage`, module/dismiss.ts): `tags` - id снятых notified-сообщений, `readUpTo` - позиция чтения (чанки id не несут, их закрывает `readUpTo`).
- **Явные списки.** Клиент создаёт `ReadNotificationAction` с id: `readDoc`/`readNotificationsWithoutMessage` (mentions и commons при открытии документа или выборе в inbox), `readAll`, а чат - с `reactionIds` сообщений, попавших во вьюпорт. `module/action.ts` `handleReadNotificationAction`: проверяет, что `tx.modifiedBy` соответствует `action.account`, `$pull` перечисленное из `unread*`, для `messageIds` при наличии чанков считает `maxTs` и снимает чанки с `to <= maxTs`; снятые notified-сообщения дают такой же `QueueDismissMessage` с `readUpTo` = максимум их `createdOn` и `maxTs`; снятые реакции, mentions и commons попадают в его `tags` по id (тег push = id уведомления), и если сообщений среди прочитанного нет, `readUpTo` = 0 - телефон снимает только теги.
- **Открытие документа.** `EditDoc.svelte` и панели `Edit*` плагинов вызывают `readDoc` при уходе с документа; inbox - при выборе контекста (`updateSelectedPanel`, Inbox.svelte: для чат-каналов только `readNotificationsWithoutMessage`, сообщения читает сам чат).

Пока клиент ждёт, что сервер обработает чтение, счётчики на клиенте «врут». Поэтому открытый и досмотренный до низа канал помечается `setDocReading(doc, true, reader)`, и `publishUnread` (client.ts) вычитает его `min(notifiedMessagesCount, unreadCount)` из `totalUnreadCount` и убирает из `unreadByDoc`.

### 5. Доставка push и email

Топик `user-notifications` (`QueueTopic.UserNotifications`, 10 партиций, foundations/server/packages/kafka/src/index.ts). Каждое сообщение несёт `providers`, и каждый под сам решает, его ли это:

- **pod-notification** (services/notification/pod-notification/src/main.ts): берёт сообщения с `providers[PushNotificationProvider]` и все `kind: 'dismiss'`. `sendPushToSubscription` для каждой подписки выбирает транспорт по `endpoint` (`pushTarget`, mobile.ts: `apns://token`, `fcm://token`, `rustore://token`, иначе Web Push с `Urgency: high`, `TTL`); в payload уходят `objectId/objectClass/createdOn`, APNs получает заголовок `apns-collapse-id: tag`, чтобы тег стал идентификатором доставленного уведомления. `sendDismissToSubscription` шлёт только native: APNs - background push (`apns-push-type: background`, `apns-priority: 5`, `content-available`), FCM и RuStore - data-only сообщение одной формы (API RuStore повторяет формат FCM, отличается только авторизация: статичный сервисный токен); web-подписки пропускаются (push без показанного уведомления даёт в Chrome «сайт обновлён в фоне»). Контракт для мобильных приложений - README пода. Подписка считается мёртвой при 404/410 или телах `expired`/`Unregistered`/`No such subscription`/`VapidPkHashMismatch` (Web Push), 410/`BadDeviceToken`/`DeviceTokenNotForTopic` (APNs), 404/`UNREGISTERED`/`INVALID_ARGUMENT` (FCM), 404/`UNREGISTERED`/`NOT_FOUND` (RuStore); такие удаляются через `createRestClient(...).removeDoc(PushSubscription)` под системным токеном. Вся обработка в `withRetry` (3 попытки, бэкофф до 5 с), после чего сообщение подтверждается, чтобы не блокировать партицию. HTTP-порта у пода нет. APNs получает alert-push, не silent (iOS троттлит silent); токен APNs кэшируется 40 минут.
- **pod-mail** (services/mail/pod-mail/src/notification.ts, `createUserNotificationsHandler`, group `mail-user-notifications`): берёт сообщения с `template` и `gmail.providers.EmailNotificationProvider` (`kind: 'dismiss'` отсекается первым); email - первый подтверждённый `EMAIL`/`GOOGLE` social id аккаунта из `getPersonInfo`; html оборачивается в `wrapWithHtmlCard(html, APP_NAME)`; дальше `MailClient.sendMessage` (SMTP/SES) или форвард клиентам в режиме `server`. `withoutBlockedRecipients` (utils.ts) выкидывает адреса из `BLOCKED_RECIPIENTS` (по умолчанию email ai-bot) и не шлёт письмо без получателей. Старый consumer `NotificationQueue` (`AccountNotification`: коды, приглашения) работает параллельно.
- **Telegram** - отключён: consumer в services/telegram-bot/pod-telegram-bot/src/start.ts закомментирован, `QueueTopic.TelegramBot` удалён, продюсера нет.

### 6. Push на клиенте

- `appPush.ts` (plugins/notification-resources/src) при старте пробует системный push: на мобильном не подписывается вовсе; если Web Push уже разрешён или `subscribePush()` вернул `success` - live-запрос `AppPushNotification` не держится (системный push покроет). Иначе `appPushStore` получает новые записи.
- `subscribePush` (webpush.ts): регистрирует `/serviceWorker.js` со scope воркспейса, `Notification.requestPermission`, `PushManager.subscribe` с VAPID-ключом `notification.metadata.PushPublicKey`, создаёт `PushSubscription`.
- `AppNotificator.svelte`: на каждую запись `appPushStore` (кроме мобильного и desktop с включённым системным push) проверяет, что документ не открыт в текущей локации (`getObjectIdFromLocation`, utils.ts) или сайдбаре, переводит `titleIntl/bodyIntl` и показывает тост через `addNotification`; `Notification.svelte` при `soundAlert` играет `playThrottledSound`; запись удаляется `removeAppPush` (гость не удаляет).
- Desktop (desktop/src/ui/notifications.ts): `electronAPI.sendNotification` по `appPushStore` с учётом `preferences.showNotifications/playSound/bounceAppIcon`; бейдж дока по `totalUnreadCount` (`updateBadge`), при нуле и наличии кросс-воркспейс непрочитанного - точка.
- Service worker (plugins/notification/src/serviceWorker.ts): на `push` спрашивает каждую видимую вкладку в фокусе, что она показывает (`MessageChannel`, сообщение `viewing-query`, ответ `viewing` с id объекта главной панели и сайдбара - `getViewedObjectIds`, plugins/notification-resources/src/utils.ts, ответ ждётся 300 мс), и решает через `shouldSuppressPush` (plugins/notification/src/pushDecision.ts): если документ из `PushData.objectId` открыт в такой вкладке - в главной панели, через inbox или в сайдбаре - уведомление не показывается, сообщение уже на экране. Вкладка, не ответившая вовремя, сверяется по адресу (сегмент пути `<id>`, `<id>|<class>` или `<name>-<id>`, тред - по id корневого сообщения). Иначе показывает уведомление с `tag` и `data {domain, url, notificationId}`; на клик ищет вкладку с тем же путём, иначе тем же origin, шлёт `postMessage({type: 'notification-click', url, _id})` и фокусирует, без вкладки - `openWindow`. Вкладка (`addWorkerListener`, webpush.ts) делает `navigate` по url и `cleanTag` - удаляет `AppPushNotification` с этим `tag`.

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
- Tx, падающая дольше `giveUpAfterMs` (5 минут), логируется и дропается, воркспейс уходит в cooldown (`WorkspaceBreaker`, см. «Известные ограничения»). Нетранзиентная ошибка `TxApplyIf` - батч дропается, кэш контекстов сбрасывается; транзиентная - Tx уходит на повтор.
- `getWorkspaceInfo` (utils/workspace.ts) ретраит `ECONNRESET`/`ECONNREFUSED`/`ENOTFOUND`; отключённый воркспейс - не загружается; `Forbidden`/`WorkspaceNotFound` - «удалён», без повторов. Аккаунт ai-bot резолвится раз в минуту в фоне, ждём только первый запрос.

### 12. Push на телефон и чтение в вебе: кейсы

Слова в таблицах: **веб** - браузер или desktop-приложение; **телефон** - iOS/Android-приложение; **push** - native push на телефон (подписки `apns://`, `fcm://`, `rustore://`); **Web Push** - системное уведомление браузера; **письмо** - email-уведомление.

Три механизма, на которых держатся кейсы:

- **Удержание.** Пока человек за компьютером, push на телефон не отправляется сразу, а ждёт в памяти сервиса (`PendingPushHolder`) до `PUSH_HOLD_MS` (60 с). Если за это время уведомление прочитано, push отменяется; если нет, уходит по истечении окна. Web Push, desktop-уведомление и карточка в inbox не ждут никогда.
- **Dismiss.** Если push уже показан на телефоне, а человек прочитал уведомление в другом месте, телефону приходит служебный background-push, и уведомление исчезает.
- **Письмо.** Email-уведомление не отправляется сразу: оно ждёт в time-machine (таблица в Postgres) столько, сколько выбрано в настройках (по умолчанию час), и уходит, только если к тому времени уведомление не прочитано. От присутствия письмо не зависит.

Состояние человека на вебе:

- **за компьютером** - окно приложения на виду и был ввод за последние 10 минут;
- **отошёл** (`UserStatus.away`) - окно скрыто дольше минуты, или 10 минут без ввода, или у desktop заблокирован экран либо сон;
- **офлайн** - соединений нет.

Мобильное приложение, TUI и CLI (`client: 'mobile'` и `client: 'cli'` в hello) «за компьютером» не считаются никогда, даже когда открыты. Человек за компьютером, пока хотя бы одна его веб-сессия в воркспейсе не отошла.

**Присутствие и удержание**

| Кейс | Что происходит |
|---|---|
| Человек в вебе, и у него открыт тот самый чат, куда пришло сообщение (в главной панели, в inbox с выбранным чатом или в сайдбаре) | Веб отмечает сообщение прочитанным, push на телефон отменяется - телефон молчит. Web Push тоже не показывается: вкладка в фокусе уже показывает этот чат. Исключение: чат промотан далеко назад, новое сообщение не на экране. Тогда прочитанным оно не станет, Web Push всё равно не будет (правило смотрит на открытый документ, а не на прокрутку), а push на телефон уйдёт через 60 с |
| Человек в вебе, но в другом чате | Web Push показывается сразу. Push на телефон ждёт: если человек открыл чат и прочитал сообщение в течение 60 с, телефон молчит; если нет, push приходит с задержкой до 60 с |
| Окно веба открыто, но человек отошёл: заблокировал экран, ноутбук уснул, окно свёрнуто или 10 минут нет ввода | Считается, что за компьютером никого нет. Push на телефон уходит сразу, без ожидания. Всё, что ждало в момент ухода, отправляется в ту же секунду (`releaseHeldPushes`) |
| Человек вернулся к компьютеру | Снова за компьютером: новые push опять ждут, а всё, что он читает на компьютере, снимается с телефона |
| Две веб-сессии (браузер и desktop, два браузера): в одной работают, другая свёрнута | Человек за компьютером, пока хоть одна его сессия не отошла. Когда отойдёт последняя, ждавшие push уходят сразу |
| Соединение веба оборвалось (пропала сеть, ноутбук уснул без сигнала от desktop) | Последняя сессия закрылась, человек офлайн: ждавшие push уходят сразу, новые не ждут. После переподключения ожидание работает снова |
| Веба нет, человек только с телефоном | Push приходит сразу. Открытое на телефоне приложение сам себе push не задерживает, потому что мобильная сессия присутствием не считается |
| Открыт TUI или CLI (platform-go) | То же, что с телефоном: терминал присутствием не считается, push приходит сразу. Терминал не умеет сообщать простой, а забытая на втором мониторе консоль задерживала бы каждый push на 60 с |
| У человека два телефона | Push для обоих ждёт и уходит вместе; dismiss приходит на оба |
| Native-подписок нет (только Web Push или вообще ничего) | Ждать нечему, всё уходит сразу, как и раньше |
| Push выключен в настройках (провайдер целиком или конкретный тип) | Push не создаётся, ждать нечему. Карточка в inbox появляется по своим настройкам |
| Desktop-приложение с системными уведомлениями | Это не Web Push, а уведомление самого приложения (`appPushStore` -> Electron): показывается сразу, кроме открытого документа. Удержание его не касается |

**Чтение и dismiss**

| Кейс | Что происходит |
|---|---|
| Push уже показан на телефоне, человек прочитал уведомление в вебе | Телефону приходит dismiss: уведомление исчезает из центра уведомлений, бейдж пересчитывается |
| Человек прочитал на телефоне, а в браузере висит Web Push | Web Push остаётся: браузеру dismiss не шлём (см. ограничения). Бейдж и inbox внутри веба обновляются |
| Человек прочитал на телефоне, пока push для этого телефона ещё ждал | Чтение с телефона отменяет ожидание так же, как чтение в вебе: push не приходит |
| Push пришёл, пока на телефоне открыт тот самый чат или тред | Баннер не показывается и в центр уведомлений не попадает (`willPresent`), сообщение просто появляется в ленте. Решение принимается один раз, для пришедшего push: скрытый баннер потом не появится, а push, пришедшие после выхода из чата на список, показываются как обычно |
| Сообщение прочитано ещё до того, как сервис его обработал (сервис отставал от транзактора) | `alreadyRead`: push, звук и письмо не отправляются, карточка в inbox сразу прочитанная |
| Человек прочитал в вебе вовремя, но Tx о чтении дошла до сервиса уже после 60 с (лаг Kafka) | Перед отправкой ждавшего push сервис перепроверяет чтение прямо в базе, минуя кэш (`areHeldPushesRead`): push не уходит |
| Несколько сообщений подряд в один чат, человек читает их в вебе | Пока он за компьютером, push ждут и отменяются чтением. Те, что уже показаны, снимаются одним dismiss: телефон убирает всё по этому чату до отметки `readUpTo` |
| В чате больше 100 непрочитанных (они хранятся чанками без id) | Dismiss идёт без списка тегов, только с `readUpTo`: телефон снимает все уведомления по чату до этой отметки |
| Реакция, упоминание вне сообщения, уведомление о задаче | Ждут и снимаются так же, как сообщения. Прочитанными считаются, когда их id ушёл из `unread*` контекста (это делают списки `ReadNotificationAction`); dismiss для них идёт по тегам, `readUpTo = 0` |
| Упоминание внутри сообщения чата | Одно уведомление - об упоминании; обычное уведомление о сообщении упомянутому не создаётся (`getNotifiedUsers` исключает его из получателей сообщения, и это не зависит от того, ушёл push сразу или ждёт). Ждёт и отменяется чтением чата как обычное сообщение. Тег push - id уведомления об упоминании, не сообщения, поэтому с телефона его снимает `readUpTo`, а не список тегов. Две карточки по одному сообщению бывают только когда упоминание добавили правкой уже разосланного сообщения |
| Сообщение или реакцию удалили, пока push ждал | Ожидание снимается, запланированное письмо отменяется. Уже показанный push удаление не убирает |
| Dismiss пришёл на телефон раньше самого push (ни один транспорт порядок не гарантирует) | Телефон помнит `readUpTo` по чату и опоздавший push с `createdOn <= readUpTo` не показывает |
| Приложение на телефоне закрыто свайпом | iOS не доставляет background-push закрытому приложению: показанное уведомление висит до следующего запуска |
| Read all или Clear all в inbox | На каждый контекст один `ReadNotificationAction`: снимает всё ждавшее по нему и шлёт dismiss по тегам |

**Письмо**

| Кейс | Что происходит |
|---|---|
| Email включён, уведомление не прочитано | Письмо запланировано на окно из настроек (по умолчанию час). По сроку сервис проверяет, прочитано ли уведомление, и отправляет письмо только если нет. Реальная задержка: окно плюс до 20 с (период опроса time-machine) |
| Уведомление прочитано (в вебе или на телефоне) до срока | План письма отменяется по id уведомления. Для чанков без id отмены нет, их отсекает проверка при срабатывании |
| Человек поменял окно в настройках | Новое окно действует на новые уведомления; уже запланированные письма уйдут по старому сроку |
| Email выключен тумблером провайдера | Письма нет, кнопка «Настроить» скрыта |
| У аккаунта нет подтверждённого email | Настройки предупреждают об этом; pod-mail пишет в лог `No verified email` и письмо отбрасывает |
| У аккаунта несколько подтверждённых адресов | Письмо идёт на первый подтверждённый email или Google-адрес (`pickNotificationEmail`), он же показан в настройках. Выбрать другой нельзя, адреса меняются в профиле |
| Сервис уведомлений перезапустили, пока письмо ждало | Письмо лежит в таблице time-machine, срок не меняется |

**Сбои и повторы**

| Кейс | Что происходит |
|---|---|
| Штатная остановка сервиса уведомлений (деплой) | Ждавшие push отправляются перед остановкой, после проверки чтения: на телефон уходит раньше 60 с, но только непрочитанное |
| Падение процесса (OOM, `kill -9`) | Ждавшие push теряются. Карточки в inbox и письма целы |
| Kafka доставила Tx повторно | Карточка не дублируется, ожидание push перезапускается вместо второго push, план письма перезаписывается по тому же id |
| База недоступна в момент проверки чтения | Три попытки через 5 с, потом push уходит без проверки: лишний push лучше потерянного. При остановке сервиса ждать негде, отправка сразу |
| Брокер недоступен при публикации | Push и письмо этого батча теряются, в лог пишется ошибка (перед этим около минуты повторов). Потерянная отмена письма безвредна: проверка при срабатывании её заменяет |
| time-machine упал между отправкой письма и удалением строки | Письмо может прийти дважды (доставка at-least-once, в pod-mail дедупликации нет) |
| Воркспейс в cooldown после серии ошибок (`WorkspaceBreaker`) | Его Tx и сработавшие письма пропускаются до конца cooldown, такие письма теряются |
| Android | Push идёт через RuStore (`rustore://`), FCM ждёт проекта Firebase (platform-go `docs/android.md`, пункт A6). Dismiss и подавление баннера на Android сделаны в `Push.kt` для RuStore; FCM получит тот же обработчик, форма сообщений одинаковая. Баннер, который SDK нарисовал сам в фоне, снимается только по тегу: у него нет extras с `objectId`/`createdOn` |

#### Контракт push для мобильных клиентов

Источник правды - README pod-notification (services/notification/pod-notification/README.md), реализация на телефоне - platform-go `apps/mobile/ios/Sources/Push.swift`, `apps/mobile/android/.../Push.kt`, `docs/ios.md`, `docs/android.md`. RuStore получает те же сообщения, что FCM (колонка FCM), только без `android.priority`.

Alert:

| Ключ | APNs | FCM, RuStore | Смысл |
|---|---|---|---|
| `tag` | `aps.thread-id`, заголовок `apns-collapse-id`, custom `tag` | `data.tag`, `android.notification.tag` | id уведомления (для сообщения = id сообщения); `apns-collapse-id` делает тег идентификатором доставленного уведомления, иначе `removeDeliveredNotifications` по тегу не работает |
| `url`, `domain` | custom | `data` | deep link и домен воркспейса |
| `objectId`, `objectClass` | custom | `data` | документ (чат), к которому относится push |
| `createdOn` | custom | `data` | timestamp уведомления; alert с `createdOn <= readUpTo` уже полученного dismiss не показывать (порядок доставки не гарантируется) |

Dismiss:

| Ключ | APNs | FCM, RuStore | Смысл |
|---|---|---|---|
| заголовки | `apns-push-type: background`, `apns-priority: 5`, `aps: {content-available: 1}` | data-only (FCM: `android.priority: HIGH`) | без alert и звука |
| `kind` | `"dismiss"` | `data.kind` | тип |
| `objectId`, `objectClass` | custom | `data` | документ |
| `tags` | custom, массив | `data.tags`, JSON-строка | какие уведомления снять: id сообщений, реакций, упоминаний, commons |
| `readUpTo` | custom, число | `data.readUpTo`, строка | снять и все уведомления этого `objectId` с `createdOn <= readUpTo`; `0` - только теги |

Поведение клиента: снять доставленные уведомления по `tags`, затем по `objectId` + `readUpTo`; запомнить `readUpTo` на `objectId` и не показывать опоздавший alert; пересчитать бейдж. Dismiss без ожидающего alert - no-op. Web Push dismiss не получает.

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
- **Присутствие `away`.** Каждое соединение объявляет в hello, откуда оно: `HelloRequest.client` = `web` | `desktop` | `mobile` | `cli` (тип `ClientKind` в `@hcengineering/core`, classes.ts; веб и desktop ставят `client.metadata.ClientKind`, Go-клиенты - `ws.ClientKind`). Мобильная и cli-сессии в подсчёт «человек за компьютером» не входят: пользователь только с телефоном или с открытым терминалом считается `away` (терминал простой не сообщает, и забытая консоль не должна задерживать push). `UserStatus.online` - есть соединение с воркспейсом; `UserStatus.away` - человек отошёл (окно скрыто дольше минуты, 10 минут без ввода, у desktop заблокирован экран или сон). Поле необязательное: отсутствие читается как «не отошёл», поэтому старые записи и клиенты без отчёта (старый веб) считаются присутствующими, пока подключены. Клиент считает состояние сам (`packages/ui/src/presence.ts`: ввод в окне, `visibilitychange`, у desktop `powerMonitor` через IPC `SystemIdle`; пороги `ui.metadata.IdleAfterMs` и `HiddenAfterMs`) и отдаёт `{away}` параметром каждого `ping` (`client.metadata.PresenceProvider`, регистрируют точки входа рядом с остальными `client.metadata`: dev/prod/src/platform.ts и desktop/src/ui/platform.ts; `pingParams` в foundations/core/packages/client-resources/src/connection.ts). Транзактор хранит ответ в `Session.away`; пользователь отошёл от воркспейса, только когда все его сессии там отошли (`isUserAway`), переходы идут в тот же батч, что и `online` (`queueStatus`/`flushStatus`, foundations/server/packages/server/src/sessionManager.ts), апдейт несёт только изменившиеся поля, офлайн-запись никогда не `away`. Потребитель - `Receiver.away` в сервисе уведомлений (пока только заполняется в `cache.getReceivers`; удержание native push по нему - отдельная ветка).

### Клиент

- **`NotificationClientImpl`.** Сторы `contextByDoc/contextById/readStateByDoc/docSettingByDoc` (нет ключа - не спрашивали; `null` - нет или запрос в полёте), запросы одного тика склеиваются в один `$in`; tx-listener патчит `DocNotifyContext`/`ReadState` локально через `TxProcessor.updateDoc2Doc`. Методы `readDoc`, `forceReadDoc` (добавит `Collaborator`, если контекста нет), `forceReadDocState`, `readNotificationsWithoutMessage`, `readAll`, `clearAll`, `setDocReading`, `getContextByDoc`/`getContextsById`. - plugins/notification-resources/src/client.ts.
- **Inbox UI** (п.7). - plugins/notification-resources/src/components/inbox, components/DocNotifyContextCard*.svelte, LoadingHistory.svelte.
- **Actions.** `ReadNotifyContext`, `RemoveDocNotifyContext`, `Unsubscribe` (снять себя из коллабораторов), `ClearAll`, `ReadAll`, `EditDocNotifications` (`MutePopup.svelte`: all/mentions/mute -> `DocNotificationSetting`; видим только коллаборатору). - models/notification/src/actions.ts; plugins/notification-resources/src/actions.ts.
- **Настройки.** `NotificationSettings.svelte` (группы типов, скрывает пустые), `GeneralPreferencesGroup.svelte` + `ProviderPreferences.svelte` (провайдеры; включение зависимого включает родителя, выключение родителя гасит зависимых), `NotificationGroupSetting.svelte` (тип x провайдер), `WebpushesPreferencesPresenter.svelte` (подписки устройств), `NotificationAppearancePreferencesPresenter.svelte` (`showChatBadge`). - plugins/notification-resources/src/components/settings.
- **Открытие документа = прочитано.** - plugins/view-resources/src/components/EditDoc.svelte и `Edit*` панели плагинов.
- **Звук.** `playThrottledSound`: не чаще раза в `THROTTLE_WINDOW_MS=15000`, при `THROTTLE_MAX_PENDING=5` отложенных - сразу; `AudioContext` закрывается при нуле активных воспроизведений (иначе на iOS мешает CarPlay и звонку). - packages/presentation/src/sound.ts.
- **Фокус окна.** `isAppFocusedStore` по `focus/blur` окна, а не `document.hasFocus()` в момент события. - packages/ui/src/components/internal/Root.svelte.
- **Кэш объектов для карточек активности.** `objectCache.ts`: батч-поиск по id/классу, LRU на `maxSize=50`, любая не-create Tx инвалидирует запись. - plugins/activity-resources/src/objectCache.ts.
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

SQL (services/db-migrator/migrations), по файлу на флавор БД, мигратор выбирает `.pg.sql` или `.crdb.sql` по `SELECT version()` и отказывается работать при неизвестном флаворе:

- Postgres: `0001_reworkNotifications.pg.sql` (колонки `notification_dnc` и `notification_read_state`, бэкфилл из `data`, `NOT NULL`, `CHECK`, удаление дублей контекстов), `0002_dropOversizedDncIndexes.sql` (старые covering-индексы с `INCLUDE data` после встраивания превышали лимит btree-строки 2704 байт и ломали запись), `0003_unreadMessagesCount.pg.sql`, `0004_notifiedMessagesCount.pg.sql`, `0005_activityReplies.pg.sql` (колонка + бэкфилл), `0010_reworkNotificationsIndexes.pg.sql` (все 12 индексов).
- CockroachDB не видит колонку, добавленную ранее в том же файле, поэтому цепочка разнесена: `0001`-`0005.crdb.sql` только добавляют колонки, `0006_reworkNotificationsBackfill`, `0007_unreadCountersBackfill`, `0008_activityRepliesBackfill` заполняют их, `0009_reworkNotificationsConstraints` ставит `NOT NULL`/`CHECK` (`ADD CONSTRAINT IF NOT EXISTS`) и удаляет дубли, `0010_reworkNotificationsIndexes.crdb.sql` строит индексы. Парность индексов и «колонка не используется в файле, который её добавляет» проверяет тест services/db-migrator/src/__tests__/utils.test.ts.

`EXPECTED_SCHEMA_VERSION` = 16 (foundations/server/packages/postgres/src/version.ts); версия - счётчик наборов изменений, не файлов; SQL-миграция без повышения версии не применится. `applyMigration` (services/db-migrator/src/db.ts) выполняет файл одной транзакцией и не помечает упавшую миграцию применённой; `getTableSchema` логирует, если у таблицы нет объявленной в `schemas.ts` колонки. Все файлы идемпотентны, поэтому переименованный файл безопасно применяется повторно.

## Известные ограничения

- **Удержанный push живёт в памяти.** `PendingPushHolder` не переживает жёсткое падение процесса (OOM, `kill -9`): push, ждавшие окна удержания, теряются (inbox при этом на месте). Штатная остановка (`SIGTERM`/`SIGINT`: сначала останавливаются consumer'ы, затем `Worker.close()` закрывает каждый воркспейс, и тот досылает удержанное через `flushAll()` ещё при живом продюсере, потом закрываются продюсеры; жёсткий предел 30 с) и idle-close воркспейса досылают всё через `close()`. Уход получателя досылает удержанное только если его `UserStatus` был в кэше сервиса; иначе push уйдёт по потолку `PUSH_HOLD_MS`. Письмо в памяти не живёт (time-machine), но time-machine доставляет at-least-once: падение между отправкой и удалением строки даёт редкое второе письмо (дедупликации в pod-mail нет), срок срабатывания = окно + до 20 с опроса, реплика time-machine одна. Команда `schedule`/`cancel`, не дошедшая до брокера после ретраев, теряется с логом `Failed to send held letters to the time machine` (потерянный `cancel` безвреден: перепроверка при срабатывании). - services/notifications/src/pendingPush.ts, heldLetter.ts, workspace.ts.
- **Потеря push/email при недоступном брокере.** `applyResult` сначала применяет контексты, затем публикует `queueMessages`; повторная доставка Tx распознаётся как уже записанная (`isNotificationRecorded`) и повторно не публикует. Продюсер ретраится 8 раз (около минуты), после чего пишет `Failed to publish user notifications, push and email of this batch are lost` с id уведомлений и аккаунтами: карточки в inbox есть, push и письма по этому батчу нет. Строка лога - точка для алерта. - services/notifications/src/workspace.ts.
- **Сломанный воркспейс и партиция.** Tx, падающая дольше 5 минут, дропается, а воркспейс переводится в cooldown на 5 минут (`WorkspaceBreaker`, services/notifications/src/breaker.ts): его Tx пропускаются без обработки, затем одна Tx-проба с бюджетом 30 секунд либо закрывает breaker, либо открывает снова. Пропущенные Tx уведомлений не создают.
- **Задержка push до окна удержания.** Пока человек за компьютером и не открыл этот чат, телефон получает push с задержкой до `PUSH_HOLD_MS` (60 с); на компьютере уведомление показано сразу. Настройка глобальная, не на пользователя.
- **Снятие с телефона не мгновенное и не гарантированное.** Dismiss - background push: iOS доставляет его когда сочтёт нужным, при экономии энергии позже, принудительно закрытому приложению не доставляет вовсе; уведомление тогда остаётся до следующего запуска. Подавить уже показанное уведомление до его появления нельзя без Notification Service Extension с entitlement `com.apple.developer.usernotifications.filtering` (у нас его нет), alert, доставленный до dismiss, может мелькнуть.
- **Уведомление в браузере не снимается** после чтения на телефоне: Web Push обязан что-то показать, иначе Chrome выводит «сайт обновлён в фоне», поэтому dismiss в браузер не шлём.
- **«Открыт» не значит «прочитан».** Подавление Web Push смотрит на то, что вкладка показывает, а не на позицию прокрутки: чат, промотанный к началу истории, уведомления не получит, новое видно в чате и в счётчике.
- **Android** без Firebase push не получает (platform-go `docs/android.md`, A6).
- **Telegram-доставка отключена** (см. п.5).
- **Миграция embedded:** сбойный чанк из 100 контекстов пропускается с логом `Failed to migrate a chunk of contexts`, апгрейд воркспейса продолжается; такие контексты остаются без `latestNotifications` и подхватываются следующим апгрейдом, их старые уведомления до этого лежат в таблице `notification`.

## Куда смотреть, если нужно...

- Добавить тип уведомления -> `TxNotificationType`/`MessageNotificationType` в `models/<x>/src`, дефолты в `NotificationProviderDefaults`; матчинг - `isMatchedTxType`/`isMessageTypeMatched`, services/notifications/src/utils/providers.ts; чат - models/chunter/src/notifications.ts.
- Поменять, кто получает уведомление о сообщении -> `handleCreateMessage`, services/notifications/src/module/message.ts; `getCollaboratorAccounts` (utils/misc.ts), `getReceivers` (cache.ts).
- Изменить правило «провайдер включён» -> `isTypeAllowed`/`resolveNotifyProviders`, services/notifications/src/utils/providers.ts.
- Поменять содержимое карточки -> `toNotificationMessage` (utils/misc.ts), `compactNotificationMessage` (plugins/notification/src/utils.ts); текст push - `getMessageIntl` (module/message.ts).
- Изменить чанкование непрочитанного -> plugins/notification/src/collapse.ts; чтение чанков - `readContext` (module/read.ts), `handleReadNotificationAction` (module/action.ts).
- Снять push с телефона при чтении -> `pushDismissMessage`/`dismissScopeOf` (services/notifications/src/module/dismiss.ts), транспорт - `sendDismissToSubscription` (pod-notification main.ts), payload - `apnsDismissPayload`/`fcmDismissMessage` (mobile.ts).
- Создать уведомление из сервиса/триггера -> `TxCreateDoc<CreateNotificationAction>` (пример: services/export/pod-export/src/notifications.ts).
- Изменить текст/локализацию push и email -> `translateNotification` (plugins/notification/src/utils.ts), `getTemplate`/`translateTemplate` (module/notification.ts), `templates` типа; html-обёртка письма - `wrapWithHtmlCard`, services/mail/pod-mail/src/notification.ts.
- Добавить транспорт push -> `pushTarget`, services/notification/pod-notification/src/mobile.ts.
- Поменять права записи в контексты/ReadState -> `NotificationMiddleware`, server-plugins/notification/src/middleware.ts.
- Обновлять заголовок контекста при изменении поля -> `triggerFields` презентера в `models/server-<x>/src/index.ts`; `OnDocUpdate`, server-plugins/notification-resources/src/index.ts.
- Изменить ленту inbox -> plugins/notification-resources/src/stores.ts, components/inbox/{Inbox,InboxHeader,InboxGroupedListView}.svelte.
- Поменять бейджи -> `publishUnread` (client.ts), `Applications.svelte`, `updateUserNotifyStatus` (services/notifications/src/worker.ts), desktop/src/ui/notifications.ts.
- Web Push подписка/клик -> plugins/notification-resources/src/webpush.ts, plugins/notification/src/serviceWorker.ts; правило «не показывать по открытому чату» -> plugins/notification/src/pushDecision.ts.
- Включить Telegram-доставку -> services/telegram-bot/pod-telegram-bot/src/{start,worker}.ts (закомментированный consumer; топика и продюсера пока нет).
- Отладить «уведомление не пришло» -> логи `services/notifications` (`No receivers resolved`, `notification already recorded`, `Tx batch rejected`, `push and email of this batch are lost`, `workspace txes are skipped for a cooldown`), затем `providers` в сообщении топика `user-notifications`, затем логи пода.

## Настройки и конфигурация

- `services/notifications` (services/notifications/src/config.ts): обязательные `QUEUE_CONFIG`, `QUEUE_REGION`, `ACCOUNTS_URL`, `STORAGE_CONFIG`, `DB_URL`, `FRONT_URL`; `SECRET` (default `secret`), `SERVICE_ID` (`notifications`), `NOTIFICATION_PROVIDERS` (`all` или список id), `APPLY_TX_BATCH_SIZE` (100), `LATEST_NOTIFICATIONS_SLICE_SIZE` (5), `PUSH_HOLD_MS` (60000, потолок удержания native push для получателя за компьютером; окно письма - не env, а `NotificationProvider.holdMs` в модели и настройка пользователя; срабатывание - через time-machine, `POLL_INTERVAL` того сервиса), `BRANDING_PATH`, `EXTERNAL_REGIONS`, `MODEL_JSON`.
- `pod-notification` (services/notification/pod-notification/src/config.ts): обязательные `SOURCE`, `ACCOUNTS_URL`, `SECRET`; `QUEUE_CONFIG`/`QUEUE_REGION`, `SERVICE_ID` (`web-push-service`), `TTL` (86400 с), VAPID `PUSH_PUBLIC_KEY`/`PUSH_PRIVATE_KEY`/`PUSH_SUBJECT`, APNs `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_KEY`/`APNS_TOPIC`/`APNS_PRODUCTION`, `FCM_SERVICE_ACCOUNT`. Без ключей APNs/FCM соответствующие подписки пропускаются. В dev/docker-compose.yaml `PORT` убран, добавлены `depends_on: redpanda, account`.
- `pod-mail` (services/mail/pod-mail/src/config.ts): для consumer'а нужны `ACCOUNTS_URL`, `SECRET`, `SERVICE_ID` (`mail-service`; в account-сервисе разрешён рядом с `huly-mail`), `APP_NAME`; `BLOCKED_RECIPIENTS` (default email ai-bot).
- Tx-мета: `tx.meta.silent` - сервис не генерирует уведомления; `tx.meta.inboxOnly` - только inbox, без push/звука/email (ставит ai-bot).
- Клиент: `notification.metadata.PushPublicKey` (VAPID), `NotificationAppearancePreference.showChatBadge`; desktop `preferences.showNotifications/playSound/bounceAppIcon`.
- Транзактор: `EXPECTED_SCHEMA_VERSION=15`.

## Тесты

- Unit, сервис: services/notifications/src/{__tests__,module/__tests__,utils/__tests__} - cache, worker (drop/ai-bot), workspace (retry/close/потеря публикации/досылка удержанного), breaker, pendingPush, message, notification, mention, reaction, read, action, dismiss, providers, context (`setUnreadMessagesCounts`), display, workspace utils.
- Unit, транзактор: server-plugins/notification/src/__tests__/middleware.test.ts; foundations/server/packages/middleware/src/__tests__/triggers.test.ts (`isTriggerCtx`); foundations/core/packages/core/src/__tests__/operator.test.ts (`$push.$slice`); server-plugins/notification-resources/src/__tests__/docClassChanged.test.ts.
- Unit, клиент: plugins/notification/src/__tests__/{collapse,compact,utils,pushDecision}.test.ts; plugins/notification-resources/src/__tests__/{client,stores}.test.ts; desktop/src/__test__/ui/notifications.test.ts.
- Unit, мигратор: services/db-migrator/src/__tests__/utils.test.ts (выбор файлов по флавору, парность индексов, разнос колонок для Cockroach).
- Unit, клиент: plugins/activity-resources/src/__tests__/objectCache.test.ts (LRU кэша объектов).
- Unit, поды: services/notification/pod-notification/src/main.test.ts, src/__tests__/mobile.test.ts; services/mail/pod-mail/src/__tests__/{blockedRecipients,createEmailMessage}.test.ts.
- Стенд, push и чтение (`pnpm docker:build --to` для `pod-notifications`, `pod-notification`, транзактора; `docker compose up -d --force-recreate`): второй пользователь пишет в DM, первый читает в вебе в течение окна -> в логах `services/notifications` удержание отменено, в `user-notifications` alert нет; читает позже окна -> alert ушёл, следом `kind: dismiss`. Web: чат открыт во вкладке в фокусе -> системного уведомления нет, вкладка не в фокусе -> есть. Присутствие: свернуть окно на минуту (или заблокировать экран в desktop) -> `UserStatus.away: true` и следующее сообщение на телефон сразу; вернуть окно -> `away: false`; свернуть в момент удержания -> push в ту же секунду. Письмо: строка `letter:...` в `time_machine.delayed_events`, исчезает после чтения, иначе письмо в mailpit через окно + до 20 с, перезапуск `notifications` посреди окна строку не трогает. Симулятор iOS: `simctl push` доставляет только alert, dismiss проверяется как alert с `kind: dismiss` (platform-go `docs/ios.md`).
- Sanity (Playwright): tests/sanity/tests/inbox/{inbox,inbox-notifications}.spec.ts (карточки, фильтр Unreads, вкладки, Read all / Clear all, unsubscribe, muted-канал, mention в mentions-only); tests/sanity/tests/chat/{chat-unread,chat-notifications}.spec.ts; page objects tests/sanity/tests/model/inbox.ts/inbox-page.ts, model/chat-unread-page.ts; REST-помощник tests/sanity/tests/API/ChatApi.ts.

## Связанные документы

- [chat.md](chat.md) - чат: окно сообщений, чтение при скролле, навигатор, треды.
- [../memory/notifications-embedded-model.md](../memory/notifications-embedded-model.md) - неочевидные решения сервиса и модели.
- [../memory/chat-viewport.md](../memory/chat-viewport.md) - гонки клиента чата с сервисом уведомлений.
- [../memory/presence-fanout.md](../memory/presence-fanout.md), [../pulse.md](../pulse.md) - кросс-воркспейс статус непрочитанного.
- [integrations.md](integrations.md) - исходящая почта (`pod-mail`).
- services/notification/pod-notification/README.md - контракт alert/dismiss для мобильных клиентов; services/worker/README.md - time-machine (письма).
- platform-go: `docs/ios.md`, `docs/android.md`, `specs/components/plugin-notification.md` - мобильная сторона: inbox на embedded-модели, dismiss, подавление баннера, `client: 'mobile'` в hello.
