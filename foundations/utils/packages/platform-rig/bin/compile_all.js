#!/usr/bin/env node

const { resolve, join } = require('path')
const { existsSync } = require('fs')
const { performance } = require('perf_hooks')

const { BuildTaskQueue, TaskType } = require('./libs/task-queue')
const { CpuTracker, getOptimalWorkerCount, getDefaultWorkerCount } = require('./libs/utils')
const { calculatePackageHash } = require('./libs/cache')

// Import phases
const { runTranspilePhase } = require('./phases/transpile')
const { runBundlePhase } = require('./phases/bundle-phase')
const { runPackagePhase } = require('./phases/package')
const { runDockerBuildPhase } = require('./phases/docker-build')

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  let parallel = getDefaultWorkerCount()
  let verbose = false
  let doValidate = false
  let force = false
  let doBundle = false
  let doPackage = false
  let doDockerBuild = false
  let help = false
  let list = false
  let toPackage = null
  let rootDir = ''
  let forceWorkers = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--force-workers') {
      forceWorkers = true
    } else if (arg === '--parallel' || arg === '-p') {
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        parallel = parseInt(next, 10)
        if (isNaN(parallel) || parallel < 1) {
          parallel = 1
        }
        i++
      } else {
        // Default to CPU count if no number specified
        parallel = require('os').cpus().length
      }
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true
    } else if (arg === '--validate') {
      doValidate = true
    } else if (arg === '--force' || arg === '-f') {
      force = true
    } else if (arg === '--bundle') {
      doBundle = true
    } else if (arg === '--package') {
      doPackage = true
      doBundle = true  // package implies bundle
    } else if (arg === '--docker-build') {
      doDockerBuild = true
      doPackage = true  // docker-build implies package
      doBundle = true  // docker-build implies bundle
    } else if (arg === '--list' || arg === '-l') {
      list = true
    } else if (arg === '--to') {
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        if (toPackage) {
          toPackage += ',' + next
        } else {
          toPackage = next
        }
        i++
      }
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (!arg.startsWith('-')) {
      // Positional argument - rootDir
      rootDir = arg
    }
  }

  // Read Rush custom parameters from environment variables
  // Check RUSH_INVOKED_ARGS for multiple --to flags (Rush passes all args here)
  if (!toPackage && process.env.RUSH_INVOKED_ARGS) {
    const rushArgs = process.env.RUSH_INVOKED_ARGS.split(' ')
    const toPackages = []
    for (let i = 0; i < rushArgs.length; i++) {
      if (rushArgs[i] === '--to' && i + 1 < rushArgs.length) {
        toPackages.push(rushArgs[i + 1])
        i++
      }
    }
    if (toPackages.length > 0) {
      toPackage = toPackages.join(',')
    }
  }
  if (!toPackage) {
    toPackage = process.env.RUSH_TO || process.env.TO || null
  }
  if (!list) {
    list = process.env.RUSH_LIST === '1' || process.env.LIST === '1'
  }
  if (!verbose) {
    verbose = process.env.RUSH_VERBOSE === '1' || process.env.VERBOSE === '1'
  }

  return { parallel, verbose, doValidate, force, doBundle, doPackage, doDockerBuild, help, list, toPackage, rootDir, forceWorkers }
}

function printUsage() {
  console.log(`
Usage: compile-all <rootDir> [options]

Arguments:
  rootDir              Root directory of the Rush monorepo (where rush.json is located)

Options:
  --parallel, -p <n>   Run compilation in parallel with n workers (default: 4, or 8 on systems with >64GB RAM)
                       If no number specified, uses CPU count (limited by available memory)
                       Parallel compilation respects dependency order (builds in waves)
  --force-workers      Force exact worker count, ignore memory limits (use with caution!)
  --verbose, -v        Show detailed output for each package
  --validate           Also run TypeScript validation for packages with "_phase:validate": "compile validate"
  --force, -f          Disable all caching (forces full rebuild, revalidation)
  --bundle             Run bundle phase for packages with "_phase:bundle"
  --docker-build       Run docker-build phase (implies --bundle)
  --list, -l           Only print the list of packages in compilation order (no actual compilation)
  --to <package>       Only compile the specified package and its dependencies
  --help, -h           Show this help message

Description:
  This script compiles all Rush packages that have "_phase:build": "compile transpile src"
  in their package.json scripts section. Packages are compiled in dependency order.

  When --validate is specified, also runs TypeScript validation for packages that have
  "_phase:validate": "compile validate" in their scripts.

  When --bundle is specified, runs the bundle phase for packages with "_phase:bundle".

  When --docker-build is specified, runs bundle first, then docker-build for packages
  with "_phase:docker-build".

  When --to is specified, only the specified package and all its dependencies will be compiled.

  When --list is specified, prints the compilation order without actually compiling.

  The script automatically detects available memory and limits workers to prevent OOM.

Examples:
  compile-all .
  compile-all . --parallel 4 --verbose
  compile-all /path/to/repo -p -v --validate
  compile-all . --validate --force
  compile-all . --bundle --to @hcengineering/pod-server
  compile-all . --docker-build --to @hcengineering/pod-server
  compile-all . --list
  compile-all . --to @hcengineering/core
`)
}

