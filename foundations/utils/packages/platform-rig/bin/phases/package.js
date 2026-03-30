/**
 * Package phase with unified caching
 */
const { spawn } = require('child_process')
const { performance } = require('perf_hooks')
const { join } = require('path')
const fs = require('fs')

const {
  isPhaseCached,
  markPhaseCompleted
} = require('../libs/cache')

/**
 * Check if package output exists (dist/ directory)
 */
function hasPackageOutput(cwd) {
  const distPath = join(cwd, 'dist')
  return fs.existsSync(distPath) && fs.statSync(distPath).isDirectory()
}

async function runPackagePhase(graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHash } = options

  const results = {
    successCount: 0,
    cacheHits: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  async function packagePackage(packageName) {
    const node = graph.get(packageName)
    const cwd = node.project.fullPath

    // Check cache using pre-calculated package hash
    if (!force && packageHash) {
      if (isPhaseCached(cwd, packageHash, 'package', hasPackageOutput)) {
        return { success: true, fromCache: true }
      }
    }

    return new Promise((resolve) => {
      const startTime = performance.now()
      const child = spawn('rushx', ['package'], {
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
        const time = performance.now() - startTime

        if (code === 0) {
          if (packageHash) {
            markPhaseCompleted(cwd, packageHash, 'package')
          }
          resolve({ success: true, time })
        } else {
          const error = new Error(`Package failed with exit code ${code}`)
          error.stdout = stdout
          error.stderr = stderr
          resolve({ success: false, error, time })
        }
      })

      child.on('error', (err) => {
        resolve({ success: false, error: err })
      })
    })
  }

  // Process packages
  const promises = packageNames.map(async (name) => {
    const result = await packagePackage(name)
    if (result.success) {
      results.successCount++
      if (result.fromCache) results.cacheHits++
    } else {
      results.errors.push({ package: name, error: result.error })
    }
    return result
  })

  await Promise.all(promises)
  return results
}

module.exports = { runPackagePhase }
