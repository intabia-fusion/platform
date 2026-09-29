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

import { type Doc, type Ref } from '@hcengineering/core'
import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import { ThreadsListPage } from '../model/threads-list-page'
import { generateUser, loginByToken } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

interface Chat {
  channel: Channel
  me: ChatMember
  other: ChatMember
}

interface Thread {
  id: Ref<Doc>
  text: string
}

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()

/**
 * The Threads list goes by the time of the last reply: a thread somebody answers goes to the top,
 * and nothing else moves it. The other user is REST-only; threads are mine, so they are on my list.
 */
test.describe('Threads list order tests', () => {
  let threads: ThreadsListPage
  let shared: SharedWorkspace
  let uniq: string

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // The REST member takes a seat like an invited one, once per workspace.
    shared = await sharedWorkspace(0)
    if (!others.has(shared.ws.workspace)) {
      shared = await sharedWorkspace(1)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
    threads = new ThreadsListPage(page)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  async function createChat (): Promise<Chat> {
    const me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    const channel = await me.createChannel(`order-${uniq}`, [other.account])
    return { channel, me, other }
  }

  /** My messages, each answered once by the other user in the given order: the last is the newest. */
  async function createThreads (chat: Chat, names: string[]): Promise<Thread[]> {
    const result: Thread[] = []
    for (const name of names) {
      const text = `${name} parent ${uniq}`
      result.push({ id: await chat.me.sendMessage(chat.channel, text), text })
    }
    for (const thread of result) {
      await chat.other.reply(chat.channel, thread.id, `Reply to ${thread.text}`)
    }
    return result
  }

  const texts = (list: Thread[]): string[] => list.map((it) => it.text)

  test('The list goes by the last reply and shows when it came', async () => {
    const chat = await createChat()
    const [a, b, c] = await createThreads(chat, ['A', 'B', 'C'])
    // The creation order is A, B, C; the answers go B, C, A.
    await chat.other.reply(chat.channel, b.id, `Late reply ${uniq}`)
    const lastId = await chat.other.reply(chat.channel, c.id, `Later reply ${uniq}`)
    await chat.other.reply(chat.channel, a.id, `Latest reply ${uniq}`)

    await threads.open()
    await threads.checkOrder(texts([a, c, b]))

    // The time on the card is the time the reply was sent.
    const parent = await chat.me.getMessage(c.id)
    const reply = await chat.me.getMessage(lastId)
    expect(parent.lastReply).toBe(reply.createdOn)
    await expect(threads.lastReply(c.text)).toHaveText(/Last reply\s*(less than a minute ago|a minute ago)/)
  })

  test('My own reply takes a thread to the top', async () => {
    const chat = await createChat()
    const [a, b] = await createThreads(chat, ['A', 'B'])

    await threads.open()
    await threads.checkOrder(texts([b, a]))

    await chat.me.reply(chat.channel, a.id, `My reply ${uniq}`)
    await threads.checkOrder(texts([a, b]))
  })

  test('A thread already on top stays there and counts the new reply', async () => {
    const chat = await createChat()
    const [a, b] = await createThreads(chat, ['A', 'B'])

    await threads.open()
    await threads.checkOrder(texts([b, a]))
    await expect(threads.repliesCount(b.text)).toHaveText('1 reply')

    await chat.other.reply(chat.channel, b.id, `Second reply ${uniq}`)
    await expect(threads.repliesCount(b.text)).toHaveText('2 replies')
    await threads.checkOrder(texts([b, a]))
    await expect(threads.lastReply(b.text)).toHaveText(/Last reply\s*(less than a minute ago|a minute ago)/)
  })

  test('Replies arriving together line up by arrival', async () => {
    const chat = await createChat()
    const [a, b, c] = await createThreads(chat, ['A', 'B', 'C'])

    await threads.open()
    await threads.checkOrder(texts([c, b, a]))

    // One after another with no wait for the page in between.
    await chat.other.reply(chat.channel, c.id, `First burst ${uniq}`)
    await chat.other.reply(chat.channel, a.id, `Second burst ${uniq}`)
    await chat.other.reply(chat.channel, b.id, `Third burst ${uniq}`)
    await threads.checkOrder(texts([b, a, c]))
  })

  test('Edits and reactions do not move a thread', async ({ page }) => {
    const chat = await createChat()
    const [a, b] = await createThreads(chat, ['A', 'B'])
    const aReply = await chat.other.reply(chat.channel, a.id, `A second reply ${uniq}`)

    await threads.open()
    await threads.checkOrder(texts([a, b]))

    // The last reply of the lower thread is edited, its parent gets a reaction: B keeps its place.
    const bReplies = await chat.me.getMessage(b.id)
    expect(bReplies.replies).toBe(1)
    await chat.other.editReply(chat.channel, a.id, aReply, `A second reply, edited ${uniq}`)
    await chat.other.editMessage(chat.channel, b.id, `B parent ${uniq} edited`)
    await chat.other.react(chat.channel, b.id, '👍')
    await expect(threads.thread(`B parent ${uniq} edited`)).toBeVisible()
    await expect(threads.thread(b.text).locator('.hulyReactions-container')).toBeVisible()

    await threads.checkOrder([a.text, `B parent ${uniq} edited`])
    // Nothing moves it back later either.
    await page.waitForTimeout(1500)
    await threads.checkOrder([a.text, `B parent ${uniq} edited`])
  })

  test('A thread going up leaves the other rows alone', async ({ page }) => {
    const chat = await createChat()
    const [a, b, c] = await createThreads(chat, ['A', 'B', 'C'])

    await threads.open()
    await threads.checkOrder(texts([c, b, a]))

    // Tag the rows: a keyed list moves A's row, an unkeyed one would redraw B and C with other messages.
    await threads.thread(b.text).evaluate((el) => {
      el.setAttribute('data-probe', 'b')
    })
    await threads.thread(c.text).evaluate((el) => {
      el.setAttribute('data-probe', 'c')
    })

    await chat.other.reply(chat.channel, a.id, `Lift ${uniq}`)
    await threads.checkOrder(texts([a, c, b]))
    await expect(page.locator('[data-probe="b"]')).toContainText(b.text)
    await expect(page.locator('[data-probe="c"]')).toContainText(c.text)
  })

  test('A thread going up above the viewport does not shift what is on screen', async () => {
    const chat = await createChat()
    // Enough rows to read the middle of the list with more of it below the viewport.
    const list = await createThreads(
      chat,
      Array.from({ length: 30 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
    )
    const oldest = list[0]
    const middle = list[20]

    await threads.open()
    await threads.checkOrder(texts([list[29], list[28]]))
    // At the very top the browser lets a new row push the content down on purpose: that is how a
    // lifted thread shows up there. Here the reader is further down, and the lifted thread comes from
    // below the viewport, so nothing on screen has a reason to move.
    await threads.thread(middle.text).evaluate((el) => {
      el.scrollIntoView({ block: 'start' })
    })
    const scroll = await threads.scrollState()
    expect(scroll.top).toBeGreaterThan(0)
    expect(scroll.room).toBeGreaterThan(200)
    const index = await threads.rowIndex(middle.text)
    const before = await threads.thread(middle.text).boundingBox()
    expect(before).not.toBeNull()

    // Rows below the viewport are not rendered yet: the lift shows as one more row above.
    await chat.other.reply(chat.channel, oldest.id, `Lift ${uniq}`)
    await expect(async () => {
      expect(await threads.rowIndex(middle.text)).toBe(index + 1)
    }).toPass()
    const after = await threads.thread(middle.text).boundingBox()
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(2)
  })

  test('The order follows in another tab of the same account', async ({ page }) => {
    const chat = await createChat()
    const [a, b] = await createThreads(chat, ['A', 'B'])

    const second = await page.context().newPage()
    await loginByToken(second, shared.token, shared.ws, 'chunter')
    const secondThreads = new ThreadsListPage(second)

    await threads.open()
    await secondThreads.open()
    await threads.checkOrder(texts([b, a]))
    await secondThreads.checkOrder(texts([b, a]))

    await chat.other.reply(chat.channel, a.id, `Lift ${uniq}`)
    await threads.checkOrder(texts([a, b]))
    await secondThreads.checkOrder(texts([a, b]))
    await second.close()
  })

  test('A thread whose only reply is removed leaves the list', async () => {
    const chat = await createChat()
    const [a, b] = await createThreads(chat, ['A', 'B'])
    const aReplies = await chat.me.getMessage(a.id)
    expect(aReplies.replies).toBe(1)

    await threads.open()
    await threads.checkOrder(texts([b, a]))

    const onlyReply = await findOnlyReply(chat, a.id)
    await chat.other.removeReply(chat.channel, a.id, onlyReply)
    await expect(threads.thread(a.text)).toHaveCount(0)
    await expect(threads.thread(b.text)).toBeVisible()
  })

  test('Threads and Saved show the chat a message comes from', async () => {
    const chat = await createChat()
    const [a] = await createThreads(chat, ['A'])
    const replyText = `Saved reply ${uniq}`
    const reply = await chat.other.reply(chat.channel, a.id, replyText)
    await chat.me.saveMessage(a.id)
    await chat.me.saveMessage(reply)

    await threads.open()
    await expect(threads.chatLabel(a.text)).toHaveText(chat.channel.name)

    // A saved reply names the thread's chat, not its parent message.
    await threads.savedNavItem().click()
    await expect(threads.chatLabel(a.text)).toHaveText(chat.channel.name)
    await expect(threads.chatLabel(replyText)).toHaveText(chat.channel.name)
  })

  async function findOnlyReply (chat: Chat, parent: Ref<Doc>): Promise<Ref<Doc>> {
    const replies = await chat.me.client.findAll('chunter:class:ThreadMessage' as any, { attachedTo: parent } as any)
    expect(replies).toHaveLength(1)
    return replies[0]._id
  }
})
