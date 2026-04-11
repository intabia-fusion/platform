const { Worker } = require('worker_threads')
const { join } = require('path')

let workerPool = null
const namedPools = new Map()

class GenericWorkerPool {
  constructor(size, workerPath, poolOptions = {}) {
    this.size = size
    this.workers = []
    this.available = []
    this.pending = []
    this.taskId = 0
    this.callbacks = new Map()
    this.workerPath = workerPath
    this.workerMemory = new Map()
    this.workerStats = new Map()
    this.taskTimings = new Map()
    this.workerOptions = poolOptions.workerOptions || {}
    this.workerCurrentTask = new Map()
    this.terminated = false
    this.recycleAfter = poolOptions.recycleAfter || 0 // 0 = never recycle by count
    this.recycleMemoryMB = poolOptions.recycleMemoryMB || 0 // 0 = never recycle by memory
    this.workerTaskCount = new Map()
  }

  _spawnWorker(i) {
    const worker = new Worker(this.workerPath, this.workerOptions)
    worker._workerId = i
    this.workerStats.set(i, { totalIdleTime: 0, totalWorkTime: 0, taskCount: 0, lastTaskCompletedAt: null })
    this.workerTaskCount.set(i, 0)

    const readyPromise = new Promise((resolve) => {
      const onMessage = (msg) => {
        if (msg.type === 'ready') {
          worker.off('message', onMessage)
          if (msg.memory) {
            this.workerMemory.set(i, msg.memory)
          }
          resolve()
        }
      }
      worker.on('message', onMessage)
    })

    worker.on('message', (msg) => {
      if (msg.id !== undefined) {
        const callback = this.callbacks.get(msg.id)
        if (callback) {
          this.callbacks.delete(msg.id)
          callback(msg)
        }

        const timing = this.taskTimings.get(msg.id)
        if (timing) {
          const completedAt = performance.now()
          const workTime = completedAt - timing.startedAt
          const stats = this.workerStats.get(timing.workerId)
          if (stats) {
            stats.totalWorkTime += workTime
            stats.taskCount++
            stats.lastTaskCompletedAt = completedAt
          }
          this.taskTimings.delete(msg.id)
        }

        if (msg.memory && msg.threadId !== undefined) {
          this.workerMemory.set(msg.threadId, msg.memory.after || msg.memory)
        }

        const count = (this.workerTaskCount.get(i) || 0) + 1
        this.workerTaskCount.set(i, count)

        const memMB = msg.memoryMB || 0
        const needRecycle =
          (this.recycleAfter > 0 && count >= this.recycleAfter) ||
          (this.recycleMemoryMB > 0 && memMB >= this.recycleMemoryMB)

        if (needRecycle && !this.terminated) {
          this._recycleWorker(i)
        } else {
          this.available.push(worker)
          this._processNext()
        }
      }
    })

    worker.on('error', (err) => {
      this._failWorkerTask(i, err)
    })

    worker.on('exit', (code) => {
      if (this.terminated) return
      if (code !== 0) {
        this._failWorkerTask(i, new Error(`Worker ${i} exited with code ${code}`))
      }
    })

    this.workers[i] = worker
    return readyPromise
  }

  async _recycleWorker(i) {
    const oldWorker = this.workers[i]
    if (!oldWorker) return
    try { oldWorker.postMessage({ type: 'exit' }) } catch {}
    try { await oldWorker.terminate() } catch {}
    this.workerTaskCount.set(i, 0)
    const ready = this._spawnWorker(i)
    await ready
    this.available.push(this.workers[i])
    this._processNext()
  }

  async init() {
    const readyPromises = []
    for (let i = 0; i < this.size; i++) {
      readyPromises.push(this._spawnWorker(i))
    }
    await Promise.all(readyPromises)
    this.available = this.workers.filter(w => w !== null).slice()
  }

  _failWorkerTask(workerId, err) {
    const taskId = this.workerCurrentTask.get(workerId)
    if (taskId !== undefined) {
      const callback = this.callbacks.get(taskId)
      this.callbacks.delete(taskId)
      this.taskTimings.delete(taskId)
      this.workerCurrentTask.delete(workerId)
      if (callback) {
        callback({ success: false, error: err.message || String(err) })
      }
    }
    // Remove dead worker from available pool; fail pending tasks if no workers remain
    const worker = this.workers[workerId]
    if (worker) {
      const idx = this.available.indexOf(worker)
      if (idx >= 0) this.available.splice(idx, 1)
      this.workers[workerId] = null
    }
    const aliveCount = this.workers.filter(w => w !== null).length
    if (aliveCount === 0 && this.pending.length > 0) {
      const pendingErr = new Error('All workers died, cannot process remaining tasks')
      while (this.pending.length > 0) {
        const { resolve } = this.pending.shift()
        resolve({ success: false, error: pendingErr.message })
      }
    }
  }

