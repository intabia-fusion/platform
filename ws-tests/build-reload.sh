#!/usr/bin/env bash

# Restore workspace contents in postgres/elastic
rush build
rush bundle
rush docker:build

# Re-assign user to workspace.
docker compose -p sanity up $1 -d --force-recreate
