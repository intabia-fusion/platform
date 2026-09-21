import { expect, test } from '../fixtures'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { SignUpData } from '../model/common-types'
import type { WorkspaceLoginInfo } from '@hcengineering/account'
import { getSecondPageByApi } from '../API/ChatApi'
import { createAccountAndWorkspace, generateTestData, generateUser } from '../utils'

test.describe.configure({ mode: 'parallel' })

test.describe('Check direct messages channels', () => {
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let newUser2: SignUpData
  let owner: { ws: WorkspaceLoginInfo, token: string }
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }

  test.beforeEach(async ({ page, request }) => {
    data = generateTestData()
    newUser2 = generateUser()

    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    // Straight into the workspace from the account token: the login form plus the workspace
    // picker are three page loads and cost about a second per test.
    owner = await createAccountAndWorkspace(page, request, data, 'chunter')
  })

  test('User can create/close/reacreate direct chat with employee', async ({ page, browser }) => {
    using _page2 = await getSecondPageByApi(browser, owner.ws, newUser2, 'chunter')
    const page2 = _page2.page
    const channelPageSecond = new ChannelPage(page2)
    const leftSideMenuPageSecond = new LeftSideMenuPage(page2)
    await leftSideMenuPageSecond.clickChunter()

    await test.step('Create a direct chat', async () => {
      await chunterPage.createDirectChat(newUser2)
    })

    await test.step('Exchange messages in the direct chat', async () => {
      await channelPage.clickChooseChannel(`${newUser2.lastName} ${newUser2.firstName}`)
      await channelPage.sendMessage('Test direct question')

      await channelPageSecond.clickChooseChannel(`${data.lastName} ${data.firstName}`)
      await channelPageSecond.checkMessageExist('Test direct question', true, 'Test direct question')
      await channelPageSecond.sendMessage('Test direct answer')

      await channelPage.checkMessageExist('Test direct answer', true, 'Test direct answer')
    })

    await test.step('Close conversation', async () => {
      const directName = `${newUser2.lastName} ${newUser2.firstName}`
      await expect(chunterPage.getChatLocator(directName)).toBeVisible()
      await channelPage.makeActionWithChannelInMenu(directName, 'Hide from chat list')
      await expect(chunterPage.getChatLocator(directName)).toBeHidden()
    })

    await test.step('Recreate a direct chat and see if messages are kept', async () => {
      await page.reload()
      await channelPage.clickChooseChannel('general')

      await chunterPage.createDirectChat(newUser2)
      await channelPage.clickChooseChannel(`${newUser2.lastName} ${newUser2.firstName}`)
      await channelPage.checkMessageExist('Test direct answer', true, 'Test direct answer')
    })
  })
})
