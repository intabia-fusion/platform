//
// Copyright © 2026 Intabia Fusion.
//

import type { WorkspaceDestroyAdapter } from '@hcengineering/server-core'
import { getWorkspaceDestroyAdapter, registerDestroyFactory } from '../pipeline'

describe('getWorkspaceDestroyAdapter', () => {
  it('picks the backend registered for the url, not the default one', () => {
    const first = {} as unknown as WorkspaceDestroyAdapter
    const second = {} as unknown as WorkspaceDestroyAdapter
    registerDestroyFactory('first://', () => first)
    registerDestroyFactory('second://', () => second, false)

    expect(getWorkspaceDestroyAdapter('second://host/db')).toBe(second)
    expect(getWorkspaceDestroyAdapter('first://host/db')).toBe(first)
    expect(getWorkspaceDestroyAdapter('unknown://host/db')).toBe(first)
  })
})
