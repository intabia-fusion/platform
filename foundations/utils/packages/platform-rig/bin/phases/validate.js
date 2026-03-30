/**
 * Validate phase - runs in background
 * TypeScript validation via worker pool
 */
async function runValidatePhase(taskQueue, graph, packageNames, concurrency) {
  const { performance } = require('perf_hooks')
  const startTime = performance.now()

  const results = {
    successCount: 0,
    total: packageNames.length,
    cacheHits: 0,
    errors: [],
    time: 0
  }

  // Import worker pool
  const { getWorkerPool } = require('../libs/workers')
  const pool = await getWorkerPool(concurrency)

  const completedCount = { value: 0 }

  async function validatePackage(packageName) {
    const node = graph.get(packageName)
    const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'

    try {
      const result = await pool.validate(node.project.fullPath, { srcDir })
      completedCount.value++

      if (result.success) {
        results.successCount++
        if (result.fromCache) {
          results.cacheHits++
        }
        const cacheInfo = result.fromCache ? ' (cached)' : ''
        console.log(`    [${completedCount.value}/${packageNames.length}] ${packageName} validated ✓${cacheInfo}`)
        return { success: true }
      } else {
        results.errors.push({ package: packageName, error: result.error })
        console.error(`    [${completedCount.value}/${packageNames.length}] ${packageName} validation failed`)
        return { success: false, error: result.error }
      }
    } catch (err) {
      completedCount.value++
      results.errors.push({ package: packageName, error: err })
      console.error(`    [${completedCount.value}/${packageNames.length}] ${packageName} validation error: ${err.message}`)
      return { success: false, error: err }
    }
  }

  // Process packages as they become available from task queue
  const workers = []
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (true) {
        const task = taskQueue.getNextTask()
        if (!task && taskQueue.isTaskTypeComplete('validate')) {
          break
        }
        if (!task || task.taskType !== 'validate') {
          await new Promise(r => setTimeout(r, 10))
          continue
        }

        const result = await validatePackage(task.packageName)
        taskQueue.completeTask('validate', task.packageName, result)
      }
    })())
  }

  await Promise.all(workers)
  await pool.terminate()

  results.time = performance.now() - startTime
  return results
}

module.exports = { runValidatePhase }
