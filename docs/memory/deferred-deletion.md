# Отложенное удаление пространств и аккаунтов

Область: [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)

## Модель

Две колонки `delete_on` (миграция v43 `workspace_status`, v44 `account`) вместо новых режимов жизненного цикла.

Пространство: `deleteOn` выставлен, mode остаётся `active` -> 7 дней readonly -> планировщик переводит в `archiving-pending-backup` -> `archived` -> по достижении `deleteOn` переводит в `pending-deletion`. `archived` без `deleteOn` - это ручной архив админа, он не истекает.

Отмена (`cancel-delete`) снимает только `deleteOn` и не трогает mode: "не удаляй", а не "отменить архивацию". Если пространство уже уехало в архив, оно там и остаётся - обратно возвращает отдельный `unarchive`. Поэтому `delete` разрешён и для `archived`: такое пространство просто ждёт дедлайн, readonly-окно к нему не применяется.

Аккаунт: только метка, ничего не чистится сразу. Логин работает, `LoginInfo.deleteOn` заставляет клиента спросить, отменять ли удаление. `cancelAccountDeletion` - явное действие, автоотмены на входе нет.

## Семантика purge

`person` и `social_id` не удаляются, а обезличиваются - строки нужны, т.к. на `person` ссылаются `workspace.created_by`/`billing_account` (FK без ON DELETE), а `_id` социального идентификатора продолжает резолвиться в данных пространств.

- `social_id`: `value` -> `value#<_id>`, `isDeleted: true`, `verifiedOn` сброшен - email свободен для новой регистрации, сам идентификатор не переиспользуется.
- `person`: `firstName`/`lastName`/`phoneHint` очищены, строка остаётся.
- Hard delete: `account` (+`account_passwords` явным DELETE, FK без CASCADE), `workspace_members`, `user_profile`, `mailbox`/`mailbox_secrets`, `integrations`/`integration_secrets`, `subscription` и `workspace_permission` (`subscription_account_fk`/`workspace_permissions_account_fk` - обе NOT NULL, чистятся перед удалением строки account).

Гвард "единственный owner" - одно правило для self и админа: нельзя удалить аккаунт, пока человек единственный owner пространства, которое не в `isDeletingMode` и у которого `deleteOn == null` (пространство уже поставленное на удаление гвард не блокирует). - `findOrphanedWorkspaces`, `server/account/src/deletion.ts`; наружу торчит read-only RPC `canDeleteAccount`.

Не удаляется при удалении пространства: дропается только БД (`server/workspace-service/src/service.ts`, `doCleanup`). Остаются блобы в S3/datalake (потребителя `QueueWorkspaceEvent.Deleted` для очистки блобов нет), бэкапы (backup-воркер только пропускает неактивные, `deleteRecursive` у S3-стораджа - заглушка).

## Что переиспользовано, а не написано

- Readonly: `extra.readonly === 'true'` в токене - транзактор режет все транзакции (`foundations/server/packages/server/src/client.ts`), collaborator открывает документы на чтение (`server/collaborator/src/extensions/authentication.ts`).
- Архивирование и восстановление: существующая цепочка `archiving-*` -> `archived` -> `unarchive`.
- Отказ во входе для архива: транзактор на `isArchivingMode` (`foundations/server/packages/server/src/sessionManager.ts`).
- `selectWorkspace` намеренно выдаёт токен архивированного пространства: `performWorkspaceOperation` требует токен того же пространства, и без него `unArchive` из UI не вызвать - альтернатива для этого случая - проверка роли Owner на целевом пространстве.

## Ловушки

- `doCleanup` игнорирует параметр `cleanIndexes` и всегда сносит только БД - блобы не удаляет ни архивирование, ни удаление.
- Очистка поля через `undefined` в `Operations<T>`: `buildUpdateClause` берёт `Object.keys(ops)`, поэтому ключ со значением `undefined` попадает в SET и становится NULL.
- В тестах `process.env.X = undefined` записывает строку `"undefined"` и ломает `parseInt` в последующих тестах - восстанавливать через `delete`.
- Ожидаемые SQL-строки в `postgres.test.ts` перечисляют колонки статуса буквально - новое поле в `json_build_object` нужно добавить и туда.
- Новый `IntlString`, объявленный в клиентском плагине (`login`), может пересекаться с ключом, уже объявленным в `mergeIds` соответствующего `*-resources` - `identify()` падает, `LoadHelper` после 5 неудачных попыток загрузки уходит в `location.reload()` по кругу; в консоли браузера видно причину, в логах пода - нет.
- `delete_on` должен быть в `timestampFields` коллекции (`postgres.ts`), иначе `deleteOn` в ответе API приходит как строка миллисекунд (`"1791056586129"`), и `new Date(строка)` в UI даёт Invalid Date.

## Немедленное удаление и блокировка (админ)

`delete-now` (`WorkspaceUserOperation`): mode -> `pending-deletion`, `isDisabled`, `deleteOn` сбрасывается, attempts обнуляются; для аккаунта - `deleteAccount(force=true)` -> `purgeAccount`. Не-админу недоступно: self-service список в `performWorkspaceOperation` - только `unarchive` и `cancel-delete`.

