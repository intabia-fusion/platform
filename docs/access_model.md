# Модель доступа

Кто что может читать и менять в воркспейсе. Это сводка по коду на 2026-10-19. Если код расходится с этим документом, прав код.

Доступ проверяют три уровня, по порядку: роль в воркспейсе, членство в space, разрешения роли в типизированном space. Отдельно действует лимит мест тарифа.

## 1. Роль в воркспейсе

`AccountRole` (`foundations/core/packages/core/src/classes.ts`), роли по возрастанию силы:

| Роль | Что может | Где проверяется |
| --- | --- | --- |
| `ReadOnlyGuest` | Только читать. Клиент не отправляет записи и показывает своё уведомление | `ReadOnlyAccessMiddleware` (`plugins/view-resources/src/middleware.ts`), сервер тоже отклоняет (`guestPermissions.ts:49`) |
| `DocGuest` | Гость по ссылке на документ. Любую запись сервер отклоняет | `guestPermissions.ts:49` |
| `Guest` | Пишет только в классы с миксином `TxAccessLevel` для гостей (реакции, вложения и т.п.). Не меняет, не архивирует и не удаляет space | `guestPermissions.ts` (`isForbiddenTx`, `isForbiddenSpaceTx`) |
| `User` | Обычный сотрудник. Не правит контактные данные чужих `Person` | `guestPermissions.ts` (`processUserTx`) |
| `Maintainer` | Как `User`, без ограничения на чужие контакты. В интерфейсе может удалять участников space (`SpaceMembers.svelte`) | клиент |
| `Owner` | Владелец воркспейса. Меняет любой space как объект. Видит все space в списках. Раздел настроек "Configure" | см. раздел 3 |
| `Admin` | Только системный аккаунт сервисов (`systemAccountUuid`). Людям не назначается, с админкой не связана (раздел 6): `updateWorkspaceRole` не даёт поднять роль выше своей (`server/account/src/utils.ts`) | `server/account/src/utils.ts:975-993` |

Лимит мест тарифа: места раздаются сначала `Owner`, затем `Maintainer`, затем остальным. Участник без места только читает (`seatLimits.ts`, `ForbiddenKind.SeatLimit`). Роли без места: `Admin`, `Guest`, `DocGuest`, `ReadOnlyGuest`.

## 2. Space и членство

Почти любой документ лежит в space (`doc.space`). Проекты, каналы, тимспейсы, диски и протоколы встреч - это space. У space есть `members` (участники), `owners` (владельцы, у встреч "организаторы") и флаг `private`.

**Чтение** (`addSecurity`, `foundations/server/packages/postgres/src/storage.ts:662`):
- Список space: открытые видят все, закрытые видят участники. Владелец воркспейса видит все space (`storage.ts:669`), включая закрытые.
- Содержимое: документы закрытого space видят только участники. Документы открытого space видны не-участнику, только если запрос указывает конкретный space, `_id` или `attachedTo`. В широкие выборки без фильтра по space они не попадают.
- Обход фильтра есть у системного аккаунта, триггеров сервера, `Admin` и `DocGuest`. Где ограничено чтение `DocGuest`, не проверял.
- Коллабораторы документа видят его без членства в space (`getClassCollaborators`).

**Запись содержимого** (`SpaceSecurityMiddleware.checkWriteAccess`, `spaceSecurity.ts:589`):
- В открытый space пишет любой, в закрытый - только участник (`canWriteSpace`, `spaceSecurity.ts:109`).
- Отказ: `ForbiddenKind.NotSpaceMember`.

**Изменение самого space** (`checkSpacePermissions`, `spaceSecurity.ts:431`):

| Что меняют | Кто может |
| --- | --- |
| Создание закрытого space | создатель должен быть в `owners`, а если `owners` пуст - в `members` |
| `private` | владелец space |
| `owners` | владелец space; последнего владельца снять нельзя (`LastSpaceOwner`) |
| `members` закрытого space | владелец space. Участник может только выйти сам, а в `autoJoin`-space добавить себя |
| Удаление закрытого space | владелец space |
| Открытый space без владельцев | кто угодно, без ограничений |
| Закрытый space без владельцев (личные сообщения) | `private` и `owners` - только `Admin`, остальное - участники |

