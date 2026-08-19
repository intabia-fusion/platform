#!/bin/bash

set -euo pipefail

rush update
rush fast-build:validate
rush fast-build:format
rush fast-build:docker
./prepare-pg.sh
pushd sanity
rushx uitest --workers 5
