/**
 * Task types for the build pipeline
 */
const TaskType = {
  TRANSPILE: 'transpile',
  VALIDATE: 'validate',
  LINT: 'lint',
  SVELTE_CHECK: 'svelte-check-task',
  BUNDLE: 'bundle',
  PACKAGE: 'package',
  DOCKER_BUILD: 'docker-build'
}

/**
 * Task queue for managing build pipeline tasks
 * Supports task chains with phase dependencies:
 *   transpile -> validate -> lint + svelte-check
 *   transpile -> bundle -> package -> docker-build
 *
 * lint/svelte-check for package X starts as soon as validate for package X completes.
 */
class BuildTaskQueue {
  constructor(graph, options = {}) {
    this.graph = graph
    this.concurrency = options.concurrency || 4
    this.verbose = options.verbose || false

    // Task queues by type
    this.pending = new Map() // taskType -> Set(packageName)
    this.inProgress = new Map() // taskType -> Set(packageName)
    this.completed = new Map() // taskType -> Set(packageName)
    this.results = new Map() // packageName -> { taskType, result }

    // Track which tasks are ready (dependencies satisfied)
    this.readyCallbacks = []

    // Initialize queues
    Object.values(TaskType).forEach(type => {
      this.pending.set(type, new Set())
      this.inProgress.set(type, new Set())
      this.completed.set(type, new Set())
    })
  }

  /**
   * Add tasks to the queue
   */
  addTasks(taskType, packageNames) {
    const pending = this.pending.get(taskType)
    for (const name of packageNames) {
      pending.add(name)
    }
  }

  /**
   * Check if a task is ready to run (all dependencies completed)
   */
  isTaskReady(taskType, packageName) {
    const node = this.graph.get(packageName)
    if (!node) return false

    // Get dependencies based on task type
    const deps = this.getTaskDependencies(taskType, packageName)

    // Check if all dependencies are completed for this task type
    const completed = this.completed.get(taskType)
    return deps.every(dep => completed.has(dep))
  }

  /**
   * Helper: check if packageName has a task of given type registered
   */
  _hasTask(taskType, packageName) {
    return this.pending.get(taskType).has(packageName) ||
           this.inProgress.get(taskType).has(packageName) ||
           this.completed.get(taskType).has(packageName)
  }

  /**
   * Get dependencies for a specific task type
   * Returns array of package names that must complete first, or null if prerequisite phase not done
   */
  getTaskDependencies(taskType, packageName) {
    const node = this.graph.get(packageName)
    if (!node) return []

    // For transpile: dependencies are other transpile tasks
    if (taskType === TaskType.TRANSPILE) {
      return [...node.dependencies].filter(dep =>
        this.pending.get(TaskType.TRANSPILE).has(dep) ||
        this.inProgress.get(TaskType.TRANSPILE).has(dep) ||
        this.completed.get(TaskType.TRANSPILE).has(dep))
    }

    // For validate: dependencies are other validate tasks
    if (taskType === TaskType.VALIDATE) {
      return [...node.dependencies].filter(dep =>
        this.pending.get(TaskType.VALIDATE).has(dep) ||
        this.inProgress.get(TaskType.VALIDATE).has(dep) ||
        this.completed.get(TaskType.VALIDATE).has(dep))
    }

    // For lint: must wait for validate of SAME package to complete first
    if (taskType === TaskType.LINT) {
      if (this._hasTask(TaskType.VALIDATE, packageName)) {
        if (!this.completed.get(TaskType.VALIDATE).has(packageName)) {
          return null // validate not done yet for this package
        }
      }
      // No cross-package lint dependencies — lint packages are independent
      return []
    }

    // For svelte-check: must wait for validate of SAME package to complete first
    if (taskType === TaskType.SVELTE_CHECK) {
      if (this._hasTask(TaskType.VALIDATE, packageName)) {
        if (!this.completed.get(TaskType.VALIDATE).has(packageName)) {
          return null // validate not done yet for this package
        }
      }
      return []
    }

    // For bundle: dependencies are bundle tasks of dependencies
    if (taskType === TaskType.BUNDLE) {
      return [...node.dependencies].filter(dep =>
        this.pending.get(TaskType.BUNDLE).has(dep) ||
        this.completed.get(TaskType.BUNDLE).has(dep) ||
        this.inProgress.get(TaskType.BUNDLE).has(dep))
    }

    // For package: dependencies are package tasks + bundle must be complete for this package
    if (taskType === TaskType.PACKAGE) {
      const packageDeps = [...node.dependencies].filter(dep =>
        this.pending.get(TaskType.PACKAGE).has(dep) ||
        this.completed.get(TaskType.PACKAGE).has(dep) ||
        this.inProgress.get(TaskType.PACKAGE).has(dep)
      )
      if (this._hasTask(TaskType.BUNDLE, packageName)) {
        if (!this.completed.get(TaskType.BUNDLE).has(packageName)) {
          return null // Not ready, bundle not complete
        }
      }
      return packageDeps
    }

    // For docker-build: dependencies are docker-build tasks + package must be complete
    if (taskType === TaskType.DOCKER_BUILD) {
      const dockerDeps = [...node.dependencies].filter(dep =>
        this.pending.get(TaskType.DOCKER_BUILD).has(dep) ||
        this.completed.get(TaskType.DOCKER_BUILD).has(dep) ||
        this.inProgress.get(TaskType.DOCKER_BUILD).has(dep)
      )
      if (this._hasTask(TaskType.PACKAGE, packageName)) {
        if (!this.completed.get(TaskType.PACKAGE).has(packageName)) {
          return null // Not ready, package not complete
        }
      }
      return dockerDeps
    }

    return []
  }

