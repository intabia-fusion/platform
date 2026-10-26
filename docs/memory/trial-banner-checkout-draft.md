# Плашка "Пробный период" и черновики чекаута

Область: [Биллинг](../features/billing.md)

- `checkWorkspaceLimits` выбирал для плашки самый новый tier по `createdOn` в любом статусе. Черновик чекаута новее живого триала -> `onTrial=false` и пропавший чип free уже во время оплаты. Плашку должен вести granting-tier (`grantsPlan`), latest - только фолбэк. - `plugins/billing-resources/src/utils.ts`.
- `PastDue` + `pending:false` для `grantsPlan`/`isFailedRenewal` неотличим от провала продления: план выдаётся, scheduler ретраит списание, но у черновика нет `rebillId` -> `CHARGE_ERROR` x3 -> grace -> `ReadOnly` и письмо об окончании. - `services/payment/pod-tbank-subscriptions/src/{server,scheduler,utils}.ts`.
- Терминальный вебхук по `pending:true`-черновику обязан закрывать его (`Canceled`, `pending:false`), а не переводить в `PastDue`. - `services/payment/pod-tbank-subscriptions/src/server.ts`.
- `alreadyApplied` обязан учитывать `Canceled`: повторная доставка того же терминального вебхука иначе оживит черновик в ветке `PastDue`. - `services/payment/pod-tbank-subscriptions/src/server.ts`.
- Granting-черновик блокирует `trialExpiry` через `hasGrantingTier`: триал не истекает в free, напоминание о конце триала не уходит. - `services/payment/pod-payment/src/trialExpiry.ts`.
- Прод проверен: `provider='tbank' AND status IN ('past_due','readonly') AND COALESCE(provider_data->>'pending','false') <> 'true' AND provider_data->>'rebillId' IS NULL AND provider_data->>'cardId' IS NULL` - 0 строк. Ремонт и миграция не нужны. - `<ns>.subscription`.
