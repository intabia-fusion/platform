import core, {
  type Class,
  type Doc,
  DOMAIN_MODEL_TX,
  modelTxHashJson,
  type PersonId,
  type Ref,
  type Tx,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getSchema } from '../schemas'
import { convertDoc, type DBDoc, parseDoc } from '../utils'

// What a SELECT hands back for a stored row: NULL for an absent column, bigint as a string,
// and the jsonb payload with keys in its own order.
function readBack (tx: Tx): Tx {
  const row: Record<string, any> = { ...convertDoc(DOMAIN_MODEL_TX, tx, 'ws' as WorkspaceUuid) }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'data') {
      row.data = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(value))).reverse())
    } else if (value === undefined) {
      row[key] = null
    } else if (typeof value === 'number') {
      row[key] = value.toString()
    }
  }
  return parseDoc<Tx>(row as DBDoc, getSchema(DOMAIN_MODEL_TX))
}

describe('model tx hash', () => {
  const objectId = 'test:class:Item' as Ref<Class<Doc>>

  function txes (factory: TxFactory): Tx[] {
    return [
      factory.createTxCreateDoc(core.class.Class, core.space.Model, { label: 'Item' } as any, objectId),
      factory.createTxUpdateDoc(core.class.Class, core.space.Model, objectId, { label: 'Renamed' } as any),
      factory.createTxMixin(objectId, core.class.Class, core.space.Model, core.mixin.IndexConfiguration, {
        searchDisabled: true
      } as any),
      factory.createTxRemoveDoc(core.class.Class, core.space.Model, objectId)
    ]
  }

  it('is the same for a user tx and the tx read back from the database', () => {
    // ModifiedMiddleware stamps createdOn on every tx not made by System.
    for (const tx of txes(new TxFactory('user1' as PersonId))) {
      tx.createdOn = tx.modifiedOn
      expect(modelTxHashJson(readBack(tx))).toBe(modelTxHashJson(tx))
    }
  })

  it('is the same for a system tx and the tx read back from the database', () => {
    for (const tx of txes(new TxFactory(core.account.System))) {
      expect(modelTxHashJson(readBack(tx))).toBe(modelTxHashJson(tx))
    }
  })
})
