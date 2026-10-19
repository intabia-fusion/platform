# Модалка "Level up your access" у владельца воркспейса в закрытом space

Ветка `develop`, 2026-10-19.

- Сценарий: владелец воркспейса (`AccountRole.Owner`) открывает протокол чужой встречи, не будучи её участником, и ставит
  `Private = Yes`. Смена `private` проходит: `checkSpacePermissions` пропускает Owner.
- Дальше клиент раз в 5 с получал `Forbidden`. Источник - общий `Panel.svelte` (`packages/panel`, его использует `EditDoc`),
  который монтирует `Presence` -> heartbeat `PresenceContext.svelte` -> `diffUpdate` у `DocumentPresence`, у которого
  `space` = id встречи (`MeetingMinutes.space === _id`). Виджет чата тут ни при чём.
- Отказывает `SpaceSecurityMiddleware.checkWriteAccess`: для документов внутри space Owner не обходит проверку.
  Чтение тоже фильтруется (обход только для домена Space), поэтому после закрытия у Owner пропадает Activity.
- Сервер `Forbidden` не логирует (`sessionManager.ts`), причину нашли по WS-кадрам в Playwright.

## Решение

- Presence = "видит содержимое": `PresenceContext` не пишет presence в закрытый space, где пользователь не в `members`.
  Общий guard, поэтому действует и в закрытых каналах чата.
- Сервер передаёт причину отказа: `forbiddenError(ForbiddenKind.X, message?)` (`platform/src/status.ts`) кладёт `kind`
  в params `Forbidden`. `message` остаётся только на сервере, тесты сверяют по нему.
- `ReadOnlyAccessMiddleware` (`view-resources/src/middleware.ts`) по `kind` выбирает текст уведомления и пишет событие
  аналитики `PermissionDenied` (`kind`, классы tx/объекта, space, роль). Модалка про повышение роли - только `WorkspaceRole`.
- Встречи: см. `docs/features/office-meetings.md`, п. 8 (экран "Присоединиться", подтверждение закрытия).
- Изменение поведения для владельца воркспейса: раньше в закрытой встрече без членства он видел описание, резюме
  и вложения (поля рисовались, хотя запись в них падала). Теперь вместо них экран "Присоединиться", пока не вступит.
- Повторные отказы одного `kind` схлопываются в одно уведомление (`group` = `forbidden-<kind>`), событие аналитики
  пишется на каждый отказ. Проверено на стенде с отключённым guard: тост "Access denied", события
  `PermissionDenied` с `kind=not-space-member`, `objectClass=pulse:class:DocumentPresence`.
- Организатор не в `members` встречается у протоколов, перенесённых миграцией `meeting-minutes-to-space`
  (`members: []`, `owners: [createdBy]`). Если `createdBy` не сопоставился с аккаунтом, `owners` пустой, и открытую
  встречу без организаторов сервер разрешает закрыть любому (ветка `owners.size === 0`).
- Раньше `checkSpacePermissions` бросал обычный `Error` -> `UnknownError` с английским текстом в баннере, а
  `BooleanEditor` оставлял в UI "Yes" при отказе сервера (локальное значение ставится до `onChange`).
