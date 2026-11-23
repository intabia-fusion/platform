#!/usr/bin/env bash

# Standalone QMS test stand. Brings up its own docker stack under the `sanity` compose project - the
# same one as tests/, since both use the same ports - so it replaces a running tests/ stand, and
# tests/prepare-pg.sh replaces it back. Seeds the QMS workspaces. Driven from dev/test-base (node).

set -e

../dev/test-base/run.sh qms
