//
// Copyright © 2025 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import {
  DocEventType,
  type Event,
  EventResult,
  LabelEventType,
  MessageEventType,
  NotificationEventType,
  PeerEventType,
  type SessionData
} from '@hcengineering/communication-sdk-types'
import {
  CardID,
  FindLabelsParams,
  FindNotificationContextParams,
  FindNotificationsParams,
  Label,
  Notification,
  NotificationContext
} from '@hcengineering/communication-types'
import {
  AccountUuid,
  Domain,
  Ref,
  Doc,
  Class,
  Hierarchy
} from '@hcengineering/core'

import type { CommunicationCallbacks, Enriched, Middleware, MiddlewareContext, Subscription } from '../types'
import { BaseMiddleware } from './base'

interface SessionInfo {
  account: AccountUuid
  subscriptions: Map<Domain, Map<CardID, Set<Subscription>>>
}

export class BroadcastMiddleware extends BaseMiddleware implements Middleware {
  private readonly dataBySessionId = new Map<string, SessionInfo>()

  constructor (
    private readonly callbacks: CommunicationCallbacks,
    readonly context: MiddlewareContext,
    next?: Middleware
  ) {
    super(context, next)
  }

  async findNotificationContexts (
    session: SessionData,
    params: FindNotificationContextParams,
    subscription?: Subscription
  ): Promise<NotificationContext[]> {
    this.createSession(session)

    const result = await this.provideFindNotificationContexts(session, params, subscription)
    if (subscription != null && session.sessionId != null && session.sessionId !== '') {
      this.subscribeContextsDoc(session, subscription, result)
    }
    return result
  }

  async findNotifications (
    session: SessionData,
    params: FindNotificationsParams,
    queryId?: Subscription
  ): Promise<Notification[]> {
    this.createSession(session)
    return await this.provideFindNotifications(session, params, queryId)
  }

  async findLabels (session: SessionData, params: FindLabelsParams, queryId?: Subscription): Promise<Label[]> {
    this.createSession(session)
    return await this.provideFindLabels(session, params, queryId)
  }

  async event (session: SessionData, event: Enriched<Event>, derived: boolean): Promise<EventResult> {
    this.createSession(session)
    return await this.provideEvent(session, event, derived)
  }

  unsubscribeDoc (session: SessionData, docId: Ref<Doc>, docClass: Ref<Class<Doc>>, subscription: Subscription): void {
    if (session.sessionId == null) return
    const data = this.dataBySessionId.get(session.sessionId)
    if (data == null) return

    const domain = session.hierarchy.getDomain(docClass)
    const current = data.subscriptions.get(domain)?.get(docId)
    if (current == null) return
    current.delete(subscription)

    data.subscriptions.get(domain)?.set(docId, current)
  }

  subscribeDoc (session: SessionData, docId: Ref<Doc>, docClass: Ref<Class<Doc>>, subscription: string | number): void {
    if (session.sessionId == null) return
    const data = this.dataBySessionId.get(session.sessionId)
    if (data == null) return

    const domain = session.hierarchy.getDomain(docClass)
    const current = data.subscriptions.get(domain)?.get(docId) ?? new Set()
    current.add(subscription)

    if (data.subscriptions.has(domain)) {
      data.subscriptions.get(domain)?.set(docId, current)
    } else {
      data.subscriptions.set(domain, new Map([[docId, current]]))
    }
  }

  handleBroadcast (session: SessionData, events: Enriched<Event>[]): void {
    if (events.length === 0) return
    const sessionIds: Record<string, Enriched<Event>[]> = {}

    for (const [sessionId, sessionInfo] of this.dataBySessionId.entries()) {
      sessionIds[sessionId] = events.filter((it) => this.match(session.hierarchy, it, sessionInfo))
    }

    const ctx = this.context.ctx.newChild('enqueue', {})
    ctx.contextData = session.contextData

    if (Object.keys(sessionIds).length > 0) {
      try {
        this.callbacks.broadcast(ctx, sessionIds)
      } catch (e) {
        this.context.ctx.error('Failed to broadcast event', { error: e })
      }
    }

    try {
      this.callbacks.enqueue(ctx, events)
    } catch (e) {
      this.context.ctx.error('Failed to broadcast event', { error: e })
    }
  }

  closeSession (sessionId: string): void {
    this.dataBySessionId.delete(sessionId)
  }

  close (): void {
    this.dataBySessionId.clear()
  }

  private subscribeContextsDoc (session: SessionData, queryId: Subscription, result: NotificationContext[]): void {
    const data = this.createSession(session)
    if (data == null) return

    for (const context of result) {
      this.subscribeDoc(session, context.docId, context.docClass, queryId)
    }
  }

  private createSession (session: SessionData): SessionInfo | undefined {
    const id = session.sessionId
    if (id == null) return
    if (!this.dataBySessionId.has(id)) {
      this.dataBySessionId.set(id, {
        account: session.account.uuid,
        subscriptions: new Map()
      })
    }

    return this.dataBySessionId.get(id)
  }

  private match (hierarchy: Hierarchy, event: Enriched<Event>, info: SessionInfo): boolean {
    switch (event.type) {
      case MessageEventType.CreateMessage:
      case MessageEventType.ThreadPatch:
      case MessageEventType.ReactionPatch:
      case MessageEventType.AttachmentPatch:
      case MessageEventType.RemovePatch:
      case MessageEventType.UpdatePatch:
      case MessageEventType.TranslateMessage: {
        const domain = hierarchy.getDomain(event.docClass)
        return info.subscriptions.get(domain)?.has(event.docId) ?? false
      }
      case NotificationEventType.RemoveNotifications:
      case NotificationEventType.CreateNotification:
      case NotificationEventType.UpdateNotification:
      case NotificationEventType.RemoveNotificationContext:
      case NotificationEventType.UpdateNotificationContext:
      case NotificationEventType.CreateNotificationContext:
        return info.account === event.account
      case LabelEventType.CreateLabel:
      case LabelEventType.RemoveLabel:
        return info.account === event.account
      case DocEventType.UpdateClassDoc:
      case DocEventType.RemoveDoc:
        return true
      case PeerEventType.RemovePeer:
      case PeerEventType.CreatePeer:
        return false
    }
  }
}
