# Postgres на k8s-стенде: CloudNativePG

Область: [deployment/kubernetes/README.md](../../deployment/kubernetes/README.md), [getting-started.md](../getting-started.md)

- Манифест оператора `cnpg-<ver>.yaml` не применяется клиентским apply: аннотация
  `last-applied-configuration` у CRD `clusters`/`poolers` больше лимита 262144 байт
  (`metadata.annotations: Too long`). Нужен `kubectl apply --server-side --force-conflicts`;
  `--dry-run=client` на этом манифесте тоже падает, для проверки кеша - `kubectl create --dry-run=client`.
- In-tree `spec.backup.barmanObjectStore` в 1.30.2 работает, но помечен deprecated и удаляется в
  1.32.0: подъём оператора выше 1.30 требует Barman Cloud Plugin (`method: plugin`).
- Cron в `ScheduledBackup` - с полем секунд (`0 0 3 * * *`); пятипольный вариант вебхук
  принимает, но пишет `Schedule parameter may not have the right number of arguments`.
- Образ operand-а `ghcr.io/cloudnative-pg/postgresql:18.0` (~250 МБ) из пода k3d тянулся >10 минут
  (host `docker pull` - 5 минут). `base-up.sh` сам берёт зеркало из локального registry, если тег
  лежит в `cnpg/postgresql` (`curl http://localhost:5111/v2/cnpg/postgresql/tags/list`).
- Поды кластера - `postgres-1`/`postgres-2` (сначала Job `postgres-1-initdb`), пода `postgres-0`
  больше нет: всё, что пинит имя, ломается. Стабильные селекторы - `cnpg.io/cluster=postgres` и
  `cnpg.io/instanceRole=primary|replica`; сервис `postgres` - алиас на primary, `postgres-ro` - на реплику.
- Barman создаёт bucket `postgres-backups` сам. В поде silo alias `local` без ключей, поэтому
  `mc ls local/...` отвечает `Access Denied`: нужен одноразовый `mc alias set b http://127.0.0.1:9000
  "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"`.
- Брутфорс-обновление `imageName` rolling-апдейтит кластер; с `primaryUpdateStrategy: unsupervised`
  подтверждения не ждёт (иначе primary стоит, пока не сделаешь `kubectl cnpg promote`).
