# Чат

> Сверено с кодом: коммит 94bd827fd9, 2026-09-25.

Внутренний чат платформы: каналы, direct-сообщения, треды, загрузка окна сообщений, чтение при скролле, навигатор с бейджами непрочитанного, поиск. Сущности: `Channel`/`DirectMessage` (пространства чата), `ChatMessage`/`ThreadMessage` (сообщения), `Chat` (личное состояние pin/hidden). Непрочитанное и уведомления хранятся в `DocNotifyContext`/`ReadState` - их модель, сервис-генератор, inbox, push и email описаны в [notifications.md](notifications.md); здесь - только то, как чат их читает и показывает.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-chunter | models/chunter/src | Модель чата: классы Channel/DirectMessage/ChatMessage/ThreadMessage/Chat/ChatSyncInfo, actions, миграции, чат-типы уведомлений |
| chunter | plugins/chunter/src | Клиентские типы и утилиты: createDirect/createAndGetDirect/findExistingDirect, ресурсы `ShowNotifyMarkerFn` (plugins/chunter) и `GetUnreadThreadsCountStore` (plugins/chunter-resources/src/plugin.ts) |
| chunter-resources | plugins/chunter-resources/src | UI чата: `chatViewport.ts` (окно сообщений), `scroll.ts` (чтение при скролле), навигатор, сообщения, треды, поиск, sidebar-виджеты |
| chunter-assets | plugins/chunter-assets/src | Иконки и переводы чата |
| server-chunter | server-plugins/chunter/src | ChunterMiddleware: dedup DM, инварианты DM, auto-unhide скрытых чатов по `DocNotifyContext` |
| server-chunter-resources | server-plugins/chunter-resources/src | Триггеры: `syncChat` (авто-скрытие давно неактивных чатов), search-title-providers |
| notification / notification-resources | plugins/notification{,-resources}/src | `NotificationClient` (`unreadByDoc`, `readStateByDoc`, `setDocReading`, `forceReadDocState`) - см. notifications.md |
| activity | plugins/activity/src | `ActivityMessage`/`ActivityMessageLite`, `replies` |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TChunterSpace` | база каналов/DM, `core.Space` | models/chunter/src/types.ts |
| `TChannel` | канал: `topic` (FullText), скрытые `icon`/`emoji` | models/chunter/src/types.ts |
| `TDirectMessage` | DM/группа: readonly `type: 'person'\|'group'` | models/chunter/src/types.ts |
| `TChatMessage` | сообщение: `message` (FullText), `attachments` | models/chunter/src/types.ts |
| `TThreadMessage` | сообщение треда: `attachedTo`/`attachedToClass` (родительский ActivityMessage), `objectId`/`objectClass` | models/chunter/src/types.ts |
| `TChat` | персональное состояние (`pinned`/`hidden`) аккаунта для канала/DM, AttachedDoc в PersonSpace | models/chunter/src/types.ts |
| `TChatSyncInfo` | отметка последнего `syncChat` аккаунта | models/chunter/src/types.ts |
| `ActivityMessage.replies` | число ответов; в Postgres вынесено в колонку `activity.replies` с частичным индексом `WHERE replies > 0` (список тредов "новые сверху") | services/db-migrator/migrations/0005_activityReplies.sql |
| `ReadState` | `[account]: {messageId, timestamp}` + `latestMessageId/latestMessageTimestamp` | plugins/notification/src/types.ts |
| `DocNotifyContext` | `unreadMessages`, `unreadMessagesCount` (число в навигаторе), `notifiedMessagesCount` (цвет маркера), `parentObjectId` (тред -> канал) | plugins/notification/src/types.ts |

## Как работает

1. **Создание DM с дедупликацией.** Клиент `createAndGetDirect`/`findExistingDirect` сначала ищет существующий DM по составу участников (plugins/chunter/src/utils.ts) -> при создании `ChunterMiddleware.onDirectCreate` на сервере считает `referenceId = sha256(sorted members)`, форсирует `private=true/archived=false/autoJoin=false`, добавляет автора в members (но не `systemAccountUuid`, иначе группа обходит дедуп) и возвращает `Forbidden`, если DM с таким `referenceId` уже существует (только для 1:1, `members.length <= 2`) - server-plugins/chunter/src/middleware.ts. Изменение `referenceId`/`private`/`type` у DM запрещено всегда; изменение `members` запрещено, если у DM уже есть `referenceId` или `type: 'person'` - `onDirectUpdate`.
2. **Открытие канала -> окно сообщений.** `Channel.svelte` берёт `hasUnread` из `unreadByDoc`, запрашивает `ReadState` (не дожидаясь) и получает `ChatViewport.getOrCreate(readState, attachedTo, selectedMessageId, limit=50, isThread, hasUnread)` - plugins/chunter-resources/src/chatViewport.ts. `initializeViewport` одним `Promise.all` грузит последнюю страницу (`limit+1`, `createdOn desc`), ждёт `ReadState` и, при deep-link, целевое сообщение. Без цели `resolveUnreadAnchor` ищет первое непрочитанное чужое сообщение (`createdBy $nin me.socialIds`, позже `ReadState[me].timestamp`; локально по загруженной странице, иначе отдельный `findOne`). Если анкор старше последней страницы - `loadAnchoredStart` грузит окно `limit/2` назад и вперёд от него; иначе `applyLatestTail` и live-хвост `subscribeToLiveTail` через `createQuery`. `newTimestamp` = `createdOn` анкора - позиция разделителя "New".
3. **Скролл и подгрузка.** `ReverseChannelScrollView.svelte`: `initializeScroll` скроллит к сообщению, к разделителю "New" (`newSeparatorOffset=150`) или к низу; подгрузка вверх/вниз при `loadMoreThreshold=200` px через `viewport.loadMore` (`loadMoreInternal`/`queryHistoryChunk`: курсор по `createdOn` с `$lte/$gte`, дубли на границе вычищает `getBoundaryOverlapIds`, при пустой странице - fallback на строгое неравенство). Любой ответ, пришедший после `resetViewport`, отбрасывается (`viewportVersion`/`StaleVersionError`). Кнопка "Latest messages" -> `jumpToEnd`; `JumpToDateSelector` -> `jumpToDate`; смена `selectedMessageId` -> `jumpToMessageId` (fast path, если сообщение уже загружено).
4. **Живые обновления.** `ChatViewport.handleTransactions` (`addTxListener`) патчит загруженные сообщения/реакции/вложения локально через `TxProcessor.updateDoc2Doc`, при `tx.modifiedOn` старше текущего - рефетч; новые сообщения приходят через live-хвост, `ReverseChannelScrollView` доскролливает, если пользователь у низа (`shouldScrollToNew`, `|scrollTop| < 100`).
5. **Чтение при скролле.** `readViewportMessages` (plugins/chunter-resources/src/scroll.ts) собирает видимые сообщения по `getBoundingClientRect`, дебаунс 500 мс на чат (`immediate` при закрытии вью); параллельно `IntersectionObserver` в `ReverseChannelScrollView` (`observeMessage`/`flushReadQueue`, тоже 500 мс). Оба зовут `readMessages`: `ReadState[me] = {messageId, timestamp}` только если timestamp больше сохранённого (`lastViewTimestampStore`), плюс `ReadNotificationAction` с `reactionIds` попавших во вьюпорт сообщений. Сервер валидирует запись (`NotificationMiddleware`), сервис уведомлений снимает непрочитанное (`module/read.ts`). `recheckNotifications` досылает `ReadNotificationAction`, если контекст обновился позже, чем пользователь прочитал сообщение (`chatReadMessagesStore`).
6. **Открытый чат считается читаемым.** Пока `isReadingTail` (окно сфокусировано, скролл у низа `|scrollTop| < 50`, хвост загружен) - `inboxClient.setDocReading(object._id, true, reader)`; `reader` различает главную панель и сайдбар. Раз в `forceReadPauseMs=3000` при ненулевом `unreadMessagesCount` вызывается `forceReadDocState` - подчищает расхождение с сервисом. - plugins/chunter-resources/src/components/ReverseChannelScrollView.svelte.
7. **Кэш вьюпортов.** `ChatViewport` держит раздельные LRU-кэши каналов и тредов (`MAX_CACHE_SIZE=10`, `TTL_MS` 15 минут, проверка раз в 5 минут); активные (`acquire`/`release`) не вытесняются; при повторном открытии unread-маркер пересчитывается по свежему `ReadState` (`syncUnreadMarker`). - plugins/chunter-resources/src/chatViewport.ts.
8. **Навигатор.** Секции в `chatNavGroupModels` (plugins/chunter-resources/src/components/chat/utils.ts): starred и channels - по алфавиту; direct - `sortDirects` (личные: сначала online, затем алфавит; группы после); activity (треды и прочие объекты) - `sortActivityChannels`: сначала с `unreadMessagesCount > 0` по `modifiedOn` контекста, затем по `modifiedOn` объекта; группа activity `deferred: true` - грузится после остальных. Бейдж `ChatNavItem.svelte`: число `unreadMessagesCount`, цвет `notifiedMessagesCount === 0 ? gray : red`; свёрнутая секция показывает сумму. Маркер приложения "Чат" - `ShowNotifyMarkerFn` (plugins/chunter-resources/src/index.ts) с учётом `showChatBadge`. Счётчик Threads - `unreadThreadsCountStore` (plugins/chunter-resources/src/stores.ts): контексты с `notifiedMessagesCount > 0`, чей `objectClass` - `ActivityMessage`.
9. **Скрытый чат получает сообщение -> auto-unhide.** `ChunterMiddleware.tx` (server-plugins/chunter/src/middleware.ts): на `TxCreateDoc<DocNotifyContext>` с непустыми `unreadMessages` и `latestNotifications`, либо на `TxUpdateDoc` с `$push` `message`-уведомления в `latestNotifications` (`combineAttributes`) ищет скрытые `Chat` по объекту (`getHiddenChats`, кэш `hiddenChats`) и шлёт `getUnhideChatsTx` через `derived.tx`. Т.е. чат "выныривает" в момент создания уведомления, а не сырой Tx сообщения; mention тоже попадает в `unreadMessages`, поэтому раскрывает чат.
10. **Auto-hide неактивных чатов.** `OnUserStatus` -> `syncChat` (server-plugins/chunter-resources/src/index.ts): раз в `updateChatInfoDelay` (24 ч) на пользователя (`ChatSyncInfo`), коалесинг реконнектов `syncChatCoalesceMs=60 с`, `RateLimiter(4)`; скрывает не-pinned `Chat` (не `Channel`), у которых `ReadState.latestMessageTimestamp` старше `hideDelay` (14 дней) и нет notified-непрочитанного (`UnreadMessageId.notified` / `UnreadMessageChunk.notifiedCount`). Разовый проход по всем чатам - миграция `hide-inactive-chats-v1` (models/notification/src/migration.ts).
11. **Поиск по сообщениям.** `createChatSearchStore` шлёт полнотекстовый запрос (`searchIn: 'content'`, `PAGE_SIZE=50`) с курсором и счётчиком `generation`, отбрасывающим ответы устаревших запросов - plugins/chunter-resources/src/search/store.ts. Для DM `ChunterMiddleware.findAll` добавляет `'*'`-префикс к `$search`, если он не задан явно.

## Фичи

### Ядро чата

- **Каналы как пространства.** `TChannel extends TChunterSpace extends TSpace`, `topic` под FullText-индексом, скрытые `icon`/`emoji`. - models/chunter/src/types.ts.
- **DM и групповые диалоги.** `TDirectMessage` - вариант ChunterSpace с readonly `type: 'person'|'group'` (>2 участников = группа). - models/chunter/src/types.ts.
- **Server-дедупликация 1:1 DM через referenceId.** SHA-256 отсортированных members, `Forbidden` при повторе; действует только для DM из 2 участников. - `ChunterMiddleware.onDirectCreate`, `getMembersHash`, server-plugins/chunter/src/middleware.ts; тест server-plugins/chunter/src/__tests__/direct-create.spec.ts.
- **Защита неизменяемости DM.** `referenceId`/`private`/`type` менять нельзя никогда; `members` - нельзя, если у DM есть `referenceId` или `type: 'person'`. - `ChunterMiddleware.onDirectUpdate`, server-plugins/chunter/src/middleware.ts.
- **Переход в DM с персоной.** Клик по упоминанию сотрудника (в тексте сообщения - через `contact.component.EmployeePresenter` inline, а не голый `ObjectMention`) и по ссылке на сотрудника внутри приложения chunter открывает DM, а не карточку персоны; кнопки "Сообщение"/"Позвонить" (`contact.extension.EmployeePopupActions`) есть и в тултипе, и в заголовке карточки персоны (`PersonHeaderActions` на `view.extensions.EditDocTitleExtension`); в шапке 1:1 DM - кнопка перехода в карточку и точка расширения `chunter.extensions.DirectHeaderExtension` (props `{ employee }`), куда love кладёт `InviteEmployeeButton` (звонок как в офисе; скрыт для себя и AI-бота, заблокирован, если нет миксина Employee или `active !== true`). - `openDirectForPerson`, plugins/chunter-resources/src/utils.ts; packages/presentation/src/components/markup/ObjectNode.svelte; plugins/contact-resources/src/components/PersonElement.svelte, `person/PersonHeaderActions.svelte`; plugins/chunter-resources/src/components/ChannelHeader.svelte.
- **URL канала и директа.** `path[3]` любого `ChunterSpace` - `<имя>-<id>` без `|<class>` (`view.mixin.LinkIdProvider` на `ChunterSpace`/`Channel`/`DirectMessage`: `getChunterSpaceLinkId`/`parseChunterSpaceLinkId`); у модельных каналов `:` заменяется на `-` (`chunter:space:General` -> `chunter-space-General`). Без `|` класс декодируется как `ChunterSpace`, конкретный берётся из загруженного документа. Прочие документы в чате - по-прежнему `<id>|<class>`; старые ссылки `<id>|<class>` открываются. - `encodeChatURI`/`openChunterSpace`, plugins/chunter-resources/src/navigation.ts; `decodeChatURI`/`toChunterSpaceLinkId`/`parseChunterSpaceLinkId`, plugins/chunter-resources/src/linkId.ts (тест `__tests__/linkId.test.ts`); models/chunter/src/index.ts. В аналитику URL уходит без имени: `stripLinkSlugs`, packages/ui/src/location.ts.
- **Ссылка на канал.** Пункт "Копировать ссылку" в контекстном меню канала в навигаторе (`getLink` -> `GetChunterSpaceLinkFragment`). - plugins/chunter-resources/src/components/chat/navigator/ChatNavItem.svelte.
- **Каналы в `@` и поиске.** `ObjectSearchCategory` `chunter.completion.ChannelCategory` (context search/mention/spotlight, fulltext по `Space.name`/`Channel.topic`); упоминание канала рендерится `ObjectMention` и ведёт в канал. - models/chunter/src/index.ts, `queryChannels`, plugins/chunter-resources/src/utils.ts.
- **Миграция дублированных DM.** `migrateDuplicatedDirects` сливает старые DM с одинаковым составом (сообщения, реакции, вложения, inbox-уведомления), удаляет дубли. - models/chunter/src/migration.ts (state `migrate-duplicated-directs-v1`).
- **Треды.** `TThreadMessage extends TChatMessage`, действие `ReplyToThread` (visibility-tester `CanReplyToThread`); тред открывается тем же `ChatViewport` с `isThread=true` (отдельный кэш); контекст треда несёт `parentObject*` канала. - models/chunter/src/types.ts; models/chunter/src/actions.ts; plugins/chunter-resources/src/components/threads.
- **Список Threads.** Сообщения с `replies > 0`, новые сверху, по колонке `activity.replies`. - plugins/chunter-resources/src/components/threads/Threads.svelte; services/db-migrator/migrations/0005_activityReplies.sql.
- **Reply на сообщение.** Action `ReplyToMessage`. - models/chunter/src/actions.ts.
- **Forward сообщения.** Action `ForwardMessage` -> `ForwardMessageDialog`. - models/chunter/src/actions.ts; plugins/chunter-resources/src/index.ts.
- **Вложения.** `TChatMessage.attachments` (PropCollection `attachment.class.Attachment`). - models/chunter/src/types.ts.
- **Поиск по сообщениям.** `createChatSearchStore` (пагинация курсором, `generation` против гонок, `appendUnique` против дублей при переиндексации, `@Index(FullText)` на `message`), автодогрузка "тонких" страниц (< PAGE_SIZE/2, не более `MAX_AUTO_PAGES=5`), которые сами не запускают скролл-догрузку. - plugins/chunter-resources/src/search/store.ts; models/chunter/src/types.ts.
- **Архивация каналов.** Actions `ArchiveChannel`/`UnarchiveChannel`, фильтр `archived` в навигаторе. - models/chunter/src/actions.ts; plugins/chunter-resources/src/components/chat/navigator/ChatNavGroup.svelte.
- **Личное состояние чата (pin/hidden).** `TChat` (AttachedDoc в PersonSpace); auto-unhide и auto-hide - "Как работает" п.9-10.
- **Дефолтные каналы general/random.** Upgrade-миграция создаёт `chunter.space.General`/`Random` (autoJoin=true). - `createGeneral`/`createRandom`/`joinEmployees`, models/chunter/src/migration.ts.
- **Миграции истории.** `convertCommentsToChatMessages`, `removeOldClasses`, `removeWrongActivity`, `migrateMessagesSpace`, `removeUnavailableChats`. - models/chunter/src/migration.ts.
- **Deep-link на тред/сообщение.** `openChannel` пишет thread в `loc.path[4]`; `openMessageFromSpecial`/`openSearchResult` собирают путь + `query.message`; `openThreadInSidebar` открывает тред в сайдбаре. - plugins/chunter-resources/src/navigation.ts.
- **Чат-типы уведомлений.** `defineNotifications` регистрирует `ChunterNotificationGroup` и типы `DMNotification`, `ChannelNotification`, `JoinChannelNotification`, `ThreadNotification` с дефолтами провайдеров и email-шаблонами. - models/chunter/src/notifications.ts. Обработка - в [notifications.md](notifications.md).
- **Mute чата.** Action `EditDocNotifications` -> `MutePopup` (all/mentions/mute). В mentions-only и muted чате сообщения копятся в `unreadMessages` без уведомления: серый счётчик, маркера нет; mention пробивает mentions-only (красный). - plugins/notification-resources/src/components/MutePopup.svelte.

### Окно сообщений и чтение

- **`ChatViewport`.** `getOrCreate`/`acquire`/`release`, `initializeViewport`, `resolveUnreadAnchor`, `loadAnchoredStart`, `subscribeToLiveTail`, `loadMore`, `jumpToDate`/`jumpToMessageId`/`jumpToEnd`, `syncUnreadMarker`/`refreshUnreadMarker`, `handleTransactions`. Заменил удалённый `channelDataProvider.ts`. - plugins/chunter-resources/src/chatViewport.ts.
- **Разделитель "New".** `newTimestamp` по первому непрочитанному чужому сообщению (`ReadState[me].timestamp`, `hasUnread` из `unreadByDoc`); пропадает при повторном открытии прочитанного канала. - `resolveUnreadAnchor`, chatViewport.ts; `separatorIndex`, ReverseChannelScrollView.svelte.
- **Первый рендер не ждёт ReadState.** Страница грузится параллельно с `ReadState`; ранний `jumpToEnd` подхватывает тот же pending-промис. - `initializeViewport`, chatViewport.ts.
- **Чтение по вьюпорту + IntersectionObserver.** `readViewportMessages`/`readMessages`/`recheckNotifications`. - plugins/chunter-resources/src/scroll.ts; ReverseChannelScrollView.svelte.
- **Галочки прочтения + popup "кто прочитал".** `MessageReadMarker`/`MessageReadPopup` в `ChatMessagePresenter` по `ReadState`. - plugins/chunter-resources/src/components/chat-message/ChatMessagePresenter.svelte.
- **Sidebar-виджеты.** `ChannelSidebarView`, `ChatWidgetTab`, `WorkbenchTabExtension` - тот же вьюпорт с отдельным `reader` для `setDocReading`. - plugins/chunter-resources/src/components.

### Навигатор

- **Секции и сортировка.** `chatNavGroupModels`, `sortDirects`, `sortActivityChannels`, `deferred` для activity. - plugins/chunter-resources/src/components/chat/utils.ts; navigator/{ChatNavigator,ChatNavGroup,ChatNavSection,ChatNavItem}.svelte.
- **Бейджи.** Число `unreadMessagesCount`, цвет по `notifiedMessagesCount`, маркер приложения `ShowNotifyMarkerFn` + `showChatBadge`, счётчик Threads `unreadThreadsCountStore`. - navigator/ChatNavItem.svelte; plugins/chunter-resources/src/index.ts; stores.ts.
- **Скрытые и закреплённые чаты.** `Chat.hidden/pinned`, auto-unhide (`ChunterMiddleware`), auto-hide (`syncChat`).

### Производительность

- **Server-side агрегация activity.** При частых обновлениях markup storage объединяет `DocUpdateMessage` в окне `activityAggregationDelay` (по умолчанию 5 минут). - server/collaborator/src/storage/platform.ts.
- **Локальные патчи вместо рефетча.** `ChatViewport.handleTransactions` применяет Tx к загруженным сообщениям; рефетч только при конфликте `modifiedOn`. - plugins/chunter-resources/src/chatViewport.ts.
- **Кэш вьюпортов и отложенная activity-группа.** "Как работает" п.7-8.
- **Защита поиска от гонки и дублей.** `generation`, `appendUnique`. - plugins/chunter-resources/src/search/store.ts.
- **Кэш `hiddenChats` в middleware.** In-memory Map с ленивой подгрузкой из low-level storage. - server-plugins/chunter/src/middleware.ts.

## Куда смотреть, если нужно...

- Изменить, с какого сообщения открывается канал / где стоит "New" -> `resolveUnreadAnchor`, `loadAnchoredStart`, plugins/chunter-resources/src/chatViewport.ts.
- Поменять пагинацию/размер страницы/кэш вьюпортов -> `ChatViewport` (`limit`, `MAX_CACHE_SIZE`, `TTL_MS`), chatViewport.ts.
- Изменить, когда сообщение считается прочитанным -> plugins/chunter-resources/src/scroll.ts (`readViewportMessages`, `readMessages`), `observeMessage`/`isReadingTail` в ReverseChannelScrollView.svelte; серверная сторона - [notifications.md](notifications.md).
- Поменять сортировку/секции/бейджи навигатора -> plugins/chunter-resources/src/components/chat/utils.ts, navigator/ChatNavItem.svelte.
- Изменить правила дедупликации/неизменяемости DM -> `ChunterMiddleware.onDirectCreate`/`onDirectUpdate`, server-plugins/chunter/src/middleware.ts.
- Изменить условия auto-unhide / auto-hide чатов -> server-plugins/chunter/src/middleware.ts (`tx`), server-plugins/chunter-resources/src/index.ts (`syncChat`, `hideDelay`).
- Поменять формулу поиска по сообщениям -> plugins/chunter-resources/src/search/store.ts.
- Добавить/поменять action на сообщении или канале -> models/chunter/src/actions.ts.
- Добавить чат-тип уведомления -> `defineNotifications`, models/chunter/src/notifications.ts.
- Изменить окно агрегации activity-записей -> `activityAggregationDelay`, server/collaborator/src/storage/platform.ts.
- Написать sanity-тест на доставку/непрочитанное -> `ChatMember` (tests/sanity/tests/API/ChatApi.ts) для второго пользователя по REST, `ChatUnreadPage` (tests/sanity/tests/model/chat-unread-page.ts).

## Настройки и конфигурация

- `NotificationAppearancePreference.showChatBadge` - маркер на иконке чата.
- `DocNotificationSetting.mode` - режим канала (all/mentions/mute).
- Константы клиента: `limit=50`, `MAX_CACHE_SIZE=10`, `TTL_MS=15 мин` (chatViewport.ts); дебаунс чтения 500 мс (scroll.ts); `loadMoreThreshold=200`, `newSeparatorOffset=150`, `forceReadPauseMs=3000` (ReverseChannelScrollView.svelte); `SUMMARY_TIMEOUT_MS=3 мин` (stores.ts).
- Константы сервера: `updateChatInfoDelay=24 ч`, `hideDelay=14 дней`, `syncChatCoalesceMs=60 с` (server-plugins/chunter-resources/src/index.ts).

## Тесты

- Unit: plugins/chunter-resources/src/__tests__/{chatViewport,scroll,stores,utils}.test.ts (инициализация вьюпорта, анкоры, пагинация без пропусков/дублей, версии, live-Tx, LRU/TTL; чтение по дебаунсу; `unreadThreadsCountStore`).
- Unit: server-plugins/chunter/src/__tests__/direct-create.spec.ts (dedup/инварианты DM); server-plugins/chunter-resources/src/__tests__/search.test.ts.
- Unit: plugins/chunter-resources/src/search/__tests__/{store,resolve,classes,highlight}.test.ts; plugins/chunter-assets/src/__tests__/lang.test.ts.
- Sanity (Playwright): tests/sanity/tests/chat/{chat,direct-chat,message-search}.spec.ts; tests/sanity/tests/chat/chat-notifications.spec.ts (realtime-доставка без reload: сообщения, треды, реакции, правки, mention, mute); tests/sanity/tests/chat/chat-unread.spec.ts (счётчики, маркеры, "New", "Latest messages", mentions-only/muted, Threads). Page objects: tests/sanity/tests/model/{channel-page,chunter-page,chat-unread-page}.ts; REST-помощник tests/sanity/tests/API/ChatApi.ts (`ChatMember`: второй пользователь через API вместо второго браузера).

## Связанные документы

- [notifications.md](notifications.md) - модель `DocNotifyContext`/`ReadState`, сервис `services/notifications`, inbox, push, email, бейджи приложений.
- [../memory/chat-viewport.md](../memory/chat-viewport.md) - неочевидные решения загрузки и чтения чата.
- [../memory/sidebar-widget-tabs.md](../memory/sidebar-widget-tabs.md) - модель вкладок sidebar, которую использует открытие треда чата в сайдбаре (`openThreadInSidebar`).
- [../memory/presence-fanout.md](../memory/presence-fanout.md) - кросс-воркспейс статус непрочитанного.
