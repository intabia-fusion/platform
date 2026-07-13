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

import { addEventListener } from '@hcengineering/platform'
import { writable } from 'svelte/store'

// Shapes mirror @hcengineering/rpc events broadcast from client-resources/connection.ts.
export interface RateLimit {
  remaining: number
  limit: number
  reset: number
  retryAfter?: number
}
export interface ConnStats {
  sent: number
  received: number
  sentBytes: number
  receivedBytes: number
  latency: number
}

export const connOnline = writable<boolean>(true)
export const connRate = writable<RateLimit | undefined>(undefined)
export const connCooldown = writable<number>(0)
export const connStats = writable<ConnStats>({ sent: 0, received: 0, sentBytes: 0, receivedBytes: 0, latency: 0 })

let timer: ReturnType<typeof setInterval> | undefined

addEventListener('connection-status', async (_e, data: boolean) => {
  connOnline.set(data)
})
addEventListener('connection-stats', async (_e, data: ConnStats) => {
  connStats.set(data)
})
addEventListener('rate-limit-updated', async (_e, data: RateLimit | undefined) => {
  connRate.set(data)
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
  if (data === undefined) {
    connCooldown.set(0)
    return
  }
  // retryAfter is a duration (ms); reset is an absolute timestamp (ms).
  const remainingMs = data.retryAfter ?? (data.reset !== undefined ? data.reset - Date.now() : 0)
  let cd = Math.ceil(remainingMs / 1000)
  connCooldown.set(cd)
  if (cd <= 0) {
    connRate.set(undefined)
    return
  }
  timer = setInterval(() => {
    cd -= 1
    connCooldown.set(cd)
    if (cd <= 0) {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
      connRate.set(undefined)
    }
  }, 1000)
})
