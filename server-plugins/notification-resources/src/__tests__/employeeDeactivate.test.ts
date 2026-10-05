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
import contact from '@hcengineering/contact'
import core from '@hcengineering/core'
import notification from '@hcengineering/notification'
import plugin from '../index'

describe('OnEmployeeDeactivate', () => {
  it('still removes push subscriptions when an unrelated tx comes first in the batch', async () => {
    const sub = { _id: 'sub1', _class: notification.class.PushSubscription, space: core.space.Workspace }
    const control: any = {
      ctx: {},
      findAll: jest.fn(async (_ctx: any, _class: any) =>
        _class === contact.class.Person ? [{ _id: 'p1', personUuid: 'u1' }] : [sub]
      ),
      txFactory: { createTxRemoveDoc: jest.fn((_class: any, space: any, id: any) => ({ objectId: id })) }
    }
    const activate = { _class: core.class.TxMixin, mixin: contact.mixin.Employee, attributes: { active: true } }
    const deactivate = {
      _class: core.class.TxMixin,
      mixin: contact.mixin.Employee,
      objectId: 'p1',
      attributes: { active: false }
    }
    const trigger = (await plugin()).trigger.OnEmployeeDeactivate as any
    const res = await trigger([activate, deactivate], control)
    expect(res).toHaveLength(1)
  })
})
