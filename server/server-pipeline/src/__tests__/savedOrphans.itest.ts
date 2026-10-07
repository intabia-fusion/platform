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

// Bookmarks of every user go away with the message or attachment they point at:
// the real pipeline with triggers on a real Postgres.

import activity, { type ActivityMessage, type SavedMessage } from '@hcengineering/activity'
import attachment, { type Attachment, type SavedAttachments } from '@hcengineering/attachment'
import chunter, { type Channel, type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import core, {
  type Account,
  AccountRole,
  type AccountUuid,
  type Blob,
  type Doc,
  generateId,
  MeasureMetricsContext,
  type PersonId,
  type Ref,
  TxOperations,
  type WorkspaceIds,
  type WorkspaceUuid
} from '@hcengineering/core'
import buildModel from '@hcengineering/model-all'
import { removeOrphanPreferences } from '@hcengineering/model-preference'
import {
  createPostgreeDestroyAdapter,
  createPostgresAdapter,
  createPostgresTxAdapter,
  getDBClient,
  setDBExtraOptions,
  shutdownPostgres
} from '@hcengineering/postgres'
import { addLocation } from '@hcengineering/platform'
import { DOMAIN_PREFERENCE } from '@hcengineering/preference'
import { serverActivityId } from '@hcengineering/server-activity'
import { serverAttachmentId } from '@hcengineering/server-attachment'
import { serverChunterId } from '@hcengineering/server-chunter'
import { createDummyStorageAdapter, type Pipeline, SessionDataImpl, wrapPipeline } from '@hcengineering/server-core'
import {
  getServerPipeline,
  registerAdapterFactory,
  registerDestroyFactory,
  registerStringLoaders,
  registerTxAdapterFactory
} from '../index'
import { postgresUrl } from '@hcengineering/test-containers'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { promisify } from 'util'

jest.setTimeout(300000)

function makeAccount (name: string): Account {
  const socialId = `email:${name}-${generateId()}@test` as PersonId
  return {
    uuid: randomUUID() as AccountUuid,
    role: AccountRole.User,
    primarySocialId: socialId,
    socialIds: [socialId],
    fullSocialIds: []
  }
}

describe('saved messages and attachments follow their target', () => {
  const ctx = new MeasureMetricsContext('saved-orphans', {})
  const wsIds: WorkspaceIds = { uuid: randomUUID() as WorkspaceUuid, url: 'saved-orphans' }
  const [alice, bob, carol] = [makeAccount('alice'), makeAccount('bob'), makeAccount('carol')]
  const users = new Map([alice, bob, carol].map((it) => [it.primarySocialId, { accountUuid: it.uuid, role: it.role }]))
  let pipeline: Pipeline
  let channel: Ref<Channel>

  function clientOf (account: Account): TxOperations {
    const data = new SessionDataImpl(
      account,
      'test',
      false,
      undefined,
      wsIds,
      true, // async triggers run inline, so their results are visible when the call returns
      undefined,
      undefined,
      pipeline.context.modelDb,
      users,
      'transactor'
    )
    const client = wrapPipeline(new MeasureMetricsContext(account.uuid, {}), pipeline, wsIds, false, data)
    return new TxOperations(client, account.primarySocialId)
  }

  // The system account sees preferences of every user.
  function system (): TxOperations {
    return new TxOperations(wrapPipeline(new MeasureMetricsContext('system', {}), pipeline, wsIds), core.account.System)
  }

  beforeAll(async () => {
    const serverUrl = await postgresUrl()
    const dbName = `saved_${randomUUID().replace(/-/g, '')}`
    const admin = getDBClient(serverUrl)
    try {
      const client = await admin.getClient()
      await client`CREATE DATABASE ${client(dbName)}`
    } finally {
      admin.close()
    }
    const url = new URL(serverUrl)
    url.pathname = '/' + dbName
    const dbUrl = url.toString()
    await promisify(execFile)(process.execPath, [require.resolve('@hcengineering/pod-db-migrator')], {
      env: { ...process.env, DB_URL: dbUrl }
    })

    setDBExtraOptions({ prepare: true })
    registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
    registerAdapterFactory('postgresql', createPostgresAdapter, true)
    registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)
    registerStringLoaders()
    // Jest cannot run the dynamic import() of registerServerPlugins(), so only the plugins a chat message removal needs are loaded.
    addLocation(serverActivityId, async () => require('@hcengineering/server-activity-resources'))
    addLocation(serverAttachmentId, async () => require('@hcengineering/server-attachment-resources'))
    addLocation(serverChunterId, async () => require('@hcengineering/server-chunter-resources'))

    pipeline = await getServerPipeline(ctx, buildModel().getTxes(), dbUrl, wsIds, createDummyStorageAdapter())
    // Preferences live in the workspace space; a workspace created by the service has it from its init.
    await system().createDoc(
      core.class.SystemSpace,
      core.space.Space,
      { name: 'Workspace', description: '', private: false, archived: false, members: [] },
      core.space.Workspace
    )
    channel = await system().createDoc<Channel>(chunter.class.Channel, core.space.Space, {
      name: 'general',
      description: '',
      private: false,
      archived: false,
      members: [alice.uuid, bob.uuid, carol.uuid]
    })
  })

  afterAll(async () => {
    await pipeline?.close()
    await shutdownPostgres()
  })

  async function savedOf (attachedTo: Ref<Doc>): Promise<Array<SavedMessage | SavedAttachments>> {
    return [
      ...(await system().findAll(activity.class.SavedMessage, { attachedTo: attachedTo as Ref<ActivityMessage> })),
      ...(await system().findAll(attachment.class.SavedAttachments, { attachedTo: attachedTo as Ref<Attachment> }))
    ]
  }

  async function post (
    c: TxOperations,
    space: Ref<Channel> = channel
  ): Promise<{ message: Ref<ChatMessage>, reply: Ref<ThreadMessage>, file: Ref<Attachment> }> {
    const message = await c.addCollection<Channel, ChatMessage>(
      chunter.class.ChatMessage,
      space,
      space,
      chunter.class.Channel,
      'messages',
      { message: 'message' }
    )
    const reply = await c.addCollection<ChatMessage, ThreadMessage>(
      chunter.class.ThreadMessage,
      space,
      message,
      chunter.class.ChatMessage,
      'replies',
      { message: 'reply', objectId: space, objectClass: chunter.class.Channel }
    )
    const file = await c.addCollection<ChatMessage, Attachment>(
      attachment.class.Attachment,
      space,
      message,
      chunter.class.ChatMessage,
      'attachments',
      { name: 'a.txt', file: generateId() as Ref<Blob>, size: 1, type: 'text/plain', lastModified: Date.now() }
    )
    return { message, reply, file }
  }

  it('removes bookmarks of other users when the author removes a message, a reply or an attachment', async () => {
    const [a, b, c] = [clientOf(alice), clientOf(bob), clientOf(carol)]
    const { message: removed } = await post(c)
    const { message: kept, reply, file } = await post(c)

    for (const user of [a, b]) {
      for (const target of [removed, kept, reply]) {
        await user.createDoc(activity.class.SavedMessage, core.space.Workspace, { attachedTo: target })
      }
      await user.createDoc(attachment.class.SavedAttachments, core.space.Workspace, { attachedTo: file })
    }
    expect(await savedOf(removed)).toHaveLength(2)

    // The remover cannot see the bookmarks: they are other users' preferences.
    expect(await c.findAll(activity.class.SavedMessage, { attachedTo: removed })).toHaveLength(0)

    const message = await c.findOne(chunter.class.ChatMessage, { _id: removed })
    if (message === undefined) throw new Error('message not found')
    await c.remove(message)
    expect(await savedOf(removed)).toHaveLength(0)
    expect(await savedOf(kept)).toHaveLength(2)

    const threadMessage = await c.findOne(chunter.class.ThreadMessage, { _id: reply })
    if (threadMessage === undefined) throw new Error('reply not found')
    await c.removeCollection(
      threadMessage._class,
      threadMessage.space,
      threadMessage._id,
      threadMessage.attachedTo,
      threadMessage.attachedToClass,
      'replies'
    )
    expect(await savedOf(reply)).toHaveLength(0)

    const att = await c.findOne(attachment.class.Attachment, { _id: file })
    if (att === undefined) throw new Error('attachment not found')
    await c.remove(att)
    expect(await savedOf(file)).toHaveLength(0)
    expect(await savedOf(kept)).toHaveLength(2)
  })

  it('removes bookmarks of messages removed together with their channel', async () => {
    const other = await system().createDoc<Channel>(chunter.class.Channel, core.space.Space, {
      name: 'other',
      description: '',
      private: false,
      archived: false,
      members: [alice.uuid, bob.uuid, carol.uuid]
    })
    const { message } = await post(clientOf(carol), other)
    for (const user of [clientOf(alice), clientOf(bob)]) {
      await user.createDoc(activity.class.SavedMessage, core.space.Workspace, { attachedTo: message })
    }
    expect(await savedOf(message)).toHaveLength(2)

    const doc = await system().findOne(chunter.class.Channel, { _id: other })
    if (doc === undefined) throw new Error('channel not found')
    await system().remove(doc)

    expect(await system().findAll(chunter.class.ChatMessage, { _id: message })).toHaveLength(0)
    expect(await savedOf(message)).toHaveLength(0)
  })

  it('migration removes bookmarks left from earlier removals and keeps live ones', async () => {
    const lowLevel = pipeline.context.lowLevelStorage
    if (lowLevel === undefined) throw new Error('no low level storage')
    const a = clientOf(alice)
    const { message, reply, file } = await post(clientOf(carol))
    for (const target of [message, reply]) {
      await a.createDoc(activity.class.SavedMessage, core.space.Workspace, { attachedTo: target })
    }
    await a.createDoc(attachment.class.SavedAttachments, core.space.Workspace, { attachedTo: file })

    const orphan = (_class: Ref<any>, attachedTo: string): Doc =>
      ({
        _id: generateId(),
        _class,
        space: core.space.Workspace,
        attachedTo,
        modifiedBy: alice.primarySocialId,
        createdBy: alice.primarySocialId,
        modifiedOn: Date.now()
      }) as any
    await lowLevel.upload(ctx, DOMAIN_PREFERENCE, [
      orphan(activity.class.SavedMessage, 'gone-message'),
      orphan(activity.class.SavedMessage, 'gone-message'),
      orphan(attachment.class.SavedAttachments, 'gone-attachment')
    ])
    expect(await savedOf('gone-message' as Ref<Doc>)).toHaveLength(2)

    const client: any = {
      hierarchy: pipeline.context.hierarchy,
      find: (domain: any, query: any, options: any) => lowLevel.rawFindAll(domain, query, options),
      traverse: (domain: any, query: any, options: any) => lowLevel.traverse(domain, query, options),
      deleteMany: (domain: any, query: any) => lowLevel.rawDeleteMany(domain, query)
    }
    for (let i = 0; i < 2; i++) {
      await removeOrphanPreferences(client, activity.class.SavedMessage, activity.class.ActivityMessage)
      await removeOrphanPreferences(client, attachment.class.SavedAttachments, attachment.class.Attachment)
    }

    expect(await savedOf('gone-message' as Ref<Doc>)).toHaveLength(0)
    expect(await savedOf('gone-attachment' as Ref<Doc>)).toHaveLength(0)
    for (const target of [message, reply, file]) {
      expect(await savedOf(target)).toHaveLength(1)
    }
  })
})
