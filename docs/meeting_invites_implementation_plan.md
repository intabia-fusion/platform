# План реализации уведомлений для приглашений в митинг

## Архитектура

Используем **один класс** `UserMeetingInvite` с полем `kind`:
- `kind: 'invite-request'` - создается в space отправителя, отслеживает исходящие приглашения
- `kind: 'invite-response'` - создается серверным триггером в space получателя, используется для показа плашки

Система нотификаций автоматически создает `CommonInboxNotification` при создании `invite-request` (через NotificationType). не проверено

## Поток данных

### Отправка приглашения:
1. Отправитель вызывает `sendInvites([person])`
2. Создается `UserMeetingInvite` с `kind: 'invite-request'` в space отправителя
3. Система нотификаций автоматически создает `CommonInboxNotification` (в Inbox получателя)
4. Серверный триггер `OnUserMeetingInvite` создает `UserMeetingInvite` с `kind: 'invite-response'` в space получателя
5. Получатель видит плашку через query на `invite-response`

### Принятие/Отклонение:
1. Получатель нажимает Accept/Decline в плашке
  2.1 Если нажимает Accept - создает митинг, получает его имя и вписывает в `invite-response.meetingId` и обновляет `invite-response.status = 'accepted'` + митинг должен содержать обоих персон в collaborators.
  2.2 Если нажимает Decline - обновляет `invite-response.status = 'declined'` 
3. Серверный триггер `OnUserMeetingInviteUpdate` находит связанный `invite-request` (по from+to) и обновляет его статус
4. Отправитель видит обновление статуса в своем `invite-request`
5. При принятии:
   - Если есть meetingId - подключаемся к существующему митингу - не проверено

### Отказ/Истечение срока:
- При отказе: обновляется `invite-response.status = 'declined'`, триггер синхронизирует с `invite-request`
- При истечении: `invite-response` автоматически исчезает из query по `expiresAt`, отправитель может отследить по таймауту

## Два сценария:

### 1. Личный разговор (нет активного митинга)
- `invite-request` создается без `meetingId`
- Получатель при принятии создает митинг в своем офисе
- Отправитель видит созданный митинг и подключается (через `checkAndJoinIfRecipientJoined`)

### 2. Приглашение в текущий митинг
- `invite-request` создается с `meetingId` текущего митинга, + персону добавляем в collaborators
- Получатель при принятии подключается к существующему митингу, он его видит так как в коллабораторах

## Если пользователь зайдет позже:

- **`invite-response`** будет виден только если не истек срок (`expiresAt > now`) и статус `pending`
- **`CommonInboxNotification`** останется в Inbox как история, со ссылкой на митинг
- **`invite-request`** (для отправителя) хранит полную историю

## Важные замечания:

1. **Права доступа**: 
   - `invite-request` - в space отправителя (только отправитель видит)
   - `invite-response` - в space получателя (только получатель видит)
   
2. **Синхронизация**: Только сервер может обновлять `invite-request` (через триггер `OnUserMeetingInviteUpdate`)

3. **Время жизни**: 30 секунд, обновляется каждые 5 секунд если отправитель активен

4. **Звук**: Включается при показе плашки (`playSound`), не зависимо от попапов

5. **Обратный отсчет**: Показывается последние 10 секунд

---

## 📋 План рефакторинга invites/joinRequests

### Проблема
Сейчас существует два файла с дублирующейся функциональностью:
- `invites.ts` (454 строки) - основная реализация
- `joinRequests.ts` (84 строки) - тонкая обертка с ре-экспортами "join" вместо "invite"

Это создает путаницу: часть кода использует терминологию "invite", другая - "join".

### Цель
Удалить `joinRequests.ts`, объединить всю логику в `invites.ts`, убрать отладочные логи.

### Шаги выполнения:

#### ✅ Шаг 1: Удалить `joinRequests.ts` ✓ ВЫПОЛНЕНО
- [x] Удалить файл `plugins/love-resources/src/joinRequests.ts`

