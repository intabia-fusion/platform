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

// Raw inbound TBank webhook, enqueued by the HTTP handler after signature verification and consumed by
// the pod's own worker. The signature is already verified before enqueue — the consumer trusts the body
// but still rechecks the payment state via GetState before applying money-moved effects.

export interface QueueTbankWebhookMessage {
  // Parsed notification body (the exact JSON the bank POSTed). Kept as a record to avoid coupling core
  // to the pod's TbankWebhookNotification type.
  notification: Record<string, any>
  // Whether the signature was verified at ingress (false only when verification is disabled in dev/mock).
  verified: boolean
  receivedAt: number // ingress timestamp (ms), stamped by the HTTP handler
}
