//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { systemAccountUuid } from '@hcengineering/core'
import { ownsSubscription } from '../middleware'
import type { RequestWithAuth } from '../middleware'

const wsA = 'workspace-uuid-a'
const wsB = 'workspace-uuid-b'
const acctA = 'account-uuid-a'

function makeReq (token: any): RequestWithAuth {
  return { token } as any
}

describe('ownsSubscription', () => {
  it('blocks IDOR: different workspace, not admin, not system -> false', () => {
    const req = makeReq({ account: acctA, workspace: wsA })
    expect(ownsSubscription(req, { workspaceUuid: wsB })).toBe(false)
  })

  it('allows own workspace -> true', () => {
    const req = makeReq({ account: acctA, workspace: wsA })
    expect(ownsSubscription(req, { workspaceUuid: wsA })).toBe(true)
  })

  it('system account bypasses workspace check -> true', () => {
    const req = makeReq({ account: systemAccountUuid, workspace: wsA })
    expect(ownsSubscription(req, { workspaceUuid: wsB })).toBe(true)
  })

  it('admin token bypasses workspace check -> true', () => {
    const req = makeReq({ account: acctA, workspace: wsA, extra: { admin: 'true' } })
    expect(ownsSubscription(req, { workspaceUuid: wsB })).toBe(true)
  })

  it('undefined token -> false', () => {
    const req = makeReq(undefined)
    expect(ownsSubscription(req, { workspaceUuid: wsA })).toBe(false)
  })
})
