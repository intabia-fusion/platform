# Скриншоты документации: sanity-стенд (8083) показывает фичи, выключенные на проде

При съёмке скриншотов для `platform-docs` (FUSIO-1594, фаза 1 трекера) использовался обычный
sanity-стенд `http://localhost:8083` (demo-ws/demo-ws-en), а не `--docs`-стенд
(`tests/docker-compose.docs.yaml`), который единственный поднимается с прод
`DISABLED_FEATURES` (см. `docs-media` skill, раздел "Что нужно").

Следствие: Настройки -> Уведомления -> Задачи на sanity-стенде показывает 4-й столбец-тумблер
"Email"/" Email" (модельный документ `notification.class.NotificationProvider` из `models/gmail`
создаётся независимо от `DISABLED_FEATURES=gmail`, на фронте просто не должен быть виден - но
виден). На проде (`--docs`/`persona` стенд, `gmail` в `DISABLED_FEATURES`) такого столбца быть не
должно. Текст страницы `task-tracking/issue-collaborators.mdx` (ru/en) не упоминает Email -
намеренно, по отчёту сверки; при съёмке скриншота `issue-collaborators-notifications(-en).png`
4-й столбец обрезан через `maxWidth` у `h.shot`, чтобы скриншот совпадал с текстом и с прод-видом.

Если потребуется переснять другие страницы, которые касаются `DISABLED_FEATURES`-областей
(mail, telegram, github, integrations, documents, process, hr, recruit, training, card,
testManagement, survey, lead, products, inventory, contact.persons/companies,
tracker.issueImport, export, auto-translate, mailboxes) - на sanity-стенде они будут видны, хотя
на проде их нет. Либо поднимать `--docs`-стенд, либо вручную проверять/обрезать такие элементы
из кадра, как сделано здесь.

## FUSIO-1594 фаза 2 (communication): тот же эффект на Email-провайдере уведомлений

`gmail` в `DISABLED_FEATURES` должен прятать `EmailNotificationProvider` (`models/gmail`) целиком,
но на sanity-стенде (8083, без `--docs`) он виден: в Настройки -> Уведомления -> Основное есть
4-я строка "Email" с кнопкой "Настроить", и в каждой группе (`Чат`, `Люди`, ...) у типов
уведомлений 4 столбца-тумблера (Входящие/Push/Звук/Email) вместо 3. При съёмке
`communication/notifications` оба скриншота обрезаны через ручной `page.screenshot({clip})`
(не `h.shot` region, т.к. нужно вырезать и крайний правый столбец, и конкретную строку) так, чтобы
Email не попадал в кадр, и текст страницы (ru/en) не упоминает Email как канал доставки.

Заодно нашлась реальная утечка бренда апстрима: `InboxNotificationsDescription` (`plugins/notification-assets/lang/{ru,en}.json:84`)
= "Получайте персональные уведомления на свой почтовый ящик Huly." / "...in your Huly inbox." -
показывается в настройках уведомлений (строка "Входящие") на обоих языках, затронутый
UI-текст, не только скриншот. В тексте страницы это не используется; сам баг не чинили (вне
объёма задачи), нужно поправить лейбл в коде.

Также `chunter.string.ChunterBrowser` (значок "Поиск" по сообщениям в быстрой навигации чата)
переведён на en неверно: ru = "Поиск", en = "Browser" (`plugins/chunter-assets/lang/en.json:64`) -
явно не тот смысл (должно быть что-то вроде "Search"). На en-странице `sending-messages.mdx`
написано дословно "Browser", как показывает интерфейс - текст на странице этим не испорчен, но
баг стоит исправить в lang-файле.
