//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { closeMeetingContexts, leaveAllMeetings, waitForActiveMeetingsToFinish } from './meeting-helpers'

const meetingsWs = 'meetings-ws'

async function openLove (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}/love`))?.finished()
  await expect(page.locator('div.floorGrid')).toBeVisible({ timeout: 15000 })
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })
}

async function waitDisconnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeHidden({ timeout: 30000 })
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

async function acceptIncoming (recipient: Page): Promise<void> {
  const incoming = recipient.locator('[data-id="incoming-invite-trigger"]')
  await expect(incoming).toBeVisible({ timeout: 30000 })
  await incoming.click()
  const popup = recipient.locator('[data-id="invite-popup"]')
  await expect(popup).toBeVisible({ timeout: 5000 })
  await recipient.locator('[data-id="invite-join"]').click()
}

async function leaveMeeting (page: Page): Promise<void> {
  const leave = page.locator('[data-id="meeting-leave"]').first()
  await expect(leave).toBeVisible({ timeout: 10000 })
  await leave.click()
  await waitDisconnected(page)
}

export function registerBidirectionalLoopTests (): void {
  test.describe('meeting minutes - bidirectional call probe', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    /**
     * Forward + reverse call in a single run. The user reported that the
     * FIRST call works but the SECOND reverse call leaves the caller stuck
     * (no widget, stale outgoing trigger). This test reproduces that flow
     * end-to-end in one pass; use Playwright's `--repeat-each=N` flag to
     * stress the client-create + auto-join path when investigating
     * concurrency reports:
     *
     *   npx playwright test -c ./tests/playwright.config.ts \
     *     tests/love/meetings.all.spec.ts \
     *     -g "back-to-back" --repeat-each=10 \
     *     --reporter=list --retries=0 --workers=1
     */
    test('back-to-back: Dirak -> Muram, then Muram -> Dirak — both auto-join', async ({ browser }) => {
      test.setTimeout(180000)

      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page2 = await ctx2.newPage()
      const page3 = await ctx3.newPage()

      try {
        await openLove(page2)
        await openLove(page3)

        await test.step('forward: Dirak -> Muram', async () => {
          await callPerson(page2, /Muram/i)
          await acceptIncoming(page3)
          await waitConnected(page2)
          await waitConnected(page3)
          await expect(page2.locator('[data-id="outgoing-invite-trigger"]')).toBeHidden({ timeout: 15000 })
          await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toBeHidden({ timeout: 15000 })
          // Caller (Dirak) leaves their own office meeting — server closes
          // the LiveKit room and disconnects Muram automatically (no manual
          // leave on page3).
          await leaveMeeting(page2)
          await waitDisconnected(page3)
          await waitForActiveMeetingsToFinish()
          // Re-open the love floor on both pages: after leaving the meeting
          // both clients land on the MeetingMinutes Summary panel which
          // covers the floor grid and intercepts hover/click events.
          await openLove(page2)
          await openLove(page3)
        })

        // Reverse direction — the path the user reported as broken after
        // the first call. Caller (Muram) must auto-join, recipient (Dirak)
        // must accept and join, both widgets must appear.
        await test.step('reverse: Muram -> Dirak', async () => {
          await callPerson(page3, /Dirak/i)
          await acceptIncoming(page2)
          await waitConnected(page3)
          await waitConnected(page2)
          await expect(page3.locator('[data-id="outgoing-invite-trigger"]')).toBeHidden({ timeout: 15000 })
          await expect(page2.locator('[data-id="incoming-invite-trigger"]')).toBeHidden({ timeout: 15000 })
          // Reverse: meeting is hosted in Muram's office (caller).
          // Muram leaves → server closes room → Dirak disconnects.
          await leaveMeeting(page3)
          await waitDisconnected(page2)
          await waitForActiveMeetingsToFinish()
        })
      } finally {
        await leaveAllMeetings([page2, page3])
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })
  })
}
