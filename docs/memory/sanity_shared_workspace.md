# Shared workspace per worker in sanity tests

Область: [тесты](../testing.md)

`tests/sanity/tests/fixtures.ts` дает один аккаунт/workspace на Playwright worker вместо одного на тест (`sharedWorkspace(invites?)`). Создание workspace стоит ~1.9s (account service + модель для каждого плагина); в профиле 20260907-163654 шаг `setup: account and workspace` занял 145.2s из 1429s прогона, 58.1s из них - `chat/chat.spec.ts` (27 тестов).

## Seats

Free-план дает свежему workspace `usersLimit: 5` (`tests/plan-config.yaml`), AI-бот в счет мест не идет (`getSeatMembers`, `server/account/src/utils.ts`). Фикстура пересоздает workspace после `SEATS_PER_WORKSPACE` (3) инвайтов через `getSecondPageByInvite` - на единицу меньше лимита: тест без тега `@invite` не падает явно на неучтенном инвайте (`assertSeatAvailable` блокирует только вход без мест, а гостя сверх лимита `SeatLimitsMiddleware` тихо переводит в read-only). Тест объявляет нужду тегом `@invite`, `beforeEach` вызывает `sharedWorkspace(testInfo.tags.includes('@invite') ? 1 : 0)`.

## Что ломает shared workspace, и что нет

- `general`/`random` хранят сообщения прошлых тестов воркера - любая проверка сообщения (особенно отрицательная, как в тесте на удаление) нужна с текстом, уникальным на тест и на retry: `${testInfo.testId}${testInfo.retry}`.
- Имена каналов должны нести тот же суффикс: `generateTestData()` строит их из `faker.lorem.word` с конечным списком слов, навигатор матчит по accessible name - `Aonforto` матчился и с `Aonforto 1` (непрочитанный бейдж).
- Таблица каналов перечисляет весь workspace, поиск по имени владельца матчил несколько строк - `ChannelPage.clickOnUser` (`tests/sanity/tests/model/channel-page.ts`) берет канал и скоупит строку.
- Sidebar layout не ломается: он живет в localStorage под `workbench.<workspace>.<account>.sidebar.state.` (`plugins/workbench-resources/src/sidebar.ts`), у каждого теста свежий browser context (кроме спеков на `sharedPageTest`, см. ниже: там открытая вкладка треда в sidebar протекает, `resetWindow` её закрывает).

`documents/documents-content.spec.ts` конвертирован тоже (8 тестов, 3 с `@invite`): каждый тест строит свой teamspace и документ через `generateId`.

`inbox/inbox-notifications.spec.ts` конвертирован так же. Переиспользуемый участник даёт один и тот же DM с владельцем во всех тестах, поэтому `dispose()` читает всё непрочитанное владельца (`readEverything`).

- **REST needs `shared.ws.token`**, not `shared.token` (that one is for `loginByToken`): the REST client answers `Forbidden`.

`inbox/inbox.spec.ts`, `chat/pulse.spec.ts`, `chat/direct-chat.spec.ts`, `chat/dynamic-issues-chats.spec.ts`, `documents/teamspace.spec.ts` (join tests), `custom-atributes/class-mixins.spec.ts`, `workspace/class-settings-navigation.spec.ts` тоже конвертированы. Что пришлось учесть:

- Второй пользователь в `inbox.spec.ts` свежий на тест (`@invite`, место на тест), а не переиспользуемый как в `inbox-notifications`: тест "turn off notification" выключает настройку участника навсегда, а тест "turn off" ждёт системное сообщение о его входе в `general` - у старого участника оно далеко в истории.
- Заголовок и label задачи (`createNewIssueData`) - faker-слова, в общем workspace совпадают с чужими: `newIssueData` в `inbox.spec.ts` дописывает `generateId(5)`. Форму создания задачи в `inbox.spec.ts` на API не меняли: `checkIssue` сверяет поля, заданные формой.
- Presence и typing в `pulse.spec.ts` живут в канале, а `general` держит аватар прошлого теста воркера в пределах TTL (тест ждёт исчезновения до 20s): каждый тест берёт свой канал (`owner.createChannel` + участник `joinWorkspace`), а не `general`.
- Мискины `class-mixins.spec.ts` остаются на классе `Company` после теста (имя уникально через `generateId`) - среди файлов на sharedWorkspace класс Company больше никто не открывает (grep по chat/inbox/drive/documents).
- Время одиночного прогона файла почти не меняется (воркер всё равно создаёт один workspace); выигрыш - в полном прогоне, где workspace переживает файлы. Замер на 7 файлах, `--workers 1`: 91s -> 58-66s (inbox 43s -> 32-35s).

