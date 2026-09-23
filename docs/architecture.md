# Архитектура Intabia Platform

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Intabia Platform - pnpm-монорепозиторий (TypeScript/Svelte 4, часть сервисов на Go и Rust), развитие [hcengineering/platform](https://github.com/hcengineering/platform). Продукт - командная платформа: issue tracker, чаты, документы, календарь, CRM, HR, виртуальный офис (Love) и AI-бот. Сущности платформы: `Doc`/`Space`/`Tx` (модель данных и транзакции), `Plugin` (единица кода с `id`, ресурсами и опциональной серверной частью), `Workspace` (изолированное пространство данных клиента) и `Account` (глобальная учётная запись, общая для всех workspace).

Документ - для нового разработчика и для LLM-агента: где лежит код, как резолвятся ресурсы, как ходит запрос от клиента до БД и обратно.

## 1. Слои пакета плагина (на примере tracker)

Плагин обычно раскладывается на 4-6 пакетов. Ниже - реальные пути для `tracker` (issue tracker):

| Пакет | Путь | Роль |
| --- | --- | --- |
| `@hcengineering/model-tracker` | `models/tracker` | Builder: классы `@Model`, миксины, миграции |
| `@hcengineering/tracker` | `plugins/tracker` | id плагина, TS-интерфейсы (`Issue`, `Project`...), базовые id ресурсов |
| `@hcengineering/tracker-resources` | `plugins/tracker-resources` | Svelte-компоненты, реализация функций/экшенов |
| `@hcengineering/tracker-assets` | `plugins/tracker-assets` | `lang/*.json` (12 локалей), `assets/icons.svg` |
| `@hcengineering/server-tracker` | `server-plugins/tracker` | id серверного плагина, объявление триггеров |
| `@hcengineering/server-tracker-resources` | `server-plugins/tracker-resources` | Реализация триггеров |
| `@hcengineering/model-server-tracker` | `models/server-tracker` | Регистрирует триггеры как `Tx` в модели |

### Модель (`models/tracker`)

Builder-функция - `export function createModel (builder: Builder): void` в `models/tracker/src/index.ts`. Классы `@Model` вынесены в `models/tracker/src/types.ts`, например:

```ts
// types.ts
@Model(tracker.class.Issue, task.class.Task)
@UX(tracker.string.Issue, tracker.icon.Issue, 'TSK', 'title', ...)
export class TIssue extends TTask implements Issue {
```

Миксины навешиваются через `builder.mixin(...)` внутри `createModel` (например `models/tracker/src/index.ts` добавляет `converter.mixin.MarkdownValueFormatter`), а презентеры - отдельной функцией `definePresenters(builder)` в `models/tracker/src/presenters.ts`. Регистрация приложения в workbench - `builder.createDoc(workbench.class.Application, ...)` в `models/tracker/src/index.ts` (label/icon/navigatorModel).

Миграции - `models/tracker/src/migration.ts`, экспорт `export const trackerOperation: MigrateOperation` с фазами `preMigrate`/`migrate`/`upgrade`, каждый шаг - объект `{ state, func }` внутри `tryMigrate(...)`. Реэкспортируется из `models/tracker/src/index.ts`.

### Три уровня id ресурсов (важно для навигации по коду)

1. `plugins/tracker/src/index.ts` - `plugin(trackerId, { class, mixin, component, icon, string, ... })` - базовые id (`tracker.component.Tracker` и т.п.).
2. `plugins/tracker-resources/src/plugin.ts` - `mergeIds(trackerId, tracker, {...})` - добавляет id компонентов, которые реализует resources-пакет (например `tracker.component.IssuePresenter`).
3. `models/tracker/src/plugin.ts` - ещё один `mergeIds(...)` поверх предыдущего - id, нужные только при построении модели (viewlet-ы и т.п.).

Реализация ресурсов - `plugins/tracker-resources/src/index.ts` экспортирует `export default async (): Promise<Resources> => ({ component: { IssuePresenter, ... }, function: {...}, ... })`, компоненты импортируются напрямую из `.svelte`-файлов (`import IssuePresenter from './components/issues/IssuePresenter.svelte'`).

### Как резолвится ресурс в рантайме

`getResource<T>(resource: Resource<T>)` - `foundations/core/packages/platform/src/resource.ts`. Разбирает id вида `plugin:kind:name` (`_parseId`), берёт лоадер плагина из `Map<Plugin, PluginLoader>` (заполняется через `addLocation`, `resource.ts`), при первом обращении ждёт `import()` ресурс-модуля, кэширует результат (`cachedResource`), при отсутствии кидает `PlatformError(ResourceNotFound)`.

### Где регистрируется плагин при сборке

Общий билдер модели - `models/all` (пакет `@hcengineering/model-all`). `models/all/src/index.ts` импортирует `createModel as trackerModel` из `@hcengineering/model-tracker` и добавляет его в массив конфигураций билдеров с `label`/`icon`/`enabled: true`; `export default function buildModel (): Builder` в цикле вызывает каждый `createModel`-билдер и создаёт документ `PluginConfiguration`, который включает/выключает приложение в workbench.

Подключение ресурсов на клиенте - НЕ декларативный конфиг, а рантайм `addLocation` с динамическим `import()`:
- `dev/prod/src/platform.ts` - `addLocation(trackerId, async () => await import(/* webpackChunkName: "tracker" */ '@hcengineering/tracker-resources'))`
- `desktop/src/ui/platform.ts` - аналогично для Electron-клиента.
- Серверные триггеры аналогично: `server/server-pipeline/src/serverPlugins.ts` - `addLocation(serverTrackerId, () => import('@hcengineering/server-tracker-resources'))`.

Отдельного per-plugin webpack.config нет: код-сплиттинг обеспечивается magic comment `webpackChunkName` в динамическом `import()`.

### Серверные триггеры (`server-plugins/tracker(-resources)`)

`server-plugins/tracker/src/index.ts` объявляет id триггеров:

```ts
trigger: {
  OnIssueUpdate: '' as Resource<TriggerFunc>,
  OnComponentRemove: '' as Resource<TriggerFunc>,
  OnProjectRemove: '' as Resource<TriggerFunc>
}
```

Реализация - `server-plugins/tracker-resources/src/index.ts` `export async function OnIssueUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]>` (пересчёт `parents`, идентификаторов и т.п. при изменении Issue). Регистрация как `Tx` в модели - `models/server-tracker/src/index.ts`: `builder.createDoc(serverCore.class.Trigger, core.space.Model, { trigger: serverTracker.trigger.OnIssueUpdate, txMatch: {...} })`.

## 2. Каталог foundations/*

`foundations/*` - ядро платформы и базовые сервисы. Код развивается в этом репозитории обычными PR, как и остальные пакеты.

| Каталог | Технология | Состав (`pnpm-workspace.yaml`) | Назначение |
| --- | --- | --- | --- |
| `foundations/core` | TS | `core`, `platform`, `model`, `client`, `client-resources`, `api-client`, `account-client`, `hulylake-client`, `rpc`, `token`, `text*`, `query`, `postgres-base`, `storage*`, `rank`, `retry`, `measurements*`, `analytics*` | Фундамент платформы: типы `Doc`/`Space`/`Tx`/`Class` (`packages/core`), plugin-runtime и `getResource` (`packages/platform`), клиентский `Client`/`LiveQuery` (`packages/client`, `packages/query`) |
| `foundations/server` | TS | `core`, `server`, `middleware`, `postgres`, `mongo`, `elastic`, `minio`, `s3`, `datalake`, `hulylake`, `kafka`, `collaboration`, `client`, `server-storage` | Серверная инфраструктура: `Pipeline`/`Middleware` (`packages/core/src/pipeline.ts`), готовые middleware (`packages/middleware`), адаптеры БД/хранилищ, обёртка над Kafka (`packages/kafka`) |
| `foundations/stream` | Go | `foundations/stream` в `pnpm-workspace.yaml`, свой `go.mod`, `package.json` с `template: docker-package` | Транскодирование видео в HLS (`ffmpeg`/`ffprobe`), приём через TUS-загрузку или Kafka-очередь, загрузка сегментов в S3/Datalake (`README.md` в каталоге) |
| `foundations/utils` | TS | `platform-rig`, `ui-test` | Обвязка для сборки/тестирования (rig-конфиги, ui test helpers) |

## 3. Серверный путь запроса

1. **Клиент открывает WebSocket.** `@hcengineering/client-resources`: `GetClient` (`foundations/core/packages/client-resources/src/index.ts`) строит `connect()` (`foundations/core/packages/client-resources/src/connection.ts`), которая открывает `new WebSocket(url)` (`connection.ts`) и оборачивает результат через `createClient` (`foundations/core/packages/core/src/client.ts`).
2. **Транзактор принимает соединение.** `pods/server/src/server_http.ts` поднимает `WebSocketServer`, на `httpServer.on('upgrade', ...)` декодирует токен и делает `wss.handleUpgrade`; в обработчике `handleConnection` создаётся сессия (`sessions.addSession`) и на `ws.on('message', ...)` дергается `processRequest(...)` из `@hcengineering/server`. Реализация сессии - `TSessionManager` (`foundations/server/packages/server/src/sessionManager.ts`) и `ClientSession` (`foundations/server/packages/server/src/client.ts`).
3. **Pipeline/middleware.** Цепочка строится `createPipeline` (`foundations/server/packages/core/src/pipeline.ts`): массив `MiddlewareCreator` оборачивается с конца в начало в связный список (`buildChain`). Интерфейсы - `Middleware`/`PipelineContext`/`Pipeline` (`foundations/server/packages/core/src/types.ts`). Конкретные middleware - `foundations/server/packages/middleware/src/*.ts`, в частности `DBAdapterMiddleware` (`dbAdapter.ts`, создаёт `DbAdapter` по конфигурации), `DomainTxMiddleware` (`domainTx.ts`, маршрутизирует CUD-транзакции по доменам), `TriggersMiddleware` (`triggers.ts`, дёргает серверные триггеры) и `BroadcastMiddleware` (`broadcast.ts`, копит и рассылает `tx` подписанным сессиям).
4. **Адаптер БД (Postgres/CockroachDB).** `foundations/server/packages/postgres/src/storage.ts` `abstract class PostgresAdapterBase implements DbAdapter` (методы `findAll`, `tx`), конкретный класс - `PostgresAdapter`.
5. **Триггеры server-plugins.** Тип и интерфейс - `foundations/server/packages/core/src/types.ts` (`TriggerFunc`, `interface Trigger extends Doc { trigger: Resource<TriggerFunc> }`); движок - `class Triggers` (`foundations/server/packages/core/src/triggers.ts`), читает документы `serverCore.class.Trigger` из модели. `TriggersMiddleware` создаёт `new Triggers(...)` в конструкторе и вызывает их после применения транзакции. Пример - `OnIssueUpdate` из `server-plugins/tracker-resources` (см. раздел 1).
6. **Broadcast -> клиентский LiveQuery.** `BroadcastMiddleware` рассылает `tx` через `handleBroadcast` всем подписанным WS-сессиям -> на клиенте `Connection.onmessage` (`connection.ts`) парсит ответ и зовёт зарегистрированный `TxHandler` (`connection.ts`) -> `txHandler` в `foundations/core/packages/core/src/client.ts` вызывает `client.updateFromRemote(...tx)` -> из обновлённой модели транзакции читает `class LiveQuery implements WithTx, Client` (`foundations/core/packages/query/src/index.ts`, метод `tx` -) -> Svelte-обёртка `packages/presentation/src/utils.ts` (`class LiveQuery`, `createQuery()` -) обновляет store, на который подписан компонент.

## 4. pods/* и services/*

### pods/* (14 директорий; главный пакет и назначение по коду)

| Под | Главный файл | Назначение |
| --- | --- | --- |
| `pods/server` | `pods/server/src/__start.ts` -> `server.ts` | Транзактор - главный WS-сервер платформы, собирает pipeline, слушает Kafka как `transactor` |
| `pods/account` | `pods/account/src/__start.ts` | Аутентификация/учётки (`serveAccount` из `@hcengineering/account-service`) |
| `pods/workspace` | `pods/workspace/src/__start.ts` | Управление жизненным циклом workspace (`serveWorkspaceAccount`), использует Kafka |
| `pods/front` | `pods/front/src/__start.ts` | Раздача веб-клиента (SPA) |
| `pods/backup` | `pods/backup/src/index.ts` | Бэкап-пайплайн воркспейсов |
| `pods/collaborator` | `pods/collaborator/src/__start.ts` | Совместное редактирование документов (CRDT) |
| `pods/fulltext` | `pods/fulltext/src/index.ts` | Индексатор полнотекстового поиска (Elastic + Rekoni), читает `Tx` из Kafka |
| `pods/stats` | `pods/stats/src/__start.ts` | Сервис метрик (пишет `metrics.txt` раз в 30с), без Kafka |
| `pods/media` | `pods/media/src/index.ts` | Воркер видео-транскодирования, консьюмер топика транскодирования |
| `pods/preview` | `pods/preview/src/index.ts` | HTTP-сервис превью/thumbnail файлов |
| `pods/link-preview` | `pods/link-preview/src/index.ts` | HTTP-сервис превью ссылок |
| `pods/authProviders` | `pods/authProviders/src/index.ts` | OAuth-провайдеры входа (GitHub/Google/OpenID) |
| `pods/embeddings` | `pods/embeddings/server.py` | Python HTTP-сервис эмбеддингов/LLM-инференса (не TS, отдельно от pnpm workspace) |
| `pods/external` | `pods/external/bin/*.sh`, `services.d/*.service` | Не сервис, а build-инструмент для сборки/публикации внешних Docker-образов (huly-caldav, hulylake, stream и т.п.) |

### services/* (актуальные)

| Сервис | Главный файл | Назначение |
| --- | --- | --- |
| `services/activity` | `services/activity/src/index.ts` | Строит ленту активности (`DocUpdateMessage`) из `Tx`, консьюмер Kafka |
| `services/notifications` | `services/notifications/src/index.ts` | Генерация уведомлений/упоминаний из `Tx` |
| `services/ai-bot` | `pod-ai-bot/src/index.ts` (+ `love-agent/src/start.ts`) | AI-бот (режимы event-router/llm-router/stt-worker) и voice-агент для Love; самый насыщенный по Kafka-топикам |
| `services/love` | `services/love/src/main.ts` | Видео-звонки (LiveKit), продюсер/консьюмер `LoveQueue`/`Workspace`/`Tx` |
| `services/billing` | `pod-billing/src/main.ts` | Биллинг и лимиты воркспейсов, продюсер `Workspace`/`NotificationQueue` |
| `services/payment` | `pod-payment/src/main.ts` (+ `pod-tbank-subscriptions`) | Платежи/подписки, включая интеграцию Т-Банк |
| `services/calendar` | `pod-calendar/src/main.ts` (+ `pod-calendar-mailer`) | Внешние календари, рассылка e-mail по событиям |
| `services/crm` | `pod-crm/src/index.ts` | Интеграция CRM (amoCRM) |
| `services/mail` | `pod-mail/src/main.ts`, `pod-mail-worker`, `mail-common` | Отправка/приём почты, общая Kafka-обёртка в `mail-common` |
| `services/gmail` | `pod-gmail/src/main.ts` | Интеграция Gmail |
| `services/github` | `pod-github/src/index.ts` | Синхронизация issues/PR с GitHub |
| `services/telegram`, `services/telegram-bot` | `pod-telegram/src/main.ts`, `pod-telegram-bot/src/start.ts` | Telegram-интеграция и бот |
| `services/datalake` | `pod-datalake/src/main.ts` | S3-совместимое объектное хранилище файлов |
| `services/db-migrator` | `services/db-migrator/src/index.ts` | Прогон миграций схемы Postgres |
| `services/export` | `pod-export/src/main.ts` | Экспорт данных воркспейса в CSV/JSON |
| `services/print` | `pod-print/src/main.ts` | Конвертация/печать документов |
| `services/sign` | `pod-sign/src/main.ts` | Электронная подпись документов |
| `services/rekoni` | `services/rekoni/src/index.ts` | Извлечение текста из документов (PDF, резюме и т.п.) |
| `services/rating` | `services/rating/src/index.ts` | Индексатор рейтинга/скоринга контактов |
| `services/process` | `services/process/src/main.ts` | Исполнитель бизнес-процессов над карточками |
| `services/worker` | `services/worker/src/index.ts` | Воркер отложенных задач ("time machine") |
| `services/notification` | `pod-notification/src/main.ts` | Push-уведомления (Web Push/APNs/FCM) |
| `services/analytics-collector` | `pod-analytics-collector/src/main.ts` | Сбор аналитики/геолокации |
| `services/backup` | `backup-api-pod/src/main.ts` | HTTP API поверх бэкапов |

### Kafka / очереди

Брокер - Redpanda (Kafka-совместимый), сервис `redpanda` в `dev/docker-compose.yaml` (порты 9092/19092), плюс UI `redpanda_console`. Общий клиент - `@hcengineering/kafka` (`foundations/server/packages/kafka/src/index.ts`), обёртка над `kafkajs`: `getPlatformQueue(serviceId, region?)` возвращает `PlatformQueue` с `getProducer()`/`createConsumer()`, включает обработку ребаланса консьюмер-групп. Используется в транзакторе (`pods/server/src/__start.ts`, тема `transactor`), в `pods/workspace`, `pods/fulltext`, `pods/media` и почти во всех `services/*`, слушающих `Tx` (activity, notifications) или доменные топики (`LoveQueue`, `TimeMachine`, `Subscription`, `TelegramBot` и т.п.). `services/mail/mail-common/src/queue.ts` - отдельная обёртка поверх `kafkajs` напрямую (не через `getPlatformQueue`), используется `pod-mail-worker` и `pod-gmail`.

## 5. Аккаунт vs воркспейс

Два разных пакета в `server/`:

- `server/account` (пакет `@hcengineering/account`) - бизнес-логика аккаунтов: `login`, `signUp`, `createWorkspace`, `joinByInvite`, `deleteWorkspace` и т.п. - все экспортированы как функции в `server/account/src/operations.ts`.
- `server/account-service` (пакет `@hcengineering/account-service`) - HTTP/RPC-обвязка поверх `server/account`, запускается подом `pods/account` через `serveAccount(...)`.
- `server/workspace-service` (пакет `@hcengineering/workspace-service`) - фоновый воркер жизненного цикла воркспейсов: `export class WorkspaceWorker` (`server/workspace-service/src/service.ts`), операции создания/апгрейда в `ws-operations.ts` (`createWorkspace`, `upgradeWorkspace`). Запускается подом `pods/workspace` через `serveWorkspaceAccount(...)`.

Хранилище аккаунтов - отдельная Postgres-схема `global_account`, общая для всех воркспейсов. Класс адаптера - `PostgresAccountDB` (`server/account/src/collections/postgres/postgres.ts`, `ns = 'global_account'` по умолчанию). Таблицы объявлены в `server/account/src/collections/postgres/migrations.ts`: `person`, `account`, `account_passwords`, `account_events`, `social_id`, `workspace`, `workspace_status`, `workspace_members`, `otp`, `invite`, `mailbox`, `mailbox_secrets`, `integrations`, `integration_secrets`, `user_profile`, `subscription`, `workspace_permissions`, `short_links`.

Данные документов (issues, чаты и т.д.) хранятся отдельно - per-workspace через `PostgresAdapter` (`foundations/server/packages/postgres/src/storage.ts`, раздел 3): таблицы доменов общие для всех воркспейсов, каждая строка несёт колонку `"workspaceId"` (`convertDoc(domain, doc, this.workspaceId, ...)`), и адаптер добавляет `"workspaceId" = ...` в каждый запрос (`storage.ts`). Изоляция - фильтром в запросе, а не отдельной базой или схемой.

Связь сущностей (по коду `server/account`): `Account` - запись входа (email/пароль или соц-провайдер), у одного `Account` может быть несколько `SocialId` (разные способы идентификации) и один `Person` (профиль); `Account` состоит в `workspace_members` для одного или нескольких `Workspace`; `WorkspaceStatus` - отдельная таблица операционного состояния воркспейса (создание/апгрейд/удаление), отдельно от самой записи `workspace`.

## 6. Сборка и dev-стенд

Подробности - в [getting-started.md](getting-started.md) (установка, `pnpm install --frozen-lockfile`, Docker) и [AGENTS.md](../AGENTS.md) (команды `pnpm build:lint --to <pkg>`, правила проверки, docker-workflow для `pods/`/`services/`). Кратко: pnpm workspaces (`pnpm-workspace.yaml`), TypeScript 7 (`typescript7`) компилирует и тайпчекает за один проход, Rush полностью убран.

`dev/docker-compose.yaml` поднимает локальный стенд. Инфраструктурные сервисы: `postgres`, `redis`, `minio`, `redpanda`/`redpanda_console` (Kafka), `elastic`/`elastic-plugins`, `mailpit`/`mail_server`/`mail_client`, `nginx`, `telemetry`. Прикладные поды/сервисы: `transactor` (`pods/server`), `account`, `workspace`, `front`, `db-migrator`, `dbpg`, `stats`, `fulltext`, `preview`, `link-preview`, `media`, `export`, `print`, `sign`, `rekoni`, `collaborator0`, `billing`, `payment`, `tbank-subscriptions`, `notification`, `notifications`, `activity`, `rating`, `process-service`, `time-machine`, `love`, `love-agent`, `livekit-egress`, `aibot`, `aibot_client_llm`, `aibot_client_stt`, `datalake`, `stream`.

## 7. Куда смотреть, если нужно...

- **Добавить класс модели** - `models/<plugin>/src/types.ts` (или `index.ts`), декоратор `@Model(<id>, <parent>)`, зарегистрировать через `builder.createModel(T...)` в `models/<plugin>/src/index.ts` (образец - `models/tracker`).
- **Добавить миграцию** - `models/<plugin>/src/migration.ts`, экспорт `MigrateOperation` с шагами `preMigrate`/ `migrate`/`upgrade` через `tryMigrate`/`tryUpgrade` (образец - `models/tracker/src/migration.ts`).
- **Добавить серверный триггер** - id в `server-plugins/<plugin>/src/index.ts` (`trigger: { ... }`), реализация в `server-plugins/<plugin>-resources/src/index.ts`, регистрация `Tx` в `models/server-<plugin>/src/index.ts` через `builder.createDoc(serverCore.class.Trigger, ...)`.
- **Добавить i18n-ключ** - `plugins/<plugin>-assets/lang/*.json`, ключ добавить сразу во ВСЕ локали каталога (en/ru/de/es/fr/it/ja/pt/pt-br/tr/zh/cs и т.п. - список конкретных локалей смотреть по факту в самом каталоге), отсутствующий ключ в неанглийской локали молча откатится на английский.
- **Новое приложение в workbench** - `builder.createDoc(workbench.class.Application, core.space.Model, {...})` в `models/<plugin>/src/index.ts` (образец - `models/tracker/src/index.ts`), плюс добавить билдер в общий массив в `models/all/src/index.ts` (import + строка в массиве конфигураций) - без этого приложение не попадёт в `PluginConfiguration` и не появится в списке.
- **Подключить ресурсы плагина на клиенте** - `addLocation(<pluginId>, () => import('@hcengineering/<plugin>-resources'))` в `dev/prod/src/platform.ts` (веб) и `desktop/src/ui/platform.ts` (Electron); для серверных ресурсов - `server/server-pipeline/src/serverPlugins.ts`.
- **Новый pod/сервис** - скопировать структуру соседнего пода (`package.json` с `"template": "@hcengineering/node-package"`, `Dockerfile`, `src/__start.ts` или `src/index.ts` как точка входа), добавить `docker:build`-скрипт (шаблон уже прописывает вызов `common/scripts/docker_build.sh <name>`) и добавить сервис в `dev/docker-compose.yaml`.
- **Разобраться в серверном pipeline** - начать с `foundations/server/packages/core/src/pipeline.ts` (`createPipeline`) и `foundations/server/packages/middleware/src/*.ts` (полный список конкретных middleware).
- **Разобраться в адаптере Postgres** - `foundations/server/packages/postgres/src/storage.ts` (`PostgresAdapterBase`/`PostgresAdapter`).
- **Изменить схему аккаунта/воркспейса** - `server/account/src/collections/postgres/migrations.ts` (таблицы `global_account.*`) и `server/account/src/collections/postgres/postgres.ts` (`PostgresAccountDB`).

## 8. Карта фич

Обзор конкретных фич продукта (что реализовано, где код) - в [`./features/README.md`](features/README.md).

## Связанные документы

- [memory/clisr_wire_protocol.md](memory/clisr_wire_protocol.md) - clisr: формат кадров и глубина отправки
- [memory/cockroach-dropped.md](memory/cockroach-dropped.md) - CockroachDB dropped from the test lane (possible, not supported for now)
- [memory/fulltext_bulk_mode.md](memory/fulltext_bulk_mode.md) - Fulltext pod - bulk mode
- [memory/kafka_consumer_test_overhead.md](memory/kafka_consumer_test_overhead.md) - Kafka consumer lifecycle dominates fulltext test time
- [memory/livequery-coverage-and-bench.md](memory/livequery-coverage-and-bench.md) - LiveQuery: инварианты, покрытие и бенчмарки
- [memory/livequery-tx-ordering.md](memory/livequery-tx-ordering.md) - LiveQuery tx ordering vs ClientImpl.tx
- [memory/pod_log_volume.md](memory/pod_log_volume.md) - Pod log volume: what was actually filling it
- [memory/postgres-reverse-lookup-sort.md](memory/postgres-reverse-lookup-sort.md) - Postgres: sort by reverse lookup field
- [memory/rpc-json-protocol.md](memory/rpc-json-protocol.md) - RPC: протокол транзактора
- [memory/stats-slow-sql-tool.md](memory/stats-slow-sql-tool.md) - Stats SQL analysis tools (dev/tool)
- [memory/transactor-workspace-memory.md](memory/transactor-workspace-memory.md) - Память транзактора на пространство
