# Dependency upgrade tooling

```bash
node common/scripts/outdated.js                                   # -> combined_dependencies/UPGRADE.md + upgrade_plan.tsv
node common/scripts/outdated-apply.js --category ui --bump patch  # бампает версии + печатает команду проверки
```

`outdated.js` сканирует все `@hcengineering/*` package.json, берёт latest из registry.npmjs.org (без `npm outdated`/`npm install`), тянет release notes с GitHub (нет релизов - diff CHANGELOG между тегами, иначе список коммитов), пишет `UPGRADE.md`: сводка по категориям, внутри - группы security / чистые patch-minor / patch-minor с breaking / major, ниже детали по пакету со ссылкой на `changes/<pkg>.md`.

Категории (ровно одна на пакет): `core ui svelte server collaboration-server services desktop node build lint test`.
- сначала правила по имени пакета: node (`@types/node`, `@tsconfig/node*`) -> core (fast-equals/fast-copy) -> collaboration-server (`@hocuspocus/*`, yjs, y-*, lib0) -> lint (eslint/prettier и их плагины, включая eslint-plugin-svelte) -> desktop (electron*) -> test (storybook/playwright/jest/allure/faker) -> svelte (svelte, svelte-loader, esbuild-svelte, svelte2tsx, svelte-check, svelte-preprocess) -> build (webpack/*-loader/postcss/sass/esbuild/typescript/tailwind) -> services (openai, stripe, googleapis, telegram, octokit, deepgram, nodemailer, passport, openid-client);
- иначе по путям потребителей, категория с наибольшим числом: `dev/tool`, `dev/import-tool` и т.п. считаются server (это рантайм-CLI), тесты - только `tests/ ws-tests/ qms-tests/ dev/storybook dev/test-base dev/benchmarks`, `common/` - build;
- `@types/x` наследует категорию `x`.

Ключевое:
- кэш `combined_dependencies/cache/` (npm-метаданные, GH releases/tags/compare) + `changes/*.md` с ключом по диапазону версий в первой строке. TTL `CACHE_TTL_DAYS` (7 дн.), сброс `--force`. Холодный прогон ~24с, повторный ~1.6с.
- прочие env/флаги: `SKIP_PACKAGES` (по умолчанию `@tiptap/`), `MAX_RELEASES`, `MAX_PAGES`, `--category`, `--no-notes`.
- semver: для 0.x minor трактуется как breaking; latest = максимальная стабильная версия (prerelease игнорируются).
- категория `node` ограничена мажором целевого Node (из `rush.json` nodeSupportedVersionRange, сейчас 24; override `NODE_TARGET_MAJOR`): `@types/node` предлагается 24.x, а не 26.x - типы нельзя гнать впереди рантайма.
- монорепо-теги вида `effector-react@23.3.0` отфильтровываются по basename, иначе в ноты попадают релизы соседних пакетов.
- `--category` выбирает набор зависимостей, но правит версии во всех package.json: rush check требует единую версию по репо. Замена текстовая, форматирование сохраняется. После применения пишется `combined_dependencies/verify.sh` (`rush update` + `rush fast-build:lint --to <затронутые>`).