  _processNext() {
    if (this.pending.length > 0 && this.available.length > 0) {
      const { task, resolve, reject } = this.pending.shift()
      const worker = this.available.shift()
      const workerId = worker._workerId
      const startedAt = performance.now()

      const stats = this.workerStats.get(workerId)
      if (stats && stats.lastTaskCompletedAt !== null) {
        const idleTime = startedAt - stats.lastTaskCompletedAt
        stats.totalIdleTime += idleTime
      }

      this.taskTimings.set(task.id, { startedAt, workerId })
      this.workerCurrentTask.set(workerId, task.id)

      const wrappedResolve = (value) => {
        this.workerCurrentTask.delete(workerId)
        resolve(value)
      }

      this.callbacks.set(task.id, (result) => {
        if (task.type === 'validate') {
          if (result.success) {
            wrappedResolve({
              success: true,
              skipped: result.skipped || false,
              fromCache: result.fromCache || false,
              typesHash: result.typesHash,
              syncResult: result.syncResult,
              cacheStats: result.cacheStats
            })
          } else {
            wrappedResolve({ success: false, error: new Error(result.error) })
          }
        } else {
          if (result.success) {
            wrappedResolve(result)
          } else {
            wrappedResolve({ ...result, error: result.error instanceof Error ? result.error : new Error(result.error || 'Unknown error') })
          }
        }
      })

      worker.postMessage(task)
    }
  }

  validate(cwd, options = {}) {
    const { srcDir = 'src', force = false, dependencyTypesHashes = {}, packageHash } = options
    return new Promise((resolve, reject) => {
      const task = {
        id: ++this.taskId,
        type: 'validate',
        cwd,
        srcDir,
        force,
        dependencyTypesHashes,
        packageHash
      }

      this.pending.push({ task, resolve, reject })
      this._processNext()
    })
  }

  runTask(type, cwd, options = {}) {
    return new Promise((resolve, reject) => {
      const task = {
        id: ++this.taskId,
        type,
        cwd,
        ...options
      }
      this.pending.push({ task, resolve, reject })
      this._processNext()
    })
  }

  /**
   * Enable watch mode on all workers (reduces cache sizes to prevent memory growth)
   */
  async setWatchMode() {
    const promises = this.workers.map(worker => {
      return new Promise((resolve) => {
        const id = ++this.taskId
        this.callbacks.set(id, () => resolve())
        worker.postMessage({ id, type: 'set-watch-mode' })
      })
    })
    await Promise.all(promises)
  }

  async terminate() {
    this.terminated = true
    for (const worker of this.workers) {
      if (worker) {
        try { worker.postMessage({ type: 'exit' }) } catch (e) {}
      }
    }
    await Promise.all(this.workers.filter(w => w !== null).map(w => w.terminate().catch(() => {})))
    this.workers = []
    this.available = []
  }
}

// Alias for backwards compatibility
const ValidateWorkerPool = GenericWorkerPool

async function getWorkerPool(size) {
  if (!workerPool) {
    workerPool = new GenericWorkerPool(size, join(__dirname, '..', 'validate-worker.js'))
    await workerPool.init()
  }
  return workerPool
}

async function getNamedWorkerPool(name, size, workerPath, poolOptions = {}) {
  let pool = namedPools.get(name)
  if (!pool) {
    pool = new GenericWorkerPool(size, workerPath, poolOptions)
    await pool.init()
    namedPools.set(name, pool)
  }
  return pool
}

async function terminateNamedWorkerPool(name) {
  const pool = namedPools.get(name)
  if (pool) {
    await pool.terminate()
    namedPools.delete(name)
  }
}

async function terminateWorkerPool() {
  if (workerPool) {
    await workerPool.terminate()
    workerPool = null
  }
  for (const [name, pool] of namedPools) {
    await pool.terminate()
  }
  namedPools.clear()
}

module.exports = {
  GenericWorkerPool,
  ValidateWorkerPool,
  getWorkerPool,
  getNamedWorkerPool,
  terminateNamedWorkerPool,
  terminateWorkerPool
}
