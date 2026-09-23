# ci_deploy.sh и стенды selfhost

## WEBHOOK ломал update

`ci_deploy.sh` ветки FUSIO-1151 (`156f84bdfb`) дописывал `WEBHOOK_ENABLED=true` в `config/platform.conf`
стенда. `update` конфиг не пересоздаёт, флаг переживал раскатку ветки без `services/webhook`:
`set-version.sh` под `set -e` падал на `pull` несуществующего `webhook:<version>` раньше `up.sh`.
`clean` работал только потому, что `cleanup.sh --configs` стирал флаг.

Теперь флаг выставляется в обоих режимах: явный `setup.env.WEBHOOK_ENABLED` стенда, иначе по наличию
`services/webhook` в деплоимом чекауте. При выключении контейнеры `webhook`/`webhook-mock` удаляются
руками - compose не трогает сервисы неактивного профиля, они остаются на старом образе.

Выключено = ПУСТАЯ строка. `compose.yml:273` selfhost проверяет `${WEBHOOK_ENABLED:+...}`, поэтому
`false` отдаёт фронту `WEBHOOK_SERVICE_URL`, хотя `up.sh` профиль не поднимает.

## QA tools (профиль `qa` в selfhost: Dozzle на `/_logs`, страница стенда на `/_stand/`)

`setup.env.QA_TOOLS_ENABLED: 'true'`, пользователь `qa`, пароль `<имя стенда>qa123` (dev2 -> `dev2qa123`),
если `QA_TOOLS_PASSWORD` не задан. Ключи `QA_TOOLS_*` пишутся в `platform.conf` и в update: остальной
`setup.env` доходит до стенда только через `setup.sh`, то есть в clean.

## Сидирование (`seed:` в конфиге стенда, только clean)

- Повторяет стенд `sanity` из `dev/test-base/src/stands.ts`: admin, user1, user2 + `tests/sanity-ws`.
- Дамп (960K) едет внутри `deploy.sh` как base64-heredoc: на стенде есть только чекаут selfhost.
- Админ - это `PLATFORM_ADMIN_EMAILS` сервиса account (`server/account/src/admin.ts` читает env один
  раз при старте), команды в tool для этого нет. `admin` домешивается к списку стенда.
- `create-workspace` не идемпотентен: на занятый url делает второй workspace со случайным суффиксом.
  Поэтому seed в обоих режимах сначала проверяет `login user1@user1` + `selectWorkspace sanity-ws` и
  пропускается, если стенд уже засеян. `PLATFORM_ADMIN_EMAILS` пишется в `platform.conf` и в update.
- tool глотает ошибки (`withAccountDatabase` ловит и печатает, exit 0), поэтому после сидирования
  идёт проверка через RPC account: `login` user1 + `selectWorkspace sanity-ws`.
- `deploy.sh` на стенде запускается из временного файла со stdin `/dev/null`, а не `bash -s`: при `bash -s`
  `up.sh` (docker compose) съедал кусок stdin, bash продолжал с середины base64 дампа sanity-ws
  (`bash: line 14: T+ZYMj0tQKY2: command not found`), seed и проверка готовности не выполнялись.

## Почта и OTP на стендах

Почта (account -> redpanda -> mail_server -> mailpit) работает, но nodemailer отбрасывает адрес без `@`
(`No recipients defined`): OTP для логинов `admin`/`user1` не доходил. Seed теперь создаёт
`admin@admin`, `user1@user1`, `user2@user2`. `isEmail` в account требует точку в домене, но он проверяет
только mailbox-операции, не логин.
