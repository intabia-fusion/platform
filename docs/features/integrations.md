# Внешние интеграции

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Подключение внешних каналов и систем к платформе: Telegram-бот, Gmail и generic-почта (SMTP/MTA), синхронизация с GitHub (issues/PR), визуальный workflow-движок Process для карточек (`card`), и npm-бандл `@intabia-fusion/api` для программного доступа к платформе по REST/WebSocket. Сущности: `IntegrationType`/`Integration` (настройка канала на аккаунте), `Process`/`Execution` (запущенный экземпляр workflow), `GithubIntegration`/`GithubIntegrationRepository` (привязка репозитория к проекту трекера).

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| `@hcengineering/pod-telegram-bot` | `services/telegram-bot/pod-telegram-bot` | Telegram-бот (telegraf) |
| `@hcengineering/model-telegram` | `models/telegram` | модель сообщений, IntegrationType, уведомления, миграция |
| `@hcengineering/model-server-telegram` | `models/server-telegram` | регистрация `server-telegram` плагина в модели (DD-participant) |
| `@hcengineering/telegram` | `plugins/telegram` | ID плагина, классы, `telegramIntegrationKind = 'hulygram'` |
| `@hcengineering/telegram-resources` | `plugins/telegram-resources` | клиентский API (`api.ts`) и Svelte-компоненты |
| `@hcengineering/telegram-assets` | `plugins/telegram-assets` | переводы, иконки |
| `@hcengineering/server-telegram` | `server-plugins/telegram` | ID плагина, объявления триггеров/функций |
| `@hcengineering/server-telegram-resources` | `server-plugins/telegram-resources` | реализация триггеров (`OnMessageCreate`, `NotificationsHandler` и др.) |
| `@hcengineering/pod-gmail` | `services/gmail/pod-gmail` | синхронизация Gmail (OAuth, push/pull sync) |
| `@hcengineering/model-gmail` | `models/gmail` | модель писем, IntegrationType, уведомления |
| `@hcengineering/gmail` | `plugins/gmail` | ID плагина, классы |
| `@hcengineering/gmail-resources` | `plugins/gmail-resources` | клиентский API и компоненты |
| `@hcengineering/server-gmail` | `server-plugins/gmail` | серверные триггеры (`OnMessageCreate`, `FindMessages`) |
| `@hcengineering/pod-mail` | `services/mail/pod-mail` | исходящая почта (SMTP/SES через nodemailer), режимы queue/server/client |
| `@hcengineering/pod-mail-worker` | `services/mail/pod-mail-worker` | входящая почта: MTA-хук -> сообщения платформы |
| `@hcengineering/mail-common` | `services/mail/mail-common` | общее ядро: Person/PersonSpaces/Channel-кэши, Kafka-очередь |
| `@hcengineering/huly-mail` | `models/huly-mail` | IntegrationType Huly Mail (`hulyMailIntegrationKind`) |
| `@hcengineering/huly-mail-resources` | `plugins/huly-mail-resources` | клиентские компоненты Huly Mail |
| `@hcengineering/mail` | `plugins/mail`, `models/mail` | минимальный плагин: только тег `MailThread`; модель пустая |
| `@hcengineering/pod-github` | `services/github/pod-github` | GitHub App: приём вебхуков + двусторонняя синхронизация issues/PR |
| `@hcengineering/model-github` | `services/github/model-github` | модель: `GithubIntegration`, `DocSyncInfo`, `GithubIssue`/`GithubPullRequest` |
| `@hcengineering/github` | `services/github/github` | ID плагина, IntegrationType |
| `@hcengineering/github-resources` | `services/github/github-resources` | клиентские компоненты (Connect, PullRequests и т.д.) |
| `@hcengineering/github-assets` | `services/github/github-assets` | переводы, иконки |
| `@hcengineering/server-github` | `services/github/server-github` | ID серверного плагина |
| `@hcengineering/server-github-model` | `services/github/server-github-model` | модель серверных триггеров |
| `@hcengineering/server-github-resources` | `services/github/server-github-resources` | реализация серверных триггеров |
| `@hcengineering/model-process` | `models/process` | модель: `Process`, `Execution`, `Transition`, `Method`, `Trigger`, `ApproveRequest` |
| `@hcengineering/process` | `plugins/process` | ID плагина, интерфейсы шагов/триггеров |
| `@hcengineering/process-resources` | `plugins/process-resources` | UI: редактор процессов, `TransitionEditor.svelte` |
| `@hcengineering/server-process` | `server-plugins/process` | ID серверного плагина, `MethodImpl`/`TriggerImpl`/`FuncImpl` миксины |
| `@hcengineering/server-process-resources` | `server-plugins/process-resources` | реализация методов/триггеров/rollback-функций |
| - | `services/process` | процессинг-сервис: consumer `QueueTopic.Process`, таймеры через `QueueTopic.TimeMachine` |
| `@intabiafusion/api-bundle-builder` | `dev/api` | сборка публикуемого npm-бандла `@intabia-fusion/api` |
| `@hcengineering/api-client` | `foundations/core/packages/api-client` | исходник `connect()`/`PlatformClient` - ядро бандла |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TTelegramMessage` | входящее/исходящее TG-сообщение, домен `telegram` | `models/telegram/src/index.ts` |
| `TNewTelegramMessage` | сообщение к отправке (`new`/`sent`) | `models/telegram/src/index.ts` |
| `TSharedTelegramMessages` | пакет TG-сообщений, прикреплённый к документу | `models/telegram/src/index.ts` |
| `TMessage` (gmail) | письмо Gmail, домен `gmail`, full-text поля from/to/subject/content | `models/gmail/src/index.ts` |
| `TNewMessage` | письмо к отправке, статус `new`/`sent`/`error` | `models/gmail/src/index.ts` |
| `TSharedMessages` | shared-пакет писем | `models/gmail/src/index.ts` |
| `GithubIntegration` / `TGithubIntegration` | привязка GitHub App installation к workspace | `services/github/model-github/src/index.ts` |
| `GithubIntegrationRepository` | привязка одного репозитория к проекту | `services/github/model-github/src/index.ts` |
| `TGithubIssue` extends `TIssue` | GitHub issue как `tracker.class.Issue` | `services/github/model-github/src/index.ts` |
| `TGithubPullRequest` extends `TIssue` | PR как issue трекера + доп. поля | `services/github/model-github/src/index.ts` |
| `DocSyncInfo` | состояние синхронизации документа с GitHub | `services/github/model-github/src/index.ts` |
| `TProcess` | описание workflow: states/transitions/context/autoStart | `models/process/src/index.ts` |
| `TExecution` | запущенный экземпляр, `rollback: Tx[][]`, `context`, `status` | `models/process/src/index.ts` |
| `TExecutionLog` | журнал шагов исполнения | `models/process/src/index.ts` |
| `TApproveRequest` extends `TProcessToDo` | запрос согласования как ToDo с `approved`/`reason` | `models/process/src/index.ts` |
| `TTransition` / `TTrigger` / `TMethod` | переход, триггер перехода, реализация шага | `models/process/src/index.ts` |

## Как работает

1. **Telegram-бот: связывание аккаунта.** Пользователь жмёт "Connect" -> бот выдаёт код (`worker.ts generateCode`) -> пользователь вводит его в UI -> `POST /auth` (`services/telegram-bot/pod-telegram-bot/src/server.ts`) -> `worker.ts authorizeUser` создаёт `Integration` (`account.ts createIntegration`) с `kind='telegram-bot'`.
2. **Telegram-бот: ответ маппится в сообщение платформы.** `bot.on('reply_to_message')` (`telegraf/bot.ts`) -> `onReply` (`telegraf/bot.ts`) -> `findMessageRecord` (`telegraf/bot.ts`) ищет исходное сообщение по `telegramId`/`replyTo` -> `worker.ts reply`.
3. **Gmail: push-уведомление -> partial sync.** Google Pub/Sub шлёт `POST /push` (`services/gmail/pod-gmail/src/main.ts`) -> `gmailController.push(data)` -> `SyncManager.partSync` (`services/gmail/pod-gmail/src/message/sync.ts`) читает `historyId` через Gmail API и создаёт `TMessage` в домене `gmail`.
4. **Mail: входящее письмо через MTA-хук.** MTA дергает вебхук -> `handleMtaHook` (`services/mail/pod-mail-worker/src/handlerMta.ts`) фильтрует собственные письма (`isHulyMessage`, L47) -> `PersonCache.ensurePerson` (`services/mail/mail-common/src/person.ts`) создаёт Person по email -> `ChannelCache.getOrCreateChannel` (`services/mail/mail-common/src/channel.ts`) находит/создаёт mail-канал на карточке -> сообщение платформы.
5. **Mail: исходящее письмо.** `MailClient` (`services/mail/pod-mail/src/mail.ts`) читает конфиг режима (`queue`/`server`/`client`, `services/mail/pod-mail/src/config.ts`) -> в режимах `queue`/`client` создаётся (`main.ts`), в режиме `client` соединяется с `server`-инстансом через `@intabiafusion/clisr` (см. `docs/memory/clisr_wire_protocol.md`) -> отправка через nodemailer SMTP (`transport.ts`, pool 5 соединений) либо SES. Перед отправкой `sendMessage` убирает из to/cc/bcc адреса `BLOCKED_RECIPIENTS` (по умолчанию адрес AI-бота, `withoutBlockedRecipients` в `utils.ts`); если получателей не осталось, письмо не отправляется.
6. **GitHub: входящий вебхук.** GitHub App шлёт событие на `/api/webhook` (`services/github/pod-github/src/server.ts`, `@octokit/webhooks` middleware) -> обработчик, например `octokitApp.webhooks.on('issues', ...)` (`services/github/pod-github/src/platform.ts`) -> `IssueSyncManager` (`services/github/pod-github/src/sync/issues.ts`, реализует `DocSyncManager`) обновляет/создаёт `TGithubIssue` через `TxOperations`.
7. **Process: запуск и откат.** Триггер (например `OnCardUpdate`/`WhenCardMatches`, `models/process/src/triggers.ts`) создаёт `Execution` с `autoStart` -> `services/process/src/index.ts` consumer на `QueueTopic.Process` вызывает `messageHandler` (`main.ts`) -> выполняет `Method` шага, пишет применённые транзакции в `execution.rollback` (стек `Tx[][]`) -> отмена шага (`CancelSubProcess`/`ToDoCloseRollback`, `server-plugins/process-resources/src/rollback.ts`) применяет транзакции из стека в обратном порядке.
8. **API-клиент: подключение к воркспейсу.** Внешнее приложение зовёт `connect(url, options)` (`foundations/core/packages/api-client/src/client.ts`) -> получает `PlatformClient` с `TxOperations` + `LiveQuery` поверх WebSocket (см. `docs/api-client.md`).

## Фичи

### Telegram
- **Telegram-бот, команды.** `/start /connect /sync_all_channels /sync_starred_channels /help /stop`. - `services/telegram-bot/pod-telegram-bot/src/telegraf/commands.ts`.
- **Уведомления о новых сообщениях.** `NewMessageNotification` (`MessageNotificationType`), провайдер по умолчанию. - `models/telegram/src/notification.ts`.
- **IntegrationType с несколькими аккаунтами.** `allowMultiple: true`, `kind: telegramIntegrationKind = 'hulygram'`. - `models/telegram/src/index.ts`, `plugins/telegram/src/index.ts`.

### Gmail
- **OAuth-подключение, несколько ящиков.** `allowMultiple: true`, компоненты Connect/Configure. - `models/gmail/src/index.ts`.
- **Full/partial синхронизация.** `SyncManager` (full/partial, `SyncMutex` из `@hcengineering/mail-common`, KVS state, rate limiter). - `services/gmail/pod-gmail/src/message/sync.ts`.
- **Два адаптера сообщений.** v1 и v2 (с отдельным `send.ts`), переключение через `config.Version` (по умолчанию `v1`). - `services/gmail/pod-gmail/src/message/adapter.ts`, `.../v1/message.ts`, `.../v2/message.ts`, `.../v2/send.ts`.
- **"Написать письмо" из карточки контакта / Applicant.** Действие `WriteEmail`, для рекрутинга - отдельный tester `recruit.function.ApplicantHasEmail`. - `models/recruit/src/index.ts`.
- **Уведомления о входящих письмах.** `MessageNotificationType` в группе `EmailNotificationGroup`; фактически `defaultEnabled: false` (не включено по умолчанию). - `models/gmail/src/notification.ts`.

### Mail / Huly Mail
- **Три режима pod-mail.** `queue` (только слушает очередь и шлёт SMTP), `server` (принимает clisr-подключения клиентов), `client` (шлёт запросы на server через clisr). - `services/mail/pod-mail/src/config.ts`, `services/mail/pod-mail/src/main.ts`.
- **SMTP с пулом соединений.** `pool: true, maxConnections: 5, maxMessages: 100`. - `services/mail/pod-mail/src/transport.ts`.
- **SES как альтернатива SMTP.** Конфиг через `SES_ACCESS_KEY/SES_SECRET_KEY/SES_REGION`. - `services/mail/pod-mail/src/config.ts`.
- **Авто-создание Person/канала из письма.** `PersonCache.ensurePerson`, `ChannelCache.getOrCreateChannel`. - `services/mail/mail-common/src/person.ts`, `services/mail/mail-common/src/channel.ts`.
- **Huly Mail IntegrationType.** `hulyMailIntegrationKind`, `allowMultiple: true`. - `models/huly-mail/src/index.ts`.

### GitHub
- **GitHub App: установка и авторизация.** `POST /api/v1/installation`, `/api/v1/auth`, `/api/v1/installation-remove`. - `services/github/pod-github/src/server.ts`.
- **Приём вебхуков.** `createNodeMiddleware(octokitApp.webhooks, { path: '/api/webhook' })`, обработчики `pull_request`/`issues`/`issue_comment`/`repository`/`installation` и др. - `services/github/pod-github/src/platform.ts`.
- **Двусторонняя синхронизация issues/PR.** `IssueSyncManager`, `PullRequestSyncManager`, `RepositorySyncMapper`, `UsersSyncManager`, `CommentSyncManager` реализуют `DocSyncManager`. - `services/github/pod-github/src/sync/*.ts`.
- **GitHub issue/PR как `tracker.class.Issue`.** Прямое расширение модели трекера, а не отдельная сущность. - `services/github/model-github/src/index.ts`.
- **Одна интеграция на workspace.** `kind: 'github'` (`githubIntegrationKind`), `allowMultiple: false`, привязана к реальному `workspaceUuid`. - `services/github/model-github/src/index.ts`, `services/github/pod-github/src/platform.ts`.
- **Отдельная global-интеграция для привязки личного GitHub-аккаунта.** `kind: 'github-user'` (`githubUserIntegrationKind`) создаётся с `workspaceUuid: null`. - `services/github/pod-github/src/users.ts`.

### Process
- **Методы шагов.** `RunSubProcess`, `RequestApproval`, `CreateToDo`, `UpdateCard`, `CreateCard`, `AddRelation`, `AddTag`, `CancelToDo`, `CancelSubProcess`, `LockCard`, `UnlockCard`. - `models/process/src/actions.ts`.
- **Триггеры переходов.** `OnApproveRequestApproved/Rejected`, `OnToDoClose`, `OnToDoRemove`, `OnExecutionStart`, `OnCardUpdate` (label "WhenCardMatches"), `WhenFieldChanges`, `WhenRequiredFieldsFilled`. - `models/process/src/triggers.ts`.
- **Запрос согласования как первый класс.** `ApproveRequest` (ToDo с `approved`/`reason`/`group`, `actionType: approve|review`). - `models/process/src/index.ts`, `plugins/process/src/index.ts`.
- **Отложенные переходы через TimeMachine.** Таймер шлётся в `QueueTopic.TimeMachine`, срабатывает как `ProcessMessage` в `QueueTopic.Process`. - `services/process/src/main.ts`.
- **Права запуска/отмены.** `ForbidRunProcess`, `ForbidCancelProcess`. - `models/process/src/permission.ts`.

### API-ключи
- **Личные и интеграционные API-ключи.** Интеграционный ключ со списком разрешённых операций (`issue:create/update/comment/time_report`, `chat:post`, `doc:create/update`) и опциональным ограничением на пространства (квота 5 активных на воркспейс), либо личный ключ, действующий с правами выпустившего (полные права/только чтение, квота 5 на человека); срок жизни выдаваемого токена 1-90 суток (по умолчанию 30), отзыв без отзыва уже выданных токенов. - `ApiKeySecret`/`generateApiKey`/`hashApiKey`, `server/account/src/apiKeys.ts`; UI - `plugins/setting-resources/src/components/{ApiKeysSection,ApiKeyTable,ApiKeyRow,ApiKeyPopup,CreateApiKeyPopup,ApiKeyOperationsPopup,ApiKeySpacesPopup}.svelte`.

### Вебхуки
- **Входящие вебхуки: вызов операций ключом.** Внешняя система POST-ит JSON `{action, ...}` на `/api/v1/webhook/action` (ключ в заголовке `Authorization`) или `/api/v1/webhook/k/:key` (ключ в пути, для сервисов без своих заголовков); приём асинхронный (202 + `jobId`), статус - через `/api/v1/webhook/job/:id`, повтор того же `Idempotency-Key` не создаёт новое задание. Отдельный флаг `incoming` на ключе, независимый от набора операций. - `services/webhook/pod-webhook/src/server.ts`; исполнение операций - `pods/server/src/opsApi.ts`.
- **Правила разбора чужого формата.** Для систем, которые шлют собственное тело (Prometheus Alertmanager, Grafana, GitLab, Sentry) - адрес `/api/v1/webhook/in` принимает тело как есть, правило переводит его в операцию: условия (`eq/neq/exists/regex/in`), цикл `forEach` по массиву с условием на элемент, шаблонные поля `{{path}}`/`{{$.path}}`, готовые шаблоны и предпросмотр. Правила привязаны к конкретному API-ключу. - `WebhookIncomingRule`/`evaluateWebhookRule`/`renderWebhookTemplate`, `plugins/setting/src/webhookRules.ts`, `models/setting/src/index.ts`; UI - `plugins/setting-resources/src/components/{WebhookRulesSection,WebhookRuleEditor,WebhookRuleFromTemplate,WebhookEventsPopup}.svelte`, `webhookRuleTemplates.ts`.
- **Исходящие вебхуки.** Эндпоинт с URL и набором событий (`issue.created/status_changed/assigned/commented/time_reported/time_report_updated`, `message.posted`, `document.created`); доставка подписывается по схеме Standard Webhooks (HMAC-SHA256, до двух секретов одновременно для ротации без простоя), повтор с бэкоффом до 5 попыток, автоотключение адреса после 3 неудач подряд, журнал доставок и тестовая отправка; запрет на приватные/служебные адреса (SSRF) и редиректы. Доступно только владельцу воркспейса. - `WebhookEndpoint`/`WebhookDelivery`/`WebhookStat`, `models/setting/src/index.ts`; `services/webhook/pod-webhook/src/{delivery,retry,signature,ssrf,stats,notify}.ts`; UI - `plugins/setting-resources/src/components/{WebhookEndpointsSection,WebhookEndpointEditor,CreateWebhookEndpoint}.svelte`.

### API-клиент (`@intabia-fusion/api`)
- **Единый npm-бандл поверх `@hcengineering/*`.** Собирается из `foundations/core/packages/{api-client,client,client-resources,account-client}` + `@intabiafusion/clisr` и доменных пакетов (tracker/chunter/contact/card/...). - `dev/api/config.yml`.
- **`connect()`/`PlatformClient`.** REST + WebSocket LiveQuery, `NodeWebSocketFactory` для Node.js. - `foundations/core/packages/api-client/src/client.ts`.
- Подробности использования, установка, примеры - см. `docs/api-client.md`.

## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Telegram-бот, команды | integrations/telegram | integrations/telegram | off | - | выключено на проде: telegram |
| Уведомления о новых сообщениях | integrations/telegram | integrations/telegram | off | - | выключено на проде: telegram |
| IntegrationType с несколькими аккаунтами | integrations/telegram | integrations/telegram | off | - | выключено на проде: telegram |
| OAuth-подключение, несколько ящиков | integrations/gmail | integrations/gmail | off | - | выключено в продукте |
| Full/partial синхронизация | - | - | internal | - | |
| Два адаптера сообщений | - | - | internal | - | |
| "Написать письмо" из карточки контакта / Applicant | integrations/gmail | integrations/gmail | off | - | выключено в продукте |
| Уведомления о входящих письмах | integrations/gmail | integrations/gmail | off | - | выключено в продукте |
| Три режима pod-mail | - | - | internal | - | |
| SMTP с пулом соединений | - | - | internal | - | |
| SES как альтернатива SMTP | - | - | internal | - | |
| Авто-создание Person/канала из письма | - | - | off | - | не документируем |
| Huly Mail IntegrationType | - | - | off | - | не документируем |
| GitHub App: установка и авторизация | integrations/github | integrations/github | off | - | выключено в продукте |
| Приём вебхуков | - | - | internal | - | |
| Двусторонняя синхронизация issues/PR | integrations/github | integrations/github | off | - | выключено в продукте |
| GitHub issue/PR как `tracker.class.Issue` | - | - | internal | - | |
| Одна интеграция на workspace | - | - | internal | - | |
| Отдельная global-интеграция для привязки личного GitHub-аккаунта | integrations/github | integrations/github | off | - | выключено в продукте |
| Методы шагов | - | - | off | - | не документируем |
| Триггеры переходов | - | - | off | - | не документируем |
| Запрос согласования как первый класс | - | - | off | - | не документируем |
| Отложенные переходы через TimeMachine | - | - | internal | - | |
| Права запуска/отмены | - | - | off | - | не документируем |
| Личные и интеграционные API-ключи | integrations/api-keys | integrations/api-keys | stale | 0.8.60 | en-скрины (huly/webhooks/api-key*.png) показывают ru-интерфейс («Создать личный ключ» и т.п.), нужно переснять на demo-en1 |
| Входящие вебхуки: вызов операций ключом | integrations/webhooks | integrations/webhooks | stale | 0.8.60 | en-скрины показывают ru-интерфейс, нужно переснять на demo-en1 |
| Правила разбора чужого формата | integrations/webhooks | integrations/webhooks | stale | 0.8.60 | en-скрины (webhook-rule*.png, «Правила (0)» и т.п.) показывают ru-интерфейс, нужно переснять на demo-en1 |
| Исходящие вебхуки | integrations/webhooks | integrations/webhooks | stale | 0.8.60 | en-скрины показывают ru-интерфейс, нужно переснять на demo-en1 |
| Единый npm-бандл поверх `@hcengineering/*` | - | - | plan | - | |
| `connect()`/`PlatformClient` | - | - | plan | - | |

## Куда смотреть, если нужно...

- Добавить команду Telegram-бота -> `services/telegram-bot/pod-telegram-bot/src/telegraf/commands.ts`, регистрация в `defineCommands` (`bot.ts`).
- Изменить маппинг ответа TG -> сообщение платформы -> `services/telegram-bot/pod-telegram-bot/src/telegraf/bot.ts` (`onReply`, `findMessageRecord`).
- Поправить синхронизацию Gmail (full/partial) -> `services/gmail/pod-gmail/src/message/sync.ts` (`SyncManager`).
- Добавить новое поле письма Gmail в модель -> `models/gmail/src/index.ts` (`TMessage`/`TNewMessage`).
- Изменить SMTP/SES конфиг рассылки -> `services/mail/pod-mail/src/config.ts`, `transport.ts`.
- Поменять правило "что считать своим письмом" при приёме почты -> `services/mail/pod-mail-worker/src/handlerMta.ts` (`isHulyMessage`).
- Добавить обработчик нового события GitHub -> `services/github/pod-github/src/platform.ts` (`octokitApp.webhooks.on`), плюс `DocSyncManager` в `services/github/pod-github/src/sync/`.
- Добавить новый класс GitHub-сущности -> `services/github/model-github/src/index.ts`.
- Добавить новый шаг (Method) процесса -> `models/process/src/actions.ts` (модель) + `server-plugins/process-resources/src/index.ts` (реализация).
- Добавить новый триггер перехода -> `models/process/src/triggers.ts` + `server-plugins/process-resources/src/index.ts`.
- Добавить функцию преобразования контекста процесса -> `models/process/src/functions.ts` (регистрация в модели, ~60 функций) + `server-plugins/process-resources/src/functions.ts` (реализация).
- Изменить набор экспортируемых пакетов API-бандла -> `dev/api/config.yml` (`roots`, `partial`, `excludeScope`).

## Настройки и конфигурация

- **Mail (`services/mail/pod-mail`):** `MODE=queue|server|client`, `PORT`, `SMTP_HOST/PORT/USERNAME/PASSWORD/TLS_MODE/DEBUG_LOG/ALLOW_SELF_SIGNED`, `SES_ACCESS_KEY/SECRET_KEY/REGION`, `SERVER_URL`, `API_KEY` (обязателен в режимах server/client). - `services/mail/pod-mail/src/config.ts`.
- **Process (`services/process`):** `QueueRegion` (регион Kafka для `QueueTopic.Process`/`QueueTopic.TimeMachine`), `Secret`. - `services/process/src/config.ts`, использование в `main.ts`.
- **GitHub (`services/github/pod-github`):** `ServerSecret`, `BrandingPath`. - `services/github/pod-github/src/index.ts`.
- **API-бандл:** версия/scope/roots публикуемого пакета задаются в `dev/api/config.yml` (`bundleName: "@intabia-fusion/api"`, `version`).

## Тесты

- Unit: `services/gmail/pod-gmail/src/__tests__/` (sync/gmailController/message/tokens и др.), `services/mail/mail-common/src/__tests__/`, `services/mail/pod-mail-worker/src/__tests__/`, `services/mail/pod-mail/src/__tests__/` (в т.ч. `main-queue-mode.test.ts`, `main-client-mode.test.ts`), `services/github/pod-github/src/__tests__/` и `src/sync/__tests__/pullrequests.test.ts`, `services/telegram-bot/pod-telegram-bot/src/__tests__/postgres-real.test.ts`.
- У `models/process`, `server-plugins/process*`, `services/process` unit-тестов нет.
- Sanity (Playwright): `tests/sanity/tests/integrations.spec.ts` (управление `Integration`/`IntegrationSecret` через account-service, использует `kind: 'github'`/`'telegram-bot'`/`'mailbox'` как фикстуры), `tests/sanity/tests/API/GithubIntegration.ts`. Отдельных UI-сценариев под Telegram/Gmail/Mail/Process нет.

## Связанные документы

- [API-клиент](../api-client.md) - установка, примеры, сборка бандла.
- [clisr: формат кадров](../memory/clisr_wire_protocol.md) - протокол, который использует `pod-mail` в режимах server/client.
- [Синк с upstream](../memory/upstream-sync.md) - `process` в списке приоритетных пакетов для переноса апстрим-изменений.
