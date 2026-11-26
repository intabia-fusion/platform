# Kubernetes-стенды платформы

Два чарта платформы, отдельный чарт мониторинга и один набор команд из корня репозитория:

- `charts/platform` - сама платформа (Deployment/Service/IngressRoute сервисов,
  ConfigMap/Secret из values, Job `db-init`, `global.imageRegistry`,
  `global.imagePullPolicy`, `global.stand`, `global.tls.caSecretName`,
  `services.<svc>.extraEnv`, lookup-контракт ConfigMap/Secret `platform-base`).
- `charts/platform-base` - окружение под платформу: postgres (CloudNativePG), Kafka (Strimzi),
  S3 (pgsty/silo), elastic с плагинами, redis, mailpit, общий LiveKit с egress,
  TLSStore default и контракт `platform-base` (адреса и учётки окружения).
- `charts/monitoring` - отдельный от стенда стек наблюдаемости: ClickStack
  (ClickHouse + HyperDX + OpenTelemetry collector) и MongoDB для метаданных HyperDX.
  Сервисы шлют OTLP в `monitoring-otel-collector`, UI открывается port-forward'ом;
  наружу чарт пока не публикуется.

Команды (pnpm из корня репозитория):

| Команда | Что делает |
|---|---|
| `pnpm -w stand:configure [флаги]` | Интерактивно спрашивает, куда деплоить: локальный k3d, локальный kind или удалённый Kubernetes (kubeconfig/context/namespace), и сохраняет выбор в `deployment/kubernetes/.stand/config` (mode 600, gitignored) |
| `pnpm -w stand:base:up [k3d\|kind\|existing]` | Идемпотентно поднимает base: кластер (если его нет), registry, CoreDNS-rewrite `*.fusion.localhost`, TLS (mkcert), Strimzi и чарт `platform-base` |
| `pnpm -w stand:base:down [k3d\|kind\|existing] [--delete-data]` | Убирает только то, что создал base-up. `existing` без флага кластер не трогает |
| `pnpm -w stand:dev:up [runtime] [--no-push]` | Поднимает dev-стенд (`dev.fusion.localhost`), base проверяет, при необходимости сам пушит образы |
| `pnpm -w stand:dev:down [runtime] [--yes]` | Удаляет namespace `fusion-dev` и релиз. Base, registry и чужие стенды не трогает; данные БД/bucket в platform-base остаются |
| `pnpm -w stand:dev:pause [runtime]` | Гасит dev-стенд без удаления: все Deployments и StatefulSets в namespace dev в 0 реплик. Helm-релиз, Services, Ingress, PVC и platform-base не тронуты; данные сохраняются. Идемпотентен |
| `pnpm -w stand:dev:resume [runtime]` | Возобновляет после pause: `dev-up.sh --no-push` - helm upgrade теми же values, реплики восстанавливаются до заданных чартом (включая сервисы с 0 реплик, напр. distro/analytics). Без пересборки и push образов. `stand:dev:up` - тоже валидный resume |
| `pnpm -w stand:test:up [sanity\|ws\|api] [runtime] [--no-push]` | Поднимает тестовый стенд: `sanity.fusion.localhost` (default), `ws` (два региона: main на базе стенда `wstest`, europe на своей БД `wstesteurope`), `api` (аналогично, `api`/`apieurope`) |
| `pnpm -w stand:test:down [sanity\|ws\|api] [runtime] [--yes]` | Удаляет соответствующий namespace |
| `pnpm -w stand:push <stand> [runtime]` | Пушит образы стенда (`intabiafusion/*:global.version`) в registry кластера |
| `pnpm -w stand:deploy <stand> [runtime] [--dry-run]` | Дженерик-установка стенда; `--dry-run` рендерит манифесты без кластера |
| `pnpm -w stand:down <stand> [runtime] [--yes]` | Дженерик-удаление стенда |

Runtime - `k3d` (default), `kind` или `existing` (kubeconfig/context из
`stand:configure`, иначе текущий kubectl context).
Выбор: первый аргумент, env `STAND_RUNTIME` или сохранённый `stand:configure`
(явные env/CLI приоритетнее сохранённого).

Статус проверки (macOS, Docker VM 8 ГБ): k3d base + dev + sanity/ws/api
поднимались и удалялись живьём (HTTPS 200, login-RPC account отвечает);
kind - полный цикл base + dev-kind живьём. Дополнительно 2026-11-11:
ws - полный Playwright-сюит живьём; api - полный jest-сюит (27/29 suites,
335/337 tests) после чистого prepare; backup - 12/12 после правки `rootBucket`
в harness; coverage стенда собран и валиден (STAND 78.0%). 2026-11-11 также:
sanity - чистый prepare/seed (exit 0) и login smoke на новой сборке wiring
(`with-stand-env` + webpack :8081 + Playwright `--workers=1`): 7 passed
(3 auth setup + 4 login tests), 22.5s. Полный sanity-сюит после этой сборки
не прогонялся; GH/GitLab-пайплайны и remote Kubernetes не проверены.
См. "Ограничения" ниже.

## Быстрый старт (k3d, default)

```bash
pnpm -w stand:base:up          # кластер fusion + registry + TLS + platform-base
pnpm -w stand:dev:up           # dev-стенд; пушит образы из pnpm docker:build
# открыть https://dev.fusion.localhost ( Chromium резолвит *.localhost сам,
# curl/Node на macOS - нет: добавьте '127.0.0.1 dev.fusion.localhost' в /etc/hosts )
```

Обновление после правок кода:

```bash
pnpm docker:build && pnpm -w stand:dev:up   # повторный push + helm upgrade
# или быстрее, без reinstall чарта:
pnpm -w stand:push dev && kubectl --context k3d-fusion -n fusion-dev rollout restart deployment
```

## Пауза и resume dev-стенда

`stand:dev:pause` масштабирует в 0 все Deployments и StatefulSets namespace
dev-стенда: поды останавливаются, БД/bucket/топики в platform-base и PVC
остаются нетронутыми, релиз, Services и Ingress сохраняются. Ничего не
удаляется. Идемпотентен: повторный вызов на паузе - no-op. Resume:

```bash
pnpm -w stand:dev:pause    # остановить dev (данные сохраняются)
pnpm -w stand:dev:resume   # dev-up.sh --no-push: helm upgrade, реплики по values
pnpm -w stand:dev:up       # тоже валидный resume (с push образов при необходимости)
```

