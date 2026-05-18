import { expect, test } from '@playwright/test'
import { PlatformSetting, PlatformURI } from '../utils'
import { OfficePage } from '../model/love/office-page'
import { MeetingMinutesPage } from '../model/love/meeting-minutes-page'

const meetingsWs = 'meetings-ws'

export function registerPrivacyTests (): void {
  test.describe('meeting minutes privacy', () => {
    test.use({ storageState: PlatformSetting })
    let officePage: OfficePage

    test.beforeEach(async ({ page }) => {
      officePage = new OfficePage(page)
      await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
      await officePage.navigateToOffice()
      await expect(officePage.floorGrid()).toBeVisible({ timeout: 15000 })
    })

    test('non-owner does not see privacy toggle on someone else office', async ({ browser, page }) => {
      // First, capture the rooms layout from the owner side to know what to click as user2.
      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page2 = await ctx.newPage()
      try {
        await (await page2.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
        const office2 = new OfficePage(page2)
        const mm2 = new MeetingMinutesPage(page2)
        await office2.navigateToOffice()
        await expect(office2.floorGrid()).toBeVisible({ timeout: 15000 })

        const rooms = page2.locator('div.floorGrid-room')
        const count = await rooms.count()
        // Click each room and ensure the toggle never appears for user2.
        for (let i = 0; i < count; i++) {
          await rooms.nth(i).click()
          await page2.waitForTimeout(300)
          await expect(mm2.togglePrivateButton()).toBeHidden({ timeout: 1500 })
          await page2.keyboard.press('Escape')
        }
      } finally {
        await page2.close()
        await ctx.close()
      }
    })
  })
}
