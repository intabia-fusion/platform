# Память транзактора на пространство

Область: [Архитектура](../architecture.md)

Замеры от 2026-08-11, `model.json` = 3688 tx (2799 TxCreateDoc, 889 TxMixin), 1.9 Mb на диске. Бенчи - `BENCH=1 NODE_OPTIONS=--expose-gc npx jest model.bench` в `models/all`, харнесс - `@hcengineering/measurements` (`foundations/core/packages/measurements/src/bench.ts`); `describeBench` берёт `describe` лениво с `globalThis`, чтобы не падать вне jest.

## Стоимость воркспейса в памяти (изолированный замер, N копий структур в процессе)

| компонент | Mb на ws |
|---|---|
| `Hierarchy` | 0.63 |
| `ModelDb` | 1.48 (доки 0.95 + индексы `objectById`/`objectsByClass` 0.44) |
| полный `createServerPipeline` | 2.33 |

Модель + hierarchy = ~91% стоимости ws. Распарсенный `model.json` = 5 Mb, общий на процесс.

## Живой транзактор

| | sanity, 0 ws | прод, 19 ws | sanity, 95 ws |
|---|---|---|---|
| heapUsed | 95 Mb | 130 Mb | 390 Mb |
| RSS | 268 Mb | 461 Mb | 622 Mb |

Цена ws по heap: sanity (390-95)/95 = ~3.1 Mb, прод (130-95)/19 = ~1.8 Mb. На проде 253 из 461 Mb RSS - вне V8 heap (native-буферы, pg-пул `max`, фрагментация jemalloc); не растёт с числом ws.

Heap snapshot на 102 ws (heapUsed 395 Mb, `kill -USR1 1` в контейнере -> CDP `Runtime.evaluate` с `v8.writeHeapSnapshot`, retained = reachable(группа) минус reachable(корни в обход группы)): `ModelDb` 148.9 Mb (38%, 1.46/ws), `Hierarchy` 65.6 Mb (17%, 0.64/ws), baseline процесса ~175 Mb (44%). `ModelDb` даёт 206 инстансов на 102 ws - второй на ws принадлежит `InMemoryAdapter` (транзиентный домен, почти пустой, дублирования модели нет).

Замер дельты `heapUsed` вокруг построения pipeline завышает результат в ~3.4 раза (794 Mb суммой против 390 Mb фактического heap на 95 ws) - в неё попадает временный мусор построения, который потом собирает GC. Честное число - только `(heapUsed - baseline) / число ws`.

## Общая (shared) системная модель поверх copy-on-write

`ModelDb.addTxes` (`foundations/core/packages/core/src/memdb.ts`) материализует документ класса/атрибута один раз и передаёт инстанс в `hierarchy.tx(tx, doc)` (`hierarchy.ts`); `externallyOwned` держит id таких документов, чтобы `Hierarchy` не применяла обновления к ним повторно. `addTxes` работает в две фазы - сначала материализация, потом индексация по классам, потому что документ может встретиться раньше своего класса (254 таких случая в реальной модели).

`ancestors`/`descendants`/`inheritedDomains` выводятся лениво с кэшем; любой create/update/remove классификатора (и CoW через `ownClassifier`) сбрасывает кэш целиком (`invalidateChains`). Пересчёт `getDescendants(Doc)` после сброса - ~300 us на реальной модели.

Стоимость COW (ns на документ, реальная модель): spread `{ ...doc }` 775, `clone()` (`foundations/core/packages/core/src/clone.ts`) 3715, `structuredClone` 2643, `clone` атрибута 1892. Путь холодный - воркспейс копирует единицы документов за всё время жизни, поэтому immer/Proxy-на-чтении не окупаются, а били бы по горячему пути (`isDerived`, `getAllAttributes`).

`MemDb.freeze()` морозит рекурсивно, не только верхний уровень (иначе вложенные объекты/массивы оставались мутируемыми) - 2796 доков реальной модели, 5.3 ms разово на старте пода.

`Hierarchy.as()` копирует target только когда ключ миксина совпадает с ключом на frozen-документе (`shadowsFrozenKey`, проверка по `getAncestors(mixin)`) - на реальной модели это 3 случая из 887 (`server-notification:mixin:TypeMatch <- match`). До оптимизации копия делалась всегда: heapΔ на 200k вызовов `as()` был 68 Mb, стало 4 Mb.

