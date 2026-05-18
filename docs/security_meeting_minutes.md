# MeetingMinutes Security + Invite/Knock — итоговая сводка PR

Единый документ по ветке `secured-meeting-minutes` относительно `origin/develop`. Содержит: что изменилось, какие тесты это проверяют (автоматика), и сценарии для ручной проверки QA.

## Содержание

1. [Изменения относительно origin/develop](#1-изменения-относительно-origindevelop)
2. [Invite / Knock — целевая модель](#2-invite--knock--целевая-модель)
3. [Серверный trigger `OnUserMeetingInvite`](#3-серверный-trigger-onusermeetinginvite)
4. [Клиентская сторона](#4-клиентская-сторона)
5. [LiveKit-driven lifecycle](#5-livekit-driven-lifecycle)
6. [Автоматические тесты — что и где](#6-автоматические-тесты--что-и-где)
7. [QA-сценарии для ручной проверки](#7-qa-сценарии-для-ручной-проверки)
8. [Запуск тестов и сборка](#8-запуск-тестов-и-сборка)

---

## 1. Изменения относительно origin/develop

### 1.1. `MeetingMinutes` теперь `Space`

- `plugins/love/src/types.ts`: интерфейс наследуется от `Space`, добавлено `roomId?: Ref<Room>` (замена `attachedTo`). Поля `name`, `description`, `private`, `archived`, `members`, `owners` — от `Space`. `title` оставлен для обратной совместимости.
- `models/love/src/index.ts`: `TMeetingMinutes extends TSpace`, домен — `DOMAIN_SPACE`.
- `models/love/src/migration.ts`: миграция `meeting-minutes-to-space`. Читает пачками, трансформирует (`title → name`, `attachedTo → roomId`), пишет в `DOMAIN_SPACE`, обновляет `space` у `PendingRecording` / `ActivityMessage` / `Attachment`, чистит источник.

### 1.2. Удалено `MeetingInfo`

Класс и методы (`createMeetingInfo` / `removeMeetingInfo` / `updateMeetingInfoPersons`) удалены. Активные митинги определяются через `ParticipantInfo`. Триггер `OnMeetingMinutes` в `server-plugins/love-resources` удалён.

### 1.3. Удалён `RoomAccess` enum

`RoomAccess.Open/Knock/DND` целиком выпилен из модели, моделей миграций и UI. Knock переехал на флаг `room?` у `UserMeetingInvite` (см. раздел 2). DND-иконки в UI оставлены, но без логики.

### 1.4. Busy-статус

`busyPersons` store сравнивает `ParticipantInfo` с доступными `MeetingMinutes`. Если участник в митинге, к которому у текущего пользователя нет доступа — он рендерится с плашкой `Busy` без раскрытия деталей.

### 1.5. SpaceSecurityMiddleware: жёсткая проверка `owners`

`spaceSecurity.ts` обрабатывает транзакции по таблице:

| Действие | Условие | Результат |
|---|---|---|
| Создать приватный space с `owners: [я]` | — | OK |
| Создать приватный space с `owners: [другой]` | — | `Only owners can create private spaces` |
| Создать приватный space с `owners: []` | — | отказ |
| Создать публичный space | — | OK (намеренно) |
| Сменить `private` | я не в `owners` | `Only owners can change space privacy` |
| Сменить `private` | я в `owners` | OK |
| Сменить `owners` (set/$push/$pull) | я не в `owners` | `Only owners can change space owners` |
| Сменить `members` приватного space | я не в `owners` | `Only owners can change members of private spaces` |
| `$pull: { members: я }` (self-leave) | я в `members` приватного space, не owner | OK |
| `$pull: { members: { $in: [я] } }` (self-leave одиночный) | я в `members`, не owner | OK |
| `$pull: { members: { $in: [я, X] } }` (self + другие) | я не в `owners` | `Only owners can change members of private spaces` |
| `$push: { members: я }` в `autoJoin` приватный space | я не в `owners` | OK (workspace join, chat unhide и т.п.) |
| Любые изменения space с `owners.size === 0` | — | OK (legacy) |

Системный аккаунт и `AccountRole.Owner` — обход проверок.

Фильтрация `findAll` теперь в БД-адаптере (PostgreSQL) по аккаунту из сессии. `searchFulltext` получает явный список разрешённых space.

### 1.6. Invite/Knock протокол — переписан с нуля

См. раздел [Invite / Knock — целевая модель](#2-invite--knock--целевая-модель). Кратко:

- `UserMeetingInvite` переехал в `DOMAIN_TRANSIENT` с `TransientTTL = 30s` (safety net).
- Удалены поля `isKnock`, `declineReason`, `expiresAt`. Остались `kind`, `from`, `to`, `meeting?`, `room?`, `status`, `acceptedSessionId?`.
- **Митинг создаёт клиент-caller** в A2 (никакой `lazyCreateMeetingForInvite` на сервере). Recipient ждёт через live-query `MeetingMinutes { members: {$all:[me, from]} }`.
- **Knock** в private митинг — клиент шлёт `invite-request { room: roomId }`, сервер делает fanout invite-response каждому owner. Первый accept удаляет sibling responses.
- **Heartbeat 15s** от sender (универсальный, не только для knock) ресетит TTL — trigger проксирует update в invite-response.
- Cleanup делает клиент при наблюдении accept/decline; TTL = safety net.
- Notification `CommonInboxNotification(InvitingYou)` остаётся persistent (missed-call indicator, как в origin).

### 1.7. LiveKit-driven cleanup ParticipantInfo

Клиент **никогда** не удаляет `ParticipantInfo` напрямую. При leave клиент делает только `liveKitClient.disconnect()`; LiveKit шлёт `participant_left` webhook → `services/love/src/webhook.ts` чистит PI на сервере. Когда office owner выходит из своей office-комнаты — сервер дополнительно делает `RoomServiceClient.deleteRoom`, что отключает остальных участников через cascade webhook (см. раздел 5).

`removeParticipantFromLiveKit` чистит все PI этой person в meeting + все PI с этим sessionId (без узкого фильтра, чтобы не оставалось stale).

### 1.8. Account / Person надёжность

- `ensurePerson` атомарен на уровне PostgreSQL (`ON CONFLICT DO NOTHING` + откат orphan-person). Mongo как backend для AccountDB больше не поддерживается.
- `ensureEmployeeForPerson` — retry до 3 раз при гонке `TxApplyIf`, флаг `createEmployee: false`, `roleOverride`.
- `OnEmployeeCreate` сериализует создание `PersonSpace` через `control.withScope('person-space-${account}', …)` + повторная проверка `findAll` перед `createDoc` → нет дублей `PersonSpace` при параллельной регистрации.

### 1.9. HTTP-ошибки RPC

`pods/server/src/rpc.ts`: `PlatformError` маппится в коды (`BadRequest → 400`, `Unauthorized → 401`, `Forbidden → 403`, `NotFound → 404`, прочее → 500). 403 теперь возвращается там, где раньше было 500.

---

## 2. Invite / Knock — целевая модель

### 2.1. Модель данных `UserMeetingInvite`

Домен `DOMAIN_TRANSIENT` + mixin `TransientTTL { ttl: 30 }` (секунд).

| Поле | Тип | Назначение |
|------|-----|------------|
| `kind` | `'invite-request' \| 'invite-response'` | `invite-request` — в `PersonSpace(from)`. `invite-response` — в `PersonSpace(to)` (для Б — в `PersonSpace(owner)`), создаётся серверным триггером |
| `from` | `Ref<Person>` | Отправитель приглашения |
| `to` | `Ref<Person>` | Получатель. Для A — целевой пользователь. Для Б — заполняется триггером (owner митинга) |
| `meeting?` | `Ref<MeetingMinutes>` | Митинг уже существует (A1, Б после accept) |
| `room?` | `Ref<Room>` | Только для Б — комната, в которую стучимся (sender знает только room, не meeting) |
| `status` | `'pending' \| 'accepted' \| 'declined'` | Состояние. Sync request ↔ response через trigger |
| `acceptedSessionId?` | `string` | sessionId tab-а recipient-а, нажавшего accept. Multi-tab guard в auto-join |

### 2.2. Heartbeat и TTL

- **TransientTTL = 30s.** На любую CUD-операцию по документу TTL сбрасывается на сервере (`foundations/server/packages/middleware/src/transient.ts`). При истечении middleware делает `TxRemoveDoc` + broadcast.
- **Heartbeat 15s** от sender. Клиент делает no-op `TxUpdateDoc invite-request` (`{ modifiedOn: Date.now() }`). Server-trigger ловит и проксирует TxUpdateDoc в invite-response → TTL обоих ресетится. Окно — половина TTL, один пропущенный tick переживается.
- **Закрыли окно / refresh** → heartbeat останавливается → 30s, оба документа умирают.

**TTL — safety net.** Основной cleanup делает клиент при наблюдении accept/decline.

### 2.3. Сценарии

#### A1. user1 зовёт user2, митинг уже существует

1. **user1 client** заранее `$push user2 → meeting.members` (если owner или meeting не private). Затем `createDoc invite-request { from:user1, to:user2, meeting:value, status:'pending' }` в `PersonSpace(user1)`.
2. **Server trigger** на `TxCreateDoc invite-request` → `createDoc invite-response { ...same fields }` в `PersonSpace(user2)` + `createDoc CommonInboxNotification(InvitingYou)` (persistent missed-call).
3. **user2 client** Accept → `updateDoc invite-response { status:'accepted', acceptedSessionId: mySid }`.
4. **Server trigger** на `TxUpdateDoc invite-response`: `removeDoc invite-response` + sync `invite-request { status:'accepted', acceptedSessionId }`.
5. **user1 client** видит `request.status=accepted` → ничего не создаёт (уже в митинге) → `removeDoc invite-request`.
6. **user2 client** с `acceptedSessionId === mySid` → `connectToMeeting(value)`. Другие tab-ы — не подключаются.

#### A2. user1 зовёт user2, митинга нет

1. **user1 client** `createDoc invite-request { from:user1, to:user2, meeting:undefined, status:'pending' }`.
2. **Server trigger** → `createDoc invite-response { ...same }` + notification.
3. **user2 client** Accept → `updateDoc invite-response { status:'accepted', acceptedSessionId: mySid }`.
4. **Server trigger** → `removeDoc invite-response` + sync `invite-request { status:'accepted', acceptedSessionId }`.
5. **user1 client** видит status=accepted → **сам** `createDoc MeetingMinutes` в своём офисе с `members:[user1, user2]`, `owners:[user1]`. `connectToMeeting`. `removeDoc invite-request`.
6. **user2 client** ведёт live-query `MeetingMinutes { status, roomId: <office of from>, members: {$all:[me, from]} }`. Как только видит → `connectToMeeting` (только в tab с `acceptedSessionId === mySid`).

**Tie-breaker:** создаёт meeting только caller. Recipient ждёт. Никакой race за `createDoc MeetingMinutes`.

#### Б. user1 стучится в private митинг (knock)

User1 видит room-cell заблокирована private митингом. Жмёт "Knock".

1. **user1 client**: `createDoc invite-request { from:user1, to:user1, room:roomId, meeting:undefined, status:'pending' }` в `PersonSpace(user1)`. Поле `to` для Б — заглушка.
2. **Server trigger** на `TxCreateDoc invite-request` с `room !== undefined`:
   - Найти `MeetingMinutes { roomId, status: {$in:[Active,Pending]}, private:true }` → meeting M.
   - Для каждого `owner ∈ M.owners` (fallback на M.members если owners пуст) → `createDoc invite-response { from:user1, to:owner, room, meeting:M._id, status:'pending' }` в `PersonSpace(owner)` + notification.
3. **Любой owner client** Accept → `updateDoc invite-response { status:'accepted', acceptedSessionId }`.
4. **Server trigger** на `TxUpdateDoc invite-response { status:'accepted' }` для knock (определяется по `sourceDoc.room !== undefined`):
   - Auth-check: actor ∈ M.owners (fallback members).
   - `$push user1 → M.members`.
   - `removeDoc invite-response` (этого owner-а).
   - Удалить все остальные invite-response для того же request (disambiguator `from + room + meeting`).
   - sync `invite-request { status:'accepted', meeting:M._id }`.
5. **user1 client** видит request.status=accepted + meeting set → `connectToMeeting(M)`. `removeDoc invite-request`.
6. **Decline path:**
   - Один owner decline → trigger удаляет только этот response. Остальные owners ещё могут впустить.
   - Все owners declined → trigger sync `invite-request { status:'declined' }`. Knocker toast → `removeDoc invite-request`.
   - Никто не ответил → TTL (knocker закрыл окно или 30s without heartbeat) → всё исчезнет.

### 2.4. Правила-инварианты

- **Cancel (sender)**: `removeDoc invite-request`. Server-trigger на `TxRemoveDoc invite-request` → `removeDoc` все связанные invite-response.
- **Decline (A)**: recipient → `updateDoc invite-response {status:'declined'}` → trigger `removeDoc invite-response` + sync `request.status=declined`. Sender видит declined → toast → `removeDoc invite-request`.
- **Decline (Б)**: после последнего decline → trigger sync `request.status=declined` → toast knocker-у → `removeDoc invite-request`.
- **Accept**: trigger удаляет invite-response сразу + sync `request.status=accepted` (+ meeting в A2/Б). Auto-join → `removeDoc invite-request`.
- **Только caller создаёт meeting** в A2 (tie-breaker).
- **`acceptedSessionId`** обязателен для multi-tab guard в auto-join.
- **Persistent missed-call notification** не удаляется на cancel/expire/decline.
- **Multi-owner knock fanout**: один invite-request → N invite-response. После accept одним — остальные удаляются триггером.

---

## 3. Серверный trigger `OnUserMeetingInvite`

Файл: `server-plugins/love-resources/src/index.ts`.

Ветки:
- `TxCreateDoc invite-request` с `room !== undefined` — Б flow (fanout).
- `TxCreateDoc invite-request` без `room` — A flow (single invite-response).
- `TxRemoveDoc invite-request` — cancel: удалить все связанные invite-response.
- `TxUpdateDoc invite-request` — heartbeat-proxy: для каждого invite-response делаем no-op TxUpdateDoc → TTL touch.
- `TxUpdateDoc invite-response { status: accepted/declined }`:
  - Б knock + accepted: auth-check owner, `$push members`, удалить siblings, sync request `accepted + meeting`.
  - Б knock + declined: удалить только этот response, если остальных нет — sync request `declined`.
  - A: удалить response, sync request `status + acceptedSessionId`.

Trigger не создаёт `MeetingMinutes` (это делает caller-client в A2) и не пушит members при A invite (caller-client делает `$push` сам перед `createDoc invite-request`).

---

## 4. Клиентская сторона

### 4.1. `plugins/love-resources/src/invites.ts`

- Universal heartbeat 15s для всех pending invite-request, отправленных мной.
- Stores с `me`-фильтрами (фикс stale-trigger у нового пользователя):
  - `outgoingInvitesStore`: `kind === 'invite-request' && from === me`.
  - `incomingInvitesStore`: `kind === 'invite-response' && to === me && room === undefined && status === 'pending'`.
  - `knockingInvitesStore`: `kind === 'invite-response' && to === me && room !== undefined && status === 'pending'`.
- `checkAndJoinIfRecipientJoined` (sender watcher):
  - A1 accepted: `removeDoc invite-request` (уже в митинге).
  - A2 accepted + meeting=undefined: `createMeeting` в своём офисе → `$push recipient as member` → connect → `removeDoc invite-request`.
  - Б accepted + meeting set: connect → `removeDoc invite-request`.
  - declined: toast + `removeDoc invite-request`.
- `checkAndJoinIfRecipientAccepted` (recipient watcher):
  - A1: live-query на MeetingMinutes из request → connect (в правильном tab).
  - A2: live-query на MeetingMinutes (members ⊇ [me, from], roomId = office_of_from) → connect.

### 4.2. `plugins/love-resources/src/meetings.ts`

- `leaveMeeting` — только `liveKitClient.disconnect()`. Не удаляет PI напрямую (см. раздел 5).
- `connectToMeeting` упрощён, нет `cleanupPendingInvites`.

### 4.3. UI компоненты

- `OutgoingInvitePopup.svelte`, `IncomingInvitePopup.svelte` — без `expiresAt` countdown.
- `InviteButton.svelte` — без auto-expire по `$ticker1`. Лейблы: outgoing `YouInvite` ("You are inviting to join") или `KnockingTo` ("Knocking to ..."), incoming `KnockingLabel` ("Knocking").
- `KnockingList.svelte` — рендерит pending invite-response с `room !== undefined` в widget-е owner-а.
- `AwaitingMeetingPopup.svelte` — A2 recipient после accept видит "Waiting for ..." пока caller создаёт митинг.
- `EditRoom.svelte` — Knock button: `createDoc invite-request { from:me, to:me, room: object._id }`.

---

## 5. LiveKit-driven lifecycle

**Принцип:** клиент не трогает `ParticipantInfo`. Все cleanup — через LiveKit webhooks.

### 5.1. Leave / disconnect

- Клиент: `liveKitClient.disconnect()`.
- LiveKit: посылает `participant_left` webhook.
- `services/love/src/webhook.ts → handleParticipantLeft`:
  - `removeParticipantFromLiveKit(meeting, person, sid)` — чистит все PI этой person в meeting + все PI с этим sid.
  - billing-запись о сессии.
  - Если ушедший = office owner текущей комнаты → `RoomServiceClient.deleteRoom(lkRoomName)` → LiveKit рассылает `participant_disconnected` всем остальным → их webhook `participant_left` отрабатывает аналогично → каскад cleanup.

### 5.2. Join

- `participant_joined` webhook → `WorkspaceClient.upsertParticipantFromLiveKit`.
- В рамках одной meeting + sid: либо находим существующий PI и обновляем, либо создаём новый.
- Stale-cleanup на upsert удалён (был хак) — теперь корректный `participant_left` гарантирует отсутствие stale.

### 5.3. Room finished

- LiveKit `room_finished` (после 3s departure timeout) → `services/love/src/main.ts` ставит MeetingMinutes `Finished`.

---

## 6. Автоматические тесты — что и где

### 6.1. Unit (`server-plugins/love-resources/src/__tests__/`)

| Файл | Что проверяет |
|------|---------------|
| `userMeetingInvite.knock.test.ts` | Б-flow fanout по owner-ам, accept одним удаляет siblings, decline всеми → request.status=declined, auth-check actor ∈ owners |
| `userMeetingInvite.heartbeat.test.ts` | TxUpdateDoc invite-request → TxUpdateDoc invite-response (TTL touch). Нет responses — нет touch |
| `userMeetingInvite.concurrent.test.ts` | Cancel одного request не задевает другие in-flight responses для same pair |
| `onEventUpdate.test.ts` | Связь Event ↔ MeetingMinutes через `MeetingEventLink` (сдвиг даты, добавление участника) |

Запуск: `cd server-plugins/love-resources && npx jest`. Все 15 PASS.

### 6.2. Integration api-tests (`ws-tests/api-tests/src/__tests__/`)

| Файл | Что проверяет |
|------|---------------|
| `love-invite-flow.test.ts` | A2 client-create end-to-end через WS+REST. Caller создаёт request → server создаёт response в PersonSpace recipient → recipient accept → server sync → recipient remove → liveQuery видит remove |
| `love-invite-flow.benchmark.test.ts` | 200 итераций × parallel=20 без потерянных tx и race (с `BENCH_INVITE_FLOW=1`) |

Запуск: `cd ws-tests/api-tests && rushx api-test --testPathPattern=love-invite-flow`.

### 6.3. Sanity Playwright (`tests/sanity/tests/love/`)

Все тесты собраны в один последовательный suite `meetings.all.spec.ts` (импортирует `registerXxxTests()` из соседних `*.tests.ts`). 41 тест, 1 worker.

| Файл | Покрытие |
|------|---------|
| `meetings.tests.ts` | Навигация по этажу, открытие office panel / room aside (раздел 1.1) |
| `meetings.access.tests.ts` | Видимость этажа для non-owner ролей (раздел 1.5) |
| `meetings.migration.tests.ts` | Миграция `DOMAIN_MEETING_MINUTES → DOMAIN_SPACE` (раздел 1.1) |
| `meetings.start.tests.ts` | Создание митинга, real-time broadcast, owner-toggle privacy |
| `meetings.session.tests.ts` | Lifecycle, re-entry, room hop |
| `meetings.connect.tests.ts` | LiveKit-коннект, базовый invite-flow A1, join via link |
| `meetings.client-create.tests.ts` | A2 — caller-client создаёт митинг в своём офисе после accept |
| `meetings.invite.tests.ts` | Reject, симметричные invite, self-invite filter в picker, UI labels |
| `meetings.invite-ui.tests.ts` | Лейблы/попапы для A1/A2: "You are inviting", "Knocking", "asking you to join", "Waiting for ..." + Cancel/Decline пути |
| `meetings.scenarios.tests.ts` | Privacy toggle + Busy badge, non-owner-of-private cannot invite, multi-invite + cancel, partial leave, knock-to-join |
| `meetings.knock-office.tests.ts` | Knock в персональный office: invite с room → owner accept → $push members → auto-join |
| `meetings.privacy.tests.ts` | UI: non-owner не видит privacy toggle |
| `meetings.workspace-owner.tests.ts` | Workspace owner может self-join в private митинг другого |
| `meetings.bidirectional-loop.tests.ts` | Forward + reverse call. Office owner leaves → recipient автоматически disconnect через cascade (раздел 5.1) |
| `meetings.guest.tests.ts` | Guest join через shared link |

Запуск: `cd tests/sanity && rushx uitest tests/love/meetings.all.spec.ts --reporter=list --retries=0 --workers=1`. Все 40 PASS, 1 skipped.

---

## 7. QA-сценарии для ручной проверки

Эти сценарии не покрыты автоматикой полностью или требуют визуальной/перцептивной проверки.

### 7.1. Базовая навигация и видимость

1. Открыть workspace, перейти в Office. Этаж должен загрузиться, видны все комнаты + персональные офисы.
2. Кликнуть на свой office → правый aside-panel с Meeting minutes section. Кликнуть на чужой office → видно панель без secret полей.
3. Кликнуть на свободную регулярную комнату (Meeting Room 1) → правый aside-panel с кнопкой "Connect".

### 7.2. Сценарий A1 — invite внутри митинга

1. Пользователь A заходит в Meeting Room 1, жмёт Connect → подключился к LiveKit (видно meeting-widget).
2. A жмёт Invite, ищет B, отправляет.
3. На триггере у A: лейбл "You are inviting" + аватар B.
4. У B появляется триггер с лейблом "Knocking" + аватар A.
5. B кликает триггер → popup "{A name} is asking you to join" + Join/Reject.
6. B жмёт Join → подключился к тому же митингу. Триггеры у обоих исчезают.
7. **Cancel path:** повторить шаги 1-3, A кликает свой outgoing trigger → popup с Cancel → жмёт Cancel → у B исчезает incoming.
8. **Reject path:** повторить шаги 1-4, B кликает Reject в popup → у A toast "{B name} declined", у обоих триггеры исчезают.

### 7.3. Сценарий A2 — invite без активного митинга (lazy by client)

1. A и B оба online, никто не в митинге.
2. A кликает на аватар B в его office cell → PersonActionPopup → "Invite to call".
3. У A появляется outgoing trigger.
4. У B incoming trigger → popup "{A name} is asking you to join" → Join.
5. У B мелькает "Waiting for {A name}" → A автоматически создаёт MeetingMinutes в своём офисе → оба auto-join через liveQuery.
6. Оба видят meeting-widget. Триггеры исчезли.

### 7.4. Сценарий Б — knock в private митинг

1. A в своём офисе. Сделать офис private (toggle "Close room" в MeetingMinutes panel).
2. С другого аккаунта B → этаж → A office cell отображает Busy badge (имя митинга скрыто).
3. B кликает на cell → видит кнопку "Knock" (не Connect).
4. B жмёт Knock → outgoing trigger у B: "Knocking to {A name}".
5. У A в meeting-widget появляется KnockingList с строкой "{B name} is knocking..." + Admit/Decline.
6. A жмёт Admit → B автоматически подключается. Триггер у B исчезает.
7. **Decline:** повторить 1-5, A жмёт Decline → у B toast "Your knock was declined", триггер исчезает.

### 7.5. Multi-owner knock fanout

1. Создать private митинг с двумя owner-ами (A приглашает B и `$push owners B`).
2. C жмёт Knock на эту комнату.
3. Каждый из A и B видит entry в KnockingList.
4. A принимает → C auto-join. У B запись исчезает (sibling cleanup).

### 7.6. Multi-tab guard

1. B залогинен в двух tabs (одинаковый аккаунт).
2. A зовёт B (A2 flow).
3. В tab #1 у B жмёт Join. Tab #2 видит accepted статус, но **не** подключается автоматически (acceptedSessionId guard).
4. Только tab #1 в митинге.

### 7.7. Office owner leave → cascade disconnect

1. A в своём office, начинает митинг.
2. A приглашает B, B джойнится. Оба в митинге.
3. A жмёт Leave.
4. **Ожидание:** через ~3-5s B автоматически disconnect (cascade от LiveKit deleteRoom).

### 7.8. Heartbeat и TTL safety net

1. A зовёт B (A1 или A2), B видит incoming trigger.
2. A **жёстко закрывает вкладку** (не Leave, не Cancel — Cmd+W).
3. **Ожидание:** через ~30s триггер у B пропадает сам (TransientTTL отработал, heartbeat прекратился).

### 7.9. Privacy + Busy badge

1. A в private митинге в Meeting Room 1.
2. B на этаже видит Meeting Room 1 с Busy badge, имя митинга **не** отображается.
3. A toggle "Open room" → у B Busy badge исчезает, имя митинга появляется.

### 7.10. Миграция backup (нагрузочно)

1. Развернуть workspace из старого backup-а (где `MeetingMinutes` в `DOMAIN_MEETING_MINUTES`).
2. Дождаться завершения миграции.
3. Проверить: открываются записи митингов, ActivityMessage / Attachment видны в правильном space, transcription не сломалась.

### 7.11. Guest join

1. Хост создаёт shared link для митинга.
2. Гость открывает link в incognito → форма гостя → "Join meeting" → видит meeting-widget без Abort handler в консоли.

### 7.12. RPC HTTP-коды

Запросом к REST с разными токенами проверить:
- Без токена → 401.
- Невалидный токен → 401.
- Запрос недоступного workspace / митинга → 403 (раньше было 500).
- Запрос несуществующего документа → 404.

### 7.13. ensurePerson под параллельной нагрузкой

Скрипт регистрирует одного guest-а N раз параллельно — должен быть единственный Person, без orphan-ов.

### 7.14. UI шум (визуально)

- В консоли браузера во время прохождения сценариев не должно быть необработанных pageerror.
- Аватарка в `InviteButton` (Стучится / You are inviting) — центрирована по вертикали относительно текста.

---

## 8. Запуск тестов и сборка

### Перед прогоном sanity (после изменений кода)

```bash
rush fast-build:docker
cd tests && ./prepare-pg.sh
```

### Unit (server-plugins/love-resources)

```bash
cd server-plugins/love-resources
npx jest
```

### Integration api-tests

```bash
cd ws-tests/api-tests
rushx api-test --testPathPattern=love-invite-flow
```

### Benchmark (опционально)

```bash
BENCH_INVITE_FLOW=1 BENCH_INVITE_ITERATIONS=200 BENCH_INVITE_PARALLEL=20 \
  rushx api-test --testPathPattern=love-invite-flow.benchmark
```

### Sanity full suite

```bash
cd tests/sanity
rushx uitest tests/love/meetings.all.spec.ts \
  --reporter=list --retries=0 --workers=1
```

LiveKit на Mac поднимается локально через `dev/run_livekit.sh` (Docker host network на Mac не работает).
