# Sanity run: where the love lane spends its time

Область: [тесты](../testing.md)

Measured 2026-09-02 on the local stand (5 workers for the full suite, 1 worker for the love-only runs).

## The suite is capped by two lanes

`love/meetings.all.spec.ts` imports all love `*.tests.ts` files; the Love project runs `fullyParallel: false`, so it is one sequential job. Both lanes (love vs. the rest at 4 workers) land at roughly the same wall time - cutting Platform-lane work alone does not move the total until the love job itself gets shorter.

## The grace wait after an office owner leaves

The owner's leave reaches love only as a LiveKit `participant_left` webhook, which does not close the room - it stamps `ownerLeftAt` into the room metadata (`services/love/src/webhook.ts`). `LiveKitPollingService.closeRoomIfOwnerGone` (`services/love/src/polling.ts`) closes it once `Date.now() - ownerLeftAt` passes `OWNER_REJOIN_GRACE_SEC`, and `scheduleNext` pulls the next poll forward to exactly that deadline. Only then does `deleteRoom` disconnect the peer, and the client's widget closes on the LiveKit `Disconnected` event.

The stand sets `OWNER_REJOIN_GRACE_SEC=8` and `POLLING_INTERVAL_MS=10000` (`tests/docker-compose.yaml`). The grace has to stay above the time an owner needs to reload the page, or `host refresh does not disconnect the other participant` starts failing under load.

## Closing the LiveKit room instead of waiting for the grace

The grace exists for a real user's refresh; a test does not have to sit through it. `listRooms` + `deleteRoom` through `livekit-server-sdk` is the same call the poller makes, so the peer gets a real `Disconnected` rather than a half-state - `waitForActiveMeetingsToFinish` (`tests/sanity/tests/love/meeting-helpers.ts`) does it alongside the document cleanup. Keys and URL come from env with the stand's defaults (`http://localhost:7890`, `testkey`). The cleanup must run *before* any `waitDisconnected` wait a test does on its own, not after.

## `@network` outage tests run on demand

`meetings.network.tests.ts` is tagged `@network`. `pnpm run uitest` excludes `@llm|@network`; `pnpm run uitest-network` runs them. Nothing in CI runs them today.

## A short poll interval evicts live participants

`LiveKitPollingService` drops a "ghost seat" when a `ParticipantInfo.sessionId` is missing from its LiveKit snapshot (`services/love/src/polling.ts`, `Removing ParticipantInfo with stale sessionId` log). The snapshot is a moment old, so a participant who just (re)joined can be evicted: the client loses `currentRoom`, the widget closes, the session drops, and the meeting-anchor reconnect brings it back - a join/leave loop every poll interval. At `POLLING_INTERVAL_MS=3000` this hit `workspace-owner :: self-join` in 4 of 7 runs (~50s each); the stand runs at the default 10000. The product-side fix - skip rows younger than one poll interval - is not written.

## A dropped client kept its meeting anchor

`rememberActiveMeeting` writes `love.activeMeeting` into sessionStorage on every connect (`plugins/love-resources/src/meetings.ts`). `LiveKitClient.onDisconnected` (`plugins/love-resources/src/liveKitClient.ts`) now takes the `DisconnectReason` and clears the anchor for `ROOM_DELETED`, `ROOM_CLOSED` and `PARTICIPANT_REMOVED` - otherwise a client the server dropped still looked like someone who wants to be in a meeting, and the next store tick's `reconnectToCurrentMeeting` sent the window to a finished meeting's MeetingMinutes page. A refresh or a network drop arrives with a different reason, so auto-reconnect is untouched.

The subscription lives inside `onClient(...)`: `liveKitClient.ts` and `meetings.ts` import each other, and reading the store at module scope threw during evaluation - the whole love plugin failed to initialise and the office rendered blank.

## Tests can pick up the previous test's meeting

`waitRoomMeeting` (`tests/sanity/tests/love/meeting-helpers.ts`) takes a `since` timestamp and filters on `createdOn`, because a meeting finished a moment earlier still reads as Active over REST for a few hundred ms - without it, a test could drive a dead meeting (e.g. get "Audio recording already in progress" for a recording toggle against a meeting that already ended).

`joinRoom` retries the room click, the Connect click and the connected check as one block: a navigation landing between the clicks otherwise costs a full timeout.

## Love needs a second workspace to parallelise further

`waitForActiveMeetingsToFinish` wipes every meeting in the workspace (no room filter), so two lanes sharing `meetings-ws` would kill each other's meetings - love can only run as one sequential lane until a second meetings workspace exists.

## Page reuse pays in love, not in tracker

Sharing one window per user across the love suite pays because a love context costs a full floor boot and love is the critical path. Tracker is a different profile: a shared window for `tracker/kanban.spec.ts` was measured and reverted - no wall-time gain, and `dragstart marks the card as dragged` failed on the shared window and passed on a fresh one (every kanban test re-enters the board through `openTrackerBoard`, which does a full `goto` anyway).

## Room picked as "available" was occupied

`EditRoom.svelte` renders Knock instead of Connect when `isLockedByPrivateMeeting` - a room can still hold `ParticipantInfo` rows from a meeting the test is not in. `firstAvailableRoom` now skips rooms with occupied cells (it used to only check that the room card was rendered, so it always returned the first room), and `joinRoom` throws a named error on seeing Knock instead of waiting out its timeout on a Connect button that cannot appear.

`clickRoomByName` closes any `div.panel-instance`, not just `[data-id="room-panel"]`: the minutes page a previous test left open swallows the click through its table cells, and Escape misses a panel opened through the url, so it falls back to `openLove`.
