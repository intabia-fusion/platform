# Карта фич

Один файл на продуктовую область. В каждом: пакеты ("Где код"), модель данных, сценарии со ссылками на файлы и символы, список фич с символами и файлами, "Куда смотреть, если нужно...", настройки, тесты, связанные документы. Как устроены слои плагина и путь запроса клиент -> транзактор -> БД - [../architecture.md](../architecture.md).

Каждый файл помечен коммитом, с которым сверен. Путь или символ, которого больше нет в коде, - ошибка документа: исправлять в том же PR, что меняет код (см. "Where features live" в [AGENTS.md](../../AGENTS.md)).

## Области

| Область | Документ | Основные пакеты |
| --- | --- | --- |
| Трекер: проекты, задачи, статусы, типы задач, workflow, учёт времени, метки | [tracker.md](tracker.md) | `tracker`, `task`, `workflow`, `time` (отчёты), `tags`, `view` |
| Чат: каналы, DM, треды, окно сообщений, чтение при скролле, навигатор, поиск | [chat.md](chat.md) | `chunter`, `activity` |
| Уведомления: DocNotifyContext, inbox, бейджи, push, email, упоминания, реакции, mute | [notifications.md](notifications.md) | `notification`, `services/notifications`, `services/notification`, `services/mail` |
| Виртуальный офис и встречи: этаж, комнаты, LiveKit, knock, запись, транскрипция | [office-meetings.md](office-meetings.md) | `love`, `services/love`, `recorder`, `media` |
| Документы и QMS: вики, совместный редактор, controlled documents, история версий | [documents-qms.md](documents-qms.md) | `document`, `controlled-documents`, `text-editor`, `server/collaborator` |
| AI-ассистент "Юля ИИ": ответы в чатах, транскрипция, саммари, уровни моделей | [ai.md](ai.md) | `ai-bot`, `services/ai-bot/*` |
| Биллинг: тарифы, лимиты, платежи T-Bank, AI-токены | [billing.md](billing.md) | `billing`, `services/billing`, `services/payment`, `server/account` |
| CRM и контакты: Person, Employee, Organization, каналы, воронка лидов | [crm-contact.md](crm-contact.md) | `contact`, `lead`, `services/crm` |
| Планировщик и календарь: ToDo, WorkSlot, team planner, события, синхронизация, присутствие | [planner-calendar.md](planner-calendar.md) | `time`, `calendar`, `services/calendar`, `pulse` |
| Файлы: Drive, вложения, загрузка, превью, транскодирование видео, datalake | [drive-media.md](drive-media.md) | `drive`, `attachment`, `uploader`, `pods/preview`, `pods/media`, `services/datalake`, `foundations/stream` |
| HR, подбор, обучение | [hr-recruit.md](hr-recruit.md) | `hr`, `recruit`, `training` |
| Вход, регистрация, воркспейсы, роли, гости, удаление аккаунта | [auth-onboarding.md](auth-onboarding.md) | `login`, `onboard`, `admin`, `guest`, `server/account`, `server/workspace-service`, `pods/authProviders` |
| Каркас приложения: workbench, сайдбар, настройки, экспорт, бэкап, desktop | [platform-infra.md](platform-infra.md) | `workbench`, `setting`, `preference`, `export`, `server/backup`, `desktop` |
| Внешние интеграции: Telegram, Gmail, почта, GitHub, Process, API-клиент | [integrations.md](integrations.md) | `services/telegram*`, `services/gmail`, `services/mail`, `services/github`, `process` |
| Тест-менеджмент (продуктовый модуль для QA) | [test-management.md](test-management.md) | `test-management` |
| Мелкие модули: emoji, tags, шаблоны, достижения, опросы, рейтинг, вопросы, inventory, products, print | [utilities.md](utilities.md) | `emoji`, `tags`, `templates`, `achievement`, `survey`, `rating`, `questions`, `inventory`, `products`, `services/print` |
| Карточки: generic-модель Card/MasterTag/Tag, процессы над карточками, текстовые шаблоны | [cards.md](cards.md) | `card`, `process`, `templates` |

Имя пакета из таблицы раскладывается по слоям: `models/<x>`, `plugins/<x>`, `plugins/<x>-resources`, `plugins/<x>-assets`, `server-plugins/<x>`, `server-plugins/<x>-resources`, `models/server-<x>` - существуют не все, точный список в разделе "Где код" документа.

## Где что искать по ключевому слову

