#!/usr/bin/env node

/**
 * Copyright © 2026 Intabia Fusion.
 *
 * Licensed under the Eclipse Public License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may
 * obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { resolve, join, relative } = require('path')
const { existsSync, watch, readdirSync, lstatSync } = require('fs')
const { performance } = require('perf_hooks')

const { buildDependencyGraph, getAllDependencies } = require('./lib/graph')
const { getDefaultWorkerCount, getOptimalWorkerCount } = require('./lib/utils')
const { runTranspilePhase } = require('./phases/transpile')
const { getWorkerPool, terminateWorkerPool } = require('./lib/workers')
const { runLintPhase } = require('./phases/lint')
const { runSvelteCheckPhase } = require('./phases/svelte-check')

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  let parallel = getDefaultWorkerCount()
  let verbose = false
  let doValidate = false
  let doLint = false
  let doSvelteCheck = false
  let force = false
  let toPackage = null
  let rootDir = ''
  let debounceMs = 300

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--parallel' || arg === '-p') {
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        parallel = parseInt(next, 10)
        if (isNaN(parallel) || parallel < 1) parallel = 1
        i++
      } else {
        parallel = require('os').cpus().length
      }
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true
    } else if (arg === '--validate') {
      doValidate = true
    } else if (arg === '--lint') {
      doLint = true
    } else if (arg === '--svelte-check') {
      doSvelteCheck = true
    } else if (arg === '--force' || arg === '-f') {
      force = true
    } else if (arg === '--to') {
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        toPackage = next
        i++
      }
    } else if (arg === '--debounce') {
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        debounceMs = parseInt(next, 10)
        if (isNaN(debounceMs) || debounceMs < 50) debounceMs = 50
        i++
      }
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else if (!arg.startsWith('-')) {
      rootDir = arg
    }
  }

  // Read Rush custom parameters from environment variables
  if (!toPackage) {
    toPackage = process.env.RUSH_TO || process.env.TO || null
  }
  if (!verbose) {
    verbose = process.env.RUSH_VERBOSE === '1' || process.env.VERBOSE === '1'
  }

  return { parallel, verbose, doValidate, doLint, doSvelteCheck, force, toPackage, rootDir, debounceMs }
}

function printUsage() {
  console.log(`
Usage: watch_all <rootDir> [options]

Arguments:
  rootDir                Root directory of the Rush monorepo

Options:
  --parallel, -p <n>     Number of parallel workers (default: auto)
  --verbose, -v          Show detailed output
  --validate             Also run TypeScript validation after transpile
  --lint                 Also run ESLint check (no fix) after transpile
  --svelte-check         Also run svelte-check after transpile
  --force, -f            Disable all caching (forces full rebuild)
  --to <package>         Only watch the specified package and its dependencies
  --debounce <ms>        Debounce interval in ms (default: 300)
  --help, -h             Show this help message

Description:
  Watches all Rush packages for file changes and triggers incremental
  rebuilds using esbuild. Only changed packages and their dependents
  are rebuilt.

Examples:
  watch_all .
  watch_all . --validate
  watch_all . --to @hcengineering/core --verbose
`)
}

/**
 * Recursively watch a directory for changes
 * Returns an array of watchers that can be closed
 */
function watchDirectory(dir, callback) {
  const watchers = []
  if (!existsSync(dir)) return watchers

  try {
    // Watch the directory itself (recursive on macOS, manual on Linux)
    const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && isSourceFile(filename)) {
        callback(eventType, join(dir, filename))
      }
    })
    watchers.push(watcher)
  } catch {
    // Fallback: watch subdirectories individually (Linux without recursive support)
    try {
      const watcher = watch(dir, (eventType, filename) => {
        if (filename && isSourceFile(filename)) {
          callback(eventType, join(dir, filename))
        }
      })
      watchers.push(watcher)
    } catch {
      // Ignore watch errors for inaccessible directories
    }

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          watchers.push(...watchDirectory(join(dir, entry.name), callback))
        }
      }
    } catch {
      // Ignore
    }
  }

  return watchers
}

function isSourceFile(filename) {
  return filename.endsWith('.ts') || filename.endsWith('.js') ||
    filename.endsWith('.svelte') || filename.endsWith('.json')
}

/**
 * Build a reverse dependency map: package -> all packages that depend on it (transitively)
 */
function buildReverseDependencyMap(graph, packageNames) {
  const reverseMap = new Map()

  for (const name of packageNames) {
    reverseMap.set(name, new Set())
  }

  for (const name of packageNames) {
    const node = graph.get(name)
    for (const dep of node.dependencies) {
      if (reverseMap.has(dep)) {
        reverseMap.get(dep).add(name)
      }
    }
  }

  // Compute transitive dependents
  const transitiveDependents = new Map()
  for (const name of packageNames) {
    const result = new Set()
    const queue = [name]
    while (queue.length > 0) {
      const current = queue.shift()
      const directDependents = reverseMap.get(current)
      if (directDependents) {
        for (const dep of directDependents) {
          if (!result.has(dep)) {
            result.add(dep)
            queue.push(dep)
          }
        }
      }
    }
    transitiveDependents.set(name, result)
  }

  return transitiveDependents
}

