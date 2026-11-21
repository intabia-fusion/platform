# PostgreSQL через CloudNativePG: ручной runbook

Как устроен и как ставится Postgres на стендах вручную. В автоматическом режиме всё это делает
`base-up.sh`; здесь — те же шаги и проверки, если нужно поднять/починить кластер руками или
повторить схему на другом Kubernetes.

## Что получается

- Оператор CloudNativePG в namespace `cnpg-system` (pinned `CLOUDNATIVE_PG_VERSION`).
- `Cluster/postgres` в `platform-base`: **primary + одна streaming-реплика** (`instances: 2`).
- Сервис `postgres` — только primary; его используют pgbouncer и контракт, DSN стендов не меняется.
- `postgres-ro` — только реплика, для чтения.
- `postgres-rw`/`postgres-r` — сервисы, которые создаёт сам CNPG.
- WAL и base backup — в `s3://postgres-backups/` (silo), retention 7 дней.
- `ScheduledBackup/postgres-daily` — каждую ночь.

## Ручная установка

### 1. Оператор

```bash
CNPG=v1.30.2
curl -fsSL --connect-timeout 10 --max-time 180 \
  "https://github.com/cloudnative-pg/cloudnative-pg/releases/download/$CNPG/cnpg-${CNPG#v}.yaml" \
  -o /tmp/cnpg.yaml

# Только server-side apply: CRD clusters/poolers больше лимита
# last-applied-configuration (256 KiB), обычный apply падает "metadata.annotations: Too long".
kubectl apply --server-side --force-conflicts -f /tmp/cnpg.yaml
kubectl wait --for=condition=Established crd/clusters.postgresql.cnpg.io --timeout=120s
kubectl -n cnpg-system rollout status deployment/cnpg-controller-manager --timeout=180s
```

Operand-образ Postgres (`ghcr.io/cloudnative-pg/postgresql:18.0`, ~250 МБ) тянется из GHCR.
Если сеть до GitHub плохая, зеркалируй в локальный registry:

```bash
docker pull ghcr.io/cloudnative-pg/postgresql:18.0
docker tag  ghcr.io/cloudnative-pg/postgresql:18.0 localhost:5111/cnpg/postgresql:18.0
docker push localhost:5111/cnpg/postgresql:18.0
# в Cluster: imageName: k3d-fusion-registry:5000/cnpg/postgresql:18.0
```

Без зеркала первый `initdb` может висеть на `Pulling ghcr.io/...`.

### 2. Суперпользователь

Стенды и pgbouncer ходят как `postgres`/`postgres`; CNPG берёт пароль из своего Secret:

```bash
kubectl -n platform-base create secret generic postgres-superuser \
  --type=kubernetes.io/basic-auth \
  --from-literal=username=postgres --from-literal=password=postgres
```

### 3. Cluster

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres
  namespace: platform-base
spec:
  instances: 2
  imageName: ghcr.io/cloudnative-pg/postgresql:18.0
  enableSuperuserAccess: true
  superuserSecret:
    name: postgres-superuser
  primaryUpdateStrategy: unsupervised
  storage:
    size: 2Gi
  resources:
    requests: { memory: 128Mi, cpu: 50m }
    limits: { memory: 512Mi }
  postgresql:
    parameters:
      shared_buffers: 128MB
      max_connections: 300
  backup:
    retentionPolicy: "7d"
    barmanObjectStore:
      destinationPath: s3://postgres-backups/
      endpointURL: http://s3.platform-base.svc.cluster.local:9000
      s3Credentials:
        accessKeyId: { name: postgres-backup-s3, key: ACCESS_KEY_ID }
        secretAccessKey: { name: postgres-backup-s3, key: SECRET_ACCESS_KEY }
      wal: { compression: gzip }
      data: { compression: gzip }
```

```bash
kubectl apply -f cluster.yaml
kubectl -n platform-base wait cluster/postgres --for=condition=Ready --timeout=600s
kubectl -n platform-base get cluster postgres   # INSTANCES 2, READY 2
```

### 4. Alias `postgres` на primary

CNPG создаёт `postgres-rw`, но контракт и pgbouncer уже используют имя `postgres`. Алиас
держит запись на primary:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: platform-base
spec:
  type: ClusterIP
  selector:
    cnpg.io/cluster: postgres
    cnpg.io/instanceRole: primary
  ports:
  - port: 5432
    targetPort: 5432
```

### 5. Бэкапы по расписанию

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  name: postgres-daily
  namespace: platform-base
spec:
  schedule: "0 0 3 * * *"   # у CNPG cron с полем секунд
  backupOwnerReference: cluster
  cluster: { name: postgres }
  method: barmanObjectStore
