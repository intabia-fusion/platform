#!/usr/bin/env node

/**
 * Memory profiler for validation workers
 * Compares memory usage with and without cache clearing
 */

const { Worker } = require('worker_threads')
const { join } = require('path')

const workerPath = join(__dirname, 'validate-worker.js')

async function profileWithOptions(clearCacheAfterEach, label) {
  console.log(`\n=== ${label} ===`)
  
  // Create a single worker
  const worker = new Worker(workerPath)
  
  // Wait for worker to be ready
  await new Promise((resolve) => {
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        resolve()
      }
    })
  })
  
  // Test packages
  const testPackages = [
    { name: '@hcengineering/core', path: '/Users/haiodo/Develop/private/foundation/foundations/core/packages/core' },
    { name: '@hcengineering/love', path: '/Users/haiodo/Develop/private/foundation/plugins/love' },
    { name: '@hcengineering/love-resources', path: '/Users/haiodo/Develop/private/foundation/plugins/love-resources' },
    { name: '@hcengineering/pod-server', path: '/Users/haiodo/Develop/private/foundation/pods/server' }
  ]
  
  let totalDuration = 0
  let peakRss = 0
  
  for (const pkg of testPackages) {
    const startTime = Date.now()
    const result = await new Promise((resolve, reject) => {
      const taskId = Date.now()
      
      worker.once('message', (msg) => {
        if (msg.id === taskId) {
          if (msg.success) {
            resolve(msg)
          } else {
            reject(new Error(msg.error))
          }
        }
      })
      
      worker.postMessage({
        id: taskId,
        type: 'validate',
        cwd: pkg.path,
        srcDir: 'src',
        force: true,
        dependencyTypesHashes: {},
        reportMemory: true,
        clearCacheAfterValidation: clearCacheAfterEach
      })
    })
    
    const duration = Date.now() - startTime
    totalDuration += duration
    
    const rssAfter = result.memory?.after?.rss || 0
    if (rssAfter > peakRss) peakRss = rssAfter
    
    console.log(`  ${pkg.name}: ${duration}ms, RSS: ${rssAfter}MB, Cache: ${result.cacheStats?.sourceFiles || 0} files`)
  }
  
  await worker.terminate()
  
  console.log(`  Total: ${totalDuration}ms, Peak RSS: ${peakRss}MB`)
  
  return { totalDuration, peakRss }
}

async function main() {
  // Test with cache clearing after each validation
  const withClearing = await profileWithOptions(true, 'With cache clearing after each validation')
  
  // Test without cache clearing
  const withoutClearing = await profileWithOptions(false, 'Without cache clearing')
  
  console.log('\n=== Comparison ===')
  console.log(`With clearing:    ${withClearing.totalDuration}ms, ${withClearing.peakRss}MB peak`)
  console.log(`Without clearing: ${withoutClearing.totalDuration}ms, ${withoutClearing.peakRss}MB peak`)
  console.log(`Difference:       ${withoutClearing.totalDuration - withClearing.totalDuration}ms, ${withoutClearing.peakRss - withClearing.peakRss}MB`)
}

main().catch(console.error)
