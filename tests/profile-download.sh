#!/usr/bin/env bash
ENDPOINT="${TRANSACTOR_ENDPOINT:-http://localhost:8083/_tr0}"
echo "Downloading profile from $ENDPOINT"
current=$(date +%Y%m%d%H%M%S)
./tool.sh profile "$ENDPOINT" stop -o "./profiles/profile-${current}".cpuprofile
