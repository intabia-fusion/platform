# Документация Intabia Platform

Оглавление `docs/`. Порядок для нового человека: [getting-started](getting-started.md) -> [architecture](architecture.md) -> [карта фич](features/README.md) -> документ своей области. Правила кода и сборки - [AGENTS.md](../AGENTS.md).

## Старт и сборка

| Документ | О чём |
| --- | --- |
| [getting-started.md](getting-started.md) | Установка, сборка, dev-режим, команды, разбор проблем |
| [wsl.md](wsl.md) | Сборка на Windows через WSL |
| [nginx-dev-routing.md](nginx-dev-routing.md) | Dev-стенд: весь трафик через nginx на 8087, роутинг по путям |
| [devNotes.md](devNotes.md) | Тестирование OTP и почты через mailpit |
| [disableFeatures.md](disableFeatures.md) | Отключение модулей в self-hosted установке |
| [lint-phase-optimization.md](lint-phase-optimization.md) | Lint-фаза сборки: память и параллелизм |
| [macos_signing.md](macos_signing.md) | Подпись и нотаризация desktop-приложения для macOS |

## Архитектура и карта фич

| Документ | О чём |
| --- | --- |
| [architecture.md](architecture.md) | Слои монорепо, устройство плагина, путь запроса, поды и сервисы |
| [features/README.md](features/README.md) | Карта продуктовых областей: где код, как работает, куда смотреть |
| [connection_reconnect.md](connection_reconnect.md) | WebSocket клиента: подключение и переподключение |
| [space_security_broadcasts.md](space_security_broadcasts.md) | `SpaceSecurityMiddleware`: кому уходят broadcast-транзакции |
| [pulse.md](pulse.md) | Transient-документы вместо hulypulse (присутствие, typing) |
| [stream_integration.md](stream_integration.md) | Как платформа работает с `foundations/stream`: загрузка, транскодинг, плеер |
| [api-client.md](api-client.md) | npm-пакет `@intabia-fusion/api`: REST и LiveQuery |
| [ui-components/README.md](ui-components/README.md) | Каталог UI-компонентов: что переиспользовать вместо нового `.svelte` |

## Подсистемы (подробно)

| Документ | О чём |
| --- | --- |
| [love.md](love.md) | Виртуальный офис и встречи: модель, протоколы, дефекты, тесты с LiveKit |
| [llm.md](llm.md) | Юля ИИ: устройство и сценарии |
| [ai-harness.md](ai-harness.md) | Юля ИИ: алгоритм ответа, инструменты, промпты |
| [aibot-deployment.md](aibot-deployment.md) | Юля ИИ: роли `MODE`, env, масштабирование |
| [aibot.md](aibot.md) | Юля ИИ: поведение на стенде и тест-план для QA |
| [aibot-mock-testing.md](aibot-mock-testing.md) | Юля ИИ: локальная проверка на мок-провайдере |
| [billing-subscription-status-transitions.md](billing-subscription-status-transitions.md) | Статусы подписки и переходы между ними |
| [password_policy.md](password_policy.md) | Политика паролей (только на клиенте) |
| [controlDocumentsOverview.md](controlDocumentsOverview.md) | Controlled Documents (QMS): функционал по sanity-тестам |
| [time-tracking.md](time-tracking.md) | Оценки и учёт времени в трекере, агрегация по дереву задач |
| [workflow.md](workflow.md) | Workflow: что покрыто тестами |

## Тесты и производительность

| Документ | О чём |
| --- | --- |
| [testing.md](testing.md) | Unit, Playwright UI, интеграционные стенды |
| [perf-tests.md](perf-tests.md) | Перф-тесты в ws-tests |

## Процессы

| Документ | О чём |
| --- | --- |
| [changelog.update.task.md](changelog.update.task.md) | Как обновлять changelog |

## Неактивный код

[legacy.md](legacy.md) - код в репозитории, который не работает или не подключён: сервисы, модели без логики, закомментированные блоки.

## История и исследования

Старые планы и журналы. Расходятся с текущим кодом, кандидаты на удаление.

| Документ | О чём |
| --- | --- |
| [new-pulse.md](new-pulse.md) | План перехода на transient docs, итог в [pulse.md](pulse.md) |
| [region_config.md](region_config.md) | План конфигурации регионов, реализован частично и иначе (`server/account/src/region-config.ts`) |
| [allow_screen_share_request.md](allow_screen_share_request.md) | План запроса шаринга экрана, не реализован |
| [stream_service_hardening.md](stream_service_hardening.md) | Журнал сессии по stream-сервису; таблица качества транскодирования актуальна |
| [time-tracking-examples.md](time-tracking-examples.md) | Черновой пример расчёта времени по ветвящемуся дереву задач |
| [rush_build_horror.md](rush_build_horror.md) | Замедление сборки Rush (Rush удалён, сборка на pnpm) |
| [FUSIO-866.md](FUSIO-866.md) | Чек-лист ревью PR ai-bot/billing |

## Заметки сессий

[memory/README.md](memory/README.md) - оглавление заметок по областям: корневые причины, особенности сторонних систем, измеренные константы. Каждая заметка ссылается на документ своей области, документ области - на свои заметки.