Отказ: `ForbiddenKind.SpaceOwnerOnly`, для закрытого space без владельцев - `ForbiddenKind.SystemOnly` (текст по умолчанию "Нет доступа"). Архивация space этой проверкой не ограничена.

## 3. Владелец воркспейса

`Owner` обходит только проверку изменения самого space (`spaceSecurity.ts:441`). Отсюда:
- Может закрыть чужую встречу или канал, сменить участников, удалить закрытый space.
- Не читает и не пишет содержимое закрытого space, где он не участник. Чтобы работать с содержимым, нужно вступить. Для встреч это экран "Присоединиться" (`docs/features/office-meetings.md`, п. 8).
- Сами личные space (`PersonSpace`) меняет только система, отказ - `ForbiddenKind.SystemOnly` (`spacePermissions.ts`).
- Рассылку изменений самого закрытого space получает, рассылку его содержимого - нет (`space_security_broadcasts.md`).

## 4. Разрешения ролей в типизированных space

У типизированного space (проект трекера, тимспейс документов, диск) есть тип с ролями, у ролей - разрешения (`core.class.Permission`). Например, "Forbid create project" (`models/tracker/src/permissions.ts`) или "Forbid delete object" у документов. Проверяет `SpacePermissionsMiddleware` (`spacePermissions.ts`). Отказ: `ForbiddenKind.SpaceRole`.

## 5. Причина отказа на клиенте

Сервер отдаёт `Forbidden` с `params.kind` (`ForbiddenKind`, `foundations/core/packages/platform/src/status.ts`). `ReadOnlyAccessMiddleware` по `kind` выбирает текст уведомления: модалка про повышение роли показывается только для `WorkspaceRole`, остальные причины дают уведомление "Нет доступа". Повторы одного `kind` схлопываются в одно уведомление. Каждый отказ пишется событием аналитики `PermissionDenied` с полями `kind`, `txClass`, `objectClass`, `objectSpace`, `role`.

Через этот путь идут только транзакции. Отказы RPC аккаунт-сервиса (роли участников, приглашения) обрабатываются отдельно.

## 6. Администраторы платформы (админка)

Отдельная модель, с `AccountRole.Admin` не связана. Права дают не роль в воркспейсе, а email аккаунта.

| Кто | Откуда | Что может |
| --- | --- | --- |
| Админ | env `ADMIN_EMAILS` аккаунт-сервиса (`server/account/src/admin.ts`) | Админ-панель: аккаунты, воркспейсы, подписки, аудит, разрушительные операции |
| Billing-админ | env `BILLING_EMAILS` | Админ-панель только на чтение |

- При логине под таким email токен получает `extra.admin` или `extra.billingAdmin`. Каждая операция админки требует человеческий логин (не сервисный токен) и свежую сессию, подтверждённую одноразовым кодом из письма. Разрушительные операции дополнительно требуют свой код. Код: `requireAdminSession`/`requireAdminOp` (`server/account/src/adminOp.ts`), детали в `features/auth-onboarding.md`, п. 6.
- Каждое действие пишется в аудит (`logAdminAction`, таблица `admin_action`).
- Роль админа в воркспейсе не повышается. Если админ не участник воркспейса, он туда не войдёт (`server/account/src/utils.ts`, комментарий "No admin escalation here").
- Заглянуть в чужой воркспейс админ может только через `adminImpersonate` (`server/account/src/serviceOperations.ts`):
  - только от имени реального участника и с его ролью;
  - сессия на 30 минут, только чтение;
  - любая запись отклоняется со статусом `WorkspaceReadOnly` (`foundations/server/packages/server/src/client.ts`);
  - факт входа пишется в аудит.

`ForbiddenKind.ForeignPrivateWrite` к админке не относится. Его бросает `PrivateMiddleware` (`private.ts`), когда транзакция в домен личных настроек подписана чужим `modifiedBy`.

## Связанные документы

- [space_security_broadcasts.md](space_security_broadcasts.md) - кому уходят изменения.
- [tx_security_fixes.md](tx_security_fixes.md) - исправления безопасности приёма транзакций.
- [love.md](love.md), раздел про права встреч.
- [memory/presence_forbidden_private_space.md](memory/presence_forbidden_private_space.md) - история с модалкой у владельца.
