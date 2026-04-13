/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { performance } = require('perf_hooks')
const { join } = require('path')
const { spawn } = require('child_process')
const { existsSync, mkdirSync } = require('fs')
const crypto = require('crypto')

const { isPhaseCached, markPhaseCompleted } = require('../libs/cache')
const { success, error, dim } = require('../libs/colors')

/**
 * Calculate composite hash for a package including all transitive dependencies.
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
 * Run svelte-check for a single package
 */
function runSvelteCheckForPackage(cwd) {
  return new Promise((resolve) => {
    const checkDir = join(cwd, '.svelte-check')
    if (!existsSync(checkDir)) {
      mkdirSync(checkDir, { recursive: true })
    }

    const child = spawn('svelte-check', ['--output', 'human'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout })
      } else {
        resolve({ success: false, output: stdout + '\n' + stderr, error: new Error(`svelte-check failed with exit code ${code}`) })
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err })
    })
  })
}

/**
 * Run svelte-check phase for all packages in dependency order.
 * Processes packages in waves — a package is ready only when all its
 * dependencies (that are also in the svelte-check set) have completed.
 * Concurrency capped at 2 — svelte-check is memory-heavy.
 */
async function runSvelteCheckPhase(graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHashes } = options

  const svelteCheckConcurrency = concurrency

  const results = {
    successCount: 0,
    cacheHits: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  const startTime = performance.now()
  let completedCount = 0
  const timings = []

  const pending = new Set(packageNames)
  const completed = new Set()

  async function processPackage(name) {
    const node = graph.get(name)
    const cwd = node.project.fullPath
    const hash = packageHashes ? calculatePackageHashWithDeps(name, graph, packageHashes) : undefined

    if (!force && hash && isPhaseCached(cwd, hash, 'svelte-check', null, [])) {
      completedCount++
      results.successCount++
      results.cacheHits++
      console.log(`    [S] ${completedCount}/${packageNames.length} ${dim(name)} ${dim('(cached)')}`)
      return
    }

    const taskStart = performance.now()
    const result = await runSvelteCheckForPackage(cwd)
    const taskTime = Math.round(performance.now() - taskStart)
    completedCount++

    timings.push({ package: name, time: taskTime, failed: !result.success })

    if (result.success) {
      if (hash) {
        markPhaseCompleted(cwd, hash, 'svelte-check', null, [])
      }
      results.successCount++
      console.log(`    [S] ${completedCount}/${packageNames.length} ${success(name)} svelte-checked ${dim(taskTime + 'ms')}`)
    } else {
      results.errors.push({ package: name, error: result.error, output: result.output })
      console.error(`    [S] ${completedCount}/${packageNames.length} ${error(name)} FAILED ${dim(taskTime + 'ms')}`)
      if (result.output) process.stderr.write(result.output + '\n')
    }
  }

  // Process in dependency order waves
  while (completed.size < packageNames.length) {
    // Find packages ready to check (all deps in the set have completed)
    const ready = []
    for (const name of pending) {
      const node = graph.get(name)
      const depsCompleted = [...node.dependencies]
        .filter(d => packageNames.includes(d))
        .every(d => completed.has(d))
      if (depsCompleted) {
        ready.push(name)
      }
    }

    if (ready.length === 0) {
      throw new Error('Circular dependency detected in svelte-check phase')
    }

    // Process ready packages in chunks limited by concurrency
    const chunks = []
    for (let i = 0; i < ready.length; i += svelteCheckConcurrency) {
      chunks.push(ready.slice(i, i + svelteCheckConcurrency))
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (name) => {
        await processPackage(name)
        completed.add(name)
        pending.delete(name)
      })
      await Promise.all(promises)
    }
  }

  results.time = performance.now() - startTime

  // Print timing summary
  if (timings.length > 0) {
    const sorted = timings.sort((a, b) => b.time - a.time)
    const slowCount = Math.min(5, sorted.length)
    console.log(`\n    Top ${slowCount} slowest svelte-check packages:`)
    for (let i = 0; i < slowCount; i++) {
      const t = sorted[i]
      const failInfo = t.failed ? ' FAILED' : ''
      console.log(`      ${(t.time / 1000).toFixed(1)}s ${t.package}${failInfo}`)
    }
  }

  return results
}

module.exports = { runSvelteCheckPhase }
