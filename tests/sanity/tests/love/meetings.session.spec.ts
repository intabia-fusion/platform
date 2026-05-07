//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'

const meetingsWs = 'meetings-ws'
const ROOM_CANDIDATES = ['Meeting Room 1', 'Meeting Room 2', 'All hands', 'Voice only room']

async function openLove (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}/love`))?.finished()
  await expect(page.locator('div.floorGrid')).toBeVisible({ timeout: 15000 })
}

async function clickRoomByName (page: Page, name: string): Promise<void> {
  await page.locator(`[data-id="room-${name}"]`).first().click()
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

async function pickSecondRoom (page: Page, exclude: string): Promise<string | null> {
  for (const name of ROOM_CANDIDATES) {
    if (name === exclude) continue
    const room = page.locator(`[data-id="room-${name}"]`).first()
    if ((await room.count()) === 0) continue
    await room.click()
    return name
  }
  return null
}

async function startOrJoin (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 30000 })
}

async function openMeetingMinutes (page: Page, roomName: string): Promise<void> {
  // The MeetingMinutes link is named "<room> <day> <month> <year>" in the
  // side activity / room panel.
  const link = page.getByRole('link', { name: new RegExp(`${roomName}.*20\\d{2}`) }).first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
}

test.describe('meeting minutes - session lifecycle', () => {
  test('activity feed shows "Joined meeting" entry after a participant connects', async ({ browser }) => {
    test.setTimeout(120000)

    const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
    const page2 = await ctx2.newPage()
    const page3 = await ctx3.newPage()
    try {
      await openLove(page2)
      await openLove(page3)

      const room = await clickFirstAvailableRoom(page2)
      test.skip(room === null, 'No regular room available')
      await startOrJoin(page2)
      await waitConnected(page2)

      await clickRoomByName(page3, room as string)
      await startOrJoin(page3)
      await waitConnected(page3)

      // Open the MeetingMinutes detail page on user2 side and look for the
      // "Joined meeting" activity entry. Activity entries contain the system
      // text and the participant name, so we just check the system text.
      await openMeetingMinutes(page2, room as string)
      await expect(page2.getByText(/Joined meeting/i).first()).toBeVisible({ timeout: 30000 })
    } finally {
      await page2.close()
      await page3.close()
      await ctx2.close()
      await ctx3.close()
    }
  })

  test('re-entry: leave then start again in the same room — widget reappears', async ({ browser }) => {
    test.setTimeout(120000)

    const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const page = await ctx.newPage()
    try {
      await openLove(page)
      const room = await clickFirstAvailableRoom(page)
      test.skip(room === null, 'No regular room available')
      await startOrJoin(page)
      await waitConnected(page)

      await page.locator('[data-id="meeting-leave"]').first().click()
      await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 15000 })

      // After leaving, the UI may navigate to MeetingMinutes detail page —
      // re-open Love floor explicitly before clicking the room again.
      await openLove(page)
      await clickRoomByName(page, room as string)
      await startOrJoin(page)
      await waitConnected(page)
    } finally {
      await page.close()
      await ctx.close()
    }
  })

  test('room hop: leaving room A and connecting to room B switches the active meeting', async ({ browser }) => {
    test.setTimeout(180000)

    const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const page = await ctx.newPage()
    try {
      await openLove(page)
      const roomA = await clickFirstAvailableRoom(page)
      test.skip(roomA === null, 'No regular room available')
      await startOrJoin(page)
      await waitConnected(page)

      // Leave A
      await page.locator('[data-id="meeting-leave"]').first().click()
      await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 15000 })
      await openLove(page)

      const roomB = await pickSecondRoom(page, roomA as string)
      test.skip(roomB === null, 'Need a second meeting room for hop test')

      await startOrJoin(page)
      await waitConnected(page)

      // Widget header should now reference room B name.
      const widget = page.locator('[data-id="meeting-widget"]')
      await expect(widget).toContainText(roomB as string, { timeout: 15000 })
      await expect(widget).not.toContainText(roomA as string)
    } finally {
      await page.close()
      await ctx.close()
    }
  })
})
