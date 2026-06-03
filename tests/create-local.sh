#!/usr/bin/env bash

./tool-local.sh create-account user1 -f John -l Appleseed -p 1234
./tool-local.sh create-account user2 -f Kainin -l Dirak -p 1234

./tool-local.sh create-workspace sanity-ws email:user1
./tool-local.sh create-workspace meetings-ws email:user1
./tool-local.sh create-workspace limits-ws email:user1
./tool-local.sh create-workspace limits-disk-ws email:user1
./tool-local.sh create-workspace limits-unpaid-ws email:user1
./tool-local.sh create-workspace limits-switch-ws email:user1
./tool-local.sh create-workspace limits-seat-ws email:user1

# Restore workspace contents in mongo/elastic
./tool-local.sh backup-restore ./sanity-ws sanity-ws --upgrade
./tool-local.sh backup-restore ./meetings-ws meetings-ws --upgrade

./tool-local.sh assign-workspace user1 sanity-ws
./tool-local.sh assign-workspace user2 sanity-ws

./tool-local.sh assign-workspace user1 meetings-ws
./tool-local.sh assign-workspace user2 meetings-ws

./tool-local.sh set-user-role user1 sanity-ws OWNER
./tool-local.sh set-user-role user2 sanity-ws OWNER

./tool-local.sh set-user-role user1 meetings-ws OWNER

./tool-local.sh configure sanity-ws --enable=*
./tool-local.sh configure sanity-ws --list

./tool-local.sh configure meetings-ws --enable=*
./tool-local.sh configure meetings-ws --list

# Max plan, all limits 0 = unlimited
./tool-local.sh set-workspace-plan sanity-ws business
./tool-local.sh set-workspace-plan meetings-ws business

# limits-ws: restricted plan for plan-limits UI tests
./tool-local.sh assign-workspace user1 limits-ws
./tool-local.sh set-user-role user1 limits-ws OWNER
./tool-local.sh set-workspace-plan limits-ws start --projects 1 --drives 1 --teamspaces 1

# limits-disk-ws: 1MB storage cap for honest disk-413 upload test (small so the test is fast)
./tool-local.sh assign-workspace user1 limits-disk-ws
./tool-local.sh set-user-role user1 limits-disk-ws OWNER
./tool-local.sh set-workspace-plan limits-disk-ws start --storage 0.001

# limits-unpaid-ws: starts past_due (payment read-only); UI test pays and checks banner gone
./tool-local.sh assign-workspace user1 limits-unpaid-ws
./tool-local.sh set-user-role user1 limits-unpaid-ws OWNER
./tool-local.sh set-workspace-plan limits-unpaid-ws start --status past_due

# limits-switch-ws: UI subscribe/change-plan via mock provider; spec sets its own plan
./tool-local.sh assign-workspace user1 limits-switch-ws
./tool-local.sh set-user-role user1 limits-switch-ws OWNER

# limits-seat-ws: user1 OWNER + user2 USER, plan starts with usersLimit=2 so both can finish
# first-login onboarding. The spec downgrades to usersLimit=1 -> user2 loses the seat (read-only).
./tool-local.sh assign-workspace user1 limits-seat-ws
./tool-local.sh set-user-role user1 limits-seat-ws OWNER
./tool-local.sh assign-workspace user2 limits-seat-ws
./tool-local.sh set-user-role user2 limits-seat-ws USER
./tool-local.sh set-workspace-plan limits-seat-ws start --users 2
