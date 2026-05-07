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

async function openLove (page: Page): Promise<void> {
  const office = new OfficePage(page)
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}`))?.finished()
  await office.navigateToOffice()
  await expect(office.floorGrid()).toBeVisible({ timeout: 15000 })
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

async function inviteByLastName (page: Page, lastName: string): Promise<void> {
  await page.locator('[data-id="invite-button"]').first().click()
  const popup = page.locator('.hulyModal-container').last()
  const search = popup.getByPlaceholder(/Search/i)
  await expect(search).toBeVisible({ timeout: 5000 })
  await search.fill(lastName)
  await popup.locator('button.row').filter({ hasText: lastName }).first().click()
  const ok = popup.locator('.hulyModal-footer').getByRole('button', { name: /^Invite$/i })
  await expect(ok).toBeEnabled({ timeout: 5000 })
  await ok.click()
}

async function openInvitePopupAt (page: Page, trigger: 'incoming' | 'outgoing'): Promise<void> {
  const id = trigger === 'incoming' ? 'incoming-invite-trigger' : 'outgoing-invite-trigger'
  const btn = page.locator(`[data-id="${id}"]`)
  await expect(btn).toBeVisible({ timeout: 15000 })
  await btn.click()
}

test.describe('meeting minutes - invite variants', () => {
  test('user3 rejects invite — neither side ends up in a meeting', async ({ browser }) => {
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

      await inviteByLastName(page2, 'Muram')

      await openInvitePopupAt(page3, 'incoming')
      await page3.locator('[data-id="invite-reject"]').click()

      // Triggers go away on both sides.
      await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toBeHidden({ timeout: 10000 })
      await expect(page2.locator('[data-id="outgoing-invite-trigger"]')).toBeHidden({ timeout: 10000 })

      // user3 must not have joined the meeting (no meeting widget on page3).
      await expect(page3.locator('[data-id="meeting-widget"]')).toBeHidden()
    } finally {
      await page2.close()
      await page3.close()
      await ctx2.close()
      await ctx3.close()
    }
  })

  test('symmetric invites: A invites B and B invites A — both triggers visible on both sides', async ({ browser }) => {
    test.setTimeout(120000)

    const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
    const page2 = await ctx2.newPage()
    const page3 = await ctx3.newPage()
    try {
      await openLove(page2)
      await openLove(page3)

      // user2 starts a meeting and invites user3
      const room2 = await clickFirstAvailableRoom(page2)
      test.skip(room2 === null, 'No regular room available')
      await startOrJoin(page2)
      await waitConnected(page2)
      await inviteByLastName(page2, 'Muram')

      // While invite is pending, user3 starts their own meeting and invites
      // user2 (Dirak) — this is the failing direction in the bug report.
      const ROOM_CANDIDATES_3 = ROOM_CANDIDATES.filter((c) => c !== room2)
      let roomFor3: string | null = null
      for (const name of ROOM_CANDIDATES_3) {
        const r = page3.locator(`[data-id="room-${name}"]`).first()
        if ((await r.count()) === 0) continue
        await r.click()
        roomFor3 = name
        break
      }
      test.skip(roomFor3 === null, 'No second room for user3')
      await startOrJoin(page3)
      await waitConnected(page3)
      await inviteByLastName(page3, 'Dirak')

      // Each side has one outgoing AND one incoming.
      await expect(page2.locator('[data-id="outgoing-invite-trigger"]')).toBeVisible({ timeout: 15000 })
      await expect(page2.locator('[data-id="incoming-invite-trigger"]')).toBeVisible({ timeout: 15000 })
      await expect(page3.locator('[data-id="outgoing-invite-trigger"]')).toBeVisible({ timeout: 15000 })
      await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toBeVisible({ timeout: 15000 })
    } finally {
      await page2.close()
      await page3.close()
      await ctx2.close()
      await ctx3.close()
    }
  })

  test('self-invite: my own user is not present in the invite picker (skipCurrentAccount)', async ({ browser }) => {
    test.setTimeout(60000)

    const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
    const page = await ctx.newPage()
    try {
      await openLove(page)
      const room = await clickFirstAvailableRoom(page)
      test.skip(room === null, 'No regular room available')
      await startOrJoin(page)
      await waitConnected(page)

      await page.locator('[data-id="invite-button"]').first().click()
      const popup = page.locator('.hulyModal-container').last()
      const search = popup.getByPlaceholder(/Search/i)
      await expect(search).toBeVisible({ timeout: 5000 })
      // user2 is Dirak Kainin — must not appear in their own invite list.
      await search.fill('Dirak')
      // Either the list is empty or the matching row is absent.
      await expect(popup.locator('button.row').filter({ hasText: 'Dirak Kainin' })).toHaveCount(0)
    } finally {
      await page.close()
      await ctx.close()
    }
  })

  test('bug 3: invite is cleaned up when sender leaves and meeting finishes', async ({ browser }) => {
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

      await inviteByLastName(page2, 'Muram')

      // user3 sees the incoming trigger but does nothing
      await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toBeVisible({ timeout: 15000 })

      // user2 leaves — they were the only participant, so meeting should finish
      // and finishMeeting() must clean up any pending invites for that meeting.
      await page2.locator('[data-id="meeting-leave"]').first().click()
      await expect(page2.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 15000 })

      // Bug 3: incoming trigger on user3 must disappear because the meeting is
      // finished (cleanupInvitesForMeeting).
      await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toBeHidden({ timeout: 30000 })
    } finally {
      await page2.close()
      await page3.close()
      await ctx2.close()
      await ctx3.close()
    }
  })
})
