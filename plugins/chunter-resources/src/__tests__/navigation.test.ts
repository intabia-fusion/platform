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

import type { ActivityMessage } from '@hcengineering/activity'
import chunter, { chunterId } from '@hcengineering/chunter'
import type { Ref } from '@hcengineering/core'
import { notificationId } from '@hcengineering/notification'
import type { Location } from '@hcengineering/ui'

jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({
    getHierarchy: () => ({
      hasClass: () => true,
      isDerived: (_class: string) => _class === 'chunter:class:Channel'
    }),
    getModel: () => ({ findAllSync: () => [] })
  })
}))
jest.mock('@hcengineering/view-resources', () => ({
  getObjectLinkId: async (_providers: unknown, _id: string) => `general-${_id}`,
  parseLinkId: async (_providers: unknown, id: string) => id.match(/([0-9a-f]{24})$/)?.[1] ?? id
}))
jest.mock('@hcengineering/workbench-resources', () => ({}))
jest.mock('@hcengineering/ui', () => ({}))
jest.mock('../components/chat/utils', () => ({ chatSpecials: [{ id: 'threads' }] }))
jest.mock('../utils', () => ({}))
jest.mock('../stores', () => ({}))

// eslint-disable-next-line import/first
import { buildThreadLink } from '../navigation'

const channelId = '6ab563cdad9fa7c25f0b4f94' as Ref<any>
const thread = '6ab563cdad9fa7c25f0b4f95' as Ref<ActivityMessage>

function location (path: string[], query?: Record<string, string | null>): Location {
  return { path, query, fragment: undefined }
}

describe('buildThreadLink', () => {
  it('keeps the inbox context when the thread is in the open channel', async () => {
    const loc = location(['workbench', 'ws', notificationId, `general-${channelId}`], { context: 'ctx' })

    const result = await buildThreadLink(loc, channelId, chunter.class.Channel, thread)

    expect(result.path).toEqual(['workbench', 'ws', notificationId, `general-${channelId}`, thread])
    expect(result.query).toEqual({ context: 'ctx', message: '' })
  })

  it('treats an old `<id>|<class>` link of the open channel as the same channel', async () => {
    const loc = location(['workbench', 'ws', notificationId, `general-${channelId}|${chunter.class.Channel}`], {
      context: 'ctx'
    })

    const result = await buildThreadLink(loc, channelId, chunter.class.Channel, thread)

    expect(result.path).toEqual(['workbench', 'ws', notificationId, `general-${channelId}`, thread])
    expect(result.query).toEqual({ context: 'ctx', message: '' })
  })

  it('recognizes the open channel by a link made before a rename', async () => {
    const loc = location(['workbench', 'ws', notificationId, `old-name-${channelId}`], { context: 'ctx' })

    const result = await buildThreadLink(loc, channelId, chunter.class.Channel, thread)

    expect(result.path).toEqual(['workbench', 'ws', notificationId, `general-${channelId}`, thread])
    expect(result.query).toEqual({ context: 'ctx', message: '' })
  })

  it('addresses a channel by its link id alone in the chat', async () => {
    const loc = location(['workbench', 'ws', chunterId, `general-${channelId}`])

    const result = await buildThreadLink(loc, channelId, chunter.class.Channel, thread)

    expect(result.path).toEqual(['workbench', 'ws', chunterId, `general-${channelId}`, thread])
    expect(result.query).toEqual({ message: '' })
  })
})
