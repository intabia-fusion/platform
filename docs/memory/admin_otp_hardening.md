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

## A3 - эскалации и impersonation (сделано)

Решение пользователя: **админ под impersonation только читает**, писать не нужно.

- Снято: admin-эскалация в `selectWorkspace` (`utils.ts`), в `verifyAllowedRole`, в `getWorkspaceInfo`
  и `getLoginInfoByToken` (`role = AccountRole.Admin` для не-участника), в `verifyMergePersonsAuthority`
  (сервисы `tool`/`workspace` остались), в `addSocialIdToPerson` (теперь только сервисы),
  в `ConfigurationMiddleware` (домен конфигурации - только Owner, `SessionData.admin` там больше не читается).
- `adminImpersonate(workspace, account, otpCode)` через `requireAdminOp`: цель обязана быть участником,
  токен = `{ impersonatedBy, readonly: 'true' }`, `exp` 1800, аудит `impersonate`.
- Запрет записи реализован **одной проверкой в `ClientSession.txRaw`** (`extra.readonly === 'true'`),
  а не новым полем в `SessionData`: сессия и так не пишет ничего, включая derived tx, и заодно
  ужесточается read-only-гость, у которого тот же claim.
- `SessionData.impersonatedBy` **не добавлял**: писать нельзя, значит атрибутировать нечего; кто и куда
  заходил, видно в `admin_action` и в самом токене.
- Клиент: кнопка «Смотреть как» в строке участника (`WorkspaceDetails.svelte`) -> токен ->
  `setMetadata(Token)` + `navigate([workbenchId, url])`. Auth-куку не трогаем, поэтому возврат в `/admin`
  восстанавливает админ-сессию из куки - для этого в `AdminApp` добавлен один повтор `getLoginInfoByToken`
  перед редиректом на логин.
- `selectWorkspace` копирует `extra` и `exp`, поэтому повторный обмен токена при заходе в workbench
  сохраняет и `readonly`, и получасовой срок.
- Известное следствие: кнопка «открыть воркспейс» в списке работает только если админ реально участник.
  Для остальных случаев - «Смотреть как».
- Юнит-тесты, кодировавшие снятые эскалации, переписаны на отказ (merge x2, addSocialIdToPerson).

## A4 - права админа в продуктовом UI (сделано)

`isAdminUser()` (клиентская проверка `extra.admin` в токене) больше не используется нигде, кроме
самой админки. Она давала права Owner в UI, которых сервер после A3 уже не признаёт - расхождение
кончалось бы «кнопка есть, запрос падает».

Снято:
- `workbench-resources/index.ts` - `IsOwner` теперь только по роли Owner.
- `Navigator.svelte` - админ больше не видит все пространства воркспейса, запрос всегда по `members`.
- `Workbench.svelte` - отключённый аккаунт отключён и для админа.
- `SelectWorkspaceMenu.svelte` - убран операторский оверлей (регион, размер бэкапа, дни простоя, url,
  число активных сессий) и опрос транзактора `/api/v1/statistics` раз в тик, который его кормил.
  Поиск по воркспейсам оставлен без гейта и показывается при списке длиннее восьми.
- `view-resources/utils.ts` - удаление чужих объектов только для Owner.
- `contact-resources/DeleteConfirmationPopup` - то же.
- `tracker-resources/ProjectPresenter` - открыть проект можно, только будучи его участником.
- `hr-resources/MonthView` - правка прошедших дат только для Owner.
- `setting-resources/WorkspaceSettings` - `adminOnly`-категории скрыты всегда (ни одна категория в
  коде такой флаг не ставит, так что видимого эффекта нет); в `Configure.svelte` убран мёртвый импорт.

`isAdminUser`/`isBillingAdminUser` в `packages/presentation` остаются - на них держится вход в `/admin`.

Пять ошибок `svelte-check` в `hr-resources` - в файлах департаментов, к правке отношения не имеют.

## A5 - фичи воркспейса и CLI (сделано)

- `WorkspaceDetails.svelte`: список override переехал под `Expandable`. В свёрнутом виде - сводка
  (текущий override или `-`), внутри - скроллируемый список чекбоксов и `Save`. Режим «Edit»
  выброшен: список считается реактивно из `DisabledFeatures` + текущего override, отдельного
  состояния `editingDisabledFeatures` больше нет. billingAdmin видит чекбоксы `readonly`.
- `dev/tool configure`: `--disable` теперь принимает список и `*` (симметрично `--enable`); пустая
  опция больше не даёт `['']`; `catch { console.trace }` убран, ошибка выходит наружу и процесс
  падает с ненулевым кодом; описание команды исправлено с «clean archived spaces».

## Sanity (сделано)

- `ws-tests/sanity/tests/model/admin.page.ts`: `gotoAdmin()` проходит форму второго фактора
  (`openAdminSession`, тот же dev-код) и ждёт вкладки. Селектор кода тот же, что у per-op диалога:
  `input[placeholder="Code"]` + кнопка `Confirm`.
- Новый `ws-tests/sanity/tests/workspace/impersonate.spec.ts`: владелец создаёт задачу, админ входит
  через «View as», видит её и НЕ может создать свою (транзактор режет запись read-only сессии).
- `tests/sanity/tests/API/Billing.ts`: `getAdmin()` теперь открывает админ-сессию через
  `verifyAdminSession`, все `adminCreateSubscription` получили `otpCode`. Без этого падал
  `_phase:validate` пакета `@hcengineering/tests-sanity`.

Проверено: `rush fast-build:lint --to @hcengineering/prod` и по каждому поду - 0 ошибок.
Прогон playwright не делал: стенд `ws-tests` не поднят.
