# Kafka consumer lifecycle dominates fulltext test time

Область: [Архитектура](../architecture.md)

`pod-fulltext` was the slowest test package on CI (150.5s of a 584s test phase). None of it was the tests: measured on a local stand, useful work was 1.8s (batch-removal) and 3.0s (indexing).

Per-test cost of building a fresh harness was 17.3s: `createTopics` 2502ms, `startIndexer` 49ms, `waitConsumersReady` 5030ms, `withIndexer` 106ms, `shutdown` 9703ms. Inside `shutdown`: `txConsumer` 13ms, `workspaceConsumer` 4660ms, `fulltextConsumer` 5002ms.

Root cause: the batch consumer gets an explicit `maxWaitTimeInMs` (`FULLTEXT_TX_BATCH_TIMEOUT`, default 100), the two plain consumers get none - kafkajs then defaults to 5000ms. `consumer.disconnect()` waits out the in-flight fetch long-poll. The same 5s shows up in `waitConsumersReady`: `firstFetchDone` (`foundations/server/packages/kafka/src/index.ts`) resolves on the first FETCH event, which on an empty topic returns only after `maxWaitTimeInMs`.

`pods/fulltext/src/manager.ts`: `shutdown` closes the three consumers via `Promise.allSettled` (logs rejections instead of stopping at the first one). Both spec files build one harness in `beforeAll` instead of one per test - tests were already isolated by a random workspace uuid per test.

Result: 138.3s -> 23.5s locally (commit `3248eef701`). What is left is one harness lifecycle per file (~14s and ~20s); cutting it further means lowering `maxWaitTimeInMs` on the plain consumers, trading off broker fetch frequency - not done.

Same shape showed up in `@hcengineering/kafka` tests (23.2s) - same fix pattern applies if it becomes a bottleneck there.

## Связанные заметки

- [fulltext_bulk_mode.md](fulltext_bulk_mode.md)