/**
 * Run validation phase with worker pool
 */
async function runValidationPhase(packages, graph, validationWorkers, force, packageHashes) {
  if (packages.length === 0) return { successCount: 0, total: 0, cacheHits: 0, errors: [], time: 0 }

  const { getWorkerPool } = require('./libs/workers')
  const { markPhaseCompleted, isPhaseCached } = require('./libs/cache')
  const pool = await getWorkerPool(validationWorkers)

  const startTime = performance.now()
  const results = {
    successCount: 0,
    total: packages.length,
    cacheHits: 0,
    errors: [],
    time: 0
  }

  let completedCount = 0
  const timings = []

  // Map to store typesHash for each validated package (used by dependents)
  const packageTypesHashes = new Map()

  // Track memory usage
  let peakMemoryMB = 0
  function updatePeakMemory() {
    const usage = process.memoryUsage()
    const currentMB = Math.round(usage.rss / 1024 / 1024)
    if (currentMB > peakMemoryMB) {
      peakMemoryMB = currentMB
    }
  }
  const memoryInterval = setInterval(updatePeakMemory, 1000)

  console.log(`\n=== Phase: Validating ${packages.length} packages ===`)
  console.log(`    Using ${validationWorkers} validation workers`)

  // Process packages in waves based on dependencies (like transpile phase)
  const pending = new Set(packages)
  const completed = new Set()

  async function validatePackage(packageName) {
    const node = graph.get(packageName)
    const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'
    const pkgStart = performance.now()

    // Get pre-calculated package hash
    const packageHash = packageHashes.get(packageName)

    // Check if validation is cached
    if (!force && packageHash && isPhaseCached(node.project.fullPath, packageHash, 'validate')) {
      // Get typesHash from cache for dependents
      const typesDir = join(node.project.fullPath, 'types')
      if (existsSync(typesDir)) {
        const { calculateTypesHash } = require('./validate-worker')
        const typesHash = calculateTypesHash(typesDir)
        packageTypesHashes.set(packageName, typesHash)
      }
      
      results.successCount++
      results.cacheHits++
      const pkgTime = Math.round(performance.now() - pkgStart)
      console.log(`    [V ${completedCount + 1}/${packages.length}] ${packageName} validated (cached) ${pkgTime}ms`)
      return { success: true, fromCache: true }
    }

    // Collect types hashes from dependencies
    const dependencyTypesHashes = {}
    for (const dep of node.dependencies) {
      if (packages.includes(dep) && packageTypesHashes.has(dep)) {
        dependencyTypesHashes[dep] = packageTypesHashes.get(dep)
      }
    }

    try {
      const result = await pool.validate(node.project.fullPath, { srcDir, force, dependencyTypesHashes, packageHash })
      const pkgTime = Math.round(performance.now() - pkgStart)

      if (result.success) {
        results.successCount++
        // Note: cacheHits is already incremented above for packages that hit the cache
        // Worker-level cache is disabled, so we don't check result.fromCache here
        const cacheInfo = ''
        const syncInfo = result.syncResult ? ` [${result.syncResult.copied}c/${result.syncResult.unchanged}u/${result.syncResult.removed}r]` : ''
        const cacheStatsInfo = result.cacheStats ? ` src:${result.cacheStats.sourceFiles}` : ''
        console.log(`    [V ${completedCount + 1}/${packages.length}] ${packageName} validated${cacheInfo}${syncInfo}${cacheStatsInfo} ${pkgTime}ms`)
        if (!result.fromCache) {
          timings.push({ package: packageName, time: pkgTime })
        }
        // Store typesHash for dependents to use
        if (result.typesHash) {
          packageTypesHashes.set(packageName, result.typesHash)
        }

        // Mark validate phase as completed in unified cache
        const packageHash = packageHashes.get(packageName)
        if (packageHash) {
          markPhaseCompleted(node.project.fullPath, packageHash, 'validate')
        }
      } else {
        results.errors.push({ package: packageName, error: result.error })
        const errMsg = result.error ? (result.error.message || String(result.error)) : 'unknown'
        console.error(`    [V ${completedCount + 1}/${packages.length}] ${packageName} validation failed ${pkgTime}ms`)
        console.error(`      ${errMsg}`)
        timings.push({ package: packageName, time: pkgTime, failed: true })
      }

      return result
    } catch (err) {
      const pkgTime = Math.round(performance.now() - pkgStart)
      results.errors.push({ package: packageName, error: err })
      console.error(`    [V ${completedCount + 1}/${packages.length}] ${packageName} validation error: ${err.message} ${pkgTime}ms`)
      timings.push({ package: packageName, time: pkgTime, failed: true })
      return { success: false, error: err }
    }
  }

  // Process in dependency order waves
  while (completed.size < packages.length) {
    // Find packages ready to validate (all deps completed)
    const ready = []
    for (const name of pending) {
      const node = graph.get(name)
      const depsCompleted = [...node.dependencies].filter(d => packages.includes(d))
        .every(d => completed.has(d))
      if (depsCompleted) {
        ready.push(name)
      }
    }

    if (ready.length === 0) {
      throw new Error('Circular dependency detected in validation phase')
    }

    // Validate ready packages in parallel with limited concurrency
    const validatePromises = ready.map(async (name) => {
      await validatePackage(name)
      completedCount++
      completed.add(name)
      pending.delete(name)
    })

    // Limit concurrency to validationWorkers
    const chunks = []
    for (let i = 0; i < validatePromises.length; i += validationWorkers) {
      chunks.push(validatePromises.slice(i, i + validationWorkers))
    }

    for (const chunk of chunks) {
      await Promise.all(chunk)
    }
  }

  await pool.terminate()

  clearInterval(memoryInterval)
  results.time = performance.now() - startTime

  console.log(`\nValidated: ${results.successCount}/${results.total} packages in ${Math.round(results.time)}ms`)
  if (results.cacheHits > 0) console.log(`  (${results.cacheHits} from cache)`)
  console.log(`  Peak memory: ${peakMemoryMB}MB`)

  // Print timing summary
  if (timings.length > 0) {
    const sorted = timings.sort((a, b) => b.time - a.time)
    const slowCount = Math.min(10, sorted.length)
    console.log(`\n    Top ${slowCount} slowest validate packages:`)
    for (let i = 0; i < slowCount; i++) {
      const t = sorted[i]
      const failInfo = t.failed ? ' FAILED' : ''
      console.log(`      ${(t.time / 1000).toFixed(1)}s ${t.package}${failInfo}`)
    }
  }

  return results
}

