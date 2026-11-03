{{- define "platform.containerImage" -}}
  {{- $svcImage := (index .root.Values.services .service "image") | default "" -}}
  {{- $image := .image | default .service -}}
  {{- if ne $svcImage "" }}{{ $svcImage }}{{- else }}{{- with .root.Values.global.imageRegistry }}{{ . }}/{{ end }}{{ .root.Values.global.imageNamespace | default "intabiafusion" }}/{{ $image }}:{{ .root.Values.global.version }}{{- end }}
{{- end -}}

{{- define "platform.publicHost" -}}
{{- $port := .Values.global.publicPort | default 443 | toString -}}
{{- if ne $port "443" }}{{ printf "%s:%s" .Values.global.hostUrl $port }}{{ else }}{{ .Values.global.hostUrl }}{{ end -}}
{{- end -}}

{{/*
Stand name: used as database name, S3 bucket, kafka topic postfix and fulltext index.
Defaults to the release name.
*/}}
{{- define "platform.stand" -}}
{{- $stand := .Values.global.stand | default .Release.Name | lower | trunc 63 | trimSuffix "-" -}}
{{- if not (regexMatch "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" $stand) }}{{ fail "global.stand must be a DNS label" }}{{ end -}}
{{- $stand -}}
{{- end -}}

{{/*
Extra env for a service container:
- NODE_EXTRA_CA_CERTS when global.tls.caSecretName is set (mkcert CA for stand TLS)
- services.<svc>.extraEnv entries from values
Inject right after the container `env:` line with the matching indentation.
*/}}
{{- define "platform.extraEnv" -}}
{{- $root := .root -}}
{{- $svc := .service -}}
{{- if $root.Values.global.tls.caSecretName }}
- name: NODE_EXTRA_CA_CERTS
  value: /etc/ssl/platform-ca/tls.crt
{{- end }}
{{- if $root.Values.global.coverage.enabled }}
- name: NODE_V8_COVERAGE
  value: /coverage/{{ $svc }}
{{- end }}
{{- range $e := (index $root.Values.services $svc "extraEnv") | default list }}
- name: {{ $e.name }}
  value: {{ $e.value | quote }}
{{- end }}
{{- end -}}

{{/*
Stand coverage (STAND_COVERAGE=true): all profile-writing pods share one PVC mounted
at /coverage; each service writes its own /coverage/<service> directory, which is what
`pnpm coverage:stand` expects on the host after kubectl cp. Inject right after the
container `volumeMounts:` line, and `platform.coverageVolume` after pod spec `volumes:`.
*/ -}}
{{- define "platform.coverageVolumeMount" -}}
{{- if .Values.global.coverage.enabled }}
- mountPath: /coverage
  name: stand-coverage
{{- end }}
{{- end -}}

{{- define "platform.coverageVolume" -}}
{{- if .Values.global.coverage.enabled }}
- name: stand-coverage
  persistentVolumeClaim:
    claimName: stand-coverage
{{- end }}
{{- end -}}

{{/*
mkcert CA volume mount; inject right after a container `volumeMounts:` line with nindent.
*/}}
{{- define "platform.caVolumeMount" -}}
{{- if .Values.global.tls.caSecretName }}
- mountPath: /etc/ssl/platform-ca
  name: platform-ca
  readOnly: true
{{- end }}
{{- end -}}

{{/*
mkcert CA volume; inject right after a pod spec `volumes:` line with nindent.
*/}}
{{- define "platform.caVolume" -}}
{{- if .Values.global.tls.caSecretName }}
- name: platform-ca
  secret:
    secretName: {{ .Values.global.tls.caSecretName }}
    defaultMode: 0644
{{- end }}
{{- end -}}

{{/*
Resolve platform-base contract. lookup works only at `helm upgrade --install` against a
live cluster; `helm template` gets empty results, so explicit values must be provided.
*/}}
{{- define "platform.baseConfigMap" -}}
{{- $ns := .Values.global.baseNamespace | default .Release.Namespace -}}
{{- $cm := lookup "v1" "ConfigMap" $ns "platform-base" -}}
{{- if $cm }}{{ ($cm.data | default dict) | toYaml }}{{ else }}{{ dict | toYaml }}{{ end -}}
{{- end -}}

{{- define "platform.baseSecret" -}}
{{- $ns := .Values.global.baseNamespace | default .Release.Namespace -}}
{{- $s := lookup "v1" "Secret" $ns "platform-base" -}}
{{- if $s }}{{ ($s.data | default dict) | toYaml }}{{ else }}{{ dict | toYaml }}{{ end -}}
{{- end -}}

