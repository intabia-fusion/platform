# Workspace wakeup queue + pending-delete (FUSIO-1115)

- Root cause залипания pending-deletion: updateWorkspaceInfo не имел case delete-started/delete-done,
  mode не двигался, processing_attempts рос > 3 - строка навсегда выпадала из getPendingWorkspace.
  Также user deleteWorkspace не сбрасывал attempts. Разлиплять: reset-attempts.
- Deletion обрабатывает только WS_OPERATION=all+backup (дефолт 'all' - нет).
- Wakeup: account шлёт QueueTopic.WorkspaceWakeup в регион пространства при любой новой pending-работе
  (включая визит в спящее по WsLivenessDays пространство); воркеры - consumer со своим groupId на под
  (broadcast), будят doSleep. Backoff: WAIT_TIMEOUT 5с, после 30с без активности x2 до WAIT_MAX_TIMEOUT
  (60с). Поллинг остаётся backstop: upgrade находится только сравнением версии ВОРКЕРА в SQL.
- Регионы: kafka одна, топик = `${region}.<topic><postfix>`. Один PlatformQueue с опциональным
  регионом: getProducer(ctx, topic, region?) - не передали, берётся регион инстанса (env);
  createConsumer/createBatchConsumer - options.regions: string[] (один consumer на топик всех
  перечисленных регионов, groupId тогда `${topic}-${groupId}${postfix}` (топик обязателен: один groupId на разных топиках в одной группе - сообщения не доходят, regions.spec падал до фикса), пустой regions = свой регион, без regions - историческая схема
  `${topicId}-${groupId}`); createTopic(topics, partitions, regions?). Продюсеры кешируются по
  разрешённому имени топика. Account: домашняя
  очередь для mail/crm/payment-ledger + CrossRegionQueue (metadata RegionalQueue) для
  workspace/fulltext/online-user-tx/wakeup в регион workspace. НЕ делать очередь account целиком
  region-less - staging весь на pg.*.
- Presence: юзер может быть online в пространствах разных регионов - send per workspace в его регион.
- Multi-topic consumer: один kafkajs Consumer на список топиков (замер: 4 консюмера = 8 сокетов/
  4 группы, 1 multi-topic = 2/1). regional groupId = `${topic}-${groupId}${postfix}`, одиночный топик
  PlatformQueue - историческая схема `${topicId}-${groupId}` (оффсеты). Используют account users и
  payment workspace (регионы через getRegionInfo).
- Consumer, подписанный на несуществующий топик, НЕ подхватит его после создания (kafkajs, проверено пробой при auto_create=false). Фикс в обоих consumer-имплах kafka: connect -> waitForTopics (ждёт, пока есть хоть ОДИН из топиков, backoff 100ms x2 до 5с) -> subscribe на существующие. Недостающие (например, региональный топик неразвёрнутого региона) поллятся restartWhenTopicsAppear раз в 30с; появился - cc.stop() + start() с переподпиской (kafkajs: stop сбрасывает consumerGroup, connect идемпотентен). Connect идёт ДО ожидания: dead-watchdog (QUEUE_DEAD_TIMEOUT 60с) считает от connect и иначе убивает под, пока топика нет. В юнит-тестах consumer мок admin() обязан отдавать connect/disconnect/listTopics.
- kafkajs 2.2.4 = последний стабильный, проект мёртв с 2023; альтернатива @confluentinc/kafka-javascript
  (задача заведена). Regex-подписка kafkajs статична (разворачивается при subscribe) - динамики не даёт.
- TimeoutNegativeWarning (-Date.now()) в логах любого пода с kafkajs: RequestQueue.
  scheduleCheckPendingRequests делает setTimeout(throttledUntil - Date.now()) при throttledUntil=-1.
  Безвредно (Node clamp в 1мс), уйдёт с миграцией на confluent.
- Юнит-тесты сна: server/workspace-service/src/__tests__/backoff.test.ts - backoff (4) + main loop
  start() c мокнутым getPendingWorkspace: спит без работы, wakeup() будит немедленно, поллинг-backstop (3).
- Классификация сервисов по регионам: docs/region-services.md.
- После FUSIO-1339 удаление отложенное: deleteWorkspace/admin 'delete' только ставят deleteOn, в pending-deletion пространство переводит sweepScheduledDeletions (там же сброс attempts и wakeup). Немедленный путь - admin 'delete-now'.
- e2e: шаг "delete now skips the deferral" в ws-tests/sanity/tests/workspace/deletion.spec.ts ждёт mode 'deleted' через admin UI. С wakeup deletion ~8с.
- Тесты kafka на реальном брокере - testcontainers (`@testcontainers/redpanda`, образ как на стенде v24.3.6), свой контейнер на файл, стенд не нужен: `src/__test__/redpanda.ts` (`startRedpanda({ autoCreateTopics })` - переключает `auto_create_topics_enabled` через rpk). `regions.spec.ts` гоняет всё в обеих конфигурациях auto-create.
- `regions.spec.ts` ~320с: single-consumer без `maxWaitTimeInMs` (kafkajs дефолт 5с) платит ~5с на первый fetch и ~5с на close каждого consumer'а; batch-тесты вдвое быстрее.
- Admin-операции (reindex, reindex-all, force-close, maintenance) шлют через sendToWorkspaceRegion (бросает), остальное - publishToWorkspaceRegion (fire-and-forget).
- Пустая consumer group в redpanda живёт group_offset_retention_sec (7 дней) даже без коммитов (проверено на контейнере). Wakeup-consumer с groupId на worker.id (случайный на старт) поэтому создаётся с `deleteGroupOnClose: true` - группа удаляется в close(); при kill -9 остаётся до retention.
