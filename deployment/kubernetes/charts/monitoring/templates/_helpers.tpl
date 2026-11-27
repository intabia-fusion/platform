{{- /*
Name of the ClickStack objects. Mirrors the upstream clickstack.fullname helper: fullnameOverride
wins; otherwise the release name is used when it already contains the chart name, and
<release>-clickstack otherwise. Keeping the same rule keeps the endpoint on the real Service.
*/ -}}
{{- define "monitoring.clickstackName" -}}
{{- if .Values.clickstack.fullnameOverride -}}
{{- .Values.clickstack.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default "clickstack" .Values.clickstack.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- /* OTLP/HTTP port of the upstream collector Service (clickstack.otel.httpPort). */ -}}
{{- define "monitoring.clickstackOtelPort" -}}
{{- .Values.clickstack.otel.httpPort | default 4318 -}}
{{- end -}}

{{- define "monitoring.otlpEndpoint" -}}
{{- printf "http://%s-otel-collector.%s.svc.cluster.local:%v" (include "monitoring.clickstackName" .) .Release.Namespace (include "monitoring.clickstackOtelPort" .) -}}
{{- end -}}

{{- /*
Resource collectors export to the ClickStack collector, so they are rendered only when that
collector exists: the subchart is enabled and its otel component is not switched off.
*/ -}}
{{- define "monitoring.resourceExportersEnabled" -}}
{{- $otel := .Values.clickstack.otel | default dict -}}
{{- $otelEnabled := true -}}
{{- if hasKey $otel "enabled" -}}{{- $otelEnabled = $otel.enabled -}}{{- end -}}
{{- if and .Values.resourceMetrics.enabled .Values.clickstack.enabled $otelEnabled -}}
true
{{- end -}}
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
      disk: {}
      filesystem: {}
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
      # hostmetrics has no node identity of its own; the downward API supplies it so disk,
      # filesystem and network series can be grouped by node.
      - key: k8s.node.name
        value: ${env:K8S_NODE_NAME}
        action: upsert
  batch: {}
exporters:
  otlp_http:
    endpoint: {{ include "monitoring.otlpEndpoint" . }}
    compression: gzip
{{- with $m.clickstack.apiKeySecret }}
    headers:
      Authorization: "Bearer ${env:CLICKSTACK_API_KEY}"
{{- end }}
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
{{- if $m.kubeStateMetrics.enabled }}
        # Only when its workload and Service are rendered; the target would be a dead DNS name
        # otherwise.
        - job_name: kube-state-metrics
          scrape_interval: {{ $m.database.collectionInterval }}
          honor_labels: true
          static_configs:
            - targets:
                - {{ include "monitoring.clickstackName" . }}-kube-state-metrics.{{ .Release.Namespace }}.svc.cluster.local:8080
{{- end }}
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
{{- with $m.clickstack.apiKeySecret }}
    headers:
      Authorization: "Bearer ${env:CLICKSTACK_API_KEY}"
{{- end }}
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