/**
 * Run build pipeline (bundle -> package -> docker-build)
 */
async function runLintPhaseWrapper(packages, graph, force, packageHashes) {
  if (packages.length === 0) return { successCount: 0, total: 0, cacheHits: 0, errors: [], time: 0 }

  console.log(`\n=== Phase: Linting ${packages.length} packages ===`)
  console.log(`    Running sequentially to save memory...`)

  // Run with concurrency = 1 to prevent OOM
  const results = await runLintPhase(graph, packages, 1, { force, packageHashes })

  console.log(`\nLint: ${results.successCount}/${results.total} packages in ${Math.round(results.time)}ms`)
  if (results.cacheHits > 0) console.log(`  (${results.cacheHits} from cache)`)
  if (results.errors.length > 0) console.error(`  ${results.errors.length} package(s) with lint errors`)

  return results
}

/**
 * Run svelte-check phase
 */
async function runSvelteCheckPhaseWrapper(packages, graph, force, packageHashes) {
  if (packages.length === 0) return { successCount: 0, total: 0, cacheHits: 0, errors: [], time: 0 }

  console.log(`\n=== Phase: Svelte-check ${packages.length} packages ===`)
  console.log(`    Running sequentially to save memory...`)

  // Run with concurrency = 1 to prevent OOM
  const results = await runSvelteCheckPhase(graph, packages, 1, { force, packageHashes })

  console.log(`\nSvelte-check: ${results.successCount}/${results.total} packages in ${Math.round(results.time)}ms`)
  if (results.cacheHits > 0) console.log(`  (${results.cacheHits} from cache)`)
  if (results.errors.length > 0) console.error(`  ${results.errors.length} package(s) with svelte-check errors`)

  return results
}