{{/*
Per-region workspace databases. config.regions[i].db names a postgres database that
replaces the stand database for that region's transactor/workspace/fulltext instance
(ws/api test stands: region_main/region_europe parity with the compose stands).
The region URL is the resolved stand dbUrl with its database name swapped, so an
explicit secrets.platform.dbUrl is honored the same as the platform-base contract.
Call with (dict "root" . "dbUrl" $dbUrl); returns dbUrl<i> -> connection URL.
*/ -}}
{{- define "platform.regionDbUrls" -}}
{{- $root := .root -}}
{{- $dbUrl := .dbUrl -}}
{{- $urls := dict -}}
{{- range $i, $r := $root.Values.config.regions | default list -}}
{{- if $r.db }}
  {{- $url := regexReplaceAll "(/)[^/?]+([?].*)?$" $dbUrl (printf "${1}%s${2}" $r.db) -}}
  {{- $urls = set $urls (printf "dbUrl%d" $i) $url -}}
{{- end -}}
{{- end -}}
{{- $urls | toYaml -}}
{{- end -}}

{{/*
Region of instance <index> for a multi-region stand: the region id from
config.regions[index], falling back to config.REGION for single-region stands.
*/ -}}
{{- define "platform.instanceRegion" -}}
{{- $root := index . 0 -}}
{{- $i := index . 1 -}}
{{- $region := $root.Values.config.REGION -}}
{{- if $root.Values.config.regions -}}
{{- if lt $i (len $root.Values.config.regions) -}}
{{- $r := index $root.Values.config.regions $i -}}
{{- if hasKey $r "id" }}{{ $region = $r.id }}{{ end -}}
{{- end -}}
{{- end -}}
{{- $region -}}
{{- end -}}

{{/*
Checksum of the shared pod environment (platform-config ConfigMap + platform-secret
Secret, both resolved through the platform-base contract). Put it on the pod template
so a stand picks up a changed dbUrl/queue/URL contract on `helm upgrade` instead of
keeping env frozen from the container start.

Pass the chart root: (include "platform.envChecksum" $root).
*/ -}}
{{- define "platform.envChecksum" -}}
{{- printf "%s|%s" (include (print .Template.BasePath "/platform-configmap.yaml") .) (include (print .Template.BasePath "/platform-secrets.yaml") .) | sha256sum -}}
{{- end -}}

{{/*
platform-secret dbUrl key for instance <index>: dbUrl<i> when the region has its own
database, the stand dbUrl otherwise.
*/ -}}
{{- define "platform.instanceDbKey" -}}
{{- $root := index . 0 -}}
{{- $i := index . 1 -}}
{{- $key := "dbUrl" -}}
{{- if $root.Values.config.regions -}}
{{- if lt $i (len $root.Values.config.regions) -}}
{{- $r := index $root.Values.config.regions $i -}}
{{- if $r.db }}{{ $key = printf "dbUrl%d" $i }}{{ end -}}
{{- end -}}
{{- end -}}
{{- $key -}}
{{- end -}}

{{/*
OTEL exporter env: endpoint and compression from platform-otel-config (optional), headers
from the uptraceDsn secret. Include right after the container `env:` list starts, with nindent 8.
*/ -}}
{{- define "platform.otelEnv" -}}
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  valueFrom:
    configMapKeyRef:
      name: platform-otel-config
      key: OTEL_EXPORTER_OTLP_ENDPOINT
      optional: true
- name: OTEL_EXPORTER_OTLP_COMPRESSION
  valueFrom:
    configMapKeyRef:
      name: platform-otel-config
      key: OTEL_EXPORTER_OTLP_COMPRESSION
      optional: true
- name: OTEL_EXPORTER_OTLP_HEADERS
  valueFrom:
    secretKeyRef:
      name: platform-secret
      key: uptraceDsn
{{- end -}}

{{/*
Tolerations every platform pod carries: die with the node instead of rescheduling it.
Include at pod spec level with nindent 6.
*/ -}}
{{- define "platform.tolerations" -}}
tolerations:
- key: node.kubernetes.io/unreachable
  operator: Exists
  effect: NoExecute
  tolerationSeconds: 10
- key: node.kubernetes.io/not-ready
  operator: Exists
  effect: NoExecute
  tolerationSeconds: 10
{{- end -}}

{{/*
Container resources from services.<key>: requests.memory = memRequired, limits.memory = memLimits.
Include in the container with nindent 8.
*/ -}}
{{- define "platform.resources" -}}
{{- $cfg := index .root.Values.services .service -}}
resources:
  requests:
    memory: '{{ $cfg.memRequired }}M'
  limits:
    memory: '{{ $cfg.memLimits }}M'
{{- end -}}
