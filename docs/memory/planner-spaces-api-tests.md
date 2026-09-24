# Planner space-ownership API tests (FUSIO-1308)

Область: [Планировщик / Календарь](../features/planner-calendar.md)

`ws-tests/api-tests/src/__tests__/planner.fixtures.ts` (reusable helpers) + `planner-spaces.test.ts` cover where `time.class.WorkSlot` / `time.class.ProjectToDo` actually live: a project todo's slot lives in the project's own space (`getWorkSlotSpace` in `plugins/time-resources/src/utils.ts`, synced server-side by `changeIssueDataHandler` in `server-plugins/time-resources/src/index.ts`).

## `tracker.class.Project` must be `private: true` to test membership at all

`SpaceSecurityMiddleware.findAll` does not filter results itself (see its own comment - "Security filtering is handled at the database level via addSecurity()") - the real filter is SQL, `PostgresAdapter.addSecurity` in `foundations/server/packages/postgres/src/storage.ts`: a space is readable if `sec._id = core.space.Space` OR `sec._class = core.class.SystemSpace` OR the account is in `sec.members`, OR - only when the query itself filters by `space`/`_id`/`attachedTo`, or the domain is `DOMAIN_SPACE` - `sec.private = false`.

`workflow.fixtures.ts`'s `createProject` makes a **public** project (`private: false, members: [], owners: []`) - fine for workflow tests (nobody there checks isolation), but it means any workspace account can read Issues/WorkSlots in it regardless of `members`, because the `sec.private = false` branch always wins once the query filters by `space`/`attachedTo`/`_id` (which every realistic lookup does). A membership test against that default project silently passes for the wrong reason.

Fix: create the project normally, then one follow-up `updateDoc` flips `{ private: true, owners: [ownerAccountUuid], members: [...] }`. That update is unrestricted because the space's *previous* known state (`private: false`) makes `checkSpacePermissions` return early for non-owners/non-admins (`space.owners.size === 0 && !space.private` branch). Creating it private from the start also works but must include the creator's account uuid in `owners`/`members` right away, or the create tx is rejected ("Cannot create private space without being a member or owner").

`Space.members`/`owners` are `AccountUuid[]`, not `Ref<Employee>[]` - use `WorkspaceToken.info.account`.

## `api-tests` workspace has exactly 2 accounts

Only `user1`/`user2` are members of the `api-tests` workspace (`dev/test-base/src/stands.ts`) - no third account available in this workspace. Every "non-member can't see it" assertion here uses the other of these two.

## Two system spaces are unconditionally public

`calendar.space.Calendar` (BusySlot) and `time.space.ToDos` (ToDo/ProjectToDo) are both created via `createDefaultSpace(...)` without a `_class` override, so they default to `core.class.SystemSpace` (`models/calendar/src/migration.ts`, `models/time/src/migration.ts`; default in `createDefaultSpace`, `foundations/core/packages/model/src/migration.ts`). `addSecurity` grants unconditional read access to any `SystemSpace` regardless of `private`/`members`. Consequence:

- `ProjectToDo`'s own `.space` is always `time.space.ToDos` - readable by anyone, `.attachedSpace` (the project ref) is just a plain field on it, not a security boundary. The membership boundary lives on `WorkSlot.space`, kept in sync with the todo's `attachedSpace` by `changeIssueDataHandler` (falls back to the owner's `PersonSpace` for a personal, non-project todo).
- `BusySlot` is world-readable the same way [calendar-busy-slot-api-tests.md](calendar-busy-slot-api-tests.md) documents for Event's busy mirror - true here too for a `WorkSlot`-sourced one, since `OnEvent`'s `syncBusySlot` doesn't care whether the source Event subclass is a plain Event or a `WorkSlot`.

## Trigger path exercised by "move issue to another project"

Moving an issue is `client.updateDoc(tracker.class.Issue, issue.space, issue._id, { space: targetProjectId })` - `TxUpdateDoc.objectSpace` is the issue's *current* space, matching `moveIssueToSpace` in `plugins/tracker-resources/src/utils.ts`. Trigger chain: `OnTask` (`server-plugins/time-resources`) -> the `serverTime.mixin.ToDoFactory` on `tracker.class.Issue` -> `IssueToDoFactory` -> `updateIssueHandler`, which calls `changeIssueDataHandler` whenever `tx.operations.space !== undefined` and updates both `ProjectToDo.attachedSpace` and every `WorkSlot.space` for that todo.
