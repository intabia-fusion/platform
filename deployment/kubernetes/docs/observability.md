# Метрики локальных стендов: OTel Collector + Prometheus

Ручная установка и эксплуатация того же стека, который `base-up.sh` поднимает автоматически.
Один коллектор и один Prometheus на все стенды (sanity, dev, qms, ...) в namespace `platform-base`.

## Схема

```
сервисы стенда --OTLP/HTTP(:4318)--> otel-collector --/metrics(:8889)--> Prometheus --UI--> браузер
```

- Сервисы берут адрес из `platform-otel-config` (ConfigMap в namespace стенда). Чарт `platform`
  по умолчанию подставляет `OTEL_EXPORTER_OTLP_ENDPOINT` из контракта platform-base
  (`http://otel-collector.platform-base.svc.cluster.local:4318`), поэтому новый стенд ничего
  не настраивает.
- SDK отправляет метрики, трейсы и логи на один endpoint. Коллектор оставляет только метрики:
  трейсы и логи отбрасываются фильтрами, чтобы не занимать диск и память VM.
- Prometheus скрейпит `otel-collector:8889` с `honor_labels: true`, поэтому `job` — это имя
  сервиса (`account`, `love`, `workspace`, ...), а не имя скрейп-задачи.

## Что поднимается

| Объект | Имя | Порт |
| --- | --- | --- |
| ConfigMap | `otel-collector-config` | — |
| Deployment | `otel-collector` | 4317 gRPC, 4318 HTTP, 8889 Prometheus |
| Service | `otel-collector` | те же |
| ConfigMap | `prometheus-config` | — |
| Deployment | `prometheus` | 9090 |
| Service | `prometheus` | 9090 |
| IngressRoute | `prometheus` | `prometheus.fusion.localhost` |

Версии образов — в `deployment/kubernetes/cluster/versions.env` и в
`charts/platform-base/values.yaml` (`metrics.otelCollector.image`, `metrics.prometheus.image`).

## Ручная установка

1. Убедись, что platform-base уже стоит (нужны его namespace и S3/redis для других компонентов):

   ```bash
   pnpm -w stand:base:up
   ```

2. Проверь, что включён блок `metrics` в `stands/base/values.yaml`:

   ```yaml
   metrics:
     prometheus:
       host: prometheus.fusion.localhost
   ```

3. Обнови релиз (это же делает `base-up`):

   ```bash
   helm --kube-context k3d-fusion upgrade platform-base \
     deployment/kubernetes/charts/platform-base \
     -n platform-base -f deployment/kubernetes/stands/base/values.yaml
   kubectl -n platform-base rollout status deploy/otel-collector --timeout=120s
   kubectl -n platform-base rollout status deploy/prometheus --timeout=120s
   ```

4. Проверка:

   ```bash
   curl -sk https://prometheus.fusion.localhost:8443/api/v1/targets   # оба target'а up
   curl -sk https://prometheus.fusion.localhost:8443/api/v1/label/job/values
   ```

## Полезные запросы

UI: `https://prometheus.fusion.localhost:8443` (сертификат mkcert, как у остальных
`*.fusion.localhost`).

```promql
up{job="otel-collector"}                                   # коллектор жив
account_rpc_duration_milliseconds_count{job="account"}     # RPC аккаунта
http_server_request_duration_seconds_bucket               # HTTP сервисов
sessions{job="love"}                                       # метрики love
```

Метрики стенда не смешиваются: у каждой серии есть `job` = имя сервиса, а у сервисов с
несколькими инстансами — `service_instance_id` из resource-атрибутов.

## Настройка и отключение

`charts/platform-base/values.yaml`:

```yaml
metrics:
  enabled: true            # false - ни коллектора, ни Prometheus, контракт без OTLP-endpoint
  otelCollector:
    image: otel/opentelemetry-collector-contrib:0.160.0
    memRequired: 64
    memLimits: 256
  prometheus:
    image: prom/prometheus:v3.1.0
    host: ""               # пусто - UI не публикуется
    retention: 48h
    memRequired: 128
    memLimits: 512
```

