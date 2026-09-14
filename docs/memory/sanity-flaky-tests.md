# Sanity flaky tests — root causes and costs

## Diagnosing

Playwright mark test "flaky" when retry pass, so cause in *first* attempt. Read
`step-report.ndjson` (`node analyze_steps.js`) for step that burnt time, then
`test-results/<test>/error-context.md` for call log. Log separate two opposite bugs:
`waiting for <locator>` = control never there; `intercepts pointer events` = it covered.
`playwright-report.json` give per-test totals (`analyze_failures.js`).

## Recurring shapes

- **`locator.count()` never waits.** Any arithmetic on it need settled read first (`waitStable` in
  `retry.ts`). Two bugs from this: `iterateLocator` counted pre-filter rows, `deleteTimeSlot`
  asserted `toHaveCount(-1)`.
- **Control that only exist while hovered or just opened.** Hover/open and use it in two separate
  statements, re-render between them leave second waiting out whole test timeout. Retry pair:
  hover → assert visible → click. Hit `channel-page` message actions (5 call sites), ToDo dragbox,
  attachment tooltips, context submenu (MouseSpeedTracker need slow mouse movement),
  status popup, workflow aside.
- **Action with no timeout of its own inside `toPass`.** It block until test die and retry loop never
  get turn. Give inner actions short explicit timeout.
- **Click that not idempotent.** Rows toggle selection, rooms deselect. Retry *wait*, not
  click, or guard with early return when target state already hold.
- **Positional selectors** (`nth-child(2)`, `.nth(1)`, `first()`) shift when surrounding data change.
- **Filter that not selective.** `selectMenuItem` filter by first word, so parallel workers'
  objects stay in list. Match whole name when item carry it; `selectAssignee` delegate
  to it for that reason.
- **`hasText` match substring**, so strict locator throw on grouped copy — `.first()`.
- **Pointer stay where previous step dropped it.** Tooltip then cover next control
  (`tooltip right` over `btn-viewOptions` after Board click), and second `hover()` on
  element pointer already rest on fire no mousemove, so retried hover reopen nothing. Park
  pointer (`mouse.move(0, 0)`) before click.
- **Action that silently never start.** Chromium raise dragstart on first move after
  `mouse.down()`; anything between the two (scrolling, settle wait) mean `dragCard` never set
  and every drop no-op that only state check notice, minute later. Assert app saw it
  (card take `dragged`) before moving on.
- **Escape not close panel app opened through url**, and close it *did* start
  land beat later and tear down whatever opened after it. Wait for new panel's own content
  and re-check it (`workflow-page.openAside`).

## Product-side causes

| What | Where | Effect |
|---|---|---|
| Categories auto-fold past 20 items | `ListCategory.initCollapsed` | Rows absent from DOM (`CommonPage.expandCollapsedCategories`) |
| Async default-app navigation clobbers a click | `Workbench.svelte:syncLoc` | User navigation undone mid-load |
| Toasts cover `#profile-button` for 10s | `packages/ui/src/utils.ts` | Clicks wait toast out; suppressed at `0` |
| `TimeInputBox` dispatches per digit | `TimeInputBox.svelte` | One server write per keystroke |
| Tag saved before its category loads | `CreateTagElement.svelte` | Tag exists, `TagsPopup` renders empty |
| Live query assigns server values into an open editor | `EditToDo.svelte` | Un-round-tripped edit wiped |
| Estimation renders optimistically, falls back ~70ms later | `issues-details-page.setEstimation` | Write lost; need 500ms settle (200ms not enough) |
| Calendar keeps a stale event after a slot change | UBERF-4273 | Slot added right after delete never appears |
| Calendar block under 44px renders no body | `EventElement.svelte` (`empty`) | `hasText` find no title once ~6 events share hour |
| Tag popup renders 50 tags per category | `TagsPopup.svelte` (`slice(0, 50)`) | Fresh tag past cut invisible; search for it instead |
| `move()` returns silently when `dragCard` is unset | `packages/kanban/src/components/Kanban.svelte:210` | Drop with no dragstart change nothing, report nothing |
| Templates group by assignee, group stays collapsed and virtualised | Templates list | Fresh template absent from DOM (`expandCollapsedCategories` + scroll) |

## Stand state

**Not restored between local runs** — `dotest.sh` run no `restore-pg.sh`. Consequences:

- Tests that mutate seed data work exactly once.
- `plan.spec.ts` assert absolute counts on seeded todos: leftover slot make it unpassable, not
  flaky (`Expected: 0, Received: 1`, then 2, then 3). Both slot tests call `clearTimeSlots()` first.
- **Planner tests still need clean stand.** Each run leave own `ToDo to change duration-*`;
  once day crowded, freshly added slot never reach calendar. Clean: 11 passed in 17s.
  Repeat without restore: 3 failed, every time.
- love tests share rooms in `meetings-ws`. `waitForActiveMeetingsToFinish` give up after 20s and now
  log what was left; next test used to fail 15s later on unrelated locator.

- **Accumulated data cross product render limits.** Measured 2026-09-03 on stand nobody had
  restored: 431 issues, 91 tags, 48 components, 62 todos, 28 templates. That past `TagsPopup`'s
  50 and enough to bury fresh template below fold - tests that passed for months start failing
  with no code change. `plan.spec.ts` and `template.spec.ts` now drop own leftovers in
  `beforeAll`; real fix is running `tests/restore-pg.sh` on schedule.

