#!/usr/bin/env bash
# Offline render checks for the monitoring chart: ClickStack endpoint contract, collector RBAC
# split and ingestion key wiring. Needs helm and the vendored clickstack chart (charts/*.tgz).
#   deployment/kubernetes/charts/monitoring/tests/test-monitoring-render.sh
set -euo pipefail
chart="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ns=monitoring

[ -f "$chart/charts/clickstack-1.1.1.tgz" ] || {
  echo "missing $chart/charts/clickstack-1.1.1.tgz: run helm dependency build" >&2
  exit 2
}

render() {
  helm template monitoring "$chart" -n "$ns" "$@"
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

count() {
  grep -c -- "$1" "$2" || true
}

# Defaults: endpoint must point at the Service the upstream chart actually renders.
render > "$tmp/default.yaml"
grep -q '^  name: monitoring-otel-collector$' "$tmp/default.yaml" ||
  fail "upstream collector Service is missing"
grep -q 'endpoint: http://monitoring-otel-collector.monitoring.svc.cluster.local:4318$' "$tmp/default.yaml" ||
  fail "default endpoint does not match the upstream Service and default port"
for name in metrics-node metrics-database; do
  grep -q "^  name: monitoring-$name$" "$tmp/default.yaml" ||
    fail "missing ServiceAccount monitoring-$name"
done
grep -q '^  name: monitoring-metrics-node$' "$tmp/default.yaml" || fail "missing node ServiceAccount"
[ "$(count 'serviceAccountName: monitoring-metrics-node' "$tmp/default.yaml")" -eq 1 ] ||
  fail "node DaemonSet does not use its own ServiceAccount"
[ "$(count 'serviceAccountName: monitoring-metrics-database' "$tmp/default.yaml")" -eq 1 ] ||
  fail "database Deployment does not use its own ServiceAccount"
[ "$(count 'serviceAccountName: monitoring-metrics$' "$tmp/default.yaml")" -eq 0 ] ||
  fail "shared metrics ServiceAccount is still used"
grep -q 'nodes/proxy' "$tmp/default.yaml" && fail "nodes/proxy must not be granted"
grep -q 'nodes/log' "$tmp/default.yaml" && fail "nodes/log must not be granted"
grep -q 'nodes/metrics' "$tmp/default.yaml" && fail "nodes/metrics must not be granted"
grep -q 'nodes/spec' "$tmp/default.yaml" && fail "nodes/spec must not be granted"
[ "$(count 'Authorization: "Bearer' "$tmp/default.yaml")" -eq 0 ] ||
  fail "authorization header rendered without a configured Secret"
[ "$(count 'CLICKSTACK_API_KEY' "$tmp/default.yaml")" -eq 0 ] ||
  fail "api key env rendered without a configured Secret"

# Non-default OTLP/HTTP port follows clickstack.otel.httpPort on the same Service.
render --set clickstack.otel.httpPort=4320 > "$tmp/port.yaml"
sed -n '/^  name: monitoring-otel-collector$/,/^---$/p' "$tmp/port.yaml" > "$tmp/otel-service.txt"
grep -B2 '^      name: otlp-http$' "$tmp/otel-service.txt" | grep -q '^    - port: 4320$' ||
  fail "upstream collector Service did not get otlp-http port 4320"
[ "$(count 'endpoint: http://monitoring-otel-collector.monitoring.svc.cluster.local:4320' "$tmp/port.yaml")" -eq 2 ] ||
  fail "both exporters must use clickstack.otel.httpPort"
[ "$(count 'endpoint: http://monitoring-otel-collector.monitoring.svc.cluster.local:4318' "$tmp/port.yaml")" -eq 0 ] ||
  fail "exporter still uses the hardcoded 4318"

# Empty fullnameOverride: endpoint must follow the upstream release-name rule.
render --set clickstack.fullnameOverride= --set fullnameOverride= > "$tmp/nooverride.yaml"
grep -q '^  name: monitoring-clickstack-otel-collector$' "$tmp/nooverride.yaml" ||
  fail "upstream Service name without fullnameOverride is not monitoring-clickstack-otel-collector"
grep -q 'endpoint: http://monitoring-clickstack-otel-collector.monitoring.svc.cluster.local:4318$' "$tmp/nooverride.yaml" ||
  fail "endpoint does not follow the release-name naming rule"
# A release already named clickstack keeps the release name, as upstream does.
helm template clickstack "$chart" -n "$ns" --set clickstack.fullnameOverride= > "$tmp/release-clickstack.yaml"
grep -q '^  name: clickstack-otel-collector$' "$tmp/release-clickstack.yaml" ||
  fail "release named clickstack did not keep the release name in the Service"
grep -q 'endpoint: http://clickstack-otel-collector.monitoring.svc.cluster.local:4318$' "$tmp/release-clickstack.yaml" ||
  fail "endpoint does not follow the release-named-clickstack rule"

# kube-state-metrics: no scrape target and no Service when the component is off.
render --set resourceMetrics.kubeStateMetrics.enabled=false > "$tmp/noksm.yaml"
grep -q 'job_name: kube-state-metrics' "$tmp/noksm.yaml" && fail "kube-state-metrics scrape job rendered while disabled"
grep -q '^  name: monitoring-kube-state-metrics$' "$tmp/noksm.yaml" && fail "kube-state-metrics objects rendered while disabled"

# Receiver off: no exporting workload may reference the absent Service.
render --set clickstack.enabled=false > "$tmp/nocs.yaml"
grep -q 'monitoring-metrics-node\|monitoring-metrics-database\|monitoring-kube-state-metrics' "$tmp/nocs.yaml" &&
  fail "resource collectors rendered with clickstack.enabled=false"
grep -q 'otel-collector' "$tmp/nocs.yaml" && fail "reference to an absent ClickStack collector"
render --set clickstack.otel.enabled=false > "$tmp/no-otel.yaml"
grep -q 'monitoring-metrics-node\|monitoring-metrics-database\|monitoring-kube-state-metrics' "$tmp/no-otel.yaml" &&
  fail "resource collectors rendered with clickstack.otel.enabled=false"

# Ingestion key: both collectors read one Secret key; the key itself stays out of ConfigMaps.
render --set resourceMetrics.clickstack.apiKeySecret=monitoring-app-secrets > "$tmp/auth.yaml"
for tpl in metrics-node metrics-database; do
  sed -n "/^# Source: monitoring\/templates\/$tpl.yaml$/,/^---$/p" "$tmp/auth.yaml" > "$tmp/$tpl.txt"
  awk -v src="# Source: monitoring/templates/$tpl.yaml" '
    $0 == src {doc = 1; cm = 0; next}
    doc && /^kind: ConfigMap$/ {cm = 1; next}
    doc && cm && /^---$/ {exit}
    doc && cm {print}
  ' "$tmp/auth.yaml" > "$tmp/$tpl-cm.txt"
  [ "$(count 'Authorization: \"Bearer ${env:CLICKSTACK_API_KEY}\"' "$tmp/$tpl-cm.txt")" -eq 1 ] ||
    fail "$tpl exporter does not send the authorization header"
  [ "$(count '- name: CLICKSTACK_API_KEY' "$tmp/$tpl.txt")" -eq 1 ] ||
    fail "$tpl workload does not take the key from a Secret"
  [ "$(count 'name: monitoring-app-secrets' "$tmp/$tpl.txt")" -eq 1 ] ||
    fail "$tpl workload does not reference the configured Secret"
  [ "$(count 'key: api-key' "$tmp/$tpl.txt")" -eq 1 ] ||
    fail "$tpl workload does not use the configured key name"
  grep -q 'monitoring-app-secrets\|key: api-key\|api-key: ' "$tmp/$tpl-cm.txt" &&
    fail "$tpl ConfigMap leaked the Secret name or key"
done

echo 'monitoring render checks passed'
