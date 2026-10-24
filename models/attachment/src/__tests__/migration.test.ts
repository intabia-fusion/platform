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

import { DOMAIN_MODEL, type Doc } from '@hcengineering/core'
import { type MigrationClient } from '@hcengineering/model'
import { DOMAIN_ATTACHMENT } from '../index'
import { removeOrphanAttachments } from '../migration'

const domainOf: Record<string, string> = {
  'test:class:Task': 'task',
  'test:class:Template': DOMAIN_MODEL
}

function file (id: string, attachedTo: string, attachedToClass: string): Doc {
  return {
    _id: id,
    _class: 'attachment:class:Attachment',
    space: 'project1',
    attachedTo,
    attachedToClass,
    file: `blob-${id}`
  } as unknown as Doc
}

// Just enough of a MigrationClient: documents per domain, equality and $in/$nin on fields.
function createClient (domains: Record<string, Doc[]>): {
  client: MigrationClient
  rows: (domain: string) => Doc[]
  removedBlobs: string[]
} {
  const matches = (doc: any, query: Record<string, any>): boolean =>
    Object.entries(query).every(([key, value]) => {
      if (value?.$in !== undefined) return (value.$in as unknown[]).includes(doc[key])
      if (value?.$nin !== undefined) return !(value.$nin as unknown[]).includes(doc[key])
      return doc[key] === value
    })
  const removedBlobs: string[] = []
  const client = {
    hierarchy: {
      getDescendants: () => ['attachment:class:Attachment'],
      findDomain: (_class: string) => domainOf[_class]
    },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    traverse: jest.fn(async (domain: string) => {
      let done = false
      return {
        next: async () => {
          if (done) return null
          done = true
          return [...(domains[domain] ?? [])]
        },
        close: async () => {}
      }
    }),
    find: jest.fn(async (domain: string, query: any) => (domains[domain] ?? []).filter((it) => matches(it, query))),
    deleteMany: jest.fn(async (domain: string, query: any) => {
      domains[domain] = (domains[domain] ?? []).filter((it) => !matches(it, query))
    }),
    storageAdapter: {
      remove: jest.fn(async (_ctx: unknown, _ws: unknown, blobs: string[]) => {
        removedBlobs.push(...blobs)
      })
    }
  } as unknown as MigrationClient
  return { client, rows: (domain) => domains[domain] ?? [], removedBlobs }
}

describe('removeOrphanAttachments', () => {
  it('removes the file and its blob when the document is gone', async () => {
    const live = file('live', 'task1', 'test:class:Task')
    const { client, rows, removedBlobs } = createClient({
      [DOMAIN_ATTACHMENT]: [live, file('gone', 'task2', 'test:class:Task')],
      task: [{ _id: 'task1', _class: 'test:class:Task', space: 'project1' } as unknown as Doc]
    })

    await removeOrphanAttachments(client)

    expect(rows(DOMAIN_ATTACHMENT)).toEqual([live])
    expect(removedBlobs).toEqual(['blob-gone'])
  })

  // A class missing from this model says nothing about the document: its plugin may be off here.
  it('keeps a file whose class the model does not know', async () => {
    const unknown = file('unknown', 'doc1', 'test:class:Unknown')
    const { client, rows, removedBlobs } = createClient({ [DOMAIN_ATTACHMENT]: [unknown] })

    await removeOrphanAttachments(client)

    expect(rows(DOMAIN_ATTACHMENT)).toEqual([unknown])
    expect(removedBlobs).toEqual([])
  })

  it('keeps a file of a model document, which find does not return', async () => {
    const template = file('template', 'tmpl1', 'test:class:Template')
    const { client, rows, removedBlobs } = createClient({ [DOMAIN_ATTACHMENT]: [template] })

    await removeOrphanAttachments(client)

    expect(rows(DOMAIN_ATTACHMENT)).toEqual([template])
    expect(removedBlobs).toEqual([])
    expect(client.find).not.toHaveBeenCalledWith(DOMAIN_MODEL, expect.anything(), expect.anything())
  })
})
