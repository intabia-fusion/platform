# Workspace wakeup: ограничения и история

- Залипание `pending-deletion` исправлено до FUSIO-1115: `e2f833376d`, FUSIO-1287 (#390), добавил `delete-started`/`delete-done` и сброс `processingAttempts`. Это не исправление текущего PR.
- После FUSIO-1339 (#434) обычное удаление отложенное; немедленное удаление выполняет `delete-now`. Workspace-worker обрабатывает удаление при `WS_OPERATION=all+backup`.
- Поллинг нужен даже с wakeup: доступность обновления определяется сравнением версии worker в запросе `getPendingWorkspace`.
- При первом выкате региональные подписки account/payment меняют consumer group; offsets старых групп не переносятся. Согласовано окно обновления без работы пользователей; readiness не подтверждает обработку backlog.
- `/api/v1/ready` account/payment требует подключения `readinessProbe` в deployment. Наличие endpoint само по себе не задерживает остановку старого pod.
- Интеграционные проверки Kafka: `foundations/server/packages/kafka/src/__test__/regions.itest.ts`; отдельный брокер позволяет менять auto-create без влияния на соседние тесты.

Маршрутизация и разделение окружений: [../region-services.md](../region-services.md).
