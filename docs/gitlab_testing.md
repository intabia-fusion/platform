# Push ветки в GitLab для проверки

Ветка живёт в основном `origin`, а проверить её нужно через GitLab, подключённый вторым remote.
Upstream ветки при этом не меняется.

## Добавить remote (один раз)

```bash
git remote add gitlab <url репозитория в GitLab>
git remote -v
```

## Push

GitLab запускает pipeline только для веток `cicd*` (плюс `develop`, теги `v*`/`s*` и merge request),
поэтому локальную ветку пушим под именем с префиксом `cicd/`:

```bash
# локальная my-feature -> gitlab/cicd/my-feature
git push gitlab my-feature:cicd/my-feature

# после rebase, если ветка в GitLab уже есть
git push --force-with-lease gitlab my-feature:cicd/my-feature
```

Без `-u` привязка не меняется: обычный `git push` из `my-feature` по-прежнему идёт в `origin`.

```bash
git rev-parse --abbrev-ref @{u}   # origin/my-feature
```

## Удалить ветку после проверки

```bash
git push gitlab --delete cicd/my-feature
```
