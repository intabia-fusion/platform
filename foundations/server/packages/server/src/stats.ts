import { type MeasureContext, MeasureMetricsContext, metricsAggregate, wipeMetrics } from '@hcengineering/core'
import { type SessionManager } from '@hcengineering/server-core'
import os from 'node:os'

/**
 * @public
 */
export function getStatistics (ctx: MeasureContext, sessions: SessionManager, admin: boolean): any {
  const data: Record<string, any> = {
    metrics: metricsAggregate((ctx as any).metrics, 50),
    statistics: {
      activeSessions: {}
    }
  }
  data.statistics.totalClients = sessions.sessions.size
  if (admin) {
    for (const wsStats of sessions.getStatistics()) {
      data.statistics.activeSessions[wsStats.wsId] = wsStats
    }
  }

  data.health = sessions.checkHealth()

  const memU = process.memoryUsage()
  data.statistics.memoryUsed = Math.round(((memU.heapUsed + memU.rss) / 1024 / 1024) * 100) / 100
  data.statistics.memoryTotal = Math.round((memU.heapTotal / 1024 / 1024) * 100) / 100
  data.statistics.memoryRSS = Math.round((memU.rss / 1024 / 1024) * 100) / 100
  data.statistics.memoryArrayBuffers = Math.round((memU.arrayBuffers / 1024 / 1024) * 100) / 100
  data.statistics.cpuUsage = Math.round(os.loadavg()[0] * 100) / 100
  data.statistics.freeMem = Math.round((os.freemem() / 1024 / 1024) * 100) / 100
  data.statistics.totalMem = Math.round((os.totalmem() / 1024 / 1024) * 100) / 100

  return data
}

/**
 * @public
 */
export function wipeStatistics (ctx: MeasureContext): void {
  if (ctx instanceof MeasureMetricsContext) {
    wipeMetrics(ctx.metrics)
  }
}
