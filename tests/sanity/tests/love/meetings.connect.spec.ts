//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { OfficePage } from '../model/love/office-page'

const meetingsWs = 'meetings-ws'
const ROOM_CANDIDATES = ['Meeting Room 1', 'Meeting Room 2', 'All hands', 'Voice only room']

async function openLove (page: Page): Promise<OfficePage> {
  const office = new OfficePage(page)
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
  await office.navigateToOffice()
  await expect(office.floorGrid()).toBeVisible({ timeout: 15000 })
  return office
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

async function waitConnected (page: Page): Promise<void> {
  // MeetingWidget renders only while $lkSessionConnected === true.
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 30000 })
}

test.describe('meeting minutes - real connect', () => {
  test('user2 (non-owner of workspace) starts meeting and connects to LiveKit', async ({ browser }) => {
    test.setTimeout(90000)

    const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const page = await ctx.newPage()
    try {
      await openLove(page)

      const room = await clickFirstAvailableRoom(page)
      test.skip(room === null, 'No regular room available')

      const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
      await expect(connect).toBeVisible({ timeout: 10000 })
      await connect.click()

      await waitConnected(page)

      // Sanity: invite button is present once we are inside the meeting.
      await expect(page.locator('[data-id="invite-button"]').first()).toBeVisible({ timeout: 10000 })
    } finally {
      await page.close()
      await ctx.close()
    }
  })
})
