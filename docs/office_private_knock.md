# Knock-to-join: private meeting outsider request

Сжатая выжимка состояния feature + текущая проблема.

## Цель

User2 (вне приватного митинга) шлёт invite User1 (owner приватного митинга). Сервер инвертирует семантику в **knock** (request to join), показывает owner-у в отдельной панели; owner жмёт **Впустить** → User2 добавляется в `members`, автоматически коннектится к LiveKit.

## Архитектура (что сделано)

### Модель

`plugins/love/src/types.ts` — `UserMeetingInvite.isKnock?: boolean`. `models/love/src/index.ts` — `TUserMeetingInvite` поле `isKnock` с `@Hidden`.

### Сервер: `server-plugins/love-resources/src/index.ts` (`OnUserMeetingInvite`)

При создании `invite-request`:

1. Резолвим `senderAccount` (Person → personUuid) и `recipientInfo` (`ParticipantInfo { person: invite.to }`).
2. Если recipient в активном **private** митинге, к которому sender **не member** → `isKnock = true`, `inviteMeeting = recipientMeeting`.
3. Иначе обычный flow (поддержка private с проверкой owner-а).
4. Создаём `invite-response` в `PersonSpace` получателя: `{ kind:'invite-response', from, to, meeting: inviteMeeting._id, isKnock, expiresAt = Date.now() + 10min }`.
5. Patch исходного `invite-request`: `{ meeting: inviteMeeting._id, isKnock: true, expiresAt }`.

При accept (`invite-response.status='accepted'` + `isKnock=true`):

1. `$push members: knocker` в `MeetingMinutes`.
2. `removeDoc invite-response` у owner-а.
3. Sync `invite-request` knocker-а: `{ status:'accepted', meeting }`.

`spaceSecurity.pushMembersHandle` → `brodcastEvent(ctx, [knocker], space._id)` — SecurityChange к knocker-у, его query на `MeetingMinutes` рефрешится.

### Клиент

- `plugins/love-resources/src/invites.ts`
  - `outgoingInvitesStore` derived → `checkAndJoinIfRecipientJoined` (зовётся на каждое изменение).
  - `incomingInvitesStore` фильтрует `isKnock !== true` (knock не шумит).
  - `knockingInvitesStore` — отдельный store с `isKnock === true && status==='pending' && expiresAt > now`.
  - `subscribeToIncomingInvites` — query на `{ space: mySpace }`, heartbeat-renew expiresAt knock-request каждые 60s.
  - `notifyOnKnockResolution` — тост только при `status='declined'` (через `lastKnockStatus` Map).
- `checkAndJoinIfRecipientJoined`:
  - status=accepted + meeting → `joinOrCreateMeetingByInvite(meeting)` → `connectToMeeting` → LiveKit token + connect.
  - retry 20×100ms на `client.findOne(MeetingMinutes)` пока SecurityChange не доедет.
- UI:
  - `KnockingList.svelte` — компактная панель ожидающих knock-ов (Avatar + имя + Впустить/Отклонить). Встроена в `MeetingWidget` (правый sidebar), `Room.svelte` (full-screen), `RoomPopup.svelte` (под списком участников).
  - `EditRoom.svelte` — для приватной комнаты которую я не вижу как митинг (`isLockedByPrivateMeeting`): кнопка `[Knock]` (data-id `meeting-knock`) → `sendInvites([knockTarget])` без meeting. После отправки — `[Cancel knock]` (`meeting-knock-pending`) с `cancelInvites`. `knockTarget` skip-аit aibot/agents.
  - `OutgoingInvitePopup.svelte` — реактивно через `$allInvites.find` отображает header `KnockingTo` / `YouInvite` по live-флагу isKnock.
  - `InviteButton.svelte` — для outgoing+isKnock: label `KnockingTo`, без `TimeLeft`.
  - `IncomingInvitePopup.svelte` — knock-сообщение через `IsKnocking`.

### Локализация

- `KnockAction` "Knock" / "Постучать"
- `KnockingTo` "Knocking to ..." / "Стучимся в ..."
- `IsKnocking` "{name} is knocking..." / "{name} стучится..."
- `CancelKnock` "Cancel knock" / "Отменить стук"
- `AdmitKnock` "Admit" / "Впустить"
- `DeclineKnock` "Decline" / "Отклонить"
- `KnockDeclined`, `MeetingDeclinedOrFinished`, `KnockingLabel`

### Tests

`tests/sanity/tests/love/meetings.scenarios.spec.ts` — knock-test (skipped на CI, см. ниже). Серверная sync ветка тестов нет (TODO).

## Текущая проблема

**User2 (knocker) НЕ авто-подключается** к митингу после того как owner жмёт "Впустить".

