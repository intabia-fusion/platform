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

import { get } from 'svelte/store'
import { SortingOrder } from '@hcengineering/core'
import notification, { type DocNotifyContext } from '@hcengineering/notification'

const mockAccount = { uuid: 'acc-me' as any }

jest.mock('@hcengineering/core', () => ({
  __esModule: true,
  default: {
    space: { Workspace: 'core:space:Workspace' },
    // Referenced at module scope by @hcengineering/notification's utils.ts (textAttributeTypes).
    class: { TypeMarkup: 'core:class:TypeMarkup', TypeCollaborativeDoc: 'core:class:TypeCollaborativeDoc' }
  },
  SortingOrder: { Ascending: 1, Descending: -1 },
  getCurrentAccount: jest.fn(() => mockAccount)
}))

interface TrackedQuery {
  query: jest.Mock
  unsubscribe: jest.Mock
}

// stores.ts creates its LiveQuery instances at module scope, in this order:
// appearancePreferenceQuery, inboxContextsQuery, providerSettingsQuery, typeSettingsQuery.
const trackedQueries: TrackedQuery[] = []

jest.mock('@hcengineering/presentation', () => ({
  createQuery: jest.fn(() => {
    const inst: TrackedQuery = { query: jest.fn(), unsubscribe: jest.fn() }
    trackedQueries.push(inst)
    return inst
  })
}))

// eslint-disable-next-line import/first
import { hasInboxNextPageStore, inboxContextsStore, updateInboxContexts } from '../stores'

function inboxContextsQuery (): TrackedQuery {
  // Second createQuery() call in stores.ts module scope.
  return trackedQueries[1]
}

function makeContext (overrides: Partial<DocNotifyContext> = {}): DocNotifyContext {
  return {
    _id: 'ctx1' as any,
    _class: notification.class.DocNotifyContext,
    space: 'space1' as any,
    user: 'acc-me' as any,
    objectId: 'doc1' as any,
    objectClass: 'tracker:class:Issue' as any,
    lastNotify: 100,
    unreadCount: 1,
    ...overrides
  } as unknown as DocNotifyContext
}

describe('updateInboxContexts', () => {
  beforeEach(() => {
    // The LiveQuery instances are module-scope singletons (created once at import time), so
    // between tests only their recorded calls are cleared, not the instances themselves.
    inboxContextsQuery().query.mockClear()
  })

  it('was set up with four live queries at module scope (appearance, inbox contexts, provider settings, type settings)', () => {
    expect(trackedQueries.length).toBe(4)
  })

  it('issues the live query with lastNotify $gt 0, the current user, descending sort, limit+1 and unreadMessages excluded', () => {
    updateInboxContexts({}, 25)

    const query = inboxContextsQuery().query
    expect(query).toHaveBeenCalledTimes(1)
    const [_class, documentQuery, , options] = query.mock.calls[0]

    expect(_class).toBe(notification.class.DocNotifyContext)
    expect(documentQuery).toEqual({ lastNotify: { $gt: 0 }, user: 'acc-me' })
    // No projection on purpose: the live query layer adds inclusions (_class, space, modifiedOn) and a
    // mixed projection is treated as inclusion-only by the adapter, dropping every other field.
    expect(options).toEqual({
      sort: { lastNotify: SortingOrder.Descending },
      limit: 26
    })
  })

  it('merges the caller-supplied query with lastNotify/user rather than replacing it', () => {
    updateInboxContexts({ objectClass: 'tracker:class:Issue' as any }, 10)

    const [, documentQuery] = inboxContextsQuery().query.mock.calls[0]
    expect(documentQuery).toEqual({
      objectClass: 'tracker:class:Issue',
      lastNotify: { $gt: 0 },
      user: 'acc-me'
    })
  })

  it('sets hasInboxNextPageStore true and drops the extra element when limit+1 results come back', () => {
    updateInboxContexts({}, 2)
    const onContextsUpdate = inboxContextsQuery().query.mock.calls[0][2] as (res: DocNotifyContext[]) => void

    const c1 = makeContext({ _id: 'c1' as any })
    const c2 = makeContext({ _id: 'c2' as any })
    const c3 = makeContext({ _id: 'c3' as any }) // the "limit+1"th element

    onContextsUpdate([c1, c2, c3])

    expect(get(hasInboxNextPageStore)).toBe(true)
    expect(get(inboxContextsStore).map((c) => c._id)).toEqual(['c1', 'c2'])
  })

  it('sets hasInboxNextPageStore false and keeps every result when <= limit results come back', () => {
    updateInboxContexts({}, 2)
    const onContextsUpdate = inboxContextsQuery().query.mock.calls[0][2] as (res: DocNotifyContext[]) => void

    const c1 = makeContext({ _id: 'c1' as any })

    onContextsUpdate([c1])

    expect(get(hasInboxNextPageStore)).toBe(false)
    expect(get(inboxContextsStore).map((c) => c._id)).toEqual(['c1'])
  })

  it('sets hasInboxNextPageStore false when the result count exactly equals the limit', () => {
    updateInboxContexts({}, 2)
    const onContextsUpdate = inboxContextsQuery().query.mock.calls[0][2] as (res: DocNotifyContext[]) => void

    const c1 = makeContext({ _id: 'c1' as any })
    const c2 = makeContext({ _id: 'c2' as any })

    onContextsUpdate([c1, c2])

    expect(get(hasInboxNextPageStore)).toBe(false)
    expect(get(inboxContextsStore).map((c) => c._id)).toEqual(['c1', 'c2'])
  })
})
