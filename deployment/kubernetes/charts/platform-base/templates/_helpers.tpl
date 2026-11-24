{{- /*
Placement for a component: its nodeSelector, then its global.nodePools entry (pool),
then global.nodeSelector. Call with (dict "root" . "component" "postgres").
*/ -}}
{{- define "platformBase.podSelector" -}}
{{- $root := .root -}}
{{- $cfg := index $root.Values .component | default dict -}}
{{- $sel := $cfg.nodeSelector | default dict -}}
{{- if not $sel -}}
{{- $pool := $cfg.pool | default "" -}}
{{- if $pool -}}
{{- $poolSel := index ($root.Values.global.nodePools | default dict) $pool | default dict -}}
{{- if not $poolSel }}{{ fail (printf "%s.pool: global.nodePools.%s is not defined" .component $pool) }}{{ end -}}
{{- $sel = $poolSel -}}
{{- end -}}
{{- end -}}
{{- if not $sel }}{{ $sel = $root.Values.global.nodeSelector | default dict }}{{ end -}}
{{- toYaml $sel -}}
{{- end -}}

{{- /*
Pod placement: per-component nodeSelector, then component pool, then global.nodeSelector.
*/ -}}
{{- define "platformBase.nodeSelector" -}}
{{- with .sel }}
nodeSelector:
{{ toYaml . | indent 2 }}
{{- end }}
{{- end -}}

{{- /* same selector as nodeAffinity, for CRs whose pod template has no nodeSelector field (Strimzi). */ -}}
{{- define "platformBase.nodeAffinity" -}}
{{- with .sel }}
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        {{- range $k, $v := . }}
        - key: {{ $k }}
          operator: In
          values: [{{ $v | quote }}]
        {{- end }}
{{- end }}
{{- end -}}

{{- /*
Component address helpers: resolve the effective host/port/etc per mode and fail
loudly when an external mode is missing its values.
*/ -}}

