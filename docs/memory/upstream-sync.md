# Синк с upstream (Platform-Collective/platform)

Область: [Getting started](../getting-started.md)

## Контекст

`upstream` = `https://github.com/Platform-Collective/platform`, точка расхождения - `f94d564ec6` "Support default invite setting in branding (#10591)".

Тег-чистка: `dev/clean-upstream-tags.sh --apply` удаляет локальные теги, которых нет в `origin`/`haiodo`, и ставит `remote.upstream.tagOpt=--no-tags` (`dev/clean-upstream-tags.sh`), чтобы повторный `fetch` их не тянул.

## dev/gh-picker

TUI плюс CLI-подкоманды `report`/`packages`/`skip`/`unskip` (`dev/gh-picker/main.go`). "Уже применено" определяется тремя независимыми механизмами: `git log --cherry-pick` по patch-id, applied cache `~/.gh-picker/<repo-slug>.json` (`dev/gh-picker/applied.go`), ignore store `.git/gh-picker-ignored` (`dev/gh-picker/ignore.go`). Subject/patch-id совпадений в истории мало - предыдущие порты обычно squash/переработаны, поэтому только пофайловое сравнение контента (`-check`) даёт реальную картину.

Ловушки идентификации, все три починены в коде:
- Pathspec в `report` резолвился относительно cwd, запуск не из корня репозитория давал пустой `git diff` и ложное "уже применён". Фикс: `chdirToRepoRoot()` (`dev/gh-picker/main.go`) плюс `:(top)`-префикс на pathspec (`dev/gh-picker/report.go`).
- Параллельный content-check ронял read-only `git diff`/`git apply` на гонке за `index.lock`, ошибка трактовалась как "нет изменений". Фикс: `GIT_OPTIONAL_LOCKS=0` (`dev/gh-picker/git.go`).
- `git log --format` не переживает NUL в argv (`fork/exec: invalid argument`) - разделители записей `\x1e`/`\x1f` (`dev/gh-picker/report.go`).

`dev/pick-upstream.sh` пикает коммиты через `git cherry-pick -x -X ours` (`dev/pick-upstream.sh`), `-x` оставляет трейлер `cherry picked from commit`.

## Ловушка `git cherry-pick -X ours`

`-X ours` разрешает конфликтующие хунки молча, и cherry-pick при этом считается "успешным" - но может тихо потерять нужные строки без сигнала конфликта (импорт, зависимость в `package.json`, часть реактивного объявления в Svelte). Numstat-сравнение с оригиналом ловит только исчезнувшие строки, не подменённые.

Обязательная проверка после такого пика: `pnpm run svelte-check` в каждом затронутом svelte-пакете, запускать из самого пакета - через корневой прогон вывод по упавшему пакету может не долистать до сообщений об ошибке. Ни eslint, ни tsc не ловят обращение к необъявленной переменной внутри svelte-шаблона (компилятор трактует её как глобал, значение `undefined`) - единственный детектор такого случая - svelte-check.
