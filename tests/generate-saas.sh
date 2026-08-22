#!/usr/bin/env bash
# SaaS emulation: N tenant workspaces created PROPERLY via account -> workspace
# service (create-account / create-workspace, synchronous provisioning), then each
# filled with a realistic mixed dataset via generate-big:
#   projects + tasks(+nesting) + comments + attribute-updates
#   + channels + messages + threads + meetings + transcripts, own users.
#
# Long-tailed sizes (SaaS shape: many small tenants, few large).
# Idempotent/resumable: re-running tops up (create-* on existing = no-op,
# generate-big resumes toward its per-scale target).
#
#   N=50 ./generate-saas.sh                 # 50 tenants, default long tail
#   N=10 SMALL=1 MED=5 LARGE=20 ./generate-saas.sh
#   PREFIX=saas GEN_PAR=2 ./generate-saas.sh
set -uo pipefail
cd "$(dirname "$0")"

N=${N:-50}                 # tenant workspaces
PREFIX=${PREFIX:-saas}
CREATE_PAR=${CREATE_PAR:-6} # parallel workspace creation
GEN_PAR=${GEN_PAR:-2}      # parallel generate-big processes (heavy: keep low)
SMALL=${SMALL:-1}          # generate-big --scale for small tenants
MED=${MED:-4}              # ... medium
LARGE=${LARGE:-15}         # ... large
USERS=${USERS:-15}
# Meetings/channels are per-tenant CAPS (override --scale): the scaled meeting default
# (2000*scale) dominates runtime and is unrealistic per tenant. Keep them modest so the
# dataset stays rich in tasks/comments/chats without the meeting-transcript blowup.
MEETINGS=${MEETINGS:-150}
CHANNELS=${CHANNELS:-15}
LOG=${LOG:-/tmp/generate-saas.log}
: > "$LOG"

# scale for tenant i: long tail -> every 20th large, next 4 medium, rest small
scale_for() { local i=$1; local r=$(( i % 20 ));
  if [ "$r" -eq 0 ]; then echo "$LARGE"; elif [ "$r" -lt 5 ]; then echo "$MED"; else echo "$SMALL"; fi; }

# SKIP_CREATE=1 on a resume: workspaces already exist; re-running create-workspace on an
# existing name mints a duplicate (url is unique -> uniquified suffix), so skip the phase.
if [ "${SKIP_CREATE:-0}" != "1" ]; then
echo "=== 1/3 create $N tenants ($PREFIX ws) via account -> workspace service ==="
create_one() {
  local i=$1
  ./tool-pg.sh create-account "${PREFIX}${i}" -f Tenant -l "U${i}" -p 1234 >/dev/null 2>&1 || true
  ./tool-pg.sh create-workspace "${PREFIX}ws${i}" "email:${PREFIX}${i}" >/dev/null 2>&1 || true
  echo "  provisioned ${PREFIX}ws${i}"
}
export -f create_one; export PREFIX
seq 1 "$N" | xargs -P "$CREATE_PAR" -I{} bash -c 'create_one "$@"' _ {}
else
echo "=== 1/3 SKIP_CREATE=1: reuse existing $PREFIX tenants ==="
fi

echo "=== 2/3 fill each tenant with generate-big (GEN_PAR=$GEN_PAR) ==="
fill_one() {
  local i=$1; local scale; scale=$(scale_for "$i")
  echo "[saas] ${PREFIX}ws${i} scale=$scale start $(date +%H:%M:%S)" | tee -a "$LOG"
  ./tool-pg.sh generate-big "${PREFIX}ws${i}" --scale "$scale" --meetings "$MEETINGS" --channels "$CHANNELS" --users "$USERS" --batch 200 \
    >> "$LOG" 2>&1 && echo "[saas] ${PREFIX}ws${i} done" | tee -a "$LOG" \
    || echo "[saas] ${PREFIX}ws${i} FAILED (see $LOG)" | tee -a "$LOG"
}
export -f fill_one scale_for; export PREFIX LOG SMALL MED LARGE USERS MEETINGS CHANNELS
if [ "${NO_FILL:-0}" != "1" ]; then
  seq 1 "$N" | xargs -P "$GEN_PAR" -I{} bash -c 'fill_one "$@"' _ {}
else
  echo "=== 2/3 NO_FILL=1: empty tenants (connect/reconnect storms) ==="
fi

echo "=== 3/3 done. Snapshot with: ../dev/stand-snapshot.sh dump ~/Develop/private/bench-backups saas-${N}tenants ==="
