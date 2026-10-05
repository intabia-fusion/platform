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

import chunter from '@hcengineering/chunter'
import type { Class, Doc, Ref } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'

const findOne = jest.fn()

jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({
    getHierarchy: () => ({
      hasClass: (_class: string) => _class !== 'removed:class:Gone',
      isDerived: (_class: string, base: string) =>
        _class === base || (base === 'chunter:class:ChunterSpace' && _class === 'chunter:class:Channel')
    }),
    findOne
  })
}))
jest.mock('@hcengineering/activity-resources', () => ({}))
jest.mock('@hcengineering/view-resources', () => ({}))
jest.mock('@hcengineering/ui', () => ({}))

// eslint-disable-next-line import/first
import { decodeInboxURI, encodeInboxURI, resolveInboxObjectClass } from '../utils'

const channel = 'general-6ab563cdad9fa7c25f0b4f94' as Ref<Doc>
const issueClass = 'tracker:class:Issue' as Ref<Class<Doc>>

function context (data: Partial<DocNotifyContext>): DocNotifyContext {
  return data as DocNotifyContext
}

describe('inbox links', () => {
  beforeEach(() => {
    findOne.mockReset()
  })

  it('addresses chat spaces by the link id alone and other docs with the class', () => {
    expect(encodeInboxURI(channel, chunter.class.Channel)).toBe(channel)
    expect(encodeInboxURI('TSK-1', issueClass)).toBe(`TSK-1|${issueClass}`)
    expect(encodeInboxURI('x', 'removed:class:Gone' as Ref<Class<Doc>>)).toBe('x|removed:class:Gone')
  })

  it('decodes class-less links as chat spaces and keeps old ones', () => {
    expect(decodeInboxURI(channel)).toEqual([channel, chunter.class.ChunterSpace])
    expect(decodeInboxURI(`${channel}%7Cchunter%3Aclass%3AChannel`)).toEqual([channel, chunter.class.Channel])
    expect(decodeInboxURI(`TSK-1|${issueClass}`)).toEqual(['TSK-1', issueClass])
  })

  it('takes the concrete class of a chat space from the context, then from the doc', async () => {
    const _id = '6ab563cdad9fa7c25f0b4f94' as Ref<Doc>

    expect(await resolveInboxObjectClass(_id, issueClass)).toBe(issueClass)
    expect(
      await resolveInboxObjectClass(
        _id,
        chunter.class.ChunterSpace,
        context({ objectId: _id, objectClass: chunter.class.Channel })
      )
    ).toBe(chunter.class.Channel)
    expect(
      await resolveInboxObjectClass(
        _id,
        chunter.class.ChunterSpace,
        context({ objectId: 'thread' as Ref<Doc>, parentObjectId: _id, parentObjectClass: chunter.class.DirectMessage })
      )
    ).toBe(chunter.class.DirectMessage)
    expect(findOne).not.toHaveBeenCalled()

    findOne.mockResolvedValue({ _id, _class: chunter.class.Channel })
    expect(await resolveInboxObjectClass(_id, chunter.class.ChunterSpace)).toBe(chunter.class.Channel)
  })
})
