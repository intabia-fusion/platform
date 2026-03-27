const { Worker } = require('worker_threads')
const { join } = require('path')

let workerPool = null

class ValidateWorkerPool {
  constructor(size) {
    this.size = size
    this.workers = []
    this.available = []
    this.pending = []
    this.taskId = 0
    this.callbacks = new Map()
    this.workerPath = join(__dirname, '..', 'validate-worker.js')
    this.workerMemory = new Map()
    this.workerStats = new Map()
    this.taskTimings = new Map()
  }

  async init() {
    const readyPromises = []

    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(this.workerPath)
      worker._workerId = i
      this.workers.push(worker)
      this.workerStats.set(i, { totalIdleTime: 0, totalWorkTime: 0, taskCount: 0, lastTaskCompletedAt: null })

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
      readyPromises.push(readyPromise)

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
          this.available.push(worker)
          this._processNext()
        }
      })

      worker.on('error', (err) => {
        console.error('Worker error:', err)
      })
    }

    await Promise.all(readyPromises)
    this.available = [...this.workers]
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

      this.callbacks.set(task.id, (result) => {
        if (result.success) {
          resolve({
            success: true,
            skipped: result.skipped || false,
            fromCache: result.fromCache || false,
            typesHash: result.typesHash,
            syncResult: result.syncResult
          })
        } else {
          resolve({ success: false, error: new Error(result.error) })
        }
      })

      worker.postMessage(task)
    }
  }

  validate(cwd, options = {}) {
    const { srcDir = 'src' } = options
    return new Promise((resolve, reject) => {
      const task = {
        id: ++this.taskId,
        type: 'validate',
        cwd,
        srcDir
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
    for (const worker of this.workers) {
      worker.postMessage({ type: 'exit' })
    }
    await Promise.all(this.workers.map(w => w.terminate()))
    this.workers = []
    this.available = []
  }
}

async function getWorkerPool(size) {
  if (!workerPool) {
    workerPool = new ValidateWorkerPool(size)
    await workerPool.init()
  }
  return workerPool
}

async function terminateWorkerPool() {
  if (workerPool) {
    await workerPool.terminate()
    workerPool = null
  }
}

module.exports = {
  ValidateWorkerPool,
  getWorkerPool,
  terminateWorkerPool
}
