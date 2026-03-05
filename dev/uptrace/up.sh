#!/bin/bash
docker compose -p uptrace -f ./docker-compose.yaml up -d --force-recreate
