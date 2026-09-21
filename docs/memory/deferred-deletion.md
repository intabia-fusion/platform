# Отложенное удаление пространств и аккаунтов

Спека: `foundation-tasks/docs/admin/2026-09-10-101-deferred-deletion.md` (блок TSK-2026-09-10-101..200).

## Модель

Две колонки `delete_on` (миграции v42 workspace_status, v43 account) вместо новых режимов.

Пространство: `deleteOn` выставлен, mode остаётся `active` -> 7 дней readonly -> планировщик
переводит в `archiving-pending-backup` -> `archived` -> в `deleteOn` переводит в `pending-deletion`.
`archived` без `deleteOn` - это по-прежнему ручной архив админа, он не истекает.

Отмена (`cancel-delete`) снимает только `deleteOn` и не трогает mode: "не удаляй", а не "отменить
архивацию". Если к моменту отмены пространство уже уехало в архив, оно там и остаётся - обратно
его возвращает отдельный `unarchive`. Поэтому `delete` разрешён и для `archived`: такое
пространство просто ждёт дедлайн, а readonly-окно к нему не применяется.

Аккаунт: только метка, ничего не чистится. Логин работает, `LoginInfo.deleteOn` заставляет клиента
спросить, отменять ли удаление. `cancelAccountDeletion` - явное действие, автоотмены на входе нет.

## Что переиспользовано, а не написано

- Readonly: `extra.readonly === 'true'` в токене. Транзактор режет все транзакции
  (`foundations/server/packages/server/src/client.ts:263`), collaborator открывает документы на
  чтение (`server/collaborator/src/extensions/authentication.ts:45`).
- Архивирование и восстановление: существующая цепочка `archiving-*` -> `archived` -> `unarchive`.
- Отказ во входе для архива: транзактор на `isArchivingMode`
  (`foundations/server/packages/server/src/sessionManager.ts:679`).

## Ловушки, найденные по ходу

- `selectWorkspace` намеренно выдаёт токен архивированного пространства: `performWorkspaceOperation`
  требует токен того же пространства (`serviceOperations.ts:921`), и без этого токена `unArchive`
  из UI не вызвать. Добавлена альтернатива - проверка роли Owner на целевом пространстве.
- `doCleanup` (`server/workspace-service/src/service.ts:408`) игнорирует параметр `cleanIndexes` и
  всегда сносит только БД. Блобы не удаляет ни архивирование, ни удаление - открытый хвост
  TSK-2026-09-10-166.
- Очистка поля через `undefined` в `Operations<T>`: `buildUpdateClause` берёт `Object.keys(ops)`,
  так что ключ со значением `undefined` попадает в SET и становится NULL.
- В тестах `process.env.X = undefined` записывает строку "undefined" и ломает `parseInt` в
  последующих тестах - восстанавливать через `delete`.
- Ожидаемые SQL-строки в `postgres.test.ts` перечисляют колонки статуса буквально: любое поле в
  json_build_object нужно добавить и туда.

## Конфигурация

`DELETION_GRACE_DAYS` (21), `DELETION_READONLY_DAYS` (7) - account-service.
`DELETED_RETENTION_DAYS` (было 7, стало 1) - backup pod; 0 и меньше выключает чистку архива,
этим пользуется одноразовый пайплайн workspace-service.

## CI PR #434

**Бесконечный reload страницы логина (uitest-pg, uitest-qms).** Дублирующийся IntlString: я добавил
`Copied` в `plugins/login/src/index.ts`, а он уже объявлен в mergeIds
`plugins/login-resources/src/plugin.ts:44`. `identify()` падает с
`Error: 'identify' overwrites 'Copied' for login:string`, следом `failed to load login
TypeError: t.default is not a function`, и `LoadHelper` (`dev/prod/src/platform.ts:440`) после 5
попыток делает `location.reload()` - по кругу. Проверять новые строки на пересечение с mergeIds
соответствующего *-resources.

