/**
 * CPU usage tracking
 */
let lastCpuInfo = null

function getCpuTimes() {
  const cpus = require('os').cpus()
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0
  for (const cpu of cpus) {
    user += cpu.times.user
    nice += cpu.times.nice
    sys += cpu.times.sys
    idle += cpu.times.idle
    irq += cpu.times.irq
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq }
}

function startCpuTracking() {
  lastCpuInfo = getCpuTimes()
  return lastCpuInfo
}

function getCpuUsage() {
  if (!lastCpuInfo) {
    lastCpuInfo = getCpuTimes()
    return { percent: 0, user: 0, sys: 0 }
  }

  const current = getCpuTimes()
  const diff = {
    user: current.user - lastCpuInfo.user,
    nice: current.nice - lastCpuInfo.nice,
    sys: current.sys - lastCpuInfo.sys,
    idle: current.idle - lastCpuInfo.idle,
    total: current.total - lastCpuInfo.total
  }

  const percent = diff.total > 0 ? ((diff.user + diff.nice + diff.sys) / diff.total) * 100 : 0
  const userPercent = diff.total > 0 ? (diff.user / diff.total) * 100 : 0
  const sysPercent = diff.total > 0 ? (diff.sys / diff.total) * 100 : 0

  lastCpuInfo = current
  return { percent, user: userPercent, sys: sysPercent }
}

/**
 * Track CPU usage over time
 */
class CpuTracker {
  constructor(intervalMs = 100) {
    this.intervalMs = intervalMs
    this.samples = []
    this.interval = null
    this.peakPercent = 0
  }

  start() {
    startCpuTracking()
    this.samples = []
    this.peakPercent = 0
    this.interval = setInterval(() => {
      const usage = getCpuUsage()
      this.samples.push(usage)
      if (usage.percent > this.peakPercent) {
        this.peakPercent = usage.percent
      }
    }, this.intervalMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    // Get final sample
    const usage = getCpuUsage()
    this.samples.push(usage)
    if (usage.percent > this.peakPercent) {
      this.peakPercent = usage.percent
    }
  }

  getStats() {
    if (this.samples.length === 0) {
      return { avg: 0, peak: 0, min: 0 }
    }

    const percents = this.samples.map(s => s.percent)
    const avg = percents.reduce((a, b) => a + b, 0) / percents.length
    const peak = Math.max(...percents)
    const min = Math.min(...percents)

    return {
      avg: Math.round(avg * 10) / 10,
      peak: Math.round(peak * 10) / 10,
      min: Math.round(min * 10) / 10,
      samples: this.samples.length
    }
  }
}

/**
 * Get available system memory in MB
 */
function getAvailableMemoryMB() {
  const os = require('os')
  const { execSync, readFileSync } = require('child_process')
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  // On macOS/Linux, try to get more accurate available memory
  try {
    if (process.platform === 'darwin') {
      // macOS: use vm_stat
      const vmstat = execSync('vm_stat', { encoding: 'utf-8' })
      const pageSize = 4096
      const freeMatch = vmstat.match(/Pages free:\s+(\d+)/)
      const inactiveMatch = vmstat.match(/Pages inactive:\s+(\d+)/)
      if (freeMatch && inactiveMatch) {
        const freePages = parseInt(freeMatch[1], 10)
        const inactivePages = parseInt(inactiveMatch[1], 10)
        return Math.round((freePages + inactivePages) * pageSize / 1024 / 1024)
      }
    } else if (process.platform === 'linux') {
      // Linux: use /proc/meminfo
      const meminfo = readFileSync('/proc/meminfo', 'utf-8')
      const availableMatch = meminfo.match(/MemAvailable:\s+(\d+)/)
      if (availableMatch) {
        return Math.round(parseInt(availableMatch[1], 10) / 1024)
      }
    }
  } catch {
    // Fall back to simple calculation
  }

  return Math.round(freeMem / 1024 / 1024)
}

/**
 * Get smart default worker count based on system resources
 * - Default: number of CPUs (for maximum parallelism during docker-build)
 * - Limited by available memory to prevent OOM
 */
function getDefaultWorkerCount() {
  const os = require('os')
  const cpuCount = os.cpus().length
  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024)
  
  // Estimate memory per worker (docker builds use less memory than TS validation)
  const memoryPerWorker = 1000 // 1GB per docker build worker
  const maxWorkersByMemory = Math.max(1, Math.floor(totalMemMB / memoryPerWorker))
  