  /**
   * Get next ready task for a worker
   * Returns { taskType, packageName } or null if no tasks ready
   *
   * Checks ALL task types and returns any ready task, allowing parallel execution
   * of independent tasks across phases.
   */
  getNextTask() {
    const priorityOrder = [
      TaskType.TRANSPILE,
      TaskType.VALIDATE,
      TaskType.LINT,
      TaskType.SVELTE_CHECK,
      TaskType.BUNDLE,
      TaskType.PACKAGE,
      TaskType.DOCKER_BUILD
    ]

    // Count total in-progress tasks across all types
    let totalInProgress = 0
    for (const taskType of priorityOrder) {
      totalInProgress += this.inProgress.get(taskType).size
    }

    // Check if we have capacity overall
    if (totalInProgress >= this.concurrency) {
      return null
    }

    // Collect all ready tasks from all types
    const readyTasks = []

    for (const taskType of priorityOrder) {
      const pending = this.pending.get(taskType)

      // Find ready tasks for this type
      for (const packageName of pending) {
        const deps = this.getTaskDependencies(taskType, packageName)
        if (deps === null) continue // Not ready, prerequisite not complete

        const completed = this.completed.get(taskType)
        if (deps.every(dep => completed.has(dep))) {
          readyTasks.push({ taskType, packageName, priority: priorityOrder.indexOf(taskType) })
        }
      }
    }

    // If we have ready tasks, pick one based on priority
    if (readyTasks.length > 0) {
      // Sort by priority (lower index = higher priority)
      readyTasks.sort((a, b) => a.priority - b.priority)

      // Pick the highest priority ready task
      const selected = readyTasks[0]

      // Move from pending to in-progress
      this.pending.get(selected.taskType).delete(selected.packageName)
      this.inProgress.get(selected.taskType).add(selected.packageName)

      return { taskType: selected.taskType, packageName: selected.packageName }
    }

    return null
  }

  /**
   * Mark a task as completed
   */
  completeTask(taskType, packageName, result) {
    const inProgress = this.inProgress.get(taskType)
    const completed = this.completed.get(taskType)

    inProgress.delete(packageName)
    completed.add(packageName)

    this.results.set(`${taskType}:${packageName}`, { taskType, packageName, result })

    // Notify waiting workers
    this.readyCallbacks.forEach(cb => cb())
  }

  /**
   * Check if all tasks of a specific type are done
   */
  isTaskTypeComplete(taskType) {
    const pending = this.pending.get(taskType)
    const inProgress = this.inProgress.get(taskType)
    return pending.size === 0 && inProgress.size === 0
  }

  /**
   * Check if all tasks are complete
   */
  isAllComplete() {
    return Object.values(TaskType).every(type => this.isTaskTypeComplete(type))
  }

  /**
   * Wait for a task to become available
   */
  async waitForTask() {
    return new Promise(resolve => {
      const callback = () => {
        const task = this.getNextTask()
        if (task) {
          const index = this.readyCallbacks.indexOf(callback)
          if (index > -1) this.readyCallbacks.splice(index, 1)
          resolve(task)
        }
      }
      this.readyCallbacks.push(callback)

      // Check immediately in case task is already available
      const task = this.getNextTask()
      if (task) {
        const index = this.readyCallbacks.indexOf(callback)
        if (index > -1) this.readyCallbacks.splice(index, 1)
        resolve(task)
      }
    })
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {}
    Object.values(TaskType).forEach(type => {
      stats[type] = {
        pending: this.pending.get(type).size,
        inProgress: this.inProgress.get(type).size,
        completed: this.completed.get(type).size
      }
    })
    return stats
  }
}

module.exports = { TaskType, BuildTaskQueue }
