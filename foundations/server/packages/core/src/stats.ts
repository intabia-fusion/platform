import type { MeasureContext, Metrics } from '@hcengineering/core'
import {
  concatLink,
  MeasureMetricsContext,
  metricsClean,
  newMetrics,
  systemAccountUuid,
  wipeMetrics
} from '@hcengineering/core'
import { RPCHandler } from '@hcengineering/rpc'
import { generateToken } from '@hcengineering/server-token'
import os from 'os'
import { monitorEventLoopDelay } from 'perf_hooks'

export interface MemoryStatistics {
  memoryUsed: number
  memoryTotal: number

  memoryArrayBuffers: number
  memoryRSS: number
  freeMem: number
  totalMem: number
}
export interface CPUStatistics {
  usage: number
  cores: number
}

/**
 * @public
 */
export interface StatisticsElement {
  find: number
  tx: number
}

export interface UserStatistics {
  userId: string
  sessionId: string
  data: any
  mins5: StatisticsElement
  total: StatisticsElement
  current: StatisticsElement
}

export interface WorkspaceStatistics {
  sessions: UserStatistics[]
  workspaceName: string
  wsId: string
  sessionsTotal: number
  clientsTotal: number

  service?: string
}
export interface EventLoopStatistics {
  // Milliseconds a callback waited past its schedule, over the last report interval.
  lagP50: number
  lagP95: number
  lagMax: number
  // libuv thread pool - fs/dns/crypto run there, JS itself is single threaded.
  threadPool: number
}

export interface ServiceStatistics {
  serviceName: string // A service category
  memory: MemoryStatistics
  cpu: CPUStatistics
  eventLoop?: EventLoopStatistics
  stats?: Metrics
  workspaces?: WorkspaceStatistics[]
}

// Enabled once per process; reset after every report so numbers cover one interval.
const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 })
eventLoopDelay.enable()

export function getEventLoopInfo (): EventLoopStatistics {
  const ms = (ns: number): number => Math.round((ns / 1e6) * 100) / 100
  const info: EventLoopStatistics = {
    lagP50: ms(eventLoopDelay.percentile(50)),
    lagP95: ms(eventLoopDelay.percentile(95)),
    lagMax: ms(eventLoopDelay.max),
    threadPool: parseInt(process.env.UV_THREADPOOL_SIZE ?? '4')
  }
  eventLoopDelay.reset()
  return info
}

export function getMemoryInfo (): MemoryStatistics {
  const memU = process.memoryUsage()
  return {
    memoryUsed: Math.round((memU.heapUsed / 1024 / 1024) * 100) / 100,
    memoryRSS: Math.round((memU.rss / 1024 / 1024) * 100) / 100,
    memoryTotal: Math.round((memU.heapTotal / 1024 / 1024) * 100) / 100,
    memoryArrayBuffers: Math.round((memU.arrayBuffers / 1024 / 1024) * 100) / 100,
    freeMem: Math.round((os.freemem() / 1024 / 1024) * 100) / 100,
    totalMem: Math.round((os.totalmem() / 1024 / 1024) * 100) / 100
  }
}

export function getCPUInfo (): CPUStatistics {
  return {
    usage: Math.round(os.loadavg()[0] * 100) / 100,
    cores: os.cpus().length
  }
}

const METRICS_UPDATE_INTERVAL = 5000

// Bounds the snapshot only - registries keep counting everything locally.
// Test stands raise it (STATS_TOP_SLICE=200) to see the whole shape set.
const TOP_SLICE = parseInt(process.env.STATS_TOP_SLICE ?? '30')
/**
 * @public
 */
export function initStatisticsContext (
  serviceName: string,
  ops?: {
    logFile?: string
    factory?: () => MeasureContext
    getStats?: () => WorkspaceStatistics[]
    statsUrl?: string
    serviceName?: () => string
  }
): MeasureContext {
  let metricsContext: MeasureContext
  if (ops?.factory !== undefined) {
    metricsContext = ops.factory()
  } else {
    metricsContext = new MeasureMetricsContext(serviceName, {}, {}, newMetrics())
  }

  const statsUrl = ops?.statsUrl ?? process.env.STATS_URL

  let errorToSend = 0

  if (statsUrl !== undefined) {
    metricsContext.info('using stats url', { statsUrl, service: serviceName ?? '' })
    const serviceId = encodeURIComponent(os.hostname() + '-' + serviceName)

    let prev: Promise<void> | Promise<any> | undefined
    const handleError = (err: any): void => {
      errorToSend++
      if (errorToSend % 2 === 0) {
        const code = err?.code ?? err?.cause?.code
        if (code !== 'UND_ERR_SOCKET') {
          metricsContext.warn('Failed to send statistics', {
            service: serviceName,
            statsUrl,
            code,
            message: err?.message,
            causeMessage: err?.cause?.message,
            err
          })
        }
      }
      prev = undefined
    }

    const rpcHandler = new RPCHandler()

    const intTimer = setInterval(() => {
      try {
        if (prev !== undefined) {
          // In case of high load, skip
          return
        }
        if (statsUrl !== undefined) {
          const token = generateToken(systemAccountUuid, undefined, { service: serviceName })
          const data: ServiceStatistics = {
            serviceName: ops?.serviceName?.() ?? serviceName,
            cpu: getCPUInfo(),
            memory: getMemoryInfo(),
            eventLoop: getEventLoopInfo(),
            stats: metricsContext.metrics !== undefined ? metricsClean(metricsContext.metrics, TOP_SLICE) : undefined,
            workspaces: ops?.getStats?.()
          }

          const statData = rpcHandler.serialize({ method: 'data', params: [data] }, true)

          void metricsContext.with(
            'sendStatistics',
            {},
            async (ctx) => {
              prev = fetch(concatLink(statsUrl, '/api/v1/statistics') + `/?name=${serviceId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  authorization: `Bearer ${token}`
                },
                body: statData
              })
                .then(async (resp) => {
                  // Stats may instruct a one-shot wipe (pull-based reset).
                  try {
                    const reply = (await resp.json()) as { wipe?: boolean }
                    if (reply?.wipe === true && metricsContext instanceof MeasureMetricsContext) {
                      wipeMetrics(metricsContext.metrics)
                      metricsContext.info('statistics wiped on stats request')
                    }
                  } catch {
                    // empty/non-JSON reply - nothing to do
                  }
                })
                .finally(() => {
                  prev = undefined
                })
                .catch(handleError)
            },
            undefined,
            { span: 'disable' }
          )
        }
      } catch (err: any) {
        handleError(err)
      }
    }, METRICS_UPDATE_INTERVAL)

    const closeTimer = (): void => {
      clearInterval(intTimer)
    }
    process.on('SIGINT', closeTimer)
    process.on('SIGTERM', closeTimer)
  }

  return metricsContext
}
