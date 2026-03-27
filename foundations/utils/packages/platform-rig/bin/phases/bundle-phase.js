/**
 * Optimized bundle phase
 * For packages using common/scripts/esbuild.js, runs esbuild directly in-process
 * For others, falls back to rushx bundle
 */

const { spawn } = require('child_process')
const { performance } = require('perf_hooks')
const { join, resolve } = require('path')
const fs = require('fs')

// Pre-compute common values once
// Scripts are in common/scripts relative to repo root
// This file is in foundations/utils/packages/platform-rig/bin/phases/
// So common/scripts is at ../../../../../common/scripts
const commonScriptsPath = resolve(__dirname, '../../../../../common/scripts')
let cachedModelVersion = null
let cachedVersion = null
let cachedGitRevision = null

function getModelVersion() {
  if (cachedModelVersion === null) {
    try {
      // Try to read version from version.txt first
      const versionFilePath = join(commonScriptsPath, 'version.txt')
      if (fs.existsSync(versionFilePath)) {
        cachedModelVersion = fs.readFileSync(versionFilePath, 'utf8').trim()
      } else {
        // Fallback to git describe
        const { execSync } = require('child_process')
        cachedModelVersion = execSync('git describe --tags --abbrev=0').toString().trim()
      }
    } catch {
      cachedModelVersion = '0.6.0'
    }
  }
  return cachedModelVersion
}

function getVersion() {
  if (cachedVersion === null) {
    try {
      const { execSync } = require('child_process')
      const stdout = execSync('git describe --tags --abbrev=0').toString().trim()
      const rawVersion = stdout.replace('v', '').replace('s', '').split('.')
      if (rawVersion.length === 3) {
        const version = {
          major: parseInt(rawVersion[0]),
          minor: parseInt(rawVersion[1]),
          patch: parseInt(rawVersion[2])
        }
        cachedVersion = `${version.major}.${version.minor}.${version.patch}`
      } else {
        cachedVersion = '0.6.0'
      }
    } catch {
      cachedVersion = '0.6.0'
    }
  }
  return cachedVersion
}

function getGitRevisionCached() {
  if (cachedGitRevision === null) {
    try {
      const { execSync } = require('child_process')
      cachedGitRevision = execSync('git describe --all --long').toString().trim()
    } catch {
      cachedGitRevision = ''
    }
  }
  return cachedGitRevision
}

// Check if bundle script uses standard esbuild
function isStandardEsbuild(bundleScript) {
  if (!bundleScript) return false
  // Check if it uses common/scripts/esbuild.js and doesn't have complex logic (&&, ||, etc.)
  return bundleScript.includes('common/scripts/esbuild.js') && 
         !bundleScript.includes('rushx ') &&
         !bundleScript.includes('&&')
}

// Parse esbuild arguments from bundle script
function parseEsbuildArgs(bundleScript, packagePath) {
  const args = {
    entryPoint: 'src/index.ts',
    outdir: 'bundle',
    platform: 'node',
    minify: false,
    keepNames: false,
    sourcemap: false,
    logLevel: 'error',
    external: ['snappy'],
    define: {}
  }

  // Extract arguments
  const argMatches = bundleScript.match(/--(\w+)=([^\s]+)/g)
  if (argMatches) {
    for (const match of argMatches) {
      const [key, value] = match.slice(2).split('=')
      switch (key) {
        case 'entry':
        case 'entryPoint':
          args.entryPoint = value
          break
        case 'minify':
          args.minify = value !== 'false'
          break
        case 'keep-names':
          args.keepNames = value !== 'false'
          break
        case 'sourcemap':
          args.sourcemap = value === 'external' ? 'external' : value !== 'false'
          break
        case 'external':
          if (!args.external.includes(value)) {
            args.external.push(value)
          }
          break
        case 'define':
          args.define[value] = true
          break
      }
    }
  }

  return args
}



// Run esbuild directly
async function runEsbuildDirect(cwd, config) {
  const esbuild = require('esbuild')
  const path = require('path')

  // Ensure output directory exists
  fs.mkdirSync(path.join(cwd, config.outdir), { recursive: true })

  // Build define object - start fresh, don't copy boolean flags
  const define = {}

  if (config.define.MODEL_VERSION) {
    const version = getModelVersion()
    if (version) {
      define['process.env.MODEL_VERSION'] = JSON.stringify(version)
    }
  }
  if (config.define.VERSION) {
    const version = getVersion()
    if (version) {
      define['process.env.VERSION'] = JSON.stringify(version)
    }
  }
  if (config.define.GIT_REVISION) {
    const revision = getGitRevisionCached()
    if (revision) {
      define['process.env.GIT_REVISION'] = JSON.stringify(revision)
    }
  }

  try {
    await esbuild.build({
      entryPoints: [path.join(cwd, config.entryPoint)],
      bundle: true,
      platform: config.platform,
      plugins: [{
        name: 'ignore-apache-arrow',
        setup(build) {
          build.onResolve({ filter: /^apache-arrow\/Arrow\.node$/ }, args => {
            return { path: args.path, namespace: 'ignore-arrow' }
          })
          build.onLoad({ filter: /.*/, namespace: 'ignore-arrow' }, args => {
            return { contents: 'module.exports = {};' }
          })
        }
      }],
      outfile: path.join(cwd, config.outdir, 'bundle.js'),
      logLevel: config.logLevel,
      minify: config.minify,
      keepNames: config.keepNames,
      sourcemap: config.sourcemap === 'external' ? 'external' : config.sourcemap,
      external: config.external,
      define
    })

    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
}

// Run bundle via rushx
async function runBundleRushx(cwd) {
  return new Promise((resolve) => {
    const startTime = performance.now()
    const child = spawn('rushx', ['bundle'], {
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
        const error = new Error(`Bundle failed with exit code ${code}`)
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

/**
 * Run bundle phase
 */
async function runBundlePhase(graph, packageNames, concurrency) {
  const results = {
    successCount: 0,
    total: packageNames.length,
    errors: [],
    time: 0
  }

  const startTime = performance.now()

  async function bundlePackage(packageName) {
    const node = graph.get(packageName)
    const cwd = node.project.fullPath
    const bundleScript = node.bundleScript

    // Skip "echo done" type scripts
    if (bundleScript?.startsWith('echo ')) {
      return { success: true, skipped: true }
    }

    // Check if we can use optimized esbuild
    if (isStandardEsbuild(bundleScript)) {
      const config = parseEsbuildArgs(bundleScript, cwd)
      console.log(`    [esbuild] ${packageName} - direct build`)
      return await runEsbuildDirect(cwd, config)
    }

    // Fall back to rushx bundle
    console.log(`    [rushx] ${packageName} - using rushx bundle`)
    return await runBundleRushx(cwd)
  }

  // Process packages
  const promises = packageNames.map(async (name) => {
    const result = await bundlePackage(name)
    if (result.success) {
      results.successCount++
    } else {
      results.errors.push({ package: name, error: result.error })
    }
    return result
  })

  await Promise.all(promises)
  results.time = performance.now() - startTime
  
  return results
}

module.exports = { runBundlePhase, isStandardEsbuild }
