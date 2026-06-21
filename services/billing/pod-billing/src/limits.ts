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
import {
  isArchivingMode,
  isDeletingMode,
  type MeasureContext,
  systemAccountUuid,
  type WorkspaceUuid
} from '@hcengineering/core'
import {
  type AccountClient,
  getClient,
  type Subscription,
  SubscriptionStatus,
  SubscriptionType
} from '@hcengineering/account-client'
import {
  LimitCategory as SCLimitCategory,
  LimitStatus,
  type PlatformQueueProducer,
  type QueueWorkspaceLimitsMessage,
  type StorageConfig,
  workspaceEvents
} from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'

import { collectDatalakeStats } from './billing'
import { type BillingDB, type BillingUsageMessage, type LimitCategory, type UsageMetric } from './types'

/** Computes volume-limit state, persists it, and publishes edge-triggered LimitsChanged events. */
export class LimitsEngine {
  constructor (
    private readonly db: BillingDB,
    private readonly accountsUrl: string,
    private readonly storageConfigs: StorageConfig[],
    private readonly producer: PlatformQueueProducer<QueueWorkspaceLimitsMessage>
  ) {}

  /**
   * Per-event cheap path: bump `used` by amount, flip exhausted on limit crossing. Over-counts
   * over time (deletes/dedup); the hourly worker re-reads absolute usage and corrects the drift.
   */
  async processUsageDelta (ctx: MeasureContext, msg: BillingUsageMessage): Promise<void> {
    const { workspace, metric, amount, ref } = msg

    // Idempotent by ref: a redelivered event must not double-count.
    const isNew = await this.db.accumulateUsageDelta(ctx, workspace, metric, amount, ref)
    if (!isNew) {
      ctx.info('billing-usage duplicate ref, skipping', { workspace, metric, ref })
      return
    }
    if (amount === 0) return

    const category = metricToCategory(metric)
    const subs = await this.accountClient(workspace).getSubscriptions(workspace, false)
    const limitValue = getLimitValue(resolveTierLimits(subs), metric)

    const prev = await this.db.getLimitState(ctx, workspace, category)
    const used = (prev?.used ?? 0) + amount
    const prevExhausted = prev?.exhausted ?? false
    const nowExhausted = limitValue > 0 && used >= limitValue

    if (nowExhausted !== prevExhausted) {
      const status = nowExhausted ? LimitStatus.Exhausted : LimitStatus.Ok
      ctx.info('limit status changed (delta)', { workspace, category, status, used, limitValue })
      await this.producer.send(ctx, workspace, [workspaceEvents.limitsChanged(category as SCLimitCategory, status)])
    }
    await this.db.upsertLimitState(ctx, { workspace, category, used, limitValue, exhausted: nowExhausted })

    // Reflect the increment in the displayed usageInfo so the UI moves without waiting for the tick.
    await this.bumpUsageInfo(ctx, workspace, metric, amount)
  }

  /** Increment a single usageInfo field on the account (best-effort; the hourly worker rewrites the absolute). */
  private async bumpUsageInfo (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    metric: UsageMetric,
    amount: number
  ): Promise<void> {
    const field = usageField(metric)
    try {
      const account = this.accountClient(workspace)
      const info = (await account.getWorkspaceInfo(false)).usageInfo
      const usage = { ...(info?.usage ?? {}) }
      usage[field] = (usage[field] ?? 0) + amount
      await account.updateUsageInfo({
        usage,
        startTime: info?.startTime ?? Date.now(),
        updateTime: Date.now()
      })
    } catch (err: any) {
      ctx.error('usageInfo bump after delta failed', { workspace, metric, err })
    }
  }

  /** Startup scan: enumerate all active workspaces, publish already-exhausted states. */
  async startupScan (ctx: MeasureContext): Promise<void> {
    const account = this.accountClient(undefined)
    const workspaces = await account.listWorkspaces(undefined, null, undefined)
    ctx.info('startup limits scan', { total: workspaces.length })

    for (const ws of workspaces) {
      if (isArchivingMode(ws.mode) || isDeletingMode(ws.mode)) continue
      for (const metric of ['tokens', 'transcript', 'storage'] as UsageMetric[]) {
        try {
          await this.recompute(ctx, ws.uuid, metric)
        } catch (err: any) {
          ctx.error('startup scan failed', { workspace: ws.uuid, metric, err })
        }
      }
    }
  }

