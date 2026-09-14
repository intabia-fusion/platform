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

import { expect, test } from '../fixtures'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { MessageSearchPage } from '../model/message-search-page'
import { createAccount, generateUser, getInviteLink, getSecondPageByInvite, loginByToken } from '../utils'
import { SignUpData } from '../model/common-types'

test.describe.configure({ mode: 'parallel' })

test.describe('Message search', () => {
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let searchPage: MessageSearchPage
  // Every assertion keys off this, so a retry and the other tests sharing the workspace cannot
  // match each other's messages.
  let uniq: string
  let newUser: SignUpData

  test.beforeEach(async ({ page, request, sharedWorkspace }, testInfo) => {
    const shared = await sharedWorkspace(testInfo.tags.includes('@invite') ? 1 : 0)
    uniq = `${testInfo.testId}${testInfo.retry}`
    newUser = generateUser()

    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    searchPage = new MessageSearchPage(page)

    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  test('Finds a message from the Browser page', async () => {
    const message = `Searchable message ${uniq}`
    await channelPage.clickChannel('general')
    await channelPage.sendMessage(message)

    await searchPage.openBrowser()
    await searchPage.search(message)
    await searchPage.checkResultExists(message)
  })

  test('Reports nothing found for a query that matches no message', async () => {
    await searchPage.openBrowser()
    await searchPage.search(`nothingmatchesthis${uniq}`)
    await searchPage.checkNoResults()
  })

  test('Opens the channel the result belongs to', async ({ page }) => {
    const message = `Jump to me ${uniq}`
    await channelPage.clickChannel('random')
    await channelPage.sendMessage(message)

    await searchPage.openBrowser()
    await searchPage.search(message)
    await searchPage.checkResultExists(message)
    await searchPage.clickResult(message)

    // The conversation the message lives in, not the search page.
    await expect(page.locator('.hulyHeader-titleGroup')).toContainText('random')
    await channelPage.checkMessageExist(message, true, message)
  })

  test('Keeps the query in the address, so Back returns to the results', async ({ page }) => {
    const message = `Back to results ${uniq}`
    await channelPage.clickChannel('general')
    await channelPage.sendMessage(message)

    await searchPage.openBrowser()
    await searchPage.search(message)
    await searchPage.checkResultExists(message)
    await searchPage.clickResult(message)
    await channelPage.checkMessageExist(message, true, message)

    await page.goBack()
    await expect(searchPage.inputSearch()).toHaveValue(message)
    await searchPage.checkResultExists(message)
  })

  test('Searches only inside the channel it was opened from', async () => {
    const shared = `Shared word ${uniq}`
    await channelPage.clickChannel('general')
    await channelPage.sendMessage(`${shared} in general`)
    await channelPage.clickChannel('random')
    await channelPage.sendMessage(`${shared} in random`)

    // Still in random: its overlay must not offer the message that lives in general.
    await searchPage.openChannelSearch()
    await searchPage.search(shared)
    await searchPage.checkResultExists(`${shared} in random`)
    await expect(searchPage.result(`${shared} in general`)).toBeHidden()
  })

  test('Shows no overlay until the search has something to show', async () => {
    await channelPage.clickChannel('general')
    await searchPage.openChannelSearch()

    // An empty field means no sheet over the conversation at all.
    await expect(searchPage.panel()).toBeHidden()

    await searchPage.search(`nothingmatchesthis${uniq}`)
    await expect(searchPage.panel()).toBeHidden()
  })

  test('Closes the in-channel search and clears it', async () => {
    const message = `Close me ${uniq}`
    await channelPage.clickChannel('general')
    await channelPage.sendMessage(message)

    await searchPage.openChannelSearch()
    await searchPage.search(message)
    await searchPage.checkResultExists(message)

    await searchPage.closeChannelSearch()
    await expect(searchPage.panel()).toBeHidden()

    // Reopening starts clean rather than restoring the previous query.
    await searchPage.openChannelSearch()
    await expect(searchPage.inputSearch()).toHaveValue('')
  })

  test('Resets the search when another channel is opened', async () => {
    const message = `Switch away ${uniq}`
    await channelPage.clickChannel('general')
    await channelPage.sendMessage(message)

    await searchPage.openChannelSearch()
    await searchPage.search(message)
    await searchPage.checkResultExists(message)

    await channelPage.clickChannel('random')
    await expect(searchPage.inputSearch()).toBeHidden()
    await expect(searchPage.panel()).toBeHidden()
  })

  // A direct needs a second account and an invite, so this one spends a seat of the shared
  // workspace - hence the tag the fixture keys its recycling off.
  test(
    'Searches inside a direct the same way it does a channel',
    { tag: '@invite' },
    async ({ browser, page, request }) => {
      const message = `Direct search ${uniq}`
      const linkText = await getInviteLink(page)
      await createAccount(request, newUser)
      using invited = await getSecondPageByInvite(browser, linkText, newUser)
      await expect(invited.page).toHaveURL(/workbench/)

      await chunterPage.createDirectChat(newUser)
      await channelPage.clickChooseChannel(`${newUser.lastName} ${newUser.firstName}`)
      await channelPage.sendMessage(message)

      await searchPage.openChannelSearch()
      await searchPage.search(message)
      await searchPage.checkResultExists(message)
    }
  )
})
