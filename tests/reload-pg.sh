#!/usr/bin/env bash

# Recreates the sanity stand containers on freshly built images and keeps all data: postgres, minio,
# redpanda and elastic keep running with their volumes. Run after `pnpm docker:build`.
#
#   ./reload-pg.sh                # every service built from our images
#   ./reload-pg.sh front account  # only these services
#   DRY_RUN=true ./reload-pg.sh   # show what would be recreated
#
# Overlays the stand was started with (prepare-pg.sh --profile/--asr) go in STAND_EXTRA_COMPOSE.

set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml"
if [ -f "docker-compose.override.versions.yml" ]; then
    COMPOSE_FILES="${COMPOSE_FILES} -f docker-compose.override.versions.yml"
fi
for f in ${STAND_EXTRA_COMPOSE//,/ }; do
    COMPOSE_FILES="${COMPOSE_FILES} -f ${f}"
done

# nginx resolves upstream addresses once at start, so it is recreated with any service, and with it
# the services living in its network namespace (network_mode: service:nginx).
SERVICES=$(docker compose ${COMPOSE_FILES} -p sanity config --format json |
    node -e '
const services = JSON.parse(require("fs").readFileSync(0, "utf8")).services
const [ns, tag, ...requested] = process.argv.slice(1)
const ours = (image = "") => image.includes(ns + "/") && image.endsWith(":" + tag)
const names = requested.length > 0 ? requested : Object.keys(services).filter((name) => ours(services[name].image))
const inNginx = Object.keys(services).filter((name) => services[name].network_mode === "service:nginx")
console.log([...new Set([...names, "nginx", ...inNginx])].join(" "))
' "${DOCKER_NAMESPACE:-intabiafusion}" "${DOCKER_TAG:-latest}" "$@")
echo "Recreating: ${SERVICES}"

DRY=
if [ "x$DRY_RUN" == 'xtrue' ]; then
    DRY=--dry-run
fi

# --no-deps leaves postgres, minio, redpanda and elastic alone; without -V anonymous volumes are reused.
docker compose ${DRY} ${COMPOSE_FILES} -p sanity up -d --force-recreate --no-deps ${SERVICES}
