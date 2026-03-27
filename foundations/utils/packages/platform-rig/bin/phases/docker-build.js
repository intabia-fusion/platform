/**
 * Docker build phase
 */
async function runDockerBuildPhase(graph, packageNames, concurrency) {
  const { spawn } = require('child_process')
  const { performance } = require('perf_hooks')

  const results = {
    successCount: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  async function dockerBuildPackage(packageName) {
    const node = graph.get(packageName)
    const cwd = node.project.fullPath

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
          resolve({ success: true, time })
        } else {
          const error = new Error(`Docker build failed with exit code ${code}`)
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
    const result = await dockerBuildPackage(name)
    if (result.success) {
      results.successCount++
    } else {
      results.errors.push({ package: name, error: result.error })
    }
    return result
  })

  await Promise.all(promises)
  return results
}

module.exports = { runDockerBuildPhase }
