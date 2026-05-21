//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { closeMeetingContexts, waitForActiveMeetingsToFinish } from './meeting-helpers'

const meetingsWs = 'meetings-ws'
const ROOM_CANDIDATES = ['Meeting Room 1', 'Meeting Room 2', 'All hands', 'Voice only room']

async function openLove (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}/love`))?.finished()
  await expect(page.locator('div.floorGrid')).toBeVisible({ timeout: 15000 })
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })
}

async function clickFirstAvailableRoom (page: Page): Promise<string | null> {
  for (const name of ROOM_CANDIDATES) {
    const room = page.locator(`[data-id="room-${name}"]`).first()
    if ((await room.count()) === 0) continue
    await room.click()
    return name
  }
  return null
}

async function startMeeting (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
}

export function registerRefreshReconnectTests (): void {
  test.describe('meeting minutes - refresh reconnect', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('refresh during an active meeting reconnects automatically', async ({ browser }) => {
      test.setTimeout(90000)

      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      try {
        await openLove(page)

        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')

        await startMeeting(page)
        await waitConnected(page)

        const anchorBefore = await page.evaluate(() => sessionStorage.getItem('love.activeMeeting'))
        expect(anchorBefore).not.toBeNull()
        expect(anchorBefore?.length ?? 0).toBeGreaterThan(0)

        await page.reload({ waitUntil: 'load' })

        await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })

        const anchorAfter = await page.evaluate(() => sessionStorage.getItem('love.activeMeeting'))
        expect(anchorAfter).toBe(anchorBefore)
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('explicit leave stays left (no subscribe-watcher reconnect loop)', async ({ browser }) => {
      // Regression: stale PI after leave used to trigger auto-reconnect.
      test.setTimeout(90000)

      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      try {
        await openLove(page)

        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')

        await startMeeting(page)
        await waitConnected(page)

        await page.locator('[data-id="meeting-leave"]').first().click()
        await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 15000 })

        const anchor = await page.evaluate(() => sessionStorage.getItem('love.activeMeeting'))
        expect(anchor).toBeNull()

        // Hold > LK departureTimeout (3s) to catch stale-PI subscribe race.
        await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 8000 })

        const anchorAfter = await page.evaluate(() => sessionStorage.getItem('love.activeMeeting'))
        expect(anchorAfter).toBeNull()
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('refresh after explicit leave does not auto-reconnect', async ({ browser }) => {
      test.setTimeout(90000)

      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      try {
        await openLove(page)

        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')

        await startMeeting(page)
        await waitConnected(page)

        // Leave through the UI — should clear the reconnect anchor.
        await page.locator('[data-id="meeting-leave"]').first().click()
        await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 15000 })

        const anchorBefore = await page.evaluate(() => sessionStorage.getItem('love.activeMeeting'))
        expect(anchorBefore).toBeNull()

        await page.reload({ waitUntil: 'load' })

        // No reconnect — meeting widget must stay hidden for a generous
        // timeout (longer than reconnect's typical window).
        await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 10000 })
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })
  })
}
