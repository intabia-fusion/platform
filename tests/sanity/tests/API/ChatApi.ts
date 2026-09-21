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

import type { WorkspaceLoginInfo } from '@hcengineering/account'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { createRestClient, type RestClient } from '@hcengineering/api-client'
import { ensureEmployee } from '@hcengineering/contact'
import {
  AccountRole,
  generateId,
  type AccountUuid,
  type AttachedDoc,
  type Class,
  type Doc,
  type MeasureContext,
  type PersonId,
  type Ref,
  type Space
} from '@hcengineering/core'
import { type Browser, type BrowserContext, type Page } from '@playwright/test'
import { type SignUpData } from '../model/common-types'
import { LocalUrl, loginByToken } from '../utils'

// Ids as strings: the suite does not depend on the chunter/activity/contact packages.
const chatMessageClass = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const threadMessageClass = 'chunter:class:ThreadMessage' as Ref<Class<Doc>>
const channelClass = 'chunter:class:Channel' as Ref<Class<Doc>>
const reactionClass = 'activity:class:Reaction' as Ref<Class<Doc>>
const personClass = 'contact:class:Person' as Ref<Class<Doc>>
const docNotifyContextClass = 'notification:class:DocNotifyContext' as Ref<Class<Doc>>
const readStateClass = 'notification:class:ReadState' as Ref<Class<Doc>>
const readActionClass = 'notification:class:ReadNotificationAction' as Ref<Class<Doc>>
const docNotificationSettingClass = 'notification:class:DocNotificationSetting' as Ref<Class<Doc>>
const workspaceSpace = 'core:space:Workspace' as Ref<Space>
const spaceSpace = 'core:space:Space' as Ref<Space>

type Markup = Record<string, any>

function paragraph (content: Markup[]): string {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] })
}

interface ChannelDoc extends Doc {
  name: string
  members: AccountUuid[]
}

/**
 * A workspace member driven over REST instead of a second browser: a chat message is one request,
 * so a test can post dozens of them, and nothing of the other user's UI has to load.
 */
export class ChatMember {
  constructor (
    readonly client: RestClient,
    readonly account: AccountUuid,
    readonly socialId: PersonId,
    readonly name: string,
    // What a browser needs to open the workspace as this member; absent for the owner.
    readonly login?: { ws: WorkspaceLoginInfo, user: SignUpData }
  ) {}

  async findChannel (name: string): Promise<ChannelDoc> {
    const channel = await this.client.findOne(channelClass, { name } as any)
    if (channel === undefined) throw new Error(`Channel ${name} not found`)
    return channel as ChannelDoc
  }

  /** The document the "New channel" dialog creates. */
  async createChannel (name: string, members: AccountUuid[]): Promise<ChannelDoc> {
    await this.client.createDoc(channelClass, spaceSpace, {
      name,
      description: '',
      private: false,
      archived: false,
      members: [this.account, ...members],
      topic: '',
      owners: [this.account]
    } as any)
    return await this.findChannel(name)
  }

  /** Both members and collaborators come from `members`, the same update the details panel sends. */
  async addMember (channel: ChannelDoc, account: AccountUuid): Promise<void> {
    await this.client.updateDoc(channel._class, channel.space, channel._id, { $push: { members: account } } as any)
  }

  async sendMessage (channel: ChannelDoc, text: string): Promise<Ref<Doc>> {
    return await this.send(channel, [{ type: 'text', text }])
  }

  async sendMention (channel: ChannelDoc, person: { _id: Ref<Doc>, name: string }, text: string): Promise<Ref<Doc>> {
    return await this.send(channel, [
      { type: 'reference', attrs: { id: person._id, label: person.name, objectclass: personClass } },
      { type: 'text', text: ' ' + text }
    ])
  }

  private async send (channel: ChannelDoc, content: Markup[]): Promise<Ref<Doc>> {
    const id = generateId<AttachedDoc>()
    await this.client.addCollection(
      chatMessageClass,
      channel._id as Ref<Space>,
      channel._id,
      channel._class,
      'messages',
      { message: paragraph(content) } as any,
      id
    )
    return id
  }

  async reply (channel: ChannelDoc, message: Ref<Doc>, text: string): Promise<Ref<Doc>> {
    const id = generateId<AttachedDoc>()
    await this.client.addCollection(
      threadMessageClass,
      channel._id as Ref<Space>,
      message,
      chatMessageClass,
      'replies',
      { message: paragraph([{ type: 'text', text }]), objectId: channel._id, objectClass: channel._class } as any,
      id
    )
    return id
  }

  async react (channel: ChannelDoc, message: Ref<Doc>, emoji: string): Promise<Ref<Doc>> {
    const id = generateId<AttachedDoc>()
    await this.client.addCollection(
      reactionClass,
      channel._id as Ref<Space>,
      message,
      chatMessageClass,
      'reactions',
      { emoji, createBy: this.socialId } as any,
      id
    )
    return id
  }

