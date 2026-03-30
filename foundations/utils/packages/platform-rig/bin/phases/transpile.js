/**
 * Transpile phase - synchronous execution
 * Fast esbuild transpilation with change detection
 */

const { join } = require('path')
const { existsSync } = require('fs')
const { performance } = require('perf_hooks')

const { 
  isPhaseCached, 
  markPhaseCompleted,
  invalidateCache 
} = require('../libs/cache')

async function runTranspilePhase(graph, packageNames, concurrency, options = {}) {
  const { force = false, packageHashes } = options
  const { collectFiles, performESBuild, performESBuildWithSvelte, generateSvelteTypes } = require('../compile.js')

  const startTime = performance.now()
  const results = {
    successCount: 0,
    skippedCount: 0,
    total: packageNames.length,
    errors: [],
    time: 0,
    changedPackages: new Set()
  }

  // Group packages by waves based on dependencies
  const pending = new Set(packageNames)
  const completed = new Set()
  let completedCount = 0

  // Track which packages had upstream changes (need rebuild even if own src unchanged)
  const upstreamChanged = new Set()

  async function transpilePackage(packageName) {
    const node = graph.get(packageName)
    const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'
    const isUiEsbuild = node.phaseBuild === 'compile ui-esbuild'
    const packagePath = node.project.fullPath

    // Get pre-calculated package hash
    const packageHash = packageHashes?.get(packageName)
    if (!packageHash) {
      // Fallback: if no hash provided, always build
      console.log(`    Warning: No hash for ${packageName}, forcing build`)
    }

    // Check if any dependency changed
    const hasUpstreamChanges = [...node.dependencies]
      .filter(d => packageNames.includes(d))
      .some(d => upstreamChanged.has(d))

    // Check if lib/ directory exists (must rebuild if not)
    const libExists = existsSync(join(packagePath, 'lib'))

    // Skip if cached and no upstream changes and lib exists
    if (!force && !hasUpstreamChanges && libExists && packageHash) {
      if (isPhaseCached(packagePath, packageHash, 'transpile')) {
        return { success: true, filesCount: 0, skipped: true }
      }
    }

    // Invalidate cache if force or upstream changes
    if (force || hasUpstreamChanges) {
      invalidateCache(packagePath)
    }

    try {
      const filesToTranspile = collectFiles(join(packagePath, srcDir))
      if (filesToTranspile.length === 0) {
        if (packageHash) {
          markPhaseCompleted(packagePath, packageHash, 'transpile')
        }
        return { success: true, filesCount: 0 }
      }

      const relativeFiles = filesToTranspile.map(f => f.replace(packagePath + '/', ''))

      if (isUiEsbuild) {
        await performESBuildWithSvelte(filesToTranspile, { cwd: packagePath })
        await generateSvelteTypes({ cwd: packagePath })
      } else {
        await performESBuild(relativeFiles, { srcDir, cwd: packagePath, outDir: 'lib' })
      }

      // Mark phase as completed
      if (packageHash) {
        markPhaseCompleted(packagePath, packageHash, 'transpile')
      }

      // Mark this package as changed
      upstreamChanged.add(packageName)
      results.changedPackages.add(packageName)

      return { success: true, filesCount: relativeFiles.length }
    } catch (err) {
      return { success: false, error: err }
    }
  }

  // Process in dependency order waves
  while (completed.size < packageNames.length) {
    // Find packages ready to transpile (all deps completed)
    const ready = []
    for (const name of pending) {
      const node = graph.get(name)
      const depsCompleted = [...node.dependencies].filter(d => packageNames.includes(d))
        .every(d => completed.has(d))
      if (depsCompleted) {
        ready.push(name)
      }
    }

    if (ready.length === 0) {
      throw new Error('Circular dependency detected in transpile phase')
    }

    // Transpile ready packages in parallel
    const transpilePromises = ready.map(async (name) => {
      const result = await transpilePackage(name)
      completedCount++

      if (result.success) {
        if (result.skipped) {
          results.skippedCount++
          results.successCount++
        } else {
          results.successCount++
          const svelteInfo = graph.get(name).phaseBuild === 'compile ui-esbuild' ? ' (svelte)' : ''
          console.log(`    [${completedCount}/${packageNames.length}] ${name} transpiled${svelteInfo} (${result.filesCount} files)`)
        }
      } else {
        results.errors.push({ package: name, error: result.error })
        console.error(`    [${completedCount}/${packageNames.length}] ${name} transpile failed: ${result.error.message}`)
      }

      completed.add(name)
      pending.delete(name)
    })

    await Promise.all(transpilePromises)
  }

  if (results.skippedCount > 0) {
    console.log(`    (${results.skippedCount} packages unchanged, skipped)`)
  }

  results.time = performance.now() - startTime
  return results
}

module.exports = { runTranspilePhase }