`resume` - это `helm upgrade` теми же values-файлами, поэтому реплики
восстанавливаются ровно до заданных чартом (включая намеренно выключенные
сервисы с 0 реплик, напр. distro/analytics/loveAgent в dev). Образы не
пересобираются и не пушатся - они уже в registry кластера. Ограничение:
pause не трогает контейнер webpack dev-front (`fusion-dev-front`,
`stand:dev:front`) - это Docker-контейнер вне namespace стенда; гасите его
отдельно через `stand:dev:front:down`, если он не нужен на паузе.

## Изоляция и данные

- Стенд = namespace `fusion-<stand>` + релиз `fusion-<stand>` + хост
  `<stand>.fusion.localhost`. Имя данных стенда (`global.stand`) - префикс базы,
  bucket, топиков Kafka и индекса elastic: стенды на одном base не видят данные
  друг друга. `global.stand` должен быть ≥3 символов (правило имен S3 bucket:
  `ws` нельзя, поэтому у ws-стенда данные `wstest`).
- `down` удаляет только namespace стенда. База, bucket и топики стенда остаются
  в PVC `platform-base` (аналог compose down без `-v`). Полная очистка данных
  стенда - отдельная ручная операция, см. troubleshooting.
- `stand:base:down k3d` удаляет кластер целиком со всеми данными. Чужие
  кластеры и текущий контекст `existing` скрипты не удаляют.

## Что ставит base (platform-base)

| Компонент | Режим по умолчанию | Примечание |
|---|---|---|
| postgres 18.0 | `internal` CloudNativePG Cluster (primary + реплика) | оператор ставится base-up (pinned `CLOUDNATIVE_PG_VERSION`), бэкапы в silo; `external` - managed строка подключения |
| Kafka 4.2.2 | `strimzi`, один combined controller+broker узел, PVC | оператор ставится base-up (pinned `STRIMZI_VERSION`), не зависимостью чарта; `external` - bootstrap-адрес. 4.2.2 - максимум, который поддерживает Strimzi 1.3.0 (prod 4.1.1 ждёт downgrade оператора или prod-override) |
| S3 (pgsty/silo) | `silo` StatefulSet + PVC | `external` - endpoint и ключи |
| elastic 8.19.1 | `internal` StatefulSet + PVC, плагины из `intabiafusion/elastic-plugins` init-контейнером | `external` - URL |
| redis 8.0.2 | `internal` Deployment | `external`/`disabled` |
| otel-collector + Prometheus | enabled, общие на все стенды | OTLP :4318 -> `otel-collector:8889` -> Prometheus; UI `https://prometheus.fusion.localhost:<https-порт>`; ручной runbook: [docs/observability.md](docs/observability.md) |
| sealed-secrets | только non-k3d или `SEALED_SECRETS=1` | контроллер для запечатанных секретов; локально секреты plain, см. [docs/sealed-secrets.md](docs/sealed-secrets.md) |
| mailpit | enabled | SMTP стендов: `mailpit.platform-base.svc.cluster.local:1025`; UI через Traefik: `https://mailpit.fusion.localhost:<https-порт>` (`stands/base/values.yaml` -> `mailpit.host`, пусто = не публиковать). Второй способ - под путём самого стенда: `mailpit.path: /_mailpit` в чарте платформы плюс `mailpit.webroot: /_mailpit` в базе |

Режимы `external` для postgres/s3/elastic/redis/kafka реализованы: чарт
публикует внешние адреса в контракт вместо своих. Проверены рендером
(`helm template` с external-значениями); живой прогон external-режимов не
делался - local base использует дефолты. Версии пины в `cluster/versions.env`;
размеры local-base - в `stands/base/values.yaml`.

Контракт: ConfigMap/Secret `platform-base` в namespace `platform-base` (адреса
postgres/Kafka/S3/elastic/redis/SMTP). Чарт `platform` читает их lookup-ом при
`helm upgrade --install`; при `helm template` lookup пуст, поэтому для офлайн-
проверки рендера есть `stands/ci/render-check.yaml` с фиктивными адресами.

### Postgres: CloudNativePG

Оператор ставит `base-up.sh` (pinned `CLOUDNATIVE_PG_VERSION`, namespace `cnpg-system`),
рабочая нагрузка - `Cluster/postgres`: primary + одна streaming-реплика
(`postgres.instances`). Сервис `postgres` - алиас только на primary
(`cnpg.io/instanceRole=primary`), его и используют pgbouncer и контракт, поэтому DSN
стендов не меняется. Чтение с реплики - `postgres-ro.<ns>.svc.cluster.local` (CNPG
создаёт сервис сам, он указывает только на реплики); запись туда отклоняется
(`cannot execute ... in a read-only transaction`). Обновление образа и параметров идёт
само: `primaryUpdateStrategy: unsupervised`.

Полный ручной runbook (установка, реплика, restore, диагностика): [docs/postgres.md](docs/postgres.md).

Бэкапы: WAL и base backup в `s3://postgres-backups/` (silo), хранение 7 дней
(`postgres.backup` в values). `ScheduledBackup/postgres-daily` снимает базу каждую ночь в
03:00 - cron в CNPG с полем секунд (`0 0 3 * * *`), пятипольный вариант оператор
принимает с предупреждением. Ручной бэкап и проверка:

```bash
kubectl --context k3d-fusion -n platform-base apply -f - <<'EOF'
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: postgres-manual
spec:
  cluster: {name: postgres}
  method: barmanObjectStore
EOF
kubectl --context k3d-fusion -n platform-base get backup postgres-manual   # PHASE=completed

# содержимое бакета: alias `local` внутри silo без ключей, задаём одноразовый
kubectl --context k3d-fusion -n platform-base exec statefulset/s3 -- sh -c \
  'mc alias set b http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ls -r b/postgres-backups'
```

In-tree `barmanObjectStore` в CNPG 1.30 помечен deprecated и удаляется в 1.32: при подъёме
оператора до 1.32 бэкапы надо переводить на Barman Cloud Plugin. Образ operand-а (~250 МБ)
тянется с GHCR; если он зеркалирован в локальный registry
(`docker tag ghcr.io/cloudnative-pg/postgresql:<tag> localhost:5111/cnpg/postgresql:<tag>` и
`docker push`), `base-up` сам подставит `postgres.image` из registry и pull не зависит от
GitHub.

