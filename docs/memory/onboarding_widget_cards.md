# Onboarding steps (top bar button)

- The right-side checklist widget and its auto-open were removed (2026-10-04): the user asked for a non-intrusive top-bar button with the current step and "N/M", a small popup with a screenshot of where to press, and "Do it" / "Skip". Nothing opens by itself.
- Screenshots are static files, not a live spotlight: `dev/prod/public/onboarding/<lang>/<card id with _>.jpg`, re-shot for all 12 languages by `tests/sanity/tests/onboarding/screenshots.spec.ts`. They go stale whenever the UI around a button changes.
- `OnboardingPreference.progress` - first-time timestamps by stable key, analytics only: `preference` is a shared Postgres table with a `workspaceId` column (`docs/architecture.md`), the only place that can answer "how many people did what" across workspaces. Written by read-merge-write in `markOnboardingProgress` (`plugins/view-resources/src/onboarding.ts`), never overwrites.
- `doneWhen` queries add `createdOn >= startedAt`; without it a new member of an existing workspace gets steps ticked by old data. They live in the always-mounted button, not in the popup.
- Old fields `autoOpened` and `dismissed` stay in existing preference docs and are ignored.
- Card action labels reuse the i18n key of the real button. Models without a dependency on the owning plugin reference it by literal id: `'uploader:string:UploadFiles'` (drive), `'setting:string:InviteWorkspace'` and `'login:component:InviteLink'` (workbench), `'chunter:component:CreateChannel'` (chunter: declared only in chunter-resources).
- `models/document` and `models/drive` import `OnboardingCard` from `@hcengineering/model-workbench` (re-exported there) instead of `@hcengineering/workbench`: a direct dependency would need a `package.json` + lockfile change.
- `OnboardingCard` is `DOMAIN_MODEL`: on a dev stand new steps appear only after the server redeploys the model.
- Calendar has no top-level `Application`; its Meetings step is attached to the Planner app (`time.app.Me`). The Inbox app is `hidden`, so its step has no `application`.
- "Cancel the tour" is a separate `cancelled` flag, not `showHints: false`: `showHints` also gates the create links in empty `List`/`Table` (`onboardingHints`), cancelling the tour must not hide them.
