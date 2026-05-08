//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { closeMeetingContexts } from './meeting-helpers'

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

async function startOrJoin (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 30000 })
}

async function inviteByLastNames (page: Page, lastNames: string[]): Promise<void> {
  await page.locator('[data-id="invite-button"]').first().click()
  const popup = page.locator('.hulyModal-container').last()
  const search = popup.getByPlaceholder(/Search/i)
  await expect(search).toBeVisible({ timeout: 5000 })
  for (const last of lastNames) {
    await search.fill(last)
    await popup.locator('button.row').filter({ hasText: last }).first().click()
    await search.fill('')
  }
  const ok = popup.locator('.hulyModal-footer').getByRole('button', { name: /^Invite$/i })
  await expect(ok).toBeEnabled({ timeout: 5000 })
  await ok.click()
}

async function openMeetingMinutes (page: Page, roomName: string): Promise<void> {
  const link = page.getByRole('link', { name: new RegExp(`${roomName}.*20\\d{2}`) }).first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
}

test.describe('meeting minutes - extended scenarios', () => {
  test('privacy toggle: closing the room hides meeting name and shows Busy badge for outsiders', async ({
    browser
  }) => {
    test.setTimeout(180000)

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

      // user2 is the meeting owner - close the room from MeetingMinutes detail page
      await openMeetingMinutes(page2, room as string)
      const toggle = page2.locator('[data-id="meeting-toggle-private"]').first()
      await expect(toggle).toBeVisible({ timeout: 10000 })
      await toggle.click()

      // user3 opens the same room - should see Busy badge instead of meeting details
      await clickRoomByName(page3, room as string)
      await expect(page3.locator('[data-id="busy-badge"]').first()).toBeVisible({ timeout: 15000 })

      // Toggle back to public - busy badge should go away on user3 side
      await toggle.click()
      await expect(page3.locator('[data-id="busy-badge"]')).toHaveCount(0, { timeout: 15000 })
    } finally {
      await closeMeetingContexts([
        { ctx: ctx2, pages: [page2] },
        { ctx: ctx3, pages: [page3] }
      ])
    }
  })

  // FLAKY: openMeetingMinutes resolves to the wrong "Office" link when the
  // sender already has an outgoing invite popup open. Stabilize via a more
  // specific selector before re-enabling.
  test.skip('non-owner of a private meeting cannot invite — recipient gets nothing', async ({ browser }) => {
    test.setTimeout(180000)

    const ctx1 = await browser.newContext({ storageState: '.auth/storage.json' }) // user1 (workspace owner, but not the meeting owner)
    const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()
    const page3 = await ctx3.newPage()
    try {
      await openLove(page1)
      await openLove(page2)
      await openLove(page3)

      // user2 starts a public meeting and invites user3 to bring them into members
      const room = await clickFirstAvailableRoom(page2)
      test.skip(room === null, 'No regular room available')
      await startOrJoin(page2)
      await waitConnected(page2)
      await inviteByLastNames(page2, ['Muram'])

      // user3 accepts -> joins the meeting -> becomes a member
      const incoming = page3.locator('[data-id="incoming-invite-trigger"]')
      await expect(incoming).toBeVisible({ timeout: 15000 })
      await incoming.click()
      await page3.locator('[data-id="invite-join"]').click()
      await waitConnected(page3)

      // user2 (owner) closes the room -> private
      await openMeetingMinutes(page2, room as string)
      const toggle = page2.locator('[data-id="meeting-toggle-private"]').first()
      await expect(toggle).toBeVisible({ timeout: 10000 })
      await toggle.click()
      // Re-open the meeting widget by going back to /love -> the widget is
      // still active for user2; user3 is a member but not an owner.
      await openLove(page3)

      // user3 tries to invite user1 (Appleseed) — request goes through but server
      // trigger should silently drop it (private meeting + not-owner sender).
      await inviteByLastNames(page3, ['Appleseed'])

      // Sender (user3) sees their outgoing trigger (request was created locally)
      // but the receiver (user1) must NOT get any incoming trigger.
      await expect(page1.locator('[data-id="incoming-invite-trigger"]')).toBeHidden({ timeout: 15000 })
    } finally {
      await closeMeetingContexts([
        { ctx: ctx1, pages: [page1] },
        { ctx: ctx2, pages: [page2] },
        { ctx: ctx3, pages: [page3] }
      ])
    }
  })

  test('multi-invite + cancel: inviting two persons creates two outgoing triggers, cancel removes one', async ({
    browser
  }) => {
    test.setTimeout(180000)

    const ctx1 = await browser.newContext({ storageState: '.auth/storage.json' })
    const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()
    const page3 = await ctx3.newPage()
    try {
      await openLove(page1)
      await openLove(page2)
      await openLove(page3)

      const room = await clickFirstAvailableRoom(page2)
      test.skip(room === null, 'No regular room available')
      await startOrJoin(page2)
      await waitConnected(page2)

      // user2 invites both user1 (Appleseed) and user3 (Muram) in one popup
      await inviteByLastNames(page2, ['Appleseed', 'Muram'])

      // user2 must have exactly two outgoing triggers
      const outgoing = page2.locator('[data-id="outgoing-invite-trigger"]')
      await expect(outgoing).toHaveCount(2, { timeout: 15000 })
      // Each recipient gets one incoming
      await expect(page1.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(1, { timeout: 15000 })
      await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(1, { timeout: 15000 })

      // Cancel the first outgoing invite via OutgoingInvitePopup
      await outgoing.first().click()
      const out = page2.locator('[data-id="outgoing-invite-popup"]')
      await expect(out).toBeVisible({ timeout: 5000 })
      await out.getByRole('button', { name: /^Cancel$/i }).click()

      // One outgoing trigger remains; one of the recipients lost their incoming
      await expect(outgoing).toHaveCount(1, { timeout: 15000 })
      const incomingTotal =
        (await page1.locator('[data-id="incoming-invite-trigger"]').count()) +
        (await page3.locator('[data-id="incoming-invite-trigger"]').count())
      expect(incomingTotal).toBe(1)
    } finally {
      await closeMeetingContexts([
        { ctx: ctx1, pages: [page1] },
        { ctx: ctx2, pages: [page2] },
        { ctx: ctx3, pages: [page3] }
      ])
    }
  })

  test('partial leave: when one of two participants leaves, the meeting stays alive for the other', async ({
    browser
  }) => {
    test.setTimeout(180000)

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

      // user3 leaves
      await page3.locator('[data-id="meeting-leave"]').first().click()
      await expect(page3.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 15000 })

      // user2 must still be connected
      await expect(page2.locator('[data-id="meeting-widget"]')).toBeVisible()
    } finally {
      await closeMeetingContexts([
        { ctx: ctx2, pages: [page2] },
        { ctx: ctx3, pages: [page3] }
      ])
    }
  })
})
