//
// Copyright © 2026 Hardcore Engineering Inc.
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

import { AccountRole, type AccountUuid, configUserAccountUuid, systemAccountUuid } from '@hcengineering/core'
import {
  type LoginInfoByToken,
  type LoginInfoRequest,
  type Subscription,
  type WorkspaceLoginInfo,
  SubscriptionStatus,
  SubscriptionType
} from './types'

// Statuses that grant a plan: active/trialing plus past_due (grace) and readonly. Not canceled/expired.
export const PLAN_GRANTING_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.Active,
  SubscriptionStatus.Trialing,
  SubscriptionStatus.PastDue,
  SubscriptionStatus.ReadOnly
]

export function grantsPlan (sub: Pick<Subscription, 'status' | 'providerData' | 'trialEnd'> | undefined): boolean {
  if (sub == null) return false
  // A past_due first-payment draft (pending) is unpaid — it does not grant a plan.
  if (sub.status === SubscriptionStatus.PastDue && (sub.providerData as any)?.pending === true) return false
  // An expired trial (trialEnd passed) no longer grants its plan -> falls back to free.
  if (sub.status === SubscriptionStatus.Trialing && sub.trialEnd != null && sub.trialEnd < Date.now()) return false
  return PLAN_GRANTING_STATUSES.includes(sub.status)
}

export const GUEST_ROLES: AccountRole[] = [AccountRole.ReadOnlyGuest, AccountRole.DocGuest, AccountRole.Guest]

export function isBillableMember (role: AccountRole): boolean {
  return !GUEST_ROLES.includes(role)
}

export interface SeatCandidate {
  role?: string // Employee mixin flag: 'USER' | 'GUEST' (informational)
  personUuid?: AccountUuid | null
}

/**
 * A seat is consumed by any active employee except system/AI/Admin and guests. The single source of
 * truth shared by the displayed usage count (pod-billing) and the per-seat purchase floor (pod-payment).
 * Guests are excluded two ways because either source may be authoritative in a given workspace:
 *   - the Employee 'GUEST' flag on the mixin, and
 *   - the account role in ws_members (Admin / GUEST_ROLES).
 * An employee with no resolved account (pending invite, personUuid unset) still takes a slot.
 */
export function seatEligible (
  candidate: SeatCandidate,
  memberRole: Map<AccountUuid, AccountRole>,
  aiBotAccount: AccountUuid | undefined
): boolean {
  if (candidate.role === 'GUEST') return false
  const uuid = candidate.personUuid
  if (uuid == null) return true
  if (uuid === systemAccountUuid || uuid === configUserAccountUuid || uuid === aiBotAccount) return false
  const role = memberRole.get(uuid)
  if (role === AccountRole.Admin) return false
  if (role !== undefined && GUEST_ROLES.includes(role)) return false
  return true
}

export function makePlanKey (plan: string, type: SubscriptionType | string): string {
  return `${plan}@${type}`
}

export function isWorkspaceLoginInfo (loginInfo: LoginInfoByToken): loginInfo is WorkspaceLoginInfo {
  return !isLoginInfoRequest(loginInfo) && (loginInfo as WorkspaceLoginInfo)?.workspace != null
}

export function isLoginInfoRequest (info: LoginInfoByToken): info is LoginInfoRequest {
  return (info as LoginInfoRequest)?.request
}

export function getClientTimezone (): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch (err: any) {
    console.error('Failed to get client timezone', err)
    return undefined
  }
}

const connectionErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND']
const networkErrorNames = ['NetworkError', 'TypeError', 'FetchError']
const browserFetchErrorMessages = ['failed to fetch', 'networkerror', 'network request failed']
const networkMessageKeywords = ['fetch', 'network', 'connection']

/**
 * Check if a message contains network-related keywords
 */
function hasNetworkMessage (message: string): boolean {
  const lowerMessage = message.toLowerCase()
  return networkMessageKeywords.some((keyword) => lowerMessage.includes(keyword))
}

/**
 * Check if an error is a network/connection error that should be retried
 */
export function isNetworkError (err: unknown): boolean {
  if (err == null) {
    return false
  }

  // Check Node.js-style connection error codes
  if (typeof err === 'object' && 'cause' in err) {
    const cause = (err as { cause?: unknown }).cause
    if (cause != null && typeof cause === 'object' && 'code' in cause) {
      const code = (cause as { code?: unknown }).code
      if (typeof code === 'string' && connectionErrorCodes.includes(code)) {
        return true
      }
    }
  }

  // Get error name and message (handles both Error instances and plain objects)
  let errorName: string | undefined
  let message: string | undefined

  if (err instanceof TypeError) {
    errorName = 'TypeError'
    message = err.message
  } else if (typeof err === 'object' && 'name' in err && 'message' in err) {
    const name = (err as { name?: unknown }).name
    const msg = (err as { message?: unknown }).message
    if (typeof name === 'string') {
      errorName = name
    }
    if (typeof msg === 'string') {
      message = msg
    }
  }

  // Check if error name matches network error types
  if (errorName != null && networkErrorNames.includes(errorName) && message != null) {
    const lowerMessage = message.toLowerCase()
    if (browserFetchErrorMessages.some((pattern) => lowerMessage.includes(pattern))) {
      return true
    }
    if (hasNetworkMessage(message)) {
      return true
    }
  }

  return false
}
