# Shared workspace per worker in sanity tests

Область: [тесты](../testing.md)

`tests/sanity/tests/fixtures.ts` дает один аккаунт/workspace на Playwright worker вместо одного на тест (`sharedWorkspace(invites?)`). Создание workspace стоит ~1.9s (account service + модель для каждого плагина); в профиле 20260907-163654 шаг `setup: account and workspace` занял 145.2s из 1429s прогона, 58.1s из них - `chat/chat.spec.ts` (27 тестов).

## Seats

Free-план дает свежему workspace `usersLimit: 5` (`tests/plan-config.yaml`), AI-бот в счет мест не идет (`getSeatMembers`, `server/account/src/utils.ts`). Фикстура пересоздает workspace после `SEATS_PER_WORKSPACE` (3) инвайтов через `getSecondPageByInvite` - на единицу меньше лимита: тест без тега `@invite` не падает явно на неучтенном инвайте (`assertSeatAvailable` блокирует только вход без мест, а гостя сверх лимита `SeatLimitsMiddleware` тихо переводит в read-only). Тест объявляет нужду тегом `@invite`, `beforeEach` вызывает `sharedWorkspace(testInfo.tags.includes('@invite') ? 1 : 0)`.

## Что ломает shared workspace, и что нет

- `general`/`random` хранят сообщения прошлых тестов воркера - любая проверка сообщения (особенно отрицательная, как в тесте на удаление) нужна с текстом, уникальным на тест и на retry: `${testInfo.testId}${testInfo.retry}`.
- Имена каналов должны нести тот же суффикс: `generateTestData()` строит их из `faker.lorem.word` с конечным списком слов, навигатор матчит по accessible name - `Aonforto` матчился и с `Aonforto 1` (непрочитанный бейдж).
- Таблица каналов перечисляет весь workspace, поиск по имени владельца матчил несколько строк - `ChannelPage.clickOnUser` (`tests/sanity/tests/model/channel-page.ts`) берет канал и скоупит строку.
- Sidebar layout не ломается: он живет в localStorage под `workbench.<workspace>.<account>.sidebar.state.` (`plugins/workbench-resources/src/sidebar.ts`), у каждого теста свежий browser context.

`documents/documents-content.spec.ts` конвертирован тоже (8 тестов, 3 с `@invite`): каждый тест строит свой teamspace и документ через `generateId`.

## Не конвертировано

`chat/ai-bot-scenarios.spec.ts` проверяет workspace ровно с одним tracker-проектом (карточка предложения задачи прячет селектор проекта, когда он один), а один из тестов файла создает второй проект - с shared workspace это предположение не держится, поэтому файл по-прежнему создает workspace на тест.
