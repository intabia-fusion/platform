# Inbox rework: review findings

Branch `rework-notifications-v1` vs `origin/develop` (merge-base `6a0cfbf3d9`).
Diff: 349 files, +22594/-11406, 50 commits.

Review method: 8 parallel domain agents, every finding below manually verified against the code.

Status legend: `[ ]` open, `[x]` fixed, `[-]` won't fix / by design.

---

## CRIT

- [-] **Telegram delivery fully disabled** — `services/telegram-bot/pod-telegram-bot/src/start.ts:89-105`, `worker.ts:340-407`

  Kafka consumer for `QueueTopic.TelegramBot` is commented out; bodies of `processNotification` / `processWorkspaceSubscription` are commented out and their params degraded to `any`. The pod starts, health check is green, no log emitted — users with a Telegram integration silently receive nothing. `QueueTopic.TelegramBot` is also removed from `queue/types.ts`, and no producer exists in the new `services/notifications`.

  Open question: temporary stub during the rework, or lost work? If temporary, add an explicit log/metric so the regression is visible in production.

  **Response**: Telegram delivery is temporarily disabled until needed.
---

## HIGH

- [-] **Migration deletes notification history for unresolvable classes** — `models/notification/src/migrations/migrateNotificationsToEmbedded.ts:139-140,699-702`

  `getDoc` returns `undefined` both when `findDomain(objectClass) == null` (unknown/renamed class) and when the object is genuinely deleted. Both paths land in `toRemove` -> `deleteMany` of the context **and its whole notification history**. A class missing from the current hierarchy causes irreversible data loss.

  Fix: distinguish "domain not found" (skip + log) from "doc missing" (delete).

  **Response**: Contexts and notifications for deleted or renamed entity classes are cleaned up during migration.

- [-] **`notifyAuthor` bypassed for message notifications** — `services/notifications/src/module/message.ts:150`, `:418`

  Hard `if (receiver.account === sender.account) continue` before `getMessageNotifyProviders`. `origin/develop` (`workspace.ts:553-593`) had no such skip — the decision was made by the `notifyAuthor` flag inside the provider (`utils/providers.ts:193`, logic still intact).

  Caveat: types carrying `notifyAuthor: true` (`request`, `time`, `training`, `setting`, `gmail`, `telegram`) flow through `tx.ts:121`, which has no skip. Practical impact only if such a type is attached to `ChatMessage` / `DocUpdateMessage`. Confirm whether the skip was intentional.

  **Response**: We dont need to notify user about own messages. Requests and to-dos trigger notifications via a different path, since there are no messages associated with them.

