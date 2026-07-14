/**
 * @public
 */
export type ParamType = string | number | boolean | undefined

/**
 * @public
 */
export type ParamsType = Record<string, ParamType>

/**
 * @public
 */
export type FullParamsType = Record<string, any>

/**
 * @public
 */
export interface MetricsData {
  operations: number
  value: number
  // Non-overlapping latency buckets (ms): le10=[0,10], le100=(10,100], le500=(100,500].
  // Anything slower lands in topResult. Used to estimate p95/p99 cheaply.
  le10?: number
  le100?: number
  le500?: number
  topResult?: {
    value: number
    time?: number
    params: FullParamsType
  }[]
}

export interface OperationLogEntry {
  op: string
  params: ParamsType
  start: number
  end: number
}
export interface OperationLog {
  ops: OperationLogEntry[]
  start: number
  end: number
}

/**
 * A single keyed observation aggregate inside a top-N registry.
 * @public
 */
export interface TopEntry {
  count: number
  sum: number
  max: number
  // Non-overlapping latency buckets (ms), same boundaries as MetricsData.
  le10: number
  le100: number
  le500: number
  // A raw sample for display (e.g. the actual SQL of the slowest hit).
  sample?: string
}

/**
 * Top-N registry: detailed entries for the N heaviest keys plus a roll-up of
 * everything evicted, so totals stay exact even with a hard cap.
 * @public
 */
export interface TopRegistry {
  entries: Record<string, TopEntry>
  totalCount: number
  totalSum: number
  evictedCount: number
  evictedSum: number
}

/**
 * @public
 */
export interface Metrics extends MetricsData {
  namedParams: ParamsType
  params: Record<string, Record<string, MetricsData>>
  measurements: Record<string, Metrics>

  opLog?: Record<string, OperationLog>

  // Named top-N registries, kept only on the root metrics node.
  top?: Record<string, TopRegistry>
}

/**
 * @public
 */
export interface MeasureLogger {
  info: (message: string, obj?: Record<string, any>) => void
  error: (message: string, obj?: Record<string, any>) => void

  warn: (message: string, obj?: Record<string, any>) => void

  logOperation: (operation: string, time: number, params: ParamsType) => void

  childLogger?: (name: string, params: Record<string, any>) => MeasureLogger

  close: () => Promise<void>
}

export interface WithOptions {
  span?: true | false | 'disable' | 'skip' | 'inherit' // 'none' means no span will be created, 'disable' means context will be tracing disabled
  log?: boolean
  inheritParams?: boolean

  // Passed context metadata
  meta?: Record<string, string | number | boolean>

  // If passed, will not send an error into span, for some cases we need to throw error from with, without reporting it.
  suspendErrors?: boolean

  // If set, operation duration will be recorded as histogram with this metric name.
  // Labels: { op: <with name>, ...params }
  metric?: string
}

/**
 * @public
 */
export interface MeasureContext<Q = any> {
  id?: string

  // Context data will be copied referenced for all child contexts.
  contextData: Q
  // Create a child metrics context
  newChild: (
    name: string,
    params: ParamsType,
    opt?: {
      fullParams?: FullParamsType
      logger?: MeasureLogger
      span?: WithOptions['span'] // By default true
      meta?: Record<string, string | number | boolean>
    }
  ) => MeasureContext

  metrics?: Metrics

  with: <T>(
    name: string,
    params: ParamsType,
    op: (ctx: MeasureContext<Q>) => T | Promise<T>,
    fullParams?: FullParamsType | (() => FullParamsType),
    opt?: WithOptions
  ) => Promise<T>

  withSync: <T>(
    name: string,
    params: ParamsType,
    op: (ctx: MeasureContext<Q>) => T,
    fullParams?: FullParamsType | (() => FullParamsType),
    opt?: WithOptions
  ) => T

  extractMeta: () => Record<string, string | number | boolean>

  logger: MeasureLogger

  parent?: MeasureContext
  getParams: () => ParamsType

  measure: (name: string, value: number, labelsOrOverride?: ParamsType | boolean, override?: boolean) => void

  // Record a duration sample (ms) into a histogram-style metric with optional labels.
  // Use for latency/duration distributions - db query timing, request handling, etc.
  recordDuration: (name: string, ms: number, labels?: ParamsType) => void

  // Record a keyed observation into a named top-N registry kept at the root.
  // Groups by key (count/sum/max + latency buckets); a hard cap of N keeps memory
  // bounded while evicted keys still contribute to the registry totals.
  recordTop: (registry: string, key: string, value: number, sample?: string) => void

  // Capture error
  error: (message: string, obj?: Record<string, any>) => void
  info: (message: string, obj?: Record<string, any>) => void
  warn: (message: string, obj?: Record<string, any>) => void

  // Mark current context as complete
  // If no value is passed, time difference will be used.
  end: (value?: number) => void
}