/**
 * Run build pipeline (bundle -> package -> docker-build)
 */
async function runBuildPipeline(packagesToBundle, packagesToPackage, packagesToDockerBuild, graph, buildWorkers, force, packageHashes) {
  const taskQueue = new BuildTaskQueue(graph, { concurrency: buildWorkers })

  if (packagesToBundle.length > 0) {
    taskQueue.addTasks(TaskType.BUNDLE, packagesToBundle)
  }
  if (packagesToPackage.length > 0) {
    taskQueue.addTasks(TaskType.PACKAGE, packagesToPackage)
  }
  if (packagesToDockerBuild.length > 0) {
    taskQueue.addTasks(TaskType.DOCKER_BUILD, packagesToDockerBuild)
  }

  const phases = []
  if (packagesToBundle.length > 0) phases.push(`bundle(${packagesToBundle.length})`)
  if (packagesToPackage.length > 0) phases.push(`package(${packagesToPackage.length})`)
  if (packagesToDockerBuild.length > 0) phases.push(`docker-build(${packagesToDockerBuild.length})`)
  console.log(`\n=== Phase: Running pipeline [${phases.join(' -> ')}] ===`)

  const results = {
    bundle: { successCount: 0, total: packagesToBundle.length, cacheHits: 0, errors: [] },
    package: { successCount: 0, total: packagesToPackage.length, cacheHits: 0, errors: [] },
    dockerBuild: { successCount: 0, total: packagesToDockerBuild.length, cacheHits: 0, errors: [] }
  }

  const completedCount = { bundle: 0, package: 0, dockerBuild: 0 }

  /**
   * Calculate package hash including all dependencies (transitive)
   * This ensures that when a dependency changes, dependent packages are rebuilt
   */
  function calculatePackageHashWithDeps(packageName, graph, packageHashes, processed = new Set()) {
    // Prevent circular dependencies
    if (processed.has(packageName)) {
      return ''
    }
    processed.add(packageName)

    const node = graph.get(packageName)
    if (!node) {
      return ''
    }

    // Get base hash of this package
    const baseHash = packageHashes.get(packageName) || ''
    const parts = [baseHash]

    // Add hashes of all dependencies
    for (const depName of node.dependencies) {
      const depHash = calculatePackageHashWithDeps(depName, graph, packageHashes, processed)
      if (depHash) {
        parts.push(`${depName}:${depHash}`)
      }
    }

    // Sort to ensure consistent hash
    parts.sort()

    // Combine into final hash
    const crypto = require('crypto')
    return crypto.createHash('md5').update(parts.join('\n')).digest('hex')
  }

  async function worker() {
    while (true) {
      const task = taskQueue.getNextTask()

      if (!task) {
        if (taskQueue.isAllComplete()) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 10))
        continue
      }

      const { taskType, packageName } = task
      const node = graph.get(packageName)
      const pkgStart = performance.now()
      // Always include dependency hashes to ensure rebuilds when any dependency changes
      const packageHash = calculatePackageHashWithDeps(packageName, graph, packageHashes)

      try {
        let result

        switch (taskType) {
          case TaskType.BUNDLE: {
            result = await runBundlePhase(graph, [packageName], 1, { force, packageHash })
            completedCount.bundle++
            if (result.successCount > 0) {
              results.bundle.successCount++
              if (result.cacheHits > 0) results.bundle.cacheHits++
              const time = Math.round(performance.now() - pkgStart)
              const cacheInfo = result.cacheHits > 0 ? ' (cached)' : ''
              console.log(`    [B ${completedCount.bundle}/${packagesToBundle.length}] ${packageName} bundled${cacheInfo} in ${time}ms`)
            }
            break
          }

          case TaskType.PACKAGE: {
            result = await runPackagePhase(graph, [packageName], 1, { force, packageHash })
            completedCount.package++
            if (result.successCount > 0) {
              results.package.successCount++
              if (result.cacheHits > 0) results.package.cacheHits++
              const time = Math.round(performance.now() - pkgStart)
              const cacheInfo = result.cacheHits > 0 ? ' (cached)' : ''
              console.log(`    [P ${completedCount.package}/${packagesToPackage.length}] ${packageName} packaged${cacheInfo} in ${time}ms`)
            }
            break
          }

          case TaskType.DOCKER_BUILD: {
            result = await runDockerBuildPhase(graph, [packageName], 1, { force, packageHash })
            completedCount.dockerBuild++
            if (result.successCount > 0) {
              results.dockerBuild.successCount++
              if (result.cacheHits > 0) results.dockerBuild.cacheHits++
              const time = Math.round(performance.now() - pkgStart)
              const cacheInfo = result.cacheHits > 0 ? ' (cached)' : ''
              console.log(`    [D ${completedCount.dockerBuild}/${packagesToDockerBuild.length}] ${packageName} docker built${cacheInfo} in ${Math.round(time / 1000)}s`)
            } else {
              // Handle errors
              results.dockerBuild.errors.push(...result.errors)
              const time = Math.round(performance.now() - pkgStart)
              console.error(`    [D ${completedCount.dockerBuild}/${packagesToDockerBuild.length}] ${packageName} docker build FAILED in ${Math.round(time / 1000)}s`)
              if (result.errors && result.errors.length > 0) {
                for (const err of result.errors) {
                  console.error(`      Error: ${err.error?.message || err.error || 'Unknown error'}`)
                }
              }
            }
            break
          }

          default:
            continue
        }

        taskQueue.completeTask(taskType, packageName, result)
      } catch (err) {
        console.error(`    ${packageName} ${taskType} failed: ${err.message}`)
        taskQueue.completeTask(taskType, packageName, { success: false, error: err })
      }
    }
  }

  // Start workers
  const workers = []
  for (let i = 0; i < buildWorkers; i++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  // Print results
  if (packagesToBundle.length > 0) {
    console.log(`\nBundled: ${results.bundle.successCount}/${results.bundle.total} packages`)
  }
  if (packagesToPackage.length > 0) {
    console.log(`Packaged: ${results.package.successCount}/${results.package.total} packages`)
    if (results.package.cacheHits > 0) console.log(`  (${results.package.cacheHits} from cache)`)
  }
  if (packagesToDockerBuild.length > 0) {
    console.log(`Docker built: ${results.dockerBuild.successCount}/${results.dockerBuild.total} packages`)
    if (results.dockerBuild.cacheHits > 0) console.log(`  (${results.dockerBuild.cacheHits} from cache)`)
    if (results.dockerBuild.errors.length > 0) {
      console.error(`\n  ${results.dockerBuild.errors.length} docker build error(s):`)
      for (const err of results.dockerBuild.errors) {
        console.error(`    - ${err.package}: ${err.error?.message || err.error}`)
      }
    }
  }

  return results
}

