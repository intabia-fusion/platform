Область: [getting-started.md](../getting-started.md)

- `base-up.sh` скачивает манифест Strimzi с GitHub при каждом запуске; без `--max-time` зависший трансфер держал `tests/prepare-pg.sh` 97 минут, и dotest не доходил до тестов.
- Обрезанный манифест доходит до `kubectl apply` как `yaml: line 5364: did not find expected key`; теперь он кешируется в `$TMPDIR/fusion-strimzi-<version>.yaml` и проверяется `kubectl apply --dry-run=client`.
- Если скачать не удалось, а оператор уже установлен, base-up продолжает с предупреждением, а не падает.
- `prepare-pg.sh` молча выходил (`set -e`) на `PORT_PIDS=$(livekit_server_pids)`: на 7890 отвечал docker-proxy от старого k3d-маппинга, `grep -q livekit-server` возвращал 1 — и prepare умирал сразу после сида, до `=== run 1/1`. Функция теперь всегда возвращает 0.
- Kafka-admin в `prepare-test-stand.sh` ограничен `with_deadline` (perl alarm): `kafka-topics --list` зависал на восстановлении брокера.
