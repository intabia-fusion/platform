# Карта фич

Один файл на продуктовую область. В каждом: пакеты ("Где код"), модель данных, сценарии со ссылками на файлы и символы, список фич с символами и файлами, "Куда смотреть, если нужно...", настройки, тесты, связанные документы. Как устроены слои плагина и путь запроса клиент -> транзактор -> БД - [../architecture.md](../architecture.md).

Каждый файл помечен коммитом, с которым сверен. Путь или символ, которого больше нет в коде, - ошибка документа: исправлять в том же PR, что меняет код (см. "Where features live" в [AGENTS.md](../../AGENTS.md)).

## Области

| Область | Документ | Основные пакеты |
| --- | --- | --- |
| Трекер: проекты, задачи, статусы, типы задач, workflow, учёт времени, метки | [tracker.md](tracker.md) | `tracker`, `task`, `workflow`, `time` (отчёты), `tags`, `view` |
| Чат и уведомления: каналы, DM, треды, inbox, read receipts, push, поиск | [chat.md](chat.md) | `chunter`, `notification`, `activity`, `services/notification(s)` |
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

Имя пакета из таблицы раскладывается по слоям: `models/<x>`, `plugins/<x>`, `plugins/<x>-resources`, `plugins/<x>-assets`, `server-plugins/<x>`, `server-plugins/<x>-resources`, `models/server-<x>` - существуют не все, точный список в разделе "Где код" документа.

## Где что искать по ключевому слову

| Ищешь | Документ |
| --- | --- |
| Issue, sub-issue, Milestone, Component, статусы, канбан, оценка, time report | [tracker.md](tracker.md) |
| Workflow, переходы статусов, валидаторы, post-functions | [tracker.md](tracker.md) |
| Process (визуальные процессы над карточками) | [integrations.md](integrations.md) |
| Card (generic-карточки) | [tracker.md](tracker.md) |
| Сообщение, тред, реакция, упоминание, прочитано, push, inbox | [chat.md](chat.md) |
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

