{{- /*
Component address helpers: resolve the effective host/port/etc per mode and fail
loudly when an external mode is missing its values.
*/ -}}

{{- define "platformBase.postgresHost" -}}
{{- if eq .Values.postgres.mode "external" -}}
  {{- if not .Values.postgres.external.host }}{{ fail "postgres.mode=external: set postgres.external.host" }}{{ end -}}
  {{- .Values.postgres.external.host -}}
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
{{- if eq .Values.kafka.mode "external" -}}
  {{- if not .Values.kafka.external.bootstrap }}{{ fail "kafka.mode=external: set kafka.external.bootstrap" }}{{ end -}}
  {{- .Values.kafka.external.bootstrap -}}
{{- else -}}
  {{- printf "my-cluster-kafka-bootstrap.%s.svc.cluster.local:9092" .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.s3Endpoint" -}}
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
{{- if eq .Values.elastic.mode "external" -}}
  {{- if not .Values.elastic.external.url }}{{ fail "elastic.mode=external: set elastic.external.url" }}{{ end -}}
  {{- .Values.elastic.external.url -}}
{{- else -}}
  {{- printf "http://elastic.%s.svc.cluster.local:9200" .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{- define "platformBase.redisHost" -}}
{{- if eq .Values.redis.mode "external" -}}
  {{- if not .Values.redis.external.host }}{{ fail "redis.mode=external: set redis.external.host" }}{{ end -}}
  {{- .Values.redis.external.host -}}
{{- else -}}
  {{- printf "redis.%s.svc.cluster.local" .Release.Namespace -}}
{{- end -}}
{{- end -}}
