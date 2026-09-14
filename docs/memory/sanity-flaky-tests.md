# Sanity flaky tests — root causes and costs

## Diagnosing

Playwright marks a test flaky when a retry passes, so the cause is in the *first* attempt.
`node analyze_failures.js runs/<stamp>/playwright-report.json` — what failed. `node analyze_steps.js
runs/<stamp>/step-report.ndjson` — where time went; a step with small p50 and huge max is the next
flake. `test-results/<test>/error-context.md` — call log. Two opposite diagnoses:
`waiting for <locator>` = the control was never there; `intercepts pointer events` = it was covered.

Service logs for the failure window: `startTime` in the report is UTC, containers log UTC, host
`date` is local — `docker logs --since <ISO>Z --until <ISO>Z sanity-<svc>-1`.
Client-side causes (who called disconnect, console errors) are visible only in a trace: repro with
`--trace on`. The JSON reporter carries no steps and `error-context.md` no snapshot for those.

## Recurring shapes

- **`locator.count()` never waits.** Arithmetic on it needs a settled read (`waitStable`). But
  settled is not the same as non-empty: a just-filtered list is stably 0 for a moment, which reads
  exactly like "matched nothing" (`checkAllIssuesInStatus` waits for the first row first).
- **Controls that exist only while hovered or just opened.** Hover/open and use in two separate
  statements → a re-render between them leaves the second waiting out the whole test timeout.
  Retry the pair: hover → assert visible → click.
- **An action with no timeout of its own inside `toPass`** blocks until the test dies and the retry
  loop never gets a turn. Same for an inner wait *longer* than the test timeout: the failure arrives
  as a bare "Test timeout exceeded" with no locator named.
- **Timeouts are a measured maximum times a few, not "a minute just in case."** A minute only means
  the failure lands a minute later. ai-bot mock replies measured ≤4.9s against 60s bounds.
- **A click that is not idempotent.** Rows toggle selection, rooms deselect. Retry the *wait*, not
  the click, or return early when the target state already holds.
- **A click that opens nothing.** A row being re-ordered or moved between groups is replaced under
  the pointer. Retry the click until the panel really shows what was asked
  (`openIssueByName`, `openToDoByName`, `openDocumentForTeamspace`).
- **Positional selectors** (`nth-child(2)`, `.nth(1)`, `first()`) shift when surrounding data change.
- **A faker word is not an identifier.** Its list is finite, and `getByRole(name)` matches by
  substring. Four flakes from this: `Save` vs `autosave`, `IntegrationAlreadyExists`, workspace url
  collisions, `Edit` vs a channel named `Ampeditd...`. Use `generateId()` for identifiers and
  `exact: true` for fixed UI labels.
- **A non-selective filter.** `selectMenuItem` filters by the first word, so parallel workers'
  objects stay in the list. Match the whole name; `selectAssignee` delegates to it for that reason.
- **`hasText` matches a substring**, so a strict locator throws on grouped copy — `.first()`.
- **The pointer stays where the previous step dropped it.** A tooltip then covers the next control,
  and a second `hover()` on the element it already rests on fires no mousemove, so a retried hover
  reopens nothing. Park it (`mouse.move(0, 0)`) before clicking.
- **Chromium raises dragstart on the first move after `mouse.down()`** — anything between the two
  (scrolling, a settle wait) means `dragCard` is never set and every drop is a silent no-op.
  Assert the app saw it (the card takes `dragged`) before moving on.
- **Escape does not close a panel the app opened through a url**, and the close it *did* start lands
  a beat later and tears down whatever opened after it. Wait for the new panel's own content and
  re-check it.

## Product-side causes

