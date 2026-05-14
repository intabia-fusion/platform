//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Locator, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { closeMeetingContexts, waitForActiveMeetingsToFinish } from './meeting-helpers'

const meetingsWs = 'meetings-ws'

async function openLove (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}/love`))?.finished()
  await expect(page.locator('div.floorGrid')).toBeVisible({ timeout: 15000 })
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 30000 })
}

/**
 * Click the room owned by the given person. Personal offices render with
 * `data-id="room-"` (empty name) but display the owner's name inside, so we
 * pick the one whose visible text contains the owner's last name.
 */
async function clickOfficeOf (page: Page, lastName: string): Promise<Locator> {
  const office = page
    .locator('div.floorGrid-room')
    .filter({ hasText: new RegExp(lastName, 'i') })
    .first()
  await expect(office).toBeVisible({ timeout: 15000 })
  await office.click()
  return office
}

/**
 * Start a meeting in the owner's own personal office. There is no Connect
 * button in EditRoom for one's own office; the entry point is the
 * PersonActionPopup that opens on a click on one's own avatar inside the
 * office cell. The popup renders a "Start meeting" action (data-id
 * `start-own-meeting`) — clicking it calls createMeeting(office).
 */
async function connectToOwnOffice (page: Page, _lastName: string): Promise<void> {
  // Use the `myOffice` CSS class instead of filtering by the resolved owner
  // name — the office label is resolved asynchronously via
  // `getPersonByPersonRef`, so the name filter is flaky on cold render.
  const office = page.locator('div.floorGrid-room.myOffice').first()
  await expect(office).toBeVisible({ timeout: 15000 })
  const avatarCell = office.locator('.floorGrid-room__field').first()
  await avatarCell.hover()
  await avatarCell.click()
  const startBtn = page.locator('[data-id="start-own-meeting"]').first()
  await expect(startBtn).toBeVisible({ timeout: 10000 })
  await startBtn.click()
  await waitConnected(page)
}

export function registerKnockOfficeTests (): void {
  test.describe('meeting minutes - knock into personal office', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('knocker auto-joins owner office after knock is accepted', async ({ browser }) => {
      test.setTimeout(60000)

      // Owner — uses storageSecond. The personal office is named after this
      // person, so we filter the floor grid by their last name to find it.
      const ownerCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      // Knocker — a different account. Storage third has a separate person.
      const knockerCtx = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const owner = await ownerCtx.newPage()
      const knocker = await knockerCtx.newPage()

      try {
        await openLove(owner)
        await openLove(knocker)

        // storageSecond = Dirak Kainin. The personal office on the floor is
        // titled with the owner's last name; we filter the floor grid by
        // that name to find it. The office has `startPrivate: true`, so
        // `createMeeting` will mint a private MeetingMinutes — the
        // precondition for knock-flow detection.
        const ownerLast = 'Dirak'

        await connectToOwnOffice(owner, ownerLast)

        // Knocker reopens the office on their side. They are not a member of
        // the (now private) office meeting, so EditRoom renders the Knock
        // button instead of Connect.
        await clickOfficeOf(knocker, ownerLast)
        const knockBtn = knocker.locator('[data-id="meeting-knock"]').first()
        await expect(knockBtn).toBeVisible({ timeout: 30000 })
        await knockBtn.click()
        // The button flips to "Cancel knock" once the invite-request is created.
        await expect(knocker.locator('[data-id="meeting-knock-pending"]')).toBeVisible({ timeout: 10000 })

        // Owner sees the incoming knock in the KnockingList side panel.
        const knockingItem = owner.locator('[data-id="knocking-item"]').first()
        await expect(knockingItem).toBeVisible({ timeout: 30000 })
        await knockingItem.locator('[data-id="knock-accept"]').click()

        // After accept the server pushes the knocker into the meeting members
        // and syncs `status: 'accepted' + meeting` onto the knocker's
        // invite-request. The knocker's client auto-joins via
        // `checkAndJoinIfRecipientJoined` -> `joinOrCreateMeetingByInvite`,
        // which retries the `/getToken` call until the membership write
        // propagates (avoids the 403 race). The meeting widget on the
        // knocker side is the signal that the LiveKit room connected.
        await expect(knocker.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ownerCtx, pages: [owner] },
          { ctx: knockerCtx, pages: [knocker] }
        ])
      }
    })
  })
}
