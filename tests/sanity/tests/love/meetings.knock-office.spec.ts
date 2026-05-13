//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Locator, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { closeMeetingContexts } from './meeting-helpers'

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
 * Connect to the host's own office via the EditRoom panel. The owner sees
 * a Connect button (no Knock) — start the meeting and wait for the LiveKit
 * widget to confirm we joined.
 */
async function connectToOwnOffice (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
  await waitConnected(page)
}

test.describe('meeting minutes - knock into personal office', () => {
  test('knocker auto-joins owner office after knock is accepted', async ({ browser }) => {
    test.setTimeout(180000)

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

      // Owner steps inside their own personal office. The office has
      // `startPrivate: true`, so `createMeeting` will mint MeetingMinutes
      // with `private: true` — the precondition for knock-flow detection.
      // We do not know the exact owner name on the stand, so accept any
      // common test-fixture last name. The first office matching one of
      // these names becomes "the host office" for this run.
      const ownerLastNames = ['Sobolev', 'Appleseed', 'Muram', 'Dirak', 'Chen']
      let ownerLast: string | null = null
      for (const last of ownerLastNames) {
        const candidate = owner.locator('div.floorGrid-room').filter({ hasText: new RegExp(last, 'i') })
        if ((await candidate.count()) > 0) {
          ownerLast = last
          break
        }
      }
      test.skip(ownerLast === null, 'No personal office detected on the floor grid')

      await clickOfficeOf(owner, ownerLast as string)
      await connectToOwnOffice(owner)

      // Knocker reopens the office on their side. They are not a member of
      // the (now private) office meeting, so EditRoom renders the Knock
      // button instead of Connect.
      await clickOfficeOf(knocker, ownerLast as string)
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
