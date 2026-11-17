import { expect, test } from '../fixtures'
import { BOT_REPLY_TIMEOUT, openBotDirect } from '../API/AiBot'
import { ApiEndpoint } from '../API/Api'
import { setWorkspacePlanByUuid } from '../API/Billing'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { LoginPage } from '../model/login-page'
import { SelectWorkspacePage } from '../model/select-workspace-page'
import { LocalUrl, PlatformURI, generateTestData, generateUser } from '../utils'
import { joinWorkspace, openMemberPage } from '../API/ChatApi'
import { AccountRole } from '@hcengineering/core'
import { waitStable, retryIntervals } from '../retry'

// Base ai-bot suite on the `low` level: mock provider in echo mode (tests/config-aibot.yaml)
// replies with the received context as markdown, so we assert what actually reached the model.

test.describe.configure({ mode: 'parallel' })

test.describe('ai-bot direct chat', () => {
  let leftSideMenuPage: LeftSideMenuPage
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let loginPage: LoginPage
  let api: ApiEndpoint
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }
  let wsInfo: Awaited<ReturnType<ApiEndpoint['createWorkspaceWithLogin']>>

  test.beforeEach(async ({ page, request }) => {
    data = generateTestData()
    leftSideMenuPage = new LeftSideMenuPage(page)
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    loginPage = new LoginPage(page)
    api = new ApiEndpoint(request)
    await api.createAccount(data.userName, '1234', data.firstName, data.lastName)
    wsInfo = await api.createWorkspaceWithLogin(data.workspaceName, data.userName, '1234')
    await (await page.goto(`${PlatformURI}`))?.finished()
    await loginPage.login(data.userName, '1234')
    const swp = new SelectWorkspacePage(page)
    await swp.selectWorkspace(data.workspaceName)
  })

  test('bot replies and echoes the prompt back', async ({ page }) => {
    await openBotDirect(leftSideMenuPage, chunterPage, channelPage)

    const question = 'какая сегодня погода'
    await channelPage.sendMessage(question)

    const reply = page.locator('.hulyComponent .activityMessage', { hasText: 'echo' })
    await expect(reply).toBeVisible({ timeout: BOT_REPLY_TIMEOUT })
    await expect(reply).toContainText('prompt')
    await expect(reply).toContainText(question)
  })

  test('bot answers once and does not reply to itself', async ({ page }) => {
    await openBotDirect(leftSideMenuPage, chunterPage, channelPage)

    await channelPage.sendMessage('один вопрос')

    const messages = page.locator('.hulyComponent .activityMessage')
    const echo = page.locator('.hulyComponent .activityMessage', { hasText: 'echo' })
    // The bot's own message lands in the same direct, so a missing self-filter turns one question
    // into an endless exchange - it would echo its own reply.
    await expect(echo).toHaveCount(1, { timeout: BOT_REPLY_TIMEOUT })
    // The welcome the bot posts on member join arrives asynchronously, so the total is not a fixed
    // number. Wait for the count to stop moving instead of sleeping out the slowest case.
    const settled = await waitStable(async () => await messages.count(), { stableFor: 5000 })
    expect(await messages.count()).toBe(settled)
    await expect(echo).toHaveCount(1)
  })

  test('direct context carries previous messages', async ({ page }) => {
    await openBotDirect(leftSideMenuPage, chunterPage, channelPage)

    await channelPage.sendMessage('первое сообщение')
    await expect(page.locator('.hulyComponent .activityMessage', { hasText: 'echo' }).first()).toBeVisible({
      timeout: BOT_REPLY_TIMEOUT
    })

    await channelPage.sendMessage('второе сообщение')
    // The second dump must list the first turn in its history section.
    await expect(async () => {
      const last = page.locator('.hulyComponent .activityMessage', { hasText: 'history' }).last()
      await expect(last).toContainText('первое сообщение', { timeout: 5000 })
    }).toPass({ intervals: retryIntervals, timeout: BOT_REPLY_TIMEOUT })
  })

  test('tool definitions reach the model', async ({ page }) => {
    await openBotDirect(leftSideMenuPage, chunterPage, channelPage)

    await channelPage.sendMessage('привет')
    const reply = page.locator('.hulyComponent .activityMessage', { hasText: 'echo' })
    await expect(reply).toBeVisible({ timeout: BOT_REPLY_TIMEOUT })
    // Without tool definitions tool calling silently degrades, so assert they are passed.
    await expect(reply).toContainText('tools')
  })

  test('monthly token limit blocks the bot and shows the badge to workspace members', async ({
    page,
    browser,
    request
  }) => {
    // Tiny monthly window: first request (used 0 < 1) proceeds and bills, next one is blocked.
    await setWorkspacePlanByUuid(wsInfo.workspace, 'business', { windowMonth: 1, status: 'active', users: 10 })
    const member = await joinWorkspace(wsInfo, generateUser())
    expect((await member.client.getAccount()).role).toBe(AccountRole.User)
    const memberBrowser = await openMemberPage(browser, member)
    try {
      const badge = '[data-id="billingWorkspaceLimitsExhausted"]'
      for (const session of [page, memberBrowser.page]) {
        const limits = session.waitForResponse(
          (response) => response.url().includes(`/api/v1/${wsInfo.workspace}/limits`) && response.status() === 200
        )
        await session.reload()
        await limits
        await expect(session.locator('[data-id="billingLimitsIndicator"]')).toBeVisible()
        await expect(session.locator(badge)).toHaveCount(0)
      }
      await openBotDirect(leftSideMenuPage, chunterPage, channelPage)

      await test.step('First request goes through', async () => {
        await channelPage.sendMessage('hello')
        await expect(page.locator('.hulyComponent .activityMessage', { hasText: 'echo' }).first()).toBeVisible({
          timeout: BOT_REPLY_TIMEOUT
        })
      })

      await test.step('Exhaustion reaches both open sessions and a new session', async () => {
        await expect(page.locator(badge)).toBeVisible({ timeout: 30000 })
        await expect(memberBrowser.page.locator(badge)).toBeVisible({ timeout: 30000 })
        const reopened = await openMemberPage(browser, member)
        try {
          await expect(reopened.page.locator(badge)).toBeVisible({ timeout: 30000 })
        } finally {
          await reopened.context.close()
        }
      })

      await test.step('Further requests are blocked without a chat notice', async () => {
        await expect
          .poll(
            async () => {
              const response = await request.post(`${LocalUrl.replace(/_account\/?$/, '_aibot')}/events`, {
                headers: { Authorization: `Bearer ${wsInfo.token}` },
                data: []
              })
              return response.status()
            },
            { timeout: 30000 }
          )
          .toBe(402)
        await channelPage.sendMessage('ping again')
        const echoes = page.locator('.hulyComponent .activityMessage', { hasText: 'echo' })
        const notices = page.locator('.hulyComponent .activityMessage', { hasText: 'Закончились токены ИИ' })
        expect(
          await waitStable(async () => `${await echoes.count()}:${await notices.count()}`, { stableFor: 5000 })
        ).toBe('1:0')
      })
    } finally {
      await memberBrowser.context.close()
    }
  })
})
