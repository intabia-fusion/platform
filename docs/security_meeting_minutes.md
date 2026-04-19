# MeetingMinutes Security Enhancement

## Задача

Унаследовать MeetingMinutes от Space вместо AttachedDoc для организации приватных комнат.

## Цель

Создать механизм приватных митинг-комнат, где доступ к митингу и его записям контролируется через механизм Space (члены Space видят содержимое).

## Реализованные изменения

### 1. Модель MeetingMinutes как Space

**Изменения в `plugins/love/src/types.ts`:**
- Интерфейс `MeetingMinutes` теперь наследуется от `Space` вместо `AttachedDoc`
- Добавлено поле `roomId?: Ref<Room>` для ссылки на комнату (заменяет `attachedTo`)
- Удалены поля `attachedTo`, `attachedToClass`, `collection` (унаследованы от AttachedDoc)
- Поля `name`, `description`, `private`, `archived`, `members`, `owners` теперь унаследованы от Space
- Поле `title` сохранено для обратной совместимости (дублирует `name`)

**Изменения в `models/love/src/index.ts`:**
- `TMeetingMinutes` теперь наследуется от `TSpace` вместо `TAttachedDoc`
- Изменён декоратор `@Model`: `DOMAIN_MEETING_MINUTES` → `DOMAIN_SPACE`
- Добавлен `TMeetingInfo` для real-time информации о митинге

### 2. MeetingInfo (УДАЛЕНО)

~~Создан новый интерфейс и модель для отображения информации об активных митингах~~

**Решение от 27.03.2026:** MeetingInfo был удален как избыточный. Вместо этого используется:
- `ParticipantInfo` - для определения кто в каком митинге
- `busyPersons` store - для отображения "Busy" статуса у участников приватных митингов

**Логика:** Если участник есть в `ParticipantInfo`, но его митинга нет в доступных `MeetingMinutes` (нет доступа к Space), он считается "занятым" (Busy) и отображается с соответствующей плашкой в UI.

### 3. Миграция данных

**`models/love/src/migration.ts`:**
Создана миграция `meeting-minutes-to-space`:

1. **Чтение пачками** - `traverse()` + `next(1000)`
2. **Трансформация в памяти:**
   - `title` → `name`
   - `attachedTo` → `roomId` (если `attachedToClass === love.class.Room`)
   - Установка дефолтов: `private`, `archived`, `members`, `owners`
   - Удаление AttachedDoc полей: `attachedTo`, `attachedToClass`, `collection`, `access`
3. **Запись в DOMAIN_SPACE** - `client.create(DOMAIN_SPACE, meetings)`
4. **Удаление из источника** - `client.deleteMany(DOMAIN_MEETING_MINUTES, ...)`
5. **Обновление space для attached документов:**
   - `PendingRecording` в `DOMAIN_LOVE_PENDING`
   - `ActivityMessage` в `DOMAIN_ACTIVITY`
   - `Attachment` в `DOMAIN_ATTACHMENT`

### 4. Services/Love интеграция

**`services/love/src/workspaceClient.ts`:**
- ~~Метод `createMeetingInfo()` - создание MeetingInfo при старте митинга~~ (удалено)
- ~~Метод `removeMeetingInfo()` - удаление MeetingInfo при завершении~~ (удалено)
- ~~Метод `updateMeetingInfoPersons()` - обновление списка участников~~ (удалено)
- Обновлены методы для работы с MeetingMinutes как Space
- Методы `activateMeeting()` и `finishMeeting()` - управление статусом митинга

**`services/love/src/webhook.ts`:**
- Обработка `room_started` - активация митинга
- Обработка `room_finished` - завершение митинга
- Обработка `participant_joined` / `participant_left` - управление ParticipantInfo

### 5. UI компоненты

**`plugins/love-resources/src/components/`:**
- `ControlExt.svelte` - обновлён для работы без MeetingInfo (использует ParticipantInfo)
- `RoomPopup.svelte` - отображение списка митингов
- `RoomPreview.svelte` - добавлено отображение "Busy" статуса для участников приватных митингов
- `MeetingMinutesTable.svelte` - обновлена фильтрация по archived
- `MeetingMinutesPresenter.svelte` - обновлено отображение

