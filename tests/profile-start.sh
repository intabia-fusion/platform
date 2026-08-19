#!/usr/bin/env bash
# tests stand exposes the transactor through nginx only - 3334 is container-internal.
ENDPOINT="${TRANSACTOR_ENDPOINT:-http://localhost:8083/_tr0}"
echo "Start profiling on $ENDPOINT"
./tool.sh profile "$ENDPOINT" start
