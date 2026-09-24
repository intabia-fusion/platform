# AI-токены: тарифное окно + купленный баланс

Область: [AI](../features/ai.md)

## Модель

`effectiveLimit` = тарифный лимит (`Subscription.limits.windowMonthLimit`) + `balance.remainingTokens` (`services/billing/pod-billing/src/limits.ts`). `used` - вся трата периода (`computeUsed`, `limits.ts`), без разделения по пулу. `available = max(0, limitMonth + balance - periodUsage)` (`billing.ts` `handleGetWorkspaceTokenWindows`) - `available <= 0` блокирует все планы. Авто-downgrade уровня убран: дешёвая модель тоже стоит денег (`workspace/windowLimit.ts` `decideLevel` в pod-ai-bot отдаёт только `proceed`/`block`, без даунгрейда).

Баланс не двигается в течение периода - списывается один раз, при переходе периода: `settlePreviousPeriod` (`limits.ts`) считает `charge = packCharge(prevUsage, limitMonth, balance.remainingTokens)` = `min(pack, max(0, periodUsage - limitMonth))` (`limits.ts`) - тарифный грант тратится первым, из баланса берётся только переполнение сверх него. Идемпотентно: `settleTokenBalance` (`db/postgres.ts`) сравнивает `WHERE period_start < newPeriodStart` (не на равенство) и декрементирует относительно - повторный settle/ретрай не заряжает дважды, параллельный `grantAiTokens` не затирается.

## Начисление

Одно событие `PurchaseActivated` на оба случая (`applyPurchase` в ai-bot идемпотентен):
- разовая покупка: payment `activatePurchase` -> `effect: add-ai-tokens`, `quantity` из каталога;
- AI-пакет: account `upsertSubscription` публикует грант при каждом активном апсерте Package с `tokenLimit > 0`; `grantId = "<subId>:<periodStart>"` - продление даёт новый грант, повторный апсерт в том же периоде - нет.

Идемпотентность в БД: `grantAiTokens` (`db/postgres.ts`) = вставка в журнал `ai_token_topup` (PK `purchase_id`) + инкремент `remaining_tokens` одним CTE; конфликт по PK - оба шага no-op.

`updatePurchaseStatus('consumed')` обёрнут в try/catch: у package-гранта записи purchase нет вовсе, а вечный Kafka-redeliver из-за метаданных хуже потери статуса.

## Гвоздь: якорь периода

`grantPeriodAnchor(tierStart, packages)` (`limits.ts`) - общий для `resolveWorkspacePlan` (`billing.ts`) и `computeUsed` (tokens). Иначе `limit_state.tokens` и виджет токенов разъезжаются по периоду.

## free план не блокировался (исправлено)

`resolveWorkspacePlan` (`billing.ts`) резолвит план как `grantingTier?.plan ?? 'free'` (фильтр `grantsPlan`), не `active?.plan ?? latest?.plan` - иначе unpaid-тир читался по имени как paid.

## Гвоздь: TIMESTAMP без tz + postgres.js

`token_balance.period_start` / `absorbed_until` - `TIMESTAMP` без зоны. Драйвер парсит их дефолтным `parse: x => new Date(x)`, строка вида `2026-08-21 18:00:00` читается как **локальное** время; пишем `Date.toISOString()` (UTC wall clock) - на поде вне UTC чтение даёт сдвинутый инстант. Лечится на чтении: `period_start AT TIME ZONE 'UTC' AS period_start` (`db/postgres.ts`) - даёт `+00`, который `new Date` разбирает верно; запись тоже через `now() AT TIME ZONE 'UTC'`, не `now()`.

## Гвоздь: накопительные upsert-ы и ретрай

`pushAiTokensData` / `pushTranscriptUsage` / `pushAiTranscriptData` пишут `col = col + EXCLUDED.col` батчами по `BATCH_SIZE=100` (`db/postgres.ts`), а `RetryDB` ретраит метод целиком - половина закоммиченных батчей плюс ретрай даёт двойной счёт. `executeAll()` (`db/postgres.ts`): один батч выполняется как есть, несколько - в транзакции.

Пороговые алерты пула (`notified80/100`) пишет `markPoolNotified` (`usage.ts`) после успешной отправки - иначе падение почты гасило алерт навсегда.

## Не сделано

AI-пакеты остаются плоскими (не per-seat): `PackageItem` (`plugins/billing/src/types.ts`) не имеет `priceMonthlyPerUser` (в отличие от `PlanItem`), в payment нет ветки per-seat для пакетов.

## Связанные документы

- [`../features/ai.md`](../features/ai.md)
- [`ai_bot_context_and_settings.md`](ai_bot_context_and_settings.md)