Kill-switch: `SHARED_SYSTEM_MODEL=false` (дефолт true) отключает шаринг - `sharedSystemModel` в `foundations/server/packages/middleware/src/model.ts`. Точки переключения: `buildSharedModel` в `server/server-pipeline/src/pipeline.ts` (транзактор + backup), `pods/fulltext/src/manager.ts`, `services/rating/src/manager.ts` (`RatingCalculator.create` в `services/rating/src/calculator.ts` принимает опциональные `sharedHierarchy`/`sharedModel` - `dev/tool` запускает разовый расчёт без общей модели).

Фактическая экономия (BENCH=1, `models/all`): standalone 1.78 Mb/ws, shared overlay 2.23 Mb однократно + ~0 Mb/ws на пустом воркспейсе - реальный воркспейс добавляет только свою дельту model-транзакций (sanity-ws 151 своих tx, meetings-ws 52, против 3688 системных - пустых own-tx нет ни у одного, при создании ws всегда появляются свои `core:class:Class`/`Mixin` для TaskType/ProjectType). Порог окупаемости - 2 воркспейса на под.

Покрытие `hierarchy.ts` и `memdb.ts` тестами - 100% по строкам, веткам и функциям.

## Известные дыры в инварианте (актуально)

- `Hierarchy` не имеет `freeze()`: классификаторы, отфильтрованные из `ModelDb` в пути fulltext/rating (`fulltextModelFilter`, `pods/fulltext/src/utils.ts`), живут в общей иерархии незамороженными.
- `getAncestors`/`getDescendants` (`hierarchy.ts`) отдают массив родителя по ссылке, не копию и не frozen.
- `ModelDb.txUpdateDoc`/`txRemoveDoc` (`memdb.ts`) глушат любое исключение пустым `catch`, включая `frozen shared model must not be modified`.
- `Hierarchy.replaceDoc` не зовёт `invalidateChains()`; сейчас не ломается только потому, что все вызывающие пути следом делают `hierarchy.tx` -> `ownClassifier`.

## Баги, которые вскрыла заморозка (уже исправлены, видно по коммент в коде на месте)

Четыре места молча правили документ shared-модели, взятый через `findAllSync`, вместо клона - каждое теперь клонирует перед записью (в коде комментарий вида "belongs to a model shared across workspaces"): `Triggers.addDerived` (`foundations/server/packages/core/src/triggers.ts`, `clone(match)`), обновление прав роли (`foundations/server/packages/middleware/src/spacePermissions.ts`), `syncContext` (`server-plugins/process-resources/src/index.ts`), `fillLookup`/`fillReverseLookup` в mongo-адаптере (`foundations/server/packages/mongo/src/storage.ts`, `hierarchy.clone`).

`DomainFindMiddleware.findAll` (`foundations/server/packages/middleware/src/domainFind.ts`) для `DOMAIN_MODEL` возвращал живой `modelDb.findAllSync` без клона; `TxOperations.diffUpdate` мутировал его на месте, из-за чего падала миграция `migrateViewlets` (`models/card/src/migration.ts`) с "Cannot assign to read only property", оставляя осиротевшие `TxUpdateDoc` для Viewlet в `model_tx` (видно по warn `no document found, failed to apply model transaction, skipping` при старте). Теперь зовёт `modelDb.findAll` (клонирует).

## Где модель НЕ шарится

`services/export` и `server/workspace-service` строят пайплайн на один воркспейс за запуск - общая модель дороже выигрыша. `services/activity`/`services/notifications` берут готовые `hierarchy`/`modelDb` из `client.getModel()`, а `ModelMiddleware.init` строит модель повторно из `txAdapter` для того же воркспейса - известное дублирование, не устранено.

## Тесты общей модели

`core/src/__tests__/sharedModel.test.ts` + `sharedModelEdge.test.ts` (харнесс на синтетических сценариях: атрибуты, классификаторы, документы, операторы `$push`/`$pull`/`$inc`/dotted `$set`, каждый сверяет снапшот shared-модели, соседнего и свежего воркспейса, плюс что все доки остались frozen). `models/all/src/__tests__/sharedModel.test.ts` - те же сценарии на реальной модели. `models/all/src/__tests__/model.test.ts` - эквивалентность каждого read-метода standalone/overlay по всем классам модели. `models/all/src/__tests__/model.bench.ts` - бенчи read-методов, standalone против оверлея.
