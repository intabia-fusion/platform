# RPC: протокол транзактора

Область: [Архитектура платформы](../architecture.md)

Дефолт клиентского протокола транзактора - **msgpack + snappy** (`foundations/core/packages/client-resources/src/connection.ts`). `USE_BINARY_PROTOCOL=false` переводит на JSON: читают его `foundations/server/packages/client/src/client.ts`, `services/github/pod-github` (`client.ts`), веб через `pods/front/src/__start.ts` (уходит в `/config.json`) или ключ `client:metadata:UseBinaryProtocol` в `localStorage`. `binary` и `compression` меняют только парой: JSON без сжатия - худший из четырёх режимов по трафику.

## rpcJSONReplacer / rpcJSONReceiver

`rpcJSONReplacer` (`foundations/core/packages/rpc/src/rpc.ts`) заканчивается `return value ?? null` и идёт третьим аргументом в `JSON.stringify` (`protoSerialize`) - вызывается на каждый ключ при обходе, не только на top-level `result`. Симметрично `rpcJSONReceiver` - третий аргумент `JSON.parse`, тоже на каждый ключ; он нужен ради одного `dataType: 'TotalArray'`.

Снять эту пару нельзя без синхронной выкатки клиента и сервера: уже собранные клиенты шлют `{ dataType: 'TotalArray', total, lookupMap, value }` и ждут её обратно. Побочный эффект от того, что replacer остался - `undefined` превращается в `null`, а не теряется как ключ (см. ниже).

Guard `Array.isArray(value.value)` в `rpcJSONReceiver` - без него документ с полем `dataType: 'TotalArray'` и не-массивом в `value` разворачивался через `Object.assign` в boxed-строку (`{0:'n',1:'o',...}`).

## null принимается валидатором

`NormalizeTxMiddleware` (`foundations/server/packages/middleware/src/normalizeTx.ts`, `parseBaseTx`/`parseTx`/`parseTxCUD`) принимает `null` в опциональных полях CUD/Apply-tx (`createdBy`, `createdOn`, `meta`, `scope`, `match`, `notMatch`, `notify`, `extraNotify`, `measureName`, `attachedTo`, `attachedToClass`, `collection`, `retrieve`, `removedDoc`) и сразу нормализует в `undefined`. Обязательные поля (`_class`, `_id`, `space`, `modifiedBy`, `modifiedOn`, `objectSpace`, `objectId`, `objectClass`, `operations`, `attributes`, `mixin`, `txes`, `event`, `domain`) `null` по-прежнему не принимают.

Вместе с replacer-ом это закрывает потерю ключа на json: `{ field: undefined }` доезжает как `{ field: null }`, `$unset: { keep: undefined }` работает так же, как на msgpack. `TxProcessor.applyUpdate` (`foundations/core/packages/core/src/tx.ts`) идёт `for (const key in ops)` - наличие ключа значимо, отсюда важность самой нормализации.

## Где протоколы реально расходятся

`foundations/core/packages/rpc/src/test/protocol.spec.ts` перебирает значения, операторы `DocumentUpdate` и предикаты запроса через обе ветки `RPCHandler` и сравнивает канонические подписи - список расхождений зафиксирован в `toEqual`, новая строка означает изменение поведения.

По значениям: `undefined` на верхнем уровне - json падает на `JSON.parse`, `NaN`/`±Infinity` -> `null`, `bigint` -> `TypeError`, одиночный суррогат, `Date` -> ISO-строка, `RegExp`/`Map`/`Set`/ `Uint8Array`/`ArrayBuffer` -> `{}` или объект-индекс, `undefined` в массиве и дырка в разреженном массиве -> `null`, поле со значением `undefined` - ключ исчезает (кроме случая выше), `toJSON` вызывается только в json, цикл - `TypeError`, общая ссылка дублируется. Обратное: msgpackr теряет `-0`, `total`/`lookupMap` у массива (спасает только replacer в `serialize`), переименовывает `__proto__` в `__proto_`, роняет `Symbol`.

Практический эффект на `TxProcessor.applyUpdate`: `{ field: undefined }` на msgpack **очищает** поле; `$push`/`$update` с `undefined` - у msgpack элемент добавляется/затирается, у json нет; `$push: { $each: [undefined] }` и `$pull: { $in: [undefined] }` - json подставляет `null`; `Date` в операторах едет строкой, поэтому `$pull` по `Date` в json не находит элемент.

## Бенч: `model.json` был нерепрезентативен

`foundations/core/packages/client-resources/src/__tests__/protocol-bench.spec.ts` - синтетика однородной формы документов, льстит msgpackr (record extension сворачивает повторяющуюся форму). Замер на выгрузке БД стенда (67 классов, 11460 документов, страницы `Response.result`) даёт иную картину: json стоит **+27.7%** трафика суммарно (1 587 524 Б msgpack против 2 027 010 Б json), до +75.5% на однотипных документах с повторяющимися ключами (`love:class:Room` page-500), и только +2.9% на `model.json` (3885 разнородных tx с длинными уникальными строками - snappy на них съедает разницу почти полностью).

Reviver разворачивает знак сравнения на мелочи: payload < 1 КБ - голый `JSON.parse` быстрее msgpackr на 32%, с reviver - медленнее на 63.5%; на крупных payload (`model.json`, mixed page-5000) reviver даёт декодированию 3.4-4x штраф (19.0 -> 5.3 мс, 30.9 -> 9.2 мс).

## Две реализации snappy

`pods/server` и `pods/stats` зависят от нативного `snappy` (napi), браузер (`client-resources`) использует чистый JS `snappyjs`. На мелочи (<400 Б) нативный compress быстрее на 50-60%, но uncompress на 7-17% медленнее - накладные napi съедают выигрыш; от ~9 КБ нативный быстрее в 1.7-3.5x в обе стороны. Node-клиенты платформы (love, aibot, workspace, github) идут через `client-resources`, то есть декомпрессия модели у них по медленному JS-пути - пакет браузерный, условного импорта нативного snappy там нет.

## Гочта при сравнении замеров

Сравнивать трафик между прогонами с разными `binary`/`compression` по логам стенда напрямую рискованно: если фактически согласованные режимы отличаются от предполагаемых, разница в `sent_bytes`/`received_bytes` не отражает разницу протоколов. Перед тем как доверять сравнению прогонов - логировать `binary`/`compression`, реально согласованные в `HelloResponse`.

## Связанные заметки

[clisr: формат кадров](clisr_wire_protocol.md) - тот же msgpack/json/snappy выбор, но для отдельного протокола `clisr`, не транзактора.
