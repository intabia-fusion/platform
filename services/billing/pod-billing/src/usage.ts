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

import { type AccountClient, type Subscription, SubscriptionStatus, getClient } from '@hcengineering/account-client'
import {
  type AccountUuid,
  type MeasureContext,
  type UsageStatus,
  type WorkspaceUuid,
  RateLimiter,
  SocialIdType,
  buildSocialIdString,
  isArchivingMode,
  isDeletingMode,
  systemAccountUuid,
  AccountRole
} from '@hcengineering/core'
import { aiBotAccountEmail } from '@hcengineering/middleware'
import { type StorageConfig } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { createClient, getTransactorEndpoint } from '@hcengineering/server-client'
import tracker from '@hcengineering/tracker'

import { collectDatalakeStats } from './billing'
import { type Config } from './config'
import { type BillingDB } from './types'

const aiBotSocialKey = buildSocialIdString({ type: SocialIdType.EMAIL, value: aiBotAccountEmail })

export class UsageWorker {
  private canceled: boolean = false
  private promise: Promise<void> = Promise.resolve()
  // aibot account uuid, resolved once — it never occupies a seat, so it is excluded from membersCount.
  private aiBotAccount: AccountUuid | undefined

  constructor (
    private readonly db: BillingDB,
    private readonly storageConfigs: StorageConfig[],
    private readonly config: Config,
    // Re-evaluate limit_state from absolute usage after the displayed usageInfo is refreshed;
    // corrects the over-counting drift accumulated by the per-event delta path. Set by main.
    private readonly reconcileLimits?: (ctx: MeasureContext, workspace: WorkspaceUuid) => Promise<void>
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
        // Retention: dedup refs only guard against queue redelivery, no need to keep them forever.
        await this.db.cleanupUsageDeltaDedup(ctx, 30)
      } catch (err: any) {
        ctx.error('failed to cleanup usage delta dedup', { error: err })
      }

      if (!this.canceled) {
        await new Promise((resolve) => setTimeout(resolve, this.config.UsageUpdateInterval * 1000))
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
              await this.reconcileLimits?.(ctx, workspace.uuid)
            },
            { workspace: workspace.uuid }
          )
        } catch (err: any) {
          ctx.error('failed to update usage statistics for workspace', { workspace: workspace.uuid, err })
        }
      })
    }
  }

  private async resolveAiBotAccount (account: AccountClient): Promise<AccountUuid | null> {
    if (this.aiBotAccount != null) return this.aiBotAccount
    try {
      const uuid = await account.findPersonBySocialKey(aiBotSocialKey, true)
      // Cache only a successful resolve; a null (not found / transient) is retried next tick.
      if (uuid != null) this.aiBotAccount = uuid as AccountUuid
      return (uuid ?? null) as AccountUuid | null
    } catch {
      return null
    }
  }

  async updateWorkspaceUsageStatistics (ctx: MeasureContext, now: number, workspace: WorkspaceUuid): Promise<void> {
    const account = getAccountClient(this.config.AccountsUrl, workspace)

    // Include non-active subscriptions: a past_due/readonly tier still defines the billing period
    // for usage accounting (grace period keeps the plan in effect).
    const subscriptions = await account.getSubscriptions(workspace, false)
    const grantingStatuses = [
      SubscriptionStatus.Active,
      SubscriptionStatus.Trialing,
      SubscriptionStatus.PastDue,
      SubscriptionStatus.ReadOnly
    ]
    const subscription = subscriptions.find(
      (p) =>
        p.type === 'tier' &&
        grantingStatuses.includes(p.status) &&
        !(p.status === SubscriptionStatus.PastDue && p.providerData?.pending === true)
    )

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

    const membersCount = await ctx.with(
      'get workspace members',
      {},
      async () => {
        try {
          const aiBotAccount = await this.resolveAiBotAccount(account)
          const members = await account.getWorkspaceMembers()
          return members.filter(
            (m) =>
              m.person !== aiBotAccount &&
              m.role !== AccountRole.Guest &&
              m.role !== AccountRole.DocGuest &&
              m.role !== AccountRole.ReadOnlyGuest
          ).length
        } catch (err: any) {
          ctx.error('failed to get workspace members', { workspace, err })
          return 0
        }
      },
      { workspace }
    )

    const projectsCount = await ctx.with(
      'get workspace projects',
      {},
      async () => {
        try {
          const token = generateToken(systemAccountUuid, workspace, { service: 'billing' })
          const endpoint = await getTransactorEndpoint(token)
          const client = await createClient(endpoint, token)
          try {
            const projects = await client.findAll(tracker.class.Project, { archived: false })
            return projects.length
          } finally {
            await client.close()
          }
        } catch (err: any) {
          ctx.error('failed to get workspace projects', { workspace, err })
          return 0
        }
      },
      { workspace }
    )

    const usage: UsageStatus = {
      usage: {
        meetingMinutes,
        recordingSeconds,
        storageBytes,
        transcript:
          (await this.db.getAiTranscriptStats(ctx, workspace, periodStart, periodEnd))?.totalDurationSeconds ?? 0,
        tokens: ((await this.db.getAiTokensStats(ctx, workspace, periodStart, periodEnd)) ?? [])
          .map((it) => it.totalTokens)
          .reduce((a, b) => a + b, 0),
        membersCount,
        projectsCount
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
