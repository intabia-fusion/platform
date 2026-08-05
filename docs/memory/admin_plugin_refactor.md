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

## Месячные графики + trial фильтры + сортировка аккаунтов (2026-07-31)
- RegistrationsChart: два раздельных месячных графика (аккаунты, пространства), 12 мес; агрегация по месяцам client-side из daily getRegistrationStats (сервер не менялся). Локализация меток месяца через toLocaleDateString($themeStore.language).
- listAccounts: новый опциональный sort ('name'|'lastVisit'); lastVisit аккаунта = MAX(workspace_status.last_visit) по его membership (login-событий в account_events нет — только account_created/password_changed; это приближение). AccountsTab: ButtonMenu сортировки + page-local группировка по бакетам (Today/Week/Month/Quarter/Year/Older/Never); группы консекутивные, т.к. сервер сортирует DESC NULLS LAST.
- WorkspacesPagedQuery.billingStatus (bs.status = $) — чекбокс "Trial" в WorkspacesTab (billingStatus='trialing'). ВАЖНО: WorkspacesPagedQuery продублирован в server/account/src/types.ts и account-client/src/types.ts — менять оба.
- PaymentsTab: чекбокс OnlyTrial — client-side фильтр s.status==='trialing' в таблице подписок.
- Графики 3-4 (paid/trial по месяцам): client-side из getAllSubscriptions; seatsByMonth() дедупит по workspaceUuid (смена плана/продление оставляют несколько строк с пересекающимися периодами — иначе двойной счёт мест). Label "пространства / места". Paid: tier, не trialing, provider не free/trial, amount>0. Trial: status trialing или trialEnd задан; интервал createdOn..trialEnd.

## Вкладка Statistics + перенос ServerManager из workbench (2026-07-31)
- Новая вкладка админки Statistics: services-таблица (из GeneralTab) + ServerManagerGeneral/ServerStatistics/Users. Графики остались на General.
- Код статистики ПЕРЕНЕСЁН из workbench-resources в admin-resources/src/components/statistics/ (ServerManagerGeneral/ServerStatistics/Users, MetricsStats, TopProblems, statsFetch + snappyjs dep и snappyjs.d.ts). MetricsInfo+Params(->MetricsParams) уехали в view-resources (экспорт MetricsInfo) — общие для admin и workbench.
- workbench ServerManager.svelte теперь лёгкий popup ТОЛЬКО клиентских метрик (uiContext.metrics), action 'Client statistics' в models/workbench открыт всем (secured убран).
- ServerManagerUsers в админке: workspacesStore/contact-resources заменены на listWorkspacesPaged-имена и plain userId (в /admin нет workspace-контекста, getClient()/stores недоступны).
- Reboot/profile транзактора: новый admin-only RPC getTransactorEndpoints (account, из RegionConfig regions[*].transactors external) + DropdownLabels выбора транзактора; operation=reboot (process.exit) вместо force-close. Транзакторный /api/v1/manage принимает admin session token (extra.admin==='true').
- admin-resources новые deps: view-resources, snappyjs (+@types/snappyjs dev).
- StatisticsTab разбит на 3 подтаба (TabList): Services (2 колонки: services-таблица | ServerManagerGeneral), LiveStats (ServerManagerServerStatistics), Users (ServerManagerUsers).
- "Users пусто" — НЕ баг: overview.workspaces у stats pod содержит только ЖИВЫЕ WS-сессии транзакторов (getStats() при отправке статистики); без подключённых клиентов список пуст. Проверено на дев-стенде: открытие воркбенча -> workspaces:1. Добавлен empty-state "No active workspace connections".
- Кнопка Force close в Users шлёт на stats /api/v1/manage?operation=force-close - stats pod поддерживает ТОЛЬКО wipe-statistics, кнопка мертва (не чинилась, вне запроса).
- Users: session userId резолвится в имя+email через getPersonInfo (кэш Map, батч Promise.all по уникальным uuid); getPersonInfo на сервере открыт для extra.admin==='true' (был только service-токенам). PersonInfo.personUuid опционален — ключевать кэш по запрошенному id, не по info.personUuid.
- Сервис-держатель соединения: token.extra.service добавлен в socket data транзактора (server_http). БАГ-ФИКС: entryToUserStats присваивал data: socket.data БЕЗ вызова (ConnectionSocket.data — accessor-функция) — data терялась при сериализации в stats; теперь socket.data(). UI Users показывает [service, ...] у группы юзера.
- pods/stats stale: фоновый sweep раз в 60s (удаление из map), isStale() фильтр в overview/analytics/GET statistics; мёртвый timeouts map удалён.
- CSV-отчёты (GeneralTab, ButtonMenu "Создать отчёт"): src/reports.ts — accounts (регистрация = min(socialIds.createdOn), поле есть в ответе listAccounts но отсутствует в core SocialId типе -> cast), workspaces (created/last_visit/days_inactive/billing), paid-workspaces (пересечение subscriptions+workspaces). Постранично по 1000, BOM ﻿ для Excel.
- PDF-отчёты: html2pdf.js@0.14 (dynamic import -> отдельный чанк), свой src/html2pdf.d.ts (типов у пакета нет). reports.ts рефакторен: builders возвращают Report{name,title,headers,rows}, downloadReport(id,'csv'|'pdf'); переключатель формата в GeneralTab. PDF: landscape A4, html-таблица с inline-стилями, escapeHtml обязателен.
- PDF-отчёты = инфографика в стиле fusion-deployment/scripts/gen_report.py (KPI-карточки, CSS-бар-чарты, топ-таблицы, light print-палитра #4f6bf5/#14a89a); CSV = полный дамп. Report{kpis,charts,pdfTables} + headers/rows. Подписи PDF хардкодом на русском (как в gen_report.py).
- Maintenance warning переведён с HTTP-fanout на очередь: QueueWorkspaceEvent.Maintenance {timeoutMinutes, message} в QueueTopic.Workspace; account-service manage публикует одно сообщение (ключ nil-uuid, глобальное), каждый транзактор-consumer (group=transactorId) вызывает scheduleMaintenance. Старый fanout имел баг: цикл await fetch без per-item catch — первый упавший транзактор обрывал рассылку. timeout=-1 = очистка (тот же контракт). WorkspaceQueue metadata расширен до PlatformQueueProducer<QueueWorkspaceMessage>.
- operation=reboot удалён из транзактора и админки (не используется).
- Fixes ревью: resolving.delete при неудаче getPersonInfo (ретрай); Force close в Users теперь broadcast на все транзакторы (getTransactorEndpoints) — раньше бил в stats pod, который умеет только wipe-statistics; ORDER BY/LIMIT вынесены из CTE во внешний SELECT в listAccounts (порядок CTE не гарантирован).
- DisabledFeaturesOverride UI: чекбоксы вместо текстового поля. Кандидаты = getMetadata(presentation.metadata.DisabledFeatures) (глобальный DISABLED_FEATURES из front config) union текущий override (metadata может быть narrowed после connect в той же SPA-сессии). Семантика: фичи = pluginId из PluginConfiguration, override RE-ENABLES глобально выключенное (client-resources returnUITxes фильтрует по ExtraFilter).