  async removeReaction (channel: ChannelDoc, message: Ref<Doc>, reaction: Ref<Doc>): Promise<void> {
    await this.client.removeCollection(
      reactionClass,
      channel._id as Ref<Space>,
      reaction as Ref<AttachedDoc>,
      message,
      chatMessageClass,
      'reactions'
    )
  }

  async editMessage (channel: ChannelDoc, message: Ref<Doc>, text: string): Promise<void> {
    await this.client.updateCollection(
      chatMessageClass,
      channel._id as Ref<Space>,
      message as Ref<AttachedDoc>,
      channel._id,
      channel._class,
      'messages',
      { message: paragraph([{ type: 'text', text }]), editedOn: Date.now() } as any
    )
  }

  async removeMessage (channel: ChannelDoc, message: Ref<Doc>): Promise<void> {
    await this.client.removeCollection(
      chatMessageClass,
      channel._id as Ref<Space>,
      message as Ref<AttachedDoc>,
      channel._id,
      channel._class,
      'messages'
    )
  }

  async findMessage (channel: ChannelDoc, text: string): Promise<Ref<Doc>> {
    const messages = await this.client.findAll(chatMessageClass, { attachedTo: channel._id } as any)
    const found = messages.find((it) => ((it as any).message as string).includes(text))
    if (found === undefined) throw new Error(`Message "${text}" not found`)
    return found._id
  }

  async findPerson (account: AccountUuid): Promise<{ _id: Ref<Doc>, name: string }> {
    const person = await this.client.findOne(personClass, { personUuid: account } as any)
    if (person === undefined) throw new Error(`Person of ${account} not found`)
    return { _id: person._id, name: (person as any).name }
  }

  /**
   * What "Mark all as read" does, for every document with anything unread, and tells how many
   * there were: a fresh workspace greets its owner with system messages and a bot, every new
   * member adds more, and the workspace is shared with the tests that ran before.
   * `except`: the channels under test (with their threads), which only the UI may read.
   */
  async readEverything (except: Array<Ref<Doc>> = []): Promise<number> {
    const contexts = await this.client.findAll(docNotifyContextClass, { user: this.account } as any)
    const unread = contexts.filter(
      (it: any) =>
        (it.unreadCount > 0 || it.unreadMessagesCount > 0) &&
        // A thread lives in the space of its channel.
        !except.includes(it.objectId) &&
        !except.includes(it.objectSpace)
    )
    for (const context of unread as any[]) {
      const reactionIds = (context.unreadReactions ?? []).map((it: any) => it.id)
      const commonIds = (context.unreadCommons ?? []).map((it: any) => it.id)
      const mentionIds = (context.unreadMentions ?? []).map((it: any) => it.id)
      if (reactionIds.length > 0 || commonIds.length > 0 || mentionIds.length > 0) {
        await this.client.createDoc(readActionClass, context.space, {
          attachedTo: context.objectId,
          attachedToClass: context.objectClass,
          account: this.account,
          reactionIds,
          commonIds,
          mentionIds
        } as any)
      }
      const state = await this.client.findOne(readStateClass, { attachedTo: context.objectId } as any)
      if (state === undefined) continue
      await this.client.updateDoc(state._class, state.space, state._id, {
        [this.account]: { messageId: generateId(), timestamp: Date.now() }
      } as any)
    }
    return unread.length
  }

  /**
   * The member has read the channel up to its last message. By the read position and not by the
   * unread counter: the counter is 0 both after the read and before the service has counted.
   */
  async hasReadChannel (channel: ChannelDoc): Promise<boolean> {
    const last = await this.client.findOne(
      'activity:class:ActivityMessage' as Ref<Class<Doc>>,
      { attachedTo: channel._id } as any,
      { sort: { createdOn: -1 } } as any
    )
    if (last === undefined) return true
    const state = await this.client.findOne(readStateClass, { attachedTo: channel._id } as any)
    const position = (state as any)?.[this.account]
    return (position?.timestamp ?? 0) >= (last.createdOn ?? last.modifiedOn)
  }

  /**
   * The person can be found by name, which is how the mention popup looks people up: the
   * full-text index learns about a new employee a while after the workspace does.
   */
  async waitUntilSearchable (name: string): Promise<void> {
    await poll(async () => {
      const found = await this.client.searchFulltext({ query: name, classes: [personClass] }, { limit: 1 })
      return found.docs.length > 0
    })
  }

