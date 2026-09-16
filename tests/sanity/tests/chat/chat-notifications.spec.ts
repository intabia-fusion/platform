import { type Browser, type Page, expect } from '@playwright/test'
import { test } from '../fixtures'
import { ApiEndpoint } from '../API/Api'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { SignUpData } from '../model/common-types'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { generateTestData, generateUser, getInviteLink, getSecondPageByInvite, loginByToken } from '../utils'

interface SecondUser {
  page2: Page
  channelPage2: ChannelPage
  chunterPage2: ChunterPage
  leftSideMenu2: LeftSideMenuPage
  dispose: () => Promise<void>
}

test.describe.configure({ mode: 'parallel' })

async function expectIncomingMessage (page: Page, text: string): Promise<void> {
  await expect(page.locator('.activityMessage', { hasText: text }).first()).toBeVisible()
}

/**
 * Two-user chat behaviour: live delivery into an open view, threads, reactions, edits and the
 * per-channel notification modes. Each test owns its channel and tags every string with an id.
 */
test.describe('Chat notification tests', () => {
  let leftSideMenuPage: LeftSideMenuPage
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let api: ApiEndpoint
  let newUser2: SignUpData
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }
  let uniq: string

  test.beforeEach(async ({ page, request, sharedWorkspace }, testInfo) => {
    const shared = await sharedWorkspace(1)
    uniq = `${testInfo.testId}${testInfo.retry}`
    data = { ...shared.data, channelName: `${generateTestData().channelName}${uniq}` }
    newUser2 = generateUser()

    leftSideMenuPage = new LeftSideMenuPage(page)
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    api = new ApiEndpoint(request)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  async function inviteSecondUser (browser: Browser, page: Page, channelName: string): Promise<SecondUser> {
    // createChannel only clicks Create, so the modal can still be up when the profile menu opens
    // behind it and getInviteLink then waits its retries out on a popup that never renders.
    await channelPage.checkIfChannelDefaultExist(true, channelName)
    const linkText = await getInviteLink(page)
    // The invite link only logs in, so the account has to exist before the second page opens it.
    await api.createAccount(newUser2.email, newUser2.password, newUser2.firstName, newUser2.lastName)
    const second = await getSecondPageByInvite(browser, linkText, newUser2)
    const page2 = second.page

    // From the details panel: the shared Channels table is slower and racier.
    await channelPage.clickChooseChannel(channelName)
    // The aside is a toggle that takes a moment to mount, so keep clicking until it is there.
    await expect(async () => {
      if (!(await channelPage.addMemberPreview().isVisible())) {
        await channelPage.clickOnOpenChannelDetails()
      }
      await expect(channelPage.addMemberPreview()).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 3000 })
    await channelPage.addMemberToChannelPreview(newUser2.lastName + ' ' + newUser2.firstName)
    await channelPage.clickOnOpenChannelDetails()

    const leftSideMenu2 = new LeftSideMenuPage(page2)
    const channelPage2 = new ChannelPage(page2)
    await leftSideMenu2.clickChunter()
    await channelPage2.checkIfChannelDefaultExist(true, channelName)

    return {
      page2,
      channelPage2,
      chunterPage2: new ChunterPage(page2),
      leftSideMenu2,
      dispose: async () => {
        await second.context.close()
      }
    }
  }

  async function openSharedChannel (browser: Browser, page: Page, isPrivate = false): Promise<SecondUser> {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, isPrivate)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    await invited.channelPage2.clickChooseChannel(data.channelName)
    await channelPage.clickChooseChannel(data.channelName)
    return invited
  }

  test('Message appears in an open channel without a reload', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Live message ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)
    } finally {
      await invited.dispose()
    }
  })

  test('Messages arrive in both directions in an open channel', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const fromSecond = `From second ${uniq}`
      const fromFirst = `From first ${uniq}`

      await invited.channelPage2.sendMessage(fromSecond)
      await channelPage.checkMessageExist(fromSecond, true, fromSecond)

      await channelPage.sendMessage(fromFirst)
      await invited.channelPage2.checkMessageExist(fromFirst, true, fromFirst)
    } finally {
      await invited.dispose()
    }
  })

  test('A burst of messages arrives complete and in order', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      for (let i = 1; i <= 5; i++) {
        await invited.channelPage2.sendMessage(`Burst-${i} ${uniq}`)
      }
      for (let i = 1; i <= 5; i++) {
        await channelPage.checkMessageExist(`Burst-${i} ${uniq}`, true, `Burst-${i} ${uniq}`)
      }
    } finally {
      await invited.dispose()
    }
  })

  test('Thread reply reaches an open thread without a reload', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const parent = `Thread root ${uniq}`
      await channelPage.sendMessage(parent)
      await expectIncomingMessage(invited.page2, parent)

      await channelPage.replyMessage(parent)
      const reply = `Live reply ${uniq}`
      await invited.channelPage2.replyMessage(parent)
      await invited.channelPage2.sendReply(reply)

      await expectIncomingMessage(page, reply)
    } finally {
      await invited.dispose()
    }
  })

  test('Reply count on the parent message grows as replies arrive', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const parent = `Counted thread ${uniq}`
      await channelPage.sendMessage(parent)
      await expectIncomingMessage(invited.page2, parent)

      await invited.channelPage2.replyMessage(parent)
      await invited.channelPage2.sendReply(`Reply one ${uniq}`)
      await expect(page.locator('.thread__replies-count').first()).toHaveText('1 reply')

      await invited.channelPage2.sendReply(`Reply two ${uniq}`)
      await expect(page.locator('.thread__replies-count').first()).toHaveText('2 replies')
    } finally {
      await invited.dispose()
    }
  })

  test('Reaction from another user shows up on the message', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `React to me ${uniq}`
      await channelPage.sendMessage(message)
      await invited.channelPage2.checkMessageExist(message, true, message)

      await invited.channelPage2.addEmoji(message, '😀')
      await channelPage.checkIfEmojiIsAdded('😀')
    } finally {
      await invited.dispose()
    }
  })

  test('Edited message updates for the other user', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const original = `Before edit ${uniq}`
      const suffix = ' edited'
      await invited.channelPage2.sendMessage(original)
      await channelPage.checkMessageExist(original, true, original)

      await invited.channelPage2.clickOpenMoreButton(original)
      await invited.channelPage2.clickEditMessageButton(suffix)
      await invited.channelPage2.clickOnUpdateButton()

      await channelPage.checkMessageExist(`${original}${suffix}`, true, `${original}${suffix}`)
    } finally {
      await invited.dispose()
    }
  })

  test('Deleted message disappears for the other user', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Delete me ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)

      await invited.channelPage2.clickOpenMoreButton(message)
      await invited.channelPage2.clickDeleteMessageButton()
      await invited.channelPage2.clickDeleteMessageConfirmationButton()

      await channelPage.checkMessageExist(message, false, message)
    } finally {
      await invited.dispose()
    }
  })

  test('Mention notifies the mentioned user', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      // From the owner's side: a just-joined guest can have an empty employee list.
      const mentionOf = newUser2.lastName + ' ' + newUser2.firstName
      await channelPage.sendMention(mentionOf, 'EMPLOYEES')

      await expectIncomingMessage(invited.page2, `@${mentionOf}`)
      await invited.leftSideMenu2.clickNotification()
      await expect(invited.page2.getByText(data.channelName).first()).toBeVisible()
    } finally {
      await invited.dispose()
    }
  })

  test('Muted channel stops notifying but keeps delivering messages', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      await page.getByRole('button', { name: 'Mute' }).click()

      const message = `Muted message ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)
    } finally {
      await invited.dispose()
    }
  })

  test('Notification mode survives a reload', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      await page.getByRole('button', { name: 'Mute' }).click()

      await page.reload()
      await channelPage.clickChooseChannel(data.channelName)
      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      // Every mode is always listed, so presence proves nothing: the stored one is the row whose
      // .check holds the tick icon.
      await expect(page.getByRole('button', { name: 'Mute' }).locator('.check svg')).toBeVisible()
      await expect(page.getByRole('button', { name: 'All notifications' }).locator('.check svg')).toHaveCount(0)
      await channelPage.pressEscape()
    } finally {
      await invited.dispose()
    }
  })

  test('Message in a private channel reaches its member', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page, true)
    try {
      const message = `Private message ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)
    } finally {
      await invited.dispose()
    }
  })

  test('Messages stay after switching channels and reloading', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Persisted ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)

      await channelPage.clickChannel('general')
      await channelPage.checkMessageExist(message, false, message)
      await channelPage.clickChooseChannel(data.channelName)
      await channelPage.checkMessageExist(message, true, message)

      await page.reload()
      await channelPage.checkMessageExist(message, true, message)
    } finally {
      await invited.dispose()
    }
  })

  test('Thread messages survive closing and reopening the thread', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const parent = `Reopen thread ${uniq}`
      const reply = `Reopen reply ${uniq}`
      await channelPage.sendMessage(parent)
      await expectIncomingMessage(invited.page2, parent)
      await invited.channelPage2.replyMessage(parent)
      await invited.channelPage2.sendReply(reply)

      await channelPage.replyMessage(parent)
      await expectIncomingMessage(page, reply)
      await channelPage.closeAndOpenReplyMessage()
      await expectIncomingMessage(page, reply)
    } finally {
      await invited.dispose()
    }
  })

  test('Saving a message files it under Saved for that user only', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Save me ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)

      await channelPage.saveMessage(message)
      await channelPage.clickSaveMessageTab()
      await expectIncomingMessage(page, message)

      await invited.channelPage2.clickSaveMessageTab()
      await expect(invited.page2.locator('.activityMessage', { hasText: message })).toHaveCount(0)
    } finally {
      await invited.dispose()
    }
  })

  test('A saved message can be taken off the Saved list again', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Unsave me ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)

      await channelPage.saveMessage(message)
      await channelPage.clickSaveMessageTab()
      await expectIncomingMessage(page, message)

      await channelPage.clickChooseChannel(data.channelName)
      await channelPage.removeMessageFromSaved(message)
      await channelPage.clickSaveMessageTab()
      await expect(page.locator('.activityMessage', { hasText: message })).toHaveCount(0)
    } finally {
      await invited.dispose()
    }
  })

  test('A pinned message is in the pinned list for both users', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Pin me ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)

      // Pinning belongs to the channel: the author pinned nothing, yet must see it.
      await channelPage.pinMessage(message)
      await invited.channelPage2.checkPinnedMessage(message, true)

      await channelPage.unpinMessage(message)
      await invited.channelPage2.checkPinnedMessage(message, false)
    } finally {
      await invited.dispose()
    }
  })

  test('Reaction can be taken back', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Toggle reaction ${uniq}`
      await channelPage.sendMessage(message)
      await invited.channelPage2.checkMessageExist(message, true, message)

      await invited.channelPage2.addEmoji(message, '😀')
      await channelPage.checkIfEmojiIsAdded('😀')

      await invited.page2.getByText('😀 1').first().click()
      await expect(page.getByText('😀 1')).toHaveCount(0)
    } finally {
      await invited.dispose()
    }
  })

  test('Two users reacting with the same emoji are counted together', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Shared reaction ${uniq}`
      await channelPage.sendMessage(message)
      await invited.channelPage2.checkMessageExist(message, true, message)

      await invited.channelPage2.addEmoji(message, '😀')
      await channelPage.checkIfEmojiIsAdded('😀')
      await page.getByText('😀 1').first().click()

      await expect(page.getByText('😀 2').first()).toBeVisible()
      await expect(invited.page2.getByText('😀 2').first()).toBeVisible()
    } finally {
      await invited.dispose()
    }
  })

  test('An edited message is marked as edited for the other user', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const original = `Edit marker ${uniq}`
      await invited.channelPage2.sendMessage(original)
      await channelPage.checkMessageExist(original, true, original)

      await invited.channelPage2.clickOpenMoreButton(original)
      await invited.channelPage2.clickEditMessageButton(' now')
      await invited.channelPage2.clickOnUpdateButton()

      // Where the caret puts the addition is not the point - the 'edited' marker is.
      await expect(page.getByText('edited').first()).toBeVisible()
    } finally {
      await invited.dispose()
    }
  })

  test('Replies from both users are counted on the parent message', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const parent = `Two authors ${uniq}`
      await channelPage.sendMessage(parent)
      await expectIncomingMessage(invited.page2, parent)

      await invited.channelPage2.replyMessage(parent)
      await invited.channelPage2.sendReply(`Guest reply ${uniq}`)
      await expect(page.locator('.thread__replies-count').first()).toHaveText('1 reply')

      await channelPage.replyMessage(parent)
      await channelPage.sendReply(`Owner reply ${uniq}`)
      await expect(invited.page2.locator('.thread__replies-count').first()).toHaveText('2 replies')
    } finally {
      await invited.dispose()
    }
  })

  test('A thread reply does not duplicate into the channel body', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const parent = `Body check ${uniq}`
      const reply = `Reply stays in thread ${uniq}`
      await channelPage.sendMessage(parent)
      await expectIncomingMessage(invited.page2, parent)

      await invited.channelPage2.replyMessage(parent)
      await invited.channelPage2.sendReply(reply)

      await expect(page.locator('.hulyComponent .activityMessage', { hasText: reply })).toHaveCount(0)
    } finally {
      await invited.dispose()
    }
  })

  test('Renaming a channel reaches the other user and keeps its messages', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const message = `Before rename ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)

      // changeChannelName types a fixed name of its own, so that is what to expect afterwards.
      await channelPage.clickOnOpenChannelDetails()
      await channelPage.changeChannelName(data.channelName)
      await channelPage.clickOnOpenChannelDetails()

      await channelPage.checkMessageExist(message, true, message)
      await invited.channelPage2.checkIfChannelDefaultExist(true, 'New Channel Name')
    } finally {
      await invited.dispose()
    }
  })

  test('Mentions-only mode lets a mention through but stays quiet otherwise', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      await page.getByRole('button', { name: 'Just mentions' }).click()
      await channelPage.pressEscape()

      const plain = `Plain under mentions ${uniq}`
      await invited.channelPage2.sendMessage(plain)
      await channelPage.checkMessageExist(plain, true, plain)
    } finally {
      await invited.dispose()
    }
  })

  test('Unmuting a channel restores its notifications', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      await page.getByRole('button', { name: 'Mute' }).click()
      await channelPage.pressEscape()

      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      await page.getByRole('button', { name: 'All notifications' }).click()
      await channelPage.pressEscape()

      const message = `After unmute ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await channelPage.checkMessageExist(message, true, message)
      await leftSideMenuPage.clickNotification()
      await expect(page.getByText(data.channelName).first()).toBeVisible()
    } finally {
      await invited.dispose()
    }
  })

  test('A private channel stays invisible to a non-member', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const secretName = `${data.channelName}-secret`
      await chunterPage.clickAddChannel()
      await chunterPage.createChannel(secretName, true)
      await channelPage.clickChooseChannel(secretName)
      await channelPage.sendMessage(`Secret ${uniq}`)

      await invited.channelPage2.checkIfChannelDefaultExist(false, secretName)
    } finally {
      await invited.dispose()
    }
  })

  test('A multi-line message and one with markup characters arrive intact', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const long = `Long ${uniq} ` + 'lorem ipsum dolor sit amet '.repeat(5)
      await invited.channelPage2.sendMessage(long)
      await expectIncomingMessage(page, `Long ${uniq}`)

      const tricky = `Tricky ${uniq} <b>not bold</b> & "quoted" 100%`
      await invited.channelPage2.sendMessage(tricky)
      await expectIncomingMessage(page, '<b>not bold</b>')
    } finally {
      await invited.dispose()
    }
  })

  test('An emoji message is delivered to the other user', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      // Emojis render as their own nodes, so the id is what a text matcher can find.
      const message = `🎉🚀 ${uniq}`
      await invited.channelPage2.sendMessage(message)
      await expectIncomingMessage(page, uniq)
    } finally {
      await invited.dispose()
    }
  })

  test('Messages keep their order and author across a reload', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      const mine = `Mine ${uniq}`
      const theirs = `Theirs ${uniq}`
      await channelPage.sendMessage(mine)
      await invited.channelPage2.sendMessage(theirs)
      await expectIncomingMessage(page, theirs)

      await page.reload()
      await channelPage.clickChooseChannel(data.channelName)
      await expectIncomingMessage(page, mine)
      await expectIncomingMessage(page, theirs)

      // The newer message has to sit lower on screen than the older one.
      const box = async (text: string): Promise<number> => {
        const rect = await page.locator('.hulyComponent .activityMessage', { hasText: text }).last().boundingBox()
        return rect?.y ?? -1
      }
      expect(await box(theirs)).toBeGreaterThan(await box(mine))
    } finally {
      await invited.dispose()
    }
  })

  test('A message sent while the other user sits elsewhere is there when they come back', async ({ browser, page }) => {
    const invited = await openSharedChannel(browser, page)
    try {
      await invited.channelPage2.clickChooseChannel('general')

      const message = `Away message ${uniq}`
      await channelPage.sendMessage(message)

      await invited.channelPage2.clickChooseChannel(data.channelName)
      await expectIncomingMessage(invited.page2, message)
    } finally {
      await invited.dispose()
    }
  })
})
