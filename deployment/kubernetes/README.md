# Kubernetes-стенды платформы

Два чарта и один набор команд из корня репозитория:

- `charts/platform` - сама платформа (Deployment/Service/IngressRoute сервисов,
  ConfigMap/Secret из values, Job `db-init`, `global.imageRegistry`,
  `global.imagePullPolicy`, `global.stand`, `global.tls.caSecretName`,
  `services.<svc>.extraEnv`, lookup-контракт ConfigMap/Secret `platform-base`).
- `charts/platform-base` - окружение под платформу: postgres, Kafka (Strimzi),
  S3 (pgsty/silo), elastic с плагинами, redis, mailpit + TLSStore default и
  контракт `platform-base` (адреса и учётки окружения).

Команды (pnpm из корня репозитория):

| Команда | Что делает |
|---|---|
| `pnpm -w stand:base:up [k3d\|kind\|existing]` | Идемпотентно поднимает base: кластер (если его нет), registry, CoreDNS-rewrite `*.fusion.localhost`, TLS (mkcert), Strimzi и чарт `platform-base` |
| `pnpm -w stand:base:down [k3d\|kind\|existing] [--delete-data]` | Убирает только то, что создал base-up. `existing` без флага кластер не трогает |
| `pnpm -w stand:dev:up [runtime] [--no-push]` | Поднимает dev-стенд (`dev.fusion.localhost`), base проверяет, при необходимости сам пушит образы |
| `pnpm -w stand:dev:down [runtime] [--yes]` | Удаляет namespace `fusion-dev` и релиз. Base, registry и чужие стенды не трогает; данные БД/bucket в platform-base остаются |
| `pnpm -w stand:test:up [sanity\|ws\|api] [runtime] [--no-push]` | Поднимает тестовый стенд: `sanity.fusion.localhost` (default), `ws` (два региона, данные стенда `wstest`), `api` |
| `pnpm -w stand:test:down [sanity\|ws\|api] [runtime] [--yes]` | Удаляет соответствующий namespace |
| `pnpm -w stand:push <stand> [runtime]` | Пушит образы стенда (`intabiafusion/*:global.version`) в registry кластера |
| `pnpm -w stand:deploy <stand> [runtime] [--dry-run]` | Дженерик-установка стенда; `--dry-run` рендерит манифесты без кластера |
| `pnpm -w stand:down <stand> [runtime] [--yes]` | Дженерик-удаление стенда |

Runtime - `k3d` (default), `kind` или `existing` (текущий kubectl context).
Выбор: первый аргумент или env `STAND_RUNTIME`.

Статус проверки (macOS, Docker VM 8 ГБ): k3d base + dev + sanity/ws/api
поднимались и удалялись живьём (HTTPS 200, login-RPC account отвечает);
kind - полный цикл base + dev-kind живьём. См. "Ограничения" ниже.

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
| postgres 18.1 | `internal` StatefulSet + PVC | `external` - managed строка подключения; режим `cnpg` из плана не реализован |
| Kafka 4.2.2 | `strimzi`, один combined controller+broker узел, PVC | оператор ставится base-up (pinned `STRIMZI_VERSION`), не зависимостью чарта; `external` - bootstrap-адрес. 4.2.2 - максимум, который поддерживает Strimzi 1.3.0 (prod 4.1.1 ждёт downgrade оператора или prod-override) |
| S3 (pgsty/silo) | `silo` StatefulSet + PVC | `external` - endpoint и ключи |
| elastic 8.19.1 | `internal` StatefulSet + PVC, плагины из `intabiafusion/elastic-plugins` init-контейнером | `external` - URL |
| redis 8.0.2 | `internal` Deployment | `external`/`disabled` |
| mailpit | enabled | SMTP стендов: `mailpit.platform-base.svc.cluster.local:1025` |

Режимы `external` для postgres/s3/elastic/redis/kafka реализованы: чарт
публикует внешние адреса в контракт вместо своих. Проверены рендером
(`helm template` с external-значениями); живой прогон external-режимов не
делался - local base использует дефолты. Версии пины в `cluster/versions.env`;
размеры local-base - в `stands/base/values.yaml`.

Контракт: ConfigMap/Secret `platform-base` в namespace `platform-base` (адреса
postgres/Kafka/S3/elastic/redis/SMTP). Чарт `platform` читает их lookup-ом при
`helm upgrade --install`; при `helm template` lookup пуст, поэтому для офлайн-
проверки рендера есть `stands/ci/render-check.yaml` с фиктивными адресами.

## Kind

```bash
STAND_RUNTIME=kind pnpm -w stand:base:up
STAND_RUNTIME=kind pnpm -w stand:dev:up
# стенд: https://dev-kind.fusion.localhost
```

Kind не содержит ingress: base-up ставит traefik (pinned chart) с NodePort
30080/30443, `cluster/kind.yaml` пробрасывает их на 80/443 хоста, registry -
контейнер `kind-registry` по схеме из документации kind. Не запускайте k3d и
kind одновременно на одних портах 80/443. Альтернативные порты:
`STAND_HTTP_PORT=8080 STAND_HTTPS_PORT=8443`.

