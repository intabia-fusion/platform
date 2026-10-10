# Model hash: live tx vs tx read from Postgres

Область: [Architecture](../architecture.md)

- The model hash chain is `sha1(prev + json(tx))` (`ModelMiddleware`, `server-client` `createClient`) since `5e247c5d96` (2023-10-13); it matched across restarts only while Mongo kept key order. With jsonb (`bf1de1f436`, `model_tx` in `5353a06b07`) the tx read back at startup differs from the live one, so every transactor restart sent all clients a full model.
- Three differences, all covered by `modelTxHashJson` in `core/src/utils.ts`: jsonb key order; `createdBy` is a column and comes back `null` for update/mixin/remove tx (only `createTxCreateDoc` sets it); `createdOn` comes back as `modifiedOn` for System tx (`ModifiedMiddleware` skips them, `convertDoc` fills it). Round-trip test: `postgres/src/__tests__/modelHash.spec.ts`.
- A change of the hash form invalidates every client model cache once: each client downloads the full model on its next connect, and transactors of two versions disagree during a rolling update.