**Recreating one container breaks nginx** — it resolve upstreams at startup. `docker restart
sanity-nginx-1` after any `--force-recreate`.

## Fixed flakes

| Test | Cause | Fix |
|---|---|---|
| `tracker.spec` report-time | Editor still showed previous issue's total | `submitted` flag |
| `layout.spec` grouping / ordering | Board pages at 20; `modifiedOn` bumped by a later update | "Show more" until found; sort by transactor `modifiedOn` |
| `filter.spec` Priority | Rows captured before the retry loop | Re-read per attempt |
| `filter.spec` Component / Label | `iterateLocator` counted pre-filter rows | `waitStable` on the count |
| `filter.spec` Modified by | Row left the live list mid-test | Skip a gone row, bound the click, assert ≥1 checked |
| `chat.spec` copy message / public channel | Workspace url gets a random suffix; `faker` returned `a` | Read the segment from `page.url()`; ≥5-char word |
| `chat.spec` thread in sidebar | Hover-revealed reply button | `clickMessageAction` retries hover+click |
| `documents-content.spec` styles | Editor unfocused after `goToByTOC` | `selectLine` clicks the line first |
| `documents.spec` | Hover-only "+"; second user's page closed mid-flush; `selectMenuItem` picked another worker's teamspace; shared clipboard | Hover inside `toPass`; wait for the first user; whole-name match; clear the clipboard |
| `kanban.spec` swim lanes / drag | `__swim_unassigned__` only exists sometimes; target card never revealed; box read while the board still scrolled, so the drop landed on the neighbouring column | Pick a real lane; reveal both cards, 5s bound; settle the target box with `waitStable` |
| `plan.spec` drag/resize | Hover outside the loop; "changed" is not "landed right" | Hover inside; compare the edge to the target cell |
| `todos.spec` slot row / counters | Forced click added nothing; two reads disagreed | Retry until the row count grows; one `page.evaluate` snapshot |
| `todos.spec` Delete a ToDo | Hover-only dragbox | Retry hover + visible + right-click |
| `attachments.spec` | `hoverAttachmentButton` had no retry in the delete path | Retry both delete helpers |
| `issues.spec` Edit an issue | Estimation settle cut to 200ms | Back to 500ms |
| `issues.spec` submenu | MouseSpeedTracker submenu never opened | Retry, assert the second-level item |
| `settings.spec` customize-task-types | State list rebuilt while the popup was clicked | Retry the open+pick |
| `workflow-settings.spec` | A leftover aside from the previous step is indistinguishable by its footer - both carry `Create`, so the name was filled into the screen aside | `openAside` closes whatever is open and reopens from scratch |
| `workflow-tracker.spec` | `CreateProject` reads `workflowsMapping` once at mount | Reopen the dialog |
| `labels.spec`, `template.spec` | Tag submitted before its category query resolved | Resolve inside `createTagElement` |
| `component.spec` | 1s for a cascading delete to close | 10s bound |
| `public-link.spec` | Revoke returned before the round trip | Wait for the form to close |
| `inbox.spec` | Invite chain inlined in 7 tests | All call `getInviteLink` |
| `indexer.spec` cross-workspace | `/workbench/` url ≠ workspace built | `createWorkspace` waits out "Creation in progress" |
| `applications.spec` | 1000ms `toBeVisible` for a panel | Default 15s |
| `chat.spec` privacy toggle | Value comes back from the server | Retry the whole select, early return when already set |
| `documents-print-preview.spec` | Retrying the *fetch* — the blob never changes | Retry the print action |
| `mentions.spec` | Mention popup fills categories one by one; its overlay blocks `g#Send` | Settle the item count, assert the popup closed |
| `component.spec` Edit a component | Description typed into ProseMirror overwritten by the panel's query callback | Verify each field inside `editComponent` - retrying the whole edit reopens the lead popup and fails there instead |
| `kanban.spec` drag sequences | `expect.poll` read the status *before* the drag and returned it, so every successful drop still cost one more interval; `retryIntervals` then fell back to its 3s tail. A drop that lands while findOne still reports the old status also leaves the card out of the DOM, and the throw from `ensureVisible` killed the whole poll | `dragUntilStatus` reads after the drag, swallows its error, and polls at `[100, 200, 300, 500]` - 45.9s to 3.0s |
| `todos.spec` Edit a ToDo | The todo list re-orders while another worker adds slots, so the click opened a neighbouring row and every check read that card | `openToDoByName` asserts the panel title and retries the click |
| `meetings.scenarios` knock / re-entry | `sendKnockRequest` silently no-ops; ParticipantInfo outlives the drain | Retry the click; drain again on seeing Knock |
| `kanban.spec` drag between columns | Six status columns (workflow specs add one) need ~2000px; at 1440 the drag had to scroll the board with the pointer down and the source card unmounted | `test.use({ viewport: { width: 2200, height: 1000 } })` |
| `kanban.spec` drags, all | dragstart lost while the helper scrolled and settled the target box before its first move | Nudge 8px right after `mouse.down()`, assert the `dragged` class, pause a frame before release |
| `kanban.spec` swim lanes ×3 | Board-button tooltip covered `btn-viewOptions` | `openViewOptions()` parks the pointer first |
| `kanban.spec` multi-column drag | `revealCard` always clicked the *first* Show more, expanding the leftmost column forever | Round-robin over all Show more buttons |
| `issues.spec` context submenu | Hover nudge landed before the menu listened; `selectMenuItem`'s `fill` has no timeout and burnt the 30s action timeout | `openSubmenuOnIssue` retries right-click + hover and asserts `selectPopup`. A generic "one more popup" check breaks chat's Change icon, where the palette *replaces* the menu |
| `issues.spec` Delete an issue, `component.spec` | Row detached mid-click; create form still settling on submit | Retry with a 5s bound instead of one 30s action |
| `issues-duplicate.spec` | The panel binds the document after the input mounts, so an early `fill` is overwritten by the stored title | `IssuesDetailsPage.setTitle` waits for the value to settle |
| `inbox.spec` assign someone else | `selectMenuItem` fell back to the first row and picked another employee sharing the faker surname | Wait up to 5s for the exact row when the list has more than one item |
| `plan.spec` drag ToDo | Six runs' worth of blocks in one slot pushed each under 44px, so the title was not rendered and each retry added another block | `beforeAll` drops stale `time:class:ToDo` + `WorkSlot` |
| `template.spec` | Fresh template below the fold of a collapsed, virtualised assignee group | `expandCollapsedCategories` + scroll inside a retry; `beforeAll` drops old templates |
| `template-details` labels | New tag past `TagsPopup`'s 50-item cut | Type it into the popup search |
| `billing-ui.spec` seats / packages | Bank webhook is fire-and-forget and lands late on a loaded stand | 20/30s waits raised to 45/60s |
| `workflow-settings.spec` second workflow | The close Escape started tore down the aside opened right after it - the first `fill` landed, then the input was gone | `openAside` waits for the name input and re-checks it after 200ms |

