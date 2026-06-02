# QMS Sanity Tests Integration (tests/sanity/tests/qms)

QMS controlled-documents Playwright tests integrated into the common `tests/` contour (postgres+pgbouncer stand, project `sanity`).

## Stand setup
- New workspace `sanity-ws-qms` (backup restored from `tests/sanity-ws-qms/`), users user1-4 + user_qara.
- `sign` service (port 4006) added to `tests/docker-compose.yaml` + nginx `/_sign` route; needed for QMS signature dialogs.
- Auth: separate `qms.setup.ts` -> `.auth/qms-storage*.json`, distinct from common `auth.setup.ts`.
- `@PDF` describe/tests skipped (require msedge channel, not installed).

## Root-cause fixes (qms-fixes branch)

### 1. Workspace selector matched wrong workspace
`tests/sanity/tests/model/select-workspace-page.ts` `workspaceButtonByName` used `filter({hasText: 'sanity-ws'}).first()`. After adding `sanity-ws-qms` (which sorts FIRST in the list), substring `hasText` + `.first()` matched the qms workspace. Broke the COMMON `auth.setup.ts` (user1-3 landed in sanity-ws-qms, `waitForURL(/workbench/sanity-ws/)` failed).
Fix: exact match via `filter({ has: page.getByText(workspace, { exact: true }) })`.

### 2. Person search killed the reviewer/approver list
`tests/sanity/tests/qms/model/common-page.ts` `selectListItemWithSearch` typed `name.split(' ')[0]` into the select popup search input. Under LAST_NAME_FIRST the displayed name is "Appleseed John", so split[0]="Appleseed".
The person popup (contact-resources UsersPopup/UsersList) searches **fulltext `$search`** over `Person.name` stored as `"last,first"` ("Appleseed,John"). Typing "Appleseed" (or even full "Appleseed John") filters the list to **empty** -> `div.list-item hasText "Appleseed John"` never appears -> ~58s timeout.
Fix: do NOT type into search for person selection; the list is short (3-4 people), click the `list-item` by `hasText` directly (`waitFor visible` then click). Removed the unused `fullWordSearch` param; updated templates-page.ts call site.

## Known remaining
- TESTS-136 (Add and resolve Comments): after the above fixes it reaches step 4; `buttonComments` (`button[id$="comment"]`) click hangs the full timeout ("attempting click action" never completes) even at 90s. In live UI at 1440x900 the button is enabled, in-viewport (x=1250), nothing covering it, click works. Suspected element-instability after closeNewMessagePopup. Not yet resolved.
- Default playwright timeout is 60s; some QMS doc flows (create + review + signature + comments) are long. Target per user: tests should pass within 30s - long flows need investigation, not just higher timeout.
