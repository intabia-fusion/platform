import { expect, test, type Browser, type SharedWorkspace } from '../fixtures'
import { connectOwner, joinWorkspace, openMemberPage } from '../API/ChatApi'
import { ChannelPage } from '../model/channel-page'
import { generateUser, loginByToken } from '../utils'

test.describe.configure({ mode: 'parallel' })

test.describe('Pulse — typing indicator and document presence', () => {
  let channelPage: ChannelPage
  let shared: SharedWorkspace
  let channelName: string

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // Both tests bring a second user, who takes a seat.
    shared = await sharedWorkspace(1)
    channelPage = new ChannelPage(page)
    channelName = `pulse-${testInfo.testId}${testInfo.retry}`
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  // Presence lives per channel, and `general` still shows whoever the worker's earlier tests had
  // open in it within the presence TTL - so each test gets a channel of its own.
  async function openSecondUser (browser: Browser): ReturnType<typeof openMemberPage> {
    const member = await joinWorkspace(shared.ws, generateUser())
    const owner = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    await owner.createChannel(channelName, [member.account])
    return await openMemberPage(browser, member, 'chunter')
  }

  test('Second user sees typing indicator while first user types in a channel', async ({ browser }) => {
    const second = await openSecondUser(browser)
    try {
      const channelPageSecond = new ChannelPage(second.page)

      await channelPage.clickChooseChannel(channelName)
      await channelPageSecond.clickChooseChannel(channelName)

      await channelPage.inputMessage().click()
      await channelPage.inputMessage().pressSequentially('hello there', { delay: 80 })

      const typingInfo = second.page.locator('span[data-id="channel-typing-info"]')
      await expect(typingInfo).toContainText(shared.data.firstName, { timeout: 8000 })

      await channelPage.buttonSendMessage().click()
      await expect(typingInfo).not.toContainText(shared.data.firstName, { timeout: 10000 })
    } finally {
      await second.context.close()
    }
  })

  test('First user sees second user as document presence viewer in a channel', async ({ browser }) => {
    const second = await openSecondUser(browser)
    try {
      const channelPageSecond = new ChannelPage(second.page)

      await channelPage.clickChooseChannel(channelName)

      // Presence avatars on page1 should be empty (only self — filtered out)
      const presenceFirst = channelPage.page.locator('[data-id="document-presence"]')
      await expect(presenceFirst).toHaveCount(1)
      await expect(presenceFirst.locator('.hulyCombineAvatar, .avatar-button')).toHaveCount(0)

      // Second user opens the same channel
      await channelPageSecond.clickChooseChannel(channelName)

      // First user should now see second user avatar via DocumentPresence
      await expect(presenceFirst.locator('.hulyCombineAvatar, .avatar-button')).toHaveCount(1, { timeout: 10000 })

      // Presence disappears only once its TTL expires, not immediately - hence the 20s
      // timeout.
      await channelPageSecond.clickChooseChannel('random')
      await expect(presenceFirst.locator('.hulyCombineAvatar, .avatar-button')).toHaveCount(0, { timeout: 20000 })
    } finally {
      await second.context.close()
    }
  })
})
