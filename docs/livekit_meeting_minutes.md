# LiveKit Meeting Minutes Integration

## ✅ Completed

### 1. Meeting Minutes (replaces Room for meeting identification)
- Заменена модель: Room → MeetingMinutes для идентификации митингов
- ParticipantInfo создается из love сервиса после получения событий от LiveKit
- Митинги работают, люди подключаются, агент подключается
- Поддержка нескольких подключений от одного человека

### 2. Invites System (refactored)
Используется **один класс** `UserMeetingInvite` с полем `kind`:
- `kind: 'invite-request'` - создается в space отправителя, отслеживает исходящие приглашения
- `kind: 'invite-response'` - создается серверным триггером в space получателя

#### Поток данных:
1. **Отправка приглашения:**
   - Отправитель вызывает `sendInvites([person])`
   - Создается `UserMeetingInvite` с `kind: 'invite-request'`
   - Система нотификаций создает `CommonInboxNotification`
   - Серверный триггер `OnUserMeetingInvite` создает `invite-response` в space получателя
   - Получатель видит плашку через query на `invite-response`

2. **Принятие/Отклонение:**
   - Accept: создает митинг, обновляет `invite-response.meetingId` + `status = 'accepted'`
   - Decline: обновляет `status = 'declined'`
   - Серверный триггер синхронизирует статус с `invite-request`

3. **Два сценария:**
   - Личный разговор (нет активного митинга): создает митинг в офисе получателя
   - Приглашение в текущий митинг: добавляет в collaborators

#### Рефакторинг выполнен:
- Удален `joinRequests.ts` (дублирующий функционал)
- Удалены `JoinRequestPopup.svelte`, `JoinResponsePopup.svelte`
- Очищены `console.log` из `invites.ts`
- Упрощена архитектура (единая система invites)

### 3. Guest Meeting App
- **GuestMeetingApp.svelte** - полноэкранное приложение для гостей
  - Обрабатывает query params: `meetingId`, `guestToken`
  - Верифицирует гостя через `/guestInfo`
  - При успехе - навигирует в workspace + meeting

- **GuestJoinPopup.svelte** - UI для гостя который не смог автоматически присоединиться
  - Запрашивает имя/email если нужно

- **GuestControlBar.svelte** - упрощенная панель управления для гостей

- **GuestParticipantView.svelte** - просмотр участников для гостя

- **GuestParticipantsListView.svelte** - список участников для гостя

- **GuestMeetingApp** стилизована под LoginApp

### 4. Генерация гостевых ссылок
- При создании Event с room → генерируется гостевая ссылка через `login.function.GetInviteLink`
- Ссылка записывается в `event.location`
- Содержит `inviteId` + `navigateUrl` с `meetId`

### 5. Webhook Processing
- Множественные Webhook receivers (основной + дополнительный для проектов)
- `convertBigIntToString` для сериализации BigInt значений
- Project key filtering в room metadata

### 6. Server Love Service
- `polling.ts` - LiveKitPollingService для мониторинга
- `webhook.ts` - WebhookProcessor класс
- `workspaceClient.ts` расширен

### 7. Transcription & Recording States
- Добавлены enum: `TranscriptionState`, `RecordingState`
- Новые presenters: `MeetingMinutesRecordingStatePresenter`, `MeetingMinutesTranscriptionStatePresenter`
- `PendingRecordingPresenter` для ожидающих записей

---

## 📋 TODO

### 1. Исправить баг с Video в RoomModal
> Нужно починить багу: если RoomModal в полный экран, то нужно видео в правой панельке не показывать, а то получается 2 контрола одно и тоже видео гоняют.

### 2. Очередь вебхуков
> Love должен складывать вебхуки в очередь и обрабатывать их из очереди.

### 3. Гостевые ссылки - поиск митингов по времени

#### Проблема:
Сейчас ссылка требует `meetingId`. Но если митинг еще не начался - meetingId может быть не активен.

#### Решение:
1. **Добавить дату в ссылку:**
   - В `createMeeting` передавать дату/время митинга из Event.date
   - Ссылка: `navigateUrl` содержит timestamp

2. **Токен для поиска митинга:**
   - Без meetingId - генерировать токен с room + timestamp
   - Сервер ищет активный митинг по room и времени (±30 мин)

3. **API для верификации:**
   - Обновить `/guestInfo` endpoint
   - Логика поиска митингов по времени

#### План:
- [ ] Модель данных: добавить поля room, timestampStart, timestampEnd
- [ ] Генерация ссылок: обновить `createMeeting`
- [ ] Серверная часть: обновить `/guestInfo`
- [ ] GuestMeetingApp: обработка ссылки с timestamp

### 4. UI - Расширение формы после подключения

После подключения (`$lkSessionConnected === true`) форма должна расшириться на весь экран:
- Оставить только верхнюю полоску с логотипом
- room-container + GuestControlBar занимают всё пространство

#### Текущее:
```svelte
<LoginAppBase>
  <svelte:fragment slot="form-content">
    {#if $lkSessionConnected}
      <room-container />
      <GuestControlBar />
    {:else}
      <GuestJoinPopup />
    {/if}
  </svelte:fragment>
</LoginAppBase>
```

#### Нужно:
```svelte
{#if $lkSessionConnected}
  <div class="fullscreen-meeting">
    <header class="meeting-header">
      <Logo />
      <span class="meeting-title">{guestInfo?.title}</span>
    </header>
    <div class="meeting-content">
      <room-container />
      <GuestControlBar />
    </div>
  </div>
{:else}
  <LoginAppBase>...</LoginAppBase>
{/if}
```

- [ ] Расширить форму на весь экран после подключения
- [ ] Оставить только header с логотипом

### 5. Тестирование
- [ ] Проверить отправку приглашений
- [ ] Проверить получение и принятие приглашений
- [ ] Проверить отклонение приглашений
- [ ] Проверить звуковые уведомления
- [ ] Проверить генерацию ссылки с датой
- [ ] Проверить вход без meetingId
- [ ] Проверить поиск активного митинга по времени

---

## 🔧 Technical Details

### Клиент логи (`invites.ts`):
- `[responseToInviteRequest]` - статус приглашения (accept/decline)
- `[subscribeToIncomingInvites]` - полученные приглашения из query
- `[updateInvites]` - поиск существующих приглашений

### Клиент логи (`meetings.ts`):
- `[createMeeting]` - создание митинга
- `[joinOrCreateMeetingByInvite]` - присоединение к митингу по invite
- `[connectToMeeting]` - подключение к митингу (LiveKit)

### Сервер логи (`server-plugins/love-resources/src/index.ts`):
- `[OnUserMeetingInvite]` - обработка обновления invite-response
- `[OnUserMeetingInvite]` - поиск invite-request для синхронизации

### Важные замечания:
1. **Права доступа:** `invite-request` в space отправителя, `invite-response` в space получателя
2. **Синхронизация:** Только сервер может обновлять `invite-request`
3. **Время жизни:** 30 секунд, обновляется каждые 5 секунд если отправитель активен
4. **Звук:** Включается при показе плашки (`playSound`)
5. **Обратный отсчет:** Показывается последние 10 секунд
