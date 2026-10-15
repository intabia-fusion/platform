# Client rate limit

Область: [Платформа: рабочее место, настройки, экспорт, бэкап, desktop](../features/platform-infra.md)

From a desktop heap snapshot of 2026-10-15 taken after switching workspaces.

- The transactor limiter (`SessionManager.checkRate`, `SlidingWindowRateLimitter`) is keyed by `user + token.extra.service`, without the workspace: every workspace and device of one person on the same transactor shares 1500 requests per 30 s.
- The tracker Kanban with swimlanes runs one live query per cell (`KanbanRow`, lane x status), including empty cells, and with the reverse lookup `_id: { subIssues }`. Lanes by parent issue, 20 lanes x 14 statuses: 277 of 359 requests on the old workspace connection were these `findAll`, and the connection's last response was a rate limit rejection (`currentRateLimit.retryAfter` set). `KanbanRow` takes a `limiter` prop and never uses it.
- A presentation query that unsubscribes does not cancel its server request. On hello the connection resends every pending request whose `retry` is undefined (all `findAll`), so requests of queries that are already gone are sent again. After a `Connected` event (session not restored) `refreshClient` also re-runs every active query, so a query in flight at disconnect costs two requests.
- A request rejected with `remaining: 0` is retried by the client after `retryAfter`, which points every rejected request at the same moment (the oldest entry leaving the window), with no jitter. Once `rejectedRequests` exceeds 2 x max (3000), the limiter stamps each accepted request `now + 5 x window`, so it holds a slot for 180 s, and the counter resets only when the window is empty. Throughput then drops to about 1500 / 180 s.

## Kanban per-lane queries: review follow-ups (FUSIO-1577)

The board now runs one `_id: { $in }` query per lane (per column without lanes); which ids each query covers is `collectVisibleGroups` in `packages/kanban/src/visibleGroups.ts`, covered by `visibleGroups.test.ts`.

- A collapsed lane still queries its header document (the parent issue for lanes by parent), without cards. Collapse state comes from localStorage, so a lane collapsed from the start never got its parent and rendered an empty title.
- While a card is dragged the ids are frozen (`dragging` returns `previous`). The board without lanes moves the card inside `groupByDocs` in place, which pushes the 11th card into the first `COLUMN_LIMIT` of the source column and drops the last one from the target; each change was a new `findAll` that `Refs` does not serve from cache.
- "Show more" limits are keyed by category (`cellKey(lane, state)`), not by column index: a status inserted before an expanded column used to hand its limit to the neighbour.
- Tracker `orderLanes` falls back to the default lane order when `sortSwimLaneValues` throws. With the error unhandled `swimLanes` stayed empty, `lanesPending` held every query back and the board showed columns without cards.

Pure parts of the board live outside the components and are tested without mounting: `packages/kanban/src/board.ts` (`laneCellValues` - the cell with the dragged card where it lands, `insertIndex`, `neighbourRanks`, collapse storage) and tracker `src/swimLanes.ts` (`normalizeSwimValue`, `buildSwimLanes`, `sortSwimLanes`, `swimLaneUpdateProps`). `packages/kanban` moved from jest to vitest so `Kanban.svelte` can be mounted in jsdom.

- `laneCellValues` does not put the dragged card back into its original cell when a live update removed it there. `move`/`cardDrop` then leave the rank as is, so the swim lane branch takes neighbour ranks only when the card is in the cell.
- `buildGenericLanes` in tracker `KanbanView` stays a wrapper over `buildSwimLanes`: passing `$componentStore` and `emptyLabel` straight into the `$:` statement would make them reactive deps and re-run the lane sort (a server round trip for milestones) on every label translation.
- Lane query bookkeeping lives in `packages/kanban/src/laneQueries.ts`. `planLaneQueries` decides which lane queries to drop and which to re-run. `mergeLaneDocs` builds `loadedDocs`. A card moving between lanes re-queries both lanes, and the lane it left may answer first. A pending lane therefore keeps the previous copies of the ids it asks for, otherwise the card vanishes for one round trip. An answered lane is the source of truth: a card it answered without is dropped.
- `loadedKeys` (the `docsLoaded` flag of a lane header) is cleared on an options change and loses a lane whose query is dropped. Otherwise a lane that comes back reports its header doc loaded before the query answers.
