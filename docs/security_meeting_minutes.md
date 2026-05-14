# MeetingMinutes Security Enhancement — финальная сводка

## Задача

Унаследовать `MeetingMinutes` от `Space` вместо `AttachedDoc`, чтобы доступ к митингу и его записям контролировался через механизм членства Space. Заодно — навести порядок в сценариях приглашений и в правах на изменение приватных пространств.

## Что сделано

### 1. Модель: `MeetingMinutes` теперь `Space`

- `plugins/love/src/types.ts`: интерфейс наследуется от `Space`, добавлено `roomId?: Ref<Room>` (замена `attachedTo`). Поля `name`, `description`, `private`, `archived`, `members`, `owners` — от `Space`. `title` оставлен для обратной совместимости.
- `models/love/src/index.ts`: `TMeetingMinutes extends TSpace`, домен — `DOMAIN_SPACE`.
- `models/love/src/migration.ts`: миграция `meeting-minutes-to-space`. Читает пачками, трансформирует (`title → name`, `attachedTo → roomId`), пишет в `DOMAIN_SPACE`, обновляет `space` у `PendingRecording`/`ActivityMessage`/`Attachment`, чистит источник.

### 2. Удалено `MeetingInfo`

Класс и методы (`createMeetingInfo` / `removeMeetingInfo` / `updateMeetingInfoPersons`) удалены. Активные митинги определяются через `ParticipantInfo`. Триггер `OnMeetingMinutes` в `server-plugins/love-resources` удалён.

### 3. Busy-статус

`busyPersons` store сравнивает `ParticipantInfo` с доступными `MeetingMinutes`. Если участник в митинге, к которому у текущего пользователя нет доступа — он рендерится с плашкой `Busy` без раскрытия деталей.

### 4. SpaceSecurityMiddleware: жёсткая проверка `owners`

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

### 5. Lazy-create митинга на сервере при первом accept

Главная архитектурная развязка: митинг **создаётся в офисе звонящего**, не получателя.

**Поток (сценарий `User1` звонит `User2`, никто пока не в митинге):**

1. Клиент `User1`: `sendInvites([User2])` → создаёт `UserMeetingInvite(kind: 'invite-request', meeting: undefined)` в своём `PersonSpace`. На клиенте никакой митинг не создаётся.
2. Серверный триггер `OnUserMeetingInvite` на `TxCreateDoc(invite-request)` — knock-detection, owner-check для приватных, создаёт `invite-response` в `PersonSpace(User2)`.
3. Получатель жмёт accept → `TxUpdateDoc(invite-response, { status: 'accepted' })`. Клиент **не** создаёт митинг.
4. Серверный триггер на `TxUpdateDoc(invite-response, status=accepted, meeting=undefined, isKnock=false)` — ветка lazy-create:
   - найти `Office` инициатора (`invite.from`);
   - если офиса нет → синхронизировать invite-request как `declined` с `declineReason: 'no-host-office'`, удалить invite-response, клиент звонящего показывает toast;
   - если есть — создать `MeetingMinutes` с `owners: [callerAccount]`, `members: [callerAccount, recipientAccount]`, `roomId = office._id`, статус `Pending`. Имя — `{Caller} <-> {Recipient}` (или fallback на `{office.name} <date>`);
   - запатчить invite-response с `meeting: M`, синхронизировать invite-request с `status: 'accepted', meeting: M`.
5. Клиент `User1` через liveQuery видит `invite-request.meeting` и auto-join через `joinOrCreateMeetingByInvite` (`checkAndJoinIfRecipientJoined`). Клиент `User2` через liveQuery видит `invite-response.meeting` и auto-join (`checkAndJoinIfRecipientAccepted`).
6. После join клиент-инициатор каждой стороны удаляет свой invite.

**Решённый воркараунд для middleware:** при create в `owners` временно кладутся оба `[caller, recipient]`, сразу за этим следует `TxUpdateDoc` который оставляет только `[caller]`. Это обходит `checkSpacePermissions` (recipient на момент создания должен быть в owners, иначе middleware блокирует), но финальное состояние — caller единственный owner.

### 6. Knock-flow для приватных митингов

Сценарии 5-7 из матрицы (стук в чужой приватный митинг / офис / переговорку):
- Клиент создаёт `invite-request(isKnock=true, meeting=M)`;
- Сервер находит owners митинга `M`, создаёт invite-response в `PersonSpace` каждого owner-а с `meeting=M, isKnock=true`;
- Любой owner принимает → сервер $push knocker-а в `members` митинга, syncает `status: 'accepted'` обратно в invite-request → клиент knocker-а auto-join;
- Любой owner отклоняет → invite-request синхронизируется в `declined`, knocker видит toast `KnockResolutionToast`.

