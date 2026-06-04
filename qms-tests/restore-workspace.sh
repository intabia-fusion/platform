#!/usr/bin/env bash

# Restore the QMS workspace contents from backup to a clean baseline.

set -e

./tool.sh backup-restore ./sanity-ws-qms sanity-ws-qms --upgrade

./tool.sh assign-workspace user1 sanity-ws-qms
./tool.sh assign-workspace user2 sanity-ws-qms
./tool.sh assign-workspace user3 sanity-ws-qms
./tool.sh assign-workspace user4 sanity-ws-qms
./tool.sh assign-workspace user_qara sanity-ws-qms

./tool.sh set-user-role user2 sanity-ws-qms OWNER

./tool.sh configure sanity-ws-qms --enable=*
./tool.sh configure sanity-ws-qms --list

# Reset QMS employee active so default-space owner fill runs on first open.
./tool.sh change-field sanity-ws-qms --objectId 65a04887e1043543cd5f21a5 --objectClass contact:class:Person --attribute contact:mixin:Employee.active --value false --type boolean
