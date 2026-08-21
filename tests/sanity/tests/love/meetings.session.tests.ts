//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'

import { retryIntervals } from '../retry'
import {
  clickFirstAvailableRoom,
  clickRoomByName,
  closeMeetingContexts,
  openLove,
  openMeetingMinutes,
  waitConnected,
  waitForActiveMeetingsToFinish
} from './meeting-helpers'

async function startOrJoin (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  const knock = page.locator('[data-id="meeting-knock"]')
  // Knock instead of Connect means the client sees a ParticipantInfo of somebody else in the
  // room: a LiveKit webhook can recreate one right after the drain in beforeEach. Drain again -
  // clicking the room a second time only deselects it.
  await expect(async () => {
    if ((await knock.count()) > 0) {
      await waitForActiveMeetingsToFinish()
    }
    await expect(connect).toBeVisible({ timeout: 5000 })
  }).toPass({ intervals: retryIntervals, timeout: 20000 })
  await connect.click()
}

export function registerSessionTests (): void {
  test.describe('meeting minutes - session lifecycle', () => {
    // Wait for previous meetings to be sure finished.
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('activity feed shows "Joined meeting" entry after a participant connects', async ({ browser }) => {
      test.setTimeout(60000)

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
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('re-entry: leave then start again in the same room — widget reappears', async ({ browser }) => {
      test.setTimeout(60000)

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

        // Force-finish: skips LK departureTimeout (3s) and clears stale PI.
        await waitForActiveMeetingsToFinish()

        // After leaving, the UI may navigate to MeetingMinutes detail page —
        // re-open Love floor explicitly before clicking the room again.
        await openLove(page)
        await clickRoomByName(page, room as string)
        await startOrJoin(page)
        await waitConnected(page)
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('room hop: leaving room A and connecting to room B switches the active meeting', async ({ browser }) => {
      test.setTimeout(60000)

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

        const roomB = await clickFirstAvailableRoom(page, [roomA as string])
        test.skip(roomB === null, 'Need a second meeting room for hop test')

        await startOrJoin(page)
        await waitConnected(page)

        // Widget header should now reference room B name.
        const widget = page.locator('[data-id="meeting-widget"]')
        await expect(widget).toContainText(roomB as string, { timeout: 15000 })
        await expect(widget).not.toContainText(roomA as string)
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })
  })
}
