# Merge of duplicate statuses (button in the project type Statuses section)

Область: [Tracker](../features/tracker.md)

Client: `mergeStatuses(params)` (`plugins/task-resources/src/statusMergeApi.ts`) sends `domainRequest(statusMergeDomain, params)`; contract types in `plugins/task/src/statusMerge.ts`. Server: `TaskMiddleware.domainRequest` (`server-plugins/task/src/middleware.ts`), logic in `statusMergeOps.ts`.

- Role Maintainer or higher; only same-category statuses of one project type. `ok: false` means nothing was written.
- Everything is checked first against the planned state with the real workflow functions (`hasSelfTransition`, `getTransitionConflict`, the task transition rule of `WorkflowMiddleware.validateTaskUpdate`); one conflict stops the merge. Transition validators are not pre-checked.
- Writes run as the system account through the pipeline head with `meta.silent`: workflows and transitions, TaskType/ProjectType statuses, tasks (batched, `modifiedOn` kept), default status of projects, DocUpdateMessage, saved filters of removed statuses, removal of unreferenced sources. Triggers stay on: `OnStateUpdate` re-emits `isDone` (bumps task `modifiedOn`), the workflow `PostFunctionsTrigger` runs post functions of a matching transition, `OnTaskTypeUpdate`/`OnStatusDelete` prune transitions to statuses that left the list (the order rewrites transitions first).
- TaskType and ProjectType keep a fresh `modifiedOn` on purpose: concurrent status creation compares it.
- A model-defined source (id contains ':'), or one still listed by another project type's task types or used by a task or transition elsewhere, is kept (`kept` in the result).
- Pipeline `findAll` (`LookupMiddleware.cleanQuery`) drops scalar query fields from the returned docs: `findAll(X, { _id })` gives a doc without `_id`, and a tx built from it fails `NormalizeTxMiddleware` with BadRequest. The request restores the fields, and tests run every tx through the real `NormalizeTxMiddleware`.
- Model-defined statuses (ids with colons) are never removed; imported ones created by System are.
- SQL adapter ignores operators on nested arrays: DocUpdateMessage ids are checked in memory.
- Import creates the duplicates: `createProjectTypeWithTaskTypes` (`packages/importer/src/importer/importer.ts`) passes `factory` statuses to `createProjectType`; `createState` without `_id` always `createDoc`s.
