import { expect, test, type SharedWorkspace } from '../fixtures'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { SignUpData } from '../model/common-types'
import { getSecondPageByApi } from '../API/ChatApi'
import { generateUser, loginByToken } from '../utils'

test.describe.configure({ mode: 'parallel' })

test.describe('Check direct messages channels', () => {
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let newUser2: SignUpData
  let owner: SharedWorkspace

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    owner = await sharedWorkspace(testInfo.tags.includes('@invite') ? 1 : 0)
    newUser2 = generateUser()

    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    await loginByToken(page, owner.token, owner.ws, 'chunter')
  })

  test('User can create/close/reacreate direct chat with employee', { tag: '@invite' }, async ({ page, browser }) => {
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

      await channelPageSecond.clickChooseChannel(`${owner.data.lastName} ${owner.data.firstName}`)
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
