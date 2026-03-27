/**
 * Transpile phase - synchronous execution
 * Fast esbuild transpilation with change detection
 */

const { readFileSync, writeFileSync, existsSync, lstatSync, readdirSync } = require('fs')
const { join } = require('path')
const crypto = require('crypto')

/**
 * Collect file signatures (mtime:size) for change detection
 */
function collectFileSignatures(dir) {
  const signatures = {}
  if (!existsSync(dir)) return signatures

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      Object.assign(signatures, collectFileSignatures(fullPath))
    } else {
      const ext = entry.name
      if (!ext.endsWith('.ts') && !ext.endsWith('.js') && !ext.endsWith('.svelte') && !ext.endsWith('.json')) {
        continue
      }
      try {
        const stat = lstatSync(fullPath)
        signatures[fullPath] = `${stat.mtimeMs}:${stat.size}`
      } catch {
        // Ignore stat errors
      }
    }
  }
  return signatures
}

/**
 * Compute a hash of file signatures for a package
 */
function computePackageHash(packagePath, srcDir) {
  const srcPath = join(packagePath, srcDir)
  const signatures = collectFileSignatures(srcPath)

  // Also include package.json mtime
  try {
    const pkgStat = lstatSync(join(packagePath, 'package.json'))
    signatures['package.json'] = `${pkgStat.mtimeMs}:${pkgStat.size}`
  } catch {
    // Ignore
  }

  const sortedKeys = Object.keys(signatures).sort()
  const content = sortedKeys.map(k => `${k}=${signatures[k]}`).join('\n')
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * Load transpile cache for a package
 */
function loadTranspileCache(packagePath) {
  const cachePath = join(packagePath, '.fast-build-cache.json')
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    }
  } catch {
    // Ignore corrupted cache
  }
  return null
}

/**
 * Save transpile cache for a package
 */
function saveTranspileCache(packagePath, hash) {
  const cachePath = join(packagePath, '.fast-build-cache.json')
  try {
    writeFileSync(cachePath, JSON.stringify({ hash, timestamp: Date.now() }), 'utf-8')
  } catch {
    // Ignore write errors
  }
}

async function runTranspilePhase(graph, packageNames, concurrency, options = {}) {
  const { force = false } = options
  const { performance } = require('perf_hooks')
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

    // Check if any dependency changed
    const hasUpstreamChanges = [...node.dependencies]
      .filter(d => packageNames.includes(d))
      .some(d => upstreamChanged.has(d))

    // Compute current hash
    const currentHash = computePackageHash(packagePath, srcDir)
    const cache = loadTranspileCache(packagePath)

    // Check if lib/ directory exists (must rebuild if not)
    const libExists = existsSync(join(packagePath, 'lib'))

    // Skip if no changes and no upstream changes and lib exists
    if (!force && cache && cache.hash === currentHash && !hasUpstreamChanges && libExists) {
      return { success: true, filesCount: 0, skipped: true }
    }

    try {
      const filesToTranspile = collectFiles(join(packagePath, srcDir))
      if (filesToTranspile.length === 0) {
        saveTranspileCache(packagePath, currentHash)
        return { success: true, filesCount: 0 }
      }

      const relativeFiles = filesToTranspile.map(f => f.replace(packagePath + '/', ''))

      if (isUiEsbuild) {
        await performESBuildWithSvelte(filesToTranspile, { cwd: packagePath })
        await generateSvelteTypes({ cwd: packagePath })
      } else {
        await performESBuild(relativeFiles, { srcDir, cwd: packagePath, outDir: 'lib' })
      }

      // Save cache after successful build
      saveTranspileCache(packagePath, currentHash)

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

module.exports = { runTranspilePhase, computePackageHash, collectFileSignatures }
