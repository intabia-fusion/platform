# ci_deploy.sh и стенды selfhost

Область: [Getting started](../getting-started.md)

Деплой-скрипт этого репозитория - `ci_deploy.sh` (корень репо). Он раскатывает отдельный чекаут `platform-selfhost` (`https://github.com/intabia-fusion/platform-selfhost.git`, `ci_deploy.sh`) на стенде; файлы этого второго репозитория (`compose.yml`, `setup.sh`, `up.sh`, `cleanup.sh`, `set-version.sh`) в этом чекауте недоступны, факты о них ниже перепроверены только через `ci_deploy.sh`.

## WEBHOOK ломал update

`ci_deploy.sh` веток FUSIO-1151 (`156f84bdfb`) дописывал `WEBHOOK_ENABLED=true` в `config/platform.conf` стенда. Режим `update` конфиг не пересоздаёт, поэтому флаг переживал раскатку ветки без `services/webhook`: `set-version.sh` под `set -e` падал на `pull` несуществующего образа `webhook:<version>` раньше `up.sh`. Режим `clean` работал только потому, что стирал конфиг целиком.

Теперь флаг выставляется в обоих режимах: явный `setup.env.WEBHOOK_ENABLED` стенда, иначе по наличию каталога `services/webhook` в деплоимом чекауте (`ci_deploy.sh`). При выключении контейнеры `webhook`/`webhook-mock` удаляются явным `docker rm -f` по label-фильтру (`ci_deploy.sh`) - compose не трогает сервисы неактивного профиля, иначе они остались бы на старом образе.

Выключено = ПУСТАЯ строка, не `false`: selfhost `compose.yml` проверяет `${WEBHOOK_ENABLED:+...}` (комментарий `ci_deploy.sh`), а `false` - непустая строка, значит фронту ушёл бы `WEBHOOK_SERVICE_URL`, хотя профиль `webhook` не поднят.

## QA tools (профиль `qa`: Dozzle на `/_logs`, страница стенда на `/_stand/`)

`setup.env.QA_TOOLS_ENABLED: 'true'` включает профиль, пользователь `qa`, пароль по умолчанию `<имя стенда>qa123` (`ci_deploy.sh`), если `QA_TOOLS_PASSWORD` не задан явно. Ключи `QA_TOOLS_*` (и `PLATFORM_ADMIN_EMAILS`) пишутся и в исходный `platform.conf`, и добавляются в `update` (`ci_deploy.sh`) - остальной `setup.env` доходит до стенда только через изначальный `setup.sh`, то есть только при `clean`.

## Сидирование (`seed:` в конфиге стенда)

- Повторяет локальный стенд `sanity` из `dev/test-base/src/stands.ts`: аккаунты `user1`/`user2`/`user3`/`user4`/`admin`, workspace `sanity-ws` (restore из `tests/sanity-ws`) плюс `meetings-ws`.
- Дамп `tests/sanity-ws` (960K на диске) едет внутри `deploy.sh` как base64-heredoc (`ci_deploy.sh`) - на стенде есть только чекаут selfhost, исходного репозитория там нет.
- Аккаунт `account`-сервиса читает список платформенных админов из env `ADMIN_EMAILS` (`server/account/src/admin.ts`, читается один раз при импорте модуля). `PLATFORM_ADMIN_EMAILS` - это входной параметр стенда/`ci_deploy.sh`, который docker-compose подставляет как `ADMIN_EMAILS=admin,${PLATFORM_ADMIN_EMAILS}` (`dev/docker-compose.yaml`) - `admin` домешивается всегда.
- `tool create-workspace` не идемпотентен: на занятый url создаёт второй workspace со случайным суффиксом. Поэтому seed сначала проверяет `login user1@user1` + `selectWorkspace sanity-ws` через RPC account и пропускает сидирование, если стенд уже засеян (`ci_deploy.sh`).
- `tool` глотает свои ошибки (`withAccountDatabase` в `dev/tool/src/index.ts` ловит и печатает, процесс завершается с exit 0), поэтому после сидирования обязательна независимая проверка через RPC: `login` user1 + `selectWorkspace sanity-ws`.
- `deploy.sh` на стенде запускается из временного файла со stdin, явно перенаправленным в `/dev/null` (`ci_deploy.sh`), а не `bash -s`: при `bash -s` `up.sh` (docker compose) читал часть stdin, и bash продолжал раскатку base64-дампа с середины.

## Почта и OTP на стендах

Почта (account -> redpanda -> mail_server -> mailpit) работает, но nodemailer отбрасывает адрес без `@` ("No recipients defined") - OTP для логинов `admin`/`user1` не доходил. Seed поэтому создаёт `admin@admin`, `user1@user1`, `user2@user2` (`ci_deploy.sh`). `isEmail` в `server/account/src/utils.ts` требует точку в домене (regex `(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+...`), но проверяет только операции с почтовыми ящиками (`operations.ts`), не логин.
