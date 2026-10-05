# Ветка fix-glitches: исправленные дефекты

Дефекты найдены при анализе кода: места, где код делает не то, что задумано, проверены чтением и тестом. Номера (#N) - сквозная нумерация списка найденных дефектов, пропуски - дефекты, исправленные раньше или не подтвердившиеся. Сверка всего списка с `develop` - на `2ab9e6baf5` (2026-10-05).

Правила, по которым делались исправления:

- **Сначала тест, потом правка.** Каждый тест падал на исходном коде и проходит после правки.
- **Дефекты базы проверяются на настоящем Postgres.** Тесты генерации SQL не доказывают, что запрос отвечает правильно, поэтому для адаптера - интеграционные тесты (`*.itest.ts`) на `postgres:18.1` из testcontainers.
- **Минимальная правка в месте дефекта.** Без попутных рефакторингов.
- **Изменения поведения, на которые могут опираться клиенты, не делаются молча.** Они перечислены в разделе "Что меняется для клиентов"; спорные - в "Не исправлено".

Коммиты: `5a08f6c0f8` (первая пачка), `0dcb03dd12` (вторая), остальное - следующими коммитами ветки.

## Запуск тестов

Юнит-тесты - `npx jest <файл>` в каталоге пакета.

Интеграционные тесты Postgres в обычный `jest` не попадают (`testMatch` пакета их не видит):

```bash
cd foundations/server/packages/postgres
env -u DB_URL npx jest --testMatch '**/bugs.itest.ts' --coverage=false
```

`postgresUrl()` из `@hcengineering/test-containers` берёт `DB_URL` из окружения, если он задан, - без `env -u DB_URL` тест уйдёт в базу dev-стенда, а не во временный контейнер.

## Клиент: ядро, живые запросы, соединение

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 4 | `client-resources/src/connection.ts`, `handleMsg` | `terminate` проверялся только внутри `if (resp.error)`: ответ сервера `terminate: true` без ошибки не закрывал сессию | блок `terminate` вынесен из проверки ошибки; `onError` и `Analytics` - только когда ошибка есть | `connection.test.ts` |
| 13 | `core/src/operations.ts`, `mixinDiffUpdate` | обновление миксина ложилось плоско на документ через прокси без ловушки `set`, а сервер (`TxMixin`) кладёт его под ключ миксина: локальное состояние расходилось с серверным, и сравнение для диффа шло не с теми значениями | значения применяются к `doc[mixin]`, дифф считается от значений миксина | `mixinDiffUpdate.test.ts` |
| 14 | `core/src/operator.ts`, `$push` с `$each` | в поле `null` или не-массив вставка молча пропускалась - данные терялись без ошибки, хотя ветка без `$each` тот же случай чинила | поле приводится к массиву, как в ветке без `$each` и как в Mongo; не-массив логируется | `operator-bugs.test.ts` (тесты закрепляли дефект - ожидания исправлены) |
| 15 | `core/src/operator.ts`, `$push` объектом | `arr.push` на `null` - `TypeError` | проверка и создание массива общие для обеих веток | `operator-bugs.test.ts` |
| 18 | `core/src/predicate.ts`, `$all` | поле документа считалось массивом безусловно: скаляр или отсутствие поля - `TypeError` в живом запросе | не-массив даёт `false` | `predicate.test.ts` |
| 19 | `core/src/predicate.ts`, `$regex` | `value.match` на нестроке - `TypeError` | нестрока не совпадает (семантика Mongo); путь `$like` через `test` не взят из-за флага `g` | `predicate.test.ts` |
| 20 | `core/src/predicate.ts` | ошибка "unknown predicate" называла первый ключ, а не ненайденный | в сообщении - тот ключ, который не нашёлся | `predicate.test.ts` |
| 21 | `query/src/index.ts`, `doRefresh` | сравнивался массив с объектом `ResultArray` - условие всегда истинно, подписчик вызывался на каждом обновлении, даже без изменений: лишние перерисовки | сравнение с `q.result.getDocs()` | `refresh-unchanged.test.ts`; 4 теста `workspace-events.test.ts` ждали вызова на неизменную выборку - переписаны на счётчик `findAll` |
| 22 | `query/src/index.ts`, `matchQuery` | ключ миксина вида `<mixin>.<field>` читался как имя свойства, давал `undefined` и пропускался: в живую выборку попадали документы, не подходящие под условие по миксину | чтение через `getObjectValue` | `mixin-queries.test.ts` |
| 24 | `client-resources/src/connection.ts`, сборка чанков | `lookupMap` последнего чанка затирал предыдущие, проверка `total !== 0` роняла честный `0` | `total !== undefined`, `lookupMap` сливается | `chunks.test.ts` |

## Клиенты сервисов: account, REST, метрики

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 8 | `api-client/src/rest/rest.ts` | `getAccount` и `searchFulltext` не повторялись на 429, в отличие от остальных операций | `withRetry` с `isRLE` | `rest-rate-limit.test.ts` |
| 9 | `account-client/src/client.ts` | проверка `attempt === maxAttempts` до инкремента: при `maxAttempts = 5` было 6 вызовов | `attempt + 1 >= maxAttempts` | `client-retry.test.ts` |
| 11 | `measurements/src/context.ts` | `consoleLogger.warn` терял `logParams`, в отличие от `error`/`info` | параметры подмешиваются так же | `context.test.ts` |

## Сервер: middleware

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 37 | `middleware/src/applyTx.ts` | перед `TxApplyIf` пачка сначала обнулялась, потом отправлялась: транзакции, пришедшие раньше `TxApplyIf`, не сохранялись, а вызывающий получал успех | порядок: отправить, потом обнулить | `applyTx.test.ts` |
| 39 | `middleware/src/private.ts` | результат `filter` выбрасывался: транзакции чужих приватных документов (preference) уходили клиенту - утечка данных | отфильтрованный результат возвращается через `toFindResult`; из `total` вычитаются скрытые транзакции страницы (скрытые за пределами `limit` остаются в счёте), `-1` не трогается | `private.test.ts` |
| 40 | `middleware/src/spacePermissions.ts`, `handleRemove` | проверка `TxCreateDoc` вместо `TxRemoveDoc` - удалённое пространство оставалось в правах | `TxRemoveDoc` | `spacePermissions.test.ts` |
| 41 | `middleware/src/spacePermissions.ts`, `init` | пространства грузились с контекстом первого запроса: Postgres прятал приватные пространства, где первый пользователь не участник, и их права не попадали в кеш; отказ загрузки запоминался навсегда | загрузка под системным контекстом (`contextData = undefined`, как в `spaceSecurity`), при отказе `init` повторяется | `spacePermissions.test.ts` |
| 42 | `middleware/src/triggers.ts`, `findAll` в `processDerived` | `isTriggerCtx = true` не снимался: до конца запроса Postgres не добавлял фильтр безопасности и к обычным выборкам | флаг ставится и снимается через счётчик глубины на `contextData` (общий и для `processDerivedTxes`): параллельные запросы триггеров делят один `contextData`, и восстановление сохранённого значения при завершении не в порядке старта снимало флаг у ещё идущего запроса и оставляло `true` навсегда | `triggers.test.ts` (в том числе параллельный случай) |
| 43 | `middleware/src/triggers.ts`, `queryFind` | живой запрос триггера терял `limit`, `sort`, `projection`, `lookup` - ответ был полным набором | `options` передаются | `triggers.test.ts` |

## Сервер: сессии, pipeline, хранилище

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 31 | `server/core/src/dbAdapterManager.ts` | порог 50: ровно 50 не входил ни в одно условие, рост 49 -> 50 -> 51 не запускал проверку индексов | граница включена симметрично | `dbAdapterManager.test.ts` |
| 66 | `server-pipeline/src/pipeline.ts`, `getWorkspaceDestroyAdapter` | пустой ключ не пропускался (`startsWith('')` истинно): второй бэкенд получал адаптер по умолчанию вместо своего | `k !== ''`, как в соседних `match*AdapterFactory` | `destroyAdapter.test.ts` |
| 68 | `server-storage/src/fallback.ts`, `get`/`partial`/`read` | любая ошибка адаптера (сеть, права, 5xx) глоталась и превращалась в `NoSuchKey`: при недоступном S3 клиент считал файл отсутствующим | следующий адаптер пробуется только при "нет объекта", прочие ошибки пробрасываются | `aggregator.spec.ts` |
| 68 | `s3/src/index.ts`, `doGet` | адаптер S3 сам заворачивал любую ошибку `getObject` в `NoSuchKeyError` | `NoSuchKeyError` только на `NoSuchKey`/`NotFound`/404 | `s3.test.ts` |
| 69 | `server/src/client.ts`, `broadcast` | `this.tx.length` - арность метода (2), а не размер пакета: схлопывание пакета больше 10000 транзакций в один `BulkUpdate` не срабатывало никогда (с `98652c6476`) | `tx.length` | `client.test.ts` |
| 70 | `server/src/client.ts`, `upload`/`clean` | при `!allowUpload` отказ отправлялся, но без `return`: загрузка и очистка домена выполнялись - запрет не работал | `return` после отказа | `client.test.ts` |
| 71 | `server/src/workspace.ts`, `with` | упавшая сборка pipeline кешировалась: каждый вход воспроизводил ту же ошибку, пока воркспейс держат сессии | неудачная сборка не кешируется; счётчик `operations` уменьшается и при отказе | `workspace.test.ts` |
| 72 | `server/src/sessionManager.ts`, `addSession` | при отказе очереди на `login` сессия оставалась в картах до таймаута, хотя вызывающий её не получил | сессия убирается из обеих карт, ошибка пробрасывается | `sessionManager.test.ts` |

## Адаптер Postgres

Все тесты - интеграционные, на настоящей базе: `postgres/src/__tests__/bugs.itest.ts`, `txAdapter.itest.ts`.

| # | Где (`storage.ts`) | Что было и чем плохо | Исправление |
|---|---|---|---|
| 30 | цикл запроса | `{'links._id': 'x'}` по массиву объектов читался как скалярный путь и всегда давал 0 строк (список "блокирует" в трекере всегда пуст) | однозначный путь `arr.field` по `dataArray` превращается в условие вхождения `{arr: {field: v}}` |
| 32 | `process()` | слияние обновлений одного документа писало в объект транзакции вызывающего: после `tx` у него оказывались чужие операции | слияние в копию |
| 33 | `updateDoc` | ошибка пакетного `UPDATE` только логировалась, `tx` возвращал успех - обновление терялось молча | ошибка пробрасывается до `ClientSession.tx` (клиент получает `Failed to tx`) |
| 34 | `PostgresTxAdapter.tx` | ошибка записи в `tx`/`model_tx` уходила в `console.error`, `tx` возвращал успех - транзакция не сохранена, вызывающий не знает | ошибка пробрасывается |
| 35 | `translateQueryValue`, `$all` и условие-объект | `JSON.stringify` вставлялся в SQL-литерал без экранирования: кавычка в значении ломала запрос, текст из запроса клиента попадал в SQL | `simpleEscape` |
| 36 | `translateQueryValue` | `{arr: 2}` по массиву чисел сравнивался со строкой `"2"` и не совпадал никогда | числа и boolean подставляются как JSON |
| 38 | `translateQueryValue`, `$nin` | для колонки-массива `$nin` давал `text[] <> text` - SQL-ошибка, ответ 500 | ветки для `array` (`NOT (col && arr)`) и `dataArray` (`col IS NULL OR NOT (col ?\| arr)`) |
| 47 | `txUpdateDoc` | значение `undefined` пропускалось, `data \|\| jsonb` ключ не удалял: например, удалённый статус оставался начальным в workflow | обновления с `undefined` идут построчным путём, ключ удаляется |

Проверено на базе без правок: #61 (запрос по `'operations.doneOn'` к транзакциям работает), #23 (на уровне адаптера `_id` после create/update возвращается - причина выше адаптера).

## Datalake

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 3 | `pod-datalake/src/datalake/db.ts`, `createBlobData` | два `INSERT` отдельными автокоммитами: при сбое второго оставалась осиротевшая `blob.data` (обратную ссылку не даёт сделать `fk_data`) | оба `INSERT` в одной транзакции | `db.itest.ts` (Postgres) |
| 12 | `pod-datalake/src/datalake/utils.ts`, `unwrapETag` | кавычки снимались срезом без проверки длины: одиночная `"` превращалась в пустую строку | проверка `etag.length >= 2` | `utils.test.ts` |

В `pod-datalake/package.json` добавлен devDependency `@hcengineering/test-containers` - после пулла нужен `pnpm install`.

## Сервис уведомлений

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 25 | `services/notifications/src/module/action.ts` | умолчание деструктуризации срабатывает только на `undefined`: `null` вместо пустого списка от не-веб клиента ронял обработчик на `null.length`, сервис уходил в повторы | `?? []` для каждого списка | `action.test.ts` |

## Триггеры плагинов

| # | Где | Что было и чем плохо | Исправление | Тест |
|---|---|---|---|---|
| 17 | `plugins/calendar/src/utils.ts`, `generateMonthlyValues` | дата кандидата строилась в UTC, а цикл шёл по местному времени: не в UTC повтор съезжал на день или час, первый месяц дублировался | месячная ветка целиком в местном времени, как byDay/bySetPos, daily и weekly | `recurring-tz.test.ts` (48 случаев, 4 пояса) |
| 44 | `love-resources/src/index.ts`, `roomJoinHandler` | если человек уже в комнате, создавался второй `RoomInfo` той же комнаты | `RoomInfo` создаётся только когда его нет | `roomJoin.test.ts` |
| 46 | `workflow-resources/src/post-functions/evaluator.ts` | в `applyValueFunctions` уходили только `transform`: преобразования типа (`ToString`, `NumberFromText`, ...) не применялись никогда | передаются все функции, отбор по типу делает `applyValueFunctions` | `evaluator.test.ts` |
| 48 | `process-resources/src/functions.ts`, `RunSubProcess` | запрет параллельного запуска искал `done: false`, а поля `done` у `Execution` нет - запрет не работал | `status: ExecutionStatus.Active` | `runSubProcess.test.ts` |
| 49 | `process-resources/src/functions.ts`, `RunSubProcess` | откат удалял `Execution` в `core.space.Workspace`, а создан он в своём пространстве: права и рассылка шли по чужому пространству | `execution.space` | `runSubProcessRollback.test.ts` |
| 50 | `plugins/process/src/dslContext.ts`, `parseModifiers` | у `=>SOURCE(f,a=1,b=2)` после разбора оставался один параметр | `parts.slice(1).join(',')` | `dslContext.test.ts` |
| 51 | `process-resources/src/transform.ts`, `FirstWorkingDayAfter` | выходной определялся по UTC, сдвиг - по местному времени: на смене летнего времени не в UTC мог вернуться выходной | UTC-методы для сдвига | `transform.test.ts` |
| 52 | `card-resources/src/index.ts` | 9 триггеров брали только `ctx[0]`: из пачки (несколько атрибутов, карточек в одном `apply`) обрабатывалась первая | обёртка `eachTx` вызывает триггер на каждую транзакцию | `oncardremove.test.ts` |
| 53 | `card-resources/src/index.ts`, `OnCardRemove` | внутренний `const toDelete` перекрывал внешний: файлы удалённой карточки оставались в хранилище навсегда | лишнее объявление убрано | `oncardremove.test.ts` |
| 54 | `card-resources/src/index.ts`, `updateParentInfoName` | на глубине у внука переименовывалась запись родителя, а не деда | поиск по `originParent` | `onCardUpdateTitle.test.ts` |
| 55 | `notification-resources/src/index.ts`, `OnEmployeeDeactivate` | `return []` вместо `continue`: в пачке с активацией удаление push-подписок деактивированного терялось | `continue` | `employeeDeactivate.test.ts` |
| 56 | `gmail-resources/src/index.ts`, `IsIncomingMessageTypeMatch` | нет проверки `action === 'create'` (в telegram она есть): обновление письма снова давало уведомление | проверка добавлена | `incomingMatch.test.ts` |
| 57 | `request-resources/src/index.ts`, `OnRequestUpdate` | без проверки найденного запроса - `TypeError` | проверка на `undefined` | `onRequest.test.ts` |
| 60 | `recruit-resources/src/index.ts`, `LinkIdProvider` | ресурс ждал `(doc, hierarchy)`, а вызывается `(doc, control)` - `TypeError` | обёртка `linkIdProvider(doc, control)` | `link-id.test.ts` |
| 61 | `time-resources/src/index.ts`, `OnToDoUpdate` | "уже закрыта" искалось по `doneOn` на транзакции, а он в `operations`: повторное закрытие todo снова резало слоты | ключ `'operations.doneOn'`, проверен на Postgres | `todoReclose.test.ts`, `bugs.itest.ts` |
| 62 | `chunter-resources/src/index.ts`, `syncChat` | `hierarchy` читался до объявления (TDZ): при любом видимом чате `ReferenceError`, `OnUserStatus` падал, устаревшие чаты не прятались | объявление поднято выше | `syncChat.test.ts` |
| 63 | `hr-resources/src/index.ts`, `OnDepartmentStaff` | при уходе из отдела `$pull` писался дважды | `continue` после ветки `departmentId === null` | `departmentStaff.test.ts` |
| 64 | `contact-resources/src/index.ts`, `OnTypedSpaceCreate` | обновление `owners` с `ctx.space` (пространство транзакции) вместо `ctx.objectSpace` | `objectSpace` | `typedSpaceOwners.test.ts` |
| 65 | `hr-resources` `RequestTitlePresenter`, `calendar-resources` `ReminderUrlPresenter`/`ReminderIdentifierPresenter`, `chunter-resources/src/utils.ts` `buildDirectName` | презентер падал `TypeError`, если документа (сотрудник, цель, собеседник) нет | ранний возврат, как в соседних презентерах | тесты рядом с презентерами |

## Что меняется для клиентов

Эти правки исправляют дефекты, но меняют видимое поведение - их стоит учитывать при выкатке:

- **#17 календарь.** В UTC результат прежний (сравнение старой и новой реализации на 20000 случайных правил - 0 расхождений). В других поясах даты месячных повторов меняются: в Москве - 952 отличия на тех же правилах, в Лос-Анджелесе - 5081. Исключённые и переопределённые вхождения, сохранённые по старым датам (`exdate`, `originalStartTime`), могут перестать совпадать: исключённое вернётся, переопределённое задвоится.
- **#33, #34 ошибки записи.** Раньше сбой записи выглядел как успех, теперь клиент получает `Failed to tx`. Повтор уже записанной транзакции после переподключения теперь падает на дубле ключа `tx_pkey` (раньше `TxUpdateDoc` применялся повторно - для `$inc` это был двойной счёт). Консьюмер `OnlineUserTx` при устойчивой ошибке будет повторять без конца. `MongoTxAdapter.tx` по-прежнему глотает ошибку.
- **#69 `BulkUpdate`.** Пакеты больше 10000 транзакций теперь приходят одним событием `BulkUpdate`; клиент (`query`, обработка `BulkUpdateEvent`) его обрабатывает.
- **#46, #48 workflow и process.** Convert-функции в сохранённых пост-функциях начнут применяться; запрет параллельного запуска подпроцесса начнёт отказывать.
- **#53 карточки.** Файлы удалённой карточки удаляются из хранилища (раньше оставались навсегда); копии карточек получают `blobs: {}`, общих ссылок нет.
- **#30 трекер.** Список "блокирует" начнёт показывать связи.
- **#21 живые запросы.** Подписчик больше не вызывается на обновление без изменений.
- **#18, #19 предикаты.** Где на клиенте было исключение, теперь `false`.

## Известные ограничения правок

- **#42.** При параллельных `findAll` триггера первый завершившийся снимает флаг раньше остальных - тот же приём, что уже стоит в `processDerivedTxes`. Надёжнее - не мутировать общий `contextData`, а давать вложенному запросу свою копию.
- **#38.** `$nin` по `dataArray` через `?|` верен только для строковых элементов.
- **#36.** Тот же дефект остался у `$all` по числовому массиву.
- **#33.** Транзакции вокруг пакетного `UPDATE` нет: группы, обновлённые до сбоя, остаются записанными (как и раньше, но теперь видно).
- **#47.** Обновления с `undefined` идут построчно, без пакетной группировки.
- **#51.** Тест задаёт пояс `America/Los_Angeles` внутри своего файла, как #17. `globalSetup` для этого не годится: `pnpm test` гоняет пакеты одним jest, и пояс утекал во все пакеты группы (падали тесты `calendar` с датами в UTC).

## Не исправлено

| # | Суть | Почему |
|---|---|---|
| 6 | `measurements/metrics.ts`: top-N теряет индексы 3, 4, 6 | из кода не следует, какие элементы должны сохраняться |
| 10 | поле на проводе `processingAttemps` (опечатка) | публичное имя, правка требует переходного периода - решено не трогать |
| 16 | `calendar/utils.ts`, `generateYearlyValues`: `i++` дважды, годовые повторы с `count` обрываются на половине | правка меняет число и даты вхождений у существующих событий - нужно решение |
| 27 | вставка `<img src="data:...">` попадает в документ base64-узлом | что делать (убрать, загрузить как файл, запретить в `parseHTML`) - решение по UI |
| 28 | `account/src/utils.ts`, `selectWorkspace`: неизвестный `workspaceUrl` подменяется воркспейсом из токена | высокий риск: клиенты могут опираться на подстановку |
| 29 | пинг уходит голой строкой, `PresenceReport` теряется, `away` не включается | смена протокола на проводе |
| 45 | `WorkflowTrigger.ts`: Postgres на запрос по миксину отдаёт поля миксина под его ключом, `project.workflows` всегда `undefined` | правка адаптера меняет форму ответа всем клиентам |
| 58 | `getDocsOlderThanDoc` без `patch` | не подтвердился: поля `patch` нет ни в плагине, ни в модели |
| 59 | `rating`: проверка дубля реакции ищет по классу реакции, дубли разрешены | исправление класса без фильтра по автору запретит одну реакцию всем после первого; нужна проверка "одна на пользователя" по `createdBy` |
| 67 | хеш модели зависит от порядка ключей транзакции | отложено: нужен аккуратный выкат, все клиенты один раз перекачают модель |

Исправлены в `develop` раньше: #1, #2, #5 (`57738b61c3`), #26 (`36d2c8f874`), #7.

## Наблюдения по ходу

- `tsc` в `middleware`, `server`, `postgres` падает на `grantsSpaces` и `getApiKeyGrantableClasses` - расхождение с `server-core` было до этих правок; в `postgres` по той же причине падает `conversion.spec` ("lets a workspace API key read the spaces it was issued for").
- `storage-coverage.itest` (`$lookup.attachedTo.modifiedOn`) нестабилен: порядок строк при одинаковом времени.
- В `love-resources` падает `userMeetingInvite.callPush.test.ts` (`expiresAt: NaN`) - не связан с правками.
