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

import { type AccountUuid, readOnlyGuestAccountUuid, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import type { Token } from '@hcengineering/server-token'
import { isServiceReporter } from '../stats'

const workspace = '123e4567-e89b-12d3-a456-426614174001' as WorkspaceUuid
const guest = '123e4567-e89b-12d3-a456-426614174000' as AccountUuid

describe('isServiceReporter', () => {
  it('accepts a pod service token', () => {
    const token: Token = { account: systemAccountUuid, workspace, extra: { service: 'transactor' } }
    expect(isServiceReporter(token)).toBe(true)
  })

  it('refuses guest links that carry a pod name', () => {
    const publicLink = { account: guest, workspace, extra: { service: 'transactor', linkId: 'link-1', guest: 'true' } }
    const oldLoveLink = {
      account: readOnlyGuestAccountUuid,
      workspace,
      extra: { service: 'love', meetingId: 'meeting-1', workspaceUrl: 'ws-url' }
    }

    expect(isServiceReporter(publicLink)).toBe(false)
    expect(isServiceReporter(oldLoveLink)).toBe(false)
  })
})
