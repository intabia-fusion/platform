# Fulltext: основной текст, `$searchIn` и `$filter`

Область: [Архитектура](../architecture.md)

## Раскладка текста в индексе

- `fulltextSummary` - только текст атрибута `SearchPresenter.contentField`. Весь остальной текст идёт в `fulltextExtra`, у класса без `contentField` туда идёт весь текст. Раскладку делает `indexDocuments` (`server/indexer/src/indexer/indexer.ts`), полную переиндексацию запускает миграция `reindex-after-fulltext-extra` (`models/core/src/migration.ts`).
- В непереиндексированном воркспейсе весь текст лежит в `fulltextSummary`, и `$searchIn: ['content']` находит там же кастомные атрибуты.
- `fulltextExtra` не подсвечивается: в интерфейсе сниппеты показывает только поиск по чату (`plugins/chunter-resources/src/search/hydrate.ts`), только для ChatMessage и только из `highlightableContent`.

## Новое поле в маппинге Elastic

- `initMapping` (`foundations/server/packages/elastic/src/adapter.ts`) удаляет общий индекс всех воркспейсов только при смене типа существующего свойства. Недостающее свойство добавляет `putMapping`. Удаление опустошает поиск во всех воркспейсах, а переиндексацию после него никто не запускает. Проверяет `adapter.itest.ts` (`Elastic mapping upgrade`).

## `$searchIn` и `$filter`

- `$searchIn` без `attached` не ищет вложенные документы (метки, комментарии, вложения). Если в списке только `attached`, адаптер Elastic возвращает `[]` по основным классам.
- Запрос с `$searchIn`, но без `$search` `FullTextMiddleware` отдаёт в БД без `$searchIn`: Postgres счёл бы ключ полем документа и вернул пустой результат. Такие запросы шлёт `ListCategory`: группы меньше 20 элементов читаются по `_id` без `$search`, остальные ключи запроса остаются.
- Повторная проверка по `_id` (`checkSearch`/`handleDocAdd`, `findOne` с limit 1) передаёт известные id директивой `$filter` (`{ id }`, для вложенных документов `{ attachedTo }`), адаптер делает из неё жёсткий `filter`. Без неё Elastic отдал бы первые `fullTextLimit` (100) совпадений, и документ дальше них считался бы неподходящим. Список id длиннее `fullTextLimit` в `$filter` не идёт: у Elastic лимит значений в `terms` (`index.max_terms_count`, 65536), сверх него поиск падает и возвращает `[]`. Остальные ключи запроса в `ElasticAdapter.search` только повышают вес (`should`).

## Score в `$source`

- Score документа - максимум из его собственного совпадения и лучшего совпадения его вложенных документов (`scoreOf`, `findChildDocuments` в `foundations/server/packages/middleware/src/fulltext.ts`). По `$source.$score` сортируют на клиенте `ObjectFilter`, `ChatsList`, `ChatNavSection`.
- `handleDocAdd` в live query кладёт в результат сырой документ из tx. `$source` с документа из проверочного `findOne` переносится на копию: tx-документ общий для запросов.

## Тесты

- Каждый jest-воркер поднимает свой контейнер Elastic. Два контейнера, стартующие одновременно, локально не уложились в 180 с, поэтому тесты Elastic живут в `search.itest.ts` и `adapter.itest.ts`, а не в отдельных файлах.

## Связанные заметки

- [fulltext_needs_reindex.md](fulltext_needs_reindex.md)
- [fulltext_bulk_mode.md](fulltext_bulk_mode.md)
