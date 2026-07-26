./common/scripts/node_modules/.bin/compile-all . --parallel 4 --docker-build \
--to @hcengineering/love \
--to @hcengineering/ai-bot \
--to @hcengineering/pod-ai-bot \
--to @hcengineering/pod-love \
--to @hcengineering/pod-billing \
--to @hcengineering/love-agent || true