TTL knock-invite — 10 минут, продлевается knock-heartbeat-ом каждые 60 сек со стороны клиента-knocker-а. Если вкладка закрылась — invite истекает естественно.

### 7. Invite-проверки в `OnUserMeetingInvite` для приватных

При invite в приватный митинг:

| Сценарий | Результат |
|---|---|
| Публичный митинг | OK |
| Приватный, отправитель в `owners` | OK; recipient добавляется в `members` |
| Приватный, отправитель не в `owners` | invite молча отбрасывается |
| Приватный, `owners` не задан (legacy) | отбрасывается (fail-closed) |
| Self-invite | отбрасывается |
| Отправитель без `personUuid` | отбрасывается для приватного |

### 8. Cleanup invites

- На `room_finished` webhook `services/love` → `cleanupInvitesForMeeting(meeting)` удаляет все `UserMeetingInvite` с этим `meeting`.
- На `participant_left` → `cleanupParticipantInfosForMeeting` чистит ParticipantInfo если митинг завершился.
- Stale ParticipantInfo от прошлых сессий чистятся при upsert текущей (`upsertParticipantFromLivekit`).

### 9. Account/Person надёжность

- `ensurePerson` атомарен на уровне PostgreSQL (`ON CONFLICT DO NOTHING` + откат orphan-person). Mongo как backend для AccountDB больше не поддерживается.
- `ensureEmployeeForPerson` — retry до 3 раз при гонке `TxApplyIf`, флаг `createEmployee: false`, `roleOverride`.
- `OnEmployeeCreate` сериализует создание `PersonSpace` через `control.withScope('person-space-${account}', …)` + повторная проверка `findAll` перед создаём → нет дублей `PersonSpace` при параллельной регистрации.

### 10. HTTP-ошибки RPC

`pods/server/src/rpc.ts`: `PlatformError` маппится в коды (`BadRequest → 400`, `Unauthorized → 401`, `Forbidden → 403`, `NotFound → 404`, прочее → 500). 403 теперь возвращается там где раньше было 500.

---

## Покрытие тестами

Все sanity-тесты собраны в один последовательный suite `tests/sanity/tests/love/meetings.all.spec.ts` (импортирует `registerXxxTests()` из соседних `*.tests.ts`-модулей). Запуск: `npx playwright test -c ./tests/playwright.config.ts tests/love/meetings.all.spec.ts --reporter=list --retries=0 --workers=1`.

### Базовые тесты

| Файл | Тесты | Что покрывает |
|---|---|---|
| `meetings.tests.ts` | navigate-to-office; office-floor-view-rooms-visible; click-office-opens-panel; click-regular-room-opens-popup | Базовая навигация по этажу/комнатам |
| `meetings.access.tests.ts` | user2 sees the floor; user3 sees floor; clicking a regular room opens its meeting panel | Видимость этажа для non-owner ролей (раздел 4 спеки) |
| `meetings.migration.tests.ts` | floor and rooms restored from backup; meeting minutes panel renders for restored office; legacy domain does not break | Миграция `DOMAIN_MEETING_MINUTES → DOMAIN_SPACE` (раздел 1) |

### Старт митинга, lifecycle, активность

| Файл | Тесты | Покрытие |
|---|---|---|
| `meetings.start.tests.ts` | user1 starts meeting via panel; user1 starts -> user2 sees broadcast; owner can toggle meeting privacy | Создание митинга, real-time broadcast, owner-toggle privacy (разделы 1, 3) |
| `meetings.session.tests.ts` | activity feed shows "Joined meeting"; re-entry: leave then start again; room hop: A → B | Lifecycle, переподключение, переключение комнат |
| `meetings.connect.tests.ts` | user2 starts meeting and connects to LiveKit; user2 invites user3 (knock popup, accept, join); user3 joins via meeting link — outgoing popup goes away (bug 2); user3 joins same room — both see widget | LiveKit-коннект, базовый invite-flow, авто-сворачивание outgoing popup при independent join |

### Lazy-create

| Файл | Тест | Покрытие |
|---|---|---|
| `meetings.lazy-create.tests.ts` | caller without active meeting → recipient accepts → meeting hosted in caller office | Раздел 5 целиком: server-side создание митинга в офисе звонящего, owner = caller, auto-join обеих сторон через liveQuery |

### Invite-варианты

| Файл | Тесты | Покрытие |
|---|---|---|
| `meetings.invite.tests.ts` | user3 rejects invite — neither side ends up in a meeting; symmetric invites: A invites B and B invites A — both triggers visible; self-invite: my own user not in picker (skipCurrentAccount); bug 3: invite cleaned up when sender leaves and meeting finishes | Реджект, симметричные invite, фильтрация self-invite в picker, cleanup invite при finishMeeting (разделы 8, 9) |
| `meetings.scenarios.tests.ts` | privacy toggle: closing room hides meeting name and shows Busy badge; non-owner of private meeting cannot invite; multi-invite + cancel; partial leave: meeting stays alive; knock-to-join: outsider invites private-meeting owner → owner accepts → outsider auto-joins | Раздел 3 (Busy-статус), раздел 7 (invite в приватный от non-owner), раздел 6 (knock-flow), partial-leave invariant |