  /** The per-document notification mode of this member: what "Edit notifications" sets in the UI. */
  async setNotificationMode (channel: ChannelDoc, mode: 'all' | 'mentions' | 'mute'): Promise<void> {
    const current = await this.client.findOne(docNotificationSettingClass, {
      attachedTo: channel._id,
      account: this.account
    } as any)
    if (current !== undefined) {
      await this.client.updateDoc(current._class, current.space, current._id, { mode } as any)
    } else {
      await this.client.createDoc(docNotificationSettingClass, workspaceSpace, {
        attachedTo: channel._id,
        attachedToClass: channel._class,
        account: this.account,
        mode
      } as any)
    }
  }
}

async function connect (ws: WorkspaceLoginInfo, name: string, user?: SignUpData): Promise<ChatMember> {
  if (ws.token === undefined) throw new Error('No workspace token')
  const client = createRestClient(ws.endpoint, ws.workspace, ws.token)
  const account = await client.getAccount()
  return new ChatMember(
    client,
    account.uuid,
    account.primarySocialId,
    name,
    user !== undefined ? { ws, user } : undefined
  )
}

/** The owner of a workspace created through the account API (`sharedWorkspace`). */
export async function connectOwner (ws: WorkspaceLoginInfo, name: string): Promise<ChatMember> {
  return await connect(ws, name)
}

/** Signs a new user up straight into the workspace, without the invite link and the join page. */
export async function joinWorkspace (owner: WorkspaceLoginInfo, user: SignUpData): Promise<ChatMember> {
  const inviteId = await getAccountClient(LocalUrl, owner.token).createInvite(
    Date.now() + 60 * 60 * 1000,
    '',
    1,
    AccountRole.User
  )
  const accounts = getAccountClient(LocalUrl)
  // Some specs create the account up front, for the join page to log in with.
  const joined = await accounts
    .signUpJoin(user.email, user.password, user.firstName, user.lastName, inviteId, owner.workspaceUrl)
    .catch(async () => await accounts.join(user.email, user.password, inviteId, owner.workspaceUrl))
  const member = await connect(joined, `${user.lastName} ${user.firstName}`, user)
  await createEmployee(member, joined)
  // The employee joins the contacts space a moment after it is created, and a client that loads
  // before that keeps an empty list of people: no direct chat, nobody to mention.
  await poll(async () => (await member.client.findOne(personClass, { personUuid: owner.account } as any)) !== undefined)
  return member
}

async function poll (condition: () => Promise<boolean>, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the workspace to catch up')
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}

/**
 * A browser of a member that joined over REST. The employee is already there, so the first login
 * writes nothing: a browser whose first write is refused (a member just joined has no seat for a
 * moment) stops on a fatal error page.
 */
export async function openMemberPage (
  browser: Browser,
  member: ChatMember,
  app?: string
): Promise<{ page: Page, context: BrowserContext }> {
  if (member.login === undefined) throw new Error('Not a member created by joinWorkspace')
  const { ws, user } = member.login
  const accountToken = (await getAccountClient(LocalUrl).login(user.email, user.password)).token
  if (accountToken === undefined) throw new Error(`Cannot log in as ${user.email}`)
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginByToken(page, accountToken, ws, app)
  return { page, context }
}

// ensureEmployee only times its steps with the context.
const noMetrics = {
  with: async (_name: string, _params: unknown, op: (ctx: MeasureContext) => unknown) => await op(noMetrics)
} as unknown as MeasureContext

/**
 * What the web client does on the first login: the Person, the Employee and the social identities
 * of the account in the workspace. Without it the messages of the member are signed "System".
 */
async function createEmployee (member: ChatMember, ws: WorkspaceLoginInfo): Promise<void> {
  const accountClient = getAccountClient(LocalUrl, ws.token)
  const account = await member.client.getAccount()
  const socialIds = await accountClient.getSocialIds()
  // The transactor learns about a new member a moment after the account service does, and until
  // then the first write of the member is Forbidden.
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureEmployee(noMetrics, account, member.client, socialIds, async () => await accountClient.getPerson())
      return
    } catch (err) {
      if (attempt === 5) throw err
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

/**
 * A drop-in for `getInviteLink` + `getSecondPageByInvite`: the second user joins over the API and
 * its browser opens by token, so neither the invite link nor the join page is walked, and the
 * employee exists before the first login.
 */
export async function getSecondPageByApi (
  browser: Browser,
  owner: WorkspaceLoginInfo,
  user: SignUpData,
  app?: string
): Promise<{ page: Page, context: BrowserContext, member: ChatMember } & Disposable> {
  const member = await joinWorkspace(owner, user)
  const { page, context } = await openMemberPage(browser, member, app)
  return {
    page,
    context,
    member,
    [Symbol.dispose]: () => {
      void page
        .close()
        .finally(() => {
          void context.close().catch(() => {})
        })
        .catch(() => {})
    }
  }
}