## Память и режимы стендов

На Docker VM 12 GB sanity и dev живут одновременно. Фактическое потребление и
requests/limits по namespace'ам:

```bash
pnpm -w stand:budget            # STAND_MEMORY_BUDGET=12Gi по умолчанию
```

Скрипт читает cadvisor через kubelet proxy (metrics-server не нужен) и печатает таблицу
namespace'ов, топ подов по working set и по requests, плюс вердикт «влезаем/не влезаем» и
минимальный объём. Ориентир на текущем составе: ~7.9 GiB фактически, ~10.3 GiB requests при
allocatable 11.6 GiB.

Режимы (файл `deployment/kubernetes/.env`, шаблон — `.env.example`):

| `STAND_MODE` | Поведение |
| --- | --- |
| `dual` (default) | sanity и dev могут работать вместе (12 GB VM) |
| `single` | один стенд на VM: `deploy.sh` берёт запись в `${XDG_CACHE_HOME:-$HOME/.cache}/fusion-stand` и проверяет namespace соседних стендов; второй стенд не поднимется, пока первый не остановлен (`stand:test:down`/`stand:dev:down`) |

`stand:budget` и `stand:seal` — те же переменные окружения; явный env всегда перекрывает
`.env`.

## Бакеты S3

Каждый тип данных живёт в своём бакете, чтобы retention и права не пересекались:

| Бакет | Что внутри | Кто пишет |
| --- | --- | --- |
| `<stand>` | datalake: файлы, аватарки, вложения | datalake |
| `<stand>-chunks` | чанки загрузок datalake | datalake |
| `<stand>-backups` | инкрементальные бэкапы пространств | backup, workspace-service (`BACKUP_BUCKET`) |
| `postgres-backups` | WAL + base backup CNPG | оператор CNPG |
| `<stand>-love-recordings` | записи встреч (если включён love) | love/egress |

`<stand>` — `global.stand` (по умолчанию имя релиза). Имя бакета инкрементальных бэкапов можно
переопределить: `config.backupBucket` в values чарта `platform` (по умолчанию `<stand>-backups`).
Бакет Postgres задаётся отдельно: `postgres.backup.bucket` в `platform-base` (по умолчанию
`postgres-backups`).

**Bundled silo** создаёт бакеты при первой записи. Для **внешнего S3** создайте их заранее (или
разрешите `s3:CreateBucket`), а ключам выдайте `GetObject/PutObject/DeleteObject/ListBucket` на
все пять. `postgres-backups` нужен только если `postgres.mode=internal` с включёнными бэкапами.

## Kind

```bash
STAND_RUNTIME=kind pnpm -w stand:base:up
STAND_RUNTIME=kind pnpm -w stand:dev:up
# стенд: https://dev-kind.fusion.localhost
```

Kind не содержит ingress: base-up ставит traefik (pinned chart) с NodePort
30443, `kind.yaml` пробрасывает его на 443 хоста (HTTPS only, как на проде),
registry - контейнер `kind-registry` по схеме из документации kind. Не
запускайте k3d и kind одновременно на одном порту 443. Альтернативный порт
(если 443 занят): `STAND_HTTPS_PORT=8443`.

## Kind на Podman (experimental)

На macOS Podman позволяет пробрасывать UDP и небольшие диапазоны UDP-портов.
Проверено: kind, platform-base и dev открываются в браузере. Для kind/Podman
LiveKit запускается нативно на хосте: kind не умеет добавлять RTC-порты после
создания кластера.

```bash
brew install podman
podman machine init --cpus 4 --memory 8192 --disk-size 50 fusion-test
podman machine start fusion-test

export CONTAINER_HOST="unix://$(podman machine inspect fusion-test \
  --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
export DOCKER_HOST="$CONTAINER_HOST"
export KIND_EXPERIMENTAL_PROVIDER=podman

STAND_RUNTIME=kind STAND_HTTPS_PORT=9443 \
  pnpm -w stand:base:up kind
STAND_RUNTIME=kind pnpm -w stand:dev:up kind
# https://dev-kind.fusion.localhost:9443
```

Перед `stand:dev:up` образы `intabiafusion/*:latest` должны быть доступны в
Podman. Сборка через `pnpm docker:build` на Podman пока не проверена; в живом
эксперименте образы были скопированы из локального Docker registry. Для push в
kind registry скрипт использует `podman push --tls-verify=false`.

### LiveKit: общий сервер для всех k3d-стендов

На k3d один LiveKit, один egress и общий redis живут в `platform-base` (`livekit.*` в
`stands/base/values.yaml`); стенды ходят в него по контракту `ConfigMap/platform-base`:

- браузер - `wss://livekit.fusion.localhost:<https-порт>` через Traefik (`websecure`,
  wildcard-сертификат `*.fusion.localhost`);
- love и agents - `ws://livekit-api.platform-base.svc.cluster.local:7880`
  (`LIVEKIT_HOST` контракта; SDK сам переводит `ws://` в `http://`);
- `config.livekitWs/livekitHost` в `stands/*/values.yaml` пустые: chart подставляет
  адреса из контракта. Override нужен только для стенда без platform-base.

Комнаты разных стендов разделяет `config.livekitProject`
(`transcription-fusion-<namespace>`): love пишет его в metadata комнаты и отбрасывает
чужие вебхуки (`Ignoring event from different project` в логе).

`stands/base/values.yaml` держит два ручных списка:

```yaml
livekit:
  keys:                                 # по паре на стенд + webhook-ключ
    testkey: testsecret_for_sanity_tests_min32chars
    dev-love-api-key: dev-love-api-secret-0123456789abcdef
    qms-testkey: testsecret_for_qms_tests_min32chars
    whtestkey: whtestsecret_for_sanity_tests_min32chars
  webhookApiKey: whtestkey              # им LiveKit подписывает вебхуки
  webhookUrls:
  - http://love-service.fusion-sanity.svc.cluster.local/webhook
  - http://love-service.fusion-dev.svc.cluster.local/webhook
  - http://love-service.fusion-qms.svc.cluster.local/webhook
```

