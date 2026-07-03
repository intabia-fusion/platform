# Billing dev stand quirks (2026-07-04)

## Относительные BILLING_URL/PAYMENT_URL (config.json)
- BillingClient/PaymentClient строят `new URL(endpoint+path)` - относительный `/_billing` бросает `Invalid URL`. Резолв в `billing-resources/utils.ts:absoluteUrl()` через window.location.origin.
- webpack dev-server прокси: `/_payment` добавлен в devProxy (8087) и devProxyTest (8083); без него fetch plan-config получал index.html ("Unexpected token '<'").

## Дрейф схемы billing-БД между ветками
- Симптом: 500 на `/_billing/.../stats`, в логах пода `column "day" does not exist`.
- Причина: dev postgres volume мигрирован другой веткой (foundation AI-billing: ai_tokens_usage c hour/provider_id/model/level). Миграции versioned + CREATE TABLE IF NOT EXISTS => схема не пересоздаётся.
- Лечение: DROP TABLE billing.ai_tokens_usage и создать вручную по migrationV2 (workspace, day, reason, total_tokens; PK workspace+day+reason; index day).
- При rebase FUSIO-886 (hour-based schema) конфликт схем всплывёт снова - решать миграцией, не IF NOT EXISTS.
