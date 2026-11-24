#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Times one phase of a stand run and appends it to a TSV, so clean compose and k3d runs are
# comparable line by line.
#
#   stand-bench.sh compose-cold images -- pnpm docker
#   stand-bench.sh compose-cold stand  -- bash tests/prepare-pg.sh
#
# Output: $STAND_BENCH_OUT (default /tmp/fusion-stand-bench.tsv), columns
# timestamp, run, phase, seconds, status.
set -euo pipefail
RUN="${1:?usage: stand-bench.sh <run> <phase> -- <command...>}"
PHASE="${2:?usage: stand-bench.sh <run> <phase> -- <command...>}"
shift 2
[ "${1:-}" = -- ] && shift
[ $# -gt 0 ] || { echo "usage: stand-bench.sh <run> <phase> -- <command...>" >&2; exit 2; }
OUT="${STAND_BENCH_OUT:-/tmp/fusion-stand-bench.tsv}"
START=$(date +%s)
set +e
"$@"
RC=$?
set -e
DUR=$(( $(date +%s) - START ))
STATE=ok
[ "$RC" -eq 0 ] || STATE="exit$RC"
[ -f "$OUT" ] || printf 'timestamp\trun\tphase\tseconds\tstatus\n' > "$OUT"
printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$RUN" "$PHASE" "$DUR" "$STATE" >> "$OUT"
printf 'bench: %s %s %ss %s\n' "$RUN" "$PHASE" "$DUR" "$STATE"
exit "$RC"
