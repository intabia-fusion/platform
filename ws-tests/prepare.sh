#!/usr/bin/env bash

# Brings up the ws-tests stand: docker, migrations, accounts and workspaces are all driven from
# dev/test-base (node).

set -e

../dev/test-base/run.sh "${STAND:-ws}"

if [ "x$DO_CLEAN" == 'xtrue' ]; then
    echo 'Do docker Clean'
    docker system prune -a -f
fi

# Restore a full dataset on the running stand instead of retaining its fresh seed.
if [[ " $* " == *" restore_bench "* ]] || [ "${RESTORE_BENCH:-}" = "1" ] || [ -n "${BENCH_DUMP:-}" ]; then
    BENCH_BACKUPS="${BENCH_BACKUPS:-$HOME/Develop/private/bench-backups}"
    STAND=ws-tests ../dev/stand-snapshot.sh restore "${BENCH_DUMP:-$BENCH_BACKUPS}"
fi

INDEXES_YAML="${INDEXES_YAML:-../../deployment/deployments/indexes.yaml}"
if [ -f "$INDEXES_YAML" ]; then
    ./tool-europe.sh apply-indexes "$INDEXES_YAML" --apply
    ./tool.sh apply-indexes "$INDEXES_YAML" --apply
fi

rm -rf ./sanity/.auth
