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

import { type WorkspaceUuid } from '@hcengineering/core'
import type TbankPayments from 'tbank-payments'

export function verifyWebhookToken (
  tbank: TbankPayments,
  notification: Record<string, any>,
  token: string,
  rawBody?: string
): boolean {
  // Some TBank SDK versions verify signature against raw JSON string
  // Pass rawBody if the SDK supports it, otherwise fall back to notification object
  if (rawBody !== undefined && typeof (tbank as any).verifyNotificationSignatureRaw === 'function') {
    return (tbank as any).verifyNotificationSignatureRaw(rawBody, token)
  }
  return tbank.verifyNotificationSignature(notification, token)
}

export function getPlanKey (type: string, plan: string): string {
  return `${plan}@${type}`
}

/**
 * Simple hash function to shorten workspaceUuid into a fixed-length string.
 * Not cryptographically secure — used only for generating short unique order IDs.
 */
function hashWorkspace (uuid: string): string {
  let hash = 0
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    // Convert to 32bit integer
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export function buildOrderId (workspaceUuid: WorkspaceUuid, transactionCount: number): string {
  const ws = hashWorkspace(workspaceUuid)
  const ts = Date.now().toString(36)
  const rnd = Math.random().toString(36).substring(2, 6)
  return `${ws}-${transactionCount}-${ts}-${rnd}`
}

export function parsePlans (plansStr: string): Record<string, number> {
  const plans: Record<string, number> = {}
  for (const plan of plansStr.split(';')) {
    const [key, amountStr] = plan.split(':')
    const amount = parseInt(amountStr, 10)
    if (isNaN(amount)) throw new Error(`Invalid plan amount: ${plan}`)
    plans[key] = amount
  }
  return plans
}
