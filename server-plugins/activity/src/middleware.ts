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
            if (doc.createdOn !== undefined) {
              if (removeTx.meta === undefined) {
                removeTx.meta = {}
              }
              removeTx.meta.createdOn = doc.createdOn
            }
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
