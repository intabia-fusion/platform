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
