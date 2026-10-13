# Grouping switch: stale categories hit Postgres (FUSIO-1445 / FUSIO-1442)

`groupByKey` changes synchronously from view options, while categories (`updateTaskKanbanCategories` in KanbanView, `ListCategories` in list view) are recomputed asynchronously. Until they arrive, components render old categories with the new key, and the `.then` has no guard against out-of-order resolution.

Postgres errors only when the new key is a real text column of the `task` table (`_id`, `space`, `attachedTo`, `createdBy`, `modifiedBy`); jsonb `data` fields cast numbers to text and just return nothing:
- number category (Priority) into a text column - `operator does not exist: text = numeric`
- AggregateValue category (Component/Milestone, e.g. `{values: []}`) - no `$` keys, goes to the `@>` branch of `translateQueryValue` - `operator does not exist: text @> unknown`

Reproduced on the sanity stand (`user1`/`1234`, sanity-ws, transactor log `Error in findAll`):
- Kanban Priority -> Project: `Space {_id: 0..4}` (SpaceRefPresenter header) and `Issue {space: 0..4}` (KanbanRow column query)
- Priority/Component -> Parent issue (kanban and list): `Issue {_id: 0..4}`, `Issue {_id: {values: []}}` (ParentIssuePresenter header) and, in kanban, `Issue {attachedTo: 0..4}` (KanbanRow)

PR #544 guards only SpaceRefPresenter, ObjectPresenter and PersonRefPresenter; KanbanRow and ParentIssuePresenter still send the bad queries.

Fix (FUSIO-1552):
- tracker and task `KanbanView`, `ListCategories`: `groupByKey`, `categories` and the header presenter are assigned together in one `reduceCalls` step; a result computed for a key that is no longer requested is dropped. Swim lanes did not show the race.
- `translateQueryValue` (postgres adapter): a value of another type for a real column is compared with the column as text (`{space: 0}`, `{modifiedOn: 'x'}`, `{private: 'yes'}`, `$in` with mixed types, NaN/Infinity for numeric columns); an object value inside an operator is compared as its JSON text. These become `FALSE`: an array for a scalar column, an object without `$` operators on a typed column, and a range (`$gt`...) across types or with NaN/Infinity. As text the range would order '10' before '5', and the column index would be lost. `parseDataType` maps unknown DB types to `text`, but no real column except `data` is jsonb, so `FALSE` hides no containment query. Real-DB matrix: `bugs.itest.ts` "FUSIO-1552 value of another type for a real column".
- Swim lanes (tracker `KanbanView`): every function that pairs the field with lane values (`getSwimLaneQuery`, `getSwimLaneOfDoc`, `getSwimLaneUpdateProps`, header style, header presenter) uses `swimLanesBy`, the field the current lanes were built for. `orderLanes` sets `swimLanesBy`, the lane presenter and the lanes together. Without this, a drop during the milestone sort round trip builds `{milestone: 1}` from a Priority lane (read from the code, not reproduced). The UI gives no server-round-trip window for it: the docs query projects only `_id`, `_class`, `rank`, the groupBy keys, `space`, `attachedTo`, `attachedToClass`, `collection`, `modifiedOn` and the lane field. On a switch to a new field the lanes first collapse to the empty lane, then rebuild when the re-queried docs arrive. A swim lane option equal to the column grouping is hidden (`hideGroupByDuplicates`). A sanity test that held the milestone sort response through `page.routeWebSocket` only saw the empty lane, so it was dropped.
- The group header presenter is fetched with `.catch(() => undefined)`: before the atomic update a missing presenter cost only the header, and it must not block the grouping now.
- Sanity test: `kanban.spec.ts` "switching grouping does not query with the old categories" checks `.antiStatusBar .ERROR` after every switch.
