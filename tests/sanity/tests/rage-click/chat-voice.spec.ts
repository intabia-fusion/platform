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

import { expect, type Locator, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
// playwright.config.ts grants `microphone` plus --use-fake-ui/device-for-media-stream globally, so
// getUserMedia() resolves against a synthetic device with no real hardware.
test.describe('Rage click: voice recording', () => {
  const micButton = (page: Page): Locator => page.locator('button:has(use[href$="#mic"]):not([inert] *)')
  // VoiceRecorderBar: Discard, then Attach; Attach stays disabled until the mic is capturing
  const attachButton = (page: Page): Locator => page.locator('.recorder button').last()
  const sendButton = (page: Page): Locator => new ChannelPage(page).buttonSendMessage()
  const voiceInMessages = (page: Page): Locator => page.locator('.activityMessage .voice-attachment')

  async function startRecording (page: Page): Promise<void> {
    await micButton(page).click()
    await expect(attachButton(page)).toBeEnabled({ timeout: 10000 })
    // Let the recorder actually capture a moment of (synthetic, silent) audio before stopping it.
    await page.waitForTimeout(500)
  }

  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/chunter`))?.finished()
  })

  test('"Attach" persists the recording exactly once, and recovers', async ({ page }) => {
    const chunterPage = new ChunterPage(page)
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(`RageVoiceAttach${generateId()}`, true)

    await startRecording(page)
    // finish() keeps the first persist() in `attaching`: 3 rapid clicks upload and attach it once
    await rageClick(attachButton(page))
    await expect(page.locator('.recorder')).toHaveCount(0, { timeout: 10000 })
    await sendButton(page).click()
    await expect(voiceInMessages(page)).toHaveCount(1, { timeout: 15000 })

    // Usable again: a fresh recording can still be attached.
    await startRecording(page)
    await attachButton(page).click()
    await expect(page.locator('.recorder')).toHaveCount(0, { timeout: 10000 })
    await sendButton(page).click()
    await expect(voiceInMessages(page)).toHaveCount(2, { timeout: 15000 })
  })

  test('"Send" submits the voice message exactly once, and recovers', async ({ page }) => {
    const chunterPage = new ChunterPage(page)
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(`RageVoiceSend${generateId()}`, true)

    const baseline = await page.locator('.activityMessage').count()

    // Send while recording finishes the recording first (beforeSend), then sends
    await startRecording(page)
    await rageClick(sendButton(page))
    await expect(page.locator('.recorder')).toHaveCount(0, { timeout: 10000 })
    await expect(page.locator('.activityMessage')).toHaveCount(baseline + 1, { timeout: 15000 })
    await expect(voiceInMessages(page)).toHaveCount(1)

    // Usable again: recording and sending a second voice message still works.
    await startRecording(page)
    await sendButton(page).click()
    await expect(page.locator('.activityMessage')).toHaveCount(baseline + 2, { timeout: 15000 })
    await expect(voiceInMessages(page)).toHaveCount(2)
  })
})