Диагностируется так: собрать `dev/prod` (`rushx package`), `docker cp dist/. sanity-front0-1:/app/dist/`
и открыть страницу - в консоли видно всё сразу. По логам CI не видно ничего: артефакты Playwright
консоль браузера не сохраняют, а в логах account-пода запросов от браузера просто нет.

**BIGINT приезжает строкой.** `delete_on` не был в `timestampFields` коллекций, поэтому
`workspaceStatus`/`account` отдавали `deleteOn` как `"1791056586129"`. В UI это `new Date(строка)` -
Invalid Date. Лечится добавлением поля в `timestampFields` (`postgres.ts:464` и `:595`), после чего
отсутствующее значение приезжает как `null`, а не `undefined`.

## Немедленное удаление (админ)

`delete-now` в `WorkspaceUserOperation`: mode -> `pending-deletion`, `isDisabled`, `deleteOn` сбрасывается,
attempts обнуляются. Кнопки "Delete now" на вкладках Workspaces и Accounts (у аккаунта это
`deleteAccount(force=true)` -> `purgeAccount`). Не-админу недоступно: self-service список в
`performWorkspaceOperation` - только `unarchive` и `cancel-delete`.

## Что вскрылось при проверке на стенде

- **Чистка аккаунта падала на FK.** `subscription_account_fk` и `workspace_permissions_account_fk`
  - единственные оставшиеся ссылки на `account` (остальные миграции перевели на `person`).
  Обе колонки NOT NULL, поэтому `deleteAccount` (`postgres.ts`) теперь удаляет эти строки перед
  удалением аккаунта. Касалось и отложенного `sweepScheduledDeletions`, не только force.
- **Пометка аккаунта молча не срабатывает**, если он единственный владелец живого пространства:
  сервер отдаёт Forbidden, а AccountsTab просто пишет в консоль. Сначала пространство - потом аккаунт.
- **Пайплайн удаления живёт только при `WS_OPERATION=all+backup`** (`getPendingWorkspace` отдаёт
  `pending-deletion` только для этого режима). На стенде `tests/` его нет, есть в `ws-tests/`.
  Поэтому sanity-тест ждёт `pending-deletion`, а не `deleted`.
