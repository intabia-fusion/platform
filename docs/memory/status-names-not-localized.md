# Default status/task-type names are not localized

`Status.name` (incl. classic Issue statuses `Backlog`/`Todo`/`In Progress`/`Done`/`Canceled`,
`models/tracker/src/index.ts:69-84`) and `ProjectType`/`TaskType.name` (e.g. `Classic project`,
`Classic Issue`) are plain strings baked in at model-creation time, not `IntlString` refs — the UI
renders `status.name`/`type.name` directly, so these show as the same English literal in every
locale. The matching `tracker.string.ClassicProject`/`ClassicIssue` translations in `lang/ru.json`
exist but are unused for these document names. Verified on the `docs` demo stand (ru, `demo-ws`):
Трекер board and Настройки -> Типы пространств -> Classic project -> Типы задач both show the
English literals regardless of RU UI language.

Found while syncing `docs/features/tracker.md` user-doc table against platform-docs: several ru
pages (`advanced-settings/task-types.mdx`, `workflow/create-statuses.mdx`) wrongly translated these
names into Russian.
