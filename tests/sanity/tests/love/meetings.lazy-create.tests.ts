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

/**
 * Reverse-call (lazy-create) scenario: caller is NOT in a meeting yet.
 * Both users are online and have personal offices on the floor.
 * Caller clicks the recipient's avatar (rendered inside the recipient's
 * personal office cell), opens the PersonActionPopup and presses the
 * "Invite" action — this sends an invite without a meeting reference.
 *
 * The server is expected to:
 *   - detect the accept and lazy-create a MeetingMinutes in the **caller's**
 *     office (not the recipient's),
 *   - patch the caller's invite-request and the recipient's invite-response
 *     with the new meeting ref,
 *   - drop the invite-response after both sides auto-join.
 *
 * Before this change the meeting was hosted in the recipient's office and
 * the recipient was the owner — see docs/security_meeting_minutes.md.
 */
export function registerLazyCreateTests (): void {
  test.describe('meeting minutes - lazy-create on accept', () => {
    test.beforeEach(async () => {
      // Drain any stale Active/Pending MeetingMinutes left from previous specs
      // so the caller's lazy-create branch sees a clean state (otherwise the
      // caller's office may already have an unfinished MeetingMinutes that
      // breaks the auto-join sync).
      await waitForActiveMeetingsToFinish()
    })

    test('caller without active meeting -> recipient accepts -> meeting hosted in caller office', async ({
      browser
    }) => {
      test.setTimeout(60000)

      // Caller = storageSecond (Dirak Kainin), Recipient = storageThird
      // (Muram Muffin). Both have a personal Office in the seeded floor.
      const callerCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const recipientCtx = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const caller = await callerCtx.newPage()
      const recipient = await recipientCtx.newPage()

      try {
        // Recipient logs in first so they appear "online" — their avatar in
        // the office cell is what the caller will click.
        await openLove(recipient)
        await openLove(caller)

        // Caller clicks the Muram avatar inside Muram's office. The avatar
        // is rendered at the office's (0,0) seat. PersonActionPopup opens
        // with the Invite action.
        const muramOffice = caller.locator('div.floorGrid-room').filter({ hasText: /Muram/i }).first()
        await expect(muramOffice).toBeVisible({ timeout: 15000 })

        // The avatar is the first cell inside the office grid. Hovering
        // makes it visible (online users are always shown — see
        // RoomPreview.svelte). Click the avatar cell.
        const avatarCell = muramOffice.locator('.floorGrid-room__field').first()
        await avatarCell.hover()
        await avatarCell.click()

        // Person action popup with the "call" invite button.
        const inviteBtn = caller.locator('[data-id="person-invite-call"]').first()
        await expect(inviteBtn).toBeVisible({ timeout: 10000 })
        await inviteBtn.click()

        // Recipient sees the incoming invite trigger -> open popup -> accept.
        const incoming = recipient.locator('[data-id="incoming-invite-trigger"]')
        await expect(incoming).toBeVisible({ timeout: 30000 })
        await incoming.click()
        const popup = recipient.locator('[data-id="invite-popup"]')
        await expect(popup).toBeVisible({ timeout: 5000 })
        await recipient.locator('[data-id="invite-join"]').click()

        // Both sides must auto-join the same LiveKit room: caller via the
        // invite-request sync (checkAndJoinIfRecipientJoined), recipient via
        // the invite-response patched with `meeting`
        // (checkAndJoinIfRecipientAccepted).
        await waitConnected(caller)
        await waitConnected(recipient)

        // After auto-join, no invite triggers should remain on either side.
        await expect(recipient.locator('[data-id="incoming-invite-trigger"]')).toBeHidden({ timeout: 15000 })
        await expect(caller.locator('[data-id="outgoing-invite-trigger"]')).toBeHidden({ timeout: 15000 })
      } finally {
        await closeMeetingContexts([
          { ctx: callerCtx, pages: [caller] },
          { ctx: recipientCtx, pages: [recipient] }
        ])
      }
    })
  })
}
