# T-Bank Acquiring API - особенности реализации

Область: [Биллинг](../features/billing.md)

Собственная реализация на native fetch, 0 внешних зависимостей (не порт библиотеки `tbank-payments`). - класс `TbankPayments`, `services/payment/pod-tbank-subscriptions/src/tbank.ts`.

## Подпись запроса (Token)

1. Взять корневые поля запроса, исключить вложенные объекты/массивы, `Token`, undefined-значения.
2. Добавить `Password` = terminal password.
3. Отсортировать ключи по алфавиту, конкатенировать значения без разделителей.
4. SHA-256, hex lowercase. Boolean сериализуется как строка "true"/"false".

`verifyNotificationSignature` - тот же алгоритм для вебхука (поля без `Token`), сравнение с присланным значением.

## Error-контракт

- Сеть/timeout/5xx после исчерпания retry -> throw `TbankTransportError` (флаг transport - сигнал для recheck по `GetState`/`CheckOrder`).
- HTTP 200 + `Success:false` -> возвращается объект `{Success:false, ErrorCode, Message, Details, Status}`, не throw - это бизнес-отказ (например отклонённая карта), не ошибка.
- Retry: 3 попытки, экспоненциальный backoff, только на сеть и 5xx, timeout 30s.
- `TBANK_SUCCESS_STATES = {CONFIRMED, AUTHORIZED}`, `TBANK_FAILED_STATES = {REJECTED, DEADLINE_EXPIRED, CANCELED}`.

## Методы и идемпотентность

`initPayment`/`chargeRecurrent`/`cancelPayment`/`removeCard`/`getPaymentState`/`checkOrder` - 1:1 с `POST /v2/{Init,Charge,Cancel,RemoveCard,GetState,CheckOrder}`. `ExternalRequestId` в Cancel - ключ идемпотентности возврата на стороне банка: повторный Cancel с тем же ID возвращает состояние прежней операции вместо второго возврата. Проставляется как `cancel:${paymentId}` при отмене брошенного чекаута - защита от двойного возврата при retry (orphan-takeover/forced-switch).

## Вебхуки через очередь

`QueueTopic.TbankWebhook`, партиция по `PaymentId` (упорядочивание вебхуков одного платежа). HTTP-хендлер только валидирует подпись и кладёт сообщение в очередь; перепроверка (`GetState`) и вся apply-логика - в consumer'е. Poison-guard: `TypeError`/`RangeError`/`SyntaxError` -> log+return (не блокирует партицию), прочее -> throw (retriable; kafka-обвязка не делает broker redelivery, поэтому throw = локальный retry того же сообщения навсегда). Идемпотентность терминальных вебхуков (REJECTED/REVERSED/REFUNDED): если на не-pending `past_due` уже записан ровно этот `Status`, повтор пропускается.

## Cancel semantics

`handleCancelSubscription`: `Canceled`/`Expired` -> идемпотентный 200 без записи; `PastDue`/`ReadOnly` -> отменяются немедленно (`isImmediateCancel`, нужно для отката на free после неудачного платежа); pending-черновик первого платежа -> 400 (его закрывают вебхук/планировщик).

Ветвление в `buildCanceledSubscriptionData`: оплаченная (`Active`) -> scheduled-cancel (`willCancelAt=periodEnd`, `providerData.status='SCHEDULED_CANCEL'`, карта сохраняется, возможен uncancel); неоплаченная (`isImmediateCancel`) и `PLAN_CHANGE` -> немедленно `Canceled`, карта снимается тут же, dunning-поля (`retryAttempt`/`retryAfter`/`pending`) удаляются.

`providerData.status = 'CANCELED'` - load-bearing значение: `isFinalizedUserCancel` (`services/payment/pod-payment/src/utils.ts`) требует пару `(status=Canceled, providerData.status='CANCELED')` и `type===Tier` - только по этому условию `pod-payment` заводит бесплатную подписку. `SCHEDULED_CANCEL`/`ABANDONED`/`REPLACED`/`PLAN_CHANGE` free не триггерят.

Dunning-письмо ("не удалось списать") - только на `REJECTED`. `REVERSED`/`REFUNDED` - возврат средств (support/admin), письмо клиенту не шлётся.

## Связанные документы

- [Биллинг](../features/billing.md)
- [Статусы подписки и переходы](../billing-subscription-status-transitions.md)
- [Billing dev stand quirks](billing_dev_stand_quirks.md)