Подпись вебхука одно-ключевая, поэтому `secrets.loveSecret.webhookApiKey/Secret` у всех
стендов - одна и та же пара `whtestkey`; `apiKey/apiSecret` стенд может держать свои
(они должны быть в `keys`). При добавлении стенда дополните `keys` и `webhookUrls`.

`k3d` публикует 7880/TCP (signalling), 7881/TCP и 7882/UDP (media) с хоста на ноду
(`cluster/k3d.yaml`). Кластер, созданный до этого, получает маппинги при `stand:base:up`
(`k3d cluster edit --port-add`). Один экземпляр - один набор портов: dev больше не
занимает 7890-7892.

Два медиа-адреса - не украшение: браузер на macOS достаёт сервер только по
`127.0.0.1` (опубликованный порт), а egress и его страница записи - по IP ноды,
который на хосте недоступен. Поэтому сервер объявляет оба (`advertiseAddress: ""` +
`loopbackCandidate: true`); один `advertiseAddress: 127.0.0.1` оставляет egress без
медиа, и запись уходит в `Recording template fallback` / `Start signal not received`.

Egress один на все стенды. S3-параметры love передаёт в каждом запросе, поэтому записи
расходятся по бакетам стендов; `livekit.egress.s3Bucket` - только fallback.
`RECORDING_TEMPLATE_URL` love берёт in-cluster
(`http://love-service.<ns>.svc.cluster.local/egress-template/`), вебхук LiveKit идёт на
`http://love-service.<ns>.svc.cluster.local/webhook`: Chrome внутри пода не доверяет
mkcert CA, а Service доступен без TLS и без префикса `/_love` (его срезает Traefik).

`tests/prepare-pg.sh` и `scripts/with-stand-env.sh` смотрят на Deployment `livekit` в
`platform-base`; на хосте ничего не поднимают. `LIVEKIT_MODE=cluster|docker|local`
по-прежнему принудительно выбирает режим, проверка живости - `http://127.0.0.1:7880/`
и `rollout status` для egress; на host-пути остаётся `:7890`.

Почему не иначе:

| Вариант | Браузер (macOS/k3d) | Egress -> S3/LiveKit | Linux CI | Запуск |
| --- | --- | --- | --- | --- |
| server+egress в platform-base (этот) | media через опубликованные RTC-порты, signalling через Traefik | всё in-cluster | то же, порты публикует hostNetwork | `stand:base:up` |
| отдельный LiveKit на каждый стенд | свои порты на каждый стенд (dev - 7890-7892) | in-cluster | да, но копия сервера и egress на стенд | helm upgrade стенда |
| отдельный релиз livekit helm | ещё один релиз + свои redis/TURN/LB | in-cluster | да | helm upgrade |
| egress в кластере, server на хосте | как сегодня (LAN IP хоста) | ws -> `host.docker.internal`, redis тоже нужен снаружи | `host.docker.internal` на Linux не резолвится | livekit-server + redis |

### LiveKit: host-сервер (kind/existing)

Только для кластеров, где RTC-порты нельзя опубликовать: `stand:base:up` в этом режиме
ставит platform-base с `livekit.enabled=false`, а `stands/dev/values.local-livekit.yaml`
направляет стенд на процесс хоста.

```bash
STAND_RUNTIME=kind pnpm -w stand:dev:up

LIVEKIT_REDIS_ADDRESS= \
LIVEKIT_WEBHOOK_URL=https://dev-kind.fusion.localhost:9443/_love/webhook \
LIVEKIT_API_KEY=dev-love-api-key \
LIVEKIT_API_SECRET=dev-love-api-secret-0123456789abcdef \
LIVEKIT_WEBHOOK_API_KEY=whtestkey \
LIVEKIT_WEBHOOK_API_SECRET=whtestsecret_for_sanity_tests_min32chars \
  ./dev/run_livekit.sh
```

`LIVEKIT_REDIS_ADDRESS=` отключает Redis для одиночного локального митинга;
для egress задайте общий Redis вместо пустого значения. Front использует
`ws://127.0.0.1:7880`, love в kind/Podman - `ws://host.containers.internal:7880`
(в kind/Docker - `host.docker.internal`). Для браузера используйте webpack на
HTTP `localhost:8080`: при прямом HTTPS-стенде небезопасный `ws://` блокируется
как mixed content. Без env-overrides `dev/run_livekit.sh` сохраняет compose-
поведение.

## Webpack dev-server против K8s

После `stand:dev:up` запустите в отдельном терминале:

```bash
STAND_NAMESPACE=fusion-dev pnpm -w stand:dev:front
# http://localhost:8080
```

По умолчанию dev-server (`dev/prod` `pnpm dev-server`) работает в Docker-контейнере
`fusion-dev-front`: репозиторий bind-mount-ится в контейнер (правки исходников и
HMR остаются на macOS, webpack watch уже настроен на `poll: 250`), а Linux
`node_modules` и pnpm-store лежат в named volume `fusion-dev-front-node_modules`
(один volume: install, store и маркер хэша локфайла), посеянном образом `fusion-dev-front:dev`
(`deployment/kubernetes/docker/dev-front.Dockerfile`, контекст - корень репозитория
с корневым `.dockerignore`). Linux-сборки нативных модулей и файлы от root в хостовый
checkout не попадают; хостовый `node_modules` не трогается. При изменении
`pnpm-lock.yaml` контейнер сам делает `pnpm install --frozen-lockfile` (маркер
хэша локфайла в volume). Сборка образа - только когда образа нет локально; после
правки Dockerfile пересоберите явно:
`docker build -f deployment/kubernetes/docker/dev-front.Dockerfile -t fusion-dev-front:dev .`.
При занятом порту или запущенном контейнере команда падает с подсказкой.

Остановка/перезапуск: Ctrl+C в терминале (контейнер `--rm`, удаляется сам) или
`pnpm -w stand:dev:front:down` (останавливает и удаляет контейнер, volumes не трогает;
полный сброс - `docker volume rm fusion-dev-front-node_modules`).

Хост-порт: `PORT` (default 8080) публикуется как `127.0.0.1:<PORT> -> :8080`.
Proxy, TLS и branding внутри контейнера: config/branding K8s-стенда читаются на хосте
скриптом и подаются ro-mount-ами, mkcert CA - через `NODE_EXTRA_CA_CERTS`, хост стенда
добавляется в `/etc/hosts` контейнера как `host-gateway` (на macOS Docker Desktop
`*.fusion.localhost` резолвится через CoreDNS-rewrite только внутри кластера, поэтому
контейнер ходит на хост, где слушает k3d/kind LB). Внутри контейнера webpack слушает
всегда :8080.

