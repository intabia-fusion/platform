#!/bin/bash
# Builds the workspace, then runs every test group except the Playwright suites:
#
#   pnpm integration [jest args]   *.itest.ts - each suite starts its own containers
#   pnpm api-test [jest args]      images, then api-tests and backup-tests on their stand;
#                                  jest args narrow the api-tests and skip the backup-tests
#   pnpm fulltest                  unit, integration, api-tests and backup-tests
#
# A failing group does not stop the next one; the exit code says whether any failed.
set -eo pipefail

what=$1
shift
cd "$(dirname "$0")/../.."
root=$(pwd)

pnpm build

status=0
if [ "$what" = full ]; then
  pnpm test || status=$?
fi
if [ "$what" = integration ] || [ "$what" = full ]; then
  node ./foundations/utils/packages/platform-rig/bin/test-group.js integration "$@" || status=$?
fi
if [ "$what" = api ] || [ "$what" = full ]; then
  ./common/scripts/docker-api.sh
  # The api-tests leave the stand up for the backup-tests, which take it down (API_STAND=keep to
  # keep it for another run, external to use one that is already there).
  api_stand=${API_STAND:-}
  [ $# -eq 0 ] && [ "$api_stand" != external ] && api_stand=keep
  cd "$root/api-tests/api"
  API_STAND=$api_stand pnpm run api-test "$@" || status=$?
  if [ $# -eq 0 ]; then
    cd "$root/api-tests/backup"
    API_STAND=${API_STAND:-stop} pnpm run backup-test || status=$?
  fi
fi
exit $status
