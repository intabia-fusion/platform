# Admin plugin refactor (2026-07-03)

Админка вынесена из login в отдельное трио `plugins/admin{,-assets,-resources}`, роут `/admin`.

## Решения
- Auth: без токена AdminApp рендерит `login.component.LoginApp` inline (runtime resource id, не компиляционная зависимость); с токеном — гейт `isAdminUser()` (JWT `extra.admin`). Собственной формы логина нет — сознательно.
- `AdminWorkspaces.svelte` (~1180 строк) разбит: `AdminPanel` (свитчер, грузит workspaces по ticker) + `tabs/{Workspaces,Accounts,Billing}Tab`. Workspaces передаются пропсом в Workspaces/Billing табы.
- Hardcoded строки переведены в intl `admin.string.*` (en/ru реальные, остальные 10 локалей — копия en); динамические (`Mass Archive N`) остались `getEmbeddedLabel`.
- admin-resources НЕ зависит от login-resources: 4 обёртки (getAccountClient/getAllWorkspaces/getRegionInfo/performWorkspaceOperation) скопированы в свой utils.ts (упрощены: без navigate-редиректов, auth решается в AdminApp).
- `/login/admin` -> redirect на `/admin` в LoginApp.updatePageLoc (закладки живы); `'admin'` убран из login pages.

## Структура под rebase foundation-веток
- Имена совпадают с веткой `admin-panel` в foundation-репо (adminId, AdminApp, adminPages c зарезервированным 'totp'): TOTP-шаг (AdminLogin/AdminTotpForm + verifyAdminTotp в account) приедет rebase'ом.
- AI-Billing табы из FUSIO-886 (AdminBillingApp: Models/Spaces/Calculator) встают как новые вкладки AdminPanel.

## Server-side API (2026-07-04)
- Новые admin-only RPC в account: `listWorkspacesPaged` (search/modes/region/attemptsGte/sort/order/skip/limit, COUNT OVER() total), `getWorkspacesSummary` (byMode все; byRegion/byVersion только active), `getRegistrationStats` (workspace.created_on + account_events 'account_created').
- jsonb-ключи `backup_info`/`usage_info` в БД - snake_case (convertKeysToSnakeCase на записи): сортировки `->>'last_backup'`, `->>'backup_size'`.
- Старый `listWorkspaces` не тронут - его зовут tool/backup/workspace-сервисы.
- WorkspacesTab самозагружается (страницы по 50); клиентскими остались Activity-sort и Inactive-фильтр (live stats страницы). BillingTab грузит имена через listWorkspacesPaged(limit 1000).
- Поллинг: refresh-кнопка + авто 5 мин (refreshTick prop во все табы), ticker-полл списка убран.
- Дев-стенд: account в docker - после правок сервера нужен `rush fast-build:docker` + `docker compose up -d account`.

## Реструктуризация вкладок (2026-07-04, вторая итерация)
- Вкладки General/Workspaces/Accounts; BillingTab удалён — подписки per-workspace в Details-попапе (Dialog из ui) + создание с полем мест (per-seat: usersLimit=seats).
- `getWorkspaceActivityStats` — SQL к public.tx (та же PG что account в текущем деплое); try/catch -> [] для multi-instance.
- Expandable-группы: `bind:expanded={expandedGroups[k]}` чтобы refresh не схлопывал (литеральный prop сбрасывается при invalidate).
- usage_info/backup_info jsonb: в БД snake_case, клиент видит camelCase (convertKeysToCamelCase рекурсивен).

## Грабли
- `WorkspaceUserOperation` экспортируется из `@hcengineering/core`, НЕ из account-client.
- rush check: svelte строго `^4.2.20` (mismatch ломает rush update).
- Регистрация фронт-плагина = 4 точки в dev/prod/src/platform.ts (import, assets bundle, addStringsLoader, Routes map + addLocation) + те же в desktop/src/ui/platform.ts + оба package.json + rush.json.

## Управление участниками + подписки + rename + OTP (2026-07-06..07)
Новые admin-only RPC в account (serviceOperations.ts):
- requestAdminOperationOtp/verifyAdminOtp: OTP на email админа, TTL 5 мин (ADMIN_OTP_TTL_SEC), sendOtp получил параметр ttlSec. Один код = одна операция (deleteMany после verify).
- adminUpdateWorkspaceRole/adminAddWorkspaceMember/adminRemoveWorkspaceMember: с OTP, assignableRoles guard, ensureNotLastOwner.
- performWorkspaceOperation: delete/archive/migrate-to теперь требуют OTP ТОЛЬКО для human-admin (isAdminUser = extra.admin==='true' && account!==systemAccountUuid && extra.service===undefined); system/service токены exempt. Клиент: performWorkspaceOperationWithOtp.
- adminReindexWorkspace/adminReindexAllWorkspaces: producer QueueTopic.Fulltext (accountPlugin.metadata.FulltextQueue, сетапится в account-service/index.ts), event workspaceEvents.fullReindex().
- adminUpdateSubscription (seats/periodEndMs) / adminCancelSubscription: история через supersedeSubscription (старую -> canceled ADMIN_EDITED/providerData.supersedes, insert новой). adminCreateSubscription теперь ставит periodEnd (periodDays default 30).
- adminUpdateWorkspaceName / adminUpdateWorkspaceUrl: db.workspace.update; url unique-check через getWorkspaceByUrl -> WorkspaceAlreadyExists.
UI: AdminOtpDialog (Card, countdown ticker1), EditSubscriptionDialog, CreateWorkspaceDialog. WorkspaceDetails: члены с role-dropdown+remove(OTP)+add(OTP), Reindex, name/url inline edit, subs Edit/Cancel. WorkspacesTab: Create workspace + Reindex all кнопки, destructive ops через otpGuardedOp. scroll-list (max-height 14rem) на members/subs/account-ws таблицах.
ГРАБЛИ: WorkspaceUserOperation из @hcengineering/core (не account-client). Circular import utils<->AdminOtpDialog ОК (getAccountClient зовётся лениво в функции).
