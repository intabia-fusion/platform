# wrapPipeline + caller session data: async triggers

- `TriggersMiddleware` runs async triggers inline only when `contextData.isAsyncContext` is true;
  otherwise it queues them in `contextData.asyncRequests`, and the caller must drain that queue.
- WS path drains it (`server/src/client.ts`). The REST `/api/v1/create|addCollection|update|...`
  routes (`pods/server/src/rpc.ts`) call `wrapPipeline(..., ctx.ctx.contextData)` with the caller's
  session (`isAsyncContext=false`) since FUSIO-1151 (2a210848fd). Before the fix, nothing drained
  the queue and every async trigger of a REST write was dropped.
- Symptom: ai-bot creates its direct over REST → `OnCollaboratorAdded` (async) never creates the
  user's `Chat` → the direct is missing from the chat navigator (sanity ai-bot tests fail on
  `clickChooseChannel('AI Julia')`).
- Fix: `wrapPipeline.tx` drains `asyncRequests`, then restores `ctx.contextData`
  (`processAsyncTriggers` swaps in its own).
- Tests: `server-core` `wrap-pipeline.test.ts` (unit), `api-tests` `rest.test.ts` "create runs async triggers".
