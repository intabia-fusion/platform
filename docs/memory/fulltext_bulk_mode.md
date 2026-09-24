# Fulltext pod - bulk mode

Область: [Архитектура](../architecture.md)

- Producer: `PlatformQueueProducer.send(ctx, ws, msgs[])` принимает массив и уходит одним `kafkajs.producer.send` с массивом `messages` и `CompressionTypes.GZIP` (`foundations/server/packages/kafka/src/index.ts`).
- `PlatformQueueBatchConsumerImpl.start()` (тот же файл) использует нативный `cc.run({ eachBatch, eachBatchAutoResolve: false })`: kafkajs отдаёт реальный батч из broker fetch, нарезается на чанки `batchSize`, `resolveOffset` идёт после успешной обработки чанка; `batchTimeout` мапится в `maxWaitTimeInMs`. `eachMessage` + accumulator для батчинга не работает по дизайну kafkajs - `eachMessage` per-partition serial, следующее сообщение не вызывается, пока не зарезолвлен предыдущий promise.
- `createBatchConsumer` используется также в `services/love` (`main.ts`, `limits.ts`) и `services/ai-bot` (`pod-ai-bot/src/queue.ts`).
- `pods/fulltext/src/manager.ts`: `txConsumer` создаётся через `createBatchConsumer`, размер/таймаут батча - `parseIntInRange(process.env.FULLTEXT_TX_BATCH_SIZE, 100, 1, 500)` и `parseIntInRange(process.env.FULLTEXT_TX_BATCH_TIMEOUT, 100, 0, 5000)` (дефолт 100/100).
- `workspaceConsumer`/`fulltextConsumer` (тот же `manager.ts`) остаются на `createConsumer` (per-message) - события редкие и stateful (full reindex, drop), батчинг там не нужен.
- `FullTextIndexPipeline.processTransactions` (`server/indexer/src/indexer/indexer.ts`) принимает массив `TxCUD<Doc>[]` и группирует по `objectClass` - batch-friendly. `manager.processTransactions` группирует входящие `ConsumerMessage[]` по `m.workspace` перед вызовом.

## Замер (dev-стенд, redpanda+pg+elastic)

| scenario | eachMessage | eachBatch | x |
|----------|------------------|-------------------|---|
| producer batch=1, 200 docs | 144 docs/s | 2062 docs/s | 14x |
| producer batch=50, 200 docs | 186 docs/s | 5714 docs/s | 31x |
| producer batch=1000, 1000 docs | 217 docs/s | 6494 docs/s | 30x |
| pipeline e2e, 200 createDoc | 175 docs/s | 503 docs/s | 3x |

Pipeline e2e ограничен скоростью write-side (`TxOperations.createDoc` синхронный) - индексация не бутылочное горло.

## Связанные заметки

- [kafka_consumer_test_overhead.md](kafka_consumer_test_overhead.md)