## Kind на Podman (experimental)

На macOS Podman позволяет пробрасывать UDP и небольшие диапазоны UDP-портов.
Проверено: kind, platform-base и dev открываются в браузере; LiveKit в отдельном
kind-кластере с pod network + `hostPort` пропустил audio/video load test без
потерь. LiveKit пока не добавлен в чарты.

```bash
brew install podman
podman machine init --cpus 4 --memory 8192 --disk-size 50 fusion-test
podman machine start fusion-test

export CONTAINER_HOST="unix://$(podman machine inspect fusion-test \
  --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
export DOCKER_HOST="$CONTAINER_HOST"
export KIND_EXPERIMENTAL_PROVIDER=podman

STAND_RUNTIME=kind STAND_HTTP_PORT=9080 STAND_HTTPS_PORT=9443 \
  pnpm -w stand:base:up kind
STAND_RUNTIME=kind pnpm -w stand:dev:up kind
# https://dev-kind.fusion.localhost:9443
```

Перед `stand:dev:up` образы `intabiafusion/*:latest` должны быть доступны в
Podman. Сборка через `pnpm docker:build` на Podman пока не проверена; в живом
эксперименте образы были скопированы из локального Docker registry. Для push в
kind registry скрипт использует `podman push --tls-verify=false`.

## Existing Kubernetes

```bash
kubectl config use-context <мой-кластер>
STAND_RUNTIME=existing pnpm -w stand:base:up     # platform-base в текущий контекст
STAND_RUNTIME=existing pnpm -w stand:deploy dev --dry-run   # проверка values
STAND_RUNTIME=existing pnpm -w stand:deploy dev  # установка
```

Для push образов задайте `STAND_REGISTRY=registry.example.com/team` - тогда
`stand:push` тегирует и пушит туда; образы base чарт тянет из публичных
registry. Данные кластера не созданные скриптами не удаляются никогда;
`stand:base:down existing` без `--delete-data` ничего не удаляет.

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
    sanity/ ws/ api/         тестовые стенды
    ci/render-check.yaml     фиктивные адреса для helm template
    kind/traefik.values.yaml traefik для kind
  scripts/                   base-up/down, deploy, down, push-images, dev/test-обёртки
```

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
  -p "80:80@loadbalancer" -p "443:443@loadbalancer" \
  --registry-create k3d-fusion-registry:5000@localhost:5111
```

**Порты 80/443 заняты.** Скрипт остановится с диагностикой и не тронет чужой
процесс. Варианты: освободить порты или поднять кластер на альтернативных
(`STAND_HTTP_PORT=8080 STAND_HTTPS_PORT=8443`), тогда и curl должен идти на
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
# база стенда (создастся заново db-init при следующем up)
kubectl --context k3d-fusion -n platform-base exec statefulset/postgres -- dropdb -U postgres <stand>
# bucket стенда
kubectl --context k3d-fusion -n platform-base exec statefulset/s3 -- mc rm -r --force local/<stand> local/<stand>-chunks
# топики стенда (постфикс -<stand>)
kubectl --context k3d-fusion -n platform-base exec my-cluster-broker-0 -- bin/kafka-topics.sh --bootstrap-server localhost:9092 --list | grep -- -<stand>
# индекс elastic
curl -X DELETE "http://$(kubectl --context k3d-fusion -n platform-base get svc elastic -o jsonpath='{.spec.clusterIP}'):9200/<stand>"
```

Job `stand-reset` из плана (автоматическая очистка) пока не реализован - это
TSK-22, шаг следующей итерации.

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
kind - полный цикл base + dev-kind (up/down, HTTPS 200). Ограничения:

- Docker VM на машине проверки ограничена ~8 ГБ: два полных стенда одновременно
  не влезают; на большей VM dev и sanity работают параллельно.
- ws-стенд: два региона в region-config работают на одной базе стенда;
  per-region базы (region_main/region_europe как в compose ws-tests) требуют
  расширения чарта - TSK-17. Данные стенда - `wstest` (имена S3 bucket ≥3 символов).
- existing-runtime: команды и values готовы, рендер проверен; живой прогон
  не выполнен - единственный доступный внешний контекст (`admin@platform`)
  недоступен (просроченные credentials). Не блокер скриптов.
- Job `stand-reset` и backend `dev/test-base` для k8s (restore дампов через
  `kubectl cp`) - TSK-14/22, следующая итерация.
- LiveKit остаётся на хосте (TSK-31), в чарт не перенесён.
- qms/cockroach/persona/secure-стенды compose-only, в k8s не переносились.
- Публикация чартов и `images.lock.yaml` в `platform-deployment` на тегах `v*`
  (CI) - TSK-20; теги `latest-<worktree>` - TSK-24/25. Сейчас `global.version`
  задаётся values стенда (default `latest`).

План, по которому всё это развивается:
`platform-tasks/docs/infra/2026-10-20-k3s-stands.md` (FUSIO-1598).
