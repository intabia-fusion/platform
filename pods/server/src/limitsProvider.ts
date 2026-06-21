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
  type AccountClient,
  getClient as getAccountClient,
  type Subscription,
  SubscriptionStatus,
  SubscriptionType
} from '@hcengineering/account-client'
import core, {
  type AccountUuid,
  buildSocialIdString,
  type Class,
  type Doc,
  type Ref,
  type Space,
  SocialIdType,
  systemAccountUuid,
  type WorkspaceMemberInfo,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type LimitsProvider, type PlanLimits } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import tracker from '@hcengineering/tracker'
import chunter from '@hcengineering/chunter'
import pulse from '@hcengineering/pulse'
import preference from '@hcengineering/preference'
import { aiBotAccountEmail } from '@hcengineering/middleware'

// Subscription.limits field -> Space class it bounds. Only projects are currently limited.
const SPACE_LIMIT_MAP: Array<{
  spaceClass: Ref<Class<Space>>
  field: 'projectsLimit'
}> = [{ spaceClass: tracker.class.Project, field: 'projectsLimit' }]

const ZERO_LIMITS: PlanLimits = {
  spaceLimits: new Map(),
  usersLimit: 0,
  storageLimitGB: 0,
  tokenLimit: 0,
  transcriptLimit: 0
}

// System/AI account email social keys. aibot today; add more agent emails here to exclude them
// from seat counting without touching the middleware.
const SYSTEM_ACCOUNT_EMAILS = [aiBotAccountEmail]
const SYSTEM_ACCOUNT_SOCIAL_KEYS = SYSTEM_ACCOUNT_EMAILS.map((value) =>
  buildSocialIdString({ type: SocialIdType.EMAIL, value })
)

/** account-client backed LimitsProvider. Resolves plan limits / payment status / members from the account service. */
export class AccountLimitsProvider implements LimitsProvider {
  // System account uuids are stable across workspaces; resolved once.
  private systemAccounts: Set<AccountUuid> | undefined

  constructor (private readonly accountsUrl: string) {}

  private accountClient (workspace?: WorkspaceUuid): AccountClient {
    const token = generateToken(systemAccountUuid, workspace, { service: 'transactor' })
    return getAccountClient(this.accountsUrl, token)
  }

  private toPlanLimits (l: {
    storageLimitGB?: number
    usersLimit?: number
    tokenLimit?: number
    meetingMinutesLimit?: number
    projectsLimit?: number
  }): PlanLimits {
    const spaceLimits = new Map<Ref<Class<Space>>, number>()
    for (const { spaceClass, field } of SPACE_LIMIT_MAP) {
      spaceLimits.set(spaceClass, (l as any)[field] ?? 0)
    }
    return {
      spaceLimits,
      usersLimit: l.usersLimit ?? 0,
      storageLimitGB: l.storageLimitGB ?? 0,
      tokenLimit: l.tokenLimit ?? 0,
      transcriptLimit: l.meetingMinutesLimit ?? 0
    }
  }

  /** Free fallback limits baked into the tier subscription by payment (if a free plan exists). */
  private freeLimitsOf (tier: Subscription | undefined): PlanLimits | undefined {
    const free = tier?.freeLimits
    return free != null ? this.toPlanLimits(free) : undefined
  }

  /** Most recent tier subscription (by createdOn) — the current plan, ignoring superseded ones. */
  private latestTier (subs: Subscription[]): Subscription | undefined {
    return subs
      .filter((s) => s.type === SubscriptionType.Tier)
      .sort((a, b) => (b.createdOn ?? 0) - (a.createdOn ?? 0))[0]
  }

  async getPlanLimits (workspace: WorkspaceUuid): Promise<PlanLimits> {
    try {
      // activeOnly=false: an unpaid (past_due/canceled) tier still carries the free fallback we need.
      const subs = await this.accountClient(workspace).getSubscriptions(workspace, false)
      const active = subs.find((s) => s.type === SubscriptionType.Tier && s.status === SubscriptionStatus.Active)
      if (active?.limits !== undefined) return this.toPlanLimits(active.limits)
      // No active paid tier (unpaid): fall back to the current tier's free limits, else unlimited.
      return this.freeLimitsOf(this.latestTier(subs)) ?? ZERO_LIMITS
    } catch {
      return ZERO_LIMITS
    }
  }

  async getWorkspaceMembers (workspace: WorkspaceUuid): Promise<WorkspaceMemberInfo[]> {
    try {
      return await this.accountClient(workspace).getWorkspaceMembers()
    } catch {
      return []
    }
  }

  // Read-only members keep direct/chat messaging, the presence signals that make it usable
  // (online status, document presence, typing) and their own per-user preferences (tabs, notification
  // settings, etc. — all derive from Preference). Everything else is denied.
  private readonly readOnlyAllowedClasses = new Set<Ref<Class<Doc>>>([
    chunter.class.DirectMessage,
    chunter.class.ChatMessage,
    chunter.class.ThreadMessage,
    core.class.UserStatus,
    pulse.class.DocumentPresence,
    pulse.class.TypingIndicator,
    preference.class.Preference
  ])

  getReadOnlyAllowedClasses (): Set<Ref<Class<Doc>>> {
    return this.readOnlyAllowedClasses
  }

  async getSystemAccounts (_workspace: WorkspaceUuid): Promise<Set<AccountUuid>> {
    if (this.systemAccounts !== undefined) return this.systemAccounts
    const result = new Set<AccountUuid>()
    try {
      const client = this.accountClient()
      for (const key of SYSTEM_ACCOUNT_SOCIAL_KEYS) {
        const uuid = await client.findPersonBySocialKey(key, true)
        if (uuid != null) result.add(uuid as AccountUuid)
      }
      this.systemAccounts = result
    } catch {
      // leave uncached so a transient failure retries on the next build
      return result
    }
    return this.systemAccounts
  }
}
