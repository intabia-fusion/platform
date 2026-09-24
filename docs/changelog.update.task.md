<!--
Copyright © 2026 Intabia Fusion.

Licensed under the Eclipse Public License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

See the License for the specific language governing permissions and limitations under the License. -->

# Инструкция: обновление `changelog.md`

Порядок действий для обновления `changelog.md` скриптом `common/scripts/update-changelog.js`.

Скрипт смотрит теги на remote `origin`, получает коммиты для каждой новой версии (после последней версии, указанной в `changelog.md`), отфильтровывает мерджи и `Signed-off-by:`-футеры, оставляет только "существенные" коммиты и генерирует секции для `changelog.md`. По умолчанию dry-run - файл не записывается, для записи нужен флаг `--apply`.

Скрипт отказывается работать, если URL remote `origin` не похож на `intabia-fusion/foundation` (`common/scripts/update-changelog.js`, функция `main`) - обойти проверку можно флагом `--allow-other-remote` или `--force`.

## Быстрый сценарий

1. Просмотреть предлагаемые изменения (dry-run):
   ```
   node common/scripts/update-changelog.js
   ```
2. Если всё ок, применить:
   ```
   node common/scripts/update-changelog.js --apply
   ```
3. Проверить результат: `git --no-pager diff changelog.md`.
4. Закоммитить в отдельной ветке и открыть PR:
   ```
   git checkout -b chore/update-changelog/<range>
   git add changelog.md
   git commit -m "chore(changelog): update changelog for <versions>"
   git push origin HEAD
   ```

## Параметры скрипта

- `--apply` - записать изменения в `changelog.md` (по умолчанию dry-run).
- `--origin <name>` - remote для проверки тегов (по умолчанию `origin`).
- `--from <X.Y.Z>` - переопределить "последнюю версию" из `changelog.md` (другой якорь диапазона).
- `--allow-other-remote` / `--force` - разрешить remote, чей URL не совпадает с `intabia-fusion/foundation`.

## Критерий "существенного" коммита

Функция `isSubstantialCommit` в `common/scripts/update-changelog.js`:

- conventional commit type `feat`, `fix`, `perf`, `security`, `revert` - включается; любой другой явный тип (`chore`, `docs`, `style`, `test`, `ci`, ...) - не включается, даже со ссылкой на issue (кроме `refactor` со ссылкой на issue - включается).
- без явного типа: ссылка на issue/PR (`#1234`) - включается; иначе - по наличию глагола функционального изменения (`add`, `support`, `implement`, `fix`, `remove`, `upgrade`, `update`, `introduce`, `improve` и т.п.) минус явные исключения `update`/`bump` changelog-README-package.json и подписи, начинающиеся с `format`/`lint`/`ci`/`test`/`docs`/`chore`.
- если для тега не осталось ни одного существенного коммита, запись для этой версии не создаётся (скрипт пропускает тег и печатает "skipping").

Правки критерия - через эту же функцию, проверять dry-run'ом.

## Отладка

- Скрипт не находит теги на `origin`: `git remote -v`, затем `git ls-remote --tags origin` вручную.
- Скрипт не находит якорный тег: версия в `changelog.md` должна соответствовать тегу `vX.Y.Z` на `origin`, иначе `--from <X.Y.Z>`.
- Откатить неудачную правку: `git restore changelog.md`.

## Ручная генерация списка коммитов (тот же принцип фильтрации, что в скрипте)

```
git log --pretty=format:'- %h %s' v0.7.318..v0.7.319 \
  | grep -v -F 'Merge remote-tracking' \
  | sed -E 's/\s*Signed-off-by:.*$//'
```

## Связанные документы

- [Getting started](./getting-started.md)