| What | Where | Effect |
|---|---|---|
| Categories auto-fold past 20 items | `ListCategory.initCollapsed` | Rows absent from DOM (`CommonPage.expandCollapsedCategories`) |
| Async default-app navigation clobbers a click | `Workbench.svelte:syncLoc` | User navigation undone mid-load |
| Toasts cover `#profile-button` for 10s | `packages/ui/src/utils.ts` | Clicks wait the toast out; suppressed at `0` |
| `TimeInputBox` dispatches per digit | `TimeInputBox.svelte` | One server write per keystroke |
| Tag saved before its category loads | `CreateTagElement.svelte` | Tag exists, `TagsPopup` renders empty |
| Live query assigns server values into an open editor | `EditToDo.svelte` | Un-round-tripped edit wiped |
| Estimation renders optimistically, falls back ~70ms later | issue details, template details | Write lost; needs a 500ms settle (200ms is not enough) |
| Calendar keeps a stale event after a slot change | UBERF-4273 | A slot added right after a delete never appears |
| Calendar block under 44px renders no body | `EventElement.svelte` (`empty`) | `hasText` finds no title once ~6 events share an hour |
| Tag popup renders 50 tags per category | `TagsPopup.svelte` (`slice(0, 50)`) | A fresh tag past the cut is invisible; search for it instead |
| `move()` returns silently when `dragCard` is unset | `packages/kanban/src/components/Kanban.svelte:210` | A drop with no dragstart changes nothing, reports nothing |
| Templates group by assignee; the group stays collapsed and virtualised | Templates list | A fresh template is absent from the DOM |
| `CreateCustomer.svelte:164` never cancels the previous duplicate lookup | contact | The empty-name answer overtakes the typed one, `matches` stays empty for good |
| `getAILevels()` turns a failed request into an empty list, runs once in `onMount` | `ai-bot-resources/src/requests.ts` | Cards never appear however long the wait; only a reload helps |
| The account service gives a colliding workspace its own url (`<name>-<id>`) | `server/account/src/utils.ts` | A url built from the requested name lands in someone else's workspace, i.e. on the login form |

## Open

- **Comment counter reads one higher than the database** (`issues.spec` "Add comment by popup",
  3/10 on 2026-09-16 and again 3/10 on 2026-09-21). The double-apply is now reproduced and fixed
  in `packages/query` (see below), but the flake itself has not been observed since, so the causal
  link is unconfirmed until the front image carries the fix.
- **`ai-bot-scenarios` "assistant button ... proposes a task"** (1/10 on 2026-09-21): "Create issue"
  stayed `disabled` for the whole 30s. `canSave` in `CreateIssue.svelte` needs a title, a status,
  a task type *and* `currentProject`, which comes from a query filtered by
  `members: getCurrentAccount().uuid` - an empty result leaves it `undefined` for good, and
  `TaskKindSelector` (hence `kind`) does not even render without it. Which of the four was missing
  is unknown; `clickButtonCreateIssue` now reports the title and whether the task type selector is
  in the DOM, so the next occurrence says it.
- **`subissues.spec.ts:153`.** Moving an issue closes the panel; reopening from the list renders the
  identifier as a breadcrumb instead of `div.title.not-active` — 4 failures in 20 versus 1 flake in
  a full run, so the retry was reverted. Needs a locator matching both renderings.
- **`kanban` "drop into same cell does not update document"**: `after.modifiedOn` came back 109ms
  *lower* than `before.modifiedOn`, which an update after `before` cannot produce. One transactor,
  host/container clock skew 0-15ms — neither explains it.
- **A lost webhook loses the "Joined meeting" activity for good**: only the webhook path writes it
  (`webhook.ts addActivityToMeeting`), the polling fallback creates the participant but no activity.

## Fixed flakes

