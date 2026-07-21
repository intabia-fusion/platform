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
import { QueueWorkspaceEvent } from '@hcengineering/server-core'
import { LimitsState } from '../limits'

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' as WorkspaceUuid

function ev (category: string, status: string): any {
  return { type: QueueWorkspaceEvent.LimitsChanged, category, status }
}

describe('LimitsState', () => {
  it('fail-open: all permitted before any events', () => {
    const state = new LimitsState()
    expect(state.isTokensBlocked(WS)).toBe(false)
    expect(state.isTranscriptBlocked(WS)).toBe(false)
  })

  it('tokens exhausted blocks LLM only', () => {
    const state = new LimitsState()
    state.applyEvent(ev('tokens', 'exhausted'), WS)
    expect(state.isTokensBlocked(WS)).toBe(true)
    expect(state.isTranscriptBlocked(WS)).toBe(false)
  })

  it('tokens ok removes block', () => {
    const state = new LimitsState()
    state.applyEvent(ev('tokens', 'exhausted'), WS)
    state.applyEvent(ev('tokens', 'ok'), WS)
    expect(state.isTokensBlocked(WS)).toBe(false)
  })

  it('transcript exhausted blocks transcription only', () => {
    const state = new LimitsState()
    state.applyEvent(ev('transcript', 'exhausted'), WS)
    expect(state.isTranscriptBlocked(WS)).toBe(true)
    expect(state.isTokensBlocked(WS)).toBe(false)
  })

  it('payment exhausted blocks both', () => {
    const state = new LimitsState()
    state.applyEvent(ev('payment', 'exhausted'), WS)
    expect(state.isTokensBlocked(WS)).toBe(true)
    expect(state.isTranscriptBlocked(WS)).toBe(true)
  })

  it('payment ok restores both', () => {
    const state = new LimitsState()
    state.applyEvent(ev('payment', 'exhausted'), WS)
    state.applyEvent(ev('payment', 'ok'), WS)
    expect(state.isTokensBlocked(WS)).toBe(false)
    expect(state.isTranscriptBlocked(WS)).toBe(false)
  })

  it('unknown category ignored', () => {
    const state = new LimitsState()
    expect(() => {
      state.applyEvent(ev('disk', 'exhausted'), WS)
    }).not.toThrow()
    expect(state.isTokensBlocked(WS)).toBe(false)
  })
})
