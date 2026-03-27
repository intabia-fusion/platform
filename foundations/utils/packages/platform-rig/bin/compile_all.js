#!/usr/bin/env node

const { resolve, join } = require('path')
const { existsSync } = require('fs')
const { performance } = require('perf_hooks')

const { BuildTaskQueue, TaskType } = require('./libs/task-queue')
const { CpuTracker, getOptimalWorkerCount, getDefaultWorkerCount } = require('./libs/utils')

// Import phases
const { runTranspilePhase } = require('./phases/transpile')
const { runValidatePhase } = require('./phases/validate')
const { runBundlePhase } = require('./phases/bundle-phase')
const { runPackagePhase } = require('./phases/package')
const { runDockerBuildPhase } = require('./phases/docker-build')
const { runLintPhase } = require('./phases/lint')
const { runSvelteCheckPhase } = require('./phases/svelte-check')

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
  let doLint = false
  let doSvelteCheck = false
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
    } else if (arg === '--lint') {
      doLint = true
    } else if (arg === '--svelte-check') {
      doSvelteCheck = true
    } else if (arg === '--list' || arg === '-l') {
      list = true
    } else if (arg === '--to') {
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        toPackage = next
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
  if (!toPackage) {
    toPackage = process.env.RUSH_TO || process.env.TO || null
  }
  if (!list) {
    list = process.env.RUSH_LIST === '1' || process.env.LIST === '1'
  }
  if (!verbose) {
    verbose = process.env.RUSH_VERBOSE === '1' || process.env.VERBOSE === '1'
  }

  return { parallel, verbose, doValidate, force, doBundle, doPackage, doDockerBuild, doLint, doSvelteCheck, help, list, toPackage, rootDir, forceWorkers }
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
  --force, -f          Disable all caching (forces full rebuild, revalidation, relint)
  --bundle             Run bundle phase for packages with "_phase:bundle"
  --docker-build       Run docker-build phase (implies --bundle)
  --lint               Run ESLint check (no fix) for packages with "_phase:format"
  --svelte-check       Run svelte-check for packages with "_phase:svelte-check"
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
    doLint = false,
    doSvelteCheck = false,
    list = false,
    toPackage = null,
    forceWorkers = false
  } = options

  const startTime = performance.now()

  // Check available memory and adjust worker count
  // For TypeScript validation - limited by memory (very memory intensive)
  const validationWorkers = forceWorkers ? parallel : getOptimalWorkerCount(parallel, 'typescript').workers
  // For bundle/package/docker-build - limited by CPU (less memory intensive)
  const buildWorkers = forceWorkers ? parallel : getOptimalWorkerCount(parallel, 'bundle').workers

  // Start CPU tracking
  const cpuTracker = new CpuTracker(100)
  cpuTracker.start()

  console.log(`Building with ${validationWorkers} validation workers, ${buildWorkers} build workers...`)

  // Build dependency graph
  const { buildDependencyGraph } = require('./libs/graph')
  const { graph, projects } = await buildDependencyGraph(rootDir, verbose)

  // Collect packages for each phase
  const packagesToTranspile = []
  const packagesToValidate = []
  const packagesToBundle = []
  const packagesToPackage = []
  const packagesToDockerBuild = []
  const packagesToLint = []
  const packagesToSvelteCheck = []

  for (const [name, node] of graph) {
    // Check if package should be included (respect --to flag)
    if (toPackage) {
      // TODO: Filter based on target package and dependencies
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

    if (doLint && node.phaseFormat) {
      packagesToLint.push(name)
    }

    if (doSvelteCheck && node.phaseSvelteCheck) {
      packagesToSvelteCheck.push(name)
    }
  }

  if (list) {
    console.log('\nPackages to process:')
    console.log(`  Transpile: ${packagesToTranspile.length}`)
    console.log(`  Validate: ${packagesToValidate.length}`)
    console.log(`  Lint: ${packagesToLint.length}`)
    console.log(`  Svelte-check: ${packagesToSvelteCheck.length}`)
    console.log(`  Bundle: ${packagesToBundle.length}`)
    console.log(`  Package: ${packagesToPackage.length}`)
    console.log(`  Docker-build: ${packagesToDockerBuild.length}`)
    return { success: true, listOnly: true }
  }

  // Phase 1: Transpile (synchronous, wait for completion)
  console.log(`\n=== Phase 1: Transpiling ${packagesToTranspile.length} packages ===`)
  const transpileResults = await runTranspilePhase(graph, packagesToTranspile, validationWorkers, { force })
  console.log(`Transpiled: ${transpileResults.successCount}/${transpileResults.total} packages in ${Math.round(transpileResults.time)}ms`)

  if (transpileResults.errors.length > 0) {
    console.error('\nTranspile errors:')
    for (const err of transpileResults.errors) {
      console.error(`  ${err.package}: ${err.error}`)
    }
    return { success: false, errors: transpileResults.errors.length }
  }

  // Create task queue for remaining phases
  // Use buildWorkers (higher) for bundle/package/docker-build
  const taskQueue = new BuildTaskQueue(graph, { concurrency: buildWorkers, verbose })

  // Add tasks to queue
  if (doValidate) {
    taskQueue.addTasks(TaskType.VALIDATE, packagesToValidate)
  }
  if (doBundle) {
    taskQueue.addTasks(TaskType.BUNDLE, packagesToBundle)
  }
  if (doPackage || doDockerBuild) {
    taskQueue.addTasks(TaskType.PACKAGE, packagesToPackage)
  }
  if (doDockerBuild) {
    taskQueue.addTasks(TaskType.DOCKER_BUILD, packagesToDockerBuild)
  }

  // Phase 2: Run validate, lint, svelte-check in parallel
  let validatePromise = null
  if (doValidate && packagesToValidate.length > 0) {
    console.log(`\n=== Starting validation (${packagesToValidate.length} packages) ===`)
    validatePromise = runValidatePhase(taskQueue, graph, packagesToValidate, validationWorkers)
  }

  let lintPromise = null
  if (doLint && packagesToLint.length > 0) {
    console.log(`\n=== Starting ESLint check (${packagesToLint.length} packages) ===`)
    lintPromise = runLintPhase(graph, packagesToLint, buildWorkers, { force })
  }

  let svelteCheckPromise = null
  if (doSvelteCheck && packagesToSvelteCheck.length > 0) {
    console.log(`\n=== Starting svelte-check (${packagesToSvelteCheck.length} packages) ===`)
    svelteCheckPromise = runSvelteCheckPhase(graph, packagesToSvelteCheck, buildWorkers, { force })
  }

  // Phase 3: Run build pipeline (bundle -> package -> docker-build)
  if (doBundle || doPackage || doDockerBuild) {
    const pipelineTasks = []
    if (doBundle) pipelineTasks.push('bundle')
    if (doPackage) pipelineTasks.push('package')
    if (doDockerBuild) pipelineTasks.push('docker-build')
    console.log(`\n=== Phase 3: Running build pipeline (${pipelineTasks.join(' -> ')}) ===`)

    const pipelineResults = await runBuildPipeline(taskQueue, graph, buildWorkers, verbose)
    console.log(`\nPipeline results:`)
    if (doBundle) {
      console.log(`  Bundled: ${pipelineResults.bundle.successCount}/${pipelineResults.bundle.total} packages`)
    }
    if (doPackage) {
      console.log(`  Packaged: ${pipelineResults.package.successCount}/${pipelineResults.package.total} packages`)
    }
    if (doDockerBuild) {
      console.log(`  Docker built: ${pipelineResults.dockerBuild.successCount}/${pipelineResults.dockerBuild.total} packages`)
    }
  }

  // Wait for validation to complete
  if (validatePromise) {
    console.log('\n=== Waiting for validation to complete ===')
    const validateResults = await validatePromise
    console.log(`Validated: ${validateResults.successCount}/${validateResults.total} packages in ${Math.round(validateResults.time)}ms`)
    if (validateResults.cacheHits > 0) {
      console.log(`  (${validateResults.cacheHits} from cache)`)
    }
  }

  // Wait for lint to complete
  if (lintPromise) {
    console.log('\n=== Waiting for ESLint check to complete ===')
    const lintResults = await lintPromise
    console.log(`Lint: ${lintResults.successCount}/${lintResults.total} packages in ${Math.round(lintResults.time)}ms`)
    if (lintResults.cacheHits > 0) {
      console.log(`  (${lintResults.cacheHits} from cache)`)
    }
    if (lintResults.errors.length > 0) {
      console.error(`  ${lintResults.errors.length} package(s) with lint errors`)
    }
  }

  // Wait for svelte-check to complete
  if (svelteCheckPromise) {
    console.log('\n=== Waiting for svelte-check to complete ===')
    const svelteResults = await svelteCheckPromise
    console.log(`Svelte-check: ${svelteResults.successCount}/${svelteResults.total} packages in ${Math.round(svelteResults.time)}ms`)
    if (svelteResults.cacheHits > 0) {
      console.log(`  (${svelteResults.cacheHits} from cache)`)
    }
    if (svelteResults.errors.length > 0) {
      console.error(`  ${svelteResults.errors.length} package(s) with svelte-check errors`)
    }
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

/**
 * Run build pipeline with smart task queue
 * Workers pull tasks dynamically based on dependencies
 */
async function runBuildPipeline(taskQueue, graph, concurrency, verbose) {
  const results = {
    bundle: { successCount: 0, total: 0, errors: [] },
    package: { successCount: 0, total: 0, errors: [] },
    dockerBuild: { successCount: 0, total: 0, errors: [] }
  }

  const completedCount = { bundle: 0, package: 0, dockerBuild: 0 }
  const totalCount = {
    bundle: taskQueue.pending.get(TaskType.BUNDLE).size,
    package: taskQueue.pending.get(TaskType.PACKAGE).size,
    dockerBuild: taskQueue.pending.get(TaskType.DOCKER_BUILD).size
  }

  // Worker function that pulls tasks from queue
  async function worker() {
    while (true) {
      const task = taskQueue.getNextTask()

      if (!task) {
        // No tasks available, check if all work is done
        if (taskQueue.isAllComplete()) {
          break
        }
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 10))
        continue
      }

      const { taskType, packageName } = task
      const node = graph.get(packageName)
      const project = { ...node.project, _node: node }

      let result
      const startTime = performance.now()

      try {
        switch (taskType) {
          case TaskType.BUNDLE:
            result = await runBundlePhase(graph, [packageName], 1)
            completedCount.bundle++
            if (result.successCount > 0) {
              results.bundle.successCount++
              const time = performance.now() - startTime
              console.log(`    [${completedCount.bundle}/${totalCount.bundle}] ${packageName} bundled in ${Math.round(time)}ms`)
            }
            break

          case TaskType.PACKAGE:
            result = await runPackagePhase(graph, [packageName], 1)
            completedCount.package++
            if (result.successCount > 0) {
              results.package.successCount++
              const time = performance.now() - startTime
              console.log(`    [${completedCount.package}/${totalCount.package}] ${packageName} packaged in ${Math.round(time)}ms`)
            }
            break

          case TaskType.DOCKER_BUILD:
            result = await runDockerBuildPhase(graph, [packageName], 1)
            completedCount.dockerBuild++
            if (result.successCount > 0) {
              results.dockerBuild.successCount++
              const time = performance.now() - startTime
              console.log(`    [${completedCount.dockerBuild}/${totalCount.dockerBuild}] ${packageName} docker built in ${Math.round(time / 1000)}s`)
            }
            break

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
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker())
  }

  await Promise.all(workers)

  return results
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
