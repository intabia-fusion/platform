// Copyright © 2026 Intabia Fusion.

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

  test('Multiline code remains visible in direct messages', { tag: '@invite' }, async ({ page, browser }) => {
    using second = await getSecondPageByApi(browser, owner.ws, newUser2, 'chunter')
    const recipient = new ChannelPage(second.page)
    const directName = `${newUser2.lastName} ${newUser2.firstName}`
    const senderName = `${owner.data.lastName} ${owner.data.firstName}`
    const code = `    <script type="text/javascript">
      (function (m, e, t, r, i, k, a) {
        m[i] =
          m[i] ||
          function () {
            (m[i].a = m[i].a || []).push(arguments);
          };
        m[i].l = 1 * new Date();
        for (let j = 0; j < document.scripts.length; j++) {
          if (document.scripts[j].src === r) {
            return;
          }
        }
        ((k = e.createElement(t)),
          (a = e.getElementsByTagName(t)[0]),
          (k.async = 1),
          (k.src = r),
          a.parentNode.insertBefore(k, a));
      })(
        window,
        document,
        "script",
        "https://test.ru/",
        "ym",
      );

      ym(108262213, "init", {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: "dataLayer",
        referrer: document.referrer,
        url: location.href,
        accurateTrackBounce: true,
        trackLinks: true,
      });
    </script>`
    const marker = 'const codeBlockLoaded = true'
    const markdown = ['```astro', code, '```', '', '```javascript', marker, '```'].join('\n')

    async function checkCode (chat: ChannelPage): Promise<void> {
      const message = chat.textMessage(marker, true)
      const blocks = message.locator('pre.proseCodeBlock > code')
      await expect(blocks).toHaveCount(2)
      // Wait for the lazy Highlight component, not its temporary plain-text fallback.
      await expect(blocks.nth(1).locator('.hljs-keyword')).toHaveText('const')
      // The Svelte wrapper can append one space. Keep indentation and newlines significant.
      await expect.poll(async () => (await blocks.first().textContent())?.replace(/ $/, '')).toBe(code)
      await expect(message.locator('script')).toHaveCount(0)
      await expect(blocks.first()).toBeVisible()
      expect(
        await blocks.first().evaluate((element) => {
          const style = getComputedStyle(element)
          const computedLineHeight = parseFloat(style.lineHeight)
          const lineHeight = Number.isNaN(computedLineHeight) ? parseFloat(style.fontSize) : computedLineHeight
          const height = element.getBoundingClientRect().height
          const lines = (element.textContent ?? '').split('\n').length
          return (
            element.scrollHeight <= element.clientHeight + 1 &&
            height >= lines * lineHeight - 1 &&
            (element.parentElement?.getBoundingClientRect().height ?? 0) >= height
          )
        })
      ).toBe(true)
    }

    await test.step('Send an Astro code block through the editor', async () => {
      await chunterPage.createDirectChat(newUser2)
      await channelPage.clickChooseChannel(directName)
      const editor = channelPage.inputMessage()
      await editor.click()
      await editor.evaluate((element, text) => {
        const data = new DataTransfer()
        data.setData('text/plain', text)
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      }, markdown)
      await expect(editor.locator('pre').first()).toContainText(code)
      await channelPage.buttonSendMessage().click()
    })

    await test.step('Both participants see the complete code', async () => {
      await checkCode(channelPage)
      await recipient.clickChooseChannel(senderName)
      await checkCode(recipient)
    })

    await test.step('Code survives reopening the chat and reloading the page', async () => {
      await channelPage.clickChooseChannel('general')
      await channelPage.clickChooseChannel(directName)
      await checkCode(channelPage)
      await second.page.reload()
      await checkCode(recipient)
    })

    await test.step('Reply preview still contains the source code', async () => {
      await channelPage.clickReplyToMessage(marker)
      await expect(page.locator('.reply__text')).toContainText(code)
      await checkCode(channelPage)
    })
  })
})
