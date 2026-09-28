# Сравнимость прогонов sanity

Область: [тесты](../testing.md)

Замеры от 2026-09-01, четыре прогона одного и того же набора тестов за полтора часа.

## Сравнивать можно только прогоны по свежей БД

| прогон | стенд | wall | work | findAll в БД |
|---|---|---|---|---|
| свежий | контейнеры пересозданы заранее | 324.4s | 1435s | - |
| свежий, старт через 71s после создания контейнеров | холодный Postgres | 440.6s | 1983s | 50493 ops, avg 22.78 ms, 1150s |
| второй прогон по той же БД | база после предыдущего прогона | 402.1s | 1887s | 48784 ops, avg 28.92 ms, 1411s |
| свежий | `prepare-pg.sh` перед стартом | 331.3s | 1551s | 49849 ops, avg 14.22 ms, 709s |

Число запросов во всех прогонах одинаковое, отличается только цена запроса - от 14 до 29 ms. Отсюда разброс wall в 324..440s без единой строчки изменений в коде.

Два независимых эффекта:
- холодный стенд - Postgres shared_buffers пустой, Elastic холодный, поды не прогреты. Между `docker compose up` и стартом тестов нужна пауза, иначе первый прогон завышен процентов на 30.
- грязная БД - второй прогон по той же базе видит все данные первого. Запросов становится меньше (часть тестов пропускает создание), а каждый дороже.

Обратный эффект - прогрев JIT: `ws-op/createWorkspace/update-model/create-upgrade/love` ускоряется 208 -> 149 ms на втором прогоне; маскирует деградацию БД.

Порядок для честного замера: `tests/prepare-pg.sh`, пауза, прогон.

## Тесты, которые правят общий space type, должны генерировать все имена

`tests/sanity/tests/settings.spec.ts` `customize-task-types` падал 3/3 на втором прогоне по той же БД. Имя task type было рандомным (`Bug-${generateId(4)}`), а имена статусов - захардкожены (`Needs Attention`, `Under Review`).

Статусы в tracker живут на space type, не на task type. Тест правит общий `Default`, поэтому статус `Needs Attention` от прошлого прогона остается в `Default` навсегда. Переименование `Todo` -> `Needs Attention` попадает в уже существующий статус и вместо переименования сливается с ним: на скриншоте падения у новой задачи статусы `Backlog, Todo, Under Review, Won, Lost` - второе переименование прошло, первое молча нет.

Падало при этом не на переименовании, а через 30 секунд в форме issue на `.menu-item:has-text("Needs Attention")`, где причина уже не видна. Тест теперь генерирует суффикс для всех имен сразу (`Needs Attention ${suffix}`, `Under Review ${suffix}`) плюс проверяет состояние сразу после каждого переименования.

## LiveKit для sanity-стенда - свой скрипт

`dev/run_livekit.sh` это dev-стенд: порт 7880, ключи `devkey`/`whkey` (`dev/livekit-dev-config.yaml`), redis `127.0.0.1:6379`. Sanity-стенд ходит совсем в другое место - фронт получает `LIVEKIT_WS=ws://localhost:7890` (`tests/docker-compose.yaml`), контейнер love настроен на `ws://host.docker.internal:7890` с ключами `testkey`/`whtestkey`.

Правильный скрипт - `tests/run_livekit_test.sh` (`tests/livekit-test-config.yaml`): порт 7890, RTC 7891/7892, redis `127.0.0.1:6390` - это `sanity-redis-test-1`, тот же, который egress видит внутри compose-сети как `redis`.

Симптом запуска не того инстанса: тесты, которые реально подключаются к митингу, падают на `waitConnected` (`expect(received).toBeGreaterThan(0)`, получено 0), а в логе LiveKit нет ни одной комнаты - браузер до него просто не доходит. Первые ~14 love-тестов при этом зеленые, потому что проверяют только этаж и панели.

Проверка перед прогоном: `nc -z localhost 7890`.

## Общие окна в love

