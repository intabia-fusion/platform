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

import { type Locator, type Page } from '@playwright/test'

import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import { ChannelPage } from '../model/channel-page'
import { PollPage } from '../model/poll-page'
import { generateUser, loginByToken } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()

/** The poll form and its draft in the message input, before and up to sending. */
test.describe('Poll form tests', () => {
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

  async function openChannel (): Promise<Channel> {
    const me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    const channel = await me.createChannel(`poll-form-${uniq}`, [other.account])
    await channelPage.clickChannel(channel.name)
    return channel
  }

  // The hint shows on a pause over the button, and a busy page can miss the one move: the pointer leaves and comes back.
  async function checkHint (page: Page, text: string): Promise<void> {
    await expect(async () => {
      await polls.questionInput().hover()
      await polls.createButton().hover()
      await expect(page.locator('div.tooltip')).toHaveText(text, { timeout: 3000 })
    }).toPass()
  }

  // The question shares the form's title, so its own buttons are taken from its footer.
  const questionButton = (name: 'Cancel' | 'Close'): Locator =>
    polls.closeQuestion().locator('footer').getByRole('button', { name, exact: true })

  async function createDraft (question: string, options: string[]): Promise<void> {
    await polls.openForm()
    await polls.fill({ question, options })
    await polls.createButton().click()
    await expect(polls.questionInput()).toBeHidden()
    await expect(polls.draft(question)).toBeVisible()
  }

  test('Create stays disabled until the form is valid, and its hint says what is missing', async ({ page }) => {
    await openChannel()
    await polls.openForm()

    await expect(polls.createButton()).toBeDisabled()
    await checkHint(page, 'Ask a question...')

    await polls.questionInput().fill(`Colour? ${uniq}`)
    await expect(polls.createButton()).toBeDisabled()
    await checkHint(page, 'Add at least two options')

    await polls.optionInput(0).fill('Red')
    await expect(polls.createButton()).toBeDisabled()
    await checkHint(page, 'Add at least two options')

    await polls.optionInput(1).fill('Blue')
    await expect(polls.createButton()).toBeEnabled()

    await polls.setting('Quiz mode').check()
    await expect(polls.createButton()).toBeDisabled()
    await checkHint(page, 'Mark the correct answer')

    await polls.correctAnswer('Blue').check()
    await expect(polls.createButton()).toBeEnabled()
  })

  test('A changed form asks before closing, an untouched one closes at once', async ({ page }) => {
    await openChannel()
    const question = `Colour? ${uniq}`

    await polls.openForm()
    await page.keyboard.press('Escape')
    await expect(polls.questionInput()).toBeHidden()
    await expect(polls.closeQuestion()).toBeHidden()

    await polls.openForm()
    await polls.fill({ question, options: ['Red'] })
    await polls.form().locator('header').getByRole('button', { name: 'Close' }).click()
    await expect(polls.closeQuestion()).toBeVisible()
    await questionButton('Cancel').click()
    await expect(polls.closeQuestion()).toBeHidden()
    await expect(polls.questionInput()).toHaveValue(question)

    await page.keyboard.press('Escape')
    await expect(polls.closeQuestion()).toBeVisible()
    // Escape on the question answers it, the form stays as it was.
    await page.keyboard.press('Escape')
    await expect(polls.closeQuestion()).toBeHidden()
    await expect(polls.questionInput()).toHaveValue(question)
    await expect(polls.optionInput(0)).toHaveValue('Red')

    await page.keyboard.press('Escape')
    await questionButton('Close').click()
    await expect(polls.closeQuestion()).toBeHidden()
    await expect(polls.questionInput()).toBeHidden()
    await expect(polls.draft(question)).toBeHidden()
  })

  test('The keyboard moves between the fields and creates the poll', async ({ page }) => {
    await openChannel()
    const question = `Colour? ${uniq}`

    await polls.openForm()
    await page.keyboard.type(question)
    await page.keyboard.press('Enter')
    await expect(polls.optionInput(0)).toBeFocused()
    await expect(polls.optionInput(1)).toBeHidden()

    await page.keyboard.type('Red')
    await expect(polls.optionInput(1)).toBeVisible()

    await page.keyboard.press('ArrowUp')
    await expect(polls.questionInput()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(polls.optionInput(0)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(polls.optionInput(1)).toBeFocused()

    await page.keyboard.type('Blue')
    await expect(polls.optionInput(2)).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(polls.optionInput(0)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(polls.optionInput(1)).toBeFocused()

    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(polls.questionInput()).toBeHidden()
    await expect(polls.draft(question)).toBeVisible()
  })

  test('The draft opens in the form, keeps its edits across a reload and is removed by its cross', async ({ page }) => {
    await openChannel()
    const question = `Colour? ${uniq}`
    const edited = `Shade? ${uniq}`
    await createDraft(question, ['Red', 'Blue'])

    await polls.draft(question).locator('.open').click()
    await expect(page.getByRole('dialog', { name: 'Edit Poll' })).toBeVisible()
    await expect(polls.questionInput()).toHaveValue(question)
    await expect(polls.optionInput(0)).toHaveValue('Red')
    await expect(polls.optionInput(1)).toHaveValue('Blue')

    await polls.questionInput().fill(edited)
    await polls.createButton().click()
    await expect(polls.questionInput()).toBeHidden()
    await expect(polls.draft(edited)).toBeVisible()
    await expect(polls.draft(question)).toHaveCount(0)

    await page.reload()
    await expect(polls.draft(edited)).toBeVisible()

    await polls.draft(edited).hover()
    const remove = polls.draft(edited).getByRole('button', { name: 'Remove' })
    await expect(remove).toBeVisible()
    await remove.click()
    await expect(polls.draft(edited)).toHaveCount(0)
  })

  test('A poll is sent without text, and with text both land in one message', async () => {
    await openChannel()
    const alone = `Colour? ${uniq}`
    const withText = `Size? ${uniq}`
    const text = `Pick one ${uniq}`

    await createDraft(alone, ['Red', 'Blue'])
    await expect(polls.sendButton()).toBeEnabled()
    await polls.sendButton().click()
    await expect(polls.draft(alone)).toHaveCount(0)
    await expect(polls.poll(alone)).toBeVisible()

    await channelPage.inputMessage().fill(text)
    await createDraft(withText, ['Small', 'Large'])
    await polls.sendButton().click()
    await expect(polls.draft(withText)).toHaveCount(0)
    await expect(polls.poll(withText, channelPage.textMessage(text))).toBeVisible()
    await expect(channelPage.textMessage(text)).toHaveCount(1)
  })
})