| Ищешь | Документ |
| --- | --- |
| Issue, sub-issue, Milestone, Component, статусы, канбан, оценка, time report | [tracker.md](tracker.md) |
| Workflow, переходы статусов, валидаторы, post-functions | [tracker.md](tracker.md) |
| Process (визуальные процессы над карточками) | [integrations.md](integrations.md) |
| Card (generic-карточки) | [cards.md](cards.md) |
| Сообщение, тред, канал, DM, поиск по чату, "New"-разделитель | [chat.md](chat.md) |
| Опрос, викторина в сообщении (апплеты) | [chat.md](chat.md), [chat-polls.md](chat-polls.md) |
| Уведомление, inbox, реакция, упоминание, прочитано, push, email, бейдж, mute | [notifications.md](notifications.md) |
| Лента активности (`DocUpdateMessage`) | [chat.md](chat.md) |
| Комната, этаж, звонок, LiveKit, knock, приглашение, запись встречи | [office-meetings.md](office-meetings.md) |
| Транскрипция и саммари встречи | [office-meetings.md](office-meetings.md), [ai.md](ai.md) |
| Запись экрана (screen recorder в Drive) | [office-meetings.md](office-meetings.md), [drive-media.md](drive-media.md) |
| Совместное редактирование, tiptap, inline-комментарии, история версий | [documents-qms.md](documents-qms.md) |
| Копирование документа как markdown | [documents-qms.md](documents-qms.md) |
| LLM, модели, промпты, инструменты бота, STT, голосовые заметки | [ai.md](ai.md) |
| Тариф, лимит, места (seats), readonly, оплата, AI-токены | [billing.md](billing.md) |
| Person, Employee, SocialId, каналы связи, аватары, часовые пояса | [crm-contact.md](crm-contact.md) |
| ToDo, слоты, team planner, события календаря, Google/CalDAV, presence, typing | [planner-calendar.md](planner-calendar.md) |
| Загрузка файлов, multipart, превью, видео/HLS, blob, S3 | [drive-media.md](drive-media.md) |
| Отделы, отпуска, вакансии, кандидаты, курсы, тесты обучения | [hr-recruit.md](hr-recruit.md) |
| Логин, OTP, OAuth, приглашение, гость, создание/удаление воркспейса, блокировка аккаунта | [auth-onboarding.md](auth-onboarding.md) |
| Навигатор, приложения слева, виджеты сайдбара, настройки, экспорт, бэкап/restore, Electron-обновления | [platform-infra.md](platform-infra.md) |
| Отключение модулей (`DISABLED_FEATURES`) | [platform-infra.md](platform-infra.md), [../disableFeatures.md](../disableFeatures.md) |
| Telegram, Gmail, SMTP, GitHub, REST/WebSocket API | [integrations.md](integrations.md) |
| Тест-кейсы, сьюты, прогоны (продукт) | [test-management.md](test-management.md) |
| Автотесты репозитория (Playwright, ws-tests) | [../testing.md](../testing.md), [AGENTS.md](../../AGENTS.md) |
| Метки/теги, эмодзи, шаблоны сообщений, рейтинг, опросы, печать в PDF | [utilities.md](utilities.md) |
| Middleware транзактора, триггеры, LiveQuery, Postgres-адаптер, Kafka | [../architecture.md](../architecture.md) |
| Переиспользуемые UI-компоненты | [../ui-components/README.md](../ui-components/README.md) |


## Пользовательская документация

Каждый файл области заканчивает раздел "Фичи" разделом `## Пользовательская документация`: какие фичи описаны в документации для пользователей ([platform-docs](https://github.com/intabia-fusion/platform-docs), локально `../platform-docs`) и насколько описание совпадает с кодом. Ведёт скилл `docs-sync`, медиа - `docs-media`.

```markdown
## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Этапы | task-tracking/milestones | task-tracking/milestones | ok | 0.8.60 | |
| Учёт времени | task-tracking/time-reports | - | no-en | 0.8.60 | |
| Меню задачи | task-tracking/viewing-issues | task-tracking/viewing-issues | stale | 0.8.55 | меню сгруппировано (FUSIO-1591), скриншот старый |
| Валидаторы workflow по категории статуса | - | - | plan | - | |
```

- "Фича" - имя пункта из раздела "Фичи" того же файла (жирный заголовок пункта); строка есть у каждого пункта, у пункта без пользовательской стороны - `internal`.
- ru/en - путь страницы относительно `src/content/docs/<lang>/` без `.mdx`; `-` - страницы нет. Одна фича на несколько страниц - пути через запятую.
- "Сверено" - версия (последний тег `vX.Y.Z` без `v`), на которой страницу сверили с кодом; `-` - не сверялась.
- "Расхождение" - одна фраза, что не совпадает; пусто у `ok`.

| Статус | Значит |
| --- | --- |
| `ok` | страница есть, сверена с кодом |
| `stale` | страница есть, но поведение фичи изменилось: шаги, кнопки, настройки или скриншоты уже не те |
| `partial` | страница есть, но не сверена или описывает фичу не полностью (нет сценария, настроек, ограничений); страница только на en - тоже `partial` с ru `-` |
| `plan` | страницы нет, описание в плане |
| `no-en` | ru-страница есть, en нет |
| `internal` | пользователь фичу не видит, не документируем |
| `off` | фича выключена в продукте или решено её не документировать; не сверяем и не пишем, пока решение не сменится |

Выключено на проде (`DISABLED_FEATURES` фронта, на 2026-10-21; что прячет каждый ключ - [../disableFeatures.md](../disableFeatures.md) и код): `mail`, `mailboxes`, `gmail`, `github`, `telegram`, `integrations`, `auto-translate`, `export`, `documents`, `inventory`, `survey`, `lead`, `products`, `recruit`, `training`, `hr`, `process`, `card`, `testManagement`, `contact.persons`, `contact.companies`, `tracker.issueImport`, `contact:ids:OrganizationNotificationGroup`, `setting:ids:SettingNotificationGroup`, `hide-ru-banned-channels`. Фича под таким ключом - `off` с ключом в "Расхождении"; список поменялся на проде - поправить здесь и строки карты.

PR, который меняет поведение фичи, видимое пользователю, правит её строку: `ok`/`partial`/`no-en` -> `stale` с причиной в "Расхождении"; `plan` остаётся `plan`; `internal`, ставшая видимой, -> `plan`; `off` не трогаем. Новая пользовательская фича - строка `plan`. Сводка по всем областям: `ls docs/features/*.md | grep -v README | xargs grep -h '^| ' | awk -F'|' '$5 ~ /^ *(ok|stale|partial|plan|no-en|internal|off) *$/ {print $5}' | sort | uniq -c`.