`account.blocked_on` (миграция v45). Проверка - `ensureNotBlocked` (`server/account/src/utils.ts`) в четырёх точках выдачи токена: `login`, `validateOtp`, `loginOrSignUpWithProvider`, `selectWorkspace`. Уже выданный workspace-токен транзактор проверяет сам, без похода в account, поэтому открытая вкладка живёт до следующего `selectWorkspace`. RPC `adminSetAccountBlocked` - OTP + audit, себя заблокировать нельзя.

`runAdminAction` (`admin-resources/src/utils.ts`) показывает MessageBox с переводом статуса вместо `console.error`. Перед удалением аккаунта панель спрашивает `canDeleteAccount(uuid)` - он принимает чужой uuid для админа и возвращает `canDelete: false` и тогда, когда админ удаляет сам себя.

## Окна отсрочки и письма

`getDeletionPolicy` (публичный RPC) отдаёт `graceDays`/`readonlyDays` из ENV; строки подтверждения берут их параметрами (ICU plural во всех локалях `server/account/lang`) вместо захардкоженных чисел.

`notifyWorkspaceDeletionScheduled` - владельцам, с датой и ссылкой на отмену; при `delete-now` (и при финальном переводе в `pending-deletion` из sweep) - текст без отмены. Принимает `schedule?: {deleteOn, readonlyDays}`; `readonlyDays: 0`, если пространство уже было `archived` на момент планирования - ICU-plural с веткой `=0` убирает фразу про read-only.

`notifyAccountDeletion` - на email аккаунта; при purge отправляется до `db.deleteAccount`, иначе адрес уже обезличен. Код подтверждения (`sendOperationOtp`) общий для админки и self-service, шаблон выбирает точка входа (`OtpKind`): `requestAdminOperationOtp` -> `AdminOtp*`, `requestOperationOtp` -> `OperationOtp*` - без этого владелец при удалении своего пространства получал письмо "действие администратора..." вместо своего.

`sweepScheduledDeletions` резолвит branding письма через `getBranding`; у `purgeAccount` источника языка нет - `Account.locale` есть в типе, но нигде не пишется в `server/account`, поэтому остаётся `null`.

Локали писем: файл в `server/account/lang` сам по себе ничего не даёт - строки отдаёт загрузчик `accountStrings` (`server/account-service/src/index.ts`), который должен явно знать каждую локаль; до FUSIO-1339 знал только `en`/`ru`. Паритет ключей и плейсхолдеров с `plugin.ts`/`en.json` держит `server/account/src/__tests__/lang.test.ts`.

`notifyWorkspaceDeletionCancelled` - владельцам, из `performWorkspaceOperation`: на `cancel-delete` и на `unarchive` пространства с `deleteOn` (он тоже снимает срок). Фраза о текущем состоянии - ICU select по `state`: `active`/`archived` (отмена не откатывает архивацию)/`restoring`.

## Почта на ws-стенде

`ws-tests` без mailpit/сервиса `mail` - OTP регистрации и входа некуда доставить (`ADMIN_OTP_DEV_CODE` перекрывает только `verifyOperationOtp` - админские операции и self-service подтверждения, но не `sendOtp`). `MODE=server` у `pod-mail` только раздаёт письма подключённому mail-клиенту и без него висит; нужен `MODE=queue` - читает очередь уведомлений и шлёт в SMTP сам, API_KEY при этом не нужен.

## Аренда бэкапа

`workspace_status.backup_lease_until`/`backup_lease_owner` (миграции v46/v47). `updateBackupLease`: acquire требует `mode='active' AND is_disabled IS NOT TRUE` и свободный/истёкший/свой lease; renew требует `owner=X AND mode='active'` (смена mode - мгновенный отказ renew, а не ожидание конца бэкапа); release снимает по `owner=X`. `getPendingWorkspace` не отдаёт `migration-*`/`archiving-*`/`restoring`/`deleting` с живым чужим lease.

## Selfhost

`getPendingWorkspace` отдаёт `pending-deletion`/`archiving-*`/`restoring`/`migration-*` только при `WS_OPERATION=all+backup`; дефолт `all` берёт лишь создание и апгрейд - без явной переменной `delete-now` висит в `pending-deletion` навсегда. На selfhost backup-service нет, поэтому очистка архива удалённого через архивацию пространства не работает.

## Readonly после cancel-delete

`selectWorkspace` копирует `extra` из входящего токена (клиент передаёт текущий workspace-токен). Readonly по статусу (`isReadOnlyWorkspace`) переезжал в каждый новый токен и переживал отмену удаления - readonly по статусу теперь помечается отдельным полем и сбрасывается при следующем select; readonly без метки (impersonation) переносится как раньше. Токены, выданные до фикса, не имеют метки - нужен перелогин.

Второй слой той же проблемы: LRU-кэш `decodeToken` (`foundations/core/packages/token`) отдаёт один и тот же объект, а `selectWorkspace` мутировал `decodedToken.extra` на месте - логин-токен без `iat` детерминирован, поэтому каждый новый логин попадал в испорченную запись кеша. Кеш хранит и отдаёт `structuredClone`.

## Тесты

`server/account/src/__tests__/{deletion-real,deferred-deletion}.test.ts` - реальная БД, инварианты purge/FK, `findOrphanedWorkspaces`/`purgeAccount`. `ws-tests/api-tests/src/__tests__/{identity-deletion,deletion-emails,account-blocking}.test.ts` - сквозной путь через админский RPC и почту (mailpit), требует поднятый стенд.

## Связанные документы

- [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)
- [Account DB migrations](account_db_migrations.md)
