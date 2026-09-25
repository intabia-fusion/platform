# Чат: загрузка окна и чтение при скролле

Область: [Чат](../features/chat.md)

Механизм из трёх частей: `ChatViewport` (`plugins/chunter-resources/src/chatViewport.ts`) грузит окно сообщений и решает, с какого места открыть канал; `ReverseChannelScrollView.svelte` скроллит и подгружает; `scroll.ts` пишет позицию чтения в `ReadState`. Непрочитанное при этом хранит и считает асинхронный сервис уведомлений (`services/notifications`), поэтому большинство нижеперечисленных решений - про гонки между клиентом и этим сервисом.

## С какого сообщения открывать канал

- Есть ли непрочитанное, вьюпорт узнаёт не только из `ReadState`: `ReadState.latestMessageTimestamp` пишет сервис уведомлений, и он может отставать от реальной ленты. Поэтому `Channel.svelte` дополнительно передаёт в `ChatViewport.getOrCreate` флаг `hasUnread` из `unreadByDoc` (точный `unreadMessagesCount`), а `resolveUnreadAnchor` считает `hasUnread = флаг || latestMessageTs === 0 || latestMessageTs > lastViewTs`.
- Первая страница грузится, не дожидаясь `ReadState`, чтобы не задерживать первый рендер. Побочный эффект: если пользователь нажал `jumpToEnd` до ответа, новая инициализация обязана подхватить тот же pending-промис `ReadState`, иначе анкор непрочитанного теряется (тест 1.11 в `__tests__/chatViewport.test.ts`).

## Пагинация и скролл

- Несколько сообщений могут иметь одинаковый `createdOn` (одна миллисекунда). Поэтому курсор пагинации включительный (`$lte/$gte`), дубли на границе страниц снимает `getBoundaryOverlapIds`, а если после фильтра страница пуста при `hasMore` - запрос повторяется со строгим неравенством.
- Scroll jump (коммит 780049bc6e): `ResizeObserver` доскролливал к низу только при `shouldScrollToNew`. Если пользователь был у низа, но флаг ещё не стоял, подгрузка картинки сдвигала позицию. Теперь `isScrollAtBottom` учитывается наравне с флагом, при `isTailLoaded` у низа `shouldScrollToNew` ставится принудительно, а фоновая подгрузка истории (`loadMore`) не стартует, пока `shouldScrollToNew || isScrollAtBottom`.

## Чтение и счётчики

- Сервис увеличивает счётчики сразу при генерации уведомления, а клиент прочитывает документ только после round-trip. Чтобы бейдж не мигал +1/-1 на каждое сообщение открытого канала, клиент помечает открытый документ `setDocReading(doc, true, reader)`, а `publishUnread` (`plugins/notification-resources/src/client.ts`) вычитает `min(notifiedMessagesCount, unreadCount)` таких документов из `totalUnreadCount`. `reader` - идентификатор вьюпорта (панель или сайдбар): закрытие одного не гасит чтение другого.
- Каждое обновление `unreadMessagesCount`/`ReadState` заново запускает реактивный `forceReadDocState` в открытом чате. Без паузы forced-read улетал бы повторно, пока сервис не догонит счётчик до нуля, поэтому он троттлится `forceReadPauseMs` = 3 с (`ReverseChannelScrollView.svelte`).
- Пользователь может прочитать сообщение раньше, чем сервис допишет его в `unreadMessages`. Локально прочитанные id копятся в `chatReadMessagesStore`, и при обновлении контекста `recheckNotifications` (`scroll.ts`) досылает `ReadNotificationAction`, иначе остаётся призрачное непрочитанное.
- Аккумулятор чтения в `scroll.ts` - `Map` по `_id`, а не `Set` литералов: `Set` сравнивает по ссылке и копил дубли до флаша.

## Сервер и БД

- Auto-unhide скрытого чата в `ChunterMiddleware` завязан на `DocNotifyContext` (create с непустыми `unreadMessages` и `latestNotifications` или `$push` message-уведомления), а не на `TxCreateDoc` сообщения: чат раскрывается в момент реального уведомления. Mention тоже кладётся в `unreadMessages`, поэтому раскрывает скрытый DM.
- `activity.replies` вынесен в колонку (`0005_activityReplies.sql`): в jsonb число сравнивается как текст и не индексируется, а списку тредов нужен `WHERE replies > 0 ORDER BY modifiedOn DESC`. Модель `TActivityMessage` при этом не менялась.

## Тесты

- Sanity-тесты доставки (`tests/sanity/tests/chat/chat-notifications.spec.ts`, `chat-unread.spec.ts`) заводят второго пользователя через REST (`ChatMember`, `tests/sanity/tests/API/ChatApi.ts`) вместо второго браузера с инвайтом. `checkNavCounterStaysAway` (`model/chat-unread-page.ts`) проверяет, что счётчик не мигает в течение `settleMs`.
