import { type Browser, type Page } from '@playwright/test'
import { type Doc, type Ref } from '@hcengineering/core'
import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace, openMemberPage } from '../API/ChatApi'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { SignUpData } from '../model/common-types'
import { InboxPage } from '../model/inbox.ts/inbox-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { generateTestData, generateUser, loginByToken } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

interface SecondUserUi {
  page2: Page
  channelPage2: ChannelPage
  chunterPage2: ChunterPage
  inboxPage2: InboxPage
  leftSideMenu2: LeftSideMenuPage
}

/**
 * The other side of the conversation. It talks over REST: what these tests look at is the inbox of
 * the first user. The few that need the second user's own screen open a browser for it with `ui()`.
 */
interface SecondUser {
  // The first user over REST.
  owner: ChatMember
  member: ChatMember
  channel: Channel
  /** A message to the shared channel, or to another channel of the workspace by its name. */
  send: (text: string, channelName?: string) => Promise<Ref<Doc>>
  ui: () => Promise<SecondUserUi>
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
  let shared: SharedWorkspace
  let newUser2: SignUpData
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }
  let uniq: string

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // One seat per test: past the cap a guest silently drops to read-only.
    shared = await sharedWorkspace(1)
    uniq = `${testInfo.testId}${testInfo.retry}`
    data = { ...shared.data, channelName: `${generateTestData().channelName}${uniq}` }
    newUser2 = generateUser()

    leftSideMenuPage = new LeftSideMenuPage(page)
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    inboxPage = new InboxPage(page)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  /**
   * Brings a second user into the workspace and the channel over the API: the invite link, the join
   * page and the "Add members" popup are not what these tests are about, and a member whose first
   * login has to create its own employee can be refused the write.
   */
  async function inviteSecondUser (browser: Browser, page: Page, channelName: string): Promise<SecondUser> {
    await channelPage.checkIfChannelDefaultExist(true, channelName)
    const owner = await connectOwner(shared.ws, `${data.lastName} ${data.firstName}`)
    const member = await joinWorkspace(shared.ws, newUser2)
    const channel = await owner.findChannel(channelName)
    await owner.addMember(channel, member.account)

    // An open channel reads its messages on arrival, which would zero every badge below.
    await leftSideMenuPage.clickNotification()

    let opened: Awaited<ReturnType<typeof openMemberPage>> | undefined
    return {
      owner,
      member,
      channel,
      send: async (text, name) =>
        await member.sendMessage(name !== undefined ? await member.findChannel(name) : channel, text),
      ui: async () => {
        opened ??= await openMemberPage(browser, member, 'chunter')
        const page2 = opened.page
        const channelPage2 = new ChannelPage(page2)
        await channelPage2.checkIfChannelDefaultExist(true, channelName)
        return {
          page2,
          channelPage2,
          chunterPage2: new ChunterPage(page2),
          inboxPage2: new InboxPage(page2),
          leftSideMenu2: new LeftSideMenuPage(page2)
        }
      },
      dispose: async () => {
        await opened?.context.close()
      }
    }
  }

  test('Message from another user lands in inbox with an unread badge', async ({ browser, page }) => {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(data.channelName, false)
    const invited = await inviteSecondUser(browser, page, data.channelName)
    try {
      const message = `Inbox message ${uniq}`
      await invited.send(message)

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
      await invited.send(message)

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
      for (let i = 1; i <= 3; i++) {
        await invited.send(`Batch ${i} ${uniq}`)
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
      await invited.send(`Mark read ${uniq}`)

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
      await invited.send(`Clear one ${uniq}`)

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
      await invited.send(`Checkbox ${uniq}`)

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
      await invited.send(`Filter me ${uniq}`)

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
      // A tab exists only for a class that has cards, so the direct message is sent here and not
      // left to the bot greeting, which may not have arrived yet.
      const ui = await invited.ui()
      await ui.chunterPage2.createDirectChat(data as unknown as SignUpData)
      await ui.channelPage2.sendMessage(`Tab filter direct ${uniq}`)
      const dmTitle = `${newUser2.lastName} ${newUser2.firstName}`
      await invited.send(`Tab filter ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.checkCardExists(dmTitle, true)
      await inboxPage.selectTab('Channels')
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.checkCardExists(dmTitle, false)
      await inboxPage.selectTab('Direct messages')
      await inboxPage.checkCardExists(dmTitle, true)
      await inboxPage.checkCardExists(data.channelName, false)
      await inboxPage.selectTab('All')
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.checkCardExists(dmTitle, true)
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
      await invited.send(message)

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
      const parentId = await invited.member.findMessage(invited.channel, parent)
      await invited.member.reply(invited.channel, parentId, reply)

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
      await invited.send(`Before clear ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)
      await inboxPage.clearAll()
      await inboxPage.checkCardExists(data.channelName, false)

      await invited.send(`After clear ${uniq}`)
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
      await invited.send(`Menu read ${uniq}`)

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
      await invited.send(`Menu gating ${uniq}`)

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
      await invited.send(`Menu clear ${uniq}`)
      // The AI bot greets every new account, so there is always a second card to outlive this one.
      await invited.send(`General noise ${uniq}`, 'general')

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
      await invited.send(`Unsub ${uniq}`)

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
      await invited.send(`Unsub cancel ${uniq}`)

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
      await invited.send(`Unsub confirm ${uniq}`)

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
      await invited.send(`Ordering first ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkCardExists(data.channelName, true)

      await invited.send(`Ordering second ${uniq}`, 'general')
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
      // A direct chat is opened from the second user's own screen.
      const ui = await invited.ui()
      await ui.chunterPage2.createDirectChat(data as unknown as SignUpData)
      await ui.channelPage2.sendMessage(dmText)

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
      await invited.send(`Filter persists ${uniq}`)

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
      for (let i = 1; i <= 3; i++) {
        await invited.send(`Counted-${i} ${uniq}`)
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
      const message = `Read elsewhere ${uniq}`
      await invited.send(message)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)

      // Read it through chat instead of the inbox: the context is shared, so the badge must follow.
      await leftSideMenuPage.clickChunter()
      await channelPage.clickChooseChannel(data.channelName)
      // A message is read once the channel has settled on it: the text is in the DOM before that,
      // and leaving then reads nothing. The counter in the navigator goes when the channel does.
      await channelPage.checkMessageExist(message, true, message)
      await expect(
        channelPage.channelContainers().filter({ hasText: data.channelName }).locator('.notifyMarker')
      ).toHaveCount(0)
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
      await invited.send(message)

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
      const messageId = await invited.send(`Deleted source ${uniq}`)

      await leftSideMenuPage.clickNotification()
      await inboxPage.checkUnreadMarker(data.channelName, 1)

      await invited.member.removeMessage(invited.channel, messageId)

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
      await invited.owner.waitUntilSearchable(mentionOf)
      await channelPage.sendMention(mentionOf, 'EMPLOYEES')

      const ui = await invited.ui()
      await ui.leftSideMenu2.clickNotification()
      await ui.inboxPage2.checkCardExists(data.channelName, true)
      // Joining can leave a system entry too, so the exact count is not ours to pin down.
      await ui.inboxPage2.checkCardPreview(data.channelName, mentionOf)
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

      const ui = await invited.ui()
      await ui.leftSideMenu2.clickNotification()
      await ui.inboxPage2.checkCardExists(privateName, false)
    } finally {
      await invited.dispose()
    }
  })
})
