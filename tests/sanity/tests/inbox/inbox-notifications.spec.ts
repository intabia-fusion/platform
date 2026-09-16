import { type Browser, type Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { ApiEndpoint } from '../API/Api'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { SignUpData } from '../model/common-types'
import { InboxPage } from '../model/inbox.ts/inbox-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { generateTestData, generateUser, getInviteLink, getSecondPageByInvite, loginByToken } from '../utils'

interface SecondUser {
  page2: Page
  channelPage2: ChannelPage
  chunterPage2: ChunterPage
  inboxPage2: InboxPage
  leftSideMenu2: LeftSideMenuPage
  dispose: () => Promise<void>
}

test.describe.configure({ mode: 'parallel' })

/**
 * Inbox behaviour driven by chat: what lands there, what the badges say, and what the clear/read
 * actions do. Every test carries its own id so the shared workspace cannot leak between them.
 */
test.describe('Inbox notification tests', () => {
  let leftSideMenuPage: LeftSideMenuPage
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let inboxPage: InboxPage
  let api: ApiEndpoint
  let newUser2: SignUpData
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }
  let uniq: string

  test.beforeEach(async ({ page, request, sharedWorkspace }, testInfo) => {
    // One seat per test: past the cap a guest silently drops to read-only.
    const shared = await sharedWorkspace(1)
    uniq = `${testInfo.testId}${testInfo.retry}`
    data = { ...shared.data, channelName: `${generateTestData().channelName}${uniq}` }
    newUser2 = generateUser()

    leftSideMenuPage = new LeftSideMenuPage(page)
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    inboxPage = new InboxPage(page)
    api = new ApiEndpoint(request)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  /** Invites a second user and adds them to the channel, so both sides can talk to each other. */
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

    // An open channel reads its messages on arrival, which would zero every badge below.
    await leftSideMenuPage.clickNotification()

    const leftSideMenu2 = new LeftSideMenuPage(page2)
    const channelPage2 = new ChannelPage(page2)
    await leftSideMenu2.clickChunter()
    await channelPage2.checkIfChannelDefaultExist(true, channelName)

    return {
      page2,
      channelPage2,
      chunterPage2: new ChunterPage(page2),
      inboxPage2: new InboxPage(page2),
      leftSideMenu2,
      dispose: async () => {
        await second.context.close()
      }
    }
  }

  test('Message from another user lands in inbox with an unread badge', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const message = `Inbox message ${uniq}`
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(message)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.checkUnreadMarker(data.channelName, 1)
      await inboxPage.checkCardPreview(data.channelName, 'Inbox message')
    } finally {
      await invited.dispose()
    }
  })

  test('Opening a channel from inbox clears its unread badge', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const message = `Read me ${uniq}`
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(message)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)
      await inboxPage.clickCard(data.channelName)
      await channelPage.checkMessageExist(message, true, message)
      await inboxPage.checkUnreadMarker(data.channelName, undefined)
    } finally {
      await invited.dispose()
    }
  })

  test('Several messages collapse into one card and the badge counts them', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      for (let i = 1; i <= 3; i++) {
        const message = `Batch ${i} ${uniq}`
        await invited.channelPage2.sendMessage(message)
        // The badge below counts these, so each one has to actually land before the next is sent.
        await invited.channelPage2.checkMessageExist(message, true, message)
      }

      await leftSideMenuPage.clickNotification()
      await expect(inboxPage.cardByTitle(data.channelName)).toHaveCount(1)
      await inboxPage.checkUnreadMarker(data.channelName, 3)
    } finally {
      await invited.dispose()
    }
  })

  test('Own messages do not produce an inbox card', async ({ page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const message = `Self message ${uniq}`
    await channelPage.sendMessage(message)
    await channelPage.checkMessageExist(message, true, message)

    await leftSideMenuPage.clickNotification()
    await inboxPage.checkCardExists(data.channelName, false)
  })

  test('Mark all as read clears every badge but keeps the cards', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Mark read ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)
      await inboxPage.markAllAsRead()
      await inboxPage.checkUnreadMarker(data.channelName, undefined)
      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Clear removes a single card from inbox', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Clear one ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.openCardMenu(data.channelName)
      await page.getByRole('button', { name: 'Clear' }).click()
      await inboxPage.checkCardExists(data.channelName, false)
    } finally {
      await invited.dispose()
    }
  })

  test('Checkbox on a card clears it from inbox', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Checkbox ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)
      await inboxPage.clearCardByCheckbox(data.channelName)
      await inboxPage.checkCardExists(data.channelName, false)
    } finally {
      await invited.dispose()
    }
  })

  test('Unreads filter hides read cards and shows them again when off', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Filter me ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      // Open it to read: the card's checkbox clears the card instead of marking it read.
      await inboxPage.clickCard(data.channelName)
      await inboxPage.checkUnreadMarker(data.channelName, undefined)
      await inboxPage.toggleUnreadsFilter()
      await inboxPage.checkCardExists(data.channelName, false)
      await inboxPage.toggleUnreadsFilter()
      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Channels tab keeps channels and drops direct messages', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Tab filter ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.selectTab('Channels')
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.selectTab('Direct messages')
      await inboxPage.checkCardExists(data.channelName, false)
      await inboxPage.selectTab('All')
      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('A message arriving while inbox is open shows up without a reload', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, false)

      const message = `Live ${uniq}`
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(message)

      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.checkUnreadMarker(data.channelName, 1)
    } finally {
      await invited.dispose()
    }
  })

  test('Reply in a thread creates its own inbox card', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const parent = `Thread parent ${uniq}`
    await channelPage.sendMessage(parent)

    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const reply = `Thread reply ${uniq}`
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.replyMessage(parent)
      await invited.channelPage2.sendReply(reply)

      await leftSideMenuPage.clickNotification()
      // A thread is its own context: a second card of the same channel, told apart by its parent.
      await inboxPage.checkThreadCard(data.channelName, parent, 'Thread reply')
    } finally {
      await invited.dispose()
    }
  })

  test('Clear all empties the inbox and new messages refill it', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Before clear ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.clearAll()
      await inboxPage.checkCardExists(data.channelName, false)

      await invited.channelPage2.sendMessage(`After clear ${uniq}`)
      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Mark as read from the card menu keeps the card and clears the badge', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Menu read ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)
      await inboxPage.selectCardMenuAction(data.channelName, 'Mark as read')

      await inboxPage.checkUnreadMarker(data.channelName, undefined)
      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Mark as read disappears from the menu once the card is read', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Menu gating ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)
      await inboxPage.checkCardMenuHasAction(data.channelName, 'Mark as read', true)

      await inboxPage.selectCardMenuAction(data.channelName, 'Mark as read')
      await inboxPage.checkUnreadMarker(data.channelName, undefined)
      // The action carries a visibilityTester, so a read context must not offer it any more.
      await inboxPage.checkCardMenuHasAction(data.channelName, 'Mark as read', false)
    } finally {
      await invited.dispose()
    }
  })

  test('Clear from the card menu removes only that card', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Menu clear ${uniq}`)
      // The AI bot greets every new account, so there is always a second card to outlive this one.
      await invited.channelPage2.clickChannel('general')
      await invited.channelPage2.sendMessage(`General noise ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.checkCardExists('general', true)

      await inboxPage.selectCardMenuAction(data.channelName, 'Clear')
      await inboxPage.checkCardExists(data.channelName, false)
      await inboxPage.checkCardExists('general', true)
    } finally {
      await invited.dispose()
    }
  })

  test('Unsubscribe asks for confirmation naming the channel', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Unsub ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.selectCardMenuAction(data.channelName, 'Unsubscribe')

      // The heading is truncated on screen, so assert on the body, which spells the name out.
      await expect(page.locator('.antiCard, .msgbox-container').getByText('Leave #')).toBeVisible()
      await expect(page.getByText(`You will be removed from the members of #${data.channelName}`)).toBeVisible()
    } finally {
      await invited.dispose()
    }
  })

  test('Cancelling the unsubscribe confirmation keeps the card', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Unsub cancel ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.selectCardMenuAction(data.channelName, 'Unsubscribe')
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()

      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Unsubscribing from a channel removes it from the navigator', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Unsub confirm ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.selectCardMenuAction(data.channelName, 'Unsubscribe')
      await page.getByRole('button', { name: 'Ok' }).click()

      // What happens to the inbox card is not settled, so assert only the navigator.
      await leftSideMenuPage.clickChunter()
      await channelPage.checkIfChannelDefaultExist(false, data.channelName)
    } finally {
      await invited.dispose()
    }
  })

  test('The newest notification puts its card on top', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Ordering first ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)

      await invited.channelPage2.clickChannel('general')
      await invited.channelPage2.sendMessage(`Ordering second ${uniq}`)
      await inboxPage.checkCardPosition('general', 0)
    } finally {
      await invited.dispose()
    }
  })

  test('A direct message lands in inbox and shows under Direct messages', async ({ browser, page }) => {
    // The invite helper hands the guest a channel to land in; the DM itself is what is tested.
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const dmText = `Direct hello ${uniq}`
      await invited.chunterPage2.createDirectChat(data as unknown as SignUpData)
      await invited.channelPage2.sendMessage(dmText)

      // The card is titled by whoever wrote, so the owner sees the guest's name on it.
      const dmTitle = `${newUser2.lastName} ${newUser2.firstName}`
      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(dmTitle, true)
      await inboxPage.checkUnreadMarker(dmTitle, 1)
      await inboxPage.checkCardPreview(dmTitle, 'Direct hel')

      await inboxPage.selectTab('Direct messages')
      await inboxPage.checkCardExists(dmTitle, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Unreads filter survives a reload', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Filter persists ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.clickCard(data.channelName)
      await inboxPage.checkUnreadMarker(data.channelName, undefined)
      await inboxPage.toggleUnreadsFilter()
      await inboxPage.checkCardExists(data.channelName, false)

      // The setting is kept in localStorage, so it has to outlive the page.
      await page.reload()
      await inboxPage.checkCardExists(data.channelName, false)
      await inboxPage.toggleUnreadsFilter()
      await inboxPage.checkCardExists(data.channelName, true)
    } finally {
      await invited.dispose()
    }
  })

  test('Badge counts every message of a burst and survives a reload', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      for (let i = 1; i <= 3; i++) {
        const message = `Counted-${i} ${uniq}`
        await invited.channelPage2.sendMessage(message)
        // sendMessage only clicks Send, so wait for each to land before sending the next.
        await invited.channelPage2.checkMessageExist(message, true, message)
      }

      await inboxPage.checkUnreadMarker(data.channelName, 3)

      await page.reload()
      await inboxPage.checkUnreadMarker(data.channelName, 3)
    } finally {
      await invited.dispose()
    }
  })

  test('Reading a channel in one tab clears its badge for the inbox', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(`Read elsewhere ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)

      // Read it through chat instead of the inbox: the context is shared, so the badge must follow.
      await leftSideMenuPage.clickChunter()
      await channelPage.clickChooseChannel(data.channelName)
      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, undefined)
    } finally {
      await invited.dispose()
    }
  })

  test('A muted channel keeps its messages out of inbox but still delivers them', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      // The invite helper parks the owner in the inbox; the channel menu lives in chunter.
      await leftSideMenuPage.clickChunter()
      await channelPage.openChannelSubmenuInMenu(data.channelName, 'Edit notifications')
      await page.getByRole('button', { name: 'Mute' }).click()
      await channelPage.pressEscape()

      const message = `Muted inbox ${uniq}`
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(message)

      // Muting suppresses the notification, so no card is filed - the message still arrives.
      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, false)

      await leftSideMenuPage.clickChunter()
      await channelPage.clickChooseChannel(data.channelName)
      await channelPage.checkMessageExist(message, true, message)
    } finally {
      await invited.dispose()
    }
  })

  test('Deleting the message behind a card takes its badge back', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const message = `Deleted source ${uniq}`
      await invited.channelPage2.clickChooseChannel(data.channelName)
      await invited.channelPage2.sendMessage(message)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)

      await invited.channelPage2.clickOpenMoreButton(message)
      await invited.channelPage2.clickDeleteMessageButton()
      await invited.channelPage2.clickDeleteMessageConfirmationButton()

      await inboxPage.checkUnreadMarker(data.channelName, undefined)
    } finally {
      await invited.dispose()
    }
  })

  test('A mention raises a card even in a channel set to mentions only', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      // The invite helper parks the owner in the inbox, so go back to chunter to write.
      await leftSideMenuPage.clickChunter()
      await channelPage.clickChooseChannel(data.channelName)
      const mentionOf = newUser2.lastName + ' ' + newUser2.firstName
      await channelPage.sendMention(mentionOf, 'EMPLOYEES')

      await invited.leftSideMenu2.clickNotification()
      await invited.inboxPage2.checkCardExists(data.channelName, true)
      // Joining can leave a system entry too, so the exact count is not ours to pin down.
      await invited.inboxPage2.checkCardPreview(data.channelName, mentionOf)
    } finally {
      await invited.dispose()
    }
  })

  test('Inbox stays empty for a channel the user was never added to', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const privateName = `${data.channelName}-solo`
      // The invite helper parks the owner in the inbox, and channels are created from chunter.
      await leftSideMenuPage.clickChunter()
      await chunterPage.clickAddChannel()
      await chunterPage.createChannel(privateName, true)
      await channelPage.clickChooseChannel(privateName)
      await channelPage.sendMessage(`Not for you ${uniq}`)

      await invited.leftSideMenu2.clickNotification()
      await invited.inboxPage2.checkCardExists(privateName, false)
    } finally {
      await invited.dispose()
    }
  })
})
