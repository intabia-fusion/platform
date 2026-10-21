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

import core, { type Doc, type Domain, type Ref } from '@hcengineering/core'
import { type MigrationClient } from '@hcengineering/model'
import { GUEST_DOMAIN } from '../index'
import { guestOperation } from '../migration'
import guest from '../plugin'

const linkClass = guest.class.PublicLink

function link (id: string, extra: Record<string, any> = {}): Doc {
  return { _id: id, _class: linkClass, space: core.space.Workspace, attachedTo: 'doc1', ...extra } as unknown as Doc
}

// Just enough of a MigrationClient: documents per domain, equality on _class and _id with $in.
function createClient (domains: Record<string, Doc[]>): { client: MigrationClient, rows: (domain: string) => Doc[] } {
  const matches = (doc: any, query: Record<string, any>): boolean =>
    Object.entries(query).every(([key, value]) =>
      value?.$in !== undefined ? (value.$in as unknown[]).includes(doc[key]) : doc[key] === value
    )
  const client = {
    hierarchy: {
      domains: () => [...Object.keys(domains), 'tx', 'model'],
      hasClass: (_class: string) => _class !== 'test:class:Gone',
      isDerived: (_class: string, from: string) =>
        _class === from || (_class === 'test:mixin:Task' && from === 'test:class:Task')
    },
    migrateState: new Map<string, Set<string>>(),
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    find: jest.fn(async (domain: string, query: any) => (domains[domain] ?? []).filter((it) => matches(it, query))),
    bulk: jest.fn(async (domain: string, ops: Array<{ filter: any, update: any }>) => {
      for (const { filter, update } of ops) {
        for (const doc of (domains[domain] ?? []).filter((it) => matches(it, filter))) Object.assign(doc, update)
      }
    }),
    deleteMany: jest.fn(async (domain: string, query: any) => {
      domains[domain] = (domains[domain] ?? []).filter((it) => !matches(it, query))
    }),
    create: jest.fn()
  } as unknown as MigrationClient
  return { client, rows: (domain) => domains[domain] }
}

describe('guest migration', () => {
  const task = { _id: 'doc1', _class: 'test:class:Task', space: 'project1' } as unknown as Doc

  it.each([
    ['a document', 'task', task, 'test:class:Task', 'project1'],
    ['a space', 'space', { _id: 'doc1', _class: core.class.Space, space: core.space.Space }, core.class.Space, 'doc1']
  ])(
    'files a link made before attachedToClass was recorded into the space of %s',
    async (_n, domain, doc, cls, space) => {
      const { client, rows } = createClient({ [GUEST_DOMAIN]: [link('old')], [domain]: [doc as unknown as Doc] })

      await guestOperation.migrate(client, 'upgrade')

      // In core.space.Workspace every member read its url, the token of the link.
      expect(rows(GUEST_DOMAIN)).toEqual([expect.objectContaining({ _id: 'old', attachedToClass: cls, space })])
    }
  )

  it('deletes a link whose document is gone, or whose class the model lost', async () => {
    const lost = { _id: 'doc3', _class: 'test:class:Gone', space: 'project1' } as unknown as Doc
    const { client, rows } = createClient({
      [GUEST_DOMAIN]: [link('old'), link('lost', { attachedTo: 'doc3' })],
      task: [lost]
    })

    await guestOperation.migrate(client, 'upgrade')

    expect(rows(GUEST_DOMAIN)).toEqual([])
  })

  it('leaves a link that has its class alone, and does not look for documents in tx or model', async () => {
    const current = link('current', { space: 'project1', attachedToClass: 'test:class:Task' })
    const { client, rows } = createClient({
      [GUEST_DOMAIN]: [current, link('old', { attachedTo: 'doc2' })],
      task: [task]
    })

    await guestOperation.migrate(client, 'upgrade')

    expect(rows(GUEST_DOMAIN)).toEqual([current])
    expect(client.find).not.toHaveBeenCalledWith('tx', expect.anything(), expect.anything())
    expect(client.find).not.toHaveBeenCalledWith('model', expect.anything(), expect.anything())
  })

  // GitHub keeps a DocSyncInfo under the id of the task it syncs, in a domain of its own.
  describe('one id in two domains', () => {
    const sync = { _id: 'doc1', _class: 'github:class:DocSyncInfo', space: 'github-space' } as unknown as Doc
    // The panel address as the link stores it: component, id, class (or mixin), tab.
    const panel = (_class: string): object => ({
      path: [],
      fragment: encodeURIComponent(['view:component:EditDoc', 'doc1', _class, 'content'].join('|'))
    })

    it.each([
      ['test:class:Task', 'task', 'github_sync'],
      ['test:class:Task', 'github_sync', 'task'],
      // A mixin in the address is read as the class it extends.
      ['test:mixin:Task', 'task', 'github_sync']
    ])('files the link by the class %s its panel address names, with %s read first', async (cls, first, second) => {
      const docs: Record<string, Doc[]> = { task: [task], github_sync: [sync] }
      const { client, rows } = createClient({
        [GUEST_DOMAIN]: [link('old', { location: panel(cls) })],
        [first]: docs[first],
        [second]: docs[second]
      })

      await guestOperation.migrate(client, 'upgrade')

      expect(rows(GUEST_DOMAIN)).toEqual([
        expect.objectContaining({ attachedToClass: 'test:class:Task', space: 'project1' })
      ])
    })

    it.each([
      [
        'its address does not tell which document it is',
        [
          link('none'),
          link('other', { location: panel('test:class:Other') }),
          link('broken', { location: { path: [], fragment: '%E0%A4%A' } })
        ],
        { task: [task], github_sync: [sync] }
      ],
      [
        'only the other document is left, for it is not the one shared',
        [link('old', { location: panel('test:class:Task') })],
        { github_sync: [sync] }
      ]
    ])('deletes the link when %s', async (_n, links, docs) => {
      const { client, rows } = createClient({ [GUEST_DOMAIN]: links, ...docs })

      await guestOperation.migrate(client, 'upgrade')

      expect(rows(GUEST_DOMAIN)).toEqual([])
    })

    it('takes the only document when the address names no class', async () => {
      const { client, rows } = createClient({
        [GUEST_DOMAIN]: [link('old', { location: { path: [], fragment: '%E0%A4%A' } })],
        task: [task]
      })

      await guestOperation.migrate(client, 'upgrade')

      expect(rows(GUEST_DOMAIN)).toEqual([expect.objectContaining({ attachedToClass: 'test:class:Task' })])
    })
  })

  it('does nothing in a new workspace, which has no links to file', async () => {
    const { client, rows } = createClient({ [GUEST_DOMAIN]: [link('old')], task: [task] })

    await guestOperation.migrate(client, 'create')

    expect(client.find).not.toHaveBeenCalled()
    expect(rows(GUEST_DOMAIN)[0].space).toBe(core.space.Workspace)
  })

  it('runs once', async () => {
    const { client, rows } = createClient({ [GUEST_DOMAIN]: [link('old')], task: [task] })
    ;(client.create as jest.Mock).mockImplementation(async (domain: Domain, state: any) => {
      client.migrateState.set(state.plugin, new Set([...(client.migrateState.get(state.plugin) ?? []), state.state]))
    })

    await guestOperation.migrate(client, 'upgrade')
    rows(GUEST_DOMAIN).push(link('later'))
    await guestOperation.migrate(client, 'upgrade')

    expect(rows(GUEST_DOMAIN).find((it) => it._id === ('later' as Ref<Doc>))?.space).toBe(core.space.Workspace)
  })
})