- [-] **Mention no longer unhides a hidden chat (update path)** — `server-plugins/chunter/src/middleware.ts:78`

  `pushedNotifications.filter((it) => it.type === 'message')`. `MentionNotification` has `type: 'mention'` (`plugins/notification/src/types.ts:247`) and is filtered out. Old code unhid on any `InboxNotification` except reactions and non-mention commons.

  Scenario: hide a DM, get `@mentioned` there — the chat stays hidden forever.

  **Response**: Messages with mentions are added to `unreadMessages.

- [-] **Mention no longer unhides a hidden chat (create path)** — `server-plugins/chunter/src/middleware.ts:56`

  `if (context.unreadMessages.length === 0 || ...) continue`. Mentions populate `unreadMentions`, not `unreadMessages`, so a first-ever mention in a previously hidden chat with no messages never unhides it.

  **Response**: Same as above.

- [-] **Unread reactions never cleared on doc open** — `plugins/notification-resources/src/client.ts:394-414`

  `readNotificationsWithoutMessage` omits `reactionIds`. Server-side `read.ts:81 readContext` only clears `unreadMessages`. `unreadReactions` is cleared only via `action.ts:66` (explicit `ReadNotificationAction`), `message.ts:265` (message deletion), `reaction.ts:182` (reaction removal) — opening a document hits none of them. The reaction badge sticks until "Read All".

  Fix: include `reactionIds`, mirroring `readAll` (`client.ts:496`).

  **Response**: Reactions are attached to specific messages and cleared on scroll when the message enters the viewport.

- [x] **Sort comparator typo kills unread-first ordering** — `plugins/chunter-resources/src/components/chat/utils.ts:221`

  `hasUnreadMessages2` reads `context1` instead of `context2`. `origin/develop:221` was correct. Both variables are now identical, so the `return -1` / `return 1` branches are dead and unread-first sorting in the navigator does nothing.

  **Response**: Fixed typo `context1` -> `context2` in `plugins/chunter-resources/src/components/chat/utils.ts`.

- [-] **Notification label hardcoded to "Thread"** — `plugins/activity-resources/src/components/activity-message/ActivityMessageNotificationLabel.svelte:30`

  Label pinned to `activity.string.Thread`; the `(object?.replies ?? 0) > 0 ? Thread : Message` branch was dropped. The component is registered as `labelPresenter` for all `ActivityMessage` (`models/activity/src/notification.ts:40`), not just threads. A plain channel message now reads "Thread in #general".

  **Response**: All `ActivityMessage` notifications use the "Thread" label by product design.

---

## MED

- [-] **Failed SQL migration marked as applied** — `services/db-migrator/src/db.ts:128-141`

  `applyMigration` logs any SQL error and marks the migration applied anyway; the schema version is bumped. `db.ts` is unchanged in this branch (pre-existing), but the new `0001_reworkNotifications.sql` inherits it: a failed migration stays half-applied forever, with no retry and no alert.

  **Response**: Pre-existing monorepo-wide `db-migrator` error handling pattern.

- [-] **Badges zeroed between SQL and JS migration** — `services/db-migrator/migrations/0001_reworkNotifications.sql:11-15`

  SQL unconditionally sets `unreadCount = 0` on every `notification_dnc` row; real counts are computed by the JS migration during each workspace upgrade. Between the two events every user's badges read zero. No ordering is enforced between db-migrator and workspace upgrade.

  **Response**: Intermediate staging step in two-phase database migration strategy.

- [-] **Index creation locks writes** — `services/db-migrator/migrations/0001_reworkNotifications.sql:30-55`

  6 indexes plus one on `activity` (the largest table) are created inside `sql.begin` without `CONCURRENTLY`. Writes are blocked for the whole migration window.

  **Response**: PostgreSQL prohibits `CREATE INDEX CONCURRENTLY` inside `sql.begin` transaction blocks. Migrations run during offline maintenance prior to server startup.

- [x] **`isTriggerCtx` mutates shared request context** — `foundations/server/packages/middleware/src/triggers.ts:293-295`

  `ctx.contextData.isTriggerCtx = true` mutates the object shared with the request and is never reset. `postgres/storage.ts:634` skips `addSecurity`; `notification/middleware.ts:99` treats it as system access.

  Caveat: line 138 does the same and **exists in develop**, where `_ctx` defaults to the outer `ctx` — so this opens no new hole, it widens an existing practice. Still worth cloning `contextData` or resetting the flag.

  **Response**: Context mutation wrapped in `try ... finally` with guaranteed `isTriggerCtx` cleanup and covered by unit test `foundations/server/packages/middleware/src/__tests__/triggers.test.ts`.

- [-] **Unread cleanup skipped when `removedDoc` is missing** — `services/notifications/src/module/message.ts:195-198`

  `handleRemoveMessage` returns early on `tx.removedDoc == null`, skipping all unread / `latestNotifications` cleanup. Previously only the `createdOn` chunk sub-step was skipped. When two deletes race, the second tx misses `removedMap` and leaves a stale badge.

  **Response**: Idempotency handling for duplicate delete transactions.

- [x] **Stale-tx guard applied to only one entity** — `services/notifications/src/cache.ts:812`

  The `tx.modifiedOn < context.modifiedOn` guard exists only in `updateNotifyContext`. `Collaborator`, `ReadState`, `PersonSpace`, `Person`, provider settings and `UserStatus` update unconditionally — a reordered Kafka tx rolls the cache backwards.

  **Response**: Transaction timestamp validation and cache invalidation added across all entities in `cache.ts`.

- [x] **Poison message blocks the partition** — `services/notification/pod-notification/src/main.ts:126-129`

  Consumer `catch` does `ctx.error(...); throw e`. The shared Kafka consumer retries the same message forever with backoff capped at 10s — one poison message halts push delivery for every workspace on that partition.

  **Response**: Implemented 3-attempt exponential backoff retry loop with subsequent logging and acknowledgement (ack) to protect the Kafka partition.

- [x] **`serviceTxes` grows unbounded** — `services/notifications/src/cache.ts:233`

  Entries are removed only when the tx returns via its round trip. `workspace.ts:101` returns early when `domain == null`, so those ids are never removed.

  **Response**: Unbounded `Set` replaced with bounded `LRUCache`.

- [-] **`clearAll` semantics changed** — `plugins/notification-resources/src/client.ts:456-478`

  `clearAll` calls `removeDoc(DocNotifyContext)`; the old `removeAllNotifications` deleted `InboxNotification`. The server recreates the context via `getCreateContextTx`, so subscriptions are not lost permanently — but "Clear All" now means something different.

  **Response**: Context clearing resets unread counters while dynamically preserving subscriptions.

- [x] **Stale write in notify-status update** — `plugins/workbench-resources/src/components/Applications.svelte:95-113`

  `$: void updateNotifyStatuses(...)` has no in-flight guard. Two rapid `totalUnreadCountStore` changes can let the older run write `notifyStates` after the newer one.

  **Response**: Added `updateSeq` sequence counter to prevent async execution race conditions.

- [x] **Missing required env vars fail late** — `services/notification/pod-notification/src/config.ts:34-49`

  `AccountsUrl` / `Secret` are not in the `required` array; a missing env var defers the crash to the first REST call instead of failing fast at startup.

  **Response**: Mandatory `AccountsUrl` and `Secret` environment variables added to `required` array in `config.ts`.

- [x] **Missing reactive dependency** — `plugins/chunter-resources/src/components/ReverseChannelScrollView.svelte:381-396`

  `updateDownButtonVisibility` reads `$isTailLoadedStore` inside its body, but the reactive statement does not list it as a dependency. "Jump to latest" button visibility gets stuck.

  **Response**: Explicitly included `$isTailLoadedStore` in reactive call parameters.

- [x] **Unread anchor drops notification-level state** — `plugins/chunter-resources/src/chatViewport.ts:553-585`

  `resolveAnchor` uses only `readState[me.uuid].timestamp`; the old `min(readState.timestamp, firstUnviewedInboxNotification.createdOn)` from `channelDataProvider.ts:551-576` is gone. A mention created before the last `forceReadDocState` falls out of the unread separator.

  **Response**: Included `unreadMentions` timestamp in unread anchor calculation.

- [x] **Read accumulator not deduped** — `plugins/chunter-resources/src/scroll.ts:57-67`

  Accumulator is a `Set` of freshly allocated `{_id, createdOn, modifiedOn}` literals; `Set` compares by reference, so duplicates pile up until flush.

  **Response**: Accumulator converted to `Map<Ref<Doc>, ActivityMessage>` keyed by `_id`.

- [x] **Collaborator-removal cleanup lost** — `server-plugins/notification-resources/src/index.ts`

  `removeContexts` / `removeCollaboratorDoc` / `OnCollaboratorRemoved`, which deleted `DocNotifyContext` when a collaborator was removed, are gone. The same-named `OnCollaboratorRemoved` in `chunter-resources/src/index.ts:389` handles something else (`Chat` entries). No replacement found — verify that contexts of removed collaborators are cleaned up somewhere.

  **Response**: Added `DocNotifyContext` cleanup on `Collaborator` removal in `services/notifications`.

- [x] **`jumpToDate` always resets the viewport** — `plugins/chunter-resources/src/chatViewport.ts:341-388`

  Always does `resetViewport()` plus full re-init, even when the date is already inside the loaded window (`jumpToMessageId` has a fast path). Clicking a visible date separator flashes the loading overlay.

  **Response**: Added fast path check to skip viewport reset if target message is already loaded.

---

## LOW

- [x] `server-plugins/notification/src/index.ts:118` — `PushNotificationsHandler` still declared in the trigger map; implementation (`push.ts`) and model registration are deleted. Dead key, not a crash. (Surfaced independently by two agents.)
- [x] `models/notification/src/migrations/clear.ts:57-92` — `removeEmptyContexts` deletes contexts with no notifications; if an empty context is valid (pinned chat with no messages), it gets wiped.
  **Response**: Document settings `settings.mode` are migrated to `DocNotificationSetting` in `DOMAIN_PREFERENCE` via dedicated migration `migrate-doc-notify-context-settings-v1` prior to removing empty contexts.
- [-] `services/notifications/src/cache.ts:324` — `getContext` falls through to `findOne` on a miss without populating the cache, unlike its sibling `getX()` methods.
- [x] `plugins/notification-resources/src/components/inbox/Inbox.svelte:145-161` — `selectedContext` is taken only from the paginated page (limit 20); a deep link to a context outside the first page never opens the panel.
- [x] `plugins/notification-resources/src/client.ts:80-94` — `init()` does not clear `contextByDoc` / `contextById` / `readStateByDoc` / `docSettingByDoc` on workspace switch within one tab.
- [-] `plugins/notification-resources/src/webpush.ts` — no unsubscribe on logout.
  **Response**: Not for this task
- [x] `plugins/chunter/src/index.ts:263`, `plugins/chunter-resources/src/plugin.ts:46` — Resource types `ShowNotifyMarkerFn` and `GetUnreadThreadsCount` diverge from their implementations (signature and `Promise`). Not broken today, but would hide a real mismatch once a second caller appears.
- [-] `services/notifications/src/utils/context.ts:100` — docstring promises dedup by account; `getCreateContextTx` does not do it.
  **Response**: Deduplication is handled by general application logic and a unique database index.

---

## Security — needs a decision

- [ ] **VAPID private key committed** — `dev/.env:10`

  `PUSH_PRIVATE_KEY=HAW3qzZ5GebLYb-VDy6RCz-XlZBvrmBIH7Av2Ro5wzk` is present in the branch history (the working tree has already reverted it locally, but merging carries it into repo history). The public key is in `dev/prod/public/config.json:37`.

  Confirm the pair is unused on any real environment; otherwise rotate before merge.

---

## Rejected after verification

- **Mongo adapter `isOperator` vs `hasOperator`** — the adapter is not wired in. `server-pipeline` never references it; the only live use is a raw `MongoClient` in `pod-telegram/src/storage.ts`, not a `DbAdapter`. Dead code.
- `plugins/notification/src/serviceWorker.ts:29` — `event.data.json()` without try/catch is identical in develop. Not a regression; `waitUntil` was in fact added (an improvement).
- `plugins/chunter-resources/src/scroll.ts:34,36-37` — module-level `chatReadMessagesStore` / `toRead` / `toReadTimer` are pre-existing (develop: `utils.ts:320,326-327`), merely relocated. Reported as a CRIT regression in error.

Verified clean: `collapse.ts` slice boundaries, cache LRU eviction, `operator.ts` `$push`/`$pull`, `query/index.ts`, `sound.ts`, `classIcon`, `server/account` (no privilege bypass), i18n keys (no drift), package.json (no drift), deleted Svelte components (no dangling Resource ids), `push.ts` relocation to `services/notifications`, desktop click-routing moved server-side, removal of `server.ts` / `EXPOSE 8089` in pod-notification.

---

## Suggested order

1. #1 Telegram disabled
2. #2 Migration data loss
3. #4 / #5 Mention does not unhide chat
4. #7 One-line comparator typo
5. Everything else
