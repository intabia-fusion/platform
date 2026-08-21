//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test } from '@playwright/test'

import {
  clickFirstAvailableRoom,
  clickRoomByName,
  closeMeetingContexts,
  openLove,
  openMeetingMinutes,
  startOrJoin,
  waitConnected,
  waitForActiveMeetingsToFinish
} from './meeting-helpers'
import { retry } from '../retry'

export function registerWorkspaceOwnerTests (): void {
  test.describe('meeting minutes - workspace owner privileges', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    /**
     * Workspace owner (user1 = Appleseed John, `storage.json`) must be able
     * to join a private meeting hosted by a different account (user2 = Dirak
     * Kainin), even though they were never explicitly invited.
     *
     * Flow:
     *   - user2 starts a meeting in a regular room (becomes its owner).
     *   - user2 closes the room (private = true). Members = [user2] only.
     *   - user1 clicks the same room.
     *   - Server middleware sees AccountRole.Owner → bypasses owners-only
     *     enforcement; the recipient's `/getToken` accepts the request
     *     because the workspace owner is implicitly allowed everywhere.
     *   - user1 sees Connect (not Knock); on click they self-add to members
     *     and the LiveKit widget appears.
     *
     * Verifications:
     *   - user1 sees the meeting widget (proves LiveKit connection).
     *   - user2 sees user1 as a participant (covers the members $push).
     */
    test('workspace owner can self-join a private meeting hosted by another user', async ({ browser }) => {
      test.setTimeout(90000)

      const ctx1 = await browser.newContext({ storageState: '.auth/storage.json' }) // workspace owner (user1)
      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' }) // meeting owner (user2)
      const page1 = await ctx1.newPage()
      const page2 = await ctx2.newPage()

      try {
        await openLove(page1)
        await openLove(page2)

        // user2 starts a public meeting and becomes its owner.
        const room = await clickFirstAvailableRoom(page2)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page2)
        await waitConnected(page2)

        // user2 closes the room → private=true, members=[user2].
        await openMeetingMinutes(page2, room as string)
        const toggle = page2.locator('[data-id="meeting-toggle-private"]').first()
        await expect(toggle).toBeVisible({ timeout: 10000 })
        await toggle.click()

        // user1 opens the same room. As workspace owner they must see the
        // Connect button (not Knock) because middleware grants them access.
        const connect = page1.locator('[data-id="meeting-connect"]').getByRole('button').first()
        // Until the privacy flip reaches user1 the panel renders Knock and Connect does not exist,
        // so waiting on it alone only burns the timeout. Re-open the room until the view settles.
        await retry(async () => {
          await clickRoomByName(page1, room as string)
          await expect(connect).toBeVisible({ timeout: 3000 })
        }, 30000)
        await connect.click()

        // Successful self-join: the meeting widget renders on user1's page
        // (LiveKit accepted the token after middleware added them as a
        // member; if the owner-bypass were broken we'd get 403 here).
        await waitConnected(page1)
        // user2's widget must still be present — joining the same meeting
        // must not kick the original owner out.
        await expect(page2.locator('[data-id="meeting-widget"]')).toBeVisible()
      } finally {
        await closeMeetingContexts([
          { ctx: ctx1, pages: [page1] },
          { ctx: ctx2, pages: [page2] }
        ])
      }
    })
  })
}
