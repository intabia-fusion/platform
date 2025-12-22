//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { Class, type Doc, Hierarchy, type MeasureContext, type Ref, WorkspaceUuid } from '@hcengineering/core'
import type {
  FindNotificationContextParams,
  FindNotificationsParams,
  NotificationContext,
  Notification,
  FindLabelsParams,
  Label,
  FindPeersParams,
  Peer,
  FindMessagesMetaParams, MessageMeta, FindMessagesGroupParams, MessagesGroup
} from '@hcengineering/communication-types'
import { createDbAdapter } from '@hcengineering/communication-postgres'
import type { EventResult, Event, ServerApi, SessionData } from '@hcengineering/communication-sdk-types'

import { getMetadata } from './metadata'
import type { CommunicationCallbacks, Subscription } from './types'
import { buildMiddlewares, Middlewares } from './middlewares'
import { Blob } from './blob'
import { LowLevelClient } from './client'

export class Api implements ServerApi {
  private constructor (
    private readonly ctx: MeasureContext,
    private readonly middlewares: Middlewares
  ) {}

  static async create (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    hierarchy: Hierarchy,
    dbUrl: string,
    callbacks: CommunicationCallbacks
  ): Promise<Api> {
    const metadata = getMetadata()
    const db = await createDbAdapter(dbUrl, workspace, hierarchy, ctx, {
      withLogs: process.env.COMMUNICATION_TIME_LOGGING_ENABLED === 'true'
    })
    const blob = new Blob(ctx, workspace, metadata)
    const client: LowLevelClient = new LowLevelClient(db, blob, metadata, workspace, hierarchy)
    const middleware = await buildMiddlewares(ctx, workspace, metadata, client, callbacks)

    return new Api(ctx, middleware)
  }

  async findMessagesMeta (session: SessionData, params: FindMessagesMetaParams): Promise<MessageMeta[]> {
    return await this.middlewares.findMessagesMeta(session, params)
  }

  async findMessagesGroups (session: SessionData, params: FindMessagesGroupParams): Promise<MessagesGroup[]> {
    return await this.middlewares.findMessagesGroups(session, params)
  }

  async findNotificationContexts (
    session: SessionData,
    params: FindNotificationContextParams,
    subscription?: Subscription
  ): Promise<NotificationContext[]> {
    return await this.middlewares.findNotificationContexts(session, params, subscription)
  }

  async findNotifications (
    session: SessionData,
    params: FindNotificationsParams,
    subscription?: Subscription
  ): Promise<Notification[]> {
    return await this.middlewares.findNotifications(session, params, subscription)
  }

  async findLabels (session: SessionData, params: FindLabelsParams): Promise<Label[]> {
    return await this.middlewares.findLabels(session, params)
  }

  async findPeers (session: SessionData, params: FindPeersParams): Promise<Peer[]> {
    return await this.middlewares.findPeers(session, params)
  }

  subscribeDoc (session: SessionData, docId: Ref<Doc>, docClass: Ref<Class<Doc>>, subscription: Subscription): void {
    this.middlewares.subscribeDoc(session, docId, docClass, subscription)
  }

  unsubscribeDoc (session: SessionData, docId: Ref<Doc>, docClass: Ref<Class<Doc>>, subscription: Subscription): void {
    this.middlewares.unsubscribeDoc(session, docId, docClass, subscription)
  }

  async event (session: SessionData, event: Event): Promise<EventResult> {
    return await this.middlewares.event(session, event)
  }

  async closeSession (sessionId: string): Promise<void> {
    await this.middlewares.closeSession(sessionId)
  }

  async close (): Promise<void> {
    await this.middlewares.close()
  }
}