### Что подтверждено в логах

`docker logs dev-transactor-1`:

```
[OnUserMeetingInvite] knock accepted
  knocker:699ec3194f22072778a3166c
  owner:6a01f24a5aed9087c8038fa5
  meeting:6a01fc22b50b6df0bd9d19af
  inviteRequests:1
```

Сервер находит invite-request knocker-а (1 шт) и пушит `TxUpdateDoc { status:'accepted', meeting }`. `$push members: knocker` тоже идёт. `cleanupParticipantInfo`/`Activated meeting` отрабатывают. **dev-love-1** webhook на `participant_joined` knocker-а **отсутствует** — клиент knocker-а не вызвал `connectToMeeting`.

### MCP (Chrome DevTools)

После hard-reload knocker-а и accept owner-ом в console knocker-а **только один**:

```
[outgoingInvitesStore] recalc [array Array]
```

Логи `[checkAndJoinIfRecipientJoined] eval invite ...` и `auto-join meeting ...` **не появляются**.

### Гипотезы (для следующей сессии)

1. **Race subscribe**: `subscribeToIncomingInvites` подписан, но `subscribe` через `incomingInvitesQuery.query({ space: mySpace })` мог не подхватить update на чужой server-tx (server-tx идёт к space knocker-а, но как изменение invite-request — derived recalc должен быть).
2. **Derived not re-evaluated**: Svelte `derived` срабатывает только когда есть subscribers. `outgoingInvitesStore` подписан в `InvitesExt` (mounted globally в WorkbenchExtension), но может subscribe сработал ПОСЛЕ accept-tx.
3. **Tx не доехал**: server-tx update к knocker-у может фильтроваться broadcast layer. У knocker-а в его personSpace должна быть видна.
4. **status в массиве остался "pending"**: видим только один recalc, не два. Значит update tx не пришёл клиенту вообще.

### Что добавлено для диагностики

`invites.ts` console.log:
- `[outgoingInvitesStore] recalc <JSON>` — на каждый rederive.
- `[checkAndJoinIfRecipientJoined] eval invite <JSON>` — для каждого invite.
- `[checkAndJoinIfRecipientJoined] auto-join meeting <id>` — когда status=accepted+meeting.
- `[checkAndJoinIfRecipientJoined] already in meeting / declined`.

`server-plugins/love-resources/src/index.ts` — `ctx.info('[OnUserMeetingInvite] knock accepted', ...)` + warn `no PersonSpace for recipient`.

### Следующие шаги

1. Воспроизвести с hard-reload knocker-а после `rush dev` rebuild. Проверить **точное содержимое** массива в `[outgoingInvitesStore] recalc` — status=accepted или pending?
2. Если status=pending → tx update не дошёл / sync на сервере не работает / `inviteRequests` пуст несмотря на лог "knock accepted".
3. Если status=accepted но `eval invite` не выводится → derived recalc был, но цикл for не сработал (массив пустой?).
4. Если `auto-join meeting` есть, но коннекта нет → проблема в `joinOrCreateMeetingByInvite` (timeout retry, отсутствие meeting в store, getRoomToken 403).

## Связанные файлы

- `plugins/love/src/types.ts:252`
- `models/love/src/index.ts:329`
- `server-plugins/love-resources/src/index.ts:322` (`OnUserMeetingInvite`)
- `plugins/love-resources/src/invites.ts` (stores + cleanup)
- `plugins/love-resources/src/meetings.ts:115` (`joinMeeting`, `joinOrCreateMeetingByInvite`, `connectToMeeting`)
- `plugins/love-resources/src/components/meeting/invites/KnockingList.svelte`
- `plugins/love-resources/src/components/meeting/invites/InviteButton.svelte`
- `plugins/love-resources/src/components/meeting/invites/IncomingInvitePopup.svelte`
- `plugins/love-resources/src/components/meeting/invites/OutgoingInvitePopup.svelte`
- `plugins/love-resources/src/components/meeting/invites/KnockResolutionToast.svelte`
- `plugins/love-resources/src/components/EditRoom.svelte`
- `plugins/love-resources/src/components/RoomPopup.svelte`
- `plugins/love-resources/src/components/Room.svelte`
- `plugins/love-resources/src/components/meeting/widget/MeetingWidget.svelte`
- `services/love/src/workspaceClient.ts` (`finishMeeting` → `cleanupInvitesForMeeting`)

## Rebuild

UI правки → `rush dev` auto-picks. Server/services правки → `rush fast-build:docker && (cd tests && ./prepare-pg.sh)` для sanity-стенда; для dev-стенда `rush fast-build:docker-build` + `docker compose up -d --force-recreate <pod>`.
