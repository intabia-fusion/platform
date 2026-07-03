# gh-picker

TUI для cherry-pick коммитов в обе стороны: из `upstream/develop` в твою ветку (incoming) и из твоей ветки в новую ветку на `upstream/develop` для PR (outgoing).

## Установка

```bash
cd dev/gh-picker
go build -o gh-picker .
```

Или в PATH:
```bash
ln -s $(pwd)/dev/gh-picker/gh-picker /usr/local/bin/gh-picker
```

## Запуск

```bash
./dev/gh-picker/gh-picker
# или
./dev/gh-picker/gh-picker -branch upstream/main
```

## Режимы

| Режим | Описание |
|-------|----------|
| **Incoming** (по умолчанию) | Коммиты из `upstream/develop`, которых нет у тебя. `c` cherry-pick в текущую ветку |
| **Outgoing** | Коммиты из твоей ветки, которых нет в `upstream/develop`. Фильтр по дереву папок. `m` мигрирует в новую ветку |

`o` переключает режим.

## Outgoing режим

Три панели:
1. **Folders** - дерево файлов затронутых outgoing коммитами. Выбор папки фильтрует commits по ней (Space/Enter на папке)
2. **Commits** - коммиты, отфильтрованные текущей папкой
3. **Diff** - diff текущего коммита

Выбираешь нужные коммиты (Space), жмешь `m`, вводишь имя новой ветки. Инструмент:
1. Создает ветку от `upstream/develop`
2. Для каждого коммита применяет **только файлы под выбранной папкой** (если папка не выбрана - весь коммит), автор/сообщение сохраняются
3. Коммиты без файлов под папкой пропускаются
4. Возвращается на исходную ветку
5. Помечает эти коммиты как `migrated` (скрываются из списка)
6. Показывает команду для push

Diff в центральной панели показывает **только файлы под выбранной папкой** - то что реально попадет в новую ветку.

Push делаешь сам: `git push -u upstream <branch>`, потом открываешь PR.

## Управление

| Клавиша | Действие |
|---------|----------|
| `↑/k` `↓/j` | Навигация |
| `←/h` `→/l` | Фокус на дерево / коммиты (outgoing) |
| `PgUp/PgDn` | Прокрутка |
| `Tab` | Циклически переключить фокус |
| `Space/Enter` | Toggle commit / выбрать папку в дереве |
| `a` | Выбрать все / снять все |
| `c` | Cherry-pick выбранных (incoming) |
| `m` | Migrate выбранных в новую ветку (outgoing) |
| `o` | Переключить incoming/outgoing |
| `r` | Обновить |
| `x` | Игнорировать коммит (в ignored view - вернуть) |
| `i` | Переключить list/ignored view |
| `?` | Помощь |
| `q/esc` | Выход |

## Ignore / migrated

Сохраняются в `.git/gh-picker-ignored` (локально, не коммитится). Формат:
```
incoming <hash>
outgoing <hash>
migrated <hash>
```

В outgoing ignored view показываются и ignored, и migrated (последние с маркером `[M]`).

## Applied cache (~/.gh-picker)

Incoming коммиты, которые уже точно применены (весь контент есть в HEAD -> `CherryPicked=true`, не Partial) или помечены вручную клавишей `A`, кэшируются в `~/.gh-picker/<repo-slug>.json` (per-repo, вне git-dir - переживает worktree/clone). При загрузке такие коммиты пропускают дорогую пофайловую проверку.

Инвалидация hash-based: hash коммита не меняется -> контент не меняется, раз применён - скипается навсегда. `r` (refresh) НЕ перепроверяет закэшированные. Сброс - клавиша `R` (очистить кэш repo + перезагрузка).

`A` - пометить applied (кэш + скрыть), `x` - ignore (скрыть без кэша). Разные понятия.

## Восстановление позиции курсора

После refresh, cherry-pick или migrate курсор возвращается на hash, на котором стоял. Если его уже нет в списке - на позицию 0.

## Файлы

- `main.go` - CLI
- `ui.go` - Model, KeyMap, styles, Init
- `update.go` - Update loop, обработчики клавиш, prompt
- `render.go` - View и все render* функции
- `filter.go` - фильтры по ignored/folder
- `tree.go` - treeNode + rebuild
- `commands.go` - tea.Cmd + messages (load/cherry-pick/migrate)
- `git.go` - обертки над git
- `ignore.go` - IgnoreStore (`.git/gh-picker-ignored`)
