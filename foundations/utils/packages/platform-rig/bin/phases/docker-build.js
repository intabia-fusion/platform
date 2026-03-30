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
      const child = spawn('rushx', ['docker:build'], {
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
