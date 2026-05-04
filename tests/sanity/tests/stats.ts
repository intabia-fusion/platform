//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { systemAccountUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'

const StatsUrl = process.env.STATS_URL ?? 'http://huly.local:4901'
const Secret = process.env.SERVER_SECRET ?? 'secret'

interface AnalyticsEntry {
  service: string
  path: string
  operations: number
  total: number
  avg: number
  top: Array<{ value: number, time?: number, params?: Record<string, any> }>
}

interface AnalyticsResponse {
  entries: AnalyticsEntry[]
  generatedAt: number
  services: number
}

const adminToken = (): string => generateToken(systemAccountUuid, undefined, { admin: 'true' }, Secret)

export async function wipeStats (): Promise<void> {
  try {
    const url = `${StatsUrl}/api/v1/manage?operation=wipe-statistics&token=${adminToken()}`
    const res = await fetch(url, { method: 'PUT' })
    if (!res.ok) {
      console.warn(`[stats] wipe failed: ${res.status} ${res.statusText}`)
      return
    }
    console.log('[stats] wiped')
  } catch (err: any) {
    console.warn(`[stats] wipe error: ${err.message ?? err}`)
  }
}

async function fetchAnalytics (sort: 'time' | 'count' | 'avg', limit: number): Promise<AnalyticsResponse | null> {
  try {
    const url = `${StatsUrl}/api/v1/analytics?limit=${limit}&sort=${sort}&token=${adminToken()}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[stats] analytics fetch failed: ${res.status} ${res.statusText}`)
      return null
    }
    return (await res.json()) as AnalyticsResponse
  } catch (err: any) {
    console.warn(`[stats] analytics fetch error: ${err.message ?? err}`)
    return null
  }
}

function formatTable (title: string, data: AnalyticsResponse): void {
  console.log(`\n=== ${title} ===`)
  console.log(
    `services=${data.services} entries=${data.entries.length} generatedAt=${new Date(data.generatedAt).toISOString()}`
  )
  console.log(['#', 'service', 'path', 'ops', 'total(ms)', 'avg(ms)'].join('\t'))
  data.entries.forEach((e, i) => {
    console.log([i + 1, e.service, e.path, e.operations, e.total, e.avg].join('\t'))
  })
}

export async function reportStats (): Promise<void> {
  const byTime = await fetchAnalytics('time', 100)
  if (byTime !== null) formatTable('STATS TOP-100 (by total time)', byTime)
  const byCount = await fetchAnalytics('count', 100)
  if (byCount !== null) formatTable('STATS TOP-100 (by operation count)', byCount)
}
