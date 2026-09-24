# Чат и уведомления

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Внутренний чат платформы (каналы, direct-сообщения, треды) и система уведомлений о нём (inbox, web/mobile push, email, read receipts). Сущности: `Channel`/`DirectMessage` (пространства чата), `ChatMessage`/`ThreadMessage` (сообщения), `DocNotifyContext` (подписка аккаунта на объект), `InboxNotification` (уведомление в inbox), `ReadState` (отметки прочтения). Весь функционал чата и уведомлений живёт в `chunter` и `notification`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-chunter | models/chunter/src | Модель чата: классы Channel/DirectMessage/ChatMessage/ThreadMessage/Chat/ChatSyncInfo, actions, миграции, типы уведомлений чата |
| chunter | plugins/chunter/src | Клиентские типы и утилиты: createDirect/createAndGetDirect/findExistingDirect |
| chunter-resources | plugins/chunter-resources/src | UI чата: навигатор, сообщения, поиск, sidebar-виджеты тредов, read-receipts UI |
| chunter-assets | plugins/chunter-assets/src | Иконки и переводы чата |
| server-chunter | server-plugins/chunter/src | ChunterMiddleware: dedup DM, auto-unhide скрытых чатов, инварианты DM |
| server-chunter-resources | server-plugins/chunter-resources/src | Серверные триггеры и search-title-providers чата |
| model-notification | models/notification/src | Модель уведомлений: ReadState, InboxNotification*, DocNotifyContext, миграции, actions |
| notification | plugins/notification/src | Клиентские типы/утилиты: PushSubscription, getNotificationMessageId/ThreadId, service worker |
| notification-resources | plugins/notification-resources/src | UI inbox, mute, бейджи; InboxNotificationsClientImpl |
| notification-assets | plugins/notification-assets/src | Иконки и переводы уведомлений |
| server-notification | server-plugins/notification/src | NotificationMiddleware: server-валидация ReadState |
| server-notification-resources | server-plugins/notification-resources/src | Триггеры доставки: web-push, локализация контента, BrowserNotification |
| pulse | plugins/pulse/src | DocumentPresence/TypingIndicator/WorkspacesNotification (cross-workspace unread) |
| pod-notification | services/notification/pod-notification/src | Отдельный под доставки push (web-push + APNs/FCM) |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TChunterSpace` | база каналов/DM, `core.Space` | models/chunter/src/types.ts |
| `TChannel` | канал: `topic` (FullText), скрытые `icon`/`emoji` | models/chunter/src/types.ts |
| `TDirectMessage` | DM/группа: readonly `type: 'person'\|'group'` | models/chunter/src/types.ts |
| `TChatMessage` | сообщение: `message` (FullText), `attachments` | models/chunter/src/types.ts |
| `TThreadMessage` | сообщение треда: `attachedTo`/`attachedToClass` (родительский ActivityMessage), `objectId`/`objectClass` | models/chunter/src/types.ts |
| `TChat` | персональное состояние (`pinned`/`hidden`) аккаунта для канала/DM, AttachedDoc в PersonSpace | models/chunter/src/types.ts |
| `TChatSyncInfo` | отметка синхронизации аккаунта | models/chunter/src/types.ts |
| `TDocNotifyContext` | подписка аккаунта на объект: `lastView`/`lastUpdate`/`lastNotify`/`lastNotifiedMessage` | models/notification/src/index.ts |
| `TReadState` | read receipt: `[accountUuid]: {timestamp, messageId}` на объект (`attachedTo`) | models/notification/src/index.ts |
| `TInboxNotification` + `TActivityInboxNotification`/`TCommonInboxNotification`/`TMentionInboxNotification`/`TReactionInboxNotification` | варианты уведомления в inbox | models/notification/src/index.ts |
| `TMessageNotificationType` | тип уведомления чата (email-шаблоны, дефолтные провайдеры) | models/notification/src/index.ts |
| `TPushSubscription`/`TPushSubscriptionSetting` | подписка на web/mobile push | models/notification/src/index.ts |
| `TBrowserNotification` | десктоп/браузерное уведомление с `onClickLocation` | models/notification/src/index.ts |
| `WorkspacesNotification` | per-аккаунт карта `{[workspaceUuid]: boolean}` - есть ли непрочитанное | plugins/pulse/src/types.ts |

## Как работает

1. **Создание DM с дедупликацией.** Клиент `createAndGetDirect`/`findExistingDirect` сначала ищет существующий DM по составу участников (plugins/chunter/src/utils.ts) -> при создании `ChunterMiddleware.onDirectCreate` на сервере считает `referenceId = sha256(sorted members)`, форсирует `private=true/archived=false/autoJoin=false`, добавляет автора в members (но не `systemAccountUuid`, иначе группа обходит дедуп) и возвращает `Forbidden`, если DM с таким `referenceId` уже существует (только для 1:1, `members.length <= 2`) - server-plugins/chunter/src/middleware.ts. Изменение `referenceId`/`private`/`type` у DM запрещено всегда; изменение `members` запрещено, если у DM уже есть `referenceId` или `type: 'person'` - `onDirectUpdate`, server-plugins/chunter/src/middleware.ts.
2. **Отправка сообщения -> read receipts.** При создании `ThreadMessage` `NotificationMiddleware.tx` создаёт `ReadState` объекта, если его ещё нет - server-plugins/notification/src/middleware.ts. Клиент помечает прочтение через `InboxNotificationsClientImpl.readDoc`/`forceReadDocState`, которые обновляют `ReadState` и продвигают `lastView` до `max(lastUpdate, lastView)` - plugins/notification-resources/src/inboxNotificationsClient.ts. Обновление `ReadState` на сервере разрешено только для ключа `[account.uuid]` своего же аккаунта (не system, не trigger-контекст) и запрещает откат `timestamp` назад - server-plugins/notification/src/middleware.ts.
3. **Скрытый чат получает новое сообщение -> авто-раскрытие.** При создании `InboxNotification` (кроме `ReactionInboxNotification` и не-mention `CommonInboxNotification`) `ChunterMiddleware.tx` ищет скрытые `Chat`-записи по объекту через `getHiddenChats` (кэш `hiddenChats`, ленивая загрузка из low-level storage) и снимает `hidden` - server-plugins/chunter/src/middleware.ts.
4. **Доставка web/mobile push.** Триггер `PushNotificationsHandler` строит `Tx` через `createPush`: переводит текст (`getTranslatedNotificationContent`), формирует `onClickLocation.path` вида `[workbenchId, wsUrl, notificationId, encodedObject, threadId?]` и `query.message` - server-plugins/notification-resources/src/push.ts. `createPushNotification` шлёт POST на `<PushUrl>/web-push` с `Bearer`-токеном - server-plugins/notification-resources/src/push.ts. Под `pod-notification` на этом эндпоинте выбирает транспорт per-подписка: Web Push (`web-push` lib) для браузеров, APNs/FCM по `pushTarget(endpoint)` для нативных клиентов - services/notification/pod-notification/src/main.ts.
5. **Cross-workspace бейдж непрочитанного.** `NotificationMiddleware.tx` при создании `WorkspacesNotification` переносит документ в `PersonSpace` владельца - server-plugins/notification/src/middleware.ts. Клиент держит `workspacesNotificationStore` в воркбенче (селектор пространств) - plugins/workbench-resources/src/workbench.ts; desktop-под ставит trayicon-бейдж через `getBadgeIconInfo`/`electronAPI.setBadge` - desktop/src/main/trayUtils.ts, desktop/src/ui/notifications.ts.
6. **Поиск по сообщениям.** `createChatSearchStore` шлёт полнотекстовый запрос (`searchIn: 'content'`, `PAGE_SIZE=50`) с курсором и счётчиком `generation`, отбрасывающим ответы устаревших запросов - plugins/chunter-resources/src/search/store.ts. Для DM `ChunterMiddleware.findAll` добавляет `'*'`-префикс к `$search`, если он не задан явно - server-plugins/chunter/src/middleware.ts.

## Фичи

### Ядро чата

- **Каналы как пространства.** `TChannel extends TChunterSpace extends TSpace`, `topic` под FullText-индексом, скрытые `icon`/`emoji`. - `TChannel`, models/chunter/src/types.ts.
- **DM и групповые диалоги.** `TDirectMessage` - вариант ChunterSpace с readonly `type: 'person'|'group'` (>2 участников = группа). - models/chunter/src/types.ts.
- **Server-дедупликация 1:1 DM через referenceId.** SHA-256 отсортированных members, `Forbidden` при повторе; действует только для DM из 2 участников. - `ChunterMiddleware.onDirectCreate`, `getMembersHash`, server-plugins/chunter/src/middleware.ts; тест server-plugins/chunter/src/__tests__/direct-create.spec.ts.
- **Защита неизменяемости DM.** `referenceId`/`private`/`type` менять нельзя никогда; `members` - нельзя, если у DM есть `referenceId` или `type: 'person'`. - `ChunterMiddleware.onDirectUpdate`, server-plugins/chunter/src/middleware.ts.
- **Переход в DM с персоной.** Клик по упоминанию сотрудника (в тексте сообщения - через `contact.component.EmployeePresenter` inline, а не голый `ObjectMention`) и по ссылке на сотрудника внутри приложения chunter открывает DM, а не карточку персоны; кнопки "Сообщение"/"Позвонить" (`contact.extension.EmployeePopupActions`) есть и в тултипе, и в заголовке карточки персоны (`PersonHeaderActions` на `view.extensions.EditDocTitleExtension`); в шапке 1:1 DM - кнопка перехода в карточку и точка расширения `chunter.extensions.DirectHeaderExtension` (props `{ employee }`), куда love кладёт `InviteEmployeeButton` (звонок как в офисе; скрыт для себя и AI-бота, заблокирован, если нет миксина Employee или `active !== true`). - `openDirectForPerson`, plugins/chunter-resources/src/utils.ts; packages/presentation/src/components/markup/ObjectNode.svelte; plugins/contact-resources/src/components/PersonElement.svelte, `person/PersonHeaderActions.svelte`; plugins/chunter-resources/src/components/ChannelHeader.svelte.
- **URL канала и директа.** `path[3]` любого `ChunterSpace` - `<имя>-<id>` без `|<class>` (`view.mixin.LinkIdProvider` на `ChunterSpace`/`Channel`/`DirectMessage`: `getChunterSpaceLinkId`/`parseChunterSpaceLinkId`); у модельных каналов `:` заменяется на `-` (`chunter:space:General` -> `chunter-space-General`). Без `|` класс декодируется как `ChunterSpace`, конкретный берётся из загруженного документа. Прочие документы в чате - по-прежнему `<id>|<class>`; старые ссылки `<id>|<class>` открываются. - `encodeChatURI`/`openChunterSpace`, plugins/chunter-resources/src/navigation.ts; `decodeChatURI`/`toChunterSpaceLinkId`/`parseChunterSpaceLinkId`, plugins/chunter-resources/src/linkId.ts (тест `__tests__/linkId.test.ts`); models/chunter/src/index.ts. В аналитику URL уходит без имени: `stripLinkSlugs`, packages/ui/src/location.ts.
- **Ссылка на канал.** Пункт "Копировать ссылку" в контекстном меню канала в навигаторе (`getLink` -> `GetChunterSpaceLinkFragment`). - plugins/chunter-resources/src/components/chat/navigator/ChatNavItem.svelte.
- **Каналы в `@` и поиске.** `ObjectSearchCategory` `chunter.completion.ChannelCategory` (context search/mention/spotlight, fulltext по `Space.name`/`Channel.topic`); упоминание канала рендерится `ObjectMention` и ведёт в канал. - models/chunter/src/index.ts, `queryChannels`, plugins/chunter-resources/src/utils.ts.
- **Миграция дублированных DM.** `migrateDuplicatedDirects` сливает старые DM с одинаковым составом (сообщения, реакции, вложения, inbox-уведомления), удаляет дубли. - models/chunter/src/migration.ts (state `migrate-duplicated-directs-v1`).
- **Треды.** `TThreadMessage extends TChatMessage`, действие `ReplyToThread` (visibility-tester `CanReplyToThread`). - models/chunter/src/types.ts; models/chunter/src/actions.ts.
- **Reply на сообщение.** Action `ReplyToMessage`. - models/chunter/src/actions.ts.
- **Forward сообщения.** Action `ForwardMessage` -> `ForwardMessageDialog`. - models/chunter/src/actions.ts; plugins/chunter-resources/src/index.ts.
- **Вложения.** `TChatMessage.attachments` (PropCollection `attachment.class.Attachment`). - models/chunter/src/types.ts.
- **Поиск по сообщениям.** `createChatSearchStore` (пагинация курсором, `generation` против гонок, `appendUnique` против дублей при переиндексации, `@Index(FullText)` на `message`), автодогрузка "тонких" страниц (< PAGE_SIZE/2, не более `MAX_AUTO_PAGES=5`), которые сами не запускают скролл-догрузку. - plugins/chunter-resources/src/search/store.ts; models/chunter/src/types.ts.
- **Архивация каналов.** Actions `ArchiveChannel`/`UnarchiveChannel`, фильтр `archived` в навигаторе. - models/chunter/src/actions.ts; plugins/chunter-resources/src/components/chat/navigator/ChatNavGroup.svelte.
- **Личное состояние чата (pin/hidden).** `TChat` (AttachedDoc в PersonSpace) - per-account `pinned`/`hidden`; `TChatSyncInfo` - отметка синхронизации. - models/chunter/src/types.ts.
- **Auto-unhide при новых уведомлениях.** См. "Как работает" п.3. - server-plugins/chunter/src/middleware.ts.
- **Дефолтные каналы general/random.** Upgrade-миграция создаёт `chunter.space.General`/`Random` (autoJoin=true). - `createGeneral`/`createRandom`/`joinEmployees`, models/chunter/src/migration.ts.
- **Миграции истории.** `convertCommentsToChatMessages` (Comment -> ChatMessage), `removeOldClasses`, `removeWrongActivity`, `migrateMessagesSpace` (перенос сообщений/тред-сообщений в корректные spaces - фикс медленной загрузки чата), `removeUnavailableChats`. - models/chunter/src/migration.ts.
- **Deep-link на тред/сообщение.** `openChannel` пишет thread в `loc.path[4]`; `openMessageFromSpecial`/`openSearchResult` собирают путь + `query.message`. - plugins/chunter-resources/src/navigation.ts.

### Read receipts

- **Модель ReadState.** Один `TReadState` на объект (`attachedTo`, collection `readStates`), map `accountUuid -> {timestamp, messageId}`. - models/notification/src/index.ts; `ReadPosition`, plugins/notification/src/index.ts.
- **initReadStates / migrateReadStatesSpace.** Бэкфилл ReadState по уже прочитанным контекстам; перенос ReadState в person-space владельца. - models/notification/src/migration.ts.
- **Server-валидация.** `NotificationMiddleware.tx`: создаёт ReadState при первом ThreadMessage; на update разрешает менять только свой ключ `[account.uuid]`, отклоняет откат `timestamp` назад и tx от `systemAccountUuid`/trigger-контекста; кэш `activeStates` чистится по таймеру раз в 20 минут, удаляя записи, не обновлявшиеся 10 минут. - server-plugins/notification/src/middleware.ts.
- **Галочки прочтения + popup "кто прочитал".** `MessageReadMarker`/`MessageReadPopup` в `ChatMessagePresenter`. - plugins/chunter-resources/src/components/chat-message/ChatMessagePresenter.svelte.
- **Клиентский кэш ReadState.** `loadReadState`/`getReadState` в сторе `readStateByDoc`. - plugins/notification-resources/src/inboxNotificationsClient.ts.
- **Mark-as-read.** Actions `ReadNotifyContext`/`ReadAll`/`RemoveContextNotifications`; `readDoc`/ `forceReadDocState` продвигают `lastView` до `max(lastUpdate, lastView)` и ставят `isViewed: true` непрочитанным InboxNotification контекста. - models/notification/src/actions.ts; plugins/notification-resources/src/inboxNotificationsClient.ts.

### Производительность

- **Server-side агрегация activity.** При частых обновлениях markup storage объединяет `DocUpdateMessage` в окне `activityAggregationDelay` (по умолчанию 5 минут) вместо создания новой записи. - server/collaborator/src/storage/platform.ts.
- **Защита поиска от гонки запросов.** Счётчик `generation` в `createChatSearchStore.run` - ответ устаревшего запроса не перезаписывает состояние. - plugins/chunter-resources/src/search/store.ts.
- **Дедупликация результатов поиска.** `appendUnique` отбрасывает повторные `_id` при переиндексации между страницами. - plugins/chunter-resources/src/search/store.ts.
- **Кэширование в middleware.** `hiddenChats` (server-plugins/chunter/src/middleware.ts) и `activeStates` (server-plugins/notification/src/middleware.ts) - in-memory Map с ленивой подгрузкой из low-level storage, не ходят в БД на каждый tx.

### Уведомления

- **Mute чата.** Action `EditDocNotifications` с popup `MutePopup`. - models/notification/src/actions.ts; plugins/notification-resources/src/components/MutePopup.svelte.
- **Web-push deep-links к треду/сообщению.** `createPush` строит `onClickLocation.path` и `query.message` по `getNotificationThreadId`/`getNotificationMessageId`, локализует текст перед отправкой. - server-plugins/notification-resources/src/push.ts; plugins/notification/src/utils.ts.
- **Локализованные email/push.** `getTranslatedNotificationContent`; email-шаблоны per-типа (`DMNotification*`, `ChannelNotification*`, `ThreadNotification*`, `JoinChannelNotification*`). - server-plugins/notification-resources/src/utils.ts; models/chunter/src/notifications.ts.
- **Чат-типы уведомлений и группа.** `defineNotifications` регистрирует `ChunterNotificationGroup` и 4 типа (`DMNotification`, `ChannelNotification`, `JoinChannelNotification`, `ThreadNotification`) с дефолтными enabled-списками для Inbox/Push/Sound-провайдеров. - models/chunter/src/notifications.ts.
- **Cross-workspace unread-маркер.** `pulse.class.WorkspacesNotification` - per-аккаунт карта "есть непрочитанное" по воркспейсам; `workspacesNotificationStore` в воркбенче; `NotificationMiddleware` переносит документ в PersonSpace владельца. - plugins/pulse/src/types.ts; plugins/workbench-resources/src/workbench.ts; server-plugins/notification/src/middleware.ts. Доставка этих tx по сети всем воркспейсам аккаунта - известная точка избыточности, см. docs/memory/presence-fanout.md.
- **Taskbar-бейдж / трей-иконка.** `getBadgeIconInfo` -> `TrayIconWithBadge.ico`; desktop выставляет бейдж через `electronAPI.setBadge`. - desktop/src/main/trayUtils.ts; desktop/src/ui/notifications.ts.
- **Генератор типов уведомлений per-атрибут.** `generateClassNotificationTypes` создаёт `MessageNotificationType` на каждый непубличный атрибут класса (card sub-groups). - models/notification/src/notifications.ts.
- **Отдельный контроль collaborators-уведомлений.** `MeAddedInCollaboratorsNotification`/ `MeRemovedFromCollaboratorsNotification` - мьютятся отдельно от чата. - models/notification/src/notifications.ts.
- **Десктоп-уведомления из inbox.** `hydrateNotificationAsYouCan` гидрирует последнее inbox-уведомление; `BrowserNotification.onClickLocation` (soundAlert, messageId). - desktop/src/ui/notifications.ts; server-plugins/notification-resources/src/push.ts.

### Inbox

- **Storage: PersonSpace владельца.** `migrateNotificationsSpace` переносит `DocNotifyContext` и все InboxNotification-классы в person-space; `migrateDuplicateContexts` дедуплицирует по `(objectId, user)`, оставляя самый свежий `lastView`. - models/notification/src/migration.ts.
- **"Удалено ≠ архивировано".** Клиент запрашивает `archived: false` у Common/ActivityInboxNotification; удалённые уведомления физически удаляются. - plugins/notification-resources/src/inboxNotificationsClient.ts.
- **Группированная лента.** `InboxGroupedListView` группирует по `DocNotifyContext`. - plugins/notification-resources/src/components/inbox/InboxGroupedListView.svelte.
- **Единый клиент inbox.** `InboxNotificationsClientImpl` - живые запросы DocNotifyContext/ Common/ActivityInboxNotification, объединённые в `inboxNotifications`/`inboxNotificationsByContext`, плюс кэш ReadState. - plugins/notification-resources/src/inboxNotificationsClient.ts.
- **Миграция полей.** `migrateCommonNotificationFields` (`messageHtml` -> `markup`); `migrateCollaborators` (mixin Collaborators -> DOMAIN_COLLABORATOR). - models/notification/src/migration.ts.

## Куда смотреть, если нужно...

- Добавить новый тип уведомления чата -> `defineNotifications`, models/chunter/src/notifications.ts.
- Изменить правила дедупликации/неизменяемости DM -> `ChunterMiddleware.onDirectCreate`/ `onDirectUpdate`, server-plugins/chunter/src/middleware.ts.
- Поменять логику read receipts на сервере -> `NotificationMiddleware.tx`, server-plugins/notification/src/middleware.ts.
- Изменить содержимое/локализацию push и email -> server-plugins/notification-resources/src/{push,utils}.ts.
- Добавить транспорт доставки push (кроме web/APNs/FCM) -> services/notification/pod-notification/src/mobile.ts.
- Изменить поведение inbox-ленты (группировка, выбор после удаления) -> plugins/notification-resources/src/components/inbox/InboxGroupedListView.svelte.
- Поменять формулу поиска по сообщениям (пагинация, фильтры) -> plugins/chunter-resources/src/search/store.ts.
- Добавить/поменять action на сообщении или канале -> models/chunter/src/actions.ts.
- Изменить миграцию дублей DM/контекстов -> models/chunter/src/migration.ts (`migrateDuplicatedDirects`), models/notification/src/migration.ts (`migrateDuplicateContexts`).
- Поменять cross-workspace бейдж непрочитанного -> plugins/pulse/src/types.ts, plugins/workbench-resources/src/workbench.ts, desktop/src/main/trayUtils.ts.
- Изменить окно агрегации activity-записей -> `activityAggregationDelay`, server/collaborator/src/storage/platform.ts.

## Настройки и конфигурация

- `serverNotification.metadata.WebPushUrl` - базовый URL пода push-доставки (`<url>/web-push`). - server-plugins/notification-resources/src/push.ts.
- `serverNotification.metadata.MailAuthToken` - Bearer-токен авторизации к `pod-notification` (TODO в коде: убрать после миграции на новые сервисы). - server-plugins/notification-resources/src/push.ts.
- `config.AuthToken`, `config.PushPublicKey`/`PushPrivateKey`/`PushSubject` (VAPID) - services/notification/pod-notification/src/config.ts.
- `preferences.showUnreadCounter` - скрывает счётчик непрочитанных в desktop-трее. - desktop/src/ui/notifications.ts.

## Тесты

- Unit: server-plugins/chunter/src/__tests__/direct-create.spec.ts (dedup/инварианты DM).
- Unit: server-plugins/chunter-resources/src/__tests__/search.test.ts (search title providers).
- Unit: server-plugins/notification-resources/src/__tests__/docClassChanged.test.ts.
- Unit: plugins/chunter-resources/src/search/__tests__/{store,resolve,classes,highlight}.test.ts (поиск по чату).
- Unit: plugins/chunter-assets/src/__tests__/lang.test.ts, plugins/notification-assets/src/__tests__/lang.test.ts (полнота переводов).
- Sanity (Playwright): tests/sanity/tests/chat/{chat,direct-chat,message-search}.spec.ts, tests/sanity/tests/inbox/inbox.spec.ts.

## Связанные документы

- [../new-pulse.md](../new-pulse.md), [../pulse.md](../pulse.md) - архитектура плагина `pulse` (DocumentPresence/TypingIndicator), в котором живёт `WorkspacesNotification`.
- [../memory/presence-fanout.md](../memory/presence-fanout.md) - известная неэффективность доставки presence/unread-статуса по всем воркспейсам аккаунта.
- [../memory/sidebar-widget-tabs.md](../memory/sidebar-widget-tabs.md) - модель вкладок sidebar, которую использует открытие треда чата в сайдбаре (`openThreadInSidebar`).
