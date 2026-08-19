# Sanity flaky tests — root causes

Playwright mark test "flaky" when retry pass, so cause must read from *first* attempt trace. HTML report embed base64 zip in `playwright-report/index.html`; each result carry `steps` tree, and aggregating leaf-step self-time by call site expose costs. `test.trace` inside `playwright-report/data/*.zip` is JSONL of before/after events.

## Recurring shapes

**A lookup that cannot retry.** Almost every 60s timeout below is one action with no own timeout inside a `toPass`: action block until test die, retry loop never get turn. Give inner actions short explicit timeout, and make sure something *fails* when step silently do nothing — drag that dropped nothing raise no error by itself.

**A click that is not idempotent.** Rows toggle selection, rooms deselect on second click. Retry the *wait*, not the click.

**Positional selectors.** `nth-child(2)`, `.nth(1)`, `first()` — all shift when surrounding data change. Prefer content, or pick element data cannot remove.

**A filter that is not selective.** `selectMenuItem` filters by `name.split(' ')[0]`, so a name like `Move Teamspace-<id>` searches for "Move" and every parallel worker's object stays in the list. Clicking `.first()` then picks somebody else's. Match the whole name when an item carries it.

## Product-side causes

| What | Where | Effect |
|---|---|---|
| Categories auto-fold past 20 items | `ListCategory.initCollapsed` | Rows absent from DOM entirely |
| Async default-app navigation clobbers a click | `Workbench.svelte:syncLoc` | User navigation undone mid-load |
| Toasts cover profile button for 10s | `packages/ui/src/utils.ts` `addNotification` | Clicks on left nav wait toast out |
| `TimeInputBox` dispatches on every digit | `packages/ui/src/components/calendar/TimeInputBox.svelte` | One server write per keystroke |
| A tag can be saved before its category loads | `CreateTagElement.svelte` / `createTagElement` | Tag exists but rendered nowhere |
| Live query assigns server values back into an open editor | `EditToDo.svelte` | Edit that has not round-tripped is wiped |

**Auto-fold.** `autoFoldLimit = 20`, applied whenever localStorage has no state for that category — i.e. every fresh Playwright context. Verified live with zero `list_collapsing_` keys: components by lead showed "Not specified 42" collapsed with 8 rows in DOM; All Issues showed "Backlog 164 (20/164)" collapsed. Test-created components have no lead and most issues land in Backlog, so both grow past limit and stay there. Largest single time sink measured: `component.spec` 381s and `collaborative/issues.spec` 253s in one run, nearly all 60s timeouts. `CommonPage.expandCollapsedCategories` open them, clicking every collapsed header in one `evaluateAll` pass — counting down from previous total never converge, because expanding one category loads rows that can turn another from empty into collapsed. Empty categories carry same class and ignore clicks, hence `:not(:has(.chevron.empty))`. `check*NotExist` helpers passed for wrong reason whenever their category was folded.

**Navigation clobber.** `syncLoc` check "be sure URI is not yet changed", then `await`s `client.findOne(core.class.Space, ...)`, then call `navigate(loc)` — check before await, navigate after it. Broke `inbox.spec.ts:264`: URL reached `/notification` and was back on `/tracker/...` by next action, so `[data-id="inbox_menu-button"]` never existed. Fixed by re-reading `getCurrentLocation()` right before `navigate`. Related: `doSyncLoc` call `closePopup()` on every location change, which is why popup opened during initial render disappear.

**Toasts.** Default 10000ms, suppressed entirely at `0`; render bottom-left, exactly over `#profile-button`. `.auth/storage*.json` carry the `0` but accounts created inside test did not until `loginByToken` started seeding it. 13 actions in one run sat at exactly 10.0s, 131s total. Measured on `workspace-settings.spec.ts`: 54.4s → 12.2s.

**Per-digit writes.** Coalesced in `TodoWorkslots` with 400ms debounce — but debounce alone made `plan.spec.ts:153` fail 3/3, because rows render from live query result, which still hold old value while write queued. Typing time on top of just-changed date then rebuilt it from stale date. Fixed with optimistic overlay: render `slots` with not-yet-sent updates laid over them. `pending` must be plain object, not `Map` — Svelte does not react to `Map` mutation.

**Tag without a category.** `CreateTagElement` pick category in reactive statement fed by live query, while its OK button enabled as soon as title non-empty. Submitting inside that window store `category: tags.category.NoCategory` — id no `TagCategory` document has. `TagsPopup` render tags only inside category group, and its "nothing found" branch guarded by `objects.length === 0`, so such tag make popup render *completely empty*: tag is in result, matches no group, empty-state hint skipped. Reopening popup cannot help. Two flakes in one run, both proven in DB (`LABEL-FROM-PAGE-7d9f700004e` and `CREATE-TEMPLATE-…008` carried `tags:category:NoCategory`; tags from passing retries carried `tracker:category:Other`). Fixed in `createTagElement`, single funnel both callers use: resolve category with awaited `findAll` when none passed.