```

## Проверки

```bash
# запись через alias (primary)
kubectl -n platform-base exec deploy/pgbouncer -- \
  psql "postgresql://postgres:postgres@postgres.platform-base.svc.cluster.local:5432/postgres" -tAc 'select 1'

# реплика: pg_is_in_recovery = t, запись отклоняется
kubectl -n platform-base exec postgres-2 -- \
  psql -U postgres -tAc 'select pg_is_in_recovery()'
kubectl -n platform-base exec postgres-2 -- \
  psql -U postgres -c 'create table t (id int)'   # ERROR: read-only transaction

# статус репликации
kubectl -n platform-base exec postgres-1 -- \
  psql -U postgres -tAc "select client_addr, state, sent_lsn, replay_lsn from pg_stat_replication"
```

## Бэкап и восстановление

Ручной бэкап:

```bash
kubectl -n platform-base apply -f - <<'EOF'
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: postgres-manual
spec:
  cluster: { name: postgres }
  method: barmanObjectStore
EOF
kubectl -n platform-base get backup postgres-manual   # PHASE=completed
```

Содержимое бакета. Внутри silo alias `local` пустой (без ключей), поэтому задаём одноразовый
alias с кредами CNPG:

```bash
AK=$(kubectl -n platform-base get secret postgres-backup-s3 -o jsonpath='{.data.ACCESS_KEY_ID}' | base64 -d)
SK=$(kubectl -n platform-base get secret postgres-backup-s3 -o jsonpath='{.data.SECRET_ACCESS_KEY}' | base64 -d)
kubectl -n platform-base exec statefulset/s3 -- sh -c \
  "mc alias set b http://127.0.0.1:9000 '$AK' '$SK' >/dev/null && mc ls -r b/postgres-backups"
```

Восстановление в новый кластер (не поверх живого):

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres-restored
  namespace: platform-base
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:18.0
  storage: { size: 2Gi }
  bootstrap:
    recovery:
      source: origin
  externalClusters:
  - name: origin
    barmanObjectStore:
      destinationPath: s3://postgres-backups/
      endpointURL: http://s3.platform-base.svc.cluster.local:9000
      s3Credentials:
        accessKeyId: { name: postgres-backup-s3, key: ACCESS_KEY_ID }
        secretAccessKey: { name: postgres-backup-s3, key: SECRET_ACCESS_KEY }
```

После восстановления переключи alias/контракт на новый кластер или переименуй кластеры
осознанно: CNPG связывает бэкапы с именем кластера в `destinationPath`.

## Обновление и параметры

- `instances`, `resources`, `postgresql.parameters` меняются в `values.yaml` и применяются
  `helm upgrade`/`base-up`; `primaryUpdateStrategy: unsupervised` переключает primary сам.
- `shared_buffers` держим 128MB: на VM 12 GB два инстанса должны укладываться в ~300 MB.
- `max_connections: 300` согласован с pgbouncer (`defaultPoolSize: 30`, `maxConnections` в
  `postgres` values). Не поднимай `max_connections` без пересчёта памяти.

## Диагностика

| Симптом | Что смотреть |
| --- | --- |
| `initdb` висит на `Pulling ghcr.io/...` | зеркалируй образ в локальный registry (см. выше), `kubectl describe pod -l cnpg.io/cluster=postgres` |
| Cluster не Ready | `kubectl -n platform-base get cluster postgres -o yaml` (`.status.conditions`), логи `kubectl -n cnpg-system logs deploy/cnpg-controller-manager` |
| `postgres` сервис без endpoints | селектор `cnpg.io/instanceRole=primary`; `kubectl -n platform-base get endpoints postgres` |
| Бэкап `failed` | `kubectl -n platform-base describe backup <name>`, креды `postgres-backup-s3`, доступность silo |
| `mc ls local/...` → Access Denied | это ожидаемо, alias `local` без ключей; используй креды `postgres-backup-s3` |
| После `base-down`/`base-up` нет данных | PVC и бакеты удаляются вместе с base; стенд надо засеять заново |
| Старый PVC `data-postgres-0` | CNPG его не использует; удаляй вручную после проверки, что данные не нужны |

## Ограничения

- In-tree `barmanObjectStore` в CNPG 1.30 deprecated, удаляется в 1.32 — при обновлении
  оператора бэкапы переводятся на Barman Cloud Plugin (см. README).
- Локальный ключ sealed-secrets не связан с Postgres; но если base-секреты запечатаны,
  `postgres-superuser`/`postgres-backup-s3` приходят из SealedSecret (см. `sealed-secrets.md`).
