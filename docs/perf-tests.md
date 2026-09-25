# Performance tests in ws-tests

## REST find avg

`api-tests/api/src/__tests__/rest.test.ts:checkFindPerformance` measures average `findAll(core.class.Space, {}, { limit: 1 })` latency over 200 attempts per round.

Thresholds (`maxAvgMs`): local dev `< 10ms`, CI (`process.env.CI === 'true'`) `< 20ms`, best of up to 3 rounds (CI only, stops early once a round beats the threshold) - GitHub runners are noisier under shared load.

`limit: 1` is deliberate: other test suites keep adding spaces to the shared workspace, so an unbounded `findAll` would measure accumulated payload size instead of round-trip latency.

Always warm up JIT/connection caches with 20 untimed calls before measurement; otherwise first iterations dominate the average.

## Связанные документы

- [architecture.md](architecture.md) - серверный путь запроса и адаптер Postgres, которые этот тест нагружает.
