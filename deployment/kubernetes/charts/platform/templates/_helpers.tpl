{{- define "platform.containerImage" -}}
  {{- $svcImage := (index .root.Values.services .service "image") | default "" -}}
  {{- $image := .image | default .service -}}
  {{- if ne $svcImage "" }}{{ $svcImage }}{{- else }}{{- with .root.Values.global.imageRegistry }}{{ . }}/{{ end }}intabiafusion/{{ $image }}:{{ .root.Values.global.version }}{{- end }}
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
{{- range $e := (index $root.Values.services $svc "extraEnv") | default list }}
- name: {{ $e.name }}
  value: {{ $e.value | quote }}
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
