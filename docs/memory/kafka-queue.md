# Kafka queue

## Consumers block until their topic exists

`waitForTopics` (foundations/server/packages/kafka/src/index.ts) polls `admin.listTopics()`
before `connect`/`subscribe`, because a kafkajs consumer subscribed to a missing topic never
picks it up after the topic appears. Consequences:

- `isConnected()` stays `false` until the topic exists. Any test that creates a consumer first
  and produces afterwards deadlocks - call `queue.createTopic(topic, n)` before `createConsumer` /
  `createBatchConsumer`.
- Unit tests that mock `kafkajs` must mock `admin()` with working `connect` / `listTopics` /
  `disconnect`; `listTopics` has to return the resolved topic name
  (`getRegionTopic(topic, region) + postfix`), otherwise `start()` never reaches `cc.run()` and
  `eachBatch` is never captured.

## Package tests need docker services

`foundations/server/packages/postgres` and `kafka` tests hit real CockroachDB (`localhost:26258`)
and redpanda (`localhost:19093`). Start them with `foundations/server/tests/prepare-tests.sh`;
without them the suites fail with `AggregateError` / hook timeouts.
