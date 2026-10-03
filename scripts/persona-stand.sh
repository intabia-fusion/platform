#!/usr/bin/env bash

# Brings up the persona UX stand on http://localhost:8084 (mailpit on :8025): the sanity stack
# reshaped to the production chart (tests/docker-compose.persona.yaml). Only these two ports are
# published, so it runs beside the sanity stand. No accounts or workspaces are seeded - each
# persona signs up itself with the code from mailpit.
#
#   ./scripts/persona-stand.sh
#
# Platform images come from the last `pnpm docker:build`. Landing, docs, legal, plan-config and the
# landing routes come from the prod chart: CHART=<path to charts/fusion>, by default the
# fusion-deployment checkout next to this one.

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/tests"

CHART="$(cd "${CHART:-$ROOT/../fusion-deployment/charts/fusion}" 2>/dev/null && pwd)" || {
    echo "Нет chart: ${CHART:-$ROOT/../fusion-deployment/charts/fusion}. Укажите путь в CHART=" >&2
    exit 1
}
VALUES="$CHART/values.yaml"

# Image of a top-level entry under `services:` in values.yaml.
chart_image () {
    awk -v name="  $1:" '$0 == name { found = 1; next } found && /^  [^ ]/ { exit } found && $1 == "image:" { print $2; exit }' "$VALUES"
}

export PERSONA_CHART="$CHART"
export LANDING_IMAGE="$(chart_image landing)"
export DOCS_IMAGE="$(chart_image documentation)"
export LEGAL_IMAGE="$(chart_image legal)"
echo "Из chart: $LANDING_IMAGE, $DOCS_IMAGE, $LEGAL_IMAGE"

# Same routing as the chart's ingress: landing paths, robots/sitemap, /docs and /legal. The docs and
# legal containers redirect to /path/ on their own port 80, so the redirects are made relative.
mkdir -p .persona
{
    awk '
        $0 == "  landing:" { found = 1; next }
        found && /^  [^ ]/ { exit }
        found && $1 == "exactPaths:" { kind = "="; next }
        found && $1 == "pathPrefixes:" { kind = "^~"; next }
        found && $1 ~ /:$/ { kind = "" }
        found && kind != "" && $1 == "-" { print kind, $2 }
    ' "$VALUES"
    printf '%s\n' '= /robots.txt' '^~ /sitemap'
} | while read -r kind path; do
    echo "location $kind $path { proxy_pass http://landing:80; proxy_set_header Host \$host; }"
done >.persona/nginx-landing.conf
cat >>.persona/nginx-landing.conf <<'NGINX'
# Host port 8084 differs from the listen port, so nginx must not absolutize relative redirects.
absolute_redirect off;
location ^~ /docs { proxy_pass http://documentation:80; proxy_set_header Host $host; proxy_redirect ~^https?://[^/]+(/.*)$ $1; }
location /_analytics/ { proxy_pass http://analytics:4018/; }
location ^~ /legal { proxy_pass http://legal:80; proxy_set_header Host $host; proxy_redirect ~^https?://[^/]+(/.*)$ $1; }
NGINX

../dev/test-base/run.sh persona

# Meetings need LiveKit on the host; it is the sanity stand's instance, shared.
mkdir -p .livekit
if lsof -tiTCP:7890 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "LiveKit уже слушает порт 7890"
elif command -v livekit-server >/dev/null 2>&1; then
    nohup ./run_livekit_test.sh >.livekit/livekit.log 2>&1 &
    echo $! >.livekit/livekit.pid
    echo "LiveKit запущен, pid=$(cat .livekit/livekit.pid), лог tests/.livekit/livekit.log"
else
    echo "ВНИМАНИЕ: livekit-server не установлен, встречи работать не будут"
fi

echo
echo "Стенд для тестирования персонами готов: http://localhost:8084 (лендинг), http://localhost:8084/login (платформа)"
echo "Почта (коды входа): http://localhost:8025"
echo "Сборка: $(curl -s http://localhost:8084/config.json | grep -o '"BUILD_ID":"[^"]*"' || echo 'не удалось прочитать config.json')"
echo "Остановить: docker compose -p persona down"
