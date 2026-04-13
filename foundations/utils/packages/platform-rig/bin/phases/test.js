/**
 * Test phase — runs `rushx test` for packages with `_phase:test`
 */
const { spawn } = require('child_process')
const { performance } = require('perf_hooks')
const { join } = require('path')
const { readdirSync, statSync } = require('fs')

const {
  isPhaseCached,
  markPhaseCompleted
} = require('../libs/cache')

/**
 * Check if a directory contains any test files (*.test.ts, *.spec.ts, *.test.js, *.spec.js)
 */
function hasTestFiles (dir) {
  const testPattern = /\.(test|spec)\.(ts|js|tsx|jsx)$/
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.svelte-check') continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (hasTestFiles(fullPath)) return true
      } else if (testPattern.test(entry.name)) {
        return true
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return false
}

async function runTestPhase (graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHashes, verbose = false } = options

  const results = {
    successCount: 0,
    cacheHits: 0,
    skippedCount: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  const startTime = performance.now()
  let completedCount = 0

  async function testPackage (packageName) {
    const node = graph.get(packageName)
    const cwd = node.project.fullPath
    const packageHash = packageHashes?.get(packageName)

    // Check cache
    if (!force && packageHash) {
      if (isPhaseCached(cwd, packageHash, 'test', null, [])) {
        return { success: true, fromCache: true }
      }
    }

    // Skip packages without any test files — avoids ~2s jest startup overhead per package
    if (!hasTestFiles(cwd)) {
      if (packageHash) {
        markPhaseCompleted(cwd, packageHash, 'test', null, [])
      }
      return { success: true, skipped: true }
    }

    return new Promise((resolve) => {
      const pkgStart = performance.now()
      const child = spawn('rushx', ['test'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let progressInterval = null
      let progressTimeout = null
      let isCompleted = false

      const setupProgressLogging = () => {
        const checkProgress = () => {
          if (isCompleted) return
          const elapsed = Math.round((performance.now() - pkgStart) / 1000)
          if (elapsed >= 15) {
            console.log(`    [test] ${packageName} still testing... (${elapsed}s elapsed)`)
          }
        }

        progressTimeout = setTimeout(() => {
          if (isCompleted) return
          checkProgress()
          if (!isCompleted) {
            progressInterval = setInterval(checkProgress, 15000)
          }
        }, 15000)
      }

      setupProgressLogging()

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        isCompleted = true
        const time = performance.now() - pkgStart

        if (progressTimeout) {
          clearTimeout(progressTimeout)
          progressTimeout = null
        }
        if (progressInterval) {
          clearInterval(progressInterval)
          progressInterval = null
        }

        if (code === 0) {
          if (packageHash) {
            markPhaseCompleted(cwd, packageHash, 'test', null, [])
          }
          resolve({ success: true, time })
        } else {
          const error = new Error(`Test failed with exit code ${code}`)
          error.stdout = stdout
          error.stderr = stderr
          resolve({ success: false, error, time })
        }
      })

      child.on('error', (err) => {
        isCompleted = true
        if (progressTimeout) {
          clearTimeout(progressTimeout)
          progressTimeout = null
        }
        if (progressInterval) {
          clearInterval(progressInterval)
          progressInterval = null
        }
        resolve({ success: false, error: err })
      })
    })
  }

  // Process packages with concurrency limit
  const chunks = []
  for (let i = 0; i < packageNames.length; i += concurrency) {
    chunks.push(packageNames.slice(i, i + concurrency))
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (name) => {
      const result = await testPackage(name)
      completedCount++
      if (result.success) {
        results.successCount++
        if (result.fromCache) {
          results.cacheHits++
          if (verbose) {
            console.log(`    [test] ${completedCount}/${packageNames.length} ${name} (cached)`)
          }
        } else if (result.skipped) {
          results.skippedCount++
          if (verbose) {
            console.log(`    [test] ${completedCount}/${packageNames.length} ${name} (no tests)`)
          }
        } else {
          const time = result.time ? Math.round(result.time) + 'ms' : ''
          console.log(`    [test] ${completedCount}/${packageNames.length} ${name} ${time}`)
        }
      } else {
        results.errors.push({ package: name, error: result.error })
        console.log(`    [test] ${completedCount}/${packageNames.length} ${name} FAILED`)
      }
      return result
    })

    await Promise.all(promises)
  }

  results.time = performance.now() - startTime
  return results
}

module.exports = { runTestPhase }
