/**
 * Copyright © 2026 Intabia Fusion.
 *
 * Licensed under the Eclipse Public License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may
 * obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { join, relative, basename } = require('path')
const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, statSync } = require('fs')
const { execSync } = require('child_process')
const crypto = require('crypto')

/**
 * Collect .svelte files recursively
 */
function collectSvelteFiles(source) {
  const result = []
  if (!existsSync(source)) return result

  const files = readdirSync(source)
  for (const f of files) {
    const sourceFile = join(source, f)
    if (lstatSync(sourceFile).isDirectory()) {
      result.push(...collectSvelteFiles(sourceFile))
    } else if (f.endsWith('.svelte') || f.endsWith('.ts')) {
      result.push(sourceFile)
    }
  }
  return result
}

/**
 * Calculate hash for svelte-check cache
 */
function calculateSvelteCheckHash(cwd) {
  const parts = []

  const srcPath = join(cwd, 'src')
  if (existsSync(srcPath)) {
    const files = collectSvelteFiles(srcPath).sort()
    for (const file of files) {
      try {
        const stat = statSync(file)
        parts.push(`${relative(cwd, file)}:${stat.mtimeMs}:${stat.size}`)
      } catch {
        // Ignore
      }
    }
  }

  // Include tsconfig
  const tsconfig = join(cwd, 'tsconfig.json')
  if (existsSync(tsconfig)) {
    try {
      const stat = statSync(tsconfig)
      parts.push(`tsconfig:${stat.mtimeMs}:${stat.size}`)
    } catch {
      // Ignore
    }
  }

  return crypto.createHash('md5').update(parts.join('\n')).digest('hex')
}

/**
 * Load svelte-check cache
 */
function loadSvelteCheckCache(cwd) {
  const cachePath = join(cwd, '.svelte-check', 'check-cache.json')
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    }
  } catch {
    // Ignore
  }
  return null
}

/**
 * Save svelte-check cache
 */
function saveSvelteCheckCache(cwd, hash, errorCount) {
  const cacheDir = join(cwd, '.svelte-check')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  const cachePath = join(cacheDir, 'check-cache.json')
  try {
    writeFileSync(cachePath, JSON.stringify({ hash, errorCount, timestamp: Date.now() }), 'utf-8')
  } catch {
    // Ignore
  }
}

/**
 * Run svelte-check on a single package
 */
function runSvelteCheck(cwd, force = false) {
  const srcPath = join(cwd, 'src')
  if (!existsSync(srcPath)) {
    return { success: true, errorCount: 0, fromCache: false }
  }

  // Check cache
  const currentHash = calculateSvelteCheckHash(cwd)
  const cache = loadSvelteCheckCache(cwd)

  if (!force && cache && cache.hash === currentHash && cache.errorCount === 0) {
    return { success: true, errorCount: 0, fromCache: true }
  }

  // Run svelte-check
  try {
    const output = execSync('npx svelte-check --output human', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000
    })

    // Save cache
    saveSvelteCheckCache(cwd, currentHash, 0)

    return { success: true, errorCount: 0, fromCache: false }
  } catch (err) {
    // svelte-check returns non-zero on errors
    const output = (err.stdout || '') + (err.stderr || '')
    const errorLines = output.split('\n').filter(l => l.includes('Error:'))
    const errorCount = errorLines.length || 1

    // Save cache with errors (so we re-check next time)
    saveSvelteCheckCache(cwd, currentHash, errorCount)

    // Write log
    const logDir = join(cwd, '.svelte-check')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    writeFileSync(join(logDir, 'fast-check.log'), output, 'utf-8')

    return {
      success: false,
      errorCount,
      fromCache: false,
      errors: errorLines.length > 0 ? errorLines : [output.substring(0, 500)]
    }
  }
}

/**
 * Run svelte-check phase on multiple packages
 */
async function runSvelteCheckPhase(graph, packageNames, concurrency, options = {}) {
  const { force = false } = options
  const { performance } = require('perf_hooks')
  const startTime = performance.now()

  const results = {
    successCount: 0,
    total: packageNames.length,
    cacheHits: 0,
    errors: [],
    time: 0
  }

  let completedCount = 0

  // Process packages in parallel with limited concurrency
  const chunks = []
  for (let i = 0; i < packageNames.length; i += concurrency) {
    chunks.push(packageNames.slice(i, i + concurrency))
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (packageName) => {
      const node = graph.get(packageName)
      const cwd = node.project.fullPath

      try {
        const result = runSvelteCheck(cwd, force)
        completedCount++

        if (result.success) {
          results.successCount++
          if (result.fromCache) results.cacheHits++
          const cacheInfo = result.fromCache ? ' (cached)' : ''
          console.log(`    [${completedCount}/${packageNames.length}] ${packageName} svelte-check passed${cacheInfo}`)
        } else {
          results.errors.push({ package: packageName, errors: result.errors })
          console.error(`    [${completedCount}/${packageNames.length}] ${packageName} svelte-check failed (${result.errorCount} errors)`)
        }
      } catch (err) {
        completedCount++
        results.errors.push({ package: packageName, errors: [err.message] })
        console.error(`    [${completedCount}/${packageNames.length}] ${packageName} svelte-check error: ${err.message}`)
      }
    })

    await Promise.all(promises)
  }

  results.time = performance.now() - startTime
  return results
}

module.exports = { runSvelteCheckPhase, runSvelteCheck }
