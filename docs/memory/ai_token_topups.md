# AI-токены: два пула (тарифное окно + купленный баланс)

Заменяет прежние модели: сброс окна (`ai_window_reset`) и per-period топапы
(`ai_token_topup` как источник лимита). Обе удалены.

## Модель

| Пул | Источник | Судьба остатка |
|-----|----------|----------------|
| Тарифный | `tier.windowMonthLimit` (per-seat: `base * quantity`, печёт payment) | сгорает в конце периода |
| Купленный | AI-пакеты (грант на период) + разовые покупки | **не сгорает**, живёт до траты |

`available = max(0, limitMonth - tierUsed) + balance`. `available <= 0` -> блок для ВСЕХ планов.
Авто-downgrade уровня убран: дешёвая локальная модель тоже стоит денег, а тихое падение
качества читается как поломка продукта.

## Купленные тратятся первыми

`LimitsEngine.absorbFromBalance` (limits.ts) в часовом recompute:
usage за `[absorbedUntil, truncToHour(now))` списывается с `remaining_tokens`,
накопленное за период пишется в `absorbed_period`. `computeUsed` возвращает
`periodUsage - absorbed_period` -> абсорбированное не попадает в тарифное окно.

Курсор `absorbed_until` не уходит раньше `periodStart` (usage закрытого периода уже
зачтён). Смена периода обнуляет `absorbed_period`, но не `remaining_tokens`.
`effectiveLimit` расширяет тарифный лимит на `remaining_tokens`, поэтому
`used >= limit` в `limit_state` — ровно условие `available <= 0`.

## Начисление

Одно событие `PurchaseActivated` на оба случая (ai-bot `applyPurchase` уже идемпотентен):

- разовая покупка: payment `activatePurchase` -> `effect: add-ai-tokens`, `quantity` из каталога;
- AI-пакет: account `upsertSubscription` публикует грант при каждом активном апсерте
  Package с `tokenLimit > 0`. `grantId = "<subId>:<periodStart>"` -> продление даёт новый
  грант, повторный апсерт в том же периоде — нет.

Идемпотентность в БД: `grantAiTokens` = вставка в журнал `ai_token_topup` (PK `purchase_id`)
+ инкремент `token_balance` одним CTE-стейтментом; конфликт по PK -> оба шага no-op.

Пометка `updatePurchaseStatus('consumed')` обёрнута в try/catch: у package-гранта записи
purchase нет вовсе, а вечный Kafka-redeliver из-за метаданных хуже потери статуса.

## Гвоздь: якорь периода

`grantPeriodAnchor(tierStart, packages)` (limits.ts) — общий для `resolveWorkspacePlan`
(billing.ts) и `computeUsed`. Иначе `limit_state.tokens` и виджет разъезжаются по периоду.

## Миграция

V7-V9 сквошены в одну `ai_token_infra_v2_07` (ветка не мержилась в develop).
Стенды со старой цепочкой пересоздаются: миграция дропает `token_balance`, `ai_tokens_usage`,
`ai_window_reset` и создаёт заново. Данные usage эфемерны, старый balance не заполнялся.

## Не сделано

AI-пакеты остались плоскими (не per-seat): `PackageItem` в `plugins/billing/src/types.ts`
не имеет `priceMonthlyPerUser`, и в payment нет ветки per-seat для пакетов. Требует
доработки типа + `resolveLimits`.