/**
 * Main compilation function
 */
async function compileAll(rootDir, options = {}) {
  const {
    parallel = 4,
    verbose = false,
    doValidate = false,
    force = false,
    doBundle = false,
    doPackage = false,
    doDockerBuild = false,
    list = false,
    toPackage = null,
    forceWorkers = false
  } = options

  const startTime = performance.now()

  // Check available memory and adjust worker count
  const validationWorkers = forceWorkers ? parallel : getOptimalWorkerCount(parallel, 'typescript').workers
  const buildWorkers = forceWorkers ? parallel : getOptimalWorkerCount(parallel, 'bundle').workers

  // Start CPU tracking
  const cpuTracker = new CpuTracker(100)
  cpuTracker.start()

  console.log(`Building with ${validationWorkers} validation workers, ${buildWorkers} build workers...`)

  // Build dependency graph
  const { buildDependencyGraph } = require('./libs/graph')
  const { graph, projects } = await buildDependencyGraph(rootDir, verbose)

  // Pre-calculate package hashes for all packages (once per run)
  console.log('Calculating package hashes...')
  const packageHashes = new Map()
  for (const [name, node] of graph) {
    packageHashes.set(name, calculatePackageHash(node.project.fullPath))
  }
  console.log(`  Calculated ${packageHashes.size} package hashes`)

  // Collect packages for each phase
  const packagesToTranspile = []
  const packagesToValidate = []
  const packagesToBundle = []
  const packagesToPackage = []
  const packagesToDockerBuild = []

  // If --to is specified, collect target packages and all their dependencies
  let targetPackages = null
  if (toPackage) {
    // Parse multiple --to packages (comma-separated)
    const targets = toPackage.split(',').map(t => t.trim()).filter(Boolean)
    targetPackages = new Set()

    // Helper to get all dependencies recursively
    function getAllDependencies(packageName, visited = new Set()) {
      if (visited.has(packageName)) return
      visited.add(packageName)

      const node = graph.get(packageName)
      if (!node) return

      targetPackages.add(packageName)

      // Add all dependencies
      for (const dep of node.dependencies) {
        getAllDependencies(dep, visited)
      }
    }

    // Collect all targets and their dependencies
    for (const target of targets) {
      getAllDependencies(target)
    }

    console.log(`\nFiltering to ${targetPackages.size} packages (targets: ${targets.join(', ')})`)
  }

  for (const [name, node] of graph) {
    // Skip if --to is specified and this package is not in the target set
    if (targetPackages && !targetPackages.has(name)) {
      continue
    }

    if (node.phaseBuild === 'compile transpile src' ||
        node.phaseBuild === 'compile transpile tests' ||
        node.phaseBuild === 'compile ui-esbuild') {
      packagesToTranspile.push(name)
    }

    if (doValidate && node.phaseValidate === 'compile validate') {
      packagesToValidate.push(name)
    }

    if (doBundle && node.phaseBundle && node.phaseBundle !== 'echo done') {
      packagesToBundle.push(name)
    }

    if ((doPackage || doDockerBuild) && node.phasePackage) {
      packagesToPackage.push(name)
    }

    if (doDockerBuild && node.phaseDockerBuild) {
      packagesToDockerBuild.push(name)
    }
  }

  if (list) {
    console.log('\nPackages to process:')
    console.log(`  Transpile: ${packagesToTranspile.length}`)
    console.log(`  Validate: ${packagesToValidate.length}`)
    console.log(`  Bundle: ${packagesToBundle.length}`)
    console.log(`  Package: ${packagesToPackage.length}`)
    console.log(`  Docker-build: ${packagesToDockerBuild.length}`)
    return { success: true, listOnly: true }
  }

  // Phase 1: Transpile
  console.log(`\n=== Phase 1: Transpiling ${packagesToTranspile.length} packages ===`)
  const transpileResults = await runTranspilePhase(graph, packagesToTranspile, validationWorkers, { force, packageHashes })
  console.log(`Transpiled: ${transpileResults.successCount}/${transpileResults.total} packages in ${Math.round(transpileResults.time)}ms`)

  if (transpileResults.errors.length > 0) {
    console.error('\nTranspile errors:')
    for (const err of transpileResults.errors) {
      console.error(`  ${err.package}: ${err.error}`)
    }
    return { success: false, errors: transpileResults.errors.length }
  }

  // Phase 2: Validate (with worker pool)
  let validateResults = { successCount: 0, total: 0, cacheHits: 0, errors: [] }
  if (doValidate && packagesToValidate.length > 0) {
    validateResults = await runValidationPhase(packagesToValidate, graph, validationWorkers, force, packageHashes)
    if (validateResults.errors.length > 0) {
      console.error('\nValidation errors - stopping build')
      return { success: false, errors: validateResults.errors.length }
    }
  }

  // Phase 3: Build pipeline (bundle -> package -> docker-build)
  let buildResults = {}
  if (doBundle || doPackage || doDockerBuild) {
    buildResults = await runBuildPipeline(
      packagesToBundle,
      packagesToPackage,
      packagesToDockerBuild,
      graph,
      buildWorkers,
      force,
      packageHashes
    )
  }

  // Stop CPU tracking
  cpuTracker.stop()
  const cpuStats = cpuTracker.getStats()

  const totalTime = performance.now() - startTime

  console.log(`\n=== Summary ===`)
  console.log(`Total time: ${Math.round(totalTime)}ms`)
  console.log(`CPU usage: avg ${cpuStats.avg}%, peak ${cpuStats.peak}%`)

  return {
    success: true,
    time: totalTime,
    cpuStats
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

  if (options.help) {
    printUsage()
    process.exit(0)
  }

  if (!options.rootDir) {
    console.error('Error: rootDir argument is required')
    printUsage()
    process.exit(1)
  }

  const rootDir = resolve(options.rootDir)

  if (!existsSync(join(rootDir, 'rush.json'))) {
    console.error(`Error: rush.json not found in ${rootDir}`)
    process.exit(1)
  }

  try {
    const result = await compileAll(rootDir, options)

    if (result.listOnly) {
      process.exit(0)
    }

    if (!result.success) {
      process.exit(1)
    }
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})

module.exports = { compileAll }
