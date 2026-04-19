# services/love tests

## Jest env setup

`services/love/src/__tests__/setup.ts` stubs env vars (`ACCOUNTS_URL`,
`LIVEKIT_*`, `SECRET`) because `src/config.ts` throws on missing env at
import time. Any test importing `utils`, `webhook`, or `billing`
transitively loads `config.ts`, so the setup file is wired via
`jest.config.js` `setupFiles`.

## parseRoomName format

LiveKit room names are `${workspaceUuid}_${meetingMinutesId}` (see
`services/love/src/utils.ts:getRoomName`). Both parts are
machine-generated and **never** contain `_`:
- `workspaceUuid` - UUID v4 (hex + `-`)
- `meetingMinutesId` - `Ref<MeetingMinutes>`, 24 hex chars from
  `generateId` (`timestamp + random + counter`, no separators)

So the single `_` in a room name is always the separator and there are
exactly two non-empty parts. `plugins/love/src/utils.ts:parseRoomName`
splits on the **first** `_`. Any input without `_`, with empty side,
or where separator is at index 0 / last char, returns `undefined`.

Callers: ai-bot controller/transcriptions (audio chunks, session
recordings), love polling service (reconcile LiveKit rooms with
MeetingMinutes), love main (webhook dispatch). Do NOT invent tests
with workspace or meetingId containing `_`/unicode/free-form text -
such inputs cannot be produced by `getRoomName`.

## webhook.test.ts gotchas

- `WebhookProcessor.handleJoinLeave` skips activity for agents via
  `participant.kind !== 0`. Mock LiveKit participants need `kind: 0`
  (regular user) or joined/left handlers are skipped.
- `WebhookProcessor.processEvent` swallows errors from
  `WorkspaceClient.create` and logs via `ctx.error` (never throws).
  Tests must assert `ctx.error` was called, not expect a rejection.