## Не конвертировано

`chat/ai-bot-scenarios.spec.ts` проверяет workspace ровно с одним tracker-проектом (карточка предложения задачи прячет селектор проекта, когда он один), а один из тестов файла создает второй проект - с shared workspace это предположение не держится, поэтому файл по-прежнему создает workspace на тест.

`chat/dynamic-recruting-chats.spec.ts` не конвертирован: `Enable` у карточки Recruiting включает модуль для всего workspace и необратим, повторный `Enable` в том же workspace (retry) не проверялся; включённый Recruiting видят и соседние тесты воркера.

## Одно окно на воркер (`sharedPageTest`, `enterWorkspace`)

Что стоило ~0.9s на тест в `chat-notifications`, `chat`, `inbox-notifications`: не клик, а загрузка SPA. Первый шаг тела (`Click ...header-actions button.last()`) ждёт кнопку, которой нет, пока приложение не загрузилось: `goto` 130ms, до появления кнопки +860ms (на простаивающей машине в уже прогретом workspace +250-330ms, под 5 воркерами и чужими прогонами ~0.9s), сам клик 24-52ms (замер на отдельной пробе). Тест-уровневый `page` = новый context, bundle и модель грузятся заново.

`sharedPageTest` (`tests/fixtures.ts`) держит одно окно на воркер, `enterWorkspace(page, shared, 'chunter')` в `beforeEach` вместо `loginByToken`: первый вызов логинится, следующие чистят localStorage (кроме `login:metadata:*` и `#platform.notification.timeout`), `history.pushState` + `popstate` без перезагрузки. `test.afterAll(closeSharedPage)` закрывает окно на конце файла (иначе оно остаётся вторым сеансом владельца для следующего спека воркера). Медиана `beforeEach` + первый шаг: chat-notifications 1197 -> 72ms, chat 1253 -> 285ms, inbox-notifications 1122 -> 60ms; A/B на одном коде (переключатель окружения, 4 пары на файл, 24 прогона, все зелёные): медиана wall chat 32 -> 28s, inbox 28 -> 21.5s, chat-notifications без видимой разницы из-за шума (первый тест воркера строит workspace и стоит 10-30s под нагрузкой). Экономия ~1s x (число тестов - 5 первых по воркерам), порядка 70s шагов на три файла.

Утечки, которые нашлись при переходе, все в памяти, а не в localStorage (поэтому его чистки мало):

- Тред, открытый в sidebar (`Reply`), остаётся вкладкой: следующий тест видит два `div.text-editor-view`, `sendMessage` падает на strict mode (3 из 30). `resetWindow` закрывает содержимое sidebar, пока оно видно; если остались вкладки или попап - `enterWorkspace` грузит приложение заново вместо pushState.
- `Workbench.syncLoc` на `/chunter` без пути уводит на `platform_last_loc_chunter` из localStorage, т.е. в канал прошлого теста: ключ надо стереть до перехода.
- `Escape` закрывает попапы.

Не конвертирован `chat/chat-unread.spec.ts`: на общем окне 2 прогона из 5 красные (1 и 4 теста), на свежем окне 5 из 5 зелёные (35 тестов, `--workers 5`). Падения: `button[id$="ApplicationLabelChunter"] .marker` / `app-notification:string:Inbox .marker` ожидали 0, пришло 1, на скриншоте у соседнего канала бейдж "5" (burst-тест прошлого в воркере; причину, почему он не погас после `readEverything`, не искали); и `cardByTitle` не нашёл карточку в Inbox за 3s. Гипотеза, не проверена: счётчики и маркеры у живого окна расходятся с сервером, а новая загрузка их пересчитывает (похоже на "Comment counter" в `sanity-flaky-tests.md`). Отдельно: 2 теста со списком Threads показывали треды прошлого теста (по комментарию в `Threads.svelte` идентичный live query отвечает из кэша, а ответ в треде не трогает документ коллаборатора), и складка секции навигатора после `collapseSection` остаётся в памяти ('random' не находился). Тесты проверяют именно маркеры и счётчики, так что общий экземпляр клиента меняет предмет проверки. Каждую протечку можно закрывать по одной (перезагрузка для Threads-тестов дала 35/35 один раз), но ~1s x 30 тестов не стоит перемежающегося красного.
