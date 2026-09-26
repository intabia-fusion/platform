# Биллинг, подписки, лимиты, платежи

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Воркспейс живёт на тарифе (`Subscription`) с лимитами по местам, хранилищу, AI-токенам, встречам и трафику. Оплату проводит `pod-tbank-subscriptions` (T-Bank) через фасад `pod-payment` (там же реализованы провайдеры Stripe/Polar/Mock). Учёт использования и принудительное применение лимитов - отдельный `pod-billing`. Разовые пакеты (доп. хранилище, AI-токены) оформляются как `WorkspacePurchase`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| models/billing | `models/billing/src` | категория настроек Billing (роль Owner) + extension воркбена |
| plugins/billing | `plugins/billing/src` | типы планов/пакетов, локализация, `pricing.ts` (расчёт цены) |
| plugins/billing-resources | `plugins/billing-resources/src` | UI: подписки, лимиты, usage, админ-вкладки |
| plugins/billing-assets | `plugins/billing-assets` | иконки/ассеты плагина billing |
| packages/billing-client | `packages/billing-client/src` | HTTP-клиент к `pod-billing` (статистика, usage) |
| packages/payment-client | `packages/payment-client/src` | HTTP-клиент к `pod-payment` (подписки, checkout, preview) |
| server/account | `server/account/src` | модель `Subscription`/`WorkspacePurchase`, free-лимиты, seat-проверки, админ-операции |
| foundations/core/packages/account-client | `foundations/core/packages/account-client/src` | RPC-клиент аккаунт-сервиса (`getSubscriptions`, `claimIntent`, `proration.ts`) |
| foundations/server/packages/middleware | `foundations/server/packages/middleware/src` | серверные миддлвары `PlanLimitsBootMiddleware`, `SeatLimitsMiddleware` |
| services/payment/pod-payment | `services/payment/pod-payment/src` | фасад провайдеров оплаты, REST API, trial/free-provisioning |
| services/payment/pod-tbank-subscriptions | `services/payment/pod-tbank-subscriptions/src` | T-Bank: чекаут, рекуррент, вебхуки, планировщик, уведомления |
| services/billing/pod-billing | `services/billing/pod-billing/src` | учёт usage, `LimitsEngine`, статистика хранилища/AI-токенов |
| pods/server | `pods/server/src/limitsProvider.ts` | провайдер лимитов для транзактора (`AccountLimitsProvider`) |

## Модель данных

| Символ | Смысл | Файл |
| --- | --- | --- |
| `Subscription` | workspaceUuid/accountUuid, provider, providerSubscriptionId, type, status, plan, снапшот `limits?: TierLimits`, trialEnd, periodStart/End | `server/account/src/types.ts` |
| `SubscriptionType` | `Tier` (основной план) / `Support` (донат) / `Package` (доп. пакет) | `server/account/src/types.ts` |
| `SubscriptionStatus` | `Active`/`Trialing`/`PastDue`/`ReadOnly`/`Canceled`/`Paused`/`Expired` (Postgres ENUM) | `server/account/src/types.ts` |
| `TierLimits` | storageLimitGB, trafficLimitGB, meetingMinutesLimit, tokenLimit, usersLimit, windowMonthLimit (AI-окно/мес) | `server/account/src/types.ts` |
| `WorkspacePurchase` | разовая покупка: pending/active/consumed/failed | `server/account/src/types.ts` |
| `DEFAULT_FREE_PLAN`/`parseFreePlanLimits`/`getFreePlanLimits` | бесплатный фолбэк (5 юзеров, 2 ГБ/юзер, 100k токенов), переопределяется env `FREE_PLAN_LIMITS` | `server/account/src/freeLimits.ts` |
| `clampToLicense` | потолок юзеров free-плана по лицензии | `server/account/src/freeLimits.ts` |
| `assertSeatAvailable` | hard-cap по `usersLimit` перед join/invite | `server/account/src/utils.ts` |
| `ProviderPool` | providerId/model/periodStart/usedTokens/purchasedTokens (пул AI-провайдера) | `services/billing/pod-billing/src/types.ts` |
| `LimitCategory`/`LimitStatus`/`QueueWorkspaceLimitsMessage` | категории (disk/tokens/transcript/meetingMinutes/Payment/Plan/Members), статус Exhausted/Ok, очередь `LimitsChanged` | `foundations/server/packages/core/src/queue/workspace.ts` |
| `token_balance` | купленный AI-баланс (не сгорает), отдельно от тарифного окна | таблица `billing`, см. `docs/memory/ai_token_topups.md` |

## Как работает

