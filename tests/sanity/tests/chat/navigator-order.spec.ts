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

import { createRestTxOperations } from '@hcengineering/api-client'
import { type Doc } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'

import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import { createIssue, getProjectContext } from '../API/TrackerApi'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { generateTestData, generateUser, loginByToken } from '../utils'

const channelsSection = 'chunter:class:Channel'
const directSection = 'chunter:class:DirectMessage'
const starredSection = 'starred'
const issuesSection = tracker.class.Issue as string

test.describe.configure({ mode: 'parallel' })

// Two REST members per workspace: a direct chat needs a different person for each of its chats.
const others = new Map<string, ChatMember>()
const thirds = new Map<string, ChatMember>()

/**
 * The navigator orders the chats of a section by the last message: a message from anybody, own
 * ones included, lifts its chat; a chat without messages stays below the ones with them. The order
 * holds live, without a reload: a chat that enters a section, by a join or an unstar, lands by its
 * last message and not at the end.
 */
test.describe('Chat navigator order', () => {
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let shared: SharedWorkspace
  let uniq: string

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    shared = await sharedWorkspace(0)
    const missing = (others.has(shared.ws.workspace) ? 0 : 1) + (thirds.has(shared.ws.workspace) ? 0 : 1)
    if (missing > 0) {
      shared = await sharedWorkspace(missing)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  async function members (): Promise<{ me: ChatMember, other: ChatMember, third: ChatMember }> {
    const me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    const third = thirds.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    thirds.set(shared.ws.workspace, third)
    return { me, other, third }
  }

  type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

  /** A public channel with both users in it, by its name in the navigator. */
  async function createChannel (me: ChatMember, other: ChatMember, name: string): Promise<Channel> {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(name, false)
    await channelPage.checkIfChannelDefaultExist(true, name)
    const channel = await me.findChannel(name)
    await me.addMember(channel, other.account)
    return channel
  }

  // The chats of this test in a section, top to bottom, by the given names; the rest of the shared
  // workspace aside. A title carries its own padding, so it is reduced to the name it matches.
  async function orderOf (names: string[], section = channelsSection): Promise<string[]> {
    const titles = await chunterPage.sectionTitles(section)
    return titles.map((it) => names.find((name) => it.includes(name))).filter((it) => it !== undefined)
  }

  function name (suffix: string): string {
    return `${generateTestData().channelName}-${suffix}${uniq}`
  }

  test('a message lifts its channel, from anybody', async () => {
    const { me, other } = await members()

    const first = name('a')
    const second = name('b')
    const one = await createChannel(me, other, first)
    const two = await createChannel(me, other, second)

    await other.sendMessage(one, 'first channel talks')
    await expect.poll(async () => await orderOf([first, second])).toEqual([first, second])

    await other.sendMessage(two, 'second channel talks later')
    await expect.poll(async () => await orderOf([first, second])).toEqual([second, first])

    // An own message counts the same as anybody's.
    await me.sendMessage(one, 'and the first answers')
    await expect.poll(async () => await orderOf([first, second])).toEqual([first, second])
  })

  test('a channel without messages stays below the ones with them', async () => {
    const { me, other } = await members()

    const silent = name('silent')
    const talked = name('talked')
    await createChannel(me, other, silent)
    const channel = await createChannel(me, other, talked)

    await other.sendMessage(channel, 'hello')
    await expect.poll(async () => await orderOf([silent, talked])).toEqual([talked, silent])
  })

  test('only a message moves a channel: a thread reply and a reaction do not', async () => {
    const { me, other } = await members()

    const quiet = name('quiet')
    const loud = name('loud')
    const one = await createChannel(me, other, quiet)
    const two = await createChannel(me, other, loud)

    const root = await other.sendMessage(one, 'a root message')
    await other.sendMessage(two, 'the latest message')
    await expect.poll(async () => await orderOf([quiet, loud])).toEqual([loud, quiet])

    // The thread lives under its root, the reaction changes no message: the channel stays put.
    await other.reply(one, root, 'a reply in the thread')
    await me.react(one, root, '👍')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(await orderOf([quiet, loud])).toEqual([loud, quiet])

    await me.sendMessage(one, 'a message moves it')
    await expect.poll(async () => await orderOf([quiet, loud])).toEqual([quiet, loud])
  })

  test('an unstarred channel lands by its last message, not at the end', async () => {
    const { me, other } = await members()

    const oldest = name('old')
    const middle = name('mid')
    const newest = name('new')
    const one = await createChannel(me, other, oldest)
    const two = await createChannel(me, other, middle)
    const three = await createChannel(me, other, newest)
    await other.sendMessage(one, 'first')
    await other.sendMessage(two, 'second')
    await other.sendMessage(three, 'third')
    await expect.poll(async () => await orderOf([oldest, middle, newest])).toEqual([newest, middle, oldest])

    await channelPage.makeActionWithChannelInMenu(middle, 'Star')
    await channelPage.checkChannelStarred(true, middle)
    await expect.poll(async () => await orderOf([oldest, middle, newest])).toEqual([newest, oldest])

    // Talked to while starred: back in Channels it goes to the top, the message is the latest.
    await other.sendMessage(two, 'talked to while starred')
    await channelPage.makeActionWithChannelInMenu(middle, 'Unstar')
    await channelPage.checkChannelStarred(false, middle)
    await expect.poll(async () => await orderOf([oldest, middle, newest])).toEqual([middle, newest, oldest])

    // Starred and unstarred untouched: back between the ones it was between.
    await channelPage.makeActionWithChannelInMenu(newest, 'Star')
    await channelPage.checkChannelStarred(true, newest)
    await expect.poll(async () => await orderOf([oldest, middle, newest])).toEqual([middle, oldest])
    await channelPage.makeActionWithChannelInMenu(newest, 'Unstar')
    await channelPage.checkChannelStarred(false, newest)
    await expect.poll(async () => await orderOf([oldest, middle, newest])).toEqual([middle, newest, oldest])
  })

  test('favorites are ordered by the last message, channels and directs together', async () => {
    const { me, other } = await members()
    const otherName = other.login?.user.lastName ?? other.name

    const first = name('star-a')
    const second = name('star-b')
    const one = await createChannel(me, other, first)
    const two = await createChannel(me, other, second)
    const direct = await me.createDirect([other.account])
    await other.sendMessage(one, 'first talks')
    await other.sendMessage(two, 'second talks')
    await other.sendMessage(direct, 'the direct talks last')
    await expect.poll(async () => await orderOf([otherName], directSection)).toEqual([otherName])

    for (const item of [first, second, otherName]) {
      await channelPage.makeActionWithChannelInMenu(item, 'Star')
      await channelPage.checkChannelStarred(true, item)
    }
    const starred = async (): Promise<string[]> => await orderOf([first, second, otherName], starredSection)
    await expect.poll(starred).toEqual([otherName, second, first])

    // A channel over the direct, then the direct over the channels: one order for both kinds.
    await other.sendMessage(one, 'first talks again')
    await expect.poll(starred).toEqual([first, otherName, second])
    await me.sendMessage(direct, 'answering in the direct')
    await expect.poll(starred).toEqual([otherName, first, second])

    // The direct is shared with the other tests of the workspace: back to its section.
    await channelPage.makeActionWithChannelInMenu(otherName, 'Unstar')
    await channelPage.checkChannelStarred(false, otherName)
  })

  test('a direct message lifts its chat in the direct section', async () => {
    const { me, other, third } = await members()
    const otherName = other.login?.user.lastName ?? other.name
    const thirdName = third.login?.user.lastName ?? third.name

    const withOther = await me.createDirect([other.account])
    const withThird = await me.createDirect([third.account])

    const direct = async (): Promise<string[]> => await orderOf([otherName, thirdName], directSection)
    await other.sendMessage(withOther, 'hi from the second')
    await expect.poll(direct).toEqual([otherName, thirdName])
    await third.sendMessage(withThird, 'hi from the third')
    await expect.poll(direct).toEqual([thirdName, otherName])

    await other.sendMessage(withOther, 'the second again')
    await expect.poll(direct).toEqual([otherName, thirdName])

    // An own message in a direct counts too.
    await me.sendMessage(withThird, 'answering the third')
    await expect.poll(direct).toEqual([thirdName, otherName])
  })

  test('a channel joined later lands by its last message, and so does a rejoined one', async () => {
    const { me, other } = await members()

    // The other user talks in two channels of theirs before the owner is let in.
    const early = name('early')
    const late = name('late')
    const silent = name('silent')
    const one = await other.createChannel(early, [])
    const two = await other.createChannel(late, [])
    const three = await other.createChannel(silent, [])
    await other.sendMessage(one, 'early talk')
    await other.sendMessage(two, 'late talk')

    // Being added is told in the channel, so each join is its last message: the join order holds.
    await other.addMember(one, me.account)
    await other.addMember(two, me.account)
    await other.addMember(three, me.account)
    await expect.poll(async () => await orderOf([early, late, silent])).toEqual([silent, late, early])

    await other.sendMessage(one, 'early talks again')
    await expect.poll(async () => await orderOf([early, late, silent])).toEqual([early, silent, late])

    // Out and back in: the chat is made anew and sorted in, the join being its last message.
    await other.removeMember(three, me.account)
    await expect.poll(async () => await orderOf([early, late, silent])).toEqual([early, late])
    await other.addMember(three, me.account)
    await expect.poll(async () => await orderOf([early, late, silent])).toEqual([silent, early, late])
  })

  test('a sixth issue rises into the five of its activity section when talked to', async () => {
    const { me } = await members()
    if (shared.ws.token === undefined) throw new Error('No workspace token')
    const client = await createRestTxOperations(shared.ws.endpoint, shared.ws.workspace, shared.ws.token)
    try {
      const ctx = await getProjectContext(client)
      const titles = ['one', 'two', 'three', 'four', 'five', 'six'].map((it) => name(it))
      const issues: Array<Pick<Doc, '_id' | '_class' | 'space'>> = []
      for (const title of titles) {
        const _id = await createIssue(client, ctx, { title, status: 'Backlog' })
        issues.push({ _id, _class: tracker.class.Issue, space: ctx.project._id })
      }
      const issuesOrder = async (): Promise<string[]> => await orderOf(titles, issuesSection)

      // The section shows five: the ones talked to, by their last comment; the silent sixth is beyond.
      for (let i = 0; i < 5; i++) {
        await me.sendComment(issues[i], `comment ${i + 1}`)
      }
      await expect.poll(issuesOrder).toEqual([titles[4], titles[3], titles[2], titles[1], titles[0]])

      // A comment on the sixth lifts it over the five, live: the oldest of them leaves the section.
      await me.sendComment(issues[5], 'the sixth talks')
      await expect.poll(issuesOrder).toEqual([titles[5], titles[4], titles[3], titles[2], titles[1]])
    } finally {
      await client.close()
    }
  })

  test('the live order is the order after a reload', async ({ page }) => {
    const { me, other } = await members()

    const first = name('r-a')
    const second = name('r-b')
    const third = name('r-c')
    const one = await createChannel(me, other, first)
    const two = await createChannel(me, other, second)
    const three = await createChannel(me, other, third)
    await other.sendMessage(two, 'second')
    await other.sendMessage(three, 'third')
    await other.sendMessage(one, 'first, last to talk')
    const live = [first, third, second]
    await expect.poll(async () => await orderOf([first, second, third])).toEqual(live)

    await page.reload()
    await channelPage.checkIfChannelDefaultExist(true, first)
    await expect.poll(async () => await orderOf([first, second, third])).toEqual(live)
  })
})
