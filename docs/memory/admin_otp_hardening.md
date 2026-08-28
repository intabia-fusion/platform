# Admin/OTP hardening

План: `../foundation-tasks/admin-otp-plan.md` (этапы T, A0-A5). Идёт до ротации токенов.

## T - стенд и тесты (сделано)

- `ws-tests/docker-compose.yaml`: `BILLING_EMAILS=billing`; `ws-tests/prepare.sh`: аккаунт `billing`/`1234`
  (read-only админ для теста 8).
- `ws-tests/api-tests/src/__tests__/admin.fixtures.ts` - сырой `fetch` к account RPC. Причина: тесты
  вызывают методы, которых ещё нет (`verifyAdminSession`, `adminSetMaintenance`, ...); типизированный
  `AccountClient` уронил бы компиляцию всего файла вместо отдельного кейса.
- `admin-gates.test.ts` - 15 кейсов, каждый помечен этапом. Красные до своего этапа.
- Account при обработанной ошибке отвечает HTTP 200 с телом `{ error: Status }` (`utils.ts` `wrap`),
  поэтому фикстуры смотрят на `body.error.code` (`platform:status:Forbidden` и т.п.), а не на HTTP-код.
- `admin-otp.test.ts` пока оставлен: он фиксирует текущее поведение system+admin токена и удаляется
  вместе с A0 (его кейс 6 в `admin-gates` утверждает обратное).
- Unit `admin-op.test.ts` отложен до A1: модуля ещё нет, файл сломал бы `_phase:validate` пакета.

## A0 - human vs service (сделано)

`admin: 'true'` теперь минтится **только при человеческом логине** (`operations.ts:242` пароль,
`:555` OTP, `utils.ts:1845` провайдер).

- `server/account/src/admin.ts`: `isHumanAdmin({ account, extra })` - admin-флаг И не `systemAccountUuid`
  И без `extra.service`. Заменил inline-проверку в `performWorkspaceOperation`.
- `serviceOperations.ts`: `billing` добавлен в allowlist `listWorkspaces`; `updatePurchaseStatus`
  перешёл с admin-ветки на allowlist сервисов `['payment', 'ai-bot']`.
- `createManualSubscription` вынесен из `adminCreateSubscription` и экспортирован из пакета: CLI
  `set-workspace-plan` пишет в account DB напрямую, без admin-токена. Продюсер `WorkspaceQueue`
  выставляется в CLI вручную, иначе `publishLimitsEvents` тихо пропускает событие плана.
- `pods/stats`: `isStatsAdmin` принимает `service === 'tool'` наравне с admin - единственный под, где
  проверка была только по admin-флагу. Транзактор/datalake/preview/payment/billing пропускают
  `systemAccountUuid`, поэтому их править не пришлось.
- `server/tool/src/utils.ts` `getToolToken` без `admin: 'true'`. Безопасно: `selectWorkspace` отдаёт
  системному аккаунту `AccountRole.Admin` **до** ветки admin-эскалации (`utils.ts:944-961`).
- Сняты флаги в `services/{ai-bot,billing}`, `dev/benchmarks/profiler.ts`, `dev/tool/src/{github,gmail,calendar,markup,restoreGithub}.ts`.
- Убрана опция `generate-token --admin` в `dev/tool`: после A1 такой токен всё равно бесполезен (нет `mfaAt`).

Не сломано: `*-real.test.ts` в `server/account` падают и на чистом develop (нужна живая БД).

## A1 - админ-сессия (сделано)

- `server/account/src/adminOp.ts`: `requireAdminSession` (admin|billingAdmin + свежий `extra.mfaAt`,
  `ADMIN_SESSION_TTL_SEC`, дефолт 12 ч), `verifyAdminOtpLimited` (5 неудач за 300 с по строкам
  `admin_action.otp_failed` -> сброс живого OTP + `Forbidden`), `requireAdminOp`.
- Отступление от плана: вместо `adminOp(…, fn)` сделан **гейт** `requireAdminOp(…)`. Вызывающие уже
  пишут свой `logAdminAction` после работы; обёртка над `fn` потребовала бы переписать 10 функций
  с лишним уровнем вложенности при том же порядке проверок.
