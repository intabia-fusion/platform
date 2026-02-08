# LiveKit Meeting Minutes Integration - Atomic Switch Plan

## Completed:

1. Замена Room -> MeetingMinutes для идентификации митингов.
2. Переделка ParticipantInfo на создание из love сервиса, после получения событий от livekit.
3. Митинги работают, люди в них подключаются, агент тоже подключается.
4. Один человек несколько подключений должно работать.

## TODO:

- Нужно переделать функционал Knock и Join Requests, чтобы они работали с MeetingMinutes, нужно не использовать Pulse, У нас есть инфраструктура Requests, plugins/request*. Она позволяет создавать реквесты и отправлять нотификации для пользователей, нужно ее расширить чтобы пользователь следил за реквестами оперативно, ввести новый тип нотификации для реквеста, Online Popup, отправлять их через transient обьекты с TTL - 10 секунд. Чтобы такие реквесты появлялись как обычная нотификация, но висели и отсчитывали время до исчезновения. Если автор все еще будет стучаться к пользователю, то он будет обновлять request, и будет создаваться еще одна нотификация. 
- aibot занял все свободные офисы, хотя он уже был в какой то другой комнате. Код занатия зависел от ParticipantInfo, который теперь не создается.
- Нужно починить багу что если RoomModal в полный экран, то нужно видео в правой панельке не показывать, а то получается 2 контрола одно и тоже видео гоняют.

- Love должен складывать вебхуки в очередь и обрабатывать их из очереди.

- Гости (приглашения) — дизайн, текущее решение и дальнейшие задачи:
  - Коротко: приглашения генерируются серверно (в сервисе `love`) в виде специализированного invite-token (не общий токен логина). Клиент (в UI) получает ссылку, ведущую на публичный маршрут платформы, содержащую идентификатор митинга и этот invite-token в query. 
  - /meetings/:meetingId?guestToken=abc123
  - После перехода по ссылке гость вводит имя/фамилию в отдельном полноэкранном приложении и сервис `love` меняет invite-token + имя на JWT для LiveKit, по которому гость сразу подключается к митингу.
  - Что уже реализовано (PR/реализация):
    - Эндпоинт (server) для генерации invite-token:
```services/love/src/main.ts#L206-236
  // POST /guestToken
  // генерирует invite-token (подписанный, с exp) для указанного MeetingMinutes
```
    - Эндпоинт (server) для обмена invite-token + имени на LiveKit token:
```services/love/src/main.ts#L246-276
  // POST /guestJoin
  // валидирует invite-token, создаёт/гарантирует комнату и возвращает token (LiveKit) + wsUrl
```
    - Клиентская сторона: действие копирования гостевой ссылки теперь создаёт invite-token через сервис `love`, формирует ссылку на платформу с query `{ meetingId, guestToken }` 
  // getMeetingGuestLink -> вызывает /guestToken, формирует navigateUrl { path: ['meetings'], query: {meetingId, guestToken} },
  // вызывает Accounts.createAccessLink(...) и сохраняет ссылку в MeetingMinutes.guestLink