1. **Оформление подписки (T-Bank).** UI `Subscriptions.svelte` -> `payment-client` `createSubscription` -> `pod-payment` `POST /api/v1/subscriptions/:workspace/subscribe` (`services/payment/pod-payment/src/server.ts`) -> провайдер `tbank` создаёт черновик подписки в статусе `past_due` (`pending:true`) и чекаут-ссылку (`services/payment/pod-tbank-subscriptions/src/server.ts`, `buildSubscriptionData`).
2. **Подтверждение оплаты.** T-Bank шлёт вебхук `CONFIRMED`/`AUTHORIZED` в очередь `QueueTopic.TbankWebhook` -> consumer `processWebhook` (`pod-tbank-subscriptions/src/server.ts`) -> перепроверка через `GetState` -> запись переходит в `active` (`server.ts`); `upsertSubscription` в аккаунт-сервисе гарантирует не более одной активной tier-подписки на воркспейс (`server/account/src/serviceOperations.ts`).
3. **Продление и грейс.** Планировщик `scheduler.ts` каждые `SCHEDULER_INTERVAL_MINUTES` (default 60) берёт подписки по `SubscriptionStorage.needsRenewal` (`storage.ts`), списывает `Charge` (`renewSubscription`, `scheduler.ts`); неудача -> `active -> past_due` с ретраями (`MAX_RETRY_ATTEMPTS=3`, 24ч интервал); после исчерпания ретраев и `now > periodEnd + GRACE_PERIOD_DAYS` (7 дней) -> `readonly` (`enforceGracePeriod`, `scheduler.ts`). Полная таблица переходов и квирков - `docs/billing-subscription-status-transitions.md`.
4. **Применение лимитов на запись.** Транзактор читает `PlanLimits` через `AccountLimitsProvider` (`pods/server/src/limitsProvider.ts`, `getPlanLimits`, `activeOnly=false`, fail-open в `ZERO_LIMITS` при сбое аккаунт-сервиса) -> `PlanLimitsBootMiddleware` кладёт лимиты в shared `contextVars` (`foundations/server/packages/middleware/src/planLimitsMiddleware.ts`) -> `SeatLimitsMiddleware` делает write-транзакции read-only для участников сверх `usersLimit`, кроме `GUEST_ROLES` (`foundations/server/packages/middleware/src/seatLimits.ts`).
5. **Учёт использования и AI-токены.** aibot/datalake/love шлют usage-дельты в Kafka `QueueTopic.BillingUsage` -> `pod-billing` `UsageWorker` (`services/billing/pod-billing/src/usage.ts`) батчит дельты, идемпотентно по `ref` (`accumulateUsageDelta`), пересчитывает `LimitsEngine` (`services/billing/pod-billing/src/limits.ts`): эффективный лимит (`effectiveLimit`) = тарифное окно + купленный `token_balance`, купленное списывается первым (`settleTokenBalance`); при исчерпании -> очередь `LimitsChanged` -> `PlanLimitsBootMiddleware` перечитывает `PLAN_LIMITS_MAP_KEY` без рестарта пода.
6. **Удаление воркспейса отменяет подписки.** Пользовательское или админское удаление воркспейса (`server/account/src/operations.ts`) вызывает `cancelWorkspaceSubscriptions` (`server/account/src/serviceOperations.ts`) - все неотменённые подписки воркспейса сразу уходят в `Canceled` (`providerData.status='WORKSPACE_DELETION'`), пишутся в платёжный леджер; для tier дополнительно публикуется `limitsChanged(Plan, Ok)`. Воркспейс становится read-only ещё до архивации (см. `docs/memory/deferred-deletion.md`).

## Фичи

### Тарифы и подписки
- **Три типа подписки.** Tier (основной план), Support (донат), Package (доп. пакет, напр. хранилище) - независимые записи `Subscription` на воркспейс. - `SubscriptionType`, `server/account/src/types.ts`.
- **Триал при заведении воркспейса.** Если в `plan-config.trial` задан план - создаётся `Trialing`-подписка с плоским AI-окном на период триала; иначе сразу free. - `createTrialSubscription`, `services/payment/pod-payment/src/server.ts`.
- **Прората смены сидов/пакета без возврата.** Апгрейд - доплата за добавленные ситы до конца периода; даунгрейд - кредит удлиняет период; округление в пользу клиента. - `prorateSeats`/`proratePackage`/`floorToRubles`, `foundations/core/packages/account-client/src/proration.ts`.
- **Предпросмотр смены плана.** Сумма к оплате/зачтению без мутации состояния. - `POST .../previewPlanChange`, `services/payment/pod-payment/src/server.ts`.
- **Ночной свип истёкших триалов** с провизингом free вместо истёкшего триала. - `expireTrials`, `services/payment/pod-payment/src/trialExpiry.ts`.
- **Инвариант "одна активная tier-подписка".** Любой upsert `type=tier`+`active` переводит прочие active/trialing tier-записи воркспейса в `Canceled` (`REPLACED`). - `server/account/src/serviceOperations.ts`.
- **Отмена при удалении воркспейса.** См. сценарий 6 выше. - `cancelWorkspaceSubscriptions`, `server/account/src/serviceOperations.ts`.