Fallback без Docker (удалённый existing-кластер, отладка):
`pnpm -w stand:dev:front:host` (или `DEV_FRONT_MODE=host`) - прежний хостовой
запуск webpack напрямую на macOS; нужны node 24 и `pnpm install` на хосте.

Память: webpack в контейнере берёт ~3-4 ГБ RAM; если Docker VM (8 ГБ default)
перегружена работающим стендом и контейнер умирает с exit 137 (OOM), ограничьте
heap: `NODE_OPTIONS=--max-old-space-size=2048 pnpm -w stand:dev:front` (env
пробрасывается в контейнер).

Команда читает `/config.json` из K8s-стенда, заменяет его публичный URL на
same-origin пути и запускает webpack с HMR. API и WebSocket `/account`, `/tr`,
`/cl` и остальные проксируются на фактический `https://<stand-host>:<port>`.
Node получает mkcert CA через `NODE_EXTRA_CA_CERTS`. K8s config и
`platform-branding.json` подаются из временных файлов; для branding записи хоста
стенда добавляется alias `localhost:<PORT>`, поэтому webpack сохраняет язык и порядок
имён из values стенда. `dev/prod/public/config.json`, `dev/prod/public/branding.json`
и compose `dev-server` не меняются и в этом режиме не используются.
LiveKit на k3d общий в platform-base: браузер подключается по WSS через Traefik; для
kind/existing host-сервер - по `ws://127.0.0.1:7880`, что допустимо на HTTP dev-server.

## Чистый sanity/ws/api: prepare + seed

```bash
cd tests
./prepare-pg.sh           # Kubernetes-стенд sanity (куда - из stand:configure)
pnpm -w stand:test:front  # HTTP UI на :8081
# В другом терминале: cd tests/sanity && pnpm run uitest:k8s
```

Все четыре тестовых стенда (sanity/ws/api/qms) готовятся одним сценарием,
`deployment/kubernetes/scripts/prepare-test-stand.sh` (обёртки: `tests/prepare-pg.sh`
для sanity, `ws-tests/prepare.sh` для ws, `qms-tests/prepare-qms.sh` для qms - runtime-копия
сценария, т.к. whitelist общего скрипта ещё sanity|ws|api; api-стенд готовит сам jest-прогон через
`api-tests/api/src/stand.ts`). По умолчанию prepare поднимает стенд в Kubernetes,
настроенном через `pnpm -w stand:configure` (kubeconfig/context/namespace, runtime
k3d/kind/existing); compose-сценария нет.

Namespace тестового стенда всегда резолвится из values чарта (`fusion-sanity`/`fusion-ws`/
`fusion-api`/`fusion-qms`): сохранённый в `.stand/config` `STAND_NAMESPACE` - это namespace
dev-стенда, на тестовые стенда он не действует и не может перенаправить prepare на удаление
или установку в `fusion-dev`. Переопределить namespace тестового стенда можно только явным
`STAND_NAMESPACE=...` в env - тогда скрипт предупредит и поставит стенд в этот namespace.
Dev-стенд (`stand:dev:up/down`) по-прежнему использует namespace из configure.

Скрипт удаляет namespace стенда и чистит
только его данные: базу стенда, per-region базы (`config.regions[].db`), buckets, индексы
elastic (стенда и каждого региона) и Kafka-топики, затем поднимает чистый стенд и запускает
обычный `dev/test-base` seed внутри pod `stand-tool` (bundle и дампы копируются через
`kubectl cp`; pod живёт до конца prepare и удаляется по выходу). LiveKit и egress - общие
в platform-base, prepare их не трогает. На Docker VM 8 ГБ перед prepare
остановите dev: `pnpm -w stand:dev:down --yes` - два полных стенда одновременно не
помещаются.

Для `STAND_RUNTIME=existing` без push (`STAND_PUSH_IMAGES=0`, дефолт remote) Docker не нужен
вовсе: stand-tool запускается pullable-образом (`STAND_IMAGE_REGISTRY`/values
`global.version`, override - `STAND_TOOL_IMAGE`). Медиа-фикстуры sanity (`fake-video.mp4`,
`fake-doc.docx`) должны уже лежать в `tests/sanity/tests/files` (один раз сгенерированы на
хосте с Docker), иначе make-media-fixtures пропустит их с предупреждением.

## Запуск тестов против стендов

- Playwright (sanity/ws/qms): `pnpm -w stand:test:front <stand>` (webpack на :8081) →
  `pnpm run uitest:k8s` в `<testdir>/sanity`. ws/qms-скрипты `uitest:k8s` идут через
  `scripts/with-stand-env.sh <stand>` (для qms - обёртка `qms-tests/with-stand-env.sh`,
  front-proxy - `qms-tests/stand-front.sh`): резолвит HTTPS-адрес стенда по конфигурации, ставит
  `NODE_EXTRA_CA_CERTS` (mkcert CA) и поднимает port-forward postgres для чтения OTP-кодов
  из account_db.