/**
 * Run validation directly using worker pool (no TaskQueue dependency)
 */
async function runValidation(pool, graph, packageNames) {
  const validateStart = performance.now()
  let successCount = 0
  let cacheHits = 0
  let errorCount = 0
  let completedCount = 0

  // Run validations in parallel (pool handles concurrency)
  const promises = packageNames.map(async (packageName) => {
    const node = graph.get(packageName)
    const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'

    try {
      const result = await pool.validate(node.project.fullPath, { srcDir, watchMode: true })
      completedCount++
      if (result.success) {
        successCount++
        if (result.fromCache) cacheHits++
        const cacheInfo = result.fromCache ? ' (cached)' : ''
        console.log(`    [${completedCount}/${packageNames.length}] ${packageName} validated${cacheInfo}`)
      } else {
        errorCount++
        console.error(`    [${completedCount}/${packageNames.length}] ${packageName} validation failed: ${result.error?.message || 'unknown'}`)
      }
    } catch (err) {
      completedCount++
      errorCount++
      console.error(`    [${completedCount}/${packageNames.length}] ${packageName} validation error: ${err.message}`)
    }
  })

  await Promise.all(promises)

  const elapsed = Math.round(performance.now() - validateStart)
  console.log(`Validated: ${successCount}/${packageNames.length} in ${elapsed}ms${cacheHits > 0 ? ` (${cacheHits} from cache)` : ''}`)
  if (errorCount > 0) {
    console.log(`  ${errorCount} validation error(s)`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

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

  const validationWorkers = getOptimalWorkerCount(options.parallel, 'typescript').workers

  console.log('Building dependency graph...')
  const { graph } = await buildDependencyGraph(rootDir, options.verbose)

  // Collect packages to watch
  const packagesToWatch = []
  const packagesToValidate = []
  const packagesToLint = []
  const packagesToSvelteCheck = []
  const packageByPath = new Map()

  for (const [name, node] of graph) {
    if (node.phaseBuild === 'compile transpile src' ||
      node.phaseBuild === 'compile transpile tests' ||
      node.phaseBuild === 'compile ui-esbuild') {

      // Filter by --to if specified
      if (options.toPackage) {
        const targetDeps = getAllDependencies(graph, options.toPackage)
        if (name !== options.toPackage && !targetDeps.has(name)) {
          continue
        }
      }

      packagesToWatch.push(name)

      const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'
      const srcPath = join(node.project.fullPath, srcDir)
      packageByPath.set(srcPath, name)
      packageByPath.set(node.project.fullPath, name)

      if (options.doValidate && node.phaseValidate === 'compile validate') {
        packagesToValidate.push(name)
      }

      if (options.doLint && node.phaseFormat) {
        packagesToLint.push(name)
      }

      if (options.doSvelteCheck && node.phaseSvelteCheck) {
        packagesToSvelteCheck.push(name)
      }
    }
  }

  // Build reverse dependency map
  const reverseDeps = buildReverseDependencyMap(graph, packagesToWatch)

  console.log(`\nWatching ${packagesToWatch.length} packages for changes...`)
  if (options.doValidate) {
    console.log(`Validation enabled for ${packagesToValidate.length} packages`)
  }
  if (options.doLint) {
    console.log(`Lint enabled for ${packagesToLint.length} packages`)
  }
  if (options.doSvelteCheck) {
    console.log(`Svelte-check enabled for ${packagesToSvelteCheck.length} packages`)
  }

  // Initialize validation worker pool if needed
  let validationPool = null
  if (options.doValidate && packagesToValidate.length > 0) {
    console.log(`Initializing validation worker pool (${validationWorkers} workers)...`)
    validationPool = await getWorkerPool(validationWorkers)
    await validationPool.setWatchMode()
  }


  // Initial full build
  console.log('\n=== Initial build ===')
  const initialStart = performance.now()
  const transpileResult = await runTranspilePhase(graph, packagesToWatch, validationWorkers, { force: options.force })
  console.log(`Initial transpile: ${transpileResult.successCount}/${transpileResult.total} in ${Math.round(performance.now() - initialStart)}ms`)

  if (transpileResult.errors.length > 0) {
    console.error('Initial build errors:')
    for (const err of transpileResult.errors) {
      console.error(`  ${err.package}: ${err.error.message}`)
    }
  }

  // Run initial validation first (lint/svelte-check depend on it)
  if (validationPool && packagesToValidate.length > 0) {
    console.log(`\n=== Initial validation (${packagesToValidate.length} packages) ===`)
    await runValidation(validationPool, graph, packagesToValidate)
  }

  // Run lint and svelte-check in parallel (after validate)
  const postValidateChecks = []

  if (options.doLint && packagesToLint.length > 0) {
    console.log(`\n=== Initial ESLint check (${packagesToLint.length} packages) ===`)
    postValidateChecks.push(runLintPhase(graph, packagesToLint, validationWorkers, { force: options.force }))
  }

  if (options.doSvelteCheck && packagesToSvelteCheck.length > 0) {
    console.log(`\n=== Initial svelte-check (${packagesToSvelteCheck.length} packages) ===`)
    postValidateChecks.push(runSvelteCheckPhase(graph, packagesToSvelteCheck, validationWorkers, { force: options.force }))
  }

  if (postValidateChecks.length > 0) {
    await Promise.all(postValidateChecks)
  }

  console.log('\n=== Watching for changes (Ctrl+C to stop) ===\n')

  // Debounced rebuild
  let pendingChanges = new Set()
  let rebuildTimer = null
  let isRebuilding = false

  function scheduleRebuild() {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
    }

    rebuildTimer = setTimeout(async () => {
      if (isRebuilding) {
        // Re-schedule if currently building
        scheduleRebuild()
        return
      }

      isRebuilding = true
      const changedPackages = new Set(pendingChanges)
      pendingChanges.clear()

      // Expand to include all dependents
      const packagesToRebuild = new Set(changedPackages)
      for (const pkg of changedPackages) {
        const dependents = reverseDeps.get(pkg)
        if (dependents) {
          for (const dep of dependents) {
            packagesToRebuild.add(dep)
          }
        }
      }

      // Sort by dependency order (packages in packagesToWatch order)
      const orderedPackages = packagesToWatch.filter(p => packagesToRebuild.has(p))

      if (orderedPackages.length === 0) {
        isRebuilding = false
        return
      }

      const changeList = [...changedPackages].map(p => p.replace(/@hcengineering\//g, '')).join(', ')
      console.log(`\n--- Change detected in: ${changeList} ---`)
      console.log(`Rebuilding ${orderedPackages.length} package(s)...`)

      const rebuildStart = performance.now()
      try {
        const result = await runTranspilePhase(graph, orderedPackages, validationWorkers)
        const elapsed = Math.round(performance.now() - rebuildStart)

        if (result.errors.length > 0) {
          for (const err of result.errors) {
            console.error(`  ERROR: ${err.package}: ${err.error.message}`)
          }
          console.log(`Rebuild completed with errors in ${elapsed}ms`)
        } else {
          const rebuilt = result.successCount - result.skippedCount
          console.log(`Rebuilt ${rebuilt} package(s) in ${elapsed}ms`)
        }

        // Run checks on rebuilt packages: validate first, then lint/svelte-check
        if (result.errors.length === 0) {
          // Validate first (lint/svelte-check depend on types)
          if (validationPool) {
            const pkgs = orderedPackages.filter(p => packagesToValidate.includes(p))
            if (pkgs.length > 0) {
              console.log(`Validating ${pkgs.length} package(s)...`)
              await runValidation(validationPool, graph, pkgs)
            }
          }

          // Then lint and svelte-check in parallel
          const postChecks = []

          if (options.doLint) {
            const pkgs = orderedPackages.filter(p => packagesToLint.includes(p))
            if (pkgs.length > 0) {
              console.log(`Linting ${pkgs.length} package(s)...`)
              postChecks.push(runLintPhase(graph, pkgs, validationWorkers))
            }
          }

          if (options.doSvelteCheck) {
            const pkgs = orderedPackages.filter(p => packagesToSvelteCheck.includes(p))
            if (pkgs.length > 0) {
              console.log(`Svelte-checking ${pkgs.length} package(s)...`)
              postChecks.push(runSvelteCheckPhase(graph, pkgs, validationWorkers))
            }
          }

          if (postChecks.length > 0) {
            await Promise.all(postChecks)
          }
        }
      } catch (err) {
        console.error(`Rebuild failed: ${err.message}`)
      }

      isRebuilding = false

      // Check if more changes accumulated during rebuild
      if (pendingChanges.size > 0) {
        scheduleRebuild()
      }
    }, options.debounceMs)
  }

  // Set up watchers for all packages
  const allWatchers = []

  for (const packageName of packagesToWatch) {
    const node = graph.get(packageName)
    const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'
    const srcPath = join(node.project.fullPath, srcDir)

    if (!existsSync(srcPath)) continue

    const watchers = watchDirectory(srcPath, (eventType, filePath) => {
      if (options.verbose) {
        const relPath = relative(rootDir, filePath)
        console.log(`  [${eventType}] ${relPath}`)
      }

      pendingChanges.add(packageName)
      scheduleRebuild()
    })

    allWatchers.push(...watchers)
  }

  // Handle graceful shutdown
  async function cleanup() {
    for (const watcher of allWatchers) {
      try {
        watcher.close()
      } catch {
        // Ignore
      }
    }
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
    }
    if (validationPool) {
      try {
        await terminateWorkerPool()
      } catch {
        // Ignore
      }
    }
  }

  process.on('SIGINT', async () => {
    console.log('\n\nStopping watchers...')
    await cleanup()
    console.log('Done.')
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await cleanup()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
