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

const { join, relative, basename } = require('path')
const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  statSync
} = require('fs')
const { fork } = require('child_process')
const crypto = require('crypto')
const os = require('os')

/**
 * Collect source files (.ts, .js, .svelte) recursively, skipping .d.ts
 */
function collectSourceFiles(source) {
  const result = []
  if (!existsSync(source)) return result

  const files = readdirSync(source)
  for (const f of files) {
    const sourceFile = join(source, f)
    if (lstatSync(sourceFile).isDirectory()) {
      result.push(...collectSourceFiles(sourceFile))
    } else {
      const fileName = basename(sourceFile)
      if (!fileName.endsWith('.ts') && !fileName.endsWith('.js') && !fileName.endsWith('.svelte')) continue
      if (sourceFile.endsWith('.d.ts')) continue
      result.push(sourceFile)
    }
  }
  return result
}

/**
 * Calculate package hash for lint cache
 */
function calculateLintHash(cwd, srcDir) {
  const parts = []

  const srcPath = join(cwd, srcDir)
  if (existsSync(srcPath)) {
    const files = collectSourceFiles(srcPath).sort()
    for (const file of files) {
      try {
        const stat = statSync(file)
        parts.push(`${relative(cwd, file)}:${stat.mtimeMs}:${stat.size}`)
      } catch {
        // Ignore
      }
    }
  }

  for (const configFile of ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml']) {
    const configPath = join(cwd, configFile)
    if (existsSync(configPath)) {
      try {
        const stat = statSync(configPath)
        parts.push(`config:${configFile}:${stat.mtimeMs}:${stat.size}`)
      } catch {
        // Ignore
      }
      break
    }
  }

  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const stat = statSync(pkgPath)
      parts.push(`package.json:${stat.mtimeMs}:${stat.size}`)
    } catch {
      // Ignore
    }
  }

  return crypto.createHash('md5').update(parts.join('\n')).digest('hex')
}

function loadLintCache(cwd) {
  const cachePath = join(cwd, '.format', 'lint-cache.json')
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    }
  } catch {
    // Ignore
  }
  return null
}

function saveLintCache(cwd, hash, errorCount, warningCount) {
  const cacheDir = join(cwd, '.format')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  const cachePath = join(cacheDir, 'lint-cache.json')
  try {
    writeFileSync(cachePath, JSON.stringify({ hash, errorCount, warningCount, timestamp: Date.now() }), 'utf-8')
  } catch {
    // Ignore
  }
}

/**
 * Run ESLint on a single package as a child process.
 * Uses lint-process.js as a child process with generous memory.
 */
