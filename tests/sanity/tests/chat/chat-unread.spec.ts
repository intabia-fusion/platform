import { type Page } from '@playwright/test'
import { type Doc, type Ref } from '@hcengineering/core'
import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import { ChannelPage } from '../model/channel-page'
import { ChatUnreadPage } from '../model/chat-unread-page'
import { ChunterPage } from '../model/chunter-page'
import { InboxPage } from '../model/inbox.ts/inbox-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { generateTestData, generateUser, loginByToken, PlatformURI } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

// Sections of the chat navigator: wrapped groups are named after the class they list.
const channelsSection = 'chunter:class:Channel'

interface Chat {
  channel: Channel
  // The user of the browser, over REST: own messages and own notification settings.
  me: ChatMember
  // Everybody else: a second member that only exists over REST.
  other: ChatMember
}

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()

/**
 * Unread state of the chat as the user sees it: application markers, navigator counters, the "New"
 * separator and where a channel opens. The other user talks over REST, so a test can afford dozens
 * of messages and no second browser.
 */
test.describe('Chat unread state tests', () => {
  let leftSideMenuPage: LeftSideMenuPage
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let inboxPage: InboxPage
  let unread: ChatUnreadPage
  let shared: SharedWorkspace
  let channelName: string
  let uniq: string

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // The REST member takes a seat like an invited one, once per workspace.
    shared = await sharedWorkspace(0)
    if (!others.has(shared.ws.workspace)) {
      shared = await sharedWorkspace(1)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
    channelName = `${generateTestData().channelName}${uniq}`

    leftSideMenuPage = new LeftSideMenuPage(page)
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    inboxPage = new InboxPage(page)
    unread = new ChatUnreadPage(page)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  /** A fresh public channel with both users in it; the browser is left in another channel. */
  async function createChat (): Promise<Chat> {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(channelName, false)
    await channelPage.checkIfChannelDefaultExist(true, channelName)

    const me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    const channel = await me.findChannel(channelName)
    await me.addMember(channel, other.account)

    // A first message read on arrival gives the user a read position in the channel: the "New"
    // separator is only drawn for somebody who has read the channel before.
    const greeting = `Hi ${uniq}`
    await other.sendMessage(channel, greeting)
    await channelPage.checkMessageExist(greeting, true, greeting)

    // An open channel reads its messages on arrival, which would zero every counter below.
    await leaveChannel()
    await settle(me)
    return { channel, me, other }
  }

  /**
   * What is unread before the scenario starts is read over REST: a fresh workspace greets its
   * owner in `general`, `random` and a bot chat, every member joining adds a system message, and the
   * tests that ran in this workspace before left their own. Best effort: more can arrive at any
   * moment, so the assertions that depend on the rest of the workspace read it again themselves.
   * Nothing here is muted or otherwise kept: the workspace goes on to the next spec of the worker.
   */
  async function settle (me: ChatMember): Promise<void> {
    await me.readEverything()
  }

  /**
   * The application markers are off. They are global, and the bot greeting of a fresh workspace
   * arrives whenever the bot gets to it: everything outside the channels under test is read over
   * REST first, so only the UI can have cleared what the test is about.
   */
  async function checkMarkersOff (
    chat: Chat,
    markers: Array<'chat' | 'inbox'>,
    channels = [chat.channel]
  ): Promise<void> {
    const except = channels.map((it) => it._id)
    await expect(async () => {
      await chat.me.readEverything(except)
      for (const marker of markers) {
        const locator = marker === 'chat' ? unread.chatAppMarker() : unread.inboxAppMarker()
        await expect(locator).toHaveCount(0, { timeout: 1000 })
      }
    }).toPass({ timeout: 3000 })
  }

  /**
   * The counter of a collapsed section. It sums every channel of the section, `general` and
   * `random` included, so whatever is unread outside the channels under test is read first.
   */
  async function checkSectionCounter (
    chat: Chat,
    id: string,
    count: number | undefined,
    channels = [chat.channel]
  ): Promise<void> {
    const except = channels.map((it) => it._id)
    await expect(async () => {
      await chat.me.readEverything(except)
      await unread.checkSectionCounter(id, count, 1000)
    }).toPass({ timeout: 3000 })
  }

  async function leaveChannel (): Promise<void> {
    await channelPage.clickChooseChannel('random')
    await expect(unread.navItem(channelName)).toBeVisible()
  }

  async function openChannel (): Promise<void> {
    await channelPage.clickChooseChannel(channelName)
  }

  /**
   * Reading is debounced by half a second, and a test leaves a channel faster than a person can:
   * the read has to land before the channel is left, or the messages stay unread.
   */
  async function waitUntilRead (chat: Chat): Promise<void> {
    await expect.poll(async () => await chat.me.hasReadChannel(chat.channel), { timeout: 15000 }).toBe(true)
  }

  async function sendMany (chat: Chat, count: number, prefix: string): Promise<string[]> {
    const texts: string[] = []
    for (let i = 1; i <= count; i++) {
      const text = `${prefix} ${i} ${uniq}`
      await chat.other.sendMessage(chat.channel, text)
      texts.push(text)
    }
    return texts
  }

  function channelUrl (chat: Chat, message?: Ref<Doc>): string {
    const id = encodeURIComponent(`${chat.channel._id}|${chat.channel._class}`)
    const query = message !== undefined ? `?message=${message}` : ''
    return `${PlatformURI}/workbench/${shared.ws.workspaceUrl}/chunter/${id}${query}`
  }

  // ---- Counters and application markers ----

  test('Message in a closed channel raises the counter and both application markers', async () => {
    const chat = await createChat()
    await unread.checkNavCounter(channelName, undefined)
    await checkMarkersOff(chat, ['chat'])

    await chat.other.sendMessage(chat.channel, `Hello ${uniq}`)

    await unread.checkNavCounter(channelName, 1, 'red')
    await unread.checkChatAppMarker(true)
    await unread.checkInboxAppMarker(true)
  })

  test('Opening the channel clears the counter and both application markers', async () => {
    const chat = await createChat()
    const text = `Read me ${uniq}`
    await chat.other.sendMessage(chat.channel, text)
    await unread.checkNavCounter(channelName, 1, 'red')

    await openChannel()
    await channelPage.checkMessageExist(text, true, text)

    await unread.checkNavCounter(channelName, undefined)
    await checkMarkersOff(chat, ['chat', 'inbox'])
  })

  test('Counter counts a burst of messages and survives a reload', async ({ page }) => {
    const chat = await createChat()
    await sendMany(chat, 5, 'Burst')
    await unread.checkNavCounter(channelName, 5, 'red')

    await page.reload()
    await unread.checkNavCounter(channelName, 5, 'red')
    await unread.checkChatAppMarker(true)
  })

  test('Message arriving in the open channel is read at once, without a counter', async () => {
    const chat = await createChat()
    await openChannel()
    await expect(channelPage.inputMessage()).toBeVisible()

    const text = `Live ${uniq}`
    await chat.other.sendMessage(chat.channel, text)
    await channelPage.checkMessageExist(text, true, text)

    await unread.checkNavCounterStaysAway(channelName)
    await checkMarkersOff(chat, ['chat', 'inbox'])

    // Read for real, not only hidden while the channel is open.
    await waitUntilRead(chat)
    await leaveChannel()
    await unread.checkNavCounter(channelName, undefined)
  })

  test('Own messages raise nothing', async () => {
    const chat = await createChat()
    await chat.me.sendMessage(chat.channel, `Mine ${uniq}`)
    // Something of the other user to wait on: the own message must not have counted by then.
    await chat.other.sendMessage(chat.channel, `Theirs ${uniq}`)

    await unread.checkNavCounter(channelName, 1, 'red')
  })

  test('Deleting an unread message takes it off the counter and the markers', async () => {
    const chat = await createChat()
    const first = await chat.other.sendMessage(chat.channel, `First ${uniq}`)
    const second = await chat.other.sendMessage(chat.channel, `Second ${uniq}`)
    await unread.checkNavCounter(channelName, 2, 'red')

    await chat.other.removeMessage(chat.channel, second)
    await unread.checkNavCounter(channelName, 1, 'red')

    await chat.other.removeMessage(chat.channel, first)
    await unread.checkNavCounter(channelName, undefined)
    await checkMarkersOff(chat, ['chat', 'inbox'])
  })

  test('Editing an unread message does not count it twice', async () => {
    const chat = await createChat()
    const message = await chat.other.sendMessage(chat.channel, `Draft ${uniq}`)
    await unread.checkNavCounter(channelName, 1, 'red')

    const edited = `Edited ${uniq}`
    await chat.other.editMessage(chat.channel, message, edited)

    await leftSideMenuPage.clickNotification()
    await inboxPage.checkCardPreview(channelName, 'Edited')
    await inboxPage.checkUnreadMarker(channelName, 1)
    await leftSideMenuPage.clickChunter()
    await unread.checkNavCounter(channelName, 1, 'red')
  })

  test('Reading a channel from inbox clears its counter in the chat', async () => {
    const chat = await createChat()
    const text = `From inbox ${uniq}`
    await chat.other.sendMessage(chat.channel, text)
    await unread.checkNavCounter(channelName, 1, 'red')

    await leftSideMenuPage.clickNotification()
    await inboxPage.clickCard(channelName)
    await channelPage.checkMessageExist(text, true, text)
    await inboxPage.checkUnreadMarker(channelName, undefined)

    await leftSideMenuPage.clickChunter()
    await unread.checkNavCounter(channelName, undefined)
    await checkMarkersOff(chat, ['chat'])
  })

  // ---- Several channels ----

  test('Chat marker stays until the last unread channel is read', async () => {
    const chat = await createChat()
    const secondName = `Second${uniq}`
    const second = await chat.me.createChannel(secondName, [chat.other.account])
    await expect(unread.navItem(secondName)).toBeVisible()

    const first = `First ${uniq}`
    await chat.other.sendMessage(chat.channel, first)
    await chat.other.sendMessage(second, `Second ${uniq}`)
    await unread.checkNavCounter(channelName, 1, 'red')
    await unread.checkNavCounter(secondName, 1, 'red')

    await openChannel()
    await channelPage.checkMessageExist(first, true, first)
    await unread.checkNavCounter(channelName, undefined)
    await unread.checkChatAppMarker(true)

    await channelPage.clickChooseChannel(secondName)
    await channelPage.checkMessageExist(`Second ${uniq}`, true, `Second ${uniq}`)
    await unread.checkNavCounter(secondName, undefined)
    await checkMarkersOff(chat, ['chat', 'inbox'], [chat.channel, second])
  })

  test('Collapsed Channels section shows the unread total of its channels', async () => {
    const chat = await createChat()
    const secondName = `Second${uniq}`
    const second = await chat.me.createChannel(secondName, [chat.other.account])
    await expect(unread.navItem(secondName)).toBeVisible()

    await sendMany(chat, 2, 'One')
    for (let i = 1; i <= 3; i++) await chat.other.sendMessage(second, `Two ${i} ${uniq}`)
    await unread.checkNavCounter(channelName, 2, 'red')
    await unread.checkNavCounter(secondName, 3, 'red')

    await unread.collapseSection(channelsSection)
    await checkSectionCounter(chat, channelsSection, 5, [chat.channel, second])
  })

  test('Starred channel is counted in its own section, not in Channels', async () => {
    const chat = await createChat()
    await channelPage.makeActionWithChannelInMenu(channelName, 'Star')
    await expect(unread.section('starred')).toContainText(channelName)

    await sendMany(chat, 2, 'Starred')
    await unread.checkNavCounter(channelName, 2, 'red')

    await unread.collapseSection(channelsSection)
    await checkSectionCounter(chat, channelsSection, undefined)
    await unread.collapseSection('starred')
    await checkSectionCounter(chat, 'starred', 2)
  })

  // ---- Notification modes ----

  test('Mentions-only channel: a plain message counts gray and lights no marker', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mentions')

    await chat.other.sendMessage(chat.channel, `Quiet ${uniq}`)

    await unread.checkNavCounter(channelName, 1, 'gray')
    await checkMarkersOff(chat, ['chat', 'inbox'])

    // The card is there since the greeting; the quiet message neither marks it nor shows in it.
    await leftSideMenuPage.clickNotification()
    await inboxPage.checkCardExists(channelName, true)
    await inboxPage.checkCardPreview(channelName, 'Hi')
    await inboxPage.checkUnreadMarker(channelName, undefined)
    await expect(inboxPage.cardByTitle(channelName)).not.toContainText('Quiet')
  })

  test('Mentions-only channel: a reaction reaches the inbox but not the chat marker', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mentions')
    const mine = await chat.me.sendMessage(chat.channel, `Mine ${uniq}`)

    await chat.other.sendMessage(chat.channel, `Quiet ${uniq}`)
    await chat.other.react(chat.channel, mine, '👍')

    await unread.checkInboxAppMarker(true)
    await unread.checkNavCounter(channelName, 1, 'gray')
    await checkMarkersOff(chat, ['chat'])
  })

  test('Mentions-only channel: a mention turns the counter red and lights the chat marker', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mentions')
    const person = await chat.other.findPerson(chat.me.account)

    await chat.other.sendMessage(chat.channel, `Quiet ${uniq}`)
    await unread.checkNavCounter(channelName, 1, 'gray')

    await chat.other.sendMention(chat.channel, person, `look ${uniq}`)

    await unread.checkNavCounter(channelName, 2, 'red')
    await unread.checkChatAppMarker(true)
    await unread.checkInboxAppMarker(true)

    await leftSideMenuPage.clickNotification()
    await inboxPage.checkCardExists(channelName, true)
    await inboxPage.checkUnreadMarker(channelName, 1)
  })

  test('Mentions-only channel: removing the mention turns the counter gray again', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mentions')
    const person = await chat.other.findPerson(chat.me.account)

    await chat.other.sendMessage(chat.channel, `Quiet ${uniq}`)
    const mention = await chat.other.sendMention(chat.channel, person, `look ${uniq}`)
    await unread.checkNavCounter(channelName, 2, 'red')

    await chat.other.removeMessage(chat.channel, mention)

    await unread.checkNavCounter(channelName, 1, 'gray')
    await checkMarkersOff(chat, ['chat', 'inbox'])
  })

  test('Muted channel: messages count gray and light no marker', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mute')

    await sendMany(chat, 3, 'Muted')

    await unread.checkNavCounter(channelName, 3, 'gray')
    await checkMarkersOff(chat, ['chat', 'inbox'])
  })

  test('Muted channel still delivers a reaction to the inbox', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mute')
    const mine = await chat.me.sendMessage(chat.channel, `Mine ${uniq}`)

    await chat.other.react(chat.channel, mine, '👍')

    await unread.checkInboxAppMarker(true)
    await checkMarkersOff(chat, ['chat'])
    await leftSideMenuPage.clickNotification()
    await inboxPage.checkCardExists(channelName, true)
  })

  test('Back to all notifications: the next message counts red again', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mentions')
    await chat.other.sendMessage(chat.channel, `Quiet ${uniq}`)
    await unread.checkNavCounter(channelName, 1, 'gray')

    await chat.me.setNotificationMode(chat.channel, 'all')
    await chat.other.sendMessage(chat.channel, `Loud ${uniq}`)

    await unread.checkNavCounter(channelName, 2, 'red')
    await unread.checkChatAppMarker(true)
  })

  test('Opening a mentions-only channel reads the messages that raised no notification', async () => {
    const chat = await createChat()
    await chat.me.setNotificationMode(chat.channel, 'mentions')
    const text = `Quiet ${uniq}`
    await chat.other.sendMessage(chat.channel, text)
    await unread.checkNavCounter(channelName, 1, 'gray')

    await openChannel()
    await channelPage.checkMessageExist(text, true, text)
    await waitUntilRead(chat)
    await leaveChannel()

    await unread.checkNavCounter(channelName, undefined)
  })

  // ---- Reactions ----

  test('Reaction lights the inbox marker only, and removing it clears the marker', async () => {
    const chat = await createChat()
    const mine = await chat.me.sendMessage(chat.channel, `Mine ${uniq}`)

    const reaction = await chat.other.react(chat.channel, mine, '👍')
    await unread.checkInboxAppMarker(true)
    await checkMarkersOff(chat, ['chat'])
    await unread.checkNavCounter(channelName, undefined)

    await chat.other.removeReaction(chat.channel, mine, reaction)
    await checkMarkersOff(chat, ['inbox'])
  })

  // ---- "New" separator and where the channel opens ----

  test('Channel with unread messages opens at the "New" separator', async () => {
    const chat = await createChat()
    const read = `Already read ${uniq}`
    await chat.me.sendMessage(chat.channel, read)
    const [first, , last] = await sendMany(chat, 3, 'Fresh')
    await unread.checkNavCounter(channelName, 3, 'red')

    await openChannel()

    await unread.checkNewSeparatorBetween(read, first)
    await unread.checkInViewport(last)
    await unread.checkNavCounter(channelName, undefined)
  })

  test('The "New" separator is gone when a read channel is opened again', async () => {
    const chat = await createChat()
    const [first] = await sendMany(chat, 2, 'Fresh')
    await openChannel()
    await unread.checkNewSeparatorBetween(undefined, first)
    await waitUntilRead(chat)

    await leaveChannel()
    await openChannel()

    await channelPage.checkMessageExist(first, true, first)
    await unread.checkNewSeparator(false)
  })

  test('Long unread history opens at the first unread message, not at the end', async () => {
    const chat = await createChat()
    const read = `Already read ${uniq}`
    await chat.me.sendMessage(chat.channel, read)
    const texts = await sendMany(chat, 60, 'Long')
    await unread.checkNavCounter(channelName, 60, 'red')

    await openChannel()

    await unread.checkNewSeparatorBetween(read, texts[0])
    await unread.checkInViewport(texts[0])
    await expect(unread.message(texts[59])).not.toBeInViewport()
  })

  test('"Latest messages" jumps to the end and reads the channel', async () => {
    const chat = await createChat()
    const texts = await sendMany(chat, 60, 'Long')
    await openChannel()
    await unread.checkInViewport(texts[0])

    await unread.latestMessagesButton().click()

    await unread.checkInViewport(texts[59])
    await expect(unread.latestMessagesButton()).toHaveCount(0)
    await waitUntilRead(chat)
    await leaveChannel()
    await unread.checkNavCounter(channelName, undefined)
    await checkMarkersOff(chat, ['chat'])
  })

  test('Channel visited through a link to an old message opens from its end next time', async ({ page }) => {
    const chat = await createChat()
    const old = await chat.other.sendMessage(chat.channel, `Old ${uniq}`)
    const texts = await sendMany(chat, 70, 'Tail')
    // Everything is read: the next open has no unread message to anchor to.
    await openChannel()
    await unread.latestMessagesButton().click()
    await unread.checkInViewport(texts[69])
    await waitUntilRead(chat)
    await leaveChannel()
    await unread.checkNavCounter(channelName, undefined)

    // A window from the middle of the history, as an inbox link or a search hit leaves it.
    await page.goto(channelUrl(chat, old))
    await unread.checkInViewport(`Old ${uniq}`)
    await expect(unread.latestMessagesButton()).toBeVisible()

    await leaveChannel()
    await openChannel()

    await unread.checkInViewport(texts[69])
    await expect(unread.latestMessagesButton()).toHaveCount(0)
    await unread.checkNewSeparator(false)
  })

  test('Message arriving while an old part of the channel is on screen stays unread', async ({ page }) => {
    const chat = await createChat()
    const old = await chat.other.sendMessage(chat.channel, `Old ${uniq}`)
    const texts = await sendMany(chat, 70, 'Tail')
    await openChannel()
    await unread.latestMessagesButton().click()
    await unread.checkInViewport(texts[69])
    await waitUntilRead(chat)
    await leaveChannel()

    await page.goto(channelUrl(chat, old))
    await unread.checkInViewport(`Old ${uniq}`)

    // The bottom of this window is not the end of the chat: nothing here may read the new message.
    await chat.other.sendMessage(chat.channel, `Unseen ${uniq}`)
    await unread.checkNavCounter(channelName, 1, 'red')
    await unread.checkChatAppMarker(true)
  })

  // ---- Threads ----

  test('Reply to my message raises the Threads counter and the chat marker', async () => {
    const chat = await createChat()
    const mine = await chat.me.sendMessage(chat.channel, `Parent ${uniq}`)

    await chat.other.reply(chat.channel, mine, `Reply ${uniq}`)

    await unread.checkNavCounter('Threads', 1)
    await unread.checkChatAppMarker(true)
    await unread.checkInboxAppMarker(true)
    // The reply belongs to the thread, not to the channel.
    await unread.checkNavCounter(channelName, undefined)
  })

  test('Opening the thread shows the "New" separator and clears the Threads counter', async ({ page }) => {
    const chat = await createChat()
    const parent = `Parent ${uniq}`
    const mine = await chat.me.sendMessage(chat.channel, parent)
    const reply = `Reply ${uniq}`
    await chat.other.reply(chat.channel, mine, reply)
    await unread.checkNavCounter('Threads', 1)

    await openChannel()
    await channelPage.checkMessageExist(parent, true, parent)
    await openThread(page, parent)

    await channelPage.checkIfMessageExistInSidebar(true, reply)
    await expect(unread.newSeparatorInSidebar()).toBeVisible()
    await unread.checkNavCounter('Threads', undefined)
    await checkMarkersOff(chat, ['chat', 'inbox'])
  })

  test('Reply arriving in the open thread is read at once', async ({ page }) => {
    const chat = await createChat()
    const parent = `Parent ${uniq}`
    const mine = await chat.me.sendMessage(chat.channel, parent)
    await chat.other.reply(chat.channel, mine, `First ${uniq}`)
    await openChannel()
    await openThread(page, parent)
    await channelPage.checkIfMessageExistInSidebar(true, `First ${uniq}`)
    await unread.checkNavCounter('Threads', undefined)

    const live = `Live reply ${uniq}`
    await chat.other.reply(chat.channel, mine, live)
    await channelPage.checkIfMessageExistInSidebar(true, live)

    await unread.checkNavCounterStaysAway('Threads')
    await checkMarkersOff(chat, ['chat'])
  })

  // ---- The Threads list ----

  test('Threads lists the threads I take part in, the latest on top', async ({ page }) => {
    const chat = await createChat()
    const first = `First parent ${uniq}`
    const second = `Second parent ${uniq}`
    const firstId = await chat.me.sendMessage(chat.channel, first)
    const secondId = await chat.me.sendMessage(chat.channel, second)
    await chat.other.reply(chat.channel, firstId, `Reply one ${uniq}`)
    await chat.other.reply(chat.channel, secondId, `Reply two ${uniq}`)

    await unread.navItem('Threads').click()

    const threads = page.locator('.activityMessage')
    await expect(threads.filter({ hasText: first })).toBeVisible()
    await expect(threads.filter({ hasText: second })).toBeVisible()
    const firstBox = await threads.filter({ hasText: first }).boundingBox()
    const secondBox = await threads.filter({ hasText: second }).boundingBox()
    expect((secondBox?.y ?? 0) < (firstBox?.y ?? 0)).toBeTruthy()

    // A new reply moves its thread up, without a reload.
    await chat.other.reply(chat.channel, firstId, `Reply three ${uniq}`)
    await expect(async () => {
      const a = await threads.filter({ hasText: first }).boundingBox()
      const b = await threads.filter({ hasText: second }).boundingBox()
      expect((a?.y ?? 0) < (b?.y ?? 0)).toBeTruthy()
    }).toPass()
  })

  test("Threads leaves out other people's threads and messages without replies", async ({ page }) => {
    const chat = await createChat()
    const mine = `My parent ${uniq}`
    const theirs = `Their parent ${uniq}`
    const lonely = `No replies ${uniq}`
    const mineId = await chat.me.sendMessage(chat.channel, mine)
    await chat.me.sendMessage(chat.channel, lonely)
    const theirsId = await chat.other.sendMessage(chat.channel, theirs)
    await chat.other.reply(chat.channel, theirsId, `Talking to myself ${uniq}`)
    await chat.other.reply(chat.channel, mineId, `Reply ${uniq}`)

    await unread.navItem('Threads').click()

    const threads = page.locator('.activityMessage')
    // The list has loaded once my thread is on it; only then does an absence mean anything.
    await expect(threads.filter({ hasText: mine })).toBeVisible()
    await expect(threads.filter({ hasText: theirs })).toHaveCount(0)
    await expect(threads.filter({ hasText: lonely })).toHaveCount(0)
  })

  test('A thread started while the Threads list is open shows up in it', async ({ page }) => {
    const chat = await createChat()
    const existing = `Existing parent ${uniq}`
    const existingId = await chat.me.sendMessage(chat.channel, existing)
    await chat.other.reply(chat.channel, existingId, `Reply ${uniq}`)
    const fresh = `Fresh parent ${uniq}`
    const freshId = await chat.me.sendMessage(chat.channel, fresh)
    const theirs = `Their parent ${uniq}`
    const theirsId = await chat.other.sendMessage(chat.channel, theirs)

    await unread.navItem('Threads').click()
    const threads = page.locator('.activityMessage')
    await expect(threads.filter({ hasText: existing })).toBeVisible()
    await expect(threads.filter({ hasText: fresh })).toHaveCount(0)

    // Somebody answers my message: a thread I am in from its first reply.
    await chat.other.reply(chat.channel, freshId, `First reply ${uniq}`)
    await expect(threads.filter({ hasText: fresh })).toBeVisible()

    // I answer somebody's message: a thread I join by replying.
    await chat.me.reply(chat.channel, theirsId, `My reply ${uniq}`)
    await expect(threads.filter({ hasText: theirs })).toBeVisible()
  })

  test('A reply lifts a thread from beyond the loaded page to the top', async ({ page }) => {
    const chat = await createChat()
    // One more than a page holds. Replies go in order, so the first thread is the oldest one.
    const parents: Array<{ id: Ref<Doc>, text: string }> = []
    for (let i = 1; i <= 101; i++) {
      const text = `Thread-${String(i).padStart(3, '0')}-${uniq}`
      parents.push({ id: await chat.me.sendMessage(chat.channel, text), text })
    }
    for (const parent of parents) {
      await chat.other.reply(chat.channel, parent.id, `Reply ${uniq}`)
    }
    const oldest = parents[0]
    const newest = parents[100]

    await unread.navItem('Threads').click()

    const threads = page.locator('.activityMessage')
    await expect(threads.filter({ hasText: newest.text })).toBeVisible()
    await expect(threads.filter({ hasText: oldest.text })).toHaveCount(0)

    await chat.other.reply(chat.channel, oldest.id, `Late reply ${uniq}`)

    await expect(threads.filter({ hasText: oldest.text })).toBeVisible()
    const oldestBox = await threads.filter({ hasText: oldest.text }).boundingBox()
    const newestBox = await threads.filter({ hasText: newest.text }).boundingBox()
    expect((oldestBox?.y ?? 0) < (newestBox?.y ?? 0)).toBeTruthy()
  })

  async function openThread (page: Page, parent: string): Promise<void> {
    await unread
      .message(parent)
      .getByText(/\d+ repl(y|ies)/)
      .click()
    await expect(page.locator('#sidebar div.text-editor-view')).toBeVisible()
  }
})
