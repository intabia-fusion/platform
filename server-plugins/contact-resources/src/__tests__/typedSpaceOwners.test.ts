//
// Copyright © 2026 Intabia Fusion.
//

import core, {
  type PersonId,
  type Ref,
  type Space,
  type TypedSpace,
  TxFactory,
  type TxCreateDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'

import { OnTypedSpaceCreate } from '../index'

describe('OnTypedSpaceCreate', () => {
  it('addresses the owners update to the space of the created object, not the tx space', async () => {
    const tx = {
      _id: 'tx:1',
      _class: core.class.TxCreateDoc,
      space: core.space.Tx,
      objectId: 'space:1' as Ref<TypedSpace>,
      objectClass: core.class.TypedSpace,
      objectSpace: core.space.Space,
      modifiedOn: 1,
      modifiedBy: 'user' as PersonId,
      attributes: { owners: [], members: ['member:1'] }
    } as unknown as TxCreateDoc<TypedSpace>
    const control = { txFactory: new TxFactory(core.account.System, true) } as unknown as TriggerControl

    const res = (await OnTypedSpaceCreate([tx], control)) as Array<TxUpdateDoc<Space>>

    expect(res).toHaveLength(1)
    expect(res[0].operations).toEqual({ owners: ['member:1'] })
    expect(res[0].objectSpace).toBe(core.space.Space)
  })
})