**`plugins/love-resources/src/stores.ts`:**
- ~~Добавлен store `meetingInfos` для хранения MeetingInfo документов~~ (удалено)
- Добавлен store `busyPersons` - отслеживает участников в приватных митингах (которых нет в доступных MeetingMinutes)
- Логика: если участник есть в ParticipantInfo, но его митинга нет в meetings store → он "занят" (Busy)

### 6. Тесты

**`services/love/src/__tests__/`:**
- ~~`workspaceClient.test.ts` - тесты для MeetingInfo операций~~ (удалено)
- `webhook.test.ts` - тесты для webhook обработчиков
- ~~`integration.test.ts` - интеграционные тесты жизненного цикла~~ (удалено)
- `edge-cases.test.ts` - тесты граничных случаев
- ~~`migration-compatibility.test.ts` - тесты совместимости миграции~~ (удалено)
- `utils.test.ts` - тесты утилит
- `test-helpers.ts` - фабрики тестовых данных

### 7. Server Plugins

**`server-plugins/love-resources/src/index.ts`:**
- Удалён триггер `OnMeetingMinutes` (MeetingInfo теперь управляется через services/love)

## Файлы изменены

### Core:
- `plugins/love/src/types.ts`
- `models/love/src/index.ts`
- `models/love/src/migration.ts`
- `models/love/package.json`

### Services:
- `services/love/src/workspaceClient.ts`
- `services/love/src/webhook.ts`
- `services/love/src/polling.ts`
- `services/love/src/__tests__/*.test.ts`

### UI:
- `plugins/love-resources/src/components/ControlExt.svelte`
- `plugins/love-resources/src/components/RoomPopup.svelte`
- `plugins/love-resources/src/components/RoomPreview.svelte`
- `plugins/love-resources/src/stores.ts`

### Server:
- `server-plugins/love-resources/src/index.ts`

## Архитектурные изменения (27.03.2026)

### Удаление MeetingInfo

**Причина:** MeetingInfo был избыточным слоем абстракции. Вся необходимая информация уже есть в ParticipantInfo.

**Что изменилось:**
1. Удален класс `MeetingInfo` из моделей
2. Удалены методы `createMeetingInfo`, `removeMeetingInfo`, `updateMeetingInfoPersons` из workspaceClient
3. Удален store `meetingInfos` из love-resources
4. Обновлена логика `getActiveMeetings` в ControlExt.svelte - теперь использует ParticipantInfo напрямую

**Преимущества:**
- Проще архитектура (меньше сущностей)
- Нет необходимости синхронизировать MeetingInfo с ParticipantInfo
- Меньше кода для поддержки

### Добавление Busy статуса

**Логика:**
- `busyPersons` store сравнивает `ParticipantInfo` (все участники) с `meetings` (доступные митинги)
- Если участник в митинге, которого нет в доступных → он "занят" (Busy)
- В UI (RoomPreview.svelte) показывается черная плашка с текстом "Busy"/"Занят"

**Преимущества:**
- Пользователи видят, что кто-то в приватном митинге, не видя деталей
- Единообразное поведение с другими системами статусов

## TODO (не реализовано)

### 1. Кнопка закрытия комнаты в тулбаре

Добавить кнопку "Open/Close Room" в тулбар митинга:
- Установка флага `private = true/false`
- Митинг исчезает из списков для тех у кого нет доступа
- Для закрытого митинга показывать MeetingInfoPlaceholder
- Поддержка запросов на вступление в закрытый митинг

### 2. Приглашение в комнату

При приглашении человека в комнату:
- Добавление его AccountUuid в массив `members` MeetingMinutes
- Доступ к записям через систему безопасности Space

### 3. Фильтрация и права доступа

- Кто может закрывать комнату? (только owners?)
- Фильтрация archived митингов в списках

## Миграция

Для применения миграции выполнить:
```bash
rushx upgrade --workspace <workspace-name>
```

Миграция `meeting-minutes-to-space` выполнит:
1. Перенос MeetingMinutes из `DOMAIN_MEETING_MINUTES` в `DOMAIN_SPACE`
2. Обновление всех связанных документов (PendingRecording, ActivityMessage, Attachment)
3. Установку правильного space для attached документов

## Результат

✅ MeetingMinutes как Space с полями:
- `name`, `description`, `private`, `archived`, `members`, `owners`
- `roomId` для ссылки на комнату
- `status`, `transcriptionState`, `recordingState`

