#!/usr/bin/env bash
# Compatibility wrapper for the unit test command.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
exec pnpm test "$@"
