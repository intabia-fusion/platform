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

# limits-ws: restricted plan for plan-limits UI tests (projects/drives/teamspaces=1).
# usersLimit left unlimited for now: the seatless-banner UI test is fixme until onboarding
# runs server-side (a seatless member currently cannot finish first-login onboarding).
./tool-pg.sh assign-workspace user1 limits-ws
./tool-pg.sh set-user-role user1 limits-ws OWNER
./tool-pg.sh set-workspace-plan limits-ws start --projects 1 --drives 1 --teamspaces 1

# limits-disk-ws: 1MB storage cap for honest disk-413 upload test (small so the test is fast).
./tool-pg.sh assign-workspace user1 limits-disk-ws
./tool-pg.sh set-user-role user1 limits-disk-ws OWNER
./tool-pg.sh set-workspace-plan limits-disk-ws start --storage 0.001

# limits-unpaid-ws: starts past_due (payment read-only). The UI test pays via
# adminCreateSubscription(active) and verifies the read-only banner disappears.
./tool-pg.sh assign-workspace user1 limits-unpaid-ws
./tool-pg.sh set-user-role user1 limits-unpaid-ws OWNER
./tool-pg.sh set-workspace-plan limits-unpaid-ws start --status past_due

# limits-switch-ws: owner exercises the real UI subscribe/change-plan buttons via the
# mock provider. The spec sets its own starting plan, so only ownership is provisioned.
./tool-pg.sh assign-workspace user1 limits-switch-ws
./tool-pg.sh set-user-role user1 limits-switch-ws OWNER

# limits-seat-ws: user1 OWNER + user2 USER, plan starts with usersLimit=2 so both can finish
# first-login onboarding. The spec downgrades to usersLimit=1 -> user2 loses the seat (read-only).
./tool-pg.sh assign-workspace user1 limits-seat-ws
./tool-pg.sh set-user-role user1 limits-seat-ws OWNER
./tool-pg.sh assign-workspace user2 limits-seat-ws
./tool-pg.sh set-user-role user2 limits-seat-ws USER
./tool-pg.sh set-workspace-plan limits-seat-ws start --users 2

# setup issue createdOn for yesterday
./tool-pg.sh change-field sanity-ws --objectId 65e47f1f1b875b51e3b4b983 --objectClass tracker:class:Issue --attribute createdOn --value $(($(date +%s)*1000 - 86400000)) --type number
