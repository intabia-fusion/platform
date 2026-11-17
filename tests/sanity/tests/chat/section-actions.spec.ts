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
import task from '@hcengineering/task'
import tracker from '@hcengineering/tracker'

import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import { createIssue, getProjectContext } from '../API/TrackerApi'
import { ChannelPage } from '../model/channel-page'
import { ChatUnreadPage } from '../model/chat-unread-page'
import { generateUser, loginByToken } from '../utils'

type ChatIssue = Pick<Doc, '_id' | '_class' | 'space'> & { title: string }

// The section is named after the base class, the issues in it are of the class of their task type.
const issuesSection = tracker.class.Issue as string

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()

/**
 * The "..." menu of a navigator section acts on every chat of the section. The issues here are made
 * the way the create form makes them, with the class of their task type: an action that looks for
 * the class of the section itself finds none of them.
 */
test.describe('Chat navigator section actions', () => {
  let channelPage: ChannelPage
  let unread: ChatUnreadPage
  let shared: SharedWorkspace
  let uniq: string
  let me: ChatMember

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // The REST member takes a seat like an invited one, once per workspace.
    shared = await sharedWorkspace(0)
    if (!others.has(shared.ws.workspace)) {
      shared = await sharedWorkspace(1)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
    channelPage = new ChannelPage(page)
    unread = new ChatUnreadPage(page)
    me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
    // A collaborator with no personal space yet gets no chat; the first visit makes the space and its channel chats.
    await expect(channelPage.channelName('general')).toBeVisible()
  })

  async function getOther (): Promise<ChatMember> {
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    return other
  }

  /** My issues, each with my comment: the last message lifts them into the five the section shows. */
  async function createChatIssues (names: string[]): Promise<ChatIssue[]> {
    if (shared.ws.token === undefined) throw new Error('No workspace token')
    const client = await createRestTxOperations(shared.ws.endpoint, shared.ws.workspace, shared.ws.token)
    try {
      const ctx = await getProjectContext(client)
      const taskType = await client.findOne(task.class.TaskType, { _id: ctx.taskType })
      const _class = taskType?.targetClass
      if (_class === undefined) throw new Error('No class of the task type')
      // With the base class the tests below would pass on an action that misses task type classes.
      expect(_class).not.toBe(tracker.class.Issue)

      const issues: ChatIssue[] = []
      for (const name of names) {
        const title = `${name} ${uniq}`
        const _id = await createIssue(client, ctx, { title, status: 'Backlog', _class: _class as any })
        const issue = { _id, _class, space: ctx.project._id, title }
        await me.sendComment(issue, `Own comment ${uniq}`)
        issues.push(issue)
      }
      return issues
    } finally {
      await client.close()
    }
  }

  test('"Hide all" hides every issue of the section', async ({ page }) => {
    const issues = await createChatIssues(['Hide one', 'Hide two'])
    for (const issue of issues) {
      await expect(unread.navItem(issue.title)).toBeVisible()
    }

    await channelPage.makeActionWithSectionInMenu(issuesSection, 'Hide all')
    for (const issue of issues) {
      await expect(unread.navItem(issue.title)).toHaveCount(0)
    }

    // Hidden in the database, not only taken off the list.
    await page.reload()
    await expect(channelPage.channelName('general')).toBeVisible()
    for (const issue of issues) {
      await expect(unread.navItem(issue.title)).toHaveCount(0)
    }
  })

  test('"Mark all as read" reads the red and the gray counters of the section', async () => {
    const other = await getOther()
    const [notified, muted] = await createChatIssues(['Read red', 'Read gray'])
    // A muted issue gets no notification: its message counts gray, outside of the inbox counter.
    await me.setNotificationMode(muted as any, 'mute')
    await other.sendComment(notified, `Comment ${uniq}`)
    await other.sendComment(muted, `Comment ${uniq}`)

    await unread.checkNavCounter(notified.title, 1, 'red')
    await unread.checkNavCounter(muted.title, 1, 'gray')

    await channelPage.makeActionWithSectionInMenu(issuesSection, 'Mark all as read')

    await unread.checkNavCounter(notified.title, undefined)
    await unread.checkNavCounter(muted.title, undefined)
    await expect.poll(async () => await me.hasUnreadContext(notified._id), { timeout: 15000 }).toBe(false)
    await expect.poll(async () => await me.hasUnreadContext(muted._id), { timeout: 15000 }).toBe(false)
  })
})
