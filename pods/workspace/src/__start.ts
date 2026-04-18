//
// Copyright © 2023 Hardcore Engineering Inc.
//
import { Analytics } from '@intabiafusion/analytics'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@intabiafusion/analytics-service'
import { newMetrics, type Tx } from '@intabiafusion/core'
import { getPlatformQueue } from '@intabiafusion/kafka'
import builder, { getModelVersion, migrateOperations } from '@intabiafusion/model-all'
import { initStatisticsContext, loadBrandingMap } from '@intabiafusion/server-core'
import { serveWorkspaceAccount } from '@intabiafusion/workspace-service'
import { join } from 'path'

const txes = JSON.parse(JSON.stringify(builder().getTxes())) as Tx[]

configureAnalytics('workspace', process.env.VERSION ?? '0.7.0')
Analytics.setTag('application', 'workspace')

// Force create server metrics context with proper logging
const metricsContext = initStatisticsContext('workspace', {
  factory: () =>
    createOpenTelemetryMetricsContext(
      'workspace',
      {},
      {},
      newMetrics(),
      new SplitLogger('workspace', {
        root: join(process.cwd(), 'logs'),
        enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
      })
    )
})

const brandingPath = process.env.BRANDING_PATH

const queue = getPlatformQueue('workspace')

serveWorkspaceAccount(
  metricsContext,
  queue,
  getModelVersion(),
  txes,
  migrateOperations,
  loadBrandingMap(brandingPath),
  () => {}
)