### Knock в персональный офис

| Файл | Тест | Покрытие |
|---|---|---|
| `meetings.knock-office.tests.ts` | knocker auto-joins owner office after knock is accepted | Knock-flow для персональных офисов: invite с `isKnock=true` → owner accept → $push в members → auto-join (раздел 6, сценарий 6 из матрицы) |

### Приватность UI

| Файл | Тест | Покрытие |
|---|---|---|
| `meetings.privacy.tests.ts` | non-owner does not see privacy toggle on someone else office | UI-проверка прав (раздел 4) |

### Guest

| Файл | Тест | Покрытие |
|---|---|---|
| `meetings.guest.tests.ts` | guest joins via shared link: form → "Join meeting" → connected widget (no Abort handler) | Гостевой коннект через `/guestToken`, отсутствие Abort handler-а в консоли |

---

## Что НЕ покрыто автоматическими тестами (ручная QA)

- Миграция большого реального workspace c записями и transcription (тесты используют свежий backup).
- `ensurePerson` под нагрузкой / параллельные регистрации одного guest-а (нужен load-стенд).
- HTTP-коды RPC при `PlatformError` (нужен пинг через REST с разными токенами).
- `OnEventUpdate`: связь календарного Event с митингом через `MeetingEventLink` (сдвиг даты, добавление участника). Sanity не покрывает.
- Запуск account-сервиса с `ACCOUNT_DB_URL=mongodb://…` — должен падать с явной ошибкой.

---

## Файлы (изменения относительно `origin/develop`)

### Core

- `plugins/love/src/types.ts`
- `plugins/love/src/index.ts`
- `models/love/src/index.ts`
- `models/love/src/migration.ts`
- `models/love/package.json`

### Server triggers

- `server-plugins/love-resources/src/index.ts` (lazy-create, knock-flow, owner-check, invite cleanup)

### Services

- `services/love/src/workspaceClient.ts` (cleanupInvitesForMeeting, stale PI cleanup)
- `services/love/src/webhook.ts` (room_started/finished, participant join/leave)
- `services/love/src/main.ts` (access check на гостевой `/guestToken` endpoint)
- `services/love/src/polling.ts`
- `services/love/src/__tests__/*.test.ts`

### UI (love-resources plugin)

- `plugins/love-resources/src/invites.ts` (lazy-create auto-join обеих сторон, knock heartbeat, knock resolution toast)
- `plugins/love-resources/src/meetings.ts` (joinOrCreateMeetingByInvite с retry, cleanupPendingInvites при connect)
- `plugins/love-resources/src/liveKitClient.ts`
- `plugins/love-resources/src/stores.ts` (`busyPersons`)
- `plugins/love-resources/src/components/meeting/ControlExt.svelte`
- `plugins/love-resources/src/components/RoomPopup.svelte`
- `plugins/love-resources/src/components/RoomPreview.svelte` (Busy badge)
- `plugins/love-resources/src/components/meeting/invites/*.svelte` (Incoming/Outgoing/KnockingList/KnockResolutionToast)
- `plugins/love-resources/src/components/guest/*.svelte`

### Middleware

- `foundations/server/packages/middleware/src/spaceSecurity.ts` (owner-check, broadcast on members change)
- `foundations/server/packages/middleware/src/tests/spaceSecurity.perf.test.ts` (perf benchmark)

### RPC

- `pods/server/src/rpc.ts` (PlatformError → HTTP code mapping)
- `server/account-service/src/operations.ts` (`ensurePerson` атомарность, retry в `ensureEmployeeForPerson`)

### Тесты sanity

- `tests/sanity/tests/love/meetings.all.spec.ts` (агрегатор)
- `tests/sanity/tests/love/meetings.*.tests.ts` (по разделам)
- `tests/sanity/tests/love/meeting-helpers.ts` (waitForActiveMeetingsToFinish, closeMeetingContexts)
- `tests/sanity/tests/model/love/{office-page,meeting-minutes-page,index}.ts`

---

## Запуск

```bash
# Полный suite (sequential, 1 worker)
cd tests/sanity
npx playwright test -c ./tests/playwright.config.ts tests/love/meetings.all.spec.ts --reporter=list --retries=0 --workers=1
```

Перед запуском после изменений в коде:

```bash
rush fast-build:docker
cd tests && ./prepare-pg.sh
```

LiveKit поднимается локально на Mac через `dev/run_livekit.sh` (Docker host network на Mac не работает).
