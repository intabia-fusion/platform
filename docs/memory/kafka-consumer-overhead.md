# Kafka consumer overhead in activity/notifications: why no batching

Profile of a full tests/sanity run: activity 46s CPU (kafkajs 15.4s, gzip 3.6s, JSON.parse 1.9s), notifications 66s (18.0s, 4.1s, 2.2s). The per-message part that batching could remove is commit only (commitOffsets 0.9/1.15s + offsetCommit encode 0.4/0.5s, ~3% of CPU); fetch, gzip and parse are paid per fetched batch either way.

Not changed, because the guarantees differ (`foundations/server/packages/kafka/src/index.ts`, kafkajs 2.2.4):
- `createConsumer` retries one message forever and commits after each; a crash redelivers at most the in-flight message. `createBatchConsumer` retries the whole chunk, so a failure at message k re-runs 0..k-1; activity `Worker.tx` / notifications `worker.tx` show no dedup key (idempotency not confirmed), and notifications' `WorkspaceBreaker` assumes per-message retry.
- `autoCommitThreshold`/`autoCommitInterval` on `run()`: `Runner.stop()` (runner.js:173) only leaves the group and does NOT commit resolved offsets, so every deploy/SIGTERM would replay up to the threshold. Also shared by fulltext, media and the server's sessionManager consumers.
- Heartbeat pump per message has no measured cost; kafkajs itself already heartbeats after every message (runner.js:253).
