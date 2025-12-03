//
// Copyright © 2023 Hardcore Engineering Inc.
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
  type Doc,
  matchQuery,
  type MeasureContext,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  TxDomainEvent,
  type OperationDomain,
  generateId
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import communication, { ActivityControl } from '@hcengineering/communication'
import { ActivityMessageExtra, MessageType } from '@hcengineering/communication-types'
import { CreateMessageEvent, MessageEventType } from '@hcengineering/communication-sdk-types'

import { isEnabled } from '../utils'
import {
  getActivityAction,
  getActivityAttributesUpdates,
  getActivityCollectionUpdate,
  getActivityMarkdownContent,
  getDocCached,
  isActivityIgnored,
  isMessageableDoc
} from './utils'
import { ActivityMessagesTriggerCacheKey, DocsCache } from './types'

async function pushActivityMessageTx (
  ctx: MeasureContext,
  control: TriggerControl,
  res: TxDomainEvent[],
  doc: Doc,
  tx: TxCUD<Doc>,
  docsCache: DocsCache,
  controlRules?: ActivityControl[]
): Promise<TxDomainEvent[]> {
  if (!isMessageableDoc(doc._class, control.hierarchy)) return res

  const activityExtras: ActivityMessageExtra[] = []
  const action = getActivityAction(control.hierarchy, tx)

  if (tx.attachedToClass != null && tx.attachedTo != null && doc._id === tx.attachedTo) {
    const collectionUpdate = await getActivityCollectionUpdate(control, tx, doc, controlRules)
    if (collectionUpdate != null) {
      activityExtras.push({ action, update: collectionUpdate })
    }
  } else {
    const attributesUpdates = await getActivityAttributesUpdates(ctx, control, tx, doc, docsCache, controlRules)

    for (const attributeUpdates of attributesUpdates) {
      activityExtras.push({ action, update: attributeUpdates })
    }

    if (attributesUpdates.length === 0 && action !== 'update') {
      activityExtras.push({ action })
    }
  }

  for (const extra of activityExtras) {
    const event: CreateMessageEvent = {
      type: MessageEventType.CreateMessage,
      messageType: MessageType.Activity,
      docId: doc._id,
      docClass: doc._class,
      content: await getActivityMarkdownContent(control, extra, doc),
      socialId: tx.modifiedBy,
      extra,
      date: new Date(tx.modifiedOn)
    }
    res.push({
      _id: generateId(),
      _class: core.class.TxDomainEvent,
      space: core.space.Tx,
      objectSpace: doc.space,
      modifiedOn: tx.modifiedOn,
      modifiedBy: tx.modifiedBy,
      domain: 'communication' as OperationDomain,
      event
    })
  }
  return res
}

async function generateActivityMessages (
  ctx: MeasureContext,
  control: TriggerControl,
  res: TxDomainEvent[],
  tx: TxCUD<Doc>,
  docsCache: DocsCache,
  skipAttached: boolean = false
): Promise<TxDomainEvent[]> {
  const { hierarchy } = control

  if (
    isActivityIgnored(tx.objectClass, hierarchy) ||
    (tx.attachedToClass !== undefined && isActivityIgnored(tx.attachedToClass, hierarchy))
  ) {
    return res
  }

  // Check if we have override control over transaction => activity mappings
  const controlRules = control.modelDb.findAllSync<ActivityControl>(communication.class.ActivityControl, {
    objectClass: { $in: hierarchy.getAncestors(tx.objectClass) }
  })
  if (controlRules.length > 0) {
    for (const r of controlRules) {
      for (const s of r.skip) {
        if (matchQuery([tx], s, core.class.TxCUD, hierarchy).length > 0) {
          // Match found, we need to skip
          return res
        }
      }
    }
  }

  if (tx.attachedTo !== undefined && tx.attachedToClass !== undefined && !skipAttached) {
    res = await generateActivityMessages(ctx, control, res, tx, docsCache, true)
    if ([core.class.TxCreateDoc, core.class.TxRemoveDoc].includes(tx._class)) {
      if (!isMessageableDoc(tx.attachedToClass, control.hierarchy)) {
        return res
      }

      const doc = await getDocCached(ctx, control, tx.attachedToClass, tx.attachedTo, docsCache)
      if (doc != null) {
        return await ctx.with(
          'push-activity-message',
          {},
          async (ctx) => await pushActivityMessageTx(ctx, control, res, doc, tx, docsCache, controlRules)
        )
      }
    }
    return res
  }

  switch (tx._class) {
    case core.class.TxCreateDoc: {
      const doc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>)
      return await ctx.with('push-activity-message', {}, (ctx) =>
        pushActivityMessageTx(ctx, control, res, doc, tx, docsCache, controlRules)
      )
    }
    case core.class.TxMixin:
    case core.class.TxUpdateDoc: {
      if (!isMessageableDoc(tx.objectClass, control.hierarchy)) return res
      const doc = await getDocCached(ctx, control, tx.objectClass, tx.objectId, docsCache)
      if (doc == null) return res
      return await ctx.with(
        'push-activity-message',
        {},
        async (ctx) => await pushActivityMessageTx(ctx, control, res, doc, tx, docsCache, controlRules)
      )
    }
  }

  return res
}

export async function ActivityMessagesTrigger (txes: TxCUD<Doc>[], control: TriggerControl): Promise<TxDomainEvent[]> {
  if (!isEnabled()) return []

  const cache: DocsCache = control.contextCache.get(ActivityMessagesTriggerCacheKey) ?? new Map()
  control.contextCache.set(ActivityMessagesTriggerCacheKey, cache)

  const res: TxDomainEvent[] = []

  for (const tx of txes) {
    if (!TxProcessor.isExtendsCUD(tx._class)) continue
    if (tx.space === core.space.DerivedTx) continue
    const _txes = await control.ctx.with('generate-activity-messages', {}, (ctx) =>
      generateActivityMessages(ctx, control, [], tx, cache)
    )
    console.log('ActivityMessagesTrigger', _txes, tx)
    res.push(..._txes)
  }

  return res
}