## Open, do not retry these

**`subissues.spec.ts:153`.** Moving issue close panel; reopening from list render
identifier as breadcrumb instead of `div.title.not-active` — 4 failures in 20 versus 1 flake in
full run. Reverted. Need locator matching both renderings.

## Wall time is packing, not just work

`meetings.all.spec.ts` import all 17 `love/*.tests.ts`, so with `fullyParallel: false` love is one
sequential ~178s job - twice next file. It used to start ~82s in and finish at 276s while
other four workers idled from 190s. Giving it own project (`Love` declared **before** `Platform`,
`testMatch: /love\//` vs `testIgnore: /love\//`, `use` shared through `platformUse`) put it at
head of queue: love now run 0.1s -> 162.9s and **wall went 276s -> 238s**. Packing near
ceiling now (1114s of worker busy over 238s = 4.68 effective workers), so further wall cuts have to
come out of work itself.

**Do not try to parallelise inside love.** `waitForActiveMeetingsToFinish` not just clean up
after itself - it force-finish every `MeetingMinutes` and delete every `ParticipantInfo` /
`UserMeetingInvite` in workspace (no room filter), then *wait until none left*. Two love
files in parallel kill each other's meetings. 12 of 17 reach it via `closeMeetingContexts`;
`session` and `bidirectional-loop` also call it mid-test. Only `access`, `migration`, `privacy` and
`meetings.tests` safe to split out (13.2s of 178s) - and after project split love no
longer critical path, so that buy nothing.

`meetings.start.tests.ts` create real meetings and has **no cleanup at all** - it only work because
aggregator run it before files whose `beforeEach` drains. Any reordering leave live meeting.

## Where the time goes

Clean run, 5 workers, 391 tests: **1054s of step time over ~250s wall** — bound by total work, not by
packing (5 workers already give 4.2x). Cutting wall time mean cutting work.

| block | cost |
|---|---|
| UI login (form + workspace picker) | 87.9s over 80 tests, 1.10s each |
| in-app switch clicks (Chunter 44s, Documents 28s, love 27s, all-issues 17s, Tracker 14s) | ~131s, 51.7s of it the *opening* navigation |
| `page.waitForTimeout` | 56.6s in 118 calls |
| `tab-all` (`clickModelSelectorAll`) | 40.2s in 122 |
| love widget waits (`meeting-widget` 35s, `floorGrid` 25s) | 60s |
| context + page creation | 31s |

**Click on icon of app already open toggle navigator shut**, and every later
lookup in it wait out its timeout on panel that not there. `LeftSideMenuPage.openApp` return
early when `pathname.split('/')[3]` already name app, so all eight `click<App>` helpers
idempotent. Same shape one level down: navigator group render moment after app, and
`isVisible()` read in that gap make caller press hamburger and hide panel it wanted
(`ai-bot-scenarios.openDefaultProject`).