`loveWindow(browser, 'first'|'second'|'third')` в `tests/sanity/tests/love/meeting-helpers.ts` держит по одному окну на пользователя на весь suite; `closeMeetingContexts` их не закрывает, а откатывает. Экономия - буст SPA, 129ms навигации плюс 845ms до `floorGrid`, 92 раза за прогон.

Грабли, найденные по дороге:
- нельзя удалять `openLove` в середине теста - часть вызовов не setup: после выхода из митинга приложение уходит на MeetingMinutes, и `openLove` возвращает на этаж. 13 таких мест в 9 файлах.
- порядок в reset: сначала выйти из митинга, потом серверный `waitForActiveMeetingsToFinish`, и только потом возвращать этаж. Наоборот - force-finish долетает до клиента после того, как reset закончился, и приложение уходит на MeetingMinutes посреди следующего теста.
- попапы перехватывают клик по leave - тест может закончиться с открытой модалкой; `Escape` нужен до выхода, а сам выход - через `toPass`, иначе ошибка клика глотается и окно остается в митинге.
- признак поздней навигации - серверный, а не UI: тест, вышедший через UI, все равно оставляет документ митинга, навигацию вызывает его дофиниширование. Сторожить надо все окна, когда cleanup что-то изменил.

На своих контекстах оставлены четыре файла (`meetings.network.tests.ts`, `meetings.devices.tests.ts`, `meetings.transactor-restart.tests.ts`, `meetings.refresh-reconnect.tests.ts`): `network` подменяет LIVEKIT_WS через `page.route` + CDP offline, `devices` кладет `addInitScript` поверх `enumerateDevices`, `transactor-restart` перезапускает транзактор, `refresh-reconnect` делает `page.reload` поверх sessionStorage-якоря - на общем окне ловилось `Target page, context or browser has been closed`.

Флаки и стоимость love-lane по этим же тестам - [sanity_love_wall_time.md](sanity_love_wall_time.md), [sanity-flaky-tests.md](sanity-flaky-tests.md).

## CI: wall зависит от модели CPU раннера (2026-09-28)

В `run.json` есть `fingerprint.cpuModel`. Один и тот же набор (`0e6f947a95`, 527 тестов, 2 воркера) идет 1840s на `AMD EPYC 9V45` и 2650s на `AMD EPYC 7763`. Сравнивать wall между прогонами можно только при одинаковом `cpuModel`, иначе смотреть счетчики (`stats: operations`, docker rx/tx).

Рост на 7763 с ~1800s до ~2650s (упор в `globalTimeout` 2700s в `tests/sanity/tests/playwright.config.ts`) сложился из двух шагов:
- #463 (`b0504a5188`, `DO_COMPRESS=false` для uitest-сборки): front отдает несжатые ассеты, `nginx` стенда жмет их на лету (`gzip on`, `gzip_comp_level 6`, `gzip_proxied any` в `tests/nginx.conf`). CPU `sanity-nginx-1` 33.6s -> 689s, docker rx/tx x3, work +20% при тех же операциях. На 4-ядерном раннере `nginx` отнимает CPU у браузеров и сервисов.
- #225 (`8ebfcffcc3`): +90 тестов в `chat/chat-notifications`, `chat/chat-unread`, `inbox/inbox-notifications`, это +886s work. Средний тест 8-13s, как у соседних chat-спеков; старые файлы не замедлились.

## Снапшот модели через storageState не ускоряет (2026-09-29)

Пробовали `storageState({ path, indexedDB: true })` в `tests/sanity/tests/auth/auth.setup.ts`, чтобы контексты стартовали с моделью из IndexedDB `model.db.persistence`. Снапшот вышел 17.8 MB на пользователя, work на тест вырос с 3.8s до 5.7s, а в восстановленных контекстах навигатор оставался без проектов ("YOUR PROJECTS" пустой), падали tracker/planning/recruiting/settings. Откатили.

HTTP-кэш бандлов между `newContext()` не переносится: каждый контекст - off-the-record профиль, `--disk-cache-dir` на него не действует. Общий кэш возможен только через `launchPersistentContext` с копией шаблонного профиля на тест.
