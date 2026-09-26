# Заметки памяти

Короткие факты, которых нет в коде: корневые причины, особенности сторонних систем, измеренные константы. Правила - раздел "Session memory" в [AGENTS.md](../../AGENTS.md). Каждая заметка начинается со строки "Область:" со ссылкой на документ области.

## Трекер - [tracker.md](../features/tracker.md)

- [workflow-tests.md](workflow-tests.md) - Workflow feature: import/export API and API tests

## Чат и уведомления - [chat.md](../features/chat.md), [notifications.md](../features/notifications.md)

- [chat-viewport.md](chat-viewport.md) - Чат: загрузка окна и чтение при скролле
- [notifications-embedded-model.md](notifications-embedded-model.md) - Уведомления: встроенная модель и сервис

## Встречи - [office-meetings.md](../features/office-meetings.md)

- [love-service-replication.md](love-service-replication.md) - love service: реплицируется
- [love_agent_prebuffer.md](love_agent_prebuffer.md) - love-agent: pre-buffer нарезки чанков
- [love_invite_multitab.md](love_invite_multitab.md) - Invite/knock multi-tab guards
- [love_one_person_two_meetings.md](love_one_person_two_meetings.md) - Один человек в двух митингах (FUSIO, 0.8.37)
- [love_recording_button_stuck.md](love_recording_button_stuck.md) - Кнопка записи залипает: /startRecord -> 409 already-running
- [love_workspace_switch_kills_meeting.md](love_workspace_switch_kills_meeting.md) - Смена пространства убивает звонок (PROD-инцидент)

## Документы и QMS - [documents-qms.md](../features/documents-qms.md)

- [clipboard-copy.md](clipboard-copy.md) - Clipboard copy pitfalls
- [qms-tests-integration.md](qms-tests-integration.md) - QMS Sanity Tests Integration (qms-tests/sanity)

## AI-ассистент - [ai.md](../features/ai.md)

- [ai_bot_context_and_settings.md](ai_bot_context_and_settings.md) - Юля ИИ: контекст разговоров, настройки, модели
- [ai_bot_proactive.md](ai_bot_proactive.md) - Проактивная Юля: welcome, авто-резюме митинга
- [ai_harness_progress_cancel.md](ai_harness_progress_cancel.md) - AI harness: прогресс запроса и отмена
- [ai_token_topups.md](ai_token_topups.md) - AI-токены: тарифное окно + купленный баланс

## Биллинг - [billing.md](../features/billing.md)

- [billing-limits-enforcement.md](billing-limits-enforcement.md) - Billing limits enforcement
- [billing_dev_stand_quirks.md](billing_dev_stand_quirks.md) - Billing dev stand quirks
- [tbank_api_spec.md](tbank_api_spec.md) - T-Bank Acquiring API - особенности реализации

## Аккаунты и вход - [auth-onboarding.md](../features/auth-onboarding.md)

- [account_db_migrations.md](account_db_migrations.md) - Account DB migrations
- [admin_plugin_refactor.md](admin_plugin_refactor.md) - Admin plugin gotchas
- [deferred-deletion.md](deferred-deletion.md) - Отложенное удаление пространств и аккаунтов

## Планировщик и календарь - [planner-calendar.md](../features/planner-calendar.md)

- [calendar-busy-slot-api-tests.md](calendar-busy-slot-api-tests.md) - calendar.class.BusySlot API tests
- [planner-demo-data-tool.md](planner-demo-data-tool.md) - `generate-planner-data` tool command (FUSIO-1308)
- [planner-spaces-api-tests.md](planner-spaces-api-tests.md) - Planner space-ownership API tests (FUSIO-1308)
- [planner-todo-issue-decoupling.md](planner-todo-issue-decoupling.md) - Planner ToDo <-> Issue
- [presence-fanout.md](presence-fanout.md) - Presence: логин и кросс-воркспейс непрочитанное
- [person_mention_direct.md](person_mention_direct.md) - Клик по упоминанию персоны открывает DM; кнопки DM/звонка в карточке персоны
- [team-planner-filters.md](team-planner-filters.md) - Team Planner: FilterBar/FilterButton project filter (FUSIO-1308)

