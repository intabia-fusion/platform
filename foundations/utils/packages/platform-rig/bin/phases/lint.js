/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { performance } = require('perf_hooks')
const { join } = require('path')
const crypto = require('crypto')

const { isPhaseCached, markPhaseCompleted } = require('../libs/cache')
const { getNamedWorkerPool } = require('../libs/workers')
const { success, error, dim } = require('../libs/colors')

/**
 * Calculate composite hash for a package including all transitive dependencies.
 * Copied from compile_all.js to avoid circular import.
 */
function calculatePackageHashWithDeps(packageName, graph, packageHashes, processed = new Set()) {
  if (processed.has(packageName)) return ''
  processed.add(packageName)

  const node = graph.get(packageName)
  if (!node) return ''

  const baseHash = packageHashes.get(packageName) || ''
  const parts = [baseHash]

  for (const depName of node.dependencies) {
    const depHash = calculatePackageHashWithDeps(depName, graph, packageHashes, processed)
    if (depHash) {
      parts.push(`${depName}:${depHash}`)
    }
  }

  parts.sort()
  return crypto.createHash('md5').update(parts.join('\n')).digest('hex')
}

/**
 * Run lint phase for all packages.
 * Hash is composite (package + deps) — lint errors can originate from changed dependency types.
 * Concurrency is capped at 2 to limit ESLint memory usage (~3GB per worker).
 */
async function runLintPhase(graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHashes } = options

  // Lint workers consume significant memory — cap to 2 regardless of requested concurrency
  const lintConcurrency = Math.max(1, Math.min(concurrency, 2))

  const results = {
    successCount: 0,
    cacheHits: 0,
    total: packageNames.length,
    errors: [],
    time: 0,
    peakMemoryMB: 0
  }

  const startTime = performance.now()
  const pool = await getNamedWorkerPool('lint', lintConcurrency, join(__dirname, '..', 'lint-worker.js'), {
    workerOptions: {
      resourceLimits: {
        maxOldGenerationSizeMb: 4096,
        maxYoungGenerationSizeMb: 512
      }
    },
    recycleAfter: 15,
    recycleMemoryMB: 2500
  })

  let completedCount = 0
  const timings = []

  const promises = packageNames.map(async (name) => {
    const node = graph.get(name)

    if (!node.phaseFormat) {
      completedCount++
      results.successCount++
      results.cacheHits++
      return
    }

    const cwd = node.project.fullPath
    const hash = packageHashes ? calculatePackageHashWithDeps(name, graph, packageHashes) : undefined

    if (!force && hash && isPhaseCached(cwd, hash, 'lint', null, [])) {
      completedCount++
      results.successCount++
      results.cacheHits++
      console.log(`    [L] ${completedCount}/${packageNames.length} ${dim(name)} ${dim('(cached)')}`)
      return
    }

    const taskStart = performance.now()
    const result = await pool.runTask('lint', cwd, { srcDir: 'src' })
    const waitTime = Math.round(performance.now() - taskStart)
    const taskTime = result.durationMs !== undefined ? result.durationMs : waitTime
    completedCount++

    timings.push({ package: name, time: taskTime, failed: !result.success })

    if (result.memoryMB !== undefined && result.memoryMB > results.peakMemoryMB) {
      results.peakMemoryMB = result.memoryMB
    }

    if (result.success) {
      if (hash) {
        markPhaseCompleted(cwd, hash, 'lint', null, [])
      }
      results.successCount++
      const warnInfo = result.warningCount > 0 ? ` (${result.warningCount} warnings)` : ''
      const memInfo = result.memoryMB !== undefined ? ` ${dim(result.memoryMB + 'MB')}` : ''
      console.log(`    [L] ${completedCount}/${packageNames.length} ${success(name)} linted ${dim(taskTime + 'ms')}${memInfo}${warnInfo}`)
    } else {
      results.errors.push({ package: name, error: result.error })
      console.error(`    [L] ${completedCount}/${packageNames.length} ${error(name)} FAILED ${dim(taskTime + 'ms')}`)
      if (result.output) process.stderr.write(result.output + '\n')
    }
  })

  await Promise.all(promises)
  results.time = performance.now() - startTime

  // Print timing summary
  if (timings.length > 0) {
    const sorted = timings.sort((a, b) => b.time - a.time)
    const slowCount = Math.min(5, sorted.length)
    console.log(`\n    Top ${slowCount} slowest lint packages:`)
    for (let i = 0; i < slowCount; i++) {
      const t = sorted[i]
      const failInfo = t.failed ? ' FAILED' : ''
      console.log(`      ${(t.time / 1000).toFixed(1)}s ${t.package}${failInfo}`)
    }
  }
  if (results.peakMemoryMB > 0) {
    console.log(`    Peak worker memory: ${results.peakMemoryMB}MB`)
  }

  return results
}

module.exports = { runLintPhase }
