# Fulltext: основной текст, `$searchIn` и `$filter`

Область: [Архитектура](../architecture.md)

## Раскладка текста в индексе

- `fulltextSummary` - только текст атрибута `SearchPresenter.contentField`. Весь остальной текст идёт в `fulltextExtra`, у класса без `contentField` туда идёт весь текст. Раскладку делает `indexDocuments` (`server/indexer/src/indexer/indexer.ts`), полную переиндексацию запускает миграция `reindex-after-fulltext-extra` (`models/core/src/migration.ts`).
- В непереиндексированном воркспейсе весь текст лежит в `fulltextSummary`, и `$searchIn: ['content']` находит там же кастомные атрибуты.
- `fulltextExtra` не подсвечивается: в интерфейсе сниппеты показывает только поиск по чату (`plugins/chunter-resources/src/search/hydrate.ts`), только для ChatMessage и только из `highlightableContent`.

## Новое поле в маппинге Elastic

- `initMapping` (`foundations/server/packages/elastic/src/adapter.ts`) удаляет общий индекс всех воркспейсов только при смене типа существующего свойства. Недостающее свойство добавляет `putMapping`. Удаление опустошает поиск во всех воркспейсах, а переиндексацию после него никто не запускает. Проверяет `adapter.itest.ts` (`Elastic mapping upgrade`).

## `$searchIn` и `$filter`

- `$searchIn` (`findAll`) и `searchIn` (`searchFulltext`) - один тип `SearchTarget[]`, поля берутся из общей таблицы `searchTargetFields` (`adapter.ts`). Без списка или с `'all'` - поиск по всему: для `$searchIn` это `'*'` и вложенные документы, для `searchIn` - заголовок, идентификатор, `content` и `extra`.
- `$searchIn` без `attached` (и без `all`) не ищет вложенные документы (метки, комментарии, вложения). Если в списке только `attached`, адаптер Elastic возвращает `[]` по основным классам. В REST `searchIn` - список через запятую.
- Запрос с `$searchIn`, но без `$search` `FullTextMiddleware` отдаёт в БД без `$searchIn`: Postgres счёл бы ключ полем документа и вернул пустой результат. Такие запросы шлёт `ListCategory`: группы меньше 20 элементов читаются по `_id` без `$search`, остальные ключи запроса остаются. На клиенте `$searchIn` пропускают `LiveQuery.match` и `matchQuery` ядра, иначе обновление не добавило бы документ в такую группу.
- Повторная проверка по `_id` (`checkSearch`/`handleDocAdd`, `findOne` с limit 1) передаёт известные id директивой `$filter` (`{ id }`, для вложенных документов `{ attachedTo }`), адаптер делает из неё жёсткий `filter`. Без неё Elastic отдал бы первые `fullTextLimit` (100) совпадений, и документ дальше них считался бы неподходящим. Список id длиннее `fullTextLimit` в `$filter` не идёт: у Elastic лимит значений в `terms` (`index.max_terms_count`, 65536), сверх него поиск падает и возвращает `[]`. Остальные ключи запроса в `ElasticAdapter.search` только повышают вес (`should`).

## Запрос с `*` в начале

- Запрос с ведущей `*` (попап упоминаний, навигатор чатов) идёт двумя условиями: `simple_query_string` без первой `*` (совпадение с начала слова, буст 10) и `query_string` по всему запросу. Синтаксис `query_string` из текста пользователя (`/`, `(`, `"`, `:` и т.п.) `plainQueryString` в `adapter.ts` заменяет пробелами: незакрытая скобка или `/` роняли весь запрос (`failed: true`). Экранирование не годится: wildcard-термин `*elease\/*` не анализируется и не совпадает со словом `release`. Пробел делит текст так же, как при индексации: `*QA/*` ищет `*QA`, а `*RR-1627*` находит идентификатор `RR-1627`.

## Score в `$source`

- Score документа - максимум из его собственного совпадения и лучшего совпадения его вложенных документов (`scoreOf`, `findChildDocuments` в `foundations/server/packages/middleware/src/fulltext.ts`). По `$source.$score` сортируют на клиенте `ObjectFilter`, `ChatsList`, `ChatNavSection`.
- `handleDocAdd` в live query кладёт в результат сырой документ из tx. `$source` с документа из проверочного `findOne` переносится на копию: tx-документ общий для запросов.

## Тесты

- Каждый jest-воркер поднимает свой контейнер Elastic. Два контейнера, стартующие одновременно, локально не уложились в 180 с, поэтому тесты Elastic живут в `search.itest.ts` и `adapter.itest.ts`, а не в отдельных файлах.

## Связанные заметки

- [fulltext_needs_reindex.md](fulltext_needs_reindex.md)
- [fulltext_bulk_mode.md](fulltext_bulk_mode.md)
