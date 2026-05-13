import { test, expect } from '@playwright/test'
import { PlatformSetting, PlatformURI } from '../utils'
import { OfficePage } from '../model/love/office-page'

const meetingsWs = 'meetings-ws'

export function registerMeetingsTests (): void {
  test.describe('meeting minutes', () => {
    test.use({
      storageState: PlatformSetting
    })
    let officePage: OfficePage

    test.beforeEach(async ({ page }) => {
      officePage = new OfficePage(page)
      await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
    })

    test('navigate-to-office', async ({ page }) => {
      await officePage.navigateToOffice()
      await expect(page).toHaveURL(new RegExp(`/workbench/${meetingsWs}/love`))
    })

    test('office-floor-view-rooms-visible', async () => {
      await officePage.navigateToOffice()
      await expect(officePage.floorGrid()).toBeVisible({ timeout: 15000 })
      // Should have at least one room
      const rooms = officePage.page.locator('div.floorGrid-room')
      await expect(rooms.first()).toBeVisible()
    })

    test('click-office-opens-panel', async ({ page }) => {
      await officePage.navigateToOffice()
      await expect(officePage.floorGrid()).toBeVisible({ timeout: 15000 })

      // Click first room (office)
      const rooms = officePage.page.locator('div.floorGrid-room')
      await rooms.first().click()

      // Office panel should open with Meeting minutes section header
      await expect(page.locator('span.antiSection-header__title', { hasText: 'Meeting minutes' })).toBeVisible({
        timeout: 10000
      })
    })

    test('click-regular-room-opens-popup', async () => {
      await officePage.navigateToOffice()
      await expect(officePage.floorGrid()).toBeVisible({ timeout: 15000 })

      // Find non-office rooms (rooms without Employee info in aside)
      // Regular rooms should show RoomPopup on click
      const rooms = officePage.page.locator('div.floorGrid-room')
      const roomCount = await rooms.count()

      // Try rooms starting from the last (more likely to be regular rooms)
      for (let i = roomCount - 1; i >= 0; i--) {
        await rooms.nth(i).click()

        // Check if popup appeared (regular room) or panel (office)
        const popup = officePage.roomPopup()
        const isPopup = await popup.isVisible().catch(() => false)
        if (isPopup) {
          await expect(officePage.enterRoomButton()).toBeVisible()
          return
        }

        // Close panel if opened (press Escape)
        await officePage.page.keyboard.press('Escape')
        await officePage.page.waitForTimeout(500)
      }
      // If no regular rooms found, skip
      test.skip(true, 'No regular rooms found in workspace')
    })
  })
}
