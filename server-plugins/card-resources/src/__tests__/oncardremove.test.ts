import card from '@hcengineering/card'
import core from '@hcengineering/core'
import plugin from '../index'

describe('OnCardRemove', () => {
  it('removes blobs of the removed card from storage', async () => {
    const removed = { _id: 'c1', _class: card.class.Card, space: 's1', blobs: { a: { file: 'f1' }, b: { file: 'f2' } } }
    const remove = jest.fn()
    const control: any = {
      ctx: {},
      workspace: { name: 'ws' },
      removedMap: new Map([['c1', removed]]),
      findAll: async () => [],
      txFactory: { createTxRemoveDoc: jest.fn(), createTxUpdateDoc: jest.fn() },
      storageAdapter: { remove }
    }
    const trigger = (await plugin()).trigger.OnCardRemove as any
    await trigger([{ objectId: 'c1', objectClass: card.class.Card, objectSpace: core.space.Workspace }], control)
    expect(remove).toHaveBeenCalledWith(control.ctx, control.workspace, ['f1', 'f2'])
  })

  it('handles every removed card of a batch', async () => {
    const mk = (id: string): any => ({
      _id: id,
      _class: card.class.Card,
      space: 's1',
      blobs: { a: { file: `f-${id}` } }
    })
    const remove = jest.fn()
    const control: any = {
      ctx: {},
      workspace: { name: 'ws' },
      removedMap: new Map([
        ['c1', mk('c1')],
        ['c2', mk('c2')]
      ]),
      findAll: async () => [],
      txFactory: { createTxRemoveDoc: jest.fn(), createTxUpdateDoc: jest.fn() },
      storageAdapter: { remove }
    }
    const trigger = (await plugin()).trigger.OnCardRemove as any
    const txes = ['c1', 'c2'].map((objectId) => ({
      objectId,
      objectClass: card.class.Card,
      objectSpace: core.space.Workspace
    }))
    await trigger(txes, control)
    expect(remove).toHaveBeenCalledWith(control.ctx, control.workspace, ['f-c1'])
    expect(remove).toHaveBeenCalledWith(control.ctx, control.workspace, ['f-c2'])
  })
})