## Файлы и медиа - [drive-media.md](../features/drive-media.md)

- [preview_bench.md](preview_bench.md) - Preview bench: what it measures and what to distrust
- [video-transcoding-storage.md](video-transcoding-storage.md) - Video transcoding: storage accounting and deletion

## Каркас, бэкап, desktop - [platform-infra.md](../features/platform-infra.md)

- [backup_index_revision_guard.md](backup_index_revision_guard.md) - Аренда бэкапа и ревизия индекса (FUSIO-1339)
- [desktop-update-system.md](desktop-update-system.md) - Desktop auto-update system
- [sidebar-widget-tabs.md](sidebar-widget-tabs.md) - Sidebar widget tabs

## Архитектура, протокол, эксплуатация - [architecture.md](../architecture.md)

- [clisr_wire_protocol.md](clisr_wire_protocol.md) - clisr: формат кадров и глубина отправки
- [cockroach-dropped.md](cockroach-dropped.md) - CockroachDB dropped from the test lane (possible, not supported for now)
- [fulltext_bulk_mode.md](fulltext_bulk_mode.md) - Fulltext pod - bulk mode
- [kafka_consumer_test_overhead.md](kafka_consumer_test_overhead.md) - Kafka consumer lifecycle dominates fulltext test time
- [livequery-coverage-and-bench.md](livequery-coverage-and-bench.md) - LiveQuery: инварианты, покрытие и бенчмарки
- [livequery-tx-ordering.md](livequery-tx-ordering.md) - LiveQuery tx ordering vs ClientImpl.tx
- [pod_log_volume.md](pod_log_volume.md) - Pod log volume: what was actually filling it
- [postgres-reverse-lookup-sort.md](postgres-reverse-lookup-sort.md) - Postgres: sort by reverse lookup field
- [rpc-json-protocol.md](rpc-json-protocol.md) - RPC: протокол транзактора
- [stats-slow-sql-tool.md](stats-slow-sql-tool.md) - Stats SQL analysis tools (dev/tool)
- [transactor-workspace-memory.md](transactor-workspace-memory.md) - Память транзактора на пространство

## Сборка, CI, dev-стенд - [getting-started.md](../getting-started.md)

- [ci-deploy-stands.md](ci-deploy-stands.md) - ci_deploy.sh и стенды selfhost
- [dependency-upgrade-tooling.md](dependency-upgrade-tooling.md) - Dependency upgrade tooling
- [eslint8_upgrade_fix_patterns.md](eslint8_upgrade_fix_patterns.md) - @typescript-eslint 6->8 fix patterns
- [fast-build-tooling.md](fast-build-tooling.md) - fast-build tooling (platform-rig/bin)
- [fast_build_cache_external_deps.md](fast_build_cache_external_deps.md) - fast-build cache ignores external dependencies
- [go-docker-build.md](go-docker-build.md) - Go docker builds (foundations/stream)
- [test-stand-nodejs.md](test-stand-nodejs.md) - Test stand setup in node (dev/test-base)
- [typescript7-migration.md](typescript7-migration.md) - TypeScript 7 (tsgo) build
- [upstream-sync.md](upstream-sync.md) - Синк с upstream (Platform-Collective/platform)

## Тесты - [testing.md](../testing.md)

- [sanity-flaky-tests.md](sanity-flaky-tests.md) - Sanity flaky tests - root causes and costs
- [sanity_love_wall_time.md](sanity_love_wall_time.md) - Sanity run: where the love lane spends its time
- [sanity_run_comparability.md](sanity_run_comparability.md) - Сравнимость прогонов sanity
- [sanity_shared_workspace.md](sanity_shared_workspace.md) - Shared workspace per worker in sanity tests
- [test-phase-single-jest.md](test-phase-single-jest.md) - The test phase runs one jest, not one per package
- [test-run-telemetry.md](test-run-telemetry.md) - Test run telemetry
- [ui-component-tests-vitest.md](ui-component-tests-vitest.md) - Component tests in packages/ui (vitest)
