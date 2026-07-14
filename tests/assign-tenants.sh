#!/usr/bin/env bash
# Assign each tenant user co{i} to its workspace cows{i} (owner membership).
# create-workspace makes the workspace but doesn't add the owner to
# workspace_members, so login is Forbidden until this runs. Parallelised.
#
#   N=1000 PAR=10 ./assign-tenants.sh
set -uo pipefail
cd "$(dirname "$0")"
N=${N:-1000}
PAR=${PAR:-10}
PREFIX=${PREFIX:-co}

assign_one() { ./tool-pg.sh assign-workspace "${PREFIX}$1" "${PREFIX}ws$1" >/dev/null 2>&1 && echo "ok $1"; }
export -f assign_one
export PREFIX

start=$(date +%s)
seq 1 "$N" | xargs -P "$PAR" -I{} bash -c 'assign_one "$@"' _ {} | wc -l
echo "assigned ~$N in $(( $(date +%s) - start ))s"