  /** Plan changed: re-evaluate all volume metrics so an upgrade lifts exhausted without a restart. */
  async recomputeWorkspace (ctx: MeasureContext, workspace: WorkspaceUuid): Promise<void> {
    for (const metric of ['tokens', 'transcript', 'storage'] as UsageMetric[]) {
      try {
        await this.recompute(ctx, workspace, metric)
      } catch (err: any) {
        ctx.error('plan recompute failed', { workspace, metric, err })
      }
    }
  }

  /** Recompute used vs limit for one metric and publish on exhausted-flag flip. */
  private async recompute (ctx: MeasureContext, workspace: WorkspaceUuid, metric: UsageMetric): Promise<void> {
    const category = metricToCategory(metric)
    const subs = await this.accountClient(workspace).getSubscriptions(workspace, false)
    const tier = subs.find((s) => s.type === SubscriptionType.Tier && s.status === SubscriptionStatus.Active)
    const used = await this.computeUsed(ctx, workspace, metric, tier)
    const limitValue = getLimitValue(resolveTierLimits(subs), metric)

    const nowExhausted = limitValue > 0 && used >= limitValue
    const prev = await this.db.getLimitState(ctx, workspace, category)
    const prevExhausted = prev?.exhausted ?? false

    if (nowExhausted !== prevExhausted) {
      const status = nowExhausted ? LimitStatus.Exhausted : LimitStatus.Ok
      ctx.info('limit status changed', { workspace, category, status, used, limitValue })
      await this.producer.send(ctx, workspace, [workspaceEvents.limitsChanged(category as SCLimitCategory, status)])
    }

    await this.db.upsertLimitState(ctx, { workspace, category, used, limitValue, exhausted: nowExhausted })
  }

  private async computeUsed (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    metric: UsageMetric,
    tier: Subscription | undefined
  ): Promise<number> {
    if (metric === 'storage') {
      // storage is absolute, from datalake; ignores billing period
      const stats = await collectDatalakeStats(ctx, workspace, this.storageConfigs)
      return stats.size
    }

    const periodStart = getPeriodStartDate(tier?.periodStart)
    const periodEnd = new Date()

    if (metric === 'tokens') {
      const stats = await this.db.getAiTokensStats(ctx, workspace, periodStart, periodEnd)
      return stats.map((s) => s.totalTokens).reduce((a, b) => a + b, 0)
    }
    // transcript (seconds)
    const stats = await this.db.getAiTranscriptStats(ctx, workspace, periodStart, periodEnd)
    return stats.totalDurationSeconds
  }

  private accountClient (workspace: WorkspaceUuid | undefined): AccountClient {
    const token = generateToken(systemAccountUuid, workspace, { service: 'billing', admin: 'true' })
    return getClient(this.accountsUrl, token)
  }
}

function metricToCategory (metric: UsageMetric): LimitCategory {
  return metric === 'storage' ? 'disk' : metric
}

/** usageInfo.usage field name for a metric (storage is reported in bytes). */
function usageField (metric: UsageMetric): string {
  return metric === 'storage' ? 'storageBytes' : metric
}

type TierLimits = NonNullable<Subscription['limits']>

/**
 * Effective tier limits: active paid tier's own limits, else the free fallback baked into a tier
 * subscription (unpaid workspace runs on free), else undefined (unlimited).
 */
/** Most recent tier subscription (by createdOn) — the current plan, ignoring superseded ones. */
function latestTier (subs: Subscription[]): Subscription | undefined {
  return subs.filter((s) => s.type === SubscriptionType.Tier).sort((a, b) => (b.createdOn ?? 0) - (a.createdOn ?? 0))[0]
}

function resolveTierLimits (subs: Subscription[]): TierLimits | undefined {
  const active = subs.find((s) => s.type === SubscriptionType.Tier && s.status === SubscriptionStatus.Active)
  if (active?.limits != null) return active.limits
  return latestTier(subs)?.freeLimits ?? undefined
}

function getLimitValue (limits: TierLimits | undefined, metric: UsageMetric): number {
  if (limits == null) return 0 // no subscription = unlimited

  if (metric === 'tokens') return limits.tokenLimit ?? 0
  if (metric === 'transcript') return (limits.meetingMinutesLimit ?? 0) * 60 // minutes -> seconds
  return (limits.storageLimitGB ?? 0) * 1e9 // GB -> bytes
}

function getPeriodStartDate (periodStart: number | undefined): Date {
  if (periodStart !== undefined) return new Date(periodStart)
  const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  date.setHours(0, 0, 0, 0)
  return date
}