- api-tests/backup-tests: `cd api-tests/api && pnpm run api-test` (jest сам готовит и убирает
  api-стенд; lifecycle - `API_STAND=keep|stop|external`). На время прогона БД/bucket/mailpit
  platform-base публикуются на localhost через `kubectl port-forward`
  (postgres 5533, s3 9102, mailpit 8126 - дефолты harness'ов backup-тестов).

## CI-контракт: версии, registry и coverage

Для сборок, где образы строятся в отдельной job (GitLab `docker-build`), deploy-скрипты
принимают:

- `STAND_VERSION` - перекрывает `global.version` (образы `<namespace>/*:<version>`);
  tool-под в prepare берёт тот же тег (`<registry>/<namespace>/tool:<version>`).
- `STAND_IMAGE_REGISTRY` - pull-registry стенда (`global.imageRegistry`), по умолчанию
  registry рантайма (k3d-registry/kind-registry). Кластер должен уметь тянуть из неё.
- `STAND_IMAGE_NAMESPACE` - namespace образов внутри registry (`global.imageNamespace`,
  дефолт `intabiafusion`; CI выставляет из `DOCKER_NAMESPACE`). Итоговое имя образа:
  `<registry>/<imageNamespace>/<svc>:<version>`.
- `STAND_PUSH_IMAGES=0` - никакого push с хоста (на k3d тоже): кластер тянет опубликованные
  образы. Локальный дефолт без изменений - push свежесобранных `latest`.
- `STAND_REGISTRY_USERNAME` / `STAND_REGISTRY_PASSWORD` - приватный pull-registry, к которому
  ноды кластера должны авторизоваться (host `docker login` на это не влияет - k3d не наследует
  его). Заданы оба - deploy.sh создаёт namespace, docker-registry Secret `stand-registry`
  (идемпотентно, `create --dry-run -o yaml | apply`) и вешает его на default ServiceAccount
  namespace'а (`imagePullSecrets`). Задан только один - ошибка; не заданы - ничего не меняется.
  Креды в логи и dry-run не попадают. `STAND_REGISTRY_SERVER` опционален: по умолчанию -
  хост из `STAND_IMAGE_REGISTRY` (без пути); для docker-build pipeline его отдельно
  пробрасывают из `CICD_DOCKER_REGISTRY_URL`.
- `STAND_COVERAGE=true` - включает `global.coverage`: поды пишут V8-профили в общий PVC
  `stand-coverage` (`/coverage/<service>`). Сбор - `scripts/coverage-collect.sh <stand>
  <dest>`: скрипт гасит deployments (SIGTERM → профили на диск), ждёт подов и копирует
  дерево через kubectl; `api-tests/api/src/stand.ts` зовёт его на teardown, дальше
  `pnpm coverage:stand` работает как раньше (профили в `api-tests/coverage/<image>`).

## Релиз Helm-чартов: platform-charts

Чарты `platform` и `platform-base` публикуются в отдельный репозиторий
[intabia-fusion/platform-charts](https://github.com/intabia-fusion/platform-charts) на тег
релиза. Там же лежат values-профили и скрипты установки для заказчика.

```bash
pnpm -w package:charts v0.8.37 /tmp/charts   # только собрать (helm package)
pnpm -w release:charts v0.8.37               # собрать и запушить в platform-charts
pnpm -w release:charts v0.8.37 --init        # + разложить values/scripts/README в пустом репо
pnpm -w release:charts v0.8.37 --no-push     # локальная проверка
```

- Версия чарта = тег без `v`; образы берут `global.version` = тег с `v`.
- Старые версии в `docs/` не удаляются: они нужны для `helm install --version` и отката.
  Чистка опциональна: `pnpm -w release:charts vX.Y.Z --prune --keep N` оставляет N последних
  версий на чарт (rc сортируется раньше GA, поэтому после релиза обычно уходит первым).
- Пока чарты отлаживаются, публикация **только вручную** (`pnpm -w release:charts`).
  CI-job `charts-publish` (теги `v*`; staging `s*` чарты не публикует) выключен и включается
  переменной репозитория `PUBLISH_CHARTS=true`; тогда же нужен секрет `CHARTS_TOKEN` (PAT с
  правом записи в platform-charts), а чарты дополнительно прикладываются к GitHub Release.
- В platform-charts: `docs/` — Helm-репозиторий (Pages), `values/` — профили `bundled` и
  `external`, `scripts/install.sh` — установка/апгрейд:
  ```bash
  PROFILE=bundled PLATFORM_VERSION=v0.8.37 ./scripts/install.sh
  ```
- Профиль `external`: у `platform-base` каждый компонент `enabled: false` + `mode: external`;
  чарт не поднимает stateful-поды, а только публикует контракт с адресами. `enabled: false` без
  `mode: external` — ошибка рендера (защита от «выключил и забыл»).

## Куда деплоить: stand:configure

`pnpm -w stand:configure` спрашивает, куда ставить стенды, и запоминает ответ в
`deployment/kubernetes/.stand/config` (shell-sourceable, mode 600, gitignored):

- локальный k3d (default) - кластер `fusion`, который поднимает `stand:base:up`;
- локальный kind - кластер `fusion-kind`, который поднимает `stand:base:up`;
  kubeconfig не спрашивается и не сохраняется, скрипты берут контекст `kind-fusion-kind`;
- удалённый Kubernetes - kubeconfig (локальный путь или https-ссылка; http не
  принимается), context и namespace для следующего deploy. kubeconfig из URL
  скачивается curl-ом в `.stand/kubeconfig` (mode 600), локальный путь
  используется как есть. Содержимое kubeconfig и токены никуда не печатаются;
  перед сохранением проверяются валидность файла, наличие context и связность
  кластера (`kubectl get --raw=/version`, 10s timeout).

Повторный configure перезаписывает настройки (в т.ч. один активный namespace
для следующего deploy). Без TTY или с `--yes` ничего не спрашивается - для CI
и тестов все значения задаются флагами/env:

```bash
pnpm -w stand:configure --runtime existing \
  --kubeconfig https://example.com/kubeconfig.yaml \
  --context my-context --namespace fusion-dev [--yes] [--skip-connectivity]
# env-вариант: STAND_RUNTIME/STAND_KUBECONFIG/KUBE_CONTEXT/STAND_NAMESPACE/
# STAND_PUSH_IMAGES, путь к каталогу настройки - STAND_CONFIG_DIR (для тестов).
```

Дальнейшие `stand:*` команды используют сохранённую конфигурацию ничего не
спрашивая; явные env/CLI имеют приоритет над сохранённым.

## Existing Kubernetes

```bash
pnpm -w stand:configure   # remote: kubeconfig + context + namespace
STAND_RUNTIME=existing pnpm -w stand:base:up     # platform-base в сохранённый контекст
pnpm -w stand:deploy dev --dry-run               # проверка values
STAND_RUNTIME=existing pnpm -w stand:deploy dev  # установка
```

Deploy на remote зависит только от kubeconfig/context/namespace и kubectl+helm
- Docker не нужен (образы уже в registry кластера, push выключен; `STAND_PUSH_IMAGES=1`
или `--push` включает `stand:push` вручную). Требования к самому кластеру
задаются values стенда: DNS-имя `global.hostUrl` должно резолвиться в ingress
кластера, TLS-материал для него (для `*.fusion.localhost` секреты ставит
`certs/gen.sh` с локальным mkcert CA; для своих доменов - свой TLS через
values), образы `intabiafusion/*` должны быть pullable из кластера
(`STAND_REGISTRY=registry.example.com/team` + push). Namespace dev-стенда -
`STAND_NAMESPACE` из configure, он передаётся в чарт через `global.namespace`,
значение из values перекрывается; тестовые стенды (sanity/ws/api/qms) игнорируют
сохранённое значение и ставятся в свой namespace из values, если только `STAND_NAMESPACE`
не задан явно в env. `platform-base` при этом остаётся в своём
namespace.

Данные кластера не созданные скриптами не удаляются никогда;
`stand:base:down existing` без `--delete-data` ничего не удаляет.

`tests/prepare-pg.sh` (sanity prepare/seed) и `ws-tests/prepare.sh` (ws) работают на
existing без Docker: stand-tool запускается pullable-образом (`STAND_IMAGE_REGISTRY` +
values `global.version`, override `STAND_TOOL_IMAGE`), медиа-фикстуры sanity должны быть
заранее сгенерированы. `tests/tool-pg.sh` ходит в тот же namespace/context
через сохранённый configure.

## Структура

```
deployment/kubernetes/
  charts/platform/           платформа
  charts/platform-base/      окружение + контракт + TLSStore
  cluster/                   k3d.yaml, kind.yaml, versions.env, coredns-rewrite.txt
  certs/                     gen.sh (mkcert -> secrets) + out/ (gitignored)
  stands/
    base/values.yaml         размеры local platform-base
    dev/values.yaml          dev-стенд (k3d)
    dev/values.kind.yaml     overlay kind (registry, имена)
    sanity/ ws/ api/ qms/     тестовые стенды
    ci/render-check.yaml     фиктивные адреса для helm template
    kind/traefik.values.yaml traefik для kind
  scripts/                   base-up/down, configure, deploy, down, push-images, prepare-test-stand (sanity/ws/api reset+seed),
                             prepare-sanity-k3s (обёртка sanity), with-stand-env, coverage-collect, dev/test-обёртки
  .stand/                    конфигурация stand:configure (config + kubeconfig, gitignored)
```

### Где менять сервис в чарте

Раскладка как в прод-чарте (`../deployment/charts/fusion`): один сервис — один файл `templates/<svc>/<svc>.yml`, env и структура пода лежат в нём же.
- `charts/platform/values.yaml` → `services.<key>`: только параметры — включён/выключен, реплики, память, `count`, размеры. Env там не держим.
- Стенд может добавить или переопределить переменные через `services.<key>.extraEnv`.
- Правка проверяется рендером: `helm template fusion-sanity charts/platform -f stands/sanity/values.yaml -f stands/ci/render-check.yaml` — данные манифестов не должны меняться.

### Пулы нод (nodeSelector)

`global.nodeSelector` задаёт размещение всех подов, `global.nodePools` - именованные
наборы для классов нод. Сервис выбирает пул через `services.<name>.pool`:

```yaml
global:
  nodePools:
    cpu: {intabia.io/pool: cpu}
    memory: {intabia.io/pool: memory}
    gpu: {intabia.io/pool: gpu}
services:
  transactor: {pool: memory}
  stream: {pool: cpu}
  aibot: {pools: {llm-router: gpu}}
```

Порядок: `nodeSelector` сервиса, затем его `pool`, затем `global.nodeSelector`;
если пусто везде, `nodeSelector` не рендерится. В platform-base то же для postgres,
kafka, s3, elastic, redis, mailpit, pgbouncer, metrics и livekit (`<component>.pool`);
у aibot `pools.<mode>` перекрывает `services.aibot.pool`. Неизвестное имя пула -
ошибка рендера.

## Troubleshooting

Ручные команды ниже - для случаев, когда обёртки недостаточны. Везде
`kubectl --context k3d-fusion` (или `kind-fusion`).

**Статус base:**

```bash
kubectl --context k3d-fusion -n platform-base get pods
kubectl --context k3d-fusion -n platform-base get kafka my-cluster
kubectl --context k3d-fusion get configmap platform-base -n platform-base -o yaml
```

**Пересоздать base без потери кластера:**

```bash
pnpm -w stand:base:up        # helm upgrade --install, idempotent
```

**Кластер без base-up (ручной k3d):**

```bash
k3d cluster create fusion --api-port 6443 \
  -p "443:443@loadbalancer" \
  --registry-create k3d-fusion-registry:5000@localhost:5111
```

**Порт 443 занят.** Скрипт остановится с диагностикой и не тронет чужой
процесс. Варианты: освободить порт или поднять кластер на альтернативном
(`STAND_HTTPS_PORT=8443`), тогда и curl должен идти на
`https://<host>:8443`, а hosts-запись не нужна, если резолвите вручную.
При следующих `stand:*:up` порт определяется автоматически и попадает в
`global.publicPort` и все публичные URL. Тот же порт добавляется в Service
Traefik, поэтому URL работает и из браузера, и из подов. `global.hostUrl`
остаётся hostname без порта для Ingress `Host()`.

**Резолв `*.fusion.localhost`:**

- внутри подов: CoreDNS rewrite (ставит base-up), проверка:
  `kubectl --context k3d-fusion -n fusion-dev run -it --rm debug --image=busybox:1.28 -- nslookup dev.fusion.localhost`;
- на хосте macOS: строка `127.0.0.1 dev.fusion.localhost` в `/etc/hosts`;
  Chromium резолвит `*.localhost` без записи.

**TLS:** сертификат `*.fusion.localhost` от локального mkcert CA. Поды получают
CA через secret `fusion-local-ca` (`global.tls.caSecretName`) ->
`NODE_EXTRA_CA_CERTS`. Команды `stand:*` не вызывают `mkcert -install` и не
запрашивают sudo. Для доверия сертификату в браузере один раз выполните
`mkcert -install` отдельно. Перевыпуск: `bash deployment/kubernetes/certs/gen.sh k3d`
(секреты обновляются, pod-ы перечитывают при рестарте).

**Смок без браузера:**

```bash
curl --resolve dev.fusion.localhost:443:127.0.0.1 -sS -o /dev/null -w '%{http_code}\n' https://dev.fusion.localhost/
curl --resolve dev.fusion.localhost:443:127.0.0.1 -sS -o /dev/null -w '%{http_code}\n' https://dev.fusion.localhost/_tr0/api/v1/health
curl --resolve dev.fusion.localhost:443:127.0.0.1 -sS -X POST https://dev.fusion.localhost/_account/ \
  -H 'Content-Type: application/json' -d '{"method":"login","params":{"email":"t@e.c","password":"x"}}'
# ответ вида {"error":...AccountNotFound} - account жив (endpoint /_account/ POST-only)
```

**Kafka не поднялся после перезапуска Docker/ноды.** Известный след Strimzi
после жёсткой остановки: под `my-cluster-combined-0` нет, а `Kafka`/`StrimziPodSet`
утверждают, что всё Ready. Лечение:

```bash
kubectl --context k3d-fusion -n platform-base delete strimzipodset my-cluster-combined
kubectl --context k3d-fusion -n platform-base rollout restart deployment strimzi-cluster-operator
```

Пересозданный под поднимается на старом PVC, данные топиков сохраняются.

**Обновить только образы:** `pnpm -w stand:push dev && kubectl --context k3d-fusion -n fusion-dev rollout restart deployment`.

**Полная очистка данных стенда** (вручную, только свои стенды):

```bash
# база стенда (создастся заново db-init при следующем up); пишем в primary, не в реплику
PG_POD=$(kubectl --context k3d-fusion -n platform-base get pod \
  -l cnpg.io/cluster=postgres,cnpg.io/instanceRole=primary -o jsonpath='{.items[0].metadata.name}')
kubectl --context k3d-fusion -n platform-base exec "$PG_POD" -- dropdb -U postgres <stand>
# bucket стенда
kubectl --context k3d-fusion -n platform-base exec statefulset/s3 -- mc rm -r --force local/<stand> local/<stand>-chunks
# топики стенда (постфикс -<stand>)
kubectl --context k3d-fusion -n platform-base exec my-cluster-broker-0 -- bin/kafka-topics.sh --bootstrap-server localhost:9092 --list | grep -- -<stand>
# индекс elastic
curl -X DELETE "http://$(kubectl --context k3d-fusion -n platform-base get svc elastic -o jsonpath='{.spec.clusterIP}'):9200/<stand>"
```

Job `stand-reset` (in-cluster Job с автоматической очисткой) не делался -
сброс данных и seed тестовых стендов выполняет `scripts/prepare-test-stand.sh`
(обёртка sanity - `prepare-sanity-k3s.sh`, вызывается из `tests/prepare-pg.sh`);
отдельного scheduled-Job нет.

**Окружение из compose вместо platform-base** (временный fallback, parity
проверялась раньше): `dev/docker-compose.yaml` +
`stands/local-infra.docker-compose-override.yaml`, адреса в values через
`host.k3d.internal`. Compose-стенды не удаляются до паритета k8s-прогонов.

**Полный снос локального:**

```bash
pnpm -w stand:dev:down --yes
STAND_RUNTIME=kind pnpm -w stand:dev:down --yes 2>/dev/null
pnpm -w stand:base:down k3d
```

## Ограничения и остаточная работа

Проверено живьём на этой машине: k3d base + dev (up/down, HTTPS 200,
login-RPC account отвечает), sanity/ws/api up/down (ws - оба региона 200),
kind - полный цикл base + dev-kind (up/down, HTTPS 200). 2026-11-11 добавлено:
ws - полный Playwright-сюит; api - полный jest-сюит (27/29 suites, 335/337
tests, exit 0); backup - 12/12 после фикса `rootBucket` в
`api-tests/backup/src/harness.ts`; coverage стенда (12 сервисов,
`coverage-stand.json` ~25MB, STAND 78.0%). 2026-11-11 также: sanity - чистый
prepare/seed (exit 0) и login smoke на текущей сборке wiring
(`with-stand-env` + webpack :8081 + Playwright `--workers=1`): 7 passed
(3 auth setup + 4 login tests), 22.5s; стенд fusion-sanity затем удалён,
platform-base сохранён. Не проверено: полный sanity-сюит после этой сборки,
реальные GH/GitLab-пайплайны, существующий remote
Kubernetes, pull из приватного registry (CI использует k3d, kind проверен
только локально). Ограничения:

- Docker VM на машине проверки ограничена ~8 ГБ: два полных стенда одновременно
  не влезают; на большей VM dev и sanity работают параллельно.
- ws/api-стенды: per-region базы через `config.regions[].db` (у europe - своя БД,
  main-регион на базе стенда); инстансы transactor/workspace/fulltext с тем же
  индексом читают её, мигрирует db-init/db-migrator. Данные стенда - `wstest`/`api`
  (имена S3 bucket ≥3 символов).
- existing-runtime: команды и values готовы, рендер проверен, prepare/seed
  прогнан на shell-моках без Docker (pullable tool image, namespace из
  configure); живой прогон не выполнен - единственный доступный внешний
  контекст (`admin@platform`) недоступен (просроченные credentials). Не блокер
  скриптов.
- Сброс данных стенда и seed через `kubectl cp` в pod `stand-tool`
  реализованы в `scripts/prepare-test-stand.sh` (sanity-обёртка -
  `prepare-sanity-k3s.sh`, вызывается из `tests/prepare-pg.sh`; Kubernetes -
  единственный backend prepare); отдельный in-cluster Job `stand-reset` не делался.
  Живой прогон prepare/seed выполнялся для sanity; prepare/seed ws/api
  прогонялись на shell-моках (логика и env подтверждены без кластера), а
  полные сюиты ws и api - уже живьём (см. статус проверки выше).
- LiveKit и egress на k3d - один общий экземпляр в platform-base; kind/existing
  держат host-сервер (`stands/dev/values.local-livekit.yaml`). Полный сценарий
  митинга и egress проверялся на sanity (recording-тесты), см. TSK-31.
- qms/cockroach/persona/secure-стенды compose-only, в k8s не переносились.
- Публикация чартов и `images.lock.yaml` в `platform-deployment` на тегах `v*`
  (CI) - TSK-20; теги `latest-<worktree>` - TSK-24/25. Сейчас `global.version`
  задаётся values стенда (default `latest`).

План, по которому всё это развивается:
`platform-tasks/docs/infra/2026-10-20-k3s-stands.md` (FUSIO-1598).