- **CI uitest-workspaces (PR #434).** `AdminPage.gotoAdmin` уходил на `/login/admin` до того, как
  редирект логина завершится: сессия терялась, панель отдавала форму логина, тест падал на
  `[data-id="tab-workspaces"]`. Ожидание `selectWorkspace|workbench` перенесено внутрь `gotoAdmin`.

## Блокировка аккаунта (админ)

`account.blocked_on` (миграция v44). Проверка - `ensureNotBlocked` (`utils.ts`) в четырёх точках выдачи
токена: `login`, `validateOtp`, `loginOrSignUpWithProvider`, `selectWorkspace`. Уже выданный
workspace-токен транзактор проверяет сам, без похода в account, поэтому открытая вкладка живёт до
следующего `selectWorkspace` (не дольше времени жизни токена). RPC `adminSetAccountBlocked` -
OTP + audit, себя заблокировать нельзя. Фильтр `blockedOnly` в `listAccounts`.

## Обратная связь в админке

`runAdminAction` (`admin-resources/src/utils.ts`) показывает MessageBox с переводом статуса вместо
`console.error`; `false` от `performWorkspaceOperation` (ops == 0) тоже виден. Перед удалением
аккаунта панель спрашивает `canDeleteAccount(uuid)` - он теперь принимает чужой uuid для админа и
возвращает `canDelete: false` ещё и тогда, когда админ удаляет сам себя (совпадает с `deleteAccount`).

## "Удалить сейчас" как галка

`OtpConfirmDialog` с `optionLabel` закрывается объектом `{ code, option }` вместо строки; без пропа
контракт прежний. Отдельная кнопка DeleteNow убрана и в Accounts, и в Workspaces.

## Окна отсрочки в текстах

`getDeletionPolicy` (публичный RPC) отдаёт `graceDays`/`readonlyDays` из ENV; строки подтверждения
берут их параметрами (`{days}`, `{readonlyDays}`, ICU plural в ru/en/cs). Раньше 7 и 21 были
зашиты в переводы - замечание из ревью PR #434. Сами переменные проброшены в `dev/docker-compose.yaml`
и `ws-tests/docker-compose.yaml`.

## Письма

`notifyWorkspaceDeletionScheduled` - владельцам: дата и ссылка на отмену, а при `delete-now` (и при
финальном переводе в `pending-deletion` из sweep) текст без отмены. `notifyAccountDeletion` - на
email аккаунта; при purge отправляется ДО `db.deleteAccount`, иначе адрес уже обезличен.
Строки - `server/account/lang` (en + ru, остальные языки падают на en).

Код подтверждения: `sendOperationOtp` общий для админки и self-service, шаблон выбирает точка входа
(`OtpKind`): `requestAdminOperationOtp` -> `AdminOtp*`, `requestOperationOtp` -> `OperationOtp*`. До
этого владелец при удалении своего пространства получал письмо "действие администратора... введите в
админ-панели". На стенде не видно: при `ADMIN_OTP_DEV_CODE` письмо с кодом не отправляется вовсе.

`notifyWorkspaceDeletionScheduled` берёт `schedule?: {deleteOn, readonlyDays}` вместо голого `deleteOn`;
`readonlyDays: 0`, если пространство уже было `archived` на момент планирования (ICU-plural с веткой
`=0` во всех 11 локалях `server/account/lang` убирает фразу про read-only). `sweepScheduledDeletions(ctx,
db, brandings)` резолвит branding письма через `getBranding(brandings, workspace.branding)` из
`@hcengineering/core`; у `purgeAccount` источника языка нет - `Account.locale` есть в типе, но нигде не
пишется в server/account, поэтому остаётся `null`.

`cancelAccountDeletion` шлёт `notifyAccountDeletionCancelled` ("аккаунт снова активен" + напоминание, что
отправленные на удаление пространства остаются запланированными). Только если `deleteOn` реально стоял:
RPC вызывается и без метки, письмо на каждый такой вызов было бы спамом.

Локали писем: файл в `server/account/lang` сам по себе ничего не даёт - строки отдаёт загрузчик в
`server/account-service/src/index.ts` (`accountStrings`), и до FUSIO-1339 он знал только `en`/`ru`, остальные
9 файлов не читались вовсе. Новая локаль = файл + строка в `accountStrings`. Паритет ключей и плейсхолдеров
с `plugin.ts`/`en.json` держит `server/account/src/__tests__/lang.test.ts` (так нашлась опечатка
`InviteSubjectRU` в `ru.json`: тема приглашения на русском молча уходила по-английски).

`notifyWorkspaceDeletionCancelled` - владельцам, из `performWorkspaceOperation`: на `cancel-delete` и на
`unarchive` пространства с `deleteOn` (он тоже снимает срок). Фраза о текущем состоянии - ICU select по
`state`: `active` / `archived` (отмена архивацию не откатывает) / `restoring`. В e2e после `cancel-delete`
письмо надо дождаться, а не сразу `clearMail`: оно идёт через очередь и иначе прилетит в следующий тест.


## Почта на ws-стенде

У `ws-tests` не было ни mailpit, ни сервиса `mail`, поэтому OTP регистрации и входа некуда было
доставить (`ADMIN_OTP_DEV_CODE` перекрывает только `verifyOperationOtp` - админские операции и
self-service подтверждения, но не `sendOtp`). Добавлены `mail` + `mailpit` в
`ws-tests/docker-compose.yaml`, UI на 8026 и SMTP на 1026 (у dev-стенда 8025/1025, чтобы жили рядом).

`MODE=server` только раздаёт письма подключённому mail-клиенту и без него висит в
`request waiting for available client`. Нужен `MODE=queue`: читает очередь уведомлений и шлёт в SMTP
сам (`services/mail/pod-mail/src/main.ts:145`). API_KEY при этом не нужен.

Письма об удалении проверяются через mailpit API в
`ws-tests/api-tests/src/__tests__/deletion-emails.test.ts` (хелперы `waitForMail`/`mailBody`/
`clearMail` в `admin.fixtures.ts`).
