# Intabia Platform charts

Helm-чарты платформы, публикуемые по релизам: `platform` (сервисы), `platform-base`
(Postgres/Kafka/S3/elastic/redis/mailpit + контракт для `platform`) и отдельный `monitoring`
(ClickStack: ClickHouse + HyperDX + OpenTelemetry collector). Docker-версия живёт в
[platform-selfhost](https://github.com/intabia-fusion/platform-selfhost); этот репозиторий — для
Kubernetes.

## Что внутри

```
docs/                     Helm-репозиторий: index.yaml + platform-<version>.tgz, platform-base-<version>.tgz,
                          monitoring-<version>.tgz
values/
  base-bundled.yaml       всё stateful внутри кластера
  base-external.yaml      managed Postgres/Kafka/S3/elastic/redis, base только публикует контракт
  platform-bundled.yaml   platform против bundled base
  platform-external.yaml  platform против внешней инфраструктуры
  secrets-*.example.yaml  шаблоны credentials (копируются в secrets-*.yaml, gitignored)
scripts/install.sh        установка и апгрейд (идемпотентно)
scripts/apply.sh          то же под именем apply: diff -> apply -> rollback
scripts/upgrade.sh        то же, отдельная точка входа для runbook'ов
scripts/diff.sh           что изменит apply, без изменений (нужен helm-diff)
scripts/rollback.sh       откат обоих релизов на ревизию назад или на заданную
```

Charts repo: `https://intabia-fusion.github.io/platform-charts` (GitHub Pages из `docs/`).

## Требования

- Kubernetes 1.32+ (CNPG/Strimzi CRD), Helm 4, `kubectl`.
- **Traefik** как ingress: чарты создают `IngressRoute`/`Middleware`/`TLSStore` (traefik.io/v1alpha1).
  Для nginx-ingress нужен отдельный values-слой, его здесь нет.
- StorageClass для PVC (bundled) или внешние сервисы.
- DNS-запись на `hostUrl` и TLS-сертификат: bundled-профиль ждёт default TLSStore Traefik;
  для своего TLS поставь `tls.enabled: false` в `values/base-*.yaml` и настрой TLSStore/сертификат сам.
- S3-совместимое хранилище (bundled: silo; external: свой бакет).

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

## Быстрый старт (bundled)

```bash
cp values/secrets-base.example.yaml values/secrets-base.yaml
cp values/secrets-platform.example.yaml values/secrets-platform.yaml
# заполнить serverSecret и SMTP; для bundled S3/Postgres креды можно оставить дефолтными

# hostUrl в values/platform-bundled.yaml -> ваш домен
PROFILE=bundled PLATFORM_VERSION=v0.8.37 ./scripts/install.sh
```

`install.sh` ставит `platform-base` в `platform-base`, затем `platform` в `platform`
(`global.namespace`, `global.baseNamespace`, `global.version` подставляются из окружения).

## Namespace

По умолчанию `platform-base` ставится в `platform-base`, `platform` — в `platform`.
Можно любые имена:

```bash
NS=acme-app NS_BASE=acme-base PROFILE=bundled PLATFORM_VERSION=v0.8.73 ./scripts/install.sh
```

Оба чарта можно поставить в **один** namespace (например, отдельный namespace заказчика):

```bash
SINGLE_NAMESPACE=1 NS=acme PROFILE=bundled PLATFORM_VERSION=v0.8.73 ./scripts/install.sh
```

`global.namespace` в чарте `platform` — это namespace, в который пишутся ресурсы (не только
релиз Helm), поэтому он должен совпадать с `-n`. `install.sh` подставляет его сам; при ручном
`helm upgrade` задавай `--set global.namespace=<ns> --set global.baseNamespace=<base-ns>`.

## Мониторинг (опционально)

`monitoring` ставится отдельно от стенда, один релиз на кластер:

```bash
helm repo add intabia-fusion https://intabia-fusion.github.io/platform-charts
helm repo update
helm upgrade --install monitoring intabia-fusion/monitoring -n monitoring --create-namespace
kubectl -n monitoring port-forward svc/monitoring-app 3000:3000
```

UI открывается на `http://localhost:3000`; наружу чарт пока не публикуется. При первом входе
создай аккаунт: до регистрации HyperDX не включает OTLP-приёмник коллектора и данные не идут.
Сервисы стенда шлют OTLP в `http://monitoring-otel-collector.monitoring.svc.cluster.local:4318` —
задай это в values чарта `platform`:

```yaml
otel:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://monitoring-otel-collector.monitoring.svc.cluster.local:4318
```

После регистрации коллектор по умолчанию требует bearer-токен команды. Пока мониторинг
внутри кластера, проще выключить проверку:
`mongosh hyperdx --eval 'db.teams.updateMany({}, {$set:{collectorAuthenticationEnforced:false}})'`.
Если проверка нужна, передай заголовок сервисам через `secrets.platform.uptraceDsn`:
`authorization=Bearer <team api key>`.

## Частичный external

Если снаружи только часть сервисов, не бери `base-external.yaml` (он выключает всё):
оставь `PROFILE=bundled` и перечисли компоненты в `EXTERNAL`:

```bash
EXTERNAL=postgres,s3 PROFILE=bundled PLATFORM_VERSION=v0.8.73 ./scripts/install.sh
```

Оверлеи лежат в `values/external/` (`postgres`, `kafka`, `s3`, `elastic`, `redis`, `mailpit`,
`livekit`); остальные компоненты остаются внутренними. Каждый оверлей ставит
`enabled: false` + `mode: external` — при `enabled: false` без `mode: external` рендер падает
с ошибкой (защита от «выключил и забыл»).

Проверить команды без установки: `DRY_RUN=1 ... ./scripts/install.sh`.

Рабочий цикл обновления - три скрипта с одинаковыми переменными (`PROFILE`,
`PLATFORM_VERSION`, `NS`, `CHARTS_DIR`):

```bash
PROFILE=bundled PLATFORM_VERSION=v0.8.76 ./scripts/diff.sh    # что изменится (helm-diff)
PROFILE=bundled PLATFORM_VERSION=v0.8.76 ./scripts/apply.sh   # platform-base, затем platform
./scripts/rollback.sh --list                                  # история обоих релизов
./scripts/rollback.sh                                         # на ревизию назад
```

`diff.sh` и `apply.sh` - те же `install.sh` (`DIFF=1` и без него), поэтому флаги и порядок
релизов совпадают. `rollback.sh` откатывает в обратном порядке: сначала `platform`, потом
`platform-base`, чтобы инфраструктура не оказалась новее приложения.

## Внешняя инфраструктура (prod)

1. Заполнить `values/base-external.yaml`: адреса managed Postgres/Kafka/S3/elastic/redis.
   Credentials — в `values/secrets-base.yaml` (Postgres password, S3 keys).
2. Заполнить `values/platform-external.yaml`: `hostUrl`, LiveKit (внешний) или оставить пустым.
3. Установить:

```bash
PROFILE=external PLATFORM_VERSION=v0.8.37 ./scripts/install.sh
```

В external-профиле `platform-base` не поднимает stateful-сервисы: он только публикует
ConfigMap/Secret `platform-base` с адресами, которые читает `platform`. Каждый компонент можно
выключить (`enabled: false`) и заменить внешним (`mode: external`); при `enabled: false` без
`mode: external` чарт падает с внятной ошибкой.

## Релизы и версии

- Версия чарта = версия релиза без `v` (например `0.8.37`), `appVersion` — та же.
- Образы: `<registry>/<namespace>/<service>:<global.version>`; `global.version` = тег релиза
  (`v0.8.37`). `imageRegistry` пустой = Docker Hub, `imageNamespace` по умолчанию `intabiafusion`.
- Старые версии чартов остаются в репозитории: они нужны для `--version` и отката. Опциональная
  чистка у мейнтейнера: `release:charts <version> --prune --keep N`.
- `helm search repo platform-charts --versions` покажет доступные версии; ставить конкретную:
  `PLATFORM_VERSION=v0.8.37 ./scripts/install.sh`.
- Pre-release чарт (например `0.8.73-rc2`) можно поставить с релизными образами:
  `PLATFORM_VERSION=v0.8.73 CHART_VERSION=0.8.73-rc2 ./scripts/install.sh`.

## Секреты

- `values/secrets-*.yaml` не коммитятся (см. `.gitignore`).
- Для GitOps с запечатанными секретами чарты поддерживают `sealedSecrets.enabled: true` и
  `sealedSecrets.manifests` (SealedSecret, контроллер Bitnami). Формат и ограничения — в
  [deployment/kubernetes/docs/sealed-secrets.md](https://github.com/intabia-fusion/platform/blob/develop/deployment/kubernetes/docs/sealed-secrets.md)
  основного репозитория.

## Бэкапы

- **bundled PostgreSQL**: CNPG `ScheduledBackup` в S3 каждую ночь, retention 7 дней. Ручной бэкап:
  ```bash
  kubectl -n platform-base apply -f - <<'EOF'
  apiVersion: postgresql.cnpg.io/v1
  kind: Backup
  metadata: { name: manual }
  spec: { cluster: { name: postgres }, method: barmanObjectStore }
  EOF
  ```
  Список: `kubectl -n platform-base get backup`; содержимое бакета `postgres-backups` — через
  креды секрета `postgres-backup-s3`.
- **S3 (silo)** и **elastic** — PVC; бэкапьте снапшотами тома/бакета средствами инфраструктуры.
- **Приложение** — сервис `backup` (`backupApi`) пишет бэкапы пространств в S3; для внешнего S3
  задайте `backupConfig` в `secrets/platform`.
- Restore CNPG в новый кластер — см. `deployment/kubernetes/docs/postgres.md` основного репозитория
  (bootstrap.recovery).

## Первое пространство

После установки откройте `https://<hostUrl>` и создайте аккаунт/пространство через UI либо
`account` API. Для автоматизации см. `create-workspace.sh` в platform-selfhost — он работает с
Docker-версией; для Kubernetes используйте account endpoint `/_account` (POST) и `workspace`
сервис.

## Апгрейд

```bash
PLATFORM_VERSION=v0.8.40 ./scripts/upgrade.sh
```

Порядок: `platform-base` обновляется первым (операторы/CRD), затем `platform`. Оба релиза
идемпотентны, повторный запуск безопасен. Откат — установить предыдущую версию тем же скриптом
(образы immutable, схема БД мигрирует вперёд; перед откатом проверьте миграции).

## Удаление

```bash
helm -n platform uninstall platform
helm -n platform-base uninstall platform-base
kubectl delete namespace platform platform-base   # вместе с PVC и бакетами
```

## Размеры

Bundled на небольшой прод: ~6-8 GiB RAM, 4 vCPU, 100+ GiB диска (20 Postgres + 20 Kafka +
50 S3 + 20 elastic + запас). External-профиль: только `platform` (~3-4 GiB RAM) и
`platform-base`-контракт без stateful-подов. Точные requests/limits — в values.

## Публикация (для мейнтейнеров)

CI основного репозитория на тег `v*`/`s*` пакетирует чарты и пушит их в этот репозиторий
(`deployment/kubernetes/scripts/publish-charts.sh`, секрет `CHARTS_TOKEN`). Вручную:

```bash
pnpm -w release:charts v0.8.37
```

Скрипт обновляет `docs/*.tgz` и `docs/index.yaml`, коммитит и пушит. Первый запуск с `--init`
раскладывает values/scripts/README, если репозиторий пустой.

## Диагностика

| Симптом | Что смотреть |
| --- | --- |
| `platform` падает: `platform-base: set config.queueConfig...` | не установлен `platform-base` или неверный `global.baseNamespace` |
| поды `Pending` | storageClass, requests vs allocatable, `kubectl describe pod` |
| `ImagePullBackOff` | `global.imageRegistry`/`imageNamespace`/`global.version`, доступ к registry |
| IngressRoute не работает | Traefik установлен? `kubectl get ingressroute -n platform` |
| 502/503 на UI | `kubectl -n platform get pods`, логи `front`/`nginx`-эквивалента |
