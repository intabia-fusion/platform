#!/usr/bin/env bash

# Restore workspace contents in mongo/elastic
./tool-pg.sh backup-restore ./sanity-ws sanity-ws --upgrade
./tool-pg.sh backup-restore ./meetings-ws meetings-ws --upgrade

# ./tool-pg.sh upgrade-workspace sanity-ws

# Re-assign user to workspace.
./tool-pg.sh assign-workspace user1 sanity-ws
./tool-pg.sh assign-workspace user2 sanity-ws
./tool-pg.sh assign-workspace user3 sanity-ws

./tool-pg.sh assign-workspace user1 meetings-ws
./tool-pg.sh assign-workspace user2 meetings-ws
./tool-pg.sh assign-workspace user3 meetings-ws


./tool-pg.sh set-user-role user1 sanity-ws OWNER
./tool-pg.sh set-user-role user2 sanity-ws OWNER

./tool-pg.sh set-user-role user1 meetings-ws OWNER

./tool-pg.sh configure sanity-ws --enable=*
./tool-pg.sh configure sanity-ws --list

./tool-pg.sh configure meetings-ws --enable=*
./tool-pg.sh configure meetings-ws --list

# Max plan, all limits 0 = unlimited
./tool-pg.sh set-workspace-plan sanity-ws business
./tool-pg.sh set-workspace-plan meetings-ws business

# setup issue createdOn for yesterday
./tool-pg.sh change-field sanity-ws --objectId 65e47f1f1b875b51e3b4b983 --objectClass tracker:class:Issue --attribute createdOn --value $(($(date +%s)*1000 - 86400000)) --type number
