/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { performance } = require('perf_hooks')
const { join } = require('path')

const { isPhaseCached, markPhaseCompleted } = require('../libs/cache')
const { getNamedWorkerPool } = require('../libs/workers')
const { success, error, dim } = require('../libs/colors')

/**
 * Run format phase for all packages.
 * Hash is per-package only (no deps) — formatting is local to the package.
 */
async function runFormatPhase(graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHashes } = options

  const results = {
    successCount: 0,
    cacheHits: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  const startTime = performance.now()
  const pool = await getNamedWorkerPool('format', concurrency, join(__dirname, '..', 'format-worker.js'))

  let completedCount = 0

  const promises = packageNames.map(async (name) => {
    const node = graph.get(name)

    if (!node.phaseFormat) {
      completedCount++
      results.successCount++
      results.cacheHits++
      return
    }

    const cwd = node.project.fullPath
    const hash = packageHashes ? packageHashes.get(name) : undefined

    if (!force && hash && isPhaseCached(cwd, hash, 'format', null, [])) {
      completedCount++
      results.successCount++
      results.cacheHits++
      console.log(`    [F] ${completedCount}/${packageNames.length} ${dim(name)} ${dim('(cached)')}`)
      return
    }

    const result = await pool.runTask('format', cwd, { srcDir: 'src' })
    completedCount++

    if (result.success) {
      if (hash) {
        markPhaseCompleted(cwd, hash, 'format', null, [])
      }
      results.successCount++
      const changedInfo = result.changed !== undefined ? ` (${result.changed} changed)` : ''
      console.log(`    [F] ${completedCount}/${packageNames.length} ${success(name)} formatted${changedInfo}`)
    } else {
      results.errors.push({ package: name, error: result.error })
      console.error(`    [F] ${completedCount}/${packageNames.length} ${error(name)} FAILED`)
      if (result.lintOutput) process.stderr.write(result.lintOutput + '\n')
      if (result.errors && result.errors.length > 0) {
        process.stderr.write(result.errors.join('\n') + '\n')
      }
    }
  })

  await Promise.all(promises)
  results.time = performance.now() - startTime

  return results
}

module.exports = { runFormatPhase }
