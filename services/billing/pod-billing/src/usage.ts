//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { type AccountClient, type Subscription, getClient } from '@hcengineering/account-client'
import {
  type MeasureContext,
  type UsageStatus,
  type WorkspaceUuid,
  RateLimiter,
  isArchivingMode,
  isDeletingMode,
  systemAccountUuid
} from '@hcengineering/core'
import { type StorageConfig } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'

import { collectDatalakeStats } from './billing'
import { type Config } from './config'
import { type BillingDB, type ProviderPool } from './types'

// Called when a provider pool newly crosses an 80% or 100% usage threshold.
export type PoolThresholdHandler = (ctx: MeasureContext, pool: ProviderPool, percent: 80 | 100) => Promise<void>

export class UsageWorker {
  private canceled: boolean = false
  private promise: Promise<void> = Promise.resolve()

  constructor (
    private readonly db: BillingDB,
    private readonly storageConfigs: StorageConfig[],
    private readonly config: Config,
    private readonly onPoolThreshold?: PoolThresholdHandler
  ) {}

  async close (): Promise<void> {
    this.canceled = true
    await this.promise
  }

  async schedule (ctx: MeasureContext): Promise<void> {
    ctx.info('schedule usage update with interval', { interval: this.config.UsageUpdateInterval })

    this.promise = this.run(ctx)
  }

  private async run (ctx: MeasureContext): Promise<void> {
    while (!this.canceled) {
      try {
        await this.recheckWorkspaces(ctx)
      } catch (err: any) {
        ctx.error('failed to recheck workspaces', { error: err })
      }

      try {
        await this.recomputeProviderPools(ctx)
      } catch (err: any) {
        ctx.error('failed to recompute provider pools', { error: err })
      }

      if (!this.canceled) {
        await new Promise((resolve) => setTimeout(resolve, this.config.UsageUpdateInterval * 1000))
      }
    }
  }

  // Recompute used/exhausted for each purchased provider pool from the token usage
  // table over the pool's own period; fire onPoolThreshold when 80%/100% is crossed.
  async recomputeProviderPools (ctx: MeasureContext): Promise<void> {
    const pools = await this.db.listProviderPools(ctx)
    if (pools.length === 0) return

    const now = new Date()
    for (const pool of pools) {
      if (this.canceled) return
      if (pool.kind === 'local' || pool.purchasedTokens <= 0) continue

      const totals = await this.db.getProviderTokenTotals(ctx, new Date(pool.periodStart), now)
      const used = totals.find((t) => t.providerId === pool.providerId)?.totalTokens ?? 0

      const { pool: updated, crossed80, crossed100 } = await this.db.updateProviderPoolState(ctx, pool.providerId, used)

      if ((crossed80 || crossed100) && this.onPoolThreshold !== undefined) {
        try {
          await this.onPoolThreshold(ctx, updated, crossed100 ? 100 : 80)
        } catch (err: any) {
          ctx.error('pool threshold notify failed', { provider: pool.providerId, err })
        }
      }
    }
  }

  async recheckWorkspaces (ctx: MeasureContext): Promise<void> {
    const now = Date.now()
    const account = getAccountClient(this.config.AccountsUrl, undefined)

    // We only need workspaces visited in last day or our update interval (whichever is smaller)
    const workspaces = await account.listWorkspaces(
      undefined,
      undefined,
      Math.min(1, Math.round(this.config.UsageUpdateInterval / 86400))
    )

    ctx.info('rechecking workspaces', { count: workspaces.length })

    const limiter = new RateLimiter(10)
    for (const workspace of workspaces) {
      if (this.canceled) {
        throw new Error('Workspace recheck canceled')
      }

      if (isArchivingMode(workspace.mode) || isDeletingMode(workspace.mode)) {
        continue
      }

      const updateTime = workspace.usageInfo?.updateTime ?? 0
      if ((now - updateTime) / 1000 < this.config.UsageUpdateInterval) {
        continue
      }

      await limiter.add(async () => {
        try {
          await ctx.with(
            'update workspace usage statistics',
            {},
            async (ctx) => {
              await this.updateWorkspaceUsageStatistics(ctx, now, workspace.uuid)
            },
            { workspace: workspace.uuid }
          )
        } catch (err: any) {
          ctx.error('failed to update usage statistics for workspace', { workspace: workspace.uuid, err })
        }
      })
    }
  }

  async updateWorkspaceUsageStatistics (ctx: MeasureContext, now: number, workspace: WorkspaceUuid): Promise<void> {
    const account = getAccountClient(this.config.AccountsUrl, workspace)

    const subscriptions = await account.getSubscriptions(workspace)
    const subscription = subscriptions.find((p) => p.status === 'active' && p.type === 'tier')

    const periodStart = getPeriodStartDate(subscription)
    const periodEnd = new Date(now)

    const liveKitUsage = await ctx.with(
      'get livekit usage',
      {},
      (ctx) => {
        return this.db.getLiveKitStats(ctx, workspace, periodStart, periodEnd)
      },
      { workspace }
    )
    const storageUsage = await ctx.with(
      'get storage usage',
      {},
      (ctx) => {
        return collectDatalakeStats(ctx, workspace, this.storageConfigs)
      },
      { workspace }
    )

    const participantMinutes = await ctx.with(
      'get participant minutes',
      {},
      (ctx) => {
        return this.db.getParticipantMinutes(ctx, workspace, periodStart, periodEnd)
      },
      { workspace }
    )
    const meetingMinutes = participantMinutes.totalMinutes
    const recordingSeconds = liveKitUsage.egress.reduce((acc, egress) => acc + egress.minutes, 0) * 60
    const storageBytes = storageUsage.size

    const usage: UsageStatus = {
      usage: {
        meetingMinutes,
        recordingSeconds,
        storageBytes,
        transcript:
          (await this.db.getAiTranscriptStats(ctx, workspace, periodStart, periodEnd))?.totalDurationSeconds ?? 0,
        tokens: ((await this.db.getAiTokensStats(ctx, workspace, periodStart, periodEnd)) ?? [])
          .map((it) => it.totalTokens)
          .reduce((a, b) => a + b, 0)
      },
      startTime: periodStart.getTime(),
      updateTime: periodEnd.getTime()
    }

    await account.updateUsageInfo(usage)
  }
}

function getPeriodStartDate (subscription: Subscription | undefined): Date {
  if (subscription?.periodStart !== undefined) {
    return new Date(subscription.periodStart)
  }

  // For users without subscription, use past 30 days (start of day)
  const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  date.setHours(0, 0, 0, 0)
  return date
}

function getAccountClient (accountsUrl: string, workspace: WorkspaceUuid | undefined): AccountClient {
  const token = generateToken(systemAccountUuid, workspace, { service: 'billing', admin: 'true' })
  return getClient(accountsUrl, token)
}
