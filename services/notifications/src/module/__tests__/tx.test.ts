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

import activity from '@hcengineering/activity'
import core, { Doc, TxCUD } from '@hcengineering/core'
import notification, { TxNotificationType } from '@hcengineering/notification'
import { getResource } from '@hcengineering/platform'

import { Client } from '../../types'
import Cache from '../../cache'
import { getNotifiedDoc, handleTxNotification } from '../tx'
import { pushNotification } from '../notification'
import { getTxNotifyProviders } from '../../utils/utils'
import { emptyResult } from '../../utils/result'

jest.mock('../../config', () => ({
  __esModule: true,
  default: {}
}))

jest.mock('@hcengineering/platform', () => ({
  ...jest.requireActual('@hcengineering/platform'),
  getResource: jest.fn()
}))

jest.mock('../../utils/utils', () => ({
  getBaseDisplayParams: jest.fn(async () => ({ intlParams: {}, intlParamsNotLocalized: {} })),
  getCollaboratorAccounts: jest.fn(async () => ['account-1']),
  getMode: jest.fn(() => 'all'),
  getNotifiedUsers: jest.fn(() => []),
  getContextRefs: jest.fn(async () => ({})),
  getTxNotifyProviders: jest.fn(),
  getTypeMatchClient: jest.fn(),
  isMatchedTxType: jest.fn(() => true),
  isMuted: jest.fn(() => false)
}))

jest.mock('../notification', () => ({
  pushNotification: jest.fn()
}))

describe('getNotifiedDoc', () => {
  const issue = { _id: 'issue-1', _class: 'tracker:class:Issue' } as any as Doc
  const todo = {
    _id: 'todo-1',
    _class: 'time:class:ProjectToDo',
    attachedTo: 'issue-1',
    attachedToClass: 'tracker:class:Issue'
  } as any as Doc
  const message = { _id: 'msg-1', _class: activity.class.ActivityMessage } as any as Doc

  const client = {
    hierarchy: { isDerived: (_class: string, base: string) => _class === base }
  } as any as Client
  let cache: { getDoc: jest.Mock }

  beforeEach(() => {
    cache = { getDoc: jest.fn(async (_id: string) => (_id === issue._id ? issue : undefined)) }
  })

  const type = (attachToParent?: boolean): TxNotificationType => ({ attachToParent }) as any

  it('takes the parent of an update tx from the doc itself', async () => {
    expect(await getNotifiedDoc(client, cache as any as Cache, undefined, todo, type(true))).toBe(issue)
    expect(cache.getDoc).toHaveBeenCalledWith('issue-1', 'tracker:class:Issue')
  })

  it('prefers the parent the tx carries', async () => {
    const other = { _id: 'issue-2' } as any as Doc
    expect(await getNotifiedDoc(client, cache as any as Cache, other, todo, type(true))).toBe(other)
    expect(cache.getDoc).not.toHaveBeenCalled()
  })

  it('stays on the doc when the parent is gone or the type is not attached to it', async () => {
    cache.getDoc.mockResolvedValue(undefined)
    expect(await getNotifiedDoc(client, cache as any as Cache, undefined, todo, type(true))).toBe(todo)
    expect(await getNotifiedDoc(client, cache as any as Cache, issue, todo, type())).toBe(todo)
  })

  it('puts a message in the context of the doc it is attached to', async () => {
    expect(await getNotifiedDoc(client, cache as any as Cache, issue, message, type())).toBe(issue)
    expect(await getNotifiedDoc(client, cache as any as Cache, undefined, message, type())).toBe(message)
  })
})

describe('handleTxNotification', () => {
  const issue = { _id: 'issue-1', _class: 'tracker:class:Issue', space: 'project-1' } as any as Doc
  const todo = {
    _id: 'todo-1',
    _class: 'time:class:ProjectToDo',
    space: 'time:space:ToDos',
    attachedTo: 'issue-1',
    attachedToClass: 'tracker:class:Issue'
  } as any as Doc
  const reassigned = { _id: 'type-reassigned', attachToParent: true } as any as TxNotificationType

  it('puts an update of an attached doc in the context of the parent and matches the doc itself', async () => {
    const createFn = jest.fn(async () => ({ notification: { header: { titleIntl: 'title' } } }))
    ;(getResource as jest.Mock).mockResolvedValue(createFn)
    ;(getTxNotifyProviders as jest.Mock).mockResolvedValue({
      [notification.providers.InboxNotificationProvider]: [reassigned]
    })
    const client = {
      ctx: { warn: jest.fn() },
      hierarchy: {
        isDerived: (_class: string, base: string) => _class === base,
        hasMixin: () => true,
        as: () => ({ create: 'create' })
      }
    } as any as Client
    const cache = {
      getDoc: jest.fn(async (_id: string) => (_id === issue._id ? issue : _id === todo._id ? todo : undefined)),
      getSender: jest.fn(async () => ({})),
      getSettings: jest.fn(async () => ({})),
      getDocSpace: jest.fn(async () => ({ _id: 'project-1' })),
      getReceivers: jest.fn(async () => [{ account: 'account-1', socialIds: [] }]),
      getContexts: jest.fn(async () => []),
      getDocSettings: jest.fn(async () => []),
      getPushSubscriptions: jest.fn(async () => [])
    }
    const tx = {
      _id: 'tx-1',
      _class: core.class.TxUpdateDoc,
      objectId: todo._id,
      objectClass: todo._class,
      operations: { reassignedTo: 'person-2' },
      modifiedOn: 1,
      modifiedBy: 'social-1'
    } as any as TxCUD<Doc>

    await handleTxNotification(client, cache as any as Cache, {} as any, emptyResult(), tx, [reassigned])

    expect((getTxNotifyProviders as jest.Mock).mock.calls[0][2]).toBe(todo)
    expect((pushNotification as jest.Mock).mock.calls[0][4]).toMatchObject({
      objectId: 'issue-1',
      objectClass: 'tracker:class:Issue'
    })
  })
})
