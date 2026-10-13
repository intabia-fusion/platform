//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { createRestTxOperations } from '@hcengineering/api-client'
import tracker from '@hcengineering/tracker'
import { type Page } from '@playwright/test'
import { createIssue, getProjectContext } from '../API/TrackerApi'
import { expect, type SharedWorkspace, test } from '../fixtures'
import { ChannelPage } from '../model/channel-page'
import { loginByToken, PlatformURI } from '../utils'

// Safari needs ClipboardItem to keep the user gesture; Chromium keeps every ClipboardItem write,
// and the page behind it, in a persistent root, so it must get writeText.
async function recordClipboardCalls (page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    const calls: string[] = []
    ;(window as any).__clipboardCalls = calls
    const clipboard = navigator.clipboard
    const write = clipboard.write.bind(clipboard)
    const writeText = clipboard.writeText.bind(clipboard)
    clipboard.write = async (items) => {
      calls.push('write')
      await write(items)
    }
    clipboard.writeText = async (text) => {
      calls.push('writeText')
      await writeText(text)
    }
  })
}

async function clipboardCalls (page: Page): Promise<string[]> {
  return await page.evaluate(() => (window as any).__clipboardCalls)
}

async function readClipboard (page: Page): Promise<string> {
  return await page.evaluate(async () => await navigator.clipboard.readText())
}

async function createIssueIdentifier (shared: SharedWorkspace): Promise<string> {
  if (shared.ws.token === undefined) throw new Error('No workspace token')
  const client = await createRestTxOperations(shared.ws.endpoint, shared.ws.workspace, shared.ws.token)
  try {
    const ctx = await getProjectContext(client)
    const _id = await createIssue(client, ctx, { title: `Clipboard issue ${Date.now()}`, status: 'Backlog' })
    const created = await client.findOne(tracker.class.Issue, { _id })
    if (created === undefined) throw new Error(`Issue ${_id} was not stored`)
    return created.identifier
  } finally {
    await client.close()
  }
}

// A fresh workspace opens the tracker without a list; the issues view of the default project has one.
const issuesApp = 'tracker/tracker%3Aproject%3ADefaultProject/issues'

test.describe('Copy to clipboard', () => {
  let shared: SharedWorkspace

  test.beforeEach(async ({ page, sharedWorkspace }) => {
    shared = await sharedWorkspace(0)
    await recordClipboardCalls(page)
  })

  test('issue ID and URL from the context menu', async ({ page, browserName }) => {
    const identifier = await createIssueIdentifier(shared)
    await loginByToken(page, shared.token, shared.ws, issuesApp)
    const issueLink = page.locator(`a[href$="/${identifier}"]`).first()

    await issueLink.click({ button: 'right' })
    await page.locator('div.popup button', { hasText: 'Copy issue ID to clipboard' }).click()
    await expect.poll(async () => await readClipboard(page)).toBe(identifier)

    await issueLink.click({ button: 'right' })
    await page.locator('div.popup button', { hasText: 'Copy issue URL to clipboard' }).click()
    await expect
      .poll(async () => await readClipboard(page))
      .toBe(`${PlatformURI}/workbench/${shared.ws.workspaceUrl}/tracker/${identifier}`)

    const expected = browserName === 'webkit' ? 'write' : 'writeText'
    expect(await clipboardCalls(page)).toEqual([expected, expected])
  })

  test('message link from the chat', async ({ page, browserName }) => {
    const message = `Copy my link ${Date.now()}`
    await loginByToken(page, shared.token, shared.ws, 'chunter')
    const channelPage = new ChannelPage(page)
    await channelPage.clickChannel('random')
    await channelPage.sendMessage(message)
    await channelPage.clickOpenMoreButton(message)
    await channelPage.clickCopyLinkButton()
    await expect.poll(async () => await readClipboard(page)).toContain(`/workbench/${shared.ws.workspaceUrl}/chunter/`)
    expect(await clipboardCalls(page)).toEqual([browserName === 'webkit' ? 'write' : 'writeText'])
  })
})
