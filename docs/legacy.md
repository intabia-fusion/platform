# Неактивный код

Код, который есть в репозитории, но не работает или не подключён. В [architecture.md](architecture.md) и [features/](features/README.md) он не описан. Удалить, доделать или подключить - отдельное решение.

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

## Сервисы и пакеты

| Что | Где | Состояние |
| --- | --- | --- |
| Huly Virtual Network | `foundations/net` (`packages/{core,client,server,backrpc}`, `pods/{network-pod,network-tool}`) | Пакеты в `pnpm-workspace.yaml`, но `@hcengineering/network-*` не импортируется вне `foundations/net`, в `dev/docker-compose.yaml` сервиса нет |
| Hulylake (blob store на Rust) | `foundations/hulylake` | Сервис `hulylake` в `dev/docker-compose.yaml` закомментирован. Клиент (`HulylakeStorage` в `foundations/core/packages/storage-client`) выбирается `createFileStorage` только при заданном `HULYLAKE_URL` и пустом `DATALAKE_URL` |
| Telegram через личный аккаунт (MTProto) | `services/telegram/pod-telegram` | REST-эндпоинты в `main.ts` закомментированы (`endpoints` - пустой массив), `WorkspaceWorker` в `workspace.ts` бросает `Error('Not implemented')` в трёх методах. Клиентские вызовы из `plugins/telegram-resources/src/api.ts` уходят на несуществующие маршруты. Рабочая Telegram-интеграция - бот, [features/integrations.md](features/integrations.md) |
| Board, Bitrix | `plugins/board-assets`, `plugins/bitrix-assets` | Остался по одному файлу `lang/pt-br.json`, самих плагинов нет |

## Модель без логики

| Что | Где | Состояние |
| --- | --- | --- |
| AI-матчинг кандидата и вакансии | `ApplicantMatch` в `models/recruit/src/types.ts`, viewlet `recruit.viewlet.TableApplicantMatch` | Класс и отображение есть, кода, который создаёт `ApplicantMatch`, нет |
| `TodoAutomationHelper.onDoneTester` | `models/time/src/index.ts`, регистрация в `services/github/server-github-model/src/index.ts` | Ресурс регистрируется, но нигде не вызывается |
| События аналитики test-management | `TestManagementEvents` в `plugins/test-management/src/analytics.ts` | Из 10 значений отправляются только `TestRunCreated` и `TestPlanCreated` |
| Функции workflow `Split`, `Offset` | `models/workflow/src/functions.ts` | Объявления закомментированы |

## Отключённое в коде

| Что | Где | Состояние |
| --- | --- | --- |
| Уведомления HR | `models/hr/src/index.ts` | Четыре блока `NotificationType` закомментированы (`// TODO: FIXME LATER`) |
| Sanity-тест HR | `tests/sanity/tests/hr.spec.ts` | Тела тестов закомментированы, внутри `test.describe` активен только `beforeEach` |
