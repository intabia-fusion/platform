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
import { tokensRecord } from '../billing'

const ws = 'ws-1' as WorkspaceUuid

describe('tokensRecord', () => {
  it('applies the billing multiplier and rounds up', () => {
    const r = tokensRecord(ws, 100, 50, 0.1, 'chat', 'clisr', '2026-01-01T00:00:00.000Z')
    expect(r.tokens).toBe(15) // ceil(150 * 0.1)
    expect(r.reason).toBe('chat:clisr')
    expect(r.workspace).toBe(ws)
    expect(r.date).toBe('2026-01-01T00:00:00.000Z')
  })

  it('passes a multiplier of 1 through as the raw total', () => {
    expect(tokensRecord(ws, 80, 20, 1, 'summarize').tokens).toBe(100)
  })

  it('omits the model suffix when modelId is absent', () => {
    expect(tokensRecord(ws, 10, 0, 1, 'chat').reason).toBe('chat')
  })

  it('rounds fractional billed tokens up', () => {
    expect(tokensRecord(ws, 3, 0, 0.1, 'chat').tokens).toBe(1) // ceil(0.3)
  })
})
