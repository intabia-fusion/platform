# msgpackr packing arena (FUSIO-1344)

`RPCHandler` (`foundations/core/packages/rpc/src/rpc.ts`) is the only msgpackr user in the codebase.

- `target` is **module-scoped** (`pack.js:12`), shared by every `Packr`. A new instance does not get
  a fresh buffer; only `useBuffer` replaces it.
- Released only past 1Gb (`pack.js:209`) — sized for a process without a cgroup limit. One oversized
  response parked 45.7Mb for the life of a 512Mb pod.
- Growth is coarse: `makeRoom` uses `(end - start) << 2` below 16Mb, so 8Mb -> 32Mb -> 64Mb. A
  threshold of 32Mb would miss a 21.9Mb message, which is served from exactly 32Mb.
- Replacement buffer must be a node `Buffer`: strings go through `target.utf8Write` (`pack.js:30`),
  absent on `Uint8Array`. Short strings take another path, so small-payload tests miss this.

Current: 8Mb arena at construction, replaced when it grows past 16Mb. Packed model = 1.31Mb.

Bench: `BENCH=1 pnpm exec jest src/test/packrBuffer.bench.test.ts` in that package.
