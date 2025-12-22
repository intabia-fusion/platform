//
// Copyright © 2022 Hardcore Engineering Inc.
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

import type { SessionData as CommunicationSession, Event, ServerApi } from '@hcengineering/communication-sdk-types'
import core, {
  generateId,
  type DomainParams,
  type DomainResult,
  type MeasureContext,
  type OperationDomain,
  type SessionData,
  type TxDomainEvent,
  type WorkspaceIds,
  type Hierarchy,
  type Tx
} from '@hcengineering/core'
import {
  type CommunicationCallbacks,
  type Middleware,
  type MiddlewareCreator,
  type PipelineContext,
  BaseMiddleware,
  type TxMiddlewareResult
} from '@hcengineering/server-core'

export const COMMUNICATION_DOMAIN = 'communication' as OperationDomain

export type CommunicationApiFactory = (
  ctx: MeasureContext,
  ws: WorkspaceIds,
  hierarchy: Hierarchy,
  callbacks: CommunicationCallbacks
) => Promise<ServerApi>

/**
 * @public
 */
export class CommunicationMiddleware extends BaseMiddleware implements Middleware {
  constructor (
    readonly ctx: MeasureContext,
    readonly context: PipelineContext,
    readonly next: Middleware | undefined,
    readonly communicationApi: ServerApi,
    private readonly processingEvents = new Map<string, TxDomainEvent>()
  ) {
    super(context, next)
  }

  static create (communicationApiFactory: CommunicationApiFactory): MiddlewareCreator {
    const processingTxes = new Map<string, TxDomainEvent>()

    return async (ctx, context, next): Promise<Middleware> => {
      const communicationApi = await communicationApiFactory(ctx, context.workspace, context.hierarchy, {
        registerAsyncRequest: (ctx, promise) => {
          const contextData = ctx.contextData as SessionData
          contextData.asyncRequests = [
            ...(contextData.asyncRequests ?? []),
            async (_ctx) => {
              await promise(_ctx)
            }
          ]
        },
        broadcast: (ctx, result) => {
          const contextData = ctx.contextData as SessionData
          contextData.hasDomainBroadcast = true
          for (const [sessionId, events] of Object.entries(result)) {
            const txEvents = CommunicationMiddleware.wrapEvents(contextData, events, processingTxes)
            contextData.broadcast.sessions[sessionId] = (contextData.broadcast.sessions[sessionId] ?? []).concat(
              txEvents
            )
          }
        },
        enqueue: (ctx, result: Event[]) => {
          const contextData = ctx.contextData as SessionData
          const txEvents = CommunicationMiddleware.wrapEvents(contextData, result, processingTxes)
          contextData.hasDomainBroadcast = true
          contextData.broadcast.queue.push(...txEvents)
          void context.derived?.tx(ctx, txEvents)
        }
      })
      return new CommunicationMiddleware(ctx, context, next, communicationApi, processingTxes)
    }
  }

  async tx (ctx: MeasureContext, tx: Tx[]): Promise<TxMiddlewareResult> {
    const other: Tx[] = []
    const domainResults: DomainResult[] = []

    for (const t of tx) {
      if (t._class === core.class.TxDomainEvent) {
        const dTx = t as TxDomainEvent
        if (dTx.domain === COMMUNICATION_DOMAIN && dTx.event?.done !== true) {
          dTx.event._id = dTx.event._id ?? generateId()
          this.processingEvents.set(dTx.event._id, dTx)
          const res = await this.domainRequest(ctx, dTx.domain, { event: dTx.event })
          domainResults.push(res)
        } else {
          other.push(t)
        }
      } else {
        other.push(t)
      }
    }

    if (domainResults.length > 0) {
      await this.provideTx(ctx, other)

      return domainResults.length === 1 ? domainResults[0] : domainResults
    }

    return await this.provideTx(ctx, other)
  }

  private static wrapEvents (
    ctx: SessionData,
    result: Event[],
    processingTxes: Map<string, TxDomainEvent>
  ): TxDomainEvent[] {
    return result.map((it) => {
      const tx = it._id != null ? processingTxes.get(it._id) : undefined

      if (tx != null) {
        return {
          ...tx,
          event: it
        }
      }

      return {
        _id: generateId(),
        space: core.space.Tx,
        objectSpace: core.space.Domain,
        _class: core.class.TxDomainEvent,
        domain: COMMUNICATION_DOMAIN,
        event: it,
        modifiedBy: ctx.account.primarySocialId,
        modifiedOn: Date.now()
      }
    })
  }

  async domainRequest (ctx: MeasureContext, domain: OperationDomain, params: DomainParams): Promise<DomainResult> {
    if (domain === COMMUNICATION_DOMAIN) {
      return {
        domain,
        value: await this.handleCommand(ctx, params)
      }
    } else {
      return await this.provideDomainRequest(ctx, domain, params)
    }
  }

  async close (): Promise<void> {
    await this.communicationApi.close()
  }

  async handleCommand (_ctx: MeasureContext<SessionData>, args: DomainParams): Promise<any> {
    const ctx = this.getCommunicationCtx(_ctx)

    if (args.findMessagesMeta !== undefined) {
      const { params } = args.findMessagesMeta
      return await this.communicationApi.findMessagesMeta(ctx, params)
    }
    if (args.findMessagesGroups !== undefined) {
      const { params } = args.findMessagesGroups
      return await this.communicationApi.findMessagesGroups(ctx, params)
    }
    if (args.findNotificationContexts !== undefined) {
      const { params, subscription } = args.findNotificationContexts
      return await this.communicationApi.findNotificationContexts(ctx, params, subscription)
    }
    if (args.findNotifications !== undefined) {
      const { params, subscription } = args.findNotifications
      return await this.communicationApi.findNotifications(ctx, params, subscription)
    }
    if (args.findLabels !== undefined) {
      const { params } = args.findLabels
      return await this.communicationApi.findLabels(ctx, params)
    }
    if (args.findPeers !== undefined) {
      const { params } = args.findPeers
      return await this.communicationApi.findPeers(ctx, params)
    }
    if (args.subscribeDoc !== undefined) {
      const { docId, docClass, subscription } = args.subscribeDoc
      this.communicationApi.subscribeDoc(ctx, docId, docClass, subscription)
      return
    }
    if (args.unsubscribeDoc !== undefined) {
      const { docId, docClass, subscription } = args.unsubscribeDoc
      this.communicationApi.unsubscribeDoc(ctx, docId, docClass, subscription)
      return
    }
    if (args.event !== undefined) {
      const event = args.event
      return await this.communicationApi.event(ctx, event)
    }
    return {}
  }

  private getCommunicationCtx (ctx: MeasureContext<SessionData>): CommunicationSession {
    return {
      ...ctx,
      hierarchy: this.context.hierarchy,
      sessionId: ctx.contextData.sessionId,
      asyncData: [],
      derived: ctx.contextData.isTriggerCtx === true,
      account: ctx.contextData.account
    }
  }
}
