import serverCommunication from '@hcengineering/server-communication'
import { getMetadata } from '@hcengineering/platform'
import { TriggerControl } from '@hcengineering/server-core'
import core, { Class, Doc, type Hierarchy, Ref, Space, TxCUD, TxMixin } from '@hcengineering/core'

export function isEnabled (): boolean {
  return getMetadata(serverCommunication.metadata.Enabled) === true
}

export async function getDocSpace (control: TriggerControl, doc: Doc, cache: Map<Ref<Doc>, Doc>): Promise<Space> {
  return control.hierarchy.isDerived(doc._class, core.class.Space)
    ? (doc as Space)
    : ((cache.get(doc.space) as Space) ??
      (await control.findAll<Space>(control.ctx, core.class.Space, { _id: doc.space }, { limit: 1 }))[0])
}

export function isMixinTx (tx: TxCUD<Doc>): tx is TxMixin<Doc, Doc> {
  return tx._class === core.class.TxMixin
}

export function isSpace (space: Doc, hierarchy: Hierarchy): space is Space {
  return hierarchy.isDerived(space._class, core.class.Space)
}
