# Billing dev stand quirks

Область: [Биллинг](../features/billing.md)

- `BillingClient`/`PaymentClient` строят `new URL(endpoint+path)` - относительный `BILLING_URL`/`PAYMENT_URL` из `config.json` бросает `Invalid URL`. Резолвится через `absoluteUrl()` (`window.location.origin`). - `plugins/billing-resources/src/utils.ts`.
- webpack dev-server: без прокси `/_payment` в devProxy/devProxyTest fetch `plan-config` получает `index.html` вместо JSON ("Unexpected token '<'").
- Dev-стенд общий postgres volume между ветками - `CREATE TABLE IF NOT EXISTS` не пересоздаёт схему при дрейфе, миграции versioned. Симптом дрейфа - `column "X" does not exist` на biling-эндпоинтах; лечится только ручным `DROP TABLE`/пересозданием по актуальной миграции.
- Прерванный `fast-build:docker` оставляет несогласованный `.fast-build-cache.json` - bundle не пересобирается, docker берёт stale `bundle/bundle.js` (mtime старее `lib/*.js`). Проверка: `grep -c <символ> bundle/bundle.js` (0 = stale) или mtime; лечение - `rm .fast-build-cache.json && pnpm run bundle && pnpm run docker:build`.
- Ledger платёжных операций: `pod-tbank-subscriptions` -> Kafka topic `payment-operation` -> account-service consumer `payment-operation-payment-ledger` -> `global_account.payment_operation` (append-only, миграция v31). Overlay-стенд с mock T-Bank: `pnpm docker:up:tbank` (`PROVIDER=tbank`, `TBANK_MOCK=true`); mock-чекаут на `/_tbank_subscriptions/mock-checkout/:paymentId`.

## Связанные документы

- [Биллинг](../features/billing.md)
- [Billing limits enforcement](billing-limits-enforcement.md)
- [T-Bank API spec](tbank_api_spec.md)
