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

import type { Page } from '@playwright/test'

export interface TxFrame {
  _class: string
  objectClass?: string
  objectId?: string
  operations?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * FUSIO-1584 rage-click tests for an idempotent diff-update guard (EditEvent/EditWorkSlot/FilterBar
 * Save) have no UI-visible signal: 3 rage-click calls compute and send the same diff as 1 would.
 * The only observable difference is on the wire - how many update tx frames the client actually
 * sent. Binary+snappy frames are opaque; the JSON protocol (no server rebuild needed, a pure
 * client-side localStorage switch) makes them readable. Compression only ever applies to
 * server->client frames (connection.ts never calls compress() on the way out), so only the binary
 * flag matters for counting frames the client sends - see docs/memory/rpc-json-protocol.md.
 */
export async function enableJsonProtocol (page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('client:metadata:UseBinaryProtocol', 'false')
    localStorage.setItem('client:metadata:UseProtocolCompression', 'false')
  })
}

/** Call before navigating - the websocket connects during the initial page load. */
export function trackTxFrames (page: Page): { frames: TxFrame[] } {
  const state = { frames: [] as TxFrame[] }
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      if (typeof f.payload !== 'string') return
      try {
        const data = JSON.parse(f.payload)
        if (data.method === 'tx' && Array.isArray(data.params)) {
          state.frames.push(...(data.params as TxFrame[]))
        }
      } catch {
        // Not a JSON tx frame (e.g. the hello handshake, or a ping).
      }
    })
  })
  return state
}
