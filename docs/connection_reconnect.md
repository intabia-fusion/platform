# Схема подключения и переподключения клиента

## Обзор

Клиент связан с сервером через один WebSocket. Все запросы (findAll, tx, loadModel, ping) идут через него. Состояние - `foundations/core/packages/client-resources/src/connection.ts`.

## Жизненный цикл соединения

```
   [ new Connection() ]
           |
           v
   scheduleOpen(force=false) ------+
           |                       |
           v                       |
   openConnection()                |
     |-- create WebSocket          |
     |-- dialTimer = 30s -------+  |
     v                          |  |
   wsocket.onopen               |  |
     |-- send HelloRequest(-1)  |  |
     v                          |  |
   wsocket.onmessage            |  |
     |-- HelloResponse          |  |
     |   |-- helloReceived=true |  |
     |   |-- clearTimeout dial -+  |
     |   |-- account, lastHash     |
     |   |-- for req in requests:  |
     |   |      jitter(0..300ms)   |
     |   |      -> req.reconnect() ---> setTimeout 50ms -> sendData()
     |   |-- onConnect(event)      |
     |   |     event =             |
     |   |       Connected         |
     |   |       | Reconnected     |
     |   |       | Refresh         |
     |   |       | Upgraded        |
     |   |       | Maintenance     |
     |   |-- schedulePing()        |
     |                             |
     |-- (обычные ответы)          |
     |                             |
   wsocket.onclose                 |
     |-- scheduleOpen(force=true) -+
     |
   wsocket.onerror
     |-- delay += 1 (max 3s)
```

Резенд pending-запросов после hello - не одновременный: каждый получает случайную задержку `0..reconnectJitterMs` перед вызовом `reconnect()`, который сам добавляет фиксированные 50 мс перед `sendData()`. Тот же джиттер применяется к backoff повторного `openConnection` в `scheduleOpen` (после неудачной попытки).

## Константы (`connection.ts`)

| Константа | Значение | Назначение |
|-----------|----------|-----------|
| `pingTimeout` | 10s | Интервал отправки ping |
| `hangTimeout` | 5 мин | Порог "висящего" сокета -> force close |
| `dialTimeout` | 30s | Таймаут hello. Нет hello -> reconnect |
| `visibilityProbeTimeout` | 1s | Таймаут ping-пробы после возврата вкладки |
| `reconnectJitterMs` | 300 | Джиттер резенда pending-запросов и backoff-реконнекта |
| `diagLogThrottleMs` | 5s | Троттлинг диагностических логов в горячих путях |
| reconnect delay | 50ms | Фиксированная задержка внутри `reconnect()` каждого запроса |

## Состояние в Connection

- `requests: Map<ReqId, RequestPromise>` - все pending request.
- `onConnectHandlers` - ждут `waitOpenConnection`.
- `websocket` - текущий сокет (пересоздаётся при reconnect).
- `sockets` - счётчик, защищает от гонки двух параллельных connect.
- `pingResponse` - timestamp последнего pong.
- `helloReceived` - hello прошёл -> можно слать request.
- `slowDownTimer` - адаптивная задержка при rate limiting.

## Детекция разрыва

Три источника:
1. `wsocket.onclose` -> `scheduleOpen(force=true)`.
2. Ping-проверка `pingResponse > hangTimeout` -> `close(1000)`.
3. `dialTimer` не сработал за 30s -> `onDialTimeout` + force.

## onConnect -> обработка события (`plugins/workbench-resources/src/connect.ts`)

| Event | Действие |
|-------|----------|
| `Connected` (при `_clientSet`) | `refreshClient(tokenChanged, gapMs)` |
| `Refresh` | `refreshClient(true, gapMs)` |
| `Reconnected` | только лог, `refreshClient` **не вызывается** |
| `Upgraded` | `window.location.reload()` |
| `Maintenance` | баннер с процентом прогресса |

LiveQuery на `Reconnected` сохраняет последний известный результат; актуализация идёт только через tx-стрим от сервера, а не через явный refresh.

## refreshClient -> LiveQuery.refreshConnect

`refreshConnect(clean, lastReconnectGapMs)` (`foundations/core/packages/query/src/index.ts`):

- если `lastReconnectGapMs > IDLE_DROP_GAP_MS` (5000) - простаивающие запросы (без активных callbacks) не рефрешатся, а удаляются из очереди (`dropIdle`): держать устаревший результат после долгого сна/разрыва сети бессмысленно;
  - активные подписки сортируются по размеру результата (сначала мелкие, чтобы быстрые запросы разблокировали UI раньше тяжёлых) и рефрешатся через `RateLimiter(REFRESH_CONCURRENCY=4)` - не более 4 параллельных `findAll` одновременно, что ограничивает шторм запросов после реконнекта;
- возвращает `RefreshConnectStats` (счётчики dropped/active по классам); вызывающий (`packages/presentation/src/utils.ts:refreshClient`) логирует `[refresh] slow liveQuery refreshConnect`, только если сам вызов занял больше 1000 мс.

## visibilitychange (`installVisibilityHandler`, `connection.ts`)

При возврате вкладки в видимое состояние:
- сокет `null` / не `OPEN` / hello не получен -> немедленный `scheduleOpen(force=true)`;
- иначе шлётся короткий ping (`once=true`); если pong не пришёл за `visibilityProbeTimeout` (1s) -> force reconnect.

Обработчик логирует состояние (`readyState`, `pendingCount`, `sinceLastPong`) и решение о реконнекте, троттлинг - `diagLogThrottleMs`. Такие же диагностические логи стоят на резенде pending-запросов после hello (`[conn] hello reconnect resend`) и на срабатывании hangTimeout/ping-пробы.

## Известные пробелы

- `hangTimeout` фиксированный 5 мин, не адаптивный для мобильных фоновых сессий.
- `refreshClient` не вызывается на `Reconnected` - см. таблицу выше.
- В `foundations/server/packages/server/src/sessionManager.ts` нет диагностического лога с `sessionId`/`queueSize`/временем с последнего реконнекта на приём запроса.
- В `query/src/index.ts` нет отдельного лога на каждый вызов `refreshConnect` - есть только slow-path лог в `packages/presentation/src/utils.ts` (см. выше).

## Связанные документы

- [architecture.md](architecture.md) - путь запроса клиент -> транзактор -> broadcast.
- [memory/livequery-tx-ordering.md](memory/livequery-tx-ordering.md) - гонка доставки tx в LiveQuery.
- [memory/livequery-coverage-and-bench.md](memory/livequery-coverage-and-bench.md) - инварианты LiveQuery, покрытые тестами и бенчами.
