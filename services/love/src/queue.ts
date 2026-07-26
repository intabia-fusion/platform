/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { type WorkspaceUuid } from '@hcengineering/core'
import { type PlatformQueueProducer } from '@hcengineering/server-core'
import {
  type LiveKitSessionData,
  type LiveKitEgressData,
  type LiveKitParticipantSessionData
} from '@hcengineering/billing-client'

/** Mirrors BillingUsageMessage in pod-billing (single billing-usage topic, discriminated by `kind`). */
export interface BillingUsageMessage {
  kind: 'usage'
  workspace: WorkspaceUuid
  metric: 'tokens' | 'transcript' | 'storage' | 'meetingMinutes'
  amount: number
  /** Idempotency key — duplicate ref for same workspace+metric is ignored. */
  ref: string
}

/** Mirrors LiveKitRecordMessage in pod-billing. */
export type LiveKitRecordMessage =
  | { kind: 'session', data: LiveKitSessionData[] }
  | { kind: 'egress', data: LiveKitEgressData[] }
  | { kind: 'participant', data: LiveKitParticipantSessionData[] }

/** Everything on the billing-usage topic (QueueTopic.BillingUsage). */
export type BillingMessage = BillingUsageMessage | LiveKitRecordMessage

// Set from main.ts after queue init; undefined = no-op.
let billingProducer: PlatformQueueProducer<BillingMessage> | undefined

export function setBillingProducer (producer: PlatformQueueProducer<BillingMessage>): void {
  billingProducer = producer
}

export function getBillingProducer (): PlatformQueueProducer<BillingMessage> | undefined {
  return billingProducer
}
