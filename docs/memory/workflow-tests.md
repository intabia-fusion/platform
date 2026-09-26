# Workflow feature: import/export API and API tests

Область: [Трекер](../features/tracker.md)

## Portable config API

`plugins/workflow/src/transfer/` (`export.ts`/`import.ts`/`utils.ts`) exports `exportWorkflowConfig` / `importWorkflowConfig` / `clearWorkflowConfig`. The config is plain JSON in which every workspace-specific reference is written by name, so a config exported from one project type can be imported into another:

- statuses, task types and screens are addressed by name;
- inside rule `props` the same refs appear as tokens `$status:<name>`, `$taskType:<name>`, `$screen:<name>` and are remapped by a recursive walk that also rewrites object **keys** - `SubtaskStatuses.statuses` is keyed by task type ref;
- attribute refs (`Field.attribute`) are model ids and stay as they are.

Import reuses screens and workflows whose name already exists instead of duplicating them, so a repeated import is a no-op for them but still re-applies the project mapping.

## Where the tests live

`api-tests/api/src/__tests__/workflow.*.test.ts` - jest against a live stand, not Playwright. `workflow.fixtures.ts` builds project types, projects, issues and status changes over `TxOperations`.

Two things that are easy to get wrong there:

- `createRestTxOperations` must be called with `fullModel: true`. `createProjectType` (`plugins/task/src/utils.ts`) resolves descriptors out of the model and a trimmed model has none (throws "category is not found in model").
- `createState` (`plugins/task/src/utils.ts`) does not deduplicate by name - every `createProjectTypeWith` call creates fresh `Status` docs, so different task types (even of the same project type) can end up with distinct `Status` docs sharing the same name. The fixture resolves a name to the smallest ref afterward, exactly like `buildResolver` in `plugins/workflow/src/transfer/resolver.ts` does for import - both must agree on the same doc for a given name.

## Defect found by these tests

`server-plugins/workflow/src/middleware.ts` matched transitions with `t.from == null || t.from.includes(fromStatus)`, so a transition saved with an empty `from` array blocked everything. Every other site - `PostFunctions.ts`, the client middleware, `StatusEditor` and `findTransitionConflict` - treats an empty array as "any status". Fixed by adding `t.from.length === 0` to the check (present in current code).

## Playwright UI tests

`tests/sanity/tests/workflow/` - two serial suites sharing one page and one workspace each (`workflow-settings.spec.ts`, `workflow-tracker.spec.ts`), page objects in `tests/sanity/tests/model/workflow-page.ts`. They reuse `SettingsPage`, `NewProjectPage`, `IssuesPage` and `IssuesDetailsPage` from `@hcengineering/tests-sanity`.

Things the workflow UI does that a test has to know:

- The status dropdown of a transition is a multiselect that stays open after a pick, and its overlay swallows every other click. Escape closes the surrounding modal as well, so dismiss it by clicking `.modal-overlay` instead - `WorkflowPage.closeDropdown`.
- "Any status" is preselected in the From dropdown of a new transition. Clicking it toggles it off and leaves the selection empty, which disables Create; for a wildcard transition just leave it be.
- A fresh Tracker task type comes with `Backlog / Todo / New state / Won / Lost`, not the statuses of the default project.
- Confirmations are `MessageBox`, i.e. `div.msgbox-container div.footer button`, not a form with a submit button.
- Issue status options are `div.selectPopup div.list-item span.overflow-label`.
