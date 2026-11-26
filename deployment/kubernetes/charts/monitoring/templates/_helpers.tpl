{{- /*
Stable OTLP endpoint of the ClickStack collector. The upstream chart names its objects from
fullnameOverride (monitoring by default); without it Helm would prepend the release name.
*/ -}}
{{- define "monitoring.clickstackName" -}}
{{- if .Values.clickstack.fullnameOverride -}}
{{- .Values.clickstack.fullnameOverride -}}
{{- else -}}
{{- printf "%s-clickstack" .Release.Name -}}
{{- end -}}
{{- end -}}

{{- define "monitoring.otlpEndpoint" -}}
{{- printf "http://%s-otel-collector.%s.svc.cluster.local:4318" (include "monitoring.clickstackName" .) .Release.Namespace -}}
{{- end -}}

{{- /* Node collector config. Kept in a helper so the DaemonSet checksum hashes the same text. */ -}}
{{- define "monitoring.metricsNodeConfig" -}}
{{- $m := .Values.resourceMetrics }}
receivers:
  # Node CPU, memory, load and network counters from the host. root_path points at the mounted
  # host filesystems, not at the collector container.
  hostmetrics:
    root_path: /hostfs
    collection_interval: {{ $m.node.collectionInterval }}
    scrapers:
      cpu: {}
      memory: {}
      load: {}
      network: {}
  # Per-pod and per-container CPU/memory, and node-level stats from the kubelet summary.
  kubeletstats:
    collection_interval: {{ $m.node.collectionInterval }}
    auth_type: serviceAccount
    endpoint: https://${env:K8S_NODE_NAME}:10250
    insecure_skip_verify: true
    metric_groups: [container, pod, node]
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 200
  resource:
    attributes:
      - key: service.name
        value: node-metrics
        action: upsert
  batch: {}
exporters:
  otlp_http:
    endpoint: {{ include "monitoring.otlpEndpoint" . }}
    compression: gzip
service:
  telemetry:
    logs:
      level: warn
  pipelines:
    metrics:
      receivers: [hostmetrics, kubeletstats]
      processors: [memory_limiter, resource, batch]
      exporters: [otlp_http]
{{- end -}}

{{- /* CNPG collector config: discovers pods by the cnpg.io/cluster label and scrapes port 9187. */ -}}
{{- define "monitoring.metricsDatabaseConfig" -}}
{{- $m := .Values.resourceMetrics }}
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: cnpg
          scrape_interval: {{ $m.database.collectionInterval }}
          honor_labels: true
          kubernetes_sd_configs:
            - role: pod
{{- with $m.database.namespaces }}
              namespaces:
                names:
{{ toYaml . | indent 18 }}
{{- end }}
          relabel_configs:
            - source_labels: [__meta_kubernetes_pod_label_cnpg_io_cluster]
              regex: .+
              action: keep
            - source_labels: [__meta_kubernetes_pod_ip]
              target_label: __address__
              replacement: $1:9187
            - source_labels: [__meta_kubernetes_pod_name]
              target_label: instance
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 100
  resource:
    attributes:
      - key: service.name
        value: cnpg-metrics
        action: upsert
  batch: {}
exporters:
  otlp_http:
    endpoint: {{ include "monitoring.otlpEndpoint" . }}
    compression: gzip
service:
  telemetry:
    logs:
      level: warn
  pipelines:
    metrics:
      receivers: [prometheus]
      processors: [memory_limiter, resource, batch]
      exporters: [otlp_http]
{{- end -}}
