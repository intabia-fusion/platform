# Webhook test mocks (FUSIO-1151)

`services/webhook/pod-webhook/src/__tests__/`: `webhookSender.ts` (incoming - гоняет настоящее
express-приложение пода на случайном порту через fetch) + `mockReceiver.ts` (outgoing - голый `http`
сервер, ловит сырые байты запроса для проверки подписи). Живут в `__tests__` пода, не отдельным
пакетом - у receiver пока нет второго потребителя.

- `server.test.ts` переписан на `webhookSender.ts` вместо своих
  `startServer`/`postAction`/`postPathKey`.
- `internal_error` через публичный HTTP недостижим: он срабатывает только когда кидает
  `producer.send()`, а это требует мока продюсера - внешним вызовом не спровоцировать. Не тестируем.
- `no-confusing-void-expression` (standard-with-typescript) ругается на `server.close(() =>
  resolve())`: стрелка неявно возвращает void. Фикс - фигурные скобки, `() => { resolve() }`.
- `mockReceiver.close()` убивает отслеживаемые сокеты ДО `server.close()`: иначе keep-alive
  соединение (дефолт undici) держит колбэк `close()` и jest висит.

## `pod-webhook-mock` (отдельный под, dev-стенд)

Express-приложение (`PORT` 4044, `WEBHOOK_URL` -> `http://webhook:4043`), наружу через
`/_webhook-mock` в `dev/nginx.conf`. Судьба пода - открытый хвост TSK-2026-09-01-076.

- `POST /receive` - ловит доставки, сохраняя СЫРОЕ тело (нужно для сверки подписи).
- `GET /api/deliveries`, `POST /api/deliveries/clear`, `POST /api/deliveries/:id/verify`
  (пере-подписывает настоящим `signStandard` из пода и сравнивает; `webhook-signature` режется по
  пробелам - там несколько подписей при ротации).
- `GET/POST /api/response-mode` - переключение ответа 200/500/429, чтобы гонять ретраи.
- `POST /api/send`, `POST /api/job` - реле в настоящий `pod-webhook`, чтобы браузеру не нужен был
  CORS и прямой доступ.
- UI на `/` держит открытые блоки доставок при автообновлении списка.

## Mock на sanity-стенде

- `tests/docker-compose.yaml`: сервис `webhook-mock` (образ `webhook-mock`, `PORT=4044`, `WEBHOOK_URL=http://webhook:4043`); собирается `pnpm docker:build` (`common/scripts/docker-fast.sh`).
- Наружу через nginx стенда: `http://localhost:8083/_webhook-mock` (`tests/nginx.conf`), отдельного хостового порта нет; nginx `depends_on` включает `webhook-mock`, иначе upstream не резолвится.
- Sanity `webhook` получил `ALLOW_INSECURE_WEBHOOK_HTTP=true` и `DEV_ALLOWED_WEBHOOK_HOSTS=webhook-mock`, иначе SSRF-guard (`ssrf.ts`) блокирует `http://webhook-mock:4044`.
