# Виртуальный офис и встречи

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Виртуальный офис - этаж с комнатами (video/audio/reception), в которых люди видят друг друга как аватары на сетке и подключаются к звонку поверх self-hosted LiveKit. Сущности: `Room`/`Office` (слот на этаже), `MeetingMinutes` (сам звонок, это `Space` со своей security-моделью), `UserMeetingInvite` (invite/knock), `ParticipantInfo` (эфемерное присутствие в комнате), `PendingRecording` (запись через LiveKit Egress).

Подробное и уже сверенное с кодом описание модели, протоколов, security и дефектов - `../love.md`. Этот документ - карта "фича -> файл", не дублирует `love.md`, а указывает на его разделы и добавляет то, что появилось после его последнего обновления (2026-08-28..2026-09-23: телеметрия звонков, стабильность recording/webhook-очереди, lazy-load офисных данных, локализация дефолтных комнат).

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| `models/love` | `models/love/src` | Классы `Room`/`MeetingMinutes`/`UserMeetingInvite`/..., домены, миграции (`migration.ts`) |
| `plugins/love` | `plugins/love/src` | Типы (`types.ts`), утилиты сетки/времени (`utils.ts`), OpenTelemetry-трейсинг звонка (`tracing.ts`) |
| `plugins/love-resources` | `plugins/love-resources/src` | Клиент: сторы, `meetings.ts`, `invites.ts`, `liveKitClient.ts`, `loveClient.ts`, Svelte-UI |
| `plugins/love-assets` | `plugins/love-assets/lang` | Локализация (12 языков) |
| `server-plugins/love-resources` | `server-plugins/love-resources/src` | Серверные триггеры: `OnUserMeetingInvite`, `OnEventUpdate` |
| `services/love` | `services/love/src` | HTTP-сервис: `/getToken`, `/webhook`, гости, записи, polling, биллинг, лимиты |
| `models/recorder`, `plugins/recorder`, `plugins/recorder-resources`, `plugins/recorder-assets` | - | Экранный рекордер воркспейса (MediaRecorder API, аплоад в Drive) - **не** запись встречи |
| `models/media`, `plugins/media`, `plugins/media-resources`, `plugins/media-assets` | - | Выбор микрофона/камеры, `toggleMicState`/`toggleCamState`, `WorkbenchExtension` |
| `packages/audio-dsp` | `packages/audio-dsp/src` | FFT/STFT-стек и spectral-gating шумоподавление, используются love-agent |
| `services/ai-bot/love-agent` | `services/ai-bot/love-agent/src` | Серверный LiveKit-агент: realtime STT (VAD, транскрибация) |
| `services/ai-bot/pod-ai-bot` | `services/ai-bot/pod-ai-bot/src` | Pluggable STT-провайдеры, REST `/summarize` (AI-саммари встречи) |

## Модель данных

Полная схема - `../love.md#2-модель-данных`. Классы (`plugins/love/src/types.ts`):

| Класс/enum | Смысл | Файл |
| --- | --- | --- |
| `Room extends Doc` | Слот на этаже: `type` (Video/Audio/Reception), координаты, `startWithTranscription/Recording` | `plugins/love/src/types.ts` |
| `Office extends Room` | Комната с `person: Ref<Person>` - персональный офис | `plugins/love/src/types.ts` |
| `ParticipantInfo extends Doc` | Присутствие в комнате, домен `DOMAIN_TRANSIENT`, только в памяти транзактора | `plugins/love/src/types.ts` |
| `MeetingEventLink extends Event` | Связь календарного Event с комнатой/встречей | `plugins/love/src/types.ts` |
| `MeetingSchedule extends Schedule` | Миксин на booking-page календаря | `plugins/love/src/types.ts` |
| `DevicesPreference extends Preference` | Настройки устройств (микрофон, noise cancellation, blur, камера) | `plugins/love/src/types.ts` |
| `MeetingStatus` (enum) | `Active`/`Finished`/`Pending`/`Scheduled` | `plugins/love/src/types.ts` |
| `MeetingMinutes extends Space` | Сам звонок: security-модель Space + `roomId`, `summary`, `traceId`, счётчики | `plugins/love/src/types.ts` |
| `PendingRecording extends AttachedDoc` | Запись через LiveKit Egress, `egressId`/`format`/`status` | `plugins/love/src/types.ts` |
| `UserMeetingInvite extends Doc` | Invite/knock, домен `DOMAIN_TRANSIENT` + `TransientTTL(30s)` | `plugins/love/src/types.ts` |

