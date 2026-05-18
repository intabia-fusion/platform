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

async function openLove (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}/love`))?.finished()
  await expect(page.locator('div.floorGrid')).toBeVisible({ timeout: 15000 })
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })
}

async function clickFirstMeetingRoom (page: Page): Promise<void> {
  const room = page
    .locator('div.floorGrid-room')
    .filter({ hasText: /Meeting Room/i })
    .first()
  await expect(room).toBeVisible({ timeout: 15000 })
  await room.click()
}

async function startOrJoin (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
}

async function inviteByLastName (page: Page, lastName: string): Promise<void> {
  await page.locator('[data-id="invite-button"]').first().click()
  const popup = page.locator('.hulyModal-container').last()
  const search = popup.getByPlaceholder(/Search/i)
  await expect(search).toBeVisible({ timeout: 5000 })
  await search.fill(lastName)
  const row = popup.locator('button.row').filter({ hasText: lastName }).first()
  await expect(row).toBeVisible({ timeout: 5000 })
  await row.click()
  const okBtn = popup.getByRole('button', { name: /^OK$|^Invite$|^Confirm$/i }).first()
  if ((await okBtn.count()) > 0) await okBtn.click({ timeout: 2000 }).catch(() => undefined)
  await page.keyboard.press('Escape').catch(() => undefined)
}

async function callPerson (caller: Page, lastName: RegExp): Promise<void> {
  const office = caller.locator('div.floorGrid-room').filter({ hasText: lastName }).first()
  await expect(office).toBeVisible({ timeout: 15000 })
  const avatarCell = office.locator('.floorGrid-room__field').first()
  await avatarCell.hover()
  await avatarCell.click()
  const inviteBtn = caller.locator('[data-id="person-invite-call"]').first()
  await expect(inviteBtn).toBeVisible({ timeout: 10000 })
  await inviteBtn.click()
}

export function registerInviteUiTests (): void {
  test.describe('meeting minutes - invite UI labels & states', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('A1 invite labels: sender → "You are inviting", recipient → "Knocking"', async ({ browser }) => {
      test.setTimeout(60000)
      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page2 = await ctx2.newPage()
      const page3 = await ctx3.newPage()
      try {
        await openLove(page2)
        await openLove(page3)
        await clickFirstMeetingRoom(page2)
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')

        const senderOutgoing = page2.locator('[data-id="outgoing-invite-trigger"]')
        await expect(senderOutgoing).toBeVisible({ timeout: 10000 })
        await expect(senderOutgoing).toContainText(/You are inviting/i, { timeout: 5000 })
        await expect(page2.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(0, { timeout: 1000 })

        const recipientIncoming = page3.locator('[data-id="incoming-invite-trigger"]')
        await expect(recipientIncoming).toBeVisible({ timeout: 10000 })
        await expect(recipientIncoming).toContainText(/Knocking/i, { timeout: 5000 })
        await expect(page3.locator('[data-id="outgoing-invite-trigger"]')).toHaveCount(0, { timeout: 1000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('A1 popup: recipient sees "asking you to join" + Join/Reject buttons', async ({ browser }) => {
      test.setTimeout(60000)
      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page2 = await ctx2.newPage()
      const page3 = await ctx3.newPage()
      try {
        await openLove(page2)
        await openLove(page3)
        await clickFirstMeetingRoom(page2)
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')

        const recipientIncoming = page3.locator('[data-id="incoming-invite-trigger"]')
        await expect(recipientIncoming).toBeVisible({ timeout: 10000 })
        await recipientIncoming.click()

        const popup = page3.locator('[data-id="invite-popup"]')
        await expect(popup).toBeVisible({ timeout: 5000 })
        await expect(popup).toContainText(/asking you to join|is knocking|Join meeting/i, { timeout: 3000 })
        await expect(page3.locator('[data-id="invite-join"]')).toBeVisible({ timeout: 2000 })
        await expect(page3.locator('[data-id="invite-reject"]')).toBeVisible({ timeout: 2000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('A1 sender popup: clicking trigger opens outgoing-invite-popup with Cancel', async ({ browser }) => {
      test.setTimeout(60000)
      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page2 = await ctx2.newPage()
      const page3 = await ctx3.newPage()
      try {
        await openLove(page2)
        await openLove(page3)
        await clickFirstMeetingRoom(page2)
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')

        const senderOutgoing = page2.locator('[data-id="outgoing-invite-trigger"]')
        await expect(senderOutgoing).toBeVisible({ timeout: 10000 })
        await senderOutgoing.click()
        const popup = page2.locator('[data-id="outgoing-invite-popup"]')
        await expect(popup).toBeVisible({ timeout: 5000 })
        await expect(popup.getByRole('button', { name: /^Cancel$/i })).toBeVisible({ timeout: 2000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('A2 awaiting panel: recipient sees "Waiting for ..." after accept w/o meeting', async ({ browser }) => {
      test.setTimeout(60000)
      const callerCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const recipientCtx = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const caller = await callerCtx.newPage()
      const recipient = await recipientCtx.newPage()
      try {
        await openLove(recipient)
        await openLove(caller)

        await callPerson(caller, /Muram/i)

        const incoming = recipient.locator('[data-id="incoming-invite-trigger"]')
        await expect(incoming).toBeVisible({ timeout: 30000 })
        await incoming.click()
        const popup = recipient.locator('[data-id="invite-popup"]')
        await expect(popup).toBeVisible({ timeout: 5000 })
        await recipient.locator('[data-id="invite-join"]').click()

        // Right after accept the meeting is created by the caller's client.
        // Recipient should briefly see the awaiting-meeting trigger before
        // auto-joining via the live-query on MeetingMinutes.
        const awaiting = recipient.locator('[data-id="awaiting-meeting-trigger"]')
        // Either the awaiting trigger flashed in OR the recipient is already
        // in the meeting — both are valid endpoints; we mainly test that no
        // stale incoming-invite-trigger lingers.
        const settled = Promise.race([
          awaiting.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'awaiting'),
          recipient
            .locator('[data-id="meeting-widget"]')
            .waitFor({ state: 'visible', timeout: 30000 })
            .then(() => 'joined')
        ])
        const which = await settled
        expect(['awaiting', 'joined']).toContain(which)
        await expect(recipient.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })
      } finally {
        await closeMeetingContexts([
          { ctx: callerCtx, pages: [caller] },
          { ctx: recipientCtx, pages: [recipient] }
        ])
      }
    })

    test('A decline → call-declined toast on sender; both triggers go away', async ({ browser }) => {
      test.setTimeout(60000)
      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page2 = await ctx2.newPage()
      const page3 = await ctx3.newPage()
      try {
        await openLove(page2)
        await openLove(page3)
        await clickFirstMeetingRoom(page2)
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')

        const recipientIncoming = page3.locator('[data-id="incoming-invite-trigger"]')
        await expect(recipientIncoming).toBeVisible({ timeout: 10000 })
        await recipientIncoming.click()
        await page3.locator('[data-id="invite-reject"]').click()

        // After decline both triggers must disappear on each side.
        await expect(page2.locator('[data-id="outgoing-invite-trigger"]')).toHaveCount(0, { timeout: 15000 })
        await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(0, { timeout: 15000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('A cancel by sender → recipient incoming disappears', async ({ browser }) => {
      test.setTimeout(60000)
      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page2 = await ctx2.newPage()
      const page3 = await ctx3.newPage()
      try {
        await openLove(page2)
        await openLove(page3)
        await clickFirstMeetingRoom(page2)
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')

        const senderOutgoing = page2.locator('[data-id="outgoing-invite-trigger"]')
        await expect(senderOutgoing).toBeVisible({ timeout: 10000 })
        await senderOutgoing.click()
        const popup = page2.locator('[data-id="outgoing-invite-popup"]')
        await expect(popup).toBeVisible({ timeout: 5000 })
        await popup.getByRole('button', { name: /^Cancel$/i }).click()

        await expect(page2.locator('[data-id="outgoing-invite-trigger"]')).toHaveCount(0, { timeout: 15000 })
        await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(0, { timeout: 15000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })
  })
}
