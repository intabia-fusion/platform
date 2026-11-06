import { type Class, type Doc, type Ref } from '@hcengineering/core'
import { expect, test, type Browser, type SharedWorkspace } from '../fixtures'
import { connectOwner, joinWorkspace, openMemberPage, type ChatMember } from '../API/ChatApi'
import { ChannelPage } from '../model/channel-page'
import { generateUser, loginByToken } from '../utils'

test.describe.configure({ mode: 'parallel' })

test.describe('Pulse — typing indicator and document presence', () => {
  let channelPage: ChannelPage
  let shared: SharedWorkspace
  let channelName: string
  let channelId: Ref<Doc> | undefined
  let actors: ChatMember[] = []
  let secondUser: Awaited<ReturnType<typeof openMemberPage>> | undefined

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    channelId = undefined
    actors = []
    secondUser = undefined
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
    actors.push(member)
    const owner = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    actors.unshift(owner)
    const channel = await test.step('Pulse: create channel', async () =>
      await owner.createChannel(channelName, [member.account]))
    channelId = channel._id
    console.info(
      'Pulse channel created',
      JSON.stringify({
        at: new Date().toISOString(),
        workspace: shared.ws.workspace,
        channelId,
        channelName,
        owner: owner.account,
        member: member.account
      })
    )
    secondUser = await openMemberPage(browser, member, 'chunter')
    return secondUser
  }

  test.afterEach(async ({ page }, testInfo) => {
    try {
      if (testInfo.status === testInfo.expectedStatus) return
      const metadata = {
        at: new Date().toISOString(),
        retry: testInfo.retry,
        workspace: shared?.ws.workspace,
        channelId,
        channelName,
        accounts: actors.map((actor) => actor.account)
      }
      console.info('Pulse failure', JSON.stringify(metadata))
      const pages = await Promise.all(
        [page, secondUser?.page].map(async (current) => {
          if (current == null || current.isClosed()) return { closed: true }
          return {
            path: new URL(current.url()).pathname,
            navigator: await current
              .locator('div.antiPanel-navigator')
              .innerText({ timeout: 1000 })
              .catch(() => null),
            headers: await current.locator('.hulyHeader-container .hulyHeader-titleGroup').allTextContents(),
            channelButtons: await current
              .locator('div.antiPanel-navigator')
              .getByRole('button', { name: channelName })
              .count()
          }
        })
      )
      await testInfo.attach('pulse-browser-state', {
        body: JSON.stringify({ ...metadata, pages }, null, 2),
        contentType: 'application/json'
      })
      const snapshots = await Promise.all(
        actors.map(async (actor) => {
          const channelQuery = channelId != null ? { _id: channelId } : { name: channelName }
          const queries = [
            { classId: 'chunter:class:Channel', query: channelQuery },
            { classId: 'chunter:class:Chat', query: { attachedTo: channelId, account: actor.account } },
            { classId: 'core:class:DocPreview', query: { objectId: channelId } },
            { classId: 'notification:class:ReadState', query: { attachedTo: channelId } },
            { classId: 'core:class:Collaborator', query: { attachedTo: channelId } },
            { classId: 'contact:class:PersonSpace', query: { account: actor.account } }
          ].filter(
            (query) =>
              channelId != null || ['chunter:class:Channel', 'contact:class:PersonSpace'].includes(query.classId)
          )
          const fields = new Set([
            '_id',
            '_class',
            'space',
            'name',
            'members',
            'owners',
            'archived',
            'account',
            'person',
            'attachedTo',
            'attachedToClass',
            'preview',
            'readState',
            'hidden',
            'pinned',
            'objectId',
            'objectClass',
            'objectDomain',
            'title',
            'latestMessageTimestamp',
            'createdOn',
            'modifiedOn'
          ])
          const reads = await Promise.all(
            queries.map(async ({ classId, query }) => {
              const started = Date.now()
              let timer: ReturnType<typeof setTimeout> | undefined
              try {
                const docs = await Promise.race([
                  actor.client.findAll(classId as Ref<Class<Doc>>, query as any, { limit: 20, total: true }),
                  new Promise<never>((resolve, reject) => {
                    timer = setTimeout(() => {
                      reject(new Error('Diagnostic read exceeded 5 seconds'))
                    }, 5000)
                  })
                ])
                return {
                  classId,
                  durationMs: Date.now() - started,
                  total: docs.total,
                  documents: docs.map((doc) =>
                    Object.fromEntries(Object.entries(doc).filter(([key]) => fields.has(key)))
                  )
                }
              } catch (error) {
                return { classId, durationMs: Date.now() - started, error: String(error) }
              } finally {
                clearTimeout(timer)
              }
            })
          )
          return { account: actor.account, reads }
        })
      )
      const body = JSON.stringify({ ...metadata, snapshots }, null, 2)
      console.info('Pulse server state', body)
      await testInfo.attach('pulse-server-state', { body, contentType: 'application/json' })
    } catch (error) {
      console.warn('Pulse diagnostics failed', String(error))
    } finally {
      await secondUser?.context.close()
    }
  })

  test('Second user sees typing indicator while first user types in a channel', async ({ browser }) => {
    const second = await openSecondUser(browser)
    const channelPageSecond = new ChannelPage(second.page)

    await channelPage.clickChooseChannel(channelName)
    await channelPageSecond.clickChooseChannel(channelName)

    await channelPage.inputMessage().click()
    await channelPage.inputMessage().pressSequentially('hello there', { delay: 80 })

    const typingInfo = second.page.locator('span[data-id="channel-typing-info"]')
    await expect(typingInfo).toContainText(shared.data.firstName, { timeout: 8000 })

    await channelPage.buttonSendMessage().click()
    await expect(typingInfo).not.toContainText(shared.data.firstName, { timeout: 10000 })
  })

  test('First user sees second user as document presence viewer in a channel', async ({ browser }) => {
    const second = await openSecondUser(browser)
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
  })
})