## Как работает

Детальные протоколы (подключение, invite/knock, гости, запись) - `../love.md`, разделы 4-9. Здесь - сквозные цепочки для типовых сценариев.

1. **Подключение к митингу.** Клик по комнате -> `connectToMeeting()` в `plugins/love-resources/src/meetings.ts` -> `loveClient.getRoomToken()` (POST `/getToken`, `services/love/src/main.ts`, `decodeMeetingToken`) -> проверка `private`/`status` -> `listRooms`/`createRoom` в LiveKit -> `liveKitClient.connect()`. Строку `ParticipantInfo` создаёт не клиент, а сервер по вебхуку.
2. **Присутствие через webhook.** LiveKit `participant_joined` -> `/webhook` -> `LoveQueue` (партиции по workspace) -> `WebhookProcessor.handleJoinLeave` -> `upsertParticipantFromLiveKit` (`services/love/src/workspaceClient.ts`, ищет по `{person, meeting, sessionId}`, место считает `getFreeRoomPlace`, `plugins/love/src/utils.ts`).
3. **Invite (сценарий A1).** `sendInvites()` (`plugins/love-resources/src/invites.ts`) создаёт `invite-request` -> триггер `OnUserMeetingInvite` (`server-plugins/love-resources/src/index.ts`) создаёт `invite-response` у получателя -> accept -> `responseToInviteRequest()` (`invites.ts`) -> `connectToMeeting()`.
4. **Knock в приватную комнату.** `sendKnockRequest()` (`invites.ts`) -> триггер разворачивает на всех `owners` активного приватного `MeetingMinutes` -> accept любым owner -> `$push` в `members` -> knocker подключается.
5. **Автозавершение и reconciliation.** `services/love/src/polling.ts` каждый цикл: `closeRoomIfOwnerGone()` (по штампу `ownerLeftAt` в LiveKit-metadata), `closeRoomIfAgentsOnly()` (штамп `humansLeftAt`), `stopOrphanEgresses()`. `activateMeeting`/`finishMeeting` - `services/love/src/workspaceClient.ts`.
6. **Запись встречи.** `/startRecord` -> `RecordingProcessor.startRecording` (`services/love/src/recordings.ts`) резервирует `PendingRecording` через `createPendingRecording()` (`workspaceClient.ts`, `TxApplyIf`-транзакция, см. ниже) **до** вызова Egress; webhook `egress_ended` (`services/love/src/webhook.ts`) сохраняет файл (`saveFile`, `webhook.ts`) как `attachment.class.Attachment` на встрече - видео с `video/*` дальше подхватывает конвейер транскодирования (см. `../memory/video-transcoding-storage.md`).

## Фичи

Ниже - подтверждённые в коде группы и то, что не входило в `love.md`.

### Митинги, гости, invite/knock, присутствие, транскрипция, запись
Полностью описаны и проверены в `../love.md`, разделы 4-9 (жизненный цикл, подключение, присутствие, invite/knock, гости, запись/транскрипция) и §10 (исправленные дефекты D1-D27). Не дублируется здесь.

### Телеметрия звонков (FUSIO-261, после `love.md`)
- **Trace ID звонка.** `MeetingMinutes.traceId` генерируется при первом `getRoomToken()` и персистится на документе; все последующие HTTP-запросы клиента (`/getToken`, `/startRecord`, `/finishMeeting`, `/liveSessions`, `/language`, `/guestToken`) несут заголовок `traceparent` (W3C trace context) и `x-participant-id`. - `newCallTraceId()`, `callTraceParent()`, `plugins/love/src/tracing.ts`; `LoveClient.buildHeaders()`, `plugins/love-resources/src/loveClient.ts`.
- **Проброс trace в очередь.** `services/love/src/main.ts` читает `traceId` встречи и прокидывает `traceparent` в `ctx.with(...)` при обработке webhook-сообщения очереди, плюс атрибуты `meeting.id`/`participant.id` на HTTP-спан через middleware.
- **Аналитика сервиса.** `configureAnalytics('love', ...)` и `@hcengineering/measurements-otlp` подключены в `services/love/src/index.ts`.

