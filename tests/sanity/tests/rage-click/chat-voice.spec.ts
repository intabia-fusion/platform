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

import { expect } from '@playwright/test'
import { test } from '../fixtures'
import { ChunterPage } from '../model/chunter-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
// playwright.config.ts grants `microphone` plus --use-fake-ui/device-for-media-stream globally, so
// getUserMedia() resolves against a synthetic device with no real hardware.
test.describe('Rage click: voice recording', () => {
  // IconMic.svelte is an inline <svg>, not a sprite <use> - matched by its own path data.
  const micButton = (page: import('@playwright/test').Page): import('@playwright/test').Locator =>
    page.locator('button:has(svg path[d^="M8 1.5a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0v-4a2 2 0 0 0-2-2Zm-1"])')

  async function startRecording (page: import('@playwright/test').Page): Promise<void> {
    await micButton(page).click()
    await page.locator('.hud').waitFor({ state: 'visible', timeout: 10000 })
    // Let the recorder actually capture a moment of (synthetic, silent) audio before stopping it.
    await page.waitForTimeout(500)
  }

  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/chunter`))?.finished()
  })

  test('"Attach" persists the recording exactly once, and recovers', async ({ page }) => {
    const chunterPage = new ChunterPage(page)
    const channelName = `RageVoiceAttach${generateId()}`
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(channelName, true)

    await startRecording(page)
    // persist() is guarded by `processing`, checked before the async recorder.stop(); without it,
    // 3 rapid clicks before the HUD closes would stop+upload+attach the same recording 3 times.
    const attachButton = page.locator('.hud button').nth(1)
    await rageClick(attachButton)
    await expect(page.locator('.hud')).toHaveCount(0, { timeout: 10000 })
    await expect(page.locator('.item')).toHaveCount(1)

    // Usable again: a fresh recording can still be attached.
    await startRecording(page)
    await page.locator('.hud button').nth(1).click()
    await expect(page.locator('.hud')).toHaveCount(0, { timeout: 10000 })
    await expect(page.locator('.item')).toHaveCount(2)
  })

  test('"Send" submits the voice message exactly once, and recovers', async ({ page }) => {
    const chunterPage = new ChunterPage(page)
    const channelName = `RageVoiceSend${generateId()}`
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(channelName, true)

    const baseline = await page.locator('.activityMessage').count()

    await startRecording(page)
    // Same `processing` guard as Attach, shared by persist(): without it, 3 rapid clicks could
    // each persist a duplicate attachment AND each dispatch('send') - submitting the message 3x.
    const sendButton = page.locator('.hud button').nth(2)
    await rageClick(sendButton)
    await expect(page.locator('.hud')).toHaveCount(0, { timeout: 10000 })

    // Exactly one new message, carrying exactly one voice attachment.
    await expect(page.locator('.activityMessage')).toHaveCount(baseline + 1, { timeout: 15000 })
    await expect(page.locator('.activityMessage .voice')).toHaveCount(1)

    // Usable again: recording and sending a second voice message still works.
    await startRecording(page)
    await page.locator('.hud button').nth(2).click()
    await expect(page.locator('.activityMessage')).toHaveCount(baseline + 2, { timeout: 15000 })
    await expect(page.locator('.activityMessage .voice')).toHaveCount(2)
  })
})
