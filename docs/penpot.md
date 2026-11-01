# Penpot: макеты интерфейса

Макеты Intabia Platform рисуются в локальном [Penpot](https://github.com/penpot/penpot). Источник истины - код в `dev/design/` (kit, экраны, данные; общий с Storybook и pen.dev) и `dev/penpot/` (стенд и сборка Penpot). Из этих скриптов файл Penpot пересобирается одной командой, а изменения макета видны в diff.

- Цвета и размеры берутся из темы платформы (`packages/theme/styles`, `packages/ui/src/colors.ts`), поэтому макет не расходится с кодом.
- Компоненты повторяют `@hcengineering/ui/kit` и экраны платформы: имена, kind/size кнопок, карточка задачи из `KanbanView.svelte`. Значения сверены с sanity-стендом.
- Claude Code рисует через MCP-сервер Penpot. Дизайнер может править тот же файл руками.

План заполнения библиотеки ведётся в foundation-tasks: `docs/ux/2026-10-22-penpot-ui-kit.md`.

## Быстрый старт

Нужны Docker, Node 20+ и `pnpm install`: Playwright берётся из `tests/sanity`.

```bash
pnpm -w design         # проверить, что Penpot поднят, напечатать логин и пароль, открыть в браузере
pnpm -w design:up      # поднять Penpot и восстановить всё из репозитория
pnpm -w design:down    # остановить, данные остаются
pnpm -w design:down --wipe   # остановить и удалить данные; перед этим снимки в dev/penpot/files/backup-<время>/
pnpm -w design:diff    # ручные правки и комментарии в открытом файле относительно кода
pnpm -w design:demo [путь]   # обновить демо-данные макетов из worktree с веткой FUSIO-1594 (по умолчанию ../foundation4-demo)
```

`design:up` в конце и `design` печатают, куда заходить:

- Penpot: http://localhost:9101, вход `designer@local.dev` / `designer123`. Пользователь задан в `dev/design/design.json`.
- Ссылки на файлы проекта Intabia: "Intabia UI Kit" и файлы задач.
- Почта (mailcatcher): http://localhost:1081.

Что делает `design:up`, по шагам:

1. `docker compose up` для `dev/penpot/docker-compose.yaml` (Penpot 2.18.3, порты 9101 и 1081).
2. Создаёт пользователя, если его нет, и включает ему MCP.
3. Берёт или создаёт MCP-ключ и записывает `dev/penpot/.env`.
4. Регистрирует MCP-сервер `penpot` в Claude Code для этого чекаута (`claude mcp add -s local`). Флаг `--no-claude` пропускает этот шаг.
5. Создаёт отсутствующие файлы из `design.json` и подключает к ним библиотеки.
6. Пересобирает файлы, которые нужно пересобрать (раздел ниже). Для этого открывает каждый файл в headless Chromium, ждёт подключения MCP-плагина, выполняет скрипты из `build` и ждёт, пока Penpot сохранит изменения.

Полное восстановление с нуля (`design:down --wipe`, затем `design:up`) занимает около 3 минут.

## Обновление репозитория

После `git pull` достаточно снова запустить `pnpm -w design:up`.

- Для каждого файла хранится хеш исходников, из которых он собран: `dev/design/kit/*.js`, `dev/penpot/kit/*.js`, скрипты из `build`, запись в `design.json`. Хеши лежат в `dev/penpot/.state.json`, по id файла.
- Если хеш изменился (кто-то поменял kit, библиотеку или экран), файл пересобирается.
- Перед пересборкой существующего файла его снимок сохраняется в `dev/penpot/files/backup-<время>/`.
- Пересборка очищает страницы, которые рисуют скрипты (`kit.page`). Ручные правки на этих страницах пропадают, их остаётся только в снимке. Правку, которую нужно сохранить, переносят в скрипт.
- `--rebuild` пересобирает все файлы, `pnpm -w design:build ["<файл>"]` - выбранные.

## Правки в Penpot -> код

Всё хранится кодом. Penpot - место, где человек показывает, что и где поменять: правит фигуры руками или оставляет комментарий. Агент переносит это в скрипты.

1. Человек правит открытый файл или пишет комментарий на фрейме.
2. Просит агента "вгрузи правки из penpot" (навык `.agents/skills/penpot-ingest`). Агент:
   - снимает расхождения `pnpm -w design:diff`;
   - правит `kit/`, `screens/`, `library/`;
   - пересобирает файл в открытой вкладке;
   - проверяет, что `diff` пуст, и отвечает в тредах комментариев.
3. Изменения видны в `git diff`. Коммит - по просьбе.

Как `diff` находит правки. При сборке `kit.settle` записывает в каждую фигуру отпечаток того, что нарисовал скрипт: текст, заливки, обводки, раскладку, размер, дочерние фигуры. Хранится он в shared plugin data `intabia/gen`. Страница запоминает свои скрипты (`intabia/src`). `kit.diffAll` сравнивает файл с отпечатками. Открытые комментарии `penpot.mjs` добавляет через RPC бэкенда (`get-comment-threads`), а закрывает командой `reply`. Результат пишется в `dev/penpot/files/diff/<файл>.json`.

Защита от потери правок. `design:up` и `design:build` не пересобирают файл с непереносёнными правками: файл пропускается с сообщением. `--force` пересобирает всё равно, снимок перед этим сохраняется.

Применить макет к задаче и коду платформы - навык `.agents/skills/design-implement`. Он сопоставляет to-be экраны с компонентами, готовит план и скриншоты, реализует и сверяет результат со стендом.

При доступном делегировании субагенты выполняют замеры стенда, сборку, разбор `diff` и скриншотов. Основной агент принимает решения и проверяет. Без субагентов работа выполняется последовательно. Подробно - в навыках `penpot-ingest` и `design-implement`.

## Одна вкладка Penpot

MCP-сервер Penpot держит одно подключение плагина на MCP-ключ и отклоняет остальные. На этом же ограничении пересборка падает с ошибкой "MCP is held by another Penpot tab": headless-браузер не может подключиться, пока открыта ваша вкладка.

- Перед `design:up` и `design:build` закройте вкладки Penpot в браузере.
- Для ручной работы через Claude Code (`penpot.mjs run`) держите открытой одну вкладку с нужным файлом. Кнопка **MCP** на панели должна показывать "MCP connected".
- Вкладка должна быть активной: фоновую вкладку браузер замораживает, и MCP отвечает ошибкой.

## Структура `dev/design/` и `dev/penpot/`

Общий источник макетов (kit, экраны, данные) лежит в `dev/design/` и используется тремя бэкендами: Storybook, pen.dev и Penpot. В `dev/penpot/` остаётся только то, что нужно Penpot. Подробнее о `dev/design/`: [dev/design/README.md](../dev/design/README.md).

| Путь | Что внутри |
| --- | --- |
| `dev/penpot/docker-compose.yaml` | Локальный Penpot |
| `dev/design/design.json` | Пользователь, проект, файлы, их библиотеки и скрипты сборки (пути относительно `dev/design/`) |
| `dev/penpot/penpot.mjs` | CLI без зависимостей: `up`, `down`, `build`, `run`, `shot`, `export`, `import`, `new`, `link`, `files`; `tokens` и `demo` делегируют в `dev/design/generate.mjs` |
| `dev/design/generate.mjs` | Команды `tokens` и `demo`: генерация `kit/00-tokens.generated.js` и `kit/05-demo.generated.js` |
| `dev/design/kit/00-tokens.generated.js` | Цвета light/dark, палитра (цвет, title, background), размеры. Генерируется, руками не правится |
| `dev/design/kit/05-demo.generated.js` | Демо-данные `DEMO.ru` и `DEMO.en`: проекты, статусы с категориями, задачи, люди, метки, компоненты, вехи. Генерируется из `tests/demo-ws*` и `dev/design/demo/`, руками не правится. Как и токены, уходит в плагин через `storage` |
| `dev/design/demo/<язык>/` | То, чего нет в демо-стенде: статусы (`Статусы/`), задачи проекта (`<проект>/`), конфигурация досок (`Доски/`). Формат как у `tests/demo-ws`: файл `.mdx` на объект, YAML-шапка, текст в теле. Их же `generate-demo-data` загружает в демо-стенд (`tests/prepare-pg.sh --docs`), так что продукт показывает те же данные, что макеты |
| `dev/design/kit/10-core.js` | Примитивы: `kit.box`, `kit.text`, `kit.add`, `kit.icon`, `kit.page`, `kit.settle`; `T()` - цвет темы, `D()` - размер |
| `dev/design/kit/20-atoms.js` | `Button`, `IconButton`, `StatusIcon`, `PriorityIcon`, `Avatar`, `Chip`, `Label`, `StatusChip`, `Tabs`, `Input`, `Checkbox`, `Toggle`, `Menu`, `Notice` |
| `dev/design/kit/30-workbench.js` | Оболочка приложения `Workbench`, `NavItem`, `SpaceHeader`, `QuickFilter` |
| `dev/design/kit/40-tracker.js` | `IssueCard`, `ColumnHeader`, `KanbanColumn` |
| `dev/design/kit/50-settings.js` | Страница настроек `SettingsLayout`, `FormRow`, `FilterChip`, `Table`, `Radio`, `Swatch` |
| `dev/penpot/kit/60-trace.js` | Отпечатки сборки и `kit.diffAll` для `design:diff`; грузится только в Penpot |
| `dev/penpot/library/ui-kit.js` | Файл-библиотека "Intabia UI Kit": токены Penpot и компоненты с вариантами, по странице на категорию |
| `dev/design/screens/<задача>/` | Экраны задачи. Файлы с `_` - общие данные экранов |
| `dev/penpot/.env`, `.state.json`, `files/` | Локальные: ключи, хеши сборок, снимки. В `.gitignore` |

`penpot.mjs run` склеивает `dev/design/kit/*.js` и `dev/penpot/kit/*.js` (без `*.generated.js`) по порядку имён и добавляет переданные скрипты. Поэтому `kit`, `T`, `D` и `TOKENS` видны в скрипте как обычные идентификаторы. Код выполняется в контексте Penpot Plugin API: доступны `penpot`, `penpotUtils`, верхнеуровневые `await` и `return`.

## Команды

```bash
node dev/design/generate.mjs tokens                          # пересобрать kit/00-tokens.generated.js из темы
node dev/design/generate.mjs demo [worktree]                 # пересобрать kit/05-demo.generated.js из tests/demo-ws* (YAML читается через js-yaml из dev/tool)
node dev/penpot/penpot.mjs run <script.js> [...]           # выполнить kit + скрипты в подключённом файле
node dev/penpot/penpot.mjs shot <shapeId> <out.png>        # PNG фрейма для проверки
node dev/penpot/penpot.mjs files                           # файлы и их id
node dev/penpot/penpot.mjs new "<имя>" [--shared]          # новый файл в проекте Intabia
node dev/penpot/penpot.mjs link "<файл>" "<библиотека>"    # подключить библиотеку к файлу
node dev/penpot/penpot.mjs export "<файл>" [out.penpot]    # снимок файла
node dev/penpot/penpot.mjs import <file.penpot>            # загрузить снимок в Penpot
```

## Penpot на другом хосте

Стек можно держать на отдельной машине (например, Mac mini `10.0.2.2`), чтобы макеты были доступны по сети при выключенном ноутбуке.

```bash
pnpm -w design:up --host 10.0.2.2     # скопировать compose, поднять стек, создать пользователя, собрать файлы
pnpm -w design --host 10.0.2.2        # адрес, логин, пароль, ссылки на файлы, открыть браузер
pnpm -w design:build --host 10.0.2.2  # пересобрать файлы
pnpm -w design:diff --host 10.0.2.2   # ручные правки подключённого файла
pnpm -w design:down --host 10.0.2.2   # остановить стек
```

- **Что где работает.** Контейнеры Penpot (`docker compose -p penpot` в `~/penpot-intabia` на хосте) запускаются по ssh. Headless-сборка файлов идёт на вашей машине и ходит на `http://<host>:9101`.
- **Требования к хосту.** Вход по ssh-ключу без пароля, Docker Desktop с включённым "Start Docker Desktop when you sign in": стек имеет `restart: always` и поднимется после перезагрузки. Если демон не запущен, `up` сам выполняет `open -a Docker` и ждёт до 5 минут.
- **Локальные данные.** Логин и MCP-ключ хранятся в `dev/penpot/.env.<host>`, хеши сборок в `.state.<host>.json`. Локальный стек и `.env` не затрагиваются. MCP регистрируется в Claude Code как `penpot-<host>`.
- **Как заходят другие.** Либо общий логин дизайнера из `design --host`, либо свои аккаунты (письма Penpot видны в mailcatch `http://<host>:1081`). Для просмотра без аккаунта в Penpot есть "Share prototype" со ссылкой только на чтение.
- **Одна вкладка.** Правило "один плагин на MCP-ключ" действует для каждого хоста отдельно: вкладка в локальном Penpot не мешает хосту.
- **macOS Local Network.** Если `node` получает `EHOSTUNREACH` при том, что `curl` работает, разрешите терминалу доступ к локальной сети (System Settings, Privacy & Security, Local Network).

## Как добавить

- **Компонент.** Функция в `kit/` рядом с похожими. Цвета только через `T('<css-переменная>')` или палитру, размеры через `D()`. Затем запись в `groups` в `library/ui-kit.js`: категория и варианты по props компонента.
- **Экран.** Файл в `dev/design/screens/<задача>/` и строка в `build` нужного файла в `design.json`. Скрипт начинается с `await kit.page('<имя страницы>')` и заканчивается `await kit.settle()`. Оболочка берётся из `kit.Workbench`, содержимое собирается из функций kit.
- **Новый файл задачи.** Запись в `files` в `design.json` с `libraries: ["Intabia UI Kit"]`; ключ `"storybook": "<раздел>"` выводит экраны файла в Storybook. Принятые экраны текущего состояния лежат в `dev/design/screens/current/` (файл "Intabia Screens"). Затем `pnpm -w design:up`.
- **Данные на экране.** Задачи, людей, проекты и статусы берут из `DEMO.ru` или `DEMO.en` (по языку текстов экрана), а не пишут в скрипт. Чего в демо нет (статусы, доски, колонки), лежит в `dev/design/demo/<язык>/` и попадает в `DEMO` той же командой `design:demo`; `_data.js` только выводит данные из `DEMO`. Данные реальных клиентов в макеты не попадают. Новые демо-данные: `pnpm -w design:demo`, затем `pnpm -w design:up`.
- **Новые цвета темы.** `node dev/design/generate.mjs tokens`, затем `pnpm -w design:up`: kit изменился, и затронутые файлы пересоберутся.

## Ограничения

- Цвета привязаны к токенам Penpot только в UI Kit, где эти токены есть. Там переключение темы `Mode/Dark` перекрашивает компоненты. В файлах экранов цвета записаны значениями светлой темы. Чтобы получить dark-версию экрана, в скрипте задают `kit.mode = 'dark'` и собирают экран отдельно.
- Экраны собираются из функций kit, а не из экземпляров компонентов библиотеки. Пересборка библиотеки создаёт компоненты заново с новыми id, поэтому экземпляры в других файлах потеряли бы связь. Переход описан в плане (TSK-2026-10-22-penpot-ui-kit-04, -16).
- Снимок `.penpot` экспортируется вместе с миниатюрами: файл задачи весит 5-7 МБ. Поэтому снимки в git не хранятся.

Особенности Penpot, найденные при сборке: [memory/penpot.md](memory/penpot.md).