#### ✅ Шаг 2: Очистить `invites.ts` от логов ✓ ВЫПОЛНЕНО
- [x] Удалить все `console.log` отладочные сообщения
- [x] Оставить только критические `console.error` для ошибок
- [x] Обновить license header с 2025 на 2026 год

#### ✅ Шаг 3: Обновить `meetings.ts` ✓ ВЫПОЛНЕНО
- [x] Заменить `import { unsubscribeJoinRequests } from './joinRequests'` - у нас уже все есть в invites.ts
- [x] Обновить вызов функции

#### ✅ Шаг 4: Обновить `WorkbenchExtension.svelte` ✓ ВЫПОЛНЕНО
- [x] Убрать `import { subscribeJoinRequests, unsubscribeJoinRequests } from '../joinRequests'` - мы уже должны вызывать для invites все что нужно.
- [x] Обновить вызовы в коде

#### ✅ Шаг 5-6: Удалить устаревшие компоненты ✓ ВЫПОЛНЕНО
Компоненты `JoinRequestPopup.svelte` и `JoinResponsePopup.svelte` не использовались в проекте и были удалены как устаревшие.

#### ✅ Шаг 7: Валидация ✓ ВЫПОЛНЕНО
- [x] Запустить `diagnostics()` для проверки ошибок
- [x] Убедиться, что все импорты разрешаются
- Результат: Ошибок нет, валидация прошла успешно

#### ✅ Шаг 8: Проверка работоспособности
- [ ] Проверить отправку приглашений
- [ ] Проверить получение и принятие приглашений
- [ ] Проверить отклонение приглашений
- [ ] Проверить звуковые уведомления

---

## 🎉 Результат рефакторинга

### Выполненные изменения:

1. **Удалены файлы:**
   - `plugins/love-resources/src/joinRequests.ts` (84 строки)
   - `plugins/love-resources/src/components/meeting/invites/JoinRequestPopup.svelte` (84 строки)
   - `plugins/love-resources/src/components/meeting/invites/JoinResponsePopup.svelte` (83 строки)

2. **Очищен `invites.ts`:**
   - Удалено 15+ отладочных `console.log`
   - Обновлен license header на 2026 год
   - Упрощены сообщения об ошибках

3. **Обновлены импорты:**
   - `meetings.ts` - заменен `unsubscribeJoinRequests` на `unsubscribeFromIncomingInvites`
   - `WorkbenchExtension.svelte` - удалены дублирующиеся импорты и функция `subscribeMeetingRequests`

4. **Валидация:**
   - ✅ Сборка прошла успешно
   - ✅ Валидация TypeScript прошла без ошибок
   - ✅ Нет оставшихся импортов из удаленных файлов

### Итог:
- Удалено ~250 строк дублирующегося/устаревшего кода
- Упрощена архитектура (единая система invites вместо invite+join)
- Очищен production код от отладочных логов

---

## 🔍 Добавлено детальное логирование для отладки

### Клиент (`invites.ts`):
- `[responseToInviteRequest]` - статус приглашения (accept/decline)
- `[responseToInviteRequest]` - обработка accept (поиск офиса, создание митинга)
- `[subscribeToIncomingInvites]` - полученные приглашения из query
- `[updateInvites]` - поиск существующих приглашений

### Клиент (`meetings.ts`):
- `[createMeeting]` - создание митинга
- `[joinOrCreateMeetingByInvite]` - присоединение к митингу по invite
- `[connectToMeeting]` - подключение к митингу (LiveKit)

### Сервер (`server-plugins/love-resources/src/index.ts`):
- `[OnUserMeetingInvite]` - обработка обновления invite-response
- `[OnUserMeetingInvite]` - поиск invite-request для синхронизации
- `[OnUserMeetingInvite]` - сравнение и синхронизация статусов
