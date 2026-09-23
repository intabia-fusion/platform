# LiveQuery tx ordering vs ClientImpl.tx

Область: [Архитектура платформы](../architecture.md). Смежная заметка: [покрытие и бенчмарки](livequery-coverage-and-bench.md).

`ClientImpl.tx` (`foundations/core/packages/core/src/client.ts`) применяет модель синхронно (`model.addTxes`, не `await model.tx`), поэтому единственный await на пути tx - это `await this.conn.tx(tx)`. Без дополнительной задержки два последовательных `createDoc` могли гоняться в микротасках: `notify` уходит в `liveQuery.tx(...)` не дожидаясь его, следующий вызов стартует раньше, чем предыдущая tx разлетелась по колбэкам, а `queriesToUpdate` коалесцирует уведомления - колбэк на промежуточное состояние теряется. Фикс: `client.tx` делает `await Promise.resolve()` после `await conn.tx(tx)`, отдавая один тик перед возвратом вызывающему.

`packages/presentation/src/utils.ts` (клиентская обёртка `LiveQuery`/`createQuery`) заворачивает notify в `reduceCalls` - продакшен-UI гонки не видит независимо от этого тика. Потребители без такой обёртки: `foundations/core/packages/api-client/src/client.ts` (`createLiveQuery`, дёргает `q.tx(...tx)` напрямую) и `services/github/pod-github/src/worker.ts` (`registerNotifyHandler`).

## Гочта тестов

`foundations/core/packages/query/jest.config.js` не задаёт `moduleNameMapper`, поэтому тесты пакета резолвят `@hcengineering/core` через `node_modules` (символьная ссылка на пакет целиком) - т.е. идут против собранного `foundations/core/packages/core/lib`, а не `src`. Правка core-исходников без `pnpm run build` в `core` ничего не меняет в тестах `query` (в стектрейсах при этом всё равно видны `core/src/*.ts` через source map).
