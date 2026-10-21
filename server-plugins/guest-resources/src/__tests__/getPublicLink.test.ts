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

import { type Doc, type Ref, type Space, type WorkspaceIds, type WorkspaceUuid } from '@hcengineering/core'
import guest from '@hcengineering/guest'
import { getPublicLink } from '../index'

describe('getPublicLink', () => {
  const workspace: WorkspaceIds = { uuid: '123e4567-e89b-12d3-a456-426614174001' as WorkspaceUuid, url: 'ws' }
  const doc = { _id: 'doc1', _class: 'test:class:Doc', space: 'spaceB' } as unknown as Doc
  const hierarchy = { isDerived: () => false, classHierarchyMixin: () => undefined }

  // The link of spaceA stayed there when the document moved to spaceB, so it is revoked.
  function clientWith (links: Array<{ space: Ref<Space>, url: string }>): any {
    return {
      getHierarchy: () => hierarchy,
      findOne: jest.fn(async (_class, query) =>
        links.find((it) => it.space === query.space || query.space === undefined)
      ),
      createDoc: jest.fn(async () => 'new'),
      update: jest.fn()
    }
  }

  it('makes a new link when the old one stayed in the previous space of the document', async () => {
    const client = clientWith([{ space: 'spaceA' as Ref<Space>, url: 'https://old' }])

    const url = await getPublicLink(doc, client, workspace, true, null)

    expect(client.findOne).toHaveBeenCalledWith(guest.class.PublicLink, { attachedTo: 'doc1', space: 'spaceB' })
    expect(url).not.toBe('https://old')
    expect(client.createDoc).toHaveBeenCalledWith(
      guest.class.PublicLink,
      'spaceB',
      expect.objectContaining({ attachedTo: 'doc1', attachedToClass: 'test:class:Doc' }),
      expect.any(String)
    )
  })

  it('hands out the link that sits in the space of the document', async () => {
    const client = clientWith([{ space: 'spaceB' as Ref<Space>, url: 'https://current' }])

    const url = await getPublicLink(doc, client, workspace, true, null)

    expect(url).toBe('https://current')
    expect(client.createDoc).not.toHaveBeenCalled()
  })
})