Отдельный стенд может ходить в другой коллектор — задай в его `values.yaml`:

```yaml
otel:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://collector.example:4318
```

Пустой endpoint чарт не рендерит: сервисы тогда не инициализируют SDK и метрик не будет.

## Диагностика

- **Target `otel-collector` down.** `kubectl -n platform-base get endpoints otel-collector`;
  если endpoints пустые — под не Ready, смотри `kubectl -n platform-base describe pod -l app=otel-collector`
  и `logs deploy/otel-collector`.
- **Нет метрик приложения.** Проверь env пода:
  `kubectl -n fusion-sanity exec deploy/transactor0 -- printenv OTEL_EXPORTER_OTLP_ENDPOINT`.
  Если пусто — в стенде нет `platform-otel-config` (обнови чарт стенда) или в platform-base не
  включён `metrics`.
- **Метрики есть, но `job` не тот.** У скрейпа должен быть `honor_labels: true`; без него
  Prometheus перезапишет `job` на `otel-collector`.
- **Коллектор падает на конвертации.** В 0.160 больше нет `service.telemetry.metrics.address`;
  конфиг лежит в `_helpers.tpl` (`platformBase.otelCollectorConfig`) и хешируется в аннотации
  пода, поэтому правка конфига перезапускает коллектор.
- **Память.** Фактически коллектор и Prometheus занимают ~50-100 MB вместе; проверить весь
  бюджет стендов: `pnpm -w stand:budget`.

## Ручной запуск без Helm (другой кластер)

Порядок тот же, что в шаблонах:

1. ConfigMap `otel-collector-config` — конфиг из `charts/platform-base/templates/_helpers.tpl`
   (helper `platformBase.otelCollectorConfig`), без плейсхолдеров значений.
2. Deployment `otel-collector` с `--config=/etc/otel/config.yaml`, портами 4317/4318/8889.
3. Service `otel-collector` на эти порты.
4. ConfigMap `prometheus-config` со scrape-джобой `otel-collector:8889` и `honor_labels: true`.
5. Deployment `prometheus` с `--config.file`, `--storage.tsdb.path`, `--storage.tsdb.retention.time`.
6. Service и IngressRoute (или обычный Ingress) на 9090.
7. Раздай сервисам `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.<ns>.svc.cluster.local:4318`.

## Полный стек: ClickStack (ClickHouse + HyperDX + OTel collector)

`platform-base` держит только метрики для Prometheus. Для трейсов, логов и UI
есть отдельный чарт `charts/monitoring` - обёртка над upstream-чартом ClickStack:
ClickHouse (хранение), HyperDX (UI и API), OpenTelemetry collector (приём OTLP)
и MongoDB (метаданные HyperDX). Чарт ставится в собственный namespace, не в
namespace стенда, и может быть один на кластер.

```bash
helm dependency build deployment/kubernetes/charts/monitoring
helm upgrade --install monitoring deployment/kubernetes/charts/monitoring \
  -n monitoring --create-namespace -f <stand>/values-monitoring.yaml
```

Объекты получают стабильные имена независимо от релиза: `monitoring-clickhouse`,
`monitoring-mongodb`, `monitoring-otel-collector`, `monitoring-app`.

UI пока не публикуется наружу:

```bash
kubectl -n monitoring port-forward svc/monitoring-app 3000:3000
# http://localhost:3000
```

Сервисы стенда шлют телеметрию в этот коллектор через values чарта `platform`:

```yaml
otel:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://monitoring-otel-collector.monitoring.svc.cluster.local:4318
  OTEL_EXPORTER_OTLP_COMPRESSION: gzip
```

`platform-otel-config` с явным `otel.*` перекрывает endpoint из контракта
`platform-base`; тогда Prometheus локального base перестаёт получать метрики
стенда, а все три сигнала идут в ClickStack. Ключ `clickstack.hyperdx.apiKey`
обязан быть уникальным для стенда - его используют и UI, и коллектор.
