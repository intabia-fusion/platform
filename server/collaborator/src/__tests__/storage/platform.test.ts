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

import core, { MeasureContext } from '@hcengineering/core'
import { loadCollabJson, saveCollabJson } from '@hcengineering/collaboration'

import { PlatformStorageAdapter } from '../../storage/platform'

jest.mock('@hcengineering/collaborator-client', () => ({
  decodeDocumentId: () => ({
    documentId: {
      objectClass: 'tracker:class:Issue',
      objectId: 'issue-id',
      objectAttr: 'description'
    }
  })
}))

jest.mock('@hcengineering/collaboration', () => ({
  loadCollabJson: jest.fn(),
  saveCollabJson: jest.fn(),
  loadCollabYdoc: jest.fn(),
  saveCollabYdoc: jest.fn()
}))

jest.mock('@hcengineering/text', () => ({
  areEqualMarkups: (markup1: string, markup2: string) => markup1 === markup2
}))

jest.mock('@hcengineering/activity', () => ({
  __esModule: true,
  default: {
    class: { DocUpdateMessage: 'activity:class:DocUpdateMessage' },
    string: { ValueTooLarge: 'activity:string:ValueTooLarge' }
  }
}))

describe('PlatformStorageAdapter.saveDocumentToPlatform', () => {
  const mockCtx = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    with: jest.fn(async (_name: string, _params: any, fn: (ctx: any) => any) => await fn(mockCtx)),
    withSync: jest.fn((_name: string, _params: any, fn: () => any) => fn()),
    newChild: jest.fn(() => mockCtx)
  } as unknown as MeasureContext

  const context = {
    wsIds: { uuid: 'workspace-uuid', dataId: 'data-id', url: 'workspace-url' },
    clientFactory: jest.fn(),
    meta: {}
  } as any

  const createClient = (): { client: any, current: any, hierarchy: any } => {
    const current = {
      _id: 'issue-id',
      _class: 'tracker:class:Issue',
      space: 'space-id',
      description: 'stored-blob'
    }
    const hierarchy = {
      findAttribute: jest.fn(() => ({ type: { _class: core.class.TypeCollaborativeDoc } })),
      isDerived: jest.fn((_cls: string, target: string) => target === core.class.TypeCollaborativeDoc),
      isMixin: jest.fn(() => false)
    }
    const client = {
      getHierarchy: jest.fn(() => hierarchy),
      findOne: jest.fn(async () => current),
      diffUpdate: jest.fn(),
      addCollection: jest.fn(async () => 'dum-id'),
      updateCollection: jest.fn(),
      txFactory: { account: 'account-uuid' }
    }
    return { client, current, hierarchy }
  }

  const save = async (
    client: any,
    getMarkup: { prev: () => Record<string, string>, curr: () => Record<string, string> }
  ): Promise<Record<string, string>> =>
    await new PlatformStorageAdapter({} as any).saveDocumentToPlatform(
      mockCtx,
      client,
      context,
      'doc-name',
      getMarkup
    )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the whole markup map and skips the platform update when markup did not change', async () => {
    const { client } = createClient()
    const markup = { description: '<p>same</p>', content: '<p>other field</p>' }

    const result = await save(client, { prev: () => markup, curr: () => markup })

    expect(result).toEqual(markup)
    expect(saveCollabJson).not.toHaveBeenCalled()
    expect(client.diffUpdate).not.toHaveBeenCalled()
    expect(client.addCollection).not.toHaveBeenCalled()
  })

  it('returns the whole markup map when the stored content already matches', async () => {
    const { client } = createClient()
    ;(loadCollabJson as jest.Mock).mockResolvedValue('<p>new</p>')
    const curr = { description: '<p>new</p>', content: '<p>other field</p>' }

    const result = await save(client, { prev: () => ({ description: '<p>old</p>' }), curr: () => curr })

    expect(result).toEqual(curr)
    expect(saveCollabJson).not.toHaveBeenCalled()
    expect(client.diffUpdate).not.toHaveBeenCalled()
  })

  it('writes the changed document and returns the whole markup map', async () => {
    const { client, current } = createClient()
    ;(loadCollabJson as jest.Mock).mockResolvedValue(undefined)
    ;(saveCollabJson as jest.Mock).mockResolvedValue('new-blob')
    const curr = { description: '<p>new</p>', content: '<p>other field</p>' }

    const result = await save(client, { prev: () => ({ description: '<p>old</p>' }), curr: () => curr })

    expect(result).toEqual(curr)
    expect(saveCollabJson).toHaveBeenCalledWith(
      mockCtx,
      expect.anything(),
      context.wsIds,
      expect.objectContaining({ objectAttr: 'description' }),
      '<p>new</p>'
    )
    expect(client.diffUpdate).toHaveBeenCalledWith(current, { description: 'new-blob' })
  })

  it('returns the whole markup map when the document is not found', async () => {
    const { client } = createClient()
    client.findOne.mockResolvedValue(undefined)
    const curr = { description: '<p>new</p>', content: '<p>other field</p>' }

    const result = await save(client, { prev: () => ({ description: '<p>old</p>' }), curr: () => curr })

    expect(result).toEqual(curr)
    expect(saveCollabJson).not.toHaveBeenCalled()
    expect(client.diffUpdate).not.toHaveBeenCalled()
  })

  it('returns the whole markup map when the attribute is not found', async () => {
    const { client, hierarchy } = createClient()
    hierarchy.findAttribute.mockReturnValue(undefined)
    const curr = { description: '<p>new</p>', content: '<p>other field</p>' }

    const result = await save(client, { prev: () => ({}), curr: () => curr })

    expect(result).toEqual(curr)
    expect(saveCollabJson).not.toHaveBeenCalled()
    expect(client.diffUpdate).not.toHaveBeenCalled()
  })
})