### Надёжность записи и очереди (#444)
- **Атомарная резервация записи.** `createPendingRecording()` резервирует запись и проверяет "уже идёт запись" одной транзакцией `TxApplyIf` с `notMatch` по слоту `meeting+format`; протухшую резервацию без `egressId` отличает `reservedAfter`. Работает при нескольких репликах `services/love`. - `services/love/src/workspaceClient.ts` (`createPendingRecording`).
- **`updateMetadata` не бросает исключений.** До 3 попыток с задержкой, недоступная комната не блокирует топик очереди. - `services/love/src/utils.ts` (`updateMetadata`, `UPDATE_METADATA_ATTEMPTS`).
- **`finishMeeting` идемпотентен.** Повторный finish (webhook `room_finished` + polling) не перезаписывает `meetingEnd` и не сметает knock-инвайты следующей встречи в той же комнате (сравнение `endedAt`). - `services/love/src/workspaceClient.ts` (`cleanupInvitesForMeeting`).
- **Авто-старт записи по `QueueMeetingEvent.started` обёрнут в try/catch**, ошибка не вызывает повторную доставку сообщения очереди. - `services/love/src/main.ts`.

### Lazy-load офисных данных (#464)
- **Разделение стартовых и по-требованию запросов.** `officeLoaded` (комнаты, `ParticipantInfo`, все встречи) грузится сразу при подключении клиента; этажи (`Floor`), `DevicesPreference`, `PendingRecording` и кэш person-ов офисов грузятся только при заходе на страницу офиса/настроек устройств/митинга через `ensureOfficeDetailsLoaded()`. - `plugins/love-resources/src/stores.ts`; вызовы из `Floor.svelte`, `Hall.svelte`, `LoveWidget.svelte`, `Settings.svelte`, `RecordingButton.svelte`, `CamSettingPopup.svelte`, `MicSettingPopup.svelte`, `speakingWhileMuted.ts`, `meetings.ts`.
- **Аналогично для участников воркспейса.** `ensureWorkspaceMembersLoaded()` - ленивая загрузка списка аккаунтов для инвайт-попапа. - `plugins/love-resources/src/stores.ts`, `InviteEmployeeButton.svelte`.

### Локализация дефолтных комнат (FUSIO-462)
- **Имена дефолтных комнат переведены.** `createDefaultRooms()` асинхронно переводит `AllHands`/`MeetingRoomNum`/`VoiceRoomNum` через `translate()` на языке воркспейса (передаётся в миграцию как `context.language`). - `plugins/love/src/utils.ts`, `models/love/src/migration.ts` (`createRooms`).

### Уведомление о knock (FUSIO-637)
- **Отдельные заголовок/текст для knock vs invite.** Knock в приватную комнату шлёт `JoinRequestTitle`/`JoinRequestBody` ("{name} wants to join the meeting"), invite - `MeetingRequest`/`IsKnocking`. - `server-plugins/love-resources/src/index.ts` (`createInviteNotificationTxs`), `plugins/love/src/plugin.ts`.

### Recorder и Media (независимые от митинга)
- **Экранный рекордер воркспейса.** Записывает экран через `MediaRecorder`, чанкует и заливает в Drive; не связан с LiveKit Egress встречи. - `class Recorder`, `plugins/recorder-resources/src/recorder.ts`; `models/recorder/src/plugin.ts` (merge `WorkbenchExtension`).
- **Выбор микрофона/камеры.** `toggleCamState`/`toggleMicState`, `WorkbenchExtension` для попапа устройств. - `plugins/media-resources/src/utils.ts`.

## Куда смотреть, если нужно...

- Изменить правила размещения на сетке этажа -> `getFreeRoomPlace()`, `plugins/love/src/utils.ts` (см. также `../love.md#62-правила-размещения`).
- Изменить окно входа в scheduled-встречу -> `SCHEDULED_JOIN_LEAD_MS`/ `SCHEDULED_MEETING_WINDOW_MS`, `isScheduledJoinable()`, `plugins/love/src/utils.ts`.
- Добавить новый REST-эндпоинт сервиса love -> `services/love/src/main.ts` (роуты)
  + при необходимости `decodeMeetingToken`, `services/love/src/utils.ts`. Не забыть headers через `LoveClient.buildHeaders()` для трейсинга, если эндпоинт дергает клиент.
