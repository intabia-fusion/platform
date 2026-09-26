#!/bin/bash
# Builds the workspace, then runs every test group except the Playwright suites:
#
#   pnpm integration [jest args]   *.itest.ts - each suite starts its own containers
#   pnpm api-test [jest args]      images, then api-tests and backup-tests on their stand;
#                                  jest args narrow the api-tests and skip the backup-tests
#   pnpm fulltest                  unit, integration, api-tests and backup-tests
#
# A failing group does not stop the next one. The run ends with a summary per group and the failed
# api/backup tests; their full jest reports are in api-tests/logs/*.json.
set -eo pipefail

what=$1
shift
cd "$(dirname "$0")/../.."
root=$(pwd)

pnpm build

status=0
summary=()
group () {
  local name=$1
  shift
  if "$@"; then
    summary+=("  ok      $name")
  else
    status=1
    summary+=("  FAILED  $name")
  fi
}

if [ "$what" = full ]; then
  group unit pnpm test
fi
if [ "$what" = integration ] || [ "$what" = full ]; then
  group integration node ./foundations/utils/packages/platform-rig/bin/test-group.js integration "$@"
fi
reports=()
if [ "$what" = api ] || [ "$what" = full ]; then
  ./common/scripts/docker-api.sh
  logs="$root/api-tests/logs"
  mkdir -p "$logs"
  rm -f "$logs/api-tests.json" "$logs/backup-tests.json"
  # The api-tests leave the stand up for the backup-tests, which take it down (API_STAND=keep to
  # keep it for another run, external to use one that is already there).
  api_stand=${API_STAND:-}
  [ $# -eq 0 ] && [ "$api_stand" != external ] && api_stand=keep
  cd "$root/api-tests/api"
  reports+=("$logs/api-tests.json")
  group api-tests env API_STAND="$api_stand" pnpm run api-test "$@" --json --outputFile="$logs/api-tests.json"
  if [ $# -eq 0 ]; then
    cd "$root/api-tests/backup"
    reports+=("$logs/backup-tests.json")
    group backup-tests env API_STAND="${API_STAND:-stop}" pnpm run backup-test --json --outputFile="$logs/backup-tests.json"
  fi
  cd "$root"
fi

echo
echo "=== Test summary ==="
printf '%s\n' "${summary[@]}"
if [ ${#reports[@]} -gt 0 ]; then
  node ./common/scripts/jest-failures.js "${reports[@]}"
fi
exit $status