| Test | Cause | Fix |
|---|---|---|
| `issues.spec` Add comment by popup (counter) | A re-delivered $inc tx increments twice. Applying one moves the doc to `tx.modifiedOn` and `__updateDoc` *clears* `loadedModifiedOn`, so the repeat always looks like a fresh equal-timestamp `$inc` and `incOnlyAtSameTime` lets it through - whichever branch applied it first. A doc that entered the result through `push` (TxCreateDoc) never had a `loadedModifiedOn` entry to begin with | `ResultArray.markIncApplied`/`isIncApplied` remember the tx ids applied at the doc's current timestamp; a repeat returns without touching anything. Mark on **every** `$inc`-only apply, not just the equal-timestamp branch - the first review pass missed that and left the real comment-counter path (issue older than the comment) still doubling. Tests: `inc-match.test.ts` "ignores a re-delivered $inc tx ..." ×2 |
| `image-reservation.spec` | The preview request was held by a fixed 2.5s `setTimeout` while the container was awaited for 1s from the keypress. Under load the message itself took longer than that, so the wait expired - and had it not, the "before load" checks could have run against an already loaded image | The route holds the request on a promise the test resolves after the before-load checks; the waits go back to 15s |
| `chat.spec` filter channels (filter-section missing) | `applyTextFilter` treats an absent popup as "Apply landed" - but on the first attempt the popup may not have *opened* yet, so it returned successfully with nothing filtered and `checkFilter` waited out 15s on a section that never came | Assert the popup is visible before the retry loop |
| `tracker.spec` report-time | Editor still showed the previous issue's total | `submitted` flag |
| `tracker.spec` issues-status-display | A board column renders `10 / 64`, the issue is not in the DOM | "Show more" until the text appears |
| `layout.spec` grouping / ordering | Board pages at 20; `modifiedOn` bumped by a later update | "Show more" until found; sort by transactor `modifiedOn` |
| `filter.spec` Priority / Component / Label / Modified by | Rows captured before the retry loop; pre-filter counts; a row leaving the live list | Re-read per attempt; `waitStable` on the count; skip a gone row |
| `filter.spec` Status | `iterateLocator` waits for a stable count, and a just-filtered list is stably empty | Wait for the first row before iterating |
| `chat.spec` copy message / public channel | Workspace url gets a random suffix; `faker` returned `a` | Read the segment from `page.url()`; ≥5-char word |
| `chat.spec` thread in sidebar | Hover-revealed reply button | `clickMessageAction` retries hover+click |
| `chat.spec` edit message | `getByRole('button', { name: 'Edit' })` also matched a channel named `Ampeditd...` | `exact: true` |
| `chat.spec` filter channels | The popup re-renders as rows arrive and detaches the input *or* the Apply button. Retrying only the fill left Apply to burn its own 30s | `applyTextFilter` retries fill + Apply as one pair and returns early when the popup is gone |
| `indexer.spec` cross-workspace search | A workbench still settling after a fresh workspace closes the spotlight right after `open()` asserted it | `fillSearchInput` reopens inside a retry |
| `inbox.spec` turn off notification | `toggleChatMessage` clicks a positional `.grid > div:nth-child(7)` and never read the result, so the test asserted an absence it had not configured | Read the checkbox back, retry the click |
| `chat.spec` privacy toggle | The value comes back from the server | Retry the whole select, early return when already set |
| `documents-content.spec` styles | Editor unfocused after `goToByTOC`; the second page had the title but not yet the body | `selectLine` clicks the line; wait for the image (the last edit) first |
| `documents.spec` | Hover-only "+"; the second user's page closed mid-flush; `selectMenuItem` picked another worker's teamspace; shared clipboard | Hover inside `toPass`; wait for the first user; whole-name match; clear the clipboard |
| `documents.spec` Move document | The navigator row is still moving between teamspaces, so the click opens nothing | `openDocumentForTeamspace` retries until the panel carries the title |
| `plan.spec` drag/resize, drag ToDo | Hover outside the loop; "changed" is not "landed right"; six runs of blocks push each under 44px | Hover inside; compare the edge to the target cell; `beforeAll` drops stale `ToDo`/`WorkSlot` |
| `todos.spec` Edit a ToDo (slot end) | The typed end time showed, then reverted to the stored one - `EditToDo` assigns server values into the open editor | `setTimeSlot` settles the value for 500ms and re-reads it inside its own retry |
| `filter.spec` Modified by | The list is sorted by modification and re-renders under the pointer: "element is not stable", then detached | Retry the row click, 5s per attempt |
| `team-planner.spec` select team | `selectFilter`'s `default:` branch clicked the option with no timeout of its own, so a list still loading cost the full 30s | Retry the click, bounded |
| `issues.spec` Add comment by popup (image) | `checkCommentWithImageExist` read `getAttribute` straight away - a missing image came back as a bare 30s "waiting for locator" naming nothing | Assert the image visible with a message first, then read the attribute |
| `settings.spec` create-template | `editTemplate` clicked Edit and filled in two statements; a click that landed early left view mode standing and the untimed `fill` burnt 30s on an editor that never mounted | Retry click + fill as a pair, bounded |
| `issues.spec` Delete an issue | The row was behind a category's 50-row "Show more" on an unrestored stand, so expanding the category alone never brought it into the DOM | `openIssueByName` presses every "Show more" until the row exists |
| `todos.spec` slot row / counters / Delete / Edit | Forced click added nothing; two reads disagreed; hover-only dragbox; the list re-orders under the click | Retry until the row count grows; one `page.evaluate` snapshot; retry hover; `openToDoByName` asserts the panel title |
| `attachments.spec` | `hoverAttachmentButton` had no retry in the delete path | Retry both delete helpers |
| `issues.spec` Edit an issue | Estimation settle cut to 200ms | Back to 500ms |
| `issues.spec` context submenu | The hover nudge landed before the menu listened; `selectMenuItem`'s `fill` has no timeout | `openSubmenuOnIssue` retries right-click + hover and asserts `selectPopup` |
| `issues.spec` Delete an issue | `searchIssueByName` pressed Enter only when the value matched and otherwise **returned successfully**, leaving the list unfiltered | A mismatch now throws so the surrounding `toPass` retypes |
| `issues.spec` Add comment by popup | The popup is anchored to the issue row and any live update takes it away; a reopened popup restores its draft including the attachment | The whole open/fill/attach cycle in `toPass`, attaching only when nothing is shown |
| `issues-duplicate.spec` | The panel binds the document after the input mounts; two issues share a title and the newer does not always sort first | `setTitle` waits for the value to settle; take the id that differs |
| `settings.spec` customize-task-types | The state list is rebuilt while the popup is clicked | Retry the open+pick |
| `workflow-settings.spec` | A leftover aside is indistinguishable by its footer; the close Escape tears down the aside opened right after it; the aside can still close after the name is typed | `openAside` closes and reopens from scratch and re-checks the input; `createInAside` starts the form over (≤3 times) |
| `workflow-tracker.spec` | `CreateProject` reads `workflowsMapping` once at mount | Reopen the dialog |
| `labels.spec`, `template.spec` | Tag submitted before its category query resolved | Resolve inside `createTagElement` |
| `template.spec` | Fresh template below the fold of a collapsed, virtualised group; estimation falls back after the check passes | `expandCollapsedCategories` + scroll in a retry; settle the value and re-check |
| `template-details` labels | A new tag past `TagsPopup`'s 50-item cut | Type it into the popup search |
| `component.spec` | 1s for a cascading delete; description typed into ProseMirror overwritten by the panel's query callback | 10s bound; verify each field inside `editComponent` |
| `public-link.spec` | Revoke returned before the round trip | Wait for the form to close |
| `inbox.spec` | Invite chain inlined in 7 tests; `selectMenuItem` fell back to the first row and picked another employee sharing the surname | All call `getInviteLink`; wait up to 5s for the exact row |
| `indexer.spec` cross-workspace | `/workbench/` url ≠ workspace built | `createWorkspace` waits out "Creation in progress" |
| `applications.spec` | 1000ms `toBeVisible` for a panel | Default 15s |
| `documents-print-preview.spec` | Retrying the *fetch* — the blob never changes | Retry the print action |
| `mentions.spec` | The mention popup fills categories one by one; its overlay blocks `g#Send` | Settle the item count, assert the popup closed |
| `billing-ui.spec` seats / packages | The bank webhook is fire-and-forget and lands late | 20/30s raised to 45/60s |
| `workspace-settings.spec` create Enum | `getByRole('button', { name: 'Save' })` also matched an enum row `instinct autosave` | `exact: true` |
| `integrations.spec` | Social ids built from `faker.word.words(1)` repeat | `generateId()` |
| `ai-bot-scenarios` `btnAiLevel-low` | `getAILevels()` swallows a failed request; waiting longer is pointless | 10s, then a reload and 20s |
| `meetings.scenarios` knock / re-entry | `sendKnockRequest` silently no-ops; ParticipantInfo outlives the drain | Retry the click; drain again on seeing Knock |
| `contact.duplicate` | The product race is untouched (a front rebuild) | The test retypes the name inside `toPass` |

