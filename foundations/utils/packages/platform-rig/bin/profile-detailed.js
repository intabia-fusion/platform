#!/usr/bin/env node

/**
 * Detailed memory profiler - shows what's actually cached
 */

const { Worker } = require('worker_threads')
const { join } = require('path')

const workerPath = join(__dirname, 'validate-worker.js')

async function profileDetailed() {
  console.log('=== Detailed Memory Profile ===\n')
  
  const worker = new Worker(workerPath)
  
  await new Promise((resolve) => {
    worker.on('message', (msg) => {
      if (msg.type === 'ready') resolve()
    })
  })
  
  const testPackages = [
    { name: '@hcengineering/core', path: '/Users/haiodo/Develop/private/foundation/foundations/core/packages/core' },
    { name: '@hcengineering/love', path: '/Users/haiodo/Develop/private/foundation/plugins/love' },
    { name: '@hcengineering/love-resources', path: '/Users/haiodo/Develop/private/foundation/plugins/love-resources' },
    { name: '@hcengineering/pod-server', path: '/Users/haiodo/Develop/private/foundation/pods/server' }
  ]
  
  let totalDtsFiles = 0
  
  for (const pkg of testPackages) {
    const pkgName = pkg.name
    const pkgPath = pkg.path
    
    // Count .d.ts files in node_modules
    const { execSync } = require('child_process')
    let dtsCount = 0
    try {
      const result = execSync(`find ${pkgPath}/node_modules -name "*.d.ts" 2>/dev/null | wc -l`, { encoding: 'utf-8' })
      dtsCount = parseInt(result.trim())
      totalDtsFiles += dtsCount
    } catch {}
    
    const startTime = Date.now()
    const result = await new Promise((resolve, reject) => {
      const taskId = Date.now()
      worker.once('message', (msg) => {
        if (msg.id === taskId) {
          if (msg.success) resolve(msg)
          else reject(new Error(msg.error))
        }
      })
      worker.postMessage({
        id: taskId,
        type: 'validate',
        cwd: pkgPath,
        srcDir: 'src',
        force: true,
        dependencyTypesHashes: {},
        reportMemory: true
      })
    })
    
    const duration = Date.now() - startTime
    const memBefore = result.memory?.before?.rss || 0
    const memAfter = result.memory?.after?.rss || 0
    const memDelta = memAfter - memBefore
    
    console.log(`${pkgName}:`)
    console.log(`  .d.ts files in node_modules: ~${dtsCount}`)
    console.log(`  Duration: ${duration}ms`)
    console.log(`  Memory delta: ${memDelta}MB (${memBefore}MB → ${memAfter}MB)`)
    console.log(`  Cached files: ${result.cacheStats?.sourceFiles || 0}`)
  }
  
  await worker.terminate()
  
  console.log(`\nTotal .d.ts files: ~${totalDtsFiles}`)
}

profileDetailed().catch(console.error)
