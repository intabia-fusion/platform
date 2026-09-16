/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import core, {
  type Account,
  AccountRole,
  type AccountUuid,
  Hierarchy,
  type MeasureContext,
  MeasureMetricsContext,
  ModelDb,
  type Ref,
  type SessionData,
  type Space,
  toFindResult
} from '@hcengineering/core'
import type { Middleware, PipelineContext, TxMiddlewareResult } from '@hcengineering/server-core'
import { SpaceSecurityMiddleware } from '../spaceSecurity'

const MEMBER = 'user-member' as AccountUuid
const OUTSIDER = 'user-outsider' as AccountUuid

const MY_PRIVATE = 'space-mine' as Ref<Space>
const OTHER_PRIVATE = 'space-theirs' as Ref<Space>

function createAccount (uuid: AccountUuid, role: AccountRole = AccountRole.User): Account {
  return {
    uuid,
    role,
    primarySocialId: `social:${uuid}` as any,
    socialIds: [`social:${uuid}`] as any,
    fullSocialIds: [{ _id: `social:${uuid}` as any, type: 'email' as any, value: `${uuid}@test.com` }] as any
  }
}

function createSessionData (account: Account): SessionData {
  return {
    broadcast: { txes: [], targets: {}, queue: [], sessions: {} },
    contextCache: new Map(),
    removedMap: new Map(),
    account,
    service: 'test',
    sessionId: 'test-session',
    workspace: { uuid: 'test-workspace' as any, url: 'test', dataId: 'test' as any },
    socialStringsToUsers: new Map()
  } as any
}

function privateSpace (_id: Ref<Space>, members: AccountUuid[]): Space {
  return {
    _id,
    _class: core.class.Space,
    space: core.space.Space,
    name: _id,
    description: '',
    private: true,
    archived: false,
    members,
    owners: members.slice(0, 1),
    modifiedOn: Date.now(),
    modifiedBy: core.account.System
  } satisfies Space
}

describe('SpaceSecurityMiddleware.searchFulltext space scoping', () => {
  let ctx: MeasureContext<SessionData>
  let pipelineContext: PipelineContext
  let nextMiddleware: Middleware
  const spaces = [privateSpace(MY_PRIVATE, [MEMBER]), privateSpace(OTHER_PRIVATE, [OUTSIDER])]

  beforeEach(() => {
    const hierarchy = new Hierarchy()
    const modelDb = new ModelDb(hierarchy)

    jest.spyOn(hierarchy, 'isDerived').mockImplementation((_class, from) => {
      if (_class === core.class.Space && from === core.class.Space) return true
      if (from === core.class.Collaborator) return false
      return _class === from
    })

    pipelineContext = {
      workspace: { uuid: 'test-workspace' as any, url: 'test', dataId: 'test' as any },
      hierarchy,
      modelDb,
      branding: null as any,
      adapterManager: {} as any,
      storageAdapter: {} as any,
      contextVars: {},
      lastTx: '',
      lastHash: ''
    }

    nextMiddleware = {
      findAll: jest.fn(async () => toFindResult(spaces)),
      tx: jest.fn(async (): Promise<TxMiddlewareResult> => ({})),
      searchFulltext: jest.fn(async () => ({ docs: [] })),
      handleBroadcast: jest.fn(async () => {}),
      groupBy: jest.fn(async () => new Map()),
      loadModel: jest.fn(async () => []),
      domainRequest: jest.fn(async () => ({})),
      closeSession: jest.fn(async () => {}),
      close: jest.fn(async () => {})
    } as any

    ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>
  })

  async function searchAs (account: Account, spacesQuery?: Ref<Space>[]): Promise<Ref<Space>[]> {
    const mw = await SpaceSecurityMiddleware.create(ctx, pipelineContext, nextMiddleware)
    ctx.contextData = createSessionData(account)
    await mw.init(ctx)
    await mw.searchFulltext(ctx, { query: 'anything', spaces: spacesQuery }, { limit: 10 })
    return (nextMiddleware.searchFulltext as jest.Mock).mock.calls[0][1].spaces
  }

  it('scopes an unfiltered search to the spaces the account may see', async () => {
    const passed = await searchAs(createAccount(MEMBER))
    expect(passed).toContain(MY_PRIVATE)
    expect(passed).not.toContain(OTHER_PRIVATE)
  })

  it('narrows to the requested space when the account is a member', async () => {
    const passed = await searchAs(createAccount(MEMBER), [MY_PRIVATE])
    expect(passed).toEqual([MY_PRIVATE])
  })

  it('drops a requested space the account may not see, rather than honouring it', async () => {
    // The regression guarded here is a search scope widening past the account's own access:
    // highlighted fragments return message content, so a leak reads the text, not just the id.
    const passed = await searchAs(createAccount(MEMBER), [OTHER_PRIVATE])
    expect(passed).not.toContain(OTHER_PRIVATE)
    expect(passed).toHaveLength(0)
  })

  it('keeps only the visible half of a mixed request', async () => {
    const passed = await searchAs(createAccount(MEMBER), [MY_PRIVATE, OTHER_PRIVATE])
    expect(passed).toEqual([MY_PRIVATE])
  })
})