function lintPackage(cwd, srcDir, force) {
  return new Promise((resolve) => {
    const currentHash = calculateLintHash(cwd, srcDir)

    if (!force) {
      const cache = loadLintCache(cwd)
      if (cache && cache.hash === currentHash && cache.errorCount === 0) {
        resolve({ success: true, errorCount: 0, warningCount: cache.warningCount || 0, fromCache: true })
        return
      }
    }

    const srcPath = join(cwd, srcDir)
    if (!existsSync(srcPath)) {
      saveLintCache(cwd, currentHash, 0, 0)
      resolve({ success: true, errorCount: 0, warningCount: 0, fromCache: false })
      return
    }

    const files = collectSourceFiles(srcPath)
    if (files.length === 0) {
      saveLintCache(cwd, currentHash, 0, 0)
      resolve({ success: true, errorCount: 0, warningCount: 0, fromCache: false })
      return
    }

    // Fork lint-process.js as child with generous memory
    const child = fork(join(__dirname, '..', 'lint-process.js'), [], {
      cwd,
      execArgv: ['--max-old-space-size=4096'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env }
    })

    let result = null
    let stderr = ''

    child.on('message', (msg) => {
      result = msg
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('exit', (code) => {
      if (result) {
        saveLintCache(cwd, currentHash, result.errorCount || 0, result.warningCount || 0)
        resolve(result)
      } else {
        resolve({ success: false, errorCount: 1, warningCount: 0, fromCache: false, errors: [stderr || `Process exited with code ${code}`] })
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, errorCount: 1, warningCount: 0, fromCache: false, errors: [err.message] })
    })

    // Send files to lint
    child.send({ files, cwd, srcDir })
  })
}

/**
 * Compute optimal lint concurrency based on available system memory.
 * Each ESLint child process with @typescript-eslint/parser + project references
 * uses ~500MB-1.5GB depending on package size.
 */
function getLintConcurrency(requestedConcurrency) {
  const totalMemGB = os.totalmem() / (1024 * 1024 * 1024)
  const freeMemGB = os.freemem() / (1024 * 1024 * 1024)
  const cpuCount = os.cpus().length

  // Reserve 4GB for system + main process, each lint process needs ~1GB
  const memBasedMax = Math.max(1, Math.floor((freeMemGB - 4) / 1))

  // Don't exceed CPU count
  const cpuBasedMax = Math.max(1, Math.floor(cpuCount * 0.75))

  const optimal = Math.min(memBasedMax, cpuBasedMax, requestedConcurrency)
  const result = Math.max(1, optimal)

  return { concurrency: result, totalMemGB: totalMemGB.toFixed(1), freeMemGB: freeMemGB.toFixed(1), cpuCount }
}

/**
 * Run lint phase on packages with parallel child processes
 */
async function runLintPhase(graph, packageNames, concurrency, options = {}) {
  const { performance } = require('perf_hooks')
  const { force = false } = options
  const startTime = performance.now()

  const results = {
    successCount: 0,
    total: packageNames.length,
    cacheHits: 0,
    errors: [],
    time: 0,
    timings: []
  }

  let completedCount = 0

  // Compute optimal concurrency
  const { concurrency: maxConcurrency, totalMemGB, freeMemGB, cpuCount } = getLintConcurrency(concurrency)
  console.log(`    Lint concurrency: ${maxConcurrency} (CPUs: ${cpuCount}, RAM: ${totalMemGB}GB total, ${freeMemGB}GB free)`)

  const queue = [...packageNames]

  async function processNext() {
    while (queue.length > 0) {
      const packageName = queue.shift()
      const node = graph.get(packageName)
      const srcDir = node.phaseBuild === 'compile transpile tests' ? 'tests' : 'src'
      const pkgStart = performance.now()

      try {
        const result = await lintPackage(node.project.fullPath, srcDir, force)
        const pkgTime = Math.round(performance.now() - pkgStart)
        completedCount++

        if (result.success) {
          results.successCount++
          if (result.fromCache) results.cacheHits++
          const cacheInfo = result.fromCache ? ' (cached)' : ''
          const warnInfo = result.warningCount > 0 ? ` (${result.warningCount} warnings)` : ''
          console.log(`    [${completedCount}/${packageNames.length}] ${packageName} lint passed${cacheInfo}${warnInfo} ${pkgTime}ms`)
          if (!result.fromCache) {
            results.timings.push({ package: packageName, time: pkgTime })
          }
        } else {
          results.errors.push({ package: packageName, errors: result.errors, errorCount: result.errorCount })
          console.error(`    [${completedCount}/${packageNames.length}] ${packageName} lint failed (${result.errorCount} errors) ${pkgTime}ms`)
          results.timings.push({ package: packageName, time: pkgTime, failed: true })
          if (result.errors) {
            for (const err of result.errors.slice(0, 5)) {
              console.error(`      ${err}`)
            }
            if (result.errors.length > 5) {
              console.error(`      ... and ${result.errors.length - 5} more`)
            }
          }
        }
      } catch (err) {
        const pkgTime = Math.round(performance.now() - pkgStart)
        completedCount++
        results.errors.push({ package: packageName, errors: [err.message] })
        results.timings.push({ package: packageName, time: pkgTime, failed: true })
        console.error(`    [${completedCount}/${packageNames.length}] ${packageName} lint error: ${err.message} ${pkgTime}ms`)
      }
    }
  }

  // Start workers
  const workers = []
  for (let i = 0; i < maxConcurrency; i++) {
    workers.push(processNext())
  }
  await Promise.all(workers)

  results.time = performance.now() - startTime

  // Print timing summary for slow packages
  if (results.timings.length > 0) {
    const sorted = results.timings.sort((a, b) => b.time - a.time)
    const slowCount = Math.min(10, sorted.length)
    console.log(`\n    Top ${slowCount} slowest lint packages:`)
    for (let i = 0; i < slowCount; i++) {
      const t = sorted[i]
      const failInfo = t.failed ? ' FAILED' : ''
      console.log(`      ${(t.time / 1000).toFixed(1)}s ${t.package}${failInfo}`)
    }
  }

  return results
}

module.exports = { runLintPhase }