**ToDo panel wipes its own edit.** `EditToDo` runs `title = object.title; description = object.description`
in the query callback, which fires on *every* update to that ToDo - due date, priority, a work slot.
`StyledTextBox` reacts to a changed `content` by calling `editor.setContent`, so a callback carrying
a doc whose description has not caught up yet erases what was typed; the next blur then saves the
erased value back. Verified live that a foreign update does *not* wipe when the server value already
matches - the assignment has to differ to do damage, which is why it only hits right after typing.
Fixed by following the server only when the server value itself changed since the last callback.

## Stand state

**The workspace is not restored between local runs.** `dotest.sh` run `rush update` / `fast-build:*` / `rushx uitest`, and `uitest` is just `playwright test` — no `prepare-pg.sh`, no `restore-pg.sh`. Proof: seeded issue "Issues status can be changed by another users" kept `modifiedOn` 2026-08-20T07:50:57.840Z across two later full runs; after explicit restore it went back to dump value (2023-11-21, status Backlog).

Consequences, all measured:

- **Tests that mutate seed data work exactly once.** `collaborative/issues.spec.ts:73` moved that issue out of Backlog and never back. Creates own issue now.
- **Planner saturation.** `plan.spec.ts` append work slots to seeded ToDos and never remove them. After five runs: 23 slots on today, 21 on today+3, ten of them on "Add several slots for the same day" — which add two per run then assert exactly two exist. Saturated day render events as text-less slivers, so `eventInSchedule(title)` match nothing. Clearing slots took file from 3 failed / 3 passed in 2.5 min to 6 passed / 1 skipped in 20s. `:36` and `:103` still need restored stand; `:153` made self-contained instead.
- **Shared `sanity-ws` data drifts.** Board columns page at 20 with "Show more", swim lanes appear and vanish, `Backlog` grow without bound.

**Recreating a single container breaks nginx.** `docker compose -p sanity up -d --force-recreate
front0` restart its dependencies too, and they come back on different addresses; nginx resolved upstreams at startup and keep old ones, so `/_account` answer 502 and every test die on first navigation with empty workbench. `docker restart sanity-nginx-1` afterwards.

## Fixed flakes

