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

import { resolveMemory } from '../workspace/memory'

describe('resolveMemory', () => {
  it('uses the Preference when present and does not migrate', () => {
    const { memory, migrate } = resolveMemory(
      { assistantMemory: 'Call me Boss', userMemory: 'likes tea', sharedContext: 'ru' },
      { assistantMemory: 'old', userMemory: 'old', sharedContext: 'old' },
      'Alice'
    )
    expect(migrate).toBe(false)
    expect(memory).toEqual({ assistantMemory: 'Call me Boss', userMemory: 'likes tea', sharedContext: 'ru' })
  })

  it('fills missing Preference fields with empty strings', () => {
    const { memory } = resolveMemory({ userMemory: 'x' }, undefined, undefined)
    expect(memory).toEqual({ assistantMemory: '', userMemory: 'x', sharedContext: '' })
  })

  it('migrates from blob memory when no Preference exists', () => {
    const { memory, migrate } = resolveMemory(
      undefined,
      { assistantMemory: 'a', userMemory: 'u', sharedContext: 's' },
      'Alice'
    )
    expect(migrate).toBe(true)
    expect(memory).toEqual({ assistantMemory: 'a', userMemory: 'u', sharedContext: 's' })
  })

  it('seeds empty memory with the employee name when nothing exists', () => {
    const { memory, migrate } = resolveMemory(undefined, undefined, 'Alice')
    expect(migrate).toBe(false)
    expect(memory).toEqual({ assistantMemory: '', userMemory: 'User name: Alice', sharedContext: '' })
  })

  it('leaves userMemory empty when there is no employee name', () => {
    const { memory } = resolveMemory(undefined, undefined, undefined)
    expect(memory).toEqual({ assistantMemory: '', userMemory: '', sharedContext: '' })
    const { memory: m2 } = resolveMemory(undefined, undefined, '')
    expect(m2.userMemory).toBe('')
  })
})
