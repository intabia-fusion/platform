#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#

# Runs the suite N times and prints the stability table over the runs it actually made.
#
#   pnpm run uitest:series            # 10 runs
#   pnpm run uitest:series 5          # 5
#   pnpm run uitest:series 5 tracker/ # 5, Playwright args pass through
#
# To end the series early, from any terminal:
#
#   touch tests/sanity/runs/.stop
#
# The current run finishes and is kept whole; the series stops before the next one. Ctrl-C also
# works but reaches Playwright too, so that run ends up partial (marked STOPPED and left out of
# the stability tally).

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
cd "$ROOT"

COUNT="${1:-10}"
if [[ "$COUNT" =~ ^[0-9]+$ ]]; then shift; else COUNT=10; fi

STOP="runs/.stop"
MARKER="$(mktemp)"
mkdir -p runs
rm -f "$STOP"

done_runs=0
for ((i = 1; i <= COUNT; i++)); do
  if [ -f "$STOP" ]; then
    rm -f "$STOP"
    echo "[series] stop requested, ending after $done_runs of $COUNT runs"
    break
  fi
  echo "[series] run $i/$COUNT"
  : > "$MARKER"
  RUN_DIR_FILE="$MARKER" "$HERE/run.sh" "$@"
  # A non-zero status is the normal way a run with a failing test ends - keep going. A run that
  # never got as far as its own directory did not start (stale bundle, stand down), and neither
  # will the next one.
  if [ ! -s "$MARKER" ]; then
    echo "[series] the run produced nothing, stopping" >&2
    break
  fi
  done_runs=$((done_runs + 1))
done

rm -f "$STOP" "$MARKER"
if [ "$done_runs" -gt 0 ]; then
  node "$HERE/stability.js" "$done_runs"
fi
