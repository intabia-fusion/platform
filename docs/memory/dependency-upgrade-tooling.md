# Dependency upgrade tooling

```bash
node common/scripts/outdated.js                                   # -> combined_dependencies/UPGRADE.md + upgrade_plan.tsv
node common/scripts/outdated-apply.js --category ui --bump patch  # бампает версии + печатает команду проверки
node common/scripts/outdated-bench.js fast-equals                 # сравнить текущую и целевую версию под нагрузкой
```

`outdated.js` сканирует все `@hcengineering/*` package.json, берёт latest из registry.npmjs.org (без `npm outdated`/`npm install`), тянет release notes с GitHub (нет релизов - diff CHANGELOG между тегами, иначе список коммитов), пишет `UPGRADE.md`: сводка по категориям, внутри - группы security / чистые patch-minor / patch-minor с breaking / major, ниже детали по пакету со ссылкой на `changes/<pkg>.md`.

Категории (ровно одна на пакет): `core ui svelte web dbs ai livekit otel collaboration-server integrations content desktop node build lint test` (+ `server`/`services` как fallback по путям).
- решают правила по имени пакета, порядок: node -> otel -> collaboration-server (`@hocuspocus/*`, yjs, y-*, lib0) -> livekit (livekit-*, @livekit/*) -> ai (openai, gigachat, js-tiktoken, @deepgram) -> dbs (mongodb, bson, postgres, minio, elastic, @aws-sdk/client-s3|lib-storage|s3-request-presigner, @smithy) -> core (uuid, morgan, fast-equals, fast-copy, hash-it, lru-cache, dotenv, commander, zod, msgpackr, winston...) -> lint -> desktop -> test -> svelte -> build -> web (express/koa стек, ws, cors, form-data) -> integrations (googleapis, octokit, telegram, stripe, nodemailer, passport, openid-client, @aws-sdk/client-ses) -> content (pdf/docx/markup/csv/archives: pdf-lib, pdfjs-dist, mammoth, sharp, markdown-it, dompurify, tar, puppeteer, node-forge, @signpdf/*);
- что не попало под правила - по путям потребителей (категория с наибольшим числом): `dev/tool`, `dev/import-tool` считаются server (рантайм-CLI), тесты - только `tests/ ws-tests/ qms-tests/ dev/storybook dev/test-base dev/benchmarks`, `common/` - build;
- `@types/x` наследует категорию `x`.

Ключевое:
- кэш `combined_dependencies/cache/` (npm-метаданные, GH releases/tags/compare) + `changes/*.md` с ключом по диапазону версий в первой строке. TTL `CACHE_TTL_DAYS` (7 дн.), сброс `--force`. Холодный прогон ~24с, повторный ~1.6с.
- прочие env/флаги: `SKIP_PACKAGES` (по умолчанию `@tiptap/`), `MAX_RELEASES`, `MAX_PAGES`, `--category`, `--no-notes`.
- semver: для 0.x minor трактуется как breaking; latest = максимальная стабильная версия (prerelease игнорируются).
- категория `node` ограничена мажором целевого Node (из `rush.json` nodeSupportedVersionRange, сейчас 24; override `NODE_TARGET_MAJOR`): `@types/node` предлагается 24.x, а не 26.x - типы нельзя гнать впереди рантайма.
- монорепо-теги вида `effector-react@23.3.0` отфильтровываются по basename, иначе в ноты попадают релизы соседних пакетов.
- `--category` выбирает набор зависимостей, но правит версии во всех package.json: rush check требует единую версию по репо. Замена текстовая, форматирование сохраняется. После применения пишется `combined_dependencies/verify.sh` (`rush update` + `rush fast-build:lint --to <затронутые>`).

## Пины (не обновлять выше)

`common/config/dependency-pins.json` - `maxMajor` или точная `maxVersion` + причина. outdated.js режет предлагаемый latest по пину и печатает причину в UPGRADE.md; apply не может уйти выше.
Текущие: fast-copy<=3 (v4 на 9-23% медленнее), svelte<=4 (runes), uuid<=11 (12+ ESM-only), intl-messageformat<=10 (11 ESM-only), lru-cache<=11.1.0 (в 11.5.2 get(hit) 0.86x, get(miss) 0.52x), dotenv<=16 (17 печатает 'injecting env' в stdout), msgpackr<=1 (сетевой формат, обновлять клиент+сервер синхронно).

## Бенчи зависимостей

`common/scripts/outdated-bench.js <pkg> [verA verB] | --all` ставит обе версии рядом (alias `bench0`/`bench1` в `combined_dependencies/bench`, ESM грузится через loader.mjs) и меряет best-of-N интерливингом - фоновая нагрузка может только замедлить раунд, поэтому лучший раунд каждой версии сопоставим.
Сценарий: `common/scripts/bench/<pkg>.js`, экспорт `(module) => [{ name, run }]`, фикстуры в `bench/_data.js` (Doc-объекты, markup-дерево, 200 доков). Есть: fast-equals, fast-copy, uuid, lru-cache, msgpackr, ws, express, koa.
Серверные сценарии - async: экспортируют `{ cases, teardown }`, кейс помечается `{ async: true, concurrency: N }` (N операций в полёте). HTTP-сценарии (express/koa) держат клиента и сервер в одном процессе и упираются в undici (~24 ops/ms при concurrency 32 и 128 одинаково) - различия меньше ~10% там не значимы, для роутера нужен внешний нагрузчик. ROUNDS/ROUND_MS настраиваются.
Замеры 2026-09-05: fast-equals 6.0.3 быстрее 5.x на 7-31%; fast-copy 4.x медленнее 3.x на 9-23%; uuid 11 v4() в 4 раза быстрее 8.3.2 (parse() -22%, но parse в репо не используется); lru-cache 11.5.2 медленнее на чтении; msgpackr 2.1.0 pack -6%; ws 8.21.3 == 8.18.2; express 5.2.1 == 4.21.2 и koa 3.2.1 == 2.15.4 (в пределах шума стенда).

## Node

Минимальная версия Node - 24, `rush.json` `nodeSupportedVersionRange` = `>=24.0.0 <25.0.0` (было `>=20`). На других мажорах не тестируем. Категория `node` в отчёте автоматически ограничена этим мажором, поэтому `@types/node` предлагается 24.x.

## Грабли

- скан должен идти по всем package.json дерева, а не по `rush.json` projects и не по фильтру `@hcengineering/`: часть пакетов в скоупе `@intabiafusion/`, а `foundations/net` и `foundations/core` - вложенные rush-workspace, которых нет в корневом rush.json. Иначе часть файлов не бампается и `rush check` падает с mis-matching dependencies.
- сбор release notes нельзя обрывать на первой версии ниже текущей: ws публикует бэкпорты 7.x/6.x/5.x между релизами 8.x, из-за чего ноты обрывались на двух записях. Сейчас прерывание только после 10 подряд более старых релизов.
- postgres 3.4.8 сузил `TransactionSql`: он больше не присваивается к `Sql` (нет CLOSE/END/PostgresError/options). Ломается всё, что принимает `client: postgres.Sql`, а получает клиента из `begin()`/`retryTxn`. Починено алиасом `SqlClient = Sql | TransactionSql` в `server/account/src/collections/postgres/postgres.ts:82` и union-параметрами в `foundations/server/packages/postgres/src/utils.ts`, `services/worker/src/db.ts:94`.
- image-size 2.x: подпуть `image-size/fromFile` наш moduleResolution не резолвит (TS2307) - читать файл самим и звать `imageSize(buffer)`.
- обновление OTel до 0.222 сломало `new BatchLogRecordProcessor(exporter, opts)` - теперь экспортёр внутри options (`measurements-otlp/src/telemetry.ts`).