### T-Bank интеграция
- **Клиент T-Bank API** (Init/Charge/Cancel/RemoveCard/GetState/CheckOrder) на native fetch, без внешних зависимостей; единый контракт ошибок (HTTP 200+Success:false -> объект, транспорт/5xx -> throw). - `services/payment/pod-tbank-subscriptions/src/tbank.ts`. Детали протокола - `docs/memory/tbank_api_spec.md`.
- **Вебхуки через очередь.** HTTP-хендлер только валидирует подпись и кладёт в `QueueTopic.TbankWebhook`, партиционировано по `PaymentId`; обработка (перепроверка + apply) - в consumer'е, идемпотентно. - `services/payment/pod-tbank-subscriptions/src/server.ts` (`handleWebhook`, `processWebhook`).
- **Планировщик рекуррентных списаний**: продление, ретраи, grace-period, отложенная отмена по `willCancelAt`, зачистка брошенных черновиков чекаута (>24ч). - `services/payment/pod-tbank-subscriptions/src/scheduler.ts`.
- **Mock-режим для dev/тестов**: HTML-страница чекаута, кнопки шлют вебхуки CONFIRMED/REJECTED. - `services/payment/pod-tbank-subscriptions/src/mockTbank.ts`.
- **Ledger платёжных операций** через Kafka topic `payment-operation` -> таблица `global_account.payment_operation` (append-only). - `logPaymentOperation`, `server/account/src/serviceOperations.ts`; см. `docs/memory/billing_dev_stand_quirks.md`.

### Лимиты и usage
- **Двух-пул AI-токены**: тарифное окно (сгорает в конце периода) + купленный баланс (не сгорает, тратится первым). - `LimitsEngine.effectiveLimit`/`settleTokenBalance`, `services/billing/pod-billing/src/limits.ts`; модель целиком - `docs/memory/ai_token_topups.md`.
- **Seat-лимит с приоритетом ролей.** Первые N active-сотрудников по (rolePriority, createdOn) занимают места; сверх лимита - read-only, без привилегированного bypass. - `SeatLimitsMiddleware`, `foundations/server/packages/middleware/src/seatLimits.ts`.
- **Fail-open лимитов.** Ошибка аккаунт-сервиса или отсутствие данных -> `ZERO_LIMITS` (безлимит), не блокировка. - `pods/server/src/limitsProvider.ts`, `foundations/server/packages/middleware/src/planLimits.ts`.
- **Пороговые уведомления пулов AI-провайдеров** (80%/100%) админам по email. - `createPoolNotifier`, `services/billing/pod-billing/src/notify.ts`.
- **Учёт хранилища по типам файлов** и крупнейшим файлам/пространствам. - `handleGetStats`/`collectDatalakeStats`/`handleGetLargestSpaces`, `services/billing/pod-billing/src/billing.ts`.

### UI
- **Настройки Billing** с вкладками Subscriptions/Resource Usage, диалоги смены плана/сидов/пакета, read-only баннер. - `plugins/billing-resources/src/components/{Settings,Subscriptions,PlanCheckoutDialog,ChangeSeatsDialog,PackageChangeDialog,ReadOnlyBanner}.svelte`.
- **Индикаторы использования ресурсов.** - `LimitsIndicator.svelte`, `UsagePopup.svelte`, `UsageProgress.svelte`.
- **AI-калькулятор и таблица моделей по уровням.** - `ModelsTab.svelte`, `CalculatorTab.svelte`.
- **Админ-вкладки**: список клиентов/воркспейсов (`ClientsTab.svelte`, в `billing-resources`), просроченные подписки объединённые (`past_due`+`readonly`) в `PaymentsTab.svelte` (`plugins/admin-resources/src/components/tabs/`).

### Известное: не биллинг
- **"My cards"** - навигатор канбан-карт, не платёжные карты. - `plugins/card-resources/src/components/navigator/MyCards.svelte`, `id: 'my-cards'` в `models/card/src/index.ts`.

## Куда смотреть, если нужно...

