/**
 * Docker build phase with unified caching
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
 * Check if docker image exists by running docker images command
 * This is a lightweight check that doesn't require building
 */
async function hasDockerImage(packageName) {
  return new Promise((resolve) => {
    // Extract image name from package name (e.g., @hcengineering/pod-server -> pod-server)
    const imageName = packageName.replace(/^@[^/]+\//, '')
    
    const child = spawn('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}', imageName], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.on('close', (code) => {
      // If we got any output, the image exists
      resolve(code === 0 && stdout.trim().length > 0)
    })

    child.on('error', () => {
      resolve(false)
    })
  })
}

async function runDockerBuildPhase(graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHash } = options

  const results = {
    successCount: 0,
    cacheHits: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  async function dockerBuildPackage(packageName) {
    const node = graph.get(packageName)
    const cwd = node.project.fullPath

    // Check cache using pre-calculated package hash
    if (!force && packageHash) {
      const imageExists = await hasDockerImage(packageName)
      if (imageExists && isPhaseCached(cwd, packageHash, 'docker-build')) {
        return { success: true, fromCache: true }
      }
    }

    return new Promise((resolve) => {
      const startTime = performance.now()
      console.log(`    [docker-build] Starting ${packageName}...`)
      
      const child = spawn('rushx', ['docker:build'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let lastLogLine = ''
      let progressInterval = null
      let progressTimeout = null
      let hasOutput = false
      let isCompleted = false

      // Helper to get last non-empty line
      const getLastLogLine = (output) => {
        const lines = output.split('\n').filter(line => line.trim())
        return lines[lines.length - 1] || ''
      }

      // Setup progress logging for long-running docker builds (>15s)
      const setupProgressLogging = () => {
        const checkProgress = () => {
          if (isCompleted) return
          const elapsed = Math.round((performance.now() - startTime) / 1000)
          if (elapsed >= 15) {
            const lastLine = getLastLogLine(stdout + stderr)
            console.log(`    [docker-build] ${packageName} still building... (${elapsed}s elapsed, hasOutput: ${hasOutput})`)
            if (lastLine) {
              console.log(`      Last log: ${lastLine.substring(0, 200)}`)
            } else if (!hasOutput) {
              console.log(`      No output received yet`)
            }
          }
        }
        
        // First check after 15 seconds
        progressTimeout = setTimeout(() => {
          if (isCompleted) return
          checkProgress()
          // Then every 15 seconds
          if (!isCompleted) {
            progressInterval = setInterval(checkProgress, 15000)
          }
        }, 15000)
      }

      setupProgressLogging()

      child.stdout?.on('data', (data) => {
        const str = data.toString()
        stdout += str
        lastLogLine = getLastLogLine(stdout + stderr)
        hasOutput = true
      })
      child.stderr?.on('data', (data) => {
        const str = data.toString()
        stderr += str
        lastLogLine = getLastLogLine(stdout + stderr)
        hasOutput = true
      })

      child.on('close', (code) => {
        isCompleted = true
        const time = performance.now() - startTime
        
        // Clear progress timers
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
            markPhaseCompleted(cwd, packageHash, 'docker-build')
          }
          resolve({ success: true, time })
        } else {
          const error = new Error(`Docker build failed with exit code ${code}`)
          error.stdout = stdout
          error.stderr = stderr
          // Log error details to console
          console.error(`[docker-build] ${packageName} failed:`)
          console.error(`  Exit code: ${code}`)
          if (stderr) console.error(`  stderr: ${stderr}`)
          if (stdout) console.error(`  stdout: ${stdout}`)
          resolve({ success: false, error, time })
        }
      })

      child.on('error', (err) => {
        isCompleted = true
        // Clear progress timers on error
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

  // Process packages
  const promises = packageNames.map(async (name) => {
    const result = await dockerBuildPackage(name)
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

module.exports = { runDockerBuildPhase }
