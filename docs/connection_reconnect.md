# Схема подключения и переподключения клиента

## Обзор

Клиент связан с сервером через один WebSocket. Все запросы (findAll, tx, loadModel,
ping) идут через него. Состояние хранится в `foundations/core/packages/client-resources/src/connection.ts`.

## Жизненный цикл соединения

```
   [ new Connection() ]
           |
           v
   scheduleOpen(force=false) ------+
           |                       |
           v                       |
   openConnection()                |
     |                             |
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
     |   |      req.reconnect() ---+---> setTimeout 50ms -> sendData()
     |   |-- onConnect(event)      |         |
     |   |     event =             |         +-- ШТОРМ одновременных
     |   |       Connected         |             отправок
     |   |       | Reconnected     |
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

## Ключевые тайминги

| Константа | Значение | Назначение |
|-----------|----------|-----------|
| `pingTimeout` | 10s | Интервал отправки ping |
| `hangTimeout` | **5 min** | Порог "висящего" сокета → force close |
| `dialTimeout` | 30s | Таймаут hello. Нет hello → reconnect |
| `reconnect delay` | 50ms | Задержка перед retry каждого pending request |

## Состояние в Connection

- `requests: Map<ReqId, RequestPromise>` — все pending request.
- `onConnectHandlers: OnConnectHandler[]` — ждут `waitOpenConnection`.
- `websocket` — текущий сокет (при reconnect пересоздаётся).
- `sockets` — счётчик, защищает от race двух параллельных connect.
- `pingResponse` — timestamp последнего pong.
- `helloReceived` — hello прошёл → можно слать request.
- `slowDownTimer` — адаптивная задержка при rate limiting.

## Что происходит на reconnect

### 1. Детекция разрыва

Три источника:
1. `wsocket.onclose` → `scheduleOpen(force=true)`.
2. Ping-проверка `pingResponse > hangTimeout` → close(1000).
3. `dialTimer` не сработал за 30s → `onDialTimeout` + force.

**Проблема для мобильного**: при backgrounding iOS/Android браузер замораживает
timers и WS. Сокет формально `OPEN`, но данные не идут. Детектор hangTimeout=5min
просыпается через 5 минут — **всё это время UI зависает**.

### 2. Повторный openConnection

`openConnection()` создаёт новый WebSocket, шлёт Hello. На ответе:

```ts
for (const [, v] of this.requests.entries()) {
  v.reconnect?.()
}
```

Каждый pending request через 50ms шлёт `sendData()` повторно.

### 3. onConnect callback → refresh UI

В `plugins/workbench-resources/src/connect.ts:363`:

| Event | Действие |
|-------|---------|
| `Connected` + `_clientSet` | `refreshClient(tokenChanged)` + `refreshCommunicationClient` |
| `Reconnected` | **только** `refreshCommunicationClient` |
| `Refresh` | `refreshClient(true)` |
| `Upgraded` | `window.location.reload()` |
| `Maintenance` | Показать баннер |

**Важно**: на `Reconnected` **НЕ** вызывается `refreshClient`. LiveQuery сохраняют
старый результат; обновление ждут через tx-стрим.

### 4. refreshClient → LiveQueries.refreshConnect

`foundations/core/packages/query/src/index.ts:112` `refreshConnect(clean)`:

- Проходит по всем queries (`this.queries` + `this.queue`).
- При `clean=true` очищает результаты, шлёт callback с пустым массивом.
- Вызывает `this.refresh(q)` для каждой → **ещё один findAll на сервер**.

Для N активных queries это N параллельных findAll — дополнительная нагрузка
поверх уже перепосланных pending-requests.

## Что накапливается пока приложение спит

Пока вкладка в фоне, WebSocket может быть заморожен. В это время:

1. **Ping-запросы** (10s интервал). Защита `once:true` (connection.ts:693) не даёт
   дублировать, но один pending ping висит.
2. **UI запросы** запущенные перед backgrounding — например, переход по ссылке
   успел создать findAll, который остался в `requests`.
3. **Первый запрос при возврате**: UI становится активным раньше чем детектится
   мёртвый сокет → Svelte компоненты дёргают findAll → они лягут в `requests` и
   будут ждать `waitOpenConnection` до конца hangTimeout (до 5 мин).
4. **LiveQuery subscription requests** — primary findAll для каждой подписки.

Когда reconnect наконец случится:
- Все эти N запросов получат `reconnect()` → через 50ms **все одновременно**
  летят на сервер.
- Сервер отвечает, но клиент при этом занят: Svelte reactivity + JSON parse +
  обработка tx-стрима → event loop забит.
- Из лога: `time=1800ms`, `serverTime=200ms`, `toReceive~0` → **задержка на
  клиенте**, не в сети.

## Почему при `Reconnected` кажется что данные устарели

`refreshConnect` НЕ вызывается на `Reconnected`. LiveQueries показывают
последний известный результат. Актуализация идёт только через tx-стрим от
сервера (broadcasted events). Если за время сна сервер накопил tx для этой
сессии, они придут — но после hello и после того как разгребётся очередь
перепосланных requests.

## Очередь на сервере (поле `queue`)

`service.requests.size` — количество pending requests серверной сессии.
Видно в логе: `queue=13` — т.е. клиент отправил 13 запросов одновременно.
Это не ограничивающая очередь, а метрика.

## Что делает visibilitychange

В клиенте **есть** хендлер `document.visibilitychange` (`installVisibilityHandler`).
Когда вкладка снова становится видимой, клиент проверяет состояние сокета и при
необходимости форсирует переподключение:

- Если сокет `null` / `readyState !== OPEN` / hello не получен → немедленный
  `scheduleOpen(force=true)`.
- Иначе шлём короткий ping (`once=true`); если pong не пришёл за
  `visibilityProbeTimeout` (1s) → форс-reconnect.

Это не означает отдельный `refreshConnect` на `Reconnected`: LiveQueries
по-прежнему остаются на последнем известном результате, а актуализация приходит
через tx-стрим после hello и обработки очереди перепосланных requests.

---

## Точки для добавления логов (диагностика шторма)

### 1. Connection — трекать накопление requests

`foundations/core/packages/client-resources/src/connection.ts`:

- В `sendRequest` при добавлении в `this.requests`: лог `size, method, id`.
- В `handleMsg` при удалении: лог `size, age = Date.now() - startTime, method`.
- В hello-response reconnect-ветке (line 384): лог `reconnectingCount, oldest
  pending age`.
- В `schedulePing` ветке hangTimeout: лог `timeSinceLastPong, pendingCount`.

### 2. Визибилити

Добавить в `Connection`:

```ts
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible'
    console.log('[conn] visibility', {
      visible,
      readyState: this.websocket?.readyState,
      pendingCount: this.requests.size,
      sinceLastPong: Date.now() - this.pingResponse,
      oldestRequest: this.getOldestRequestAge()
    })
    // Force ping probe on resume
    if (visible && this.websocket?.readyState === ClientSocketReadyState.OPEN) {
      // проверка живости с коротким таймаутом
    }
  })
}
```

### 3. LiveQuery — трекать refresh-штормы

`foundations/core/packages/query/src/index.ts` `refreshConnect`:

```ts
console.log('[lq] refreshConnect', {
  clean,
  queriesCount: [...this.queries.values()].reduce((a, v) => a + v.size, 0),
  queueCount: this.queue.size
})
const t0 = Date.now()
// ... after loop
console.log('[lq] refreshConnect done', { ms: Date.now() - t0 })
```

### 4. measure findAll — уже есть, но расширить

`connection.ts:778-792` — в лог добавить `pendingCount, sinceReconnect`.

### 5. Серверная сторона (опционально)

`foundations/server/packages/server/src/sessionManager.ts` — при обработке
request логировать `sessionId, queueSize, sinceReconnect`. Поможет понять
действительно ли сервер в очереди, или клиент.

### 6. Reconnect шторм

В `handleMsg` ветке hello (line 384) обернуть в `setTimeout` с джиттером:

```ts
const reqs = [...this.requests.values()]
reqs.forEach((v, idx) => {
  setTimeout(() => v.reconnect?.(), Math.random() * 200)
})
```

Для диагностики сначала просто залогировать длину reqs и времена жизни.

## Гипотеза по корневой причине

Комбинация:
1. iOS/Android замораживает WebSocket и setInterval.
2. После возврата сокет формально OPEN, данные не идут.
3. UI уже активен, дёргает 10-20 findAll.
4. Детекция мёртвого сокета ждёт до 5 минут (hangTimeout).
5. Когда detect наконец: reconnect → шторм через 50ms на всех pending.
6. Svelte reactivity + парсинг забивают event loop → time 1800ms на findAll
   при serverTime 200ms.
7. `Reconnected` не перезапускает queries → UI данные старые пока не придут tx.

## Рекомендации (на обсуждение, не реализация)

1. `visibilitychange` → probe ping 2s timeout → при провале force reconnect.
2. `hangTimeout` снизить до 30-60s или сделать adaptive на mobile.
3. Jitter 50-500ms вместо общего 50ms в reconnect-ветке.
4. При `Reconnected` вызывать `refreshClient(false)` (без clean) для
   актуализации критичных queries.
5. Ограничивать parallelism перепосылки через семафор (например, 5 одновременно).
