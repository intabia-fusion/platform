./common/scripts/node_modules/.bin/compile-all . --parallel 4 --docker-build \
--to @hcengineering/pod-server \
--to @hcengineering/pod-account \
--to @hcengineering/tool || true
