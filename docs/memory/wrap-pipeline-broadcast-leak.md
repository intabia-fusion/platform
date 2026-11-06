# wrapPipeline O(n²): broadcast.txes never drained (FUSIO-776 bench finding)

## Symptom
`generate-big` (tool, pipeline-backed TxOperations) degrade: 35/s → 10/s → 3/s as doc count grow.
Fresh process, SAME data, fast again → per-process accumulation, not DB.
Node ~95% CPU, postgres ~15%. DB point-lookups fine (0.06ms explain).

## Root cause
`wrapPipeline` (foundations/server/packages/core/src/utils.ts) make ONE `SessionDataImpl` for whole client lifetime with `broadcast: { txes: [], queue: [], ... }`.
With `doBroadcast=false` (default; generator, backup-restore, upgrade flows) nothing drain `contextData.broadcast.txes` — every derived tx of whole run pile up.
Permissions middleware `tx()` do `for (txd of ctx.contextData.broadcast.txes) processPermissionsUpdatesFromTx(...)` after EVERY tx → O(n²). CPU profile: ~40%+ in processPermissionsUpdatesFromTx/isExtendsCUD/isDerived.
Real transactor make SessionData per client request, so prod unaffected.

## Fix
In `wrapPipeline.tx`: after `pipeline.tx` (+ optional `handleBroadcast`), truncate `contextData.broadcast.txes.length = 0` and `.queue.length = 0`.

## How found
`node --cpu-prof` via `TOOL_OPTIONS="--cpu-prof --cpu-prof-dir=..." ./tool-europe.sh generate-big ...` (tool.sh pass TOOL_OPTIONS to node), then aggregate .cpuprofile self-time by callFrame.
Idempotent top-up in generate-big make short profiling re-run cheap.

## Related
Same accumulation hit anything long-running on wrapPipeline: backup-restore --upgrade, workspace upgrade, fulltext reindex tools — worth check their large-workspace slowness.