{{- define "platformBase.postgresHost" -}}
{{- if and (not .Values.postgres.enabled) (ne .Values.postgres.mode "external") }}
  {{ fail "postgres.enabled=false: set postgres.mode=external and fill postgres.external" }}
{{- end }}
{{- if eq .Values.postgres.mode "external" -}}
  {{- if not .Values.postgres.external.host }}{{ fail "postgres.mode=external: set postgres.external.host" }}{{ end -}}
  {{- .Values.postgres.external.host -}}
{{- else if .Values.pgbouncer.enabled -}}
  {{- printf "pgbouncer.%s.svc.cluster.local" .Release.Namespace -}}
{{- else -}}
  {{- printf "postgres.%s.svc.cluster.local" .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.postgresPort" -}}
{{- if eq .Values.postgres.mode "external" -}}
  {{- .Values.postgres.external.port | default "5432" -}}
{{- else -}}5432{{- end -}}
{{- end -}}

{{- define "platformBase.postgresUser" -}}
{{- if eq .Values.postgres.mode "external" -}}
  {{- if not .Values.postgres.external.user }}{{ fail "postgres.mode=external: set postgres.external.user" }}{{ end -}}
  {{- .Values.postgres.external.user -}}
{{- else -}}
  {{- .Values.postgres.user -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.postgresPassword" -}}
{{- if eq .Values.postgres.mode "external" -}}
  {{- if not .Values.postgres.external.password }}{{ fail "postgres.mode=external: set postgres.external.password" }}{{ end -}}
  {{- .Values.postgres.external.password -}}
{{- else -}}
  {{- .Values.postgres.password -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.kafkaBootstrap" -}}
{{- if and (not .Values.kafka.enabled) (ne .Values.kafka.mode "external") }}
  {{ fail "kafka.enabled=false: set kafka.mode=external and fill kafka.external" }}
{{- end }}
{{- if eq .Values.kafka.mode "external" -}}
  {{- if not .Values.kafka.external.bootstrap }}{{ fail "kafka.mode=external: set kafka.external.bootstrap" }}{{ end -}}
  {{- .Values.kafka.external.bootstrap -}}
{{- else if eq .Values.kafka.mode "redpanda" -}}
  {{- printf "redpanda.%s.svc.cluster.local:9092" .Release.Namespace -}}
{{- else -}}
  {{- printf "my-cluster-kafka-bootstrap.%s.svc.cluster.local:9092" .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.s3Endpoint" -}}
{{- if and (not .Values.s3.enabled) (ne .Values.s3.mode "external") }}
  {{ fail "s3.enabled=false: set s3.mode=external and fill s3.external" }}
{{- end }}
{{- if eq .Values.s3.mode "external" -}}
  {{- if not .Values.s3.external.endpoint }}{{ fail "s3.mode=external: set s3.external.endpoint" }}{{ end -}}
  {{- .Values.s3.external.endpoint -}}
{{- else -}}
  {{- printf "s3.%s.svc.cluster.local:9000" .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.s3AccessKey" -}}
{{- if eq .Values.s3.mode "external" -}}{{- .Values.s3.external.accessKey -}}{{- else -}}{{- .Values.s3.accessKey -}}{{- end -}}
{{- end -}}

{{- define "platformBase.s3SecretKey" -}}
{{- if eq .Values.s3.mode "external" -}}{{- .Values.s3.external.secretKey -}}{{- else -}}{{- .Values.s3.secretKey -}}{{- end -}}
{{- end -}}

{{- define "platformBase.elasticUrl" -}}
{{- if and (not .Values.elastic.enabled) (ne .Values.elastic.mode "external") }}
  {{ fail "elastic.enabled=false: set elastic.mode=external and fill elastic.external" }}
{{- end }}
{{- if eq .Values.elastic.mode "external" -}}
  {{- if not .Values.elastic.external.url }}{{ fail "elastic.mode=external: set elastic.external.url" }}{{ end -}}
  {{- .Values.elastic.external.url -}}
{{- else -}}
  {{- printf "http://elastic.%s.svc.cluster.local:9200" .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.redisHost" -}}
{{- if eq (.Values.redis.mode | default "internal") "disabled" -}}
{{- else -}}
{{- if and (not .Values.redis.enabled) (ne (.Values.redis.mode | default "internal") "external") }}{{ fail "redis.enabled=false: set redis.mode=external or disabled" }}{{ end }}
{{- if eq .Values.redis.mode "external" -}}
  {{- if not .Values.redis.external.host }}{{ fail "redis.mode=external: set redis.external.host" }}{{ end -}}
  {{- .Values.redis.external.host -}}
{{- else -}}
  {{- printf "redis.%s.svc.cluster.local" .Release.Namespace -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- /*
Collector and Prometheus configs live in helpers so the pod annotation can hash exactly what the
ConfigMap carries: the collector reads its file only at startup, and a values-only checksum would
leave a running pod on stale config.
*/ -}}
{{- define "platformBase.otelCollectorConfig" -}}
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: {{ .Values.metrics.otelCollector.memLimits }}
    spike_limit_mib: {{ div (int .Values.metrics.otelCollector.memLimits) 4 }}
  batch: {}
  # The SDK exports all three signals from one endpoint; only metrics are kept here.
  filter/traces:
    error_mode: ignore
    traces:
      span:
        - 'true'
  filter/logs:
    error_mode: ignore
    logs:
      log_record:
        - 'true'
exporters:
  prometheus:
    endpoint: 0.0.0.0:8889
  debug:
    verbosity: basic
service:
  telemetry:
    logs:
      level: warn
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    traces:
      receivers: [otlp]
      processors: [filter/traces]
      exporters: [debug]
    logs:
      receivers: [otlp]
      processors: [filter/logs]
      exporters: [debug]
{{- end -}}

{{- define "platformBase.prometheusConfig" -}}
global:
  scrape_interval: 15s
  evaluation_interval: 30s
scrape_configs:
- job_name: otel-collector
  # The collector stamps service.name as job; keep it instead of the scrape job name.
  honor_labels: true
  static_configs:
  - targets: ['otel-collector:8889']
- job_name: prometheus
  static_configs:
  - targets: ['localhost:9090']
{{- end -}}