**Open app from url, not from sidebar.** `loginByToken` / `createAccountAndWorkspace`
take optional app alias (`chunter`, `tracker`, `document`, `contact`, `notification`, `time`,
`love`); specs on `PlatformSetting` just extend own `goto`. Measured: opening click cost
~913ms, app segment in url ~55ms - 141 such clicks were 128.8s of run. Converted: all of
`chat/*`, `documents/*`, `love/*` (already had `navigateToOffice`'s early return), `tracker/filter`,
`inbox` (also moved off login form). Pick alias *first* step need, not one file
named after - `dynamic-issues-chats` open tracker first and only then chat.

**Token login instead of form.** `loginByToken` / `createAccountAndWorkspace` in `utils.ts`.
Measured: form + picker ~1.1s, token + `goto /workbench/<ws>` **490ms**, and
`goto /workbench/<ws>/<app>` only ~55ms more — it also swallow 810ms app-switch click. Eleven
specs converted: login-form steps **160 → 56**, `chat.spec` 110.6 → 88.9s, `image-reservation`
48.2 → 31.3s. Still slow: 63 opening app-switch clicks (`goto` + click ~1000ms vs direct URL 483ms).

**Tracing every attempt roughly double local run** (17.9MB per kept trace). Default is
`on-first-retry` in all three sanity configs; `TRACE_MODE=retain-on-failure` only when chasing flake,
because `on-first-retry` trace attempt that *passed*.

**Browser cache is per BrowserContext.** Server hits for `bundle*`: fresh context 6, reload 0, new
page in it 0, new context 6. Headers already `max-age=31536000` + etag. Full run serve 34 800
static requests / 1.9 GB out of 128 unique files, ~89 per test.

**Context reuse tried twice and removed — do not reach for it again.** Single shared context
give half suite wrong logged-in user (53 specs declare own `storageState`). Pool
keyed by context options with snapshot restored is correct on two specs (896 → 130 requests) and
give **exactly same wall time**; full suite then went 363 passed / 23 failed in 8.3m against
386 passed in 4.9m. What leak not storage — page kept open to write localStorage is live
websocket session notification and workspace tests see as extra participant. Saving is
bytes, not CPU: bundle already minified (`optimization.minimize: prod`).

**4 workers on `ubuntu-latest` buy exactly nothing.** Same suite, work went 3159s → 5899s and every
action's p50 doubled (`Create context` 102→210ms, `Close context` 10→19ms, `beforeEach` 714→1465ms);
wall stayed at 1744s vs 1813s. `Close context` not app work, so it runner: 4 vCPU with
whole 34-container stand saturated at 2 workers. `workers` left unset (cores/2). Remaining CI
levers are bigger runner or splitting across runners.

**`Promise.race` of two `waitFor`s bill loser** — 98.8s over 9 sign-ups in `confirmOtpIfNeeded`.
Use `expect.poll` over both conditions. **`step-reporter.ts` not a cost** (18836 rows / 4MB).

## Kanban drag: what the drop checks must compare (2026-09-07)

`dragPointer` (tests/sanity/tests/model/tracker/kanban-board-page.ts) verified drop target by
`data-state` alone. With swim lanes on, every lane carry cell per status, so drop that landed
one lane off matched `wanted`, passed both pre-release hit test and `__dropSeen` check, and
test failed later as "attachedTo never changed" - exactly flake seen in run 20260907-185152.
Zone key now `data-swimlane-id|data-state` in all three places (`wanted`, capture-phase
`drop` listener, `elementFromPoint`).

Two more things drag got wrong:

- Pointer aimed at centre of target's bounding box. Swim lane cell taller than
  900px viewport, so its centre sat below fold and `elementFromPoint` returned nothing. It now
  aim at centre of intersection with viewport (`visiblePointOf`).
- Taking card out of own cell rearrange board, so target move after it was
  measured. Measure-move-verify now run up to 4 times inside same held drag instead of failing
  caller's attempt.

`expectCardInColumn` / `expectCardInSwimLaneCell` call `revealCard` first: past column's limit
card not in DOM at all, and assertion reported it as missing.

## Tooling traps

- `pnpm build:lint` can report `errors 0` for package it served from
  `.fast-build-cache.json` and never linted. Real check is `npx eslint "tests/**/*.ts"` from
  inside `tests/sanity` — glob required, plain `tests/` path rejected.
- `--reporter=line` **replaces** reporter list: no `step-report.ndjson`, no `playwright-report.json`.
- love files are `*.tests.ts`; path argument give `No tests found`, select with
  `pnpm run uitest -g "<part of the title>"`.
- `workflow-settings.spec.ts` is serial describe — one flake re-run whole block, so every test
  in file get `-retry1` folder while only one reported flaky.
- `--repeat-each` on `kanban.spec.ts` give false failures: `setSwimLane` store view options per
  user and storage state shared, so parallel copies fight over board layout.
- `love/*` timings swing by tens of seconds run to run (LiveKit on Mac host); compare per-file
  deltas, not totals.

## love multitab: second tab left the meeting it just joined (2026-09-08)

`meetings.multitab.tests.ts` "joining from a second tab evicts the first tab" failed on
`connectedMarker(tabB)` in run 20260908-125454. Not test defect: trace show tab B connect, then
disconnect itself 49ms later (`[LiveKitClient.connect] Connection established successfully` 58.811 ->
`[LiveKitClient.disconnect] Disconnecting...` 58.860); love service logs matching `participant_left`
in room B 0.5s after `Evicted a session in another meeting`.

Root cause in `plugins/love-resources/src/components/meeting/ControlExt.svelte`: "was I moved out
of my room" guard in `checkActiveMeeting` read outer `myRoomAttached`, which not dependency of
reactive statement (Svelte track call arguments only), so it ran one tick before that
assignment. When tab B own ParticipantInfo landed, `$currentRoom` already room B while
`myRoomAttached` still pointed at room A from tab A row, and `$myInfo.sessionId === mySid` now
matched because row was tab B own - guard fired, called `leaveMeeting()`. Fix: pass value as
parameter, so it tracked and recomputed first.

Reproduce under load only: idle, tab B ParticipantInfo webhook land while `myConnectingSessionId`
still set and guard return early. 8 isolated repeats passed; with full Platform run
alongside, 4 of 8 failed before fix, 8 of 8 passed after (Love project 66 passed).

Reproducing love flakes: `--project=Love -g "<title>" --repeat-each 8 --workers 1 --retries 0
--trace on` while `--project=Platform --workers 5` load machine. Trace console entries identify
client-side disconnect; JSON reporter carry no steps, `error-context.md` no page snapshot.
## Kanban drop lost to a late dragover (2026-09-08)

Run 20260908-135958: `drag child between parent lanes` failed with `drop was not delivered ...
(landed on "null")` - `null`, not `outside`, so no `drop` event fired at all. Geometry was right;
`elementFromPoint` had the wanted cell. Chromium turns a synthesized mousemove into `dragover` a
tick later, and `mouse.up()` issued right after the move ends the drag with no drop. `panelDragOver`
always calls `preventDefault()`, so a cell that saw a dragover always accepts. `dragPointer` now
records the cell each `dragover` reaches (capture phase) and nudges up to 10 x 50ms until the wanted
cell has seen one, then releases.

## Popup that ignores Escape (2026-09-08)

Run 20260908-143050: `Add comment by popup` spent 30s in `locator('.modal-overlay').hover()` -
"intercepts pointer events", then "element was detached from the DOM": the attachment landing in the
popup replaces the overlay under the pointer. The hover bought nothing, the click after it did the
work. `closePopups()` alone does not help - the comment popup keeps its editor focused and ignores
Escape, the overlay survives all 15s. It now falls back to a capped click on the overlay when Escape
leaves it standing, and the test calls the helper instead of hover + click.

## Account API answered HTML mid-poll (2026-09-08)

Run 20260908-145911: `dynamic-issues-chats` died in `beforeEach` after 1.5s with `SyntaxError:
Unexpected token '<', "<html>..."` from `Api.waitWorkspaceReady` - the `getWorkspaceInfo` poll got
an HTML body. nginx logged no 5xx on `/_account` that second, so what served the page stays unknown;
`json()` named neither the method nor the status.

`Api.ts` now posts through one private `post()` that reads the body as text and throws
`<method> answered <status> with <first 120 chars>`. `selectWorkspace` and the `getWorkspaceInfo`
poll are retried (both are reads, 15s / 60s bounded), so one bad answer costs a poll instead of the
test; the poll also has a deadline now instead of `while (true)`.

## workspace-settings.spec "User is able to create Enum" (2026-09-10)

Report showed `strict mode violation: getByRole('button', { name: 'Save' }) resolved to 2 elements`,
the extra one being an enum option row `getByRole('button', { name: 'instinct autosave' })`. Not a
load race: `enumName` comes from `faker.word.words(2)`, and any generated word containing the
substring `save` (autosave, saved) collides with the non-exact accessible-name match. The option rows
are rendered as `<button class="hulyTableAttr-content__row">` by
`plugins/setting-resources/src/components/EnumValuesList.svelte`, inside the same dialog as the Save
button, so the collision is unavoidable while the match is a substring one.

Fix: `saveButton()` in `tests/model/workspace/owner-pages.ts` now uses `{ name: 'Save', exact: true }`.
Verified by forcing `enumName` to start with `autosave`: fails deterministically without `exact`,
passes 5/5 with it. Whole spec file still green (4 passed, 3 skipped, 10.5s), and
`saveUploadedLogo()`'s `nth(0)`/`nth(1)` pair still resolves - the workspace picture test passes.

General rule: `getByRole('button', { name })` matches by substring, so any locator whose name is a
short English word is one faker word away from a strict-mode violation. Prefer `exact: true` for
fixed UI labels.

## Round of 2026-09-10/11

Six flakes came out of a 10-run series, then one out of the next five. What the artefacts showed
and what changed:

- **`integrations.spec` `IntegrationAlreadyExists`.** Social ids were built from
  `faker.word.words(1)`; faker's word list is finite, so a repeat is a matter of time and the
  integration for that social id then already exists. Now `generateId()`. Same shape as the `Save`
  collision above - a faker word is not an identifier.
- **`issues-duplicate` `Expected: not "TSK-27"`.** The test read `getIssueId(title, 0)` twice for
  two issues sharing a title and assumed the newer one sorts first. When it does not, both reads
  return the same id. Now it takes the id that differs from the first one (`getIssueIds`).
- **`ai-bot-scenarios` `btnAiLevel-low` not found.** `getAILevels()`
  (`plugins/ai-bot-resources/src/requests.ts:122`) runs once in `onMount` and turns any failed
  request into an empty list, so the cards never appear however long the wait - waiting 30s was
  pointless. Now 10s, then a reload and 20s.
- **`contact.duplicate` "Contact already exists...".** `CreateCustomer.svelte:164` looks duplicates
  up in a reactive block that never cancels the previous request, so the empty-name answer can
  overtake the typed-name one and leave `matches` empty for good. Nothing re-runs it, so the test
  retypes the name inside `toPass`. The product race is untouched - that is a front rebuild.
- **`kanban` "drop was not delivered ... landed on null"** while the last dragover was on the
  wanted cell: `__dropSeen` was read immediately after `mouse.up()` and beat the event. Now polled
  up to 3s.
- **`kanban` "legacy drop on self"** lost its dragstart (`toHaveClass(/dragged/)` timed out).
  Svelte re-renders the card when another spec writes to the same project, and `move()` then bails
  out on an unset `dragCard`. `grabCard()` retries the grab three times, releasing and pressing
  Escape between attempts.
- **`issues.spec` "Add comment by popup"** lost its popup mid-upload - it is anchored to the issue
  row and any live update to the list takes it away, leaving a 45s wait staring at nothing. The
  whole open/fill/attach cycle now sits in `toPass`. **The first version of this fix caused a new
  flake**: a reopened popup restores its draft including the attachment, so re-attaching posted
  `cat2.jpeg` twice. Attach only when no attachment is shown.
- **`documents-content` "Checking styles in a Document"**: the second page had the document title
  but not yet its body - the collaborator replays 21 lines of edits after the document opens, and
  a missing `<a>` read as a missing link. Waits for the image (the last edit made) first.

Not fixed: **`kanban` "drop into same cell does not update document"** - `after.modifiedOn` came
back 109ms *lower* than `before.modifiedOn`, which an update after `before` cannot produce. One
transactor on the stand, host/container clock skew measured at 0-15ms, so neither explains it. And
**"drag child between parent lanes"** failed twice in a row with `attachedTo` unchanged after 30s
of drop retries - the drag mechanics worked, the app did not apply the move.

Also seen, not a flake: `Move to project` spent 27s inside one `Click ... span.toggle-switch`
waiting for actionability in 2 runs of 5 - something covered the toggle right after the project
popup closed.

**Wall time drifts up across a series** (346 -> 402s over 10 runs, 341 -> 366s over 5). The growth
is spread across every file rather than sitting in one test, which is accumulated workspace data,
not a regression from any fix. `dotest.sh` still runs no `restore-pg.sh`.

## Round of 2026-09-14: four flakes, two roots

10-прогонная серия дала 4 повторяющихся флака. Два корня, оба общие.

### Blink отбрасывает drop, узел которого пересоздали (kanban, 7 флаков из 18)

`drag card between columns` (4/10) и `drag child between parent lanes` (3/10). В отчёте были только
`Test timeout of 60000ms exceeded` - `dragUntilStatus` держал `timeout: 60000` при таком же таймауте
теста, поэтому poll никогда не успевал доложить свою ошибку. Шаговый отчёт показал бимодальность:
либо 1 попытка за 0.7s, либо 7-13 подряд неудачных по ~2.9s каждая (полный таймаут ожидания
`__dropSeen`), потом успех.

Диагностика (добавлена в `dragPointer`: bubble-слушатель `dragover`, который читает состояние уже
после хендлеров приложения) назвала виновника:

```
drop was not delivered to cell "|tracker:status:InProgress" (landed on "null",
 last dragover "|tracker:status:InProgress" of 6, 2994ms ago, dragend false;
 last dragover state: prevented=true drop=copy allowed=all on card-labels meta svelte-107ie1v)
```

`prevented=true`, `dropEffect=copy` - геометрия и preventDefault в порядке. Виновата последняя
часть: `on card-labels` - точка сброса попадала **внутрь содержимого карточки**. Blink запоминает
узел последнего `dragover` и доставляет `drop` именно ему; Svelte пересоздаёт содержимое карточки на
любой чужой tx в том же проекте, узел отсоединяется - и `drop` не приходит вообще, `dragend` тоже
(поэтому `dragend false`, а не "drop ушёл не туда").

Отсюда и старая запись "целиться в карточку, а не в центр колонки": центр колонки попадал в контент
карточки - тот же самый отказ, просто описанный как симптом.

Починка (`tests/model/tracker/kanban-board-page.ts`):
- `dragCardToColumn` / `dragCardToSwimLaneCell` целятся в саму колонку/ячейку, вся логика "выбрать
  карточку внутри" удалена;
- `visiblePointOf` ищет внутри видимой части цели точку, под которой нет `[data-id="kanban-card"]`
  (падинги колонки и Scroller переживают перерисовки), и только при неудаче берёт центр;
- цикл подталкивания требует *свежий* `dragover` (счётчик вырос), а не липкое `__dragOverCell` -
  раньше устаревшее значение с прошлой перерисовки отпускало кнопку сразу;
- если за 20 подталкиваний ни одного `dragover` - отдельная ошибка "drag session died", а не 3
  секунды ожидания дропа и `page.reload()`.

Тест (`tests/tracker/kanban.spec.ts`): `dragUntilStatus` обобщён в `dragUntilField(read, target,
drag)`, таймаут 40s (меньше таймаута теста, чтобы poll успел доложить), в текст падения
подставляется последняя ошибка drag. `drag child between parent lanes` переведён на этот хелпер -
его собственный poll возвращал `attachedTo`, прочитанный **до** перетаскивания.

Воспроизведение: в одиночку и под нагрузкой chat/documents тест зелёный 6/6. Нужна нагрузка именно
**tracker**-спеками - они пишут в тот же проект, отсюда перерисовки:
`--project=Platform tracker/ --grep-invert "Kanban board" --workers 5 --repeat-each 4`.
Под ней до правки 3 из 10 падали, после - 0 из 10 и 0 из 18 (три drag-теста по 6 повторов).

### Имя воркспейса из faker сталкивается, и тест уходит на форму логина

`AI level cards switch the workspace level` (3/10) падал на `btnAiLevel-low` "element(s) not found".
Прошлый разбор списал это на `getAILevels()`, который глотает ошибку и возвращает `[]`. Трейс
показал другое: запроса `/levels` в сети **нет вообще**, а снимок страницы - это форма логина.

`generateTestData()` брал `workspaceName: faker.lorem.word()`. Список слов faker конечен, а
`createWorkspace` на стороне аккаунта при коллизии url выдаёт воркспейсу **свой** url
(`server/account/src/utils.ts:1328`, `<base>-<generateId>`). Тесты же строят url из
`data.workspaceName`, а не из возвращённого `ws.workspaceUrl` - и уходят в чужой воркспейс, то есть
на логин. На стенде в момент разбора: 278 воркспейсов из 945 имели `url <> name` (29%).

Починка: `workspaceName` в `tests/utils.ts` получил суффикс (`generateId(8)` в `generateTestData`,
`faker.string.alphanumeric(8)` у модульной константы - там `generateId` ещё в TDZ). Под нагрузкой до
правки 5 из 8 падали, после - 8 из 8 зелёных дважды.

Это третий случай той же формы после `Save`-коллизии и `IntegrationAlreadyExists`: **слово faker -
не идентификатор**.

### Поиск, который молча не искал (issues.spec "Delete an issue", 2/10)

`searchIssueByName` (`tests/model/tracker/issues-page.ts`) нажимал Enter только если
`inputValue()` совпал с введённым, иначе **возвращался успешно**. Список оставался
неотфильтрованным, и `openIssueByName` 30 секунд искал строку среди всех задач проекта. Теперь
несовпадение бросает исключение, и обрамляющий `toPass` повторяет ввод. `openIssueByName` вдобавок
раскрывает свёрнутые категории внутри retry, а не один раз до него: чужой tx перерисовывает список
и сворачивает их обратно.

### Колонка доски показывает первые десять (tracker.spec "issues-status-display", 1/10)

`performPanelTest` проверял, что колонка доски содержит только что созданную задачу. При
накопленных данных колонка рендерит `10 / 64`, и задачи в DOM просто нет. Теперь жмёт "Show more" в
этой колонке, пока текст не появится.

### Проверка серии (2026-09-14, чистый стенд)

Стенд пересоздан `./prepare-pg.sh` (перед этим `./restore-pg.sh` оказался бесполезен: он сбрасывает
данные sanity-ws/meetings-ws, но накопленные воркспейсы в account DB остаются - 998 штук), затем три
прогона с `restore` между ними.

```
stamp             wall    work   passed  flaky  failed
20260914-150431   462.8  2076.1      417      1       0
20260914-151231   454.4  2052.6      416      1       0
20260914-152018   489.2    2228      416      0       0
```

Все четыре разобранных флака исчезли. Остались только love/LiveKit (`meetings.session` и
`meetings.presence`, по одному разу) - они и раньше плавали от прогона к прогону на Mac-хосте.

Время не выросло, а упало там, где чинили: `kanban.spec` 144.1 -> 107.2s (-36.9),
`ai-bot-scenarios` 100.2 -> 81.8s (-18.4), `tracker.spec` 70.3 -> 63.0s (-7.4). Wall 481.8 -> 462.8s.

### ai-bot заходит в каждый love-митинг и ломает счётчики (2026-09-15)

Прогон из 15 повторов дал два верхних флака, и оба свелись к одному источнику - ai-bot.

`meetings.recording` "transcription toggle flips transcriptionState both ways" (5/15) всегда падал
на `Expected 1, Received 2` - два активных `PendingRecording` формата `audio` на один митинг. Логи
`sanity-love-1` в окне падения:

```
10:13:41.402  updateMeetingTranscriptionState state:1
10:13:41.405  updateMeetingTranscriptionState state:1   <- второй /transcription, 3 мс спустя
10:13:41.499  createPendingRecording format:audio  docId ...163
10:13:41.518  createPendingRecording format:audio  docId ...167
```

Второй `/transcription(true)` шлёт ai-bot: у комнат meetings-ws стоит `startWithTranscription`,
бот видит старт митинга (`autoTranscribe: true`) и зовёт `startTranscription`
(`services/ai-bot/pod-ai-bot/src/workspace/love.ts:107`). Оба вызова успели прочитать
`findRunningRecording` до того, как хоть один записал резервацию.

Корень продуктовый: `startRecording` (видео) сериализован через `startInFlight`, а
`startAudioRecording` - нет, то есть тот самый check-then-act, который чинили для видео в FUSIO-1242.
Починка: резервация `PendingRecording` одним `TxApplyIf` для обоих форматов, работает и между
репликами (см. [love_recording_button_stuck.md](love_recording_button_stuck.md)). Юнит-тест "two starts racing before any reservation"
(`src/__tests__/recordings.test.ts`) падает без правки и проходит с ней; существовавший тест гонку не
ловил - он стартовал второй вызов уже после того, как первый дошёл до egress.

`meetings.presence` "two participants occupy two distinct cells" (3/15) падал на
`Expected 2, Received 3`: третья занятая ячейка - участник ai-bot (`AI participant create applied
x=2,y=0` ровно внутри окна падения). Тот же источник ломает и `meetings.guest`
"guest shows up as a participant" (`Expected 1, Received 2`).

Починка тестов: `disableRoomAutoTranscription()` в `meeting-helpers.ts` снимает
`startWithTranscription` у `ROOM_CANDIDATES`, вызывается один раз в `beforeAll` сьюта
(`meetings.all.spec.ts`). Ни один love-тест не проверяет транскрипцию, включённую настройкой
комнаты - `meetings.recording` бьёт в `/transcription` напрямую. После этого за прогон ноль строк
`AI participant` и ноль `Starting audio recording` - заодно ушёл лишний egress на каждый митинг.
Настройка живёт в воркспейсе, после `./prepare-pg.sh` возвращается, поэтому именно `beforeAll`.

`meetings.invite-ui` (2 падения из 15) - другое: клик по комнате перехватывал
`div.panel-instance` поверх floor grid. Локальный `clickFirstMeetingRoom` в спеке дублировал
`clickRoomByName` из хелперов, но без его защиты (Escape, при неудаче `openLove`). Удалён,
тесты переведены на `clickFirstAvailableRoom`.

Проверка: presence 4/4, transcription 4/4, весь проект Love 66 passed / 1 skipped (4.3m).
Правка love-сервиса на стенд не выкатывалась (нужен образ), её держит юнит-тест.

## Серия 2026-09-15, 10 прогонов: второе завершение митинга стирает knock-и следующего

`meetings.knock-office` "repeated knocks ... never stack" (2/10) падал на второй проверке
`toHaveCount(1)` после `waitForTimeout(5000)` - `Received: 0`: первая проверка прошла, потом элемент
исчез. Логи `sanity-love-1` в обоих окнах одинаковые:

```
07:45:09.292  Marked meeting as finished  de43   <- room_finished webhook, count 0
07:45:09.452  Activated meeting           de92   <- владелец снова в своём офисе, knock-и идут сюда
07:45:15.113  [PollingService] Room no longer exists  de43
07:45:15.245  Dropped invites for finished meeting  de43  count:2   <- knock-и de92
```

Корень в `services/love/src/workspaceClient.ts`: `finishMeeting` вызывается и вебхуком, и polling,
второй вызов не проверял `Finished`, а `cleanupInvitesForMeeting` удалял инвайты **по комнате**. У
knock-а есть только `room` (митинг ставит триггер после accept), так что это инвайты того митинга,
который живёт в комнате сейчас. Починка: повторный `finishMeeting` не трогает документ (заодно не
переписывает `meetingEnd`), удаление по комнате пропускается, если там есть другой Active/Pending
митинг, и берёт только инвайты без `meeting` или с этим `meeting`. Юнит-тесты в
`finishMeeting.test.ts` без правки падают. `meetings.scenarios` knock-to-join (1/10, "Knocker never
auto-joined") по логам того же вида: повторное завершение `b4e0` в 07:14:14 удалило 1 инвайт посреди
теста; что комната та же - из лога не видно. На стенд попадёт только с образом love.

Остальное по одному разу:

- **`template.spec` Edit a Template**: `Expected "0m" Received "8h"` 15s в `checkTemplate`.
  `editTemplate` проверял кнопку сразу после Save и ловил оптимистичный рендер; затем значение
  откатилось. Та же форма, что `issues-details-page.setEstimation`. Теперь после `toHaveText` ждём,
  пока текст простоит 500ms, и сверяем ещё раз внутри того же retry.
- **`workflow-settings` second workflow**: шаги показывают, что `openAside` прошёл свою проверку
  через 200ms, `fill` и `toHaveValue` прошли, а затем aside исчез - 30s `toBeEnabled` на "element(s)
  not found". Кто закрыл - не установлено (трейса нет, `test-results` перезаписан следующим прогоном).
  `createInAside` теперь при пропавшем aside открывает форму заново (до 3 раз), а перед повтором
  ждёт строку 3s - aside закрывается и после успешного Create.
- **`inbox.spec` turn off notification** ('Channel general' остался в inbox) и **`direct-chat`**
  (`modal-overlay` не ушёл за 5s после Create) - причина не установлена, артефакты перезаписаны.
  Замечено: `chatMessageToggle` - позиционный `.grid > div:nth-child(7)` без проверки состояния;
  комментарий в `createDirectChat` говорит "Retried by the caller", но спека его не ретраит.