| Test | Cause | Fix |
|---|---|---|
| `tracker.spec.ts` report-time | `reportTime` skipped flow when editor still showed *previous* issue total | Guard only after this call submitted (`submitted` flag) |
| `layout.spec.ts` grouping | Board pages at 20 per column, card past limit | `checkIssueFromList` click "Show more" until card appears |
| `layout.spec.ts` modified-ordering | Expected reverse creation order; `layout-1` had `modifiedOn` 51ms *after* `layout-0` created, because setting component/milestone lands as separate update | Read `modifiedOn` from transactor and sort by it |
| `filter.spec.ts` Priority filter | `getAttribute` with no timeout on rows captured before retry loop | Re-read rows per attempt, 2s per `getAttribute` |
| `workspace-settings.spec.ts`, `workflow-tracker.spec.ts` beforeAll | Profile menu re-renders while app boots; Settings item detaches mid-click | Reopen menu and retry (raising timeout rejected outright) |
| `chat.spec.ts` filter channels | Single click on filter option that detaches while popup loads | Retry click, reopen popup |
| `chat.spec.ts` copy message | Expected link built from workspace *name*; url gets random suffix when name taken | Read segment from `page.url()` |
| `chat.spec.ts` public channel | `faker.lorem.word()` can return `a`, so channel named `A` and matched every `getByRole({name})` | Word of at least five characters |
| `subissues.spec.ts` | Fixed 1500ms wait after "Move to project" | Wait for panel identifier to turn into `SECON-*` |
| `documents-content.spec.ts` styles | After `goToByTOC` editor unfocused, so `selectText()` ignored by ProseMirror and toolbar commands apply to nothing | `selectLine` click line first |
| `kanban.spec.ts` swim lanes | `__swim_unassigned__` exists only while some task has no priority; priority lanes `0`..`4` preseeded | Pick first lane that is not `__swim_unassigned__` |
| `kanban.spec.ts:774` | `dragPointer` hung 29.6s on *target* card; `dragCardToCard` revealed only source | 5s bound on target, reveal both cards |
| `plan.spec.ts` drag/resize | Source hovered *outside* `toPass` loop, so retries pressed mouse on target cell; no assertion drag did anything; target hour below fold | Hover inside loop, assert event/height changed, scroll hour into view |
| `plan.spec.ts:153` | Reads slots by row index, so any leftover slot shifts them | Creates own ToDo |
| `todos.spec.ts:29` slot row | "Add Slot" clicked with `force: true`, so click landing on tag popup still closing adds nothing and reports success | Retry until row count actually grows |
| `todos.spec.ts:29` counters | Nav count and rendered rows read in two calls; another worker creating ToDo in between made them disagree, and with steady stream every retry disagreed | Read both from one `page.evaluate` snapshot |
| `drive.spec.ts:39` | The right click on the drive row opened no context menu, and the click on its item had no timeout of its own | Retry the right click until the menu is there |
| `attachments.spec.ts:24` | `hoverAttachmentButton` left the tooltip closed, and `setInputFiles` then blocked on an input that did not exist - the surrounding retry never got a turn | Assert the tooltip opened; 5s on the upload |
| `workflow-tracker.spec.ts:100` | The project reaches the navigator before its workflow mixin, and `CreateProject` reads `workflowsMapping` once at mount - a dialog opened in that window never shows the label | Reopen the dialog |
| `documents.spec.ts:92` | The "+" on a nav row exists only while hovered; hovering once outside the retry left the click waiting out the test timeout as the navigator re-rendered and the row slid under the sticky teamspace header | Hover and click inside a `toPass`, 3s on the click |
| `documents.spec.ts:133` | The second user's page was closed while its edits were still flushing to the collaborator, so the first user saw half the text | Wait for the first user to see it before closing |
| `documents.spec.ts:63` | `selectMenuItem` filtered by "Move" alone and `.first()` moved the document into a parallel worker's teamspace | Click the item carrying the whole name |
| `component.spec.ts:62` | `pressYesDeletePopup` allowed 1s for the confirmation to close, but the button stays `disabled` until the cascading removal resolves | 10s bound |
| `todos.spec.ts:71` description | The panel's query callback assigned the stored description back over the freshly typed one, and the next blur saved the wiped value | Follow the server only when the server value changed |
| `documents.spec.ts:246` | The clipboard is shared by every context of one browser, so the poll for "http" accepted a link copied by an earlier test and navigated there | Clear the clipboard before "Copy link" |
| `public-link.spec.ts:60` | `revokePublicLink` returned before the removal round trip, and the guest page checks the link once at boot - so it rendered the issue and no retry could recover | Wait for the link form to close |
| `labels.spec.ts:45`, `template.spec.ts:25` | Tag submitted before its category query resolved, so it landed under id no category has and popup rendered nothing at all | Resolve category inside `createTagElement` |
| `template.spec.ts:44` | `checkFromDropdown` clicked tag that had not reached popup list | Type name into popup search (re-runs query); click stays single |
| `todos.spec.ts:71` | `checkToDo` opened tag popup via `nth-child(2)`, index that shifts once label attached | Label rendered in panel — check it directly |
| `inbox.spec.ts` | Invite-link chain inlined in 7 tests, bypassing hardened `getInviteLink` and its retry | All 7 call helper |
| `getInviteLink` | Popup closed via Close button, which editor floating toolbar (`div#tippy-N`) overlays | Escape, then assert link gone |
| `love` re-entry | `meeting-knock` shown instead of `meeting-connect`: `isLockedByPrivateMeeting` true while ParticipantInfo outlives drain (LiveKit webhooks recreate one) | Drain again on seeing knock button — re-clicking room only deselects it (6/6 failures when tried) |

## Open, do not retry these

**`subissues.spec.ts:153` "Sub-issues move with parent issue".** Moving the issue out of the project
it was opened from sometimes closes the panel, and `div.title.not-active` is then gone rather than
stale. Reopening it from the list makes things *worse*, not better: the row's `<a>` navigates to the
standalone issue page, which renders the identifier as a breadcrumb (`Second Project › SECON-16
(Issue)`) and never as `div.title.not-active` - 4 failures out of 20 versus 1 flake in a full run.
Reverted. A fix needs a locator that matches both renderings without matching the SECON issues other
tests leave in All Issues.

## Where the run spends its time

~2070s CPU over ~7.6 min wall on 6 workers. Clicks 49%, expects 19%. Context/page creation 2%, so **reusing browser windows across tests is not a lever** — cost is page load and individual actions.

`love` is longest single-worker unit (292s): 67s waiting for `div.floorGrid` after `goto` plus 17s in `goto` itself across ~79 SPA cold boots, 52.7s in in-app Love nav click (`office-page.ts:37`, 32 clicks averaging 1.65s — slower than full page load), 19.7s in one Start/Join click.