✅ ~~MeetingInfo для real-time отображения активных митингов~~ (заменено на ParticipantInfo + busyPersons store)

✅ Миграция существующих данных

✅ Тесты для новой функциональности

✅ "Busy" статус для участников приватных митингов

⏳ TODO: UI для управления приватностью (кнопка закрытия/открытия)
⏳ TODO: Приглашения в закрытые митинги

---

## Чек-лист для QA (поведенческие изменения)

Ниже описаны только те изменения поведения, которые реально видны пользователю или меняют правила доступа. Техническая рефакторинг-часть (удаление Mongo, чистка dev/tool и т.п.) здесь не перечисляется.

### 1. MeetingMinutes теперь Space (раздел 1 выше)

**Что поменялось:**
- Митинг-минутки наследуются от Space и имеют поля `private`, `members`, `owners`, `archived`.
- Поле `attachedTo` у MeetingMinutes заменено на `roomId`.
- Внутри одного workspace MeetingMinutes переехали из `DOMAIN_MEETING_MINUTES` в `DOMAIN_SPACE` (миграция `meeting-minutes-to-space`).

**Что проверить:**
- [ ] На существующем workspace после апгрейда: все прошлые митинги видны, открываются, их записи/transcription/сообщения на месте.
- [ ] `PendingRecording`, сообщения активности и вложения, ранее привязанные к MeetingMinutes, по-прежнему отображаются.
- [ ] Создание нового митинга: появляется в списке, запись/транскрипция стартуют как раньше.
- [ ] Архивирование митинга: исчезает из списков (если не включён фильтр "показать архив"), поиск по нему не возвращает результатов обычным пользователям.

### 2. Приватные митинги и Busy-статус (разделы 2, 5)

**Что поменялось:**
- MeetingInfo удалён. Активные митинги определяются по `ParticipantInfo`.
- Если участник находится в митинге, к которому у текущего пользователя **нет доступа** (приватный митинг, не член) — он показывается как "Busy" без деталей.

**Что проверить:**
- [ ] Пользователь А создаёт приватный митинг, заходит в комнату. Пользователь Б, не являющийся членом, в `RoomPreview` видит А с плашкой "Busy"/"Занят" и не видит название митинга.
- [ ] Пользователь Б становится членом митинга → название и детали появляются, плашка Busy уходит.
- [ ] Публичный митинг: все участники видны обычным образом, без Busy.
- [ ] Переключение `private` у митинга на лету — список видимости обновляется у других пользователей без перезагрузки клиента.

### 3. Права на изменение Space/MeetingMinutes (`spaceSecurity.ts`)

**Что поменялось:** middleware теперь жёстко проверяет `owners` на уровне транзакций.

Правила для обычного пользователя (не `AccountRole.Owner`, не системный аккаунт):

| Действие | Условие | Результат |
|---|---|---|
| Создать приватный space с `owners: [я]` | — | ✅ разрешено |
| Создать приватный space с `owners: [другой]` | — | ❌ ошибка `Only owners can create private spaces` |
| Создать приватный space с `owners: []` | — | ❌ (ниже нет ни одного владельца, приватное пространство недоступно) |
| Создать публичный space с любым `owners` | — | ✅ разрешено (намеренно, см. решение ниже) |
| Поменять `private` у существующего space | `owners` не пустой, я не владелец | ❌ `Only owners can change space privacy` |
| Поменять `private` у существующего space | я в `owners` | ✅ |
| Поменять `owners` (set/$push/$pull) | я не в `owners` | ❌ `Only owners can change space owners` |
| Поменять `owners` | я в `owners` | ✅ |
| Любые изменения space где `owners.size === 0` | — | ✅ (legacy/bootstrap) |

**Решение по публичным space:** создание публичного space с чужими `owners` **разрешено намеренно**. Публичный space и так виден всем, защищать нечего. Если QA видит отказ на создании публичного пространства с переданным списком `owners` — это регрессия.

**Системный аккаунт и `AccountRole.Owner`:** полностью обходят эти проверки (админские операции, миграции).

