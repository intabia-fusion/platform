# Performance tests in ws-tests

## REST find avg

`ws-tests/api-tests/src/__tests__/rest.test.ts:checkFindPerformance`
measures average `findAll(Space)` latency over 450 attempts.

Thresholds:
- Local dev: `avg < 15ms`
- CI (`process.env.CI === 'true'`): `avg < 30ms` (GitHub runners are
  significantly slower under noisy neighbors)

Always warm up JIT/connection caches with ~20 untimed calls before
measurement; otherwise first iterations dominate the average.