- Добавить/поменять тариф или его лимиты -> `dev/plan-config.yaml` + валидация в `services/payment/pod-payment/src/config.ts`.
- Поменять free-лимиты по умолчанию -> `server/account/src/freeLimits.ts` (`DEFAULT_FREE_PLAN`, env `FREE_PLAN_LIMITS`).
- Разобраться в статусах подписки и переходах -> `docs/billing-subscription-status-transitions.md` (единственное место, где это собрано целиком).
- Добавить обработку нового вебхука T-Bank -> `services/payment/pod-tbank-subscriptions/src/server.ts` (`processWebhook`) + `docs/memory/tbank_api_spec.md`.
- Поменять логику продления/ретраев/grace -> `services/payment/pod-tbank-subscriptions/src/scheduler.ts`.
- Поменять расчёт цены/прораты -> `plugins/billing/src/pricing.ts` (цена), `foundations/core/packages/account-client/src/proration.ts` (прората).
- Добавить новую метрику usage (кроме tokens/transcript/storage/meetingMinutes) -> `services/billing/pod-billing/src/types.ts` (`UsageMetric`), `limits.ts` (`metricToCategory`).
- Поменять enforcement лимитов на транзакторе -> `foundations/server/packages/middleware/src/{planLimits,planLimitsMiddleware,seatLimits}.ts`.
- Поменять UI подписок/лимитов -> `plugins/billing-resources/src/components/`, стор - `stores/subscription.ts`.
- Разобраться в AI-токен-балансе (покупка, списание, миграции) -> `docs/memory/ai_token_topups.md`.
- Добавить админ-операцию над подпиской -> `server/account/src/serviceOperations.ts` (требует OTP через `requireAdminOp`).

## Настройки и конфигурация

- `FREE_PLAN_LIMITS` (JSON, partial override) - `server/account/src/freeLimits.ts`.
- `PROVIDER` - выбор активного платёжного провайдера (`tbank`/`stripe`/`polar`/`mock`) - `services/payment/pod-payment/src/factory.ts`.
- `AllowMockProvider` - явный opt-in на mock-провайдер - `services/payment/pod-payment/src/config.ts`.
- `SCHEDULER_INTERVAL_MINUTES` (default 60), `GRACE_PERIOD_DAYS` (default 7) - env, `services/payment/pod-tbank-subscriptions/src/config.ts`; `MAX_RETRY_ATTEMPTS` (3), `RETRY_INTERVAL_MS` (24ч) - хардкод-константы в `scheduler.ts`; `MANUAL_RETRY_INTERVAL_MS` (1ч) - хардкод-константа в `server.ts`.
- `SubscriptionRateLimitMax`/`PlanConfigRateLimitMax`, `ReconciliationIntervalMinutes`, `TbankSubscriptionsUrl`, `TrialExpiryHourUtc`/`TrialExpiryIntervalMinutes`, `RunWindowBackfill` (одноразовый бэкт-филл AI-окон) - `services/payment/pod-payment/src/config.ts`.
- `dev/plan-config.yaml` - каталог планов (цены, `windowMonthLimit`, `guestsLimit`, `trial`), публикуется публично через `GET /api/v1/plan-config`.

## Тесты

- Unit: `server/account/src/__tests__/{subscription-real,payment-intent-real}.test.ts`; `foundations/core/packages/account-client/src/__tests__/proration.test.ts`; `foundations/server/packages/middleware/src/__tests__/seatLimits.test.ts`.
- `services/billing/pod-billing/src/__tests__/{limits,billing,postgres-rounding,main-consumer,config}.test.ts`.
- `services/payment/pod-payment/src/__tests__/{server,trialExpiry,windowBackfill,middleware,reconciliation,config,utils}.test.ts` + провайдеры в `providers/{stripe,polar,mock,tbank}/__tests__/`.
- `services/payment/pod-tbank-subscriptions/src/__tests__/{scheduler,webhook,cancel,updatePlan,storage,notifications,tbank,mockTbank,...}.test.ts`.
- Sanity Playwright: `tests/sanity/tests/billing/billing.spec.ts`, `tests/sanity/tests/limits/{plan-limits,plan-limits-extra,billing-ui}.spec.ts`, API-хелпер `tests/sanity/tests/API/Billing.ts`.
- api-tests: `api-tests/api/src/__tests__/plan-{seats,seats-ui,trial,unpaid,volume}.test.ts`.

## Связанные документы

- [Статусы подписки и переходы](../billing-subscription-status-transitions.md) - единственное полное описание state machine.
- [Billing limits enforcement](../memory/billing-limits-enforcement.md) - история FUSIO-740, payment publisher, runtime refresh лимитов.
- [Billing dev stand quirks](../memory/billing_dev_stand_quirks.md) - относительные URL, дрейф схемы БД, tbank ledger.
- [AI-токены: два пула](../memory/ai_token_topups.md) - модель тарифного окна и купленного баланса.
- [T-Bank API spec](../memory/tbank_api_spec.md) - протокол, подпись запросов, семантика отмены.
- [Отложенное удаление пространств и аккаунтов](../memory/deferred-deletion.md) - контекст read-only при удалении воркспейса (см. сценарий 6).
