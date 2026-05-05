import { expect, test } from '@playwright/test'
import { PlatformSetting, PlatformURI } from '../utils'
import { OfficePage } from '../model/love/office-page'

test.use({ storageState: PlatformSetting })

const meetingsWs = 'meetings-ws'

test.describe('meeting minutes knock/invite', () => {
  let officePage: OfficePage

  test.beforeEach(async ({ page }) => {
    officePage = new OfficePage(page)
    await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
    await officePage.navigateToOffice()
    await expect(officePage.floorGrid()).toBeVisible({ timeout: 15000 })
  })

  test('user2 sees same floor (autoJoin worked for restored spaces)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const page2 = await ctx.newPage()
    try {
      await (await page2.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
      const office2 = new OfficePage(page2)
      await office2.navigateToOffice()
      await expect(office2.floorGrid()).toBeVisible({ timeout: 15000 })
      const rooms = page2.locator('div.floorGrid-room')
      expect(await rooms.count()).toBeGreaterThan(0)
    } finally {
      await page2.close()
      await ctx.close()
    }
  })

  test('user3 (no workspace owner role) can also see floor', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: '.auth/storageThird.json' })
    const page3 = await ctx.newPage()
    try {
      await (await page3.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
      const office3 = new OfficePage(page3)
      await office3.navigateToOffice()
      await expect(office3.floorGrid()).toBeVisible({ timeout: 15000 })
    } finally {
      await page3.close()
      await ctx.close()
    }
  })

  test('clicking a regular room opens its meeting panel', async ({ page }) => {
    // Click a known seeded regular room and verify the meeting panel opens.
    // Use data-id from RoomPreview.svelte. Skip if the room is missing in this workspace.
    const candidates = ['Meeting Room 1', 'Meeting Room 2', 'All hands', 'Voice only room']
    let opened = false
    for (const name of candidates) {
      const room = page.locator(`[data-id="room-${name}"]`).first()
      if ((await room.count()) === 0) continue
      await room.click()
      const panel = page.locator('div.antiPanel-component')
      if (await panel.isVisible({ timeout: 3000 }).catch(() => false)) {
        opened = true
        break
      }
    }
    expect(opened).toBe(true)
  })
})