  // Use CPU count, but limit by memory
  return Math.min(cpuCount, maxWorkersByMemory)
}

/**
 * Determine optimal worker count based on available memory and task type
 * @param {number} requestedWorkers - Requested number of workers
 * @param {string} taskType - Type of tasks: 'typescript' | 'docker' | 'bundle' | 'default'
 */
function getOptimalWorkerCount(requestedWorkers, taskType = 'default') {
  const os = require('os')
  const availableMem = getAvailableMemoryMB()
  const cpuCount = os.cpus().length

  // Memory per worker depends on task type
  let memoryPerWorker
  switch (taskType) {
    case 'typescript':
      // TypeScript validation uses a lot of memory
      memoryPerWorker = process.platform === 'darwin' ? 1500 : 2500
      break
    case 'docker':
      // Docker builds are I/O bound, use less memory
      memoryPerWorker = 500
      break
    case 'bundle':
      // Bundle is CPU bound but uses moderate memory
      memoryPerWorker = 800
      break
    default:
      // Default conservative estimate
      memoryPerWorker = 1000
  }

  const maxWorkersByMemory = Math.max(1, Math.floor(availableMem / memoryPerWorker))

  // Use the minimum of requested, CPU count, and memory-based limit
  const optimal = Math.min(requestedWorkers, cpuCount, maxWorkersByMemory)

  return {
    workers: optimal,
    availableMemoryMB: availableMem,
    limitedByMemory: optimal < requestedWorkers && maxWorkersByMemory < requestedWorkers
  }
}

/**
 * Calculate file hash for content comparison
 */
function getFileHash(filePath) {
  const { readFileSync } = require('fs')
  const crypto = require('crypto')
  try {
    const content = readFileSync(filePath)
    return crypto.createHash('md5').update(content).digest('hex')
  } catch {
    return null
  }
}

/**
 * Recursively collect all files in a directory
 */
function collectAllFiles(dir, result = []) {
  const { readdirSync } = require('fs')
  const { join } = require('path')
  if (!require('fs').existsSync(dir)) return result

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectAllFiles(fullPath, result)
    } else {
      result.push(fullPath)
    }
  }
  return result
}

/**
 * Sync directory from source to destination, only copying changed files
 * Returns { copied: number, unchanged: number, removed: number }
 */
function syncDirectory(srcDir, destDir, options = {}) {
  const { existsSync, mkdirSync, copyFileSync, readdirSync } = require('fs')
  const { join, relative, dirname } = require('path')
  const { removeExtra = false, verbose = false } = options

  let copied = 0
  let unchanged = 0
  let removed = 0

  if (!existsSync(srcDir)) {
    return { copied, unchanged, removed }
  }

  // Ensure destination exists
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }

  // Get all source files
  const srcFiles = collectAllFiles(srcDir)
  const destFiles = new Set(collectAllFiles(destDir).map(f => relative(destDir, f)))

  for (const srcFile of srcFiles) {
    const relPath = relative(srcDir, srcFile)
    const destFile = join(destDir, relPath)

    // Remove from set to track extra files
    destFiles.delete(relPath)

    // Check if file needs to be copied
    const srcHash = getFileHash(srcFile)
    const destHash = getFileHash(destFile)

    if (srcHash !== destHash) {
      // Create directory if needed
      const destFileDir = dirname(destFile)
      if (!existsSync(destFileDir)) {
        mkdirSync(destFileDir, { recursive: true })
      }

      copyFileSync(srcFile, destFile)
      copied++

      if (verbose) {
        console.log(`  Copied: ${relPath}`)
      }
    } else {
      unchanged++
    }
  }

  // Remove extra files in destination that don't exist in source
  if (removeExtra) {
    for (const extraFile of destFiles) {
      const fullPath = join(destDir, extraFile)
      try {
        require('fs').rmSync(fullPath)
        removed++
        if (verbose) {
          console.log(`  Removed: ${extraFile}`)
        }
      } catch {
        // Ignore removal errors
      }
    }
  }

  return { copied, unchanged, removed }
}

/**
 * Clean a directory (remove it completely)
 */
function cleanDirectory(dir) {
  const { existsSync, rmSync } = require('fs')
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

module.exports = {
  CpuTracker,
  getAvailableMemoryMB,
  getDefaultWorkerCount,
  getOptimalWorkerCount,
  getFileHash,
  collectAllFiles,
  syncDirectory,
  cleanDirectory
}
