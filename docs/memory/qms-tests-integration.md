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

### 3. Comment flow (TESTS-136/139/206) - overlay + wrong order
Two root causes:
- **Order**: tests opened the Comments aside BEFORE adding the comment. Submitting a comment opens a floating comment popup that creates the comment; with the aside already open the comment did not land in the aside view. Fix: add the comment with the aside closed (`addMessageToTheText`), THEN `openComments()`. TESTS-161 (passing) already used this order.
- **Lingering modal-overlay**: the floating comment popup leaves `div.modal-overlay.testing` that intercepts every later pointer event. Escape on the editor does not dismiss it. Fixes:
  - `closeNewMessagePopup`: press Escape in a loop until `div.modal-overlay` count is 0 (count, not visibility - avoids the fade race).
  - `completeReview`: `dispatchEvent('click')` to bypass a still-present overlay (button is enabled, only pointer is intercepted).
  - `openComments()` helper: dispatchEvent click on `button[id$="comment"]`, wait `div.popupPanel-body__aside` visible.

### 4. Member button locator (TESTS-338/391) - hardcoded initials+count
`document-content-page.ts` hardcoded `'AJ DK AQ 3 members'` / `'AJ DK 2 members'` - both initials and count vary with the member set. Fix: match by suffix `/\d+ members?$/` via `clickMembersButton()` (dispatchEvent to bypass picker overlay). Replaced all member-button clicks in `changeDocumentSpaceMembers`/`changeTeamspaceMembers`/`addThirdUserToMembers`.

### 5. Reason&Impact field lost on live update (TESTS-205) - PRODUCT bug
`plugins/controlled-documents-resources/src/components/document/EditDocReasonAndImpact.svelte`: `PlainTextEditor value={changeControl.reason}` is one-way; a live `ccQuery` update while the user types resets the field to the stored value, and the later `on:blur` then persists the stale default ("New document creation"). Race -> flaky.
Fix: local `description`/`reason`/`impact` vars + `focusedField`; ccQuery syncs a field only when it is NOT focused. `PlainTextEditor` now forwards `on:focus` (added in `packages/ui`). Test guard: `setReasonAndImpactData` selects+fills reason then `blur()` + `expect(toHaveValue)`.

## Auth setup caching
`auth.setup.ts`: skip a setup if its `.auth/qms-storage*.json` exists. `prepare-qms.sh` runs `rm -rf ./sanity/.auth` on stand recreation, so a missing file means a fresh login is required. Saves ~8s on repeat runs.

## Long flows -> test.slow()
Default playwright timeout is 60s. Long multi-user / multi-version / diff flows exceed it. Marked `test.slow()` (×3 = 180s): TESTS-136/139/140/206 (comments/compare), TESTS-325 (REQ-03 versions), TESTS-399 (REQ-04). Diff-highlight checks (`checkComparingTextAdded/Deleted`) use `toBeVisible({ timeout: 30000 })` - the highlights render after the compare view loads. `test.slow()` overrides a CLI `--timeout` (slow = 3× of it), so it masks a low `--timeout`.

## CI cache (NOT a test bug)
`.github/workflows/main.yml` `CacheFolders` listed every project dir except `qms-tests`. The svelte-check/formatting/test jobs restore that cache instead of running `rush install`, so qms-tests `node_modules` was empty there -> TS2307 / `format: not found`. Fix: add `qms-tests` to `CacheFolders`.