- Поменять текст/логику invite или knock -> `plugins/love-resources/src/invites.ts` (клиент) + `server-plugins/love-resources/src/index.ts` (триггер `OnUserMeetingInvite`).
- Изменить поведение записи/квоты записи -> `services/love/src/recordings.ts` (`RecordingProcessor`), `services/love/src/workspaceClient.ts` (`createPendingRecording`, транзакционная резервация).
- Изменить STT-провайдер или его настройки -> `services/ai-bot/pod-ai-bot/src/transcription/` (`createTranscriptionProvider`, `providers/{deepgram,openai,server}.ts`).
- Изменить realtime VAD/STT в комнате -> `services/ai-bot/love-agent/src/stream/` (`stt.ts`, `audio-analysis.ts`).
- Изменить дефолтные комнаты/этаж при создании воркспейса -> `createDefaultRooms()`, `plugins/love/src/utils.ts` + `models/love/src/migration.ts` (`createRooms`).
- Изменить биллинг/лимиты митингов -> `services/love/src/billing.ts`, `services/love/src/limits.ts`.
- Добавить поле в `MeetingMinutes`/`Room`/`UserMeetingInvite` -> `plugins/love/src/types.ts`
  + модель в `models/love/src` + миграция при необходимости.
- Добавить/поменять i18n-строку -> `plugins/love-assets/lang/*.json` (12 языков, включая `en.json`/`ru.json`).
- Поправить lazy-loading офисных данных -> `plugins/love-resources/src/stores.ts` (`ensureOfficeDetailsLoaded`, `ensureWorkspaceMembersLoaded`).

## Настройки и конфигурация

- `services/love/src/config.ts` - обязательные env (`ACCOUNTS_URL`, `LIVEKIT_*`, `SECRET` и др.); падает при импорте, если чего-то нет.
- `EGRESS_REQUEST_TIMEOUT_SEC` - таймаут запроса к LiveKit `EgressClient` (по умолчанию 30s).
- `useKrisp = false` в `plugins/love-resources/src/utils.ts` - Krisp noise-cancellation отключена фич-флагом (платный LiveKit add-on, нестабилен), обвязка сохранена.
- `DevicesPreference` (`micEnabled`, `noiseCancellation`, `blurRadius`, `camEnabled`, `speakingWhileMutedAlert`) - персональные настройки устройств, `plugins/love/src/types.ts`.
- `Room.startWithTranscription`/`startWithRecording`/`startPrivate` - настройки на комнату.

## Тесты

- Unit: `plugins/love/src/__tests__/getFreeRoomPlace.test.ts`, `plugins/love-resources/src/__tests__/` (`stores.lazy.test.ts`, `loveClient.record.test.ts`, `meetings.*.test.ts`), `server-plugins/love-resources/src/__tests__/` (invite/knock/heartbeat/events), `services/love/src/__tests__/` (webhook, polling, recordings, finishMeeting, workspaceClient, utils, guests, edge-cases).
- Integration: `api-tests/api/src/__tests__/love-invite-flow.test.ts` (+ `.benchmark.test.ts`).
- Sanity Playwright: `tests/sanity/tests/love/meetings.all.spec.ts` (агрегирует ~65 тестов из соседних `meetings.*.tests.ts`), page objects в `tests/sanity/tests/model/love/`.
- Полный перечень файлов, команды запуска, окружение (`meetings-ws`, LiveKit локально) - `../love.md#11-тесты`.

## Связанные документы

- [`../love.md`](../love.md) - основной документ: модель данных, security, протоколы подключения/присутствия/invite-knock/гостей/записи, исправленные дефекты, тесты, QA-сценарии.
- [`../memory/love-service-replication.md`](../memory/love-service-replication.md) - почему `services/love` не может полагаться на process-local состояние.
- [`../memory/presence-fanout.md`](../memory/presence-fanout.md) - рассылка presence на каждый workspace.
- [`../memory/love_invite_multitab.md`](../memory/love_invite_multitab.md) - `senderSessionId`/`acceptedSessionId` guard подробно.
- [`../memory/love_one_person_two_meetings.md`](../memory/love_one_person_two_meetings.md) - баг с зависшей комнатой при переходе между митингами.
- [`../memory/love_recording_button_stuck.md`](../memory/love_recording_button_stuck.md) - `/startRecord` -> 409 already-running.
- [`../memory/love_workspace_switch_kills_meeting.md`](../memory/love_workspace_switch_kills_meeting.md) - переключение воркспейса завершает звонок у всех.
- [`../memory/love_agent_prebuffer.md`](../memory/love_agent_prebuffer.md) - pre-buffer нарезки чанков в `love-agent`.
- [`../memory/sanity_love_wall_time.md`](../memory/sanity_love_wall_time.md) - где sanity-прогон love тратит время.
- [`../memory/video-transcoding-storage.md`](../memory/video-transcoding-storage.md) - что происходит с сохранённой записью встречи дальше (HLS, storage accounting).
- [`../aibot.md`](../aibot.md) - как `love-agent` встроен в общий AI-конвейер (STT -> aibot -> billing).