## Kanban drag

Everything the drop checks must compare, learned over three rounds:

- **Zone key is `data-swimlane-id|data-state`**, in all three places (`wanted`, the capture-phase
  `drop` listener, `elementFromPoint`). With swim lanes every lane carries a cell per status, so a
  drop one lane off matched `data-state` alone and failed later as "attachedTo never changed".
- **Aim at the column/cell, not at a card inside it.** Blink delivers `drop` to the node of the last
  `dragover`; Svelte recreates card content on any foreign tx in the same project, the node
  detaches, and neither `drop` nor `dragend` ever arrives. `visiblePointOf` picks a point with no
  `[data-id="kanban-card"]` under it, inside the target's intersection with the viewport (a swim
  lane cell is taller than the 900px viewport, so its centre sits below the fold).
- **Require a *fresh* `dragover`** (a counter that grew), not a sticky `__dragOverCell`: a stale
  value from the previous render released the button immediately. 20 nudges with none → "drag
  session died", not 3s of waiting plus a `page.reload()`.
- **`__dropSeen` is polled up to 3s** — reading it right after `mouse.up()` beats the event.
- **Re-measure inside the held drag** (up to 4 times): taking the card out of its own cell
  rearranges the board, so the target moves after it was measured.
- `grabCard()` retries the grab three times; `expectCardInColumn` calls `revealCard` first
  (past a column's limit the card is not in the DOM at all) and `revealCard` round-robins over all
  "Show more" buttons instead of always expanding the leftmost column.
- Six status columns need ~2000px: `test.use({ viewport: { width: 2200, height: 1000 } })`.
- `dragUntilField(read, target, drag)` reads the field *after* the drag, swallows the drag error and
  polls at `[100, 200, 300, 500]` with a 40s bound — shorter than the test timeout, so the poll gets
  to report its own error (45.9s → 3.0s).

## love / LiveKit

LiveKit runs as a **host process** (`tests/run_livekit_test.sh`, port 7890), not a container — only
`sanity-livekit-egress-test-1` shows in `docker ps`. Webhooks go back through nginx
(`livekit-test-config.yaml` → `http://127.0.0.1:8083/_love/webhook`).

Product defects found through these tests (details in `docs/memory/love-service-replication.md` and
`love_recording_button_stuck.md`):

- **No queue handler may throw on housekeeping.** The consumer retries a failed message in a
  `while (true)` and the partition is shared by the whole group, so one message that can never
  succeed blocks every later webhook — measured: 636 webhooks delivered, 0 processed, for 8 runs
  straight, with wall at 2.5x. `updateMetadata` (LiveKit answers "no response from servers" forever
  for a room whose node it lost) now logs and returns instead of throwing.
- **Every meeting is finished twice** (the `room_finished` webhook and polling, ×N replicas).
  `finishMeeting` now skips an already-`Finished` meeting, and knock invites — which carry only a
  room — are not dropped when another meeting is already live in that room.
- **Recording reservation is one `TxApplyIf`** under a per-slot scope, not a `Map` in the process.
- **ai-bot auto-joins every meeting of a room with `startWithTranscription`**, adding a third avatar
  and a second audio egress. The suite switches it off once in `beforeAll`
  (`disableRoomAutoTranscription`); the setting returns after `./prepare-pg.sh`.
- **`ControlExt.svelte` read `myRoomAttached` outside the reactive statement's dependencies**, so a
  second tab left the meeting it had just joined. Pass the value as a parameter.

Reproducing love flakes: `--project=Love -g "<title>" --repeat-each 8 --workers 1 --retries 0
--trace on` while a `--project=Platform --workers 5` run loads the machine.

## Stand state

**Not restored between local runs** — `dotest.sh` runs no `restore-pg.sh`. Consequences:

- Tests that mutate seed data work exactly once. `plan.spec.ts` asserts absolute counts on seeded
  todos, so a leftover slot makes it unpassable rather than flaky.
- **Accumulated data crosses product render limits.** Measured on an unrestored stand: 431 issues,
  91 tags, 48 components, 62 todos, 28 templates — past `TagsPopup`'s 50 and enough to bury a fresh
  template below the fold. Tests that passed for months start failing with no code change.
  `plan.spec.ts` and `template.spec.ts` drop their own leftovers in `beforeAll`.
- `restore-pg.sh` is not enough on its own: it resets sanity-ws/meetings-ws data but leaves the
  accumulated workspaces in the account DB (998 of them once). Full reset is `./prepare-pg.sh`.
- love tests share rooms in `meetings-ws`. `waitForActiveMeetingsToFinish` gives up after 20s and
  logs what was left.

**Recreating one container breaks nginx** — it resolves upstreams at startup. `docker restart
sanity-nginx-1` after any `--force-recreate`.

## Wall time

**Packing, not just work.** `meetings.all.spec.ts` imports all 17 `love/*.tests.ts`, so with
`fullyParallel: false` love is one sequential ~178s job. Giving it its own project (`Love` declared
**before** `Platform`, `testMatch: /love\//` vs `testIgnore: /love\//`) put it at the head of the
queue: wall 276s → 238s. Packing is near its ceiling now, so further cuts come out of the work.

**Do not parallelise inside love.** `waitForActiveMeetingsToFinish` force-finishes every
`MeetingMinutes` and deletes every `ParticipantInfo`/`UserMeetingInvite` in the workspace (no room
filter), then waits until none are left — two love files in parallel kill each other's meetings.
`meetings.start.tests.ts` has no cleanup at all and only works because the aggregator runs it first.

Where the time went on a clean 5-worker run (1054s of step time over ~250s wall):

| block | cost |
|---|---|
| UI login (form + workspace picker) | 87.9s over 80 tests |
| in-app switch clicks | ~131s, 51.7s of it the *opening* navigation |
| `page.waitForTimeout` | 56.6s in 118 calls |
| `tab-all` (`clickModelSelectorAll`) | 40.2s in 122 |
| love widget waits | 60s |

- **Token login instead of the form.** `loginByToken` / `createAccountAndWorkspace` in `utils.ts`:
  form + picker ~1.1s, token + `goto /workbench/<ws>` **490ms**, the app segment only ~55ms more.
  Eleven specs converted: login-form steps 160 → 56.
- **Open an app from the url, not the sidebar** — an opening click cost ~913ms against ~55ms.
  Pick the alias of the *first* step needed, not of the file's name.
- **Clicking the icon of an app already open toggles the navigator shut**, and every later lookup in
  it waits out its timeout. `LeftSideMenuPage.openApp` returns early when the url already names the
  app. Same shape one level down: a navigator group renders a moment after the app, and an
  `isVisible()` read in that gap makes the caller press the hamburger and hide the panel it wanted.
- **`Promise.race` of two `waitFor`s bills the loser** — 98.8s over 9 sign-ups. Use `expect.poll`.
- **Tracing every attempt roughly doubles a local run** (17.9MB per kept trace). Default is
  `on-first-retry`; `TRACE_MODE=retain-on-failure` only when chasing a flake.
- **Context reuse was tried twice and removed — do not reach for it again.** A single shared context
  gives half the suite the wrong user (53 specs declare their own `storageState`). A pool keyed by
  context options is correct on two specs (896 → 130 requests) and gives *exactly the same* wall
  time; the full suite then went 363 passed / 23 failed in 8.3m against 386 passed in 4.9m. What
  leaks is not storage but the live websocket session of the page kept open to write localStorage,
  which workspace tests see as an extra participant.
- **4 workers on `ubuntu-latest` buy exactly nothing.** Work went 3159s → 5899s and every action's
  p50 doubled while wall stayed at 1744s vs 1813s — 4 vCPU with the whole 34-container stand is
  saturated at 2 workers. `workers` left unset (cores/2).
- Browser cache is per BrowserContext (fresh context 6 `bundle*` hits, new page in it 0).
  `step-reporter.ts` is not a cost (18836 rows / 4MB).

## Tooling traps

- `pnpm build:lint` can report `errors 0` for a package served from `.fast-build-cache.json` and
  never linted. The real check is `npx eslint "tests/**/*.ts"` from inside `tests/sanity` — the glob
  is required, a plain `tests/` path is rejected.
- `--reporter=line` **replaces** the reporter list: no `step-report.ndjson`, no
  `playwright-report.json`. Use `pnpm run uitest:telemetry` for a measured run and
  `pnpm run uitest:series [N] [args]` for a series.
- `node telemetry/selftest.js` checks how a stopped run is classified — run it after touching
  `collect-run.js` or `stability.js`.
- **End a series early with `touch runs/.stop`**: the current run finishes whole and the series
  stops before the next one. Ctrl-C reaches Playwright too, so that run ends partial — its
  in-flight tests come back `interrupted`, `run.json` gets `partial: true`, and `stability.js`
  prints the row but leaves it out of the tally. Before the fix those five interrupted tests
  showed up as five one-off failures.
- A killed run used to copy the *previous* run's `playwright-report.json`, since both reports are
  written at the end and the file sits in the suite root. `run.sh` now deletes them up front, so a
  run that never got that far reports nothing instead of someone else's numbers.
- love files are `*.tests.ts`; a path argument gives `No tests found`, select with `-g`.
- `@llm` and `@network` are excluded from normal runs (`--grep-invert`), so they never appear in a
  series — and `@llm` needs a model server on host port 8000 or the bot fails in ~7s.
- `workflow-settings.spec.ts` is a serial describe — one flake re-runs the whole block, so every
  test in the file gets a `-retry1` folder while only one is reported flaky.
- `--repeat-each` on `kanban.spec.ts` gives false failures: `setSwimLane` stores view options per
  user and the storage state is shared.
- `love/*` timings swing by tens of seconds run to run (LiveKit on a Mac host); compare per-file
  deltas, not totals.
- A `test.skip()` that depends on stand state changes the passed count without failing anything:
  run 20260917-123206 came out 415 instead of 417 because two `meetings.start` tests hit
  `test.skip(name === null, 'No regular room available')` - every room was busy at that moment.
- A retry attempt can die with `End of central directory record signature not found` - the trace zip
  of the previous attempt was still being written. Playwright's own artefact race, not the test.
- Wall time drifts up across a series (346 → 402s over 10 runs) because workspace data accumulates,
  not because of any one fix.