**Что проверить:**
- [ ] Обычный пользователь может создать приватный канал/пространство, где он владелец.
- [ ] Обычный пользователь **не может** создать приватный канал, где владельцем указан другой пользователь (ошибка от сервера).
- [ ] Не-владелец приватного канала не может сделать канал публичным (или наоборот).
- [ ] Не-владелец не может добавить/удалить владельцев через UI (кнопка либо скрыта, либо запрос отклоняется с ошибкой).
- [ ] Владелец может передать владение (добавить нового владельца, убрать себя — проверить именно в этом порядке, чтобы не потерять доступ).
- [ ] Админ workspace (роль Owner) может делать всё вышеперечисленное без ограничений.

### 4. Видимость space в `findAll`/`searchFulltext`

**Что поменялось:** middleware больше не фильтрует результаты `findAll` клиент-сайд. Фильтрация выполняется в БД-адаптере (PostgreSQL) на основе аккаунта из контекста сессии. `searchFulltext` по-прежнему получает явный список разрешённых space.

**Что проверить:**
- [ ] Обычный пользователь не видит документы из приватных space, членом которых он не является, нигде в UI:
  - список в плагинах (tracker, documents, drive, etc.)
  - глобальный поиск
  - ссылки/реферансы в активности и уведомлениях
  - lookup-поля (например, assignee из чужого space не подтягивается)
- [ ] ReadOnlyGuest **не видит** публичные space в глобальном поиске.
- [ ] Guest видит публичные, но **не** системные space в глобальном поиске.
- [ ] После добавления пользователя в members приватного space — документы появляются без перелогина (через SecurityChange broadcast).
- [ ] После удаления из members — документы исчезают без перелогина.
- [ ] Архивированные space по умолчанию не возвращаются в findAll/поиске; включение "показать архив" возвращает их.

### 5. Приглашения в митинг (`OnUserMeetingInvite`)

**Что поменялось:** добавлена проверка владельцев для приватных митингов.

| Сценарий | Результат |
|---|---|
| Публичный митинг | ✅ invite создаётся у получателя |
| Приватный митинг, отправитель в `owners` | ✅ invite создаётся |
| Приватный митинг, отправитель не в `owners` | ❌ invite молча отбрасывается (не создаётся у получателя) |
| Приватный митинг, `owners` не задан (legacy) | ❌ invite молча отбрасывается (fail-closed) |
| Отправитель = получатель (self-invite) | ❌ отбрасывается |
| Отправитель не имеет `personUuid` (не слинкован с аккаунтом) | ❌ отбрасывается для приватного митинга |

**Что проверить:**
- [ ] Участник публичной комнаты может пригласить коллегу → у коллеги появляется всплывашка/уведомление.
- [ ] Обычный участник приватной комнаты **не может** никого пригласить — запрос уходит, но у получателя ничего не появляется. Ошибки в UI быть не должно (это не исключение, а тихий skip).
- [ ] Владелец приватной комнаты может пригласить → получатель видит приглашение.
- [ ] Приглашение принимается получателем → получатель автоматически добавляется в `members` митинга и начинает видеть его содержимое.
- [ ] При отклонении приглашения никаких изменений в `members` не происходит.
- [ ] Повторные приглашения одного и того же пользователя не ломают состояние (нет дублей в members).

### 6. Обновление Event → MeetingMinutes (`OnEventUpdate`)

**Что поменялось:** при изменении календарного Event, связанного с митингом (через миксин `MeetingEventLink`), автоматически:
- обновляется `meetingScheduledDate` если сдвинули дату Event;
- в `members` добавляются новые участники Event (персоны с `personUuid`).

Срабатывает только если митинг в статусе `MeetingStatus.Scheduled`. Для уже идущих/завершённых митингов — нет.

**Что проверить:**
- [ ] Создать календарное событие со ссылкой на митинг, назначить дату → у митинга `meetingScheduledDate` совпадает.
- [ ] Сдвинуть Event в календаре → `meetingScheduledDate` митинга сдвигается.
- [ ] Добавить участника в Event → он появляется в `members` митинга и начинает видеть приватный митинг.
- [ ] Удалить участника из Event → **остаётся** в `members` митинга (триггер только добавляет, не снимает). Если это не ожидаемо — репорт.
- [ ] Попытаться изменить дату Event у **завершённого** митинга → `meetingScheduledDate` **не** меняется.

### 7. `ensurePerson` / `ensureEmployee` — регистрация внешних пользователей

