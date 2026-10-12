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

// Own URL variable: the mock is reached through the stand's nginx, not through the account URL tests already use.
const WebhookMockUrl = process.env.WEBHOOK_MOCK_URL ?? 'http://localhost:8083/_webhook-mock'

export interface MockDelivery {
  id: string
  receivedAt: number
  headers: Record<string, string>
  rawBody: string
}

export interface MockVerifyResult {
  match: boolean
  expected?: string
  received?: string
  reason?: string
}

async function mockCall<T> (path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const res = await fetch(`${WebhookMockUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new Error(`webhook-mock ${method} ${path} -> ${res.status}`)
  return (await res.json()) as T
}

export async function clearDeliveries (): Promise<void> {
  await mockCall('/api/deliveries/clear', 'POST')
}

export async function getDeliveries (): Promise<MockDelivery[]> {
  return await mockCall<MockDelivery[]>('/api/deliveries', 'GET')
}

export async function setResponseMode (mode: 200 | 500 | 429): Promise<void> {
  await mockCall('/api/response-mode', 'POST', { mode })
}

export async function verifyDelivery (id: string, secret: string): Promise<MockVerifyResult> {
  return await mockCall<MockVerifyResult>(`/api/deliveries/${encodeURIComponent(id)}/verify`, 'POST', { secret })
}
