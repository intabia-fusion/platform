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
import { type Doc, type Ref } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'
import { type Page } from '@playwright/test'

import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner } from '../API/ChatApi'
import { createIssue, getProjectContext } from '../API/TrackerApi'
import { ChannelPage } from '../model/channel-page'
import { MessageSearchPage } from '../model/message-search-page'
import { ThreadsListPage } from '../model/threads-list-page'
import { loginByToken } from '../utils'

test.describe.configure({ mode: 'parallel' })

interface ChatIssue {
  doc: Pick<Doc, '_id' | '_class' | 'space'>
  title: string
  comment: Ref<Doc>
  commentText: string
}

/**
 * A document reached from the chat (navigator, Saved, Threads, search) opens its panel in place of
 * the conversation: the navigator stays, the address stays in the chat, nothing opens over the app.
 */
test.describe('Document panel inside the chat', () => {
  let channelPage: ChannelPage
  let shared: SharedWorkspace
  let uniq: string
  let me: ChatMember

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    shared = await sharedWorkspace(0)
    uniq = `${testInfo.testId}${testInfo.retry}`
    channelPage = new ChannelPage(page)
    me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  /** My issue with my comment on it, then `newer` comments after it: the last one lifts it in the navigator. */
  async function createChatIssue (newer = 0): Promise<ChatIssue> {
    if (shared.ws.token === undefined) throw new Error('No workspace token')
    const client = await createRestTxOperations(shared.ws.endpoint, shared.ws.workspace, shared.ws.token)
    try {
      const ctx = await getProjectContext(client)
      const title = `Chat panel ${uniq}`
      const _id = await createIssue(client, ctx, { title, status: 'Backlog' })
      const doc = { _id, _class: tracker.class.Issue, space: ctx.project._id }
      const commentText = `Comment to jump to ${uniq}`
      const comment = await me.sendComment(doc, commentText)
      for (let i = 0; i < newer; i++) {
        await me.sendComment(doc, `Newer comment ${i} ${uniq}`)
      }
      return { doc, title, comment, commentText }
    } finally {
      await client.close()
    }
  }

  async function checkInChat (page: Page, title: string): Promise<void> {
    await expect(channelPage.docPanel(title)).toBeVisible()
    await expect(channelPage.overlayPanel()).toHaveCount(0)
    await expect(channelPage.navigator()).toBeVisible()
    await expect(page).toHaveURL(/\/chunter\/[^/?]+(%7C|\|)tracker(%3A|:)class(%3A|:)Issue/)
  }

  test('An issue clicked in the navigator opens inside the chat', async ({ page }) => {
    const issue = await createChatIssue()

    await channelPage.clickChooseChannel(issue.title)
    await checkInChat(page, issue.title)
    await expect(page).toHaveURL(new RegExp(`/chunter/${issue.doc._id}(%7C|\\|)`))
    await expect(page.locator(`.hulyComponent [id="${issue.comment}"]`)).toBeVisible()
  })

  test('Back from a channel and a reload keep the issue in the chat', async ({ page }) => {
    const issue = await createChatIssue()

    await channelPage.clickChooseChannel(issue.title)
    await checkInChat(page, issue.title)

    await channelPage.clickChannel('general')
    await expect(channelPage.openedChannelHeader('general')).toBeVisible()
    await expect(channelPage.docPanel(issue.title)).toHaveCount(0)

    await page.goBack()
    await checkInChat(page, issue.title)

    // The address alone, with no click before it, opens the same panel.
    await page.reload()
    await checkInChat(page, issue.title)
  })

  test('A saved comment of an issue opens the issue inside the chat at the comment', async ({ page }) => {
    // Enough newer comments for the saved one to start below the fold.
    const issue = await createChatIssue(15)
    await me.saveMessage(issue.comment)

    const threads = new ThreadsListPage(page)
    await threads.savedNavItem().click()
    await threads.thread(issue.commentText).click()

    await checkInChat(page, issue.title)
    await expect(page.locator(`.hulyComponent [id="${issue.comment}"]`)).toBeInViewport()
  })

  test('A thread of an issue comment opens the issue inside the chat at its root', async ({ page }) => {
    const issue = await createChatIssue(15)
    await me.replyToComment(issue.doc, issue.comment, `Reply in the issue thread ${uniq}`)

    const threads = new ThreadsListPage(page)
    await threads.open()
    await threads.thread(issue.commentText).click()

    await checkInChat(page, issue.title)
    await expect(page.locator(`.hulyComponent [id="${issue.comment}"]`)).toBeInViewport()
  })

  test('A saved reply in an issue thread opens the issue inside the chat and the thread aside', async ({ page }) => {
    const issue = await createChatIssue()
    const replyText = `Saved reply in the issue thread ${uniq}`
    const reply = await me.replyToComment(issue.doc, issue.comment, replyText)
    await me.saveMessage(reply)

    const threads = new ThreadsListPage(page)
    await threads.savedNavItem().click()
    await threads.thread(replyText).click()

    await checkInChat(page, issue.title)
    // The reply is not in the issue's activity, only in the thread beside it.
    await expect(page.locator(`[id="${reply}"]:not(.hulyComponent *)`).first()).toBeVisible()
  })

  test('A search result in an issue opens the issue inside the chat', async ({ page }) => {
    const issue = await createChatIssue()

    const search = new MessageSearchPage(page)
    await search.openBrowser()
    await search.search(issue.commentText)
    await search.checkResultExists(issue.commentText)
    await search.clickResult(issue.commentText)

    await checkInChat(page, issue.title)
    await expect(page.locator(`.hulyComponent [id="${issue.comment}"]`)).toBeVisible()
  })
})