- `checkAdmin`/`checkAdminRead` теперь идут через `requireAdminSession` - 20 call sites не тронуты.
  Отдельный `checkHumanAdminLogin` для двух точек, работающих ДО сессии: `requestAdminOperationOtp`
  и `verifyAdminSession`.
- `verifyAdminSession(otpCode)` -> токен с `extra.mfaAt`, аудит `admin_session`. `PUT /cookie`
  сохраняет `extra`, поэтому сессия переживает перезагрузку страницы.
- 10 мутаций переведены на `requireAdminOp`; `deleteAccount` тоже (его собственная admin-проверка
  выброшена как дубль).
- Клиент: `hasAdminSession()`/`openAdminSession()` в `admin-resources/utils.ts`, `AdminSessionGate.svelte`,
  `AdminApp` показывает форму кода до открытия сессии.
- `?token=` в query убран в 14 местах: `adminFetch()` в `admin-resources/utils.ts` кладёт
  `Authorization`, `fetchStatsJson` ходит через него; `SelectWorkspaceMenu.svelte` правлен инлайном.
  Серверам заголовок уже понятен, кроме stats `PUT /manage` - добавлен `extractAuthorizationToken`.
  Query-вариант пока принимается, снимается в A2.
- Фолбэк по тестам: `admin-otp.test.ts` удалён (его контракт противоположен кейсу 6); в `plan-*.test.ts`
  подделанные админ-токены получили `mfaAt` - они читают через `checkAdminRead`.

## A2 - покрытие (сделано)

- Под `requireAdminOp` доехали: `adminReindexWorkspace`, `adminReindexAllWorkspaces`,
  `adminUpdateWorkspaceName`, `adminUpdateWorkspaceDisabledFeatures`, `adminCreateSubscription`,
  `deleteAccount` и **все** события `performWorkspaceOperation` для human-admin (раньше только
  delete/archive/migrate-to). Добавлен аудит там, где его не было: `reindex`, `reindex_all`,
  `set_disabled_features`, `create_subscription`, `export_report`, `read_accounts`.
- Имена действий в гейте выровнены с именами в `logAdminAction` (`update_workspace_role` и т.д.):
  гейт пишет их в `forbidden.attempted`, расхождение читалось бы как другая операция.
- `QueueWorkspaceEvent.ForceClose` + consumer в `sessionManager` -> `forceClose(wsId)`. Клиент больше
  не рассылает force-close по всем транзакторам из браузера, а зовёт `adminForceCloseWorkspace`.
- `adminSetMaintenance` вместо `PUT /api/v1/manage?operation=maintenance` на account. Endpoint удалён
  целиком - других операций у него не было.
- `isHumanAdmin`/`hasAdminSession`/`ADMIN_SESSION_TTL_SEC` переехали в `@hcengineering/server-token`:
  подам нужен тот же предикат, а account-пакет им недоступен.
- Транзактор и stats: токен **только** из `Authorization`. `GET /api/v1/profiling` получил гейт
  (раньше пускал любой валидный токен). Гейт = `systemAccountUuid || (isHumanAdmin && hasAdminSession)`,
  без обращения к БД. Все серверные и CLI-вызовы (`server/tool`, `workspace-service`, `dev/tool`,
  `dev/benchmarks`, `slowsql`) переведены на заголовок.
- `force-maintenance` **оставлен**: план считал его дублем `maintenance`, но это per-workspace
  операция (`sessionManager.forceMaintenance`), а `maintenance` - глобальное предупреждение.
- Самообслуживание под user-OTP: `deleteWorkspace` всегда, `leaveWorkspace` только когда уходишь сам
  (удаление другого участника остаётся ролевым - иначе сломался бы штатный сценарий админа воркспейса).
  Новый `requestOperationOtp` для обычного пользователя + `OperationOtpDialog` в `setting-resources`.
- `getPersonInfo` намеренно **не** аудируется: панель резолвит участников по одному в цикле, запись на
  каждый вызов утопила бы журнал. Аудит стоит на страничных чтениях (`listAccounts`) и на выгрузках.
- Фолбэк по тестам: `plan-*.test.ts` больше не подделывают админ-токен - общий хелпер
  `adminSessionClient()` логинится человеком и открывает сессию. Юнит-моки `@hcengineering/server-token`
  должны подмешивать настоящие `isHumanAdmin`/`hasAdminSession` через `jest.requireActual`.
