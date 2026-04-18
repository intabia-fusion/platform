//
// Copyright © 2023 Hardcore Engineering Inc.
//
import { serveAccount } from '@intabiafusion/account-service'
import { Analytics } from '@intabiafusion/analytics'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@intabiafusion/analytics-service'
import { newMetrics } from '@intabiafusion/core'
import { initStatisticsContext, loadBrandingMap } from '@intabiafusion/server-core'
import { join } from 'path'

configureAnalytics('account', process.env.VERSION ?? '0.7.0')
Analytics.setTag('application', 'account')

const metricsContext = initStatisticsContext('account', {
  factory: () =>
    createOpenTelemetryMetricsContext(
      'account',
      {},
      {},
      newMetrics(),
      new SplitLogger('account', {
        root: join(process.cwd(), 'logs'),
        enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
      })
    )
})

const brandingPath = process.env.BRANDING_PATH

serveAccount(metricsContext, loadBrandingMap(brandingPath), () => {})
