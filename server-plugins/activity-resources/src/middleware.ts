import core, {
  type Class,
  type Doc,
  type Hierarchy,
  type MeasureContext,
  type Ref,
  type SessionData,
  type TxRemoveDoc
} from '@hcengineering/core'
import { BaseMiddleware, type Middleware, type PipelineContext } from '@hcengineering/server-core'
import activity from '@hcengineering/activity'

export class ActivityMiddleware extends BaseMiddleware implements Middleware {
  static async create (ctx: MeasureContext, pipelineContext: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ActivityMiddleware(pipelineContext, next)
  }

  async handleBroadcast (ctx: MeasureContext<SessionData>): Promise<void> {
    const txes = ctx.contextData.broadcast?.txes ?? []
    const removedMap = ctx.contextData.removedMap
    const hierarchy = this.context.hierarchy

    if (txes.length > 0 && removedMap !== undefined) {
      for (const tx of txes) {
        if (tx._class !== core.class.TxRemoveDoc) continue
        const removeTx = tx as TxRemoveDoc<Doc>
        if (isActivityDoc(removeTx.attachedToClass, hierarchy) || isActivityDoc(removeTx.objectClass, hierarchy)) {
          const doc = removedMap.get(removeTx.objectId)
          if (doc !== undefined) {
            removeTx.removedDoc = doc
          }
        }
      }
    }

    if (this.next !== undefined) {
      await this.next.handleBroadcast(ctx)
    }
  }
}

function isActivityDoc (_class: Ref<Class<Doc>> | undefined, hierarchy: Hierarchy): boolean {
  if (_class == null) return false
  const mixin = hierarchy.classHierarchyMixin(_class, activity.mixin.ActivityDoc)

  return mixin !== undefined
}
