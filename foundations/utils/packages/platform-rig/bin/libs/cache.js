/**
 * Common caching utilities for fast-build phases
 * Provides unified package hash calculation and phase-based caching
 */

const { join } = require('path')
const fs = require('fs')
const crypto = require('crypto')

/**
 * Collect file signatures (mtime:size) recursively
 * @param {string} dir - Directory to scan
 * @param {Set<string>} [extensions] - Optional set of file extensions to include (e.g., ['.ts', '.js'])
 * @returns {Object} Map of file paths to signatures
 */
function collectFileSignatures(dir, extensions = null) {
  const signatures = {}
  if (!fs.existsSync(dir)) return signatures

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      Object.assign(signatures, collectFileSignatures(fullPath, extensions))
    } else {
      // Skip if extensions filter is provided and file doesn't match
      if (extensions && !extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        continue
      }
      try {
        const stat = fs.lstatSync(fullPath)
        signatures[fullPath] = `${stat.mtimeMs}:${stat.size}`
      } catch {
        // Ignore stat errors
      }
    }
  }
  return signatures
}

/**
 * Calculate unified package hash based on all source inputs
 * This hash is used across all phases to detect changes
 * 
 * Includes:
 * - src/ directory (source files)
 * - package.json
 * - tsconfig.json (if exists)
 * - Any additional config files provided
 * 
 * @param {string} packagePath - Path to package directory
 * @param {string[]} [extraFiles] - Additional files to include in hash
 * @returns {string} MD5 hash
 */
function calculatePackageHash(packagePath, extraFiles = []) {
  const parts = []

  // Hash src/ directory
  const srcPath = join(packagePath, 'src')
  if (fs.existsSync(srcPath)) {
    const srcExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.svelte', '.json'])
    const sigs = collectFileSignatures(srcPath, srcExtensions)
    const sortedKeys = Object.keys(sigs).sort()
    for (const key of sortedKeys) {
      parts.push(`src:${key}=${sigs[key]}`)
    }
  }

  // Hash tests/ directory if exists
  const testsPath = join(packagePath, 'tests')
  if (fs.existsSync(testsPath)) {
    const testExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json'])
    const sigs = collectFileSignatures(testsPath, testExtensions)
    const sortedKeys = Object.keys(sigs).sort()
    for (const key of sortedKeys) {
      parts.push(`tests:${key}=${sigs[key]}`)
    }
  }

  // Include package.json
  const pkgPath = join(packagePath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const stat = fs.statSync(pkgPath)
      parts.push(`package.json:${stat.mtimeMs}:${stat.size}`)
    } catch { /* ignore */ }
  }

  // Include tsconfig.json if exists
  const tsconfigPath = join(packagePath, 'tsconfig.json')
  if (fs.existsSync(tsconfigPath)) {
    try {
      const stat = fs.statSync(tsconfigPath)
      parts.push(`tsconfig.json:${stat.mtimeMs}:${stat.size}`)
    } catch { /* ignore */ }
    }

  // Include extra files
  for (const file of extraFiles) {
    const filePath = join(packagePath, file)
    if (fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath)
        parts.push(`${file}:${stat.mtimeMs}:${stat.size}`)
      } catch { /* ignore */ }
    }
  }

  return crypto.createHash('md5').update(parts.join('\n')).digest('hex')
}

/**
 * Load package cache from .fast-build-cache.json
 * @param {string} packagePath - Path to package directory
 * @returns {Object|null} Cache object or null
 */
function loadPackageCache(packagePath) {
  const cachePath = join(packagePath, '.fast-build-cache.json')
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    }
  } catch { /* ignore corrupted cache */ }
  return null
}

/**
 * Save package cache to .fast-build-cache.json
 * @param {string} packagePath - Path to package directory
 * @param {Object} cache - Cache object to save
 */
function savePackageCache(packagePath, cache) {
  const cachePath = join(packagePath, '.fast-build-cache.json')
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  } catch { /* ignore write errors */ }
}

/**
 * Check if a phase is cached and valid
 * @param {string} packagePath - Path to package directory
 * @param {string} packageHash - Current package hash
 * @param {string} phase - Phase name (e.g., 'transpile', 'bundle', 'package', 'docker-build')
 * @param {Function} [outputCheck] - Optional function to verify output exists
 * @returns {boolean} True if phase is cached and valid
 */
function isPhaseCached(packagePath, packageHash, phase, outputCheck = null) {
  const cache = loadPackageCache(packagePath)
  if (!cache) return false
  if (cache.hash !== packageHash) return false
  if (!cache.phases || !cache.phases[phase]) return false
  
  // Run optional output check
  if (outputCheck && !outputCheck(packagePath)) {
    return false
  }
  
  return true
}

/**
 * Mark a phase as completed in cache
 * @param {string} packagePath - Path to package directory
 * @param {string} packageHash - Current package hash
 * @param {string} phase - Phase name
 * @param {Object} [metadata] - Optional metadata to store (e.g., { errorCount: 0, warningCount: 5 })
 */
function markPhaseCompleted(packagePath, packageHash, phase, metadata = null) {
  let cache = loadPackageCache(packagePath)

  // If hash changed or no cache, start fresh
  if (!cache || cache.hash !== packageHash) {
    cache = {
      hash: packageHash,
      timestamp: Date.now(),
      phases: {}
    }
  }

  if (!cache.phases) {
    cache.phases = {}
  }

  cache.phases[phase] = {
    completedAt: Date.now(),
    ...metadata
  }

  savePackageCache(packagePath, cache)
}

/**
 * Get phase metadata from cache
 * @param {string} packagePath - Path to package directory
 * @param {string} packageHash - Current package hash
 * @param {string} phase - Phase name
 * @returns {Object|null} Phase metadata or null if not cached
 */
function getPhaseMetadata(packagePath, packageHash, phase) {
  const cache = loadPackageCache(packagePath)
  if (!cache || cache.hash !== packageHash) return null
  if (!cache.phases || !cache.phases[phase]) return null
  return cache.phases[phase]
}

/**
 * Get list of completed phases for a package
 * @param {string} packagePath - Path to package directory
 * @param {string} packageHash - Current package hash
 * @returns {string[]} Array of completed phase names
 */
function getCompletedPhases(packagePath, packageHash) {
  const cache = loadPackageCache(packagePath)
  if (!cache || cache.hash !== packageHash) return []
  return Object.keys(cache.phases || {})
}

/**
 * Invalidate all caches for a package (when force rebuilding)
 * @param {string} packagePath - Path to package directory
 */
function invalidateCache(packagePath) {
  const cachePath = join(packagePath, '.fast-build-cache.json')
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath)
    }
  } catch { /* ignore */ }
}

module.exports = {
  collectFileSignatures,
  calculatePackageHash,
  loadPackageCache,
  savePackageCache,
  isPhaseCached,
  markPhaseCompleted,
  getPhaseMetadata,
  getCompletedPhases,
  invalidateCache
}