```
    - Полноэкранное приложение / UI для гостя: добавлен `GuestApp` (маршрут `meetings`) и `GuestJoinPopup`, которые:
      - читают `meetingId` и `guestToken` из query;
      - при загрузке делают `POST /guestInfo` (с `token`) — сервис `love` возвращает `{ meetingId, workspace, workspaceUrl, workspaceName, meetingStatus, roomFound }`;
      - если в ответе есть `workspaceUrl` — клиент пытается резольвить рабочую область через ресурс `getResource(login.function.SelectWorkspace)`:
        - если `selectWorkspace(wsUrl)` вернул `workspaceLoginInfo` с `token` — выполняется login‑flow: устанавливается presentation cookie + соответствующие metadata и производится навигация в workspace, сразу открывая нужный `MeetingMinutes` (т.е. гость попадает в рабочую область и в митинг автоматически);
        - если резольв неудачен или workspace не доступен — остаёмся в публичном GuestApp и показываем штатный Guest‑flow (форма имени / `GuestJoinPopup`);
      - если митинг `Active` — показывается кнопка `Join` в `GuestApp` (она может инициировать join в `GuestJoinPopup`) и аналогичная кнопка добавлена в presenter `MeetingMinutes` для быстрого присоединения (использует `joinOrCreateMeetingByInvite`);
      - при submit в `GuestJoinPopup` выполняется `POST /guestJoin` → возвращается LiveKit token (и `person`), компонент сохраняет `{ personRef, firstName, lastName }` в `localStorage` под ключом `guest:meeting:<workspaceId|meetingId>` и при повторных заходах предзаполняет поля.
    - Последние изменения и доработки (реализовано):
      - Сервер: `POST /guestJoin` теперь делает повторные попытки создания Person при transient-ошибках и, при неоднократной неудаче, возвращает ошибку (не выдает ephemeral guest_identity). Это предотвращает подключение гостей с временной identity `guest_*` и рассинхронизацию данных.
      - Сервер: `WorkspaceClient.createGuestPerson` получил `ensureEmployeeMixin(personId)` с retry-логикой — теперь создание Employee mixin для гостя выполняется с повторными попытками и логированием (восстанавливает прежнее поведение «гость ведёт себя как сотрудник (role: GUEST)»).
      - Вебхуки: при `participant_joined` если identity удалось сопоставить с Person (personRef) — webhook теперь добавляет запись активности в MeetingMinutes даже если Person не имеет SocialIdentity; мы пропускаем запись активности только для агентов/системных участников. Это гарантирует видимость действий гостей в activity-логе митинга.
      - Логирование: добавлен явный лог при добавлении activity: `[WorkspaceClient.addActivityToMeeting] Added activity message`, чтобы можно было легко отслеживать в логах факт записи активности.
      - Клиент: `GuestApp` UI обновлён — когда гость подключён, показывается полноэкранный вид, аналогичный `Room.svelte` (screen sharing + ParticipantsList). Обратите внимание: глобальные стили не менялись — для GuestApp использован её собственный layout, без правки глобальных CSS.
      - Клиент: стабильность UI — `ParticipantView` защищён от ошибок при первоначальном отсутствии кешей (используется `?.get(...)`), что устраняет `Reflect.get called on non-object` в консоли и предотвращает падения компонента при асинхронной подгрузке данных.
      - Рекомендация: важно добавить unit/integration тесты для `/guestToken` и `/guestJoin`, E2E тест для полного guest‑flow (генерация ссылки → переход → ввод имени → подключение → появление ParticipantInfo + activity).
  - Оставшиеся / рекомендуемые задачи:
    1. Персистировать или версионировать invite-токены (чтобы иметь возможность их отзывать/инвалидировать) — сейчас токен подписывается и валидируется, но не хранится в БД отдельно.
    2. При входе гостя нужно серверно создавать/апдейтить `ParticipantInfo` (через `WorkspaceClient.upsertParticipant…`) — чтобы гости сразу появлялись в митинге и система знала о них; сейчас это надо перенести с клиентской логики на сервер (или гарантировать создание из webhook'ов LiveKit).
    3. Запоминать локально — реализовано: `GuestJoinPopup` сохраняет в `localStorage` под ключом `guest:meeting:<workspaceId|meetingId>` объект `{ personRef, firstName, lastName }`. При следующем заходе значения полей предзаполняются из сохранённого объекта (см. `foundation/plugins/love-resources/src/components/GuestJoinPopup.svelte`).
    4. Написать покрытие: unit и интеграционные тесты для `/guestToken` и `/guestJoin`, e2e тесты подтверждающие полный flow (создание ссылки → переход → ввод имени → подключение к митингу, проверка ParticipantInfo и activity).
    5. Ограничить возможности гостя в UI (по умолчанию): скрыть записи/комментарии/транскрипты/прочие админ-функции — это реализовано частично на фронтенде (минимальный набор кнопок), но нужно сопроводить документацию/политику доступа.
    6. Проверить безопасность (срок жизни invite-token, привязка к workspace/meeting, rate-limits на генерацию ссылок).
  - Критерии приёмки:
    - При нажатии «Copy guest link» для MeetingMinutes генерируется invite-token и итоговая ссылка сохраняется в `MeetingMinutes.guestLink`.
    - По ссылке гость попадает в `GuestApp`:
      - при загрузке вызывается `POST /guestInfo` и, если возможно, автоматически резольвится workspace через `login.function.SelectWorkspace` — в этом случае платформа применяет login‑flow (presentation cookie / metadata) и переводит гостя прямо в workspace+MeetingMinutes;
      - если автоматический резольв workspace невозможен — показывается публичный Guest‑flow (`GuestJoinPopup`), где гость вводит имя/фамилию и подключается к LiveKit.
    - Если митинг `Active` — доступна кнопка `Join` (в GuestApp и в presenter'е MeetingMinutes), упрощающая подключение.
    - После успешного join сохраняется запись `guest:meeting:<workspaceId>` = `{ personRef, firstName, lastName }` и при следующем заходе поля будут предзаполнены.
    - Гости по умолчанию не видят административные функции; безопасность invite-token (срок, отзыв, rate‑limits и т.п.) остаётся предметом отдельной проверки.
```foundation/plugins/love-resources/src/components/GuestApp.svelte#L1-40
foundation/plugins/love-resources/src/components/GuestJoinPopup.svelte#L1-140
foundation/plugins/love-resources/src/components/MeetingMinutesPresenter.svelte#L1-80
```
    - Важно: invite-token — не токен входа в платформу, а специализированный invite-токен, подписанный сервисом `love` (используется серверный secret).

  - Оставшиеся / рекомендуемые задачи:
    1. Персистировать или версионировать invite-токены (чтобы иметь возможность их отзывать/инвалидировать) — сейчас токен подписывается и валидируется, но не хранится в БД отдельно.
    2. При входе гостя нужно серверно создавать/апдейтить `ParticipantInfo` (через `WorkspaceClient.upsertParticipant…`) — чтобы гости сразу появлялись в митинге и система знала о них; сейчас это надо перенести с клиентской логики на сервер (или гарантировать создание из webhook'ов LiveKit).
    3. Запоминать локально — реализовано: `GuestJoinPopup` сохраняет в `localStorage` под ключом `guest:meeting:<workspaceId|meetingId>` объект `{ personRef, firstName, lastName }`. При следующем заходе значения полей предзаполняются из сохранённого объекта (см. `foundation/plugins/love-resources/src/components/GuestJoinPopup.svelte`).
    4. Написать покрытие: unit и интеграционные тесты для `/guestToken` и `/guestJoin`, e2e тесты подтверждающие полный flow (создание ссылки → переход → ввод имени → подключение к митингу).
    5. Ограничить возможности гостя в UI (по умолчанию): скрыть записи/комментарии/транскрипты/прочие админ-функции — это реализовано частично на фронтенде (минимальный набор кнопок), но нужно сопроводить документацию/политику доступа.
    6. Проверить безопасность (срок жизни invite-token, привязка к workspace/meeting, rate-limits на генерацию ссылок).
  - Критерии приёмки:
    - При нажатии «Copy guest link» для MeetingMinutes генерируется invite-token и итоговая ссылка сохраняется в `MeetingMinutes.guestLink`.
    - По ссылке гость попадает в `GuestApp`:
      - при загрузке вызывается `POST /guestInfo` и, если возможно, автоматически резольвится workspace через `login.function.SelectWorkspace` — в этом случае платформа применяет login‑flow (presentation cookie / metadata) и переводит гостя прямо в workspace+MeetingMinutes;
      - если автоматический резольв workspace невозможен — показывается публичный Guest‑flow (`GuestJoinPopup`), где гость вводит имя/фамилию и подключается к LiveKit.
    - Если митинг `Active` — доступна кнопка `Join` (в GuestApp и в presenter'е MeetingMinutes), упрощающая подключение.
    - После успешного join сохраняется запись `guest:meeting:<workspaceId>` = `{ personRef, firstName, lastName }` и при следующем заходе поля будут предзаполнены.
    - Гости по умолчанию не видят административные функции; безопасность invite-token (срок, отзыв, rate‑limits и т.п.) остаётся предметом отдельной проверки.