**Что поменялось:**
- Account DB: `ensurePerson` теперь атомарная операция на уровне PostgreSQL (`ON CONFLICT DO NOTHING` + откат orphan-person). Mongo как backend для AccountDB больше не поддерживается — попытка запуска с `mongodb://` в `ACCOUNT_DB_URL` сразу падает с ошибкой.
- Transactor (`pods/server/src/rpc.ts`): эндпоинт ensurePerson переиспользует общую логику `ensureEmployeeForPerson` вместо ручной сборки TxApplyIf.
- `ensureEmployeeForPerson` получил retry (до 3 попыток с линейной задержкой) на случай гонки TxApplyIf + новый флаг `createEmployee: false` и `roleOverride`.

**Что проверить:**
- [ ] Guest-флоу: внешний пользователь по invite-ссылке регистрируется → локальный Person создаётся один раз, SocialIdentity прикрепляется, Employee mixin ставится (при `addGuestEmployee=true`) с ролью GUEST.
- [ ] Повторный вход того же guest (тот же email/identity) не создаёт дубликатов Person / SocialIdentity / Employee.
- [ ] Параллельные запросы регистрации одного и того же guest (открыть две вкладки одновременно) — в итоге один Person, один Employee, ошибка пользователю не показывается.
- [ ] Уже существующий пользователь, повторно проходящий ensurePerson: ответ возвращает тот же `uuid`/`socialId`/`localPerson`.
- [ ] Ошибки валидации (пустое имя/email) приходят с HTTP 400, а не 500 (см. новую ветку обработки `PlatformError` → статус-коды).
- [ ] Запуск account-сервиса с `ACCOUNT_DB_URL=mongodb://...` падает с чётким сообщением `MongoDB is not supported as account database anymore`, а не зависает.

### 8. PersonSpace — защита от гонок (`OnEmployeeCreate`)

**Что поменялось:** создание PersonSpace сериализуется внутри процесса через `control.withScope('person-space-${account}', …)` и перед созданием делает повторную проверку `findAll`. Это снимает дубли PersonSpace при параллельной регистрации в одном поде.

**Что проверить:**
- [ ] При параллельной регистрации одного пользователя (многократный быстрый логин, CI-сценарии) — у пользователя ровно один PersonSpace, а не два.
- [ ] PersonSpace создаётся с `owners: [account]` (новое поле) — владелец своего личного space.

### 9. HTTP-ошибки RPC (`pods/server/src/rpc.ts`)

**Что поменялось:** если операция внутри transactor выкидывает `PlatformError`, статус-код HTTP теперь маппится:
- `BadRequest` → 400
- `Unauthorized` → 401
- `Forbidden` → 403
- `NotFound` → 404
- всё остальное → 500

**Что проверить:**
- [ ] Запрос без токена → 401.
- [ ] Попытка не-владельца поменять `private` у чужого space через REST → 403 (было 500).
- [ ] Запрос несуществующего документа → 404.
- [ ] Ошибка валидации параметров (например, пустой `socialValue` в ensurePerson) → 400 с JSON `{message, error}`.

### 10. Что удалено / больше не работает

- **MongoDB как account/transactor backend** — `ACCOUNT_DB_URL=mongodb://...` больше не поддерживается. Миграционные скрипты Mongo-only в `server/account-service/src/migration/**` удалены.
- **MeetingInfo** — класс и связанные методы `createMeetingInfo` / `removeMeetingInfo` / `updateMeetingInfoPersons` удалены. Если где-то у клиента/интеграции остались ссылки на этот класс — сломается.
- **dev/tool**: команды `clean.ts` (очистка старых коллекций) и `mixin.ts` удалены. Если QA-сценарии ими пользовались — обновить скрипты.
- **Триггер `OnMeetingMinutes`** в server-plugins/love-resources удалён.

---

## Приоритеты для smoke-теста

Если время ограничено, проверить в первую очередь:

1. **Миграция существующего workspace** — открытие старых митингов, их записи и сообщения (раздел 1).
2. **Приватный митинг → Busy-статус для посторонних** (раздел 2).
3. **Запрет не-владельцу создать приватный space с чужими owners** (раздел 3).
4. **Невидимость приватного space для не-членов в глобальном поиске и lookup-полях** (раздел 4).
5. **Guest-регистрация по invite-ссылке (одиночно и параллельно)** (раздел 7).
