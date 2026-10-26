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

import {
  generateId,
  type AttachedDoc,
  type Class,
  type Doc,
  type Ref,
  type Space,
  type TxOperations
} from '@hcengineering/core'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'
import { type Locator, type Page } from '@playwright/test'
import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace, openMemberPage } from '../API/ChatApi'
import { addPoll, getPoll, sendPoll, vote, waitForVotes, type PollDoc } from '../API/PollApi'
import { createIssue, getProjectContext } from '../API/TrackerApi'
import { ChannelPage } from '../model/channel-page'
import { InboxPage } from '../model/inbox.ts/inbox-page'
import { PollPage } from '../model/poll-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { ThreadsListPage } from '../model/threads-list-page'
import { generateUser, loginByToken, PlatformURI } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

interface Chat {
  channel: Channel
  me: ChatMember
  other: ChatMember
}

const channelClass = 'chunter:class:Channel' as Ref<Class<Doc>>
const pollClass = 'activity:class:Poll' as Ref<Class<Doc>>
const spaceSpace = 'core:space:Space' as Ref<Space>

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()

/** Polls outside a plain channel message: threads, forwards, quotes, inbox, edit, delete, task comments. */
test.describe('Poll placement tests', () => {
  let shared: SharedWorkspace
  let uniq: string
  let polls: PollPage
  let channelPage: ChannelPage

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // The REST member takes a seat like an invited one, once per workspace.
    shared = await sharedWorkspace(0)
    if (!others.has(shared.ws.workspace)) {
      shared = await sharedWorkspace(1)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
    polls = new PollPage(page)
    channelPage = new ChannelPage(page)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  async function members (): Promise<{ me: ChatMember, other: ChatMember }> {
    const me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    return { me, other }
  }

  async function openChat (name = 'poll'): Promise<Chat> {
    const { me, other } = await members()
    const channel = await me.createChannel(`${name}-${uniq}`, [other.account])
    await channelPage.clickChannel(channel.name)
    return { channel, me, other }
  }

  async function createPrivateChannel (member: ChatMember, name: string): Promise<Channel> {
    await member.client.createDoc(channelClass, spaceSpace, {
      name,
      description: '',
      private: true,
      archived: false,
      members: [member.account],
      topic: '',
      owners: [member.account]
    } as any)
    return await member.findChannel(name)
  }

  /** A message with text and a poll under it, as two requests. */
  async function sendTextWithPoll (
    member: ChatMember,
    channel: Channel,
    text: string,
    question: string,
    options: string[]
  ): Promise<{ message: Ref<Doc>, poll: Ref<Doc> }> {
    const message = await member.sendMessage(channel, text)
    const poll = generateId<AttachedDoc>()
    const items = options.map((label, i) => ({ id: `o${i}`, label }))
    await addPoll(member, channel, message, poll, question, items, { options })
    return { message, poll }
  }

  async function findPoll (member: ChatMember, poll: Ref<Doc>): Promise<PollDoc | undefined> {
    return (await member.client.findOne(pollClass, { _id: poll } as any)) as PollDoc | undefined
  }

  const message = (page: Page, text: string): Locator =>
    page.locator('.hulyComponent .activityMessage:not([inert] *)').filter({ hasText: text })

  const forwardDialog = (page: Page): Locator =>
    page.locator('.hulyModal-container').filter({ hasText: 'Forward message' })

  async function forwardTo (page: Page, text: string, target: string): Promise<void> {
    await channelPage.clickOpenMoreButton(text)
    await channelPage.messageMenuItem('Forward message').click()
    const dialog = forwardDialog(page)
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('Search').fill(target)
    await dialog.getByText(target, { exact: true }).click()
    await dialog.getByRole('button', { name: 'Forward', exact: true }).click()
    await expect(dialog).toBeHidden()
  }

  test('A poll created in a thread reply is votable and stays in the thread opened from Threads', async ({ page }) => {
    const chat = await openChat('thread')
    const parent = `Thread parent ${uniq}`
    await chat.me.sendMessage(chat.channel, parent)
    await expect(channelPage.textMessage(parent)).toBeVisible()
    await channelPage.replyMessage(parent)

    const sidebar = page.locator('#sidebar')
    const question = `Thread lunch? ${uniq}`
    await polls.pollButton(sidebar).click()
    await expect(polls.questionInput()).toBeFocused()
    await polls.fill({ question, options: ['Pizza', 'Sushi'] })
    await polls.createButton().click()
    await expect(polls.form()).toBeHidden()
    await expect(polls.draft(question, sidebar)).toBeVisible()
    await polls.sendButton(sidebar).click()

    const inThread = polls.poll(question, sidebar)
    await expect(inThread).toBeVisible()
    await inThread.getByRole('radio', { name: 'Pizza' }).click()
    await expect(inThread.locator('.poll-option__result').first()).toBeVisible()

    const instance = (await chat.me.client.findOne(pollClass, { question } as any)) as AttachedDoc | undefined
    if (instance == null) throw new Error(`Poll "${question}" not stored`)
    // The poll belongs to the reply, not to the thread parent.
    expect(instance.attachedToClass).toBe('chunter:class:ThreadMessage')
    await waitForVotes(chat.me, instance._id, 1)

    // A fresh window: the Threads list answers from a cached query otherwise.
    await page.reload()
    const threads = new ThreadsListPage(page)
    await threads.open()
    await threads.repliesCount(parent).click()
    const reopened = polls.poll(question, page.locator('#sidebar'))
    await expect(reopened).toBeVisible()
    await expect(reopened.locator('.poll-option__result').first()).toBeVisible()
    await expect(
      reopened.locator('.poll-option').filter({ hasText: 'Pizza' }).locator('.poll-option__percentage')
    ).toHaveText('100%')
  })

  test('A forwarded poll stays live: a vote in the forward lands in the original', async ({ page }) => {
    const chat = await openChat('fwd-src')
    const target = await chat.me.createChannel(`fwd-dst-${uniq}`, [chat.other.account])
    const question = `Forwarded lunch? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'] })
    await expect(polls.poll(question)).toBeVisible()

    await channelPage.clickOpenMoreButton(question)
    await channelPage.messageMenuItem('Forward message').click()
    // The quote of the message to forward names the poll.
    await expect(forwardDialog(page).locator('.reply')).toContainText(question)
    await page.keyboard.press('Escape')
    await expect(forwardDialog(page)).toBeHidden()

    await forwardTo(page, question, target.name)
    await channelPage.clickChannel(target.name)
    const forwarded = page.locator('.forwarded-message:not([inert] *)').filter({ hasText: question })
    await expect(forwarded).toBeVisible()
    await forwarded.getByRole('radio', { name: 'Sushi' }).click()
    await expect(forwarded.locator('.poll-option__result').first()).toBeVisible()

    const counted = await waitForVotes(chat.me, sent.poll, 1)
    expect(counted.votes?.[sent.options[1]]).toBe(1)
    await channelPage.clickChannel(chat.channel.name)
    // The channel left behind stays in the DOM, with the forwarded copy in it.
    const original = page
      .locator('.hulyComponent .activityMessage:not([inert] *)')
      .filter({ hasNot: page.locator('.forwarded-message') })
      .getByRole('region', { name: question })
    await expect(original.locator('.poll-option__result').first()).toBeVisible()
    await expect(
      original.locator('.poll-option').filter({ hasText: 'Sushi' }).locator('.poll-option__percentage')
    ).toHaveText('100%')
  })

  test('A poll forwarded out of a private channel is a read-only copy for a member outside it', async ({
    page,
    browser
  }) => {
    const { me, other } = await members()
    const source = await createPrivateChannel(me, `fwd-private-${uniq}`)
    const target = await me.createChannel(`fwd-open-${uniq}`, [other.account])
    const question = `Private lunch? ${uniq}`
    const sent = await sendPoll(me, source, question, { options: ['Pizza', 'Sushi'] })
    await channelPage.clickChannel(source.name)
    await expect(polls.poll(question)).toBeVisible()
    await forwardTo(page, question, target.name)

    expect(await findPoll(other, sent.poll)).toBeUndefined()
    const { page: otherPage, context } = await openMemberPage(browser, other, 'chunter')
    try {
      await new ChannelPage(otherPage).clickChannel(target.name)
      const forwarded = otherPage.locator('.forwarded-message:not([inert] *)').filter({ hasText: question })
      const copy = forwarded.getByRole('region', { name: question })
      await expect(copy).toBeVisible()
      await expect(copy.locator('.poll-option__result').first()).toBeVisible()
      await expect(copy.getByRole('radio')).toHaveCount(0)
      await expect(copy.locator('.poll-option__answer')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('A reply quote to a poll message names the poll question', async ({ page }) => {
    const chat = await openChat('quote')
    const question = `Quoted lunch? ${uniq}`
    await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'] })
    await expect(polls.poll(question)).toBeVisible()

    await channelPage.textMessage(question).last().hover()
    await channelPage.messageActionButton(question, 'data-id$="ReplyToMessage"').click()
    const quote = page.locator('.reply:not([inert] *)').filter({ hasText: 'Reply to' })
    await expect(quote).toContainText(question)
    await expect(quote.locator('.applet-preview')).toBeVisible()

    const answer = `Answer to the poll ${uniq}`
    await channelPage.sendMessage(answer)
    const sentReply = message(page, answer)
    await expect(sentReply.locator('.forwarded-message')).toContainText(question)
  })

  async function openInboxCard (page: Page, channel: Channel): Promise<Locator> {
    await new LeftSideMenuPage(page).clickNotification()
    const card = new InboxPage(page).cardByTitle(channel.name)
    // A notification is a round trip through the notifications service.
    await expect(card).toBeVisible({ timeout: 30000 })
    return card
  }

  test('A poll message from another member shows the poll question in the inbox', async ({ page }) => {
    const { me, other } = await members()
    const channel = await me.createChannel(`inbox-msg-${uniq}`, [other.account])
    const question = `Inbox lunch? ${uniq}`
    await sendPoll(other, channel, question, { options: ['Pizza', 'Sushi'] })

    const card = await openInboxCard(page, channel)
    await expect(card).toContainText(question)
  })

  test('A reaction to a poll message shows the poll question in the inbox', async ({ page }) => {
    const { me, other } = await members()
    const channel = await me.createChannel(`inbox-react-${uniq}`, [other.account])
    const question = `Reacted lunch? ${uniq}`
    const sent = await sendPoll(me, channel, question, { options: ['Pizza', 'Sushi'] })
    await other.react(channel, sent.message, '👍')

    const card = await openInboxCard(page, channel)
    await expect(card).toContainText(question)
  })

  test('A mention in a poll message shows the poll question in the inbox', async ({ page }) => {
    const { me, other } = await members()
    const channel = await me.createChannel(`mention-${uniq}`, [other.account])
    const question = `Mention lunch? ${uniq}`
    const text = `look at the poll ${uniq}`
    const mention = await other.sendMention(channel, await other.findPerson(me.account), text)
    const options = [
      { id: 'o0', label: 'Pizza' },
      { id: 'o1', label: 'Sushi' }
    ]
    await addPoll(other, channel, mention, generateId<AttachedDoc>(), question, options, { options: [] })
    // The notification carries the poll, so the card shows it without a lookup.
    await expect
      .poll(async () => {
        const context: any = await me.client.findOne(
          'notification:class:DocNotifyContext' as Ref<Class<Doc>>,
          { user: me.account, objectId: channel._id } as any
        )
        return context?.latestNotifications?.[0]?.applets?.[0]?.question
      })
      .toBe(question)

    const card = await openInboxCard(page, channel)
    await expect(card).toContainText(text)
    await expect(card).toContainText(question)
  })

  test('Editing a poll message changes the text and keeps the poll, with no poll button in the editor', async ({
    page
  }) => {
    const chat = await openChat('edit')
    const text = `Poll text ${uniq}`
    const question = `Edited lunch? ${uniq}`
    const sent = await sendTextWithPoll(chat.me, chat.channel, text, question, ['Pizza', 'Sushi'])
    await expect(polls.poll(question)).toBeVisible()

    await channelPage.clickOpenMoreButton(text)
    await channelPage.editMessageButton().click()
    const editing = page
      .locator('.hulyComponent .activityMessage:not([inert] *)')
      .filter({ has: page.locator('.text-editor-view') })
    await expect(editing.getByRole('button', { name: 'Update' })).toBeVisible()
    await expect(polls.pollButton(editing)).toHaveCount(0)
    // The poll stays visible under the editor, not votable there.
    await expect(polls.poll(question, editing)).toBeVisible()
    await expect(polls.poll(question, editing).getByRole('radio')).toHaveCount(0)

    const edited = `Changed text ${uniq}`
    await editing.locator('.text-editor-view').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type(edited)
    await editing.getByRole('button', { name: 'Update' }).click()
    await expect(channelPage.textMessage(edited)).toBeVisible()
    await expect(polls.poll(question, message(page, edited))).toBeVisible()
    expect((await getPoll(chat.me, sent.poll)).question).toBe(question)

    // An empty text is allowed: the poll alone carries the message.
    await channelPage.clickOpenMoreButton(edited)
    await channelPage.editMessageButton().click()
    await expect(editing.getByRole('button', { name: 'Update' })).toBeVisible()
    await editing.locator('.text-editor-view').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await editing.getByRole('button', { name: 'Update' }).click()
    await expect(editing).toHaveCount(0)
    await expect(channelPage.textMessage(edited)).toHaveCount(0)
    await expect(polls.poll(question)).toBeVisible()
    expect((await getPoll(chat.me, sent.poll)).question).toBe(question)
  })

  test('Deleting a poll message removes the poll for another member without a reload', async ({ browser }) => {
    const chat = await openChat('gone')
    const question = `Deleted lunch? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'] })
    await expect(polls.poll(question)).toBeVisible()

    const { page: otherPage, context } = await openMemberPage(browser, chat.other, 'chunter')
    try {
      const otherPolls = new PollPage(otherPage)
      await new ChannelPage(otherPage).clickChannel(chat.channel.name)
      await expect(otherPolls.poll(question)).toBeVisible()

      await channelPage.clickOpenMoreButton(question)
      await channelPage.clickDeleteMessageButton()
      await channelPage.clickDeleteMessageConfirmationButton()
      await expect(polls.poll(question)).toHaveCount(0)
      await expect(otherPolls.poll(question)).toHaveCount(0)
    } finally {
      await context.close()
    }
    await expect.poll(async () => await findPoll(chat.other, sent.poll)).toBeUndefined()
    expect(await findPoll(chat.me, sent.poll)).toBeUndefined()
  })

  test('A poll in a task comment is votable and keeps working after the task moves to another project', async ({
    page
  }) => {
    const { me, other } = await members()
    const client = me.client as unknown as TxOperations
    const ctx = await getProjectContext(client)
    const title = `Poll task ${uniq}`
    const issueId = await createIssue(client, ctx, { title, status: 'Backlog' })
    const projectName = `Poll target ${uniq}`
    const projectId = await cloneProject(client, ctx.project, projectName)

    const issue = (await client.findOne(tracker.class.Issue, { _id: issueId })) as Issue
    await page.goto(`${PlatformURI}/workbench/${shared.ws.workspaceUrl}/tracker/${issue.identifier}`)
    const details = new IssuesDetailsPage(page)
    await expect(page.getByText(issue.identifier, { exact: true }).first()).toBeVisible()

    const question = `Task lunch? ${uniq}`
    await polls.sendPoll({ question, options: ['Pizza', 'Sushi'] })
    const instance = (await client.findOne(pollClass, { question } as any)) as
      | (PollDoc & { options: Array<{ id: string, label: string }> })
      | undefined
    if (instance == null) throw new Error(`Poll "${question}" not stored`)
    // Before the move the poll counts a vote of another member.
    await vote(other, instance._id, [instance.options[1].id])
    await waitForVotes(me, instance._id, 1)

    await details.moreActionOnIssue('Move to project')
    await details.fillMoveIssuesModal(projectName, true)
    await expect.poll(async () => (await client.findOne(tracker.class.Issue, { _id: issueId }))?.space).toBe(projectId)
    await expect.poll(async () => (await getPoll(me, instance._id)).space).toBe(projectId)

    const moved = (await client.findOne(tracker.class.Issue, { _id: issueId })) as Issue
    expect(moved.identifier).not.toBe(issue.identifier)
    await page.goto(`${PlatformURI}/workbench/${shared.ws.workspaceUrl}/tracker/${moved.identifier}`)
    await expect(page.getByText(moved.identifier, { exact: true }).first()).toBeVisible()
    await polls.checkVoted(question, false)
    await polls.voteFor(question, 'Pizza')
    await polls.checkVoted(question, true)
    await polls.checkPercent(question, 'Pizza', 50)
    const counted = await waitForVotes(me, instance._id, 2)
    expect(counted.space).toBe(projectId)
  })

  test('Several polls of one message go in the order of creation, also after a reload', async ({ page }) => {
    const chat = await openChat('order')
    const parent = await chat.me.sendMessage(chat.channel, `Two polls ${uniq}`)
    const options = [
      { id: 'o0', label: 'Yes' },
      { id: 'o1', label: 'No' }
    ]
    const first = `First poll ${uniq}`
    const second = `Second poll ${uniq}`
    // The later poll gets the smaller id: the order must come from the time, not from the id.
    await addPoll(chat.me, chat.channel, parent, `z${generateId()}` as Ref<AttachedDoc>, first, options, {
      options: []
    })
    await addPoll(chat.me, chat.channel, parent, `a${generateId()}` as Ref<AttachedDoc>, second, options, {
      options: []
    })

    const inMessage = channelPage.textMessage(`Two polls ${uniq}`).getByRole('region')
    await expect(inMessage).toHaveCount(2)
    await expect(inMessage.nth(0)).toHaveAccessibleName(first)
    await expect(inMessage.nth(1)).toHaveAccessibleName(second)

    await page.reload()
    await expect(inMessage).toHaveCount(2)
    await expect(inMessage.nth(0)).toHaveAccessibleName(first)
    await expect(inMessage.nth(1)).toHaveAccessibleName(second)
  })

  test('A quoted or forwarded message without a poll has no empty poll block', async ({ page }) => {
    const chat = await openChat('no-poll')
    const target = await chat.me.createChannel(`no-poll-dst-${uniq}`, [chat.other.account])
    const text = `Plain text ${uniq}`
    await chat.me.sendMessage(chat.channel, text)
    await expect(channelPage.textMessage(text)).toBeVisible()

    // Forwarded first: the quoting answer repeats the text, and the message actions take the last match.
    await forwardTo(page, text, target.name)

    await channelPage.textMessage(text).last().hover()
    await channelPage.messageActionButton(text, 'data-id$="ReplyToMessage"').click()
    const answer = `Answer ${uniq}`
    await channelPage.sendMessage(answer)
    await checkNoAppletBlock(message(page, answer).locator('.forwarded-message__content'), text)

    await channelPage.clickChannel(target.name)
    const forwarded = page.locator('.forwarded-message__content:not([inert] *)').filter({ hasText: text })
    await checkNoAppletBlock(forwarded, text)
  })

  async function checkNoAppletBlock (content: Locator, text: string): Promise<void> {
    await expect(content).toBeVisible()
    await expect(content).toContainText(text)
    await expect(content.getByRole('region')).toHaveCount(0)
    // An empty wrapper would still add its gap under the text.
    await expect(content.locator('.forwarded-message__applets')).toHaveCount(0)
  }
})

/** A second project of the same type, for a move: the fields of the existing one with a new name. */
async function cloneProject (client: TxOperations, source: Project, name: string): Promise<Ref<Project>> {
  const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = source as any
  // An identifier is letters only: each hex digit of the id maps onto one of them.
  const letters = [...generateId().slice(-6)].map((it) => String.fromCharCode(65 + parseInt(it, 16)))
  const identifier = `P${letters.join('')}`
  return await client.createDoc(tracker.class.Project, space, {
    ...data,
    name,
    identifier,
    sequence: 0,
    private: false,
    archived: false
  })
}
